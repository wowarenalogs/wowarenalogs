import { CombatResult } from '@wowarenalogs/parser';
import { useAuth } from '@wowarenalogs/shared';
import { useClientContext } from '@wowarenalogs/shared';

import { LoginButton } from '../components/Login/LoginButton';
import { LogoutButton } from '../components/Login/LogoutButton';

const Page = () => {
  const auth = useAuth();

  return (
    <div className="mt-8 text-base-content">
      <div className="flex flex-row justify-between">
        <div className="flex flex-col">
          <div>Logged in as: {auth.isLoadingAuthData ? 'loading' : auth.battleTag || 'not-logged-in'}</div>
        </div>
        <div className="flex flex-col">
          <LoginButton />
          <LogoutButton />
        </div>
      </div>
    </div>
  );
};

export default Page;
