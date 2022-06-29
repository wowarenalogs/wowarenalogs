import { Button } from '@wowarenalogs/shared';
import React from 'react';

export const LoginButton = () => {
  const region = 'us'; // TODO: resolve region
  return (
    <Button
      onClick={() => {
        window.wowarenalogs.bnet.onLoggedIn &&
          window.wowarenalogs.bnet.onLoggedIn(() => {
            window.location.reload();
          });
        window.wowarenalogs.bnet.login &&
          window.wowarenalogs.bnet.login(`http://localhost:3000/login/`, 'login-modal-login-with-battle-net');
      }}
    >
      {/* {t('login-modal-login-with-battle-net')} */}
      Login with Battle.net
    </Button>
  );
};
