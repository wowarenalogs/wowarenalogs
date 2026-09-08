import { TbLogin } from 'react-icons/tb';

import { useAuth } from '../../hooks/AuthContext';

interface IProps {
  message: string;
}

/** Shown wherever a feature needs a Battle.net account: search and raw log viewing. */
export function SignInRequired({ message }: IProps) {
  const auth = useAuth();
  return (
    <div className="alert alert-info shadow-lg animate-fadein">
      <TbLogin size={24} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button className="btn btn-primary btn-sm" onClick={() => auth.signIn()}>
        Sign in
      </button>
    </div>
  );
}
