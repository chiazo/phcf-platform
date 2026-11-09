#!/bin/bash
set -e

VM_DATA_DIR=/root/pb_data

# ---------------------------------------
# Config — edit to match your project
# ---------------------------------------
if [ -f ./.env ]; then
  set -a
  source ./.env
  set +a
fi

PROJECT_ID=${GCP_PROJECT_ID:-$(gcloud config get-value project)}
ZONE=${GCP_ZONE:-us-east1-b}
REGION=${GCP_REGION:-us-east1}
VM_NAME=${GCP_VM_NAME:-pocketbase-vm}
REPO="phcf-scratch-pad"
IMAGE="us-docker.pkg.dev/$PROJECT_ID/$REPO/pocketbase"
STATIC_IP_NAME="pocketbase-ip"

SUPERUSER_EMAIL_DEFAULT=${SUPERUSER_EMAIL:-}
SUPERUSER_PASSWORD_DEFAULT=${SUPERUSER_PASSWORD:-}

CMD=${1:-help}

# ---------------------------------------
# Helpers
# ---------------------------------------
remote_run () {
  gcloud compute ssh "$VM_NAME" \
    --project="$PROJECT_ID" \
    --zone="$ZONE" \
    --command="$1"
}

get_static_ip () {
  gcloud compute addresses describe "$STATIC_IP_NAME" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format="value(address)"
}

get_backend_url () {
  echo "https://$(get_static_ip).nip.io"
}

# ---------------------------------------
# build: rebuild + push the image
# ---------------------------------------
build () {
  if [ ! -f ./server/Dockerfile ]; then
    echo "❌ server/Dockerfile is missing — cannot build."
    exit 1
  fi
  echo "🐳 Building and pushing PocketBase image..."
  gcloud builds submit ./server --tag "$IMAGE"
  echo "✅ Image pushed: $IMAGE"
}

# ---------------------------------------
# deploy: pull latest image on VM, replace container (keeps existing data)
# ---------------------------------------
deploy () {
  echo "☁️  Deploying latest image to $VM_NAME..."
  remote_run "
    set -e
    docker pull $IMAGE
    docker stop pocketbase || true
    docker rm pocketbase || true
    docker run -d \
      --name pocketbase \
      -p 127.0.0.1:8080:8080 \
      -v "$VM_DATA_DIR:/app/pb_data" \
      --restart unless-stopped \
      $IMAGE
    sleep 2
    echo '--- Recent logs ---'
    docker logs --tail 30 pocketbase
  "
}

build_and_deploy () {
  build
  deploy
}

# ---------------------------------------
# reset: WIPE local pb_data on the VM and redeploy fresh
#   use when schema drift causes 'Field type cannot be changed' crash loops
# ---------------------------------------
reset () {
  echo "⚠️  This will PERMANENTLY DELETE all data in pb_data on $VM_NAME."
  read -p "Type 'reset' to confirm: " CONFIRM
  if [ "$CONFIRM" != "reset" ]; then
    echo "Aborted."
    exit 1
  fi

  echo "🧨 Wiping pb_data and redeploying clean..."
  remote_run "
    set -e
    docker stop pocketbase || true
    docker rm pocketbase || true
    sudo rm -rf /root/pb_data
	
	PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
    IMAGE="us-docker.pkg.dev/${PROJECT_ID}/phcf-scratch-pad/pocketbase:latest"

    TOKEN=\$(curl -fsS \
      -H 'Metadata-Flavor: Google' \
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' \
      | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"access_token\"])')

    printf '%s' \"\$TOKEN\" | docker login \
      -u oauth2accesstoken \
      --password-stdin https://us-docker.pkg.dev

    unset TOKEN

    docker pull $IMAGE
    docker run -d \
      --name pocketbase \
      -p 127.0.0.1:8080:8080 \
      -v /root/pb_data:/app/pb_data \
      --restart unless-stopped \
      $IMAGE
    sleep 2
    echo '--- Recent logs ---'
    docker logs --tail 30 pocketbase
  "

  echo "🔑 Recreating superuser..."
  superuser "$SUPERUSER_EMAIL_DEFAULT" "$SUPERUSER_PASSWORD_DEFAULT"

  echo "✅ Reset complete. Backend URL: $(get_backend_url)"
}

# ---------------------------------------
# superuser: safely create/update a superuser
#   stops the live server, runs a one-off container, restarts the server
# ---------------------------------------
superuser () {
  local EMAIL=${1:-$SUPERUSER_EMAIL_DEFAULT}
  local PASS=${2:-$SUPERUSER_PASSWORD_DEFAULT}

  if [ -z "$EMAIL" ] || [ -z "$PASS" ]; then
    echo "❌ Superuser email and password are required."
    exit 1
  fi

  echo "🔑 Upserting superuser $EMAIL..."

  # Quote values safely for the remote Bash shell.
  printf -v Q_EMAIL '%q' "$EMAIL"
  printf -v Q_PASS '%q' "$PASS"
  printf -v Q_IMAGE '%q' "$IMAGE"

  remote_run "
    set -Eeuo pipefail

    DATA_DIR=/root/pb_data
    CONTAINER=pocketbase
    WAS_RUNNING=0

    if docker inspect -f '{{.State.Running}}' \"\$CONTAINER\" 2>/dev/null | grep -qx true; then
      WAS_RUNNING=1
      docker stop \"\$CONTAINER\"
    fi

    cleanup() {
      if [ \"\$WAS_RUNNING\" = 1 ]; then
        docker start \"\$CONTAINER\" >/dev/null || \
          echo 'ERROR: Could not restart PocketBase.' >&2
      fi
    }
    trap cleanup EXIT

    docker run --rm \
      -v \"\$DATA_DIR:/app/pb_data\" \
      $Q_IMAGE \
      /app/app superuser upsert $Q_EMAIL $Q_PASS

    echo '✅ Superuser upsert succeeded.'
  "
}


# ---------------------------------------
# import: safely import a CSV into production
#
# Usage:
#   ./gcp-manage.sh import ./members.csv
#   ./gcp-manage.sh import ./members.csv --dry-run
#
# Real imports always dry-run first and require confirmation.
# ---------------------------------------
# ---------------------------------------
# import: safely import members + requirements CSVs into production
#
# Usage:
#   ./gcp-manage.sh import ./members.csv ./requirements.csv
#   ./gcp-manage.sh import ./members.csv ./requirements.csv --dry-run
#
# Real imports always dry-run first, take a backup, and require confirmation.
# ---------------------------------------
import_csv () {
  local MEMBERS_PATH="${1:-}"
  local REQUIREMENTS_PATH="${2:-}"
  local MODE="${3:-}"

  if [ -z "$MEMBERS_PATH" ] || [ ! -f "$MEMBERS_PATH" ] ||
     [ -z "$REQUIREMENTS_PATH" ] || [ ! -f "$REQUIREMENTS_PATH" ]; then
    echo "❌ Provide valid local members and requirements CSV files."
    echo "Usage: $0 import <members.csv> <requirements.csv> [--dry-run]"
    return 1
  fi

  if [ -n "$MODE" ] && [ "$MODE" != "--dry-run" ]; then
    echo "❌ Unknown option: $MODE"
    return 1
  fi

  if [ "$#" -gt 3 ]; then
    echo "❌ Too many arguments."
    return 1
  fi

  local DRY_ONLY=0
  [ "$MODE" = "--dry-run" ] && DRY_ONLY=1

  echo "🔍 Checking production VM and database..."

  remote_run '
  set -e
  docker inspect pocketbase >/dev/null
  docker inspect pocketbase \
    --format "{{range .Mounts}}{{if eq .Destination \"/app/pb_data\"}}{{.Source}}{{end}}{{end}}" \
    | grep -qx "/root/pb_data"
  sudo test -f /root/pb_data/data.db
  sudo test -f /root/pb_data/auxiliary.db
  echo "Production container and database verified."
' || {
    echo "❌ Production container or database verification failed."
    return 1
  }

  # Upload both CSVs to temporary locations on the VM.
  local STAMP="$(date +%s)-$$"
  local REMOTE_MEMBERS="/tmp/pb-import-members-$STAMP.csv"
  local REMOTE_REQS="/tmp/pb-import-requirements-$STAMP.csv"
  local Q_IMAGE Q_MEMBERS Q_REQS
  printf -v Q_IMAGE '%q' "$IMAGE"
  printf -v Q_MEMBERS '%q' "$REMOTE_MEMBERS"
  printf -v Q_REQS '%q' "$REMOTE_REQS"

  cleanup_remote () {
    remote_run "rm -f $Q_MEMBERS $Q_REQS" || true
  }

  echo "📤 Copying CSVs to production VM..."
  gcloud compute scp "$MEMBERS_PATH" "$VM_NAME:$REMOTE_MEMBERS" \
    --project="$PROJECT_ID" --zone="$ZONE" || {
      echo "❌ Members CSV upload failed."
      return 1
    }
  gcloud compute scp "$REQUIREMENTS_PATH" "$VM_NAME:$REMOTE_REQS" \
    --project="$PROJECT_ID" --zone="$ZONE" || {
      echo "❌ Requirements CSV upload failed."
      cleanup_remote
      return 1
    }

  # Stop the live container to avoid concurrent SQLite access, and always
  # restart it, even if the import fails.
  run_remote_import () {
    local IMPORT_MODE="$1"
    local Q_MODE=""
    if [ -n "$IMPORT_MODE" ]; then
      printf -v Q_MODE '%q' "$IMPORT_MODE"
    fi

    remote_run "
      set -Eeuo pipefail

      CONTAINER=pocketbase
      WAS_RUNNING=0

      if docker inspect -f '{{.State.Running}}' \"\$CONTAINER\" 2>/dev/null | grep -qx true; then
        WAS_RUNNING=1
        docker stop \"\$CONTAINER\" >/dev/null
      fi

      cleanup() {
        local STATUS=\$?
        trap - EXIT
        if [ \"\$WAS_RUNNING\" = 1 ]; then
          docker start \"\$CONTAINER\" >/dev/null || {
            echo '❌ WARNING: PocketBase did not restart.' >&2
            STATUS=1
          }
        fi
        exit \"\$STATUS\"
      }
      trap cleanup EXIT

      test -f $Q_MEMBERS
      test -f $Q_REQS

      docker run --rm \\
        -v /root/pb_data:/app/pb_data \\
        -v $Q_MEMBERS:/tmp/members.csv:ro \\
        -v $Q_REQS:/tmp/requirements.csv:ro \\
        $Q_IMAGE \\
        /app/app import-members /tmp/members.csv /tmp/requirements.csv $Q_MODE
    "
  }

  # Copy pb_data before a real import. The container is stopped while this
  # runs, so the SQLite files are consistent.
  backup_remote () {
    remote_run "
      set -e
      docker stop pocketbase >/dev/null 2>&1 || true
      sudo tar czf /root/pb_data_pre_import_$STAMP.tgz -C /root pb_data
      docker start pocketbase >/dev/null
      echo 'Backup: /root/pb_data_pre_import_$STAMP.tgz'
    "
  }

  echo
  echo "🧪 Running production dry run..."
  if ! run_remote_import "--dry-run"; then
    cleanup_remote
    echo "❌ Dry run failed. No import was attempted."
    return 1
  fi

  if [ "$DRY_ONLY" = 1 ]; then
    cleanup_remote
    echo "✅ Dry run complete. No import was attempted."
    return 0
  fi

  echo
  echo "⚠️  The dry run completed. Review its output above."
  echo "This will now write changes to the PRODUCTION database."
  read -r -p "Type IMPORT to proceed: " CONFIRM

  if [ "$CONFIRM" != "IMPORT" ]; then
    cleanup_remote
    echo "Aborted. No real import was attempted."
    return 1
  fi

  echo "💾 Backing up pb_data..."
  if ! backup_remote; then
    cleanup_remote
    echo "❌ Backup failed. No import was attempted."
    return 1
  fi

  echo "📥 Importing CSVs into production..."
  if run_remote_import ""; then
    cleanup_remote
    echo "✅ Production import completed."
  else
    cleanup_remote
    echo "❌ Import failed. Check production logs and database state."
    echo "   The pre-import backup is on the VM in /root (pb_data_pre_import_*.tgz)."
    return 1
  fi
}

# ---------------------------------------
# logs: tail live logs
# ---------------------------------------
logs () {
  remote_run "docker logs -f --tail 100 pocketbase"
}

# ---------------------------------------
# status: quick health check (local + through Caddy/HTTPS)
# ---------------------------------------
status () {
  echo "📦 Container status:"
  remote_run "docker ps --filter name=pocketbase"

  local IP
  IP=$(get_static_ip)
  echo "🌐 Static IP: $IP"
  echo "🌐 Backend URL: https://${IP}.nip.io"

  echo "🔍 Local health check (on VM, bypassing Caddy):"
  remote_run "curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8080/api/health"

  echo "🔍 Public HTTPS health check (through Caddy):"
  curl -s -o /dev/null -w "HTTP %{http_code}\n" "https://${IP}.nip.io/api/health" || echo "Could not reach service"
}

# ---------------------------------------
# restart: just restart the running container (no data loss)
# ---------------------------------------
restart () {
  remote_run "docker restart pocketbase && sleep 2 && docker logs --tail 30 pocketbase"
}

# ---------------------------------------
# caddy-restart: restart the reverse proxy (not the app container)
# ---------------------------------------
caddy_restart () {
  remote_run "sudo systemctl restart caddy && sudo systemctl status caddy --no-pager | head -20"
}

# ---------------------------------------
# ssh: drop into an interactive shell on the VM
# ---------------------------------------
ssh_in () {
  gcloud compute ssh "$VM_NAME" --zone="$ZONE"
}

# ---------------------------------------
# url: print the current backend URL
# ---------------------------------------
url () {
  get_backend_url
}

# ---------------------------------------
# Dispatch
# ---------------------------------------
case "$CMD" in
  build)              build ;;
  deploy)              deploy ;;
  build-and-deploy)    build_and_deploy ;;
  reset)               reset ;;
  superuser)           superuser "$2" "$3" ;;
  import)              import_csv "$2" "$3" "$4" ;;
  logs)                logs ;;
  status)              status ;;
  restart)             restart ;;
  caddy-restart)       caddy_restart ;;
  ssh)                 ssh_in ;;
  url)                 url ;;
  *)
    cat <<EOF
GCP PocketBase management script

Usage: $0 <command> [args]

Commands:
  build                    Rebuild and push the PocketBase image to Artifact Registry
  deploy                   Pull the latest image on the VM and restart the container (keeps data)
  build-and-deploy         Do both of the above in sequence
  reset                    ⚠️  WIPE pb_data on the VM, redeploy clean, recreate superuser
                           (use this when you see "Field type cannot be changed" crash loops)
  superuser [EMAIL] [PASS] Safely create/update a superuser (defaults from .env)
  import <members.csv> <requirements.csv> [--dry-run] Import a CSV into production; dry-run first and confirm before writing
  logs                     Tail live container logs
  status                   Show container status, static IP, and health checks (local + HTTPS)
  restart                  Restart the running container (no image change, no data loss)
  caddy-restart            Restart the Caddy reverse proxy service
  ssh                      Open an interactive shell on the VM
  url                      Print the current backend URL (https://IP.nip.io)

Examples:
  $0 build-and-deploy
  $0 reset
  $0 superuser admin@example.com correcthorsebatterystaple
  $0 status
EOF
    ;;
esac