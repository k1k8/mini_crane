
import {
  loginMiniCraneAdmin,
  logoutMiniCraneAdmin,
  watchAdminLogin,
  watchSharedSettings,
  saveSharedSettings
} from "./firebaseAdmin.js";
import { auth } from "./firebaseConfig.js";

// Firebase Authentication > Users の管理者UID
const ADMIN_UID = "ここに管理者UIDを貼る";

export function createCloudAdminUI({
  getSettings, onSave, canManage,
  getPrizes, capsuleY, saveCapsules
}) {
  const panel = document.querySelector(".mini-extra-panel");
  if (!panel) {
    throw new Error("設定パネルが見つかりません");
  }

  // 全端末でゲーム設定を共有
  watchSharedSettings(data => {
    const maxPlays = Number(data.maxPlays);
    const holdPercent = Number(data.holdPercent);
    const armSpeed = Number(data.armSpeed);

    onSave({
      maxPlays: Number.isFinite(maxPlays)
        ? Math.min(10, Math.max(1, Math.round(maxPlays))) : 5,
      holdPercent: Number.isFinite(holdPercent)
        ? Math.min(100, Math.max(0, holdPercent)) : 35,
      armSpeed: Number.isFinite(armSpeed)
        ? Math.min(1.5, Math.max(0.5, armSpeed)) : 1
    });
  }, error => console.error("共通設定の読込エラー", error));

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "🔒 管理者ログイン";
  button.style.cssText =
    "width:100%;margin-top:14px;padding:11px;" +
    "border:1px solid #bd80bc;border-radius:10px;" +
    "background:#f4e4f6;color:#683e78;" +
    "font-weight:800;cursor:pointer";
  panel.append(button);

  const style = document.createElement("style");
  style.textContent = `
    .mini-admin-dialog {
      box-sizing:border-box;
      width:min(430px,calc(100vw - 24px));
      max-height:90vh;
      overflow:auto;
      border:2px solid white;
      border-radius:18px;
      padding:20px;
      background:#fffaff;
      color:#543866;
      box-shadow:0 15px 40px #25152c66;
      font:inherit;
    }
    .mini-admin-dialog::backdrop {
      background:#1c1028b9;
    }
    .mini-admin-dialog h2 {
      margin:0 0 14px;
      font-size:20px;
    }
    .mini-admin-dialog label {
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      margin:12px 0;
      font-size:13px;
      font-weight:800;
    }
    .mini-admin-dialog input {
      box-sizing:border-box;
      width:53%;
      padding:9px;
      border:1px solid #ceb3d2;
      border-radius:9px;
      font:inherit;
    }
    .mini-admin-dialog button {
      padding:10px;
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
      margin-top:15px;
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
    <section id="cloud-login-screen">
      <h2>🔒 MINI CRANE 管理者ログイン</h2>
      <form id="cloud-login-form">
        <label>メールアドレス
          <input type="email" name="email"
            autocomplete="username" required>
        </label>
        <label>パスワード
          <input type="password" name="password"
            autocomplete="current-password" required>
        </label>
        <p class="status" id="cloud-login-status"></p>
        <div class="actions">
          <button type="button" data-close>閉じる</button>
          <button class="primary" type="submit">ログイン</button>
        </div>
      </form>
    </section>

    <section id="cloud-settings-screen" hidden>
      <h2>⚙ MINI CRANE 管理者設定</h2>
      <form id="cloud-settings-form">
        <label>1人のプレイ回数
          <input type="number" name="maxPlays"
            min="1" max="10" step="1" required>
        </label>
        <label>保持成功率（%）
          <input type="number" name="holdPercent"
            min="0" max="100" step="1" required>
        </label>
        <label>アーム速度
          <input type="range" name="armSpeed"
            min="0.5" max="1.5" step="0.1">
        </label>
        <p id="cloud-speed-label"></p>
        <p style="font-size:12px">
          プレイ途中の回数変更は次の人から反映します。
        </p>
        <p class="status" id="cloud-settings-status"></p>
        <div class="actions">
          <button type="button" id="cloud-gather">
            カプセルを中央へ
          </button>
          <button type="button" id="cloud-logout">
            ログアウト
          </button>
          <button type="button" data-close>閉じる</button>
          <button class="primary" type="submit">設定保存</button>
        </div>
      </form>
    </section>
  `;
  document.body.append(dialog);

  const $ = selector => dialog.querySelector(selector);
  const loginForm = $("#cloud-login-form");
  const settingsForm = $("#cloud-settings-form");

  const isAdmin = () => auth.currentUser?.uid === ADMIN_UID;
  const speedInput = settingsForm.elements.namedItem("armSpeed");

  function updateSpeed() {
    $("#cloud-speed-label").textContent =
      `速度：${Number(speedInput.value).toFixed(1)}倍`;
  }
  speedInput.addEventListener("input", updateSpeed);

  for (const name of ["keydown", "keyup"]) {
    dialog.addEventListener(name, event => {
      event.stopPropagation();
    });
  }

  dialog.querySelectorAll("[data-close]").forEach(el => {
    el.addEventListener("click", () => dialog.close());
  });

  function renderScreen() {
    const admin = isAdmin();
    $("#cloud-login-screen").hidden = admin;
    $("#cloud-settings-screen").hidden = !admin;

    if (admin) {
      const v = getSettings();
      settingsForm.elements.namedItem("maxPlays").value =
        v.maxPlays;
      settingsForm.elements.namedItem("holdPercent").value =
        v.holdPercent;
      speedInput.value = v.armSpeed;
      updateSpeed();
    }
  }

  watchAdminLogin(() => {
    if (dialog.open) renderScreen();
  });

  button.addEventListener("click", () => {
    if (!canManage()) {
      alert("アームの待機中に開いてね。");
      return;
    }

    panel.hidden = true;
    document.getElementById("mini-settings")
      ?.setAttribute("aria-expanded", "false");

    $("#cloud-login-status").textContent = "";
    $("#cloud-settings-status").textContent = "";

    renderScreen();
    dialog.showModal();
  });

  // Firebase管理者ログイン
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    const submit = loginForm.querySelector('[type="submit"]');
    if (submit.disabled) return;

    submit.disabled = true;
    const status = $("#cloud-login-status");
    status.textContent = "認証中…";

    try {
      const user = await loginMiniCraneAdmin(
        loginForm.elements.namedItem("email").value.trim(),
        loginForm.elements.namedItem("password").value
      );

      if (user.uid !== ADMIN_UID) {
        await logoutMiniCraneAdmin();
        throw new Error("管理者権限がありません。");
      }

      loginForm.reset();
      status.textContent = "";
      renderScreen();
    } catch (error) {
      status.textContent =
        `ログインできませんでした：${error.message}`;
    } finally {
      submit.disabled = false;
    }
  });

  $("#cloud-logout").addEventListener("click", async () => {
    await logoutMiniCraneAdmin();
    renderScreen();
  });

  // Firestoreに共通設定を保存
  settingsForm.addEventListener("submit", async event => {
    event.preventDefault();

    const status = $("#cloud-settings-status");
    if (!isAdmin() || !canManage()) {
      status.textContent =
        "管理者でログインし、アームの待機中に操作してね。";
      return;
    }
    if (!settingsForm.reportValidity()) return;

    const values = {
      maxPlays: Number(
        settingsForm.elements.namedItem("maxPlays").value
      ),
      holdPercent: Number(
        settingsForm.elements.namedItem("holdPercent").value
      ),
      armSpeed: Number(speedInput.value)
    };

    try {
      status.textContent = "保存中…";
      await saveSharedSettings(values);
      status.textContent = "✅ 共通設定を保存したよ！";
    } catch (error) {
      status.textContent = `保存エラー：${error.message}`;
    }
  });

  // カプセルの中央集め（現在の端末のみ）
  $("#cloud-gather").addEventListener("click", () => {
    if (!isAdmin() || !canManage()) return;
    if (!confirm("この端末のカプセルを中央に集めますか？")) {
      return;
    }

    const items = getPrizes().filter(p => p.state === "floor");
    const layouts = {
      1: [[0, 0]],
      2: [[-0.53, 0], [0.53, 0]],
      3: [[-1.05, 0], [0, 0], [1.05, 0]],
      4: [
        [-0.53, -0.53], [0.53, -0.53],
        [-0.53, 0.53], [0.53, 0.53]
      ],
      5: [
        [-1.05, -0.53], [0, -0.53],
        [1.05, -0.53], [-0.53, 0.53], [0.53, 0.53]
      ],
      6: [
        [-1.05, -0.53], [0, -0.53], [1.05, -0.53],
        [-1.05, 0.53], [0, 0.53], [1.05, 0.53]
      ]
    };

    const points = layouts[items.length];
    const status = $("#cloud-settings-status");

    if (!points) {
      status.textContent = "移動できるカプセルがありません。";
      return;
    }

    items.forEach((p, i) => {
      const [x, z] = points[i];
      p.group.position.set(x, capsuleY, z);
      p.group.rotation.set(0, 0, 0);
      p.vx = p.vy = p.vz = p.spin = 0;
      p.homeX = p.lastFloorX = x;
      p.homeZ = p.lastFloorZ = z;
    });

    saveCapsules();
    status.textContent =
      `✅ ${items.length}個を中央に集めました。`;
  });
}

