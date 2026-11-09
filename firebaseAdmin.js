
import { auth, db } from "./firebaseConfig.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

import {
  doc,
  onSnapshot,
  setDoc
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const settingsRef = doc(db, "settings", "main");

// Firebaseの管理者アカウントでログイン
export async function loginMiniCraneAdmin(email, password) {
  const result = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  return result.user;
}

// ログアウト
export async function logoutMiniCraneAdmin() {
  await signOut(auth);
}

// ログイン状態を監視
export function watchAdminLogin(callback) {
  return onAuthStateChanged(auth, callback);
}

// 共通のゲーム設定を読み込む
export function watchSharedSettings(onChange, onError) {
  return onSnapshot(settingsRef, snapshot => {
    const data = snapshot.data() || {};

    onChange({
      maxPlays: data.maxPlays ?? 5,
      holdPercent: data.holdPercent ?? 35,
      armSpeed: data.armSpeed ?? 1
    });
  }, onError);
}

// 管理者だけが共通設定を保存
export async function saveSharedSettings(settings) {
  await setDoc(settingsRef, {
    maxPlays: Number(settings.maxPlays),
    holdPercent: Number(settings.holdPercent),
    armSpeed: Number(settings.armSpeed)
  });
}

