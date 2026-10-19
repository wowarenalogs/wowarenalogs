#!/bin/bash

# Deploy script for WoW Arena Logs Cloud Functions using gcloud CLI (Production)
# This script replaces the serverless framework configuration

set -e  # Exit on any error

# Source common configuration and functions
source "$(dirname "$0")/common.sh"

# Absolute path to this script's dir, captured before build_project cd's away.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load packages/cloud/.env so webhook URL/secret don't have to be exported manually.
load_dotenv

# Production-specific configuration
PROJECT_ID="wowarenalogs"
BUCKET_NAME="${PROJECT_ID}-log-files-prod"
CREDENTIALS_FILE="wowarenalogs.json"

# Environment variables for writeMatchStub function
ENV_VARS="ENV_MATCH_STUBS_FIRESTORE=match-stubs-prod,ENV_LOG_FILES_BUCKET=${BUCKET_NAME},ENV_GCP_PROJECT=${PROJECT_ID},ENV_SERVICE_NAME=${SERVICE_NAME},ENV_WEBHOOK_TOPIC=${WEBHOOK_TOPIC}"

# Environment variables for the deliverWebhook function
WEBHOOK_ENV_VARS="ENV_WEBHOOK_URL=${ENV_WEBHOOK_URL},ENV_WEBHOOK_SECRET=${ENV_WEBHOOK_SECRET}"

echo -e "${GREEN}Starting deployment of Cloud Functions to ${PROJECT_ID} (Production)...${NC}"

# Check prerequisites
check_gcloud
# check_env_vars "prod"

# Set up authentication
setup_auth ${PROJECT_ID} ${CREDENTIALS_FILE}

# Build the project
build_project

# Deploy writeMatchStub function (Cloud Storage trigger)
deploy_storage_function "writeMatchStub" "writeMatchStubHandler" ${PROJECT_ID} ${BUCKET_NAME} "${ENV_VARS}"
echo -e "${GREEN}writeMatchStub function deployed successfully!${NC}"

# NOTE: refreshSpellIcons has been retired as a Pub/Sub function. It scraped
# wowhead.com per spell (now 403'd behind Cloudflare) and, with retries on,
# stormed to ~27k invocations/month. Icons are now refreshed in bulk from
# authoritative wago.tools DB2 data by a Cloud Run Job on a weekly schedule,
# deployed by deploy_spell_icon_job near the end of this script.

# Deploy refreshCompetitiveStats function (Pub/Sub trigger).
# retry=false: this is a scheduled job; a failed run must wait for the next schedule
# rather than being redelivered for days (which previously caused a retry storm).
deploy_pubsub_function "refreshCompetitiveStats" "refreshCompetitiveStatsHandler" "refresh-competitive-stats-event" "540s" "" "100" "false"
echo -e "${GREEN}refreshCompetitiveStats function deployed successfully!${NC}"

# Deploy deliverWebhook function (Pub/Sub trigger)
deploy_pubsub_function "deliverWebhook" "deliverWebhookHandler" "${WEBHOOK_TOPIC}" "60s" "${WEBHOOK_ENV_VARS}" "20"
echo -e "${GREEN}deliverWebhook function deployed successfully!${NC}"

# Display all functions information
echo -e "${YELLOW}All functions deployed successfully!${NC}"
echo -e "${YELLOW}Function details:${NC}"
show_function_info "writeMatchStub"
show_function_info "refreshCompetitiveStats"
show_function_info "deliverWebhook"

# Deploy the spell-icon refresh Cloud Run Job + weekly scheduler (replaces the
# retired refreshSpellIcons function). Kept in its own script because it builds
# from the packages/tools context rather than the cloud functions dist.
echo -e "${YELLOW}Deploying spell-icon refresh job...${NC}"
bash "${SCRIPT_DIR}/../../tools/deploy/deploy_icon_job.sh"

echo -e "${GREEN}Production deployment completed successfully!${NC}"
