const path = require('node:path');
const esbuild = require('esbuild');

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
