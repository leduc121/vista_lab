const { spawn } = require('node:child_process');

// Some developer environments export this Electron-only flag globally. If it
// reaches Electron's launcher, `require('electron')` returns no app APIs.
const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...env } = process.env;
const child = spawn(require('electron'), ['.'], { stdio: 'inherit', env });
child.on('error', (error) => { console.error(error); process.exitCode = 1; });
child.on('close', (code, signal) => {
  if (signal) process.exitCode = signal === 'SIGINT' ? 130 : 143;
  else process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { if (!child.killed) child.kill(signal); });
}
