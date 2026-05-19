#!/bin/bash

# One-time provisioning for the partner webhook topic. Run once per GCP project,
# before the first deploy. Idempotent — safe to re-run.
#
# Usage: ./setup_webhook_pubsub.sh <project-id>

set -e

# Source common configuration (colours, WEBHOOK_TOPIC)
source "$(dirname "$0")/common.sh"

PROJECT_ID="${1:?Usage: setup_webhook_pubsub.sh <project-id>}"
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo -e "${YELLOW}Provisioning webhook topic in ${PROJECT_ID}...${NC}"

gcloud pubsub topics describe "${WEBHOOK_TOPIC}" --project="${PROJECT_ID}" >/dev/null 2>&1 \
    || gcloud pubsub topics create "${WEBHOOK_TOPIC}" --project="${PROJECT_ID}"

# writeMatchStub runs as the compute SA and needs to publish to the topic.
gcloud pubsub topics add-iam-policy-binding "${WEBHOOK_TOPIC}" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/pubsub.publisher" \
    --project="${PROJECT_ID}"

echo -e "${GREEN}Webhook topic provisioning complete.${NC}"
