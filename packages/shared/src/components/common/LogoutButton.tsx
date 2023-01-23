import { useAuth } from '@wowarenalogs/shared';
import React from 'react';

export const LogoutButton = (props: { onLogout: () => void }) => {
  const auth = useAuth();
  return (
    <button
      className="btn btn-sm btn-error"
      onClick={async () => {
        props.onLogout();
        auth.signOut();
      }}
    >
      Logout
    </button>
  );
};
