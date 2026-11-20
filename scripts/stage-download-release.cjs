const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Application version must be X.Y.Z.');
const sourceDir = path.join(root, 'dist', `release-candidate-${version}`);
const releaseDir = path.join(root, 'releases', `v${version}`);
const refreshLocalCandidate = process.argv.includes('--refresh-local-candidate');
if (refreshLocalCandidate && fs.existsSync(path.join(releaseDir, 'manifest.json'))) {
  const previous = JSON.parse(fs.readFileSync(path.join(releaseDir, 'manifest.json'), 'utf8'));
  if (previous.version !== version || previous.releaseStatus !== 'release-candidate-not-publicly-approved') {
    throw new Error('Only an unpublished release candidate of this version may be refreshed.');
  }
}
const sourceChecksums = new Map(fs.readFileSync(path.join(sourceDir, 'SHA256SUMS'), 'utf8').trim().split('\n').map((line) => {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  if (!match) throw new Error(`Invalid source checksum line: ${line}`);
  return [match[2], match[1]];
}));
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const plan = [
  { id: 'windows-nsis-x64', os: 'windows', architecture: 'x64', installerType: 'nsis', source: `VISTA-Lab-Station-${version}-rc-windows-x64-setup.exe`, relativePath: `windows/VISTA-Lab-Station-Setup-${version}-x64.exe` },
  { id: 'linux-appimage-x86_64', os: 'linux', architecture: 'x86_64', installerType: 'appimage', source: `VISTA-Lab-Station-${version}-rc-linux-x64.AppImage`, relativePath: `linux/VISTA-Lab-Station-${version}-x86_64.AppImage` },
  { id: 'linux-deb-amd64', os: 'linux', architecture: 'amd64', installerType: 'deb', source: `VISTA-Lab-Station-${version}-rc-linux-x64.deb`, relativePath: `linux/vista-lab-station_${version}_amd64.deb` }
];

fs.mkdirSync(releaseDir, { recursive: true });
const artifacts = plan.map(({ source, ...item }) => {
  const from = path.join(sourceDir, source);
  const to = path.join(releaseDir, item.relativePath);
  if (!fs.existsSync(from)) throw new Error(`Source installer missing: ${from}`);
  const sha256 = digest(from);
  if (sha256 !== sourceChecksums.get(source)) throw new Error(`Source installer checksum mismatch: ${source}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) {
    if (digest(to) !== sha256) {
      if (!refreshLocalCandidate) throw new Error(`Existing staged installer differs: ${to}`);
      fs.copyFileSync(from, to);
    }
  } else {
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
  }
  return { ...item, fileName: path.basename(item.relativePath), sizeBytes: fs.statSync(to).size, sha256, signed: false };
});

const releaseDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const manifest = {
  schemaVersion: 1,
  appName: pkg.build.productName,
  version,
  releaseDate,
  releaseStatus: 'release-candidate-not-publicly-approved',
  signingStatus: 'unsigned',
  supportedOS: ['windows', 'linux'],
  unavailableOS: ['macos'],
  artifacts
};
function writeImmutable(name, content) {
  const target = path.join(releaseDir, name);
  if (fs.existsSync(target)) {
    if (fs.readFileSync(target, 'utf8') !== content) {
      if (!refreshLocalCandidate) throw new Error(`Existing staged metadata differs: ${target}`);
      fs.writeFileSync(target, content);
    }
  } else {
    fs.writeFileSync(target, content, { flag: 'wx', mode: 0o644 });
  }
}
writeImmutable('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
writeImmutable('SHA256SUMS', artifacts.map((artifact) => `${artifact.sha256}  ${artifact.relativePath}`).join('\n') + '\n');
console.log(`Staged ${artifacts.length} verified installers in ${releaseDir}`);
