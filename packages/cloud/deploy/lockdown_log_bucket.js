#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

// Usage: node lockdown_log_bucket.js <dev|prod> [web-service-account]
// web-service-account defaults to the project's compute SA. Look up the Cloud Run one with:
//   gcloud run services describe <service> --region=<region> --format='value(spec.template.spec.serviceAccountName)'
// Node, not bash: on Windows npm's `bash` is WSL, which can't drive the Windows gcloud auth flow.

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

  step('Removing public read access');
  for (const role of ['roles/storage.objectViewer', 'roles/storage.legacyObjectReader']) {
    for (const member of ['allUsers', 'allAuthenticatedUsers']) {
      gcloud(
        ['storage', 'buckets', 'remove-iam-policy-binding', bucket, `--member=${member}`, `--role=${role}`, `--project=${projectId}`],
        { allowFailure: true, quiet: true },
      );
    }
  }

  step('Enabling public access prevention');
  gcloud(['storage', 'buckets', 'update', bucket, '--public-access-prevention', `--project=${projectId}`]);

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
