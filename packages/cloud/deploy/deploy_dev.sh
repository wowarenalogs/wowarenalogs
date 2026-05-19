#!/bin/bash

# Deploy script for WoW Arena Logs Cloud Functions using gcloud CLI (Development)
# This script replaces the serverless framework configuration

set -e  # Exit on any error

# Source common configuration and functions
source "$(dirname "$0")/common.sh"

# Development-specific configuration
PROJECT_ID="wowarenalogs-public-dev"
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
