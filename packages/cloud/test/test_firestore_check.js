const { Firestore } = require('@google-cloud/firestore');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const gcpCredentials = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../wowarenalogs-public-dev.json'), 'utf8')
);

// Try to connect to production Firestore instead
const firestore = new Firestore({
  projectId: 'wowarenalogs',  // Production project
  credentials: gcpCredentials,
});

async function checkFirestoreData() {
  console.log('Checking Firestore data availability...\n');
  
  // Get the most recent documents
  console.log('Fetching 10 most recent documents...');
  const recentSnapshot = await firestore
    .collection('combatStubs')
    .orderBy('startTime', 'desc')
    .limit(10)
    .get();
  
  if (recentSnapshot.empty) {
    console.log('❌ No documents found in combatStubs collection');
    return;
  }
  
  console.log(`✅ Found ${recentSnapshot.size} recent documents\n`);
  
  // Analyze the documents
  const brackets = new Set();
  const dates = [];
  let hastalentData = 0;
  
  recentSnapshot.forEach((doc) => {
    const data = doc.data();
    
    // Check timestamp
    if (data.startTime) {
      const date = new Date(data.startTime);
      dates.push(date);
      console.log(`Document: ${doc.id}`);
      console.log(`  Date: ${date.toISOString()}`);
      console.log(`  Bracket: ${data.startInfo?.bracket || 'N/A'}`);
    }
    
    // Check bracket
    if (data.startInfo?.bracket) {
      brackets.add(data.startInfo.bracket);
    }
    
    // Check for talent data
    if (data.units && Array.isArray(data.units)) {
      const unitsWithTalents = data.units.filter(u => 
        u.info?.talents && u.info?.pvpTalents && u.info?.specId
      );
      if (unitsWithTalents.length > 0) {
        hastalentData++;
        console.log(`  Units with talents: ${unitsWithTalents.length}/${data.units.length}`);
        
        // Show sample talent data
        const sample = unitsWithTalents[0];
        console.log(`  Sample spec: ${sample.info.specId}`);
        console.log(`  Sample rating: ${sample.info.personalRating || 'N/A'}`);
        console.log(`  Talents count: ${sample.info.talents?.length || 0}`);
        console.log(`  PvP talents count: ${sample.info.pvpTalents?.length || 0}`);
      }
    }
    console.log();
  });
  
  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Brackets found: ${Array.from(brackets).join(', ')}`);
  console.log(`Documents with talent data: ${hastalentData}/${recentSnapshot.size}`);
  
  if (dates.length > 0) {
    const mostRecent = new Date(Math.max(...dates));
    const oldest = new Date(Math.min(...dates));
    console.log(`Date range: ${oldest.toISOString()} to ${mostRecent.toISOString()}`);
    console.log(`Most recent: ${moment(mostRecent).fromNow()}`);
    console.log(`Oldest: ${moment(oldest).fromNow()}`);
  }
  
  // Try to get data from a specific date range
  console.log('\n=== CHECKING SPECIFIC DATE RANGE ===');
  const endDate = new Date(Math.max(...dates)); // Use most recent date found
  const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days before
  
  console.log(`Querying from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  const rangeSnapshot = await firestore
    .collection('combatStubs')
    .where('startTime', '>=', startDate.getTime())
    .where('startTime', '<=', endDate.getTime())
    .limit(50)
    .get();
  
  console.log(`Found ${rangeSnapshot.size} documents in this range`);
  
  // Count by bracket
  const bracketCounts = {};
  rangeSnapshot.forEach((doc) => {
    const bracket = doc.data().startInfo?.bracket || 'unknown';
    bracketCounts[bracket] = (bracketCounts[bracket] || 0) + 1;
  });
  
  console.log('Breakdown by bracket:');
  for (const [bracket, count] of Object.entries(bracketCounts)) {
    console.log(`  ${bracket}: ${count}`);
  }
}

checkFirestoreData().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});