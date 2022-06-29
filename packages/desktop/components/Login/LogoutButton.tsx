import { Button } from '@wowarenalogs/shared/src';
import { signOut } from 'next-auth/client';
import React from 'react';

export const LogoutButton = () => {
  return (
    <Button
      onClick={() => {
        signOut();
      }}
    >
      {/* {t('login-modal-login-with-battle-net')} */}
      Logout
    </Button>
  );
};
