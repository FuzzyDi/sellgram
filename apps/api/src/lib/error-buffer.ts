export interface ErrorEntry {
  time: number;
  method: string;
  url: string;
  statusCode: number;
  tenantId?: string | null;
  message?: string;
}

const MAX = 300;
const buffer: ErrorEntry[] = [];

export function pushError(entry: ErrorEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX) buffer.shift();
}

export function getErrors(limit = 50): ErrorEntry[] {
  return buffer.slice(-Math.min(limit, MAX)).reverse();
}
