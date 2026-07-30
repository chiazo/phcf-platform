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