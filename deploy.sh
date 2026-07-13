#!/bin/bash
set -e

# ---------------------------------------
# Load env
# ---------------------------------------
set -a
source ./www/.env
set +a

PROJECT_ID=$(gcloud config get-value project)
REGION=${REGION:-us-east1}
REPO="phcf-scratch-pad"

ASTRO_SERVICE="astro-frontend"
PB_SERVICE="pocketbase"

TARGET=${1:-auto}

echo "🚀 Deploy mode: $TARGET"

# ---------------------------------------
# Helpers
# ---------------------------------------
changed_www () {
  git diff --name-only origin/main...HEAD | grep -q "^www/"
}

changed_server () {
  git diff --name-only origin/main...HEAD | grep -q "^server/"
}

deploy_frontend () {
  echo "📦 Building Astro frontend..."

  ASTRO_IMAGE="us-docker.pkg.dev/$PROJECT_ID/$REPO/astro-frontend"

  echo "🐳 Building Astro image..."
  gcloud builds submit ./www \
    --config ./www/cloudbuild.yaml \
    --substitutions=_PUBLIC_PB_URL=$PROD_PUBLIC_PB_URL,_IMAGE=$ASTRO_IMAGE

  echo "☁️ Deploying Astro..."
  gcloud run deploy $ASTRO_SERVICE \
  --image $ASTRO_IMAGE \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars PUBLIC_PB_URL=$PROD_PUBLIC_PB_URL,PUBLIC_API_URL=$PROD_PUBLIC_API_URL
}

deploy_backend () {
  echo "📦 Building PocketBase..."

  PB_IMAGE="us-docker.pkg.dev/$PROJECT_ID/$REPO/pocketbase"

  gcloud builds submit ./server \
    --tag $PB_IMAGE

  echo "☁️ Deploying PocketBase..."
  gcloud run deploy $PB_SERVICE \
    --image $PB_IMAGE \
    --region $REGION \
    --allow-unauthenticated \
    --add-volume name=pb-data,type=cloud-storage,bucket=phcf-pocketbase-data \
    --add-volume-mount volume=pb-data,mount-path=/app/pb_data \
    --min-instances=1 \
    --max-instances=1
}

# ---------------------------------------
# Decide what to deploy
# ---------------------------------------
if [ "$TARGET" = "frontend" ]; then
  deploy_frontend
  exit 0
fi

if [ "$TARGET" = "backend" ]; then
  deploy_backend
  exit 0
fi

if [ "$TARGET" = "all" ]; then
  deploy_frontend
  deploy_backend
  exit 0
fi

# AUTO MODE (smart detection)
echo "🔍 Detecting changes..."

# Make sure we have git remote reference
git fetch origin main >/dev/null 2>&1 || true

WWW_CHANGED=false
SERVER_CHANGED=false

if changed_www; then
  WWW_CHANGED=true
fi

if changed_server; then
  SERVER_CHANGED=true
fi

if $WWW_CHANGED; then
  echo "📦 /www changed → deploying frontend"
  deploy_frontend
else
  echo "✅ /www unchanged"
fi

if $SERVER_CHANGED; then
  echo "📦 /server changed → deploying backend"
  deploy_backend
else
  echo "✅ /server unchanged"
fi

if ! $WWW_CHANGED && ! $SERVER_CHANGED; then
  echo "🟡 No changes detected — skipping deploy"
fi

echo "✅ Done!"