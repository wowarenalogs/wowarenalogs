import { Button } from '@wowarenalogs/shared';
import { signIn, getCsrfToken, getProviders, ClientSafeProvider } from 'next-auth/client';
import Image from 'next/image';

// Based on https://github.com/ndom91/next-auth-example-sign-in-page/blob/main/src/pages/auth/signin.js
const Login = ({ csrfToken, providers }: { csrfToken: string; providers: Record<string, ClientSafeProvider> }) => {
  return (
    <div className="text-white">
      <Image src="https://images.wowarenalogs.com/common/Blizzard.png" width={341} height={200} />
      <input name="csrfToken" type="hidden" defaultValue={csrfToken} />
      {providers &&
        Object.values(providers).map((provider) => (
          <div key={provider.name} className="mb-4">
            <Button onClick={() => signIn(provider.id, { callbackUrl: '/' })}>Sign in with {provider.name}</Button>
          </div>
        ))}
    </div>
  );
};

export default Login;

export async function getServerSideProps(context: any) {
  const providers = await getProviders();
  const csrfToken = await getCsrfToken(context);
  return {
    props: {
      providers,
      csrfToken,
    },
  };
}