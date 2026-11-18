/* MINI CRANE — 追加機能専用モジュール
   初回操作ガイド／判定表示／獲得数／残り回数
   獲得音・BGM・音量／視点切替／Firebase管理者機能
*/

export function createMiniCraneFeatures({
  THREE,
  machine,
  getPrizes,
  getTips,
  checkGrip,
  getPlayCount,
  getWinCount,
  maxPlays,
  getMaxPlays = () => maxPlays,
  capsuleRadius = 0.42
}) {
  const OPTIONS_KEY = "mini_crane_extra_settings_v3";
  const GUIDE_KEY = "mini_crane_guide_seen_v3";

  const getSaved = key => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const putSaved = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  };

  let options = {};

  try {
    options = JSON.parse(getSaved(OPTIONS_KEY) || "{}") || {};
  } catch {}

  let soundEnabled = options.sound !== false;

  let volume = Number.isFinite(options.volume)
    ? Math.max(0, Math.min(100, options.volume))
    : 40;

  let debugEnabled = !!options.debug;
  let bgmEnabled = options.bgm !== false;

  let bgmVolume = Number.isFinite(options.bgmVolume)
    ? Math.max(0, Math.min(100, options.bgmVolume))
    : 30;

  let guideOpen = false;

  const saveOptions = () => putSaved(
    OPTIONS_KEY,
    JSON.stringify({
      sound: soundEnabled,
      volume,
      debug: debugEnabled,
      bgm: bgmEnabled,
      bgmVolume
    })
  );

  // ============================================
  // 1. 追加UIのデザイン
  // ============================================

  const css = document.createElement("style");

  css.textContent = `
    [hidden] {
      display: none !important;
    }

    .mini-extra-count {
      display: flex !important;
      flex-direction: column;
      align-items: center;
      gap: 0 !important;
      min-width: 68px;
      padding: 6px 9px !important;
      background: #fff !important;
      border: 2px solid #fff !important;
      border-radius: 14px !important;
      font-weight: 900;
    }

    .mini-extra-count strong {
      font-size: clamp(22px, 3vw, 32px) !important;
      line-height: 1.08;
      font-variant-numeric: tabular-nums;
    }

    .mini-extra-rest strong {
      color: #d94b91 !important;
    }

    .mini-extra-wins strong {
      color: #2389b4 !important;
    }

    .mini-extra-tools {
      display: flex;
      gap: 5px;
    }

    .mini-extra-tool {
      border: 1px solid #fff;
      border-radius: 11px;
      background: #fff;
      color: #754e91;
      font-size: 19px;
      font-weight: 900;
      min-width: 35px;
      min-height: 35px;
      cursor: pointer;
    }

    .mini-extra-panel {
      position: fixed;
      right: 12px;
      top: 80px;
      z-index: 31;
      width: min(288px, calc(100vw - 24px));
      border-radius: 17px;
      padding: 16px;
      color: #533a66;
      background: #fff9ff;
      border: 2px solid white;
      box-shadow: 0 12px 30px #271a4655;
      font-size: 13px;
    }

    .mini-extra-panel h3 {
      margin: 0 0 10px;
      font-size: 16px;
    }

    .mini-extra-panel label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin: 13px 0;
      font-weight: 800;
      cursor: pointer;
    }

    .mini-extra-panel input[type=range] {
      width: 125px;
      accent-color: #c16cbd;
    }

    .mini-extra-panel input[type=checkbox] {
      width: 18px;
      height: 18px;
      accent-color: #c16cbd;
    }

    .mini-extra-panel small {
      line-height: 1.6;
      color: #85688e;
    }

    .mini-extra-overlay {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: #1a102bc9;
      backdrop-filter: blur(6px);
    }

    .mini-extra-dialog {
      width: min(440px, 100%);
      border-radius: 22px;
      padding: 21px;
      background: #fff9ff;
      border: 2px solid white;
      color: #533568;
      text-align: center;
      box-shadow: 0 15px 35px #23133766;
    }

    .mini-extra-dialog h2 {
      font-size: 23px;
      margin: 4px 0 8px;
    }

    .mini-extra-step {
      padding: 10px;
      margin: 9px 0;
      text-align: left;
      border-radius: 12px;
      background: #f4e7f8;
      line-height: 1.7;
      font-size: 13px;
    }

    .mini-extra-step b {
      color: #b83c88;
    }

    .mini-extra-start {
      background: #b966bd;
      color: white;
      padding: 12px;
      border: 0;
      border-radius: 13px;
      width: 100%;
      font-weight: 900;
      font-size: 16px;
      margin-top: 10px;
      cursor: pointer;
    }

    .mini-extra-debug-label {
      position: fixed;
      z-index: 12;
      left: 12px;
      top: 115px;
      padding: 8px;
      border-radius: 9px;
      background: #182437df;
      color: white;
      font-size: 12px;
      pointer-events: none;
    }

    @media (max-width: 640px) {
      .top-bar {
        gap: 4px !important;
        inset-inline: 7px !important;
      }

      .top-bar .brand {
        font-size: 11px !important;
        letter-spacing: .04em !important;
      }

      .top-bar .brand-star {
        display: none;
      }

      .top-actions {
        gap: 3px !important;
      }

      .mini-extra-count {
        min-width: 48px;
        padding: 4px !important;
        font-size: 10px !important;
      }

      .mini-extra-count strong {
        font-size: 20px !important;
      }

      .mini-extra-tools {
        gap: 2px;
      }

      .mini-extra-tool {
        min-width: 28px;
        min-height: 30px;
        font-size: 15px;
        padding: 2px 5px;
      }

      .top-bar .small-button {
        padding: 6px !important;
        font-size: 10px !important;
      }
    }
  `;

  document.head.append(css);

  const actions = document.querySelector(".top-actions");
  const remainingEl = document.getElementById("remaining-plays");
  const wonEl = document.getElementById("score");
  const statusEl = document.getElementById("status");

  if (!actions || !remainingEl || !wonEl || !statusEl) {
    throw new Error(
      "MINI CRANEのUIが見つかりません。index.htmlを確認してください"
    );
  }

  remainingEl.closest(".score")?.classList.add(
    "mini-extra-count",
    "mini-extra-rest"
  );

  wonEl.closest(".score")?.classList.add(
    "mini-extra-count",
    "mini-extra-wins"
  );

  // ============================================
  // 2. 設定画面
  // ============================================

  const tools = document.createElement("div");
  tools.className = "mini-extra-tools";

  tools.innerHTML = `
    <button type="button"
      class="mini-extra-tool"
      id="mini-help"
      title="遊び方">?</button>

    <button type="button"
      class="mini-extra-tool"
      id="mini-settings"
      title="設定"
      aria-expanded="false">⚙</button>
  `;

  actions.append(tools);

  const panel = document.createElement("section");
  panel.className = "mini-extra-panel";
  panel.hidden = true;

  panel.innerHTML = `
    <h3>⚙ MINI CRANE 設定</h3>

    <label>
      効果音
      <input id="mini-sound" type="checkbox">
    </label>

    <label>
      効果音量
      <input id="mini-volume"
        type="range"
        min="0"
        max="100"
        step="1">
      <output id="mini-volume-label"></output>
    </label>

    <label>
      BGM
      <input id="mini-bgm" type="checkbox">
    </label>

    <label>
      BGM音量
      <input id="mini-bgm-volume"
        type="range"
        min="0"
        max="100"
        step="1">
      <output id="mini-bgm-volume-label"></output>
    </label>

    <label>
      つかみ判定表示
      <input id="mini-debug" type="checkbox">
    </label>

    <small>
      水色＝3本の爪先／緑＝現在の姿勢でつかめる／
      黄色＝判定外。<br>
      開いた状態では黄色が普通です。
    </small>
  `;

  document.body.append(panel);

  const soundBox = panel.querySelector("#mini-sound");
  const slider = panel.querySelector("#mini-volume");
  const volumeLabel = panel.querySelector("#mini-volume-label");
  const debugBox = panel.querySelector("#mini-debug");

  const bgmBox = panel.querySelector("#mini-bgm");
  const bgmSlider = panel.querySelector("#mini-bgm-volume");
  const bgmVolumeLabel = panel.querySelector("#mini-bgm-volume-label");

  soundBox.checked = soundEnabled;
  debugBox.checked = debugEnabled;
  slider.value = String(volume);
  volumeLabel.value = `${volume}%`;

  bgmBox.checked = bgmEnabled;
  bgmSlider.value = String(bgmVolume);
  bgmVolumeLabel.value = `${bgmVolume}%`;

  const gear = tools.querySelector("#mini-settings");

  const closePanel = () => {
    panel.hidden = true;
    gear.setAttribute("aria-expanded", "false");
  };

  gear.addEventListener("click", () => {
    if (guideOpen) return;

    panel.hidden = !panel.hidden;
    gear.setAttribute(
      "aria-expanded",
      String(!panel.hidden)
    );
  });

  document.addEventListener("pointerdown", e => {
    if (
      !panel.hidden &&
      !panel.contains(e.target) &&
      !gear.contains(e.target)
    ) {
      closePanel();
    }
  });

  // ============================================
  // 3. 初回操作ガイド
  // ============================================

  const overlay = document.createElement("div");
  overlay.className = "mini-extra-overlay";
  overlay.hidden = true;

  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  overlay.innerHTML = `
    <div class="mini-extra-dialog">
      <h2>🎮 MINI CRANE の遊び方</h2>

      <div class="mini-extra-step">
        <b>① 横：</b>
        長押しで右へ移動。離したら横位置が確定。
      </div>

      <div class="mini-extra-step">
        <b>② 縦：</b>
        長押しで奥へ移動。離すと自動下降。
      </div>

      <div class="mini-extra-step">
        <b>③ キャッチ：</b>
        下降したら爪が閉じ、カプセルを獲得口へ運ぶ。
      </div>

      <div class="mini-extra-step">
        <b>🎁 結果：</b>
        1人${getMaxPlays()}回。
        カプセルの等級はプレイ終了後に発表。
      </div>

      <p style="font-size:12px">
        移動・下降中は爪が開いたまま。
        落とした後も開いたまま。
      </p>

      <button type="button"
        class="mini-extra-start"
        id="mini-begin">
        ゲームを始める
      </button>
    </div>
  `;

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

    document.getElementById(
      "horizontal-button"
    )?.focus({ preventScroll: true });
  }

  tools.querySelector("#mini-help")
    .addEventListener("click", openGuide);

  beginButton.addEventListener("click", closeGuide);

  document.addEventListener("keydown", e => {
    if (
      guideOpen &&
      [
        "Digit1",
        "Numpad1",
        "Digit2",
        "Numpad2",
        "KeyR"
      ].includes(e.code)
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  if (!getSaved(GUIDE_KEY) && getPlayCount() === 0) {
    openGuide();
  }

  // ============================================
  // 4. 効果音システム
  // 景品獲得時のみ再生
  // ============================================

  let audio = null;
  let master = null;

  function startAudio() {
    if (!soundEnabled) return;

    try {
      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioContextClass) return;

      if (!audio) {
        audio = new AudioContextClass();
        master = audio.createGain();
        master.connect(audio.destination);
      }

      master.gain.value = soundEnabled
        ? volume / 100
        : 0;

      if (audio.state === "suspended") {
        audio.resume().catch(() => {});
      }

    } catch (error) {
      console.warn(
        "効果音を開始できません:",
        error
      );
    }
  }

  // スマホ・iPadの音声再生制限への対応
  document.addEventListener(
    "pointerdown",
    startAudio,
    true
  );

  document.addEventListener(
    "keydown",
    startAudio,
    true
  );

  // ============================================
  // 5. BGM
  // 既存のbgm.mp3を使用
  // ============================================

  const bgm = new Audio("./bgm.mp3");

  bgm.loop = true;
  bgm.preload = "auto";

  function syncBgmVolume() {
    bgm.volume = Math.max(
      0,
      Math.min(1, bgmVolume / 100)
    );
  }

  function startBgm() {
    if (
      !bgmEnabled ||
      bgmVolume <= 0 ||
      document.hidden ||
      !bgm.paused
    ) {
      return;
    }

    bgm.play().catch(error => {
      if (
        error.name !== "NotAllowedError" &&
        error.name !== "AbortError"
      ) {
        console.warn(
          "BGMを再生できません:",
          error
        );
      }
    });
  }

  syncBgmVolume();

  bgm.addEventListener("error", () => {
    console.warn(
      "bgm.mp3が読み込めません。index.htmlと同じ場所に置いてください。"
    );
  });

  document.addEventListener(
    "pointerdown",
    startBgm,
    true
  );

  document.addEventListener(
    "keydown",
    startBgm,
    true
  );

  bgmBox.addEventListener("change", () => {
    bgmEnabled = bgmBox.checked;

    if (bgmEnabled) {
      startBgm();
    } else {
      bgm.pause();
    }

    saveOptions();
  });

  bgmSlider.addEventListener("input", () => {
    bgmVolume = Number(bgmSlider.value);
    bgmVolumeLabel.value = `${bgmVolume}%`;

    syncBgmVolume();

    if (bgmVolume <= 0) {
      bgm.pause();
    } else {
      startBgm();
    }

    saveOptions();
  });

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        bgm.pause();
      } else {
        startBgm();
      }
    }
  );

  window.addEventListener(
    "pagehide",
    () => bgm.pause()
  );

  // ============================================
  // 6. 効果音設定
  // ============================================

  soundBox.addEventListener("change", () => {
    soundEnabled = soundBox.checked;

    if (soundEnabled) {
      startAudio();
    }

    if (master) {
      master.gain.value = soundEnabled
        ? volume / 100
        : 0;
    }

    saveOptions();
  });

  slider.addEventListener("input", () => {
    volume = Number(slider.value);
    volumeLabel.value = `${volume}%`;

    if (master) {
      master.gain.value = soundEnabled
        ? volume / 100
        : 0;
    }

    saveOptions();
  });

  // ============================================
  // 7. 景品獲得ファンファーレ
  // win.mp3不要
  // ============================================

  function playWinSound() {
    if (!soundEnabled || volume <= 0) {
      return;
    }

    startAudio();

    if (
      !audio ||
      !master ||
      audio.state !== "running"
    ) {
      return;
    }

    const now = audio.currentTime + 0.02;

    const notes = [
      523.25,
      659.25,
      783.99,
      1046.50
    ];

    notes.forEach((frequency, index) => {
      const start = now + index * 0.12;

      const duration =
        index === notes.length - 1
          ? 0.38
          : 0.22;

      const osc = audio.createOscillator();
      const gain = audio.createGain();

      osc.type = "triangle";

      osc.frequency.setValueAtTime(
        frequency,
        start
      );

      gain.gain.setValueAtTime(
        0.0001,
        start
      );

      gain.gain.linearRampToValueAtTime(
        0.15,
        start + 0.015
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        start + duration
      );

      osc.connect(gain);
      gain.connect(master);

      osc.start(start);
      osc.stop(start + duration + 0.02);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  }

  // ============================================
  // 8. GET!表示を監視
  // ============================================

  let lastStatus = statusEl.textContent;

  new MutationObserver(() => {
    const currentStatus = statusEl.textContent;

    if (currentStatus === lastStatus) {
      return;
    }

    lastStatus = currentStatus;

    // 景品獲得時だけ再生する
    if (currentStatus.includes("GET!")) {
      playWinSound();
    }

  }).observe(statusEl, {
    childList: true,
    characterData: true,
    subtree: true
  });

  // ============================================
  // 9. つかみ判定表示
  // ============================================

  const layer = new THREE.Group();
  layer.visible = debugEnabled;
  machine.add(layer);

  const points = Array.from(
    { length: 3 },
    () => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(.075, 10, 8),
        new THREE.MeshBasicMaterial({
          color: 0x18dcff,
          depthTest: false
        })
      );

      mesh.renderOrder = 100;
      layer.add(mesh);

      return mesh;
    }
  );

  const ringGeometry = new THREE.RingGeometry(
    capsuleRadius + .03,
    capsuleRadius + .07,
    32
  );

  ringGeometry.rotateX(-Math.PI / 2);

  const halos = Array.from(
    { length: 6 },
    () => {
      const mesh = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffc03c,
          side: THREE.DoubleSide,
          depthTest: false
        })
      );

      mesh.renderOrder = 99;
      layer.add(mesh);

      return mesh;
    }
  );

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

    const valid =
      Array.isArray(tips) &&
      tips.length === 3 &&
      tips.every(t =>
        Number.isFinite(t.x) &&
        Number.isFinite(t.y) &&
        Number.isFinite(t.z)
      );

    points.forEach((mesh, i) => {
      mesh.visible = valid;

      if (valid) {
        mesh.position.copy(tips[i]);
      }
    });

    let count = 0;

    getPrizes().slice(0, 6).forEach((prize, i) => {
      const halo = halos[i];

      halo.visible = prize.state === "floor";

      if (!halo.visible) return;

      halo.position.set(
        prize.group.position.x,
        prize.group.position.y - capsuleRadius + .08,
        prize.group.position.z
      );

      const ok = checkGrip(
        prize,
        valid ? tips : null
      );

      halo.material.color.setHex(
        ok ? 0x35e37f : 0xffc03c
      );

      if (ok) count++;
    });

    label.textContent = valid
      ? `判定表示ON：${count}個つかめる位置`
      : "判定表示ON：GLBの爪先情報を待っています";
  }

  // ============================================
  // 10. 毎フレーム更新
  // ============================================


  // 14. アームの機械演出を追加
  const armMechanicsV14 = createArmRealismV14({
    THREE,
    machine
  });

  // 15. 筐体LED：既存のアーム・判定処理は変更しない
  const cabinetLEDV15 = createCabinetLEDV15({
    THREE,
    machine,
    statusEl
  });

  function update(
    delta,
    moving,
    craneState = "idle"
  ) {
    // 更新があった場合だけDOMを書き換える（獲得監視の誤作動・負荷を防ぐ）
    const nextRemaining = String(
      Math.max(0, getMaxPlays() - getPlayCount())
    );
    if (remainingEl.textContent !== nextRemaining) {
      remainingEl.textContent = nextRemaining;
    }

    const nextWins = String(getWinCount());
    if (wonEl.textContent !== nextWins) {
      wonEl.textContent = nextWins;
    }

    armMechanicsV14.update(delta);
    cabinetLEDV15.update(delta);
    // アーム動作音は再生しない
    refreshDebug(delta);
  }

  update(0, false);

  return {
    update,
    isGuideOpen: () => guideOpen
  };
}


// ============================================
// 11. 視点切替UI（camera.jsへ移動）
// ============================================
// 旧コードからのimportを維持するための互換エクスポート。
// 実装本体はcamera.jsに1か所だけ存在する。
export { createCameraViewControls } from "./camera.js";


// ============================================
// 12. Firebase管理者機能
// ============================================

export function readMiniCraneAdminSettings() {
  try {
    localStorage.removeItem(
      "mini_crane_admin_password_v1"
    );

    localStorage.removeItem(
      "mini_crane_admin_settings_v1"
    );

  } catch (error) {
    console.warn(
      "旧管理者データの削除に失敗:",
      error
    );
  }

  return {
    maxPlays: 5,
    holdPercent: 35,
    armSpeed: 1
  };
}

export function createMiniCraneAdminSettings(options) {
  import("./cloudAdminUI.js")
    .then(({ createCloudAdminUI }) => {
      createCloudAdminUI(options);
    })
    .catch(error => {
      console.error(
        "Firebase管理者画面の読み込みエラー:",
        error
      );
    });
}

// ============================================
// 13. カプセル獲得エフェクト（追加機能）
// ============================================
(() => {
  const scoreEl = document.getElementById("score");

  if (!scoreEl || document.getElementById("mini-get-effect-style")) {
    return;
  }

  // エフェクト専用CSS
  const style = document.createElement("style");
  style.id = "mini-get-effect-style";

  style.textContent = `
    .mini-get-effect {
      position: fixed;
      inset: 0;
      z-index: 21;
      pointer-events: none;
      overflow: hidden;
      font-family: "Yu Gothic", "Meiryo", sans-serif;
    }

    .mini-get-effect__flash {
      position: absolute;
      inset: 0;
      background: radial-gradient(
        circle at 50% 43%,
        rgba(255,239,139,.55),
        rgba(255,202,241,.18) 33%,
        transparent 72%
      );
      animation: miniGetFlash 1.2s ease-out both;
    }

    .mini-get-effect__ring {
      position: absolute;
      left: 50%;
      top: 43%;
      width: 180px;
      height: 180px;
      border: 5px solid rgba(255,222,101,.88);
      border-radius: 50%;
      box-shadow: 0 0 25px rgba(255,210,70,.6);
      animation: miniGetRing 1.05s ease-out both;
    }

    .mini-get-effect__ring--second {
      border-color: rgba(255,143,211,.8);
      animation-delay: .14s;
    }

    .mini-get-effect__title {
      position: absolute;
      left: 50%;
      top: 43%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      font-weight: 1000;
      text-align: center;
      color: #fff;
      text-shadow:
        0 3px 0 #a84a98,
        0 5px 16px #8a397c;
      animation: miniGetTitle 1.7s ease-out both;
    }

    .mini-get-effect__title strong {
      font-size: clamp(42px, 11vw, 88px);
      line-height: 1.1;
      letter-spacing: .035em;
    }

    .mini-get-effect__title small {
      padding: 5px 18px;
      border-radius: 99px;
      background: #e660aa;
      border: 2px solid #fff;
      font-size: clamp(14px, 4vw, 22px);
      box-shadow: 0 5px 18px #9e458d66;
    }

    .mini-get-effect__spark {
      position: absolute;
      left: 50%;
      top: 43%;
      width: 12px;
      height: 20px;
      border-radius: 3px;
      box-shadow: 0 0 9px #ffffff99;
      animation: miniGetSpark 1.3s
        cubic-bezier(.15,.7,.4,1) both;
      animation-delay: var(--delay);
    }

    .mini-get-score-pop {
      animation: miniGetScorePop .7s ease-out;
    }

    @keyframes miniGetFlash {
      0% { opacity: 0; }
      14% { opacity: 1; }
      100% { opacity: 0; }
    }

    @keyframes miniGetRing {
      0% {
        transform: translate(-50%,-50%) scale(.2);
        opacity: 1;
      }
      100% {
        transform: translate(-50%,-50%) scale(2.5);
        opacity: 0;
      }
    }

    @keyframes miniGetTitle {
      0% {
        transform: translate(-50%,-25%) scale(.35);
        opacity: 0;
      }
      16% {
        transform: translate(-50%,-50%) scale(1.2);
        opacity: 1;
      }
      28%, 65% {
        transform: translate(-50%,-50%) scale(1);
        opacity: 1;
      }
      100% {
        transform: translate(-50%,-70%) scale(.95);
        opacity: 0;
      }
    }

    @keyframes miniGetSpark {
      0% {
        transform: translate(-50%,-50%) scale(.2);
        opacity: 0;
      }
      12% {
        opacity: 1;
      }
      100% {
        transform: translate(
          calc(-50% + var(--dx)),
          calc(-50% + var(--dy))
        ) rotate(var(--rotate));
        opacity: 0;
      }
    }

    @keyframes miniGetScorePop {
      0%, 100% { transform: scale(1); }
      40% { transform: scale(1.55); }
    }

    @media (prefers-reduced-motion: reduce) {
      .mini-get-effect__spark,
      .mini-get-effect__ring,
      .mini-get-effect__flash {
        display: none;
      }

      .mini-get-effect__title {
        animation: none;
        transform: translate(-50%,-50%);
      }

      .mini-get-score-pop {
        animation: none;
      }
    }
  `;

  document.head.appendChild(style);

  // ============================================
  // エフェクト管理
  // ============================================
  let currentEffect = null;
  let effectTimer = null;
  let scoreTimer = null;

  function showGetEffect() {
    clearTimeout(effectTimer);
    currentEffect?.remove();

    const effect = document.createElement("div");
    effect.className = "mini-get-effect";
    effect.setAttribute("aria-hidden", "true");

    effect.innerHTML = `
      <div class="mini-get-effect__flash"></div>
      <div class="mini-get-effect__ring"></div>
      <div class="mini-get-effect__ring mini-get-effect__ring--second"></div>
      <div class="mini-get-effect__title">
        <strong>🎉 GET!</strong>
        <small>黒カプセル +1</small>
      </div>
    `;

    // ============================================
    // キラキラパーティクル
    // ============================================
    const colors = [
      "#ffe17e",
      "#ff85bc",
      "#77e5ff",
      "#c5a2ff",
      "#ffffff"
    ];

    for (let i = 0; i < 26; i++) {
      const piece = document.createElement("span");
      piece.className = "mini-get-effect__spark";

      const angle =
        (i / 26) * Math.PI * 2 +
        Math.random() * .2;

      const distance = 100 + Math.random() * 160;

      piece.style.setProperty(
        "--dx",
        `${Math.cos(angle) * distance}px`
      );

      piece.style.setProperty(
        "--dy",
        `${Math.sin(angle) * distance * .8}px`
      );

      piece.style.setProperty(
        "--rotate",
        `${Math.random() * 720 - 360}deg`
      );

      piece.style.setProperty(
        "--delay",
        `${Math.random() * .18}s`
      );

      piece.style.backgroundColor =
        colors[i % colors.length];

      effect.appendChild(piece);
    }

    document.body.appendChild(effect);
    currentEffect = effect;

    // 終了したエフェクトを自動削除
    effectTimer = setTimeout(() => {
      effect.remove();

      if (currentEffect === effect) {
        currentEffect = null;
      }
    }, 1900);

    // GETカウンターを弾ませる
    clearTimeout(scoreTimer);

    scoreEl.classList.remove("mini-get-score-pop");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("mini-get-score-pop");

    scoreTimer = setTimeout(() => {
      scoreEl.classList.remove("mini-get-score-pop");
    }, 750);
  }

  // ============================================
  // 獲得数の増加を検知
  // ============================================
  // 初期保存データの読み込みを獲得と誤判定しない
  setTimeout(() => {
    let previousScore = Number(scoreEl.textContent) || 0;

    new MutationObserver(() => {
      const score = Number(scoreEl.textContent) || 0;

      if (score > previousScore) {
        showGetEffect();
      }

      previousScore = score;
    }).observe(scoreEl, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }, 0);
})();


// ============================================
// 14. アームの機械演出（追加機能）
// ============================================
function createArmRealismV14({ THREE, machine }) {
  const crane = machine.children.find(obj =>
    obj.isGroup &&
    Math.abs(obj.position.y - 7.82) < 0.02 &&
    obj.children.some(child =>
      child.isGroup && child.position.y < -0.4
    )
  );

  const clawRig = crane?.children.find(obj =>
    obj.isGroup && obj.position.y < -0.4
  );

  if (!crane || !clawRig) {
    console.warn(
      "MINI CLANE: アーム演出用の台車が見つかりません"
    );
    return { update() {} };
  }

  if (crane.getObjectByName("mini-arm-mechanics-v14")) {
    return { update() {} };
  }

  const rig = new THREE.Group();
  rig.name = "mini-arm-mechanics-v14";
  crane.add(rig);

  const chrome = new THREE.MeshStandardMaterial({
    color: 0xc9d8e6,
    metalness: 0.82,
    roughness: 0.22
  });

  const metal = new THREE.MeshStandardMaterial({
    color: 0x566176,
    metalness: 0.78,
    roughness: 0.3
  });

  const pink = new THREE.MeshStandardMaterial({
    color: 0xe972b4,
    metalness: 0.42,
    roughness: 0.3
  });

  // 巻き取りドラム
  const drum = new THREE.Group();
  drum.position.set(0, 0.34, 0.26);
  rig.add(drum);

  function cylinder(parent, radius, length, material, x = 0) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 24),
      material
    );

    mesh.rotation.z = Math.PI / 2;
    mesh.position.x = x;
    parent.add(mesh);

    return mesh;
  }

  cylinder(drum, 0.145, 0.42, metal);
  cylinder(drum, 0.175, 0.04, chrome, -0.22);
  cylinder(drum, 0.175, 0.04, chrome, 0.22);
  cylinder(drum, 0.055, 0.55, pink);

  // ドラムの溝
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;

    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.018, 0.025),
      chrome
    );

    rib.position.set(
      0,
      Math.sin(angle) * 0.147,
      Math.cos(angle) * 0.147
    );

    rib.rotation.x = -angle;
    drum.add(rib);
  }

  // 補助ギア
  const gear = new THREE.Group();
  gear.position.set(0.35, 0.29, 0.33);
  rig.add(gear);

  cylinder(gear, 0.12, 0.08, metal);
  cylinder(gear, 0.04, 0.10, chrome);

  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;

    const tooth = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.038, 0.04),
      pink
    );

    tooth.position.set(
      0,
      Math.sin(angle) * 0.125,
      Math.cos(angle) * 0.125
    );

    tooth.rotation.x = -angle;
    gear.add(tooth);
  }

  // モーター動作ランプ
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x83a0b8,
    emissive: 0x48d9ff,
    emissiveIntensity: 0.08,
    roughness: 0.2
  });

  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 16, 12),
    lampMat
  );

  lamp.position.set(-0.35, 0.28, 0.43);
  rig.add(lamp);

  let lastX = crane.position.x;
  let lastZ = crane.position.z;
  let lastY = clawRig.position.y;
  let lampStrength = 0;

  // 既存の描画ループから呼び出す
  return {
    update(delta) {
      const dt = Math.max(0, Math.min(delta || 0, 0.05));

      const dx = crane.position.x - lastX;
      const dz = crane.position.z - lastZ;
      const dy = clawRig.position.y - lastY;

      const travel = Math.hypot(dx, dz);

      // アーム昇降と巻き取りを連動
      if (Math.abs(dy) < 0.5) {
        drum.rotation.x += dy / 0.145;
      }

      // 台車移動とギア回転を連動
      if (travel < 0.5) {
        gear.rotation.x += travel * 5;
      }

      // 動作状態をランプに反映
      const working =
        Math.abs(dy) > 0.0002 ||
        travel > 0.0002;

      lampStrength = THREE.MathUtils.damp(
        lampStrength,
        working ? 1 : 0,
        10,
        dt
      );

      lampMat.emissiveIntensity =
        0.08 + lampStrength * 1.6;

      lampMat.color.setRGB(
        0.52 + lampStrength * 0.12,
        0.63 + lampStrength * 0.30,
        0.72 + lampStrength * 0.25
      );

      lastX = crane.position.x;
      lastZ = crane.position.z;
      lastY = clawRig.position.y;
    }
  };
}


// ============================================
// 15. LEDイルミネーション（追加機能）
// ============================================
function createCabinetLEDV15({ THREE, machine, statusEl }) {
  const ID = "mini-cabinet-led-v15";
  const KEY = "mini_cabinet_led_enabled_v15";

  if (machine.getObjectByName(ID)) {
    return { update() {} };
  }

  let enabled = true;
  try {
    enabled = localStorage.getItem(KEY) !== "0";
  } catch {}

  const ledGroup = new THREE.Group();
  ledGroup.name = ID;
  machine.add(ledGroup);

  const strips = [];
  const bulbs = [];
  const bulbGeometry = new THREE.SphereGeometry(0.047, 10, 8);

  // 既存のGLB・筐体・当たり判定には触れず、表示用だけ追加
  function strip(x, y, z, w, h, d, phase) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x8eefff,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      material
    );
    mesh.position.set(x, y, z);
    mesh.renderOrder = 3;
    ledGroup.add(mesh);
    strips.push({ material, phase });
  }

  function bulb(x, y, z, phase) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(bulbGeometry, material);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 4;
    ledGroup.add(mesh);
    bulbs.push({ material, phase });
  }

  // 前面ガラスの左右・上下のふち
  strip(-2.83, 5.74, 2.65, 0.055, 4.85, 0.04, 0.0);
  strip( 2.83, 5.74, 2.65, 0.055, 4.85, 0.04, 0.3);
  strip(0, 8.21, 2.65, 5.67, 0.055, 0.04, 0.6);
  strip(0, 3.33, 2.65, 5.67, 0.055, 0.04, 0.9);

  // 景品エリア床のライン
  strip(-2.55, 3.34, -0.10, 0.055, 0.035, 3.8, 1.2);
  strip( 2.55, 3.34, -0.10, 0.055, 0.035, 3.8, 1.5);
  strip(0, 3.34, -2.03, 5.10, 0.035, 0.055, 1.8);

  // 景品取り出し口の枠
  strip(-1.43, 1.43, 2.73, 1.80, 0.045, 0.035, 2.0);
  strip(-1.43, 0.43, 2.73, 1.80, 0.045, 0.035, 2.2);
  strip(-2.33, 0.93, 2.73, 0.045, 1.0, 0.035, 2.4);
  strip(-0.53, 0.93, 2.73, 0.045, 1.0, 0.035, 2.6);

  // 電球風の小さいLED
  for (const x of [-2.83, 2.83]) {
    for (let i = 0; i < 9; i++) {
      bulb(x, 3.60 + i * 0.54, 2.72, i * 0.23 + x);
    }
  }
  for (let i = 0; i < 11; i++) {
    bulb(-2.5 + i * 0.5, 8.23, 2.72, i * 0.19);
  }

  const roomGlow = new THREE.PointLight(0x86eaff, 1.1, 5, 2);
  roomGlow.position.set(0, 5.9, 1.6);
  roomGlow.castShadow = false;
  ledGroup.add(roomGlow);

  // 元の設定画面の末尾にLEDのON/OFFを追加
  const settingsPanel = document.querySelector(".mini-extra-panel");
  if (settingsPanel && !document.getElementById("mini-led-v15-toggle")) {
    const row = document.createElement("label");
    row.textContent = "LEDイルミネーション";
    const input = document.createElement("input");
    input.id = "mini-led-v15-toggle";
    input.type = "checkbox";
    input.checked = enabled;
    row.appendChild(input);
    settingsPanel.appendChild(row);
    input.addEventListener("change", () => {
      enabled = input.checked;
      ledGroup.visible = enabled;
      try {
        localStorage.setItem(KEY, enabled ? "1" : "0");
      } catch {}
    });
  }

  // GET!時は約1.5秒間、LEDを明るくする
  let previousStatus = statusEl?.textContent || "";
  let getBoost = 0;
  if (statusEl) {
    new MutationObserver(() => {
      const current = statusEl.textContent || "";
      if (current !== previousStatus && current.includes("GET!")) {
        getBoost = 1.5;
      }
      previousStatus = current;
    }).observe(statusEl, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  let time = 0;
  const reducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  ledGroup.visible = enabled;

  return {
    update(delta) {
      if (!enabled) return;
      const dt = Number.isFinite(delta)
        ? Math.max(0, Math.min(delta, 0.05))
        : 0;
      time += dt;
      getBoost = Math.max(0, getBoost - dt);
      const flash = Math.min(1, getBoost * 1.5);

      strips.forEach(({ material, phase }) => {
        const hue = reducedMotion
          ? 0.55
          : (time * 0.06 + phase * 0.12) % 1;
        material.color.setHSL(hue, 0.9, 0.67 + flash * 0.22);
        material.opacity = reducedMotion
          ? 0.86
          : Math.min(1, 0.77 + Math.sin(time * 3 + phase) * 0.14 + flash * 0.2);
      });

      bulbs.forEach(({ material, phase }) => {
        const hue = reducedMotion
          ? 0.55
          : (time * 0.10 + phase * 0.12 + 1) % 1;
        material.color.setHSL(hue, 1, 0.72 + flash * 0.18);
        material.opacity = reducedMotion
          ? 0.9
          : Math.min(1, 0.67 + Math.sin(time * 6 - phase) * 0.3 + flash * 0.3);
      });

      roomGlow.color.setHSL(
        reducedMotion ? 0.55 : (time * 0.06) % 1,
        0.9,
        0.65
      );
      roomGlow.intensity = 0.8 + flash * 3;
    }
  };
}