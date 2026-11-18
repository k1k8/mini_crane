import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * MINI CLANE / HOOK MODE v20 — ヘッドをピンク、鎖・リングを3本爪と同じ銀色へ
 * 既存3本爪には触れず、main.jsの横/奥/昇降動作を共用する。
 * 物理エンジンではなく、振り子運動とリング面の接触判定を使う軽量な近似実装。
 * リングアーム: models/hook.glb (HookBase/HookChain)
 * 板側フック: models/question_hook.glb (ネジ部を短くしたゲーム用モデル)
 * 板側モデル読込前/失敗時には仮の「？」型フックを表示。
 * リング向きランダムは維持、板側フックは「左 or 右」の2方向に限定。
 * 各板の向きは景品を取るまで固定。保存済みの板は再読み込みしても変更しない。
 * 判定は軽量な接触近似（剛体物理ではない）：接触→掛かり→上昇→落下→獲得。
 * 3本爪・板側GLB・当たり抽選は維持。
 */
export function createHookMode({
  THREE, machine, crane, clawRig,
  onAward, onStatus, onModeChange, canSwitch
}) {
  const MODE_KEY = 'mini_clane_mode_v1';
  const SLOTS_KEY = 'mini_clane_hook_slots_v1';
  // リングGLB未読込時は元の仮リング用の高さを使う。
  const FALLBACK_DROP_Y = -1.77;
  // 拡大したリングGLBは、板の上にリングがめり込まない位置で下降を止める。
  const LARGE_ARM_DROP_Y = -1.63;
  const PANEL_Y = 4.62;
  const SLOT_X = [-1.58, 0, 1.58];
  const SLOT_Z = -0.36;
  const SUPPORT_Z = [-1.25, 0.54];
  const ARM_RING_LOCAL = new THREE.Vector3(0, -0.45, 0);
  // 板(幅0.90)を貫かないよう、リングを直径約0.46に小型化。
  // 以前の半径0.33～0.35から変更。見た目と接触判定を共通管理。
  const RING_DISPLAY_RADIUS = 0.23;
  const RING_WIRE_RADIUS = 0.014;
  let RING_RADIUS = RING_DISPLAY_RADIUS;

  let mode = 'claw';
  try {
    if (localStorage.getItem(MODE_KEY) === 'hook') mode = 'hook';
  } catch {}

  const world = new THREE.Group();
  world.name = 'mini-hook-stage-v4';
  machine.add(world);

  // 吊り元は固定、チェーンとリングだけ振り子運動する。
  const hookRoot = new THREE.Group();
  hookRoot.name = 'mini-ring-tool-v4';
  clawRig.add(hookRoot);
  const pendulum = new THREE.Group();
  pendulum.name = 'mini-hook-pendulum';
  hookRoot.add(pendulum);

  // 振り子の揺れ軸とリング自体の向きを分ける。
  // Y回転をpendulumに付けると、リングの向きがランダムなとき
  // 「横移動の揺れ」が斜めや奥方向に回ってしまうため。
  const randomRingFacing = () => Math.random() * Math.PI * 2;
  let ringFacingAngle = randomRingFacing();
  pendulum.rotation.order = 'YXZ';
  const ringFacingGroup = new THREE.Group();
  ringFacingGroup.name = 'RingFacingOnly';
  pendulum.add(ringFacingGroup);
  ringFacingGroup.rotation.y = ringFacingAngle;

  // 3本爪(main.js)と同じ金属カラーを共用する。
  // MAT.silver = 0xc1cbd5 / MAT.chrome = 0xe0e5ee
  const silver = new THREE.MeshStandardMaterial({
    color: 0xc1cbd5, metalness: 0.84, roughness: 0.22
  });
  const chrome = new THREE.MeshStandardMaterial({
  color: 0x151515,metalness: 0.65,roughness: 0.28
});
  // 本体ヘッドは3本爪台に使われているピンク系と同じ色。
  const headPink = new THREE.MeshStandardMaterial({
    color: 0xf2a8d2, metalness: 0.30, roughness: 0.32
  });
  // フックは実機写真の真鍮色。リング側は銀色のまま。
  const hookGold = new THREE.MeshStandardMaterial({
    color: 0xc2a65a, metalness: 0.8, roughness: 0.24
  });
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x78849a, metalness: 0.74, roughness: 0.27
  });
  const boardMats = [0xd7a3e6, 0x8fe2f0, 0xf5b4d8].map(color =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.42 })
  );
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x191b25, metalness: 0.12, roughness: 0.31
  });
  const seamMat = new THREE.MeshStandardMaterial({
    color: 0x565a67, metalness: 0.4, roughness: 0.35
  });

  function rod(parent, start, end, radius, material) {
    const direction = end.clone().sub(start);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, direction.length(), 12),
      material
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), direction.normalize()
    );
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // 上部透明カバー。ここは揺れない。
  const housing = new THREE.Group();
  housing.name = 'HookBase';
  hookRoot.add(housing);
  const cover = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.45, 18),
    new THREE.MeshPhysicalMaterial({
      color: 0xf2a8d2, metalness: 0.22, roughness: 0.29,
      transparent: true, opacity: 0.84, depthWrite: false
    })
  );
  cover.rotation.z = Math.PI / 2;
  housing.add(cover);
  for (const x of [-0.23, 0.23]) {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.045, 18), silver
    );
    cap.rotation.z = Math.PI / 2;
    cap.position.x = x;
    housing.add(cap);
  }

  function fitSpan(mesh, start, end) {
    const delta = end.clone().sub(start);
    const length = Math.max(0.0001, delta.length());
    mesh.position.copy(start).addScaledVector(delta, 0.5);
    mesh.scale.set(1, length, 1);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), delta.normalize()
    );
  }

  const guideCord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 1, 8),
    new THREE.MeshStandardMaterial({
      color: 0xc1cbd5, metalness: 0.58, roughness: 0.28
    })
  );
  guideCord.name = 'RingGuideCord';
  guideCord.castShadow = false;
  guideCord.receiveShadow = false;
  hookRoot.add(guideCord);

  const guideSleeve = new THREE.Mesh(
    new THREE.TorusGeometry(0.038, 0.007, 8, 18), chrome
  );
  guideSleeve.rotation.x = Math.PI / 2;
  hookRoot.add(guideSleeve);

  // 初期モデル生成より先に宣言する。ここが後ろにあると
  // rebuildChainVisual() で TDZ ReferenceError が発生し描画が停止する。
  let glbInstalled = false;
  let guideStartY = -0.18;
  const chainVisual = new THREE.Group();
  chainVisual.name = 'mini-ring-chain-visual';
  ringFacingGroup.add(chainVisual);
  let ringVisual = null; // 板への衝突判定にはこの実際のメッシュを使う

  function rebuildChainVisual() {
    for (const obj of chainVisual.children) obj.geometry?.dispose();
    chainVisual.clear();
    const linkCount = glbInstalled ? 11 : 10;
    const linkRadius = glbInstalled ? 0.050 : 0.046;
    const linkTube = 0.010;
    const linkStep = glbInstalled ? 0.062 : 0.058;
    const startY = -0.08;
    for (let i = 0; i < linkCount; i++) {
      const link = new THREE.Mesh(
        new THREE.TorusGeometry(linkRadius, linkTube, 6, 18), chrome
      );
      link.position.y = startY - i * linkStep;
      link.scale.set(0.82, 1.16, 1);
      link.rotation.y = (i % 2) * Math.PI / 2;
      link.castShadow = true;
      chainVisual.add(link);
    }

    const ringRadius = RING_DISPLAY_RADIUS;
    const ringTube = RING_WIRE_RADIUS; // 細い金属リング
    const lastLinkY = startY - (linkCount - 1) * linkStep;
    // 鎖がリング中心を突き抜けないよう、リング中心は少し下へ。
    const connectorTopY = lastLinkY - 0.04;
    const ringY = connectorTopY - ringRadius - 0.02;

    const connector = new THREE.Mesh(
      new THREE.TorusGeometry(0.034, 0.008, 6, 18), chrome
    );
    connector.position.set(0, connectorTopY - 0.01, 0);
    connector.scale.set(0.76, 1.24, 1);
    connector.rotation.x = Math.PI / 2;
    connector.castShadow = true;
    chainVisual.add(connector);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, ringTube, 12, 64), chrome
    );
    ring.name = 'HookRing';
    ringVisual = ring;
    ring.position.set(0, ringY, 0);
    ring.castShadow = true;
    chainVisual.add(ring);

    ARM_RING_LOCAL.set(0, ringY, 0);
    RING_RADIUS = ringRadius;
  }

  // まずはGLBがなくても遊べるように、仮のカバー＋長めのチェーンを表示する。
  pendulum.position.y = -0.22;
  rebuildChainVisual();

  // ===== 17. MeshyのリングアームGLBを表示する =====
  // head部分はGLBを使い、その下はゲーム向けに長さを調整した
  // 軽量な鎖・リングで再構成する。これで「ちぎれて見える」見た目を避け、
  // ヘッド下のガイド紐に沿って鎖が左右へ流れるように見せる。
  const MODEL_SCALE = new THREE.Vector3(1.22, 1.00, 1.22);
  const MODEL_BASE_Y = -0.55;
  const MODEL_JOINT_Y = -0.27;

  function updateGuideCord() {
    const start = new THREE.Vector3(0, guideStartY, 0);
    const end = pendulum.position.clone().add(
      new THREE.Vector3(0, -0.03, 0)
        .applyEuler(pendulum.rotation)
    );
    guideSleeve.position.set(0, guideStartY, 0);
    fitSpan(guideCord, start, end);
  }
  updateGuideCord();

  function useGLB(gltfScene) {
    if (!gltfScene || glbInstalled) return false;
    const baseMesh = gltfScene.getObjectByName('HookBase')
      || gltfScene.getObjectByName('HookHead')
      || gltfScene.getObjectByName('Node')
      || gltfScene.getObjectByName('Object_0')
      || gltfScene.scene?.children?.find(obj => obj.isMesh)
      || gltfScene.children?.find(obj => obj.isMesh);
    if (!baseMesh?.isMesh) {
      console.warn('hook.glbからヘッド部分を取得できませんでした。');
      return false;
    }

    const staticModel = new THREE.Group();
    staticModel.name = 'RingArmFixedHousing';
    staticModel.scale.copy(MODEL_SCALE);
    staticModel.position.y = MODEL_BASE_Y;
    staticModel.add(baseMesh);

    // Meshy製ヘッドの元テクスチャ色に左右されず、
    // 3本爪台と同じピンク系の塗装として表示する。
    // ジオメトリは変えず、チェーンやリングには塗装を適用しない。
    baseMesh.material = headPink;

    baseMesh.frustumCulled = false;
    baseMesh.castShadow = false;
    baseMesh.receiveShadow = false;

    hookRoot.add(staticModel);
    housing.visible = false;
    glbInstalled = true;

    pendulum.position.y = MODEL_JOINT_Y;
    guideStartY = -0.39;
    rebuildChainVisual();
    updateGuideCord();
    clearContact();
    console.info('⭕ Meshyリングアームを使用：ヘッド固定＋長めのチェーン＋細いリングに調整しました。');
    return true;
  }

  // HOOKモードのときだけ底面全体を白い取り出し口にする。
  const opening = new THREE.Mesh(
    new THREE.PlaneGeometry(5.27, 3.94),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide, depthWrite: true
    })
  );
  opening.rotation.x = -Math.PI / 2;
  opening.position.set(0, 3.25, 0); // 黒い景品が見やすい白色の底面
  world.add(opening);
  const outerRim = new THREE.MeshStandardMaterial({
    color: 0xe676bc, metalness: 0.38, roughness: 0.32
  });
  for (const x of [-2.66, 2.66]) {
    rod(world, new THREE.Vector3(x, 3.24, -2.02),
      new THREE.Vector3(x, 3.24, 2.02), 0.042, outerRim);
  }
  for (const z of [-2.02, 2.02]) {
    rod(world, new THREE.Vector3(-2.66, 3.24, z),
      new THREE.Vector3(2.66, 3.24, z), 0.042, outerRim);
  }

  // 横棒2本に3枚の水平板を渡す（橋渡し設定）。
  for (const z of SUPPORT_Z) {
    rod(world, new THREE.Vector3(-2.45, 4.50, z),
      new THREE.Vector3(2.45, 4.50, z), 0.075, railMat);
    for (const x of [-2.37, 2.37]) {
      rod(world, new THREE.Vector3(x, 3.30, z),
        new THREE.Vector3(x, 4.50, z), 0.065, railMat);
    }
  }

  // 各板1～2本。フックの開口方向は正面から見て左 or 右の2通りのみ。
  // GLB側のローカル -X を開口方向として、0=左・PI=右。
  const LEFT = 0;
  const RIGHT = Math.PI;
  const isRight = () => Math.random() < 0.5;
  const randomLR = () => isRight() ? RIGHT : LEFT;
  const snapLR = angle => Math.cos(angle) >= 0 ? LEFT : RIGHT;

  function randomHooks(baseAngle = randomLR()) {
    const two = Math.random() < 0.68;
    const offsets = two ? [-0.43, 0.43] : [0];
    return offsets.map((z, index) => ({
      z,
      angle: index === 0 ? baseAngle : (baseAngle === LEFT ? RIGHT : LEFT)
    }));
  }

  function makeRandomBoardHooks() {
    // 3枚すべて同じ向きになるのを避け、必ず左右を混在させる。
    const directions = [LEFT, RIGHT, randomLR()];
    for (let i = directions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }
    return directions.map(randomHooks);
  }

  // 18. Meshy製の板側「？」フックを一度だけ読み込み、全ての板で共有。
  // shape/materials are loaded from GLB; fixture rotation remains owned by game logic.
  let questionHookTemplate = null;

  function installQuestionHookGLB(fixture) {
    if (!questionHookTemplate || !fixture || fixture.userData.hasQuestionHookGLB) {
      return false;
    }

    const replacement = questionHookTemplate.clone(true);
    replacement.name = 'QuestionHookMeshyModel';
    replacement.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = false;
      // Geometry is shared across instances: never dispose on board reset.
      object.userData.questionHookShared = true;
    });
    fixture.add(replacement);

    // GLB has loaded successfully: remove the old procedural shape.
    for (const child of [...fixture.children]) {
      if (child === replacement) continue;
      if (child.name !== 'QuestionHookMetal' &&
          child.name !== 'QuestionHookMount') continue;
      child.removeFromParent();
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        for (const mat of child.material) {
          if (mat !== hookGold) mat?.dispose();
        }
      } else if (child.material !== hookGold) {
        child.material?.dispose();
      }
    }
    fixture.userData.hasQuestionHookGLB = true;
    return true;
  }

  function createQuestionHook(boardRoot, zOffset, angle) {
    const fixture = new THREE.Group();
    // 2本のときは真正面から重なり「渦巻き」に見えないよう、
    // 少し左右に振り分ける。1本だけのときは板の中央に置く。
    const sideOffset = zOffset < -0.1 ? -0.18 : zOffset > 0.1 ? 0.18 : 0;
    fixture.position.set(sideOffset, 0, zOffset);
    // フックの向きは板ごとのランダム値を保ち、景品が取れるまで固定。
    fixture.rotation.y = angle;
    boardRoot.add(fixture);

    const vec = (x, y) => new THREE.Vector3(x, y, 0);
    const curve = new THREE.CurvePath();

    // 根元は板の中から真上に立つ。板の上面は y=0.05。
    // 「・」に当たる固定部は板の内側に隠す。
    curve.add(new THREE.LineCurve3(
      vec(0, -0.055), vec(0, 0.135)
    ));

    // ここから「？」の本体。内側に巻き込まず、緩やかに外へ曲がる。
    curve.add(new THREE.CubicBezierCurve3(
      vec(0, 0.135),
      vec(0.000, 0.205),
      vec(0.078, 0.264),
      vec(0.144, 0.291)
    ));
    // 右側を持ち上げて大きく丸い頂点へ。
    curve.add(new THREE.CubicBezierCurve3(
      vec(0.144, 0.291),
      vec(0.233, 0.332),
      vec(0.232, 0.425),
      vec(0.151, 0.455)
    ));
    // 開口端は左下に向けて曲げる。輪のように閉じない。
    curve.add(new THREE.CubicBezierCurve3(
      vec(0.151, 0.455),
      vec(0.075, 0.487),
      vec(-0.035, 0.433),
      vec(-0.048, 0.347)
    ));

    const hook = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 80, 0.027, 12, false),
      hookGold
    );
    hook.name = 'QuestionHookMetal';
    hook.castShadow = true;
    fixture.add(hook);

    // 取付金具は板の表面より下。上から見て不自然に飛び出さない。
    const mount = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 12, 10), hookGold
    );
    mount.name = 'QuestionHookMount';
    mount.position.set(0, -0.021, 0);
    fixture.add(mount);
    // For any board created after the GLB is loaded, use the GLB immediately.
    installQuestionHookGLB(fixture);
    return fixture;
  }

  function createBoard(x, rank, index, config) {
    const root = new THREE.Group();
    root.name = `mini-hook-bridge-board-${index}`;
    root.position.set(x, PANEL_Y, SLOT_Z);
    world.add(root);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.90, 0.10, 2.00), boardMats[index % 3]
    );
    plate.castShadow = true;
    plate.receiveShadow = true;
    root.add(plate);

    const hooks = config.map(item => ({
      z: item.z,
      angle: item.angle,
      fixture: createQuestionHook(root, item.z, item.angle)
    }));

    rod(root, new THREE.Vector3(0, -0.06, -0.10),
      new THREE.Vector3(0, -0.43, -0.10), 0.021, silver);
    const capsule = new THREE.Group();
    capsule.position.set(0, -0.73, -0.10);
    root.add(capsule);
    const radius = 0.31;
    for (const [start, y] of [[0, 0.012], [Math.PI / 2, -0.012]]) {
      const half = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 24, 14,
          0, Math.PI * 2, start, Math.PI / 2), darkMat
      );
      half.position.y = y;
      half.castShadow = true;
      capsule.add(half);
    }
    const seam = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.97, 0.018, 8, 28), seamMat
    );
    seam.rotation.x = Math.PI / 2;
    capsule.add(seam);
    return { root, rank, index, hooks, state: 'ready', vy: 0 };
  }

  let slots = [];
  let held = null;
  let falling = [];
  let settling = [];
  let heldInfo = null;
  let contactCandidate = null;
  let contactAge = Infinity;
  let canDetectContact = true;
  let contactAnnounced = false;
  let rerollPending = false;

  function clearContact() {
    contactCandidate = null;
    contactAge = Infinity;
    canDetectContact = true;
    contactAnnounced = false;
  }

  function shuffledSlots() {
    // 景品は常に当たり1・はずれ2。同じ種類3個にはならない。
    const ranks = [1, 4, 4];
    for (let i = ranks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
    }
    const boardHooks = makeRandomBoardHooks();
    return ranks.map((rank, i) => ({
      rank, used: false, hooks: boardHooks[i]
    }));
  }

  function readSlots() {
    try {
      const data = JSON.parse(localStorage.getItem(SLOTS_KEY) || 'null');
      if (!Array.isArray(data) || data.length !== 3) return null;
      const ranks = data.map(item => item.rank).sort((a, b) => a - b);
      if (ranks.join(',') !== '1,4,4' ||
          !data.every(item => typeof item.used === 'boolean')) return null;
      // 旧v2のセーブデータは景品配置を維持し、フック設定だけ補う。
      return data.map(item => ({
        rank: item.rank,
        used: item.used,
        hooks: Array.isArray(item.hooks) &&
          item.hooks.length >= 1 && item.hooks.length <= 2 &&
          item.hooks.every(h => Number.isFinite(h.angle) &&
            Number.isFinite(h.z) && Math.abs(h.z) <= 0.6)
          ? item.hooks.map(h => ({ z: h.z, angle: snapLR(h.angle) }))
          : randomHooks()
      }));
    } catch { return null; }
  }

  function saveSlots() {
    try {
      localStorage.setItem(SLOTS_KEY, JSON.stringify(slots.map(item => ({
        rank: item.rank,
        used: item.state === 'used',
        hooks: item.hooks.map(h => ({ z: h.z, angle: h.angle }))
      }))));
    } catch {}
  }

  function buildSlots(data) {
    for (const old of slots) {
      old.root.traverse(object => {
        // Keep shared GLB geometry alive when refilling the three boards.
        if (object.geometry && !object.userData.questionHookShared) {
          object.geometry.dispose();
        }
      });
      old.root.removeFromParent();
    }
    slots = data.map((item, index) => {
      const slot = createBoard(SLOT_X[index], item.rank, index, item.hooks);
      if (item.used) {
        slot.state = 'used';
        slot.root.visible = false;
      }
      return slot;
    });
    saveSlots();
  }

  function ensureTargets() {
    if (!held && falling.length === 0 && settling.length === 0 &&
        slots.length === 3 && slots.every(slot => slot.state === 'used')) {
      buildSlots(shuffledSlots());
    }
  }

  // フックの向きは「景品が取れるまで固定」。
  // 次のプレイ前に未獲得フックの向きを変えない。
  function prepareNextAttempt() {
    if (held || falling.length || settling.length) {
      rerollPending = true;
      return;
    }
    rerollPending = false;
    clearContact();
    ensureTargets();
    saveSlots();
  }

  buildSlots(readSlots() || shuffledSlots());

  // The game itself works without this model: procedural hooks are the fallback.
  // The GLB is already scaled to the board and has its threaded base shortened.
  new GLTFLoader().load(
    './models/question_hook.glb',
    gltf => {
      const template = gltf.scene;
      let hasMesh = false;
      template.traverse(object => {
        if (object.isMesh) hasMesh = true;
      });
      if (!hasMesh) {
        console.warn('question_hook.glb has no mesh; using procedural hooks.');
        return;
      }
      questionHookTemplate = template;
      for (const slot of slots) {
        for (const hook of slot.hooks) installQuestionHookGLB(hook.fixture);
      }
      console.info('🪝 板側MeshyフックGLBを設置しました。');
    },
    undefined,
    err => console.warn('板側question_hook.glbを読み込めません。仮フックを使います。', err)
  );

  let swingX = 0;
  let swingZ = 0;
  let swingVX = 0;
  let swingVZ = 0;
  let twist = 0;
  let twistSpeed = 0;
  let previousX = crane.position.x;
  let previousZ = crane.position.z;
  let previousVX = 0;
  let previousVZ = 0;

  // 右移動ボタンを押したタイミングの揺れ方向を反映。
  // swingZ > 0 = リングが右、swingZ < 0 = リングが左。
  // 大きさを瞬時に変えず、約0.28秒かけて滑らかに補正する。
  let wasMovingRight = false;
  let timingRemaining = 0;
  let timingLogScale = 0;
  const TIMING_DURATION = 0.28;

  // 横移動を終えて縦移動を待っているあいだは、慣性の横揺れを長く残す。
  // 「横を離す → 数秒待つ → 縦を押す」でも揺れが続くようにする。
  let waitingForVerticalMove = false;

  function resetSwing() {
    swingX = swingZ = swingVX = swingVZ = twist = twistSpeed = 0;
    previousX = crane.position.x;
    previousZ = crane.position.z;
    previousVX = previousVZ = 0;
    wasMovingRight = false;
    timingRemaining = 0;
    timingLogScale = 0;
    waitingForVerticalMove = false;
    // 揺れはリセット。リングの面のランダム向きは子グループで保持。
    pendulum.rotation.set(0, 0, 0, 'YXZ');
    ringFacingGroup.rotation.y = ringFacingAngle;
    updateGuideCord();
  }

  // ===== 接触・引っ掛かり判定（簡易物理） =====
  // GLBメッシュ同士の重い衝突演算は使わず、リングの面・半径と
  // フックの曲がり部分の位置・開口方向を毎フレーム照合する。
  const ringWorld = new THREE.Vector3();
  const hookWorld = new THREE.Vector3();
  const boardWorld = new THREE.Vector3();
  const ringNormal = new THREE.Vector3();
  const openDirection = new THREE.Vector3();
  const ringToHook = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const localHookPoint = new THREE.Vector3();
  const hookPointOnBoard = new THREE.Vector3();
  const localOpenDirection = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();

  function measureContact() {
    if (mode !== 'hook' || held || !canDetectContact) return null;
    machine.updateMatrixWorld(true);
    pendulum.localToWorld(ringWorld.copy(ARM_RING_LOCAL));
    // リングの面の向きだけはランダム角度を反映。
    ringNormal.set(0, 0, 1)
      .applyQuaternion(ringFacingGroup.getWorldQuaternion(tmpQuat)).normalize();
    let best = null;
    for (const slot of slots) {
      if (slot.state !== 'ready') continue;
      for (const hook of slot.hooks) {
        localHookPoint.set(
          questionHookTemplate ? 0.055 : 0.14,
          questionHookTemplate ? 0.298 : 0.365,
          0
        );
        hook.fixture.localToWorld(hookWorld.copy(localHookPoint));
        ringToHook.copy(hookWorld).sub(ringWorld);
        const planeOffset = ringToHook.dot(ringNormal);
        const planeDist = Math.abs(planeOffset);
        projected.copy(ringToHook).addScaledVector(ringNormal, -planeOffset);
        const radialDist = projected.length();
        const heightDist = Math.abs(ringToHook.y);

        // フックの開口方向。左向き/右向きの口からリングが入る必要がある。
        openDirection.set(-1, 0, 0).applyQuaternion(
          hook.fixture.getWorldQuaternion(new THREE.Quaternion())
        ).normalize();
        const openSide = ringWorld.clone().sub(hookWorld).dot(openDirection);

        // リングの内側なら何でもOKではなく、フックの曲がりが
        // リングの縁付近に入ったときだけ接触候補にする。
        const ringBandMin = Math.max(0.14, RING_RADIUS - 0.11);
        const ringBandMax = RING_RADIUS - 0.01;
        const ringBandGap = Math.abs(radialDist - (ringBandMin + ringBandMax) * 0.5);
        if (planeDist > 0.11 || radialDist < ringBandMin || radialDist > ringBandMax ||
            heightDist > 0.17 || openSide < 0.005) continue;

        const score =
          (1 - planeDist / 0.11) * 0.30 +
          (1 - ringBandGap / ((ringBandMax - ringBandMin) * 0.5)) * 0.34 +
          (1 - heightDist / 0.17) * 0.20 +
          THREE.MathUtils.clamp(openSide / 0.18, 0, 1) * 0.16;
        if (!best || score > best.score) {
          best = {
            slot,
            hook,
            score,
            hookWorld: hookWorld.clone(),
            hookPointLocal: localHookPoint.clone(),
            radialDist,
            openSide
          };
        }
      }
    }
    return best;
  }

  // ===== 板との接触（リングのすり抜け防止） =====
  // Torusの実際の円周をサンプリングし、横棒上の板の範囲に入った
  // リングが板の上面より下へ行かないようにする。
  // フックに掛かって板を持ち上げている間は干渉しない。
  const boardContactWorld = new THREE.Vector3();
  const boardContactLocal = new THREE.Vector3();
  const RING_CONTACT_POINTS = 36;
  const BOARD_TOP_MARGIN = 0.022;
  function preventBoardPenetration() {
    if (mode !== 'hook' || held || !ringVisual || clawRig.position.y > -1.0) {
      return;
    }
    machine.updateMatrixWorld(true);
    let deepest = 0;
    for (let i = 0; i < RING_CONTACT_POINTS; i++) {
      const a = (i / RING_CONTACT_POINTS) * Math.PI * 2;
      // TorusGeometryの中心線上の円周。金属棒の太さも下で考慮する。
      boardContactWorld.set(
        Math.cos(a) * RING_RADIUS,
        Math.sin(a) * RING_RADIUS,
        0
      );
      ringVisual.localToWorld(boardContactWorld);
      boardContactLocal.copy(boardContactWorld);
      machine.worldToLocal(boardContactLocal);
      for (const board of slots) {
        if (board.state !== 'ready') continue;
        // 横幅0.90 / 奥行2.00の板。縁の太さぶんだけ当たりを広げる。
        if (Math.abs(boardContactLocal.x - board.root.position.x) > 0.45 + RING_WIRE_RADIUS ||
            Math.abs(boardContactLocal.z - board.root.position.z) > 1.00 + RING_WIRE_RADIUS) {
          continue;
        }
        const upper = board.root.position.y + 0.05 + BOARD_TOP_MARGIN;
        const penetration = upper - (boardContactLocal.y - RING_WIRE_RADIUS);
        if (penetration > deepest) deepest = penetration;
      }
    }
    if (deepest > 0) {
      // main.jsの下降アニメーションはそのまま使い、フックモードでだけ補正。
      // 板の中へ入る代わりにリングを板の上で止める。
      clawRig.position.y += deepest;
      swingVX *= 0.87;
      swingVZ *= 0.87;
      machine.updateMatrixWorld(true);
    }
  }

  function recordContact(dt) {
    if (!canDetectContact) return;
    contactAge += dt;
    if (mode !== 'hook' || held || settling.length || falling.length) return;
    // 手を伸ばし切った近辺だけで計測し、上空の近接を誤判定しない。
    if (clawRig.position.y > -1.08) return;
    const contact = measureContact();
    if (contact) {
      // 下降中に触れた位置を閉じる待ち時間（0.72秒）まで記憶する。
      if (!contactCandidate || contact.score >= contactCandidate.score || contactAge > 0.45) {
        contactCandidate = contact;
      }
      contactAge = 0;
      if (!contactAnnounced) {
        contactAnnounced = true;
        onStatus?.('🪝 リングがフックに触れた！引き上げ判定中…');
      }
    }
  }

  function tryHook() {
    if (mode !== 'hook' || held) return false;
    canDetectContact = false;
    ensureTargets();

    // 真下まで下がった瞬間も測る。途中で触れた接触は1.2秒以内のみ有効。
    const direct = measureContactAtBottom();
    const recent = contactAge <= 1.20 &&
      contactCandidate?.slot.state === 'ready' ? contactCandidate : null;
    const candidate = direct && recent
      ? (direct.score >= recent.score ? direct : recent)
      : (direct || recent);
    contactCandidate = null;

    if (!candidate || candidate.score < 0.28) {
      onStatus?.('空振り！リングがフックの口にうまく入らなかった');
      return false;
    }
    const slot = candidate.slot;
    // 板上のフック接点位置を、板ローカル座標として覚える。
    candidate.hook.fixture.localToWorld(hookWorld.copy(candidate.hookPointLocal));
    slot.root.worldToLocal(hookPointOnBoard.copy(hookWorld));
    localOpenDirection.set(candidate.hook.angle === 0 ? -1 : 1, 0, 0);

    slot.state = 'held';
    held = slot;
    heldInfo = {
      score: candidate.score,
      liftReached: false,
      initialY: PANEL_Y,
      hookAngle: candidate.hook.angle,
      tilt: 0,
      hookPointOnBoard: hookPointOnBoard.clone(),
      openDirection: localOpenDirection.clone(),
      latchedDepth: THREE.MathUtils.clamp(candidate.openSide, 0.01, 0.16)
    };
    // 位置が合ったら初めて板を揺れるリングに追従させる。
    pendulum.attach(slot.root);
    // フックの曲がり部分がリングの縁に掛かった見た目に補正する。
    slot.root.rotation.set(0, 0, 0);
    const catchPoint = ARM_RING_LOCAL.clone()
      .addScaledVector(heldInfo.openDirection, -Math.min(0.11, RING_RADIUS * 0.34))
      .add(new THREE.Vector3(0, 0.03, 0));
    slot.root.position.copy(catchPoint).sub(heldInfo.hookPointOnBoard);
    onStatus?.('⭕ 引っ掛かった！板が横棒から持ち上がるか確認中…');
    return true;
  }

  function measureContactAtBottom() {
    // tryHook()直前はcanDetectContact=falseに切り替わるため、
    // 現在位置でもチェックできるよう一時的に有効にする。
    canDetectContact = true;
    const result = measureContact();
    canDetectContact = false;
    return result;
  }

  function slipFromHook() {
    if (!held) return;
    const slot = held;
    world.attach(slot.root);
    slot.state = 'settling';
    slot.vy = -0.25;
    settling.push(slot);
    held = null;
    heldInfo = null;
    onStatus?.('あっ！上昇中にリングがフックから抜けた…');
  }

  function release() {
    if (!held) return false;
    const slot = held;
    // 板が支持棒から浮いていなければ、GET判定に進めない。
    if (!heldInfo?.liftReached) {
      slipFromHook();
      return false;
    }
    machine.attach(slot.root);
    slot.state = 'falling';
    slot.vy = 0;
    falling.push(slot);
    held = null;
    heldInfo = null;
    onStatus?.('板とカプセルが白い底面の取り出し口へ落下中…');
    return true;
  }

  let repositionElapsed = 0;
  function update(delta) {
    const dt = Number.isFinite(delta)
      ? Math.max(0, Math.min(0.05, delta)) : 0;
    if (dt > 0) {
      const vx = THREE.MathUtils.clamp(
        (crane.position.x - previousX) / dt, -8, 8
      );
      const vz = THREE.MathUtils.clamp(
        (crane.position.z - previousZ) / dt, -8, 8
      );
      const ax = THREE.MathUtils.clamp((vx - previousVX) / dt, -28, 28);
      const az = THREE.MathUtils.clamp((vz - previousVZ) / dt, -28, 28);
      previousX = crane.position.x;
      previousZ = crane.position.z;
      previousVX = vx;
      previousVZ = vz;

      // ホームに戻った後も、残った揺れの位相をそのまま維持する。
      // +X方向への「動き始め」を右ボタン操作として検知する。
      // （ホームへの自動復帰は-X方向なので誤検知しない）
      const movingRight = vx > 0.10;
      if (mode === 'hook' && movingRight && !wasMovingRight) {
        const currentSide = Math.sin(swingZ);
        if (currentSide > 0.08) {
          // リングが右側なら、右移動で揺れをしっかり抑える。
          timingLogScale = Math.log(0.35);
          timingRemaining = TIMING_DURATION;
        } else if (currentSide < -0.08) {
          // リングが左側なら、右移動で揺れを強める。
          timingLogScale = Math.log(1.15);
          timingRemaining = TIMING_DURATION;
        } else {
          // 中央付近は移動の加速・停止による通常の物理反応のみ。
          timingRemaining = 0;
          timingLogScale = 0;
        }
      }
      wasMovingRight = movingRight;

      // 横移動が始まったら待機状態を開始。縦移動が始まるまでは保持。
      // 停止している間も下の振り子計算を毎フレーム続ける。
      const movingHorizontally = Math.abs(vx) > 0.10;
      const movingVertically = Math.abs(vz) > 0.10;
      if (mode === 'hook') {
        if (movingHorizontally) waitingForVerticalMove = true;
        if (movingVertically) waitingForVerticalMove = false;
      }

      // 振り子：台車の加速・急停止で揺れ、止まると徐々に収束。
      // 3本爪のclawRig.rotationとは別の運動なので干渉しない。
      if (mode === 'hook') {
        const naturalSq = 11.2; // 長めチェーンらしいゆったりした揺れ
        // 横移動を離して縦移動を待っているときだけ横揺れの減衰を弱める。
        // 押しっぱなしや奥移動では通常の慣性を保ち、前後揺れは従来どおり。
        const waitingAfterHorizontal = waitingForVerticalMove &&
          !movingHorizontally && !movingVertically;
        const horizontalDamping = waitingAfterHorizontal ? 0.12 : 0.60;
        const verticalDamping = 0.82;
        // X軸の横移動(ax) → Z軸回転(swingZ) → 左右の横揺れ。
        // Z軸の奥移動(az) → X軸回転(swingX) → 前後の縦揺れ。
        // 二方向を混ぜる外力は与えない。前の揺れが残っていれば自然に合成される。
        const accelZ = -naturalSq * Math.sin(swingZ)
          - horizontalDamping * swingVZ - 1.00 * ax;
        const accelX = -naturalSq * Math.sin(swingX)
          - verticalDamping * swingVX + 1.00 * az;
        swingVZ += accelZ * dt;
        swingVX += accelX * dt;
        swingZ += swingVZ * dt;
        swingX += swingVX * dt;

        // 横ボタンのタイミングによる揺れ調整は横揺れにだけ適用。
        if (timingRemaining > 0) {
          const portion = Math.min(dt, timingRemaining);
          const scale = Math.exp(timingLogScale * portion / TIMING_DURATION);
          swingZ *= scale;
          swingVZ *= scale;
          timingRemaining = Math.max(0, timingRemaining - portion);
        }

        swingZ = THREE.MathUtils.clamp(swingZ, -1.02, 1.02);
        swingX = THREE.MathUtils.clamp(swingX, -1.02, 1.02);
        if (Math.abs(swingZ) >= 1.02) swingVZ *= 0.33;
        if (Math.abs(swingX) >= 1.02) swingVX *= 0.33;
        // リングの面だけがねじれる。振り子の方向はY回転の影響を受けない。
        twistSpeed += (-3.3 * twist - 1.7 * twistSpeed +
          (ax - az) * 0.016 + (swingVX - swingVZ) * 0.10) * dt;
        twist = THREE.MathUtils.clamp(twist + twistSpeed * dt, -0.62, 0.62);
        pendulum.rotation.set(swingX, 0, swingZ, 'YXZ');
        ringFacingGroup.rotation.y = ringFacingAngle + twist;
        updateGuideCord();
        preventBoardPenetration();
        recordContact(dt);
      } else {
        resetSwing();
      }
    }

    // 接触後、板の持ち上がりと「抜け」を演算する。
    if (held && heldInfo) {
      machine.updateMatrixWorld(true);
      held.root.getWorldPosition(boardWorld);
      machine.worldToLocal(boardWorld);
      const lift = boardWorld.y - PANEL_Y;
      if (lift > 0.18) heldInfo.liftReached = true;

      // フック接点がリングの縁付近に来るよう、板の位置を毎フレーム少し追従させる。
      const targetCatch = ARM_RING_LOCAL.clone()
        .addScaledVector(heldInfo.openDirection, -Math.min(0.11, RING_RADIUS * 0.34))
        .add(new THREE.Vector3(0, 0.03, 0));
      const targetPos = targetCatch.sub(heldInfo.hookPointOnBoard);
      held.root.position.lerp(targetPos, Math.min(1, dt * 7.5));

      // 引っ掛けた位置と揺れに合わせて板が少し傾く。
      const direction = heldInfo.hookAngle === 0 ? -1 : 1;
      const targetTilt = THREE.MathUtils.clamp(
        direction * (0.08 + Math.abs(swingZ) * 0.12), -0.19, 0.19
      );
      held.root.rotation.z = THREE.MathUtils.damp(
        held.root.rotation.z, targetTilt, 4.8, dt
      );
      held.root.rotation.x = THREE.MathUtils.damp(
        held.root.rotation.x, swingX * 0.08, 4.8, dt
      );

      // 掛かりが浅い、または大きく揺れたら途中で外れる。
      const shallowLatch = heldInfo.score < 0.48 || heldInfo.latchedDepth < 0.035;
      if (lift > 0.10 && lift < 1.45 && shallowLatch &&
          (Math.abs(swingZ) > 0.50 || Math.abs(swingX) > 0.56)) {
        slipFromHook();
      }
    }

    // リングが外れた板は横棒の上に戻る。獲得にはカウントしない。
    for (let i = settling.length - 1; i >= 0; i--) {
      const slot = settling[i];
      slot.vy -= 7.5 * dt;
      slot.root.position.y = Math.max(PANEL_Y, slot.root.position.y + slot.vy * dt);
      slot.root.rotation.x = THREE.MathUtils.damp(slot.root.rotation.x, 0, 9, dt);
      slot.root.rotation.z = THREE.MathUtils.damp(slot.root.rotation.z, 0, 9, dt);
      if (slot.root.position.y <= PANEL_Y + 0.0001) {
        slot.root.position.set(SLOT_X[slot.index], PANEL_Y, SLOT_Z);
        slot.root.rotation.set(0, 0, 0);
        slot.state = 'ready';
        settling.splice(i, 1);
        saveSlots();
      }
    }

    for (let i = falling.length - 1; i >= 0; i--) {
      const target = falling[i];
      target.vy -= 8.5 * dt;
      target.root.position.y += target.vy * dt;
      target.root.rotation.z += dt * 0.55;
      if (target.root.position.y < 2.92) {
        falling.splice(i, 1);
        // フックモードの底面全体が獲得口。落ちた場所を確認してからGET。
        const insideFloor = Math.abs(target.root.position.x) < 2.65 &&
          Math.abs(target.root.position.z) < 2.00;
        if (insideFloor) {
          target.state = 'used';
          target.root.visible = false;
          saveSlots();
          onAward?.(target.rank);
        } else {
          // 外側へ落ちた場合は景品を横棒に戻し、獲得にしない。
          target.state = 'settling';
          target.root.position.set(SLOT_X[target.index], PANEL_Y, SLOT_Z);
          target.root.rotation.set(0, 0, 0);
          target.vy = 0;
          target.state = 'ready';
          saveSlots();
          onStatus?.('惜しい！板が獲得口の外に落ちた');
        }
      }
    }
    if (rerollPending && !held && falling.length === 0 && settling.length === 0) {
      prepareNextAttempt();
    }
    repositionElapsed += dt;
    if (repositionElapsed > 0.35) {
      repositionElapsed = 0;
      repositionPanel();
    }
  }

  const style = document.createElement('style');
  style.textContent = `
    .mini-hook-mode-panel { position: fixed; z-index: 10; left: 14px; top: 340px;
      box-sizing: border-box; width: 174px; padding: 10px; border-radius: 14px;
      border: 1px solid white; background: rgba(255,249,255,.95);
      color: #674783; box-shadow: 0 6px 20px #70528533;
      font-size: 12px; font-weight: 800; }
    .mini-hook-mode-panel strong { display:block; margin-bottom: 7px; text-align:center; }
    .mini-hook-mode-buttons { display:flex; gap:5px; }
    .mini-hook-mode-buttons button { flex:1; min-width:0; background:#fff;
      border:1px solid #dcbde9; border-radius:9px; padding:8px 3px;
      color:#74578b; font-weight:900; cursor:pointer; font-size:12px; }
    .mini-hook-mode-buttons button[aria-pressed="true"] {
      background:#b76dbe; border-color:#b76dbe; color:#fff; }
    @media(max-width:640px) { .mini-hook-mode-panel { left:7px; width:128px;
      padding:7px; } .mini-hook-mode-buttons button { font-size:10px; padding:7px 2px; }}
  `;
  document.head.appendChild(style);
  const panel = document.createElement('section');
  panel.className = 'mini-hook-mode-panel';
  panel.setAttribute('aria-label', 'クレーンモード切替');
  panel.innerHTML = `<strong>🕹️ モード切替</strong><div class="mini-hook-mode-buttons">
    <button type="button" data-mode="claw">3本爪</button>
    <button type="button" data-mode="hook">〇リング</button>
  </div>`;
  document.body.appendChild(panel);

  function repositionPanel() {
    const anchor = document.querySelector('.crane-camera-panel');
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      panel.style.left = `${Math.round(rect.left)}px`;
      panel.style.top = `${Math.round(rect.bottom + 8)}px`;
    }
  }
  function refreshButtons() {
    for (const button of panel.querySelectorAll('button[data-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
  }
  function applyVisibility() {
    world.visible = mode === 'hook';
    hookRoot.visible = mode === 'hook';
    refreshButtons();
  }
  for (const button of panel.querySelectorAll('button[data-mode]')) {
    button.addEventListener('click', () => {
      const requested = button.dataset.mode;
      if (requested === mode) return;
      if (!canSwitch?.()) {
        onStatus?.('モード切替はプレイヤー開始前に行ってください');
        return;
      }
      mode = requested;
      try { localStorage.setItem(MODE_KEY, mode); } catch {}
      if (mode === 'hook') ringFacingAngle = randomRingFacing();
      resetSwing();
      applyVisibility();
      onModeChange?.(mode);
    });
  }
  applyVisibility();
  repositionPanel();

  return {
    isHook: () => mode === 'hook',
    // 旧仮リングの場合も、引っ掛かり位置がずれないよう元の下降量に戻す。
    getDropY: () => glbInstalled ? LARGE_ARM_DROP_Y : FALLBACK_DROP_Y,
    tryHook,
    hasHeld: () => !!held,
    release,
    update,
    isMoving: () => falling.length > 0 || settling.length > 0,
    ensureTargets,
    useGLB,
    prepareNextAttempt,
    resetSwing,
    resetForNextPlayer() {
      if (held) {
        machine.attach(held.root);
        held = null;
      }
      for (const slot of [...falling, ...settling]) slot.root.visible = false;
      falling = [];
      settling = [];
      heldInfo = null;
      clearContact();
      rerollPending = false;
      // 新しいプレイヤー開始時だけリングの向きを再抽選。
      ringFacingAngle = randomRingFacing();
      resetSwing();
      buildSlots(shuffledSlots());
    }
  };
}