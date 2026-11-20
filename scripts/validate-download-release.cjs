const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const releaseDir = path.join(root, 'releases', `v${version}`);
const manifest = JSON.parse(fs.readFileSync(path.join(releaseDir, 'manifest.json'), 'utf8'));
if (manifest.schemaVersion !== 1 || manifest.version !== version || manifest.appName !== 'VISTA Lab Station') throw new Error('Release metadata does not match the app.');
if (manifest.releaseStatus !== 'release-candidate-not-publicly-approved' || manifest.signingStatus !== 'unsigned') throw new Error('Release status is not accurate.');
if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.releaseDate)) throw new Error('Release date is invalid.');
if (JSON.stringify(manifest.supportedOS) !== JSON.stringify(['windows', 'linux']) || JSON.stringify(manifest.unavailableOS) !== JSON.stringify(['macos'])) throw new Error('Supported OS metadata is invalid.');
if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 3) throw new Error('Expected exactly three installers.');
const expected = [
  { path: `windows/VISTA-Lab-Station-Setup-${version}-x64.exe`, os: 'windows', architecture: 'x64', installerType: 'nsis' },
  { path: `linux/VISTA-Lab-Station-${version}-x86_64.AppImage`, os: 'linux', architecture: 'x86_64', installerType: 'appimage' },
  { path: `linux/vista-lab-station_${version}_amd64.deb`, os: 'linux', architecture: 'amd64', installerType: 'deb' }
];
const checksums = [];
for (const [index, artifact] of manifest.artifacts.entries()) {
  const expectedArtifact = expected[index];
  if (artifact.relativePath !== expectedArtifact.path || artifact.fileName !== path.basename(expectedArtifact.path) || artifact.os !== expectedArtifact.os || artifact.architecture !== expectedArtifact.architecture || artifact.installerType !== expectedArtifact.installerType || artifact.signed !== false) throw new Error(`Invalid artifact metadata at index ${index}.`);
  const file = path.join(releaseDir, artifact.relativePath);
  const bytes = fs.readFileSync(file);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== artifact.sizeBytes || sha256 !== artifact.sha256) throw new Error(`Artifact mismatch: ${artifact.relativePath}`);
  checksums.push(`${sha256}  ${artifact.relativePath}`);
}
if (fs.readFileSync(path.join(releaseDir, 'SHA256SUMS'), 'utf8') !== checksums.join('\n') + '\n') throw new Error('SHA256SUMS does not match manifest.');
const installerScript = fs.readFileSync(path.join(releaseDir, 'install-linux.sh'), 'utf8');
if (!fs.existsSync(path.join(releaseDir, 'README.md')) || !installerScript.includes(`VERSION='${version}'`)) throw new Error('Release documentation or script version is missing.');
for (const artifact of manifest.artifacts.filter((item) => item.os === 'linux')) {
  if (!installerScript.includes(artifact.fileName) || !installerScript.includes(artifact.sha256)) throw new Error(`Linux installer script does not pin ${artifact.fileName}.`);
}
console.log(`PASS: manifest, sizes, paths, and SHA-256 match all ${manifest.artifacts.length} release installers.`);
