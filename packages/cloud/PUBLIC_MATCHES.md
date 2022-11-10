## Acronyms

CS - Cloud Storage
CF - Cloud Function
FS - Firestore

## Private match architecture (current)

Client requests signature to submit to CS
Client PUTs file to signed url
CF writeMatchStubHandler fires, writes stub data to FS
