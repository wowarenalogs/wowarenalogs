import { GetServerSideProps } from 'next';
import Image from 'next/image';
import { getCsrfToken, signIn } from 'next-auth/react';
import { useEffect } from 'react';

const Login = ({ csrfToken }: { csrfToken: string }) => {
  useEffect(() => {
    signIn('battlenet', { callbackUrl: '/' });
  });
  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center text-white bg-black">
      <Image alt="Blizzard" src="https://images.wowarenalogs.com/common/Blizzard.png" width={341} height={200} />
      <input name="csrfToken" type="hidden" defaultValue={csrfToken} />
      <div>Redirecting to Battle.net...</div>
    </div>
  );
};

export default Login;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const csrfToken = await getCsrfToken(context);
  return {
    props: {
      csrfToken,
    },
  };
};
