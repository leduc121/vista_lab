# Phase 3 integration readiness report

Date: 2026-11-19. No Git operations or Production service/data were used.

## Readiness summary

**Desktop status: integration-prepared, not live-accepted.** Existing Electron login, student dashboard, robot health panel, and safety-gated session UI are retained. Physical robot motion remains unavailable. The main integration gate is backend contract work for mandatory temporary-password change and attempt-bound Twin authorization, followed by a disposable staging acceptance run.

## Verified and implemented

- Source-verified auth UI posts School Code + Student Code + password to `POST /auth/students/login`; account setup and recovery follow the source DTOs. Supabase refresh/logout use the configured public project and anon key. Main-process `safeStorage` persists sessions only when OS encryption is available; expiry clears persistence and returns to login. These paths have offline contract tests, not live identity-service acceptance.
- Assigned learning/profile and Blockly assignment, attempt, program, immutable version, local restore, submission, and schematic calls use the Education API source routes recorded in `API_CONTRACTS.md`. Blockly displays save/version/submission errors, 401/403 states, and server validation. Restore is local workspace loading; there is no server restore endpoint.
- Twin endpoint settings accept secure `wss://host/ws/twin`, or loopback `ws://`; credentials/query/fragment and other paths are rejected. An operator may set `VISTA_TWIN_WS_URL` or save the public endpoint in per-user config. No token is stored there.
- The Desktop refuses live Twin scope requests because the current backend scope only binds student, organization, and robot. A selected attempt in the UI is not sufficient authorization. The exact attempt/session-scoped route and stream requirements are in `CLAUDE_BACKEND_HANDOFF.md`.
- Renderer IPC uses the narrow preload bridge and trusted-frame/method checks. No physical motion method is exposed.
- `npm run test:integration` is a Production-guarded harness for disposable local/staging login, profile/learning reads, and cross-school attempt read denial. It did not run because no isolated API/Supabase/test accounts were supplied.

## Tests and packaging

- `npm test`: 10 passed, 0 failed.
- `npm run typecheck`: JavaScript syntax checks passed. The project has no TypeScript compiler/source.
- `npm run smoke`: passed for dashboard and existing shell, Blockly workspace, Demo save/version/local preview, SO-101 render, and fail-closed Twin access. This is a browser smoke, not backend integration.
- `npm run test:integration`: not run; refused to start with required test environment variables missing.
- Linux AppImage and DEB rebuilt. AppImage launched in isolated Demo mode for 12 seconds with GPU disabled. DEB extracted to `/tmp` (not installed system-wide) and its payload stayed open for 12 seconds. No Production endpoint was contacted.
- Windows NSIS installer rebuilt and electron-builder's Wine packaging execution passed. Windows runtime acceptance remains untested. Install steps are in `WINDOWS_ACCEPTANCE.md`.
- A scan of the packaged Windows app source found no service-role key, Twin publisher secret, or JWT-like token. Artifacts are unsigned.

Artifacts: `dist/VISTA Lab Station-0.1.0.AppImage` (138 MB, SHA-256 `a9f3beadd13635f9521f5031c3e507b2d6c4e32d8adf39dac73605ed4231bd65`); `dist/vista-lab-station_0.1.0_amd64.deb` (103 MB, SHA-256 `00df40d09bd8381fd25cab59f5b26a89f379a640486ef20a004cbc6c0f48e477`); `dist/VISTA Lab Station Setup 0.1.0.exe` (110 MB, SHA-256 `fbc3f795ca1b3463d366ebbbb091cba5e98e2b70fb5db7897814525b2858c718`).

## Backend dependencies and blockers

1. Add a restricted temporary-password challenge from login and one-time authenticated password-change endpoint. Current backend supports first-time setup and recovery only; neither enforces change of a temporary password.
2. Add attempt/session-bound Twin scope issuance that verifies student, school, attempt/session lifetime, assignment/robot allocation and entitlement. Carry attempt identity into the Twin subscription and filter the stream so telemetry from another attempt cannot be read.
3. Provide the environment-specific Twin WebSocket host. Education API does not return it.
4. Provide an isolated local/staging Education API + Supabase project and disposable test accounts/resources; then run login, refresh, assignment, Blockly write/version/submit, expiry, tenant-isolation and Twin-denial acceptance.
5. Confirm redistribution rights/attribution for the bundled SO-101 GLB and CAD-derived URDF/STL package. Do not publish installers before that approval. The source and hashes are documented in `ASSET_PROVENANCE.md`.

## Exact changed files

`api.js`, `main.js`, `ipc-security.js`, `renderer/app.js`, `renderer/features.js`, `renderer/features.css`, `tests/api.contract.test.cjs`, `scripts/desktop-smoke.cjs`, `scripts/integration-acceptance.cjs`, `package.json`, `docs/desktop/API_CONTRACTS.md`, `docs/desktop/ARCHITECTURE.md`, `docs/desktop/README.md`, `docs/desktop/TEST_REPORT.md`, `docs/desktop/CLAUDE_BACKEND_HANDOFF.md`, `docs/desktop/INTEGRATION_TEST_SETUP.md`, `docs/desktop/WINDOWS_ACCEPTANCE.md`, `docs/desktop/ASSET_PROVENANCE.md`, and this report. `renderer/app.bundle.js` and `renderer/app.bundle.css` are generated by the renderer build.

## Next acceptance steps

1. Implement the backend contracts in `CLAUDE_BACKEND_HANDOFF.md` and update the API contract docs.
2. Seed the isolated environment as described in `INTEGRATION_TEST_SETUP.md`; run the integration harness and the proposed Blockly/Twin authorization tests.
3. Resolve SO-101 asset licensing; then run Windows installation and runtime acceptance on a clean Windows VM.
