export default function main() {
  if (!process.env.ENV_SQL_URL) {
    console.error(
      'A local .env file that contains ENV_SQL_URL is required to deploy these cloud functions as they need to connect to MYSQL databases to store stats.',
    );
    process.exit(1);
  }
}

main();
