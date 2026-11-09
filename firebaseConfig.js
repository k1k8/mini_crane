import { initializeApp } from
  "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";

import { getAuth } from
  "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

import { getFirestore } from
  "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCmPZVmiZ5KIIMdbPGCvQ0xhjp2tJdSdSU",
  authDomain: "mini-crane.firebaseapp.com",
  projectId: "mini-crane",
  storageBucket: "mini-crane.firebasestorage.app",
  messagingSenderId: "971084297707",
  appId: "1:971084297707:web:d1559500da50e3f3a615ae",
  measurementId: "G-9NFWQYLE1K"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

