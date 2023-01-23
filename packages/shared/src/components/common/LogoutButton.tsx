import { useAuth } from '@wowarenalogs/shared';
import React from 'react';

export const LogoutButton = (props: { onLogout?: () => Promise<void> }) => {
  const auth = useAuth();
  return (
    <button
      className="btn btn-sm btn-error"
      onClick={async () => {
        if (props.onLogout) {
          await props.onLogout();
        }
        await auth.signOut();
      }}
    >
      Logout
    </button>
  );
};
