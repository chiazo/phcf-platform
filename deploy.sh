#!/bin/bash
set -e

if [ -f ./.env ]; then
  set -a
  source ./.env
  set +a
fi

TARGET=${1:-auto}
PROVIDER_OVERRIDE=$2   # optional: ./deploy.sh backend gcp

BACKEND_PROVIDER=${PROVIDER_OVERRIDE:-${BACKEND_PROVIDER:-fly}}
DEPLOY_SHA_FILE=".last-deploy-sha"
LAST_GCP_VM_FILE=".last-gcp-vm"

echo "🚀 Deploy mode: $TARGET (backend: $BACKEND_PROVIDER)"

# ---------------------------------------
# Helpers
# ---------------------------------------
last_deploy_sha () {
  if [ -f "$DEPLOY_SHA_FILE" ]; then
    cat "$DEPLOY_SHA_FILE"
  else
    git rev-list --max-parents=0 HEAD | tail -1
  fi
}

changed_www () {
  git diff --name-only "$(last_deploy_sha)"...HEAD | grep -q "^www/"
}

changed_server () {
  git diff --name-only "$(last_deploy_sha)"...HEAD | grep -q "^server/"
}

record_deploy () {
  git rev-parse HEAD > "$DEPLOY_SHA_FILE"
}

# ---------------------------------------
# Backend URL resolution
# ---------------------------------------
get_backend_url () {
  if [ "$BACKEND_PROVIDER" = "fly" ]; then
    echo "https://${FLY_APP}.fly.dev"
  elif [ "$BACKEND_PROVIDER" = "gcp" ]; then
    local IP
    IP=$(gcloud compute addresses describe pocketbase-ip --region=us-east1 --format="value(address)")
    echo "https://${IP}.nip.io"
  fi
}

# ---------------------------------------
# Frontend (Vercel) — always points at whichever backend is active
# ---------------------------------------
deploy_frontend () {
  local PB_URL
  PB_URL=$(get_backend_url)
  echo "📦 Deploying Astro frontend to Vercel (backend: $BACKEND_PROVIDER → $PB_URL)..."

  (
    cd www
    vercel env rm PUBLIC_PB_URL production --yes >/dev/null 2>&1 || true
    echo "$PB_URL" | vercel env add PUBLIC_PB_URL production
    vercel --prod
  )
}

# ---------------------------------------
# GCP safety checks
# ---------------------------------------

# Fix #2: guard against GCP_VM_NAME silently pointing at a different VM than
# the one this project has been deploying to. If the VM name changes without
# anyone noticing, the "new" VM's pb_data starts empty — which looks
# identical to data loss even though nothing was technically overwritten.
check_gcp_vm_identity () {
  if [ -z "$GCP_VM_NAME" ]; then
    echo "❌ GCP_VM_NAME is not set. Refusing to deploy without an explicit target VM."
    exit 1
  fi

  if [ -f "$LAST_GCP_VM_FILE" ]; then
    local PREVIOUS_VM
    PREVIOUS_VM=$(cat "$LAST_GCP_VM_FILE")

    if [ "$PREVIOUS_VM" != "$GCP_VM_NAME" ]; then
      echo "⚠️  GCP_VM_NAME has changed since the last deploy:"
      echo "    previous: $PREVIOUS_VM"
      echo "    current:  $GCP_VM_NAME"
      echo "    Deploying to a different VM means its pb_data will be whatever"
      echo "    already exists there (likely empty on a fresh VM), NOT the data"
      echo "    from $PREVIOUS_VM."
      read -r -p "    Continue anyway? [y/N] " CONFIRM
      if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        echo "❌ Aborted."
        exit 1
      fi
    fi
  fi

  echo "$GCP_VM_NAME" > "$LAST_GCP_VM_FILE"
}

# Fix #1: snapshot pb_data to GCS immediately before any deploy that could
# touch the running container, so a bad deploy or host-level accident is
# always recoverable. Requires GCS_BACKUP_BUCKET to be set in .env and the
# VM's service account to have write access to that bucket.
backup_pb_data_gcp () {
  if [ -z "$GCS_BACKUP_BUCKET" ]; then
  	echo "❌ GCS_BACKUP_BUCKET is not set."
  	echo "   Refusing to deploy without a PocketBase backup."
  	exit 1
 fi

  local TIMESTAMP
  TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
  local BACKUP_PATH="gs://${GCS_BACKUP_BUCKET}/pb_data-backups/${GCP_VM_NAME}/${TIMESTAMP}.tar.gz"

  echo "💾 Backing up pb_data on $GCP_VM_NAME to $BACKUP_PATH ..."

  gcloud compute ssh "$GCP_VM_NAME" --zone="$GCP_ZONE" --command="
    set -e
    if [ ! -d \$HOME/pb_data ] || [ -z \"\$(ls -A \$HOME/pb_data 2>/dev/null)\" ]; then
      echo '⚠️  pb_data is missing or empty on this VM — nothing to back up.'
      exit 0
    fi
    tar -czf /tmp/pb_data_backup.tar.gz -C \$HOME pb_data
    gcloud storage cp /tmp/pb_data_backup.tar.gz '$BACKUP_PATH'
    rm -f /tmp/pb_data_backup.tar.gz
  "

  echo "✅ Backup complete: $BACKUP_PATH"
}

# Optional companion to backup_pb_data_gcp — restores the most recent backup
# for the current GCP_VM_NAME. Stops the container first since PocketBase
# shouldn't be writing to pb_data mid-restore.
restore_pb_data_gcp () {
  if [ -z "$GCS_BACKUP_BUCKET" ]; then
    echo "❌ GCS_BACKUP_BUCKET is not set — nowhere to restore from."
    exit 1
  fi

  echo "⚠️  This will REPLACE the current pb_data on $GCP_VM_NAME with the"
  echo "    most recent backup for that VM. The running container will be"
  echo "    stopped during the restore."
  read -r -p "    Continue? [y/N] " CONFIRM
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "❌ Aborted."
    exit 1
  fi

  gcloud compute ssh "$GCP_VM_NAME" --zone="$GCP_ZONE" --command="
    set -e
    LATEST=\$(gcloud storage ls 'gs://${GCS_BACKUP_BUCKET}/pb_data-backups/${GCP_VM_NAME}/*.tar.gz' | sort | tail -1)
    if [ -z \"\$LATEST\" ]; then
      echo '❌ No backups found for ${GCP_VM_NAME}.'
      exit 1
    fi
    echo \"⬇️  Restoring \$LATEST ...\"
    docker stop pocketbase || true
    gcloud storage cp \"\$LATEST\" /tmp/pb_data_restore.tar.gz
    rm -rf \$HOME/pb_data
    tar -xzf /tmp/pb_data_restore.tar.gz -C \$HOME
    rm -f /tmp/pb_data_restore.tar.gz
    docker start pocketbase
  "

  echo "✅ Restore complete."
}

# ---------------------------------------
# Backend — dispatches to fly or gcp
# ---------------------------------------
deploy_backend () {
  if [ "$BACKEND_PROVIDER" = "fly" ]; then
    deploy_backend_fly
  elif [ "$BACKEND_PROVIDER" = "gcp" ]; then
    deploy_backend_gcp
  else
    echo "❌ Unknown BACKEND_PROVIDER: $BACKEND_PROVIDER"
    exit 1
  fi
}

deploy_backend_fly () {
  echo "📦 Deploying PocketBase to Fly.io..."
  (cd server && fly deploy)
}

deploy_backend_gcp () {
  if [ ! -f ./server/Dockerfile ]; then
    echo "❌ server/Dockerfile is missing — cannot build GCP image."
    exit 1
  fi

  check_gcp_vm_identity
  backup_pb_data_gcp

  echo "📦 Deploying PocketBase to GCP VM..."

  PROJECT_ID=$(gcloud config get-value project)
  REPO="phcf-scratch-pad"
  IMAGE="us-docker.pkg.dev/$PROJECT_ID/$REPO/pocketbase"

  echo "🐳 Building and pushing image..."
  gcloud builds submit ./server --tag "$IMAGE"

  echo "☁️ Deploying to $GCP_VM_NAME..."
  gcloud compute ssh "$GCP_VM_NAME" --zone="$GCP_ZONE" --command="
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
    docker logs --tail 20 pocketbase
  "
}

# ---------------------------------------
# Superuser — dispatches to fly or gcp
# ---------------------------------------
superuser () {
  local EMAIL=${1:-$SUPERUSER_EMAIL}
  local PASS=${2:-$SUPERUSER_PASSWORD}

  if [ -z "$EMAIL" ] || [ -z "$PASS" ]; then
    echo "❌ No superuser credentials found. Set SUPERUSER_EMAIL / SUPERUSER_PASSWORD in .env, or pass them as arguments."
    exit 1
  fi

  echo "🔑 Upserting superuser $EMAIL on $BACKEND_PROVIDER backend..."

  if [ "$BACKEND_PROVIDER" = "fly" ]; then
    fly ssh console -a "$FLY_APP" -C "/app/app superuser upsert $EMAIL $PASS"
  elif [ "$BACKEND_PROVIDER" = "gcp" ]; then
    gcloud compute ssh "$GCP_VM_NAME" --zone="$GCP_ZONE" --command="
      docker stop pocketbase || true
      docker run --rm -v \$HOME/pb_data:/app/pb_data \
        us-docker.pkg.dev/\$(gcloud config get-value project)/phcf-scratch-pad/pocketbase \
        /app/app superuser upsert $EMAIL $PASS
      docker start pocketbase
    "
  fi
}

# ---------------------------------------
# Dispatch
# ---------------------------------------
case "$TARGET" in
  frontend)
    deploy_frontend
    record_deploy
    ;;
  backend)
    deploy_backend
    record_deploy
    ;;
  all)
    deploy_backend
    deploy_frontend
    record_deploy
    ;;
  superuser)
    superuser "$3" "$4"
    ;;
  backup)
    if [ "$BACKEND_PROVIDER" != "gcp" ]; then
      echo "❌ backup is only implemented for the gcp backend."
      exit 1
    fi
    check_gcp_vm_identity
    backup_pb_data_gcp
    ;;
  restore)
    if [ "$BACKEND_PROVIDER" != "gcp" ]; then
      echo "❌ restore is only implemented for the gcp backend."
      exit 1
    fi
    check_gcp_vm_identity
    restore_pb_data_gcp
    ;;
  auto)
    echo "🔍 Detecting changes since last deploy..."

    WWW_CHANGED=false
    SERVER_CHANGED=false

    changed_www && WWW_CHANGED=true
    changed_server && SERVER_CHANGED=true

    if $SERVER_CHANGED; then
      echo "📦 /server changed → deploying backend"
      deploy_backend
    else
      echo "✅ /server unchanged"
    fi

    if $WWW_CHANGED; then
      echo "📦 /www changed → deploying frontend"
      deploy_frontend
    else
      echo "✅ /www unchanged"
    fi

    if $WWW_CHANGED || $SERVER_CHANGED; then
      record_deploy
    else
      echo "🟡 No changes detected — skipping deploy"
    fi
    ;;
  *)
    echo "Unknown target: $TARGET"
    exit 1
    ;;
esac

echo "✅ Done!"