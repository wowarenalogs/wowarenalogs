const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

const TALENTS_URL = 'https://www.raidbots.com/static/data/live/talents.json';
const ENCHANTMENTS_URL = 'https://www.raidbots.com/static/data/live/enchantments.json';

const TALENTS_OUTPUT_PATH = path.join(__dirname, '..', 'packages', 'shared', 'src', 'data', 'talentIdMap.json');
const ENCHANTMENTS_OUTPUT_PATH = path.join(
  __dirname,
  '..',
  'packages',
  'shared',
  'src',
  'data',
  'raidbotsEnchantments.json',
);

async function downloadAndSave(url, outputPath, dataType) {
  console.log(`Downloading ${dataType} data from Raidbots...`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  console.log(
    `Downloaded ${dataType} data with ${Array.isArray(data) ? data.length : 'unknown'} ${
      dataType === 'talents' ? 'talent trees' : 'enchantments'
    }`,
  );

  // Convert to formatted JSON string
  const jsonString = JSON.stringify(data, null, 2);

  // Write to file
  await fs.writeFile(outputPath, jsonString, 'utf8');

  console.log(`Successfully updated ${dataType} data at: ${outputPath}`);
  console.log(`File size: ${(jsonString.length / 1024 / 1024).toFixed(2)} MB`);
}

async function updateData() {
  try {
    console.log('Starting Raidbots data update...\n');

    // Update talents
    await downloadAndSave(TALENTS_URL, TALENTS_OUTPUT_PATH, 'talents');
    console.log('');

    // Update enchantments
    await downloadAndSave(ENCHANTMENTS_URL, ENCHANTMENTS_OUTPUT_PATH, 'enchantments');

    console.log('\n✅ All data updated successfully!');
  } catch (error) {
    console.error('❌ Error updating data:', error.message);
    process.exit(1);
  }
}

// Run the update
updateData();
