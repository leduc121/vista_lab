# Queue 2: real API integration acceptance

Date: 2026-11-20. Backend source was read only from the latest available backend sprint checkout; the default backend checkout was not used. No Production, AWS, physical robot, or Git operation was performed.

## Evidence classification

| Class | Result |
| --- | --- |
| PASS with real Education API | **None.** No real student journey or Twin WebSocket was executed. |
| PASS with local stubs/mocks | `npm test`: **16/16**. Covers auth refresh/rotation/logout, offline retry, temporary password mapping, API routes, the source-verified program update array response, IPC sender checks, and endpoint validation. The prior Demo renderer smoke is not real API acceptance. |
| BLOCKED by backend/environment | Fresh guarded PostgreSQL bootstrap generated fingerprint `e146917cb96753615a75c000eb6727998d64b65f64990f36578c3858d8220a4`; pinned expectation is `0b9a1eebd76741e5d2267fbf51e7a11acb8f2662c024487f68bbd341be0e7638`. Fixture seeding and service startup were stopped at that gate. No disposable GoTrue student accounts or test-owned attempt variables exist. |
| FAIL | Backend disposable schema verification failed. No Desktop real API assertions ran or failed. `npm run test:integration` exited 2 at its configuration preflight, before a network call. |

## Attempted isolated setup

Cached PostgreSQL 17 and RustFS images started new containers `vista-desktop-q2-pg` and `vista-desktop-q2-s3`, each with tmpfs and loopback-only ports. The backend's guarded bootstrap ran only against the new empty `vista_test_desktop_q2` database. Its final fingerprint verification failed; the manifest and expectation list the same migrations D through P. No fixture, GoTrue, Education API, or Twin service was started. Both Queue 2 containers were removed. Shared or existing Supabase containers were not touched.

The existing backend `local_integration_stack.sh` was inspected but not run because it removes fixed-name containers, kills matching API processes, and rebuilds files in Claude's active backend worktree. The exact handoff is in `CLAUDE_BACKEND_HANDOFF.md`.

## Desktop changes and executable acceptance coverage

The current Education API `ProgrammingService.updateProgram()` returns a one-element `UPDATE … RETURNING` array. The Desktop API client now unwraps and validates that row before version creation. A unit test reproduces that real response shape. The integration harness now asserts invalid credentials and wrong school rejection; real program save/reload/validation/update/version round trip; schematic terminal response; final submission and post-submission write denial; cross-school assignment/attempt denial; optional expired-token rejection; new Twin scope denial after submission; and Supabase logout/refresh rejection. These are executable once the isolated fixtures and services exist, but have **not passed against a real API**.

`npm run typecheck` passed JavaScript syntax checks; this repository has no TypeScript compiler. `npm run test:integration` reported missing `VISTA_TEST_*` variables and exited 2 without contacting any server. No installer was rebuilt in this queue.

## Remaining acceptance work

1. Backend owner reconciles the disposable schema fingerprint, keeping the bootstrap gate enabled, and supplies a uniquely named local stack that does not interrupt shared API processes or rebuild Claude's worktree.
2. Provision real local GoTrue identities and disposable standard, temporary-password, and other-school students through the backend test procedure. Seed only test-owned classroom/assignment/attempt/robot data. Supply public test Supabase configuration, never a Production or service-role credential to Desktop.
3. Run `npm run test:integration` with the required test-only variables, enabling mutations, schematic execution, and Twin in sequence. Record HTTP bodies/statuses and server results without logging passwords or tokens.
4. Add controlled Electron/browser acceptance for Twin frame updates, stale data, network loss and retry, and the complete student journey. Verify released grade/feedback only after an instructor test fixture supplies it.
5. Backend owner wires immediate `POST /internal/revoke-attempt` on submission and allocation/entitlement withdrawal; then test existing-socket 4403, buffered-frame removal, and cross-attempt isolation. Physical motion remains disabled.

Status: **real API acceptance blocked at backend disposable schema verification; Desktop contract tests pass, live Desktop behavior remains unproven.**
