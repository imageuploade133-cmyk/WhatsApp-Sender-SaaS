import qrcode from 'qrcode';
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

const url = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const apiKey = process.env.EVOLUTION_API_KEY || 'global-api-token-here';

export function getInstanceName(email?: string): string {
  const baseEmail = email || process.env.ADMIN_EMAIL || 'admin@test.com';
  if (baseEmail.startsWith('instance-')) {
    return baseEmail;
  }
  return 'instance-' + baseEmail.toLowerCase().replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

class WhatsAppService {
  private statuses: Record<string, WhatsAppStatus> = {};

  constructor() {
    console.log('[WhatsAppService] Starting up Evolution API service wrapper...');
    this.startStatusPolling();
  }

  private getOrCreateStatus(instanceName: string): WhatsAppStatus {
    if (!this.statuses[instanceName]) {
      this.statuses[instanceName] = {
        status: 'Disconnected',
        phoneNumber: null,
        whatsappName: null,
        platform: 'Baileys',
        messagesSentToday: 0,
        messagesFailed: 0,
        connectedSince: null,
        qrCodeUrl: null,
        error: null,
      };
    }
    return this.statuses[instanceName];
  }

  public getStatus(email?: string): WhatsAppStatus {
    const instanceName = getInstanceName(email);
    return { ...this.getOrCreateStatus(instanceName) };
  }

  public async connect(email?: string): Promise<void> {
    const instanceName = getInstanceName(email);
    const status = this.getOrCreateStatus(instanceName);

    console.log(`[WhatsAppService] Connect initiated for instance: ${instanceName}`);
    status.status = 'Generating QR';
    status.error = null;
    status.qrCodeUrl = null;

    try {
      // 1. Check if instance exists in Evolution API
      const exists = await this.checkInstanceExists(instanceName);
      if (!exists) {
        console.log(`[WhatsAppService] Creating new instance: ${instanceName}`);
        await this.createInstance(instanceName);
      }

      // 2. Fetch the QR code or check state
      const qrData = await this.getConnectQR(instanceName);
      if (qrData && qrData.code) {
        status.status = 'Waiting for Scan';
        status.qrCodeUrl = await qrcode.toDataURL(qrData.code);
        console.log(`[WhatsAppService] Fresh QR code generated successfully.`);
      } else {
        // If no QR is returned, check if already connected
        const connState = await this.getConnectionState(instanceName);
        if (connState === 'open') {
          status.status = 'Connected';
          await this.syncInstanceStatus(instanceName);
        } else {
          status.status = 'Error';
          status.error = 'Failed to retrieve connection QR Code';
        }
      }
    } catch (err: any) {
      status.status = 'Error';
      status.error = err?.message || 'Failed to connect to Evolution API';
      console.error(`[WhatsAppService] Connect error for ${instanceName}:`, err);
    }
  }

  public updateStatusFromWebhook(instanceName: string, state: string): void {
    const status = this.getOrCreateStatus(instanceName);
    console.log(`[WhatsAppService] Webhook connection update for ${instanceName}: ${state}`);
    if (state === 'open') {
      status.status = 'Connected';
      status.qrCodeUrl = null;
      status.error = null;
      if (!status.connectedSince) {
        status.connectedSince = new Date().toISOString();
      }
      this.syncInstanceStatus(instanceName).catch(() => {});
    } else if (state === 'connecting') {
      status.status = 'Waiting for Scan';
    } else {
      status.status = 'Disconnected';
      status.phoneNumber = null;
      status.whatsappName = null;
      status.connectedSince = null;
      status.qrCodeUrl = null;
    }
  }

  public async disconnect(email?: string): Promise<void> {
    const instanceName = getInstanceName(email);
    const status = this.getOrCreateStatus(instanceName);

    console.log(`[WhatsAppService] Disconnect initiated for instance: ${instanceName}`);
    try {
      await this.deleteInstance(instanceName);
    } catch (err) {
      console.warn(`[WhatsAppService] Warning deleting instance ${instanceName}:`, err);
    }

    status.status = 'Disconnected';
    status.phoneNumber = null;
    status.whatsappName = null;
    status.connectedSince = null;
    status.qrCodeUrl = null;
    status.error = null;
  }

  public async sendMessage(phoneNumber: string, message: string, email?: string): Promise<any> {
    const instanceName = getInstanceName(email);
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length < 8) {
      throw new Error(`Invalid phone number length: must be at least 8 digits. Received: "${phoneNumber}"`);
    }

    const payload = {
      number: cleanNumber,
      text: message,
    };

    console.log(`[WhatsAppService] Dispatching message via Evolution API to ${cleanNumber}...`);

    try {
      const res = await fetch(`${url}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data: any = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}: ${res.statusText}`);
      }

      console.log(`[WhatsAppService] Message sent successfully via Evolution API.`);

      const status = this.getOrCreateStatus(instanceName);
      status.messagesSentToday++;
      addToHistory(phoneNumber, message, 'Sent');

      return {
        success: true,
        messageId: data?.key?.id || data?.messageId || 'unknown',
        status: 'SENT'
      };
    } catch (err: any) {
      console.error(`[WhatsAppService] Failed to send message via Evolution API:`, err);
      const status = this.getOrCreateStatus(instanceName);
      status.messagesFailed++;
      addToHistory(phoneNumber, message, 'Failed', err?.message || 'Send error');
      throw err;
    }
  }

  public async sendMediaUrl(
    phoneNumber: string,
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    mimeType: string,
    fileName?: string,
    caption?: string,
    email?: string
  ): Promise<any> {
    const instanceName = getInstanceName(email);
    const cleanNumber = phoneNumber.replace(/\D/g, '');

    const payload = {
      number: cleanNumber,
      mediatype: mediaType,
      mimetype: mimeType,
      media: mediaUrl,
      fileName: fileName || `file_${Date.now()}`,
      caption: caption || '',
    };

    console.log(`[WhatsAppService] Sending media (${mediaType}) via Evolution API...`);

    try {
      const res = await fetch(`${url}/message/sendMedia/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data: any = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      }

      const status = this.getOrCreateStatus(instanceName);
      status.messagesSentToday++;
      addToHistory(phoneNumber, `[Media: ${mediaType}] ${caption || ''}`, 'Sent');

      return {
        success: true,
        messageId: data?.key?.id || data?.messageId || 'unknown',
        status: 'SENT'
      };
    } catch (err: any) {
      const status = this.getOrCreateStatus(instanceName);
      status.messagesFailed++;
      addToHistory(phoneNumber, `[Media: ${mediaType}] ${caption || ''}`, 'Failed', err?.message || 'Send error');
      throw err;
    }
  }

  private startStatusPolling() {
    setInterval(async () => {
      for (const instanceName of Object.keys(this.statuses)) {
        try {
          await this.syncInstanceStatus(instanceName);
        } catch (err) {
          // Silent catch
        }
      }
    }, 5000);
  }

  private async syncInstanceStatus(instanceName: string): Promise<void> {
    const status = this.getOrCreateStatus(instanceName);

    try {
      const exists = await this.checkInstanceExists(instanceName);
      if (!exists) {
        status.status = 'Disconnected';
        status.phoneNumber = null;
        status.whatsappName = null;
        status.qrCodeUrl = null;
        return;
      }

      const connState = await this.getConnectionState(instanceName);
      if (connState === 'open') {
        status.status = 'Connected';
        status.qrCodeUrl = null;
        status.error = null;
        if (!status.connectedSince) {
          status.connectedSince = new Date().toISOString();
        }

        // Fetch details
        const details = await this.getInstanceDetails(instanceName);
        if (details) {
          const rawOwner = details.owner || details.number || '';
          status.phoneNumber = rawOwner.split('@')[0] || 'Unknown';
          status.whatsappName = details.profileName || details.instanceName || 'WhatsApp Device';
          status.platform = details.integration || 'Baileys';
        }
      } else if (connState === 'connecting') {
        status.status = 'Waiting for Scan';
      } else {
        status.status = 'Disconnected';
        status.phoneNumber = null;
        status.whatsappName = null;
        status.connectedSince = null;
      }
    } catch (err) {
      // Ignore background sync errors
    }
  }

  private async checkInstanceExists(instanceName: string): Promise<boolean> {
    try {
      const res = await fetch(`${url}/instance/fetchInstances?instanceName=${instanceName}`, {
        headers: { 'apikey': apiKey }
      });
      if (!res.ok) return false;
      const list: any = await res.json();
      if (Array.isArray(list)) {
        return list.some((inst) => inst.instanceName === instanceName);
      }
      return false;
    } catch {
      return false;
    }
  }

  private async createInstance(instanceName: string): Promise<void> {
    const res = await fetch(`${url}/instance/create`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS'
      })
    });
    if (!res.ok) {
      const data: any = await res.json();
      throw new Error(data?.error || data?.message || `Failed to create instance: ${res.statusText}`);
    }
  }

  private async getConnectQR(instanceName: string): Promise<any> {
    const res = await fetch(`${url}/instance/connect/${instanceName}`, {
      headers: { 'apikey': apiKey }
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data; // contains { code, base64, pairingCode }
  }

  private async getConnectionState(instanceName: string): Promise<string> {
    try {
      const res = await fetch(`${url}/instance/connectionState/${instanceName}`, {
        headers: { 'apikey': apiKey }
      });
      if (!res.ok) return 'close';
      const data: any = await res.json();
      return data?.instance?.state || 'close';
    } catch {
      return 'close';
    }
  }

  private async getInstanceDetails(instanceName: string): Promise<any> {
    try {
      const res = await fetch(`${url}/instance/fetchInstances?instanceName=${instanceName}`, {
        headers: { 'apikey': apiKey }
      });
      if (!res.ok) return null;
      const list: any = await res.json();
      if (Array.isArray(list)) {
        return list.find((inst) => inst.instanceName === instanceName);
      }
      return null;
    } catch {
      return null;
    }
  }

  private async deleteInstance(instanceName: string): Promise<void> {
    await fetch(`${url}/instance/delete/${instanceName}`, {
      method: 'DELETE',
      headers: { 'apikey': apiKey }
    });
  }
}

export const whatsappService = new WhatsAppService();
