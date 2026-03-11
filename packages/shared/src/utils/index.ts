export function formatUZS(amount: number): string {
  return new Intl.NumberFormat('ru-RU').format(amount) + ' UZS';
}

export function generateOrderNumber(): number {
  return Math.floor(Date.now() / 1000) % 1000000;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
}
