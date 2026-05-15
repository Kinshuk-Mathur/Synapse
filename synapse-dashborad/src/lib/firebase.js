import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, GoogleAuthProvider, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export const missingFirebaseConfigKeys = Object.entries(firebaseEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const hasFirebaseConfig = missingFirebaseConfigKeys.length === 0;

const firebaseConfig = {
  apiKey: firebaseEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: firebaseEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: firebaseEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: firebaseEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: firebaseEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: firebaseEnv.NEXT_PUBLIC_FIREBASE_APP_ID
};

function createFirebaseServices() {
  if (!hasFirebaseConfig) {
    return {
      app: null,
      auth: null,
      db: null,
      googleProvider: null
    };
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const googleProvider = new GoogleAuthProvider();

  googleProvider.setCustomParameters({
    prompt: "select_account"
  });

  return {
    app,
    auth,
    db,
    googleProvider
  };
}

const services = createFirebaseServices();

export const firebaseApp = services.app;
export const auth = services.auth;
export const db = services.db;
export const googleProvider = services.googleProvider;

export function assertFirebaseConfig() {
  if (!hasFirebaseConfig) {
    throw new Error(
      `Firebase is missing these Netlify environment variables: ${missingFirebaseConfigKeys.join(", ")}`
    );
  }
}

export function getFirebaseAuth() {
  assertFirebaseConfig();
  return auth;
}

export function getFirebaseDb() {
  assertFirebaseConfig();
  return db;
}

export function getGoogleProvider() {
  assertFirebaseConfig();
  return googleProvider;
}

export const enableAuthPersistence = () => setPersistence(getFirebaseAuth(), browserLocalPersistence);
