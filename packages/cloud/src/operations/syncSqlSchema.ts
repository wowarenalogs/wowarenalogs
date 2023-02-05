import { SQLDB } from '../schema/connection';

async function main() {
  await SQLDB.initialize();
  await SQLDB.synchronize();

  console.log('SQL DB successfully synchronized.');
  process.exit(0);
}

main();
