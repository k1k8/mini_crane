/* MINI CRANE — 追加機能専用モジュール
   初回操作ガイド／判定表示／獲得数／残り回数／効果音・音量
   main.js から最新の状態を取得するため、ゲーム本体に依存したグローバル変数は使いません。
*/
export function createMiniCraneFeatures({
  THREE, machine, getPrizes, getTips, checkGrip,
getPlayCount, getWinCount, maxPlays,
getMaxPlays = () => maxPlays,
capsuleRadius = 0.42
}) {
  const OPTIONS_KEY = "mini_crane_extra_settings_v3";
  const GUIDE_KEY = "mini_crane_guide_seen_v3";
  const getSaved = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const putSaved = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  let options = {};
  try { options = JSON.parse(getSaved(OPTIONS_KEY) || "{}") || {}; } catch {}
  let soundEnabled = options.sound !== false;
  let volume = Number.isFinite(options.volume) ? Math.max(0, Math.min(100, options.volume)) : 40;
  let debugEnabled = !!options.debug;
  let guideOpen = false;
  const saveOptions = () => putSaved(OPTIONS_KEY, JSON.stringify({ sound: soundEnabled, volume, debug: debugEnabled }));

  // HTML・CSSはこのファイルが追加。index.html / style.css の変更は不要。
  const css = document.createElement("style");
  css.textContent = `
    [hidden]{display:none!important}
    .mini-extra-count{display:flex!important;flex-direction:column;align-items:center;gap:0!important;
      min-width:68px;padding:6px 9px!important;background:#fff!important;border:2px solid #fff!important;
      border-radius:14px!important;font-weight:900}
    .mini-extra-count strong{font-size:clamp(22px,3vw,32px)!important;line-height:1.08;font-variant-numeric:tabular-nums}
    .mini-extra-rest strong{color:#d94b91!important}.mini-extra-wins strong{color:#2389b4!important}
    .mini-extra-tools{display:flex;gap:5px}.mini-extra-tool{border:1px solid #fff;border-radius:11px;
      background:#fff;color:#754e91;font-size:19px;font-weight:900;min-width:35px;min-height:35px;cursor:pointer}
    .mini-extra-panel{position:fixed;right:12px;top:80px;z-index:31;width:min(288px,calc(100vw - 24px));
      border-radius:17px;padding:16px;color:#533a66;background:#fff9ff;border:2px solid white;
      box-shadow:0 12px 30px #271a4655;font-size:13px}
    .mini-extra-panel h3{margin:0 0 10px;font-size:16px}
    .mini-extra-panel label{display:flex;align-items:center;justify-content:space-between;gap:10px;
      margin:13px 0;font-weight:800;cursor:pointer}
    .mini-extra-panel input[type=range]{width:125px;accent-color:#c16cbd}
    .mini-extra-panel input[type=checkbox]{width:18px;height:18px;accent-color:#c16cbd}
    .mini-extra-panel small{line-height:1.6;color:#85688e}
    .mini-extra-overlay{position:fixed;inset:0;z-index:50;display:flex;align-items:center;
      justify-content:center;padding:18px;background:#1a102bc9;backdrop-filter:blur(6px)}
    .mini-extra-dialog{width:min(440px,100%);border-radius:22px;padding:21px;background:#fff9ff;
      border:2px solid white;color:#533568;text-align:center;box-shadow:0 15px 35px #23133766}
    .mini-extra-dialog h2{font-size:23px;margin:4px 0 8px}
    .mini-extra-step{padding:10px;margin:9px 0;text-align:left;border-radius:12px;
      background:#f4e7f8;line-height:1.7;font-size:13px}
    .mini-extra-step b{color:#b83c88}
    .mini-extra-start{background:#b966bd;color:white;padding:12px;border:0;
      border-radius:13px;width:100%;font-weight:900;font-size:16px;margin-top:10px;cursor:pointer}
    .mini-extra-debug-label{position:fixed;z-index:12;left:12px;top:115px;
      padding:8px;border-radius:9px;background:#182437df;color:white;font-size:12px;pointer-events:none}
    @media(max-width:640px){
      .top-bar{gap:4px!important;inset-inline:7px!important}
      .top-bar .brand{font-size:11px!important;letter-spacing:.04em!important}
      .top-bar .brand-star{display:none}
      .top-actions{gap:3px!important}
      .mini-extra-count{min-width:48px;padding:4px!important;font-size:10px!important}
      .mini-extra-count strong{font-size:20px!important}
      .mini-extra-tools{gap:2px}
      .mini-extra-tool{min-width:28px;min-height:30px;font-size:15px;padding:2px 5px}
      .top-bar .small-button{padding:6px!important;font-size:10px!important}
    }
  `;
  document.head.append(css);
  const actions = document.querySelector(".top-actions");
  const remainingEl = document.getElementById("remaining-plays");
  const wonEl = document.getElementById("score");
  const statusEl = document.getElementById("status");
  if (!actions || !remainingEl || !wonEl || !statusEl) {
    throw new Error("MINI CRANEのUIが見つかりません。index.htmlを確認してください");
  }
  remainingEl.closest(".score")?.classList.add("mini-extra-count", "mini-extra-rest");
  wonEl.closest(".score")?.classList.add("mini-extra-count", "mini-extra-wins");
  const tools = document.createElement("div");
  tools.className = "mini-extra-tools";
  tools.innerHTML = `<button type="button" class="mini-extra-tool" id="mini-help" title="遊び方">?</button>
    <button type="button" class="mini-extra-tool" id="mini-settings" title="設定" aria-expanded="false">⚙</button>`;
  actions.append(tools);

  const panel = document.createElement("section");
  panel.className = "mini-extra-panel";
  panel.hidden = true;
  panel.innerHTML = `<h3>⚙ MINI CRANE 設定</h3>
    <label>効果音 <input id="mini-sound" type="checkbox"></label>
    <label>音量 <input id="mini-volume" type="range" min="0" max="100" step="1"> <output id="mini-volume-label"></output></label>
    <label>つかみ判定表示 <input id="mini-debug" type="checkbox"></label>
    <small>水色＝3本の爪先／緑＝現在の姿勢でつかめる／黄色＝判定外。<br>開いた状態では黄色が普通です。</small>`;
  document.body.append(panel);
  const soundBox = panel.querySelector("#mini-sound");
  const slider = panel.querySelector("#mini-volume");
  const volumeLabel = panel.querySelector("#mini-volume-label");
  const debugBox = panel.querySelector("#mini-debug");
  soundBox.checked = soundEnabled;
  debugBox.checked = debugEnabled;
  slider.value = String(volume);
  volumeLabel.value = `${volume}%`;
  const gear = tools.querySelector("#mini-settings");
  const closePanel = () => { panel.hidden = true; gear.setAttribute("aria-expanded", "false"); };
  gear.addEventListener("click", () => {
    if (guideOpen) return;
    panel.hidden = !panel.hidden;
    gear.setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.addEventListener("pointerdown", e => {
    if (!panel.hidden && !panel.contains(e.target) && !gear.contains(e.target)) closePanel();
  });

  // 初回だけガイドを開く。？ボタンから何度でも再表示できる。
  const overlay = document.createElement("div");
  overlay.className = "mini-extra-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `<div class="mini-extra-dialog">
    <h2>🎮 MINI CRANE の遊び方</h2>
    <div class="mini-extra-step"><b>① 横：</b>長押しで右へ移動。離したら横位置が確定。</div>
    <div class="mini-extra-step"><b>② 縦：</b>長押しで奥へ移動。離すと自動下降。</div>
    <div class="mini-extra-step"><b>③ キャッチ：</b>下降したら爪が閉じ、カプセルを獲得口へ運ぶ。</div>
    <div class="mini-extra-step"><b>🎁 結果：</b>1人${getMaxPlays()}回。カプセルの等級はプレイ終了後に発表。</div>
    <p style="font-size:12px">移動・下降中は爪が開いたまま。落とした後も開いたまま。</p>
    <button type="button" class="mini-extra-start" id="mini-begin">ゲームを始める</button>
    </div>`;
  document.body.append(overlay);
  const beginButton = overlay.querySelector("#mini-begin");
  function openGuide() {
    closePanel();
    guideOpen = true;
    overlay.hidden = false;
    beginButton.focus({ preventScroll: true });
  }
  function closeGuide() {
    guideOpen = false;
    overlay.hidden = true;
    putSaved(GUIDE_KEY, "1");
    startAudio();
    document.getElementById("horizontal-button")?.focus({ preventScroll: true });
  }
  tools.querySelector("#mini-help").addEventListener("click", openGuide);
  beginButton.addEventListener("click", closeGuide);
  // ガイド表示中にキーボードの1・2・Rでクレーンが動くのを防ぐ。
  document.addEventListener("keydown", e => {
    if (guideOpen && ["Digit1", "Numpad1", "Digit2", "Numpad2", "KeyR"].includes(e.code)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  if (!getSaved(GUIDE_KEY) && getPlayCount() === 0) openGuide();

  // 外部の音声ファイルを使わない電子効果音。
  let audio = null, master = null, motor = null;
  function startAudio() {
    if (!soundEnabled) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      if (!audio) {
        audio = new Context();
        master = audio.createGain();
        master.connect(audio.destination);
      }
      master.gain.value = soundEnabled ? volume / 100 : 0;
      if (audio.state === "suspended") audio.resume().catch(() => {});
    } catch (e) { console.warn("音声を開始できません:", e); }
  }
  document.addEventListener("pointerdown", startAudio, true);
  document.addEventListener("keydown", startAudio, true);
  soundBox.addEventListener("change", () => {
    soundEnabled = soundBox.checked;
    if (soundEnabled) startAudio(); else stopMotor();
    if (master) master.gain.value = soundEnabled ? volume / 100 : 0;
    saveOptions();
  });
  slider.addEventListener("input", () => {
    volume = Number(slider.value);
    volumeLabel.value = `${volume}%`;
    if (master) master.gain.value = soundEnabled ? volume / 100 : 0;
    saveOptions();
  });
  function tone(freq, length = .14, delay = 0, type = "sine", target = freq) {
    if (!soundEnabled || !audio || audio.state !== "running" || volume === 0) return;
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, target), t + length);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(.16, t + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, t + length);
    osc.connect(gain); gain.connect(master);
    osc.start(t); osc.stop(t + length + .02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  function play(name) {
    if (name === "start") tone(520, .09);
    else if (name === "grab") { tone(460, .13, 0, "triangle", 310); tone(670, .12, .13); }
    else if (name === "miss") tone(240, .24, 0, "triangle", 160);
    else if (name === "slip") tone(430, .28, 0, "triangle", 175);
    else if (name === "drop") tone(350, .16, 0, "triangle", 220);
    else if (name === "win") [523,659,784,1047].forEach((f,i) => tone(f,.24,i*.12));
    else if (name === "finish") { tone(490,.18); tone(660,.25,.2); }
    else if (name === "open") { tone(760,.1); tone(1100,.2,.11); }
  }
  document.getElementById("reveal-capsule")?.addEventListener("click", () => play("open"));
  let lastStatus = statusEl.textContent;
  new MutationObserver(() => {
    const s = statusEl.textContent;
    if (s === lastStatus) return;
    lastStatus = s;
    if (s.includes("GET!")) play("win");
    else if (s.includes("つかめた")) play("grab");
    else if (s.includes("惜しい")) play("miss");
    else if (s.includes("落ちちゃった")) play("slip");
    else if (s.includes("落としています")) play("drop");
    else if (/\d+回(終了|のプレイが終了)/.test(s)) play("finish");
    else if (s.includes("開いています")) play("start");
  }).observe(statusEl, { childList: true, characterData: true, subtree: true });
  function startMotor() {
    if (!soundEnabled || !audio || audio.state !== "running" || motor) return;
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = "sawtooth"; osc.frequency.value = 78;
    gain.gain.value = .012;
    osc.connect(gain); gain.connect(master);
    osc.start(); motor = { osc, gain };
  }
  function stopMotor() {
    if (!motor || !audio) return;
    const { osc, gain } = motor;
    motor = null;
    gain.gain.setTargetAtTime(.0001, audio.currentTime, .03);
    osc.stop(audio.currentTime + .16);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  window.addEventListener("blur", stopMotor);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopMotor(); });

  // 開発者向けマーカー。GLBが非同期で差し替わってもgetTips()が最新情報を返す。
  const layer = new THREE.Group();
  layer.visible = debugEnabled;
  machine.add(layer);
  const points = Array.from({ length: 3 }, () => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(.075, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x18dcff, depthTest: false })
    );
    mesh.renderOrder = 100;
    layer.add(mesh);
    return mesh;
  });
  const ringGeometry = new THREE.RingGeometry(capsuleRadius + .03, capsuleRadius + .07, 32);
  ringGeometry.rotateX(-Math.PI / 2);
  const halos = Array.from({ length: 6 }, () => {
    const mesh = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({ color: 0xffc03c, side: THREE.DoubleSide, depthTest: false })
    );
    mesh.renderOrder = 99;
    layer.add(mesh);
    return mesh;
  });
  const label = document.createElement("div");
  label.className = "mini-extra-debug-label";
  label.hidden = !debugEnabled;
  document.body.append(label);
  debugBox.addEventListener("change", () => {
    debugEnabled = debugBox.checked;
    layer.visible = debugEnabled;
    label.hidden = !debugEnabled;
    saveOptions();
  });
  let lastDebug = 0;
  function refreshDebug(delta) {
    if (!debugEnabled) return;
    lastDebug += delta;
    if (lastDebug < .11) return;
    lastDebug = 0;
    const tips = getTips();
    const valid = Array.isArray(tips) && tips.length === 3 && tips.every(t =>
      Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.z));
    points.forEach((mesh, i) => {
      mesh.visible = valid;
      if (valid) mesh.position.copy(tips[i]);
    });
    let count = 0;
    getPrizes().slice(0,6).forEach((prize, i) => {
      const halo = halos[i];
      halo.visible = prize.state === "floor";
      if (!halo.visible) return;
      halo.position.set(prize.group.position.x, prize.group.position.y - capsuleRadius + .08,
        prize.group.position.z);
      const ok = checkGrip(prize, valid ? tips : null);
      halo.material.color.setHex(ok ? 0x35e37f : 0xffc03c);
      if (ok) count++;
    });
    label.textContent = valid ? `判定表示ON：${count}個つかめる位置` : "判定表示ON：GLBの爪先情報を待っています";
  }
  function update(delta, moving) {
    remainingEl.textContent = String(Math.max(0, getMaxPlays() - getPlayCount()));
    wonEl.textContent = String(getWinCount());
    if (moving && !guideOpen && !document.hidden) startMotor();
    else stopMotor();
    refreshDebug(delta);
  }
  update(0, false);
  return { update, isGuideOpen: () => guideOpen };
}


/**
 * MINI CRANE：視点切替UI（左側固定）
 * ON  = 横操作は正面／縦操作は側面へ自動で切り替える。
 * OFF = 正面・側面を手動で選択し、ゲームのリセット後も維持。
 * THREEやクレーンの実装に依存しないので、miniFeatures.js内で独立して管理できる。
 */
export function createCameraViewControls({ getView, setView, getAutoView }) {
  const KEY = "mini_crane_camera_view_v1";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }
  catch { /* プライベートモード等では保存しない */ }

  let automatic = saved.automatic !== false; // 初期値ON
let manualView = [
  "front",
  "diagonal",
  "side"
].includes(saved.manualView)
  ? saved.manualView
  : "front";

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ automatic, manualView })); }
    catch { /* 保存できなくてもプレイは可能 */ }
  };

  const style = document.createElement("style");
  style.textContent = `
    .crane-camera-panel {
      position:fixed;left:14px;top:48%;transform:translateY(-50%);z-index:9;
      box-sizing:border-box;width:174px;padding:12px 11px;border-radius:17px;
      border:1px solid #fff;background:rgba(255,249,255,.94);
      color:#674783;box-shadow:0 8px 25px #70528533;
      backdrop-filter:blur(10px);font-size:12px;font-weight:800
    }
    .crane-camera-title {font-size:14px;text-align:center;margin-bottom:8px}
    .crane-camera-buttons {display:flex;gap:5px}
    .crane-camera-buttons button {
      flex:1;min-width:0;border-radius:9px;padding:8px 4px;cursor:pointer;
      background:white;border:1px solid #dcbde9;color:#74578b;
      font-size:12px;font-weight:900
    }
    .crane-camera-buttons button[aria-pressed="true"] {
      background:#b76dbe;color:white;border-color:#b76dbe
    }
    .crane-camera-manual {margin-top:10px;padding-top:10px;border-top:1px solid #e8d4eb}
    .crane-camera-manual[hidden] {display:none!important}
    .crane-camera-status {margin-top:7px;text-align:center;font-size:10px;color:#87659c}
    @media(max-width:640px) {
      .crane-camera-panel {left:7px;top:48%;width:136px;padding:9px 7px;border-radius:13px}
      .crane-camera-title {font-size:12px;margin-bottom:6px}
      .crane-camera-buttons {gap:3px}
      .crane-camera-buttons button {padding:7px 2px;font-size:11px}
      .crane-camera-manual {margin-top:7px;padding-top:7px}
    }
  `;
  document.head.append(style);

  const panel = document.createElement("section");
  panel.className = "crane-camera-panel";
  panel.setAttribute("aria-label", "視点切り替え設定");
  panel.innerHTML = `
    <div class="crane-camera-title">🎥 視点切り替え</div>
    <div class="crane-camera-buttons" role="group" aria-label="自動視点切替">
      <button type="button" id="crane-auto-on">ON</button>
      <button type="button" id="crane-auto-off">OFF</button>
    </div>
    <div class="crane-camera-manual" id="crane-manual-view" hidden>
      <div class="crane-camera-buttons" role="group" aria-label="手動視点">
        <button type="button" id="crane-front-view">正面</button>
        <button type="button" id="crane-diagonal-view">斜め</button>
        <button type="button" id="crane-side-view">側面</button>
      </div>
    </div>
    <div class="crane-camera-status" id="crane-camera-status" aria-live="polite"></div>
  `;
  document.body.append(panel);

  const onButton = panel.querySelector("#crane-auto-on");
  const offButton = panel.querySelector("#crane-auto-off");
  const manualBox = panel.querySelector("#crane-manual-view");
  const frontButton = panel.querySelector("#crane-front-view");
  const diagonalButton =panel.querySelector("#crane-diagonal-view");
  const sideButton = panel.querySelector("#crane-side-view");
  const label = panel.querySelector("#crane-camera-status");

  let lastState = "";
  function refresh() {
    const view = getView();
    const state = `${automatic}-${manualView}-${view}`;
    if (state === lastState) return;
    lastState = state;
    onButton.setAttribute("aria-pressed", String(automatic));
    offButton.setAttribute("aria-pressed", String(!automatic));
    manualBox.hidden = automatic;
    frontButton.setAttribute("aria-pressed", String(manualView === "front"));
    diagonalButton.setAttribute("aria-pressed",String(manualView === "diagonal"));
    sideButton.setAttribute("aria-pressed", String(manualView === "side"));
    label.textContent =`${automatic ? "自動" : "手動"}・${view === "side" ? "側面" :view === "diagonal" ? "斜め" : "正面"}`;
  }

  onButton.addEventListener("click", () => {
    automatic = true;
    setView(getAutoView());
    save();
    refresh();
  });
  offButton.addEventListener("click", () => {
    if (automatic) manualView = getView(); // OFF時の視点を引き継ぐ
    automatic = false;
    setView(manualView);
    save();
    refresh();
  });
  
for (const [view, button] of [["front", frontButton],["diagonal", diagonalButton],["side", sideButton]]) {
    button.addEventListener("click", () => {
      if (automatic) return;
      manualView = view;
      setView(view);
      save();
      refresh();
    });
  }

  // ページ更新後に前回の手動視点を復元。
  if (!automatic) setView(manualView);
  refresh();

  return { isAuto: () => automatic, update: refresh };
}


/* ==============================================
   MINI CRANE 管理者機能
   miniFeatures.js 内で管理
============================================== */

const CRANE_ADMIN_KEY = "mini_crane_admin_settings_v1";
const CRANE_PASSWORD_KEY = "mini_crane_admin_password_v1";

// 保存された設定を取得
export function readMiniCraneAdminSettings() {
  let saved = {};

  try {
    saved = JSON.parse(
      localStorage.getItem(CRANE_ADMIN_KEY) || "{}"
    ) || {};
  } catch {}

  function clamp(value, fallback, min, max) {
    const n = Number(value);
    return Number.isFinite(n)
      ? Math.max(min, Math.min(max, n))
      : fallback;
  }

  return {
    maxPlays: Math.round(clamp(saved.maxPlays, 5, 1, 10)),
    holdPercent: clamp(saved.holdPercent, 35, 0, 100),
    armSpeed: clamp(saved.armSpeed, 1, 0.5, 1.5)
  };
}

// パスワードのハッシュを生成
async function cranePasswordHash(password, salt64) {
  if (!crypto.subtle) {
    throw new Error(
      "パスワード認証には localhost または HTTPS が必要です。"
    );
  }

  const salt = Uint8Array.from(
    atob(salt64), c => c.charCodeAt(0)
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt,
    iterations: 150000
  }, key, 256);

  return Array.from(
    new Uint8Array(bits),
    b => b.toString(16).padStart(2, "0")
  ).join("");
}

function craneReadPassword() {
  try {
    const record = JSON.parse(
      localStorage.getItem(CRANE_PASSWORD_KEY) || "null"
    );
    if (
      record &&
      typeof record.salt === "string" &&
      typeof record.hash === "string"
    ) return record;
  } catch {}
  return null;
}

export function createMiniCraneAdminSettings({
  getSettings,
  onSave,
  canManage,
  getPrizes,
  capsuleY,
  saveCapsules
}) {
  // 既存の歯車設定パネルに追加
  const settingsPanel =
    document.querySelector(".mini-extra-panel");

  if (!settingsPanel) {
    throw new Error("追加機能の設定パネルがありません");
  }

  const launch = document.createElement("button");
  launch.type = "button";
  launch.textContent = "🔒 管理者設定";
  launch.style.cssText = `
    width:100%;
    margin-top:15px;
    padding:11px;
    border:1px solid #bd80bc;
    border-radius:10px;
    background:#f4e4f6;
    color:#683e78;
    font-weight:800;
    cursor:pointer;
  `;
  settingsPanel.append(launch);

  const style = document.createElement("style");
  style.textContent = `
    .mini-admin-dialog {
      box-sizing:border-box;
      width:min(430px,calc(100vw - 30px));
      max-height:90vh;
      overflow:auto;
      border:2px solid white;
      border-radius:20px;
      padding:22px;
      background:#fffaff;
      color:#543866;
      box-shadow:0 15px 40px #25152c66;
      font:inherit;
    }
    .mini-admin-dialog::backdrop {
      background:#1c1028b9;
    }
    .mini-admin-dialog h2 {
      font-size:21px;
      margin:0 0 15px;
    }
    .mini-admin-dialog label {
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      margin:14px 0;
      font-size:13px;
      font-weight:800;
    }
    .mini-admin-dialog input {
      box-sizing:border-box;
      width:48%;
      min-width:0;
      padding:8px;
      border:1px solid #ceb3d2;
      border-radius:9px;
      font:inherit;
    }
    .mini-admin-dialog input[type=range] {
      accent-color:#ba67b5;
    }
    .mini-admin-dialog button {
      padding:10px 13px;
      border:1px solid #be83bf;
      border-radius:10px;
      background:white;
      color:#684478;
      font:inherit;
      font-weight:800;
      cursor:pointer;
    }
    .mini-admin-dialog .primary {
      background:#ae5bb4;
      color:white;
    }
    .mini-admin-dialog .actions {
      display:flex;
      flex-wrap:wrap;
      justify-content:flex-end;
      gap:8px;
      margin-top:18px;
    }
    .mini-admin-dialog .status {
      min-height:20px;
      font-size:13px;
      color:#a13f79;
    }
    .mini-admin-dialog [hidden] {
      display:none!important;
    }
  `;
  document.head.append(style);

  const dialog = document.createElement("dialog");
  dialog.className = "mini-admin-dialog";

  dialog.innerHTML = `
    <section id="crane-admin-auth">
      <h2 id="crane-admin-auth-title">🔒 管理者認証</h2>

      <form id="crane-admin-auth-form">
        <label>
          パスワード
          <input name="password" type="password" required>
        </label>

        <label id="crane-admin-confirm-row" hidden>
          パスワード確認
          <input name="confirm" type="password">
        </label>

        <p class="status" id="crane-admin-auth-status"></p>

        <div class="actions">
          <button type="button" data-close>戻る</button>
          <button type="submit" class="primary">
            続行
          </button>
        </div>
      </form>
    </section>

    <section id="crane-admin-main" hidden>
      <h2>⚙ MINI CRANE 管理者設定</h2>

      <form id="crane-admin-config-form">
        <label>
          1人のプレイ回数
          <input name="maxPlays" type="number"
            min="1" max="10" step="1" required>
        </label>

        <label>
          保持成功率（%）
          <input name="holdPercent" type="number"
            min="0" max="100" step="1" required>
        </label>

        <label>
          アーム速度
          <input name="armSpeed" type="range"
            min="0.5" max="1.5" step="0.1">
          <output id="crane-admin-speed-label"></output>
        </label>

        <p style="font-size:12px">
          プレイ途中に回数を変更した場合は、
          次のプレイヤーから反映されます。
        </p>

        <p class="status" id="crane-admin-config-status"></p>

        <div class="actions">
          <button type="button" id="crane-admin-gather">
            カプセルを中央へ
          </button>
          <button type="button" id="crane-admin-change">
            パスワード変更
          </button>
          <button type="button" data-close>閉じる</button>
          <button type="submit" class="primary">
            設定保存
          </button>
        </div>
      </form>

      <form id="crane-admin-change-form" hidden>
        <h3>パスワード変更</h3>

        <label>
          現在のパスワード
          <input name="old" type="password" required>
        </label>

        <label>
          新しいパスワード
          <input name="next" type="password"
            minlength="8" required>
        </label>

        <label>
          新しいパスワード確認
          <input name="confirm" type="password" required>
        </label>

        <p class="status" id="crane-admin-change-status"></p>

        <div class="actions">
          <button type="button" id="crane-admin-cancel-change">
            キャンセル
          </button>
          <button type="submit" class="primary">
            パスワード更新
          </button>
        </div>
      </form>
    </section>
  `;

  document.body.append(dialog);

  const $ = selector => dialog.querySelector(selector);

  const authForm = $("#crane-admin-auth-form");
  const configForm = $("#crane-admin-config-form");
  const changeForm = $("#crane-admin-change-form");

  const authScreen = $("#crane-admin-auth");
  const mainScreen = $("#crane-admin-main");

  const speedInput =
    configForm.elements.namedItem("armSpeed");

  function updateSpeedLabel() {
    $("#crane-admin-speed-label").textContent =
      `${Number(speedInput.value).toFixed(1)}倍`;
  }

  speedInput.addEventListener("input", updateSpeedLabel);

  function close() {
    dialog.close();
  }

  dialog.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", close);
  });

  // 管理画面の中で入力したキーを、ゲーム本体へ伝えない。
  // document のキャプチャ段階で止めると、パスワード欄の
  // 「1」「2」まで入力できなくなるため、ダイアログで停止する。
  dialog.addEventListener("keydown", event => {
    event.stopPropagation();
  });
  dialog.addEventListener("keyup", event => {
    event.stopPropagation();
  });

  function showSettings() {
    const values = getSettings();

    configForm.elements.namedItem("maxPlays").value =
      values.maxPlays;

    configForm.elements.namedItem("holdPercent").value =
      values.holdPercent;

    speedInput.value = values.armSpeed;
    updateSpeedLabel();

    $("#crane-admin-config-status").textContent = "";

    authScreen.hidden = true;
    mainScreen.hidden = false;
    changeForm.hidden = true;
  }

  launch.addEventListener("click", () => {
    if (!canManage()) {
      alert("アームの待機中に管理者設定を開いてね。");
      return;
    }

    settingsPanel.hidden = true;

    document.getElementById("mini-settings")
      ?.setAttribute("aria-expanded", "false");

    authForm.reset();
    changeForm.reset();

    const isRegistered = !!craneReadPassword();

    $("#crane-admin-auth-title").textContent =
      isRegistered
        ? "🔒 管理者ログイン"
        : "🔒 初回パスワード設定（8文字以上）";

    $("#crane-admin-confirm-row").hidden =
      isRegistered;

    $("#crane-admin-auth-status").textContent = "";

    authScreen.hidden = false;
    mainScreen.hidden = true;

    dialog.showModal();
    authForm.elements.namedItem("password").focus();
  });

  // パスワード初期登録・ログイン
  authForm.addEventListener("submit", async event => {
    event.preventDefault();

    const submit = authForm.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;

    const password =
      authForm.elements.namedItem("password").value;

    const status = $("#crane-admin-auth-status");
    const record = craneReadPassword();

    try {
      if (!record) {
        const confirm =
          authForm.elements.namedItem("confirm").value;

        if (password.length < 8 || password !== confirm) {
          throw new Error(
            "8文字以上で、確認欄と同じパスワードにしてね。"
          );
        }

        const saltBytes = crypto.getRandomValues(
          new Uint8Array(16)
        );

        const salt = btoa(
          String.fromCharCode(...saltBytes)
        );

        const hash = await cranePasswordHash(
          password, salt
        );

        localStorage.setItem(
          CRANE_PASSWORD_KEY,
          JSON.stringify({ salt, hash })
        );
      } else {
        const hash = await cranePasswordHash(
          password, record.salt
        );

        if (hash !== record.hash) {
          throw new Error("パスワードが違います。");
        }
      }

      authForm.reset();
      if (dialog.open) showSettings();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  // 設定保存
  configForm.addEventListener("submit", event => {
    event.preventDefault();

    if (!configForm.reportValidity()) return;

    const values = {
      maxPlays: Number(
        configForm.elements.namedItem("maxPlays").value
      ),
      holdPercent: Number(
        configForm.elements.namedItem("holdPercent").value
      ),
      armSpeed: Number(speedInput.value)
    };

    if (
      !Number.isInteger(values.maxPlays) ||
      values.maxPlays < 1 || values.maxPlays > 10 ||
      !Number.isFinite(values.holdPercent) ||
      values.holdPercent < 0 || values.holdPercent > 100 ||
      !Number.isFinite(values.armSpeed) ||
      values.armSpeed < 0.5 || values.armSpeed > 1.5
    ) {
      $("#crane-admin-config-status").textContent =
        "設定値を確認してください。";
      return;
    }

    try {
      onSave(values);

      localStorage.setItem(
        CRANE_ADMIN_KEY,
        JSON.stringify(values)
      );

      $("#crane-admin-config-status").textContent =
        "✅ 設定を保存しました。";
    } catch (error) {
      $("#crane-admin-config-status").textContent =
        `保存エラー：${error.message}`;
    }
  });

  // カプセルを中央に並べる
  $("#crane-admin-gather").addEventListener("click", () => {
    const status = $("#crane-admin-config-status");

    if (!canManage()) {
      status.textContent = "操作中は配置を変更できません。";
      return;
    }

    if (!confirm("床のカプセルを中央に集めますか？")) {
      return;
    }

    const capsules = getPrizes().filter(
      prize => prize.state === "floor"
    );

    const layouts = {
      1: [[0, 0]],
      2: [[-0.53, 0], [0.53, 0]],
      3: [[-1.05, 0], [0, 0], [1.05, 0]],
      4: [
        [-0.53, -0.53], [0.53, -0.53],
        [-0.53, 0.53], [0.53, 0.53]
      ],
      5: [
        [-1.05, -0.53], [0, -0.53], [1.05, -0.53],
        [-0.53, 0.53], [0.53, 0.53]
      ],
      6: [
        [-1.05, -0.53], [0, -0.53], [1.05, -0.53],
        [-1.05, 0.53], [0, 0.53], [1.05, 0.53]
      ]
    };

    const positions = layouts[capsules.length];

    if (!positions) {
      status.textContent =
        "並べ替えできるカプセルがありません。";
      return;
    }

    capsules.forEach((prize, index) => {
      const [x, z] = positions[index];

      prize.group.position.set(x, capsuleY, z);
      prize.group.rotation.set(0, 0, 0);

      prize.vx = 0;
      prize.vy = 0;
      prize.vz = 0;
      prize.spin = 0;

      prize.lastFloorX = x;
      prize.lastFloorZ = z;
      prize.homeX = x;
      prize.homeZ = z;
    });

    saveCapsules();

    status.textContent =
      `✅ ${capsules.length}個のカプセルを中央に集めました。`;
  });

  // パスワード変更
  $("#crane-admin-change").addEventListener("click", () => {
    changeForm.hidden = false;
    $("#crane-admin-change-status").textContent = "";
  });

  $("#crane-admin-cancel-change").addEventListener(
    "click", () => {
      changeForm.hidden = true;
      changeForm.reset();
    }
  );

  changeForm.addEventListener("submit", async event => {
    event.preventDefault();

    const status = $("#crane-admin-change-status");

    const old = changeForm.elements.namedItem("old").value;
    const next = changeForm.elements.namedItem("next").value;
    const confirm =
      changeForm.elements.namedItem("confirm").value;

    try {
      const record = craneReadPassword();

      if (!record) {
        throw new Error("登録済みパスワードがありません。");
      }

      const oldHash = await cranePasswordHash(
        old, record.salt
      );

      if (oldHash !== record.hash) {
        throw new Error("現在のパスワードが違います。");
      }

      if (next.length < 8 || next !== confirm) {
        throw new Error(
          "新しいパスワードは8文字以上で、確認欄と一致させてね。"
        );
      }

      const saltBytes = crypto.getRandomValues(
        new Uint8Array(16)
      );

      const salt = btoa(
        String.fromCharCode(...saltBytes)
      );

      const hash = await cranePasswordHash(
        next, salt
      );

      localStorage.setItem(
        CRANE_PASSWORD_KEY,
        JSON.stringify({ salt, hash })
      );

      changeForm.reset();
      changeForm.hidden = true;

      $("#crane-admin-config-status").textContent =
        "✅ パスワードを変更しました。";

    } catch (error) {
      status.textContent = error.message;
    }
  });

  return {
    isOpen: () => dialog.open
  };
}