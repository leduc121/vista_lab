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

  async request(pathname, body, { token } = {}) {
    const base = String(process.env.VISTA_EDUCATION_API || '').replace(/\/+$/, '');
    if (!base) throw new Error('Configure VISTA_EDUCATION_API before device enrollment.');
    const url = new URL(`${base}/api/v1${pathname}`);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) {
      throw new Error('Education API must use HTTPS; HTTP is allowed only on loopback.');
    }
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(typeof data.message === 'string' ? data.message : `Device API returned HTTP ${response.status}.`);
      error.status = response.status; error.code = data.code; throw error;
    }
    return data;
  }

  privateKey() {
    if (!this.status().storageAvailable || !fs.existsSync(this.privateKeyPath())) throw new Error('Create a device key in OS encrypted storage before enrolling.');
    return crypto.createPrivateKey(this.safeStorage.decryptString(fs.readFileSync(this.privateKeyPath())));
  }

  async enroll(enrollmentCode) {
    if (process.env.VISTA_DEVICE_PROVISIONING_ENABLED !== 'true') throw new Error('Enable device provisioning explicitly with VISTA_DEVICE_PROVISIONING_ENABLED=true after the backend feature is enabled.');
    if (!/^[A-Za-z0-9_-]{24,80}$/.test(String(enrollmentCode || ''))) throw new Error('Enter the one-time enrollment code supplied by an authorized VISTA administrator.');
    const start = await this.request('/devices/enroll/start', { enrollmentCode });
    if (start.algorithm !== 'Ed25519' || start.signedMessageFormat !== 'vista-device-enroll:v1:<deviceId>:<nonce>' || !start.deviceId || !start.nonce) throw new Error('Backend returned an unsupported enrollment challenge.');
    const metadata = JSON.parse(fs.readFileSync(this.metadataPath(), 'utf8'));
    const der = crypto.createPublicKey(metadata.publicKey).export({ type: 'spki', format: 'der' });
    const publicKey = der.toString('base64url');
    const signature = crypto.sign(null, Buffer.from(`vista-device-enroll:v1:${start.deviceId}:${start.nonce}`), this.privateKey()).toString('base64url');
    const enrolled = await this.request('/devices/enroll/complete', { deviceId: start.deviceId, nonce: start.nonce, publicKey, signature });
    if (enrolled.deviceId !== start.deviceId || enrolled.status !== 'active') throw new Error('Backend did not confirm this device as active.');
    fs.writeFileSync(this.metadataPath(), JSON.stringify({ ...metadata, state: 'ACTIVE', deviceId: enrolled.deviceId, credentialVersion: enrolled.credentialVersion, enrolledAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    return this.authenticate();
  }

  async authenticate() {
    const metadata = JSON.parse(fs.readFileSync(this.metadataPath(), 'utf8'));
    if (!metadata.deviceId) throw new Error('Device has not completed enrollment.');
    const challenge = await this.request('/devices/auth/challenge', { deviceId: metadata.deviceId });
    if (challenge.algorithm !== 'Ed25519' || challenge.signedMessageFormat !== 'vista-device-auth:v1:<deviceId>:<nonce>' || !challenge.nonce) throw new Error('Backend returned an unsupported device authentication challenge.');
    const signature = crypto.sign(null, Buffer.from(`vista-device-auth:v1:${metadata.deviceId}:${challenge.nonce}`), this.privateKey()).toString('base64url');
    const session = await this.request('/devices/auth/token', { deviceId: metadata.deviceId, nonce: challenge.nonce, signature });
    if (typeof session.accessToken !== 'string' || session.tokenType !== 'device') throw new Error('Backend did not issue a device session.');
    const device = await this.request('/devices/me', undefined, { token: session.accessToken });
    if (device?.id !== metadata.deviceId || device?.status !== 'active') throw new Error('Backend device status is not active.');
    await this.request('/devices/me/heartbeat', {}, { token: session.accessToken });
    return { state: 'ACTIVE', provisioned: true, backendAvailable: true, storageAvailable: true, deviceId: metadata.deviceId, fingerprint: metadata.fingerprint, backendStatus: device.status, credentialVersion: device.credential_version || metadata.credentialVersion, sessionExpiresIn: session.expiresIn };
  }

  metadataPath() { return path.join(this.storageDir, 'device.json'); }
  privateKeyPath() { return path.join(this.storageDir, 'device-key.enc'); }

  status() {
    let metadata = null;
    try { metadata = JSON.parse(fs.readFileSync(this.metadataPath(), 'utf8')); } catch {}
    const storageAvailable = secureStorageAvailable(this.safeStorage, this.platform);
    const keyReady = ['KEY_READY', 'ACTIVE'].includes(metadata?.state) && storageAvailable && fs.existsSync(this.privateKeyPath());
    return {
      // Local metadata cannot assert server enrollment. ACTIVE requires a future
      // authenticated backend response and is never inferred from this file.
      state: keyReady ? (metadata?.state === 'ACTIVE' && metadata?.deviceId ? 'ACTIVE' : 'KEY_READY') : 'UNINITIALIZED',
      provisioned: Boolean(keyReady && metadata?.state === 'ACTIVE' && metadata?.deviceId),
      backendAvailable: Boolean(process.env.VISTA_EDUCATION_API),
      enrollmentEnabled: process.env.VISTA_DEVICE_PROVISIONING_ENABLED === 'true',
      storageAvailable,
      deviceId: keyReady ? metadata?.deviceId || null : null,
      fingerprint: keyReady ? metadata?.fingerprint || null : null,
      publicKey: keyReady ? metadata?.publicKey || null : null,
      certificateExpiresAt: null,
      credentialVersion: keyReady ? metadata?.credentialVersion || null : null
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
