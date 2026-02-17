import { useAuth } from '@wowarenalogs/shared';
import React from 'react';

export const LoginButton = () => {
  const auth = useAuth();
  return (
    <button
      className="btn"
      onClick={async () => {
        auth.signIn();
      }}
    >
      Login with Battle.net
    </button>
  );
};
