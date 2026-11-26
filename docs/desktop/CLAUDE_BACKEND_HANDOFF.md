# Backend handoff: Desktop integration acceptance

> **Status refresh — 2026-11-25:** The dated notes below contain historical blockers, some now superseded by the read-only Web source snapshot. The available `se-sprint-90` source documents attempt-scope revocation as implemented and documents local Web WF03/WF04 evidence flows. It is still 81 commits behind its `origin/main` ref and has unrelated dirty files, so this is not a statement about the latest remote or deployed service. The Desktop-specific evidence gap remains: no supported route accepts Desktop `vista.robot.recording.v1` episodes and binds them to a student's submitted attempt. See [Final Education Platform Integration Handoff](FINAL_EDUCATION_PLATFORM_INTEGRATION_HANDOFF_2026-11-25.md) for the verified MQTT payload comparison, tests, AWS gates, and exact Claude actions.

Reviewed read-only against the backend `docs/acceptance/DESKTOP_API_CONTRACTS.md` and the corresponding Education API/Twin source on 2026-11-19. The Desktop now targets the contracts below. This is source verification, not a claim of live or Production acceptance.

## Contracts the Desktop consumes

- Student auth: `POST /api/v1/auth/students/login` with `{ schoolCode, studentCode, password }` returns a public Supabase session and `password_change_required`. Restricted JWTs can access only `PATCH /auth/students/password`, `{ currentPassword, newPassword }`, until password change. The route returns a replacement public session. Supabase refresh/logout remain `/auth/v1/token?grant_type=refresh_token` and `/auth/v1/logout` using public config only.
- Student assignments and attempts: `GET /me`, `GET /me/learning`, `GET /classroom-assignments/:id`, `POST /classroom-assignments/:id/attempts`, `GET /me/attempts/:id`.
- Blockly: `GET/POST /me/attempts/:attemptId/program`, `PATCH /me/programs/:id`, `GET/POST /me/programs/:id/versions`, `POST /me/attempts/:attemptId/submission`. Restore is local from immutable version data; there is no server restore route.
- Schematic: `POST /me/attempts/:attemptId/experiments`, `POST /me/experiments/:id/run-schematic`, then poll `GET /me/experiments/:id` and read `/events`, `/result`. It is not the MuJoCo service and not physical execution.
- Twin availability and attempt viewer: `GET /robots/digital-twin/availability`; `POST /me/attempts/:attemptId/digital-twin/viewer-scope` with `{ robotId, labSessionId? }`. Connect to operator `WS /ws/twin` with subprotocol `vista.twin.<token>`. Scope is limited to an in-progress owned attempt, its assignment/classroom, allocated robot, active membership/permission, and entitlement. Telemetry is filtered by robot and attempt. Close 4403 means request a fresh scope; never reuse a token.

## Remaining backend dependencies for live acceptance

1. Wire Education API attempt submission and robot allocation/entitlement revocation to Twin `/internal/revoke-attempt` so open sockets close immediately and buffered frames are cleared. Current scope TTL (≤60 seconds) is only a bounded fallback.
2. Publish an operator-owned `VISTA_TWIN_WS_URL` per isolated test/staging environment. The Education API does not discover the Twin host.
3. Provide a disposable local/staging Supabase GoTrue + Education API environment and test-owned data: temporary-password account, other-school student, assignment, writable attempt, allocated/entitled SO-101, and Twin endpoint. Do not use Production accounts/data.
4. Backend test evidence should include revoked open socket, expired scope, cross-attempt, cross-school, wrong robot, and allocation/entitlement revocation. Existing backend source docs cover broker-side cases; Desktop still needs the service running for end-to-end acceptance.

## Suggested isolated acceptance sequence

1. Use a disposable temporary-password student. Confirm login sets `password_change_required`, normal `/me`/learning calls return `PASSWORD_CHANGE_REQUIRED`, password change returns a replacement session, and old JWT returns `SESSION_ROTATED`.
2. Refresh the replacement session; retrieve `/me` and `/me/learning`; open the assigned detail and start/resume an attempt.
3. Create/update Blockly program, review server validation, create/list versions, restore locally, create a new version, execute the schematic route and poll terminal status, then submit. Confirm frozen workspace after submission and released grade/feedback display when present.
4. Issue a viewer scope for this attempt and its classroom robot; connect over configured WSS. Verify correct joint frame updates and stale/disconnect state.
5. Try another student's attempt, another school's attempt/robot, a submitted attempt, a wrong robot, and an expired/revoked scope; expect denial/no cross-attempt frames/4403 as appropriate.
6. Close the app and verify logout/session persistence behavior. Inspect packaged files for runtime secrets; never use service-role credentials.

The Desktop executable harness and exact local setup variables are in `INTEGRATION_TEST_SETUP.md` and `scripts/integration-acceptance.cjs`. Physical motion is deliberately disabled and remains outside this sprint.

## Queue 2 isolated acceptance blocker (2026-11-20)

Codex attempted a fresh, uniquely named PostgreSQL 17 container (`vista-desktop-q2-pg`) with tmpfs data, database `vista_test_desktop_q2` on loopback port 55582. The guarded backend command `scripts/bootstrap_dev_database.py --confirm-local-bootstrap` stopped at final schema verification: generated fingerprint `e146917cb96753615a75c000eb6727998d64b65f64990f36578c3858d8220a4` versus pinned `database/baselines/dev-schema-expectation.json` fingerprint `0b9a1eebd76741e5d2267fbf51e7a11acb8f2662c024487f68bbd341be0e7638`. Manifest and pinned ledger version lists match (D through P). No fixture seed, GoTrue, Education API, or Twin was started against the unverified schema. Both newly created containers were removed. Please reconcile the schema difference and update the pinned expectation only after inspecting the actual catalog diff and confirming it is intended. Then provide a reproducible local stack command that passes the pin without modifying Production.

The current `scripts/local_integration_stack.sh up` removes fixed-name containers, kills every matching `node dist/main` process, and rebuilds `services/education-api/dist` inside the shared backend checkout. It is unsuitable for a Desktop-only acceptance run while Claude owns that worktree. Please provide an isolated variant with unique container/process ownership, loopback ports, a copied/prebuilt API output, and a matching real GoTrue setup. The Desktop harness requires disposable standard and fresh temporary-password students, an other-school student, a fresh assigned Blockly task/attempt, and an allocated/entitled SO-101 simulation.

## Immediate Twin revocation contract to wire

The Twin service already exposes `POST /internal/revoke-attempt` (signed simulation-publisher Bearer scope) with JSON `{ "organization_id": "<school UUID>", "robot_id": "<allocated robot UUID>", "attempt_id": "<attempt UUID>" }`. It returns **202** `{ "status": "revoked", "attempt_id": "<attempt UUID>" }`; invalid scope/body returns **403**. It closes matching viewers with WebSocket code **4403**, clears that attempt's buffered simulation frames, and rejects later publishes for the revoked attempt. Education API must call this route after final submission and on classroom robot allocation or entitlement removal, using its server-side publisher credential. Revocation failures need a retry/outbox path; otherwise an already open viewer can receive attempt telemetry until its scope expires (at most 60 seconds). No renderer or Desktop endpoint should call the internal route.

Backend acceptance tests should assert: an open student socket receives 4403 immediately on submission or allocation/entitlement withdrawal; its old scope cannot reconnect; the submitted attempt cannot obtain a new scope (404); another attempt remains connected; cross-school/cross-attempt/cross-robot access remains denied. The Desktop harness now checks the student-facing new-scope denial after submission when Twin testing is enabled. It cannot prove immediate closure until the Education API wiring exists.

## Queue 5 final handoff (2026-11-20)

Desktop contract/security tests now pass **19/19**; local UI smoke, Linux packaged launches, and all three private installer checksums pass. No isolated `VISTA_TEST_*` environment was supplied, so the executable integration harness was **not run** against a live API in this pass. Please resolve the guarded disposable schema fingerprint mismatch above, provide a non-disruptive local GoTrue/Education API/Twin stack with disposable school/student/task/attempt/allocation fixtures, and wire immediate Education API-to-Twin revoke on submission and allocation/entitlement withdrawal. Then run the sequence in `INTEGRATION_ACCEPTANCE_CHECKLIST.md` and `INTEGRATION_TEST_SETUP.md`, including an already-open socket 4403 test. Do not interpret local contract tests as a live integration pass. Physical motion stays disabled.
