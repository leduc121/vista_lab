'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DeviceProvisioning } = require('../device-provisioning');

test('device identity creates an encrypted local key and remains not provisioned', () => {
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
