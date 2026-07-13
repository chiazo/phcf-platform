#!/bin/bash
set -e

PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
REGION="us-east1"
REPO="phcf-scratch-pad"

echo "🚀 Bootstrapping project: $PROJECT_ID"

# ----------------------------
# 1. Enable required APIs
# ----------------------------
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com

# ----------------------------
# 2. Create Artifact Registry repo (safe if exists)
# ----------------------------
gcloud artifacts repositories create $REPO \
  --repository-format=docker \
  --location=$REGION \
  || true

# ----------------------------
# 3. Cloud Build permissions
# ----------------------------
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CLOUD_BUILD_SA" \
  --role="roles/artifactregistry.writer" || true

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CLOUD_BUILD_SA" \
  --role="roles/cloudbuild.builds.builder" || true

# ----------------------------
# 4. Cloud Run permissions
# ----------------------------
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/run.admin" || true

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/artifactregistry.reader" || true

# ----------------------------
# 5. Your user fallback (prevents CLI lockouts)
# ----------------------------
USER_EMAIL=$(gcloud config get-value account)

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="user:$USER_EMAIL" \
  --role="roles/editor" || true

echo "✅ Bootstrap complete. You should not see IAM errors anymore."