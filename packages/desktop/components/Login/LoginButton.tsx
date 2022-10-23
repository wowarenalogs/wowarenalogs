import { Button, useClientContext } from '@wowarenalogs/shared';
import React from 'react';

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
      Login with Battle.net
    </Button>
  );
};
