import * as moment from 'moment';
import * as fs from 'fs';
import * as path from 'path';

// Mock data for testing
const mockMatches = [
  // Arms Warrior matches
  {
    specId: '71',
    talents: [
      { id1: 90001, id2: 90001, count: 1 },
      { id1: 90002, id2: 90002, count: 1 },
      { id1: 90003, id2: 90003, count: 2 },
      { id1: 90004, id2: 90004, count: 1 },
      { id1: 90005, id2: 90005, count: 1 }
    ],
    pvpTalents: ['91001', '91002', '91003'],
    rating: 1850,
    won: true
  },
  {
    specId: '71',
    talents: [
      { id1: 90001, id2: 90001, count: 1 },
      { id1: 90002, id2: 90002, count: 1 },
      { id1: 90003, id2: 90003, count: 2 },
      { id1: 90004, id2: 90004, count: 1 },
      { id1: 90005, id2: 90005, count: 1 }
    ],
    pvpTalents: ['91001', '91002', '91003'],
    rating: 1920,
    won: true
  },
  {
    specId: '71',
    talents: [
      { id1: 90001, id2: 90001, count: 1 },
      { id1: 90002, id2: 90002, count: 1 },
      { id1: 90003, id2: 90003, count: 2 },
      { id1: 90004, id2: 90004, count: 1 },
      { id1: 90005, id2: 90005, count: 1 }
    ],
    pvpTalents: ['91001', '91002', '91003'],
    rating: 1750,
    won: false
  },
  // Different Arms build
  {
    specId: '71',
    talents: [
      { id1: 90001, id2: 90001, count: 1 },
      { id1: 90002, id2: 90002, count: 1 },
      { id1: 90006, id2: 90006, count: 1 },
      { id1: 90007, id2: 90007, count: 2 },
      { id1: 90008, id2: 90008, count: 1 }
    ],
    pvpTalents: ['91001', '91004', '91005'],
    rating: 2100,
    won: true
  },
  {
    specId: '71',
    talents: [
      { id1: 90001, id2: 90001, count: 1 },
      { id1: 90002, id2: 90002, count: 1 },
      { id1: 90006, id2: 90006, count: 1 },
      { id1: 90007, id2: 90007, count: 2 },
      { id1: 90008, id2: 90008, count: 1 }
    ],
    pvpTalents: ['91001', '91004', '91005'],
    rating: 2200,
    won: false
  },
  // Fury Warrior matches
  {
    specId: '72',
    talents: [
      { id1: 90023, id2: 90023, count: 1 },
      { id1: 90024, id2: 90024, count: 1 },
      { id1: 90025, id2: 90025, count: 2 },
      { id1: 90026, id2: 90026, count: 1 }
    ],
    pvpTalents: ['91015', '91016', '91017'],
    rating: 1650,
    won: true
  },
  {
    specId: '72',
    talents: [
      { id1: 90023, id2: 90023, count: 1 },
      { id1: 90024, id2: 90024, count: 1 },
      { id1: 90025, id2: 90025, count: 2 },
      { id1: 90026, id2: 90026, count: 1 }
    ],
    pvpTalents: ['91015', '91016', '91017'],
    rating: 1700,
    won: true
  },
  // Discipline Priest matches
  {
    specId: '256',
    talents: [
      { id1: 90035, id2: 90035, count: 1 },
      { id1: 90036, id2: 90036, count: 1 },
      { id1: 90037, id2: 90037, count: 1 },
      { id1: 90038, id2: 90038, count: 2 }
    ],
    pvpTalents: ['91024', '91025', '91026'],
    rating: 2350,
    won: true
  },
  {
    specId: '256',
    talents: [
      { id1: 90035, id2: 90035, count: 1 },
      { id1: 90036, id2: 90036, count: 1 },
      { id1: 90037, id2: 90037, count: 1 },
      { id1: 90038, id2: 90038, count: 2 }
    ],
    pvpTalents: ['91024', '91025', '91026'],
    rating: 2400,
    won: true
  },
  {
    specId: '256',
    talents: [
      { id1: 90035, id2: 90035, count: 1 },
      { id1: 90036, id2: 90036, count: 1 },
      { id1: 90037, id2: 90037, count: 1 },
      { id1: 90038, id2: 90038, count: 2 }
    ],
    pvpTalents: ['91024', '91025', '91026'],
    rating: 2280,
    won: false
  },
  // Different Discipline build
  {
    specId: '256',
    talents: [
      { id1: 90039, id2: 90039, count: 1 },
      { id1: 90040, id2: 90040, count: 1 },
      { id1: 90041, id2: 90041, count: 1 },
      { id1: 90042, id2: 90042, count: 1 }
    ],
    pvpTalents: ['91027', '91028', '91029'],
    rating: 1950,
    won: true
  }
];

// Simplified aggregation logic for testing
function aggregateTalentData(matches: any[], minRating: number, maxRating: number) {
  const buildStats: Map<string, Map<string, { matchCount: number; winCount: number; hash: string }>> = new Map();

  for (const match of matches) {
    if (match.rating < minRating || match.rating > maxRating) {
      continue;
    }

    const specKey = match.specId;
    const talentHash = JSON.stringify({ talents: match.talents, pvpTalents: match.pvpTalents });

    if (!buildStats.has(specKey)) {
      buildStats.set(specKey, new Map());
    }

    const specBuilds = buildStats.get(specKey)!;
    if (!specBuilds.has(talentHash)) {
      specBuilds.set(talentHash, { matchCount: 0, winCount: 0, hash: talentHash });
    }

    const stats = specBuilds.get(talentHash)!;
    stats.matchCount++;
    if (match.won) {
      stats.winCount++;
    }
  }

  // Convert to output format
  const result: { [specId: string]: any[] } = {};

  for (const [specId, builds] of Array.from(buildStats.entries())) {
    const buildArray = Array.from(builds.entries()).sort((a, b) => b[1].matchCount - a[1].matchCount);
    
    result[specId] = buildArray.map(([hash, stats], index) => {
      const buildData = JSON.parse(hash);
      const winRate = Math.round((stats.winCount / stats.matchCount) * 1000) / 10;
      
      return {
        buildId: `${specId}_${index + 1}`,
        talents: buildData.talents,
        pvpTalents: buildData.pvpTalents,
        exportString: `TEST_EXPORT_${specId}_${index + 1}`,
        matchCount: stats.matchCount,
        winRate,
        usageRate: 0 // Will be calculated after
      };
    });

    // Calculate usage rates
    const totalMatches = result[specId].reduce((sum, b) => sum + b.matchCount, 0);
    result[specId].forEach((build) => {
      build.usageRate = Math.round((build.matchCount / totalMatches) * 1000) / 10;
    });
  }

  return result;
}

async function testLocalAggregation() {
  console.log('Testing talent stats aggregation locally...\n');

  const brackets = ['2v2', '3v3', 'Rated Solo Shuffle'];
  const ratingRanges = [
    [0, 4999],
    [0, 1399],
    [1400, 1799],
    [1800, 2099],
    [2100, 4999],
  ];

  for (const bracket of brackets) {
    for (const [minRating, maxRating] of ratingRanges) {
      console.log(`\nProcessing ${bracket} ${minRating}-${maxRating}:`);
      console.log('=' .repeat(50));
      
      const aggregatedData = aggregateTalentData(mockMatches, minRating, maxRating);
      
      // Output results
      for (const [specId, builds] of Object.entries(aggregatedData)) {
        console.log(`\nSpec ${specId}:`);
        for (const build of builds) {
          console.log(`  Build ${build.buildId}:`);
          console.log(`    Matches: ${build.matchCount}`);
          console.log(`    Win Rate: ${build.winRate}%`);
          console.log(`    Usage Rate: ${build.usageRate}%`);
          console.log(`    PvP Talents: ${build.pvpTalents.join(', ')}`);
        }
      }

      // Save to file for testing
      const outputDir = path.join(__dirname, '..', '..', '..', 'web', 'public', 'test-talent-data');
      const fileName = `${bracket.replace(' ', '_')}_${minRating}-${maxRating}.json`;
      const filePath = path.join(outputDir, fileName);
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, JSON.stringify(aggregatedData, null, 2));
      console.log(`\nSaved to: ${filePath}`);
    }
  }

  console.log('\n' + '=' .repeat(50));
  console.log('Local test completed successfully!');
  console.log('Test data saved to: packages/web/public/test-talent-data/');
}

testLocalAggregation()
  .then(() => {
    console.log('\nTest passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });