const test = require('node:test');
const assert = require('node:assert/strict');
const { isDockerPrivateIPv4, parseArgs } = require('../scripts/forward-container-port.cjs');

test('accepts only private Docker IPv4 targets for the loopback forwarder', () => {
  for (const address of ['10.0.0.3', '172.16.0.2', '172.31.255.254', '192.168.3.5']) assert.equal(isDockerPrivateIPv4(address), true);
  for (const address of ['127.0.0.1', '169.254.1.2', '172.32.0.1', '8.8.8.8', '::1', 'not-an-ip']) assert.equal(isDockerPrivateIPv4(address), false);
});

test('validates both ports and pins the forwarding target to a private container IP', () => {
  assert.deepEqual(parseArgs(['54329', '172.20.0.4', '5432']), { localPort: 54329, targetIp: '172.20.0.4', targetPort: 5432 });
  for (const args of [
    ['80', '172.20.0.4', '5432'],
    ['54329', '127.0.0.1', '5432'],
    ['54329', '172.20.0.4', '0'],
    ['54329', '172.20.0.4', '5432', 'extra']
  ]) assert.throws(() => parseArgs(args));
});
