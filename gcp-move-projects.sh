#!/usr/bin/env bash
set -Eeuo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# Transfer an existing GCP project to another Google account.
#
# The project itself does not move: its VM, reserved IP, buckets and Artifact
# Registry images stay exactly where they are, so there is no downtime and the
# nip.io URL in deploy.sh keeps working. What changes is who owns it and which
# billing account pays for it.
#
# Safe by default: without --apply this only prints what it would do.
#
# Usage:
#   gcloud billing accounts list
#
#   ./gcp-move-projects.sh --project PROJECT_ID --new-owner new@gmail.com \
#       --billing-account XXXXXX-XXXXXX-XXXXXX --apply
#
# Options:
#   --project ID            Project to transfer (required)
#   --new-owner EMAIL       Account that should own it (required)
#   --old-owner EMAIL       Account to remove with --remove-old (default: the
#                           account you're signed in as)
#   --billing-account ID    Link the project to this billing account
#   --remove-old            Remove the old owner. Do this last.
#   --apply                 Actually make the changes
#
# Exit codes: 0 done, 3 waiting for the new owner to accept an invitation,
#             4 billing could not be linked.

PROJECT=""
NEW_OWNER=""
OLD_OWNER=""
BILLING=""
REMOVE_OLD=0
APPLY=0

usage() {
  sed -n '4,31p' "$0"
}

die() { echo "Error: $*" >&2; exit 1; }
step() { printf '\n== %s ==\n' "$*"; }
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

while (($#)); do
  case "$1" in
    --project)         [[ $# -ge 2 ]] || die "Missing value after --project"; PROJECT="$2"; shift 2 ;;
    --new-owner)       [[ $# -ge 2 ]] || die "Missing value after --new-owner"; NEW_OWNER="$2"; shift 2 ;;
    --old-owner)       [[ $# -ge 2 ]] || die "Missing value after --old-owner"; OLD_OWNER="$2"; shift 2 ;;
    --billing-account) [[ $# -ge 2 ]] || die "Missing value after --billing-account"; BILLING="$2"; shift 2 ;;
    --remove-old)      REMOVE_OLD=1; shift ;;
    --apply)           APPLY=1; shift ;;
    -h|--help)         usage; exit 0 ;;
    *)                 die "Unknown argument: $1" ;;
  esac
done

[[ -n "$PROJECT" ]] || die "--project is required (this script never guesses the project)."
[[ "$NEW_OWNER" == *@* ]] || die "--new-owner must be an email address."
command -v gcloud >/dev/null || die "gcloud CLI not found. Install Google Cloud CLI first."

RUNNER="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -n 1 || true)"
[[ -n "$RUNNER" ]] || die "No active gcloud account. Run: gcloud auth login"

NEW_L="$(lower "$NEW_OWNER")"
RUNNING_AS_NEW=0
[[ "$(lower "$RUNNER")" == "$NEW_L" ]] && RUNNING_AS_NEW=1

# Who gets removed at the end: --old-owner, else whoever is signed in
if [[ -z "$OLD_OWNER" && "$RUNNING_AS_NEW" == "0" ]]; then
  OLD_OWNER="$RUNNER"
fi
if [[ -n "$OLD_OWNER" && "$(lower "$OLD_OWNER")" == "$NEW_L" ]]; then
  die "The old and new owner are the same account."
fi
if [[ "$REMOVE_OLD" == "1" && -z "$OLD_OWNER" ]]; then
  die "You're signed in as the new owner, so pass --old-owner EMAIL to say who to remove."
fi

PROJECT_EXISTS=0

if gcloud projects describe "$PROJECT" >/dev/null 2>&1; then
  PROJECT_EXISTS=1
  echo "Project '$PROJECT' already exists."
else
  echo "Project '$PROJECT' does not exist."
  if [[ "$APPLY" == "1" ]]; then
    gcloud projects create "$PROJECT" --name="$PROJECT"
    PROJECT_EXISTS=1
  else
    echo "  DRY RUN: would create project '$PROJECT'."
  fi
fi

run() {
  printf '  $ %s\n' "$*"
  if [[ "$APPLY" == "1" ]]; then
    "$@"
  fi
}

owners_lower() {
  local owners
  owners="$(gcloud projects get-iam-policy "$PROJECT" \
    --flatten='bindings[].members' \
    --filter='bindings.role=roles/owner' \
    --format='value(bindings.members)' 2>/dev/null || true)"
  lower "$owners"
}

has_owner() {
  local owners
  owners="$(owners_lower)"
  grep -qxF "user:$(lower "$1")" <<<"$owners"
}

billing_account_now() {
  gcloud billing projects describe "$PROJECT" \
    --format='value(billingAccountName)' 2>/dev/null || true
}

pending_invite_help() {
  cat <<EOF

  Google needs owners of projects outside an organization to accept an invitation.
    1. Open: https://console.cloud.google.com/iam-admin/iam?project=${PROJECT}
    2. Grant access -> add ${NEW_OWNER} with the Owner role.
    3. Accept the invitation from the email sent to ${NEW_OWNER}.
    4. Run this same command again.
EOF
}

setup_deploy_infrastructure() {
  local project_id="$PROJECT"
  local vm_name="${GCP_VM_NAME:-pocketbase-vm}"
  local vm_sa_name="pocketbase-vm"
  local vm_sa="${vm_sa_name}@${project_id}.iam.gserviceaccount.com"
  local zone="${GCP_ZONE:-us-east1-b}"
  local region="${zone%-*}"
  local repo="phcf-scratch-pad"
  local address_name="pocketbase-ip"
  local backup_bucket="${GCS_BACKUP_BUCKET:-phcf-backup-bucket-2}"

  step "Enable required APIs"

  # Billing must already be linked before Compute Engine can be enabled.
  local billing
  billing="$(gcloud billing projects describe "$project_id" \
    --format='value(billingAccountName)' 2>/dev/null || true)"

  if [[ -z "$billing" ]]; then
    die "No billing account is linked to $project_id. Pass --billing-account and link it first."
  fi

  run gcloud services enable \
    compute.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    --project="$project_id" \
    --quiet

  step "Create Artifact Registry repository if missing"

  if gcloud artifacts repositories describe "$repo" \
      --location=us --project="$project_id" >/dev/null 2>&1; then
    echo "  Repository '$repo' already exists."
  else
    run gcloud artifacts repositories create "$repo" \
      --repository-format=docker \
      --location=us \
      --project="$project_id" \
      --quiet
  fi

 step "Create VM service account"

if ! gcloud iam service-accounts describe "$vm_sa" \
    --project="$project_id" >/dev/null 2>&1; then

  run gcloud iam service-accounts create "$vm_sa_name" \
    --project="$project_id" \
    --display-name="PocketBase VM service account"

fi

step "Ensure VM service account is attached"

if gcloud compute instances describe "$vm_name" \
    --zone="$zone" \
    --project="$project_id" \
    --format='value(serviceAccounts.email)' |
    grep -Fxq "$vm_sa"; then
  echo "  Correct service account is already attached."
else
  echo "  Updating VM service account and access scopes..."

  run gcloud compute instances stop "$vm_name" \
    --zone="$zone" \
    --project="$project_id" \
    --quiet

  run gcloud compute instances set-service-account "$vm_name" \
    --zone="$zone" \
    --project="$project_id" \
    --service-account="$vm_sa" \
    --scopes=cloud-platform

  run gcloud compute instances start "$vm_name" \
    --zone="$zone" \
    --project="$project_id" \
    --quiet
fi

if [[ "$APPLY" == "1" ]] &&
   ! gcloud iam service-accounts describe "$vm_sa" \
       --project="$project_id" >/dev/null 2>&1; then
  die "VM service account $vm_sa does not exist after creation. Cannot continue."
fi

  step "Grant VM access to Artifact Registry"

run gcloud artifacts repositories add-iam-policy-binding "$repo" \
  --location=us \
  --project="$project_id" \
  --member="serviceAccount:$vm_sa" \
  --role="roles/artifactregistry.reader"

  step "Reserve static IP if missing"

  if gcloud compute addresses describe "$address_name" \
      --region="$region" --project="$project_id" >/dev/null 2>&1; then
    echo "  Address '$address_name' already exists."
  else
    run gcloud compute addresses create "$address_name" \
      --region="$region" \
      --project="$project_id" \
      --quiet
  fi

  step "Ensure production firewall rules exist"

  local firewall_rule
  local port

  for firewall_rule in pocketbase-allow-http pocketbase-allow-https; do
    case "$firewall_rule" in
      pocketbase-allow-http)  port=80 ;;
      pocketbase-allow-https) port=443 ;;
    esac

    if gcloud compute firewall-rules describe "$firewall_rule" \
        --project="$project_id" >/dev/null 2>&1; then
      echo "  Firewall rule '$firewall_rule' already exists."
    else
      echo "  Creating firewall rule '$firewall_rule'..."

      run gcloud compute firewall-rules create "$firewall_rule" \
        --project="$project_id" \
        --network=default \
        --direction=INGRESS \
        --action=ALLOW \
        --rules="tcp:$port" \
        --target-tags=pocketbase-server \
        --source-ranges=0.0.0.0/0 \
        --quiet
    fi
  done

  step "Create PocketBase backup bucket if missing"

  if gcloud storage buckets describe "gs://${backup_bucket}" \
      --project="$project_id" >/dev/null 2>&1; then
    echo "  Backup bucket gs://${backup_bucket} already exists."
  else
    run gcloud storage buckets create "gs://${backup_bucket}" \
      --project="$project_id" \
      --location=us-east1 \
      --uniform-bucket-level-access
  fi

  step "Grant VM access to backup bucket"

  run gcloud storage buckets add-iam-policy-binding \
    "gs://${backup_bucket}" \
    --member="serviceAccount:${vm_sa}" \
    --role="roles/storage.objectAdmin"

  step "Create VM if missing"

  if gcloud compute instances describe "$vm_name" \
    --zone="$zone" --project="$project_id" >/dev/null 2>&1; then

  CURRENT_VM_SA="$(gcloud compute instances describe "$vm_name" \
    --zone="$zone" \
    --project="$project_id" \
    --format='value(serviceAccounts[0].email)')"

  if [[ "$CURRENT_VM_SA" == "$vm_sa" ]]; then
    echo "  VM already uses the correct service account."
  else
    echo "  VM currently uses: ${CURRENT_VM_SA:-none}"
    echo "  Updating VM to use: $vm_sa"

    run gcloud compute instances stop "$vm_name" \
      --zone="$zone" \
      --project="$project_id" \
      --quiet

    run gcloud compute instances set-service-account "$vm_name" \
      --zone="$zone" \
      --project="$project_id" \
      --service-account="$vm_sa" \
      --scopes=cloud-platform \
      --quiet

    run gcloud compute instances start "$vm_name" \
      --zone="$zone" \
      --project="$project_id" \
      --quiet
  fi

  echo "  VM '$vm_name' exists; preserving its disks and data."

else
    local ip
    ip="$(gcloud compute addresses describe "$address_name" \
      --region="$region" \
      --project="$project_id" \
      --format='value(address)' 2>/dev/null || true)"

    if [[ -z "$ip" ]]; then
      die "Could not determine reserved IP '$address_name'."
    fi

    run gcloud compute instances create "$vm_name" \
      --project="$project_id" \
      --zone="$zone" \
      --machine-type=e2-small \
      --image-family=ubuntu-2404-lts-amd64 \
      --image-project=ubuntu-os-cloud \
      --boot-disk-size=20GB \
      --address="$ip" \
	  --service-account="$vm_sa" \
      --scopes=cloud-platform \
      --tags=pocketbase-server \
      --metadata=startup-script='#!/bin/bash
set -Eeuo pipefail

apt-get update
apt-get install -y docker.io
systemctl enable --now docker' \
      --quiet
fi
# ------------------------------------------------------------
  # Configure HTTPS with Caddy for the existing or new VM
  # ------------------------------------------------------------

  step "Configure HTTP/HTTPS firewall rules"

  # Ensure the VM has the network tag targeted by these rules.
  run gcloud compute instances add-tags "$vm_name" \
    --project="$project_id" \
    --zone="$zone" \
    --tags=pocketbase-server \
    --quiet

  # Open only HTTP and HTTPS publicly. Do not expose port 8080.
  for port in 80 443; do
    local rule_name

    if [[ "$port" == "80" ]]; then
      rule_name="pocketbase-allow-http"
    else
      rule_name="pocketbase-allow-https"
    fi

    if gcloud compute firewall-rules describe "$rule_name" \
        --project="$project_id" >/dev/null 2>&1; then
      echo "  Updating firewall rule: $rule_name"

      run gcloud compute firewall-rules update "$rule_name" \
        --project="$project_id" \
        --allow="tcp:$port" \
        --source-ranges=0.0.0.0/0 \
        --target-tags=pocketbase-server \
        --quiet
    else
      echo "  Creating firewall rule: $rule_name"

      run gcloud compute firewall-rules create "$rule_name" \
        --project="$project_id" \
        --direction=INGRESS \
        --action=ALLOW \
        --rules="tcp:$port" \
        --target-tags=pocketbase-server \
        --source-ranges=0.0.0.0/0 \
        --quiet
    fi
  done

  step "Install Caddy and configure HTTPS reverse proxy"

  # Use the reserved external IP for a stable nip.io hostname.
  local public_ip
  public_ip="$(gcloud compute addresses describe "$address_name" \
    --project="$project_id" \
    --region="$region" \
    --format='value(address)')"

  [[ -n "$public_ip" ]] || die "Could not determine reserved external IP."

  local hostname="${public_ip}.nip.io"

  echo "  HTTPS hostname: https://$hostname"

  # Build a remote provisioning script. %q safely quotes it for the
  # remote Bash command, including the multiline Caddyfile.
  local remote_script remote_quoted

  remote_script="$(cat <<REMOTE_EOF
set -Eeuo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y curl gnupg debian-archive-keyring

install -d -m 0755 /usr/share/keyrings

curl -1sLf \
  'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor --yes \
      -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

curl -1sLf \
  'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  > /etc/apt/sources.list.d/caddy-stable.list

chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
chmod o+r /etc/apt/sources.list.d/caddy-stable.list

apt-get update
apt-get install -y caddy

cat > /etc/caddy/Caddyfile <<'CADDY_EOF'
${hostname} {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080
}
CADDY_EOF

caddy validate --config /etc/caddy/Caddyfile

systemctl enable --now caddy
systemctl reload caddy

echo "Caddy configured for https://${hostname}"
REMOTE_EOF
)"

  printf -v remote_quoted '%q' "$remote_script"

  gcloud compute ssh "$vm_name" \
    --project="$project_id" \
    --zone="$zone" \
    --command="sudo bash -c $remote_quoted"

  echo "  HTTPS provisioning completed for $hostname."
}

if [[ "$APPLY" == "1" ]]; then
  MODE="APPLY (changes will be made)"
else
  MODE="DRY RUN (nothing will be changed; add --apply to proceed)"
fi

echo "Mode:          $MODE"
echo "Project:       $PROJECT"
echo "Signed in as:  $RUNNER"
echo "New owner:     $NEW_OWNER"
echo "Old owner:     ${OLD_OWNER:-n/a}"
echo "Billing:       ${BILLING:-unchanged}"
echo "Current billing account: $(billing_account_now)"
echo "Current owners:"
gcloud projects get-iam-policy "$PROJECT" \
  --flatten='bindings[].members' \
  --filter='bindings.role=roles/owner' \
  --format='value(bindings.members)' 2>/dev/null | sed 's/^/  /' || true

if [[ "$PROJECT_EXISTS" == "0" && "$APPLY" != "1" ]]; then
  echo
  echo "Dry run complete. The following would happen after creation:"
  echo "  1. Create project '$PROJECT'."
  echo "  2. Configure owner '$NEW_OWNER'."
  [[ -n "$BILLING" ]] && echo "  3. Link billing account '$BILLING'."
  echo
  echo "Re-run with --apply to execute these changes."
  exit 0
fi

# ---------------------------------------------------------------------------
step "1. Make $NEW_OWNER an owner"
# ---------------------------------------------------------------------------

# Billing must be linked before enabling Compute Engine on a project
# that doesn't already have billing configured.

if [[ -n "$BILLING" ]]; then
  run gcloud billing projects link "$PROJECT" \
    --billing-account="$BILLING"
else
  CURRENT_BILLING="$(billing_account_now)"

  if [[ -z "$CURRENT_BILLING" ]]; then
    die "No billing account is linked. Pass --billing-account BILLING_ACCOUNT_ID before enabling Compute Engine."
  fi
fi

if [[ "$APPLY" == "1" ]]; then
  setup_deploy_infrastructure
else
  echo "DRY RUN: would enable APIs and verify/create the repository, IP, and VM."
fi

if has_owner "$NEW_OWNER"; then
  echo "  Already an owner. Nothing to do."
elif [[ "$RUNNING_AS_NEW" == "1" ]]; then
  die "You're signed in as $NEW_OWNER, but it isn't an owner yet. Accept the invitation first."
else
#   if run gcloud projects add-iam-policy-binding "$PROJECT" \
#       --member="user:$NEW_OWNER" --role="roles/owner" \
#       --condition=None --format=none --quiet; then
#     if [[ "$APPLY" == "1" ]] && ! has_owner "$NEW_OWNER"; then
#       echo "  The request went through but $NEW_OWNER isn't an owner yet."
#       pending_invite_help
#       exit 3
#     fi
#   else
    echo "  Could not grant Owner through the API."
    pending_invite_help
    exit 3
#   fi
fi

# ---------------------------------------------------------------------------
step "2. Billing"
# ---------------------------------------------------------------------------
if [[ -n "$BILLING" ]]; then
  # Linking replaces the existing link in one step, so there's no gap in service
  if run gcloud billing projects link "$PROJECT" --billing-account="$BILLING"; then
    :
  else
    cat <<EOF
  Could not link billing. Whoever runs this needs the Billing Account User role
  on billing account ${BILLING}. Either:
    - sign in as ${NEW_OWNER} (gcloud auth login) and run this script again, or
    - link it in the console: https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT}
EOF
    exit 4
  fi
else
  echo "  --billing-account not given, so billing stays with the current account."
  echo "  Link the new account's billing before removing the old owner, or the old"
  echo "  account keeps paying."
fi

# ---------------------------------------------------------------------------
step "3. Remove the old owner"
# ---------------------------------------------------------------------------
if [[ "$REMOVE_OLD" != "1" ]]; then
  echo "  Skipped (pass --remove-old once the new account has been checked)."
else
  if [[ "$APPLY" == "1" ]]; then
    has_owner "$NEW_OWNER" || die "Refusing to remove $OLD_OWNER: $NEW_OWNER isn't a verified owner."

    if [[ -n "$BILLING" && "$(billing_account_now)" != "billingAccounts/$BILLING" ]]; then
      die "Refusing to remove $OLD_OWNER: the project isn't linked to billing account $BILLING."
    fi

    if [[ -t 0 ]]; then
      read -r -p "  Type the project ID ($PROJECT) to confirm removing $OLD_OWNER as owner: " CONFIRM
      [[ "$CONFIRM" == "$PROJECT" ]] || die "Confirmation didn't match. Nothing removed."
    else
      die "Removing an owner needs an interactive terminal for confirmation."
    fi
  fi

#   run gcloud projects remove-iam-policy-binding "$PROJECT" \
#     --member="user:$OLD_OWNER" --role="roles/owner" \
#     --condition=None --format=none --quiet

  echo "  Other roles $OLD_OWNER still holds on this project (remove them if you want a clean break):"
  gcloud projects get-iam-policy "$PROJECT" \
    --flatten='bindings[].members' \
    --filter="bindings.members:user:${OLD_OWNER}" \
    --format='value(bindings.role)' 2>/dev/null | sed 's/^/    /' || true
fi

# ---------------------------------------------------------------------------
step "Done"
# ---------------------------------------------------------------------------
if [[ "$APPLY" != "1" ]]; then
  echo "  This was a dry run. Re-run with --apply to make these changes."
else
  echo "  Owners now:"
  owners_lower | sed 's/^/    /'
  echo "  Billing account: $(billing_account_now)"
fi

cat <<EOF

Next steps, as ${NEW_OWNER}:
  gcloud auth login
  gcloud config set account ${NEW_OWNER}
  gcloud config set project ${PROJECT}
  ./gcp-values.sh          # compare with the report from before

Check before you remove the old owner:
  - You can SSH to the VM and run ./deploy.sh as the new account.
  - If the VM uses OS Login, the new account gets its own Linux user. Files the
    old user owns on the VM (pb_data, the app directory) may need chown.
  - Free-trial credits don't transfer with the project.
EOF