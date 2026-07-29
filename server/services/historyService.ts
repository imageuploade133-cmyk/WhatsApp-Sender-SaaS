export interface HistoryEntry {
  id: string;
  recipient: string;
  message: string;
  time: string;
  status: 'Sent' | 'Failed';
  error?: string;
}

const history: HistoryEntry[] = [];

export function getHistory(): HistoryEntry[] {
  return history;
}

export function addToHistory(recipient: string, message: string, status: 'Sent' | 'Failed', error?: string): HistoryEntry {
  const entry: HistoryEntry = {
    id: Math.random().toString(36).substring(2, 9),
    recipient,
    message,
    time: new Date().toISOString(),
    status,
    error,
  };
  // Prepend to show newest first
  history.unshift(entry);
  return entry;
}
