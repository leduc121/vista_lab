const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');

const blocklyMedia = path.join(__dirname, '..', 'renderer', 'vendor', 'blockly', 'media');
fs.mkdirSync(blocklyMedia, { recursive: true });
for (const file of ['sprites.svg', 'handopen.cur', 'handclosed.cur', 'handdelete.cur']) {
  fs.copyFileSync(path.join(__dirname, '..', 'node_modules', 'blockly', 'media', file), path.join(blocklyMedia, file));
}
fs.copyFileSync(path.join(__dirname, '..', 'node_modules', 'blockly', 'LICENSE'), path.join(blocklyMedia, 'LICENSE'));

esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'renderer', 'desktop-entry.js')],
  outfile: path.join(__dirname, '..', 'renderer', 'app.bundle.js'),
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome130'],
  legalComments: 'none',
  logLevel: 'info'
});
