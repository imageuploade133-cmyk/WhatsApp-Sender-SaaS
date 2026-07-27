import { whatsappService } from './whatsappService';

export interface BulkJobStatus {
  id: string;
  total: number;
  sent: number;
  failed: number;
  remaining: number;
  currentNumber: string | null;
  status: 'idle' | 'running' | 'paused' | 'cancelled' | 'completed';
  numbers: string[];
  messageTemplate: string;
  delayMin: number;
  delayMax: number;
}

class BulkService {
  private activeJob: BulkJobStatus | null = null;
  private isProcessing = false;

  public getStatus(): BulkJobStatus {
    if (!this.activeJob) {
      return {
        id: '',
        total: 0,
        sent: 0,
        failed: 0,
        remaining: 0,
        currentNumber: null,
        status: 'idle',
        numbers: [],
        messageTemplate: '',
        delayMin: 5,
        delayMax: 10,
      };
    }
    return { ...this.activeJob };
  }

  public async startJob(numbers: string[], messageTemplate: string, delayMin = 5, delayMax = 10): Promise<BulkJobStatus> {
    if (this.activeJob && (this.activeJob.status === 'running' || this.activeJob.status === 'paused')) {
      throw new Error('A bulk sending job is already in progress');
    }

    // Automatically remove duplicates and empty/null entries
    const uniqueNumbers = Array.from(new Set(numbers.map((n) => n.trim()).filter(Boolean)));

    if (uniqueNumbers.length === 0) {
      throw new Error('No valid numbers provided for bulk sending');
    }

    this.activeJob = {
      id: Math.random().toString(36).substring(2, 9),
      total: uniqueNumbers.length,
      sent: 0,
      failed: 0,
      remaining: uniqueNumbers.length,
      currentNumber: null,
      status: 'running',
      numbers: uniqueNumbers,
      messageTemplate,
      delayMin,
      delayMax,
    };

    console.log(`[BulkService] Starting bulk job ${this.activeJob.id} with ${uniqueNumbers.length} recipients.`);
    this.runQueue();

    return this.getStatus();
  }

  public pauseJob(): BulkJobStatus {
    if (!this.activeJob || this.activeJob.status !== 'running') {
      throw new Error('No running job to pause');
    }
    console.log(`[BulkService] Pausing job ${this.activeJob.id}.`);
    this.activeJob.status = 'paused';
    return this.getStatus();
  }

  public resumeJob(): BulkJobStatus {
    if (!this.activeJob || this.activeJob.status !== 'paused') {
      throw new Error('No paused job to resume');
    }
    console.log(`[BulkService] Resuming job ${this.activeJob.id}.`);
    this.activeJob.status = 'running';
    this.runQueue();
    return this.getStatus();
  }

  public cancelJob(): BulkJobStatus {
    if (!this.activeJob || (this.activeJob.status !== 'running' && this.activeJob.status !== 'paused')) {
      throw new Error('No active job to cancel');
    }
    console.log(`[BulkService] Cancelling job ${this.activeJob.id}.`);
    this.activeJob.status = 'cancelled';
    this.activeJob.numbers = [];
    this.activeJob.remaining = 0;
    this.activeJob.currentNumber = null;
    return this.getStatus();
  }

  private async runQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.activeJob && this.activeJob.status === 'running') {
        if (this.activeJob.numbers.length === 0) {
          console.log(`[BulkService] Job ${this.activeJob.id} completed successfully.`);
          this.activeJob.status = 'completed';
          this.activeJob.currentNumber = null;
          break;
        }

        const nextNum = this.activeJob.numbers[0];
        this.activeJob.currentNumber = nextNum;

        try {
          // Attempt to send
          await whatsappService.sendMessage(nextNum, this.activeJob.messageTemplate);
          if (this.activeJob) {
            this.activeJob.sent++;
          }
        } catch (err: any) {
          console.error(`[BulkService] Failed to send bulk message to ${nextNum}:`, err?.message);
          if (this.activeJob) {
            this.activeJob.failed++;
          }
        }

        if (!this.activeJob) break;

        // Shift queue and update remaining count
        this.activeJob.numbers.shift();
        this.activeJob.remaining = this.activeJob.numbers.length;

        // If there are still numbers to send and job is still running, wait the specified delay
        if (this.activeJob.numbers.length > 0 && this.activeJob.status === 'running') {
          const delayMin = this.activeJob.delayMin;
          const delayMax = this.activeJob.delayMax;
          const waitTime = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
          console.log(`[BulkService] Waiting ${waitTime / 1000}s before next message...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    } catch (error) {
      console.error('[BulkService] Fatal queue processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }
}

export const bulkService = new BulkService();
