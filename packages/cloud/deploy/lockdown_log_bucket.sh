#!/bin/bash

# Make the raw combat log bucket private and grant the two service accounts that
# still need to read it. Required before deploying the sign-in-gated log access
# (packages/shared/src/graphql-server/utils/accessGuard.ts); until this has run,
# a match id from search is still a public download URL.
#
# Idempotent — safe to re-run. Run via `npm run lockdown:dev` / `npm run lockdown:prod`.
#
# Usage: ./lockdown_log_bucket.sh <dev|prod> [web-service-account]
#
#   web-service-account  The service account the web Cloud Run service runs as.
#                        Defaults to the project's default compute SA, which is
#                        also what the Cloud Functions run as. Override if the
#                        Cloud Run service was given its own SA:
#                          gcloud run services describe <service> --region=<region> \
#                            --format='value(spec.template.spec.serviceAccountName)'

set -e

source "$(dirname "$0")/common.sh"

ENVIRONMENT="${1:?Usage: lockdown_log_bucket.sh <dev|prod> [web-service-account]}"

case "${ENVIRONMENT}" in
    dev)
        PROJECT_ID="wowarenalogs-public-dev"
        CREDENTIALS_FILE="wowarenalogs-public-dev.json"
        ;;
    prod)
        PROJECT_ID="wowarenalogs"
        CREDENTIALS_FILE="wowarenalogs.json"
        ;;
    *)
        echo -e "${RED}Unknown environment '${ENVIRONMENT}' (expected dev or prod)${NC}"
        exit 1
        ;;
esac

BUCKET="gs://${PROJECT_ID}-log-files-prod"
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
WEB_SA="${2:-${COMPUTE_SA}}"

echo -e "${GREEN}Locking down ${BUCKET} in ${PROJECT_ID} (${ENVIRONMENT})${NC}"
echo -e "  functions service account: ${COMPUTE_SA}"
echo -e "  web service account:       ${WEB_SA}"

check_gcloud
setup_auth "${PROJECT_ID}" "${CREDENTIALS_FILE}"

# 1. Remove public read. Both the common binding and the legacy one, ignoring
#    "not found" so a re-run is clean.
echo -e "${YELLOW}Removing public read access...${NC}"
for role in roles/storage.objectViewer roles/storage.legacyObjectReader; do
    for member in allUsers allAuthenticatedUsers; do
        gcloud storage buckets remove-iam-policy-binding "${BUCKET}" \
            --member="${member}" --role="${role}" --project="${PROJECT_ID}" >/dev/null 2>&1 || true
    done
done

# 2. Enforce public access prevention so a future grant to allUsers is rejected
#    at the API rather than quietly reopening the bucket.
echo -e "${YELLOW}Enabling public access prevention...${NC}"
gcloud storage buckets update "${BUCKET}" --public-access-prevention --project="${PROJECT_ID}"

# 3. The functions (writeMatchStub, refreshSpellIcons, map image script) read logs
#    through the Storage client as the compute SA.
echo -e "${YELLOW}Granting object read to the functions service account...${NC}"
gcloud storage buckets add-iam-policy-binding "${BUCKET}" \
    --member="serviceAccount:${COMPUTE_SA}" --role="roles/storage.objectViewer" \
    --project="${PROJECT_ID}" >/dev/null

# 4. The web service signs V4 read URLs. That needs object read on the bucket and
#    permission to sign as itself via IAM signBlob (no private key on the box).
if [ "${WEB_SA}" != "${COMPUTE_SA}" ]; then
    echo -e "${YELLOW}Granting object read to the web service account...${NC}"
    gcloud storage buckets add-iam-policy-binding "${BUCKET}" \
        --member="serviceAccount:${WEB_SA}" --role="roles/storage.objectViewer" \
        --project="${PROJECT_ID}" >/dev/null
fi
echo -e "${YELLOW}Granting signBlob (serviceAccountTokenCreator) to the web service account on itself...${NC}"
gcloud iam service-accounts add-iam-policy-binding "${WEB_SA}" \
    --member="serviceAccount:${WEB_SA}" --role="roles/iam.serviceAccountTokenCreator" \
    --project="${PROJECT_ID}" >/dev/null

# 5. Verify. Fail loudly if any public principal is still bound.
echo -e "${YELLOW}Verifying bucket policy...${NC}"
POLICY="$(gcloud storage buckets get-iam-policy "${BUCKET}" --project="${PROJECT_ID}" --format=json)"
if echo "${POLICY}" | grep -qE '"all(Authenticated)?Users"'; then
    echo -e "${RED}Bucket still grants access to a public principal:${NC}"
    echo "${POLICY}"
    exit 1
fi
PAP="$(gcloud storage buckets describe "${BUCKET}" --project="${PROJECT_ID}" --format='value(public_access_prevention)')"
if [ "${PAP}" != "enforced" ]; then
    echo -e "${RED}Public access prevention is '${PAP}', expected 'enforced'${NC}"
    exit 1
fi

echo -e "${GREEN}${BUCKET} is private. Readers:${NC}"
echo "${POLICY}" | grep -E '"(serviceAccount|user|group):' || true
echo -e "${GREEN}Lockdown complete for ${ENVIRONMENT}.${NC}"
