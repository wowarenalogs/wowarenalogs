const { Firestore } = require('@google-cloud/firestore');
const { Storage: GoogleCloudStorage } = require('@google-cloud/storage');
const crypto = require('crypto');
const fs = require('fs');
const _ = require('lodash');
const moment = require('moment');
const path = require('path');

const isDev = true; // Force dev mode for testing
const gcpCredentials = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../wowarenalogs-public-dev.json'), 'utf8')
);

const firestore = new Firestore({
  projectId: gcpCredentials.project_id || 'wowarenalogs-public-dev',
  credentials: gcpCredentials,
});

const storage = new GoogleCloudStorage({
  credentials: gcpCredentials,
});
const bucket = storage.bucket('data.public-dev.wowarenalogs.com');

const ALLOWED_BRACKETS = ['2v2', '3v3', 'Rated Solo Shuffle'];
const RATING_RANGES = [
  [0, 4999],
  [0, 1399],
  [1400, 1799],
  [1800, 2099],
  [2100, 4999],
];

const STATS_SCHEMA_VERSION = 1;
const LOOKBACK_DAYS = 28;
const TOP_BUILDS_LIMIT = 20;

function generateTalentHash(talents, pvpTalents) {
  const sortedTalents = [...talents].sort((a, b) => a.id1 - b.id1);
  const sortedPvpTalents = [...pvpTalents].sort();
  const combined = JSON.stringify({ talents: sortedTalents, pvpTalents: sortedPvpTalents });
  return crypto.createHash('sha256').update(combined).digest('hex');
}

async function fetchMatchesFromFirestore(bracket, minRating, maxRating, startDate, endDate) {
  const matches = [];
  
  console.log(`Fetching matches for ${bracket} ${minRating}-${maxRating}...`);
  console.log(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  // Try simpler query - just get recent matches without bracket filter
  // This avoids needing a composite index for testing
  const querySnapshot = await firestore
    .collection('combatStubs')
    .where('startTime', '>=', startDate.getTime())
    .where('startTime', '<=', endDate.getTime())
    .limit(100) // Smaller limit for testing
    .get();

  console.log(`Found ${querySnapshot.size} documents in Firestore`);

  querySnapshot.forEach((doc) => {
    const data = doc.data();
    
    // Filter by bracket in code instead of query
    if (data.startInfo?.bracket !== bracket) return;
    
    if (!data.units || !Array.isArray(data.units)) return;

    data.units.forEach((unit) => {
      if (!unit.info || !unit.info.talents || !unit.info.pvpTalents || !unit.info.specId) {
        return;
      }

      const rating = unit.info.personalRating || 0;
      if (rating < minRating || rating > maxRating) {
        return;
      }

      const won = unit.info.teamId === data.winningTeamId;

      matches.push({
        specId: unit.info.specId,
        talents: unit.info.talents,
        pvpTalents: unit.info.pvpTalents,
        rating,
        won,
      });
    });
  });

  console.log(`Extracted ${matches.length} player talent records`);
  return matches;
}

async function aggregateTalentData(bracket, ratingRange) {
  console.log(`\n=== Aggregating talent data for ${bracket} ${ratingRange[0]}-${ratingRange[1]} ===`);

  const startDate = moment().subtract(LOOKBACK_DAYS, 'days').toDate();
  const endDate = moment().subtract(1, 'days').toDate();

  const matches = await fetchMatchesFromFirestore(bracket, ratingRange[0], ratingRange[1], startDate, endDate);

  if (matches.length === 0) {
    console.log('No matches found with talent data');
    return {};
  }

  // Group by spec and talent build
  const buildStats = new Map();

  for (const match of matches) {
    const specKey = match.specId.toString();
    const talentHash = generateTalentHash(match.talents, match.pvpTalents);

    if (!buildStats.has(specKey)) {
      buildStats.set(specKey, new Map());
    }

    const specBuilds = buildStats.get(specKey);
    if (!specBuilds.has(talentHash)) {
      specBuilds.set(talentHash, { 
        matchCount: 0, 
        winCount: 0,
        talents: match.talents,
        pvpTalents: match.pvpTalents
      });
    }

    const stats = specBuilds.get(talentHash);
    stats.matchCount++;
    if (match.won) {
      stats.winCount++;
    }
  }

  // Convert to output format
  const result = {};

  for (const [specId, builds] of Array.from(buildStats.entries())) {
    const topBuilds = [];

    // Get all builds for this spec and sort by match count
    const buildArray = Array.from(builds.entries()).sort((a, b) => b[1].matchCount - a[1].matchCount);

    // Process top N builds
    for (let i = 0; i < Math.min(TOP_BUILDS_LIMIT, buildArray.length); i++) {
      const [talentHash, stats] = buildArray[i];
      
      const winRate = stats.winCount / Math.max(1, stats.matchCount);
      topBuilds.push({
        buildId: `test_${talentHash.substring(0, 8)}`,
        talents: stats.talents,
        pvpTalents: stats.pvpTalents,
        exportString: `PLACEHOLDER_${talentHash.substring(0, 8)}`,
        matchCount: stats.matchCount,
        winRate: Math.round(winRate * 1000) / 10,
        usageRate: 0, // Will be calculated below
      });
    }

    // Calculate usage rates
    const totalMatches = topBuilds.reduce((sum, b) => sum + b.matchCount, 0);
    topBuilds.forEach((build) => {
      build.usageRate = Math.round((build.matchCount / totalMatches) * 1000) / 10;
    });

    result[specId] = topBuilds;
  }

  // Print summary
  console.log(`\nFound ${Object.keys(result).length} specs with talent data`);
  for (const [specId, builds] of Object.entries(result)) {
    console.log(`  Spec ${specId}: ${builds.length} builds (top: ${builds[0]?.matchCount || 0} matches)`);
  }

  return result;
}

async function exportTalentDataToGCS(bracket, ratingRange, talentData) {
  const date = moment().format('YYYY-MM-DD');
  const content = JSON.stringify(talentData, null, 2);
  
  const fileName = `data/talent-stats/${bracket}/${ratingRange[0]}-${ratingRange[1]}/test_${date}.json`;
  
  console.log(`\nExporting to GCS: ${fileName}`);
  console.log(`Data size: ${content.length} bytes`);
  
  try {
    await bucket.file(fileName).save(content, {
      contentType: 'application/json',
    });
    console.log('✅ Successfully exported to GCS');
  } catch (error) {
    console.error('❌ Error exporting to GCS:', error.message);
  }
}

async function testSingleBracket(bracket, ratingRange) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing ${bracket} ${ratingRange[0]}-${ratingRange[1]}`);
  console.log('='.repeat(60));
  
  try {
    // Aggregate talent data from Firestore
    const talentData = await aggregateTalentData(bracket, ratingRange);
    
    if (Object.keys(talentData).length > 0) {
      // Export to GCS for testing
      await exportTalentDataToGCS(bracket, ratingRange, talentData);
      
      // Save to local file for inspection
      const localFile = path.join(__dirname, `talent_data_${bracket}_${ratingRange[0]}_${ratingRange[1]}.json`);
      fs.writeFileSync(localFile, JSON.stringify(talentData, null, 2));
      console.log(`📁 Saved local copy: ${localFile}`);
    } else {
      console.log('⚠️  No talent data found for this bracket/rating');
    }
  } catch (error) {
    console.error('Error processing bracket:', error);
  }
}

async function run() {
  console.log('Starting Firestore talent aggregation test...');
  console.log('Using GCP credentials from wowarenalogs-public-dev.json');
  console.log(`Looking back ${LOOKBACK_DAYS} days for match data`);
  console.log();
  
  // Test just one bracket/rating combination first
  await testSingleBracket('3v3', [1800, 2099]);
  
  // Uncomment to test all combinations
  /*
  for (const bracket of ALLOWED_BRACKETS) {
    for (const ratingRange of RATING_RANGES) {
      await testSingleBracket(bracket, ratingRange);
    }
  }
  */
  
  console.log('\n✅ Test completed!');
}

run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});