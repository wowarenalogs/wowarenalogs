import { Button, useAuth } from '@wowarenalogs/shared';
import React from 'react';

export const LoginButton = () => {
  const auth = useAuth();
  return (
    <Button
      onClick={async () => {
        auth.signIn();
      }}
    >
      Login with Battle.net
    </Button>
  );
};
