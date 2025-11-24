/**
 * Debug logging utility
 * Only logs when NODE_ENV=debug
 */
const isDebug = process.env.NODE_ENV === 'debug';

export function debugLog(...args: unknown[]): void {
  if (isDebug) {
    console.log('[DEBUG]', ...args);
  }
}

export function debugError(...args: unknown[]): void {
  if (isDebug) {
    console.error('[DEBUG]', ...args);
  }
}

