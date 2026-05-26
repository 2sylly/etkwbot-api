export function logInfo(message: string): void {
  console.log(`[${new Date().toISOString()}] [INFO] ${message}`);
}

export function logWarning(message: string): void {
  console.warn(`[${new Date().toISOString()}] [WARN] ${message}`);
}

export function logError(message: string, error?: unknown): void {
  console.error(`[${new Date().toISOString()}] [ERROR] ${message}`, error);
}
