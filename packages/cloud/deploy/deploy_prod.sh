#!/bin/bash

# Deploy script for WoW Arena Logs Cloud Functions using gcloud CLI (Production)
# This script replaces the serverless framework configuration

set -e  # Exit on any error

# Source common configuration and functions
source "$(dirname "$0")/common.sh"

# Production-specific configuration
PROJECT_ID="wowarenalogs"
BUCKET_NAME="${PROJECT_ID}-log-files-prod"
CREDENTIALS_FILE="wowarenalogs.json"

# Environment variables for writeMatchStub function
ENV_VARS="ENV_MATCH_STUBS_FIRESTORE=match-stubs-prod,ENV_LOG_FILES_BUCKET=${BUCKET_NAME},ENV_GCP_PROJECT=${PROJECT_ID},ENV_SERVICE_NAME=${SERVICE_NAME}"

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

# Deploy refreshSpellIcons function (Pub/Sub trigger)
deploy_pubsub_function "refreshSpellIcons" "refreshSpellIconsHandler" "refresh-spell-icons-event"
echo -e "${GREEN}refreshSpellIcons function deployed successfully!${NC}"

# Deploy refreshCompetitiveStats function (Pub/Sub trigger)
deploy_pubsub_function "refreshCompetitiveStats" "refreshCompetitiveStatsHandler" "refresh-competitive-stats-event"
echo -e "${GREEN}refreshCompetitiveStats function deployed successfully!${NC}"

# Display all functions information
echo -e "${YELLOW}All functions deployed successfully!${NC}"
echo -e "${YELLOW}Function details:${NC}"
show_function_info "writeMatchStub"
show_function_info "refreshSpellIcons"
show_function_info "refreshCompetitiveStats"

echo -e "${GREEN}Production deployment completed successfully!${NC}"
