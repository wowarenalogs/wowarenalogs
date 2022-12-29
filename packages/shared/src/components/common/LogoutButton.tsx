import { useAuth } from '@wowarenalogs/shared';
import React from 'react';

export const LogoutButton = () => {
  const auth = useAuth();
  return (
    <button
      className="btn btn-sm btn-error"
      onClick={async () => {
        auth.signOut();
      }}
    >
      Logout
    </button>
  );
};
