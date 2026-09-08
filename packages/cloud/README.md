# Cloud Functions

This repo contains cloud functions that handle match ingress, data storage, and log parsing

## Deployment

Currently the distribution build of the parser must be manually injected:

From repo root:
`npm run build:parser`
`copy parser/dist to cloud/parser/dist`

In /cloud:
`npm install`
`npm run build`

`npm run deploy:dev`
or
`npm run deploy:prod`

## Manual steps to config env:

Create buckets
`wowarenalogs-log-files-dev` : private (no `allUsers` access)
`wowarenalogs-log-files-prod` : private (no `allUsers` access)

Raw logs are never served from the public object URL. Viewers get a short-lived
V4 signed URL from the GraphQL `logDownloadUrl` query (sign-in required, daily
quota of distinct logs per user); see `packages/shared/src/graphql-server/utils/accessGuard.ts`.

Service accounts therefore need:

- web (Cloud Run) service account: `roles/storage.objectViewer` on the log bucket,
  plus `roles/iam.serviceAccountTokenCreator` on itself so the Storage client can
  sign V4 URLs via IAM `signBlob` (no private key on the box).
- cloud functions service account: `roles/storage.objectViewer` on the log bucket
  (`writeMatchStub`, `refreshSpellIcons` and the map-image script read through the
  Storage client).

To lock an existing bucket down:

```
gsutil iam ch -d allUsers:objectViewer gs://wowarenalogs-log-files-prod
gsutil iam ch serviceAccount:<web-sa>@wowarenalogs.iam.gserviceaccount.com:objectViewer gs://wowarenalogs-log-files-prod
gsutil iam ch serviceAccount:<functions-sa>@wowarenalogs.iam.gserviceaccount.com:objectViewer gs://wowarenalogs-log-files-prod
gcloud iam service-accounts add-iam-policy-binding <web-sa>@wowarenalogs.iam.gserviceaccount.com \
  --member serviceAccount:<web-sa>@wowarenalogs.iam.gserviceaccount.com \
  --role roles/iam.serviceAccountTokenCreator
```

Uploads are unaffected: the desktop client already writes through a signed PUT URL.

Per-account overrides are strings in the `tags` array of the user's profile document
(`user-profile-prod/<userId>` in Firestore; the doc id is the next-auth user id, and
the doc also carries `battletag` for lookup). They are never in source:

- `admin` — exempt from the daily log limit.
- `blocked` — refused search and log access.

set cors using cors.json

## Debugging failed log processors

# Edit the input

Change the file /src/operations/reprocessAnonHandler.ts
to reference the log file you are debugging

# Set logging

Change /parser/src/logger.ts
LOG_LEVEL to 1

# Execute the function locally

`npm run start:reprocess-anon`

## TODO / Random notes:

-Front end must submit year as combat log timestamp format omits this
-Front end must submit locale as combat log timestamp format omits this
-Example:
`1/7 09:16:18.467`

Represents date January 1st 2021, 9:16pm EST.

-What is best way to compute some reasonable hash value for a combat log?

-Find something other than serverless.yml to handle deployment, it is terrible for gcp

-Front end should try to capture line:
1/7 09:15:19.009 COMBAT_LOG_VERSION,17,ADVANCED_LOG_ENABLED,0,BUILD_VERSION,9.0.2,PROJECT_ID,1
and send this data with every log, patch # especially

/////// FLOW OF DATA

client records WowCombatLog.txt
local filesystem read produces a buffer of lines

get request is made to `getUploadSignatureHandler` - returns signed URL

PUT is made with buffer to URL with line buffer of single arena match
-Headers are added:
`x-wlogs-locale`: <timezone of local machine>
`x-wlogs-year`: <current year>

Cloud function `writeMatchStubHandler` fires when this is saved into Cloud Storage account

The event stream is parsed and summarized and a stub object is written to Firestore

The resulting stub is then queryable on the /graphql endpoint
