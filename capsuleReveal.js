
/**
 * MINI CRANE — 景品一覧 + カプセル開封演出
 * 1等×1 / 2等×1 / 3等×1 / ハズレ×3
 *
 * 景品が決まったら PRIZE_INFO の prize を変更するだけ。
 * main.js、index.html、style.css の変更は不要。
 */

// ==========================================
// 1. 景品設定
// ==========================================

export const PRIZE_INFO = {
  1: { label: "1等", prize: "" },
  2: { label: "2等", prize: "" },
  3: { label: "3等", prize: "" },
  4: { label: "ハズレ", prize: "" }
};

function rankLabel(rank) {
  return PRIZE_INFO[rank]?.label ?? "不明";
}

function resultLabel(rank) {
  const info = PRIZE_INFO[rank];

  if (!info) return "不明";

  return info.prize
    ? `${info.label}：${info.prize}`
    : info.label;
}

// ==========================================
// 2. ゲーム画面の景品一覧
// ==========================================

function installPrizeBoard() {
  if (document.getElementById("mini-prize-board")) {
    return;
  }

  const style = document.createElement("style");

  style.id = "mini-prize-board-style";

  style.textContent = `
    .mini-prize-board {
      position: fixed;
      top: 92px;
      right: 13px;
      z-index: 8;
      box-sizing: border-box;
      width: 244px;
      max-width: calc(100vw - 20px);
      padding: 0;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,.95);
      border-radius: 15px;
      color: #59446a;
      background: rgba(255,250,255,.95);
      box-shadow: 0 8px 24px rgba(66,38,84,.18);
      backdrop-filter: blur(8px);
      font-family: "Yu Gothic",
        "Hiragino Kaku Gothic ProN", sans-serif;
    }

    .mini-prize-board > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 10px 12px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 900;
      list-style: none;
      user-select: none;
    }

    .mini-prize-board > summary::-webkit-details-marker {
      display: none;
    }

    .mini-prize-board > summary::after {
      content: "▾";
      color: #a27aa5;
    }

    .mini-prize-board:not([open]) > summary::after {
      content: "▸";
    }

    .mini-prize-board > summary:focus-visible {
      outline: 3px solid #a06fcb;
      outline-offset: -3px;
    }

    .mini-prize-board-list {
      display: grid;
      gap: 6px;
      padding: 0 10px 10px;
      margin: 0;
      list-style: none;
    }

    .mini-prize-board-item {
      display: flex;
      gap: 8px;
      align-items: center;
      min-width: 0;
      padding: 7px 8px;
      border-radius: 9px;
      background: #f5edf8;
      font-size: 12px;
    }

    .mini-prize-board-rank {
      flex: 0 0 auto;
      min-width: 42px;
      padding: 4px 6px;
      border-radius: 7px;
      text-align: center;
      font-weight: 900;
      color: #37313e;
    }

    .mini-prize-board-rank.rank-1 {
      background: #ffe18a;
    }

    .mini-prize-board-rank.rank-2 {
      background: #d9e2ed;
    }

    .mini-prize-board-rank.rank-3 {
      background: #e5b78f;
    }

    .mini-prize-board-rank.rank-4 {
      background: #dce0e7;
    }

    .mini-prize-board-name {
      min-width: 0;
      overflow-wrap: anywhere;
      font-weight: 750;
    }

    .mini-prize-board-note {
      padding: 0 11px 10px;
      font-size: 10px;
      line-height: 1.5;
      color: #81708d;
    }

    .reveal-rank.is-miss {
      color: #777b88;
    }

    @media (max-width: 720px) {
      .mini-prize-board {
        top: 85px;
        right: 7px;
        width: 205px;
        max-width: 58vw;
      }

      .mini-prize-board > summary {
        padding: 8px 10px;
        font-size: 12px;
      }

      .mini-prize-board-item {
        gap: 5px;
        padding: 6px;
        font-size: 11px;
      }

      .mini-prize-board-rank {
        min-width: 37px;
        padding: 4px;
      }
    }
  `;

  document.head.appendChild(style);

  const board = document.createElement("details");

  board.id = "mini-prize-board";
  board.className = "mini-prize-board";

  // PCは展開、スマホは折り畳んで表示
  board.open = window.innerWidth > 720;

  const header = document.createElement("summary");
  header.textContent = "🎁 景品一覧";

  board.appendChild(header);

  const list = document.createElement("ul");
  list.className = "mini-prize-board-list";

  for (const rank of [1, 2, 3, 4]) {
    const info = PRIZE_INFO[rank];

    const item = document.createElement("li");
    item.className = "mini-prize-board-item";

    const badge = document.createElement("span");
    badge.className =
      `mini-prize-board-rank rank-${rank}`;
    badge.textContent = info.label;

    const name = document.createElement("span");
    name.className = "mini-prize-board-name";

    name.textContent = rank === 4
      ? "景品なし"
      : info.prize || "景品未定";

    item.append(badge, name);
    list.appendChild(item);
  }

  const note = document.createElement("div");
  note.className = "mini-prize-board-note";

  note.textContent =
    "封入数：1～3等は各1個、ハズレ3個。" +
    "中身は開封まで秘密！";

  board.append(list, note);
  document.body.appendChild(board);
}

// ==========================================
// 3. カプセル開封演出
// ==========================================

export function createCapsuleReveal({
  onNextPlayer,
  getMaxPlays = () => 5,
  getNextMaxPlays = getMaxPlays
}) {
  const overlay =
    document.getElementById("capsule-reveal");

  const title =
    document.getElementById("reveal-title");

  const description =
    document.getElementById("reveal-description");

  const stage =
    document.getElementById("reveal-opening-stage");

  const progress =
    document.getElementById("reveal-progress");

  const capsule =
    document.getElementById("reveal-capsule");

  const ticket =
    document.getElementById("reveal-ticket-label");

  const rankResult =
    document.getElementById("reveal-rank");

  const hint =
    document.getElementById("reveal-hint");

  const next =
    document.getElementById("reveal-next");

  const summary =
    document.getElementById("reveal-summary");

  const summaryCount =
    document.getElementById("reveal-summary-count");

  const resultList =
    document.getElementById("reveal-result-list");

  const nextPlayer =
    document.getElementById("reveal-next-player");

  // 景品一覧の表示を追加
  installPrizeBoard();

  let ranks = [];
  let index = 0;
  let phase = "closed";
  let revealTimer = null;

  function clearTimer() {
    if (revealTimer !== null) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }
  }

  // ==========================================
  // 次のカプセル
  // ==========================================

  function showNextCapsule() {
    clearTimer();
    phase = "closed";

    stage.hidden = false;
    summary.hidden = true;

    capsule.classList.remove("is-open");
    capsule.disabled = false;

    ticket.textContent = "？";
    rankResult.textContent = "";
    rankResult.className = "reveal-rank";

    progress.textContent =
      `${index + 1} / ${ranks.length}`;

    hint.textContent =
      "黒カプセルをタップして開封！";

    next.hidden = true;

    capsule.focus({
      preventScroll: true
    });
  }

  // ==========================================
  // 結果一覧
  // ==========================================

  function showSummary() {
    clearTimer();
    phase = "summary";

    stage.hidden = true;
    summary.hidden = false;

    title.textContent = "抽選結果発表！";

    description.textContent =
      `${getMaxPlays()}回のプレイ、おつかれさま！`;

    summaryCount.textContent = ranks.length
      ? `獲得カプセル：${ranks.length}個 / ${getMaxPlays()}回`
      : `獲得カプセル：0個 / ${getMaxPlays()}回　またチャレンジ！`;

    resultList.replaceChildren();

    for (const [i, rank] of ranks.entries()) {
      const li = document.createElement("li");
      li.className = `rank-${rank}`;

      const number = document.createElement("span");
      number.className = "result-index";
      number.textContent = `GET ${i + 1}`;

      const award = document.createElement("span");

      // 1〜3等は景品名も表示できる
      // 4は「ハズレ」と表示する
      award.textContent = resultLabel(rank);

      li.append(number, award);
      resultList.appendChild(li);
    }

    nextPlayer.textContent =
      `次の人へ（新しい${getNextMaxPlays()}回）`;

    nextPlayer.focus({
      preventScroll: true
    });
  }

  // ==========================================
  // カプセル開封
  // ==========================================

  function openCapsule() {
    if (phase !== "closed") return;

    phase = "opening";
    capsule.disabled = true;

    const rank = ranks[index];
    const info = PRIZE_INFO[rank];

    ticket.textContent = rankLabel(rank);

    capsule.classList.add("is-open");

    hint.textContent = "開封中…";

    clearTimer();

    revealTimer = window.setTimeout(() => {
      revealTimer = null;

      if (phase !== "opening") return;

      phase = "opened";

      rankResult.className =
        `reveal-rank ${
          rank === 1
            ? "is-first"
            : rank === 2
              ? "is-second"
              : rank === 4
                ? "is-miss"
                : ""
        }`;

      if (rank === 4) {
        // ハズレ
        rankResult.textContent =
          "😢 ハズレ！";

        hint.textContent =
          "今回はハズレ！ 次のカプセルにも期待！";

      } else {
        // 1〜3等
        rankResult.textContent =
          `🎉 ${rankLabel(rank)}！`;

        hint.textContent = info.prize
          ? `獲得景品：${info.prize}`
          : "カプセルの中から当たり券が出たよ！";
      }

      next.textContent =
        index === ranks.length - 1
          ? "結果一覧を見る"
          : "次のカプセルへ";

      next.hidden = false;

      next.focus({
        preventScroll: true
      });

    }, 690);
  }

  capsule.addEventListener(
    "click",
    openCapsule
  );

  next.addEventListener("click", () => {
    if (phase !== "opened") return;

    index++;

    if (index >= ranks.length) {
      showSummary();
    } else {
      showNextCapsule();
    }
  });

  nextPlayer.addEventListener("click", () => {
    if (phase !== "summary") return;

    hide();
    onNextPlayer();
  });

  // ==========================================
  // 開封画面の表示
  // ==========================================

  function show(wonRanks) {
    if (!overlay.hidden) return;

    // 1等・2等・3等・ハズレだけ有効
    ranks = (
      Array.isArray(wonRanks) ? wonRanks : []
    ).filter(
      v =>
        Number.isInteger(v) &&
        v >= 1 &&
        v <= 4
    );

    index = 0;
    overlay.hidden = false;

    title.textContent =
      `${getMaxPlays()}回プレイ終了！`;

    description.textContent = ranks.length
      ? `${ranks.length}個ゲット！ まとめて開封しよう！`
      : "今回はカプセルを獲得できなかったよ";

    if (ranks.length === 0) {
      showSummary();
    } else {
      showNextCapsule();
    }
  }

  // ==========================================
  // 開封画面を閉じる
  // ==========================================

  function hide() {
    clearTimer();

    overlay.hidden = true;
    capsule.classList.remove("is-open");

    ranks = [];
    index = 0;
    phase = "closed";
  }

  return {
    show,
    hide,
    isVisible: () => !overlay.hidden
  };
}
