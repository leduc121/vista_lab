# Lab Station backend handoff

## Device provisioning contract required from the Education API

The desktop can create a per-install Ed25519 private key and encrypt it with the
OS secure-storage backend. It does not enroll or mark the device active because
the registration/certificate endpoint is missing. The installer must remain
`NOT PROVISIONED` until one is available. Please provide a contract
with these operations:

* `POST /desktop/devices/enroll`: authenticated operator + lab authorization;
  request includes a generated public key, device metadata, and idempotency key.
  Response returns a stable device ID, enrollment status, certificate chain,
  MQTT endpoint, allowed lab/robot IDs, and expiry. Private keys never leave the
  device.
* `POST /desktop/devices/{id}/certificate/renew`: proof-of-possession signed by
  the device key; returns rotated certificate and expiry.
* `POST /desktop/devices/{id}/revoke`: authorized operator action; revocation
  takes effect in policy and MQTT authorization.
* `GET /desktop/devices/{id}`: status (`pending`, `active`, `revoked`, `expired`),
  allowed topics, policy revision, and certificate expiry.

All operations require TLS, short-lived user authorization, auditable actor and
lab IDs, replay protection, rate limits, and explicit error semantics. This
contract is a proposal for review, not a claim that these endpoints exist.

## AWS IoT requirements

Provide a non-production AWS IoT endpoint for integration testing, a per-device
certificate policy scoped to that device and assigned lab, topic names and
payload schemas, command TTL and deduplication behavior, ACK/result correlation,
telemetry retention, certificate rotation and revocation process, and an
offline/reconnect policy. The desktop must not contain shared AWS credentials.
MQTT may carry authorized lab commands and results but must never carry servo
setpoints or other real-time control traffic.

## Current state

No provisioning or MQTT provider is connected. The UI reports this explicitly;
no mock state is presented as AWS success. CHECKIK reuse notes are in
`CHECKIK_REUSE.md`.
