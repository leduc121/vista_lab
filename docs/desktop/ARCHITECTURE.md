# Desktop architecture

- `main.js` owns the API client, student tokens, encrypted session persistence, file access, and the IPC allowlist.
- `preload.js` exposes a frozen, narrow bridge. Renderer frames are checked against the local packaged page before an IPC handler runs. Node integration is disabled, context isolation and sandboxing are enabled, navigation and new windows are denied.
- `api.js` maps source-verified Education API paths and validates resource identifiers. No bearer token is exposed to renderer JavaScript.
- `robot-runtime.js` is a local, simulation-only Edge adapter. Electron checks an authenticated active attempt before execution. Its narrow IPC accepts only the simulation workflow; it exposes no serial port, driver selection or physical mode. Duplicate, expired, malformed and unsupported commands fail closed. See [CHECKIK_REUSE.md](CHECKIK_REUSE.md) for the read-only upstream review and physical integration blockers.
- `renderer/app.js` preserves the existing login, dashboard, health panel, and safety-gated lab session. `renderer/features.js` adds Blockly assignment program/version/local restore/submission flows, schematic requests, and an attempt-selected Twin viewer page that fails closed before requesting scope while the backend cannot bind a scope to an attempt.
- `dev/shim.js` and `dev/index.html` provide explicitly labelled fixture data for browser smoke runs; Demo mode cannot submit to VISTA.

Local drafts are scoped by classroom-assignment UUID, size-limited, and written under Electron user data. Main-process asset IPC allows the fixed GLB preview and allowlisted SO-101 URDF/STL assets. The CSP permits the Education API/Supabase plus configured secure Twin WebSocket traffic.

The Blockly sidebar keeps its existing GLB-based local illustration. The dedicated Twin page parses the bundled SO-101 URDF; live telemetry scope requests remain blocked until attempt-bound authorization is implemented by the Education API and Twin stream. The model is not a physics simulation. The local Edge simulation adapter is not MuJoCo and cannot control hardware; physical command IPC remains absent. Twin URLs are validated and never carry credentials in URL fields. See [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md) for distribution limits.
