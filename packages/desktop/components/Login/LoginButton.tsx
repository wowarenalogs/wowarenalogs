import { Button, useClientContext } from '@wowarenalogs/shared';
import React from 'react';

export const LoginButton = () => {
  const clientContext = useClientContext();
  return (
    <Button
      onClick={async () => {
        await clientContext.saveWindowPosition();
        window.wowarenalogs.bnet?.onLoggedIn(() => {
          window.location.reload();
        });
        window.wowarenalogs.bnet?.login(`http://localhost:3000/login`, 'login-modal-login-with-battle-net');
      }}
    >
      {/* {t('login-modal-login-with-battle-net')} */}
      Login with Battle.net
    </Button>
  );
};
