# Verified VISTA API contracts

Reviewed read-only against the latest available backend sprint source and its `docs/acceptance/DESKTOP_API_CONTRACTS.md` on 2026-11-19; the Twin protocol and revocation tests were rechecked on 2026-11-20. These contracts establish source behavior; they do not prove this Desktop build has been tested against a live service or that a deployment has matching migrations/configuration. The API prefix is `/api/v1`.

## Student authentication

- `GET /auth/students/capabilities` is public and returns `{ temporaryPasswordEnabled: boolean }` with `Cache-Control: no-store`.
- `POST /auth/students/login` accepts `{ schoolCode, studentCode, password }` and returns a standard public Supabase session plus `password_change_required: boolean` when the feature is enabled. There is no challenge token.
- A restricted session may refresh through Supabase `POST /auth/v1/token?grant_type=refresh_token`; refresh does not clear the restriction.
- While the flag is true, the Education API rejects normal routes with `403 { code: "PASSWORD_CHANGE_REQUIRED" }`; `PATCH /auth/students/password` is the only allowed route. It accepts `{ currentPassword, newPassword }` and returns a new standard session. The Desktop replaces the old session with that returned session.
- An expired temporary password returns `403 { code: "TEMPORARY_PASSWORD_EXPIRED" }` on API authorization; pre-change access JWTs return `401 { code: "SESSION_ROTATED" }` after a successful change. Logout uses Supabase `/auth/v1/logout` and local credentials are cleared even offline.
- Setup Code (`POST /auth/students/setup`) and Recovery Code (`POST /auth/students/recover`) remain separate workflows. Recovery does not create a session.

## Assignments, attempts, Blockly, and simulation

- Identity and assigned learning: `GET /me`, `GET /me/learning`, details `GET /classroom-assignments/:id`.
- Authorized attempt: `POST /classroom-assignments/:id/attempts` (creates or resumes), read `GET /me/attempts/:id`.
- Program: `GET/POST /me/attempts/:attemptId/program`, `PATCH /me/programs/:programId`; immutable versions `GET/POST /me/programs/:programId/versions`; submit `POST /me/attempts/:attemptId/submission`.
- Restore is local: there is no server restore route. The client loads a saved immutable version into Blockly and requires save/new version before submission.
- Schematic execution: create with `POST /me/attempts/:attemptId/experiments` and `{ programVersionId, executionMode: "schematic" }`; start via `POST /me/experiments/:id/run-schematic`; observe `GET /me/experiments/:id`, `/events`, `/result`. This is a server schematic flow and must not be described as MuJoCo or physical execution.
- Grades and instructor feedback are shown only when present in the Education API response. No grading logic is duplicated in Desktop.

## Attempt-bound Digital Twin

- Availability: `GET /robots/digital-twin/availability`; filter to SO-101 and `allocationStatus: "allocated"`, `viewerAccess: "authorized"` as a preliminary UI hint.
- Student/Desktop authorization: `POST /me/attempts/:attemptId/digital-twin/viewer-scope` with `{ robotId, labSessionId? }`. The backend authorizes attempt ownership and `in_progress` state, published/open assignment, active school/class/membership, execute permission, classroom allocation, and entitlement. Failures are 404 without a token. Do not use the legacy robot-wide scope route.
- The scope token is attempt-bound and short-lived (at most 60 seconds). Connect to the operator-configured `WS /ws/twin` endpoint with `vista.twin.<token>` as the WebSocket subprotocol. Never put the token in a query string. The service filters frames by robot and attempt; a mismatch or expired/revoked scope closes with 4403. Request a fresh scope after a close; do not reuse a token.
- Frames use schema version 1, robot ID, source mode, controller ID, measured timestamp, sequence, connection, calibration status, and validated six-joint readings. The Desktop rejects malformed or wrong-robot frames and clears state on disconnect. It has no command message or physical mutation path.
- Configure `VISTA_TWIN_WS_URL` via the operator environment or set the non-secret endpoint in app settings. Remote connections require `wss://`; plain `ws://` is allowed only on loopback; URL credentials, query, fragment, and non-`/ws/twin` paths are rejected.
- Backend follow-up: Education API does not yet automatically call Twin `/internal/revoke-attempt` on submission or allocation/entitlement revocation. Scope TTL limits exposure to 60 seconds; immediate revocation remains a live-acceptance dependency.

## Safety boundary and evidence limits

Physical execution mutation methods are not exposed to the renderer and the hardware start action remains disabled. Runtime/eligibility reads do not establish safe student actuation. The Desktop has no serial access and sends no physical motion commands.

These are source-verified routes only. Isolated API/Supabase acceptance, actual Twin WebSocket acceptance, package runtime acceptance, and Production acceptance are reported separately in `TEST_REPORT.md`.

## Queue 5 acceptance note

The packaged Desktop source uses these routes and passes local contract tests, but no valid isolated `VISTA_TEST_*` environment was present for real API acceptance on 2026-11-20. The local database bootstrap fingerprint mismatch documented in `CLAUDE_BACKEND_HANDOFF.md` remains a setup blocker. The broker's attempt-scoped frame filtering and `/internal/revoke-attempt` behavior are source-tested; Education API wiring for immediate revocation remains outstanding. Linux session persistence now refuses Electron's `basic_text` fallback and reports persistence unavailable in that environment.
