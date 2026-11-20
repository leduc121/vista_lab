# Desktop completion sprint report

Date: 2026-11-19. No Git operations, Production API calls, backend writes, deployments, or hardware access were performed.

## Gap found and changes implemented

The prior Phase 4 report and handoff were based on an older backend checkout. The latest available sprint source contains both the temporary-password-change contract and attempt-bound Digital Twin scope. I corrected Desktop contracts and handoff docs to that source.

- Added restricted temporary-password session state to the API client and encrypted session persistence. Refresh preserves the restriction. A mandatory password-change screen calls `PATCH /auth/students/password`; the returned session replaces the restricted session before `/me` is loaded. API `code` values now survive IPC and route into the relevant UI state.
- Replaced the student Twin robot-wide scope route with `POST /me/attempts/:attemptId/digital-twin/viewer-scope`. The viewer obtains/resumes the assignment attempt, selects an eligible SO-101, requests attempt scope, connects with `vista.twin.<token>` as the WebSocket subprotocol, validates robot/frame schema, displays joints/stale state, and clears/disconnects on navigation, logout, session expiry, or socket close. No token is persisted and no physical command is sent.
- Blockly now reads authoritative attempt state and injects a read-only workspace after submission. The run flow polls the schematic experiment until a terminal result (45-second UI bound); local pose animation remains limited to explicitly selected Demo mode. Assignment details and released grade/feedback fields are displayed only when returned.
- Updated API contracts, README, and actionable backend handoff. Existing Electron security settings and disabled physical execution path remain intact.

## Source-verified contracts

See `API_CONTRACTS.md`. Key routes: student login and `PATCH /auth/students/password`; Supabase refresh/logout; assigned learning and attempt routes; Blockly program/version/submission; server schematic experiment lifecycle; attempt-scoped Twin viewer scope and `/ws/twin` subprotocol. Source review does not establish live deployment parity.

## Local tests and builds

- `npm test`: 13 passed, 0 failed, including temporary-password restriction/refresh/change, attempt-scoped Twin route payload, refresh/logout, API error codes, URL validation, IPC sender checks, and disabled physical mutation methods.
- `npm run typecheck`: passed the repository's JavaScript syntax checks; no TypeScript source/compiler is configured.
- `npm run build:renderer`: passed after the implementation changes.
- `npm run test:integration`: refused to start because isolated API/Supabase URLs and disposable student/attempt fixtures are missing. No integration request was made.
- `npm run smoke` passed after the final application changes when run outside the restricted process sandbox. Actual Electron Demo, extracted AppImage payload, and extracted DEB payload stayed active until their 12–20 second timeouts with normal Electron security enabled. The final AppImage/DEB/NSIS artifacts were rebuilt. The AppImage requires FUSE for direct mounting (unavailable here), and Windows runtime acceptance requires actual Windows. Full evidence and SHA-256 values are in `TEST_REPORT.md`.

## Remaining dependencies and release status

- No isolated GoTrue/Education API/Twin runtime or disposable test account/resources were supplied; live auth, write, Twin WebSocket, cross-attempt and cross-school end-to-end checks remain unverified.
- Education API does not yet automatically revoke Twin viewers on attempt submission or allocation/entitlement revocation; token TTL ≤60 seconds bounds but does not eliminate this window.
- Operator must provide the correct Twin WSS endpoint per test environment.
- SO-101 URDF/STL/GLB redistribution rights are not fully confirmed in `ASSET_PROVENANCE.md`; do not publish installers until the asset owner resolves them.
- Prior package evidence: Linux AppImage/DEB and Windows NSIS artifacts existed; AppImage runtime was blocked by Electron sandbox restrictions in this container, DEB payload was not runtime-accepted, and NSIS validation under Wine is not Windows acceptance. Rebuild/package hashes need refreshing after these source edits.

Release readiness: **integration-ready source implementation; not live-accepted or publicly distributable**. Next steps: provision isolated local/staging services + disposable fixtures, run `INTEGRATION_ACCEPTANCE_CHECKLIST.md`, verify target Ubuntu AppImage/DEB launch on a normal host, rebuild/inspect artifacts, then install/run NSIS on a real Windows VM. Keep Production and physical robot paths disabled.
