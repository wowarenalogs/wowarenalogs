# Cloud Functions

This repo contains cloud functions that handle match ingress, data storage, and log parsing

## Deployment

`yarn tsc`
`serverless deploy --stage dev`
or
`yarn tsc`
`serverless deploy --stage prod`

## Manual steps to config env:

Create buckets
`wowarenalogs-log-files-dev` : public read
`wowarenalogs-log-files-prod` : public read (for now...)

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

The event stream is parsed and summarized and a `MatchStub` object is written to Firestore

The resulting `MatchStub` is then queryable on the /graphql endpoint

// TODO: Record data on what permissions the service account needs

// "spires@appspot.gserviceaccount.com" needed "Service Account Token Creator" for the signed URL endpoint to work
