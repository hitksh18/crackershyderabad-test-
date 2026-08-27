import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDaXvxLzEeFriQHIYghHIafmFsN4zDUkkc',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'standard-crackers-store.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'standard-crackers-store',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'standard-crackers-store.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '135905252789',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:135905252789:web:3a3fbf40606a58329f35fc',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
