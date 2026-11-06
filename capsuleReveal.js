/**
 * MINI CRANE
 * カプセル開封演出
 */

export function createCapsuleReveal({
  onNextPlayer,
  getMaxPlays = () => 5,
  getNextMaxPlays = getMaxPlays
}) {
  const overlay = document.getElementById("capsule-reveal");
  const title = document.getElementById("reveal-title");
  const description = document.getElementById("reveal-description");
  const stage = document.getElementById("reveal-opening-stage");
  const progress = document.getElementById("reveal-progress");
  const capsule = document.getElementById("reveal-capsule");
  const ticket = document.getElementById("reveal-ticket-label");
  const rankResult = document.getElementById("reveal-rank");
  const hint = document.getElementById("reveal-hint");
  const next = document.getElementById("reveal-next");
  const summary = document.getElementById("reveal-summary");
  const summaryCount = document.getElementById("reveal-summary-count");
  const resultList = document.getElementById("reveal-result-list");
  const nextPlayer = document.getElementById("reveal-next-player");

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
    capsule.focus({ preventScroll: true });
  }

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
      award.textContent = `${rank}等`;

      li.append(number, award);
      resultList.append(li);
    }

    nextPlayer.textContent = `次の人へ（新しい${getNextMaxPlays()}回）`;
    nextPlayer.focus({ preventScroll: true });
  }

  function openCapsule() {
    if (phase !== "closed") return;

    phase = "opening";
    capsule.disabled = true;

    const rank = ranks[index];

    ticket.textContent = `${rank}等`;
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
              : ""
        }`;

      rankResult.textContent = `🎉 ${rank}等！`;

      hint.textContent =
        "カプセルの中から当たり券が出たよ！";

      next.textContent =
        index === ranks.length - 1
          ? "結果一覧を見る"
          : "次のカプセルへ";

      next.hidden = false;
      next.focus({ preventScroll: true });

    }, 690);
  }

  capsule.addEventListener("click", openCapsule);

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

  function show(wonRanks) {
    if (!overlay.hidden) return;

    ranks = wonRanks.filter(
      v => Number.isInteger(v) && v >= 1 && v <= 6
    );

    index = 0;
    overlay.hidden = false;

    title.textContent = `${getMaxPlays()}回プレイ終了！`;

    description.textContent = ranks.length
      ? `${ranks.length}個ゲット！ まとめて開封しよう！`
      : "今回はカプセルを獲得できなかったよ";

    if (ranks.length === 0) {
      showSummary();
    } else {
      showNextCapsule();
    }
  }

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
