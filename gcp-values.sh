#!/usr/bin/env bash
set -Eeuo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# Read-only inventory of GCP values used by deploy.sh.
# Usage:
#   ./gcp-values.sh
#   ./gcp-values.sh --project YOUR_PROJECT_ID
#
# This script does NOT change accounts, projects, resources, .env, or deploy.sh.
# It writes a timestamped Markdown report to ./gcp-values-<project>-<timestamp>.md.

PROJECT_OVERRIDE=""
while (($#)); do
  case "$1" in
    --project)
      [[ $# -ge 2 ]] || { echo "Missing project ID after --project" >&2; exit 2; }
      PROJECT_OVERRIDE="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

command -v gcloud >/dev/null || { echo "gcloud CLI not found. Install Google Cloud CLI first." >&2; exit 1; }

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -n 1 || true)"
ACTIVE_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
PROJECT="${PROJECT_OVERRIDE:-$ACTIVE_PROJECT}"

if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "No project selected. Run 'gcloud config set project PROJECT_ID' or pass --project PROJECT_ID." >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="gcp-values-${PROJECT}-${STAMP}.md"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

capture() {
  local title="$1"
  shift
  {
    printf '\n## %s\n\n' "$title"
    printf '```text\n'
    "$@" 2>&1 || printf '[Command failed; check permissions, API enablement, and resource location.]\n'
    printf '```\n'
  } >> "$TMP"
}

{
  printf '# GCP deployment inventory\n\n'
  printf -- '- Generated (UTC): `%s`\n' "$STAMP"
  printf -- '- Active gcloud account: `%s`\n' "${ACTIVE_ACCOUNT:-unknown}"
  printf -- '- Configured project: `%s`\n' "${ACTIVE_PROJECT:-unset}"
  printf -- '- Project inventoried: `%s`\n' "$PROJECT"
  printf -- '- Scope: read-only inventory; no resources or local config were changed.\n'
  printf '\n> Review this report before changing `deploy.sh` or `.env`. Do not commit it if you add sensitive notes.\n'
} > "$TMP"

capture "Project details" gcloud projects describe "$PROJECT" \
  --format='yaml(projectId,name,projectNumber,lifecycleState)'

capture "Compute Engine instances (all zones)" gcloud compute instances list \
  --project="$PROJECT" \
  --format='table(name,zone.basename(),machineType.basename(),status,networkInterfaces[0].networkIP,networkInterfaces[0].accessConfigs[0].natIP)'

capture "Reserved external addresses (all regions)" gcloud compute addresses list \
  --project="$PROJECT" \
  --format='table(name,address,addressType,region.basename(),status,users)'

capture "Artifact Registry repositories (all locations)" gcloud artifacts repositories list \
  --project="$PROJECT" \
  --format='table(name.basename(),format,location,mode,description)'

capture "Accessible Cloud Storage buckets" gcloud storage buckets list \
  --project="$PROJECT" \
  --format='table(name,location,storageClass)'

capture "Project IAM policy (principal/role summary)" gcloud projects get-iam-policy "$PROJECT" \
  --format='table(bindings.role,bindings.members)' \
  --flatten='bindings[].members'

capture "Enabled APIs relevant to this deploy" gcloud services list \
  --project="$PROJECT" --enabled \
  --filter='config.name:(compute.googleapis.com OR artifactregistry.googleapis.com OR cloudbuild.googleapis.com OR storage.googleapis.com)' \
  --format='table(config.name)'

# Inspect expected resource names from the current deploy script, when present.
if [[ -f .env ]]; then
  {
    printf '\n## Local deploy configuration (selected non-secret keys)\n\n'
    printf '```text\n'
    # Do not source .env and do not print passwords/tokens.
    for key in BACKEND_PROVIDER GCP_VM_NAME GCP_ZONE GCS_BACKUP_BUCKET FLY_APP; do
      value="$(grep -E "^${key}=" .env | tail -n 1 | cut -d= -f2- || true)"
      printf '%s=%s\n' "$key" "${value:-[not set]}"
    done
    printf '```\n'
  } >> "$TMP"
else
  printf '\n## Local deploy configuration\n\nNo `.env` file found in the current directory.\n' >> "$TMP"
fi

# Check the deploy script for hardcoded project-specific resource references.
if [[ -f deploy.sh ]]; then
  {
    printf '\n## GCP-related references found in deploy.sh\n\n'
    printf '```text\n'
    grep -nE 'pocketbase-ip|us-east1|phcf-scratch-pad|GCP_VM_NAME|GCP_ZONE|GCS_BACKUP_BUCKET|PUBLIC_PB_URL|nip\.io' deploy.sh || true
    printf '```\n'
  } >> "$TMP"
fi

mv "$TMP" "$OUT"
trap - EXIT
echo "Inventory saved to: $OUT"
echo "Active account: ${ACTIVE_ACCOUNT:-unknown}"
echo "Project inventoried: $PROJECT"
echo "No GCP resources or local deployment settings were changed."
