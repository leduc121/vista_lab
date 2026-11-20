# VISTA Lab Station

Electron student lab application, version **0.1.0**. The Desktop uses assigned Education API activities for login, attempts, Blockly programming, server schematic execution, results, and read-only SO-101 Twin telemetry. Physical robot motion is disabled.

## Run locally

```sh
npm install
VISTA_DESKTOP_DEMO=1 npm start
```

Demo mode uses local fixtures and clearly labeled preview animation. It does not write student data to VISTA or run MuJoCo. For a real isolated environment, the operator supplies `VISTA_EDUCATION_API` ending in `/api/v1`, matching public `VISTA_SUPABASE_URL` and `VISTA_SUPABASE_ANON_KEY`, and optionally `VISTA_TWIN_WS_URL` ending in `/ws/twin`. No Production endpoint is selected by default. Remote API and Supabase URLs require HTTPS; remote Twin requires WSS. Never use a service-role key in this app.

Session tokens stay in the Electron main process. Restart persistence uses Electron safeStorage only when a secure OS storage backend is available. On Linux systems where Electron selects `basic_text`, restart persistence is disabled and any prior session file is removed; students sign in again. Settings shows whether secure persistence is available.

## Verification and packaging

Run `npm test`, `npm run typecheck`, and `npm run smoke` sequentially. `typecheck` runs JavaScript syntax checks; this project has no TypeScript compiler. `npm run test:integration` requires the isolated, disposable environment in [integration setup](docs/desktop/INTEGRATION_TEST_SETUP.md); it must never target Production. Native Edge packaging first requires Python 3.11.x and `python -m pip install -r requirements-edge.txt` on the target OS/architecture, then `npm run dist`, `npm run dist:win`, or `npm run dist:mac`. Build each installer on its native platform. See [Edge Runtime status](docs/desktop/EDGE_RUNTIME_STATUS.md), [CHECKIK reuse](docs/desktop/CHECKIK_REUSE.md), the [current test report](docs/desktop/TEST_REPORT.md), and the [release checklist](docs/desktop/RELEASE_CHECKLIST.md).

Local release candidates and their manifest are under [releases/v0.1.0](releases/v0.1.0/README.md). They are unsigned and **not publicly approved**. The [Web download handoff](docs/desktop/WEB_DOWNLOAD_HANDOFF.md) describes future static hosting without a public URL. Windows runtime testing, real isolated API acceptance, immediate backend Twin revocation, and SO-101 asset redistribution permission remain outstanding. Do not publish the installers or enable physical motion until the relevant gates are cleared.

The public source repository excludes the SO-101 GLB and CAD assets because redistribution rights are not verified. A clean checkout therefore needs rights-cleared model assets supplied locally for the 3D Twin viewer. See [asset provenance](docs/desktop/ASSET_PROVENANCE.md).
