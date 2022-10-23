import { Button } from '@wowarenalogs/shared';
import Image from 'next/image';
import { ClientSafeProvider, getCsrfToken, getProviders, signIn } from 'next-auth/react';

// TODO: see https://hsreplay.net/account/login/?next=%2F
// I believe bnet now routes all logins through the -us tenant for US/EU/APAC
// only CN is different

// TODO: translate explainers

// Based on https://github.com/ndom91/next-auth-example-sign-in-page/blob/main/src/pages/auth/signin.js
const Login = ({ csrfToken, providers }: { csrfToken: string; providers: Record<string, ClientSafeProvider> }) => {
  return (
    <div className="text-white">
      <Image src="https://images.wowarenalogs.com/common/Blizzard.png" width={341} height={200} />
      <input name="csrfToken" type="hidden" defaultValue={csrfToken} />
      <div>
        We&apos;ll send you to the official Blizzard site where you can securely sign in. Blizzard will redirect you
        back here once you&apos;re done.
      </div>
      {providers &&
        Object.values(providers).map((provider) => (
          <div key={provider.name} className="mb-4">
            <Button onClick={() => signIn(provider.id, { callbackUrl: '/' })}>Sign in with {provider.name}</Button>
          </div>
        ))}
      <div>WoWArenaLogs never gains access to your Blizzard email address or password.</div>
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
