'use client';

import Image from 'next/image';
import { signIn } from 'next-auth/react';
import { useEffect } from 'react';

export default function LoginPage() {
  useEffect(() => {
    signIn('battlenet', { callbackUrl: '/' });
  });

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center text-white bg-black">
      <Image alt="Blizzard" src="https://images.wowarenalogs.com/common/Blizzard.png" width={341} height={200} />
      <div>Redirecting to Battle.net...</div>
    </div>
  );
}
