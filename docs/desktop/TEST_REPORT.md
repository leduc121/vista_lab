# Queue 5 final Desktop acceptance — 2026-11-20

Backend contracts were read only from the latest available backend sprint source. No backend writes, Production/AWS calls, upload, or physical robot access occurred. **Local release candidate only; live integration and public release are not accepted.** Earlier Queue 1–4 reports are historical; the hashes and results below supersede earlier package hashes.

## Feature matrix

| Area | Status | Evidence and limit |
| --- | --- | --- |
| Login, temporary password, refresh/rotation, logout | IMPLEMENTED BUT NOT LIVE-VERIFIED | Source-verified Education API/Supabase flow; contract tests pass; no isolated live identity provider available. |
| Student dashboard, assigned courses/progress/results | IMPLEMENTED BUT NOT LIVE-VERIFIED | Reads `/me/learning`; Demo smoke covers navigation; real assigned data not exercised. |
| Assignment detail, attempt start/resume, permissions/deadlines, results/feedback | IMPLEMENTED BUT NOT LIVE-VERIFIED | Reads scoped routes and renders server fields when present; no real student fixture. |
| Blockly toolbox, draft, save, versions, local restore, validation, submit/read-only | IMPLEMENTED BUT NOT LIVE-VERIFIED | Demo UI smoke and API contract tests pass; real server mutation/feedback pending. |
| Schematic server execution | IMPLEMENTED BUT NOT LIVE-VERIFIED | Client creates/runs/polls verified schematic routes; no terminal result from a live service. |
| Local SO-101 preview and camera reset | COMPLETE AND VERIFIED | Demo renderer smoke; explicitly labeled simulated/local preview, never MuJoCo. |
| Attempt-bound read-only Digital Twin | IMPLEMENTED BUT NOT LIVE-VERIFIED | Scope route, URL/frame validation, stale/disconnect handling, IPC tests; live WSS telemetry pending. |
| Immediate Twin socket revocation on submission/allocation loss | BLOCKED BY BACKEND | Education API must call Twin `/internal/revoke-attempt`; broker contract already exists. |
| Settings, secure navigation/IPC, storage guard | COMPLETE AND VERIFIED locally | UI smoke, 19 contract/security tests, packaged ASAR inspection. |
| Offline/error/retry behavior | IMPLEMENTED BUT NOT LIVE-VERIFIED | Local behavior is covered by contract/UI tests; real network-loss recovery needs isolated acceptance. |
| Linux AppImage and DEB packaging | COMPLETE AND VERIFIED locally | Builds, hashes, AppImage launch, extracted DEB launch; target system DEB install remains unverified. |
| Windows NSIS package | BLOCKED BY PLATFORM for runtime acceptance | Build and archive integrity pass on Linux; no actual Windows x64 install/launch test. |
| Static download staging | COMPLETE AND VERIFIED locally | Three artifacts, manifest, script pinning, sizes, hashes match. Public hosting remains unapproved. |
| Physical robot motion | INCOMPLETE by deliberate safety policy | No renderer mutation API or hardware access; enabling it is outside this release candidate. |
| Public release | INCOMPLETE | Live API acceptance, Windows runtime, asset rights, and release approval/signing policy remain open. |

## Sequential checks on final source and artifacts

- `npm test`: **19 passed, 0 failed**; includes rejection of Linux Electron `basic_text` token persistence and malformed Twin joint frames.
- `npm run typecheck`: **passed JavaScript syntax checks**; no TypeScript source/compiler is configured.
- `npm run smoke`: **passed** outside the execution sandbox. Initial in-sandbox Chrome run failed at Crashpad socket `EPERM`; no Electron security setting was changed. Demo renderer screenshot output: `/tmp/vista-desktop-smoke`.
- `npm run test:integration`: **not run**. No valid `VISTA_TEST_*` isolated API/Supabase/disposable-account environment exists. Queue 2's guarded local PostgreSQL bootstrap fingerprint did not match its pin, so no GoTrue/API/Twin stack was started. No real API pass is claimed.
- `npm run dist`: **passed**, AppImage and DEB. `npm run dist:win`: **passed** outside the execution sandbox; initial Wine integrity step inside the sandbox could not create `/run/user/1000/wine`.
- Rebuilt unpacked Linux Electron, staged AppImage direct launch, and extracted staged DEB payload each opened a VISTA window under Xvfb with `sandbox: true` and no `--no-sandbox`. This was a launch check in Demo mode, not a full student journey. The DEB was not installed system-wide. `7z t` on the staged NSIS returned success; Windows runtime remains untested.
- `node scripts/validate-download-release.cjs`: **passed** all three manifest paths, sizes, checksums, and Linux script pins. `sha256sum -c SHA256SUMS`: **3/3 OK**. Linux script `--verify-only` passed for AppImage and DEB.
- Linux, Windows, and extracted DEB `app.asar` hashes match: `6ae1cd623918bf741e8d67abd75b88677535a63e8c42e62311cc0ee192936163`. Packaged source checks confirmed Electron sandbox/isolation, trusted-frame IPC, restricted navigation, no physical mutation methods, and no default Production API. A targeted private-key/service-role/JWT pattern scan of 367 packaged text files on the final build found **0 hits**. This is a pattern check, not a comprehensive secret audit.

## Current private release artifacts

| Installer | Staged path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Windows x64 NSIS | `releases/v0.1.0/windows/VISTA-Lab-Station-Setup-0.1.0-x64.exe` | 113976416 | `2a58cbab62f9ca5b903c68ddfe0d7266194ae52e7fe4afca8ff30ab107f3818b` |
| Linux x64 AppImage | `releases/v0.1.0/linux/VISTA-Lab-Station-0.1.0-x86_64.AppImage` | 142416142 | `03dbdcd1da546915f4c43ed5fc5f629349d24bdcaa2f5fb00db965f547580763` |
| Ubuntu/Debian amd64 | `releases/v0.1.0/linux/vista-lab-station_0.1.0_amd64.deb` | 106264490 | `548cced6ddd16f18917b97d370e02d9026bee0c888d6615c823b9b8d07b4fef8` |

Manifest: `releases/v0.1.0/manifest.json`; checksums: `releases/v0.1.0/SHA256SUMS`. All artifacts are unsigned and marked **release-candidate-not-publicly-approved**. macOS is unavailable. Do not distribute publicly until the gates in `RELEASE_CHECKLIST.md` are cleared.

## Edge completion sprint update — 2026-11-20

The artifact hashes above describe the prior build. Those installers do **not**
contain the new Python Edge Runtime or setup wizard; they were not replaced in
this sprint.

- `npm test`: **28 Node tests passed** across API contracts, simulation runtime,
  supervisor, and provisioning. `python3 -m unittest discover -s edge/tests -v`:
  **10 Python tests passed**, including fake MQTT and physical adapters. No serial
  device or physical robot was opened.
- `npm run typecheck` and `npm run build:renderer`: **passed**. Setup stylesheet
  lint reported zero failures.
- Edge supervisor → Python runtime → simulated joint telemetry: **verified
  locally**. Packaged-runtime absence is tested as `BLOCKED`.
- MQTT/TLS and enrollment-key behavior: **tested with fakes only**. No local
  broker, real OS secure-storage test, certificate, backend, or AWS IoT was used.
- `npm run smoke`: **blocked in sandbox** at Chromium Crashpad
  `setsockopt: Operation not permitted`; the new wizard was not visually
  inspected in a real Electron window.
- `npm run test:integration`: **not run**; isolated API/Supabase and disposable
  student variables are absent.
- `npm run dist`: **blocked** because PyInstaller is not installed. No updated
  installer or bundled Edge executable was produced. Windows and macOS native
  CI was added but has not run. Existing staged hashes cover the old contents.
- MuJoCo model integration, local broker acceptance, live provisioning, real
  hardware telemetry, and Electron→MuJoCo→MQTT→Twin acceptance remain
  incomplete. No AWS or physical hardware was accessed.

## GitHub source preparation — 2026-11-20

- The public `leduc121/vista_lab` repository was confirmed empty (no branches,
  commits, or files) through GitHub's read-only API and public Git refs.
- `.gitignore` excludes credentials, private keys, local identity/calibration
  state, Python caches/environments, dependency/build output, installers,
  release artifacts, local tooling, and the copied CHECKIK checkout.
- The SO-101 GLB, URDF, and STL assets are excluded because their redistribution
  terms remain unresolved; source references remain, so the 3D Twin model will
  be unavailable in a clean clone until rights-cleared assets are supplied.
- GitHub CLI authentication is currently invalid. Push verification cannot be
  completed until GitHub authentication is restored; no token was exposed or
  written to the project.

## Completion sprint verification update — 2026-11-20

This section supersedes conflicting older statements above; earlier release
artifact checksums still describe prior builds, not the new ignored local
artifacts.

- `npm test`: 19 API and UI/runtime contract tests plus 3 Node test files passed
  when run with the built Edge runtime selected. `npm run typecheck` passed.
- Python 3.11 `edge/tests`: 15 tests passed, including MuJoCo simulation, runtime
  protocol, fake MQTT validation, authorization, cancellation, and no-motion
  checks.
- `npm run build:renderer` passed. Local browser screenshot review rendered the
  Blockly editor and SO-101 URDF/STL viewer at 1420×960. The complete
  `npm run smoke` did not complete its navigation suite and is not claimed as
  passed.
- The native Linux x64 PyInstaller executable started and loaded the bundled
  model. `npm run dist` produced a new AppImage; `npx electron-builder --linux
  deb` produced a DEB. The artifacts remain ignored local build outputs and
  were not installed or distributed. No clean-machine installation check was
  performed.
- Real local MQTT TLS integration against a temporary loopback Mosquitto broker
  passed one authorized command/ACK plus telemetry publish/receive flow.
  Backend provisioning and MQTT-to-Twin end-to-end integration remain
  incomplete.
- No isolated Education API, GoTrue/Supabase test identities, or device
  enrollment/certificate contract were available. Live backend login,
  submission persistence, revocation, and real provisioned MQTT were not
  verified. No AWS endpoint or physical robot was accessed.
- Windows NSIS and macOS DMG were not rebuilt or tested on their native
  runners. The existing Windows artifact remains stale relative to this source.

## Final integration and release acceptance attempt — 2026-11-20

This is the latest acceptance record and supersedes earlier smoke/package
statements above where results differ.

- `npm test`: 19 API/security contract tests and 3 Node test files passed;
  `edge/tests`: 15 Python tests passed; `npm run typecheck` passed.
- A test-only mTLS session against a disposable real loopback Mosquitto 2
  broker passed: one authorized lab command executed in MuJoCo, emitted 11
  six-joint SIMULATION telemetry frames over MQTT, and returned an accepted
  result ACK. This is transport/runtime integration only; it does not represent
  Education API authorization, backend provisioning, or an authorized Digital
  Twin session. The test first exposed and fixed a mismatch accepting `arm` on
  a gripper command.
- Fresh Linux x64 AppImage and DEB were rebuilt from current source. The DEB
  payload was extracted under `/tmp` (not system-installed); Electron `ldd`
  showed no missing shared libraries, and its bundled Edge Runtime loaded the
  packaged MuJoCo model and completed a simulation producing 11 six-joint
  frames with `motionEnabled=false`. The AppImage artifact was built but its
  GUI launch was not accepted. This was an extracted-package check on the same
  Linux host, not a different clean OS image or an installed DEB test.
- Latest AppImage SHA-256: `506bc130895f8e0c11fd4f1307fc4cd434e108e22ce7e8bb113d967116a356fe`.
  Latest DEB SHA-256: `e34bec3180d241887af8412b27e86ec839d2c1b53c870f1c0e3c06943a588a38`.
- Renderer smoke opened My Labs and the Blockly/MuJoCo workspace at 1420×960
  and printed a non-overflowing two-column workspace layout. The test then hung
  after workspace inspection before the Save interaction; it was interrupted.
  Full UI acceptance, all listed major screens, accessibility and responsive
  layout are therefore **not accepted**. Settings and Twin visual evidence from
  prior partial screenshots does not establish the complete screen journey.
- `npm run test:integration` stopped at the harness guard because there is no
  isolated Education API, disposable student accounts, or test attempt. Local
  GoTrue health was available, but Education API `127.0.0.1:3001` and Twin
  `127.0.0.1:8767` were unavailable. No live login, attempts, program writes,
  simulation result retrieval/submission/revocation, or Twin authorization was
  accepted.
- The inspected backend has no `/desktop/devices/enroll`,
  `/desktop/devices/{id}/certificate/renew`, `/desktop/devices/{id}/revoke`,
  or `/desktop/devices/{id}` API. It also lacks a student-authorized local
  MuJoCo telemetry bridge; `/internal/simulation-telemetry` is server-only.
  See `BACKEND_HANDOFF.md` for proposed contracts and safety boundary.
- CHECKIK's active LeRobot environment reports `lerobot==0.6.2` and
  `feetech-servo-sdk==1.0.0` under Python 3.12. The shipped Edge Runtime is
  Python 3.11 and reports LeRobot unavailable; those packages were not added to
  the installer because the CHECKIK environment is not a verified portable
  dependency lock for the three target OSes. The SO-101 adapter remains
  optional/read-only. Port enumeration, robot connection, calibration checks,
  and any live diagnostics require a separate supervised hardware session; no
  physical device was opened.
- Windows and macOS native builds were not run on CI runners in this session.
  Existing Windows output is stale relative to current source; macOS DMG is
  unavailable. No platform acceptance is claimed for either.
- No AWS call, backend mutation, hardware connection, or release distribution
  occurred.
