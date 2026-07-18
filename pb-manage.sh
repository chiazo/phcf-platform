#!/bin/bash
set -e

# ---------------------------------------
# Config — edit these to match your project
# ---------------------------------------
PROJECT_ID=$(gcloud config get-value project)
REGION="us-east1"
ZONE="us-east1-b"
VM_NAME="pocketbase-vm"
REPO="phcf-scratch-pad"
IMAGE="us-docker.pkg.dev/$PROJECT_ID/$REPO/pocketbase"
VOLUME_PATH="/home/\$USER/pb_data"   # expanded on the VM itself

CMD=${1:-help}

# ---------------------------------------
# Helpers
# ---------------------------------------
remote_run () {
  # Run a command on the VM non-interactively
  gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="$1"
}

# ---------------------------------------
# build: rebuild + push the image
# ---------------------------------------
build () {
  echo "🐳 Building and pushing PocketBase image..."
  gcloud builds submit ./server --tag "$IMAGE"
  echo "✅ Image pushed: $IMAGE"
}

# ---------------------------------------
# deploy: pull latest image on VM, replace container
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
      -v $VOLUME_PATH:/app/pb_data \
      --restart unless-stopped \
      $IMAGE
    echo '✅ Container started. Recent logs:'
    sleep 2
    docker logs --tail 30 pocketbase
  "
}

# ---------------------------------------
# build-and-deploy: do both in sequence
# ---------------------------------------
build_and_deploy () {
  build
  deploy
}

# ---------------------------------------
# superuser: safely create/update a superuser
#   stops the live server, runs a one-off container, restarts the server
# ---------------------------------------
superuser () {
  local EMAIL=$2
  local PASS=$3

  if [ -z "$EMAIL" ] || [ -z "$PASS" ]; then
    echo "Usage: $0 superuser EMAIL PASSWORD"
    exit 1
  fi

  echo "🔑 Upserting superuser $EMAIL..."
  remote_run "
    set -e
    docker stop pocketbase || true
    docker run --rm \
      -v $VOLUME_PATH:/app/pb_data \
      $IMAGE \
      /app/app superuser upsert '$EMAIL' '$PASS'
    docker start pocketbase
    echo '✅ Superuser upserted. Recent logs:'
    sleep 2
    docker logs --tail 20 pocketbase
  "
}

# ---------------------------------------
# list-superusers
# ---------------------------------------
list_superusers () {
  echo "📋 Listing superusers..."
  remote_run "
    set -e
    docker stop pocketbase || true
    docker run --rm \
      -v $VOLUME_PATH:/server/pb_data \
      $IMAGE \
      /app/app superuser list
    docker start pocketbase
  "
}

# ---------------------------------------
# logs: tail live logs
# ---------------------------------------
logs () {
  remote_run "docker logs -f --tail 100 pocketbase"
}

# ---------------------------------------
# status: quick health check
# ---------------------------------------
status () {
  remote_run "docker ps --filter name=pocketbase"
  IP=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format="value(networkInterfaces[0].accessConfigs[0].natIP)")
  echo "🌐 External IP: $IP"
  echo "🔍 Health check:"
  curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://$IP:8080/api/health" || echo "Could not reach service"
}

# ---------------------------------------
# restart: just restart the running container
# ---------------------------------------
restart () {
  remote_run "docker restart pocketbase && sleep 2 && docker logs --tail 30 pocketbase"
}

# ---------------------------------------
# ssh: drop into an interactive shell on the VM
# ---------------------------------------
ssh_in () {
  gcloud compute ssh "$VM_NAME" --zone="$ZONE"
}

# ---------------------------------------
# Dispatch
# ---------------------------------------
case "$CMD" in
  build)              build ;;
  deploy)              deploy ;;
  build-and-deploy)    build_and_deploy ;;
  superuser)           superuser "$@" ;;
  list-superusers)     list_superusers ;;
  logs)                logs ;;
  status)              status ;;
  restart)             restart ;;
  ssh)                 ssh_in ;;
  *)
    cat <<EOF
PocketBase VM management script

Usage: $0 <command> [args]

Commands:
  build                    Rebuild and push the PocketBase image to Artifact Registry
  deploy                   Pull the latest image on the VM and restart the container
  build-and-deploy         Do both of the above in sequence
  superuser EMAIL PASS     Safely create/update a superuser (stops server, runs one-off, restarts)
  list-superusers          List existing superusers
  logs                     Tail live container logs
  status                   Show container status, external IP, and health check
  restart                  Restart the running container (no image change)
  ssh                      Open an interactive shell on the VM

Examples:
  $0 build-and-deploy
  $0 superuser admin@example.com correcthorsebatterystaple
  $0 status
EOF
    ;;
esac