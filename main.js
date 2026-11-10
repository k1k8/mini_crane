import { createCapsuleReveal } from "./capsuleReveal.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";


import {
  readMiniCraneAdminSettings
} from "./miniFeatures.js";

const CRANE_ADMIN = readMiniCraneAdminSettings();

// 追加UIは後から読み込む。ファイルが古い／読み込み失敗でも3D描画を止めない。

/*
 * MINI CANE / Three.js
 * 3本爪GLB (models/1arm.glb) と連動したつかみ判定。
 * 爪先の3D座標・カプセルの高さ・挟み位置を確認する。
 * GLB読込失敗時は仮アームを使用。保持成功率35%、5回制限は維持。
 */

// ====================================================
// 1. 基本設定
// ====================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xedeefa);
scene.fog = new THREE.Fog(0xedeefa, 18, 42);

const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);
const CAMERA_FRONT = new THREE.Vector3(0, 7.2, 18.2);
const CAMERA_SIDE = new THREE.Vector3(16.0, 7.5, 0);
const CAMERA_DIAGONAL = new THREE.Vector3(8.5, 18.5, 9.5);
const cameraGoal = CAMERA_FRONT.clone();
camera.position.copy(cameraGoal);
camera.lookAt(0, 5.1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.55;
document.getElementById("game-container").appendChild(renderer.domElement);

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener("resize", onResize);
onResize();

scene.add(new THREE.HemisphereLight(0xf7faff, 0xd7c2e1, 2.25));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
keyLight.position.set(-5, 14, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -10;
keyLight.shadow.camera.right = 10;
keyLight.shadow.camera.top = 14;
keyLight.shadow.camera.bottom = -9;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);
const fillLight = new THREE.PointLight(0xbbe9ff, 75, 14, 2);
fillLight.position.set(0, 7, 1);
scene.add(fillLight);
const pinkLight = new THREE.PointLight(0xff8bd5, 30, 11, 2);
pinkLight.position.set(-2, 8.6, 3);
scene.add(pinkLight);

const MAT = {
  white: new THREE.MeshStandardMaterial({ color: 0xfcfcff, roughness: 0.42, metalness: 0.07 }),
  warmWhite: new THREE.MeshStandardMaterial({ color: 0xfaf6fd, roughness: 0.56 }),
  floor: new THREE.MeshStandardMaterial({ color: 0xd5ecfa, roughness: 0.75 }),
  pink: new THREE.MeshStandardMaterial({ color: 0xf2a8d2, roughness: 0.40 }),
  hotPink: new THREE.MeshStandardMaterial({ color: 0xf055b1, roughness: 0.28, metalness: 0.1 }),
  aqua: new THREE.MeshStandardMaterial({ color: 0x79dafa, roughness: 0.34, metalness: 0.12 }),
  lilac: new THREE.MeshStandardMaterial({ color: 0xb695f0, roughness: 0.40 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xffc8e8, roughness: 0.25, emissive: 0xc84199, emissiveIntensity: 0.18 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xc1cbd5, metalness: 0.84, roughness: 0.22 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe0e5ee, metalness: 0.95, roughness: 0.12 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x41465a, metalness: 0.72, roughness: 0.30 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x302d48, roughness: 0.6 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xd5edff, transparent: true, opacity: 0.095, depthWrite: false, metalness: 0.04, roughness: 0.04, side: THREE.DoubleSide }),
  glow: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.6 }),
  hole: new THREE.MeshStandardMaterial({ color: 0x23263c, roughness: 0.9 }),
  guard: new THREE.MeshPhysicalMaterial({
    color: 0xa2e4fb,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    metalness: 0.08,
    roughness: 0.12,
    side: THREE.DoubleSide
  })
};

const machine = new THREE.Group();
// 写真のように幅・奥行きをやや絞った縦長筐体にする。
machine.scale.set(0.84, 1, 0.88);
scene.add(machine);

function addBox(parent, x, y, z, w, h, d, material, castShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function addSphere(parent, x, y, z, radius, material, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function addCylinder(parent, x, y, z, topR, bottomR, height, material, sides = 22) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(topR, bottomR, height, sides), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function addRod(parent, a, b, radius, material) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 10), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function labelTexture(text, { background = "#f6a6d3", color = "#ffffff", size = 62, border = "#fff1fd" } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 12;
  ctx.strokeStyle = border;
  ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  ctx.fillStyle = color;
  ctx.font = `1000 ${size * 2}px "Yu Gothic", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 5);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function addLabel(parent, text, x, y, z, width, height, settings) {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: labelTexture(text, settings), side: THREE.DoubleSide }));
  plane.position.set(x, y, z);
  parent.add(plane);
  return plane;
}

// ====================================================
// 2. 参考写真風：縦長のミニクレーン筐体
// ====================================================
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0xe7e5f2, roughness: 0.96 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.04;
ground.receiveShadow = true;
scene.add(ground);

// 底台・操作部
addBox(machine, 0, 1.55, 0, 6.15, 3.05, 4.8, MAT.white);
addBox(machine, 0, 3.07, 0, 6.1, 0.22, 4.8, MAT.warmWhite);
addBox(machine, 0, 3.21, 0, 5.35, 0.07, 4.0, MAT.floor);

// 奥面＋背面のパステル背景
addBox(machine, 0, 5.83, -2.25, 5.85, 5.0, 0.10, MAT.white);
addBox(machine, 0, 5.78, -2.19, 5.15, 4.72, 0.03,
  new THREE.MeshStandardMaterial({ color: 0xddeeff, emissive: 0x6fc9ff, emissiveIntensity: 0.16, roughness: 0.85 }));
// 側板・ガラス
// 側面を全面パネルで塞がず、ガラス越しに爪と景品を見られるようにする。
for (const x of [-3.01, 3.01]) {
  for (const z of [-2.28, 2.28]) {
    addBox(machine, x, 5.75, z, 0.18, 5.35, 0.18, MAT.white);
  }
}
addBox(machine, 0, 8.47, 0, 6.3, 0.28, 5.0, MAT.white);
addBox(machine, 0, 8.29, 2.4, 6.16, 0.13, 0.22, MAT.aqua);
// ガラスは額縁より後ろに配置
addBox(machine, 0, 5.75, 2.36, 5.83, 5.13, 0.025, MAT.glass, false);
addBox(machine, -2.92, 5.75, 0, 0.025, 4.9, 4.50, MAT.glass, false);
addBox(machine, 2.92, 5.75, 0, 0.025, 4.9, 4.50, MAT.glass, false);

// ガラスのフチ
for (const x of [-3.04, 3.04]) {
  addBox(machine, x, 5.74, 2.48, 0.17, 5.25, 0.15, MAT.white);
  addBox(machine, x * 0.94, 5.75, 2.54, 0.05, 4.92, 0.035, MAT.trim, false);
}
addBox(machine, 0, 3.23, 2.47, 6.10, 0.16, 0.17, MAT.white);
addBox(machine, 0, 8.3, 2.48, 6.10, 0.17, 0.18, MAT.white);
// 前面下パネル
addBox(machine, 0, 2.92, 2.46, 6.1, 0.4, 0.12, MAT.white);

// 天面の三角ヘッダー（画像の三角屋根）
function triangleShape(width, height) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(0, height);
  shape.lineTo(width / 2, 0);
  shape.closePath();
  return shape;
}
function addTriangle(width, height, y, z, mat, depth = 0.1) {
  const geo = new THREE.ExtrudeGeometry(triangleShape(width, height), {
    depth, steps: 1, bevelEnabled: true, bevelSegments: 2, bevelThickness: 0.025, bevelSize: 0.025
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, y, z);
  mesh.castShadow = true;
  machine.add(mesh);
  return mesh;
}
addTriangle(5.7, 1.18, 8.66, 2.36, MAT.aqua, 0.18);
addTriangle(5.15, 0.99, 8.77, 2.58, MAT.hotPink, 0.04);
addTriangle(4.73, 0.83, 8.88, 2.68, MAT.lilac, 0.04);
addLabel(machine, "MINI CRANE", 0, 9.11, 2.77, 3.05, 0.39,
  { background: "#b595ea", color: "#ffffff", size: 56, border: "#fbd8fa" });
for (const x of [-2.0, -1.5, 1.5, 2.0]) addSphere(machine, x, 8.96, 2.83, 0.075, MAT.glow);
// LED風のライン
for (const x of [-2.70, 2.70]) {
  addRod(machine, new THREE.Vector3(x, 8.72, 2.8), new THREE.Vector3(0, 9.76, 2.8), 0.045, MAT.trim);
}

// 室内照明
addBox(machine, 0, 8.2, 0.35, 4.9, 0.08, 0.27, MAT.glow, false);
addBox(machine, -2.65, 6.8, -1.75, 0.10, 2.6, 0.10, MAT.glow, false);
addBox(machine, 2.65, 6.8, -1.75, 0.10, 2.6, 0.10, MAT.glow, false);

// 3D操作台（画面下と同じ、①横・②縦の2ボタン風）
addBox(machine, -1.03, 2.48, 2.96, 3.98, 0.38, 1.4, MAT.white);
addBox(machine, -1.03, 2.7, 2.98, 3.8, 0.075, 1.24, MAT.pink);
addBox(machine, -1.03, 2.745, 2.98, 3.48, 0.03, 1.0, MAT.trim);
for (const [x, mat] of [[-1.91, MAT.hotPink], [-0.20, MAT.aqua]]) {
  addCylinder(machine, x, 2.84, 3.0, 0.44, 0.47, 0.15, MAT.chrome);
  addCylinder(machine, x, 2.98, 3.0, 0.34, 0.37, 0.14, mat);
}
// コイン投入パネル
addBox(machine, 1.96, 1.88, 2.50, 1.33, 1.95, 0.12, MAT.silver);
addBox(machine, 1.96, 1.90, 2.58, 1.07, 1.70, 0.03, MAT.chrome);
addCylinder(machine, 1.96, 2.43, 2.68, 0.22, 0.22, 0.05, MAT.darkMetal);
addBox(machine, 1.96, 2.43, 2.719, 0.04, 0.30, 0.04, MAT.dark);
addCylinder(machine, 1.96, 1.74, 2.67, 0.32, 0.32, 0.08, MAT.darkMetal);
addBox(machine, 1.96, 1.73, 2.715, 0.06, 0.42, 0.025, MAT.dark);
// 取り出し口
addBox(machine, -1.43, 0.92, 2.51, 1.76, 0.94, 0.13, MAT.hotPink);
addBox(machine, -1.43, 1.02, 2.60, 1.48, 0.64, 0.05, MAT.hole);
addLabel(machine, "PRIZE OUT", -1.43, 0.58, 2.66, 1.55, 0.27,
  { background: "#e766a7", color: "#ffffff", size: 54, border: "#f1a1ca" });

// 獲得口は上だけ開いた透明アクリルガード付き。
// 見た目の壁と物理判定を同じ GUARD_WALLS から作る。
const CHUTE_X = -2.09;
const CHUTE_Z = 1.32;
const CHUTE_HALF_W = 0.525;
const CHUTE_HALF_D = 0.53;
const GUARD_THICKNESS = 0.075;
const GUARD_HEIGHT = 0.55;
const GUARD_FRONT_HEIGHT = 0.27;
const GUARD_WALLS = [];

addBox(machine, CHUTE_X, 3.255, CHUTE_Z, 1.05, 0.025, 1.06, MAT.hole, false);

function addGuardWall(x, z, w, d, h) {
  const floor = 3.23;
  const base = floor + 0.04;
  const y = base + h / 2;
  const mesh = addBox(machine, x, y, z, w, h, d, MAT.guard, false);
  mesh.receiveShadow = false;
  GUARD_WALLS.push({
    minX: x - w / 2, maxX: x + w / 2,
    minZ: z - d / 2, maxZ: z + d / 2,
    top: base + h
  });
}

// 奥・左右の3方向は高いカバー、手前は低くして獲得口を見やすく。
addGuardWall(CHUTE_X, CHUTE_Z - CHUTE_HALF_D, 1.17, GUARD_THICKNESS, GUARD_HEIGHT);
addGuardWall(CHUTE_X - CHUTE_HALF_W, CHUTE_Z, GUARD_THICKNESS, 1.14, GUARD_HEIGHT);
addGuardWall(CHUTE_X + CHUTE_HALF_W, CHUTE_Z, GUARD_THICKNESS, 1.14, GUARD_HEIGHT);
addGuardWall(CHUTE_X, CHUTE_Z + CHUTE_HALF_D, 1.17, GUARD_THICKNESS, GUARD_FRONT_HEIGHT);

// フチはピンクで見やすく。横方向の桟もカプセルより薄い。
for (const [x, z, w, d, h] of [
  [CHUTE_X, CHUTE_Z - CHUTE_HALF_D, 1.17, 0.055, GUARD_HEIGHT],
  [CHUTE_X - CHUTE_HALF_W, CHUTE_Z, 0.055, 1.14, GUARD_HEIGHT],
  [CHUTE_X + CHUTE_HALF_W, CHUTE_Z, 0.055, 1.14, GUARD_HEIGHT],
  [CHUTE_X, CHUTE_Z + CHUTE_HALF_D, 1.17, 0.055, GUARD_FRONT_HEIGHT]
]) {
  addBox(machine, x, 3.27 + h, z, w, 0.045, d, MAT.hotPink, false);
}

// ====================================================
// 3. 景品（黒い不透明カプセル・中身は1～6等）
// ====================================================
const FLOOR_Y = 3.23;
const CAPSULE_RADIUS = 0.42; // GLBの爪先に合わせて直径を20%大きくする
const CAPSULE_CENTER_Y = FLOOR_Y + CAPSULE_RADIUS + 0.02;
// 景品の安全な移動範囲。獲得口のガードと重ならない位置でばらまく。
const PLAY_BOUNDS = {
  minX: -2.28, maxX: 2.28,
  minZ: -1.54, maxZ: 1.53
};
const MIN_CAPSULE_SPACING = CAPSULE_RADIUS * 2 + 0.13;
const SCENE_STORAGE_KEY = 'mini_claw_capsule_scene_v2';

function withinChuteOpening(x, z) {
  // 完全に落とせるように、中心の安全範囲で判定。
  return Math.abs(x - CHUTE_X) < CHUTE_HALF_W - CAPSULE_RADIUS * 0.73 &&
    Math.abs(z - CHUTE_Z) < CHUTE_HALF_D - CAPSULE_RADIUS * 0.73;
}

function clearOfGuard(x, z, margin = CAPSULE_RADIUS + 0.12) {
  // 円と壁の箱が近すぎる場所には初期配置しない。
  return GUARD_WALLS.every(w =>
    x < w.minX - margin || x > w.maxX + margin ||
    z < w.minZ - margin || z > w.maxZ + margin
  );
}

function scatterPositions(count) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let tries = 0; tries < 1500; tries++) {
      const x = THREE.MathUtils.lerp(PLAY_BOUNDS.minX, PLAY_BOUNDS.maxX, Math.random());
      const z = THREE.MathUtils.lerp(PLAY_BOUNDS.minZ, PLAY_BOUNDS.maxZ, Math.random());
      const free = clearOfGuard(x, z) && positions.every(p =>
        Math.hypot(x - p.x, z - p.z) >= MIN_CAPSULE_SPACING
      );
      if (free) {
        positions.push({ x, z });
        placed = true;
        break;
      }
    }
    if (!placed) {
      // 非常にまれに配置が詰まっても必ず6個配置する。
      const candidates = [];
      for (let x = -2.2; x <= 2.21; x += 0.23) {
        for (let z = -1.5; z <= 1.51; z += 0.23) {
          if (!clearOfGuard(x, z)) continue;
          const distance = positions.length
            ? Math.min(...positions.map(p => Math.hypot(p.x - x, p.z - z)))
            : Infinity;
          candidates.push({ x, z, distance });
        }
      }
      candidates.sort((a,b) => b.distance - a.distance);
      positions.push({ x: candidates[0].x, z: candidates[0].z });
    }
  }
  return positions;
}

let prizes = [];
let score = 0;
const scoreEl = document.getElementById("score");

// カプセル内部に1～6等をランダムに割り当てる。
// 6個すべて獲得すれば、1～6等が1つずつ出る仕組み。
function shuffledRanks() {
  const ranks = [1, 2, 3, 4, 5, 6];
  for (let i = ranks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
  }
  return ranks;
}

function createCapsule(x, z, rank, index) {
  const group = new THREE.Group();
  // 不透明素材（transparent:false）なので内部の文字は透けない。
  const upperMat = new THREE.MeshStandardMaterial({
    color: 0x191b22, metalness: 0.15, roughness: 0.20
  });
  const lowerMat = new THREE.MeshStandardMaterial({
    color: 0x090a0e, metalness: 0.08, roughness: 0.33
  });
  const seamMat = new THREE.MeshStandardMaterial({
    color: 0x484b56, metalness: 0.30, roughness: 0.32
  });

  // 上下半球は両方とも完全に不透明。
  const upper = new THREE.Mesh(
    new THREE.SphereGeometry(CAPSULE_RADIUS, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    upperMat
  );
  upper.position.y = 0.035;
  upper.castShadow = true;
  group.add(upper);

  const lower = new THREE.Mesh(
    new THREE.SphereGeometry(CAPSULE_RADIUS, 32, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    lowerMat
  );
  lower.position.y = -0.035;
  lower.castShadow = true;
  group.add(lower);

  // 上下半球の継ぎ目にも黒い芯を入れ、内部の当たり券が
  // 隙間から見えてしまうのを防ぐ。
  addCylinder(group, 0, 0, 0, CAPSULE_RADIUS * 0.995,
    CAPSULE_RADIUS * 0.995, 0.10, lowerMat, 32);

  const seam = new THREE.Mesh(
    new THREE.TorusGeometry(CAPSULE_RADIUS * 0.95, 0.025, 10, 36),
    seamMat
  );
  seam.rotation.x = Math.PI / 2;
  seam.castShadow = true;
  group.add(seam);

  // 当たり券をカプセル内部に封入（外からは見えない）。
  const ticket = new THREE.Group();
  const paper = new THREE.Mesh(
    new THREE.BoxGeometry(0.27, 0.17, 0.022),
    new THREE.MeshStandardMaterial({ color: 0xf7e7ad, roughness: 0.9 })
  );
  ticket.add(paper);
  const text = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.11),
    new THREE.MeshBasicMaterial({
      map: labelTexture(`${rank}等`, { background: "#ffe8a0", color: "#15151a", size: 56, border: "#fff1c8" }),
      side: THREE.DoubleSide
    })
  );
  text.position.z = 0.014;
  ticket.add(text);
  ticket.rotation.y = 0.2;
  group.add(ticket);

  group.position.set(x, CAPSULE_CENTER_Y, z);
  group.rotation.y = (index % 2 ? -1 : 1) * (0.08 + index * 0.04);
  machine.add(group);
  return {
    group, rank, rankText: `${rank}等`, state: "floor",
    vx: 0, vy: 0, vz: 0, spin: 0,
    lastFloorX: x, lastFloorZ: z, homeX: x, homeZ: z
  };
}

function clearPrizes() {
  for (const prize of prizes) {
    machine.remove(prize.group);
    const materials = new Set();
    prize.group.traverse(child => {
      if (!child.isMesh) return;
      child.geometry.dispose();
      const list = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of list) materials.add(material);
    });
    for (const material of materials) {
      if (material.map) material.map.dispose();
      material.dispose();
    }
  }
  prizes = [];
}
// 位置と等級を保存する。リロードしても配置が変わらない。
function saveCapsuleScene() {
  try {
    const data = prizes.map(prize => ({
      rank: prize.rank,
      state: prize.state,
      x: prize.group.position.x,
      y: prize.group.position.y,
      z: prize.group.position.z,
      rx: prize.group.rotation.x,
      ry: prize.group.rotation.y,
      rz: prize.group.rotation.z,
      vx: prize.vx, vy: prize.vy, vz: prize.vz,
      lastFloorX: prize.lastFloorX,
      lastFloorZ: prize.lastFloorZ
    }));
    localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify({ version: 2, capsules: data }));
  } catch { /* 保存できないブラウザでもプレイできる */ }
}

function loadCapsuleScene() {
  try {
    const saved = JSON.parse(localStorage.getItem(SCENE_STORAGE_KEY) || 'null');
    if (saved?.version !== 2 || !Array.isArray(saved.capsules) || saved.capsules.length !== 6) return null;
    const ranks = saved.capsules.map(c => c.rank).sort((a,b) => a-b);
    if (!ranks.every((r,i) => r === i + 1)) return null;
    if (!saved.capsules.every(c => Number.isFinite(c.x) && Number.isFinite(c.y) &&
      Number.isFinite(c.z) && ['floor','held','falling','won'].includes(c.state))) return null;
    return saved.capsules;
  } catch { return null; }
}

function populatePrizes(fresh = false) {
  const stored = fresh ? null : loadCapsuleScene();
  if (stored) {
    prizes = stored.map((item, i) => {
      // ブラウザ更新時に爪に持たれていたものは、元の床位置に戻す。
      const x = item.state === 'held' && Number.isFinite(item.lastFloorX) ? item.lastFloorX : item.x;
      const z = item.state === 'held' && Number.isFinite(item.lastFloorZ) ? item.lastFloorZ : item.z;
      const prize = createCapsule(x, z, item.rank, i);
      prize.state = item.state === 'held' ? 'floor' : item.state;
      prize.group.position.y = item.state === 'held' ? CAPSULE_CENTER_Y : item.y;
      prize.group.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0);
      prize.vx = Number.isFinite(item.vx) ? item.vx : 0;
      prize.vy = Number.isFinite(item.vy) ? item.vy : 0;
      prize.vz = Number.isFinite(item.vz) ? item.vz : 0;
      prize.lastFloorX = Number.isFinite(item.lastFloorX) ? item.lastFloorX : x;
      prize.lastFloorZ = Number.isFinite(item.lastFloorZ) ? item.lastFloorZ : z;
      prize.group.visible = prize.state !== 'won';
      return prize;
    });
  } else {
    const ranks = shuffledRanks();
    const locations = scatterPositions(6);
    prizes = locations.map((p, i) => createCapsule(p.x, p.z, ranks[i], i));
  }
  saveCapsuleScene();
}
populatePrizes();

// ====================================================
// 4. レール・台車・GLB 3本爪（読み込み失敗時は仮アーム）
// ====================================================
const HOME_X = CHUTE_X;
const HOME_Z = CHUTE_Z;
const CRANE_Y = 7.82;
const CLAW_REST_Y = -0.58;
const CLAW_DROP_Y = -3.18;
const MOVE_SPEED = 2.50;
const AUTO_SPEED = 3.55;
const DROP_SPEED = 2.1;
const LIFT_SPEED = 2.4;

for (const z of [-1.68, 1.65]) addBox(machine, 0, 7.94, z, 5.22, 0.12, 0.16, MAT.darkMetal);
const travelRail = new THREE.Group();
machine.add(travelRail);
addBox(travelRail, 0, 7.97, 0, 0.23, 0.19, 3.6, MAT.silver);
for (const z of [-1.65, 1.65]) {
  addBox(travelRail, 0, 8.0, z, 0.57, 0.20, 0.42, MAT.darkMetal);
}

const crane = new THREE.Group();
crane.position.set(HOME_X, CRANE_Y, HOME_Z);
machine.add(crane);
addBox(crane, 0, 0.03, 0, 0.91, 0.39, 0.81, MAT.silver);
addBox(crane, 0, -0.15, 0, 0.80, 0.30, 0.80, MAT.darkMetal);
for (const x of [-0.41, 0.41]) addCylinder(crane, x, 0.16, 0, 0.13, 0.13, 0.20, MAT.chrome);
const rope = addCylinder(crane, 0, -0.35, 0, 0.055, 0.055, 1, MAT.chrome, 18);
const clawRig = new THREE.Group();
clawRig.position.y = CLAW_REST_Y;
crane.add(clawRig);

// この1関数だけを将来GLB対応に差し替えられるようにしておく。
// 返り値の setOpen(0=閉, 1=開) を維持するとゲーム側は変更不要。
function buildTemporaryClaw() {
  const root = new THREE.Group();
  // モーター筒、コイル、金属リング
  addCylinder(root, 0, 0.05, 0, 0.21, 0.24, 0.37, MAT.chrome);
  addCylinder(root, 0, -0.25, 0, 0.28, 0.31, 0.33, MAT.darkMetal);
  addCylinder(root, 0, -0.40, 0, 0.28, 0.23, 0.10, MAT.chrome);
  for (let i = 0; i < 5; i++) {
    addCylinder(root, 0, -0.01 - i * 0.06, 0, 0.245, 0.245, 0.013, MAT.silver, 20);
  }
  const pivots = [];
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const pivot = new THREE.Group();
    pivot.position.set(0.22 * Math.cos(angle), -0.28, 0.22 * Math.sin(angle));
    pivot.rotation.y = -angle;
    addSphere(pivot, 0, 0, 0, 0.13, MAT.darkMetal);
    addRod(pivot, new THREE.Vector3(0.02, -0.06, 0), new THREE.Vector3(0.13, -0.57, 0), 0.065, MAT.chrome);
    addSphere(pivot, 0.13, -0.57, 0, 0.087, MAT.silver);
    addRod(pivot, new THREE.Vector3(0.13, -0.57, 0), new THREE.Vector3(0.24, -1.00, 0), 0.056, MAT.chrome);
    addRod(pivot, new THREE.Vector3(0.24, -1.00, 0), new THREE.Vector3(0.11, -1.22, 0), 0.062, MAT.chrome);
    addSphere(pivot, 0.11, -1.22, 0, 0.066, MAT.chrome);
    root.add(pivot);
    pivots.push(pivot);
  }
  return {
    root,
    setOpen(amount) {
      const angle = THREE.MathUtils.lerp(-0.18, 0.43, THREE.MathUtils.clamp(amount, 0, 1));
      for (const pivot of pivots) pivot.rotation.z = angle;
    }
  };
}
// 最初は仮アーム。GLBの読み込み成功時にだけ差し替える。
let clawModel = buildTemporaryClaw();
clawRig.add(clawModel.root);
let clawOpen = 1; // 縦横移動中・待機中は完全に開いた状態
clawModel.setOpen(clawOpen);

function setClawOpen(amount) {
  clawOpen = THREE.MathUtils.clamp(amount, 0, 1);
  clawModel.setOpen(clawOpen);
}

// Blenderでは3本が別々のActionになっている。
// 各Quaternionトラックを直接補間すれば、同じclawOpen値で一斉に開閉できる。
function buildGLBClaw(gltf) {
  const root = gltf.scene;
  const movableNames = ["model_part10", "model_part9", "model_part8"];

  // Blenderで付けた3つの独立した回転アニメーションを読む。
  const controllers = movableNames.map(name => {
    const part = root.getObjectByName(name);
    const track = gltf.animations
      .flatMap(clip => clip.tracks)
      .find(t => t.name === `${name}.quaternion`);

    if (!part?.isMesh || !track || track.times.length < 2) {
      throw new Error(`${name} のメッシュまたは回転アニメーションがありません`);
    }

    // 爪の下端にある頂点から「爪先の代表点」を求める。
    // 各メッシュのローカル座標なので、関節が回転しても追従できる。
    const positions = part.geometry.getAttribute("position");
    if (!positions || positions.count === 0) {
      throw new Error(`${name} に頂点データがありません`);
    }

    let minY = Infinity;
    for (let i = 0; i < positions.count; i++) {
      minY = Math.min(minY, positions.getY(i));
    }

    const tip = new THREE.Vector3();
    let tipVertices = 0;
    const tipBand = minY + 0.035;

    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) > tipBand) continue;
      tip.x += positions.getX(i);
      tip.y += positions.getY(i);
      tip.z += positions.getZ(i);
      tipVertices++;
    }

    if (tipVertices === 0) {
      throw new Error(`${name} の爪先を取得できません`);
    }
    tip.divideScalar(tipVertices);

    return {
      part,
      tip,
      interpolant: track.createInterpolant(),
      first: track.times[0],
      last: track.times[track.times.length - 1]
    };
  });

  // 現在のGLB表示サイズと位置を維持する。
  const GLB_SCALE = 1.25;
  root.scale.setScalar(GLB_SCALE);
  root.position.set(0, 0, -0.17 * GLB_SCALE);

  // 固定長シャフトは非表示。天井との接続は既存の伸縮ロッドを使用する。
  const fixedShaft = root.getObjectByName("model_part1");
  if (fixedShaft) fixedShaft.visible = false;

  root.traverse(obj => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return {
    root,

    // カプセルと同じ machine ローカル座標で3本の爪先位置を返す。
    getFingertips() {
      machine.updateMatrixWorld(true);
      return controllers.map(({ part, tip }) => {
        const worldTip = tip.clone().applyMatrix4(part.matrixWorld);
        return machine.worldToLocal(worldTip);
      });
    },

    setOpen(amount) {
      const t = THREE.MathUtils.clamp(amount, 0, 1);
      for (const controller of controllers) {
        const time = THREE.MathUtils.lerp(
          controller.first, controller.last, t
        );
        const quaternion = controller.interpolant.evaluate(time);
        controller.part.quaternion.fromArray(quaternion).normalize();
      }
    }
  };
}

const modelStatusEl = document.getElementById("model-status");
const glbLoader = new GLTFLoader();
glbLoader.load(
  "./models/1arm.glb",
  gltf => {
    try {
      const imported = buildGLBClaw(gltf);
      imported.setOpen(clawOpen);
      clawRig.remove(clawModel.root);
      clawRig.add(imported.root);
      clawModel = imported;
      if (modelStatusEl) modelStatusEl.textContent = "1arm.glb（3本爪アニメーション）";
    } catch (error) {
      console.error("GLBアームのアニメーション設定に失敗:", error);
      if (modelStatusEl) modelStatusEl.textContent = "仮アーム（GLB設定エラー）";
    }
  },
  undefined,
  error => {
    console.error("GLBの読み込みに失敗:", error);
    if (modelStatusEl) modelStatusEl.textContent = "仮アーム（models/1arm.glbを確認）";
  }
);
function updateRope() {
  const top = -0.15;
  const end = clawRig.position.y + 0.17;
  rope.position.y = (top + end) / 2;
  rope.scale.y = Math.max(0.1, top - end);
  travelRail.position.x = crane.position.x;
}
updateRope();

// ====================================================
// 5. UI操作：①横 → ②縦（離したら下降）
// ====================================================
const statusEl = document.getElementById("status");
const horizontalButton = document.getElementById("horizontal-button");
const verticalButton = document.getElementById("vertical-button");
const resetButton = document.getElementById("reset-button");
const remainingEl = document.getElementById("remaining-plays");

let state = "idle";
let stateTime = 0;
let controlPhase = "horizontal"; // horizontal → vertical → busy
let heldPrize = null;
// つかんだ瞬間の「アーム基準の相対位置」を保存する。
// 爪先の中心へ毎フレーム吸い寄せると、カプセルが本体にめり込みやすい。
const heldPrizeOffset = new THREE.Vector3();
// 保持中だけ少し下げる量（0.00 にすると、つかんだ時の位置のまま）。
const HELD_CAPSULE_LOWER = 0.10;

let HOLD_CHANCE = CRANE_ADMIN.holdPercent / 100;
let willSlip = false;

// ★ 一人5回まで。②を離してアームを動かした時点で1回消費。
// 現在の回数は同じブラウザ内に保存され、ページ更新でも戻らない。

const ACTIVE_PLAYS_KEY = "mini_crane_active_plays_v1";

let MAX_PLAYS = (() => {
  try {
    const raw = localStorage.getItem(ACTIVE_PLAYS_KEY);
    if (raw !== null) {
      const saved = Number(raw);
      if (Number.isInteger(saved) && saved >= 1 && saved <= 10) {
        return saved;
      }
    }
  } catch { /* 保存不可でもゲームは動作 */ }
  return CRANE_ADMIN.maxPlays;
})();

const PLAY_STORAGE_KEY = "mini_claw_current_player_plays_v1";
function loadPlayCount() {
  try {
    const saved = Number(localStorage.getItem(PLAY_STORAGE_KEY));
    return Number.isFinite(saved) ? Math.max(0, Math.min(MAX_PLAYS, Math.floor(saved))) : 0;
  } catch {
    return 0;
  }
}
let playCount = loadPlayCount();
function savePlayCount() {
  try { localStorage.setItem(PLAY_STORAGE_KEY, String(playCount)); } catch { /* 保存が使えない環境 */ }
}
function hasPlaysLeft() { return playCount < MAX_PLAYS; }
// 獲得等級の記録は5回が終わって開封するまで公開しない。
// リロードしても現在のプレイヤーの獲得結果を保持する。
const WINS_STORAGE_KEY = "mini_claw_current_player_wins_v1";
function loadWonRanks() {
  try {
    const data = JSON.parse(localStorage.getItem(WINS_STORAGE_KEY) || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter(v => Number.isInteger(v) && v >= 1 && v <= 6).slice(0, MAX_PLAYS);
  } catch {
    return [];
  }
}
let wonRanks = loadWonRanks();
score = wonRanks.length;
scoreEl.textContent = String(score);
function saveWonRanks() {
  try { localStorage.setItem(WINS_STORAGE_KEY, JSON.stringify(wonRanks)); } catch { /* 保存不可環境 */ }
}
let sessionRevealStarted = false;
const reveal = createCapsuleReveal({
  onNextPlayer: startNextPlayer,
  getMaxPlays: () => MAX_PLAYS,
  getNextMaxPlays: () => CRANE_ADMIN.maxPlays
});
function refreshPlayUI() {
  remainingEl.textContent = String(Math.max(0, MAX_PLAYS - playCount));
  const kicker = document.querySelector(".message-kicker");
  if (kicker) kicker.textContent = `1人${MAX_PLAYS}回まで / GAME STATUS`;
}


// 入力の多重反応を防止。pointerとキーボードの両方で使用する。
let horizontalInput = null;
let verticalInput = null;

function setStatus(message) {
  statusEl.textContent = message;
}

function isPrizeMoving() {
  return prizes.some(p =>
    p.state === "falling" ||
    (p.state === "floor" && Math.hypot(p.vx, p.vz) > 0.009)
  );
}

function setControlsEnabled(enabled = true) {
  const unavailable = !enabled || isPrizeMoving() || !hasPlaysLeft() ||
    sessionRevealStarted || state !== "idle";
  horizontalButton.disabled = unavailable || controlPhase !== "horizontal";
  verticalButton.disabled = unavailable || controlPhase !== "vertical";
  refreshPlayUI();
}

function beginHorizontal(source) {
  if (miniFeatures.isGuideOpen()) return false;
  if (!hasPlaysLeft() || isPrizeMoving() || sessionRevealStarted ||
      state !== "idle" || controlPhase !== "horizontal" || horizontalInput !== null) return false;
  horizontalInput = source;
  if (cameraControls.isAuto()) cameraGoal.copy(CAMERA_FRONT); // 自動ONのみ切り替え
  return true;
}
function finishHorizontal(source) {
  if (horizontalInput !== source) return;
  horizontalInput = null;
  if (state !== "idle" || controlPhase !== "horizontal") return;
  controlPhase = "vertical";
  if (cameraControls.isAuto()) cameraGoal.copy(CAMERA_SIDE); // 自動ONのみ切り替え
  setControlsEnabled(true);
  setStatus("② 縦を長押し！ 離したら自動で下降します");
}
function beginVertical(source) {
  if (miniFeatures.isGuideOpen()) return false;
  if (!hasPlaysLeft() || isPrizeMoving() || sessionRevealStarted ||
      state !== "idle" || controlPhase !== "vertical" || verticalInput !== null) return false;
  verticalInput = source;
  if (cameraControls.isAuto()) cameraGoal.copy(CAMERA_SIDE);
  return true;
}
function finishVertical(source) {
  if (verticalInput !== source) return;
  verticalInput = null;
  if (state !== "idle" || controlPhase !== "vertical") return;
  controlPhase = "busy";
  startCatch(); // ②を離した瞬間、自動下降シーケンス開始
}

// マウス／タッチ：押している間だけ移動し、指を離したら確定。
function bindMoveButton(button, begin, finish) {
  button.addEventListener("pointerdown", event => {
    if (!begin(event.pointerId)) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(name, event => finish(event.pointerId));
  }
}
bindMoveButton(horizontalButton, beginHorizontal, finishHorizontal);
bindMoveButton(verticalButton, beginVertical, finishVertical);

// PC用：数字の1・2を長押し／離すことで同じ操作を行える。
const KEY_HORIZONTAL = new Set(["Digit1", "Numpad1"]);
const KEY_VERTICAL = new Set(["Digit2", "Numpad2"]);
window.addEventListener("keydown", event => {
  // 管理者画面・ガイド表示中はクレーンを操作しない。
  if (document.querySelector(".mini-admin-dialog[open]")) return;
  if (KEY_HORIZONTAL.has(event.code)) {
    event.preventDefault();
    if (!event.repeat) beginHorizontal(event.code);
  } else if (KEY_VERTICAL.has(event.code)) {
    event.preventDefault();
    if (!event.repeat) beginVertical(event.code);
  } else if (event.code === "KeyR" && !event.repeat) {
    if (state === "idle" && hasPlaysLeft() && !reveal.isVisible() && !isPrizeMoving()) resetGame();
  }
});
window.addEventListener("keyup", event => {
  if (KEY_HORIZONTAL.has(event.code)) finishHorizontal(event.code);
  if (KEY_VERTICAL.has(event.code)) finishVertical(event.code);
});
window.addEventListener("blur", () => {
  // 別ウィンドウに移ったときも押しっぱなしにしない。
  if (horizontalInput !== null) finishHorizontal(horizontalInput);
  if (verticalInput !== null) finishVertical(verticalInput);
});
resetButton.addEventListener("click", () => {
  // 景品の並べ直しは可能。ただし獲得記録と使用回数は維持する。
  if (state === "idle" && hasPlaysLeft() && !reveal.isVisible() && !isPrizeMoving()) resetGame();
});
function startNextPlayer() {
  // 開封結果を確認して「次の人へ」を押したときだけ新しい5回にする。

  
// 次のプレイヤーから新しい回数設定を適用
MAX_PLAYS = CRANE_ADMIN.maxPlays;

localStorage.setItem(
  ACTIVE_PLAYS_KEY,
  String(MAX_PLAYS)
);

  playCount = 0;
  savePlayCount();
  wonRanks = [];
  saveWonRanks();
  sessionRevealStarted = false;
  resetGame(true);
}
function maybeStartReveal() {
  // 5回目のクレーン動作完了 + カプセルが全て着地してから開封する。
  if (sessionRevealStarted || hasPlaysLeft() || state !== "idle" ||
      isPrizeMoving()) return;
  sessionRevealStarted = true;
  setControlsEnabled(false);
  setStatus(`${MAX_PLAYS}回終了！ 獲得した黒カプセルをまとめて開封しよう！`);
  reveal.show([...wonRanks]);
}
setControlsEnabled(true);
if (!hasPlaysLeft()) setStatus(`${MAX_PLAYS}回終了！ 開封結果を確認しよう`);

// ====================================================
// 6. 状態遷移：下降 → 閉じる → 上昇 → 獲得口 → 離す
// ====================================================
function startCatch() {
  if (state !== "idle" || !hasPlaysLeft()) return;
  playCount += 1;
  savePlayCount();
  state = "opening";
  stateTime = 0;
  horizontalInput = null;
  verticalInput = null;
  setControlsEnabled(false);
  setStatus("アームを開いています…");
}
// =============================================
// GLBの爪先に合わせたつかみ判定（物理エンジンではない）
// =============================================
const GRIP_MAX_CENTER_OFFSET = 0.24;  // 爪の中心とカプセルの横ズレ上限
const GRIP_TIP_CONTACT_MARGIN = 0.13; // 爪先と球の表面との距離許容
const GRIP_MIN_TOUCHING_TIPS = 3;     // 少なくとも2本の爪先を近づける
const GRIP_MIN_TIP_Y_OFFSET = -CAPSULE_RADIUS - 0.12;
const GRIP_MAX_TIP_Y_OFFSET = 0.14;

// 爪先3点が作る三角形（上から見た形）の内部にあるか。
function insideClawTriangle(x, z, tips) {
  const [a, b, c] = tips;
  const abx = b.x - a.x, abz = b.z - a.z;
  const acx = c.x - a.x, acz = c.z - a.z;
  const apx = x - a.x, apz = z - a.z;
  const det = abx * acz - acx * abz;
  if (Math.abs(det) < 1e-6) return false;

  const u = (apx * acz - acx * apz) / det;
  const v = (abx * apz - apx * abz) / det;
  const w = 1 - u - v;

  // メッシュの微小な非対称性だけ許容。
  return Math.min(u, v, w) >= -0.05;
}

function checkGrip(prize, tips) {
  const center = prize.group.position;

  if (tips) {
    if (tips.length !== 3 || tips.some(t =>
      !Number.isFinite(t.x) ||
      !Number.isFinite(t.y) ||
      !Number.isFinite(t.z)
    )) return false;

    // モデルの中心が少し偏っていても、実際の爪の中心を使う。
    const clawX = (tips[0].x + tips[1].x + tips[2].x) / 3;
    const clawZ = (tips[0].z + tips[1].z + tips[2].z) / 3;
    if (Math.hypot(center.x - clawX, center.z - clawZ) >
        GRIP_MAX_CENTER_OFFSET) return false;

    // 床から離れたままカプセルをつかめないよう高さを確認。
    const tipY = (tips[0].y + tips[1].y + tips[2].y) / 3;
    const heightDifference = tipY - center.y;
    if (heightDifference < GRIP_MIN_TIP_Y_OFFSET ||
        heightDifference > GRIP_MAX_TIP_Y_OFFSET) return false;

    // 爪の外側にあるカプセルはつかめない。
    if (!insideClawTriangle(center.x, center.z, tips)) return false;

    // 平面距離だけではなく、爪先と球中心の3D距離を見る。
    let touching = 0;
    for (const tip of tips) {
      const distance = tip.distanceTo(center);
      if (Math.abs(distance - CAPSULE_RADIUS) <=
          GRIP_TIP_CONTACT_MARGIN) touching++;
    }
    return touching >= GRIP_MIN_TOUCHING_TIPS;
  }

  // GLB読み込みに失敗したときの仮アーム用。
  // 従来の「0.81以内なら何でもOK」より狭くしておく。
  const fallbackTipY = CRANE_Y + clawRig.position.y - 1.12;
  return Math.abs(fallbackTipY - center.y) <= 0.30 &&
    Math.hypot(center.x - crane.position.x,
               center.z - crane.position.z) <= GRIP_MAX_CENTER_OFFSET;
}

// 追加UIは失敗しても3D描画を継続できるよう、まず安全な初期値を用意。
let cameraControls = {
  isAuto: () => true,
  update: () => {}
};
let miniFeatures = {
  isGuideOpen: () => false,
  update: () => {}
};

// main.js の実行・描画を先に開始し、UIモジュールを後から読み込む。
// 古いminiFeatures.jsでもゲーム機本体が消えない。
import("./miniFeatures.js")
  .then(mod => {
    if (typeof mod.createCameraViewControls === "function") {
      try {
        cameraControls = mod.createCameraViewControls({
          
getView: () => {
  const views = {
    front: CAMERA_FRONT,
    diagonal: CAMERA_DIAGONAL,
    side: CAMERA_SIDE
  };

  return Object.keys(views).reduce(
    (best, name) =>
      cameraGoal.distanceToSquared(views[name]) <
      cameraGoal.distanceToSquared(views[best])
        ? name
        : best,
    "front"
  );
},

setView: view => {
  const views = {
    front: CAMERA_FRONT,
    diagonal: CAMERA_DIAGONAL,
    side: CAMERA_SIDE
  };

  cameraGoal.copy(views[view] || CAMERA_FRONT);
},

          getAutoView: () => controlPhase === "horizontal" ? "front" : "side"
        });
      } catch (error) {
        console.error("MINI CRANE 視点切り替えの初期化エラー:", error);
      }
    } else {
      console.warn("miniFeatures.js が古い可能性があります（視点切り替え機能なし）。ゲーム本体は表示を続けます。");
    }

    if (typeof mod.createMiniCraneFeatures === "function") {
      try {
        miniFeatures = mod.createMiniCraneFeatures({
          THREE,
          machine,
          getPrizes: () => prizes,
          getTips: () => typeof clawModel.getFingertips === "function"
            ? clawModel.getFingertips() : null,
          checkGrip,
          getPlayCount: () => playCount,
          getWinCount: () => wonRanks.length,
          maxPlays: MAX_PLAYS,
          getMaxPlays: () => MAX_PLAYS,
          capsuleRadius: CAPSULE_RADIUS
        });
      } catch (error) {
        console.error("MINI CRANE 追加5機能の初期化エラー:", error);
      }
    } else {
      console.warn("miniFeatures.js に createMiniCraneFeatures がありません。");
    }

    // 管理者画面は、通常の追加機能パネルが出来た後に起動
    if (typeof mod.createMiniCraneAdminSettings === "function") {
      try {
        mod.createMiniCraneAdminSettings({
          getSettings: () => ({ ...CRANE_ADMIN }),
          onSave: values => {
            Object.assign(CRANE_ADMIN, values);
            HOLD_CHANCE = values.holdPercent / 100;

            if (playCount === 0 && wonRanks.length === 0 && !sessionRevealStarted) {
              MAX_PLAYS = values.maxPlays;
              try { localStorage.setItem(ACTIVE_PLAYS_KEY, String(MAX_PLAYS)); } catch {}
              refreshPlayUI();
            }
          },
          canManage: () =>
            state === "idle" &&
            controlPhase === "horizontal" &&
            horizontalInput === null &&
            verticalInput === null &&
            !isPrizeMoving() &&
            !reveal.isVisible(),
          getPrizes: () => prizes,
          capsuleY: CAPSULE_CENTER_Y,
          saveCapsules: saveCapsuleScene
        });
      } catch (error) {
        console.error("管理者機能の初期化エラー:", error);
      }
    }
  })
  .catch(error => {
    console.error("MINI CRANE の追加機能を読み込めませんでした。ゲーム本体の描画は継続します:", error);
  });

function tryGrab() {
  // GLB座標の更新は1回だけ行い、6つのカプセルを同じ姿勢で判定。
  const tips = typeof clawModel.getFingertips === "function"
    ? clawModel.getFingertips()
    : null;

  let target = null;
  let nearestDistance = Infinity;

  for (const prize of prizes) {
    if (prize.state !== "floor" || !checkGrip(prize, tips)) continue;
    const distance = Math.hypot(
      prize.group.position.x - crane.position.x,
      prize.group.position.z - crane.position.z
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      target = prize;
    }
  }

  if (!target) {
    heldPrize = null;
    willSlip = false;
    setStatus("惜しい！ 爪がカプセルを十分に挟めなかった");
    return;
  }

  target.state = "held";
  target.lastFloorX = target.group.position.x;
  target.lastFloorZ = target.group.position.z;
  target.vx = 0;
  target.vz = 0;
  heldPrize = target;
  // アームが下降しきった位置から見たカプセルの相対座標を記憶。
  // これを保ったまま上昇させれば、つかんだ後に突然中心へ吸い寄せられない。
  heldPrizeOffset.set(
    target.group.position.x - crane.position.x,
    target.group.position.y - (CRANE_Y + clawRig.position.y),
    target.group.position.z - crane.position.z
  );
  saveCapsuleScene();

  // 位置判定に合格した場合だけ、従来どおり35%の保持抽選をする。
  willSlip = Math.random() >= HOLD_CHANCE;
  setStatus("黒カプセルをつかめた！ 持ち上げ中…");
}

function moveTowards(value, target, step) {
  return Math.abs(target - value) <= step ? target : value + Math.sign(target - value) * step;
}
function releaseHeldPrize(message = "カプセルを獲得口へ落としています…") {
  if (!heldPrize) return;
  heldPrize.state = "falling";
  heldPrize.vy = 0;
  const overChute = withinChuteOpening(heldPrize.group.position.x, heldPrize.group.position.z);
  // 成功時は真下へ落とす。失敗時は少し横方向にずれて転がる。
  heldPrize.vx = overChute ? 0 : (Math.random() - 0.5) * 1.18;
  heldPrize.vz = overChute ? 0 : (Math.random() - 0.5) * 1.18;
  heldPrize.spin = (Math.random() - 0.5) * 1.4;
  saveCapsuleScene();
  heldPrize = null;
  willSlip = false;
  setStatus(message);
}
function resetGame(newPlayer = false) {
  // 新しい人になった時だけ再抽選・再配置する。
  if (newPlayer) {
    clearPrizes();
    populatePrizes(true);
  }
  // 通常のリセットでは景品の位置・等級・獲得記録を変えない。
  score = wonRanks.length;
  scoreEl.textContent = String(score);
  heldPrize = null;
  willSlip = false;
  horizontalInput = null;
  verticalInput = null;
  controlPhase = "horizontal";
  state = "idle";
  stateTime = 0;
  // 視点自動切替がOFFなら、位置戻すでも選んだ視点を維持。
  if (cameraControls.isAuto()) {
    cameraGoal.copy(CAMERA_FRONT);
    camera.position.copy(CAMERA_FRONT);
  }
  crane.position.x = HOME_X;
  crane.position.z = HOME_Z;
  clawRig.position.y = CLAW_REST_Y;
  setClawOpen(1); // 景品を離したあとも開いたまま
  setControlsEnabled(true);
  setStatus(hasPlaysLeft()
    ? `① 横を長押し！ 残り${MAX_PLAYS - playCount}回`
    : `${MAX_PLAYS}回終了！ 開封結果を確認しよう`);
  updateRope();
}

function updateGame(delta) {
  stateTime += delta;
  if (state === "idle") {
    // ①の長押し中は右方向へ移動（正面視点）。
    if (controlPhase === "horizontal" && horizontalInput !== null) {
      crane.position.x = THREE.MathUtils.clamp(crane.position.x + MOVE_SPEED * delta, -2.3, 2.3);
    }
    // ②の長押し中は奥方向へ移動（側面視点）。
    if (controlPhase === "vertical" && verticalInput !== null) {
      crane.position.z = THREE.MathUtils.clamp(crane.position.z - MOVE_SPEED * delta, -1.5, 1.48);
    }
  } else if (state === "opening") {
    setClawOpen(Math.min(1, clawOpen + delta * 2.1));
    if (clawOpen >= 1 && stateTime > 0.25) {
      state = "descending";
      stateTime = 0;
      setStatus("下降中… 景品の上へ！");
    }
  } else if (state === "descending") {
    clawRig.position.y = Math.max(CLAW_DROP_Y, clawRig.position.y - DROP_SPEED * delta);
    if (clawRig.position.y <= CLAW_DROP_Y) {
      state = "closing";
      stateTime = 0;
      setStatus("3本の爪を閉じています…");
    }
  } else if (state === "closing") {
    setClawOpen(Math.max(0.02, clawOpen - delta * 1.85));
    if (clawOpen <= 0.02) {
      tryGrab();
      state = "ascending";
      stateTime = 0;
    }
  } else if (state === "ascending") {
    clawRig.position.y = Math.min(CLAW_REST_Y, clawRig.position.y + LIFT_SPEED * delta);
    // ★ 抽選失敗時は上昇の途中で落下。確率を消さず維持。
    if (heldPrize && willSlip &&
        clawRig.position.y >= (CLAW_DROP_Y + CLAW_REST_Y) / 2) {
      releaseHeldPrize("あっ！ 景品が上昇途中で落ちちゃった！");
    }
    if (clawRig.position.y >= CLAW_REST_Y) {
      state = "returning";
      stateTime = 0;
      if (heldPrize) setStatus("獲得口へ運んでいます…");
    }
  } else if (state === "returning") {
    crane.position.x = moveTowards(crane.position.x, HOME_X, AUTO_SPEED * delta);
    crane.position.z = moveTowards(crane.position.z, HOME_Z, AUTO_SPEED * delta);
    if (crane.position.x === HOME_X && crane.position.z === HOME_Z) {
      state = "releasing";
      stateTime = 0;
    }
  } else if (state === "releasing") {
    setClawOpen(Math.min(1, clawOpen + delta * 1.7));
    if (clawOpen >= 0.58 && heldPrize) releaseHeldPrize();
    if (clawOpen >= 1 && stateTime > 0.66) {
      state = "idle";
      stateTime = 0;
      controlPhase = "horizontal";
      if (cameraControls.isAuto()) cameraGoal.copy(CAMERA_FRONT);
      setControlsEnabled(true);
      setClawOpen(1); // 景品を離したあとも開いたまま
      if (!prizes.some(p => p.state === "falling")) {
        setStatus(hasPlaysLeft()
          ? `① 横を長押し！ 残り${MAX_PLAYS - playCount}回`
          : `${MAX_PLAYS}回のプレイが終了！ 黒カプセルを開封しよう！`);
      }
    }
  }

  updateRope();
  // つかんだ瞬間の相対位置を保持して、アームに固定したように運ぶ。
  // GLBの爪先3点の中心を使うと、カプセルが本体へ吸い寄せられる場合がある。
  if (heldPrize) {
    // 床にある瞬間は下げず、少し持ち上がってから追加の隙間を作る。
    const liftRatio = THREE.MathUtils.clamp(
      (clawRig.position.y - CLAW_DROP_Y) / 0.30, 0, 1
    );
    heldPrize.group.position.set(
      crane.position.x + heldPrizeOffset.x,
      CRANE_Y + clawRig.position.y + heldPrizeOffset.y
        - HELD_CAPSULE_LOWER * liftRatio,
      crane.position.z + heldPrizeOffset.z
    );
    heldPrize.group.rotation.z = Math.sin(stateTime * 2) * 0.035;
  }
}

// ====================================================
// 7. カプセルの簡易物理：落下・転がり・壁とカプセルの衝突
// ====================================================
function resolveBounds(prize) {
  const p = prize.group.position;
  for (const [axis, velocity, low, high] of [
    ['x', 'vx', PLAY_BOUNDS.minX, PLAY_BOUNDS.maxX],
    ['z', 'vz', PLAY_BOUNDS.minZ, PLAY_BOUNDS.maxZ]
  ]) {
    if (p[axis] < low) {
      p[axis] = low;
      prize[velocity] = Math.abs(prize[velocity]) * 0.32;
    } else if (p[axis] > high) {
      p[axis] = high;
      prize[velocity] = -Math.abs(prize[velocity]) * 0.32;
    }
  }
}

function collideWithGuard(prize) {
  const p = prize.group.position;
  for (const wall of GUARD_WALLS) {
    // カプセルの底が壁の天面より高ければ、上から通過できる。
    if (p.y - CAPSULE_RADIUS > wall.top) continue;
    // xz 平面で円と長方形の衝突を解決。
    const nx = THREE.MathUtils.clamp(p.x, wall.minX, wall.maxX);
    const nz = THREE.MathUtils.clamp(p.z, wall.minZ, wall.maxZ);
    let dx = p.x - nx, dz = p.z - nz;
    let dist = Math.hypot(dx, dz);
    if (dist >= CAPSULE_RADIUS) continue;
    if (dist < 1e-7) {
      const sides = [
        { d: Math.abs(p.x - wall.minX), dx: -1, dz: 0 },
        { d: Math.abs(wall.maxX - p.x), dx: 1, dz: 0 },
        { d: Math.abs(p.z - wall.minZ), dx: 0, dz: -1 },
        { d: Math.abs(wall.maxZ - p.z), dx: 0, dz: 1 }
      ];
      sides.sort((a,b) => a.d - b.d);
      // 内側に重なってしまった場合も近い側から押し戻す。
      dx = sides[0].dx; dz = sides[0].dz;
      dist = -sides[0].d;
    } else {
      dx /= dist; dz /= dist;
    }
    const push = CAPSULE_RADIUS - dist + 0.0001;
    p.x += dx * push;
    p.z += dz * push;
    const dot = prize.vx * dx + prize.vz * dz;
    if (dot < 0) {
      prize.vx -= (1.27 * dot) * dx;
      prize.vz -= (1.27 * dot) * dz;
    }
  }
}

function collideCapsules() {
  const onStage = prizes.filter(p => p.state === 'floor' || p.state === 'falling');
  for (let i = 0; i < onStage.length; i++) {
    for (let j = i + 1; j < onStage.length; j++) {
      const a = onStage[i], b = onStage[j];
      const pa = a.group.position, pb = b.group.position;
      if (Math.abs(pa.y - pb.y) > CAPSULE_RADIUS * 1.65) continue;
      let dx = pb.x - pa.x, dz = pb.z - pa.z;
      let d = Math.hypot(dx,dz);
      if (d >= CAPSULE_RADIUS * 2) continue;
      if (d < 0.00001) { dx = 1; dz = 0; d = 1; }
      const nx = dx / d, nz = dz / d;
      const overlap = (CAPSULE_RADIUS * 2 - d) / 2 + 0.001;
      pa.x -= nx * overlap; pa.z -= nz * overlap;
      pb.x += nx * overlap; pb.z += nz * overlap;
      const normalSpeed = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (normalSpeed > 0) {
        const impulse = normalSpeed * 0.37;
        a.vx -= impulse * nx; a.vz -= impulse * nz;
        b.vx += impulse * nx; b.vz += impulse * nz;
      }
    }
  }
}

function awardCapsule(prize) {
  prize.state = 'won';
  prize.group.visible = false;
  prize.vx = prize.vy = prize.vz = 0;
  wonRanks.push(prize.rank);
  saveWonRanks();
  score = wonRanks.length;
  scoreEl.textContent = String(score);
  setStatus(`GET! 🎉 黒カプセル獲得！ 合計${score}個（等級は終了後に発表）`);
  saveCapsuleScene();
  setControlsEnabled(true);
}

let sceneSaveElapsed = 0;
let sceneWasMoving = false;
function updatePrizes(delta) {
  // 高速落下でも壁を貫通しづらいように、物理計算だけ小刻みに進める。
  const substeps = Math.max(1, Math.ceil(delta / 0.012));
  const dt = delta / substeps;
  let anyMoving = false;

  for (let step = 0; step < substeps; step++) {
    for (const prize of prizes) {
      if (prize.state !== 'floor' && prize.state !== 'falling') continue;
      const p = prize.group.position;

      if (prize.state === 'falling') {
        prize.vy -= 8.5 * dt;
        p.y += prize.vy * dt;
        prize.group.rotation.z += prize.spin * dt;
      }

      p.x += prize.vx * dt;
      p.z += prize.vz * dt;
      if (prize.state === 'floor') {
        // 転がりの見た目：移動距離に比例して球体を回す。
        prize.group.rotation.x += prize.vz * dt / CAPSULE_RADIUS;
        prize.group.rotation.z -= prize.vx * dt / CAPSULE_RADIUS;
      }
      collideWithGuard(prize);
      resolveBounds(prize);

      // 獲得口の真上にいるカプセルだけ底へ落下できる。
      if (prize.state === 'falling' && withinChuteOpening(p.x, p.z)) {
        if (p.y < FLOOR_Y - 0.25) {
          awardCapsule(prize);
          continue;
        }
      } else if (prize.state === 'falling' && p.y <= CAPSULE_CENTER_Y) {
        // 床への着地。少しだけ跳ねてから、摩擦で止まる。
        p.y = CAPSULE_CENTER_Y;
        if (Math.abs(prize.vy) > 1.6) {
          prize.vy = -prize.vy * 0.18;
        } else {
          prize.vy = 0;
          prize.state = 'floor';
        }
        prize.group.rotation.x *= 0.4;
        prize.group.rotation.z *= 0.4;
      }

      if (prize.state === 'floor') {
        p.y = CAPSULE_CENTER_Y;
        prize.vy = 0;
        prize.vx *= Math.exp(-5.2 * dt);
        prize.vz *= Math.exp(-5.2 * dt);
        if (Math.abs(prize.vx) < 0.009) prize.vx = 0;
        if (Math.abs(prize.vz) < 0.009) prize.vz = 0;
      }
      anyMoving ||= Math.hypot(prize.vx, prize.vz) > 0.009 || prize.state === 'falling';
    }

    collideCapsules();
    for (const prize of prizes) {
      if (prize.state !== 'floor' && prize.state !== 'falling') continue;
      collideWithGuard(prize);
      resolveBounds(prize);
    }
  }

  if (anyMoving) {
    sceneSaveElapsed += delta;
    if (sceneSaveElapsed > 0.30) {
      sceneSaveElapsed = 0;
      saveCapsuleScene();
    }
  } else if (sceneWasMoving) {
    sceneSaveElapsed = 0;
    saveCapsuleScene(); // 完全に止まった場所を保存する
    if (state === 'idle') setControlsEnabled(true);
  }
  sceneWasMoving = anyMoving;
}

// 手動リロード時にも落下後の位置をなるべく確実に残す。
window.addEventListener('pagehide', saveCapsuleScene);

// ====================================================
// 7. アニメーション
// ====================================================
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.045);
  updateGame(delta * CRANE_ADMIN.armSpeed);
  updatePrizes(delta);
  maybeStartReveal();
  cameraControls.update(); // 自動切替後の視点名を表示
  miniFeatures.update(delta,
    horizontalInput !== null ||
    verticalInput !== null ||
    ["descending", "ascending", "returning"].includes(state)
  );
  camera.position.lerp(cameraGoal, Math.min(1, delta * 3.5));
  camera.lookAt(0, 5.1, 0);
  renderer.render(scene, camera);
}
animate();


/* ===========================================
   MINI CRANE Raspberry Pi 操作テスト
=========================================== */

(() => {
  const piAddress = "ws://172.16.77.139:8765";
  const piEnabled = false; // 実機ボタン接続を再開するときだけ true

  const heldKeys = new Set();

  function sendKey(code, pressed) {
    if (pressed === heldKeys.has(code)) return;

    if (pressed) {
      heldKeys.add(code);
    } else {
      heldKeys.delete(code);
    }

    const event = new KeyboardEvent(
      pressed ? "keydown" : "keyup",
      {
        code: code,
        key: code === "Digit1" ? "1" : "2",
        bubbles: true,
        repeat: false
      }
    );

    window.dispatchEvent(event);
  }

  if (!piEnabled) return;

  const pi = new WebSocket(piAddress);

  pi.onopen = () => {
    console.log("✅ Raspberry Pi 接続成功！");
  };

  pi.onmessage = event => {
    let data;

    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (data.type !== "button") return;

    if (data.button === "horizontal") {
      sendKey("Digit1", data.pressed);
    }

    if (data.button === "vertical") {
      sendKey("Digit2", data.pressed);
    }
  };

  pi.onclose = () => {
    console.log("❌ Raspberry Pi 接続終了");

    for (const code of [...heldKeys]) {
      sendKey(code, false);
    }
  };

  pi.onerror = () => {
    console.error("Raspberry Pi 通信エラー");
  };
})();


/*
=============================================
MINI CRANE
ゲーム機本体のボタン押し込みアニメーション

① 横ボタン：ピンク
② 縦ボタン：水色

・押している間だけ沈む
・離すと元に戻る
・光る演出なし
・既存の3Dボタンをそのまま使用
=============================================
*/

{
  // ボタンを押し込む深さ
  const PRESS_DEPTH = 0.085;

  // 押し込み・戻る速さ
  const PRESS_RESPONSE = 20;

  // 本体にある既存ボタンのX座標
  const BUTTON_POSITIONS = [
    -1.91, // ① ピンク
    -0.20  // ② 水色
  ];

  // 既存の3Dボタンを探す
  function findCabinetButton(x) {
    return machine.children.find(mesh => {
      return (
        mesh.isMesh &&
        mesh.geometry?.type === "CylinderGeometry" &&
        Math.abs(mesh.position.x - x) < 0.015 &&
        Math.abs(mesh.position.y - 2.98) < 0.015 &&
        Math.abs(mesh.position.z - 3.0) < 0.015
      );
    });
  }

  // 2つのボタンの元の位置を保存
  const cabinetButtons = BUTTON_POSITIONS.map(x => {
    const mesh = findCabinetButton(x);

    if (!mesh) {
      return null;
    }

    return {
      mesh: mesh,
      originalY: mesh.position.y
    };
  });

  // ボタンが見つからなかった場合の通知
  if (cabinetButtons.some(button => button === null)) {
    console.warn(
      "本体の3Dボタンが見つかりませんでした。" +
      "操作台の座標を確認してください。"
    );
  }

  let previousTime = performance.now();

  // ボタンを毎フレーム更新
  function updateCabinetButtons(currentTime) {
    const delta = Math.min(
      (currentTime - previousTime) / 1000,
      0.05
    );

    previousTime = currentTime;

    // 既存の操作状態と連動
    const pressedStates = [
      horizontalInput !== null,
      verticalInput !== null
    ];

    // 滑らかな動き
    const smoothing =
      1 - Math.exp(-PRESS_RESPONSE * delta);

    cabinetButtons.forEach((button, index) => {
      if (!button) return;

      const isPressed = pressedStates[index];

      // 押したときだけ下へ沈む
      const targetY =
        button.originalY -
        (isPressed ? PRESS_DEPTH : 0);

      button.mesh.position.y +=
        (targetY - button.mesh.position.y) *
        smoothing;
    });

    requestAnimationFrame(updateCabinetButtons);
  }

  // アニメーション開始
  requestAnimationFrame(updateCabinetButtons);
}

// ===== 本体ボタンアニメーション終了 =====
