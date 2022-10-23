import { Button, useClientContext } from '@wowarenalogs/shared';
import React from 'react';

// TODO: translate login text

export const LoginButton = () => {
  const clientContext = useClientContext();
  return (
    <Button
      onClick={async () => {
        await clientContext.saveWindowPosition();
        clientContext.showLoginModalInSeparateWindow('/login', () => {
          window.location.reload();
        });
      }}
    >
      {/* {t('login-modal-login-with-battle-net')} */}
      Login with Battle.net
    </Button>
  );
};
