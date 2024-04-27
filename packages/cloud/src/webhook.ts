import { FirebaseDTO } from './createMatchStub';

const listenerURLs = ['https://localhost:3000'];

export async function reportMatch(stub: FirebaseDTO) {
  const promises = listenerURLs.map((p) =>
    fetch(p, {
      method: 'POST',
      body: JSON.stringify(stub),
      headers: {
        'x-idempotency-key': stub.id,
      },
    }),
  );
  return Promise.all(promises);
}
