const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const cjsFiles = ['main.js', 'preload.js', 'api.js', 'scripts/start-electron.cjs', 'dev/server.mjs', 'dev/shim.js'];
for (const relative of cjsFiles) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  if (relative.endsWith('.mjs')) esbuild.transformSync(source, { loader: 'js', format: 'esm' });
  else new Function(source);
}
for (const relative of ['renderer/app.js', 'renderer/features.js', 'renderer/desktop-entry.js']) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  esbuild.transformSync(source, { loader: 'js', format: relative.endsWith('features.js') || relative.endsWith('desktop-entry.js') ? 'esm' : 'iife' });
}
console.log('JavaScript syntax checks passed. This project has no TypeScript source or TypeScript compiler.');
