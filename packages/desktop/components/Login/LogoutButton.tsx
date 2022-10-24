import { Button, useAuth } from '@wowarenalogs/shared';
import React from 'react';

// TODO: translate logout text

export const LogoutButton = () => {
  const auth = useAuth();
  return (
    <Button
      onClick={async () => {
        auth.signOut();
      }}
    >
      Logout
    </Button>
  );
};
