# Queue 3 packaging report — 2026-11-20

Historical Queue 3 artifact record. Queue 5 rebuilt and replaced the private release candidate after a session-storage fix; current artifact hashes and sizes are in `TEST_REPORT.md` and `releases/v0.1.0/manifest.json`.

Status: **RELEASE CANDIDATE / NOT YET PUBLICLY APPROVED**. Local acceptance artifacts only. Nothing was uploaded, published, installed system-wide, or deployed.

## Exact installers

All paths are relative to the Desktop workspace root. SHA-256 values are also in `dist/release-candidate-0.1.0/SHA256SUMS`.

| Platform | Artifact | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Linux x64 AppImage | `dist/release-candidate-0.1.0/VISTA-Lab-Station-0.1.0-rc-linux-x64.AppImage` | 142416082 | `122f5fb3a265be4b6b18e1b97fd5b9760136e55562d33a843e9e2c0a10d9f7da` |
| Ubuntu/Debian x64 | `dist/release-candidate-0.1.0/VISTA-Lab-Station-0.1.0-rc-linux-x64.deb` | 106286200 | `8c9c0f62254fc76784ed8aeca3979bb79f7c79b0d9a0bea9f542f2c1abb1dff8` |
| Windows x64 NSIS | `dist/release-candidate-0.1.0/VISTA-Lab-Station-0.1.0-rc-windows-x64-setup.exe` | 113971195 | `130ffbbdd2337027c8a6a589acc72df2f29b427e7ee76ba33dc37a9c63e686bf` |

Application version is `0.1.0`, product name `VISTA Lab Station`, app ID `edu.vista.labstation`. A new local VISTA monogram icon in `build/icon.svg` is rendered to the Linux PNG and Windows ICO. The DEB metadata reports package `vista-lab-station`, version `0.1.0`, architecture `amd64`, Education category, VISTA Education maintainer, and the Electron Builder GTK/NSS/desktop dependencies. Its license field is `unknown` because application and SO-101 asset redistribution rights have not been established; this is a release blocker, not a claim of permission.

## Validation performed

- `npm test`: 17/17 pass, including API URL rejection for lookalike loopback hosts and embedded credentials.
- `npm run typecheck`: JavaScript syntax checks pass. There is no TypeScript source/compiler in this project.
- `npm run smoke`: renderer smoke passes with local Demo fixtures when Chrome runs outside the execution sandbox. The first run inside the execution sandbox could not start Chrome because Crashpad's socket call returned `EPERM`; this did not affect the packaged Electron sandbox checks.
- `sha256sum -c SHA256SUMS`: all three installers pass.
- AppImage directly mounted and opened a `VISTA Lab Station` window under Xvfb. The extracted AppImage opened as well. The DEB payload was extracted with `dpkg-deb -x` and opened the same window. Both final Linux launches used Demo mode, a temporary profile, and the Electron sandbox; neither used `--no-sandbox`. The DEB was not installed into the host package database.
- NSIS installer and its nested `app-64.7z` each passed `7z t`. The extracted Windows app ASAR and the DEB, AppImage, and unpacked app ASAR all had SHA-256 `cc6352684765de5a6899b2ebed4c02545313966cea107f0e6cee2b49eb7da028`.
- The final ASAR includes the main process, preload, renderer bundle, and SO-101 assets. It excludes design review screenshots, tests, documentation, vendored source packages, Electron Builder, and Puppeteer. A targeted scan of packaged runtime source found no private key block, service-role marker, live-key marker, JWT-shaped token, hardcoded Production API address, fixed local API port, or `--no-sandbox` flag. The Electron window retains `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, restricted navigation, and validated IPC.
- The Education API must be supplied through `VISTA_EDUCATION_API` and end in `/api/v1`; no Production fallback is bundled. Matching public Supabase project URL and anon key are supplied at runtime for refresh/logout. Remote API/Supabase URLs require HTTPS, and Twin requires `wss://`; local loopback development endpoints are explicitly restricted. No test credentials are bundled.

## Limits and release blockers

- **Windows runtime:** no actual Windows host or VM was available. Wine was used by Electron Builder to generate the NSIS uninstaller; this is not Windows install or runtime acceptance. Follow `docs/desktop/WINDOWS_ACCEPTANCE.md` on a clean Windows x64 VM.
- **Signing:** NSIS and Linux artifacts are unsigned. Electron Builder logged that Windows signing was skipped because no signing information was configured.
- **Asset rights:** `renderer/assets/SO-Arm101.glb` has no verified author/source/license. The URDF and 13 STL meshes match the LeLab reference hashes, but the CAD subtree's redistribution terms still need confirmation. See `docs/desktop/ASSET_PROVENANCE.md`. Do not distribute these installers publicly until the asset owner confirms rights and required attribution/notices.
- **Live integration:** these package checks used Demo mode. Queue 2's isolated Education API database schema mismatch blocked live student journey acceptance. Do not infer Production readiness from Linux window startup.

## Runtime configuration example

Supply environment variables to the app process from an operator-managed launcher, with a matching isolated or approved backend environment:

```sh
VISTA_EDUCATION_API=https://education.example.edu/api/v1 \
VISTA_SUPABASE_URL=https://project-ref.supabase.co \
VISTA_SUPABASE_ANON_KEY='<public-anon-key>' \
VISTA_TWIN_WS_URL=wss://twin.example.edu/ws/twin \
./VISTA-Lab-Station-0.1.0-rc-linux-x64.AppImage
```

Do not put service-role keys, student passwords, refresh tokens, or Twin viewer tokens in launch scripts or installer assets. Keep physical robot control disabled.
