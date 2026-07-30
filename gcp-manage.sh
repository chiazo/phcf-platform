#!/bin/bash
set -e

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

SUPERUSER_EMAIL_DEFAULT=${SUPERUSER_EMAIL:-admin@gmail.com}
SUPERUSER_PASSWORD_DEFAULT=${SUPERUSER_PASSWORD:-admin-password}

CMD=${1:-help}

# ---------------------------------------
# Helpers
# ---------------------------------------
remote_run () {
  gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="$1"
}

get_static_ip () {
  gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" --format="value(address)"
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
      -p 8080:8080 \
      -v \$HOME/pb_data:/app/pb_data \
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
    sudo rm -rf \$HOME/pb_data
    docker pull $IMAGE
    docker run -d \
      --name pocketbase \
      -p 8080:8080 \
      -v \$HOME/pb_data:/app/pb_data \
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

  echo "🔑 Upserting superuser $EMAIL..."
  remote_run "
    set -e
    docker stop pocketbase || true
    docker run --rm \
      -v \$HOME/pb_data:/app/pb_data \
      $IMAGE \
      /app/app superuser upsert '$EMAIL' '$PASS'
    docker start pocketbase
    echo '✅ Superuser upserted. Recent logs:'
    sleep 2
    docker logs --tail 20 pocketbase
  "
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