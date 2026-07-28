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

// --- Dynamic Platform-Agnostic Auth Storage Resolver ---
const potentialPersistentPaths = [
  '/.auth',
  '/data/.auth',
  '/persistent/.auth',
  '/volume/.auth',
];

let authPath = path.join(process.cwd(), '.auth');

for (const p of potentialPersistentPaths) {
  try {
    const parentDir = path.dirname(p);
    if (fs.existsSync(parentDir)) {
      fs.mkdirSync(p, { recursive: true });
      authPath = p;
      console.log(`[WhatsAppService] Dynamic Storage: Selected persistent path for LocalAuth: ${authPath}`);
      break;
    }
  } catch (err) {
    // Fail-safe
  }
}

// Ensure resolved directory exists
if (!fs.existsSync(authPath)) {
  try {
    fs.mkdirSync(authPath, { recursive: true });
    console.log(`[WhatsAppService] Dynamic Storage: Created local auth directory at: ${authPath}`);
  } catch (err) {
    console.error(`[WhatsAppService] Dynamic Storage: Failed to create auth directory at ${authPath}:`, err);
  }
}

// Memory-safe promise timeout helper to prevent hanging forever (increased to 30s threshold)
async function withTimeout<T>(promise: Promise<T>, ms = 30000): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout: Action exceeded ${ms / 1000}s threshold`));
    }, ms);
  });
  return Promise.race([
    promise.then((res) => {
      clearTimeout(timeoutId);
      return res;
    }),
    timeoutPromise,
  ]);
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

    // --- Startup Diagnostics ---
    console.log('[WhatsAppService] --- Startup Diagnostics ---');
    console.log(`- NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`- Configured authPath: ${authPath}`);
    console.log(`- Target session path: ${path.join(authPath, 'session-whatsapp-session')}`);
    console.log(`- PUPPETEER_CACHE_DIR: ${process.env.PUPPETEER_CACHE_DIR}`);

    try {
      const puppeteerPkg = require('puppeteer/package.json');
      console.log(`- Installed Puppeteer version: ${puppeteerPkg.version}`);
    } catch {
      console.log('- Installed Puppeteer version: Unknown');
    }

    // Run diagnostics
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

    // 1. System Chromium path
    try {
      const resolved = execSync('which chromium', { encoding: 'utf-8' }).trim();
      if (resolved && fs.existsSync(resolved)) {
        executablePath = resolved;
        console.log(`- Dynamic Browser Check: SUCCESS! Located system chromium: ${executablePath}`);
      }
    } catch {}

    if (!executablePath) {
      try {
        const resolved = execSync('which chromium-browser', { encoding: 'utf-8' }).trim();
        if (resolved && fs.existsSync(resolved)) {
          executablePath = resolved;
          console.log(`- Dynamic Browser Check: SUCCESS! Located system chromium-browser: ${executablePath}`);
        }
      } catch {}
    }

    // 2. Fallback local cache
    if (!executablePath) {
      const searchDirs = [
        process.env.PUPPETEER_CACHE_DIR,
        path.join(process.cwd(), '.cache', 'puppeteer'),
      ].filter(Boolean) as string[];

      console.log('[WhatsAppService] Auditing cache directories for downloaded Chrome binaries...');
      for (const dir of searchDirs) {
        const found = findChromeExecutable(dir);
        if (found) {
          executablePath = found;
          console.log(`- Dynamic Browser Check: SUCCESS! Located downloaded Chrome binary at: ${executablePath}`);
          break;
        }
      }
    }

    // 3. Fallback system defaults
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
      console.warn('[WhatsAppService] WARNING: No Chrome/Chromium binary found.');
    }

    try {
      console.log('[WhatsAppService] Initializing WhatsApp client...');
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: authPath,
          clientId: 'whatsapp-session',
        }),
        webVersionCache: {
          type: 'remote',
          remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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
        console.log('[WhatsAppService] Client is ready! WhatsApp Connected.');
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
        console.log('[WhatsAppService] Authenticated successfully. WhatsApp paired!');
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

      this.client.on('loading_screen', (percent, message) => {
        console.log(`[WhatsAppService] Loading Screen Status: ${percent}% - ${message}`);
      });

      this.client.on('change_state', (state) => {
        console.log(`[WhatsAppService] Client state changed: ${state}`);
      });

      this.client.on('remote_session_saved', () => {
        console.log('[WhatsAppService] Remote session saved successfully.');
      });

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
    const startTime = Date.now();
    console.log(`[WhatsAppService] === Starting Send Message Process ===`);
    console.log(`- Original phone input: "${phoneNumber}"`);

    if (!this.client || this.status.status !== 'Connected') {
      throw new Error('WhatsApp is not connected. Please pair your device first.');
    }

    // --- State and Diagnostics Auditing ---
    console.log(`[WhatsAppService] Send Diagnostics Check:`);
    try {
      console.log(`- Client Info:`, this.client.info);
      console.log(`- Client Info WID:`, this.client.info?.wid);
      console.log(`- Client Info Pushname:`, this.client.info?.pushname);

      const pupPage = (this.client as any).pupPage;
      const pupBrowser = (this.client as any).pupBrowser;

      console.log(`- Puppeteer Page exists: ${!!pupPage}`);
      if (pupPage) {
        console.log(`- Puppeteer Page Closed: ${await pupPage.isClosed()}`);
        console.log(`- Puppeteer Page URL: ${await pupPage.url()}`);
        console.log(`- Puppeteer Page Title: ${await pupPage.title()}`);
      }

      console.log(`- Puppeteer Browser exists: ${!!pupBrowser}`);
      if (pupBrowser) {
        console.log(`- Puppeteer Browser Connected: ${await pupBrowser.isConnected()}`);
      }
    } catch (diagErr: any) {
      console.warn(`[WhatsAppService] Diagnostics error (ignored):`, diagErr?.message);
    }

    // Format phone: strip non-digits, ensure @c.us suffix
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    console.log(`- Normalized phone: "${cleanNumber}"`);
    if (!cleanNumber || cleanNumber.length < 8) {
      throw new Error(`Invalid phone number length: must be at least 8 digits. Received: "${phoneNumber}"`);
    }

    const jid = `${cleanNumber}@c.us`;
    console.log(`- Final Jid: "${jid}"`);

    try {
      // NOTE: Bypassing the buggy, hanging `isRegisteredUser()` selector pre-check
      // of whatsapp-web.js to completely prevent the sendMessage pipeline from getting stuck!
      // This is a known issue on newer WhatsApp Web sessions. We directly proceed to sendMessage.
      console.log(`[WhatsAppService] Bypassed isRegisteredUser pre-check to prevent page locks. Proceeding directly to send.`);

      console.log(`[WhatsAppService] Sending message to JID ${jid} via whatsapp-web.js...`);
      console.time('sendMessageTotalTime');

      const response = await withTimeout(
        this.client.sendMessage(jid, message),
        30000 // 30 second timeout protection
      );

      console.timeEnd('sendMessageTotalTime');
      console.log(`[WhatsAppService] Message sent successfully! Message JID ID: ${response?.id?.id || 'unknown'}`);

      this.status.messagesSentToday++;
      addToHistory(phoneNumber, message, 'Sent');
      console.log(`[WhatsAppService] === Send Message Process Finished Successfully (Total time: ${Date.now() - startTime}ms) ===`);
    } catch (err: any) {
      console.error(`[WhatsAppService] Send message failed to ${phoneNumber}.`);
      console.error(`- Error Name: ${err?.name || 'unknown'}`);
      console.error(`- Error Message: ${err?.message || 'unknown'}`);
      console.error(`- Stack Trace: ${err?.stack || 'unknown'}`);

      this.status.messagesFailed++;
      addToHistory(phoneNumber, message, 'Failed', err?.message || 'Send error');
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
