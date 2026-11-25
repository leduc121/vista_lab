# Desktop architecture

## SO-101 LeLab-inspired operator workflow — 2026-11-20

- The Electron renderer now has an SO-101 station screen with actual OS serial
  discovery and independent Leader/Follower port and calibration-profile
  selection. The renderer can only call allowlisted local Edge IPC methods.
- Edge role adapters use LeRobot's public `SO101Leader` and `SO101Follower`
  connection/readback interfaces with `calibrate=False`; each owns a separate
  serial port and checks the LeRobot calibrated flag before exposing six
  measured values. Shared POSIX/Windows advisory port locks use LeLab's
  SHA-256 lock-file naming/record format to coordinate supported local
  processes.
- An explicit-confirmation calibration worker follows LeLab's neutral homing
  and manual range-recording sequence. It persists through LeRobot's native
  calibration save API and reads existing role-specific profile IDs from the
  local LeRobot calibration directory. It is not invoked by startup, port scan,
  diagnostics, or tests.
- Physical teleoperation remains unavailable. The SO-101 station now provides
  an explicitly separate fake-only Leader/Follower practice loop through the
  existing Edge Runtime. Its virtual `fake://` ports are pair-owned, commands
  terminate in an in-memory follower, and the loop enforces explicit enable,
  hold-to-run, joint position/velocity and rate limits, freshness, watchdog,
  and latched emergency-stop/reset. Validated fake feedback frames drive the
  existing local SO-101 Twin viewer. This code has no serial/LeRobot output
  path. Physical motion still has no send-action method or student-authorized
  deadman/stop contract. The backend-scoped Twin remains viewer-only; Desktop
  does not call an internal telemetry endpoint.
- See [LeLab SO-101 UX study](LELAB_SO101_UX.md) for source commit/dirty-tree
  caveats, screen mapping, exact tested limits, and hardware blockers.

- `main.js` owns the API client, student tokens, encrypted session persistence, file access, and the IPC allowlist.
- `preload.js` exposes a frozen, narrow bridge. Renderer frames are checked against the local packaged page before an IPC handler runs. Node integration is disabled, context isolation and sandboxing are enabled, navigation and new windows are denied.
- `api.js` maps source-verified Education API paths and validates resource identifiers. No bearer token is exposed to renderer JavaScript.
- `robot-runtime.js` remains the legacy Blockly simulation-only adapter and exposes no serial or physical command path. Electron's `EdgeSupervisor` owns the separate Python `edge/runtime.py` process for MuJoCo, fake-only teleoperation, and explicitly confirmed local read-only robot connection/calibration. Physical follower mutation remains absent. Duplicate, expired, malformed and unsupported simulation commands fail closed. See [CHECKIK_REUSE.md](CHECKIK_REUSE.md) for upstream reuse and physical integration limits.
- `renderer/app.js` preserves the existing login, dashboard, health panel, and safety-gated lab session. `renderer/features.js` adds Blockly assignment program/version/local restore/submission flows, schematic requests, and a read-only Twin viewer that requests a backend scope for the active attempt and allocated robot.
- `dev/shim.js` and `dev/index.html` provide explicitly labelled fixture data for browser smoke runs; Demo mode cannot submit to VISTA.

Local drafts are scoped by classroom-assignment UUID, size-limited, and written under Electron user data. Main-process asset IPC allows the fixed GLB preview and allowlisted SO-101 URDF/STL assets. The CSP permits the Education API/Supabase plus configured secure Twin WebSocket traffic.

The dedicated Twin page parses the bundled SO-101 URDF and obtains a 60-second, attempt-bound scope from the Education API. The Twin `/ws/twin` endpoint echoes the offered `vista.twin.<scope>` subprotocol, as required by browser WebSocket clients. A contract gap remains: Desktop-generated MuJoCo frames have no student-authenticated ingestion route; the Twin's `/internal/simulation-telemetry` is server-only. The model is not a physics simulation. The local Edge MuJoCo runtime simulates but cannot control hardware; physical command IPC remains absent. Twin URLs are validated and never carry credentials in URL fields. See [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md) and [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md).

The Blockly workspace defers constructing its local Three.js SO-101 viewer until a MuJoCo run is requested. This avoids holding a second WebGL render loop during schematic-only work. Pending model loads and renderers are disposed when the user navigates away; the standalone Twin page still mounts the viewer when opened.

Canonical correspondence is Desktop MJCF `shoulder_pan`, `shoulder_lift`, `elbow_flex`, `wrist_flex`, `wrist_roll`, `gripper` to Web URDF `Rotation`, `Pitch`, `Elbow`, `Wrist_Pitch`, `Wrist_Roll`, `Jaw`; every axis is `0 0 1`. Parsed ranges agree within the URDF's decimal precision: MJCF ±1.91986, ±1.7453293, ±1.69, ±1.658063, −2.7438473…2.8412063, −0.174533…1.7453292 radians respectively. No correction was applied. The gripper's upstream degree/percent mapping remains unspecified; telemetry is not implicitly converted.
