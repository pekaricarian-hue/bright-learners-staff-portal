import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCh-lUXF-EwW4G-925HH8laBJnfDjkCewY",
  authDomain: "bright-learners-academy-app.firebaseapp.com",
  projectId: "bright-learners-academy-app",
  storageBucket: "bright-learners-academy-app.firebasestorage.app",
  messagingSenderId: "533362610484",
  appId: "1:533362610484:web:a7b6fdaba34d743e8c9561",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
