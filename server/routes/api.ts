import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { whatsappService } from '../services/whatsappService';
import { bulkService } from '../services/bulkService';
import { contactsService } from '../services/contactsService';
import { getHistory } from '../services/historyService';

const router = Router();

// Setup file upload middleware
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Single administrator credentials
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Session token generated on server start
const currentSessionToken = 'session_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// Middleware to authenticate admin requests
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.session;
  if (token && token === currentSessionToken) {
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
    // Set a secure, HTTP-only cookie
    res.cookie('session', currentSessionToken, {
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
  res.clearCookie('session');
  return res.json({ success: true });
});

router.get('/auth/me', (req: Request, res: Response) => {
  const token = req.cookies?.session;
  if (token && token === currentSessionToken) {
    return res.json({ authenticated: true, user: { email: ADMIN_EMAIL } });
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
    // connect() runs asynchronously and transitions status
    await whatsappService.connect();
    return res.json({ success: true, message: 'Connection process initiated' });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to initiate connection' });
  }
});

router.post('/whatsapp/disconnect', authMiddleware, async (req: Request, res: Response) => {
  try {
    await whatsappService.disconnect();
    return res.json({ success: true, message: 'Successfully disconnected and cleared session' });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to disconnect' });
  }
});

router.get('/whatsapp/status', authMiddleware, (req: Request, res: Response) => {
  const status = whatsappService.getStatus();
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
    await whatsappService.sendMessage(phoneNumber, message);
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

export default router;
