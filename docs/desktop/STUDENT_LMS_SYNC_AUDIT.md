# Student LMS sync audit

Audit date: 2026-11-20
Desktop source: `main` at `dbbe76db8bee15b0f6afe24b5d256a3a8b87da52` plus the preserved working-tree changes.
Read-only Web/API source: `/home/quangduc/Code/vista/se-sprint-90` at `f9fc13f25a2f9eaf7207a1731d6ea2207abf5e14`.

## Contract and identity findings

The Web LMS student login in `web/robot-edu/src/pages/Login.tsx` calls `studentAuthApi.login` with `schoolCode`, `studentCode`, and `password`, then installs the returned access/refresh tokens into its Supabase client. `web/robot-edu/src/lib/api.ts` maps that method to `POST /api/v1/auth/students/login`. Desktop uses the same route and payload in `api.js`; both receive the same standard GoTrue session contract. Desktop keeps its tokens in the Electron main process and secure session storage. This establishes identity-contract parity; a real shared-account sign-in was not run in this environment.

The current Education API source defines these authenticated student routes:

| Need | Route | Evidence / behavior |
|---|---|---|
| Current identity | `GET /api/v1/me` | `LearningController`/identity auth guard |
| Assigned labs and current attempt/status/due/score/released feedback | `GET /api/v1/me/learning` | `LearningService.myLearning`; filtered by the authenticated user’s active enrollment and classroom membership |
| Map a classroom delivery to an enrolled course | `GET /api/v1/me/enrollments` | Returns the student’s enrollment rows including `course_id` and `classroom_id` |
| Course lesson progress | `GET /api/v1/me/learning-path` | Returns enrolled course `id`, `title`, `completedLessons`, `totalLessons`, and server-computed `progressPercent` |
| Assignment detail | `GET /api/v1/classroom-assignments/:classroomAssignmentId` | Student classroom access is checked by the service |
| Start/resume attempt and reload attempt | `POST /api/v1/classroom-assignments/:id/attempts`, `GET /api/v1/me/attempts/:id` | Start route is learner scoped; read route is `/me` scoped |
| Blockly persistence/version history | `GET/POST /api/v1/me/attempts/:attemptId/program`, `PATCH /api/v1/me/programs/:programId`, `GET/POST /api/v1/me/programs/:programId/versions` | Existing authenticated routes |
| Server schematic execution/result | `POST /api/v1/me/attempts/:attemptId/experiments`, `POST /api/v1/me/experiments/:id/run-schematic`, `GET /api/v1/me/experiments/:id`, `/events`, `/result` | Schematic service persists server experiment status and result; this is not local MuJoCo execution |
| Submit and refresh LMS status | `POST /api/v1/me/attempts/:attemptId/submission`, then `GET /api/v1/me/attempts/:id` and `GET /api/v1/me/learning` | The same `/me/learning` projection is consumed by the Web LMS student workflow |

Desktop now resolves the course ID for each delivered lab by joining the lab’s classroom ID to the authenticated student’s enrollment, then joins that course ID to `/me/learning-path`. It renders lesson progress only from the returned `progressPercent` and lesson counts. It no longer derives a course percentage from the count of completed assignments. When learning-path data is unavailable or has no exact course-ID match, the UI omits the progress bar and shows the number of assigned labs instead.

The My Labs view renders backend assignment title, course title, assignment/attempt status and due date. Blockly opens the actual classroom assignment, starts or resumes its attempt, reads the saved server program and immutable versions, and retains the prior owner/tenant checks in Education API. After a save, Desktop reloads the program and version list from the server. After submit, it reloads the attempt and assigned-learning projection while keeping the result visible; My Labs re-fetches on return instead of replacing the workspace prematurely.

Demo fixtures remain available only through `VISTA_DESKTOP_DEMO=1` or the browser-only preview shim. Electron defaults to `mock: false`; the real student workflow does not fall back to demo records on authentication/API errors.

## Contract gap: local MuJoCo result persistence

The backend contract persists **server schematic** experiment results through the experiment routes above. It does not expose an existing authenticated student route for uploading a result produced by the Desktop’s local MuJoCo runtime. Desktop therefore does not send local simulation output to an internal Twin/server-only route and does not claim local MuJoCo results appear in Web LMS. The backend owner must provide an approved student-authenticated result-ingestion contract (including attempt/version ownership, payload schema, validation, idempotency, retention, and how Web LMS reads it) before this data can be persisted. No new endpoint has been invented here.

## Acceptance matrix

| Feature | Result | Evidence |
|---|---|---|
| Same student auth identity contract as Web LMS | **PASS — source/contract** | Web Login and Desktop call the same student login route/body and consume the same GoTrue tokens; no live sign-in performed |
| Real assigned courses/labs/status/due date | **PASS — implementation/source** | `/me/learning`; backend query is student enrollment and classroom-membership scoped |
| Course progress | **PASS — implementation/source** | `/me/enrollments` → exact course ID → `/me/learning-path.progressPercent`; synthetic assignment-count percentage removed |
| Attempt start/resume and ownership | **PASS — source/implementation** | Existing authenticated start/read routes; no local live attempt was created |
| Blockly save/version reload | **PASS — contract tests; live blocked** | New API contract test verifies authorized `/me/enrollments` and `/me/learning-path`; UI now reloads saved program and versions |
| Server schematic simulation and result | **PASS — source/implementation; live blocked** | Uses existing authorized schematic lifecycle/result routes |
| Local MuJoCo result persistence in LMS | **BLOCKED — backend contract absent** | Existing experiment route is explicitly schematic; no approved local MuJoCo ingestion route exists |
| Submission reflected in Web LMS | **BLOCKED — live account test absent** | Desktop refreshes server attempt and `/me/learning`; live Web LMS view could not be exercised without local API/GoTrue and a disposable student |
| Tenant/enrollment/attempt authorization | **PASS — source; live blocked** | Education API `myLearning`, assignment, and attempt services scope records to authenticated student/classroom/enrollment; no real cross-tenant request executed this run |
| Browser Demo smoke | **PASS — Demo only** | Chromium completed My Labs → Blockly → Save → version → schematic fixture → submit → refreshed attempt state; not authenticated API evidence |
| API-level real E2E | **BLOCKED** | No API/GoTrue listeners on `3001`, `54321`, `54323`; no test account variables supplied; Docker daemon returned permission denied |
| Browser UI real-student E2E | **BLOCKED** | No local authenticated stack/account; browser fixture smoke is Demo-only and is not counted as LMS acceptance |

## Test evidence and reproducible blocker

- `npm test`: **PASS**, 20 API contract checks plus 3 Node test files (3 passed, no failures). Includes a new authorized route test for enrollment and course-progress reads.
- `npm run typecheck`: **PASS** (JavaScript syntax checks).
- `git diff --check`: **PASS**.
- `timeout 90s npm run smoke`: **PASS — browser Demo fixture only**. Chromium completed the Save/version/schematic/submit UI path and confirmed that submission refresh no longer navigates away from the workspace. It did not call Education API or GoTrue.
- A real API + GoTrue + disposable database run was not possible: loopback services `:3001`, `:54321`, `:54323`, and Twin `:8767` were not listening, and the environment denied access to `/var/run/docker.sock` (`permission denied`). `npm run test:integration` requires disposable student/attempt variables that are not present. The backend’s older `scripts/local_integration_stack.sh` was not used because it kills generic `node dist/main` processes and removes fixed-name containers/fixture files; the backend handoff explicitly warns against using it while shared backend work is active.
- No Production, AWS, or physical hardware was accessed.

## Final acceptance retry — 2026-11-20

This retry was read-only until Desktop unit/contract checks; no API/database writes were made.

| Check | Result | Evidence |
|---|---|---|
| Preserve current Desktop tree | **PASS** | Existing 24 changed/untracked paths remained; no reset, commit, or push |
| Local API/GoTrue/database listeners | **BLOCKED** | No listeners on the expected local ports (`3001`, `3012`, `3013`, `54321`, `54323`, `55432`, `55497`) |
| Docker availability | **BLOCKED** | `docker info` returned `permission denied` for `/var/run/docker.sock`; no escalation or bypass attempted |
| Safe launcher in current backend checkout | **BLOCKED** | `local_integration_stack.sh` uses fixed container names/ports and kills generic `node dist/main` processes; `local_student_auth_harness.sh up` calls `down` first, kills fixed ports/process patterns, and removes `/tmp/vista-sa-harness` |
| Disposable DB config | **PARTIAL** | `docker-compose.education-test.yml` is tmpfs/loopback but fixed to port 55432 and starts only PostgreSQL; `docker-compose.education-local.yml` supports a unique DB name/password/port and tmpfs, but does not start API or GoTrue |
| Desktop contract suite | **PASS** | `npm test`: 20 API contract checks and 3 Node test files passed |
| Real Student/API E2E | **BLOCKED** | `npm run test:integration` exited before network calls because required test-only API, GoTrue, student and attempt variables are absent |
| API/database persistence evidence | **NOT RUN** | No real login, assignment, attempt, Blockly, version, result or submission writes were possible |
| Web LMS same-attempt readback | **NOT RUN** | The Web client uses `/me/learning`; no local services were available to query after submission |
| Cross-student/tenant denial | **NOT RUN** | Requires the isolated local API and disposable second-school student |

### Minimal safe host-side setup

The existing backend scripts must **not** be run for this acceptance as-is. On a host terminal with Docker access, use the backend's documented isolated acceptance recipe in `docs/operations/phase-2-4-3-local-acceptance.md` to create a fresh, unique `vista_test_<run-id>` target on an unused loopback port, dedicated Docker network, and PostgreSQL tmpfs. `docker-compose.education-local.yml` can provide the uniquely named DB container when passed a unique Compose project, DB name, password, and unused port; first verify the selected port and container/project names do not collide. Apply the schema using the guarded `scripts/bootstrap_dev_database.py --confirm-local-bootstrap`, then seed a fresh fixture file under `/tmp` using `phase243-e2e-fixtures.js` with the exact test DB identity variables. Do not use a hosted Supabase or Production URL.

For real student authentication, start the pinned GoTrue `v2.197.0` and local auth proxy from the procedure in `docs/operations/student-temp-password.md`, but with a **namespaced launcher**: unique GoTrue container name, unique private `/tmp` key directory, unique unused loopback ports, no teardown of existing processes, and the same disposable PostgreSQL target. The checked-in `scripts/local_student_auth_harness.sh` is unsafe for a shared machine because its `up` path invokes destructive `down`; it needs a safe namespaced variant before use. Run the Education API against that same DB and local GoTrue, and configure both Web LMS and Desktop to the same local API/GoTrue endpoints and same disposable student credentials. Then run `npm run test:integration` with the `VISTA_TEST_*` variables listed in `INTEGRATION_TEST_SETUP.md`; enable mutations only against a fresh disposable assignment, and verify the resulting `attempt_id` and status through the same `/me/learning` projection used by Web LMS. Do not clean up anything except resources created with that unique run ID.

This environment cannot perform those host operations because Docker socket access is denied. The safe follow-up is to run the isolated setup from an authorized host terminal or provide a non-destructive namespaced launcher and local test credentials; there is no safe sandbox-side workaround.

## Isolated LMS E2E retry — 2026-11-20

This retry incorporates the host state reported by the user. The host reports Docker Engine 29.1.3 operational, shared Supabase PostgreSQL at `127.0.0.1:54322`, GoTrue/Gateway at `127.0.0.1:54321` with auth health HTTP 200, and Education API `127.0.0.1:3001` stopped. These host observations could not be independently confirmed inside this sandbox: loopback requests failed with `Operation not permitted`, while `docker info` and `docker ps` failed with permission denied on `/var/run/docker.sock`. That is a sandbox access boundary, not evidence that the host services are unhealthy.

The shared Supabase stack was not used. Even a login-only test would create/update GoTrue session state, so using it would violate the no-shared-state-mutation requirement. The Education API is also not running, and no isolated GoTrue/PostgreSQL services were available. No fixtures or writes were created.

| Acceptance | Result | Evidence |
|---|---|---|
| Host Docker and shared Supabase | **BLOCKED — sandbox visibility/access** | User reports host services healthy; `docker info`/`ps` denied on Docker socket and loopback `curl` denied by sandbox policy. |
| Safe isolated PostgreSQL + GoTrue + API stack | **BLOCKED — no permitted runtime path** | Docker socket is unavailable. Checked `podman`, `nerdctl`, `docker-compose`, `supabase`, `gotrue`, and PostgreSQL server tools; they are absent. Only PostgreSQL client utilities are installed. |
| Real student login / same Web LMS identity | **BLOCKED — not exercised** | No isolated GoTrue/API; shared GoTrue intentionally not reused. Identity contract remains source-verified only. |
| Enrolled courses, assigned labs, due dates, server progress | **BLOCKED — live reads not exercised** | Desktop reads the existing `/me/enrollments`, `/me/learning`, and `/me/learning-path` contracts; no authenticated API session was available. |
| Attempt start/resume and ownership | **BLOCKED — no disposable API fixtures** | No attempt was created or read. |
| Blockly save/version PostgreSQL persistence | **BLOCKED — no database/API** | No program or version writes were attempted. |
| Submission and Web LMS same-attempt readback | **BLOCKED — no database/API** | No submission was made; Web LMS `/me/learning` projection was not queried. |
| Cross-student and cross-tenant denial | **BLOCKED — no disposable identities** | No authorization probes were sent. |
| Desktop offline checks | **PASS** | `npm test`, `npm run typecheck`, `node --check scripts/integration-acceptance.cjs`, and `git diff --check` passed. These do not establish backend acceptance. |
| Real Chromium UI using API responses | **BLOCKED — not run** | Prior Chromium smoke was Demo-fixture only; this retry had no reachable API/auth services. |
| Local MuJoCo result persistence | **BLOCKED — backend contract absent** | No student-authenticated local-result ingestion route exists in inspected contracts; no internal server route is called by Desktop. |

### Minimal host-side action to unblock

Run acceptance from the authorized Ubuntu host terminal where Docker and loopback networking work, using a fresh unique run namespace, dedicated network, unique loopback ports, and PostgreSQL tmpfs as documented in `INTEGRATION_TEST_SETUP.md` and the backend's `docs/operations/phase-2-4-3-local-acceptance.md`. Start pinned GoTrue and the Education API against that disposable DB; do not point GoTrue at the shared `:54322` database and do not reuse `:54321` for mutations. Use only test-created school/student/assignment/attempt data and provide the harness's `VISTA_TEST_*` values in that host process environment. The backend's existing fixed-name teardown launchers are unsafe for this shared machine and must not be run; use a namespaced launcher that only stops resources bearing its unique run ID. Then run the API acceptance first and separately point Desktop and Web LMS browser sessions to the same local test API/auth endpoints to verify the persisted attempt projection.

No Docker permission escalation or sandbox workaround was attempted. No backend, shared container, database, AWS resource, or physical robot was modified. The Desktop working tree remains preserved; no commit or push was made.

## Host runner delivered — 2026-11-20

Added executable `scripts/run-isolated-lms-e2e.sh`. It uses an isolated Compose project and loopback-only ephemeral ports, PostgreSQL tmpfs, real pinned GoTrue, generated per-run passwords/JWT signing keys, the backend's guarded database bootstrap and supported Phase 2.4.3 fixture seeder, and a temporary API source copy. It refuses baseline digest mismatch, insufficient available memory, missing tools, port/name collisions, and unproven Compose ownership. Cleanup checks Compose project labels and stops only its own tracked API/proxy PIDs and Compose resources. Private logs/exit evidence are retained under `/tmp` with mode 0700; private config and generated credentials are removed.

`bash -n scripts/run-isolated-lms-e2e.sh`, `scripts/run-isolated-lms-e2e.sh --self-test`, `node --check scripts/integration-acceptance.cjs`, and `git diff --check` passed. The live runner was **not** executed inside the IDE because localhost TCP remains restricted. No E2E result is claimed. Host command: `scripts/run-isolated-lms-e2e.sh` from the Desktop repository root. This is API-level acceptance, not Electron/Web LMS browser UI acceptance.
