import * as refreshTalentStatsHandler from '../src/refreshTalentStatsHandler';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  console.log('Starting talent stats refresh test...');
  
  await new Promise((resolve) => {
    refreshTalentStatsHandler.handler({}, {}, () => {
      console.log('Talent stats refresh completed');
      resolve(true);
    });
  });
}

run()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });