const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'phase6-candidate');
const extensions = new Set(['.AppImage', '.deb', '.exe', '.dmg']);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

const artifacts = walk(output).filter((file) => extensions.has(path.extname(file)));
if (!artifacts.length) {
  console.error(`No release installers found under ${output}`);
  process.exit(1);
}

const rows = artifacts.sort().map((file) => {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return `${digest}  ${path.relative(output, file).split(path.sep).join('/')}`;
});
fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${rows.join('\n')}\n`);
console.log(`Wrote SHA256SUMS for ${artifacts.length} installer(s).`);
