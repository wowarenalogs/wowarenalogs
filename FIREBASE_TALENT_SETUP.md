# Firebase/Google Cloud Setup for Talent Stats Feature

## Prerequisites
- Access to Google Cloud Console (https://console.cloud.google.com)
- Access to Firebase Console (https://console.firebase.google.com)
- Project: `wowarenalogs` (production) or `wowarenalogs-public-dev` (development)
- Appropriate IAM permissions for creating indexes, Cloud Scheduler jobs, and deploying functions

## 1. Create Firestore Composite Index

The talent aggregation function requires a composite index to efficiently query matches.

### Steps:
1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project (`wowarenalogs` for production)
3. Navigate to **Firestore Database** → **Indexes**
4. Click **Create Index**
5. Configure the index:
   - **Collection ID**: `combatStubs`
   - **Fields to index**:
     1. Field: `startInfo.bracket` - Order: **Ascending**
     2. Field: `startTime` - Order: **Ascending**
   - **Query scope**: **Collection**
6. Click **Create**
7. Wait for index to build (can take 5-15 minutes)

### Alternative: Via gcloud CLI
```bash
gcloud firestore indexes create \
  --collection-group=combatStubs \
  --field-config field-path=startInfo.bracket,order=ascending \
  --field-config field-path=startTime,order=ascending \
  --project=wowarenalogs
```

## 2. Deploy Cloud Function

### Prerequisites:
- Ensure database migrations are complete (TalentBuild and TalentSnapshot tables exist)
- Set environment variables:
  ```bash
  export ENV_SQL_URL="your-database-connection-string"
  ```

### Deploy to Development:
```bash
cd packages/cloud
npm run deploy:dev
```

### Deploy to Production:
```bash
cd packages/cloud
npm run deploy:prod
```

### Verify Deployment:
1. Go to Cloud Console: https://console.cloud.google.com
2. Navigate to **Cloud Functions**
3. Look for `refreshTalentStats` function
4. Check that it shows as "Active"

## 3. Create Cloud Scheduler Job

### Via Console:
1. Go to Cloud Console: https://console.cloud.google.com
2. Navigate to **Cloud Scheduler**
3. Click **Create Job**
4. Configure the job:
   - **Name**: `refresh-talent-stats-scheduler`
   - **Region**: Same as your Cloud Functions (e.g., `us-central1`)
   - **Description**: `Aggregates talent build statistics from matches`
   - **Frequency**: `0 6 * * *` (Daily at 6 AM UTC)
     - Or for testing: `*/30 * * * *` (Every 30 minutes)
   - **Time zone**: `UTC`
   - **Target type**: **Pub/Sub**
   - **Topic**: `refresh-talent-stats-event`
     - If topic doesn't exist, create it first (see below)
   - **Payload**: Leave empty or `{}`
5. Click **Create**

### Create Pub/Sub Topic (if needed):
```bash
gcloud pubsub topics create refresh-talent-stats-event \
  --project=wowarenalogs
```

### Via gcloud CLI:
```bash
# Create the scheduler job
gcloud scheduler jobs create pubsub refresh-talent-stats-scheduler \
  --schedule="0 6 * * *" \
  --topic=refresh-talent-stats-event \
  --message-body="{}" \
  --time-zone="UTC" \
  --location=us-central1 \
  --project=wowarenalogs \
  --description="Aggregates talent build statistics from matches"
```

## 4. Set Up Google Cloud Storage Permissions

Ensure the bucket has proper CORS configuration for frontend access:

### Update CORS Configuration:
1. Create `cors-config.json`:
```json
[
  {
    "origin": ["https://wowarenalogs.com", "https://www.wowarenalogs.com", "http://localhost:3000"],
    "method": ["GET", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Cache-Control"]
  }
]
```

2. Apply to bucket:
```bash
gsutil cors set cors-config.json gs://data.wowarenalogs.com
```

### Verify Public Access:
```bash
# Make talent-stats folder publicly readable
gsutil iam ch allUsers:objectViewer gs://data.wowarenalogs.com/data/talent-stats
```

## 5. Database Setup

### Run Prisma Migrations:
```bash
cd packages/sql

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Verify tables exist
npx prisma studio
```

### Required Tables:
- `TalentBuild` - Stores unique talent build combinations
- `TalentSnapshot` - Stores daily snapshots of talent build statistics

## 6. Test the Setup

### Manual Trigger via Cloud Scheduler:
1. Go to Cloud Scheduler in Console
2. Find `refresh-talent-stats-scheduler`
3. Click the three dots menu → **Force run**
4. Check Cloud Functions logs for execution

### Check Logs:
```bash
# View function logs
gcloud functions logs read refreshTalentStats \
  --limit=50 \
  --project=wowarenalogs

# Stream logs in real-time
gcloud functions logs read refreshTalentStats \
  --tail \
  --project=wowarenalogs
```

### Verify Data Generation:
1. Check if JSON files are created:
```bash
# List generated files
gsutil ls gs://data.wowarenalogs.com/data/talent-stats/
```

2. Test a specific file:
```bash
# Download and check a file
curl https://data.wowarenalogs.com/data/talent-stats/3v3/1800-2099/v1.latest.json
```

## 7. Monitor and Alerts

### Set Up Monitoring:
1. Go to Cloud Console → **Monitoring**
2. Create alerts for:
   - Function errors
   - Function timeout
   - Scheduler job failures

### Example Alert Policy:
```yaml
displayName: "Talent Stats Function Error"
conditions:
  - displayName: "Error rate > 0"
    conditionThreshold:
      filter: |
        resource.type="cloud_function"
        resource.labels.function_name="refreshTalentStats"
        metric.type="cloudfunctions.googleapis.com/function/execution_count"
        metric.labels.status!="ok"
      comparison: COMPARISON_GT
      thresholdValue: 0
      duration: 60s
```

## 8. Troubleshooting

### Common Issues:

#### Issue: "Missing or insufficient permissions"
**Solution**: Ensure service account has roles:
- `roles/datastore.user`
- `roles/storage.objectAdmin`
- `roles/cloudsql.client`

#### Issue: "Index required" error
**Solution**: Create the Firestore composite index (Step 1)

#### Issue: "No data in Firestore"
**Solution**: 
- Verify matches exist in the date range (last 28 days)
- Check if combatStubs collection has documents
- Verify bracket names match exactly

#### Issue: "Database connection failed"
**Solution**:
- Verify ENV_SQL_URL is set correctly
- Check database is accessible from Cloud Function
- Ensure Prisma schema is migrated

### Debug Commands:
```bash
# Check if function exists
gcloud functions describe refreshTalentStats --project=wowarenalogs

# Check scheduler job
gcloud scheduler jobs describe refresh-talent-stats-scheduler \
  --location=us-central1 \
  --project=wowarenalogs

# Test Pub/Sub topic
gcloud pubsub topics publish refresh-talent-stats-event \
  --message="{}" \
  --project=wowarenalogs

# Check bucket permissions
gsutil iam get gs://data.wowarenalogs.com
```

## 9. Performance Optimization

### Recommendations:
1. **Function Memory**: Set to at least 1024MB for better performance
2. **Function Timeout**: Set to 540 seconds (9 minutes)
3. **Scheduler Frequency**: Run during off-peak hours
4. **Parallel Processing**: Consider splitting by bracket/rating for parallel execution

### Advanced Setup (Optional):
For high-volume processing, consider:
1. Using Cloud Tasks for queue-based processing
2. Implementing Cloud Dataflow for stream processing
3. Using BigQuery for analytics instead of Firestore aggregation

## 10. Rollback Plan

If issues occur:

### Disable Scheduler:
```bash
gcloud scheduler jobs pause refresh-talent-stats-scheduler \
  --location=us-central1 \
  --project=wowarenalogs
```

### Delete Function:
```bash
gcloud functions delete refreshTalentStats \
  --project=wowarenalogs
```

### Clean Up Storage:
```bash
gsutil rm -r gs://data.wowarenalogs.com/data/talent-stats/
```

---

## Summary Checklist

- [ ] Firestore composite index created
- [ ] Cloud Function deployed
- [ ] Database tables created (TalentBuild, TalentSnapshot)
- [ ] Cloud Scheduler job configured
- [ ] Pub/Sub topic exists
- [ ] Storage bucket CORS configured
- [ ] Function has proper IAM permissions
- [ ] Test run successful
- [ ] Monitoring alerts configured
- [ ] Frontend can access generated JSON files

## Support Contacts

For issues:
- Check Cloud Function logs first
- Review this guide's troubleshooting section
- Contact the development team with:
  - Error messages from logs
  - Time of occurrence
  - Which step failed