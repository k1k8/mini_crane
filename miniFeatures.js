
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

  function update(
    delta,
    moving,
    craneState = "idle"
  ) {
    remainingEl.textContent = String(
      Math.max(0, getMaxPlays() - getPlayCount())
    );

    wonEl.textContent = String(
      getWinCount()
    );

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
// 11. 視点切替UI
// ============================================

export function createCameraViewControls({
  getView,
  setView,
  getAutoView
}) {
  const KEY = "mini_crane_camera_view_v1";

  let saved = {};

  try {
    saved = JSON.parse(
      localStorage.getItem(KEY) || "{}"
    ) || {};
  } catch {}

  let automatic = saved.automatic !== false;

  let manualView = [
    "front",
    "diagonal",
    "side"
  ].includes(saved.manualView)
    ? saved.manualView
    : "front";

  const save = () => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          automatic,
          manualView
        })
      );
    } catch {}
  };

  const style = document.createElement("style");

  style.textContent = `
    .crane-camera-panel {
      position: fixed;
      left: 14px;
      top: 48%;
      transform: translateY(-50%);
      z-index: 9;
      box-sizing: border-box;
      width: 174px;
      padding: 12px 11px;
      border-radius: 17px;
      border: 1px solid #fff;
      background: rgba(255,249,255,.94);
      color: #674783;
      box-shadow: 0 8px 25px #70528533;
      backdrop-filter: blur(10px);
      font-size: 12px;
      font-weight: 800;
    }

    .crane-camera-title {
      font-size: 14px;
      text-align: center;
      margin-bottom: 8px;
    }

    .crane-camera-buttons {
      display: flex;
      gap: 5px;
    }

    .crane-camera-buttons button {
      flex: 1;
      min-width: 0;
      border-radius: 9px;
      padding: 8px 4px;
      cursor: pointer;
      background: white;
      border: 1px solid #dcbde9;
      color: #74578b;
      font-size: 12px;
      font-weight: 900;
    }

    .crane-camera-buttons button[aria-pressed="true"] {
      background: #b76dbe;
      color: white;
      border-color: #b76dbe;
    }

    .crane-camera-manual {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #e8d4eb;
    }

    .crane-camera-manual[hidden] {
      display: none !important;
    }

    .crane-camera-status {
      margin-top: 7px;
      text-align: center;
      font-size: 10px;
      color: #87659c;
    }

    @media (max-width: 640px) {
      .crane-camera-panel {
        left: 7px;
        top: 85px;
        transform: none;
        width: 128px;
        padding: 8px 6px;
        border-radius: 12px;
      }

      .crane-camera-title {
        font-size: 12px;
        margin-bottom: 6px;
      }

      .crane-camera-buttons {
        gap: 3px;
      }

      .crane-camera-buttons button {
        padding: 7px 2px;
        font-size: 11px;
      }

      .crane-camera-manual {
        margin-top: 7px;
        padding-top: 7px;
      }
    }
  `;

  document.head.append(style);

  const panel = document.createElement("section");

  panel.className = "crane-camera-panel";

  panel.setAttribute(
    "aria-label",
    "視点切り替え設定"
  );

  panel.innerHTML = `
    <div class="crane-camera-title">
      🎥 視点切り替え
    </div>

    <div class="crane-camera-buttons"
      role="group"
      aria-label="自動視点切替">

      <button type="button" id="crane-auto-on">
        ON
      </button>

      <button type="button" id="crane-auto-off">
        OFF
      </button>
    </div>

    <div class="crane-camera-manual"
      id="crane-manual-view"
      hidden>

      <div class="crane-camera-buttons"
        role="group"
        aria-label="手動視点">

        <button type="button" id="crane-front-view">
          正面
        </button>

        <button type="button" id="crane-diagonal-view">
          斜め
        </button>

        <button type="button" id="crane-side-view">
          側面
        </button>
      </div>
    </div>

    <div class="crane-camera-status"
      id="crane-camera-status"
      aria-live="polite">
    </div>
  `;

  document.body.append(panel);

  const onButton = panel.querySelector("#crane-auto-on");
  const offButton = panel.querySelector("#crane-auto-off");
  const manualBox = panel.querySelector("#crane-manual-view");
  const frontButton = panel.querySelector("#crane-front-view");
  const diagonalButton = panel.querySelector("#crane-diagonal-view");
  const sideButton = panel.querySelector("#crane-side-view");
  const label = panel.querySelector("#crane-camera-status");

  let lastState = "";

  function refresh() {
    const view = getView();

    const state =
      `${automatic}-${manualView}-${view}`;

    if (state === lastState) return;

    lastState = state;

    onButton.setAttribute(
      "aria-pressed",
      String(automatic)
    );

    offButton.setAttribute(
      "aria-pressed",
      String(!automatic)
    );

    manualBox.hidden = automatic;

    frontButton.setAttribute(
      "aria-pressed",
      String(manualView === "front")
    );

    diagonalButton.setAttribute(
      "aria-pressed",
      String(manualView === "diagonal")
    );

    sideButton.setAttribute(
      "aria-pressed",
      String(manualView === "side")
    );

    label.textContent =
      `${automatic ? "自動" : "手動"}・` +
      (
        view === "side"
          ? "側面"
          : view === "diagonal"
            ? "斜め"
            : "正面"
      );
  }

  onButton.addEventListener("click", () => {
    automatic = true;
    setView(getAutoView());
    save();
    refresh();
  });

  offButton.addEventListener("click", () => {
    if (automatic) {
      manualView = getView();
    }

    automatic = false;
    setView(manualView);
    save();
    refresh();
  });

  for (const [view, button] of [
    ["front", frontButton],
    ["diagonal", diagonalButton],
    ["side", sideButton]
  ]) {
    button.addEventListener("click", () => {
      if (automatic) return;

      manualView = view;
      setView(view);
      save();
      refresh();
    });
  }

  if (!automatic) {
    setView(manualView);
  }

  refresh();

  return {
    isAuto: () => automatic,
    update: refresh
  };
}


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
