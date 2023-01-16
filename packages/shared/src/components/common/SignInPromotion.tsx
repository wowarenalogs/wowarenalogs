import { useAuth } from '../../hooks/AuthContext';

export const SignInPromotion = () => {
  const { signIn } = useAuth();
  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div className="hero">
        <div className="hero-content text-center flex flex-col pb-16">
          <h1 className="text-5xl font-bold">Saving your matches</h1>
          <p className="py-6">Signing in will allow WoW Arena Logs to save your match history.</p>
          <button
            className="btn btn-primary btn-wide"
            onClick={() => {
              signIn();
            }}
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
};
