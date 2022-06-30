import { Button, useClientContext } from '@wowarenalogs/shared';
import { signOut } from 'next-auth/client';
import React from 'react';

// TODO: translate logout text

export const LogoutButton = () => {
  const clientContext = useClientContext();
  return (
    <Button
      onClick={async () => {
        await clientContext.saveWindowPosition();
        signOut();
      }}
    >
      Logout
    </Button>
  );
};
