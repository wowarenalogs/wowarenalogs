import { Firestore } from '@google-cloud/firestore';
import { Storage as GoogleCloudStorage } from '@google-cloud/storage';
import { PrismaClient } from '@wowarenalogs/sql';
import crypto from 'crypto';
import fs from 'fs';
import _ from 'lodash';
import moment from 'moment';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';
const gcpCredentials = isDev
  ? JSON.parse(fs.readFileSync(path.join(process.cwd(), './wowarenalogs-public-dev.json'), 'utf8'))
  : undefined;

// Fix: Add project ID
const firestore = new Firestore({
  projectId: isDev ? 'wowarenalogs-public-dev' : 'wowarenalogs',
  credentials: gcpCredentials,
});

const storage = new GoogleCloudStorage({
  projectId: isDev ? 'wowarenalogs-public-dev' : 'wowarenalogs',
  credentials: gcpCredentials,
});
const bucket = storage.bucket(isDev ? 'data.public-dev.wowarenalogs.com' : 'data.wowarenalogs.com');

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
const QUERY_BATCH_SIZE = 5000; // Add batch size limit

const prisma = new PrismaClient();

interface TalentData {
  id1: number;
  id2: number;
  count: number;
}

interface MatchTalentData {
  specId: string;
  talents: TalentData[];
  pvpTalents: string[];
  rating: number;
  won: boolean;
}

function generateTalentHash(talents: TalentData[], pvpTalents: string[]): string {
  const sortedTalents = [...talents].sort((a, b) => a.id1 - b.id1);
  const sortedPvpTalents = [...pvpTalents].sort();
  const combined = JSON.stringify({ talents: sortedTalents, pvpTalents: sortedPvpTalents });
  return crypto.createHash('sha256').update(combined).digest('hex');
}

async function getOrCreateTalentBuild(
  specId: number,
  talents: TalentData[],
  pvpTalents: string[],
): Promise<bigint> {
  const talentHash = generateTalentHash(talents, pvpTalents);

  // Try to find existing build
  let build = await prisma.talentBuild.findUnique({
    where: { talentHash },
  });

  if (!build) {
    // For now, use placeholder. In production, would need actual export string generation
    let exportString = `PLACEHOLDER_${talentHash.substring(0, 8)}`;

    // Create new build
    build = await prisma.talentBuild.create({
      data: {
        specId,
        talentHash,
        talents: JSON.stringify(talents),
        pvpTalents: JSON.stringify(pvpTalents),
        exportString,
      },
    });
  }

  return build.id;
}

async function fetchMatchesFromFirestore(
  bracket: string,
  minRating: number,
  maxRating: number,
  startDate: Date,
  endDate: Date,
): Promise<MatchTalentData[]> {
  const matches: MatchTalentData[] = [];
  
  console.log(`Fetching matches for ${bracket} ${minRating}-${maxRating}`);
  console.log(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

  try {
    // Fix: Use paginated queries to handle large datasets
    let lastDoc = null;
    let hasMore = true;
    let totalDocs = 0;
    
    while (hasMore) {
      let query = firestore
        .collection('combatStubs')
        .where('startInfo.bracket', '==', bracket)
        .where('startTime', '>=', startDate.getTime())
        .where('startTime', '<=', endDate.getTime())
        .orderBy('startTime')
        .limit(QUERY_BATCH_SIZE);
      
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
      
      const querySnapshot = await query.get();
      
      if (querySnapshot.empty) {
        hasMore = false;
        break;
      }
      
      totalDocs += querySnapshot.size;
      console.log(`Fetched batch: ${querySnapshot.size} docs (total: ${totalDocs})`);
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.units || !Array.isArray(data.units)) return;

        data.units.forEach((unit: any) => {
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
        
        lastDoc = doc;
      });
      
      // If we got less than the batch size, we're done
      if (querySnapshot.size < QUERY_BATCH_SIZE) {
        hasMore = false;
      }
    }
    
    console.log(`Total matches extracted: ${matches.length} from ${totalDocs} documents`);
  } catch (error: any) {
    // Check if it's an index error
    if (error.code === 9 && error.details?.includes('index')) {
      console.error('ERROR: Firestore composite index required!');
      console.error('Please create the index using this URL:');
      console.error(error.details.match(/https:\/\/[^\s]+/)?.[0] || 'Check error details');
      throw new Error('Firestore index required - see logs for details');
    }
    throw error;
  }

  return matches;
}

async function aggregateTalentData(
  bracket: string,
  ratingRange: [number, number],
): Promise<{ [specId: string]: Array<{ buildId: bigint; matchCount: number; winCount: number }> }> {
  console.log(`Aggregating talent data for ${bracket} ${ratingRange[0]}-${ratingRange[1]}...`);

  const startDate = moment().subtract(LOOKBACK_DAYS, 'days').toDate();
  const endDate = moment().subtract(1, 'days').toDate();

  const matches = await fetchMatchesFromFirestore(bracket, ratingRange[0], ratingRange[1], startDate, endDate);

  if (matches.length === 0) {
    console.log('No matches found with talent data');
    return {};
  }

  console.log(`Found ${matches.length} matches with talent data`);

  // Group by spec and talent build
  const buildStats: Map<string, Map<string, { matchCount: number; winCount: number }>> = new Map();

  for (const match of matches) {
    const specKey = match.specId;
    const talentHash = generateTalentHash(match.talents, match.pvpTalents);

    if (!buildStats.has(specKey)) {
      buildStats.set(specKey, new Map());
    }

    const specBuilds = buildStats.get(specKey)!;
    if (!specBuilds.has(talentHash)) {
      specBuilds.set(talentHash, { matchCount: 0, winCount: 0 });
    }

    const stats = specBuilds.get(talentHash)!;
    stats.matchCount++;
    if (match.won) {
      stats.winCount++;
    }
  }

  // Convert to database format and get/create build IDs
  const result: { [specId: string]: Array<{ buildId: bigint; matchCount: number; winCount: number }> } = {};

  for (const [specId, builds] of Array.from(buildStats.entries())) {
    const specIdNum = parseInt(specId);
    
    // Validate spec ID
    if (isNaN(specIdNum) || specIdNum <= 0) {
      console.warn(`Invalid spec ID: ${specId}, skipping`);
      continue;
    }
    
    const topBuilds: Array<{ buildId: bigint; matchCount: number; winCount: number }> = [];

    // Get all builds for this spec and sort by match count
    const buildArray = Array.from(builds.entries()).sort((a, b) => b[1].matchCount - a[1].matchCount);

    // Process top N builds
    for (let i = 0; i < Math.min(TOP_BUILDS_LIMIT, buildArray.length); i++) {
      const buildEntry = buildArray[i];
      if (!buildEntry) continue;
      const [talentHash, stats] = buildEntry;

      // Find a match with this talent hash to get the actual talent data
      const matchWithBuild = matches.find(
        (m) => m.specId === specId && generateTalentHash(m.talents, m.pvpTalents) === talentHash,
      );

      if (matchWithBuild) {
        try {
          const buildId = await getOrCreateTalentBuild(specIdNum, matchWithBuild.talents, matchWithBuild.pvpTalents);
          topBuilds.push({
            buildId,
            matchCount: stats.matchCount,
            winCount: stats.winCount,
          });
        } catch (error) {
          console.error(`Error creating talent build for spec ${specId}:`, error);
        }
      }
    }

    if (topBuilds.length > 0) {
      result[specId] = topBuilds;
    }
  }

  console.log(`Aggregated ${Object.keys(result).length} specs with talent data`);
  return result;
}

async function saveTalentSnapshots(
  bracket: string,
  ratingRange: [number, number],
  talentData: { [specId: string]: Array<{ buildId: bigint; matchCount: number; winCount: number }> },
) {
  const date = moment().format('YYYY-MM-DD');

  // Delete existing snapshots for this date/bracket/rating
  await prisma.talentSnapshot.deleteMany({
    where: {
      date,
      bracket,
      ratingMin: ratingRange[0],
      ratingMax: ratingRange[1],
    },
  });

  // Create new snapshots
  const snapshots = [];
  for (const [specIdStr, builds] of Object.entries(talentData)) {
    const specId = parseInt(specIdStr);
    if (isNaN(specId)) continue;
    
    for (const build of builds) {
      snapshots.push({
        date,
        bracket,
        specId,
        ratingMin: ratingRange[0],
        ratingMax: ratingRange[1],
        talentBuildId: build.buildId,
        matchCount: build.matchCount,
        winCount: build.winCount,
      });
    }
  }

  if (snapshots.length > 0) {
    await prisma.talentSnapshot.createMany({
      data: snapshots,
    });
    console.log(`Saved ${snapshots.length} talent snapshots`);
  } else {
    console.log('No snapshots to save');
  }
}

async function exportTalentDataToGCS(bracket: string, ratingRange: [number, number]) {
  const date = moment().format('YYYY-MM-DD');

  // Fetch the latest snapshots with build details
  const snapshots = await prisma.talentSnapshot.findMany({
    where: {
      date,
      bracket,
      ratingMin: ratingRange[0],
      ratingMax: ratingRange[1],
    },
    include: {
      talentBuild: true,
    },
    orderBy: [{ specId: 'asc' }, { matchCount: 'desc' }],
  });

  if (snapshots.length === 0) {
    console.log('No snapshots to export');
    return;
  }

  // Group by spec
  const groupedBySpec: { [specId: string]: any[] } = {};
  for (const snapshot of snapshots) {
    const specId = snapshot.specId.toString();
    if (!groupedBySpec[specId]) {
      groupedBySpec[specId] = [];
    }

    const winRate = snapshot.winCount / Math.max(1, snapshot.matchCount);
    groupedBySpec[specId].push({
      buildId: snapshot.talentBuildId.toString(),
      talents: JSON.parse(snapshot.talentBuild.talents as string),
      pvpTalents: JSON.parse(snapshot.talentBuild.pvpTalents as string),
      exportString: snapshot.talentBuild.exportString,
      matchCount: snapshot.matchCount,
      winRate: Math.round(winRate * 1000) / 10, // Convert to percentage with 1 decimal
      usageRate: 0, // Will be calculated below
    });
  }

  // Calculate usage rates
  for (const builds of Object.values(groupedBySpec)) {
    const totalMatches = builds.reduce((sum, b) => sum + b.matchCount, 0);
    builds.forEach((build) => {
      build.usageRate = Math.round((build.matchCount / totalMatches) * 1000) / 10;
    });
  }

  const content = JSON.stringify(groupedBySpec, null, 2);

  try {
    // Save versioned file
    await bucket
      .file(
        `data/talent-stats/${bracket}/${ratingRange[0]}-${ratingRange[1]}/v${STATS_SCHEMA_VERSION}.latest.json`,
      )
      .save(content, {
        contentType: 'application/json',
        metadata: {
          cacheControl: 'public, max-age=3600', // Cache for 1 hour
        },
      });

    // Save dated file for history
    await bucket
      .file(`data/talent-stats/${bracket}/${ratingRange[0]}-${ratingRange[1]}/${date}.json`)
      .save(content, {
        contentType: 'application/json',
      });

    console.log(`Exported talent stats to GCS for ${bracket} ${ratingRange[0]}-${ratingRange[1]}`);
  } catch (error) {
    console.error(`Error exporting to GCS for ${bracket} ${ratingRange[0]}-${ratingRange[1]}:`, error);
    throw error;
  }
}

export async function handler(_event: unknown, _context: unknown, callback: () => void) {
  console.log('refreshTalentStats started at', new Date().toISOString());

  try {
    for (const bracket of ALLOWED_BRACKETS) {
      for (const ratingRange of RATING_RANGES) {
        console.log(`\n=== Processing ${bracket} ${ratingRange[0]}-${ratingRange[1]} ===`);
        
        try {
          // Aggregate talent data from Firestore
          const talentData = await aggregateTalentData(bracket, [ratingRange[0], ratingRange[1]]);

          if (Object.keys(talentData).length > 0) {
            // Save to database
            await saveTalentSnapshots(bracket, [ratingRange[0], ratingRange[1]], talentData);

            // Export to GCS for static serving
            await exportTalentDataToGCS(bracket, [ratingRange[0], ratingRange[1]]);
          } else {
            console.log(`No data to process for ${bracket} ${ratingRange[0]}-${ratingRange[1]}`);
          }
        } catch (error) {
          console.error(`Error processing ${bracket} ${ratingRange[0]}-${ratingRange[1]}:`, error);
          // Continue with next bracket/rating instead of failing completely
        }
      }
    }

    console.log('\nrefreshTalentStats completed successfully at', new Date().toISOString());
  } catch (error) {
    console.error('Fatal error in refreshTalentStats:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    callback();
  }
}