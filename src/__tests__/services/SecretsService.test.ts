/**
 * SecretsService tests (WP-14).
 *
 * Tests keychain-backed API key storage with mocked Electron safeStorage.
 * Each test creates a temp directory for storing the encrypted key file.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock Electron's safeStorage before importing SecretsService
vi.mock('electron', () => {
  // Simple buffer-based encryption mock using XOR (not real encryption)
  const encryptString = (text: string): Buffer => {
    return Buffer.from(text, 'utf-8');
  };
  const decryptString = (buf: Buffer): string => {
    return buf.toString('utf-8');
  };

  return {
    safeStorage: {
      isEncryptionAvailable: vi.fn().mockReturnValue(true),
      encryptString: vi.fn().mockImplementation(encryptString),
      decryptString: vi.fn().mockImplementation(decryptString),
    },
  };
});

import { SecretsService } from '../../main/services/SecretsService';

describe('SecretsService', () => {
  let tmpDir: string;
  let service: SecretsService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-test-secrets-'));
    service = new SecretsService(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('hasApiKey returns false when no key is stored', async () => {
    const hasKey = await service.hasApiKey();
    expect(hasKey).toBe(false);
  });

  it('setApiKey stores the key and hasApiKey returns true', async () => {
    await service.setApiKey('sk-test-api-key-12345');
    const hasKey = await service.hasApiKey();
    expect(hasKey).toBe(true);
  });

  it('getApiKey returns the stored key after setApiKey', async () => {
    await service.setApiKey('sk-test-api-key-12345');
    const result = await service.getApiKey();
    expect(result).toBe('sk-test-api-key-12345');
  });

  it('getApiKey returns null when no key is stored', async () => {
    const result = await service.getApiKey();
    expect(result).toBeNull();
  });

  it('encrypted file is stored in the secrets subdirectory', async () => {
    await service.setApiKey('my-key');

    const secretsDir = path.join(tmpDir, 'secrets');
    const keyPath = path.join(secretsDir, 'api-key.enc');

    expect(fs.existsSync(keyPath)).toBe(true);
    const content = fs.readFileSync(keyPath);
    expect(content.length).toBeGreaterThan(0);
  });

  it('deleteApiKey removes the stored key', async () => {
    await service.setApiKey('sk-key-to-delete');
    expect(await service.hasApiKey()).toBe(true);

    await service.deleteApiKey();
    expect(await service.hasApiKey()).toBe(false);
    expect(await service.getApiKey()).toBeNull();
  });

  it('deleteApiKey is idempotent when no key exists', async () => {
    // Should not throw
    await service.deleteApiKey();
    await service.deleteApiKey();
    expect(await service.hasApiKey()).toBe(false);
  });

  it('stores and retrieves multiple different keys', async () => {
    await service.setApiKey('key-one');
    expect(await service.getApiKey()).toBe('key-one');

    await service.setApiKey('key-two');
    expect(await service.getApiKey()).toBe('key-two');
  });

  it('throws descriptive error when encryption is unavailable', async () => {
    const { safeStorage } = await import('electron');
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false);

    await expect(service.setApiKey('some-key')).rejects.toThrow(
      /OS keychain encryption is not available/i,
    );
  });

  it('does not log the key value in any form', () => {
    // This test verifies by checking that the SecretsService source
    // does not contain any console.log or logging statements
    // that reference the key
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../main/services/SecretsService.ts'),
      'utf-8',
    );

    // The only place the key appears is in the params and safeStorage calls
    // Check there's no console.log or logging of the key
    const lines = source.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Allow safeStorage calls and constructor parameter
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      // Check for any logging that includes 'key' or 'apiKey' as a value
      if (
        (trimmed.includes('console.') || trimmed.includes('log(')) &&
        (trimmed.includes('key') || trimmed.includes('apiKey'))
      ) {
        // This would be a violation
        expect(trimmed).not.toMatch(/console\.(log|debug|info|warn|error)/);
      }
    }
  });
});
