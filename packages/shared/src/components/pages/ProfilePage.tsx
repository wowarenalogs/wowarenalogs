import { LoadingScreen, useAuth } from '@wowarenalogs/shared';

import { LogoutButton } from '../common/LogoutButton';

export const ProfilePage = () => {
  const auth = useAuth();

  if (auth.isLoadingAuthData) {
    return <LoadingScreen />;
  }

  if (!auth.isAuthenticated) {
    // the profile page should only be visible to authenticated users
    return null;
  }

  return (
    <div className="flex flex-col m-2">
      <div className="text-2xl font-bold mb-2">{auth.battleTag}</div>
      <div className="flex flex-row">
        <LogoutButton />
      </div>
    </div>
  );
};
