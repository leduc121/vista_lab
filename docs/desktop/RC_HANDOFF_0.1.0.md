# VISTA Lab Station Linux RC 0.1.0 — Handoff

Internal release candidate only. Feature freeze is active. No source was committed, pushed, merged, or publicly released as part of this handoff.

## Artifacts

- `dist/phase6-candidate/VISTA Lab Station-0.1.0-x86_64.AppImage` — 191 MiB, SHA-256 `3220f55a9c6ce9d069b94b322f454a81b356d80f7e2734be8dc4a5fd4f067918`.
- `dist/phase6-candidate/VISTA Lab Station-0.1.0-amd64.deb` — 216 MiB, SHA-256 `f0dd75a91fe79a9feeb336191b18b7400b9a164f317bbb2f453e9eba7d51183e`.
- `dist/phase6-candidate/SHA256SUMS` verifies both files.

The original RC files above were preserved unchanged. A separate Linux x64 candidate containing the Robotics Profile supervisor/IPC/Settings integration is at `dist/vista-capstone-final-rc/`:

- `VISTA Lab Station-0.1.0-x86_64.AppImage` — SHA-256 `be8c1d835c7621db86e9c29b8f9cc50665ad5ab7ca17da3000a4bc09991bb29b`.
- `VISTA Lab Station-0.1.0-amd64.deb` — SHA-256 `a76a90a1f07dfef8f9e33008df875eefc809bffafbd24f5a88ae7a951d66954b`.
- `SHA256SUMS` verifies both candidate files.

AppImage used electron-builder. Its fpm DEB target stalled, so the candidate DEB was assembled from the matching `linux-unpacked` output using the original DEB control metadata, desktop entry, icon, and dependency list with `dpkg-deb`; archive metadata and extracted executable were checked. It was not installed through apt.

AppImage and extracted packaged Electron window launch were observed under Xvfb. Packaged Edge health/status/stop completed successfully; MuJoCo loaded bundled `scene.xml`. This is Linux x64 simulation startup/shutdown evidence, not a clean-machine install test, physical hardware test, or AWS E2E test. DEB was validated as an archive and checksum; system package-manager installation was not performed.

## Regression evidence already recorded

- Edge Python suite: 87 passed.
- Node/API suite: 25 API contract tests and 7 Node test suites passed.
- Renderer build, JavaScript syntax check, and `git diff --check` passed.
- Local WF03 uses a mock evidence endpoint; it is a local contract result, not backend evidence persistence.
- Current-turn mock LeRobot `send_action` through safety sink: 1 passed.
- Final regression after profile integration: Python Edge suite 87 passed; `npm test` passed 25 API contract checks and 18 Node tests; renderer build/typecheck and native Electron smoke passed.
- AppImage smoke: Demo workflow passed with Simulation profile; a second packaged run started Robotics Profile and reported `READY`, Python 3.12.14, `lerobot=true`, `mujoco=true`, `fakeRobot=true`, `hardwareEnabled=false`, then shut down.
- DEB candidate archive validation and extraction passed; its packaged executable completed the Demo workflow with Simulation Profile and shut down.
- Electron screenshots: `/tmp/vista-electron-smoke/electron-runtime-profile.png` (latest Robotics Profile UI) and `/tmp/vista-electron-smoke/electron-workspace.png` (Demo workflow).

## LeRobot compatibility gate

Packaged Edge runtime remains Python 3.11.16 and reports `lerobot=false`; the accepted 0.1.0 artifacts were not changed. A separate locked Python 3.12.14 CPU profile is now prepared at `edge/robot-runtime/`. LeRobot 0.6.1 SO-101 Leader/Follower imports and disconnected adapter initialization pass there with Torch 2.7.1+cpu, NumPy 2.2.6, Feetech SDK 1.0.0, and the same Edge Runtime source. `uv pip check`, MuJoCo simulation health/shutdown, and the mock `send_action` safety test pass. No serial device was opened and no calibration or motor write occurred.

The separate candidate integrates mutually exclusive runtime selection. Robotics requires an operator-selected Python environment and Edge source checkout; it does not auto-connect hardware. See [Robotics Runtime Compatibility](ROBOTICS_RUNTIME_COMPATIBILITY.md). The exact verified interpreter used in this environment lives in `/tmp` and is not bundled or committed; recreate a durable environment from the lockfile on the demo host before using the profile.

## Known limitations and runbooks

- Physical motion, calibration writes, LeRobot real adapter, and safe-stop are not verified. `SO101Follower.connect(calibrate=False)` still calls `configure()` and writes motor settings; it is not a read-only operation.
- AWS certificate/provisioning, production MQTT, backend worker processing, and production evidence persistence are not verified. Current repo handoff/fixture could not be read from this workspace; AWS values in the runbook reflect values previously supplied by the owner and require current `se/develop` confirmation.
- Cartesian targets remain experimental due the measured ~19.9 mm URDF/MuJoCo end-effector frame offset; no tolerance was widened.
- AppImage/DEB are unsigned internal artifacts. Public redistribution remains blocked pending `checkIk` ownership/provenance confirmation.
- The Robotics Profile has only been tested against simulation and a mock motor bus. Physical calibration, stop behavior, and motion remain unverified.
- GitHub final handoff is blocked locally because `gh auth status` reports an invalid token; checkIk redistribution rights are also unconfirmed. No branch, commit, push, or PR was created.

See [English User Guide](USER_GUIDE_EN.md), [Release Notes](RELEASE_NOTES_RC.md), [Demo Procedure](DEMO_PROCEDURE_EN.md), [Hardware Commissioning Runbook](HARDWARE_COMMISSIONING_RUNBOOK.md), and [AWS Acceptance Runbook](AWS_ACCEPTANCE_RUNBOOK.md).
