#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

// Make the raw combat log bucket private and grant the two service accounts that
// still need to read it. Required before deploying the sign-in-gated log access
// (packages/shared/src/graphql-server/utils/accessGuard.ts); until this has run,
// a match id from search is still a public download URL.
//
// Node rather than bash so it runs the same way on every OS: on Windows, `bash`
// from an npm script resolves to WSL, which then can't drive the Windows gcloud
// auth flow. This only shells out to `gcloud`.
//
// Idempotent — safe to re-run. Uses the active gcloud account and passes
// --project on every call; it never changes your gcloud config.
//
// Usage: node lockdown_log_bucket.js <dev|prod> [web-service-account]
//   or   npm run lockdown:dev / npm run lockdown:prod
//
//   web-service-account  The service account the web Cloud Run service runs as.
//                        Defaults to the project's default compute SA, which is
//                        also what the Cloud Functions run as. Override if the
//                        Cloud Run service was given its own SA:
//                          gcloud run services describe <service> --region=<region> \
//                            --format='value(spec.template.spec.serviceAccountName)'

const { spawnSync } = require('child_process');

const PROJECTS = {
  dev: 'wowarenalogs-public-dev',
  prod: 'wowarenalogs',
};

const [, , environment, webSaArg] = process.argv;
const projectId = PROJECTS[environment];
if (!projectId) {
  console.error('Usage: lockdown_log_bucket.js <dev|prod> [web-service-account]');
  process.exit(1);
}

const bucket = `gs://${projectId}-log-files-prod`;
const gcloudCmd = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';

// Runs gcloud, returns stdout. Throws on non-zero exit unless `allowFailure`.
function gcloud(args, { allowFailure = false, quiet = false } = {}) {
  const result = spawnSync(gcloudCmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.error) {
    throw new Error(`could not start gcloud: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`gcloud ${args.join(' ')}\n${result.stderr || result.stdout}`);
  }
  if (!quiet && result.stderr && result.status === 0) {
    process.stderr.write(result.stderr);
  }
  return (result.stdout || '').trim();
}

function step(title) {
  console.log(`\n== ${title}`);
}

function main() {
  const account = gcloud(['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'], { quiet: true });
  if (!account) {
    console.error('No active gcloud account. Run `gcloud auth login` first, then re-run.');
    process.exit(1);
  }

  const projectNumber = gcloud(['projects', 'describe', projectId, '--format=value(projectNumber)']);
  const computeSa = `${projectNumber}-compute@developer.gserviceaccount.com`;
  const webSa = webSaArg || computeSa;

  console.log(`Locking down ${bucket} in ${projectId} (${environment})`);
  console.log(`  gcloud account:            ${account}`);
  console.log(`  functions service account: ${computeSa}`);
  console.log(`  web service account:       ${webSa}`);

  // 1. Remove public read: both the common binding and the legacy one, for both
  //    public principals. "Not found" is fine on a re-run.
  step('Removing public read access');
  for (const role of ['roles/storage.objectViewer', 'roles/storage.legacyObjectReader']) {
    for (const member of ['allUsers', 'allAuthenticatedUsers']) {
      gcloud(
        ['storage', 'buckets', 'remove-iam-policy-binding', bucket, `--member=${member}`, `--role=${role}`, `--project=${projectId}`],
        { allowFailure: true, quiet: true },
      );
    }
  }

  // 2. Enforce public access prevention so a future grant to allUsers is rejected
  //    at the API rather than quietly reopening the bucket.
  step('Enabling public access prevention');
  gcloud(['storage', 'buckets', 'update', bucket, '--public-access-prevention', `--project=${projectId}`]);

  // 3. The functions (writeMatchStub, refreshSpellIcons, map-image script) read logs
  //    through the Storage client as the compute SA.
  step('Granting object read to the functions service account');
  gcloud([
    'storage',
    'buckets',
    'add-iam-policy-binding',
    bucket,
    `--member=serviceAccount:${computeSa}`,
    '--role=roles/storage.objectViewer',
    `--project=${projectId}`,
  ]);

  // 4. The web service signs V4 read URLs: object read on the bucket, plus permission
  //    to sign as itself via IAM signBlob (no private key on the box).
  if (webSa !== computeSa) {
    step('Granting object read to the web service account');
    gcloud([
      'storage',
      'buckets',
      'add-iam-policy-binding',
      bucket,
      `--member=serviceAccount:${webSa}`,
      '--role=roles/storage.objectViewer',
      `--project=${projectId}`,
    ]);
  }
  step('Granting signBlob (serviceAccountTokenCreator) to the web service account on itself');
  gcloud([
    'iam',
    'service-accounts',
    'add-iam-policy-binding',
    webSa,
    `--member=serviceAccount:${webSa}`,
    '--role=roles/iam.serviceAccountTokenCreator',
    `--project=${projectId}`,
  ]);

  // 5. Verify. Fail loudly if any public principal is still bound.
  step('Verifying bucket policy');
  const policy = JSON.parse(gcloud(['storage', 'buckets', 'get-iam-policy', bucket, `--project=${projectId}`, '--format=json']));
  const members = (policy.bindings || []).flatMap((b) => (b.members || []).map((m) => `${b.role} -> ${m}`));
  const publicMembers = members.filter((m) => /\ball(Authenticated)?Users\b/.test(m));
  if (publicMembers.length > 0) {
    console.error('Bucket still grants access to a public principal:');
    publicMembers.forEach((m) => console.error(`  ${m}`));
    process.exit(1);
  }
  const pap = gcloud(['storage', 'buckets', 'describe', bucket, `--project=${projectId}`, '--format=value(public_access_prevention)']);
  if (pap !== 'enforced') {
    console.error(`Public access prevention is '${pap}', expected 'enforced'`);
    process.exit(1);
  }

  console.log(`\n${bucket} is private. Readers:`);
  members.filter((m) => /objectViewer|legacyObjectReader|objectAdmin|admin/.test(m)).forEach((m) => console.log(`  ${m}`));
  console.log(`\nLockdown complete for ${environment}.`);
}

try {
  main();
} catch (e) {
  console.error(`\nLockdown failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
