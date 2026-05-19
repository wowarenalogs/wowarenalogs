#!/bin/bash

# One-time Pub/Sub provisioning for the partner webhook. Run once per GCP project,
# before the first deploy. Idempotent — safe to re-run.
#
# Usage: ./setup_webhook_pubsub.sh <project-id>

set -e

# Source common configuration (colours, WEBHOOK_TOPIC / WEBHOOK_DLQ_TOPIC)
source "$(dirname "$0")/common.sh"

PROJECT_ID="${1:?Usage: setup_webhook_pubsub.sh <project-id>}"
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
PUBSUB_SA="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo -e "${YELLOW}Provisioning webhook Pub/Sub resources in ${PROJECT_ID}...${NC}"

# The Pub/Sub service agent may not exist until first referenced; force-create it
# so the dead-letter IAM bindings below have a valid principal.
gcloud beta services identity create --service=pubsub.googleapis.com --project="${PROJECT_ID}"

# Topics
gcloud pubsub topics describe "${WEBHOOK_TOPIC}" --project="${PROJECT_ID}" >/dev/null 2>&1 \
    || gcloud pubsub topics create "${WEBHOOK_TOPIC}" --project="${PROJECT_ID}"
gcloud pubsub topics describe "${WEBHOOK_DLQ_TOPIC}" --project="${PROJECT_ID}" >/dev/null 2>&1 \
    || gcloud pubsub topics create "${WEBHOOK_DLQ_TOPIC}" --project="${PROJECT_ID}"

# A dead-letter topic with no subscription silently drops every message, so the
# DLQ needs its own subscription to retain dead-lettered webhooks for inspection.
gcloud pubsub subscriptions describe "${WEBHOOK_DLQ_TOPIC}-sub" --project="${PROJECT_ID}" >/dev/null 2>&1 \
    || gcloud pubsub subscriptions create "${WEBHOOK_DLQ_TOPIC}-sub" \
        --topic="${WEBHOOK_DLQ_TOPIC}" \
        --message-retention-duration=7d \
        --project="${PROJECT_ID}"

# IAM: writeMatchStub (compute SA) publishes to the topic; the Pub/Sub service
# agent forwards exhausted messages to the dead-letter topic.
gcloud pubsub topics add-iam-policy-binding "${WEBHOOK_TOPIC}" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/pubsub.publisher" \
    --project="${PROJECT_ID}"
gcloud pubsub topics add-iam-policy-binding "${WEBHOOK_DLQ_TOPIC}" \
    --member="serviceAccount:${PUBSUB_SA}" \
    --role="roles/pubsub.publisher" \
    --project="${PROJECT_ID}"

echo -e "${GREEN}Webhook Pub/Sub provisioning complete.${NC}"
echo -e "${YELLOW}Next: run deploy_dev.sh / deploy_prod.sh (deploys the functions and"
echo -e "applies the dead-letter policy to the deliverWebhook subscription).${NC}"
