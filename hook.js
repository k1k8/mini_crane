






import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export function createHookMode({
  THREE, machine, crane, clawRig,
  onAward, onStatus, onModeChange, canSwitch,
  getAdminSettings = () => ({}),
  getControlState = null,
  onHookFocus = null, onHookFocusEnd = null,
  onArcadeEvent = null
}) {
  const emitArcadeEvent = (type, intensity = 1) => {
    try { onArcadeEvent?.(type, intensity); } catch (error) {
      console.debug('Arcade effect unavailable:', error);
    }
  };
  const MODE_KEY = 'mini_clane_mode_v1';
  const SLOTS_KEY = 'mini_clane_hook_slots_v2_two_boards'; 
  const FALLBACK_DROP_Y = -2.17;
  const LARGE_ARM_DROP_Y = -2.13;
  const PRIZE_STAGE_LOWER = 0.12;
  const PANEL_Y = 4.62 - PRIZE_STAGE_LOWER;
  const SUPPORT_RAIL_Y = 4.50 - PRIZE_STAGE_LOWER;
  const BOARD_WIDTH = 1.58;  
  const BOARD_LENGTH = 2.28; 
  const BOARD_THICKNESS = 0.18;
  const SLOT_X = [-1.06, 1.06]; 
  const SLOT_Z = -0.36;
  const SUPPORT_Z = [-1.25, 0.54];
  const FARTHEST_RAIL_OFFSET = Math.max(...SUPPORT_Z.map(z => Math.abs(z - SLOT_Z)));
  const SLIDE_FIRST_RAIL_LOSS = Math.max(0.14, BOARD_LENGTH / 2 - FARTHEST_RAIL_OFFSET + 0.03);
  const SLIDE_FALL_DISTANCE = Math.max(0.77, FARTHEST_RAIL_OFFSET + 0.12);
  const SLIDE_PULL_ACCELERATION = 1.90; 
  const SLIDE_FRICTION = 1.90;         
  const SLIDE_LATCH_MAX_RISE = 0.58;   
  const ONE_HIT_SLIDE_SECONDS = 0.84; 
  const VISUAL_HOOK_PAUSE_SECONDS = 0.52;
  const VISUAL_HOOK_PULL_SECONDS = 0.60;
  const VISUAL_HOOK_SEAT_DELAY = 0.08;
  const VISUAL_HOOK_SEAT_SECONDS = 0.34;
  const VISUAL_RING_FOLLOW_LIMIT = 1.22;
  const VISUAL_BOARD_HANG_SECONDS = 0.34;
  const VISUAL_BOARD_HANG_DROP = 0.16;
  const VISUAL_BOARD_HANG_PITCH = 0.14;
  const HOOK_ENTRY_TIP_GLB = new THREE.Vector3(-0.150, 0.292, 0);
  const HOOK_ENTRY_TIP_FALLBACK = new THREE.Vector3(-0.048, 0.347, 0);
  const QUESTION_HOOK_SEAT_GLB = new THREE.Vector3(-0.135, 0.335, 0);
  const QUESTION_HOOK_SEAT_FALLBACK = new THREE.Vector3(0.075, 0.468, 0);

  const HOOK_DIFFICULTY_KEY = 'mini_clane_hook_difficulty_v1';
  const DIFFICULTIES = {
    easy:   { label: 'かんたん', plane: 0.22, height: 0.28, radial: 0.16, entry: -0.065, assist: 0.16, glow: 0.46 },
    normal: { label: 'ふつう',   plane: 0.17, height: 0.23, radial: 0.12, entry: -0.035, assist: 0.10, glow: 0.36 },
    hard:   { label: 'むずかしい', plane: 0.11, height: 0.17, radial: 0.075, entry: 0.005, assist: 0.045, glow: 0.28 }
  };
  let hookDifficulty = 'easy';
  try {
    const saved = localStorage.getItem(HOOK_DIFFICULTY_KEY);
    if (saved && DIFFICULTIES[saved]) hookDifficulty = saved;
  } catch {}
  const difficultyConfig = () => DIFFICULTIES[hookDifficulty];

  const CONTACT_MEMORY_SECONDS = Object.freeze({ easy: 1.90, normal: 1.70, hard: 1.50 });
  const contactMemorySeconds = () => CONTACT_MEMORY_SECONDS[hookDifficulty];
  const getDescentProgress = fraction => {
    const t = Math.max(0, Math.min(1, fraction));
    return t <= 0.63 ? t * (0.78 / 0.63)
      : 0.78 + (t - 0.63) * (0.22 / 0.37);
  };

  const HOOK_RARITY_ODDS = Object.freeze({
    easy:   Object.freeze({ normal: 0.78, rare: 0.20, ultra: 0.02 }),
    normal: Object.freeze({ normal: 0.55, rare: 0.35, ultra: 0.10 }),
    hard:   Object.freeze({ normal: 0.25, rare: 0.45, ultra: 0.30 })
  });
  function drawWinningRarity(difficulty = hookDifficulty) {
    const odds = HOOK_RARITY_ODDS[difficulty] || HOOK_RARITY_ODDS.easy;
    const r = Math.random();
    return r < odds.ultra ? 1 : r < odds.ultra + odds.rare ? 2 : 3;
  }

  const NATURAL_SWING = Object.freeze({
    horizontal: 2.85,     
    depth: 3.05,          
    latched: 2.85,        
    force: 0.72,          
    maxAngle: 0.82,       
    dampingFactor: 1.0    
  });
  const swingProfile = () => {
    const base = NATURAL_SWING;
    const admin = getAdminSettings?.() || {};
    const ratio = (raw, min, max) => {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 1;
    };
    const horizontalScale = ratio(admin.hookHorizontalPeriodScale, 0.6, 1.8);
    const depthScale = ratio(admin.hookDepthPeriodScale, 0.6, 1.8);
    const swingScale = ratio(admin.hookSwingScale, 0.4, 1.8);
    return {
      ...base,
      horizontal: base.horizontal * horizontalScale,
      depth: base.depth * depthScale,
      latched: base.latched * (horizontalScale + depthScale) / 2,
      force: base.force * swingScale,
      maxAngle: Math.min(1.12, base.maxAngle * swingScale)
    };
  };

  const ARM_RING_LOCAL = new THREE.Vector3(0, -0.45, 0);
  const RING_DISPLAY_RADIUS = 0.23;
  const RING_WIRE_RADIUS = 0.014;
  let RING_RADIUS = RING_DISPLAY_RADIUS;

  const CYCLE_ENTRY_MIN_SPEED = 0.075; 
  const CYCLE_ENTRY_BONUS = 0.17;     
  const CYCLE_NEAR_HOOK_HEIGHT = 0.80;
  const CYCLE_NEAR_HOOK_HORIZONTAL = 0.83;
  const CYCLE_NEAR_HOOK_DEPTH = 1.00;
  const CYCLE_HOLE_ENTRY_MEMORY_FRAMES = 140;
  const CYCLE_MOUTH_MEMORY_FRAMES = 140;
  const CYCLE_LATCH_MEMORY_SECONDS = 1.50; 


  let mode = 'claw';
  try {
    if (localStorage.getItem(MODE_KEY) === 'hook') mode = 'hook';
  } catch {}

  const world = new THREE.Group();
  world.name = 'mini-hook-stage-v4';
  machine.add(world);

  const hookRoot = new THREE.Group();
  hookRoot.name = 'mini-ring-tool-v4';
  clawRig.add(hookRoot);
  const pendulum = new THREE.Group();
  pendulum.name = 'mini-hook-pendulum';
  hookRoot.add(pendulum);

  const RING_START_FACING = Math.PI / 2;
  const RING_FACING_KEY = 'mini_clane_hook_ring_facing_five_plays_v1';
  const RING_FACING_INTERVAL = 5;
  const RING_FACING_OPTIONS = {
    easy: [RING_START_FACING],
    normal: [RING_START_FACING, 0],
    hard: [RING_START_FACING, 0, Math.PI / 4, 3 * Math.PI / 4]
  };
  let ringFacingAngle = RING_START_FACING;
  let facingDifficulty = hookDifficulty;
  let facingPlaysCompleted = 0;
  let facingChangePending = false;
  let facingCountedThisAttempt = false;

  function randomRingFacing(difficulty, exclude = null) {
    const options = RING_FACING_OPTIONS[difficulty] || RING_FACING_OPTIONS.easy;
    const candidates = options.length > 1 && exclude !== null
      ? options.filter(angle => Math.abs(angle - exclude) > 0.001)
      : options;
    const choices = candidates.length ? candidates : options;
    return choices[Math.floor(Math.random() * choices.length)];
  }

  function saveRingFacing() {
    try {
      localStorage.setItem(RING_FACING_KEY, JSON.stringify({
        difficulty: facingDifficulty,
        angle: ringFacingAngle,
        completed: facingPlaysCompleted,
        pending: facingChangePending
      }));
    } catch {}
  }

  function setRingFacingForDifficulty(difficulty) {
    facingDifficulty = difficulty;
    ringFacingAngle = randomRingFacing(difficulty);
    facingPlaysCompleted = 0;
    facingChangePending = false;
    facingCountedThisAttempt = false;
    saveRingFacing();
  }

  try {
    const saved = JSON.parse(localStorage.getItem(RING_FACING_KEY) || 'null');
    const options = RING_FACING_OPTIONS[hookDifficulty];
    if (saved && saved.difficulty === hookDifficulty &&
        Number.isFinite(saved.angle) &&
        options.some(angle => Math.abs(angle - saved.angle) < 0.001) &&
        Number.isInteger(saved.completed) &&
        saved.completed >= 0 && saved.completed < RING_FACING_INTERVAL &&
        typeof saved.pending === 'boolean') {
      ringFacingAngle = saved.angle;
      facingPlaysCompleted = saved.completed;
      facingChangePending = saved.pending;
    } else {
      setRingFacingForDifficulty(hookDifficulty);
    }
  } catch {
    setRingFacingForDifficulty(hookDifficulty);
  }

  function countCompletedHookPlay() {
    if (hookDifficulty === 'easy' || facingCountedThisAttempt) return;
    facingCountedThisAttempt = true;
    facingPlaysCompleted += 1;
    if (facingPlaysCompleted >= RING_FACING_INTERVAL) {
      facingPlaysCompleted = 0;
      facingChangePending = true;
    }
    saveRingFacing();
  }

  function applyPendingRingFacing() {
    if (!facingChangePending) return;
    const oldAngle = ringFacingAngle;
    ringFacingAngle = randomRingFacing(hookDifficulty, oldAngle);
    facingChangePending = false;
    ringFacingGroup.rotation.y = ringFacingAngle;
    saveRingFacing();
    lastCycleReadoutText = '';
    onStatus?.(`🪝 リングの向きを変更：${ringFacingLabel()}（次の5回もこの向き）`);
  }

  function ringFacingLabel() {
    if (hookDifficulty === 'easy' || Math.abs(ringFacingAngle - RING_START_FACING) < 0.001)
      return '横向き';
    if (Math.abs(ringFacingAngle) < 0.001) return '縦向き';
    return '斜め向き';
  }

  pendulum.rotation.order = 'YXZ';
  const ringFacingGroup = new THREE.Group();
  ringFacingGroup.name = 'RingFacingOnly';
  pendulum.add(ringFacingGroup);
  ringFacingGroup.rotation.y = ringFacingAngle;

  const silver = new THREE.MeshStandardMaterial({
    color: 0xc1cbd5, metalness: 0.84, roughness: 0.22
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0x151515, metalness: 0.65, roughness: 0.28
  });
  const headPink = new THREE.MeshStandardMaterial({
    color: 0xf2a8d2, metalness: 0.30, roughness: 0.32
  });
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
      color: 0x151515, metalness: 0.58, roughness: 0.28
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

  let glbInstalled = false;
  let guideStartY = -0.18;
  const chainVisual = new THREE.Group();
  chainVisual.name = 'mini-ring-chain-visual';
  pendulum.add(chainVisual); 
  const connectedChainLinks = [];
  let connectedSleeve = null;
  let connectedCollar = null;
  let chainRestLastY = -0.76;
  let chainRestStep = 0.062;
  const chainStartLocal = new THREE.Vector3();
  const chainEndLocal = new THREE.Vector3();
  const chainDirection = new THREE.Vector3();
  const chainDownAxis = new THREE.Vector3(0, -1, 0);
  const chainYaxis = new THREE.Vector3(0, 1, 0);
  const chainAimQuaternion = new THREE.Quaternion();
  const chainLinkTwists = [
    new THREE.Quaternion(),
    new THREE.Quaternion().setFromAxisAngle(chainYaxis, Math.PI / 2)
  ];
  const chainCollarTwist = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const swivelRotorGroup = new THREE.Group();
  swivelRotorGroup.name = 'HookSwivelRotatingEnd';
  ringFacingGroup.add(swivelRotorGroup);
  let ringVisual = null; 
  const previousRingMatrixWorld = new THREE.Matrix4();
  let previousRingMatrixReady = false;
  let ringBoardCompression = 0;
  const ringBoardLocalCorrection = new THREE.Vector3();
  let ringBoardTouching = false;
  let ringBoardContactAnnounced = false;
  let boardTopTouched = new WeakSet();
  let boardEdgeDropped = new WeakSet();
  let boardDropFace = new WeakMap();
  let boardCenterBounced = new WeakSet();
  let centerBounce = null;
  let gapMissedThisTry = false;
  let bridgeHitCooldown = 0;
  let boardImpactCooldown = 0;
  let sideImpactRecorded = new WeakSet();
  let ringBlockedLargeThisFrame = false;
  const collisionWorldUp = new THREE.Vector3();
  const collisionLocalUp = new THREE.Vector3();
  const collisionParentQuaternion = new THREE.Quaternion();

  const latchGlimmer = new THREE.Mesh(
    new THREE.SphereGeometry(0.036, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.9, depthWrite: false })
  );
  latchGlimmer.name = 'HookLatchGlint';
  latchGlimmer.visible = false;
  ringFacingGroup.add(latchGlimmer);
  let latchGlimmerTime = 0;

  function rebuildChainVisual() {
    for (const obj of chainVisual.children) obj.geometry?.dispose();
    for (const obj of swivelRotorGroup.children) obj.geometry?.dispose();
    chainVisual.clear();
    swivelRotorGroup.clear();
    connectedChainLinks.length = 0;
    connectedSleeve = null;
    connectedCollar = null;
    const linkCount = glbInstalled ? 12 : 11;
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
      connectedChainLinks.push(link);
    }

    const ringRadius = RING_DISPLAY_RADIUS;
    const ringTube = RING_WIRE_RADIUS;
    const lastLinkY = startY - (linkCount - 1) * linkStep;
    chainRestLastY = lastLinkY;
    chainRestStep = linkStep;
    const connectorTopY = lastLinkY - 0.04;
    const ringY = connectorTopY - ringRadius - 0.02;

    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.039, 0.045, 0.068, 14), chrome
    );
    sleeve.name = 'HookSwivelFixedSleeve';
    sleeve.position.y = lastLinkY - 0.020;
    sleeve.castShadow = true;
    chainVisual.add(sleeve);
    connectedSleeve = sleeve;
    const fixedCollar = new THREE.Mesh(
      new THREE.TorusGeometry(0.037, 0.006, 7, 18), chrome
    );
    fixedCollar.rotation.x = Math.PI / 2;
    fixedCollar.position.y = lastLinkY - 0.052;
    chainVisual.add(fixedCollar);
    connectedCollar = fixedCollar;

    const rotor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.027, 0.032, 0.064, 12), chrome
    );
    rotor.name = 'HookSwivelRotor';
    rotor.position.y = connectorTopY - 0.013;
    rotor.castShadow = true;
    swivelRotorGroup.add(rotor);
    const swivelMarkMaterial = new THREE.MeshStandardMaterial({
      color: 0x9299a6, metalness: 0.65, roughness: 0.25
    });
    const swivelMark = new THREE.Mesh(
      new THREE.BoxGeometry(0.009, 0.034, 0.006), swivelMarkMaterial
    );
    swivelMark.name = 'HookSwivelRotationMark';
    swivelMark.position.set(0.029, connectorTopY - 0.018, 0);
    swivelRotorGroup.add(swivelMark);
    const connector = new THREE.Mesh(
      new THREE.TorusGeometry(0.034, 0.008, 6, 18), chrome
    );
    connector.position.set(0, connectorTopY - 0.01, 0);
    connector.scale.set(0.76, 1.24, 1);
    connector.rotation.x = Math.PI / 2;
    connector.castShadow = true;
    swivelRotorGroup.add(connector);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, ringTube, 12, 64), chrome
    );
    ring.name = 'HookRing';
    ringVisual = ring;
    ringBoardCompression = 0;
    ringBoardLocalCorrection.set(0, 0, 0);
    ringBoardTouching = false;
    boardTopTouched = new WeakSet();
    boardEdgeDropped = new WeakSet();
    boardDropFace = new WeakMap();
    boardCenterBounced = new WeakSet();
    centerBounce = null;
    gapMissedThisTry = false;
    bridgeHitCooldown = 0;
    boardImpactCooldown = 0;
    sideImpactRecorded = new WeakSet();
    previousRingMatrixReady = false;
    ring.position.set(0, ringY, 0);
    ring.castShadow = true;
    swivelRotorGroup.add(ring);

    ARM_RING_LOCAL.set(0, ringY, 0);
    RING_RADIUS = ringRadius;
    updateConnectedChainVisual();
  }

  function updateConnectedChainVisual() {
    const count = connectedChainLinks.length;
    if (!ringVisual || count < 2) return;
    chainStartLocal.set(0, -0.08, 0);
    chainEndLocal.copy(ringFacingGroup.position);
    chainEndLocal.y += chainRestLastY;
    chainDirection.copy(chainEndLocal).sub(chainStartLocal);
    const length = chainDirection.length();
    if (length < 0.00001) chainDirection.set(0, -1, 0);
    else chainDirection.divideScalar(length);
    chainAimQuaternion.setFromUnitVectors(chainDownAxis, chainDirection);
    const lengthRatio = length / Math.max(0.0001, (count - 1) * chainRestStep);
    const linkScaleY = THREE.MathUtils.clamp(1.16 * lengthRatio, 0.88, 2.30);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const link = connectedChainLinks[i];
      link.position.copy(chainStartLocal).addScaledVector(chainDirection, length * t);
      link.quaternion.copy(chainAimQuaternion).multiply(chainLinkTwists[i % 2]);
      link.scale.set(0.82, linkScaleY, 1);
    }
    if (connectedSleeve) {
      connectedSleeve.position.copy(ringFacingGroup.position);
      connectedSleeve.position.y += chainRestLastY - 0.020;
      connectedSleeve.quaternion.copy(chainAimQuaternion);
    }
    if (connectedCollar) {
      connectedCollar.position.copy(ringFacingGroup.position);
      connectedCollar.position.y += chainRestLastY - 0.052;
      connectedCollar.quaternion.copy(chainAimQuaternion).multiply(chainCollarTwist);
    }
  }

  pendulum.position.y = -0.22;
  rebuildChainVisual();

  const MODEL_SCALE = new THREE.Vector3(1.22, 1.00, 1.22);
  const MODEL_BASE_Y = -0.55;
  const MODEL_JOINT_Y = -0.27;

  const ARCH_SLIDE_HALF_WIDTH = 0.24; 
  const ARCH_SLIDE_END_DROP = 0.065;  
  const ARCH_SLIDE_RESPONSE = 8.5;    
  let archSlideX = 0;
  let archSlideYOffset = 0;
  const archSlider = new THREE.Group();
  archSlider.name = 'HookUpperArchSlider';
  hookRoot.add(archSlider);
  const archSliderRoller = new THREE.Mesh(
    new THREE.SphereGeometry(0.046, 12, 10), chrome
  );
  archSliderRoller.name = 'HookUpperArchRoller';
  archSliderRoller.castShadow = true;
  archSlider.add(archSliderRoller);

  function updateGuideCord() {
    const start = new THREE.Vector3(archSlideX, guideStartY + archSlideYOffset, 0);
    pendulum.updateWorldMatrix(true, false);
    const end = pendulum.localToWorld(new THREE.Vector3(0, -0.03, 0));
    hookRoot.worldToLocal(end);
    guideSleeve.position.copy(start);
    archSlider.position.copy(start);
    fitSpan(guideCord, start, end);
  }

  function updateArchSlide(dt) {
    const targetX = ARCH_SLIDE_HALF_WIDTH * Math.sin(swingZ);
    archSlideX = THREE.MathUtils.damp(
      archSlideX, targetX, ARCH_SLIDE_RESPONSE, dt
    );
    const normalized = THREE.MathUtils.clamp(
      archSlideX / ARCH_SLIDE_HALF_WIDTH, -1, 1
    );
    archSlideYOffset = -ARCH_SLIDE_END_DROP * normalized * normalized;
    pendulum.position.x = archSlideX;
    pendulum.position.y = (glbInstalled ? MODEL_JOINT_Y : -0.22) +
      archSlideYOffset + chainTension * 0.035;
    updateGuideCord();
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

    baseMesh.material = headPink;

    baseMesh.frustumCulled = false;
    baseMesh.castShadow = false;
    baseMesh.receiveShadow = false;

    hookRoot.add(staticModel);
    housing.visible = false;
    glbInstalled = true;

    pendulum.position.set(archSlideX, MODEL_JOINT_Y + archSlideYOffset, 0);
    guideStartY = -0.39;
    rebuildChainVisual();
    updateGuideCord();
    clearContact();
    console.info('⭕ Meshyリングアームを使用：ヘッド固定＋長めのチェーン＋細いリングに調整しました。');
    return true;
  }

  const opening = new THREE.Mesh(
    new THREE.PlaneGeometry(5.27, 3.94),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide, depthWrite: true
    })
  );
  opening.rotation.x = -Math.PI / 2;
  opening.position.set(0, 3.25, 0); 
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

  const bridgeCollisionRods = [];
  function makeBridgeRod(a, b, radius, kind) {
    rod(world, a, b, radius, railMat);
    bridgeCollisionRods.push({ a: a.clone(), b: b.clone(), radius, kind });
  }
  for (const z of SUPPORT_Z) {
    makeBridgeRod(new THREE.Vector3(-2.45, SUPPORT_RAIL_Y, z),
      new THREE.Vector3(2.45, SUPPORT_RAIL_Y, z), 0.075, '横棒');
    for (const x of [-2.37, 2.37]) {
      makeBridgeRod(new THREE.Vector3(x, 3.30, z),
        new THREE.Vector3(x, SUPPORT_RAIL_Y, z), 0.065, '支柱');
    }
  }

  const LEFT = 0;
  const RIGHT = Math.PI;
  const UP = -Math.PI / 2;
  const DOWN = Math.PI / 2;
  const DIAGONALS = [-Math.PI / 4, Math.PI / 4,
    -3 * Math.PI / 4, 3 * Math.PI / 4];
  const HOOK_DIRECTIONS = {
    easy: [LEFT, RIGHT],
    normal: [LEFT, RIGHT, UP, DOWN],
    hard: [LEFT, RIGHT, UP, DOWN, ...DIAGONALS]
  };
  function allowedDirections() { return HOOK_DIRECTIONS[hookDifficulty]; }
  function nearestAllowedDirection(angle) {
    const allowed = allowedDirections();
    if (!Number.isFinite(angle)) return allowed[0];
    return allowed.reduce((best, option) =>
      Math.abs(Math.atan2(Math.sin(angle - option), Math.cos(angle - option))) <
      Math.abs(Math.atan2(Math.sin(angle - best), Math.cos(angle - best))) ? option : best,
    allowed[0]);
  }
  function randomDirection() {
    const dirs = allowedDirections();
    return dirs[Math.floor(Math.random() * dirs.length)];
  }
  function randomHooks(baseAngle = randomDirection()) {
    const two = Math.random() < 0.68;
    const offsets = two ? [-0.43, 0.43] : [0];
    return offsets.map((z, index) => ({
      z, angle: index === 0 ? baseAngle : randomDirection()
    }));
  }
  function makeRandomBoardHooks() {
    const dirs = allowedDirections();
    const deck = [...dirs];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return SLOT_X.map((_, index) => randomHooks(deck[index % deck.length]));
  }
  function applyFixtureDirection(fixture, angle) {
    const yaw = nearestAllowedDirection(angle);
    fixture.rotation.set(0, yaw, 0);
    fixture.updateMatrix();
  }

  let questionHookTemplate = null;

  function registerGlowMaterials(fixture) {
    const records = [];
    fixture.traverse(object => {
      if (!object.isMesh || object.userData.hookGlowMarker) return;
      const src = Array.isArray(object.material) ? object.material : [object.material];
      const materials = src.map(material => {
        if (!material) return material;
        const copy = material.clone();
        records.push({ material: copy,
          originalColor: copy.color?.clone() || null,
          originalEmissive: copy.emissive?.clone() || null,
          originalEmissiveIntensity: copy.emissiveIntensity ?? 1 });
        return copy;
      });
      object.material = Array.isArray(object.material) ? materials : materials[0];
    });
    fixture.userData.glowMaterials = records;
    fixture.userData.glowLevel = 0;
  }

  function addGlowMarker(fixture) {
    if (fixture.userData.hookGlowMarker) return;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 14, 10),
      new THREE.MeshBasicMaterial({
        color: 0x28ff7c, transparent: true, opacity: 0,
        depthWrite: false, toneMapped: false
      })
    );
    marker.name = 'HookProximityMarker';
    marker.position.copy(HOOK_ENTRY_TIP_FALLBACK); 
    marker.renderOrder = 12;
    marker.visible = false;
    marker.userData.hookGlowMarker = true;
    marker.userData.questionHookShared = true; 
    fixture.add(marker);
    fixture.userData.hookGlowMarker = marker;
  }

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
      object.userData.questionHookShared = true;
    });
    fixture.add(replacement);

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
    registerGlowMaterials(fixture);
    addGlowMarker(fixture);
    fixture.userData.hasQuestionHookGLB = true;
    if (fixture.userData.hookGlowMarker) {
      fixture.userData.hookGlowMarker.position.copy(HOOK_ENTRY_TIP_GLB);
    }
    return true;
  }

  function createQuestionHook(boardRoot, zOffset, angle) {
    const fixture = new THREE.Group();
    const sideOffset = zOffset < -0.1 ? -0.18 : zOffset > 0.1 ? 0.18 : 0;
    fixture.position.set(sideOffset, 0, zOffset);
    applyFixtureDirection(fixture, angle);
    boardRoot.add(fixture);

    const vec = (x, y) => new THREE.Vector3(x, y, 0);
    const curve = new THREE.CurvePath();

    curve.add(new THREE.LineCurve3(
      vec(0, -0.055), vec(0, 0.135)
    ));

    curve.add(new THREE.CubicBezierCurve3(
      vec(0, 0.135),
      vec(0.000, 0.205),
      vec(0.078, 0.264),
      vec(0.144, 0.291)
    ));
    curve.add(new THREE.CubicBezierCurve3(
      vec(0.144, 0.291),
      vec(0.233, 0.332),
      vec(0.232, 0.425),
      vec(0.151, 0.455)
    ));
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

    const mount = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 12, 10), hookGold
    );
    mount.name = 'QuestionHookMount';
    mount.position.set(0, -0.021, 0);
    fixture.add(mount);
    if (!installQuestionHookGLB(fixture)) {
      registerGlowMaterials(fixture);
      addGlowMarker(fixture);
    }
    return fixture;
  }

  const HOOK_AIM_SHADOW_STRENGTH = 0.78; 
  const HOOK_FLOOR_SHADOW_Y = 3.259; 
  const HOOK_BOARD_TOP_Y = 0.05;     
  function makeRingShadowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 61);
    g.addColorStop(0, 'rgba(19,22,36,0.05)');
    g.addColorStop(0.42, 'rgba(19,22,36,0.13)');
    g.addColorStop(0.60, 'rgba(19,22,36,0.65)');
    g.addColorStop(0.76, 'rgba(19,22,36,0.31)');
    g.addColorStop(1, 'rgba(19,22,36,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }
  const ringShadowTexture = makeRingShadowTexture();
  const ringShadowGeometry = new THREE.PlaneGeometry(0.62, 0.62);
  function ringShadowMaterial() {
    return new THREE.MeshBasicMaterial({
      color: 0x303448, map: ringShadowTexture,
      transparent: true, opacity: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2,
      side: THREE.DoubleSide, toneMapped: false
    });
  }

  const floorAimShadow = new THREE.Mesh(ringShadowGeometry, ringShadowMaterial());
  floorAimShadow.name = 'RingAimShadowFloor';
  floorAimShadow.rotation.x = -Math.PI / 2;
  floorAimShadow.position.y = HOOK_FLOOR_SHADOW_Y;
  floorAimShadow.renderOrder = 8;
  floorAimShadow.frustumCulled = false;
  floorAimShadow.visible = false;
  world.add(floorAimShadow);

  const ringShadowWorldPosition = new THREE.Vector3();
  const ringShadowLocalPosition = new THREE.Vector3();
  const ringShadowBoardCenter = new THREE.Vector3();
  const ringShadowNormal = new THREE.Vector3();
  const ringShadowHit = new THREE.Vector3();
  const ringShadowDown = new THREE.Vector3(0, -1, 0);
  const ringShadowNormalQuat = new THREE.Quaternion();

  function updateRingAimShadows() {
    if (mode !== 'hook' || !ringVisual) {
      floorAimShadow.visible = false;
      for (const slot of slots) {
        if (slot.aimShadow) slot.aimShadow.visible = false;
      }
      return;
    }
    machine.updateMatrixWorld(true);
    ringVisual.getWorldPosition(ringShadowWorldPosition);

    ringShadowLocalPosition.copy(ringShadowWorldPosition);
    world.worldToLocal(ringShadowLocalPosition);
    const floorGap = Math.max(0, ringShadowLocalPosition.y - HOOK_FLOOR_SHADOW_Y);
    const floorNear = 1 - THREE.MathUtils.clamp(floorGap / 6.0, 0, 1);
    floorAimShadow.position.set(
      ringShadowLocalPosition.x, HOOK_FLOOR_SHADOW_Y, ringShadowLocalPosition.z
    );
    floorAimShadow.material.opacity = HOOK_AIM_SHADOW_STRENGTH *
      (0.38 + 0.34 * floorNear);
    floorAimShadow.scale.setScalar(1.25 + (1 - floorNear) * 0.55);
    floorAimShadow.visible = true;

    let boardReceivesShadow = false;
    for (const slot of slots) {
      const shadow = slot.aimShadow;
      if (!shadow) continue;
      shadow.visible = false;
      if (!slot.root.visible || slot.state === 'falling' || slot.state === 'used') continue;

      slot.root.localToWorld(ringShadowBoardCenter.set(0, HOOK_BOARD_TOP_Y, 0));
      ringShadowNormal.set(0, 1, 0).applyQuaternion(
        slot.root.getWorldQuaternion(ringShadowNormalQuat)
      ).normalize();
      const denom = ringShadowDown.dot(ringShadowNormal);
      if (Math.abs(denom) < 0.10) continue;
      const travel = ringShadowBoardCenter.clone().sub(ringShadowWorldPosition)
        .dot(ringShadowNormal) / denom;
      if (travel < -0.02) continue;

      ringShadowHit.copy(ringShadowWorldPosition)
        .addScaledVector(ringShadowDown, Math.max(0, travel));
      slot.root.worldToLocal(ringShadowHit);
      if (Math.abs(ringShadowHit.x) > BOARD_WIDTH / 2 ||
          Math.abs(ringShadowHit.z) > BOARD_LENGTH / 2) continue;

      const boardNear = 1 - THREE.MathUtils.clamp(travel / 5.0, 0, 1);
      shadow.position.set(ringShadowHit.x, HOOK_BOARD_TOP_Y + 0.008, ringShadowHit.z);
      shadow.material.opacity = HOOK_AIM_SHADOW_STRENGTH *
        (0.47 + 0.40 * boardNear);
      if (held === slot) {
        shadow.material.opacity = Math.min(0.90, shadow.material.opacity + 0.12);
      }
      shadow.scale.setScalar(1.05 + (1 - boardNear) * 0.48);
      shadow.visible = true;
      boardReceivesShadow = true;
    }

    if (boardReceivesShadow) floorAimShadow.material.opacity *= 0.36;
  }

  function createBoard(x, rank, index, config) {
    const root = new THREE.Group();
    root.name = `mini-hook-bridge-board-${index}`;
    root.position.set(x, PANEL_Y, SLOT_Z);
    world.add(root);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_WIDTH, BOARD_THICKNESS, BOARD_LENGTH), boardMats[index % 3]
    );
    plate.position.y = HOOK_BOARD_TOP_Y - BOARD_THICKNESS / 2;
    plate.castShadow = true;
    plate.receiveShadow = true;
    root.add(plate);

    const aimShadow = new THREE.Mesh(ringShadowGeometry, ringShadowMaterial());
    aimShadow.name = `RingAimShadow${index}`;
    aimShadow.rotation.x = -Math.PI / 2;
    aimShadow.position.y = HOOK_BOARD_TOP_Y + 0.008; 
    aimShadow.renderOrder = 8;
    aimShadow.visible = false;
    aimShadow.frustumCulled = false;
    aimShadow.userData.questionHookShared = true;
    root.add(aimShadow);

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
    return { root, rank, index, hooks, aimShadow,
      state: 'ready', vy: 0, slideZ: 0, slideV: 0, slideDir: 0,
      oneHitSlide: null };
  }

  let slots = [];
  let held = null;
  let falling = [];
  let settling = []; 
  let sliding = [];
  let heldInfo = null;
  let contactCandidate = null;
  let contactAge = Infinity;
  let canDetectContact = true;
  let contactAnnounced = false;
  let rerollPending = false;
  let returnCatchActive = false;
  let returnCatchElapsed = 0;
  const RETURN_CATCH_MIN_SECONDS = 0.11;
  const nearAssistOffset = new THREE.Vector3();
  const nearAssistTarget = new THREE.Vector3();
  const nearAssistCenter = new THREE.Vector3();
  const nearAssistHookPoint = new THREE.Vector3();
  const nearAssistOpening = new THREE.Vector3();
  const nearAssistError = new THREE.Vector3();
  const nearAssistStep = new THREE.Vector3();
  const nearAssistQuaternion = new THREE.Quaternion();


  function clearContact() {
    returnCatchActive = false;
    returnCatchElapsed = 0;
    nearAssistOffset.set(0, 0, 0);
    detectionFrame = 0;
    movedHorizontallyThisTry = false;
    startedDepthThisTry = false;
    for (const slot of slots) for (const hook of slot.hooks) {
      previousTipPlane.delete(hook.fixture);
      tipPlaneFrame.delete(hook.fixture);
      previousMouthProbe.delete(hook.fixture);
      successfulEntryMemory.delete(hook.fixture);
      hookEntryByFixture.delete(hook.fixture);
    }
    contactCandidate = null;
    contactAge = Infinity;
    canDetectContact = true;
    contactAnnounced = false;
    ringBoardContactAnnounced = false;
  }

  function updateBoardSupportedPose(slot, dt = 0, snap = false) {
    slot.root.position.set(SLOT_X[slot.index], PANEL_Y, SLOT_Z + slot.slideZ);
    const lostRail = THREE.MathUtils.smoothstep(
      Math.abs(slot.slideZ), SLIDE_FIRST_RAIL_LOSS, SLIDE_FALL_DISTANCE
    );
    const pitch = -Math.sign(slot.slideZ) * lostRail * 0.32;
    const roll = (slot.slideDir || Math.sign(slot.slideZ) || 1) * lostRail * 0.055;
    if (snap || dt <= 0) {
      slot.root.rotation.x = pitch;
      slot.root.rotation.z = roll;
    } else {
      slot.root.rotation.x = THREE.MathUtils.damp(slot.root.rotation.x, pitch, 8, dt);
      slot.root.rotation.z = THREE.MathUtils.damp(slot.root.rotation.z, roll, 8, dt);
    }
  }

  function finishBoardFall(slot) {
    const si = sliding.indexOf(slot);
    if (si >= 0) sliding.splice(si, 1);
    if (held === slot) {
      held = null;
      heldInfo = null;
      assistHold = false;
    }
    slot.state = 'falling';
    emitArcadeEvent('board-release', 0.85);
    slot.vy = -0.75;
    slot.slideV = 0;
    slot.oneHitSlide = null;
    if (!falling.includes(slot)) falling.push(slot);
    onHookFocusEnd?.();
    playMetalClick(0.60);
    onStatus?.('🪝 リングがフックから外れ、板が白い底面へ落下！');
  }

  function startBoardFall(slot) {
    if (slot.state === 'falling' || slot.state === 'used' || slot.state === 'hook-suspended') return;
    if (held === slot && heldInfo) {
      slot.state = 'hook-suspended';
      slot.slideV = 0;
      slot.oneHitSlide = null;
      heldInfo.hangElapsed = 0;
      heldInfo.hangStartY = slot.root.position.y;
      heldInfo.hangStartRX = slot.root.rotation.x;
      heldInfo.hangStartRZ = slot.root.rotation.z;
      playMetalClick(0.38);
      onStatus?.('🪝 横棒から外れても、リングとフックがつながったまま板を保持！');
      return;
    }
    finishBoardFall(slot);
  }

  function applyBoardSlide(slot, dt) {
    slot.slideZ += slot.slideV * dt;
    if (Math.abs(slot.slideZ) >= SLIDE_FALL_DISTANCE) {
      slot.slideZ = Math.sign(slot.slideZ) * SLIDE_FALL_DISTANCE;
      updateBoardSupportedPose(slot, dt);
      startBoardFall(slot);
      return true;
    }
    updateBoardSupportedPose(slot, dt);
    return false;
  }

  function advanceOneHitSlide(slot, dt) {
    if (!slot.oneHitSlide || slot.state === 'falling' || slot.state === 'used') return false;
    const plan = slot.oneHitSlide;
    plan.elapsed = Math.min(ONE_HIT_SLIDE_SECONDS, plan.elapsed + dt);
    const t = plan.elapsed / ONE_HIT_SLIDE_SECONDS;
    const eased = t * t * (3 - 2 * t);
    slot.slideZ = THREE.MathUtils.lerp(plan.start, plan.target, eased);
    updateBoardSupportedPose(slot, dt);
    const vibration = Math.sin(Math.PI * t);
    slot.root.position.x += Math.sin(plan.elapsed * 96) * 0.009 * vibration;
    slot.root.position.y += Math.sin(plan.elapsed * 124) * 0.005 * vibration;
    slot.root.rotation.z += Math.sin(plan.elapsed * 108) * 0.009 * vibration;
    if (t > 0 && t < 1) playBoardScrape(dt);
    if (t >= 1) {
      startBoardFall(slot);
      return true;
    }
    return false;
  }

  function shuffledSlots() {
    const ranks = [1, 4];
    for (let i = ranks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
    }
    const boardHooks = makeRandomBoardHooks();
    return ranks.map((rank, i) => ({
      rank, used: false, hooks: boardHooks[i], slideZ: 0,
      rewardRank: rank === 4 ? 4 : drawWinningRarity(),
      rewardDifficulty: hookDifficulty
    }));
  }

  function readSlots() {
    try {
      const data = JSON.parse(localStorage.getItem(SLOTS_KEY) || 'null');
      if (!Array.isArray(data) || data.length !== SLOT_X.length) return null;
      const ranks = data.map(item => item.rank).sort((a, b) => a - b);
      if (ranks.join(',') !== '1,4' ||
          !data.every(item => typeof item.used === 'boolean')) return null;
      return data.map(item => ({
        rank: item.rank,
        used: item.used,
        rewardRank: item.rank === 4 ? 4 :
          ([1, 2, 3].includes(item.rewardRank) ? item.rewardRank : drawWinningRarity()),
        rewardDifficulty: HOOK_RARITY_ODDS[item.rewardDifficulty]
          ? item.rewardDifficulty : hookDifficulty,
        slideZ: Number.isFinite(item.slideZ)
          ? THREE.MathUtils.clamp(item.slideZ, -SLIDE_FALL_DISTANCE + 0.01, SLIDE_FALL_DISTANCE - 0.01)
          : 0,
        hooks: Array.isArray(item.hooks) &&
          item.hooks.length >= 1 && item.hooks.length <= 2 &&
          item.hooks.every(h => Number.isFinite(h.angle) &&
            Number.isFinite(h.z) && Math.abs(h.z) <= 0.6)
          ? item.hooks.map(h => ({ z: h.z, angle: nearestAllowedDirection(h.angle) }))
          : randomHooks()
      }));
    } catch { return null; }
  }

  function saveSlots() {
    try {
      localStorage.setItem(SLOTS_KEY, JSON.stringify(slots.map(item => ({
        rank: item.rank,
        used: item.state === 'used',
        rewardRank: item.rewardRank,
        rewardDifficulty: item.rewardDifficulty,
        slideZ: Number.isFinite(item.slideZ) ? item.slideZ : 0,
        hooks: item.hooks.map(h => ({ z: h.z, angle: h.angle }))
      }))));
    } catch {}
  }

  function buildSlots(data) {
    for (const old of slots) {
      old.aimShadow?.material?.dispose();
      for (const hook of old.hooks) {
        for (const record of hook.fixture.userData.glowMaterials || []) record.material.dispose();
        const marker = hook.fixture.userData.hookGlowMarker;
        if (marker) {
          marker.geometry.dispose();
          marker.material.dispose();
        }
      }
      old.root.traverse(object => {
        if (object.geometry && !object.userData.questionHookShared) {
          object.geometry.dispose();
        }
      });
      old.root.removeFromParent();
    }
    slots = data.map((item, index) => {
      const slot = createBoard(SLOT_X[index], item.rank, index, item.hooks);
      slot.rewardRank = item.rank === 4 ? 4 :
        ([1, 2, 3].includes(item.rewardRank) ? item.rewardRank : drawWinningRarity());
      slot.rewardDifficulty = HOOK_RARITY_ODDS[item.rewardDifficulty]
        ? item.rewardDifficulty : hookDifficulty;
      slot.slideZ = Number.isFinite(item.slideZ) ? item.slideZ : 0;
      slot.slideDir = Math.sign(slot.slideZ);
      slot.root.position.z = SLOT_Z + slot.slideZ;
      updateBoardSupportedPose(slot, 0, true);
      if (item.used) {
        slot.state = 'used';
        slot.root.visible = false;
      }
      return slot;
    });
    saveSlots();
  }

  function ensureTargets() {
    if (!held && falling.length === 0 && settling.length === 0 && sliding.length === 0 &&
        slots.length === SLOT_X.length && slots.every(slot => slot.state === 'used')) {
      buildSlots(shuffledSlots());
    }
  }

  function prepareNextAttempt() {
    if (held || falling.length || settling.length || sliding.length) {
      rerollPending = true;
      return;
    }
    rerollPending = false;
    applyPendingRingFacing();
    facingCountedThisAttempt = false;
    clearContact();
    boardTopTouched = new WeakSet();
    boardEdgeDropped = new WeakSet();
    boardDropFace = new WeakMap();
    boardCenterBounced = new WeakSet();
    centerBounce = null;
    gapMissedThisTry = false;
    bridgeHitCooldown = 0;
    ensureTargets();
    saveSlots();
  }

  buildSlots(readSlots() || shuffledSlots());
  ensureTargets();

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
  let previousX = crane.position.x;
  let previousZ = crane.position.z;
  let previousVX = 0;
  let previousVZ = 0;
  let smoothedCraneVX = 0;
  let smoothedCraneVZ = 0;


  function swingAcceleration(angle, speed, periodSeconds, damping, inputForce) {
    const frequency = Math.PI * 2 / periodSeconds;
    const stiffness = frequency * frequency + damping * damping * 0.25;
    return -stiffness * angle - damping * speed + inputForce;
  }

  let metalAudioContext = null;
  function unlockHookAudio() {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      if (!metalAudioContext) metalAudioContext = new Ctor();
      if (metalAudioContext.state === 'suspended') {
        metalAudioContext.resume().catch(() => {});
      }
    } catch (error) {
      console.debug('HOOK効果音は使用できません:', error);
    }
  }
  window.addEventListener('pointerdown', unlockHookAudio, { once: true });
  window.addEventListener('keydown', unlockHookAudio, { once: true });
  function playMetalTap(strength = 1) {
    try {
      unlockHookAudio();
      const ctx = metalAudioContext;
      if (!ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      for (const [frequency, decay, gainScale] of [[740, 0.15, 0.55], [1130, 0.08, 0.30]]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency, now);
        osc.frequency.exponentialRampToValueAtTime(frequency * 0.83, now + decay);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.055 * strength * gainScale, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + decay + 0.01);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      }
    } catch (error) { console.debug('HOOK接触音を再生できません:', error); }
  }

  let scrapeBuffer = null;
  let scrapeCooldown = 0;
  function playBoardScrape(dt) {
    scrapeCooldown = Math.max(0, scrapeCooldown - dt);
    if (scrapeCooldown > 0) return;
    scrapeCooldown = 0.125;
    try {
      const ctx = metalAudioContext;
      if (!ctx || ctx.state !== 'running') return;
      if (!scrapeBuffer) {
        const length = Math.floor(ctx.sampleRate * 0.16);
        scrapeBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const samples = scrapeBuffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
          const fade = Math.sin(Math.PI * i / length);
          samples[i] = (Math.random() * 2 - 1) * fade;
        }
      }
      const now = ctx.currentTime;
      const noise = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      noise.buffer = scrapeBuffer;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1000 + Math.random() * 420, now);
      filter.Q.value = 0.9;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.036, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.155);
      noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
    } catch (error) { console.debug('HOOK摩擦音を再生できません:', error); }
  }

  function playMetalClick(strength = 1) {
    try {
      unlockHookAudio();
      const ctx = metalAudioContext;
      if (!ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const volume = 0.055 * Math.min(1, Math.max(0.1, strength));
      for (const [freq, delay, decay] of [[1620, 0, 0.13], [2420, 0.022, 0.10]]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + delay);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.73, now + delay + decay);
        gain.gain.setValueAtTime(0.0001, now + delay);
        gain.gain.exponentialRampToValueAtTime(volume, now + delay + 0.007);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + decay);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + decay + 0.01);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      }
    } catch (error) {
      console.debug('HOOK効果音を再生できません:', error);
    }
  }

  function resetSwing() {
    swingX = swingZ = swingVX = swingVZ = 0;
    previousX = crane.position.x;
    previousZ = crane.position.z;
    previousVX = previousVZ = 0;
    smoothedCraneVX = smoothedCraneVZ = 0;
    returnCatchActive = false;
    returnCatchElapsed = 0;
    movedHorizontallyThisTry = false;
    startedDepthThisTry = false;
    for (const slot of slots) for (const hook of slot.hooks) {
      hookEntryByFixture.delete(hook.fixture);
    }
    chainTension = 0;
    ringVelocityReady = false;
    ringVelocityWorld.set(0, 0, 0);
    nearAssistOffset.set(0, 0, 0);
    archSlideX = 0;
    archSlideYOffset = 0;
    pendulum.position.set(0, glbInstalled ? MODEL_JOINT_Y : -0.22, 0);
    latchGlimmer.visible = false;
    latchGlimmerTime = 0;
    onHookFocusEnd?.();
    pendulum.rotation.set(0, 0, 0, 'YXZ');
    ringFacingGroup.rotation.y = ringFacingAngle;
    ringFacingGroup.position.set(0, 0, 0);
    assistHold = false;
    ringBoardCompression = 0;
    ringBoardLocalCorrection.set(0, 0, 0);
    ringBoardTouching = false;
    ringBoardContactAnnounced = false;
    boardTopTouched = new WeakSet();
    boardEdgeDropped = new WeakSet();
    boardDropFace = new WeakMap();
    boardCenterBounced = new WeakSet();
    centerBounce = null;
    gapMissedThisTry = false;
    bridgeHitCooldown = 0;
    boardImpactCooldown = 0;
    sideImpactRecorded = new WeakSet();
    ringBlockedLargeThisFrame = false;
    previousRingMatrixReady = false;
    if (ringVisual) {
      ringVisual.rotation.set(0, 0, 0);
      ringVisual.position.set(0, ARM_RING_LOCAL.y, 0);
    }
    updateConnectedChainVisual();
    updateGuideCord();
  }

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
  const previousTipPlane = new WeakMap();
  const tipPlaneFrame = new WeakMap();
  const previousMouthProbe = new WeakMap();
  const successfulEntryMemory = new WeakMap(); 
  let detectionFrame = 0;
  const previousRingCenter = new THREE.Vector3();
  const liveRingCenter = new THREE.Vector3();
  const ringVelocityWorld = new THREE.Vector3();
  let ringVelocityReady = false;
  let ringVelocityDt = 1 / 60;

  const HOOK_ROOT_ALIGNMENT = 0.56;   
  const HORIZONTAL_ENTRY_SPEED = 0.105;
  const DEPTH_ENTRY_SPEED = 0.085;
  let movedHorizontallyThisTry = false;
  let startedDepthThisTry = false;
  const hookEntryByFixture = new WeakMap();
  const approachHookBase = new THREE.Vector3();
  const approachOpenDir = new THREE.Vector3();
  const approachQuaternion = new THREE.Quaternion();

  function horizontalHookCategory(angle) {
    const side = Math.abs(Math.cos(angle));
    if (side > 0.90) return 'left-right';
    if (side < 0.12) return 'front-back';
    return 'diagonal';
  }

  function updateDirectionalApproach(vx, vz) {
    if (mode !== 'hook' || held || !slots.length) return;
    if (!startedDepthThisTry && Math.abs(vx) > 0.10) {
      movedHorizontallyThisTry = true;
    }
    if (!startedDepthThisTry && vz < -0.07) {
      startedDepthThisTry = true;
      machine.updateMatrixWorld(true);
      let anyLateralReady = false;
      for (const slot of slots) {
        if (slot.state !== 'ready') continue;
        for (const hook of slot.hooks) {
          const fixture = hook.fixture;
          fixture.localToWorld(approachHookBase.set(0, 0.05, 0));
          machine.worldToLocal(approachHookBase);
          approachOpenDir.set(-1, 0, 0).applyQuaternion(
            fixture.getWorldQuaternion(approachQuaternion)
          ).normalize();

          const aligned = Math.abs(crane.position.x - approachHookBase.x)
            <= HOOK_ROOT_ALIGNMENT + (hookDifficulty === 'easy' ? 0.14 : 0);
          const horizontalSway = ringVelocityWorld.x;
          const horizontalOpposite = horizontalSway * approachOpenDir.x
            < -CYCLE_ENTRY_MIN_SPEED * Math.max(0.25, Math.abs(approachOpenDir.x));
          const hadHorizontalSwing = Math.abs(swingZ) > 0.035 ||
            Math.abs(swingVZ) > HORIZONTAL_ENTRY_SPEED;
          const entry = {
            aligned: aligned && movedHorizontallyThisTry,
            sideReady: horizontalOpposite && hadHorizontalSwing,
            hadHorizontalSwing,
            depthReady: false,
            diagonalReady: false,
          };
          hookEntryByFixture.set(fixture, entry);
          if (entry.aligned && entry.sideReady) anyLateralReady = true;
        }
      }
      onStatus?.(anyLateralReady
        ? '🪝 横揺れがフックの口と逆方向！そのまま奥へ進んで狙おう'
        : '🪝 奥移動開始。左右フックは口と逆向きの横揺れで合わせよう');
    }
    if (!startedDepthThisTry) return;

    for (const slot of slots) {
      if (slot.state !== 'ready') continue;
      for (const hook of slot.hooks) {
        const entry = hookEntryByFixture.get(hook.fixture);
        if (!entry?.aligned) continue;
        approachOpenDir.set(-1, 0, 0).applyQuaternion(
          hook.fixture.getWorldQuaternion(approachQuaternion)
        ).normalize();
        hook.fixture.localToWorld(approachHookBase.copy(
          hook.fixture.userData.hasQuestionHookGLB
            ? HOOK_ENTRY_TIP_GLB : HOOK_ENTRY_TIP_FALLBACK
        ));
        const nearHook = Math.abs(liveRingCenter.y - approachHookBase.y)
            < CYCLE_NEAR_HOOK_HEIGHT &&
          Math.abs(liveRingCenter.x - approachHookBase.x)
            < CYCLE_NEAR_HOOK_HORIZONTAL &&
          Math.abs(liveRingCenter.z - approachHookBase.z)
            < CYCLE_NEAR_HOOK_DEPTH;
        const lateralSpeed = ringVelocityWorld.x;
        const frontBackSpeed = ringVelocityWorld.z;
        const oppositeHorizontal = lateralSpeed * approachOpenDir.x <
          -CYCLE_ENTRY_MIN_SPEED * Math.max(0.25, Math.abs(approachOpenDir.x));
        const oppositeDepth = frontBackSpeed * approachOpenDir.z <
          -DEPTH_ENTRY_SPEED * Math.max(0.25, Math.abs(approachOpenDir.z));
        const hasHorizontalPhase = Math.abs(swingZ) > 0.025 ||
          Math.abs(swingVZ) > HORIZONTAL_ENTRY_SPEED * 0.5;
        const hasDepthPhase = Math.abs(swingX) > 0.025 ||
          Math.abs(swingVX) > DEPTH_ENTRY_SPEED * 0.5;

        if (nearHook && oppositeHorizontal && hasHorizontalPhase) {
          entry.sideReady = true;
          entry.hadHorizontalSwing = true;
        }
        if (nearHook && oppositeDepth && hasDepthPhase) {
          entry.depthReady = true;
        }
        if (nearHook && oppositeDepth && oppositeHorizontal &&
            hasHorizontalPhase && hasDepthPhase) {
          entry.diagonalReady = true;
        }
        if (nearHook && entry.sideReady && entry.depthReady) {
          entry.diagonalReady = true;
        }
      }
    }
  }

  function isEntryStrategySatisfied(hook) {
    return startedDepthThisTry && hook?.fixture?.parent != null;
  }
  function updateRingVelocity(dt) {
    machine.updateMatrixWorld(true);
    ringVisual.getWorldPosition(liveRingCenter);
    if (ringVelocityReady && dt > 0.001) {
      ringVelocityWorld.copy(liveRingCenter).sub(previousRingCenter)
        .divideScalar(dt).clampLength(0, 12);
    } else {
      ringVelocityWorld.set(0, 0, 0);
    }
    ringVelocityReady = true;
    ringVelocityDt = dt;
    previousRingCenter.copy(liveRingCenter);
  }
  const rimLocal = new THREE.Vector3();
  const rimWorld = new THREE.Vector3();
  const rimInPendulum = new THREE.Vector3();
  const boardRotatedHook = new THREE.Vector3();
  let chainTension = 0;

  function ringRimAnchor(worldPoint) {
    ringVisual.updateWorldMatrix(true, false);
    const positionInRing = ringVisual.worldToLocal(worldPoint.clone());
    const dx = positionInRing.x;
    const dy = positionInRing.y;
    const length = Math.hypot(dx, dy);
    const factor = (RING_RADIUS - RING_WIRE_RADIUS * 0.5) / Math.max(length, 0.0001);
    if (length < 0.001) return new THREE.Vector3(RING_RADIUS, 0, 0);
    return new THREE.Vector3(dx * factor, dy * factor, 0);
  }

  function latchedAnchorInPendulum(anchor) {
    ringFacingGroup.updateWorldMatrix(true, false);
    rimWorld.copy(anchor);
    ringVisual.localToWorld(rimWorld);
    pendulum.worldToLocal(rimInPendulum.copy(rimWorld));
    return rimInPendulum;
  }

  function ringLatchBottomPoint() {
    return new THREE.Vector3(0, -RING_RADIUS + RING_WIRE_RADIUS * 0.5, 0);
  }

  const visualHookSeatWorld = new THREE.Vector3();
  const visualHookSeatInPendulum = new THREE.Vector3();
  const visualRingAnchorParent = new THREE.Vector3();
  const visualDesiredOffset = new THREE.Vector3();
  const visualRingAnchorWorld = new THREE.Vector3();

  function pinRingToBoardHook(info, dt, snap = false) {
    if (!held || !info || !info.hookFixture || !ringVisual) return false;
    machine.updateMatrixWorld(true);
    info.hookFixture.localToWorld(visualHookSeatWorld.copy(info.seatInHook));
    ringVisual.localToWorld(visualRingAnchorWorld.copy(info.ringBottomLocal));
    visualDesiredOffset.copy(visualHookSeatWorld).sub(visualRingAnchorWorld);
    const requiredDistance = visualDesiredOffset.length();
    pendulum.getWorldQuaternion(assistQuaternion).invert();
    visualDesiredOffset.applyQuaternion(assistQuaternion)
      .clampLength(0, VISUAL_RING_FOLLOW_LIMIT);
    visualRingAnchorParent.copy(ringFacingGroup.position).add(visualDesiredOffset);
    if (snap) ringFacingGroup.position.copy(visualRingAnchorParent);
    else ringFacingGroup.position.lerp(visualRingAnchorParent,
      Math.min(1, dt * 22));
    ringVisual.updateWorldMatrix(true, false);
    ringVisual.localToWorld(visualRingAnchorWorld.copy(info.ringBottomLocal));
    info.visualGap = visualRingAnchorWorld.distanceTo(visualHookSeatWorld);
    updateConnectedChainVisual();
    updateGuideCord();
    return requiredDistance < VISUAL_RING_FOLLOW_LIMIT + 0.04 && info.visualGap < 0.11;
  }

  const glowRingNormal = new THREE.Vector3();
  const glowRingCenter = new THREE.Vector3();
  const glowHookPoint = new THREE.Vector3();
  const glowDifference = new THREE.Vector3();
  const glowProjected = new THREE.Vector3();
  const glowQuat = new THREE.Quaternion();
  const glowGreen = new THREE.Color(0x32ff86);
  const glowEmissive = new THREE.Color(0x0cff54);
  function updateHookProximityGlow(dt) {
    const active = mode === 'hook';
    const config = difficultyConfig();
    if (active) {
      machine.updateMatrixWorld(true);
      ringVisual.getWorldPosition(glowRingCenter);
      glowRingNormal.set(0, 0, 1).applyQuaternion(
        ringVisual.getWorldQuaternion(glowQuat)
      ).normalize();
    }
    for (const slot of slots) {
      for (const hook of slot.hooks) {
        let strength = 0;
        if (active && slot.state === 'ready' && ringVisual) {
          const point = hook.fixture.userData.hasQuestionHookGLB
            ? HOOK_ENTRY_TIP_GLB : HOOK_ENTRY_TIP_FALLBACK;
          hook.fixture.localToWorld(glowHookPoint.copy(point));
          glowDifference.copy(glowHookPoint).sub(glowRingCenter);
          const plane = Math.abs(glowDifference.dot(glowRingNormal));
          glowProjected.copy(glowDifference).addScaledVector(glowRingNormal,
            -glowDifference.dot(glowRingNormal));
          const rim = Math.abs(glowProjected.length() - RING_RADIUS);
          const height = Math.abs(glowDifference.y);
          const normalized = Math.hypot(plane / config.glow,
            rim / (config.glow * 0.85), height / (config.glow * 0.90));
          strength = THREE.MathUtils.clamp(1.85 - normalized * 1.55, 0, 1);
        }
        if ((slot.state === 'held' || slot.state === 'hook-suspended') && held === slot) strength = 1;
        const old = hook.fixture.userData.glowLevel || 0;
        const level = THREE.MathUtils.damp(old, strength, 12, dt || 1/60);
        hook.fixture.userData.glowLevel = level;
        for (const record of hook.fixture.userData.glowMaterials || []) {
          const mat = record.material;
          if (record.originalColor && mat.color) {
            mat.color.copy(record.originalColor).lerp(glowGreen, level * 0.77);
          }
          if (record.originalEmissive && mat.emissive) {
            mat.emissive.copy(record.originalEmissive).lerp(glowEmissive, level);
            mat.emissiveIntensity = THREE.MathUtils.lerp(
              record.originalEmissiveIntensity, 1.0, level);
          }
        }
        const marker = hook.fixture.userData.hookGlowMarker;
        if (marker) {
          marker.visible = active && level > 0.08;
          marker.material.opacity = Math.min(0.24, level * 0.20);
        }
      }
    }
  }

  const assistWorldDelta = new THREE.Vector3();
  const assistLocalDelta = new THREE.Vector3();
  const assistAnchorWorld = new THREE.Vector3();
  const assistQuaternion = new THREE.Quaternion();
  let assistHold = false;
  function applyCloseCatchAssist(targetWorld) {
    const max = difficultyConfig().assist;
    const nearestPoint = ringRimAnchor(targetWorld);
    ringVisual.localToWorld(assistAnchorWorld.copy(nearestPoint));
    assistWorldDelta.copy(targetWorld).sub(assistAnchorWorld);
    assistWorldDelta.clampLength(0, max);
    pendulum.getWorldQuaternion(assistQuaternion).invert();
    assistLocalDelta.copy(assistWorldDelta).applyQuaternion(assistQuaternion);
    ringFacingGroup.position.copy(assistLocalDelta);
    assistHold = true;
    return assistWorldDelta.length();
  }

  function guideRingNearHook(dt) {
    if (mode !== 'hook' || held || gapMissedThisTry || centerBounce || !startedDepthThisTry ||
        clawRig.position.y > -1.00 || !ringVisual || dt <= 0) return;
    const cfg = difficultyConfig();
    const allowedAssist = returnCatchActive
      ? Math.min(cfg.assist, 0.11) : cfg.assist;
    const budget = Math.max(0, allowedAssist - nearAssistOffset.length());
    if (budget < 0.0005) return;
    machine.updateMatrixWorld(true);
    ringVisual.getWorldPosition(nearAssistCenter);
    let smallestError = Infinity;
    let found = false;
    for (const slot of slots) {
      if (slot.state !== 'ready' || boardEdgeDropped.has(slot)) continue;
      for (const hook of slot.hooks) {
        if (!isEntryStrategySatisfied(hook)) continue;
        hook.fixture.localToWorld(nearAssistHookPoint.copy(
          hook.fixture.userData.hasQuestionHookGLB
            ? HOOK_ENTRY_TIP_GLB : HOOK_ENTRY_TIP_FALLBACK));
        nearAssistOpening.set(-1, 0, 0).applyQuaternion(
          hook.fixture.getWorldQuaternion(nearAssistQuaternion)).normalize();
        const fromMouthSide = nearAssistCenter.clone()
          .sub(nearAssistHookPoint).dot(nearAssistOpening);
        if (fromMouthSide < -0.035 || fromMouthSide > 0.29) continue;
        if (Math.abs(nearAssistCenter.y - nearAssistHookPoint.y) > 0.30) continue;
        nearAssistTarget.copy(nearAssistHookPoint)
          .addScaledVector(nearAssistOpening, 0.06);
        nearAssistError.copy(nearAssistTarget).sub(nearAssistCenter);
        nearAssistError.y = 0; 
        const distance = nearAssistError.length();
        if (distance < 0.002 || distance > cfg.assist + 0.12 ||
            distance >= smallestError) continue;
        smallestError = distance;
        nearAssistStep.copy(nearAssistError);
        found = true;
      }
    }
    if (!found) return;
    nearAssistStep.clampLength(0,
      Math.min(budget, dt * (returnCatchActive ? 0.10 : 0.28)));
    const wq = pendulum.getWorldQuaternion(nearAssistQuaternion).invert();
    nearAssistStep.applyQuaternion(wq);
    ringFacingGroup.position.add(nearAssistStep);
    nearAssistOffset.add(nearAssistStep);
    machine.updateMatrixWorld(true);
  }

  function measureContact() {
    if (mode !== 'hook' || held || gapMissedThisTry || !canDetectContact) return null;
    machine.updateMatrixWorld(true);
    ringVisual.getWorldPosition(ringWorld);
    ringNormal.set(0, 0, 1)
      .applyQuaternion(ringVisual.getWorldQuaternion(tmpQuat)).normalize();
    let best = null;
    const cfg = difficultyConfig();
    for (const slot of slots) {
      if (slot.state !== 'ready' || boardEdgeDropped.has(slot)) continue;
      for (const hook of slot.hooks) {
        const fixture = hook.fixture;
        localHookPoint.copy(fixture.userData.hasQuestionHookGLB
          ? HOOK_ENTRY_TIP_GLB : HOOK_ENTRY_TIP_FALLBACK);
        fixture.localToWorld(hookWorld.copy(localHookPoint));
        ringToHook.copy(hookWorld).sub(ringWorld);
        const signedPlane = ringToHook.dot(ringNormal);
        const planeDist = Math.abs(signedPlane);
        projected.copy(ringToHook).addScaledVector(ringNormal, -signedPlane);
        const radialDist = projected.length();
        openDirection.set(-1, 0, 0).applyQuaternion(
          fixture.getWorldQuaternion(new THREE.Quaternion())
        ).normalize();
        const openSide = ringWorld.clone().sub(hookWorld).dot(openDirection);
        const innerHole = RING_RADIUS - RING_WIRE_RADIUS - 0.018;
        const tipInsideHole = radialDist <= innerHole;

        const previous = previousTipPlane.get(fixture);
        const previousFrame = tipPlaneFrame.get(fixture);
        const crossedPlane = previousFrame === detectionFrame - 1 &&
          Number.isFinite(previous) && previous * signedPlane <= 0 &&
          Math.abs(previous - signedPlane) > 0.009 &&
          Math.abs(previous) < 0.35 && planeDist < cfg.plane;
        previousTipPlane.set(fixture, signedPlane);
        tipPlaneFrame.set(fixture, detectionFrame);

        const old = previousMouthProbe.get(fixture);
        const isDescending = ringVelocityWorld.y < -0.015;
        const atMouth = planeDist < cfg.plane + 0.10 &&
          radialDist < RING_RADIUS + cfg.radial + 0.10 &&
          openSide >= -0.09 && openSide <= 0.50;
        const outsideOnMouthSide = atMouth && openSide >= 0.07 &&
          ringWorld.y > hookWorld.y - 0.22;
        const originUntil = outsideOnMouthSide
          ? detectionFrame + CYCLE_MOUTH_MEMORY_FRAMES : (old?.originUntil || 0);
        const cameFromOpening = originUntil >= detectionFrame ||
          (returnCatchActive && atMouth && openSide >= -0.015);
        const justEnteredHole = !!old && old.frame === detectionFrame - 1 &&
          !old.inside && tipInsideHole && planeDist < cfg.plane * 0.90;
        const sweptIntoHole = !!old && old.frame === detectionFrame - 1 &&
          old.atMouth && tipInsideHole &&
          planeDist < cfg.plane * 0.90 &&
          (old.radial > radialDist + 0.012 || old.plane > planeDist + 0.012) &&
          (old.radial > innerHole * 0.77 || old.plane > cfg.plane * 0.64);
        const returnMotion = returnCatchActive &&
          returnCatchElapsed >= RETURN_CATCH_MIN_SECONDS &&
          ringVelocityWorld.y > -0.42;
        const stableHoleFrames = !!old && old.frame === detectionFrame - 1 &&
          old.inside && tipInsideHole && planeDist < cfg.plane * 0.73 &&
          Math.abs(ringToHook.y) < cfg.height * 0.8 &&
          openSide >= -0.020 && openSide <= 0.23
          ? (old.stableHoleFrames || 0) + 1 : 0;
        const seatedFromMouth = stableHoleFrames >= 3 &&
          (isDescending || returnMotion) &&
          (cameFromOpening || openSide >= 0.015);
        const returningIntoHole = returnMotion && cameFromOpening && atMouth &&
          tipInsideHole && openSide >= -0.07 && openSide <= 0.35 &&
          (crossedPlane || justEnteredHole || sweptIntoHole || seatedFromMouth);
        const enteredHole = (isDescending || returnMotion) &&
          (cameFromOpening || seatedFromMouth) && atMouth &&
          openSide >= -0.07 && openSide <= 0.35 &&
          (crossedPlane || justEnteredHole || sweptIntoHole || seatedFromMouth) &&
          tipInsideHole;
        if (ringBlockedLargeThisFrame) {
          successfulEntryMemory.delete(fixture);
          previousMouthProbe.delete(fixture);
        } else {
          if (enteredHole) successfulEntryMemory.set(fixture, {
            frame: detectionFrame,
            method: returningIntoHole ? 'return-pull' : 'hole'
          });
          previousMouthProbe.set(fixture, {
            frame: detectionFrame,
            radial: radialDist, plane: planeDist, openSide,
            originUntil, atMouth, stableHoleFrames,
            inside: tipInsideHole && planeDist < cfg.plane
          });
        }
        const remembered = successfulEntryMemory.get(fixture);
        const recentEntry = remembered &&
          detectionFrame - remembered.frame <= CYCLE_HOLE_ENTRY_MEMORY_FRAMES;
        if (ringBlockedLargeThisFrame || !recentEntry || !tipInsideHole || planeDist > cfg.plane ||
            Math.abs(ringToHook.y) > cfg.height + 0.06 ||
            openSide < -0.085 || openSide > 0.40 ||
            (!seatedFromMouth && originUntil < detectionFrame &&
             !(returnMotion && openSide >= -0.015))) continue;

        const planeSpeed = ringVelocityWorld.length();
        const fullyLatched =
          radialDist <= innerHole - 0.024 &&
          planeDist <= cfg.plane * 0.58 &&
          Math.abs(ringToHook.y) <= cfg.height * 0.68 &&
          openSide >= -0.075 && openSide <= 0.075;
        const score = THREE.MathUtils.clamp(
          0.43 + Math.max(0, innerHole - radialDist) * 0.66 +
          Math.min(0.20, planeSpeed * 0.07) +
          0.05, 0, 1);
        if (!best || score > best.score) {
          best = {
            slot, hook, score, cycleEntry: true,
            fullyLatched,
            entryMethod: remembered.method,
            hookWorld: hookWorld.clone(),
            hookPointLocal: localHookPoint.clone(),
            radialDist, openSide
          };
        }
      }
    }
    return best;
  }

  const GLB_HOOK_COLLIDER = [
    [0.011, 0.065], [0.018, 0.117], [0.056, 0.175],
    [0.112, 0.224], [0.145, 0.265], [0.149, 0.320],
    [0.131, 0.369], [0.092, 0.415], [0.040, 0.442],
    [-0.020, 0.443], [-0.082, 0.419], [-0.121, 0.383],
    [-0.146, 0.341], [-0.151, 0.292]
  ].map(([x, y]) => new THREE.Vector3(x, y, 0));
  const FALLBACK_HOOK_COLLIDER = [
    [0, 0.09], [0, 0.17], [0.04, 0.23], [0.10, 0.27],
    [0.17, 0.31], [0.20, 0.36], [0.20, 0.41], [0.15, 0.46],
    [0.08, 0.47], [0.005, 0.415], [-0.048, 0.347]
  ].map(([x, y]) => new THREE.Vector3(x, y, 0));
  const metalMatrixInverse = new THREE.Matrix4();
  const metalLocal = new THREE.Vector3();
  const metalRim = new THREE.Vector3();
  const metalSeparation = new THREE.Vector3();
  const metalBestPush = new THREE.Vector3();
  const metalWorldPush = new THREE.Vector3();
  const metalSweepStart = new THREE.Vector3();
  const metalSweepEnd = new THREE.Vector3();
  const metalSweepLocal = new THREE.Vector3();
  const metalSweepCurrent = new THREE.Vector3();
  const metalWorldPoint = new THREE.Vector3();
  const metalWorldSegment = new THREE.Vector3();
  const metalSweepDelta = new THREE.Vector3();
  const RING_COLLISION_SAMPLES = 40;
  let hookCollisionMessageCooldown = 0;

  function closestSegments(p, q, a, b) {
    const ux = q.x - p.x, uy = q.y - p.y, uz = q.z - p.z;
    const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z;
    const wx = p.x - a.x, wy = p.y - a.y, wz = p.z - a.z;
    const A = ux*ux + uy*uy + uz*uz;
    const B = ux*vx + uy*vy + uz*vz;
    const C = vx*vx + vy*vy + vz*vz;
    const D = ux*wx + uy*wy + uz*wz;
    const E = vx*wx + vy*wy + vz*wz;
    let sc = 0, tc = 0;
    const denom = A*C - B*B;
    if (A < 1e-12) {
      tc = C > 1e-12 ? THREE.MathUtils.clamp(E/C, 0, 1) : 0;
    } else if (C < 1e-12) {
      sc = THREE.MathUtils.clamp(-D/A, 0, 1);
    } else {
      sc = denom > 1e-12 ? THREE.MathUtils.clamp((B*E-C*D)/denom, 0, 1) : 0;
      tc = (B*sc + E) / C;
      if (tc < 0) { tc = 0; sc = THREE.MathUtils.clamp(-D/A, 0, 1); }
      else if (tc > 1) { tc = 1; sc = THREE.MathUtils.clamp((B-D)/A, 0, 1); }
    }
    const dx = wx + sc*ux - tc*vx;
    const dy = wy + sc*uy - tc*vy;
    const dz = wz + sc*uz - tc*vz;
    return { distanceSquared: dx*dx+dy*dy+dz*dz, t: sc };
  }

  function closestPointToSegment(point, a, b, out) {
    out.copy(b).sub(a);
    const denom = out.lengthSq();
    const t = denom > 1e-12
      ? THREE.MathUtils.clamp(metalWorldPoint.copy(point).sub(a).dot(out)/denom, 0, 1)
      : 0;
    return out.copy(a).addScaledVector(metalWorldSegment.copy(b).sub(a), t);
  }

  function preventHookMetalPenetration() {
    if (mode !== 'hook' || gapMissedThisTry || !ringVisual || held || !slots.length) return;
    machine.updateMatrixWorld(true);
    const hookColliders = [];
    for (const slot of slots) {
      if (slot.state !== 'ready') continue;
      for (const hook of slot.hooks) {
        const glb = !!hook.fixture.userData.hasQuestionHookGLB;
        const source = glb ? GLB_HOOK_COLLIDER : FALLBACK_HOOK_COLLIDER;
        const points = source.map(p => p.clone().applyMatrix4(hook.fixture.matrixWorld));
        hookColliders.push({ points, wireGap: RING_WIRE_RADIUS + (glb ? 0.030 : 0.035) + 0.004 });
      }
    }
    if (!hookColliders.length) return;

    let earliestHit = 1.1;
    metalSweepDelta.set(0, 0, 0);
    if (previousRingMatrixReady) {
      for (let i = 0; i < RING_COLLISION_SAMPLES; i++) {
        const theta = Math.PI * 2 * i / RING_COLLISION_SAMPLES;
        metalSweepLocal.set(Math.cos(theta)*RING_RADIUS, Math.sin(theta)*RING_RADIUS, 0);
        metalSweepStart.copy(metalSweepLocal).applyMatrix4(previousRingMatrixWorld);
        metalSweepEnd.copy(metalSweepLocal).applyMatrix4(ringVisual.matrixWorld);
        const pathLengthSq = metalSweepStart.distanceToSquared(metalSweepEnd);
        if (pathLengthSq < 0.00008 || pathLengthSq > 0.16) continue;
        for (const collider of hookColliders) {
          const gapSq = collider.wireGap * collider.wireGap;
          for (let j = 1; j < collider.points.length; j++) {
            const a = collider.points[j-1], b = collider.points[j];
            closestPointToSegment(metalSweepStart, a, b, metalSweepCurrent);
            if (metalSweepCurrent.distanceToSquared(metalSweepStart) <= gapSq*1.20) continue;
            const hit = closestSegments(metalSweepStart, metalSweepEnd, a, b);
            if (hit.distanceSquared < gapSq && hit.t < earliestHit) {
              earliestHit = hit.t;
              metalSweepDelta.copy(metalSweepStart).sub(metalSweepEnd);
            }
          }
        }
      }
    }
    if (earliestHit <= 1) {
      metalWorldPush.copy(metalSweepDelta).multiplyScalar(1 - earliestHit + 0.02);
      metalWorldPush.clampLength(0, 0.18);
      pendulum.getWorldQuaternion(collisionParentQuaternion).invert();
      metalWorldPush.applyQuaternion(collisionParentQuaternion);
      ringFacingGroup.position.add(metalWorldPush);
      if (metalWorldPush.length() > 0.035) ringBlockedLargeThisFrame = true;
      machine.updateMatrixWorld(true);
    }

    for (let pass = 0; pass < 4; pass++) {
      machine.updateMatrixWorld(true);
      metalMatrixInverse.copy(ringVisual.matrixWorld).invert();
      let maxOverlap = 0;
      metalBestPush.set(0, 0, 0);
      for (const collider of hookColliders) {
        for (let j = 1; j < collider.points.length; j++) {
          const a = collider.points[j-1], b = collider.points[j];
          const count = Math.max(1, Math.ceil(a.distanceTo(b)/0.012));
          for (let k = 0; k <= count; k++) {
            metalLocal.copy(a).lerp(b, k/count).applyMatrix4(metalMatrixInverse);
            const radial = Math.hypot(metalLocal.x, metalLocal.y);
            if (radial < 0.000001) continue;
            metalRim.set(metalLocal.x * RING_RADIUS/radial,
              metalLocal.y * RING_RADIUS/radial, 0);
            metalSeparation.copy(metalLocal).sub(metalRim);
            const dist = metalSeparation.length();
            const overlap = collider.wireGap - dist;
            if (overlap > maxOverlap && overlap > 0.0001) {
              maxOverlap = overlap;
              if (dist > 0.00001) metalBestPush.copy(metalSeparation).multiplyScalar(-overlap/dist);
              else metalBestPush.set(0, 0, -overlap);
            }
          }
        }
      }
      if (maxOverlap <= 0.0001) break;
      metalBestPush.applyQuaternion(ringVisual.getWorldQuaternion(collisionParentQuaternion));
      pendulum.getWorldQuaternion(collisionParentQuaternion).invert();
      metalBestPush.applyQuaternion(collisionParentQuaternion).clampLength(0, 0.050);
      ringFacingGroup.position.add(metalBestPush);
      if (maxOverlap > 0.040) ringBlockedLargeThisFrame = true;
      if (hookCollisionMessageCooldown <= 0) {
        playMetalTap(0.8);
        onStatus?.('カン！ フック金属に接触。振り子の向きで穴を狙おう');
        hookCollisionMessageCooldown = 0.50;
      }
    }
  }

  const boardContactWorld = new THREE.Vector3();
  const boardContactLocal = new THREE.Vector3();
  const boardContactPreviousWorld = new THREE.Vector3();
  const boardContactPreviousLocal = new THREE.Vector3();
  const boardContactCenter = new THREE.Vector3();
  const boardCollisionCorrectionWorld = new THREE.Vector3();
  const boardCorrectionTemp = new THREE.Vector3();
  const boardCollisionCorrectionLocal = new THREE.Vector3();
  const boardCorrectionQuaternion = new THREE.Quaternion();
  const RING_CONTACT_POINTS = 40;
  const BOARD_TOP_MARGIN = 0.018;
  const BOARD_SIDE_GAP = 0.006;
  const BOARD_EDGE_EXIT_MARGIN = 0.025;
  const BOARD_TOP_ENTRY_TOLERANCE = 0.032;

  function boardExitFace(center, halfW, halfL) {
    const candidates = [
      { axis: 'x', sign: -1, beyond: -halfW - center.x },
      { axis: 'x', sign:  1, beyond: center.x - halfW },
      { axis: 'z', sign: -1, beyond: -halfL - center.z },
      { axis: 'z', sign:  1, beyond: center.z - halfL }
    ];
    const outside = candidates.filter(side => side.beyond > 0);
    if (outside.length) return outside.reduce((a, b) => a.beyond >= b.beyond ? a : b);
    return candidates.reduce((a, b) => a.beyond >= b.beyond ? a : b);
  }

  function applyBoardCollisionCorrection(localDelta, topContact = false) {
    if (localDelta.lengthSq() <= 1e-12) return;
    boardCollisionCorrectionWorld.copy(localDelta).applyQuaternion(
      activeCollisionBoard.root.getWorldQuaternion(boardCorrectionQuaternion)
    );
    pendulum.getWorldQuaternion(boardCorrectionQuaternion).invert();
    boardCollisionCorrectionLocal.copy(boardCollisionCorrectionWorld)
      .applyQuaternion(boardCorrectionQuaternion);
    ringFacingGroup.position.add(boardCollisionCorrectionLocal);
    ringBoardLocalCorrection.add(boardCollisionCorrectionLocal);
    if (topContact) {
      ringBoardCompression += Math.max(0, localDelta.y);
    }
    if (!topContact && localDelta.lengthSq() > 0.10 * 0.10)
      ringBlockedLargeThisFrame = true;
    machine.updateMatrixWorld(true);
  }

  const bounceLocalRing = new THREE.Vector3();
  const bounceWorldTip = new THREE.Vector3();
  const BOUNCE_CENTER_X = 0.43;
  const BOUNCE_CENTER_Z = 0.83;
  const BOUNCE_EDGE_TARGET = BOARD_WIDTH / 2 - 0.075;
  function launchCenterBounce(board, boardLocalCenter) {
    if (gapMissedThisTry || held || boardCenterBounced.has(board) || centerBounce) return;
    if (Math.abs(boardLocalCenter.x) > BOUNCE_CENTER_X ||
        Math.abs(boardLocalCenter.z) > BOUNCE_CENTER_Z) return;
    for (const hook of board.hooks) {
      const entry = successfulEntryMemory.get(hook.fixture);
      if (entry && detectionFrame - entry.frame <= CYCLE_HOLE_ENTRY_MEMORY_FRAMES) return;
      hook.fixture.localToWorld(bounceWorldTip.copy(
        hook.fixture.userData.hasQuestionHookGLB
          ? HOOK_ENTRY_TIP_GLB : HOOK_ENTRY_TIP_FALLBACK));
      ringVisual.getWorldPosition(bounceLocalRing);
      if (bounceWorldTip.distanceTo(bounceLocalRing) < 0.26) return;
    }
    const horizontal = Math.abs(ringVelocityWorld.x) > 0.10
      ? ringVelocityWorld.x
      : Math.abs(boardLocalCenter.x) > 0.035
        ? boardLocalCenter.x
        : SLOT_X[board.index];
    const direction = Math.sign(horizontal) || 1;
    boardCenterBounced.add(board);
    centerBounce = { board, direction, elapsed: 0 };
    const incomingSwing = Math.min(1.3, Math.abs(swingVZ));
    swingVZ = direction * (0.40 + incomingSwing * 0.36);
    swingVX *= 0.90;
    emitArcadeEvent('board-impact', 0.65);
    contactCandidate = null;
    contactAge = Infinity;
    for (const slot of slots) for (const hook of slot.hooks) {
      successfulEntryMemory.delete(hook.fixture);
      previousMouthProbe.delete(hook.fixture);
    }
    ringBlockedLargeThisFrame = true;
    onStatus?.('🪝 板の中央に着地！鎖とリングがつながったまま端へ弾かれた');
  }

  const gapProbeLocal = new THREE.Vector3();
  const gapProbeWorld = new THREE.Vector3();
  function checkCenterGapMiss() {
    if (mode !== 'hook' || held || gapMissedThisTry || !ringVisual ||
        clawRig.position.y > -1.0) return;
    machine.updateMatrixWorld(true);
    const leftEdge = SLOT_X[0] + BOARD_WIDTH / 2;
    const rightEdge = SLOT_X[1] - BOARD_WIDTH / 2;
    let minX = Infinity, maxX = -Infinity, minY = Infinity;
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI * 2 / 32;
      gapProbeWorld.set(Math.cos(a) * RING_RADIUS, Math.sin(a) * RING_RADIUS, 0);
      ringVisual.localToWorld(gapProbeWorld);
      gapProbeLocal.copy(gapProbeWorld);
      world.worldToLocal(gapProbeLocal);
      minX = Math.min(minX, gapProbeLocal.x - RING_WIRE_RADIUS);
      maxX = Math.max(maxX, gapProbeLocal.x + RING_WIRE_RADIUS);
      minY = Math.min(minY, gapProbeLocal.y - RING_WIRE_RADIUS);
    }
    ringVisual.getWorldPosition(gapProbeLocal);
    world.worldToLocal(gapProbeLocal);
    const topY = PANEL_Y + HOOK_BOARD_TOP_Y;
    if (gapProbeLocal.x <= leftEdge + 0.035 ||
        gapProbeLocal.x >= rightEdge - 0.035 ||
        gapProbeLocal.z < SLOT_Z - BOARD_LENGTH / 2 + 0.025 ||
        gapProbeLocal.z > SLOT_Z + BOARD_LENGTH / 2 - 0.025 ||
        gapProbeLocal.y >= topY + 0.20 || minY >= topY - 0.025) return;
    gapMissedThisTry = true;
    centerBounce = null;
    contactCandidate = null;
    contactAge = Infinity;
    canDetectContact = false;
    returnCatchActive = false;
    swingVX *= 0.45;
    swingVZ *= 0.45;
    boardTopTouched = new WeakSet();
    for (const board of slots) boardEdgeDropped.add(board);
    for (const slot of slots) for (const hook of slot.hooks) {
      successfulEntryMemory.delete(hook.fixture);
      previousMouthProbe.delete(hook.fixture);
    }
    onStatus?.('✕ 板と板の隙間に落ちた！今回は失敗。リングは板の上に戻らない');
  }

  const bridgePoint = new THREE.Vector3();
  const bridgePreviousPoint = new THREE.Vector3();
  const bridgeClosestPoint = new THREE.Vector3();
  const bridgeNormal = new THREE.Vector3();
  const bridgePush = new THREE.Vector3();
  const bridgeLocalPush = new THREE.Vector3();
  const bridgeQuat = new THREE.Quaternion();
  const bridgePointLocal = new THREE.Vector3();
  const bridgeA = new THREE.Vector3();
  const bridgeB = new THREE.Vector3();
  const BRIDGE_COLLISION_POINTS = 28;
  const BRIDGE_COLLISION_MARGIN = 0.008;

  function applyBridgePush(worldDelta, impactKind) {
    if (worldDelta.lengthSq() <= 1e-10) return;
    pendulum.getWorldQuaternion(bridgeQuat).invert();
    bridgeLocalPush.copy(worldDelta).applyQuaternion(bridgeQuat);
    ringFacingGroup.position.add(bridgeLocalPush);
    ringBoardLocalCorrection.add(bridgeLocalPush);
    if (worldDelta.lengthSq() > 0.14 * 0.14)
      ringBlockedLargeThisFrame = true;
    if (bridgeHitCooldown <= 0) {
      const impulseX = THREE.MathUtils.clamp(worldDelta.x * 2.8, -0.30, 0.30);
      const impulseZ = THREE.MathUtils.clamp(worldDelta.z * 2.8, -0.30, 0.30);
      swingVZ = THREE.MathUtils.clamp(swingVZ * 0.46 + impulseX, -1.55, 1.55);
      if (hookDifficulty !== 'easy') {
        swingVX = THREE.MathUtils.clamp(swingVX * 0.46 - impulseZ, -1.55, 1.55);
      }
      bridgeHitCooldown = 0.23;
      chainTension = Math.max(chainTension, 0.18);
      playMetalTap(0.68);
      emitArcadeEvent('rail-impact', 0.60);
      onStatus?.(`カン！ 橋の${impactKind}に当たってリングが弾かれた`);
    }
    machine.updateMatrixWorld(true);
  }

  function preventBridgePenetration() {
    if (mode !== 'hook' || held || gapMissedThisTry || !ringVisual ||
        clawRig.position.y > -0.90) return;
    machine.updateMatrixWorld(true);
    const rods = bridgeCollisionRods.map(part => ({
      a: world.localToWorld(bridgeA.copy(part.a)).clone(),
      b: world.localToWorld(bridgeB.copy(part.b)).clone(),
      radius: part.radius + RING_WIRE_RADIUS + BRIDGE_COLLISION_MARGIN,
      kind: part.kind
    }));
    if (previousRingMatrixReady) {
      let earliest = 1.1;
      let sweepPush = null;
      let impactKind = '';
      for (let i = 0; i < BRIDGE_COLLISION_POINTS; i++) {
        const theta = i * Math.PI * 2 / BRIDGE_COLLISION_POINTS;
        bridgePointLocal.set(Math.cos(theta) * RING_RADIUS,
          Math.sin(theta) * RING_RADIUS, 0);
        bridgePreviousPoint.copy(bridgePointLocal).applyMatrix4(previousRingMatrixWorld);
        bridgePoint.copy(bridgePointLocal).applyMatrix4(ringVisual.matrixWorld);
        if (bridgePoint.distanceToSquared(bridgePreviousPoint) > 0.30) continue;
        for (const part of rods) {
          const threshold = part.radius * part.radius;
          closestPointToSegment(bridgePreviousPoint, part.a, part.b, bridgeClosestPoint);
          if (bridgePreviousPoint.distanceToSquared(bridgeClosestPoint) < threshold * 1.05) continue;
          const hit = closestSegments(bridgePreviousPoint, bridgePoint, part.a, part.b);
          if (hit.distanceSquared < threshold && hit.t < earliest) {
            earliest = hit.t;
            sweepPush = bridgePreviousPoint.clone().sub(bridgePoint)
              .multiplyScalar(1 - hit.t + 0.025);
            impactKind = part.kind;
          }
        }
      }
      if (sweepPush) {
        sweepPush.clampLength(0, 0.16);
        applyBridgePush(sweepPush, impactKind);
      }
    }
    for (let pass = 0; pass < 2; pass++) {
      machine.updateMatrixWorld(true);
      let deepest = 0;
      let bestKind = '';
      bridgePush.set(0, 0, 0);
      for (let i = 0; i < BRIDGE_COLLISION_POINTS; i++) {
        const theta = i * Math.PI * 2 / BRIDGE_COLLISION_POINTS;
        bridgePoint.set(Math.cos(theta) * RING_RADIUS,
          Math.sin(theta) * RING_RADIUS, 0);
        ringVisual.localToWorld(bridgePoint);
        for (const part of rods) {
          closestPointToSegment(bridgePoint, part.a, part.b, bridgeClosestPoint);
          bridgeNormal.copy(bridgePoint).sub(bridgeClosestPoint);
          const distance = bridgeNormal.length();
          const overlap = part.radius - distance;
          if (overlap > deepest + 0.0001) {
            deepest = overlap;
            if (distance > 0.00001) bridgePush.copy(bridgeNormal).multiplyScalar(overlap / distance);
            else bridgePush.set(0, -overlap, 0);
            bestKind = part.kind;
          }
        }
      }
      if (deepest < 0.0001) break;
      bridgePush.clampLength(0, 0.13);
      applyBridgePush(bridgePush, bestKind);
    }
  }

  let activeCollisionBoard = null;
  function preventBoardPenetration() {
    if (mode !== 'hook' || gapMissedThisTry || held || !ringVisual || clawRig.position.y > -1.0) return;
    machine.updateMatrixWorld(true);
    const halfW = BOARD_WIDTH / 2;
    const halfL = BOARD_LENGTH / 2;
    const top = HOOK_BOARD_TOP_Y;
    const bottom = top - BOARD_THICKNESS;
    const rim = RING_RADIUS;
    const wire = RING_WIRE_RADIUS;

    for (const board of slots) {
      if (board.state !== 'ready') continue;
      activeCollisionBoard = board;
      ringVisual.getWorldPosition(boardContactCenter);
      board.root.worldToLocal(boardContactCenter);
      const face = boardExitFace(boardContactCenter, halfW, halfL);
      const beyondEdge = face.beyond > BOARD_EDGE_EXIT_MARGIN;
      if (boardTopTouched.has(board) && beyondEdge &&
          boardContactCenter.y - rim - wire < top + 0.10) {
        boardEdgeDropped.add(board);
        boardDropFace.set(board, {axis: face.axis, sign: face.sign});
      }

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      let deepestTop = 0;
      let hasTopApproach = false;
      for (let i = 0; i < RING_CONTACT_POINTS; i++) {
        const a = i * Math.PI * 2 / RING_CONTACT_POINTS;
        const x = Math.cos(a) * rim, y = Math.sin(a) * rim;
        boardContactWorld.set(x, y, 0);
        ringVisual.localToWorld(boardContactWorld);
        boardContactLocal.copy(boardContactWorld);
        board.root.worldToLocal(boardContactLocal);
        minX = Math.min(minX, boardContactLocal.x - wire);
        maxX = Math.max(maxX, boardContactLocal.x + wire);
        minY = Math.min(minY, boardContactLocal.y - wire);
        maxY = Math.max(maxY, boardContactLocal.y + wire);
        minZ = Math.min(minZ, boardContactLocal.z - wire);
        maxZ = Math.max(maxZ, boardContactLocal.z + wire);

        if (boardEdgeDropped.has(board)) continue;
        if (Math.abs(boardContactLocal.x) > halfW + wire ||
            Math.abs(boardContactLocal.z) > halfL + wire ||
            Math.abs(boardContactCenter.x) > halfW + BOARD_EDGE_EXIT_MARGIN ||
            Math.abs(boardContactCenter.z) > halfL + BOARD_EDGE_EXIT_MARGIN) continue;
        const bottomNow = boardContactLocal.y - wire;
        if (bottomNow > top + BOARD_TOP_MARGIN) continue;
        let cameFromAbove = bottomNow >= top - BOARD_TOP_ENTRY_TOLERANCE;
        const supportedLanding = boardTopTouched.has(board) &&
          !boardEdgeDropped.has(board) && !beyondEdge &&
          boardContactCenter.y + rim >= bottom - 0.06;
        if (previousRingMatrixReady) {
          boardContactPreviousWorld.set(x, y, 0).applyMatrix4(previousRingMatrixWorld);
          boardContactPreviousLocal.copy(boardContactPreviousWorld);
          board.root.worldToLocal(boardContactPreviousLocal);
          const oldBottom = boardContactPreviousLocal.y - wire;
          cameFromAbove = oldBottom >= top - BOARD_TOP_ENTRY_TOLERANCE &&
            Math.abs(boardContactPreviousLocal.x) < halfW + wire + 0.03 &&
            Math.abs(boardContactPreviousLocal.z) < halfL + wire + 0.03;
        }
        if (!cameFromAbove && !supportedLanding) continue;
        hasTopApproach = true;
        deepestTop = Math.max(deepestTop, top + BOARD_TOP_MARGIN - bottomNow);
      }

      if (!hasTopApproach && !boardTopTouched.has(board) &&
          !boardEdgeDropped.has(board) && !beyondEdge &&
          previousRingMatrixReady && minY < top - BOARD_TOP_ENTRY_TOLERANCE &&
          maxY > bottom - 0.02) {
        for (let i = 0; i < RING_CONTACT_POINTS; i++) {
          const a = i * Math.PI * 2 / RING_CONTACT_POINTS;
          boardContactPreviousWorld.set(Math.cos(a) * rim, Math.sin(a) * rim, 0)
            .applyMatrix4(previousRingMatrixWorld);
          boardContactPreviousLocal.copy(boardContactPreviousWorld);
          board.root.worldToLocal(boardContactPreviousLocal);
          const oldAboveTop = boardContactPreviousLocal.y - wire >=
            top - BOARD_TOP_ENTRY_TOLERANCE;
          const oldWithinPlate = Math.abs(boardContactPreviousLocal.x) <= halfW + wire &&
            Math.abs(boardContactPreviousLocal.z) <= halfL + wire;
          if (!oldAboveTop || !oldWithinPlate) continue;
          boardContactWorld.set(Math.cos(a) * rim, Math.sin(a) * rim, 0);
          ringVisual.localToWorld(boardContactWorld);
          boardContactLocal.copy(boardContactWorld);
          board.root.worldToLocal(boardContactLocal);
          if (Math.abs(boardContactLocal.x) > halfW + wire ||
              Math.abs(boardContactLocal.z) > halfL + wire) continue;
          deepestTop = Math.max(deepestTop, top + BOARD_TOP_MARGIN -
            (boardContactLocal.y - wire));
          hasTopApproach = deepestTop > 0;
        }
      }

      if (hasTopApproach && deepestTop > 0) {
        const newTopLanding = !boardTopTouched.has(board);
        boardTopTouched.add(board);
        if (newTopLanding) {
          launchCenterBounce(board, boardContactCenter);
          const fallImpact = THREE.MathUtils.clamp(
            0.35 + Math.abs(ringVelocityWorld.y) * 0.22, 0.35, 1);
          if (boardImpactCooldown <= 0) {
            emitArcadeEvent('board-impact', fallImpact);
            boardImpactCooldown = 0.22;
          }
          swingVX *= 0.94;
          swingVZ *= 0.94;
          chainTension = Math.max(chainTension, 0.12);
        }
        ringBoardTouching = true;
        if (!ringBoardContactAnnounced && deepestTop > 0.012) {
          ringBoardContactAnnounced = true;
          onStatus?.('🪝 リングが板に接地！揺れでフックを狙おう');
        }
        applyBoardCollisionCorrection(boardCorrectionTemp.set(0, deepestTop, 0), true);
        continue;
      }

      if (minY >= top - 0.003 || maxY <= bottom + 0.003 ||
          minX >= halfW || maxX <= -halfW ||
          minZ >= halfL || maxZ <= -halfL) continue;
      const nearSide = face.beyond >= -(rim + wire + 0.05);
      const sideArrival = (boardEdgeDropped.has(board) || nearSide) &&
        (boardEdgeDropped.has(board) || beyondEdge ||
         !boardTopTouched.has(board) ||
         boardContactCenter.y + rim < top - 0.015);
      if (!sideArrival) continue;
      if (!boardEdgeDropped.has(board)) {
        boardEdgeDropped.add(board);
        boardDropFace.set(board, {axis: face.axis, sign: face.sign});
      }
      const side = boardDropFace.get(board) || face;
      const sideDelta = boardCorrectionTemp.set(0, 0, 0);
      if (side.axis === 'x') {
        sideDelta.x = side.sign < 0
          ? -halfW - BOARD_SIDE_GAP - maxX
          : halfW + BOARD_SIDE_GAP - minX;
      } else {
        sideDelta.z = side.sign < 0
          ? -halfL - BOARD_SIDE_GAP - maxZ
          : halfL + BOARD_SIDE_GAP - minZ;
      }
      if (sideDelta.lengthSq() > 1e-12) {
        ringBoardTouching = true;
        if (!sideImpactRecorded.has(board)) {
          sideImpactRecorded.add(board);
          const rebound = Math.min(0.28, 0.07 + sideDelta.length() * 0.60);
          if (side.axis === 'x') {
            swingVZ = THREE.MathUtils.clamp(
              swingVZ * 0.66 + side.sign * rebound, -1.6, 1.6);
          } else if (hookDifficulty !== 'easy') {
            swingVX = THREE.MathUtils.clamp(
              swingVX * 0.66 - side.sign * rebound, -1.6, 1.6);
          }
          if (boardImpactCooldown <= 0) {
            emitArcadeEvent('board-impact', 0.50);
            playMetalTap(0.40);
            boardImpactCooldown = 0.22;
          }
        }
        applyBoardCollisionCorrection(sideDelta);
      }
    }
    activeCollisionBoard = null;
  }

  function recordContact(dt) {
    if (!canDetectContact || gapMissedThisTry) return;
    contactAge += dt;
    if (mode !== 'hook' || held || settling.length || falling.length || sliding.length) return;
    if (clawRig.position.y > -1.08) return;
    detectionFrame++;
    const contact = measureContact();
    if (contact) {
      if (!contactCandidate || contactCandidate.slot.state !== 'ready' ||
          contact.fullyLatched && !contactCandidate.fullyLatched ||
          (contact.fullyLatched === contactCandidate.fullyLatched &&
           contact.score > contactCandidate.score) ||
          contactAge > 0.65) {
        contactCandidate = contact;
      }
      contactAge = 0;
      if (!contactAnnounced) {
        contactAnnounced = true;
        onStatus?.('🪝 穴へ通る動きが確認できた！引き上げ判定中…');
      }
    }
  }

  function tryHook({ silent = false, keepSearching = false } = {}) {
    if (mode !== 'hook' || held || gapMissedThisTry) return false;
    if (!keepSearching) canDetectContact = false;
    ensureTargets();

    const candidate = contactAge <= contactMemorySeconds() &&
      contactCandidate?.slot.state === 'ready' ? contactCandidate : null;
    if (!candidate) {
      if (!silent) onStatus?.('空振り！フックの口からリングの穴へ通そう');
      return false;
    }
    machine.updateMatrixWorld(true);
    const tipNow = candidate.hook.fixture.localToWorld(candidate.hookPointLocal.clone());
    const ringNow = ringVisual.getWorldPosition(new THREE.Vector3());
    const maxCatchDistance = RING_RADIUS + difficultyConfig().assist + 0.18;
    if (tipNow.distanceTo(ringNow) > maxCatchDistance) {
      if (!keepSearching) contactCandidate = null;
      if (!silent) onStatus?.('惜しい！リングがフックから離れてしまった');
      return false;
    }
    contactCandidate = null;
    canDetectContact = false;
    returnCatchActive = false;
    const slot = candidate.slot;
    const slideDir = Math.abs(slot.slideZ) > 0.015
      ? Math.sign(slot.slideZ)
      : Math.abs(ringVelocityWorld.z) > 0.07
        ? Math.sign(ringVelocityWorld.z)
        : crane.position.z < SLOT_Z ? -1 : 1;
    slot.slideDir = slideDir;
    slot.state = 'held';
    held = slot;
    candidate.hook.fixture.localToWorld(hookWorld.copy(candidate.hookPointLocal));
    slot.root.worldToLocal(hookPointOnBoard.copy(hookWorld));
    const seatInHook = (candidate.hook.fixture.userData.hasQuestionHookGLB
      ? QUESTION_HOOK_SEAT_GLB : QUESTION_HOOK_SEAT_FALLBACK).clone();
    const entrySeatInHook = seatInHook.clone();
    const deepSeatInHook = seatInHook.clone().add(
      candidate.hook.fixture.userData.hasQuestionHookGLB
        ? new THREE.Vector3(0.055, 0.034, 0)
        : new THREE.Vector3(0.030, 0.026, 0)
    );
    candidate.hook.fixture.localToWorld(hookWorld.copy(seatInHook));
    const anchorRingLocal = ringLatchBottomPoint();
    heldInfo = {
      score: candidate.score,
      latchElapsed: 0,
      hangElapsed: 0,
      hangStartY: null,
      hangStartRX: 0,
      hangStartRZ: 0,
      initialRigY: clawRig.position.y,
      hookPointOnBoard: hookPointOnBoard.clone(),
      anchorRingLocal,
      ringBottomLocal: anchorRingLocal.clone(),
      hookFixture: candidate.hook.fixture,
      seatInHook,
      entrySeatInHook,
      deepSeatInHook,
      deepSeatPlayed: false,
      visualGap: Infinity,
      latchedDepth: candidate.openSide,
      cycleEntry: candidate.cycleEntry,
      slideDir
    };
    assistHold = true;
    emitArcadeEvent('hook-engage', 0.70);
    pinRingToBoardHook(heldInfo, 0, true);
    slot.slideV = 0;
    slot.oneHitSlide = {
      start: slot.slideZ,
      target: slideDir * SLIDE_FALL_DISTANCE,
      elapsed: 0
    };

    swingVX *= 0.85;
    swingVZ *= 0.85;
    chainTension = Math.max(chainTension, 0.40);
    ringVisual.localToWorld(visualRingAnchorWorld.copy(anchorRingLocal));
    ringFacingGroup.worldToLocal(visualRingAnchorWorld);
    latchGlimmer.position.copy(visualRingAnchorWorld);
    latchGlimmerTime = 0.24;
    latchGlimmer.visible = true;
    playMetalTap(0.35);
    const focusSeatInHook = entrySeatInHook.clone();
    onHookFocus?.(() => {
      if (!slot.root.visible || slot.state === 'used') return null;
      candidate.hook.fixture.updateWorldMatrix(true, false);
      return candidate.hook.fixture.localToWorld(focusSeatInHook.clone());
    }, 1.35);
    onStatus?.('🪝 フックに掛かった！リングが奥へ入ってから板を引く…');
    return true;
  }

  function beginReturnCatch() {
    if (mode !== 'hook') return;
    countCompletedHookPlay();
    if (held || gapMissedThisTry) return;
    returnCatchActive = true;
    returnCatchElapsed = 0;
    canDetectContact = true;
    onStatus?.('🪝 板に接触！揺れを残したまま、戻り始めにフックを狙う…');
  }

  function finishReturnCatch() {
    if (!returnCatchActive) return;
    returnCatchActive = false;
    if (!held) tryHook(); 
  }

  function measureContactAtBottom() {
    canDetectContact = true;
    const result = measureContact();
    canDetectContact = false;
    return result;
  }

  function slipFromHook() {
    if (!held) return;
    const slot = held;
    held = null;
    heldInfo = null;
    assistHold = false;
    if (slot.state !== 'falling') {
      slot.state = 'sliding';
      if (!sliding.includes(slot)) sliding.push(slot);
    }
    playMetalClick(0.35);
    onStatus?.('板が横棒の上をスライド中！支えから外れるまで続く…');
  }

  function release() {
    if (!held) return false;
    if (heldInfo && (held.state === 'held' || held.state === 'hook-suspended')) return false;
    slipFromHook();
    return false;
  }

  let repositionElapsed = 0;
  function update(delta) {
    const dt = Number.isFinite(delta)
      ? Math.max(0, Math.min(0.05, delta)) : 0;
    if (dt > 0) {
      if (ringBoardLocalCorrection.lengthSq() > 0) {
        ringBoardLocalCorrection.set(0, 0, 0);
        ringBoardCompression = 0;
      }
      if (!assistHold && ringFacingGroup.position.lengthSq() > 0.00000001) {
        const decay = Math.exp(-dt * (ringBoardTouching ? 1.4 : 8));
        ringFacingGroup.position.x *= decay;
        ringFacingGroup.position.z *= decay;
        ringFacingGroup.position.y *= decay;
      }
      bridgeHitCooldown = Math.max(0, bridgeHitCooldown - dt);
      boardImpactCooldown = Math.max(0, boardImpactCooldown - dt);
      if (latchGlimmerTime > 0) {
        latchGlimmerTime = Math.max(0, latchGlimmerTime - dt);
        latchGlimmer.visible = latchGlimmerTime > 0;
        latchGlimmer.material.opacity = Math.min(0.9, latchGlimmerTime * 4.0);
      }
      const vx = THREE.MathUtils.clamp(
        (crane.position.x - previousX) / dt, -8, 8
      );
      const vz = THREE.MathUtils.clamp(
        (crane.position.z - previousZ) / dt, -8, 8
      );
      previousX = crane.position.x;
      previousZ = crane.position.z;
      const velocityBlend = 1 - Math.exp(-dt * 12);
      smoothedCraneVX += (vx - smoothedCraneVX) * velocityBlend;
      smoothedCraneVZ += (vz - smoothedCraneVZ) * velocityBlend;
      const ax = THREE.MathUtils.clamp(
        (smoothedCraneVX - previousVX) / dt, -13, 13
      );
      const az = THREE.MathUtils.clamp(
        (smoothedCraneVZ - previousVZ) / dt, -13, 13
      );
      previousVX = smoothedCraneVX;
      previousVZ = smoothedCraneVZ;

      if (mode === 'hook') {
        const profile = swingProfile();
        const horizontalDamping = (held ? 0.92 : 0.26) * profile.dampingFactor;
        const depthDamping = (held ? 0.96 : 0.30) * profile.dampingFactor;
        const horizontalPeriod = held ? profile.latched : profile.horizontal;
        const depthPeriod = held ? profile.latched : profile.depth;
        const accelZ = swingAcceleration(
          swingZ, swingVZ, horizontalPeriod, horizontalDamping, -profile.force * ax
        );
        const accelX = swingAcceleration(
          swingX, swingVX, depthPeriod,
          hookDifficulty === 'easy' ? 5.5 : depthDamping,
          hookDifficulty === 'easy' ? 0 : +profile.force * az
        );
        swingVZ += accelZ * dt;
        swingVX += accelX * dt;
        if (centerBounce && !gapMissedThisTry && !held) {
          centerBounce.elapsed += dt;
          machine.updateMatrixWorld(true);
          ringVisual.getWorldPosition(bounceLocalRing);
          centerBounce.board.root.worldToLocal(bounceLocalRing);
          const towardEdge = bounceLocalRing.x * centerBounce.direction;
          if (towardEdge < BOUNCE_EDGE_TARGET && centerBounce.elapsed < 1.1) {
            swingVZ += centerBounce.direction * 1.30 * dt;
            if (swingVZ * centerBounce.direction < 0.43) {
              swingVZ = centerBounce.direction * 0.43;
            }
          } else {
            swingVZ *= 0.68;
            centerBounce = null;
          }
        }
        if (gapMissedThisTry) {
          swingVX *= Math.exp(-dt * 9);
          swingVZ *= Math.exp(-dt * 9);
        }
        swingZ += swingVZ * dt;
        swingX += swingVX * dt;

        const maxAngle = profile.maxAngle;
        if (Math.abs(swingZ) > maxAngle) {
          swingZ = Math.sign(swingZ) * maxAngle;
          swingVZ *= 0.55;
        }
        if (Math.abs(swingX) > maxAngle) {
          swingX = Math.sign(swingX) * maxAngle;
          swingVX *= 0.55;
        }
        pendulum.rotation.set(swingX, 0, swingZ, 'YXZ');
        ringFacingGroup.rotation.y = ringFacingAngle;
        ringVisual.rotation.set(0, 0, 0);
        ringVisual.position.copy(ARM_RING_LOCAL);
        ringBlockedLargeThisFrame = false;
            ringBoardTouching = false;
        chainTension = THREE.MathUtils.damp(chainTension, held ? 1 : 0, 6, dt);
        updateArchSlide(dt);
        guideRingNearHook(dt);
        preventBoardPenetration();
        preventBridgePenetration();
        updateRingVelocity(dt);
        updateDirectionalApproach(vx, vz);
        recordContact(dt);
        preventHookMetalPenetration();
        preventBoardPenetration();
        checkCenterGapMiss();
        machine.updateMatrixWorld(true);
        previousRingMatrixWorld.copy(ringVisual.matrixWorld);
        previousRingMatrixReady = true;
        updateGuideCord();
        hookCollisionMessageCooldown = Math.max(0, hookCollisionMessageCooldown - dt);
        if (returnCatchActive && !held) {
          returnCatchElapsed += dt;
          if (returnCatchElapsed >= RETURN_CATCH_MIN_SECONDS &&
              contactAge <= contactMemorySeconds() && contactCandidate) {
            tryHook({ silent: true, keepSearching: true });
          }
        }
        if (ringBoardTouching) {
          const contactDamping = Math.exp(-dt * 0.18);
          swingVX *= contactDamping;
          swingVZ *= contactDamping;
        }
      } else {
        resetSwing();
      }
    }

    if (held && heldInfo && (held.state === 'held' || held.state === 'hook-suspended')) {
      heldInfo.latchElapsed += dt;
      const elapsed = heldInfo.latchElapsed;
      const progress = THREE.MathUtils.clamp(
        (elapsed - VISUAL_HOOK_SEAT_DELAY) / VISUAL_HOOK_SEAT_SECONDS, 0, 1
      );
      const smooth = progress * progress * (3 - 2 * progress);
      heldInfo.seatInHook.lerpVectors(
        heldInfo.entrySeatInHook, heldInfo.deepSeatInHook, smooth
      );
      if (progress >= 1 && !heldInfo.deepSeatPlayed) {
        heldInfo.deepSeatPlayed = true;
        emitArcadeEvent('deep-latch', 1);
        playMetalClick(0.85);
        onStatus?.('🪝 カチッ！奥まで掛かったリングで板を保持！');
      }

      if (held.state === 'held') {
        if (heldInfo.deepSeatPlayed && elapsed >= VISUAL_HOOK_PAUSE_SECONDS) {
          advanceOneHitSlide(held, dt);
        }
        if (held && heldInfo) pinRingToBoardHook(heldInfo, dt);
      } else if (held.state === 'hook-suspended') {
        heldInfo.hangElapsed += dt;
        const hangT = THREE.MathUtils.clamp(
          heldInfo.hangElapsed / VISUAL_BOARD_HANG_SECONDS, 0, 1
        );
        const hangSmooth = hangT * hangT * (3 - 2 * hangT);
        held.root.position.y = heldInfo.hangStartY - VISUAL_BOARD_HANG_DROP * hangSmooth;
        held.root.rotation.x = heldInfo.hangStartRX +
          held.slideDir * VISUAL_BOARD_HANG_PITCH * hangSmooth;
        held.root.rotation.z = heldInfo.hangStartRZ + 0.055 * hangSmooth;
        pinRingToBoardHook(heldInfo, dt);
        if (hangT >= 1) finishBoardFall(held);
      }
    }

    for (let i = sliding.length - 1; i >= 0; i--) {
      const slot = sliding[i];
      if (slot.state !== 'sliding') { sliding.splice(i, 1); continue; }
      if (slot.oneHitSlide) {
        if (advanceOneHitSlide(slot, dt)) continue;
        continue;
      }
      if (Math.abs(slot.slideV) > 0) {
        const friction = SLIDE_FRICTION * dt;
        slot.slideV = Math.sign(slot.slideV) * Math.max(0, Math.abs(slot.slideV) - friction);
        playBoardScrape(dt);
        if (applyBoardSlide(slot, dt)) continue;
      }
      if (Math.abs(slot.slideV) <= 0.01) {
        slot.slideV = 0;
        slot.state = 'ready';
        sliding.splice(i, 1);
        updateBoardSupportedPose(slot, dt, true);
        clearContact();
        saveSlots();
        onStatus?.('板が少しずれた！次のプレイでもこの位置から続けられる');
      }
    }

    for (let i = settling.length - 1; i >= 0; i--) {
      const slot = settling[i];
      slot.vy -= 7.5 * dt;
      slot.root.position.y = Math.max(PANEL_Y, slot.root.position.y + slot.vy * dt);
      if (slot.root.position.y <= PANEL_Y + 0.0001) {
        slot.state = 'ready';
        settling.splice(i, 1);
        updateBoardSupportedPose(slot, dt, true);
        saveSlots();
      }
    }

    for (let i = falling.length - 1; i >= 0; i--) {
      const target = falling[i];
      target.vy -= 8.5 * dt;
      target.root.position.y += target.vy * dt;
      target.root.rotation.x += Math.sign(target.slideZ || 1) * dt * 1.15;
      target.root.rotation.z += dt * 0.55;
      if (target.root.position.y < 2.92) {
        emitArcadeEvent('board-land', Math.min(1, Math.abs(target.vy) / 6));
        falling.splice(i, 1);
        const insideFloor = Math.abs(target.root.position.x) < 2.65 &&
          Math.abs(target.root.position.z) < 2.00;
        if (insideFloor) {
          target.state = 'used';
          target.root.visible = false;
          saveSlots();
          const obtainedRank = target.rank === 4 ? 4 : target.rewardRank;
          showHookGetEffect(target.rewardDifficulty || hookDifficulty);
          onAward?.(obtainedRank);
        } else {
          target.state = 'settling';
          target.slideZ = 0;
          target.slideV = 0;
          target.root.position.set(SLOT_X[target.index], PANEL_Y, SLOT_Z);
          target.root.rotation.set(0, 0, 0);
          target.vy = 0;
          target.state = 'ready';
          saveSlots();
          onStatus?.('惜しい！板が獲得口の外に落ちた');
        }
      }
    }
    if (rerollPending && !held && falling.length === 0 && settling.length === 0 && sliding.length === 0) {
      prepareNextAttempt();
    }
    updateConnectedChainVisual();
    updateRingAimShadows();
    updateHookProximityGlow(dt);
    updateCycleReadout();
    repositionElapsed += dt;
    if (repositionElapsed > 0.35) {
      repositionElapsed = 0;
      repositionPanel();
    }
  }

  const style = document.createElement('style');
  style.textContent = `
    .mini-hook-mode-panel { position: fixed; z-index: 25; left: 14px; top: 340px;
      box-sizing: border-box; width: 174px; padding: 10px; border-radius: 14px;
      border: 1px solid white; background: rgba(255,249,255,.97);
      color: #674783; box-shadow: 0 6px 20px #70528533;
      font-size: 12px; font-weight: 800; max-height:calc(100dvh - 16px);
      overflow-y:auto; overscroll-behavior:contain; }
    .mini-hook-mode-panel strong { display:block; margin-bottom: 7px; text-align:center; }
    .mini-hook-mode-buttons { display:flex; gap:5px; }
    .mini-hook-mode-buttons button { flex:1; min-width:0; background:#fff;
      border:1px solid #dcbde9; border-radius:9px; padding:8px 3px;
      color:#74578b; font-weight:900; cursor:pointer; font-size:12px; }
    .mini-hook-mode-buttons button[aria-pressed="true"] {
      background:#b76dbe; border-color:#b76dbe; color:#fff; }
    .mini-hook-difficulty { margin-top:8px; font-weight:800; font-size:11px; }
    .mini-hook-difficulty select { display:block; width:100%; margin-top:4px; padding:6px;
      border:1px solid #dcbde9; border-radius:8px; color:#674783; background:#fff;
      font-weight:800; font-size:12px; cursor:pointer; }
    .mini-hook-difficulty select:focus-visible { outline:2px solid #9851ae; outline-offset:2px; }
    .mini-hook-difficulty-status { font-size:10px; line-height:1.35; color:#805991; margin-top:4px; }
    .mini-hook-cycle-readout { margin-top:7px; padding:5px 4px;
      border-radius:7px; background:#f4eafa; text-align:center;
      font-size:11px; line-height:1.45; font-weight:800; }
    .mini-hook-get-effect { position:fixed; z-index:29; top:22%; left:50%;
      transform:translateX(-50%); min-width:180px; text-align:center; padding:16px 24px;
      pointer-events:none; font-size:28px; font-weight:1000; border-radius:20px;
      color:#fff; background:rgba(99,68,120,0.89); border:2px solid rgba(255,255,255,.8);
      box-shadow:0 8px 28px rgba(61,27,74,.30); animation:mini-hook-get-pop 450ms ease-out; }
    .mini-hook-get-effect.normal { background:rgba(134,79,170,.92); }
    .mini-hook-get-effect.hard { color:#6b3a05; background:linear-gradient(115deg,#fff9bb,#ffce52,#fff4a7);
      box-shadow:0 0 35px #ffc64b; border-color:#fff6ce; }
    .mini-hook-get-effect .sparkles { display:block; font-size:18px; letter-spacing:5px; margin-top:3px; }
    @keyframes mini-hook-get-pop { from {opacity:0;transform:translateX(-50%) scale(.68)}
      to {opacity:1;transform:translateX(-50%) scale(1)} }
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
  </div>
  <div class="mini-hook-difficulty"><label for="mini-hook-difficulty-select">🪝 フック難易度を選択</label>
    <select id="mini-hook-difficulty-select" aria-label="フックの難易度">
      <option value="easy">かんたん</option>
      <option value="normal">ふつう</option>
      <option value="hard">むずかしい</option>
    </select>
    <div class="mini-hook-difficulty-status" role="status" aria-live="polite"></div>
  </div>
  <div class="mini-hook-cycle-readout" title="左右は横揺れの周期に合わせて奥移動し、下降中も口と逆の揺れを狙う。上下は前後、斜めは合成揺れ">⏱️ 横周期: 待機中</div>
  <div class="mini-hook-direction-hint" style="margin-top:5px;font-size:10px;line-height:1.35;color:#775a87;">
    どの向きも口の向く側から下降<br>
    左右：根元→逆向き横揺れ→奥<br>
    上下：横揺れ→前後揺れ<br>
    斜め：横揺れ＋前後揺れ
  </div>`;
  document.body.appendChild(panel);
  const hookGetEffect = document.createElement('div');
  hookGetEffect.className = 'mini-hook-get-effect';
  hookGetEffect.hidden = true;
  document.body.appendChild(hookGetEffect);
  let hookGetEffectTimer = null;
  function showHookGetEffect(difficulty = hookDifficulty) {
    if (hookGetEffectTimer !== null) clearTimeout(hookGetEffectTimer);
    hookGetEffect.className = `mini-hook-get-effect ${difficulty}`;
    hookGetEffect.replaceChildren();
    const mainLine = document.createElement('span');
    mainLine.textContent = difficulty === 'hard' ? '🏆 GOLD GET!' : '🎉 GET!';
    hookGetEffect.appendChild(mainLine);
    if (difficulty !== 'easy') {
      const sparkles = document.createElement('span');
      sparkles.className = 'sparkles';
      sparkles.textContent = difficulty === 'hard' ? '✦ ★ ✦ ★ ✦' : '✧ ✦ ✧';
      hookGetEffect.appendChild(sparkles);
    }
    hookGetEffect.hidden = false;
    hookGetEffectTimer = setTimeout(() => {
      hookGetEffect.hidden = true;
      hookGetEffectTimer = null;
    }, 1150);
  }

  const difficultyWrap = panel.querySelector('.mini-hook-difficulty');
  const difficultySelect = panel.querySelector('#mini-hook-difficulty-select');
  const difficultyStatus = panel.querySelector('.mini-hook-difficulty-status');
  function refreshDifficultyUI() {
    if (difficultySelect) difficultySelect.value = hookDifficulty;
    if (difficultyStatus) difficultyStatus.textContent =
      `現在：${difficultyConfig().label}${mode === 'hook' ? '（フックモード）' : '（フック用に保存）'}`;
  }
  refreshDifficultyUI();
  if (difficultySelect) {
    difficultySelect.addEventListener('change', () => {
      if (!DIFFICULTIES[difficultySelect.value]) return;
      if (!canSwitch?.()) {
        refreshDifficultyUI();
        onStatus?.('難易度の変更はプレイ開始前に行ってください');
        return;
      }
      hookDifficulty = difficultySelect.value;
      refreshDifficultyUI();
      try { localStorage.setItem(HOOK_DIFFICULTY_KEY, hookDifficulty); } catch {}
      setRingFacingForDifficulty(hookDifficulty);
      const nextDirections = makeRandomBoardHooks();
      for (const slot of slots) {
        if (slot.state !== 'ready') continue;
        for (let i = 0; i < slot.hooks.length; i++) {
          const hook = slot.hooks[i];
          hook.angle = nextDirections[slot.index][i % nextDirections[slot.index].length].angle;
          applyFixtureDirection(hook.fixture, hook.angle);
        }
      }
      for (const slot of slots) {
        if (slot.state === 'ready' && slot.rank !== 4) {
          slot.rewardRank = drawWinningRarity();
          slot.rewardDifficulty = hookDifficulty;
        }
      }
      saveSlots();
      clearContact();
      resetSwing();
      lastCycleReadoutText = '';
      updateCycleReadout();
      const profile = swingProfile();
      const swingInfo = hookDifficulty === 'easy'
        ? '左右揺れだけ／リング回転なし' : '左右＋前後の振り子／リング回転なし';
      onStatus?.(`🪝 ${difficultyConfig().label}：${swingInfo}（横${profile.horizontal.toFixed(1)}秒）`);
    });
  }
  const cycleReadout = panel.querySelector('.mini-hook-cycle-readout');
  let lastCycleReadoutText = '';
  function updateCycleReadout() {
    if (mode !== 'hook' || !cycleReadout) return;
    const horizontalDirection = swingVZ > 0.05 ? '←' :
      swingVZ < -0.05 ? '→' : '切り返し';
    const xAmplitude = Math.abs(swingZ) + Math.abs(swingVZ) * 0.25;
    const profile = swingProfile();
    const heading = hookDifficulty === 'easy'
      ? `🪝 かんたん｜横${profile.horizontal.toFixed(1)}秒・リング横固定`
      : `🪝 ${difficultyConfig().label}｜横${profile.horizontal.toFixed(1)}秒・奥${profile.depth.toFixed(1)}秒・リング${ringFacingLabel()}（5回固定）`;
    const text = xAmplitude < 0.015
      ? `${heading}｜ほぼ静止`
      : `${heading}｜横${horizontalDirection}`;
    if (text !== lastCycleReadoutText) {
      cycleReadout.textContent = text;
      lastCycleReadoutText = text;
    }
  }

  function repositionPanel() {
    const anchor = document.querySelector('.crane-camera-panel');
    const viewportWidth = window.innerWidth || 1024;
    const viewportHeight = window.innerHeight || 768;
    const panelWidth = Math.min(panel.getBoundingClientRect().width || 174, viewportWidth - 16);
    const desiredHeight = Math.min(panel.scrollHeight || 235, viewportHeight - 16);
    let x = 14;
    let y = Math.min(340, viewportHeight - desiredHeight - 8);
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom + 8;
      const roomBelow = viewportHeight - y - 8;
      if (roomBelow < Math.min(desiredHeight, 205)) {
        if (rect.right + panelWidth + 16 <= viewportWidth) {
          x = rect.right + 8;
          y = Math.max(8, Math.min(rect.top, viewportHeight - desiredHeight - 8));
        } else if (rect.top - desiredHeight - 8 >= 8) {
          y = rect.top - desiredHeight - 8;
        } else {
          y = Math.max(8, viewportHeight - desiredHeight - 8);
        }
      }
    }
    x = Math.max(8, Math.min(x, viewportWidth - panelWidth - 8));
    y = Math.max(8, Math.min(y, viewportHeight - 136));
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
    panel.style.maxHeight = `${Math.max(128, viewportHeight - y - 8)}px`;
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
    if (cycleReadout) cycleReadout.style.display = mode === 'hook' ? '' : 'none';
    if (difficultyWrap) difficultyWrap.style.display = mode === 'hook' ? 'block' : 'none';
    refreshDifficultyUI();
    const directionHint = panel.querySelector('.mini-hook-direction-hint');
    if (directionHint) directionHint.style.display = mode === 'hook' ? '' : 'none';
    updateCycleReadout();
    repositionPanel();
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
      resetSwing();
      applyVisibility();
      onModeChange?.(mode);
    });
  }
  applyVisibility();
  window.addEventListener('resize', repositionPanel);

  return {
    isHook: () => mode === 'hook',
    shouldHoldAtHook: () => mode === 'hook' && !!held && !!heldInfo &&
      (held.state === 'held' || held.state === 'hook-suspended'),
    getHookDifficulty: () => hookDifficulty,
    getSwingPeriods: () => ({
      horizontal: swingProfile().horizontal,
      depth: swingProfile().depth,
      latched: swingProfile().latched
    }),
    getDropY: () => glbInstalled ? LARGE_ARM_DROP_Y : FALLBACK_DROP_Y,
    getDescentProgress,
    beginReturnCatch,
    finishReturnCatch,
    tryHook,
    hasHeld: () => !!held,
    release,
    update,
    isMoving: () => !!held || falling.length > 0 || settling.length > 0 || sliding.length > 0,
    ensureTargets,
    useGLB,
    prepareNextAttempt,
    resetSwing,
    resetForNextPlayer() {
      if (held) held = null;
      for (const slot of [...falling, ...settling, ...sliding]) slot.root.visible = false;
      falling = [];
      settling = [];
      sliding = [];
      heldInfo = null;
      clearContact();
      rerollPending = false;
      applyPendingRingFacing();
      facingCountedThisAttempt = false;
      resetSwing();
      buildSlots(shuffledSlots());
    }
  };
}




