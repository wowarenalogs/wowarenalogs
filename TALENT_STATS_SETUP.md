# Talent Stats Feature Setup Guide

## Overview
This feature aggregates talent build data from PvP matches and displays popular builds for each spec, bracket, and rating range.

## Components

### 1. Frontend - Talent Viewer Page
- **Location**: `/packages/shared/src/components/TalentViewer/`
- **URL**: `/talents`
- **Features**:
  - Two-step class → spec selection
  - Bracket selection (2v2, 3v3, Rated Solo Shuffle)
  - Rating range filters
  - Displays top talent builds with win rates and usage statistics

### 2. Cloud Function - refreshTalentStats
- **Location**: `/packages/cloud/src/refreshTalentStatsHandler.ts`
- **Purpose**: Aggregates talent data from Firestore match logs
- **Schedule**: Daily (recommended at 3 AM)

### 3. Database Schema
Two new tables in Prisma schema:
- `TalentBuild`: Stores unique talent combinations
- `TalentSnapshot`: Daily snapshots of talent statistics

## Deployment Steps

### 1. Deploy Database Migrations
```bash
cd packages/sql
npx prisma migrate deploy
```

### 2. Deploy Cloud Function

#### Development Environment:
```bash
cd packages/cloud
npm run deploy:dev
```

#### Production Environment:
```bash
cd packages/cloud
npm run deploy:prod
```

### 3. Create Cloud Scheduler Job

1. Go to [Cloud Scheduler Console](https://console.cloud.google.com/cloudscheduler)
2. Click "Create Job"
3. Configure:
   - **Name**: `refresh-talent-stats`
   - **Frequency**: `0 3 * * *` (daily at 3 AM)
   - **Target Type**: Pub/Sub
   - **Topic**: `refresh-talent-stats-event`
   - **Message Body**: `{}`

### 4. Create Pub/Sub Topic (if needed)

1. Go to [Pub/Sub Console](https://console.cloud.google.com/cloudpubsub)
2. Create topic: `refresh-talent-stats-event`

## Testing

### Test Cloud Function Locally:
```bash
cd packages/cloud
npm run test:refresh-talent-stats
```
Note: Requires GCP credentials configured

### Test Frontend:
```bash
npm run dev:web
# Navigate to http://localhost:3000/talents
```

### Trigger Manual Refresh:
In Cloud Scheduler, click "Run Now" on the `refresh-talent-stats` job

## Data Flow

1. **Daily Schedule**: Cloud Scheduler triggers Pub/Sub topic
2. **Cloud Function**: 
   - Fetches last 28 days of match data from Firestore
   - Groups by spec, bracket, and rating range
   - Calculates win rates and usage rates
   - Stores in database and exports to GCS
3. **Frontend**: 
   - Fetches aggregated data from GCS
   - Displays talent builds sorted by usage rate

## File Locations

- **GCS Bucket**: 
  - Dev: `data.public-dev.wowarenalogs.com`
  - Prod: `data.wowarenalogs.com`
- **Path Pattern**: `data/talent-stats/{bracket}/{minRating}-{maxRating}/v1.latest.json`

## Monitoring

Check Cloud Function logs:
1. Go to [Cloud Functions Console](https://console.cloud.google.com/functions)
2. Click on `refreshTalentStats`
3. View "Logs" tab

## Known Limitations

1. **Export Strings**: Currently using placeholder values for talent export strings. Full implementation requires server-side talent tree data processing.

2. **Initial Data**: No data will appear until the first scheduled run completes.

3. **Processing Time**: Function may take several minutes to process all bracket/rating combinations.

## Troubleshooting

### No data showing on frontend:
- Check if Cloud Function has run successfully
- Verify GCS bucket permissions are public
- Check browser console for fetch errors

### Cloud Function fails:
- Check Firestore has match data with talent information
- Verify database connection string in environment variables
- Check function has sufficient memory/timeout

### Build errors:
- Ensure TypeScript target is ES2015 or higher in `/packages/cloud/tsconfig.json`
- Run `npm install` in cloud package directory
- Ensure `.env` file exists in cloud package

## Future Improvements

1. Implement proper talent export string generation
2. Add caching layer for frequently accessed data
3. Add filtering by date range
4. Show talent build trends over time
5. Add detailed talent tooltips