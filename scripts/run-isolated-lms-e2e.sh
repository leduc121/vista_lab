#!/usr/bin/env bash
# One-command, host-side disposable LMS acceptance. Never targets shared Supabase.
set -Eeuo pipefail
umask 077

DESKTOP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
BACKEND_ROOT="${VISTA_BACKEND_ROOT:-/home/quangduc/Code/vista/se-sprint-90}"
SELF_TEST=0
[[ "${1:-}" == "--self-test" ]] && SELF_TEST=1

fail() { printf 'BLOCKED: %s\n' "$*" >&2; exit 2; }
is_safe_suffix() { [[ "$1" =~ ^[a-z0-9]{6,12}$ ]]; }
is_project_name() { [[ "$1" =~ ^vista-lms-[a-z0-9]{6,12}$ ]]; }
cleanup_authorized() { is_project_name "$1" && [[ "$1" == "$2" ]]; }
is_loopback_port() { [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1024 && 10#$1 <= 65535 )); }
is_container_healthy() { [[ "$1" == healthy ]]; }
owns_compose_project() {
  local project="$1" ids networks resource label found=0
  ids="$(docker ps -aq --filter "label=com.docker.compose.project=$project")"
  networks="$(docker network ls -q --filter "label=com.docker.compose.project=$project")"
  [[ -n "$ids$networks" ]] || return 1
  for resource in $ids; do
    label="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$resource" 2>/dev/null || true)"
    cleanup_authorized "$project" "$label" || return 1
    found=1
  done
  for resource in $networks; do
    label="$(docker network inspect -f '{{ index .Labels "com.docker.compose.project" }}' "$resource" 2>/dev/null || true)"
    cleanup_authorized "$project" "$label" || return 1
    found=1
  done
  (( found ))
  return 0
}

if (( SELF_TEST )); then
  [[ "$(is_safe_suffix a1b2c3; echo $?)" == 0 ]]
  [[ "$(is_safe_suffix 'Bad!'; echo $?)" != 0 ]]
  [[ "$(is_loopback_port 54323; echo $?)" == 0 ]]
  [[ "$(is_loopback_port 54321; echo $?)" == 0 ]]
  [[ "$(is_loopback_port 80; echo $?)" != 0 ]]
  [[ "$(is_loopback_port 65536; echo $?)" != 0 ]]
  # Namespace guard rejects empty and non-runner Compose project names.
  is_project_name vista-lms-a1b2c3
  ! is_project_name vista-int-pg
  ! is_project_name ''
  cleanup_authorized vista-lms-a1b2c3 vista-lms-a1b2c3
  ! cleanup_authorized vista-lms-a1b2c3 vista-lms-other
  ! cleanup_authorized vista-int-pg vista-int-pg
  is_container_healthy healthy
  ! is_container_healthy starting
  ! is_container_healthy unhealthy
  printf 'Runner safety self-tests passed (suffix, port bounds, ownership guard).\n'
  exit 0
fi

for tool in docker python3 node npm psql curl sha256sum openssl tar awk od tr seq ps chmod mktemp grep; do command -v "$tool" >/dev/null || fail "required tool missing: $tool"; done
docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 || fail 'Docker daemon is unavailable to this host shell.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is required.'
docker image inspect postgres:17 >/dev/null 2>&1 || fail 'postgres:17 image must already be cached; runner will not pull images or access registries'
docker image inspect public.ecr.aws/supabase/gotrue:v2.197.0 >/dev/null 2>&1 || fail 'pinned GoTrue image must already be cached; runner will not contact AWS ECR or pull images'
# Prevent inherited cloud/staging credentials or endpoints from entering any child process.
for name in $(compgen -e | grep -E '^(AWS_|VISTA_TEST_|VISTA_E2E_|SUPABASE_|DATABASE_URL$|VISTA_DEV_DATABASE_URL$)' || true); do unset "$name"; done
# Bound Node's heap for the temporary API build, API process, and Desktop harness.
export NODE_OPTIONS=--max-old-space-size=768
[[ -d "$BACKEND_ROOT/services/education-api" && -f "$BACKEND_ROOT/scripts/bootstrap_dev_database.py" ]] || fail "backend checkout missing at $BACKEND_ROOT"
[[ -x "$BACKEND_ROOT/services/education-api/node_modules/.bin/tsc" && -d "$BACKEND_ROOT/services/education-api/node_modules/@prisma/client" ]] || fail 'backend API dependencies are not installed in the read-only checkout'
[[ -d "$DESKTOP_ROOT/node_modules" ]] || fail 'Desktop dependencies are not installed'
[[ -f "$BACKEND_ROOT/database/baselines/production-public-schema-20261109T172950Z.sql" ]] || fail 'verified schema baseline is missing'
[[ -f "$BACKEND_ROOT/database/baselines/production-baseline-evidence.json" ]] || fail 'baseline evidence file is missing'
[[ -f "$BACKEND_ROOT/services/education-api/src/scripts/phase243-e2e-fixtures.ts" ]] || fail 'supported Phase 2.4.3 fixture seed source is missing'
[[ -f "$BACKEND_ROOT/web/robot-edu/tests/e2e/local-gotrue-proxy.mjs" ]] || fail 'local GoTrue gateway proxy source is missing'

# Host memory floor prevents starting a database, GoTrue and API build on a nearly exhausted machine.
available_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)"
(( available_kb >= 3145728 )) || fail 'need at least 3 GiB MemAvailable for bounded local build and services'

# Fixed deterministic identifiers are prohibited; every run gets a unique project, DB and private directory.
run_id="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
is_safe_suffix "$run_id" || fail 'could not create a valid unique run suffix'
project="vista-lms-${run_id}"
db_name="vista_test_${run_id}"
db_user="vista_test"
db_password="$(openssl rand -hex 24)"
runtime_password="$(openssl rand -hex 24)"
device_secret="$(openssl rand -hex 32)"
school_a="VISTA${run_id^^}A"
school_b="VISTA${run_id^^}B"
student_a="STU${run_id^^}A"
student_b="STU${run_id^^}B"
student_password="Local-${run_id}-Student!9"
other_password="Local-${run_id}-Other!9"
api_port="$(python3 - <<'PY'
import socket
s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1]); s.close()
PY
)"
# The backend fixture guard intentionally permits only its documented local auth ports.
# Prefer 54323 and refuse if it is occupied; never use the shared Supabase :54321 port.
auth_port=54323
gotrue_port="$(python3 - <<'PY'
import socket
s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1]); s.close()
PY
)"
pg_port="$(python3 - <<'PY'
import socket
s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1]); s.close()
PY
)"
for port in "$api_port" "$auth_port" "$gotrue_port" "$pg_port"; do is_loopback_port "$port" || fail 'dynamic port allocation returned an invalid port'; done
[[ "$api_port" != "$auth_port" && "$api_port" != "$gotrue_port" && "$api_port" != "$pg_port" && "$auth_port" != "$gotrue_port" && "$auth_port" != "$pg_port" && "$gotrue_port" != "$pg_port" ]] || fail 'dynamic port collision'
python3 - "$pg_port" "$gotrue_port" "$auth_port" "$api_port" <<'PY' || fail 'one or more selected loopback ports are no longer available'
import socket,sys
sockets=[]
try:
    for value in sys.argv[1:]:
        sock=socket.socket(); sock.bind(('127.0.0.1',int(value))); sockets.append(sock)
finally:
    for sock in sockets: sock.close()
PY

[[ ! -e "/tmp/${project}-evidence" ]] || fail 'unique evidence directory already exists; refusing to merge old logs'
[[ ! -e "/tmp/vista-phase243-fixture-${run_id}.json" ]] || fail 'unique fixture path already exists; refusing to overwrite it'
run_dir="$(mktemp -d "/tmp/${project}.XXXXXX")"
chmod 700 "$run_dir"
logs="$run_dir/logs"; mkdir -m 700 "$logs"
compose="$run_dir/compose.yml"
compose_env="$run_dir/compose.env"
fixture="/tmp/vista-phase243-fixture-${run_id}.json"
api_copy="$run_dir/api"
api_pid=''; proxy_pid=''; pg_forward_pid=''; gotrue_forward_pid=''; postgres_ip=''; gotrue_ip=''; compose_started=0; successful=0

cleanup() {
  local rc=$? pid current project_label
  trap - EXIT INT TERM HUP
  set +e
  if [[ -n "${logs:-}" ]]; then printf '%s\n' "$rc" >"$logs/exit-status"; fi
  if [[ -n "$api_pid" ]]; then
    current="$(ps -p "$api_pid" -o args= 2>/dev/null || true)"
    if [[ "$current" == *"$api_copy/dist/main.js"* ]]; then kill "$api_pid" 2>/dev/null; wait "$api_pid" 2>/dev/null; fi
  fi
  if [[ -n "$proxy_pid" ]]; then
    current="$(ps -p "$proxy_pid" -o args= 2>/dev/null || true)"
    if [[ "$current" == *"local-gotrue-proxy.mjs"* && "$current" == *"$auth_port"* ]]; then kill "$proxy_pid" 2>/dev/null; wait "$proxy_pid" 2>/dev/null; fi
  fi
  if [[ -n "$pg_forward_pid" ]]; then
    current="$(ps -p "$pg_forward_pid" -o args= 2>/dev/null || true)"
    if [[ "$current" == *"forward-container-port.cjs $pg_port $postgres_ip 5432"* ]]; then kill "$pg_forward_pid" 2>/dev/null; wait "$pg_forward_pid" 2>/dev/null; fi
  fi
  if [[ -n "$gotrue_forward_pid" ]]; then
    current="$(ps -p "$gotrue_forward_pid" -o args= 2>/dev/null || true)"
    if [[ "$current" == *"forward-container-port.cjs $gotrue_port $gotrue_ip 9999"* ]]; then kill "$gotrue_forward_pid" 2>/dev/null; wait "$gotrue_forward_pid" 2>/dev/null; fi
  fi
  if [[ -n "${fixture:-}" && "$fixture" == "/tmp/vista-phase243-fixture-${run_id}.json" && ! -L "$fixture" ]]; then rm -f -- "$fixture"; fi
  if (( compose_started )); then
    # Compose labels prove ownership; never run down against a project with mismatched resources.
    ids="$(docker ps -aq --filter "label=com.docker.compose.project=$project")"
    networks="$(docker network ls -q --filter "label=com.docker.compose.project=$project")"
    if [[ -n "$ids$networks" ]] && owns_compose_project "$project"; then
      docker compose --project-name "$project" --file "$compose" --env-file "$compose_env" logs --no-color --timestamps >"$logs/containers.log" 2>&1
      docker compose --project-name "$project" --file "$compose" --env-file "$compose_env" down --timeout 5 >/dev/null 2>&1
    else
      printf 'Cleanup safety stop: project ownership could not be proven; resources retained under %s\n' "$project" >&2
    fi
  fi
  local evidence="/tmp/${project}-evidence"
  mkdir -m 700 "$evidence" 2>/dev/null || true
  cp -a "$logs/." "$evidence/" 2>/dev/null || true
  if (( successful )); then cp "$run_dir/exit-status" "$evidence/exit-status" 2>/dev/null || true; fi
  chmod -R go-rwx "$evidence" 2>/dev/null || true
  if (( successful )); then
    printf 'Private run logs and exit status: %s\n' "$evidence"
  else
    printf 'Private diagnostic logs retained at %s; sensitive run configuration was removed.\n' "$evidence" >&2
  fi
  rm -rf -- "$run_dir"
  exit "$rc"
}
trap cleanup EXIT INT TERM HUP

# Ensure this unique Compose namespace has no preexisting objects; collisions always refuse.
if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$project")" || -n "$(docker network ls -q --filter "label=com.docker.compose.project=$project")" ]]; then fail 'generated Compose project unexpectedly already exists'; fi

# Verify and pin source baseline before creating any container.
baseline="$BACKEND_ROOT/database/baselines/production-public-schema-20261109T172950Z.sql"
expected_sha="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sha256"])' "$BACKEND_ROOT/database/baselines/production-baseline-evidence.json")"
actual_sha="$(sha256sum "$baseline" | awk '{print $1}')"
[[ "$actual_sha" == "$expected_sha" ]] || fail 'schema baseline digest does not match backend evidence'

# Generate ephemeral Ed25519-independent Supabase JWT signing material: GoTrue signs ES256;
# local anon/service access keys are short-lived HMAC keys scoped to this disposable issuer.
node - "$run_dir" "$auth_port" <<'NODE' >"$logs/keygen.log" 2>&1
const fs=require('fs'),crypto=require('crypto'),path=require('path');
const dir=process.argv[2], port=process.argv[3];
const secret=crypto.randomBytes(32).toString('base64url');
const {privateKey}=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
const es=privateKey.export({format:'jwk'}); Object.assign(es,{kid:'vista-local-es256',alg:'ES256',use:'sig',key_ops:['sign','verify']});
const oct={kty:'oct',k:Buffer.from(secret).toString('base64url'),kid:'vista-local-hs256',alg:'HS256',key_ops:['verify']};
const sign=role=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const p=Buffer.from(JSON.stringify({role,iss:'vista-local',aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400})).toString('base64url');return h+'.'+p+'.'+crypto.createHmac('sha256',Buffer.from(secret)).update(h+'.'+p).digest('base64url')};
fs.writeFileSync(path.join(dir,'jwt-keys.json'),JSON.stringify([es,oct]),{mode:0o600});
fs.writeFileSync(path.join(dir,'jwt-secret'),secret,{mode:0o600});
fs.writeFileSync(path.join(dir,'service.key'),sign('service_role'),{mode:0o600});
fs.writeFileSync(path.join(dir,'anon.key'),sign('anon'),{mode:0o600});
NODE

cat >"$compose" <<'YAML'
services:
  postgres:
    image: postgres:17
    pull_policy: never
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    tmpfs: ["/var/lib/postgresql/data:rw,noexec,nosuid,size=1400m"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 2s
      timeout: 3s
      retries: 45
    mem_limit: 1800m
    labels: ["vista.runner=${PROJECT}"]
  gotrue:
    image: public.ecr.aws/supabase/gotrue:v2.197.0
    pull_policy: never
    depends_on:
      postgres: {condition: service_healthy}
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      API_EXTERNAL_URL: http://127.0.0.1:${AUTH_PORT}/auth/v1
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}?sslmode=disable&search_path=auth
      GOTRUE_DB_NAMESPACE: auth
      GOTRUE_SITE_URL: http://127.0.0.1:4173
      GOTRUE_JWT_EXP: 3600
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_ISSUER: http://127.0.0.1:${AUTH_PORT}/auth/v1
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_JWT_KEYS: ${JWT_KEYS}
      GOTRUE_DISABLE_SIGNUP: "false"
      GOTRUE_MAILER_AUTOCONFIRM: "true"
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true"
      GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: "true"
      GOTRUE_RATE_LIMIT_HEADER: X-Forwarded-For
      GOTRUE_RATE_LIMIT_TOKEN_REFRESH: "1000"
      GOTRUE_RATE_LIMIT_EMAIL_SENT: "1000"
    mem_limit: 512m
    labels: ["vista.runner=${PROJECT}"]
networks:
  default:
    internal: true
YAML

jwt_secret="$(cat "$run_dir/jwt-secret")"
jwt_keys="$(cat "$run_dir/jwt-keys.json")"
cat >"$compose_env" <<EOF
PROJECT=$project
DB_NAME=$db_name
DB_USER=$db_user
DB_PASSWORD=$db_password
PG_PORT=$pg_port
AUTH_PORT=$auth_port
GOTRUE_PORT=$gotrue_port
JWT_SECRET=$jwt_secret
JWT_KEYS=$jwt_keys
EOF
chmod 600 "$compose_env"

docker compose --project-name "$project" --file "$compose" --env-file "$compose_env" config --quiet || fail 'Compose isolation config validation failed'
compose_started=1
# Start only PostgreSQL first. Wait for the database healthcheck, not merely a
# running container, before invoking the guarded schema bootstrap.
docker compose --project-name "$project" --file "$compose" --env-file "$compose_env" up -d postgres >"$logs/compose-up.log" 2>&1 || { cat "$logs/compose-up.log" >&2; fail 'isolated PostgreSQL failed to start'; }
postgres_id=''; postgres_health='missing'
for _ in $(seq 1 90); do
  postgres_id="$(docker compose --project-name "$project" --file "$compose" --env-file "$compose_env" ps -q postgres 2>/dev/null || true)"
  if [[ -n "$postgres_id" ]]; then
    postgres_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing-healthcheck{{end}}' "$postgres_id" 2>/dev/null || echo inspect-failed)"
    is_container_healthy "$postgres_health" && break
    state="$(docker inspect -f '{{.State.Status}}' "$postgres_id" 2>/dev/null || echo inspect-failed)"
    [[ "$state" == exited || "$state" == dead ]] && break
  fi
  sleep 1
done
if ! is_container_healthy "$postgres_health"; then
  printf 'PostgreSQL readiness state: %s\n' "$postgres_health" >"$logs/postgres-readiness.log"
  if [[ -n "$postgres_id" ]]; then docker logs "$postgres_id" >>"$logs/postgres-readiness.log" 2>&1 || true; fi
  cat "$logs/postgres-readiness.log" >&2
  fail 'disposable PostgreSQL did not become healthy within 90 seconds'
fi

# Compose's internal network intentionally has no published container ports.
# Preserve its egress isolation and expose only fixed-target TCP forwards on
# loopback for backend tools whose safety guards require localhost URLs.
network_name="${project}_default"
network_internal="$(docker network inspect -f '{{.Internal}}' "$network_name" 2>/dev/null || true)"
network_project="$(docker network inspect -f '{{ index .Labels "com.docker.compose.project" }}' "$network_name" 2>/dev/null || true)"
[[ "$network_internal" == true && "$network_project" == "$project" ]] || fail 'runner network is not the expected isolated, owned Compose network'
postgres_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$postgres_id" 2>/dev/null || true)"
[[ -n "$postgres_ip" ]] || fail 'could not determine the isolated PostgreSQL container address'
docker inspect -f 'postgres status={{.State.Status}} exit={{.State.ExitCode}} health={{.State.Health.Status}} ports={{json .NetworkSettings.Ports}} ip={{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$postgres_id" >"$logs/postgres-inspect.log" 2>&1 || fail 'could not record PostgreSQL diagnostics'
docker network inspect -f 'name={{.Name}} internal={{.Internal}} driver={{.Driver}} project={{index .Labels "com.docker.compose.project"}}' "$network_name" >"$logs/network-inspect.log" 2>&1 || fail 'could not record isolated network diagnostics'
node "$DESKTOP_ROOT/scripts/forward-container-port.cjs" "$pg_port" "$postgres_ip" 5432 >"$logs/postgres-forwarder.log" 2>&1 & pg_forward_pid=$!
for _ in $(seq 1 30); do
  current="$(ps -p "$pg_forward_pid" -o args= 2>/dev/null || true)"
  [[ "$current" == *"forward-container-port.cjs $pg_port $postgres_ip 5432"* ]] || fail 'PostgreSQL loopback forwarder did not remain owned by this runner'
  grep -q '^READY ' "$logs/postgres-forwarder.log" && break
  sleep 1
done
grep -q '^READY ' "$logs/postgres-forwarder.log" || fail 'PostgreSQL loopback forwarder did not bind within 30 seconds'

export PYTHONDONTWRITEBYTECODE=1
export VISTA_TEST_DATABASE_NAME="$db_name" VISTA_TEST_DATABASE_PORT="$pg_port" VISTA_DATABASE_PROJECT_REF="local-${run_id}"
admin_url="postgres://${db_user}:${db_password}@127.0.0.1:${pg_port}/${db_name}?sslmode=disable"
export VISTA_DEV_DATABASE_URL="$admin_url" DATABASE_URL="$admin_url"
unset SUPABASE_URL || true
if ! psql "$admin_url" -X --no-psqlrc -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()' >"$logs/psql-connectivity.log" 2>&1; then
  python3 - "$logs/psql-connectivity.log" "$db_password" <<'PY' >&2
from pathlib import Path
import sys
text = Path(sys.argv[1]).read_text(errors="replace").replace(sys.argv[2], "[redacted]")
print("Host-to-disposable-PostgreSQL connectivity diagnostic:")
print(text[:2000])
PY
  fail 'host loopback forwarder could not reach the runner-owned PostgreSQL service; see saved container and forwarder diagnostics'
fi
[[ "$(tr -d '\r\n' <"$logs/psql-connectivity.log")" == "$db_name" ]] || fail 'disposable PostgreSQL connectivity probe returned an unexpected database identity'
python3 "$BACKEND_ROOT/scripts/bootstrap_dev_database.py" --confirm-local-bootstrap --repo-root "$BACKEND_ROOT" >"$logs/bootstrap.log" 2>&1 || { tail -80 "$logs/bootstrap.log" >&2; fail 'guarded disposable database bootstrap failed'; }

# Apply only already-reviewed local staged migrations required by current API. They are confined to this DB.
for migration in 20261116_m_revoke_public_temp_privilege.sql 20261120_r_device_provisioning.sql; do
  path="$BACKEND_ROOT/database/staged-migrations/$migration"
  [[ -f "$path" ]] || fail "required local staged migration missing: $migration"
  python3 "$BACKEND_ROOT/scripts/apply_staged_migration_to_test_database.py" --database-url "$admin_url" "$path" >"$logs/${migration}.log" 2>&1 || { tail -80 "$logs/${migration}.log" >&2; fail "isolated staged migration failed: $migration"; }
done
psql "$admin_url" -v ON_ERROR_STOP=1 -qc "ALTER ROLE vista_app_runtime WITH LOGIN PASSWORD '$runtime_password'" >"$logs/runtime-role.log" 2>&1 || fail 'could not set isolated runtime role password'
psql "$admin_url" -v ON_ERROR_STOP=1 -qc 'CREATE SCHEMA IF NOT EXISTS auth' >"$logs/auth-schema.log" 2>&1 || fail 'could not prepare isolated GoTrue schema'
docker compose --project-name "$project" --file "$compose" --env-file "$compose_env" up -d gotrue >"$logs/gotrue-up.log" 2>&1 || { cat "$logs/gotrue-up.log" >&2; fail 'isolated GoTrue failed to start'; }
gotrue_id="$(docker compose --project-name "$project" --file "$compose" --env-file "$compose_env" ps -q gotrue 2>/dev/null || true)"
[[ -n "$gotrue_id" ]] || fail 'isolated GoTrue container identity is missing'
gotrue_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$gotrue_id" 2>/dev/null || true)"
[[ -n "$gotrue_ip" ]] || fail 'could not determine the isolated GoTrue container address'
docker inspect -f 'gotrue status={{.State.Status}} exit={{.State.ExitCode}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} ports={{json .NetworkSettings.Ports}} ip={{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$gotrue_id" >"$logs/gotrue-inspect.log" 2>&1 || fail 'could not record GoTrue diagnostics'
node "$DESKTOP_ROOT/scripts/forward-container-port.cjs" "$gotrue_port" "$gotrue_ip" 9999 >"$logs/gotrue-forwarder.log" 2>&1 & gotrue_forward_pid=$!
for _ in $(seq 1 30); do
  current="$(ps -p "$gotrue_forward_pid" -o args= 2>/dev/null || true)"
  [[ "$current" == *"forward-container-port.cjs $gotrue_port $gotrue_ip 9999"* ]] || fail 'GoTrue loopback forwarder did not remain owned by this runner'
  grep -q '^READY ' "$logs/gotrue-forwarder.log" && break
  sleep 1
done
grep -q '^READY ' "$logs/gotrue-forwarder.log" || fail 'GoTrue loopback forwarder did not bind within 30 seconds'

# Build only a temporary copy; the read-only backend checkout is never written.
mkdir -p "$api_copy"
tar -C "$BACKEND_ROOT/services/education-api" --exclude=node_modules --exclude=dist --exclude='.env*' -cf - . | tar -C "$api_copy" -xf -
ln -s "$BACKEND_ROOT/services/education-api/node_modules" "$api_copy/node_modules"
(cd "$api_copy" && npm run build) >"$logs/api-build.log" 2>&1 || { tail -80 "$logs/api-build.log" >&2; fail 'Education API build failed'; }

# Seed using the backend's checked-in, guarded fixture seeder.
export VISTA_E2E_ADMIN_DATABASE_URL="$admin_url" SUPABASE_URL="http://127.0.0.1:${auth_port}"
export VISTA_E2E_FIXTURE_FILE="$fixture"
(cd "$api_copy" && node dist/scripts/phase243-e2e-fixtures.js seed) >"$logs/fixture-seed.log" 2>&1 || fail 'supported fixture seed failed; see private diagnostics'

# The checked-in Phase 2.4.3 fixture grants students learning.work.write but
# omits the existing capability required by ExperimentService. Add that known
# capability to this disposable test-only student role so simulation can be
# exercised under the API's real authorization guard; never touches shared DBs.
psql "$admin_url" -X --no-psqlrc -v ON_ERROR_STOP=1 -qc "INSERT INTO public.permissions(code) VALUES ('learning.experiment.execute') ON CONFLICT (code) DO NOTHING; INSERT INTO public.role_permissions(role_id,permission_id) SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p WHERE r.code='student' AND p.code='learning.experiment.execute' ON CONFLICT (role_id,permission_id) DO NOTHING" >"$logs/simulation-capability-fixture.log" 2>&1 || fail 'could not grant the existing schematic capability in disposable student fixtures'

# Add only login identifiers to the disposable fixture records. The fixture seeder creates the underlying users,
# schools, memberships and assignments; these fields are the existing student-login lookup contract.
psql "$admin_url" -v ON_ERROR_STOP=1 -v school_a="$school_a" -v school_b="$school_b" -v code_a="$student_a" -v code_b="$student_b" <<'SQL' >"$logs/student-identifiers.log" 2>&1 || fail 'could not add disposable student login identifiers'
UPDATE public.organizations SET school_code = :'school_a' WHERE id='f2430000-0000-4000-8000-000000000200';
UPDATE public.organizations SET school_code = :'school_b' WHERE id='f2430000-0000-4000-8000-000000000201';
INSERT INTO public.education_school_user_profiles(organization_id,user_id,person_type,student_code,grade_level,account_state)
VALUES ('f2430000-0000-4000-8000-000000000200','f2430000-0000-4000-8000-000000000004','student',:'code_a','7','active'),
       ('f2430000-0000-4000-8000-000000000201','f2430000-0000-4000-8000-000000000006','student',:'code_b','7','active');
DELETE FROM public.learning_enrollments WHERE learner_user_id='f2430000-0000-4000-8000-000000000006';
DELETE FROM public.learning_classroom_members WHERE user_id='f2430000-0000-4000-8000-000000000006';
DELETE FROM public.memberships WHERE user_id='f2430000-0000-4000-8000-000000000006' AND organization_id='f2430000-0000-4000-8000-000000000200';
INSERT INTO public.memberships(user_id,organization_id,role_id,status)
SELECT 'f2430000-0000-4000-8000-000000000006','f2430000-0000-4000-8000-000000000201',id,'active' FROM public.roles WHERE code='student';
SQL

# Start real GoTrue in the isolated Compose network and the checked-in gateway proxy on loopback.
for _ in $(seq 1 60); do
  if curl --silent --fail "http://127.0.0.1:${gotrue_port}/health" >/dev/null; then break; fi
  sleep 1
done
curl --silent --fail "http://127.0.0.1:${gotrue_port}/health" >/dev/null || fail 'isolated GoTrue did not become healthy'
service_key="$(cat "$run_dir/service.key")"; anon_key="$(cat "$run_dir/anon.key")"
fixture_student_auth="$(node -e 'const x=require(process.argv[1]);process.stdout.write(x.users.student.authUserId)' "$fixture")"
fixture_other_auth="$(node -e 'const x=require(process.argv[1]);process.stdout.write(x.users.otherStudent.authUserId)' "$fixture")"
fixture_student_user="$(node -e 'const x=require(process.argv[1]);process.stdout.write(x.users.student.userId)' "$fixture")"
fixture_other_user="$(node -e 'const x=require(process.argv[1]);process.stdout.write(x.users.otherStudent.userId)' "$fixture")"
for pair in "${fixture_student_auth}|${fixture_student_user}|$student_password" "${fixture_other_auth}|${fixture_other_user}|$other_password"; do
  IFS='|' read -r auth_user_id application_user_id pass <<<"$pair"
  # StudentAuthService authenticates using the alias derived from the app user
  # ID while GoTrue's identity ID is the fixture auth_user_id.
  payload="$(node -e 'process.stdout.write(JSON.stringify({id:process.argv[1],email:"student-"+process.argv[2]+"@students.auth.vista.invalid",password:process.argv[3],email_confirm:true}))' "$auth_user_id" "$application_user_id" "$pass")"
  http="$(curl --silent --output "$logs/auth-user.json" --write-out '%{http_code}' -X POST "http://127.0.0.1:${gotrue_port}/admin/users" -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: application/json' --data "$payload")"
  [[ "$http" == 200 || "$http" == 201 ]] || fail "GoTrue disposable identity creation failed (HTTP $http)"
done

node "$BACKEND_ROOT/web/robot-edu/tests/e2e/local-gotrue-proxy.mjs" "$auth_port" "$gotrue_port" >"$logs/auth-proxy.log" 2>&1 & proxy_pid=$!
for _ in $(seq 1 30); do curl --silent --output /dev/null "http://127.0.0.1:${auth_port}/auth/v1/health" && break; sleep 1; done

# Runtime API only receives local endpoints and disposable credentials. Never inherit AWS, hosted Supabase or Production config.
api_env="$run_dir/api.env"
runtime_url="postgres://vista_app_runtime:${runtime_password}@127.0.0.1:${pg_port}/${db_name}?sslmode=disable"
cat >"$api_env" <<EOF
NODE_ENV=development
HOST=127.0.0.1
PORT=$api_port
TRUST_PROXY=1
DATABASE_URL=$runtime_url
VISTA_DATABASE_PROJECT_REF=local-$run_id
SUPABASE_URL=http://127.0.0.1:$auth_port
SUPABASE_SERVICE_ROLE_KEY=$service_key
SUPABASE_ANON_KEY=$anon_key
STUDENT_TEMP_PASSWORD_ENABLED=false
SUPABASE_JWT_ISSUER=http://127.0.0.1:$auth_port/auth/v1
SUPABASE_JWT_AUDIENCE=authenticated
WEB_ORIGIN=http://127.0.0.1:4173
DEVICE_PROVISIONING_ENABLED=false
DIGITAL_TWIN_SCOPE_SECRET=$device_secret
EOF
chmod 600 "$api_env"
(cd "$api_copy" && env -i PATH="$PATH" HOME="${HOME:-/tmp}" bash -c 'set -a; source "$1"; set +a; exec node "$2/dist/main.js"' _ "$api_env" "$api_copy") >"$logs/education-api.log" 2>&1 & api_pid=$!

healthy=0
for _ in $(seq 1 60); do
  if curl --silent --fail "http://127.0.0.1:${api_port}/api/v1/health" >/dev/null; then healthy=1; break; fi
  sleep 1
done
(( healthy )) || { tail -80 "$logs/education-api.log" >&2; fail 'Education API did not become healthy within 60 seconds'; }

# Resolve fixture attempt placeholder from a generated UUID; write acceptance uses its newly created actual attempt.
attempt_placeholder="$(cat /proc/sys/kernel/random/uuid)"
export VISTA_TEST_EDUCATION_API_URL="http://127.0.0.1:${api_port}/api/v1"
export VISTA_TEST_SCHOOL_CODE="$school_a" VISTA_TEST_STUDENT_CODE="$student_a" VISTA_TEST_STUDENT_PASSWORD="$student_password"
export VISTA_TEST_OTHER_SCHOOL_CODE="$school_b" VISTA_TEST_OTHER_STUDENT_CODE="$student_b" VISTA_TEST_OTHER_STUDENT_PASSWORD="$other_password"
export VISTA_TEST_SUPABASE_URL="http://127.0.0.1:${auth_port}" VISTA_TEST_SUPABASE_ANON_KEY="$anon_key"
export VISTA_TEST_ATTEMPT_ID="$attempt_placeholder" VISTA_TEST_ENABLE_MUTATIONS=1 VISTA_TEST_ENABLE_SIMULATION=1
export VISTA_TEST_ASSIGNMENT_ID="$(node -e 'process.stdout.write(require(process.argv[1]).programDeliveryId)' "$fixture")"
export VISTA_TEST_WORKSPACE_JSON='{"blocks":{"languageVersion":0,"blocks":[]}}'
export VISTA_TEST_ROBOT_PROGRAM_JSON='{"kind":"robot_program","schemaVersion":1,"steps":[]}'
set +e
(cd "$DESKTOP_ROOT" && npm run test:integration) >"$logs/desktop-acceptance.log" 2>&1
acceptance_rc=$?
set -e
cat "$logs/desktop-acceptance.log"
printf '%s\n' "$acceptance_rc" >"$run_dir/exit-status"

# Independently confirm that the API's accepted attempt, program version, and submission
# are durable rows in this run's disposable PostgreSQL database before teardown.
accepted_ids="$(node - "$logs/desktop-acceptance.log" <<'NODE'
const fs = require('node:fs');
const lines = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(line => line.startsWith('VISTA_ACCEPTANCE_IDS '));
if (lines.length !== 1) process.exit(2);
const ids = JSON.parse(lines[0].slice('VISTA_ACCEPTANCE_IDS '.length));
for (const key of ['attemptId', 'programId', 'versionId']) if (!/^[0-9a-f-]{36}$/i.test(ids[key] || '')) process.exit(3);
process.stdout.write([ids.attemptId, ids.programId, ids.versionId].join(' '));
NODE
)" || fail 'API acceptance did not emit a valid disposable persistence readback key'
read -r accepted_attempt accepted_program accepted_version <<<"$accepted_ids"
db_row="$(psql "$admin_url" -X --no-psqlrc -v ON_ERROR_STOP=1 -v attempt_id="$accepted_attempt" -v program_id="$accepted_program" -v version_id="$accepted_version" -Atq 2>"$logs/database-readback.log" <<'SQL'
SELECT json_build_object('attempt_status',a.status,'attempt_program_id',a.program_id,'program_id',p.id,'version_program_id',v.program_id,'version_id',v.id,'submission_attempt_id',s.attempt_id,'submission_status',s.status,'submission_version_id',s.program_version_id)::text
FROM public.learning_assignment_attempts a
LEFT JOIN public.learning_programs p ON p.id = a.program_id AND p.id = :'program_id'::uuid
LEFT JOIN public.learning_program_versions v ON v.id = :'version_id'::uuid
LEFT JOIN public.learning_submissions s ON s.attempt_id = a.id
WHERE a.id = :'attempt_id'::uuid;
SQL
)" || fail 'independent PostgreSQL persistence query failed'
printf '%s\n' "$db_row" >"$logs/database-readback-row.json"
if ! node - "$logs/database-readback-row.json" <<'NODE'
const fs = require('node:fs');
const row = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.exit(row.attempt_status && ['submitted','evaluated'].includes(row.attempt_status)
  && row.attempt_program_id === row.program_id && row.version_program_id === row.program_id
  && row.submission_attempt_id && row.submission_status && ['submitted','evaluated'].includes(row.submission_status)
  && row.submission_version_id === row.version_id ? 0 : 1);
NODE
then fail 'database rows did not confirm submitted attempt, program, immutable version, and linked submission; inspect private database-readback-row.json'; fi
printf 'Independent disposable PostgreSQL readback passed for attempt/program/version/submission rows.\n' >>"$logs/desktop-acceptance.log"

(( acceptance_rc == 0 )) || fail "Desktop integration acceptance found a backend contract failure after completing write/readback checks; see private logs at $logs"

printf 'PASS: isolated LMS API acceptance completed. Run namespace: %s\n' "$project"
printf 'No Demo fallback was enabled. API and GoTrue used disposable credentials and the tmpfs database.\n'
successful=1
exit 0
