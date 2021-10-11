import { signIn } from 'next-auth/client';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function Login() {
  const router = useRouter();

  useEffect(() => {
    if (router.isReady) {
      signIn(router.query.provider as string, { callbackUrl: '/' });
    }
  }, [router]);

  return <div />;
}
