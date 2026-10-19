#!/bin/bash
# Deploy the spell-icon refresh as a weekly Cloud Run Job + Cloud Scheduler trigger.
#
# This replaces the retired refreshSpellIcons Cloud Function. A Cloud Run *Job*
# runs the tools script to completion and exits (bounded --max-retries), so it
# cannot retry-storm the way the old request-driven Pub/Sub function did.
#
# Idempotent: safe to re-run. Requires gcloud auth with rights to build images
# (Cloud Build), deploy Cloud Run jobs, manage the service account + its IAM,
# and manage Cloud Scheduler.
#
#   bash packages/tools/deploy/deploy_icon_job.sh

set -euo pipefail

PROJECT_ID="wowarenalogs"
REGION="us-central1"
JOB_NAME="refresh-spell-icons"
SCHEDULER_NAME="refresh-spell-icons"
BUCKET="images.wowarenalogs.com"
SA_ID="refresh-spell-icons"
SA_EMAIL="${SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
# Wednesday morning (14:00 UTC ~= 6-7am PT / 9-10am ET). Change TIME_ZONE below
# to a named zone (e.g. America/Los_Angeles) if you want a fixed local morning.
SCHEDULE="0 14 * * 3"
TIME_ZONE="Etc/UTC"

TOOLS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${YELLOW}Project ${PROJECT_ID} / region ${REGION}${NC}"
gcloud config set project "${PROJECT_ID}" >/dev/null

# 1) Service account for the job (idempotent).
if ! gcloud iam service-accounts describe "${SA_EMAIL}" >/dev/null 2>&1; then
    echo -e "${YELLOW}Creating service account ${SA_EMAIL}...${NC}"
    gcloud iam service-accounts create "${SA_ID}" --display-name="Spell icon refresh job"
fi

# 2) Grant it write access to the images bucket, and permission to be invoked.
echo -e "${YELLOW}Granting storage.objectAdmin on gs://${BUCKET}...${NC}"
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
    --member="serviceAccount:${SA_EMAIL}" --role="roles/storage.objectAdmin" >/dev/null

# 3) Build the image and (re)deploy the Cloud Run Job from the tools context.
#    --args="--all" makes the job resolve every SpellMisc spell from live wago data.
echo -e "${YELLOW}Building image and deploying Cloud Run job ${JOB_NAME}...${NC}"
gcloud run jobs deploy "${JOB_NAME}" \
    --source "${TOOLS_DIR}" \
    --region="${REGION}" \
    --service-account="${SA_EMAIL}" \
    --max-retries=1 \
    --task-timeout=1800s \
    --memory=1Gi \
    --args="--all"

# 4) Allow the SA to run (invoke) the job.
echo -e "${YELLOW}Granting run.invoker on the job...${NC}"
gcloud run jobs add-iam-policy-binding "${JOB_NAME}" --region="${REGION}" \
    --member="serviceAccount:${SA_EMAIL}" --role="roles/run.invoker" >/dev/null

# 5) Create/update the Cloud Scheduler job that runs the Cloud Run job weekly.
#    Done via the REST API because this project's gcloud has a broken
#    `scheduler` command group. Scheduler calls the Run Admin API with an OAuth
#    token minted for the same service account.
echo -e "${YELLOW}Configuring Cloud Scheduler (${SCHEDULE} ${TIME_ZONE})...${NC}"
TOKEN="$(gcloud auth print-access-token)"
RUN_URI="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB_NAME}:run"
SCHED_PARENT="projects/${PROJECT_ID}/locations/${REGION}"
SCHED_PATH="${SCHED_PARENT}/jobs/${SCHEDULER_NAME}"
BODY=$(cat <<JSON
{
  "name": "${SCHED_PATH}",
  "schedule": "${SCHEDULE}",
  "timeZone": "${TIME_ZONE}",
  "httpTarget": {
    "uri": "${RUN_URI}",
    "httpMethod": "POST",
    "oauthToken": { "serviceAccountEmail": "${SA_EMAIL}" }
  }
}
JSON
)
if curl -sf -o /dev/null "https://cloudscheduler.googleapis.com/v1/${SCHED_PATH}" \
        -H "Authorization: Bearer ${TOKEN}"; then
    # Exists -> patch the fields we manage.
    curl -s -X PATCH \
        "https://cloudscheduler.googleapis.com/v1/${SCHED_PATH}?updateMask=schedule,timeZone,httpTarget" \
        -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
        -d "${BODY}" >/dev/null
else
    curl -s -X POST \
        "https://cloudscheduler.googleapis.com/v1/${SCHED_PARENT}/jobs" \
        -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
        -d "${BODY}" >/dev/null
fi

echo -e "${GREEN}Done. Cloud Run job '${JOB_NAME}' runs ${SCHEDULE} (${TIME_ZONE}).${NC}"
echo -e "${YELLOW}Run once now with:${NC} gcloud run jobs execute ${JOB_NAME} --region=${REGION}"
