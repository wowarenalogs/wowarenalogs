import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { signIn } from 'next-auth/client';

export default () => {
  const router = useRouter();

  useEffect(() => {
    if (router.isReady) {
      signIn('battlenet-us', { callbackUrl: '/' });
    }
  }, [router]);

  // TODO: something here to make it look like progress is happening
  return <div className="text-white">Logging in...</div>;
};
