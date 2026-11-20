# Isolated Desktop integration test setup

No isolated Education API/Supabase endpoint or test account was supplied for this Phase 4 run. The harness uses disposable local/staging accounts, runs reads by default, and refuses the known Production API host. Supply only test credentials through the process environment; never commit `.env` files or put credentials in installer configuration.

## Prerequisites

1. Use the latest backend sprint checkout for contracts and fixtures. **Do not run the shared `scripts/local_integration_stack.sh up` while Claude's backend processes/worktree are active:** it kills matching API processes, removes fixed-name containers, and rebuilds backend output. Request a uniquely named isolated variant from the backend owner. Its guarded database bootstrap must pass the pinned schema fingerprint before seeding; Queue 2 observed a fingerprint mismatch (see `CLAUDE_BACKEND_HANDOFF.md`).
2. The stack script does not start GoTrue. Follow the local-only GoTrue + loopback reverse-proxy procedure in the backend `docs/operations/student-temp-password.md` (“Real-integration test harness (local only)”, GoTrue `v2.197.0`). Do not use hosted/Production Supabase or service-role credentials in Desktop environment variables.
3. Seed test-owned student/classroom/assignment/attempt/robot/entitlement data using the backend’s local E2E fixture procedure. Create two schools and separate students. For the temporary-password suite, provision a fresh student whose login response sets `password_change_required`; the test changes that account permanently, so create a new disposable student for each run.
4. Start the Digital Twin test service on loopback and seed a simulation frame for the authorized attempt. Use `ws://127.0.0.1:8767/ws/twin`. Set `VISTA_TEST_ENABLE_TWIN=1` only after the attempt is allocated to and entitled for the test robot.

The script checks login, invalid password/wrong school, Supabase refresh and logout, `/me`, `/me/learning`, and cross-school attempt denial. Optional suites cover a fresh temporary-password account and change, Blockly save/reload/validation/version/submission locking, authorized schematic lifecycle, attempt-bound Twin scope, cross-school scope denial, and a real WebSocket connection. An optional `VISTA_TEST_EXPIRED_ACCESS_TOKEN` checks rejection of an actual expired test token. Each mutation requires isolated test-owned accounts and resources. Immediate Twin revocation, stale-frame handling, and Desktop UI retry still require a live browser/Electron scenario with controlled test services; the HTTP harness alone cannot establish them.

## Run

Provide these variables in the shell that launches the test:

```sh
export VISTA_TEST_EDUCATION_API_URL=http://127.0.0.1:3001/api/v1
export VISTA_TEST_SCHOOL_CODE='disposable-school-a'
export VISTA_TEST_STUDENT_CODE='disposable-student-a'
export VISTA_TEST_STUDENT_PASSWORD='provided-by-test-seed'
export VISTA_TEST_SUPABASE_URL=http://127.0.0.1:54323
export VISTA_TEST_SUPABASE_ANON_KEY='local-public-anon-key'
export VISTA_TEST_OTHER_SCHOOL_CODE='disposable-school-b'
export VISTA_TEST_OTHER_STUDENT_CODE='disposable-student-b'
export VISTA_TEST_OTHER_STUDENT_PASSWORD='provided-by-test-seed'
export VISTA_TEST_ATTEMPT_ID='test-owned-attempt-uuid'
npm run test:integration
```

For remote staging, set `VISTA_TEST_ALLOW_STAGING=1`, use an Education API hostname with a `staging` label, and set `VISTA_TEST_SUPABASE_PROJECT_REF` to the isolated hosted Supabase project ref. The harness rejects `api.skynex.best`, non-local endpoints without that explicit staging opt-in, and mismatched Supabase project refs. It does not write Education records; login creates provider sessions for the supplied disposable accounts.

The base harness refreshes the Supabase session and verifies login, `/me`, `/me/learning`, and cross-school denial when a test-owned attempt is supplied. For temporary-password acceptance, provide a newly provisioned temporary-password account and unique replacement password (the account is permanently changed by this test):

```sh
export VISTA_TEST_TEMP_SCHOOL_CODE=disposable-school
export VISTA_TEST_TEMP_STUDENT_CODE=disposable-temp-student
export VISTA_TEST_TEMP_PASSWORD=temporary-password-from-local-seed
export VISTA_TEST_TEMP_NEW_PASSWORD=distinct-new-password-12-chars
npm run test:integration
```

To opt into writes against a fresh disposable assignment, configure:

```sh
export VISTA_TEST_ENABLE_MUTATIONS=1
export VISTA_TEST_ASSIGNMENT_ID='fresh-test-assignment-uuid'
export VISTA_TEST_WORKSPACE_JSON='{"blocks":{"languageVersion":0,"blocks":[]}}'
export VISTA_TEST_ROBOT_PROGRAM_JSON='{"kind":"robot_program","schemaVersion":1,"steps":[]}'
npm run test:integration
```

The supplied program/workspace must satisfy that assignment's curriculum validation. Recreate the disposable assignment/attempt before rerunning because submission mutates it. Optional simulation execution (real backend schematic only) is enabled with `VISTA_TEST_ENABLE_SIMULATION=1`. For attempt-bound Twin grant and WebSocket acceptance, add `VISTA_TEST_ENABLE_TWIN=1`, `VISTA_TEST_ROBOT_ID`, and an isolated `VISTA_TEST_TWIN_WS_URL` (`ws://127.0.0.1:8767/ws/twin` locally or explicitly opted-in staging WSS). The script rejects Production API hosts and remote Twin hosts without staging opt-in. `npm test` covers offline contract/error mapping and security checks; it does not substitute for live acceptance.

## Cleanup

Delete the disposable Supabase project and seeded Education API resources after acceptance. Revoke any staging credentials that were exported into a shared shell. Do not run mutation acceptance against Production.
