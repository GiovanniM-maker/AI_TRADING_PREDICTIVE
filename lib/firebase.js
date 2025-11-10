import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCsORO_Log4r_HaGCgB8wpPa4PGK08ZQq8",
  authDomain: "ai-trading-predictive.firebaseapp.com",
  projectId: "ai-trading-predictive",
  storageBucket: "ai-trading-predictive.firebasestorage.app",
  messagingSenderId: "125416287819",
  appId: "1:125416287819:web:447a6b79476184f4e8a7ce",
  measurementId: "G-V898LBWDVT",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

