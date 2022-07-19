# Strategy for storing public matches

## Acronyms

CS - Cloud Storage
CF - Cloud Function
FS - Firestore

## Private match architecture (current)

Client requests signature to submit to CS
Client PUTs file to signed url
CF writeMatchStubHandler fires, writes stub data to FS

## Changes for public matches

### Backend

A second CF added as writePublicMatch, same trigger as writeMatchStubHandler (google allows multiple CF for same event)
This function would run the parser and generate a stub
Using this stub, it would find + replace all instances of unit names with random data in the log file itself
The anonymized log file would be written to a separate bucket and the stub written to a separate FS

### API layer

GraphQL will expose a getLatest endpoint which will read the anonymized FS

### Other things we could consider

- Anonymize FS stubs at egress
- Cheaper, potentially more moving pieces

- Anonymize everything at query-time
- Not sure how we would anonymize files at query time in any reasonable way

- Not offering public replays but only public stub data; low value option
