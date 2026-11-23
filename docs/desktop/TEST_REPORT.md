# Queue 5 final Desktop acceptance — 2026-11-20

## Current completion verification — 2026-11-23

This update supersedes earlier status statements below where they conflict. The
complete current matrix and blockers are in
[`../DESKTOP_FULL_ACCEPTANCE.md`](../DESKTOP_FULL_ACCEPTANCE.md).

- `npm test`: **39 passed, 0 failed**.
- `edge/.venv/bin/python -m unittest discover -s edge/tests -v`:
  **51 passed, 0 failed, 1 skipped** on Linux, including MuJoCo and fake-only
  teleoperation. The Windows-only ACL fail-closed test is platform-skipped.
- `npm run typecheck`, `npm run build:renderer`, `npm run smoke`, and
  `npm run smoke:electron`: **passed**. UI smokes use Demo fixtures and fake
  devices; they do not represent backend persistence or physical operation.
- `scripts/run-isolated-lms-e2e.sh`: **passed, exit 0** against a uniquely
  labeled disposable Education API/GoTrue/PostgreSQL stack. The events route,
  schematic result, submission and independent database readback passed.
  Temporary-password and live Twin suites were skipped without test-owned
  credentials/endpoints. Private evidence is at
  `/tmp/vista-lms-ae9693dc-evidence`.
- `VISTA_EDGE_PYTHON=edge/.venv/bin/python npm run dist`: **passed** for Linux
  x64 AppImage and DEB. The Linux Edge runtime bundle explicitly includes
  `OpenGL.platform.egl`; without it the packaged simulator was unavailable
  under the Electron `MUJOCO_GL=egl` environment.
- Packaged Linux Electron opened under Xvfb with sandbox enabled. The Edge
  executable in `dist/linux-unpacked/resources` loaded the packaged SO-101
  scene with EGL and returned safe shutdown. AppImage extract-and-run also
  showed its window; host has no FUSE device. Clean-machine install and target
  platform camera rendering remain unverified.
- No Windows/macOS build, real Twin session, evidence-storage service,
  physical hardware session, Production/AWS access, publication, or merge was
  performed.
- Follow-up CI review found a stale npm lockfile, Windows POSIX-mode
  assumptions in MQTT fakes, and unsupported MuJoCo Intel Mac source builds.
  The lockfile is synchronized without changing existing locked versions;
  Windows MQTT now fails closed pending ACL validation; the native matrix uses
  Apple Silicon macOS. The corrected matrix is awaiting completion.

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

## Final integration continuation — 2026-11-20

This entry supersedes the earlier smoke and Twin dependency statements above.

### UI smoke hang

- **PASS — Chromium Demo UI:** `timeout 75s npm run smoke` completed. It exercised My Labs, workspace navigation/layout, Save, version creation, Demo schematic result, submit state, Twin navigation and assignment, URDF/STL model load, and Settings layout. Screenshots are in `/tmp/vista-desktop-smoke`.
- Save/version/simulation/submission evidence is **Demo fixture only**. No attempt, program, experiment or result was written to Education API in this smoke.
- The hang was caused by eagerly mounting a second Three.js SO-101 viewer in Blockly even when no local MuJoCo run had started. The page kept a WebGL render loop active; opening the dedicated Twin screen then initialized another renderer and headless SwiftShader stopped servicing browser work. Workspace navigation also previously left a pending viewer load without a cancellation handle. The workspace viewer now mounts only when local MuJoCo is requested, and both workspace and Twin views cancel pending loads and dispose renderers on navigation.
- The smoke captures HTTP failures and renderer errors, ignoring only Chrome's default `/favicon.ico` probe from the development preview. It verifies the workspace viewer is lazy and that the separate Twin screen loads its URDF/STL. This is Chromium UI acceptance, **not native Electron acceptance**.

### Local Twin service and protocol

- **PASS — Twin service unit/integration tests:** the backend checkout's existing Python 3.12 environment ran `tests/test_attempt_scope.py`, `tests/test_app.py`, and `tests/test_mujoco_sync.py`: **9 passed**. Pytest warned that its cache could not be written because the backend checkout is read-only; no backend files were changed.
- **PASS — local browser Twin socket/render/revocation:** started the current Twin service on loopback using its installed dependencies. A temporary test harness published six-joint SIMULATION frames to the real server with a short-lived test-only HMAC publisher scope. Chromium opened the actual `/ws/twin` socket with `vista.twin.<scope>`, rendered all six readings in the Desktop Twin viewer, and showed `Connected · SIMULATION`. The service's signed local attempt-revoke request closed that viewer with the expected authorization denial (4403). The scope and identity were test fixtures minted only for this local test; **Education API student authorization and Desktop-generated MuJoCo ingestion were not exercised**.
- The ordinary Twin page also loads the bundled SO-101 URDF/STL model with no authorized robot and keeps Connect disabled. This is model/viewer rendering, not authorized telemetry acceptance.

### Current backend and remaining integration status

Backend source was rechecked read-only at `f42ca25cf1ead5460c53c1d8c357252474203a63`.

| Flow | Type | Status | Evidence / boundary |
| --- | --- | --- | --- |
| My Labs → Blockly Save/version → Demo result/submit | Chromium fixture UI | **PASS** | The preview shim labels Demo behavior; no backend persistence is claimed. |
| Dedicated Twin model viewer | Chromium UI | **PASS** | URDF/STL loaded in the actual browser surface; no connection is offered in Demo mode. |
| Twin authorized WebSocket with signed scope, frames, 4403 revocation | Local service/browser integration | **PASS (test-only scope)** | Uses the real Twin service and viewer, but a test-minted scope and server publisher call rather than Education API-issued authorization. |
| Student login → assigned lab → attempt → real Save/version → simulation → result → submit | Real Education API UI | **BLOCKED** | GoTrue health is available at local `:54321`; no local Education API answered on `:3001`. No real UI workflow was run. |
| Admin-issued enrollment → Ed25519 challenge → `/devices/me` → heartbeat → revoke | Real provisioning API | **BLOCKED** | Current backend has the documented routes, but no Education API test service or School Admin-issued one-time code/session was available. No code or success response was fabricated. |
| Desktop MuJoCo telemetry → authorized Twin | Backend contract | **BLOCKED** | Current Education API source has no student-authenticated simulation-frame ingestion route. `POST /internal/simulation-telemetry` is server-to-server and remains forbidden to Desktop. |
| Twin reconnection in Desktop against Education API-issued scope | Real API/browser integration | **NOT TESTED** | Local test covered initial socket, live updates and revocation; it did not test Education API scope refresh/reconnect. |
| Native Electron login/workspace | Native Electron | **NOT TESTED** | The UI smoke used system Chromium. |
| Physical SO-101 movement | Hardware | **NOT TESTED** | No port was opened and no robot was moved. |

The actual backend source exposes device routes `POST /api/v1/devices/enroll/start`, `POST /api/v1/devices/enroll/complete`, `POST /api/v1/devices/auth/challenge`, `POST /api/v1/devices/auth/token`, `GET /api/v1/devices/me`, and `POST /api/v1/devices/me/heartbeat`; School Admin management routes are under `/api/v1/education-admin/organizations/:organizationId/devices`. It also has `POST /api/v1/me/attempts/:attemptId/digital-twin/viewer-scope` and `WS /ws/twin`. These are source-verified, not Desktop real-backend E2E results.

The backend offers a local stack script, but its `up` path kills every process matching `node dist/main` and removes shared `/tmp/vista-*-fixture-int.json` files. It was not invoked. The existing local Supabase GoTrue health endpoint returned HTTP 200; the Education API was absent. No backend repository files or databases were changed.

### Regression and Git state

- `npm test`: **19 API/security contract tests and 3 Node test suites passed**.
- `npm run typecheck`: **passed**; `git diff --check`: **passed**.
- Git metadata is **sandbox read-only**, not a mode-bit/ownership problem: `.git` is owned by the current user and mode `drwxrwxr-x`, but `findmnt` reports a nested ext4 mount with `ro`. No Git metadata was changed and no commit was attempted.
- Current Desktop changes to review/commit: `renderer/features.js`, `renderer/twin-viewer.js`, generated `renderer/app.bundle.js`, `scripts/desktop-smoke.cjs`, `docs/desktop/ARCHITECTURE.md`, `docs/desktop/BACKEND_HANDOFF.md`, and this report. No backend files were modified. No AWS or physical hardware was accessed.
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


## Web/API integration acceptance — 2026-11-20

- Backend source was checked at commit `9b6dab092da9e42323be81880340c71f6bede340`; the four requested acceptance handoffs were read and controller/service routes verified in source. Web/API repository files were not modified.
- **PASS** real local Education API + GoTrue authentication (`POST /api/v1/auth/students/login`) using disposable tmpfs PostgreSQL and two isolated fixture identities; `/me`, `/me/learning`, and assignment detail returned 200. The fixture lacked `education_school_user_profiles` and organization school codes, so two disposable profiles/codes and internal auth aliases were added only to the temporary database.
- **PASS** authorization checks: a foreign-tenant student could not issue a Twin scope for the assigned robot (404). The same student obtained an authorized robot listing and an attempt-bound scope for a fresh in-progress test attempt.
- **PASS** API learning journey: start attempt (201), create Blockly program (201), read (200), update (200), create/list version (201/200), start schematic simulation (201), result (200; succeeded), submit (201), final attempt read (200; submitted). This validates the API route chain, not actual MuJoCo execution.
- **PASS** `npm test` (19 contract tests plus 3 Node runtime/security test files), `npm run typecheck`. New Ed25519 enrollment unit verifies signed message, DER public key and device-token-authenticated `/devices/me` and heartbeat request sequence.
- **PASS (source/contract)** device route integration now calls enrollment start/complete, auth challenge/token, GET `/devices/me`, POST heartbeat. Backend operator routes for register/list/get/suspend/resume/revoke/rotate exist in source and are feature-flagged. Desktop intentionally does not expose admin lifecycle operations to a student session. A live backend enrollment E2E still needs an operator-generated one-time enrollment code and test School Admin session. Device sessions are not MQTT credentials and no AWS cert is created.
- **PASS (browser UI flow)** Save, version, Demo schematic-result and submit controls complete via page event handlers. Root cause of the original Save stall was a start-only workspace that validation rejected; the editor now inserts a safe allowlisted starter action. Demo fixture endpoints are explicitly labeled and do not represent backend persistence or execution. **BLOCKED** full smoke reaches the Twin assignment picker, then headless Chromium/SwiftShader stops servicing page polling while the Three.js WebGL viewer loads/renders. Workspace screenshots also hang in Chromium screenshot capture. Dashboard and preflight screenshots are under `/tmp/vista-desktop-smoke`; Twin/WebGL and Electron native acceptance are not claimed.
- **PASS** backend source confirms `/ws/twin` echoes offered `vista.twin.<scope>` subprotocol. **PASS** local API authorized robot listing/scope and foreign-tenant denial. **BLOCKED** live WS viewer because this environment has no installed FastAPI/Uvicorn dependencies and outbound package access is unavailable.
- **BLOCKED** MuJoCo → authorized Twin: no Desktop-authenticated telemetry route exists. Twin `/internal/simulation-telemetry` accepts only a signed server publisher; Desktop must not call it. Backend source shows Education API publishes simulation telemetry from physical-execution completion; its schematic run does not publish MuJoCo frames. Exact Desktop contract gap is recorded in [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md). Live Twin WebSocket could not be started because FastAPI/Uvicorn were not installed and package downloads could not resolve; subprotocol echo was verified in backend source only.
- **PASS** MJCF/URDF source comparison: canonical joint names and +Z axes match; parsed elbow and wrist-roll limits are equal at the displayed precision. No simulation limit correction was made. Gripper units remain unmapped.
- **NOT RUN** mTLS MQTT against backend-issued device identity; no MQTT credential issuance contract exists. **NOT RUN** installer rebuild/clean installation, Windows/macOS native CI, full visual/accessibility/responsive acceptance, device lifecycle and revocation E2E. GitHub `origin/main` still points to the parent commit and matches local base; these changes have not been committed/pushed yet. No AWS deployment or physical hardware was used.
- Current environment check: `.git` is an ext4 mount with `ro` mount option even though its files are owned by the current user and mode bits allow writes. This is a sandbox mount restriction, not a Unix ownership/mode issue. FastAPI, Uvicorn, wsproto, and MuJoCo are not installed; `uv` is unavailable and outbound package resolution failed. The real Twin service cannot start here without provisioning those dependencies in a permitted environment.

## LeLab SO-101 station update — 2026-11-20

- The source review is recorded in [LELAB_SO101_UX.md](LELAB_SO101_UX.md). The local LeLab clone was already dirty at commit `84b6251cec3471195dfa35119827fbd1da2a801e`; it was not changed. VISTA reused the observed LeRobot leader/follower APIs and calibration sequence, not LeLab source files or training/data screens.
- Added separate leader/follower read-only adapter selection, real pyserial discovery, role-scoped LeRobot calibration profile listing, calibrated joint readback, disconnect handling, cross-process serial locks, and a guided operator-confirmed calibration worker. Physical teleoperation Start remains disabled and no hardware motion API exists.
- **PASS** `python3 -m unittest discover -s edge/tests`: 22 tests, 5 skipped. Added calibration state/profile tests and lock ownership tests use fake device/ports. No test opened a serial port.
- **PASS** `npm test`: 19 API contract tests and 10 Node supervisor/provisioning/simulation tests passed.
- **PASS** `npm run typecheck` and `git diff --check`.
- **PASS (browser-demo UI smoke only)** `npm run smoke`: the full existing workspace Save/version/run/result/submit flow completed; the new connection screen displayed an empty discovered-port state; calibration panel showed no profiles and kept Start disabled; physical teleoperation stayed disabled. Chromium screenshots are under `/tmp/vista-desktop-smoke/robot-connection-calibration.png` and `/tmp/vista-desktop-smoke/robot-calibration-teleoperation.png`. This preview did not access the Education API, Twin socket, LeRobot device, or physical hardware.
- **BLOCKED (hardware)** No supported serial device is attached or was authorized for a supervised session. No hardware connection, calibration, reconnection, live joint value, or physical stop behavior is accepted.
- **BLOCKED (LeRobot packaging)** `requirements-edge.txt` still does not bundle LeRobot; runtime calls fail honestly when it is absent. Cross-OS Python packaging, USB driver permissions, and LeRobot API compatibility on the packaged Python remain unverified. Windows/macOS builds and physical teleoperation are not accepted.
- **NOT IMPLEMENTED** physical teleoperation remains blocked pending backend/attempt authorization, deadman/stop design, and hardware validation. Twin remains the existing authorized viewer; Desktop does not call internal telemetry routes.
- The previous incomplete-smoke notes above are historical. This section records the latest successful browser-demo smoke. Existing seven pending changes were preserved; no commit or push was attempted.
# Final LMS sync acceptance retry — 2026-11-20

See [STUDENT_LMS_SYNC_AUDIT.md](STUDENT_LMS_SYNC_AUDIT.md) for the route audit, feature PASS/BLOCKED matrix, and isolated host setup. The real Student ↔ API ↔ Desktop integration could not be run: Docker socket access was denied, expected local services were absent, and the test-only account/attempt variables were not configured. Desktop contract tests pass; no Production, AWS, or physical hardware was accessed. No commit or push was made.

## Final completion sprint verification — 2026-11-21

This addendum records checks performed against the current uncommitted working
tree. Older entries above refer to earlier source states and must not be used as
acceptance evidence for a current-source release.

- `npm test`: **30 passed, 0 failed** (20 API/security contract cases and 10
  Node runtime/provisioning cases).
- `python3 -m unittest discover -s edge/tests -v`: **18 passed, 0 failed,
  5 skipped**. All skips require MuJoCo, which is unavailable in the active
  Python 3.14 environment. No hardware port was opened.
- `npm run typecheck`: **passed** JavaScript syntax checks.
- `npm run build:renderer`: **passed** and regenerated the tracked renderer
  bundle from the current source.
- `bash -n scripts/run-isolated-lms-e2e.sh` and
  `scripts/run-isolated-lms-e2e.sh --self-test`: **passed**. The self-test only
  checks runner input/ownership guards; no Docker, localhost service, or
  database was touched. The runner was reviewed and changed to start PostgreSQL
  before schema bootstrap and start GoTrue afterward; Node's heap is capped at
  768 MiB. Real host-side E2E has not run.
- `timeout 75s npm run smoke`: **BLOCKED** before Chromium launch. Crashpad
  returned `setsockopt: Operation not permitted` in the managed sandbox. No
  Electron page journey is claimed from this attempt. Previous Demo smoke
  results are retained above as historical evidence only.
- The POSIX serial lock now opens with `O_NOFOLLOW`, validates a regular
  current-user-owned file, and enforces private permissions. The new symlink
  regression test passed and confirmed its target content was unchanged.
- `mujoco`, `paho-mqtt`, and PyInstaller are absent from the active Python.
  MuJoCo, package-build, and current-source installer acceptance therefore
  remain blocked. No existing packaged binary was replaced.
- No isolated Education API/GoTrue/database journey, browser Twin WebSocket,
  device enrollment, real broker mTLS, real hardware session, Windows/macOS
  native build, commit, push, AWS call, or Production/shared Supabase mutation
  was performed.

See [FINAL_ACCEPTANCE.md](FINAL_ACCEPTANCE.md) for the feature matrix,
acceptance ratios, and final verdict, and [RELEASE_READINESS.md](RELEASE_READINESS.md)
for packaging gates. The Desktop is **not yet complete**: fake-device
teleoperation has since been implemented for simulation only; live LMS, Twin,
packaging, browser UI and hardware acceptance remain outstanding.

## Fake-device teleoperation implementation — 2026-11-21

- Added `edge/teleoperation.py` as an in-memory teleoperation capability inside
  the existing Edge Runtime. It imports no serial or LeRobot actuator modules
  and accepts only distinct, pair-owned `fake://` ports for Pair A and Pair B.
- Added six-joint radian validation and normalized name mapping, joint bounds,
  per-joint velocity limits, a 40 ms minimum command interval, monotonic sequence
  checks, wall-clock input freshness checks, connection-loss rejection, and a
  150 ms independent deadman watchdog.
- Operator flow is connect fake pair → explicitly enable → hold-to-run. Releasing
  the pointer/key, losing focus, navigating away, logging out, or missing the
  heartbeat blocks further commands. Emergency stop latches until explicit
  reset; reset leaves the pair disabled. Reconnect always returns DISABLED.
- The SO-101 station exposes two fake pair choices, six simulated Leader sliders,
  explicit enable/disable, hold-to-run, emergency stop/reset, disconnect, state
  and feedback. The existing SO-101 Twin viewer consumes validated fake
  simulation frames; it loads only when requested.
- Physical follower commands remain impossible through this path. The existing
  physical adapter remains read-only; no hardware was opened or moved.
- `edge/tests/test_teleoperation.py`: **15 teleoperation cases passed**, covering
  the requested mapping, deadman, e-stop/reset, position/velocity/rate limits,
  stale timestamp and sequence, timeout, connection loss, pair/port ownership,
  rearming, and Twin frame contract. `tests/teleoperation.test.cjs` verifies the
  same Edge JSON-lines service path including telemetry and emergency stop.
- Final verification after implementation: `npm test` **31 passed**;
  `python3 -m unittest discover -s edge/tests -v` **33 passed, 5 skipped**;
  `npm run typecheck` passed; `npm run build:renderer` passed.
- `timeout 75s npm run smoke` remains **BLOCKED** before Chromium page launch:
  the sandbox denied Crashpad `setsockopt` with `Operation not permitted`. The
  smoke launcher now leaves Chromium's sandbox enabled. From a normal Ubuntu
  terminal, the UI smoke command is `npm run smoke` from the Desktop repository.
- No physical teleoperation acceptance is claimed. LMS, live Twin WebSocket,
  MuJoCo-dependent tests, installer acceptance, and supervised hardware checks
  are still outstanding.

## Autonomous smoke and packaging follow-up — 2026-11-21

This entry supersedes the preceding blocked-smoke notes for the current source
tree. Smoke commands ran on the authorized Ubuntu host; the normal Chromium and
Electron sandboxes remained enabled.

- **PASS** `npm run smoke`: full Chrome 130 Demo journey completed, including
  lab discovery, Blockly save/version, schematic run, Demo submission/result,
  rendered Twin model with honest no-eligible-robot state, Settings, and Robot
  Station. Fake Pair A connect/enable/deadman/e-stop/reset and Pair B isolation
  passed. The physical output lock stayed disabled. Screenshots are in
  `/tmp/vista-desktop-smoke/`.
- **PASS** `npm run smoke:electron`: Electron 33.4.11 / Chromium 130 opened,
  completed Demo authentication, attempt/workspace, Blockly save/version and
  Demo schematic, verified the physical lock, then exited. Screenshot:
  `/tmp/vista-electron-smoke/electron-workspace.png`.
- Found and fixed a race where `.blocklySvg` appeared before asynchronous
  handlers were attached; smoke waits for the renderer's explicit workspace
  ready marker. Fixed Demo API allowed-action IDs so the default program passes
  the same canonical validator as the browser Demo. Local Blockly media and its
  Apache-2.0 notice are copied by the renderer build, eliminating blocked CDN
  sprite requests under the strict CSP.
- **PASS** `npm test`: 34 Node contract/runtime tests; **PASS** Edge suite:
  39 Python tests with `edge/.venv/bin/python`, including MuJoCo model and
  execution tests. No physical serial port was opened.
- **PASS** `npm run typecheck` and `npm run build:renderer`.
- **PASS (artifact/startup checks; builder exit inconclusive)** Refreshed
  AppImage and DEB artifacts are in `/tmp/vista-desktop-release-check.X3Y81I/dist/`;
  both opened under Xvfb with Electron sandbox enabled. The DEB was extracted,
  not installed on a clean machine. The builder session did not return a clean
  exit status after emitting both files. PyInstaller warned that
  `libOSMesa.so.0` and optional `OpenGL_accelerate` were absent; packaged MuJoCo
  execution was not checked.
- **BLOCKED** isolated LMS E2E: the disposable runner cannot reach its own
  Docker-published loopback PostgreSQL port from the approved execution
  context (`psql` reports connection refused). The shared Supabase stack was
  left untouched. Run `scripts/run-isolated-lms-e2e.sh` from the normal Ubuntu
  terminal to complete real database persistence/readback acceptance.
- **NOT ACCEPTED** authorized Twin WebSocket telemetry, backend-issued device
  enrollment/MQTT mTLS, Windows/macOS builds, clean Linux installation, or
  physical hardware. No backend, AWS, Production, or robot command was used.

## Latest isolated LMS and regression verification — 2026-11-21

The latest host-authorized `npm run smoke` and `npm run smoke:electron` both
passed. Final local regressions passed: `npm test` (36 Node cases), Edge Python
suite (39 tests), `npm run typecheck`, `npm run build:renderer`, shell syntax,
runner safety self-test, and `git diff --check`.

The Docker networking root cause was that Compose's `Internal=true` network
does not publish ports to the host. The runner now uses a loopback-only TCP
forwarder to the private IP of each uniquely owned service. Real disposable
GoTrue + Education API acceptance then completed student login/refresh, course
and lab data, attempt start/resume, Blockly save/version/history, submission,
Web LMS projection, and cross-school/foreign-submission denial. Direct SQL
readback confirmed the submitted attempt, program, immutable version, and
submission rows are linked. Schematic execution succeeded and its result route
returned persisted data.

The full runner exits **FAIL (2)** because the backend events route
`GET /api/v1/me/experiments/:id/events` returns HTTP 500; backend logs show
`TypeError: Do not know how to serialize a BigInt`. This is a backend fix and
was not changed here. Latest private evidence (exit status, completion log and
SQL row snapshot): `/tmp/vista-lms-934f0c7e-evidence/`. The fixture's existing
`learning.experiment.execute` capability is granted only inside the disposable
database because the checked-in Phase 2.4.3 student fixture omits it. Optional
temporary-password and Twin WebSocket flows were skipped. Shared Supabase and
all non-runner Docker resources were left untouched.
