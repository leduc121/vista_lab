# VISTA AWS IoT and Cloud Simulation Acceptance Runbook — 2026-11-27

**Status: preparation only.** No AWS, Secrets Manager, Production database, or Production runtime mutation was made in this completion pass. No certificate was created or activated, no MQTT session was opened, no Cloud command or experiment was run, and no Shadow readiness or Cloud success is claimed. This is the current AWS/Cloud runbook; earlier statements in old runbooks are historical where they conflict with this status.

## Verified state

### Runtime ownership clarification — 2026-11-27

- The Desktop executable is not the cloud R1 process. Packaged Simulation starts the bundled `edge-runtime/vista-edge-runtime`, built from this Desktop repository's `edge/runtime.py`; source-mode Simulation starts `python3 edge/runtime.py`. Robotics mode starts `<roboticsSource>/edge/runtime.py` with `<roboticsPython>`. The inspected local Desktop profile is default Simulation with no Robotics override, so it does not load the external R1 checkout.
- External R1 source inspected: `/home/quangduc/Code/vista/se-final-rc`, HEAD `50264300bcb7b5ea33726baf4befdbb4d761c26d`; its runtime implementation last changed at `adee7940691e4dc6bcc14c5c7d3079da40e4ecd9`, present in the inspected API source ancestry `f0b3d8735b608aac8670a200ff45eddf6fa24ab5`. `services/robot-runtime/Dockerfile` uses `/app` and `python3 src/server.py --config config/runtime.compose.json`. `docker-compose.yml` declares local service `robot-runtime` on port 8015. The inspected `infra/terraform/scripts/deploy-api.sh` starts `vista-education-api` plus optional feedback/recording/Twin containers; it does not deploy `robot-runtime`.
- The Production API maps a robot to a loopback runtime URL, but no actual Edge host, installed R1 path/image, source SHA, systemd/Docker command, or deployment owner was available for inspection. **Do not infer that the API at `f0b3…` proves an R1 Edge deployment at that SHA, or that the API reload updates the Edge host.** Have the Edge owner record those exact facts before any activation.
- The checked-in R1 source still gates execution to `fake_follower`; its fake telemetry is on `/telemetry` without command correlation and its Shadow lacks idle heartbeat. It exposes no Desktop `so101_follower` adapter or measured physical state. The Desktop source fix does not repair this separate service. This is a source-contract finding, not a claim about a currently running physical Edge process.
- **Required source patch scope if the R1 service is the approved Cloud runtime:** `services/robot-runtime/src/runtime.py` and `src/iot.py`; regression coverage in `services/robot-runtime/tests/test_runtime.py` plus the existing Education API `iot-edge-contract` / physical telemetry bridge tests. First add a real, authenticated, single-follower adapter boundary with CHECKIK/Safety Controller and measured state; only then may `iot.py` publish honest adapter/armed/calibration/fault fields and command-correlated measured telemetry and report Shadow every ≤10 seconds. A telemetry-only patch would falsely imply physical readiness, so it is not sufficient. The R1 repository must remain unchanged until its owner authorizes a reviewable PR and names the deployment mechanism. If API consumer contracts remain unchanged, no Education API release is inherently required; deploy the R1 Edge service itself. Re-run API only if the verified contract tests demonstrate a consumer change.
- **Current approval boundary:** no AWS or Production action is approved. Certificate creation/activation, Production Phase A configuration/reload, Cloud simulation, and physical commissioning remain separate gates below.

- Final Claude handoff: `/home/quangduc/Code/vista/se-final-rc/docs/operations/EDGE_CONTRACT_HANDOFF_20261126.md` and `/home/quangduc/Code/vista/se-final-rc/docs/release/ROBOTICS_OWNER_APPROVAL_CHECKPOINT_20261126.md`.
- Actual Production API `/api/v1/version`: `f0b3d8735b608aac8670a200ff45eddf6fa24ab5` (merge PR #240). This verifies the API image only. The R1 source present in that repository revision was inspected; it does **not** prove which runtime process/image is installed on the physical Edge host.
- Read-only Production health: `/api/v1/health` = `ok`; `/api/v1/health/ready` = `ready` (database, academic metadata columns, media archive columns and runtime role checks passed).
- Existing Thing: `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9`; robot UUID `f1c066c4-b5f2-45c4-b933-f034f3824dd9`; IoT ATS endpoint `am09ew70geib4-ats.iot.ap-southeast-1.amazonaws.com:8883`; region `ap-southeast-1`; profile `vista`. Read-only `list-thing-principals` returned no principals.
- Existing `feedback`, `feedback-dlq`, `recordings-events`, and `recordings-dlq` queues were present; visible, in-flight and delayed message counters were all zero at inspection. This is a point-in-time queue check, not evidence of a successful run.
- The AWS CLI shadow read did not produce a document in the earlier check; a fresh read from this shell could not reach the IoT data endpoint. Therefore no current Shadow fields, connection, or freshness are verified.
- No files exist at `~/vista-edge-certs/{device.pem.crt,private.pem.key,AmazonRootCA1.pem}`. The saved Desktop config has IoT disabled and no CA/certificate/private-key paths configured. No key or credential contents were read or printed. `VISTA_IOT_ENABLED` is unset in the inspected shell.
- The latest supplied VISTA Master Prompt reports that the three existing-dataset provisioning changes were executed and verified: commissioning organization entitlement; VISTA Academy entitlement isolation (allocations preserved); and Student 1's existing `student-blockly-demo` safety profile. It also reports actual School Admin allocation, instructor visibility, symbolic prerequisite pass, Student 1 eligible, Student 2 and foreign organization denied (404), and runtime offline. Those are owner-supplied Production results, not a fresh database read in this pass. The prior Claude checkpoint's “not executed” DB status is stale; do not repeat or roll back those changes.
- No Phase A activation is approved in the current session. The certificate, secret update and redeploy remain unexecuted owner-gated operations.
- This workspace's Desktop MQTT correction passed 16 focused tests under `edge/.venv`; the full Edge suite then passed **96/96** using the repository virtual environment with MuJoCo. The correction is local/fake-broker acceptance, not Production Cloud acceptance. The default system Python lacks the required MuJoCo dependency; use `edge/.venv/bin/python` for these tests.

## Production contract comparison: release blocker

The deployed Production consumer and its current Edge publisher do not agree on simulation telemetry:

1. Production's IoT rule routes only command-correlated `ack` and `status` events from the existing topic prefix into the feedback queue (`topic(5)` must be `ack` or `status`, and `commandId` must exist). The feedback worker recognizes telemetry only as a `status` event with `status: "telemetry"`.
2. The checked-in R1 source at API revision `f0b3d8735b608aac8670a200ff45eddf6fa24ab5` publishes fake frames to the separate `/telemetry` topic as `{kind:"telemetry", source:"fake_follower", jointState: ...}`. The frame has no `commandId` and is not the expected bridge envelope. The rule therefore drops it before the worker; even if delivered, the worker rejects it. The physical Edge host's running source is unknown.
3. Production's bridge expects the command-correlated wrapper `{schemaVersion:1, kind:"status", status:"telemetry", robotId, commandId, eventId, sequence, occurredAtMs, telemetry:<frame>}`. The nested frame must identify `source_mode:"SIMULATION"`, `robot_id`, `connection:"connected"`, an ISO `measured_at`, and six ordered SO-101 joints with valid units. It correlates to a persisted active command with `MOCK_RUNTIME` provenance before relaying to the Twin.
4. The checked-in R1 `IotBridge._report_shadow()` reports state on connect and command handling; it has no periodic heartbeat timer. It cannot keep the reported timestamp fresh during idle periods. The API's freshness gate accepts only a recent Shadow (30 seconds); the Edge handoff requires a 10-second heartbeat. The live Edge Shadow and runtime heartbeat were not verified.
5. The deployed fake telemetry also consists of six zero positions, not measurements from a running simulation. A successful command cannot be represented as measured Twin motion by these frames.
6. Before the final Desktop source change, local `edge/mqtt_transport.py` also sent the naked frame to `/telemetry`, while `edge/runtime.py` published only the last MuJoCo frame after command execution. This workspace now wraps local simulation frames in the required command-correlated `/status` telemetry event and publishes from the in-flight MuJoCo frame callback, with a 2 Hz and 120-frame per-command cap. The full local Edge suite (96 tests) covers this correction. The separate checked-in R1 implementation was not updated; whether it is running on the physical Edge host is unknown.

**Required before Phase A:** owner confirms which local Edge process is meant to subscribe to AWS IoT and records its actual source/image, path, startup command and update mechanism. If it is the separate R1 service, its owner must review changes to `services/robot-runtime/src/runtime.py` and `src/iot.py`: implement the approved adapter boundary first, then correct measured, command-correlated simulation telemetry on `/status`, ≤10-second honest Shadow updates, and the required regression tests. The checked-in R1 has no physical adapter; telemetry-only edits cannot make physical commissioning ready. Do not enable the bridge or claim Cloud telemetry until the actual Edge process is updated and a fresh honest Shadow is observed. No external repository source was modified.

## Certificate creation, activation, and rollback — exact checkpoint

**Owner gate:** explicit approval to create one certificate for the existing Thing, attach the existing least-privilege policy and Thing principal, then activate it. No AWS command below has been run. Execute only on the designated Edge host, with its authorized `vista` profile; never put the private key in this repository, Production secret, CI, logs, tickets, or chat.

After approval:

```bash
umask 077
install -d -m 0700 "$HOME/vista-edge-certs"
cd "$HOME/vista-edge-certs"
THING=vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9
POLICY="$THING-policy"
ARN=$(aws iot create-keys-and-certificate --no-set-as-active \
  --certificate-pem-outfile device.pem.crt \
  --public-key-outfile public.pem.key \
  --private-key-outfile private.pem.key \
  --query certificateArn --output text --profile vista --region ap-southeast-1)
CERT_ID=${ARN##*/}
chmod 0600 device.pem.crt public.pem.key private.pem.key
aws iot attach-thing-principal --thing-name "$THING" --principal "$ARN" --profile vista --region ap-southeast-1
aws iot attach-policy --policy-name "$POLICY" --target "$ARN" --profile vista --region ap-southeast-1
aws iot update-certificate --certificate-id "$CERT_ID" --new-status ACTIVE --profile vista --region ap-southeast-1
curl -fsS https://www.amazontrust.com/repository/AmazonRootCA1.pem -o AmazonRootCA1.pem
chmod 0600 AmazonRootCA1.pem
```

The `--no-set-as-active` option makes the initial certificate inactive; activation is the explicit final IoT API call after both attachments. AWS issues the private key only at creation time, so preserve the owner-only local copy. [AWS CLI command reference](https://docs.aws.amazon.com/cli/latest/reference/iot/create-keys-and-certificate.html). Do not echo `$ARN`, command output containing PEM, or any key file contents into logs. Use a shell without `set -x`.

**Local, secret-safe verification:** check directory mode `0700`, private-key mode `0600`, certificate/key presence, certificate dates and public-key match without printing either key. For example:

```bash
test "$(stat -c '%a' private.pem.key)" = 600
openssl x509 -in device.pem.crt -noout -dates
openssl x509 -in device.pem.crt -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum
openssl pkey -in private.pem.key -pubout -outform DER | sha256sum
```

The two hashes must match. Do not run these commands with shell tracing. Then use read-only AWS checks to verify certificate status `ACTIVE`, the single expected Thing principal, and only the expected policy attached. Stop if any mapping or policy differs.

**Rollback if activation fails or is stopped:** first set the certificate to `INACTIVE`; detach the policy; detach the principal from this Thing; delete that certificate; securely remove `private.pem.key`, `device.pem.crt`, and `public.pem.key`. Verify no Thing principal remains. Keep the public Amazon Root CA only if still needed. Never delete or detach an identity that does not match the certificate ARN created for this checkpoint.

## Post-approval mTLS and Device Shadow check

Run only after the certificate and policy checks above pass and the Edge contract fix is deployed. Use the exact ATS endpoint, TLS 1.2+, hostname verification, CA bundle, client certificate and private key. A TLS-only handshake can be checked with `openssl s_client -brief -verify_return_error -connect am09ew70geib4-ats.iot.ap-southeast-1.amazonaws.com:8883 -servername am09ew70geib4-ats.iot.ap-southeast-1.amazonaws.com -CAfile AmazonRootCA1.pem -cert device.pem.crt -key private.pem.key`; it proves TLS identity/chain only, not MQTT topic authorization.

For MQTT authorization, use a single MQTT 3.1.1 client session with client ID exactly equal to the Thing name. Subscribe QoS 1 to `$aws/things/<THING>/shadow/get/accepted` and `$aws/things/<THING>/shadow/get/rejected`, then publish `{}` QoS 1 to `$aws/things/<THING>/shadow/get`. This is a read request; it must not publish to `/commands` or write a Shadow update. Record only the response classification, Shadow version and reported field names. Confirm the returned Shadow is connected, `runtimeKind=MOCK_RUNTIME`, `hardwareEnabled=false`, `stopped=false` only if actually ready, and `reportedAtMs` advances on successive observations no more than 10 seconds apart. Also verify the runtime's reported fault/armed/calibration fields have accurate values. If no document is returned, or timestamp/readiness is stale, stop and do not enable student starts.

## Phase A simulation activation and supported reload

**Owner gate:** approve the exact Phase A secret update and one existing Production deploy. First require the Production Edge telemetry and heartbeat fix above, a valid fresh Shadow, successful mTLS, and completed dataset/access setup. Physical mode remains disabled.

Only the existing secret `vista/demo/education-api/env` in `ap-southeast-1` is in scope. Preserve every unrelated key. Add/update these values as strings:

```text
VISTA_IOT_ENABLED=true
VISTA_IOT_START_MODE=simulation
VISTA_IOT_THING_PREFIX=vista-demo
VISTA_IOT_TELEMETRY_BRIDGE_ENABLED=true
VISTA_TWIN_RELAY_STALE_AFTER_SECONDS=3.0
VISTA_TWIN_MAX_MEASUREMENT_AGE_SECONDS=5.0
```

Do not create a secret or infrastructure. `DIGITAL_TWIN_SCOPE_SECRET` already exists and is reused. Secret editing alone does not reload processes. The supported reload is **Education CI** on `main`, workflow dispatch `action=deploy`, through the existing `aws-demo` approval. The deployed host script reads the secret, rewrites `/opt/vista/api.env`, and recreates the existing API, feedback worker, recordings worker and Twin. Verify the resulting `/api/v1/version`, `/health/ready`, running existing containers, relevant environment flag names/values through the approved operator path, and queue state. Do not print the secret or whole environment.

**Rollback:** disable first (`VISTA_IOT_ENABLED=false` and remove the Phase A flags) or move `AWSCURRENT` back to the recorded prior version, then use the same supported deploy workflow to reload. Verify API/worker/Twin health and that student IoT starts are refused. Deactivate the device certificate if the run is abandoned. Do not roll back unrelated secret keys.

## Student 1 Cloud simulation acceptance plan

Use only the existing R1126-1901 commissioning dataset and the real authorized Student 1 and instructor sessions. No new dataset, Production DB edits, direct command publish, browser mock, or physical device is allowed. The handoff records:

| Existing record | ID |
|---|---|
| Organization | `597cd591-ba63-4a27-af5d-12fede921fad` |
| Advanced classroom / offering | `9c09e27d-a4d6-425d-824e-5474cb206e68` / `de508d2e-7ecb-4ad3-af03-495b075aec0c` |
| Instructor / Student 1 app user | `7dbc41c1-fdd6-4e2b-8e67-2b68c3262905` / `f9eb7496-9369-449f-9b9f-9368122fa410` |
| Course / Module 5 lesson | `eff5ec2e-da86-4c8d-8ff5-920e09d98271` / `fbaa2ac8-5d34-4dfa-af94-99a1ae0d53cf` |
| Existing Module-4 Blockly assignment / classroom assignment | `dc1c85d4-d279-440b-bd81-3861f4abcb50` / `b148af29-378a-41e6-bc28-64e29bdb8eee` |
| Existing qualifying attempt / program / version | `6057647b-a84a-4fab-a0df-ff4fdac93aa5` / `92f8687a-2095-4694-b098-dd9f19183476` / `4583b824-5332-43b7-85ca-c04e80241bc1` |
| Existing schematic experiment / symbolic evaluation / submission | `9fb84446-f86f-4b96-95e5-387147dfb715` / `4497eaa1-e404-4196-b270-ef629ba41395` / `01bc0576-daf6-46cc-bc99-45ebba993526` |

The latest Master Prompt says the robot is already entitled and allocated and Student 1 is eligible; use the existing records and do not repeat the old checkpoint's database writes. The supplied evidence also says VISTA Academy isolation was verified against database state, not with an Academy student login, and its two allocations were preserved. That narrower isolation verification must remain accurately labelled. Before Cloud execution, confirm the reported rows and current eligibility through the authorized read-only operator view, and confirm the deployed physical-experiment activity in the real UI.

Acceptance sequence, after all gates:

1. Confirm correct Production version and ready health; hardware remains disabled and no physical adapter is selected. Edge reports fresh `MOCK_RUNTIME`, connected, stopped false only when ready, and `hardwareEnabled=false`.
2. Student 1 signs in through Desktop using the authorized student session; verify the existing assignment/attempt context and safety confirmation. Start only through the supported Student UI/API path. Never publish a test command directly to MQTT.
3. Preserve correlation IDs across attempt → experiment → control session → `commandId` → Edge events. Verify command expiry and single execution. Expected lifecycle: `pending_publish → publishing → queued → acknowledged → executing → completed` (or honest terminal failure). Confirm increasing event sequence and idempotent duplicate handling.
4. Confirm only the existing feedback rule/queue/worker processes the command-correlated events; inspect lifecycle/experiment status and queue/DLQ counters. Require completed status with simulation execution mode and `MOCK_RUNTIME` provenance.
5. During the executing interval, verify measured simulation frames arrive in the accepted status envelope, pass robot/command/sequence/time/provenance validation, and reach the Twin only through the existing authenticated relay. Viewer scope must include the test student/instructor and deny an unrelated peer. The UI must label the feed as delayed simulation, never physical or real-time.
6. Verify actual supported simulation evidence for the experiment, authorized download, instructor review compatibility, and release workflow. Do not call a schematic preview or local-only recording a Cloud run. Do not use physical recording upload for simulation.
7. Save a sanitized evidence bundle: version SHA and health timestamps; command/experiment/attempt IDs and lifecycle timestamps; Edge event IDs/sequences; queue counters; Shadow timestamps; Twin frame measurements and timing fields; student/instructor authorization results; evidence hashes/download status; and rollback version identifiers. Remove JWTs, AWS credentials, certificate material and private data.

## Telemetry latency and evidence measurement

Do not reuse the handoff's earlier “few hundred milliseconds” as a result; it explicitly says that is an estimate. Measure from actual accepted frames on the first real cloud run. For at least 30 sequential frames during one stable, command-correlated simulation run (maximum 2 Hz and 120 frames per run), capture the frame `measured_at`, Twin receipt timing, and viewer heartbeat `timing.transport_delay_ms`, `measurement_age_ms`, `received_age_ms`, and `server_time`. Calculate sample count, dropped/duplicate/out-of-order counts, p50, p95 and maximum transport delay; preserve per-frame event IDs and sequence numbers. Use the Twin's reported values; do not substitute local wall-clock subtraction across unsynchronized machines. Check receipt age against the 3-second relay freshness setting and measurement age against the 5-second maximum. Any stale, rejected or missing frame is a failed evidence step to diagnose, not a reason to relabel or widen thresholds silently.

Evidence verification must tie each frame to a persisted `MOCK_RUNTIME` command in `acknowledged`/`executing` state, the same robot UUID, experiment and attempt, and valid simulation source marker. Confirm only one six-joint SO-101 follower frame and no physical telemetry. Record sequence gaps, relay drops and UI label/scope checks alongside latency statistics. The existing Twin reports transport delay; until observed, there is no measured latency result.

## Consolidated owner checkpoint

Only these owner decisions/actions remain before acceptance:

1. **Production Edge gate:** authorize the backend-owned telemetry/heartbeat correction and deployment; verify the deployed SHA, measured command-correlated telemetry contract and idle Shadow freshness. Current deployed code cannot satisfy the telemetry bridge.
2. **AWS identity gate:** approve creation of one inactive certificate on the designated Edge host, attachment to the existing Thing and scoped policy, then activation; approve rollback scope as written above.
3. **Phase A gate:** after gates 1–2 and successful mTLS/Shadow checks plus read-only confirmation of the already-provisioned dataset, approve the six existing-secret Phase A values and Education CI `action=deploy` reload. No Phase B/physical flags are part of this approval.
4. **Separate physical gate for tomorrow:** owner/operator approval of one supervised local SO-101 follower session and any calibration or motion writes; Phase B cloud physical configuration is a separate approval after Cloud simulation passes.

Until those decisions are explicit, keep the certificate absent/inactive, `VISTA_IOT_ENABLED` off and Phase A flags unchanged. No Cloud experiment, telemetry, readiness or success is asserted by this preparation checkpoint.
