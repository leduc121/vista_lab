# VISTA Lab Station

Electron student client for assigned VISTA robotics practice. It reuses the existing login, dashboard, Robot Health panel, and safety-gated lab flow. It integrates source-verified student authentication, mandatory temporary-password change, assignment/attempt APIs, Blockly program and version workflows, schematic execution routes, and attempt-bound Digital Twin viewer authorization. It does not control physical robots.

## Run locally

```sh
npm install
npm run start
```

`VISTA_DESKTOP_DEMO=1 npm start` selects a clearly isolated fixture; Demo data is not from VISTA and is not submitted to the backend. Normal mode requires an explicit `VISTA_EDUCATION_API` ending in `/api/v1`; it does not silently connect to Production. Configure the matching public Supabase project URL and anon key with `VISTA_SUPABASE_URL` and `VISTA_SUPABASE_ANON_KEY` for token refresh/logout. Remote API and Supabase URLs must use HTTPS; loopback HTTP is supported for isolated local integration. Never set a service-role key.

Set `VISTA_TWIN_WS_URL` to the operator-provided `/ws/twin` endpoint, or set it in the Twin screen. Remote URLs must use `wss://`; `ws://` is allowed only for loopback. Credentials, query strings, fragments, and other paths are rejected. The access token is sent only as the short-lived `vista.twin.<token>` WebSocket subprotocol after the Education API grants scope to the selected attempt and robot.

`safeStorage` encrypts session tokens in Electron user data only when an OS-backed backend is available. On Linux, Electron's `basic_text` and unknown fallback are rejected; restart persistence is disabled and any previous session file is removed. Restricted temporary-password state is persisted only when this secure storage gate passes and is then restored into the mandatory password-change screen. The Desktop does not store entered passwords.

## Build and verify

```sh
npm run build:renderer
npm run typecheck
npm test
npm run test:integration
npm run smoke
npm run dist
npm run dist:win
```

See [API_CONTRACTS.md](API_CONTRACTS.md), [INTEGRATION_TEST_SETUP.md](INTEGRATION_TEST_SETUP.md), [TEST_REPORT.md](TEST_REPORT.md), and [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md). Do not describe Linux packaging as target-host runtime acceptance or Wine validation as Windows runtime acceptance.

## Product boundaries

The local arm pose animation is labeled as preview; only server schematic status/results are reported as server execution. The Twin displays attempt-scoped telemetry only after a backend grant and verified WSS/loopback endpoint configuration. The UI clears frames on disconnect/navigation/logout. Physical motion remains disabled in UI and IPC. See [CLAUDE_BACKEND_HANDOFF.md](CLAUDE_BACKEND_HANDOFF.md) for remaining backend work.
