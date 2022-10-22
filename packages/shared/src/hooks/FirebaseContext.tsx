import { Analytics, getAnalytics } from 'firebase/analytics';
import * as firebase from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';

const firebaseConfig = {
  apiKey: 'AIzaSyCbYe2aBbtYAYPobMQnybqh8M30_Ukv11k',
  authDomain: 'wowarenalogs-firebase.firebaseapp.com',
  projectId: 'wowarenalogs-firebase',
  storageBucket: 'wowarenalogs-firebase.appspot.com',
  messagingSenderId: '1079533763886',
  appId: '1:1079533763886:web:3c926f6c54fe027a720ebf',
  measurementId: 'G-S48YBHQXFJ',
};

const app = firebase.getApps().length ? firebase.getApp() : firebase.initializeApp(firebaseConfig);
const auth = getAuth(app);

const FirebaseContext = createContext<{
  app: firebase.FirebaseApp;
  auth: Auth;
  analytics: Analytics | null;
}>({
  app,
  auth,
  analytics: null,
});

const FirebaseContextProvider = (props: PropsWithChildren<{}>) => {
  const { children } = props;
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  useEffect(() => {
    setAnalytics(getAnalytics(app));
  }, []);

  return (
    <FirebaseContext.Provider
      value={{
        app,
        auth,
        analytics,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export default FirebaseContextProvider;

export const useFirebaseContext = () => {
  const context = useContext(FirebaseContext);
  return context;
};
