# Local Edge Runtime status

## Implemented and locally verified

- Python JSON-lines Edge Runtime with bounded message size, health/version report,
  simulation and physical-read-only mode separation, SO-101 simulated state,
  discovered-port selection, explicit connection confirmation, joint-state
  readback gate, disconnect, and graceful shutdown.
- Electron-managed child process with restart budget (three attempts/minute),
  request timeout, structured rotating log, fixed IPC allowlist, trusted-frame
  checks, sign-in gate, logout/submit disconnect, and app-quit cleanup.
- A CHECKIK-compatible SO-101 wrapper based on LeRobot's follower API. It does
  not expose `send_action` or teleoperation. Connect uses `calibrate=False`; joint
  readback requires the follower to report calibrated. Register writes during
  LeRobot connect may still occur. No physical motion was used in tests.
- MQTT/TLS transport module has strict TLS, private-key permission checks,
  authorized allowlisted Blockly command validation, persistent expiry/dedup,
  result ACKs, heartbeat/telemetry publishing, persistent command dedupe, and
  rejects retained, servo, joint-setpoint, trajectory, and teleoperation messages.
  Tests use a fake Paho client; no local broker or AWS IoT endpoint is available.
  The transport stays disabled until provisioning provides identity and policy.
- Device key generation uses Electron safeStorage and writes encrypted private
  key bytes. Provisioning stays `KEY_READY`/`NOT PROVISIONED` until a backend is
  available; key tests use a fake safeStorage adapter.
- Setup Wizard reports runtime/driver/serial/calibration/MuJoCo/provisioning/MQTT
  states; it provides explicit serial selection and read-only connect/disconnect.
- Native build script, Electron extra-resource packaging, and native CI matrix
  are prepared. The current machine lacks PyInstaller, so the new native bundle
  and updated installers were not produced.
- Python tests (10) pass, including child process protocol, fake physical adapter,
  and fake MQTT client. Desktop API/robot/supervisor/provisioning tests (28) pass.
  JS syntax checks and renderer bundle build pass (38 test cases total).

## Blocked or incomplete

- Python 3.11 is available for builds, but PyInstaller and its pinned Edge
  dependency set are not installed. End-user Python-free packaging is
  **BLOCKED** until `requirements-edge.txt` is installed in native build
  environments and the PyInstaller bundle is produced and inspected.
- SO-101 discovery/connection/readback is implemented but not verified on robot
  hardware. Setup connection can configure communication registers. No automated
  tests open serial ports or move hardware.
- MuJoCo library/model integration is **BLOCKED**: MuJoCo is not installed here,
  and no redistributable SO-101 MJCF model is present. The existing URDF viewer
  and Blockly simulation remain labeled simulation/visualization, not MuJoCo.
- No local MQTT broker harness, device registration endpoint, or production
  credentials are configured. Provisioning is `NOT PROVISIONED`; MQTT is
  `BLOCKED`. No AWS connection was made.
- Full Electron→MuJoCo→simulated robot→MQTT→Digital Twin acceptance is incomplete.
- `npm run smoke` fails because Chromium Crashpad cannot set a socket option in
  this sandbox. It did not reach application UI inspection.
- Existing staged `0.1.0` installers and checksums predate this runtime and were
  not overwritten. No Windows/macOS build was executed on its target OS; no
  macOS DMGs exist. Existing Windows setup artifact does not contain the new
  bundled runtime and is not a current release candidate.

See `CHECKIK_REUSE.md` and `BACKEND_HANDOFF.md` for reuse scope and server needs.
