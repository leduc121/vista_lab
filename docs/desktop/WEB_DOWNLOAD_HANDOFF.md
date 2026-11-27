# VISTA Lab Station static downloads — Web handoff

Prepared 2026-11-20 for Claude. **No Web LMS code or hosting configuration was changed.** The complete local staging tree is `releases/v0.1.0/`. It can later be copied as a directory below an approved static `/downloads/` root. Do not publish it yet: `releaseStatus` is `release-candidate-not-publicly-approved`, the artifacts are unsigned, Windows runtime acceptance is pending, and SO-101 asset redistribution rights are unresolved.

## Current Desktop release handoff — 2026-11-27

This file's `v0.1.0` staging details are historical. PR #7 merged as `4906fee`; PR #8 contains the docs reconciliation and is open with CI green. Ubuntu-only workflow 45916626947 successfully built from `e51a908e73a1c176396ad87b6696ca05af8406ed` and uploaded private artifact `vista-desktop-ubuntu-x64` (ID `15162896520`, 133,172,802-byte archive, digest `sha256:7a1fbfa716c01e6c0f53d4c51879eda16601865409afdac23ed9f4d208a276bf`). The archive download stalled before transferring bytes; the inner DEB SHA, metadata, launcher/startup, SBOM and notice contents are not verified. Do not use the stale local `0.1.1` build, publish, or overwrite `v0.1.0`. Retrieve and verify the existing private artifact before distribution; see [Release Readiness](RELEASE_READINESS.md). Keep Windows/macOS marked Coming Soon.

**Sprint update:** the staged `v0.1.0` files are the prior build and do not include the Python Edge Runtime or setup wizard. Their checksums do not cover the current source. A new private stage must wait for successful native runtime builds and refreshed installers.

Queue 5 refreshed the private candidate after a Linux token-persistence security fix. The current `manifest.json`, `SHA256SUMS`, installer script pins, and three files now match; `node scripts/validate-download-release.cjs` and all three SHA-256 checks pass. Use only the current staging manifest, not historical Queue 3 hashes. See `TEST_REPORT.md` and `RELEASE_CHECKLIST.md` for remaining live API, Windows, asset-rights, and approval gates. No public download URL has been selected.

## Directory and manifest contract

```text
releases/v0.1.0/
├── windows/VISTA-Lab-Station-Setup-0.1.0-x64.exe
├── linux/VISTA-Lab-Station-0.1.0-x86_64.AppImage
├── linux/vista-lab-station_0.1.0_amd64.deb
├── SHA256SUMS
├── manifest.json
├── install-linux.sh
└── README.md
```

`manifest.json` is UTF-8 JSON, `schemaVersion: 1`. Required top-level fields are `appName` (string), `version` (semantic X.Y.Z), `releaseDate` (YYYY-MM-DD), `releaseStatus` (currently `release-candidate-not-publicly-approved`), `signingStatus` (currently `unsigned`), `supportedOS` (array), `unavailableOS` (array), and `artifacts` (array). Each artifact has `id`, `os`, `architecture`, `installerType`, `relativePath`, `fileName`, `sizeBytes`, `sha256`, and `signed`. `relativePath` is relative to the version directory, without a leading slash or `..`. `SHA256SUMS` uses standard `hash  relative/path` lines in manifest order. The stage generator derives version from `package.json`, verifies the Queue 3 source hashes, and refuses to replace a differing file.

Current artifact IDs: `windows-nsis-x64`, `linux-appimage-x86_64`, `linux-deb-amd64`. Supported platforms are Windows x64 and Linux x86_64/amd64. **macOS is unavailable** until an installer is built and tested; do not show a macOS download link.

## Web integration

Deployment configuration must supply an **approved HTTPS downloads root** and a release version. Do not embed an assumed public host or use the Education API to serve installers. The Web page can fetch one static manifest and render anchors from its relative paths. Example browser logic:

```js
// Supplied by reviewed Web deployment configuration, not by this Desktop repo.
const { approvedDownloadsRoot, releaseVersion } = downloadConfig;
if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) throw new Error('Invalid configured release version');
const root = new URL(approvedDownloadsRoot.endsWith('/')
  ? approvedDownloadsRoot : `${approvedDownloadsRoot}/`);
if (root.protocol !== 'https:' || root.username || root.password || root.search || root.hash) throw new Error('Invalid downloads root');
const releaseRoot = new URL(`v${releaseVersion}/`, root);
const response = await fetch(new URL('manifest.json', releaseRoot), { cache: 'no-store' });
if (!response.ok) throw new Error('Release manifest unavailable');
const manifest = await response.json();
if (manifest.schemaVersion !== 1 || manifest.version !== releaseVersion) throw new Error('Release metadata mismatch');

// Until approval, show a release-pending notice; do not enable downloads.
const approved = manifest.releaseStatus === 'approved';
document.querySelector('[data-release-version]').textContent = `Version ${manifest.version}`;
const slots = new Map([
  ['windows-nsis-x64', document.querySelector('[data-download-slot="windows-nsis-x64"]')],
  ['linux-appimage-x86_64', document.querySelector('[data-download-slot="linux-appimage-x86_64"]')],
  ['linux-deb-amd64', document.querySelector('[data-download-slot="linux-deb-amd64"]')]
]);
function showArtifact(artifact, href) {
  const slot = slots.get(artifact.id);
  if (!slot) return;
  const checksum = document.createElement('code');
  checksum.textContent = `SHA-256 ${artifact.sha256}`;
  if (!approved) {
    const pending = document.createElement('span');
    pending.textContent = `${artifact.installerType.toUpperCase()} · release pending approval`;
    slot.replaceChildren(pending, checksum);
    return;
  }
  const link = document.createElement('a');
  link.href = href;
  link.textContent = `Download ${artifact.os} ${artifact.installerType.toUpperCase()}`;
  link.setAttribute('aria-label', `Download VISTA Lab Station ${manifest.version} for ${artifact.os}, ${artifact.installerType}, ${artifact.architecture}`);
  const size = document.createElement('span');
  size.textContent = `${(artifact.sizeBytes / 1048576).toFixed(1)} MiB`;
  slot.replaceChildren(link, size, checksum);
}
for (const artifact of manifest.artifacts) {
  if (!/^(windows|linux)\/[A-Za-z0-9._-]+$/.test(artifact.relativePath)) continue;
  const href = new URL(artifact.relativePath, releaseRoot);
  if (href.origin !== releaseRoot.origin || !href.pathname.startsWith(releaseRoot.pathname)) continue;
  showArtifact(artifact, href.href);
}
```

The Web page supplies elements with `data-release-version` and one `data-download-slot` for each of the three IDs above. Place the slots in semantic Windows and Linux sections. Keep a separate macOS section with text saying no installer is available. The example uses native anchors and `textContent`; add a visible focus style and a checksum copy action only if it has an accessible label and confirmation.

The release owner must review Windows runtime results, asset rights, installer signing, and final hashes before changing status to `approved`. If signing changes installer bytes, update the manifest, `SHA256SUMS`, user instructions, and checksums together **before first publication**. Treat a published version directory as immutable; use a new version directory for subsequent binary changes.

## Download-area design direction

Use the established VISTA dark minimalist layout and accent color. A three-column desktop arrangement or keyboard-accessible platform tabs can group **Windows**, **Linux**, and **macOS**. On narrow screens, stack the groups. Show the app name and manifest version prominently. Windows gets one primary accent-colored NSIS link; Linux gets a primary AppImage link with DEB as a secondary build option. Show the exact size and a copyable SHA-256 near each available build. macOS should say **Unavailable — installer not built or tested** without a disabled fake download button.

Use semantic headings and native anchors for downloads; links must work with keyboard and screen readers, show visible focus, and have accessible names including platform, build type, and version. OS detection may preselect a group but must never hide other platforms or force a redirect. Respect reduced-motion preferences. If manifest fetch fails, show a retry action and no guessed URLs. If the manifest is a release candidate, display status and checksums but no public download calls to action.

## Future static-hosting plan

1. Complete Windows install/runtime testing on an actual Windows x64 system; confirm SO-101 GLB/STL redistribution permissions and required notices; choose signing policy; rerun package integrity and checksum validation. Keep this staging private until approved.
2. Select a reviewed static hosting root and map the **contents** of `releases/` so `v0.1.0/manifest.json` would be reachable under a future `/downloads/v0.1.0/manifest.json` path. No backend endpoint is required. Do not invent or publish a URL before the hosting owner approves it.
3. Apply metadata by file type. Use `application/json; charset=utf-8` for `manifest.json`; `text/plain; charset=utf-8` for `SHA256SUMS`, `README.md`, and `install-linux.sh`; `application/octet-stream` for AppImage and EXE; `application/vnd.debian.binary-package` or `application/octet-stream` for DEB. Use `Content-Disposition: attachment; filename="<exact artifact filename>"` for installers, and normally for the shell script. Keep the JSON manifest readable as JSON. Preserve exact `Content-Length` and allow byte ranges for large installers where the host supports them; do not transform or recompress binary downloads.
4. Before approval, use private staging and `Cache-Control: no-store`. After approval, versioned binary paths may use `public, max-age=31536000, immutable` because the bytes and filenames must then stay fixed. A mutable release pointer or landing-page configuration should use a short TTL or revalidation. The versioned manifest can be cached longer only after publication is final; keep its status and hashes synchronized with the binaries. Avoid caching a failed or premature release-candidate manifest on the public site.
5. If the manifest is served from a different origin than the homepage, permit the approved homepage origin to fetch JSON with appropriate CORS. Browser download anchors do not require manifest API credentials. Review the Web CSP `connect-src` for the approved manifest origin. Serve over HTTPS and validate the deployed files against `SHA256SUMS` after transfer.

## Local verification / acceptance checklist

From the Desktop workspace:

```sh
node scripts/validate-download-release.cjs
(cd releases/v0.1.0 && sha256sum -c SHA256SUMS)
sh -n releases/v0.1.0/install-linux.sh
sh releases/v0.1.0/install-linux.sh --appimage --source-dir releases/v0.1.0 --verify-only
sh releases/v0.1.0/install-linux.sh --deb --source-dir releases/v0.1.0 --verify-only
```

A Web acceptance pass should verify: manifest status handling; version display; exact three links after approval; no macOS link; copyable hashes; keyboard/focus behavior; mobile layout; broken-manifest retry; no hardcoded Production or unapproved download origin; and deployed checksums matching the local manifest.

Local validation on 2026-11-20: `stage-download-release.cjs` and `validate-download-release.cjs` passed; `sha256sum -c` passed all three current installers; `sh -n` and `--help` passed; both Linux `--verify-only --source-dir` modes passed; a corrupt AppImage was rejected with a checksum mismatch; an HTTP base URL was rejected; and AppImage installation succeeded in an isolated `/tmp` user data directory without sudo, with the expected hash and executable mode. Queue 5 retested the rebuilt AppImage direct launch and extracted DEB payload under Xvfb with Electron sandbox enabled. DEB system installation and remote download were intentionally not performed. Windows runtime and public deployment remain unverified.

The public homepage was not changed in this task. The requested visual direction above is from the Desktop release brief; live homepage inspection was unavailable in this environment.
