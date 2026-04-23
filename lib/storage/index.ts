import { NoopStorageProvider } from './providers/noop';
import { COSStorageProvider } from './providers/cos';
import type { StorageProvider } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('Storage');

export type StorageProviderType = 'noop' | 'cos';

let _provider: StorageProvider | null = null;
let _currentType: StorageProviderType = 'noop';

/**
 * Get the current storage provider
 */
export function getStorageProvider(): StorageProvider {
  if (!_provider) {
    _provider = new NoopStorageProvider();
  }
  return _provider;
}

/**
 * Set the storage provider type
 * @param type 'noop' (default) or 'cos' (Tencent Cloud COS)
 */
export function setStorageProvider(type: StorageProviderType): void {
  if (_currentType === type && _provider) {
    return;
  }

  log.info('Switching storage provider to:', type);

  switch (type) {
    case 'cos':
      _provider = new COSStorageProvider();
      break;
    case 'noop':
    default:
      _provider = new NoopStorageProvider();
      break;
  }

  _currentType = type;
}

/**
 * Check if we're running in a browser environment
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Initialize storage provider based on environment
 * Call this at app startup
 */
export function initStorageProvider(): void {
  if (isBrowser()) {
    // In browser, default to COS if oss.ts is available
    try {
      setStorageProvider('cos');
      log.info('Storage provider initialized to COS (browser)');
    } catch {
      setStorageProvider('noop');
      log.info('Storage provider initialized to Noop (browser, COS unavailable)');
    }
  } else {
    // On server, use Noop by default
    setStorageProvider('noop');
    log.info('Storage provider initialized to Noop (server)');
  }
}

export type { StorageProvider, StorageType } from './types';
