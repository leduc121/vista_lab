# VISTA Lab Station 0.1.0 — release candidate

This candidate packages the Electron application with its local Edge runtime and SO-101 model assets. Installers are unsigned and macOS builds are not notarized. A successful build confirms artifact creation only; use the acceptance matrix in the release report before claiming install or runtime support.

## Supported build targets

| Platform | Artifact | Architecture | Current evidence |
| --- | --- | --- | --- |
| Windows | NSIS setup | x64 | CI build only; clean-machine install not verified |
| Linux | AppImage and Debian package | x64 | Native build and isolated launch checks on Linux x64 |
| macOS | DMG | arm64 | CI build only; install/launch not verified |
| macOS Intel | — | x64 | Not built: the pinned MuJoCo runtime dependency has no supported Intel macOS wheel |

The macOS hosted runner can build both architectures, but the packaged robotics runtime currently limits support to Apple Silicon. No signing identity or notarization credentials are configured. Do not treat these artifacts as trusted signed distribution packages.

## Install

### Windows

Run `VISTA Lab Station-<version>-x64-setup.exe`, choose an install location, and keep the user-data directory. The installer creates Start menu and desktop shortcuts. USB serial adapters may require the vendor driver; the arm appears as a COM port after the driver loads.

### Linux

For Debian/Ubuntu, install the `.deb` with the system package manager. For other compatible x64 distributions, mark the AppImage executable and launch it. If AppImage mounting is unavailable, use the AppImage runtime's extract-and-run option where supported. Serial access usually requires the user to belong to `dialout`; log out and back in after an administrator adds that group, or use the distribution's `uaccess` device policy. Do not run the desktop app as root to work around permissions.

### macOS

Open the arm64 DMG and move the application to Applications. This build is unsigned and not notarized, so macOS may block first launch. A signed/notarized release is required for normal consumer installation. USB serial devices appear as `/dev/cu.*`; allow macOS device access if prompted.

## First run and user data

Complete the in-app setup, choose simulation/mock mode unless a real device and valid calibration are available, then configure student/cloud access only with project-issued settings. The app does not bundle credentials, certificates, or private keys. Recordings and app settings are stored in Electron's per-user application data directory; calibration data follows the active adapter's configured storage. Updates and NSIS uninstall preserve user data. Back up recordings before manually deleting application data.

Physical motion requires an explicitly enabled hardware runtime, a detected device, valid calibration, and Safety Controller readiness. A mock or simulation session is not hardware acceptance.

## Troubleshooting

- **Runtime unavailable/crashes:** relaunch once, inspect Diagnostics, and include the sanitized runtime error with the OS/architecture. Reinstalling does not repair missing OS serial drivers.
- **Arm not listed:** reconnect the USB cable, check the adapter/COM or `/dev/cu.*` device, driver, and OS permissions. Never assign one port to multiple arms.
- **Calibration blocked:** confirm the selected device identity and follow the guided SO-101 range procedure; do not fabricate calibration values.
- **Cloud offline/unauthorized:** check student session, entitlement, endpoint, and project-provisioned certificate references. MQTT production dispatch is not enabled by this installer.
- **Linux AppImage fails to launch:** confirm x64 architecture and required desktop libraries; on systems without FUSE, use extract-and-run if supported.
- **macOS blocks launch:** this release is unsigned/not notarized. Do not bypass organization policy; use a signed release when available.

## Release artifact integrity

The build writes versioned installer files plus `SHA256SUMS` in `dist/phase6-candidate`. Verify checksums before distributing. These local/CI artifacts are candidates only; no public release or production upload is performed by this workflow.

## Phase 6 verification (2026-11-25)

| Check | Result |
| --- | --- |
| Linux x64 build | **BUILD VERIFIED** — AppImage and Debian package generated locally. |
| Debian payload | Extracted to a temporary root; package metadata, desktop entry, ASAR (`main.js`, renderer, `recording-manager.js`), runtime executable, SO-101 model resources, and checksums validated. This was not a system package-manager install. |
| Packaged application | **RUNTIME VERIFIED (simulation only)** — extracted Debian app opened in Xvfb, displayed the first-run login screen, started the bundled Edge process, and shut down with the runtime exiting code 0. Packaged Edge health/status/stop also returned successfully and identified `SIMULATION`. |
| Windows x64 / macOS arm64 | Not built in this local run. The workflow is configured to produce NSIS and DMG artifacts; those results require a new CI run for this revision. |
| Login, physical device, calibration, teleoperation, recording/replay | Not exercised in this packaged first-run smoke. No student credentials or hardware were used. |
| Cloud/WF03/physical acceptance | Not performed by packaging. See the existing acceptance report for backend evidence and its cloud/evidence and hardware blockers. |

Candidate files: `VISTA Lab Station-0.1.0-x86_64.AppImage` and `VISTA Lab Station-0.1.0-amd64.deb`. Their SHA-256 values are recorded in `dist/phase6-candidate/SHA256SUMS`. The actual first-launch screenshot is `dist/phase6-candidate/linux-first-launch.png`.
