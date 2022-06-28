import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { signIn } from 'next-auth/react';

export default () => {
  const router = useRouter();

  useEffect(() => {
    if (router.isReady) {
      signIn('battlenet-us', { callbackUrl: '/' });
    }
  }, [router]);

  return <div />;
};
