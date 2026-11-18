/**
 * MINI CLANE / camera.js
 * 3本爪 / 〇リングモードのカメラと視点切替UI専用。
 * - 元のminiFeatures.js 機能11をここへ移動
 * - 3本爪のカメラ角度と補間速度を維持
 * - HOOKモードの奥移動だけ「正面から軽く見下ろす」視点に変更
 * - main.jsからカメラ座標・リサイズ・視点制御を分離
 */

// main.jsを変更せず、旧side指定をHOOKの上方正面視点へ読み替えるための状態。
// HOOK以外は従来のside視点を維持。
let currentCraneCameraMode = "claw";

export function createCraneCamera({ THREE }) {
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);

  // 元の3本爪カメラ座標
  const views = {
    claw: {
      front: new THREE.Vector3(0, 7.8, 18.2),
      diagonal: new THREE.Vector3(8.5, 18.7, 9.5),
      side: new THREE.Vector3(16.0, 8.1, 0)
    },
    // 〇リングモード：近距離・少し上から板をのぞく
    hook: {
      front: new THREE.Vector3(0, 10.0, 12.1),
      diagonal: new THREE.Vector3(6.0, 10.4, 9.9),
      // 奥移動中：正面に近い角度から、板とフックを少しだけ見下ろす。
      // 左右への視点ずれはゼロ（x=0）。横視点はHOOKでは使用しない。
      overhead: new THREE.Vector3(0, 11.2, 11.7)
    }
  };
  const lookAtPoints = {
    claw: new THREE.Vector3(0, 5.1, 0),
    hook: new THREE.Vector3(0, 5.35, -0.12)
  };

  let mode = "claw";
  let activeView = "front";
  const goal = views.claw.front.clone();
  camera.position.copy(goal);
  camera.lookAt(lookAtPoints.claw);
  let rendererRef = null;

  function getView() {
    return activeView;
  }

  function getMode() {
    return mode;
  }

  // 既存main.jsからの"side"指示を、HOOKでは"overhead"に読み替える。
  // 手動設定で"overhead"が残ったまま3本爪へ戻ってもsideへ復元する。
  function normalizeView(view) {
    if (mode === "hook") {
      if (view === "side" || view === "overhead") return "overhead";
    } else {
      if (view === "overhead") return "side";
    }
    return ["front", "diagonal", "side"].includes(view) ? view : "front";
  }

  // 視点を切り替える。instant=trueの場合だけ瞬時に移動。
  function setView(view, { instant = false } = {}) {
    activeView = normalizeView(view);
    goal.copy(views[mode][activeView]);
    if (instant) {
      camera.position.copy(goal);
      camera.lookAt(lookAtPoints[mode]);
    }
  }

  // モード切替時、手動で選んでいた視点の種類を維持できる。
  function setMode(nextMode, { view = activeView, instant = false } = {}) {
    mode = nextMode === "hook" ? "hook" : "claw";
    currentCraneCameraMode = mode;
    setView(view, { instant });
  }

  function resize() {
    if (!rendererRef) return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    rendererRef.setSize(width, height);
  }

  function bindRenderer(renderer) {
    if (!renderer) throw new Error("camera.js: rendererがありません");
    rendererRef = renderer;
    window.addEventListener("resize", resize);
    resize();
  }

  function update(delta) {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.05)) : 0;
    // 旧main.jsの補間係数と注視点をそのまま使用
    camera.position.lerp(goal, Math.min(1, dt * 3.5));
    camera.lookAt(lookAtPoints[mode]);
  }

  return {
    camera,
    getView,
    getMode,
    setView,
    setMode,
    bindRenderer,
    update
  };
}

// ============================================
// 11. 視点切替UI
// ============================================

export function createCameraViewControls({
  getView,
  setView,
  getAutoView,
  getMode = () => currentCraneCameraMode
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
    "side",
    "overhead"
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
    const hookMode = getMode() === "hook";
    const viewForMode = (v) =>
      hookMode ? (v === "side" ? "overhead" : v)
               : (v === "overhead" ? "side" : v);
    const manualForMode = viewForMode(manualView);

    const state =
      `${hookMode}-${automatic}-${manualForMode}-${view}`;

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
    // 3本爪では側面、HOOKでは正面の上方視点を表示する。
    sideButton.textContent = hookMode ? "上から" : "側面";
    sideButton.title = hookMode
      ? "正面から少し上をのぞく視点"
      : "真横からの視点";

    frontButton.setAttribute(
      "aria-pressed",
      String(manualForMode === "front")
    );

    diagonalButton.setAttribute(
      "aria-pressed",
      String(manualForMode === "diagonal")
    );

    sideButton.setAttribute(
      "aria-pressed",
      String(manualForMode === (hookMode ? "overhead" : "side"))
    );

    label.textContent =
      `${automatic ? "自動" : "手動"}・` +
      (
        view === "overhead"
          ? "上から"
          : view === "side"
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

