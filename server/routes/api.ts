import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { whatsappService } from '../services/whatsappService';
import { bulkService } from '../services/bulkService';
import { contactsService } from '../services/contactsService';
import { getHistory, addToHistory } from '../services/historyService';

const router = Router();

// Setup file upload middleware
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Single administrator credentials
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Resolve persistent auth path for session storage
const potentialPersistentPaths = [
  '/.auth',
  '/data/.auth',
  '/persistent/.auth',
  '/volume/.auth',
];

let persistentAuthPath = path.join(process.cwd(), '.auth');

for (const p of potentialPersistentPaths) {
  try {
    const parentDir = path.dirname(p);
    if (fs.existsSync(parentDir)) {
      fs.mkdirSync(p, { recursive: true });
      persistentAuthPath = p;
      console.log(`[SessionStore] Selected persistent path for activeSessions: ${persistentAuthPath}`);
      break;
    }
  } catch (err) {
    // Fail-safe
  }
}

// Ensure resolved directory exists
if (!fs.existsSync(persistentAuthPath)) {
  try {
    fs.mkdirSync(persistentAuthPath, { recursive: true });
  } catch (err) {
    console.error(`[SessionStore] Failed to create directory:`, err);
  }
}

const sessionFilePath = path.join(persistentAuthPath, 'active-sessions.json');

class FileSessionStore {
  private sessions = new Map<string, string>();

  constructor() {
    this.loadSessions();
  }

  private loadSessions() {
    try {
      if (fs.existsSync(sessionFilePath)) {
        const raw = fs.readFileSync(sessionFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [token, email] of Object.entries(parsed)) {
            if (typeof token === 'string' && typeof email === 'string') {
              this.sessions.set(token, email);
            }
          }
          console.log(`[SessionStore] Loaded ${this.sessions.size} persistent sessions from disk.`);
        }
      }
    } catch (err) {
      console.error('[SessionStore] Error loading sessions:', err);
    }
  }

  private saveSessions() {
    try {
      const obj: Record<string, string> = {};
      this.sessions.forEach((email, token) => {
        obj[token] = email;
      });
      fs.writeFileSync(sessionFilePath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.error('[SessionStore] Error saving sessions:', err);
    }
  }

  public has(token: string): boolean {
    return this.sessions.has(token);
  }

  public get(token: string): string | undefined {
    return this.sessions.get(token);
  }

  public set(token: string, email: string): void {
    this.sessions.set(token, email);
    this.saveSessions();
  }

  public delete(token: string): boolean {
    const res = this.sessions.delete(token);
    this.saveSessions();
    return res;
  }
}

// Session storage map (token -> email) for multi-user isolation
export const activeSessions = new FileSessionStore();

// Middleware to authenticate admin requests
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.session;
  if (token && activeSessions.has(token)) {
    (req as any).userEmail = activeSessions.get(token);
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: Admin authentication required' });
}

// ==========================================
// Authentication APIs
// ==========================================

router.post('/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    // Generate a secure, unique HTTP-only session token per login for multi-user isolation
    const uniqueToken = 'session_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    activeSessions.set(uniqueToken, email);

    res.cookie('session', uniqueToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    return res.json({ success: true, user: { email: ADMIN_EMAIL } });
  }

  return res.status(401).json({ error: 'Invalid email or password' });
});

router.post('/auth/logout', (req: Request, res: Response) => {
  const token = req.cookies?.session;
  if (token) {
    activeSessions.delete(token);
  }
  res.clearCookie('session');
  return res.json({ success: true });
});

router.get('/auth/me', (req: Request, res: Response) => {
  const token = req.cookies?.session;
  if (token && activeSessions.has(token)) {
    const email = activeSessions.get(token);
    return res.json({ authenticated: true, user: { email } });
  }
  return res.json({ authenticated: false });
});

// ==========================================
// Health Checks
// ==========================================

router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ==========================================
// WhatsApp Connection APIs
// ==========================================

router.post('/whatsapp/connect', authMiddleware, async (req: Request, res: Response) => {
  try {
    const email = (req as any).userEmail;
    await whatsappService.connect(email);
    return res.json({ success: true, message: 'Connection process initiated' });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to initiate connection' });
  }
});

router.post('/whatsapp/disconnect', authMiddleware, async (req: Request, res: Response) => {
  try {
    const email = (req as any).userEmail;
    await whatsappService.disconnect(email);
    return res.json({ success: true, message: 'Successfully disconnected and cleared session' });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to disconnect' });
  }
});

router.get('/whatsapp/status', authMiddleware, (req: Request, res: Response) => {
  const email = (req as any).userEmail;
  const status = whatsappService.getStatus(email);
  const bulkStatus = bulkService.getStatus();
  return res.json({
    ...status,
    bulkJob: bulkStatus,
  });
});

// ==========================================
// Send Messaging APIs
// ==========================================

router.post('/whatsapp/send', authMiddleware, async (req: Request, res: Response) => {
  const { phoneNumber, message } = req.body;

  if (!phoneNumber || !message) {
    return res.status(400).json({ error: 'Phone number and message are required' });
  }

  try {
    const email = (req as any).userEmail;
    await whatsappService.sendMessage(phoneNumber, message, email);
    return res.json({ success: true, message: 'Message sent successfully' });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Failed to send message' });
  }
});

router.post('/whatsapp/send-bulk', authMiddleware, async (req: Request, res: Response) => {
  const { action, numbers, message, delayMin, delayMax } = req.body;

  try {
    if (action === 'start') {
      if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
        return res.status(400).json({ error: 'An array of numbers is required to start a bulk job' });
      }
      if (!message) {
        return res.status(400).json({ error: 'Message content is required for bulk sending' });
      }

      const job = await bulkService.startJob(
        numbers,
        message,
        delayMin ? parseInt(delayMin, 10) : undefined,
        delayMax ? parseInt(delayMax, 10) : undefined
      );
      return res.json({ success: true, job });
    }

    if (action === 'pause') {
      const job = bulkService.pauseJob();
      return res.json({ success: true, job });
    }

    if (action === 'resume') {
      const job = bulkService.resumeJob();
      return res.json({ success: true, job });
    }

    if (action === 'cancel') {
      const job = bulkService.cancelJob();
      return res.json({ success: true, job });
    }

    if (action === 'status') {
      const job = bulkService.getStatus();
      return res.json({ success: true, job });
    }

    return res.status(400).json({ error: 'Invalid bulk action specified' });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Bulk job action failed' });
  }
});

// ==========================================
// Contacts APIs
// ==========================================

router.get('/contacts', authMiddleware, (req: Request, res: Response) => {
  const list = contactsService.getContacts();
  return res.json({ success: true, contacts: list });
});

router.post('/contacts/manual', authMiddleware, (req: Request, res: Response) => {
  const { contacts } = req.body;

  if (!contacts || !Array.isArray(contacts)) {
    return res.status(400).json({ error: 'Invalid request payload. Array of contacts required.' });
  }

  try {
    const added = contactsService.addContacts(contacts);
    return res.json({
      success: true,
      message: `Successfully processed ${contacts.length} entries, added ${added.length} new unique contacts.`,
      contacts: added,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Failed to add manual contacts' });
  }
});

router.post('/contacts/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const originalName = req.file.originalname.toLowerCase();
    let parsed: { name?: string; phoneNumber: string }[] = [];

    if (originalName.endsWith('.xlsx') || originalName.endsWith('.xls')) {
      parsed = contactsService.parseXlsxBuffer(req.file.buffer);
    } else if (originalName.endsWith('.csv') || originalName.endsWith('.txt')) {
      parsed = await contactsService.parseCsvBuffer(req.file.buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file format. Please upload a CSV or Excel (.xlsx) file.' });
    }

    const added = contactsService.addContacts(parsed);
    return res.json({
      success: true,
      message: `Successfully processed ${parsed.length} contacts, imported ${added.length} new unique numbers.`,
      count: added.length,
      contacts: added,
    });
  } catch (error: any) {
    console.error('[Contacts API] File upload failed:', error);
    return res.status(500).json({ error: error?.message || 'Error processing contact upload' });
  }
});

router.post('/contacts/clear', authMiddleware, (req: Request, res: Response) => {
  contactsService.clearContacts();
  return res.json({ success: true, message: 'All contacts cleared' });
});

// ==========================================
// History APIs
// ==========================================

router.get('/history', authMiddleware, (req: Request, res: Response) => {
  const list = getHistory();
  return res.json({ success: true, history: list });
});

// Evolution API webhook endpoint (unauthenticated for external service callback)
router.post('/whatsapp/webhook', (req: Request, res: Response) => {
  try {
    const { event, instance, data } = req.body;
    const eventName = (event || '').toUpperCase();
    console.log(`[Evolution Webhook] Received event "${eventName}" for instance: ${instance}`);

    if (eventName === 'CONNECTION_UPDATE') {
      console.log(`[Evolution Webhook] Connection state updated for ${instance}: ${data?.state}`);
      whatsappService.updateStatusFromWebhook(instance, data?.state);
    }

    if (eventName === 'MESSAGES_UPSERT') {
      const isFromMe = data?.key?.fromMe;
      const body = data?.message?.conversation || data?.message?.extendedTextMessage?.text;
      const sender = data?.key?.remoteJid?.split('@')[0];
      if (body && !isFromMe) {
        console.log(`[Evolution Webhook] Incoming message from ${sender}: "${body}"`);
        addToHistory(sender, body, 'Received');
      }
    }

    if (eventName === 'SEND_MESSAGE') {
      const body = data?.message?.conversation || data?.message?.extendedTextMessage?.text;
      const recipient = data?.key?.remoteJid?.split('@')[0];
      if (body) {
        console.log(`[Evolution Webhook] Outgoing message delivered to ${recipient}: "${body}" (Logged via sendMessage)`);
      }
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error(`[Evolution Webhook] Error processing event:`, err);
    return res.status(500).json({ error: err?.message || 'Webhook processing failed' });
  }
});

export default router;
