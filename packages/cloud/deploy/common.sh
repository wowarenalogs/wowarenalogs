#!/bin/bash

# Common configuration and functions for WoW Arena Logs Cloud Functions deployment
# This file contains shared variables and functions used by both dev and prod deployment scripts

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Common configuration
REGION="us-central1"
RUNTIME="nodejs22"
MEMORY="1024MB"
SERVICE_NAME="gcp-wowarenalogs"

# Function to check if gcloud is installed
check_gcloud() {
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}Error: gcloud CLI is not installed. Please install it first.${NC}"
        exit 1
    fi
}

# Function to set up authentication
setup_auth() {
    local project_id=$1
    local credentials_file=$2
    
    echo -e "${YELLOW}Setting project to ${project_id}...${NC}"
    gcloud config set project ${project_id}

    echo -e "${YELLOW}Checking authentication...${NC}"
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        echo -e "${YELLOW}No active authentication found. Please authenticate:${NC}"
        gcloud auth login
    fi

    echo -e "${YELLOW}Setting up application default credentials...${NC}"
    # Use specific credentials file if it exists
    if [ -f "${credentials_file}" ]; then
        echo -e "${YELLOW}Using credentials file: ${credentials_file}${NC}"
        export GOOGLE_APPLICATION_CREDENTIALS="${credentials_file}"
    else
        gcloud auth application-default login
    fi
}

# Function to build the project
build_project() {
    echo -e "${YELLOW}Building the function...${NC}"
    cd ../../
    npm run build:parser
    npm run build:sql
    cd packages/cloud
    npm run build:cloud
    cd dist
}

# Function to deploy a Cloud Storage triggered function
deploy_storage_function() {
    local function_name=$1
    local handler=$2
    local project_id=$3
    local bucket_name=$4
    local env_vars=$5
    
    echo -e "${YELLOW}Deploying ${function_name} function...${NC}"
    gcloud functions deploy ${function_name} \
        --gen2 \
        --runtime=${RUNTIME} \
        --region=${REGION} \
        --source=. \
        --entry-point=${handler} \
        --memory=${MEMORY} \
        --set-env-vars="${env_vars}" \
        --trigger-bucket=${bucket_name} \
        --retry \
        --max-instances=100
}

# Function to deploy a Pub/Sub triggered function
deploy_pubsub_function() {
    local function_name=$1
    local handler=$2
    local topic=$3
    local timeout=${4:-540s}
    
    echo -e "${YELLOW}Deploying ${function_name} function...${NC}"
    gcloud functions deploy ${function_name} \
        --gen2 \
        --runtime=${RUNTIME} \
        --region=${REGION} \
        --source=. \
        --entry-point=${handler} \
        --memory=${MEMORY} \
        --timeout=${timeout} \
        --trigger-topic=${topic} \
        --retry \
        --max-instances=100
}

# Function to display function information
show_function_info() {
    local function_name=$1
    echo -e "${YELLOW}${function_name} details:${NC}"
    gcloud functions describe ${function_name} --region=${REGION} --format="table(name,status,trigger.eventTrigger.eventType,trigger.eventTrigger.resource,trigger.pubsubTopic)" 2>/dev/null || \
    gcloud functions describe ${function_name} --region=${REGION} --format="table(name,status,trigger.pubsubTopic)" 2>/dev/null || \
    echo "Function details not available"
}
