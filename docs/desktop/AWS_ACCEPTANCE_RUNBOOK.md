# VISTA AWS Acceptance Runbook

Status: preparation only. No AWS resource, certificate, Production MQTT connection, command, or upload was created or used.

## 1. Handoff and identity status

The referenced `SKYNET-Thesis/se` repository and its handoff file are not mounted in this workspace, and the remote handoff could not be fetched during this turn. Therefore the details below record the values supplied in the prior project handoff, not an independent re-read of the current `develop` contract. Before a real acceptance run, the owner must compare this document with `docs/operations/DESKTOP_TWIN_AI_HANDOFF_20261124.md` and `services/robot-runtime/tests/fixtures/edge-feedback-events.json` at the approved commit. Do not infer or change schema fields.

Known values from the supplied handoff:

| Setting | Value |
| --- | --- |
| Education API base | `https://api.skynex.best/api/v1` |
| Twin viewer | `wss://api.skynex.best/ws/twin` |
| Database robot UUID (`robotId`) | `f1c066c4-b5f2-45c4-b933-f034f3824dd9` |
| AWS Thing / MQTT client ID | `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9` |
| AWS IoT endpoint | `am09ew70geib4-ats.iot.ap-southeast-1.amazonaws.com:8883` |
| Transport | MQTT 3.1.1 over mutual TLS; QoS 1 |
| Topic prefix | `vista/demo/robots/f1c066c4-b5f2-45c4-b933-f034f3824dd9` |
| Topics | `<prefix>/commands`, `<prefix>/ack`, `<prefix>/status`, `<prefix>/telemetry` |

No certificate or private key is available. The Thing above is a logical demo identity; do not treat it as a physical robot until the owner verifies the backend mapping and approves that use.

## 2. Required test identities and scope (must be issued by project owner/backend)

Before scheduling the run, obtain these exact values from the approved test environment and record them in the change/session ticket. Do not invent IDs or use a student's personal session:

- Dedicated test student account and its backend user UUID.
- A valid, assigned WF03 experiment and its `experimentId` plus attempt/experiment context returned by the API.
- Entitlement mapping from that assignment/attempt to the database `robotId` above.
- Isolated test device identity/certificate mapped to the intended Thing/client ID, with least-privilege topic policy.
- Explicit publisher scope/audience and short-lived token issuer for the Twin publisher; viewer URL is not a publisher contract.
- Temporary test window, operator, exact command type and parameters, allowed runtime kind (simulation first), cleanup owner, and stop/disable procedure.

Required configuration is supplied at run time only. Keep CA, device certificate, and private-key references outside the repository and user-facing renderer. Private key mode must be owner-only (`0600` on Linux); never place key contents in environment logs, screenshots, tickets, or command output. Do not set `VISTA_IOT_ENABLED=true` before the signed test window and certificate/policy checks are complete.

## 3. Preflight after written approval

1. Confirm the backend test identity, experiment/attempt, robot entitlement, and isolated Thing mapping in the approved environment.
2. Validate certificate/key file presence and access without printing key material. Confirm the certificate is active and policy is scoped to this Thing and the four exact topic suffixes.
3. Confirm the approved API URL, Twin publisher audience/scope, and experiment/attempt scope. Confirm no production student or physical robot is unintentionally selected.
4. Start Desktop in fake/simulation mode first. Confirm runtime readiness, Safety Controller readiness, E-stop released, and physical hardware still disabled.
5. Only for the approved window, enable the specific MQTT test configuration. A TLS-only handshake/subscription test must never publish to `/commands`.

The Edge MQTT client uses Last Will on unexpected loss and publishes offline status/Shadow on graceful shutdown. It deduplicates QoS 1 deliveries; duplicate `commandId` must not execute a second time.

## 4. Command and expected evidence

Issue the test command through the authorized API/UI path only; never send an ad-hoc payload with `mosquitto_pub` to the command topic. Preserve the same `commandId`, database `robotId`, `experimentId`/attempt scope, and `episodeId` throughout the evidence chain.

Compare every ACK/status event with the handoff schema and the named fixture. Desktop expects the event identity fields `eventId`, monotonically increasing `sequence`, `occurredAtMs`, `commandId`, and database UUID `robotId`, plus all schema-required fields. Expected command lifecycle is `accepted` → `executing` → `completed` or `failed`; a failed/stopped run must not be reported completed. Verify authorization, expiry, duplicate handling, runtime readiness, and E-stop checks.

Verify telemetry as frame schema version 1: the six joints in contract order (`shoulder_pan`, `shoulder_lift`, `elbow_flex`, `wrist_flex`, `wrist_roll`, `gripper`), contract units, increasing sequence, valid timestamp, correct robot UUID and experiment scope. A Twin viewer must receive only the scope granted for that attempt.

Expected local recording evidence is a trajectory artifact plus `manifest.json` using `vista.robot.recording.v1`, artifact size/content type/SHA-256, matching experiment/robot/episode IDs, and `uploadLast=true`. For AWS acceptance, verify the actual backend recording authorization, presigned upload response, processing event/status, persisted evidence, and authenticated instructor review/download. Record exact API response IDs and timestamps with secrets redacted. A local mock response or `PROCESSING` without backend confirmation is not Production evidence.

## 5. Stop and cleanup

After the single approved test: stop the command source, verify terminal command state, disconnect MQTT gracefully, verify offline status/Shadow and no pending execution, revoke/expire temporary scope as agreed, disable dispatch, and confirm queue/DLQ/backlog with the Cloud operator. Do not issue a cleanup command to the robot unless separately approved. Preserve sanitized evidence and close the test window.

## 6. Not currently verifiable

The exact current backend test student, experiment/attempt IDs, active certificate ARN/serial, policy name, publisher scope, and current fixture fields are not present in this workspace. The production worker behavior and real AWS evidence persistence were not tested. Fill these from the current `se/develop` handoff/backend before an AWS run; if the current contract differs, stop and resolve the contract mismatch rather than changing Desktop payloads.
