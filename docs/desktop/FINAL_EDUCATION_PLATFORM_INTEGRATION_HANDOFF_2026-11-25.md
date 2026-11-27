# VISTA Lab Station — Final Education Platform Integration Handoff

**Date:** 2026-11-26  
**Scope:** Desktop repository changes plus read-only source/network inspection. No files in `se`, Web, Backend, or AWS were changed. One public, unauthenticated Production capability GET was made; no student data, authenticated Production route, AWS resource, or physical device was accessed.

## Runtime ownership addendum — 2026-11-27

The final Desktop supervisor's child is `edge/runtime.py` in source mode or its PyInstaller binary in packaged Simulation mode. Robotics mode uses the explicitly selected Python/source pair. The local configuration checked in this pass has the default Simulation profile and no Robotics override. The separate R1 implementation is `/home/quangduc/Code/vista/se-final-rc/services/robot-runtime`, exposed as port 8015 in local Compose; the Desktop application does not launch it. The inspected API deploy script does not deploy that R1 service, and the actual Edge host source/install/command remains unknown. Thus the Desktop MuJoCo telemetry and local Shadow code do not correct the R1 source or establish Cloud acceptance. The checked R1 source also has no SO-101 physical adapter or physical measured telemetry. See the current [AWS Acceptance Runbook](AWS_ACCEPTANCE_RUNBOOK.md) and [Final Acceptance Evidence](FINAL_ACCEPTANCE_EVIDENCE.md) for the exact owner checkpoint and focused artifact procedure.

## Decision

**Desktop local WF03 contract: PASS with mock services and simulated execution only. Education Platform/WF03 integration: PARTIAL. Desktop has a student-authenticated recording upload path for stopped `PHYSICAL_ROBOT` episodes; it deliberately rejects `SIMULATION`, `MOCK_RUNTIME`, and unverified episodes. The Desktop MuJoCo-to-submission evidence journey remains BLOCKED. WF04 for a Desktop MuJoCo run: BLOCKED. AWS E2E: BLOCKED / NOT RUN. Physical acceptance: BLOCKED / NOT RUN.**

The local journey below proves the current Desktop command/runtime/safety/recording boundary. Source inspection confirms the separate Desktop uploader at `POST /api/v1/me/experiments/:experimentId/recordings/uploads` only accepts stopped `PHYSICAL_ROBOT` recordings. That route does not provide the MuJoCo evidence path.

The available Education API source does provide a supported, submission-linked **schematic result** path. It creates a `LearningExperiment` from the authenticated student's attempt and exact immutable ProgramVersion, persists a deterministic result in `output_snapshot` plus metrics/events, and projects that result in authorized instructor submission review. The backend explicitly rejects `executionMode: "simulation"` for this route; its schematic interpreter is not MuJoCo or physics. Desktop already runs this path with a distinct “VISTA schematic” action. This can satisfy the supported server-schematic journey when the assignment supports it, but cannot persist a result or telemetry produced by the separate local MuJoCo button.

One Desktop-side retrieval defect was found and fixed: the renderer already requested `/me/experiments/:id/artifacts`, and the API client implemented that authenticated route, but Electron's main-process method allowlist rejected it. `experimentArtifacts` is now in the allowlist. Schematic results themselves are in `output_snapshot` and do not create an external artifact row; the API test explicitly asserts that behavior. The physical upload and student artifact-download routes remain separate.

## Source snapshot and endpoint status

Read-only comparison used `/home/quangduc/Code/vista/se-sprint-90` at `3d1f41a` (`2026-11-21`, `release/db-scope-o-q`). Its `docs/acceptance/DESKTOP_API_CONTRACTS.md`, `DESKTOP_ROBOT_INTEGRATION_HANDOFF.md`, `WF01_WF04_MATRIX.md`, `WEB_LMS_FINAL_ACCEPTANCE.md`, `DIGITAL_TWIN_RUNTIME.md`, `wf03-experiment-evidence.md`, and `wf04-teacher-evidence-review.md` were reviewed. That checkout is **81 commits behind its `origin/main` tracking ref and has unrelated dirty files**. These are the newest handoff/source materials available locally in this environment, not confirmation of the current remote head or a deployment. The older `/home/quangduc/Code/vista/se` checkout is at `ccf7234` from 2026-11-16 and is older still.

| Reference | Verification |
|---|---|
| Education API `https://api.skynex.best/api/v1` | Source contract and Desktop route construction align on `/api/v1`. A read-only GET to `/auth/students/capabilities` was attempted on 2026-11-26; local DNS resolution failed (`Could not resolve host`). Live hostname/deployment/schema therefore remain unverified. |
| Digital Twin `wss://api.skynex.best/ws/twin` | `/ws/twin` is the contracted path, but the Twin host is an operator-supplied `VISTA_TWIN_WS_URL`; the latest handoff does **not** confirm it shares the Education API hostname. Treat this full URL as unverified until the operator confirms it. No socket was opened. |
| Network check | In-sandbox DNS lookups failed. With the supported escalated read-only request, both `api.github.com` and `api.skynex.best` resolved and HTTPS returned 200. This points to sandbox network restrictions, not host DNS failure. `GET /api/v1/auth/students/capabilities` returned `{"temporaryPasswordEnabled":true}`; this public capability response does not prove authenticated learner routes or the deployed evidence schema. |
| Release `v0.1.0` | Public GitHub release metadata and `SHA256SUMS` were retrieved without downloading the DEB. Release is published, tag target is `d3bd155c72c4cbec8b0ea145ea46f1002fef8a82`; asset metadata and manifest agree on 131,395,882 bytes and SHA-256 `a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4`. `BUILD_PROVENANCE.txt` reports source SHA `80aef01eca657fa8a2dbe3340bac27e048619b11`, workflow run `45628473427`, and target main SHA above. The DEB was not fetched or inspected. Public binary SBOM, runtime SBOM, third-party notices, license ZIP, and reconciliation assets are present in release metadata. |

## Supported Desktop contracts

### Student, assignment, and experiment context

The Desktop uses the existing student session, classroom assignment, attempt, Blockly program/version, and submission APIs. The supported source contract includes:

- `POST /api/v1/auth/students/login` with `{ schoolCode, studentCode, password }`; Supabase refresh/logout use the public project configuration. Temporary-password sessions remain restricted until `PATCH /api/v1/auth/students/password` succeeds and returns a replacement session.
- `GET /api/v1/me`, `/me/learning`, `/classroom-assignments/:assignmentId`; `POST /api/v1/classroom-assignments/:assignmentId/attempts`; `GET /api/v1/me/attempts/:attemptId`.
- `GET/POST /api/v1/me/attempts/:attemptId/program`, `PATCH /api/v1/me/programs/:programId`, `GET/POST /api/v1/me/programs/:programId/versions`, and `POST /api/v1/me/attempts/:attemptId/submission`.
- The existing server schematic workflow is `POST /api/v1/me/attempts/:attemptId/experiments`, `POST /api/v1/me/experiments/:experimentId/run-schematic`, then experiment/events/result reads. This is the Education API's symbolic/schematic flow; it is not the Desktop's local MuJoCo simulation.

The API owns student authorization, active attempt state, assignment/classroom membership, robot allocation/entitlement, immutable submitted ProgramVersion, and submission association. Desktop does not duplicate grading or entitlement decisions. Education API device provisioning (when enabled) is a separate VISTA device identity; it does **not** issue AWS IoT certificates. Its feature flag/migration remain an operator release decision. The Web physical-execution preflight resolves the robot's runtime server-side and currently requires its declared local fake-follower mode; a Desktop MuJoCo “ready” result is a separate local profile and does not satisfy that server readiness check.

For the Web-owned runtime path, the backend resolves robot-to-runtime identity via `VISTA_ROBOT_RUNTIME_MAP` and talks to private R1 with `VISTA_RUNTIME_TOKEN`; the browser does not connect directly to R1. The Desktop's local MQTT transport uses its configured Thing identity plus mTLS certificate and robot UUID topic, but its live command authorizer is test-injected only and defaults to deny. There is no verified binding from a student session to a Desktop MQTT identity.

### MQTT command/runtime protocol

Read-only comparison found that the Desktop command envelope matches the Web `IotCommandService` envelope: `schemaVersion`, `kind: "run"`, `commandId`, `robotId`, `sequence`, `issuedAtMs`, `expiresAtMs`, and `payload`. Web creates the runtime payload from `{ runId, robotId, programVersionId, profile: "lesson", program }`; the Web run ID is `wf03-<experiment UUID>`. The Desktop validator previously omitted the inner `payload.robotId`. It now requires that field and requires it to equal the envelope/configured robot identity. The local fixture was updated to use the Web payload shape.

The Edge Runtime accepts only the bounded lesson program schema and allowlisted steps. It rejects retained, expired, malformed, wrong-robot, stale-sequence, duplicate, unsafe, and unauthorized commands before execution. ACK/status events carry the matching robot and command IDs, deterministic event IDs, increasing sequence values, and millisecond timestamps. Terminal runtime exceptions produce `failed`; completed is not emitted on failure. The transport keeps no offline command queue. A persistent dedupe record permits deterministic event replay for a duplicate command without executing it again. The AWS IoT Last Will is a Thing Shadow offline report; the local fake verifies that it is configured, not that a broker delivered it after a network loss.

The local test injects an authorizer that checks the run and robot IDs. A normal packaged `EdgeRuntime` defaults its authorizer to deny, and there is no Desktop binding from a student/experiment authorization to a live AWS IoT command identity. Do not enable Production MQTT until Claude supplies and verifies the approved runtime identity/authorization provisioning path. `VISTA_IOT_ENABLED` stays unset; no certificate was provisioned and no Production command was published.

### Digital Twin

The supported viewer grant is `POST /api/v1/me/attempts/:attemptId/digital-twin/viewer-scope` with `{ robotId, labSessionId? }`. A successful grant is attempt-, classroom-, assignment-, robot-, and student-scoped and expires within 60 seconds. Connect to the separately configured `/ws/twin` with the `vista.twin.<scope>` subprotocol; never put the scope in the URL. A `4403`/handshake denial requires a newly authorized scope, not token reuse. The API now revokes viewers on the source-documented submission and membership/account/classroom/robot changes; entitlement expiry is bounded by scope TTL. This was source-reviewed, not tested from the Desktop against a live service here.

Twin v1 frames carry `robot_id`, `source_mode`, `controller_id`, `measured_at`, increasing `sequence`, `connection`, calibration state, and the six ordered SO-101 joints. Joint positions are radians or degrees (gripper percentage is viewer-only and has no approved angle transfer); values must be finite and within contract limits. The Desktop parser rejects wrong robot, malformed/old frames, and freezes pose on stale/disconnected data. The Twin schema's modes are `SIMULATION`, `LIVE_PHYSICAL`, and `REPLAY`; mock fixtures are represented as `SIMULATION` with a mock-specific controller identity. Desktop episode/runtime diagnostics separately preserve `SIMULATION`, `MOCK_RUNTIME`, `PHYSICAL_ROBOT`, and `UNVERIFIED_RUNTIME`; `UNVERIFIED_RUNTIME` is rejected from recording and must never be re-labelled physical. The MQTT Shadow classification now follows its configured runtime kind instead of always reporting `MOCK_RUNTIME`.

There is **no Desktop-authenticated MuJoCo-to-Twin ingest contract**. `/internal/simulation-telemetry` is server-only and signed. The Edge MQTT telemetry topic is not routed to Twin by the current AWS handoff. Therefore no Desktop local frame is described as cloud Twin telemetry, and local parser/fake tests are not Cloud WebSocket acceptance.

Failure behavior is fail-closed: a denied viewer scope/4403 requires a fresh grant; handshake timeout/error is bounded; stale or disconnected telemetry freezes the last pose and is not treated as fresh. Runtime command validation/safety denial emits a rejected ACK; execution exceptions end `failed`; disconnect clears connected state, reports offline when graceful, and has no offline command queue. The corrupt/missing local recording read path rejects `get()`; current `list()` omits unreadable episodes without a diagnostic row. Server-side experiment evidence storage failure is recorded as unavailable, not delivered.

## Recording and evidence compatibility

### Desktop local recording format

Desktop writes `vista.robot.recording.v1`. A stopped local manifest has fields including `episodeId`, `experimentId`, `robotId`, `slot`, `deviceId`, `declaredRuntimeKind`, timestamps, status, frame count, and dropped-frame count. `trajectory.ndjson` stores time-stamped frames with `schema_version: 1`, robot identity, source mode, controller identity, sequence, and six ordered joint readings. Stop computes SHA-256 and byte size from the local trajectory bytes.

The local manifest has **no `commandId`, `attemptId`, `submissionId`, or `programVersionId`**. The local WF03 mock passes `commandId` separately to its fake evidence endpoint. That association is not persisted by Desktop and is not a supported Education API upload.

Sanitized local frame example (shape only):

```json
{"schema_version":1,"robot_id":"<robot-uuid>","source_mode":"SIMULATION","controller_id":"local-mujoco","sequence":1,"measured_at":"2026-11-25T00:00:00.000Z","connection":"connected","measured":[{"name":"shoulder_pan","position":0.0,"unit":"rad"},{"name":"shoulder_lift","position":0.0,"unit":"rad"},{"name":"elbow_flex","position":0.0,"unit":"rad"},{"name":"wrist_flex","position":0.0,"unit":"rad"},{"name":"wrist_roll","position":0.0,"unit":"rad"},{"name":"gripper","position":0.0,"unit":"rad"}]}
```

### Existing Web experiment artifact path

The latest local Web source has a different, server-owned artifact contract: `vista.experiment.telemetry.v1` JSON, created from a successful server runtime snapshot and linked to an existing `LearningExperiment`/submission. The API writes the object to its private Learning Media bucket under the organization/classroom/experiment/student scope; it hashes the bytes, writes exact content length and identity metadata, then verifies object HEAD size/hash/scope before marking it available. Objects are bounded to 1 MB. The API stores artifact metadata after object creation, and retrieval rechecks object availability. A per-experiment/schema duplicate is reused; storage failure is recorded as `unavailable`. Student and teacher download routes are authorization-scoped and return short-lived signed downloads only after verification. The Web handoff reports local RustFS/S3 acceptance for this server flow; the Desktop suites did not run that storage service.

This is **server-side S3 PutObject + HEAD verification**, not a Desktop presigned-upload/manifest-last protocol. Existing presigned POST support for Learning Media attachments is not an experiment-recording upload contract. Desktop must not upload its `vista.robot.recording.v1` bytes to an invented route or claim compatibility by renaming the schema.

| Requested upload behavior | Desktop / current Web result |
|---|---|
| Experiment, recording, episode, robot and student/submission association | Local manifest has experiment/episode/robot only. No command, attempt, ProgramVersion, or submission binding. The API-issued upload is wired for physical recordings only; its deployed authorization and binding behavior are **NOT LIVE-VERIFIED**. MuJoCo upload remains intentionally unavailable. |
| SHA-256 and size | Desktop computes local SHA-256/bytes; local mock verifies hash equality. Web server-produced evidence verifies stored SHA-256, size, and identity metadata. No Desktop transfer validates these against server storage. |
| Manifest schema / manifest-last | Desktop manifest is `vista.robot.recording.v1`; Web experiment artifact is `vista.experiment.telemetry.v1`. There is no cross-format manifest contract or cloud manifest-last guarantee for Desktop. |
| Presigned flow / retry / duplicate / failure | Physical recording: Desktop requests `/me/experiments/:id/recordings/uploads`, posts API-issued presigned files, then posts manifest last. Contract tests cover request route/auth; live upload behavior is not verified. Schematic result: API persists database `output_snapshot`, metrics, and events; it does not create an external artifact row. Local MuJoCo result: no supported ingest contract. |
| WF-04 teacher review | The source review query roots on `LearningSubmission` and includes linked `LearningExperiments`, result, metrics, events, and artifact availability. This supports the server schematic result and accepted backend-owned evidence; it cannot show local MuJoCo telemetry that was never submitted. |

## Simulation evidence contract determination

The available backend source checkout at `/home/quangduc/Code/vista/se` is an older read-only snapshot (`ccf7234`, branch `rc/checkpoint-2026-11-16`) with unrelated dirty files. It is not proof of deployed source. Relevant service logic and tests establish the following source contract:

- `POST /api/v1/me/attempts/:attemptId/experiments` accepts only `executionMode: "schematic"`; `ExperimentService.create()` rejects simulation, replay, and real-robot modes. Its scope lookup derives the student from the JWT and binds the active classroom/assignment attempt, `LearningSubmission`, and submitted ProgramVersion, then writes those IDs into the experiment context.
- `POST /api/v1/me/experiments/:experimentId/run-schematic` resolves the canonical RobotProgram from that immutable ProgramVersion, writes a terminal `succeeded` result into `learning_experiments.output_snapshot`, writes metrics and ordered lifecycle events in a transaction, and creates **no** external artifact row. Authenticated student reads are `GET /me/experiments/:id`, `/result`, `/events`, and `/artifacts`.
- `ExperimentService.spec.ts` explicitly tests rejection of `executionMode: "simulation"` and persistence of the schematic `output_snapshot` without an external artifact. `VISTA_FULL_ENDPOINT_INVENTORY.md` says the interpreter is deterministic symbolic computation, not a physics simulator, and the authoritative result is `output_snapshot`.
- `AssessmentService` roots teacher review at `LearningSubmission` and projects related experiment `executionMode`, status, program-version provenance, result, metrics, ordered events, and artifact availability after teacher/classroom authorization. Server-owned schematic result is therefore reviewable as experiment evidence, but it is truthfully schematic only.
- There is no supported student route in this source for accepting a Desktop-generated MuJoCo result/trajectory. `/internal/simulation-telemetry` is server-publisher-only. The physical recording presign route is explicitly scoped to `PHYSICAL_ROBOT` and must stay that way.

**Conclusion:** no Desktop code can safely turn the existing schematic result endpoint into a persisted MuJoCo result. Implementing such a bridge without a backend-owned route would be an invented write contract and would break server provenance. The independent Desktop retrieval gap (`experimentArtifacts` IPC allowlist) is fixed. The remaining MuJoCo-to-WF04 path is a backend dependency for Claude, unless the registered acceptance is explicitly satisfied by the existing server schematic journey instead of local MuJoCo.

## Local acceptance evidence captured

Executed locally after the MQTT payload/identity corrections:

- `edge/.venv/bin/python -m unittest edge.tests.test_local_wf03_acceptance edge.tests.test_mqtt_transport -v`: **10 passed**. The local WF03 journey uses injected fake MQTT, a test-only authorizer, local MuJoCo, the real `RecordingManager`, and an in-process mock evidence endpoint.
- `node tests/api.contract.test.cjs`: **25 passed**.
- `node --test tests/recording-manager.test.cjs`: **1 suite passed**.

The single-run fixture IDs are test-only: experiment/run `4dfe1c3a-8c0a-43cc-90c5-15b977e18742` / `wf03-4dfe1c3a-8c0a-43cc-90c5-15b977e18742`, command `a77433c6-0dad-48df-8b54-3a080fc33c60`, robot `f1c066c4-b5f2-45c4-b933-f034f3824dd9`, program version `ad404a95-75ce-44e6-86b6-b12651fa2b22`. The mock observed accepted → executing → completed, matching robot/command event IDs, monotonically increasing event sequence/timestamps, and MuJoCo SIMULATION telemetry. It wrote a one-frame `vista.robot.recording.v1` episode, verified SHA-256 against the NDJSON bytes, then the mock returned `PROCESSING` with matching experiment/episode/robot/command IDs. The command ID was added to the mock request separately because the manifest does not contain it.

The combined suites assert event identity/timestamps/sequences and the composed lifecycle. The fake MQTT client is injected and cannot reach AWS. The mock evidence endpoint does not perform HTTP, S3, presigned upload, server database persistence, or teacher review. This is **LOCAL CONTRACT PASS only**, not Education API E2E or AWS E2E. Captured test output is in [`evidence/education-platform-integration-2026-11-25.log`](evidence/education-platform-integration-2026-11-25.log).

## WF03 / WF04 — exact Claude handoff

### WF03 — Claude (Web, Backend, AWS)

1. Confirm the authoritative Web-to-runtime command payload and authorization path against the current branch. The Desktop now requires payload `robotId` to match the outer robot UUID; verify this against `PhysicalExecutionService.runRequest` before any shared rollout. Provide a disposable, non-Production acceptance fixture and supported test command. Do not require a Desktop-authored identity token.
2. Confirm against the current backend branch/deployment whether WF03/WF04 accepts the existing server `schematic` `LearningExperiment`/`output_snapshot` result for the Desktop-connected acceptance. It is already bound to the authenticated student's attempt, assignment/classroom, submission, and immutable ProgramVersion, and it is projected by teacher review, but it is not MuJoCo physics or telemetry.
3. If the R1126-1901 journey requires the local MuJoCo outcome, provide a student-authenticated backend-owned ingestion contract; no such route exists in the reviewed source, and `executionMode: "simulation"` is explicitly rejected. The contract must server-bind the JWT student, active classroom/assignment attempt, exact submission and immutable ProgramVersion; record server-controlled `SIMULATION` provenance; persist terminal status/result/metrics/events; and define any telemetry artifact schema, maximum bytes, SHA-256 verification, presigned storage/manifest ordering, idempotency/retry, authorized student reads and submission-rooted teacher review. Desktop must not call `/internal/simulation-telemetry` or weaken the physical-only recording endpoint.
4. Confirm deployed behavior of physical recording upload (`POST /me/experiments/:id/recordings/uploads`) separately, including authorization, presign fields, manifest-last processing, maximum size, hash/size verification, retries/idempotency, unavailable-object behavior, and retrieval. This endpoint remains physical-only.
5. Once the contract/fixture and Claude's browser slot are available, run the same R1126-1901 identities through Desktop and verify the authorized instructor review, cross-student/tenant denial, duplicate, timeout, missing/corrupt artifact, and revocation cases. No substitute fixture may be created.
6. Keep `SIMULATION`, `MOCK_RUNTIME`, `PHYSICAL_ROBOT`, and `UNVERIFIED_RUNTIME` distinct. Do not infer physical use from a declared label or allow simulation through physical recording validation.

### WF03 / WF04 — AWS prerequisites (Claude/operator-owned)

- No AWS resource was inspected, provisioned, or changed here. For a future approved sandbox, provide an isolated Education API/Supabase test configuration, private evidence bucket/prefix and least-privilege API task role (`PutObject`/`GetObject` limited to the approved experiments prefix), hash/metadata verification, and a test-only lifecycle/retention policy. Existing source calls for reviewed infrastructure approval before its prefix is considered usable.
- If AWS IoT is actually in the approved path, provide a test endpoint, robot-specific Thing/certificate/policy, API publish role, commands/ACK/status topics, IoT rule → SQS/DLQ → feedback worker, and a fake runtime mapping. The current Desktop device-enrollment key is not an AWS IoT certificate. The Web handoff says AWS IoT broker acceptance is untested and device provisioning issues no AWS credential.
- Do not set Production `VISTA_IOT_ENABLED`, provision certificates, or create resources for this handoff. `VISTA_IOT_DATA_ENDPOINT`, `VISTA_IOT_TOPIC_PREFIX`, `VISTA_IOT_COMMAND_TTL_MS`, `AWS_REGION`, task-role credentials, certificate policy and SQS wiring are operator/server configuration, never installer contents.
- Physical operation additionally requires supervised commissioning, calibrated device mapping, hardware safety/E-stop and authorization; it is not part of this acceptance.

## Environment configuration (names only; no secret values)

For a supported isolated Desktop session, the process environment may supply `VISTA_EDUCATION_API` ending in `/api/v1`, matching public `VISTA_SUPABASE_URL`, `VISTA_SUPABASE_ANON_KEY`, and operator-confirmed `VISTA_TWIN_WS_URL` ending in `/ws/twin`. Remote API/Supabase URLs require HTTPS and remote Twin requires WSS. The student access token remains managed by the app and is never placed in the installer or URL.

The Desktop integration harness uses `VISTA_TEST_EDUCATION_API_URL`, `VISTA_TEST_SCHOOL_CODE`, `VISTA_TEST_STUDENT_CODE`, `VISTA_TEST_STUDENT_PASSWORD`, `VISTA_TEST_SUPABASE_URL`, `VISTA_TEST_SUPABASE_ANON_KEY`, `VISTA_TEST_OTHER_SCHOOL_CODE`, `VISTA_TEST_OTHER_STUDENT_CODE`, `VISTA_TEST_OTHER_STUDENT_PASSWORD`, and test-owned `VISTA_TEST_ATTEMPT_ID`. Optional test switches are `VISTA_TEST_ENABLE_MUTATIONS`, `VISTA_TEST_ENABLE_SIMULATION`, `VISTA_TEST_ENABLE_TWIN`, `VISTA_TEST_ROBOT_ID`, and `VISTA_TEST_TWIN_WS_URL`; staging requires the explicit `VISTA_TEST_ALLOW_STAGING=1` guard. Consult [`INTEGRATION_TEST_SETUP.md`](INTEGRATION_TEST_SETUP.md) for the complete test-only variable list and safe isolated runner.

For the separate Web-owned stack, the reviewed source names `VISTA_ROBOT_RUNTIME_MAP`, `VISTA_RUNTIME_TOKEN`, `DEVICE_PROVISIONING_ENABLED`, `DIGITAL_TWIN_SCOPE_SECRET`/`VISTA_TWIN_AUTH_SECRET`, `VISTA_IOT_ENABLED`, `VISTA_IOT_DATA_ENDPOINT`, `VISTA_IOT_TOPIC_PREFIX`, `VISTA_IOT_COMMAND_TTL_MS`, `AWS_REGION`, and `LEARNING_MEDIA_BUCKET`. Its opt-in loopback S3 evidence test also uses `LEARNING_MEDIA_S3_ENDPOINT`, `LEARNING_MEDIA_S3_ACCESS_KEY`, and `LEARNING_MEDIA_S3_SECRET_KEY`. Supply only disposable test values through the test process or scoped runtime role; do not store AWS credentials in the Desktop environment or package. These names describe reviewed source configuration, not proof that a cloud deployment has them configured.

Never place service-role keys, student passwords/tokens, AWS access keys, device certificates/private keys, or Twin scope tokens in source, installers, screenshots, logs, or mock payloads. No credentials are needed for the local contract tests listed above.

## Acceptance commands and gates

### R1126-1901 connected acceptance checkpoint

Claude is executing Production Web E2E under organization/run `R1126-1901`. No fixture IDs or safe local execution slot have been supplied in this Desktop workspace, so this checkpoint is prepared but not run. Reuse Claude's entities only; do not create substitute records.

| Handoff field | Required value / current state |
|---|---|
| Test student | Student account owned by the R1126-1901 test organization; Claude must provide the student code and school code through the approved test setup (never put password/token in this report). |
| Classroom ID | Pending Claude's R1126-1901 fixture output. |
| Assignment ID | Pending Claude's R1126-1901 fixture output; assignment must be published/open and assigned to the test student. |
| Experiment ID | Pending creation/selection by Claude; must be created for the same assignment/attempt and student that Desktop uses. |
| Attempt / ProgramVersion / submission IDs | Use the IDs returned by the live Desktop/API flow and retain them together with the experiment for the instructor-review check. Do not reuse local mock fixture IDs in this report. |
| Robot entitlement | Required robot UUID and confirmation that the same classroom allocation and student entitlement authorize the selected experiment; no identity supplied yet. |
| Runtime mode | `SIMULATION` / local MuJoCo only for this acceptance. Do not represent as physical execution. Current recording uploader rejects simulation episodes, so evidence path must be explicitly resolved before asserting evidence acceptance. |
| Expected evidence artifact | A real run's measured trajectory and API-persisted manifest/evidence, with server-confirmed size/hash and association to the same experiment and submission. No result may be fabricated. |
| Expected instructor result | Authorized instructor can open the same submitted attempt, see its persisted experiment/evidence as available, and review/download it. Record the actual review state and IDs. |
| Execution slot | Claude must release the owner's local execution slot before Electron/browser acceptance. Until then, perform source/document work only; do not poll Claude or start Electron/Chromium/MuJoCo. |

Acceptance is **CONDITIONAL GO** for the evidenced Ubuntu v0.1.0 local Simulation scope only, subject to published release bytes/provenance still being independently verified. The connected student-to-instructor Production journey, physical hardware acceptance, and AWS acceptance remain **NO-GO / NOT ACCEPTED** pending the gates above. This recommendation does not certify overall Production integration.

Desktop offline/local regression:

```sh
edge/.venv/bin/python -m unittest edge.tests.test_local_wf03_acceptance edge.tests.test_mqtt_transport -v
node tests/api.contract.test.cjs
node --test tests/recording-manager.test.cjs
```

The Web team must run its published isolated acceptance against fresh disposable fixture state; its WF03 fixture is single-use and its stack command must not disrupt Claude's shared process/worktree. A real browser/electron cross-product run is required after the evidence bridge contract exists.

| Gate | Result |
|---|---|
| Desktop local command → MuJoCo → ACK/status → telemetry → local recording → mock evidence result | **PASS — local mock contract only** |
| Desktop student authorization → persisted Education experiment and submission-linked evidence | **PASS for existing server schematic result only (source contract; not live-authenticated here). BLOCKED for local MuJoCo output pending a backend-owned simulation-result ingest contract or explicit acceptance of schematic instead.** |
| Cloud Twin WebSocket from Desktop | **NOT RUN**; endpoint hostname and live authorized student fixture are not verified |
| AWS IoT / S3 E2E | **BLOCKED / NOT RUN**; no AWS access, resource, certificate, or Production credential used |
| WF04 review of Desktop recording | **BLOCKED** until Desktop recording is persisted and linked to the exact submission |
| Physical robot acceptance | **BLOCKED / NOT RUN** |

No changes were made outside the Desktop repository; no merge, release update, or publication occurred.
