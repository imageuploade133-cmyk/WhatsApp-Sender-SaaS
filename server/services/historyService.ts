export interface HistoryEntry {
  id: string;
  userId?: string;
  instanceId?: string;
  recipient: string;
  message: string;
  mediaUrl?: string;
  time: string;
  status: 'Sent' | 'Failed' | 'Received' | 'Delivered' | 'Read';
  error?: string;
}

const history: HistoryEntry[] = [];

export function getHistory(): HistoryEntry[] {
  return history;
}

export function addToHistory(
  recipient: string,
  message: string,
  status: 'Sent' | 'Failed' | 'Received' | 'Delivered' | 'Read',
  error?: string,
  mediaUrl?: string,
  userId?: string,
  instanceId?: string
): HistoryEntry {
  const entry: HistoryEntry = {
    id: Math.random().toString(36).substring(2, 9),
    userId,
    instanceId,
    recipient,
    message,
    mediaUrl,
    time: new Date().toISOString(),
    status,
    error,
  };
  // Prepend to show newest first
  history.unshift(entry);
  return entry;
}
