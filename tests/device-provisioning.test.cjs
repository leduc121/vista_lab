'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DeviceProvisioning } = require('../device-provisioning');

test('device identity creates an encrypted local key and remains pending backend enrollment', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-device-identity-'));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'secretservice',
    encryptString: (value) => Buffer.from(`test-ciphertext:${crypto.createHash('sha256').update(value).digest('hex')}`)
  };
  try {
    const provider = new DeviceProvisioning({ safeStorage, storageDir: dir, platform: 'linux' });
    assert.equal(provider.status().state, 'UNINITIALIZED');
    const state = provider.createEnrollmentKey();
    assert.equal(state.state, 'KEY_READY');
    assert.equal(state.provisioned, false);
    assert.equal(state.backendAvailable, false);
    assert.match(state.publicKey, /BEGIN PUBLIC KEY/);
    assert.equal(state.fingerprint.length, 64);
    assert.match(fs.readFileSync(path.join(dir, 'device-key.enc'), 'utf8'), /^test-ciphertext:/);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, 'device-key.enc'), 'utf8'), /PRIVATE KEY/);
    assert.equal(provider.createEnrollmentKey().fingerprint, state.fingerprint);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Ed25519 enrollment challenge uses backend message, DER public key and signature', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-device-enroll-'));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'secretservice',
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => Buffer.from(value).toString()
  };
  const requests = [];
  const priorFetch = global.fetch;
  process.env.VISTA_EDUCATION_API = 'http://127.0.0.1:3012';
  process.env.VISTA_DEVICE_PROVISIONING_ENABLED = 'true';
  global.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    requests.push({ path, body: options.body && JSON.parse(options.body), headers: options.headers });
    const body = path.endsWith('/enroll/start')
      ? { deviceId: 'c7931ef3-57d8-4633-8e17-d91464bedf40', nonce: 'nonce_value_abcdefghijklmnopqrstuvwxyz', algorithm: 'Ed25519', signedMessageFormat: 'vista-device-enroll:v1:<deviceId>:<nonce>' }
      : path.endsWith('/enroll/complete')
        ? { deviceId: 'c7931ef3-57d8-4633-8e17-d91464bedf40', status: 'active', credentialVersion: 1 }
        : path.endsWith('/auth/challenge')
          ? { nonce: 'auth_nonce_abcdefghijklmnopqrstuvwxyz', algorithm: 'Ed25519', signedMessageFormat: 'vista-device-auth:v1:<deviceId>:<nonce>' }
          : path.endsWith('/auth/token')
            ? { accessToken: 'short-lived-device-token', tokenType: 'device', expiresIn: 900 }
            : path.endsWith('/devices/me')
              ? { id: 'c7931ef3-57d8-4633-8e17-d91464bedf40', status: 'active', credential_version: 1 }
              : {};
    return { ok: true, status: 200, json: async () => body };
  };
  try {
    const provider = new DeviceProvisioning({ safeStorage, storageDir: dir, platform: 'linux' });
    provider.createEnrollmentKey();
    const state = await provider.enroll('vd_enrollmentcode_abcdefghijklmnopqrstuvwxyz');
    assert.equal(state.state, 'ACTIVE');
    assert.deepEqual(requests.map((entry) => entry.path), ['/api/v1/devices/enroll/start', '/api/v1/devices/enroll/complete', '/api/v1/devices/auth/challenge', '/api/v1/devices/auth/token', '/api/v1/devices/me', '/api/v1/devices/me/heartbeat']);
    const enrolled = requests[1].body;
    assert.match(enrolled.publicKey, /^[A-Za-z0-9_-]{40,200}$/);
    const publicKey = crypto.createPublicKey({ key: Buffer.from(enrolled.publicKey, 'base64url'), format: 'der', type: 'spki' });
    assert.equal(crypto.verify(null, Buffer.from(`vista-device-enroll:v1:${enrolled.deviceId}:${enrolled.nonce}`), publicKey, Buffer.from(enrolled.signature, 'base64url')), true);
    assert.equal(requests[4].headers.Authorization, 'Bearer short-lived-device-token');
    assert.equal(requests[5].headers.Authorization, 'Bearer short-lived-device-token');
  } finally {
    global.fetch = priorFetch;
    delete process.env.VISTA_EDUCATION_API;
    delete process.env.VISTA_DEVICE_PROVISIONING_ENABLED;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('device identity refuses creation when OS encrypted storage is unavailable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-device-no-store-'));
  try {
    const provider = new DeviceProvisioning({ safeStorage: { isEncryptionAvailable: () => false }, storageDir: dir });
    assert.throws(() => provider.createEnrollmentKey(), /encrypted storage is unavailable/i);
    assert.equal(fs.existsSync(dir), true);
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('local metadata can never claim server provisioning success', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-device-tamper-'));
  const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'secretservice' };
  try {
    fs.writeFileSync(path.join(dir, 'device.json'), JSON.stringify({ state: 'ACTIVE', deviceId: 'fake', certificateExpiresAt: '2099-01-01' }));
    const state = new DeviceProvisioning({ safeStorage, storageDir: dir, platform: 'linux' }).status();
    assert.equal(state.state, 'UNINITIALIZED');
    assert.equal(state.provisioned, false);
    assert.equal(state.deviceId, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
