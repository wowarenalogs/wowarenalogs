import { Button, useClientContext } from '@wowarenalogs/shared';
import { signOut } from 'next-auth/client';
import React from 'react';

export const LogoutButton = () => {
  const clientContext = useClientContext();
  return (
    <Button
      onClick={async () => {
        await clientContext.saveWindowPosition();
        signOut();
      }}
    >
      {/* {t('login-modal-login-with-battle-net')} */}
      Logout
    </Button>
  );
};
