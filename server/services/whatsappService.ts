import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
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

// Render Free Compatibility: store LocalAuth sessions inside current working directory
const authPath = path.join(process.cwd(), '.auth');

// Ensure directory exists inside project cwd
if (!fs.existsSync(authPath)) {
  try {
    fs.mkdirSync(authPath, { recursive: true });
    console.log(`[WhatsAppService] Created Local auth directory at: ${authPath}`);
  } catch (err) {
    console.error(`[WhatsAppService] Failed to create auth directory at ${authPath}:`, err);
  }
}

// Helper to recursively find Chrome/Chromium executable binary inside a directory
function findChromeExecutable(dirPath: string): string | null {
  if (!fs.existsSync(dirPath)) return null;

  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        const found = findChromeExecutable(fullPath);
        if (found) return found;
      } else if (file === 'chrome' || file === 'chrome.exe') {
        // Attempt to verify/set execution permissions on Unix/Linux
        try {
          fs.accessSync(fullPath, fs.constants.X_OK);
        } catch {
          try {
            fs.chmodSync(fullPath, 0o755);
            console.log(`[WhatsAppService] Set executable permissions (0755) on: ${fullPath}`);
          } catch (chmodErr) {
            console.warn(`[WhatsAppService] Warning: Could not chmod executable: ${fullPath}`, chmodErr);
          }
        }
        return fullPath;
      }
    }
  } catch (e) {
    console.error(`[WhatsAppService] Error scanning directory ${dirPath}:`, e);
  }
  return null;
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
    console.log('[WhatsAppService] Starting up and auto-connecting WhatsApp client...');
    this.connect().catch((err) => {
      console.error('[WhatsAppService] Initial auto-connect failed:', err?.message || err);
    });
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

    // --- Startup Diagnostics & Environment Auditing ---
    console.log('[WhatsAppService] --- Startup Diagnostics ---');
    console.log(`- NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`- Configured authPath: ${authPath}`);
    console.log(`- Target session path: ${path.join(authPath, 'session-whatsapp-session')}`);
    console.log(`- PUPPETEER_CACHE_DIR: ${process.env.PUPPETEER_CACHE_DIR}`);

    // Audit puppeteer versions
    try {
      const puppeteerPkg = require('puppeteer/package.json');
      console.log(`- Installed Puppeteer version: ${puppeteerPkg.version}`);
    } catch {
      console.log('- Installed Puppeteer version: Unknown (could not load package.json)');
    }

    // Run system-level diagnostics and lookup binaries (especially for Railway Nixpacks)
    console.log('[WhatsAppService] --- Railway / System Browser Commands ---');
    const cmds = [
      'which chromium',
      'which chromium-browser',
      'which google-chrome',
      'chromium --version',
    ];
    for (const c of cmds) {
      try {
        const out = execSync(c, { encoding: 'utf-8' }).trim();
        console.log(`$ ${c} => ${out}`);
      } catch (err: any) {
        console.log(`$ ${c} => Not found (exit code ${err?.status || 'unknown'})`);
      }
    }

    let executablePath: string | undefined = undefined;

    // 1. Try finding chromium via "which chromium" or "which chromium-browser" dynamically (Railway)
    try {
      const resolved = execSync('which chromium', { encoding: 'utf-8' }).trim();
      if (resolved && fs.existsSync(resolved)) {
        executablePath = resolved;
        console.log(`- Dynamic Browser Check: SUCCESS! Located system chromium via 'which chromium': ${executablePath}`);
      }
    } catch {}

    if (!executablePath) {
      try {
        const resolved = execSync('which chromium-browser', { encoding: 'utf-8' }).trim();
        if (resolved && fs.existsSync(resolved)) {
          executablePath = resolved;
          console.log(`- Dynamic Browser Check: SUCCESS! Located system chromium via 'which chromium-browser': ${executablePath}`);
        }
      } catch {}
    }

    // 2. Fallback: Determine browser installation dynamically via recursive caching audit (Render)
    if (!executablePath) {
      const searchDirs = [
        process.env.PUPPETEER_CACHE_DIR,
        path.join(process.cwd(), '.cache', 'puppeteer'),
      ].filter(Boolean) as string[];

      console.log('[WhatsAppService] Auditing cache directories for downloaded Chrome binaries...');
      for (const dir of searchDirs) {
        console.log(`- Searching in: ${dir}`);
        const found = findChromeExecutable(dir);
        if (found) {
          executablePath = found;
          console.log(`- Dynamic Browser Check: SUCCESS! Located downloaded Chrome binary at: ${executablePath}`);
          break;
        }
      }
    }

    // 3. Fallback: Default standard system paths
    if (!executablePath) {
      const potentialPaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ].filter(Boolean) as string[];

      for (const p of potentialPaths) {
        if (fs.existsSync(p)) {
          executablePath = p;
          console.log(`- Dynamic Browser Check: Found fallback system binary on disk: ${p}`);
          break;
        }
      }
    }

    if (executablePath) {
      console.log(`[WhatsAppService] Launching browser using resolved path: ${executablePath}`);
    } else {
      console.warn('[WhatsAppService] WARNING: No Chrome/Chromium binary could be auto-resolved! Proceeding with Puppeteer default lookup.');
    }

    try {
      console.log('[WhatsAppService] Initializing WhatsApp client...');
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: authPath,
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
          executablePath,
        },
      });

      // --- Register Event Listeners ---
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

      // Register debugging & state monitoring events
      this.client.on('loading_screen', (percent, message) => {
        console.log(`[WhatsAppService] Loading Screen Status: ${percent}% - ${message}`);
      });

      this.client.on('change_state', (state) => {
        console.log(`[WhatsAppService] Client state changed: ${state}`);
      });

      this.client.on('remote_session_saved', () => {
        console.log('[WhatsAppService] Remote session saved successfully.');
      });

      // Await client initialization completely to handle errors synchronously
      await this.client.initialize();
      console.log('[WhatsAppService] Client initialization completed.');

    } catch (error: any) {
      console.error('[WhatsAppService] Fatal error during WhatsApp client setup or launch:', error);
      this.status.status = 'Error';
      this.status.error = error?.message || 'Configuration or browser launch error';
      await this.cleanup();
      throw error;
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
    const sessionPath = path.join(authPath, 'session-whatsapp-session');
    if (fs.existsSync(sessionPath)) {
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('[WhatsAppService] Session files deleted successfully from persistent path.');
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
    const cleanNumber = phoneNumber.replace(/\D/g, '');
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
