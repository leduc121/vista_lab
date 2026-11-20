'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { secureStorageAvailable } = require('./session-security');

class DeviceProvisioning {
  constructor({ safeStorage, storageDir, platform = process.platform } = {}) {
    this.safeStorage = safeStorage;
    this.storageDir = storageDir;
    this.platform = platform;
  }

  metadataPath() { return path.join(this.storageDir, 'device.json'); }
  privateKeyPath() { return path.join(this.storageDir, 'device-key.enc'); }

  status() {
    let metadata = null;
    try { metadata = JSON.parse(fs.readFileSync(this.metadataPath(), 'utf8')); } catch {}
    const storageAvailable = secureStorageAvailable(this.safeStorage, this.platform);
    const keyReady = metadata?.state === 'KEY_READY' && storageAvailable && fs.existsSync(this.privateKeyPath());
    return {
      // Local metadata cannot assert server enrollment. ACTIVE requires a future
      // authenticated backend response and is never inferred from this file.
      state: keyReady ? 'KEY_READY' : 'UNINITIALIZED',
      provisioned: false,
      backendAvailable: false,
      storageAvailable,
      deviceId: keyReady ? metadata?.deviceId || null : null,
      fingerprint: keyReady ? metadata?.fingerprint || null : null,
      publicKey: keyReady ? metadata?.publicKey || null : null,
      certificateExpiresAt: null
    };
  }

  createEnrollmentKey() {
    const existing = this.status();
    if (!existing.storageAvailable) throw new Error('OS encrypted storage is unavailable; enrollment key was not created.');
    if (existing.state !== 'UNINITIALIZED') return existing;
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const encrypted = this.safeStorage.encryptString(privatePem);
    fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.privateKeyPath(), encrypted, { mode: 0o600, flag: 'wx' });
    const metadata = {
      state: 'KEY_READY',
      fingerprint: crypto.createHash('sha256').update(publicPem).digest('hex'),
      publicKey: publicPem,
      deviceId: null,
      certificateExpiresAt: null,
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(this.metadataPath(), JSON.stringify(metadata, null, 2), { mode: 0o600, flag: 'wx' });
    return this.status();
  }
}

module.exports = { DeviceProvisioning };
