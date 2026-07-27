import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { addToHistory } from './historyService';

export interface WhatsAppStatus {
  status: 'Disconnected' | 'Generating QR' | 'Waiting for Scan' | 'Connected' | 'Reconnecting' | 'Error';
  phoneNumber: string | null;
  whatsappName: string | null;
  platform: string | null;
  messagesSentToday: number;
  messagesFailed: number;
  connectedSince: string | null;
  qrCodeUrl: string | null;
  error: string | null;
}

class WhatsAppService {
  private client: Client | null = null;
  private status: WhatsAppStatus = {
    status: 'Disconnected',
    phoneNumber: null,
    whatsappName: null,
    platform: null,
    messagesSentToday: 0,
    messagesFailed: 0,
    connectedSince: null,
    qrCodeUrl: null,
    error: null,
  };

  constructor() {
    // Attempt auto-connect if a session already exists on startup
    const sessionPath = path.join(process.cwd(), '.auth', 'session-whatsapp-session');
    if (fs.existsSync(sessionPath)) {
      console.log('[WhatsAppService] Existing session found, initiating auto-connect...');
      this.connect().catch((err) => {
        console.error('[WhatsAppService] Auto-connect failed:', err);
      });
    }
  }

  public getStatus(): WhatsAppStatus {
    return { ...this.status };
  }

  public async connect(): Promise<void> {
    if (this.client) {
      if (
        this.status.status === 'Connected' ||
        this.status.status === 'Waiting for Scan' ||
        this.status.status === 'Generating QR'
      ) {
        console.log(`[WhatsAppService] Connection already in progress or connected. Current status: ${this.status.status}`);
        return;
      }
      await this.cleanup();
    }

    this.status.status = 'Generating QR';
    this.status.error = null;
    this.status.qrCodeUrl = null;

    console.log('[WhatsAppService] Initializing WhatsApp client...');

    try {
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: path.join(process.cwd(), '.auth'),
          clientId: 'whatsapp-session',
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        },
      });

      this.client.on('qr', async (qr) => {
        console.log('[WhatsAppService] QR code received.');
        this.status.status = 'Waiting for Scan';
        try {
          this.status.qrCodeUrl = await qrcode.toDataURL(qr);
        } catch (err: any) {
          console.error('[WhatsAppService] Error generating QR code image:', err);
          this.status.error = 'Failed to generate QR Code image';
        }
      });

      this.client.on('ready', () => {
        console.log('[WhatsAppService] Client is ready!');
        this.status.status = 'Connected';
        this.status.qrCodeUrl = null;
        this.status.error = null;
        this.status.connectedSince = new Date().toISOString();

        if (this.client?.info) {
          const info = this.client.info;
          this.status.phoneNumber = info.wid?.user || 'Unknown';
          this.status.whatsappName = info.pushname || 'WhatsApp Device';
          this.status.platform = info.platform || 'Web Client';
        }
      });

      this.client.on('authenticated', () => {
        console.log('[WhatsAppService] Authenticated successfully.');
      });

      this.client.on('auth_failure', (msg) => {
        console.error('[WhatsAppService] Auth failure:', msg);
        this.status.status = 'Error';
        this.status.error = msg || 'Authentication failed';
        this.cleanup();
      });

      this.client.on('disconnected', (reason) => {
        console.log('[WhatsAppService] Disconnected reason:', reason);
        this.status.status = 'Disconnected';
        this.status.phoneNumber = null;
        this.status.whatsappName = null;
        this.status.platform = null;
        this.status.connectedSince = null;
        this.cleanup();
      });

      // Handle underlying browser crash or disconnects
      this.client.initialize().catch((err: any) => {
        console.error('[WhatsAppService] Client initialize promise rejected:', err);
        this.status.status = 'Error';
        this.status.error = err?.message || 'Failed to initialize WhatsApp browser';
        this.cleanup();
      });

    } catch (error: any) {
      console.error('[WhatsAppService] Failed to setup client:', error);
      this.status.status = 'Error';
      this.status.error = error?.message || 'Configuration error';
      this.client = null;
    }
  }

  public async disconnect(): Promise<void> {
    console.log('[WhatsAppService] Disconnecting WhatsApp client and cleaning up session...');
    await this.cleanup();

    this.status.status = 'Disconnected';
    this.status.phoneNumber = null;
    this.status.whatsappName = null;
    this.status.platform = null;
    this.status.connectedSince = null;

    // Delete session files
    const sessionPath = path.join(process.cwd(), '.auth', 'session-whatsapp-session');
    if (fs.existsSync(sessionPath)) {
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('[WhatsAppService] Session files deleted successfully.');
      } catch (err) {
        console.error('[WhatsAppService] Error deleting session files:', err);
      }
    }
  }

  public async sendMessage(phoneNumber: string, message: string): Promise<void> {
    if (!this.client || this.status.status !== 'Connected') {
      throw new Error('WhatsApp is not connected');
    }

    // Standard formatting: strip non-digits, ensure @c.us suffix
    let cleanNumber = phoneNumber.replace(/\D/g, '');
    if (!cleanNumber) {
      throw new Error(`Invalid phone number format: ${phoneNumber}`);
    }

    const jid = `${cleanNumber}@c.us`;

    try {
      console.log(`[WhatsAppService] Validating registered status for: ${jid}`);
      const isRegistered = await this.client.isRegisteredUser(jid);
      if (!isRegistered) {
        this.status.messagesFailed++;
        addToHistory(phoneNumber, message, 'Failed', 'Not a registered WhatsApp number');
        throw new Error(`The number ${phoneNumber} is not registered on WhatsApp`);
      }

      console.log(`[WhatsAppService] Sending message to ${jid}...`);
      await this.client.sendMessage(jid, message);
      this.status.messagesSentToday++;
      addToHistory(phoneNumber, message, 'Sent');
    } catch (err: any) {
      console.error(`[WhatsAppService] Send message failed to ${phoneNumber}:`, err);
      if (!err.message.includes('registered')) {
        this.status.messagesFailed++;
        addToHistory(phoneNumber, message, 'Failed', err?.message || 'Send error');
      }
      throw err;
    }
  }

  private async cleanup(): Promise<void> {
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (err) {
        console.error('[WhatsAppService] Error destroying client:', err);
      }
      this.client = null;
    }
    this.status.qrCodeUrl = null;
  }
}

export const whatsappService = new WhatsAppService();
