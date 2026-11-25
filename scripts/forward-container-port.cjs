#!/usr/bin/env node
'use strict';

const net = require('node:net');

function isDockerPrivateIPv4(value) {
  if (net.isIP(value) !== 4) return false;
  const octets = value.split('.').map(Number);
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

function parseArgs(args) {
  if (args.length !== 3) throw new Error('Usage: forward-container-port.cjs <loopback-port> <Docker-private-IPv4> <container-port>');
  const [localPort, targetIp, targetPort] = args.map((value) => String(value));
  if (!/^\d+$/.test(localPort) || Number(localPort) < 1024 || Number(localPort) > 65535) throw new Error('Local port must be in 1024..65535.');
  if (!isDockerPrivateIPv4(targetIp)) throw new Error('Target must be a private Docker IPv4 address.');
  if (!/^\d+$/.test(targetPort) || Number(targetPort) < 1 || Number(targetPort) > 65535) throw new Error('Container port must be in 1..65535.');
  return { localPort: Number(localPort), targetIp, targetPort: Number(targetPort) };
}

function startForwarder(options) {
  const { localPort, targetIp, targetPort } = options;
  const server = net.createServer((client) => {
    const upstream = net.connect({ host: targetIp, port: targetPort });
    client.setNoDelay(true);
    upstream.setNoDelay(true);
    client.pipe(upstream);
    upstream.pipe(client);
    const closeBoth = () => { client.destroy(); upstream.destroy(); };
    client.on('error', closeBoth);
    upstream.on('error', closeBoth);
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
  });
  server.on('error', (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
  server.listen(localPort, '127.0.0.1', () => {
    process.stdout.write(`READY 127.0.0.1:${localPort} -> ${targetIp}:${targetPort}\n`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return server;
}

if (require.main === module) {
  try { startForwarder(parseArgs(process.argv.slice(2))); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}

module.exports = { isDockerPrivateIPv4, parseArgs, startForwarder };
