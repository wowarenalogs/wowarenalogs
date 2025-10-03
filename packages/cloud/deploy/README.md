# Cloud Functions Deployment Scripts

This directory contains deployment scripts that replace the serverless framework configuration with direct gcloud CLI commands.

## Scripts Overview

### Development Environment

- `deploy_dev.sh` - Script for development deployment

### Production Environment

- `deploy_prod.sh` - Script for production deployment

### Common Configuration

- `common.sh` - Shared configuration and functions used by both deployment scripts

## Prerequisites

1. **Google Cloud SDK**: Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
2. **Authentication**: Ensure you're authenticated with the appropriate Google Cloud project
3. **Node.js and npm**: Required for building the functions
4. **Environment Variables**: Set `ENV_SQL_URL` environment variable

## Usage

### Development Deployment

```bash
cd packages/cloud/deploy
./deploy_dev.sh
```

### Production Deployment

```bash
cd packages/cloud/deploy
./deploy_prod.sh
```

## What the Scripts Do

### Development Script (`deploy_dev.sh`)

- Sets project to `wowarenalogs-public-dev`
- Deploys `writeMatchStub` function with Cloud Storage trigger
- Configures environment variables for development
- Sets up Cloud Storage bucket trigger for `wowarenalogs-public-dev-log-files-prod`

### Production Script (`deploy_prod.sh`)

- Sets project to `wowarenalogs`
- Deploys three functions:
  - `writeMatchStub` - Cloud Storage trigger
  - `refreshSpellIcons` - Pub/Sub trigger
  - `refreshCompetitiveStats` - Pub/Sub trigger
- Configures appropriate environment variables for production

### Common Script (`common.sh`)

- Contains shared configuration variables
- Provides reusable functions for authentication, API enabling, building, and deployment
- Handles common deployment tasks like credential file detection and error checking

## Function Configurations

### writeMatchStub Function

- **Trigger**: Cloud Storage object finalize event
- **Memory**: 1024MB
- **Runtime**: Node.js 20
- **Environment Variables**:
  - `ENV_MATCH_STUBS_FIRESTORE`: match-stubs-prod
  - `ENV_LOG_FILES_BUCKET`: Project-specific bucket
  - `ENV_GCP_PROJECT`: Project ID
  - `ENV_SERVICE_NAME`: gcp-wowarenalogs
  - `ENV_SQL_URL`: From environment

### refreshSpellIcons Function (Production only)

- **Trigger**: Pub/Sub topic `refresh-spell-icons-event`
- **Memory**: 1024MB
- **Timeout**: 540 seconds
- **Runtime**: Node.js 20

### refreshCompetitiveStats Function (Production only)

- **Trigger**: Pub/Sub topic `refresh-competitive-stats-event`
- **Memory**: 1024MB
- **Timeout**: 540 seconds
- **Runtime**: Node.js 20

## Migration from Serverless Framework

The scripts replace the following serverless configurations:

### Original serverless.dev.yml

```yaml
service: gcp-wowarenalogs
provider:
  name: google
  stage: prod
  runtime: nodejs20
  region: us-central1
  project: wowarenalogs-public-dev
  credentials: wowarenalogs-public-dev.json
```

### Original serverless.prod.yml

```yaml
service: gcp-wowarenalogs
provider:
  name: google
  stage: prod
  runtime: nodejs20
  region: us-central1
  project: wowarenalogs
  credentials: wowarenalogs.json
```

## Key Differences from Serverless Framework

1. **Direct gcloud commands**: No serverless framework dependency
2. **Explicit API enabling**: Scripts enable required Google Cloud APIs
3. **Authentication handling**: Scripts check and set up authentication with credentials file support
4. **Build process**: Scripts handle the build process before deployment
5. **Error handling**: Better error checking and colored output
6. **Instance limits**: Added max-instances configuration for better resource management
7. **Credentials file support**: Scripts automatically detect and use the appropriate credentials file

## Improvements Over Serverless Framework

### Credentials Management

- **Serverless**: Required manual credentials file specification in YAML
- **Scripts**: Automatic detection of credentials files (`wowarenalogs-public-dev.json` for dev, `wowarenalogs.json` for prod)
- **Fallback**: If credentials file not found, falls back to `gcloud auth application-default login`

### Resource Management

- **Serverless**: No explicit instance limits
- **Scripts**: Added `--max-instances` configuration:
  - `writeMatchStub`: 1000 instances (high throughput for storage events)
  - `refreshSpellIcons` & `refreshCompetitiveStats`: 10 instances (lower throughput for scheduled tasks)

### Deployment Process

- **Serverless**: Required serverless framework installation and configuration
- **Scripts**: Direct gcloud CLI usage with comprehensive error checking
- **Build Integration**: Scripts handle the complete build and deployment pipeline

## Troubleshooting

### Common Issues

1. **Authentication errors**: Run `gcloud auth login` and `gcloud auth application-default login`
2. **Permission errors**: Ensure your account has Cloud Functions Admin and Storage Admin roles
3. **Build errors**: Make sure all dependencies are installed with `npm install`
4. **Environment variables**: Ensure `ENV_SQL_URL` is set in your environment

### Verification

After deployment, verify functions are working:

```bash
# List all functions
gcloud functions list --region=us-central1

# Get function details
gcloud functions describe writeMatchStub --region=us-central1
```

## Environment Variables

Make sure to set the following environment variables before running the scripts:

- `ENV_SQL_URL`: Database connection string for your environment
