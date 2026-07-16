/**
 * SecretsService — OS keychain-backed API key storage.
 *
 * Uses Electron's `safeStorage` API to encrypt/decrypt the API key
 * with the OS keychain. The encrypted blob is stored on disk under
 * the user data directory.
 *
 * The decrypted key is NEVER logged, exposed to the renderer, or
 * written to disk in plaintext.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/** Relative path within userDataDir where the encrypted key is stored. */
const SECRETS_DIR = 'secrets';
const KEY_FILE = 'api-key.enc';

export class SecretsService {
  private readonly secretsDir: string;
  private readonly keyPath: string;

  /**
   * @param userDataDir - Electron's `app.getPath('userData')` directory.
   */
  constructor(private readonly userDataDir: string) {
    this.secretsDir = path.join(userDataDir, SECRETS_DIR);
    this.keyPath = path.join(this.secretsDir, KEY_FILE);
  }

  /**
   * Check whether an API key is stored on disk.
   */
  async hasApiKey(): Promise<boolean> {
    try {
      await fs.promises.access(this.keyPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Encrypt and store an API key.
   *
   * @throws If OS keychain encryption is unavailable.
   */
  async setApiKey(key: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'OS keychain encryption is not available on this system. ' +
        'Cannot store API key securely.',
      );
    }

    const encrypted = safeStorage.encryptString(key);

    // Ensure the secrets directory exists
    await fs.promises.mkdir(this.secretsDir, { recursive: true });
    await fs.promises.writeFile(this.keyPath, encrypted);
  }

  /**
   * Read and decrypt the stored API key.
   *
   * @returns The decrypted key, or `null` if no key is stored.
   * @throws If decryption fails (e.g. corrupted file, keychain unavailable).
   */
  async getApiKey(): Promise<string | null> {
    if (!(await this.hasApiKey())) return null;

    const encrypted = await fs.promises.readFile(this.keyPath);
    return safeStorage.decryptString(encrypted);
  }

  /**
   * Delete the stored API key from disk.
   */
  async deleteApiKey(): Promise<void> {
    try {
      await fs.promises.unlink(this.keyPath);
    } catch {
      // File already gone — no-op
    }
  }
}
