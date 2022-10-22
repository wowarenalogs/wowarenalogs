// Import the functions you need from the SDKs you need
import { getAnalytics } from 'firebase/analytics';
import { initializeApp } from 'firebase/app';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: 'AIzaSyCbYe2aBbtYAYPobMQnybqh8M30_Ukv11k',
  authDomain: 'wowarenalogs-firebase.firebaseapp.com',
  projectId: 'wowarenalogs-firebase',
  storageBucket: 'wowarenalogs-firebase.appspot.com',
  messagingSenderId: '1079533763886',
  appId: '1:1079533763886:web:3c926f6c54fe027a720ebf',
  measurementId: 'G-S48YBHQXFJ',
};

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAnalytics = getAnalytics(firebaseApp);
