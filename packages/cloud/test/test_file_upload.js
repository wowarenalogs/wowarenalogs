const fetch = require('node-fetch');
const fs = require('fs');

const STAGE = 'dev';

const functionURL = 'us-central1-wowarenalogs.cloudfunctions.net';

/*
  Submits combat logs to the arena matches service
*/
async function uploadFile(fullFilePath, hashedName) {
  console.log('Uploading file', fullFilePath, hashedName);
  const s3_preflight = await fetch(
    `https://${functionURL}/gcp-wowarenalogs-${STAGE}-getUploadSignature?name=${hashedName}`,
    {
      method: 'OPTIONS',
      headers: {
        'content-type': 'text/plain;charset=UTF-8',
        'x-goog-meta-ownerid': 'test-owner',
      },
    },
  );
  console.log(s3_preflight.headers);

  const s3_signed_response = await fetch(
    `https://${functionURL}/gcp-wowarenalogs-${STAGE}-getUploadSignature?name=${hashedName}`,
    {
      headers: {
        'content-type': 'text/plain;charset=UTF-8',
        'x-goog-meta-ownerid': 'test-owner',
      },
    },
  );
  const json_response = await s3_signed_response.json();
  const signed_upload_url = json_response['url'];
  console.log(json_response);

  const stats = fs.statSync(fullFilePath);
  const readStream = fs.createReadStream(fullFilePath);
  const fileSizeInBytes = stats.size;

  const r = await fetch(signed_upload_url, {
    method: 'PUT',
    body: readStream,
    headers: {
      'content-type': 'text/plain;charset=UTF-8',
      'x-goog-meta-ownerid': 'test-owner',
    },
  });
  console.log(r.status);
  return r.text();
}

uploadFile('./test/testLogFile.txt', 'testlogfile.txt').then(console.log).catch(console.log);
