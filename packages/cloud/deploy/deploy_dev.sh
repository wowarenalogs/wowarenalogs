#!/bin/bash

# Deploy script for WoW Arena Logs Cloud Functions using gcloud CLI (Development)
# This script replaces the serverless framework configuration

set -e  # Exit on any error

# Source common configuration and functions
source "$(dirname "$0")/common.sh"

# Load packages/cloud/.env so webhook URL/secret don't have to be exported manually.
load_dotenv

# Development-specific configuration
PROJECT_ID="wowarenalogs-public-dev"
# The dev bucket is single-region us-central1, so its storage trigger must match
# (prod uses the multi-region "us" default from common.sh).
STORAGE_TRIGGER_LOCATION="us-central1"
FUNCTION_NAME="writeMatchStub"
HANDLER="writeMatchStubHandler"
BUCKET_NAME="${PROJECT_ID}-log-files-prod"
CREDENTIALS_FILE="wowarenalogs-public-dev.json"

# Environment variables for the function (ENV_SQL_URL excluded for dev)
ENV_VARS="ENV_MATCH_STUBS_FIRESTORE=match-stubs-prod,ENV_LOG_FILES_BUCKET=${BUCKET_NAME},ENV_GCP_PROJECT=${PROJECT_ID},ENV_SERVICE_NAME=${SERVICE_NAME},ENV_WEBHOOK_TOPIC=${WEBHOOK_TOPIC}"

# Dev uses ENV_WEBHOOK_URL_DEV so test matches aren't fed to a partner's prod endpoint
WEBHOOK_ENV_VARS="ENV_WEBHOOK_URL=${ENV_WEBHOOK_URL_DEV},ENV_WEBHOOK_SECRET=${ENV_WEBHOOK_SECRET}"

echo -e "${GREEN}Starting deployment of ${FUNCTION_NAME} to ${PROJECT_ID} (Development)...${NC}"

# Check prerequisites
check_gcloud
check_env_vars "dev"

# Loudly warn if webhook delivery isn't fully configured. deliverWebhook will still
# deploy, but without both vars it does nothing useful — and --set-env-vars REPLACES
# env vars, so deploying without them overwrites (disables) a previously-set webhook.
if [ -z "${ENV_WEBHOOK_URL_DEV:-}" ] || [ -z "${ENV_WEBHOOK_SECRET:-}" ]; then
    echo -e "${RED}"
    echo "################################################################################"
    echo "##                                                                            ##"
    echo "##      WARNING: WEBHOOK DELIVERY IS NOT FULLY CONFIGURED                      ##"
    echo "##                                                                            ##"
    echo "################################################################################"
    [ -z "${ENV_WEBHOOK_URL_DEV:-}" ] && echo "  - ENV_WEBHOOK_URL_DEV is NOT set"
    [ -z "${ENV_WEBHOOK_SECRET:-}" ]  && echo "  - ENV_WEBHOOK_SECRET is NOT set"
    echo ""
    echo "  deliverWebhook WILL still deploy, but:"
    echo "    * empty URL        -> every webhook is silently SKIPPED (no POST sent)"
    echo "    * URL but no secret -> webhooks are sent UNSIGNED and rejected (HTTP 401)"
    echo ""
    echo "  --set-env-vars REPLACES the function's env vars, so this deploy will"
    echo "  OVERWRITE any URL/secret a previous deploy set, disabling a working webhook."
    echo ""
    echo "  To enable delivery, export BOTH before re-running:"
    echo "    export ENV_WEBHOOK_URL_DEV=\"https://...\""
    echo "    export ENV_WEBHOOK_SECRET=\"<hmac-secret>\""
    echo "################################################################################"
    echo -e "${NC}"
    # Pause so the warning isn't lost in scrollback before the long build starts.
    echo -e "${YELLOW}Continuing in 5s (Ctrl-C to abort)...${NC}"
    sleep 5
fi

# Set up authentication
setup_auth ${PROJECT_ID} ${CREDENTIALS_FILE}

# Build the project
build_project

# Deploy the function
deploy_storage_function ${FUNCTION_NAME} ${HANDLER} ${PROJECT_ID} ${BUCKET_NAME} "${ENV_VARS}"

echo -e "${GREEN}Function ${FUNCTION_NAME} deployed successfully!${NC}"

# Deploy deliverWebhook function (Pub/Sub trigger)
deploy_pubsub_function "deliverWebhook" "deliverWebhookHandler" "${WEBHOOK_TOPIC}" "60s" "${WEBHOOK_ENV_VARS}" "20"
echo -e "${GREEN}deliverWebhook function deployed successfully!${NC}"

# Display function information
show_function_info ${FUNCTION_NAME}
show_function_info "deliverWebhook"

echo -e "${GREEN}Development deployment completed successfully!${NC}"
