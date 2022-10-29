import { useAuth } from '@wowarenalogs/shared';
import React from 'react';

// TODO: translate logout text

export const LogoutButton = () => {
  const auth = useAuth();
  return (
    <button
      className="btn"
      onClick={async () => {
        auth.signOut();
      }}
    >
      Logout
    </button>
  );
};
