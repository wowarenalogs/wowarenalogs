import { LoadingScreen, useAuth } from '@wowarenalogs/shared';
import { useRouter } from 'next/router';

import { LogoutButton } from '../common/LogoutButton';

export const ProfilePage = (props: { onLogout: () => void }) => {
  const auth = useAuth();
  const router = useRouter();

  if (auth.isLoadingAuthData) {
    return <LoadingScreen />;
  }

  if (!auth.isAuthenticated) {
    router.push('/');
    return null;
  }

  return (
    <div className="flex flex-col m-2">
      <div className="text-2xl font-bold mb-2">{auth.battleTag}</div>
      <div className="flex flex-row">
        <LogoutButton onLogout={props.onLogout} />
      </div>
    </div>
  );
};
