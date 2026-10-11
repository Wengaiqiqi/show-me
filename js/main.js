import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PROJECTS, OWNER } from './projects.js';
import { abstractPainting, plaque, textPanel } from './art.js';
import { DEMOS } from './demos.js';

// 如果用 Blender 做了自己的展馆，导出为 glb 放到这里即可替换程序生成的墙和地面。
const GALLERY_MODEL = 'assets/gallery.glb';

const HALL = { w: 14, h: 5, zFront: 6, zBack: -38 };
const EYE = 1.65;
const PAINT_W = 3.2, PAINT_H = 2.0, PAINT_Y = 2.15;

// ---------------- 渲染器与场景 ----------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1714');
scene.fog = new THREE.Fog('#1a1714', 30, 60);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 120);
camera.position.set(0, EYE, 3);
const look = { yaw: 0, pitch: 0 };

scene.add(new THREE.HemisphereLight('#fff6e8', '#3b2f25', 0.9));

// ---------------- 程序生成的展馆 ----------------
const procedural = new THREE.Group();
scene.add(procedural);

function canvasTex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    for (let j = -1; j < 2; j++) {
      const l = 30 + Math.random() * 10;
      const y = j * 256 + (i % 2) * 128;
      g.fillStyle = `hsl(28 38% ${l}%)`;
      g.fillRect(i * 64, y, 64, 256);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.strokeRect(i * 64, y, 64, 256);
    }
  }
  g.globalAlpha = 0.06;
  for (let k = 0; k < 3000; k++) {
    g.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
    g.fillRect(Math.random() * 512, Math.random() * 512, 1, 6);
  }
  return c;
}

const L = HALL.zFront - HALL.zBack;
const zMid = (HALL.zFront + HALL.zBack) / 2;
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(HALL.w, L),
  new THREE.MeshStandardMaterial({ map: canvasTex(floorTexture(), [HALL.w / 4, L / 4]), roughness: 0.45, metalness: 0.05 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.z = zMid;
procedural.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: '#efe9df', roughness: 0.92 });
const ceilMat = new THREE.MeshStandardMaterial({ color: '#d9d2c7', roughness: 1 });
function plane(w, h, mat, pos, rotY = 0, rotX = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(...pos);
  m.rotation.set(rotX, rotY, 0);
  procedural.add(m);
  return m;
}
plane(L, HALL.h, wallMat, [-HALL.w / 2, HALL.h / 2, zMid], Math.PI / 2);
plane(L, HALL.h, wallMat, [HALL.w / 2, HALL.h / 2, zMid], -Math.PI / 2);
plane(HALL.w, HALL.h, wallMat, [0, HALL.h / 2, HALL.zBack]);
plane(HALL.w, HALL.h, wallMat, [0, HALL.h / 2, HALL.zFront], Math.PI);
plane(HALL.w, L, ceilMat, [0, HALL.h, zMid], 0, Math.PI / 2);

// 踢脚线
const baseMat = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.6 });
for (const x of [-HALL.w / 2 + 0.02, HALL.w / 2 - 0.02]) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, L), baseMat);
  b.position.set(x, 0.08, zMid);
  procedural.add(b);
}

// 天窗灯带
const stripMat = new THREE.MeshBasicMaterial({ color: '#fffaf0' });
for (let z = HALL.zFront - 4; z > HALL.zBack + 2; z -= 7) {
  const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.2), stripMat);
  s.rotation.x = Math.PI / 2;
  s.position.set(0, HALL.h - 0.01, z);
  procedural.add(s);
  const p = new THREE.PointLight('#fff1dc', 6, 14, 1.6);
  p.position.set(0, HALL.h - 0.4, z);
  procedural.add(p);
}

// 长椅与雕塑
const colliders = [];
const benchMat = new THREE.MeshStandardMaterial({ color: '#3a2a1e', roughness: 0.55 });
for (const z of [-9, -23]) {
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 2.6), benchMat);
  seat.position.set(0, 0.45, z);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 2.2), new THREE.MeshStandardMaterial({ color: '#1c1917' }));
  legs.position.set(0, 0.2, z);
  procedural.add(seat, legs);
  colliders.push({ x: 0, z, hw: 0.75, hd: 1.55 });
}
const sculptures = [];
for (const [z, color] of [[-16, '#c2410c'], [-30, '#0e7490']]) {
  const ped = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.8), new THREE.MeshStandardMaterial({ color: '#f5f5f4', roughness: 0.4 }));
  ped.position.set(0, 0.5, z);
  const art = new THREE.Mesh(new THREE.TorusKnotGeometry(0.28, 0.09, 160, 16), new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.2 }));
  art.position.set(0, 1.45, z);
  procedural.add(ped, art);
  sculptures.push(art);
  colliders.push({ x: 0, z, hw: 0.65, hd: 0.65 });
}

// ---------------- 画作 ----------------
const loader = new THREE.TextureLoader();
const paintings = [];
const frameMat = new THREE.MeshStandardMaterial({ color: '#16120f', roughness: 0.35, metalness: 0.3 });
const goldMat = new THREE.MeshStandardMaterial({ color: '#b08d57', roughness: 0.3, metalness: 0.9 });

function slotFor(i) {
  // 左墙 5 幅、右墙 4 幅，交错排列
  const left = i % 2 === 0;
  const k = Math.floor(i / 2);
  const z = left ? -3 - k * 7 : -6.5 - k * 7;
  const x = left ? -HALL.w / 2 + 0.06 : HALL.w / 2 - 0.06;
  return { pos: new THREE.Vector3(x, PAINT_Y, z), rotY: left ? Math.PI / 2 : -Math.PI / 2, normal: new THREE.Vector3(left ? 1 : -1, 0, 0) };
}

function addPainting(p, i) {
  const slot = slotFor(i);
  const g = new THREE.Group();
  g.position.copy(slot.pos);
  g.rotation.y = slot.rotY;

  const frame = new THREE.Mesh(new THREE.BoxGeometry(PAINT_W + 0.26, PAINT_H + 0.26, 0.08), frameMat);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(PAINT_W + 0.06, PAINT_H + 0.06, 0.09), goldMat);
  const artMat = new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.08 });
  const art = new THREE.Mesh(new THREE.PlaneGeometry(PAINT_W, PAINT_H), artMat);
  art.position.z = 0.051;
  g.add(frame, inner, art);

  const gen = canvasTex(abstractPainting(p));
  artMat.map = gen;
  artMat.emissiveMap = gen;
  if (p.cover) {
    loader.load(p.cover, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      artMat.map = artMat.emissiveMap = t;
      artMat.needsUpdate = true;
    });
  }

  const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.27), new THREE.MeshStandardMaterial({ map: canvasTex(plaque(p, i)), roughness: 0.8 }));
  pl.position.set(PAINT_W / 2 + 0.6, -0.55, 0.02);
  g.add(pl);

  const spot = new THREE.SpotLight('#fff3e0', 28, 9, 0.55, 0.6, 1.5);
  const sp = slot.pos.clone().addScaledVector(slot.normal, 2.2);
  spot.position.set(sp.x, HALL.h - 0.2, sp.z);
  spot.target.position.copy(slot.pos);
  scene.add(spot, spot.target);

  scene.add(g);
  const entry = { p, i, group: g, art, artMat, slot, spot, videoEl: null, staticMap: null };
  // 同源宣传片：走近时在画框上直接播放（静音）
  if (p.video && !/^https?:/.test(p.video)) {
    const v = document.createElement('video');
    v.src = p.video;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'none';
    entry.videoEl = v;
    entry.videoTex = new THREE.VideoTexture(v);
    entry.videoTex.colorSpace = THREE.SRGBColorSpace;
  }
  paintings.push(entry);
}

// 尽头的标题墙与入口墙
function wallText(lines, z, rotY, opts) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), new THREE.MeshStandardMaterial({ map: canvasTex(textPanel(lines, opts)), roughness: 0.9 }));
  m.position.set(0, 2.6, z);
  m.rotation.y = rotY;
  scene.add(m);
}

// ---------------- 可选：Blender 展馆模型 ----------------
async function tryLoadGalleryModel() {
  try {
    const res = await fetch(GALLERY_MODEL, { method: 'HEAD' });
    if (!res.ok) return;
    const gltf = await new GLTFLoader().loadAsync(GALLERY_MODEL);
    procedural.visible = false;
    scene.add(gltf.scene);
  } catch {
    /* 没有模型就用程序生成的展馆 */
  }
}

// ---------------- 控制 ----------------
const keys = new Set();
const ui = {
  intro: document.getElementById('intro'),
  enter: document.getElementById('enter'),
  hud: document.getElementById('hud'),
  prompt: document.getElementById('prompt'),
  modal: document.getElementById('modal'),
  menu: document.getElementById('menu'),
  menuList: document.getElementById('menu-list'),
  mobile: document.getElementById('mobile'),
};
const isTouch = matchMedia('(pointer: coarse)').matches;
let started = false;
let modalOpen = false;
let menuOpen = false;

function lockPointer() {
  if (!isTouch && !modalOpen && !menuOpen) canvas.requestPointerLock?.();
}
ui.enter.addEventListener('click', () => {
  started = true;
  ui.intro.hidden = true;
  ui.hud.hidden = false;
  if (isTouch) ui.mobile.hidden = false;
  lockPointer();
});
canvas.addEventListener('click', () => {
  if (!started || modalOpen) return;
  if (document.pointerLockElement === canvas && focused) openModal(focused);
  else lockPointer();
});
// 刚锁定鼠标时浏览器偶尔会报一个巨大的位移，丢掉它避免视角乱跳
let skipMove = false;
document.addEventListener('pointerlockchange', () => (skipMove = true));
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (skipMove || Math.abs(e.movementX) > 200 || Math.abs(e.movementY) > 200) {
    skipMove = false;
    return;
  }
  look.yaw -= e.movementX * 0.0022;
  look.pitch = THREE.MathUtils.clamp(look.pitch - e.movementY * 0.0022, -1.2, 1.2);
});
addEventListener('keydown', (e) => {
  if (modalOpen) {
    if (e.key === 'Tab' || e.key.toLowerCase() === 'q') {
      e.preventDefault();
      switchMode(currentMode === 'video' ? 'live' : 'video');
    } else if (e.key === 'Escape') closeModal();
    return;
  }
  if (e.key.toLowerCase() === 'm') return toggleMenu();
  if (menuOpen && e.key === 'Escape') return toggleMenu(false);
  if (e.key.toLowerCase() === 'e' && focused) return openModal(focused);
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// 触屏：左下摇杆移动，右侧拖动转视角
const joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
const lookTouch = { id: null, x: 0, y: 0 };
const stick = document.getElementById('stick');
ui.mobile.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth * 0.45 && joy.id === null) Object.assign(joy, { id: t.identifier, ox: t.clientX, oy: t.clientY });
    else if (lookTouch.id === null) Object.assign(lookTouch, { id: t.identifier, x: t.clientX, y: t.clientY });
  }
}, { passive: true });
ui.mobile.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) {
      joy.x = THREE.MathUtils.clamp((t.clientX - joy.ox) / 50, -1, 1);
      joy.y = THREE.MathUtils.clamp((t.clientY - joy.oy) / 50, -1, 1);
      stick.style.transform = `translate(${joy.x * 30}px, ${joy.y * 30}px)`;
    } else if (t.identifier === lookTouch.id) {
      look.yaw -= (t.clientX - lookTouch.x) * 0.005;
      look.pitch = THREE.MathUtils.clamp(look.pitch - (t.clientY - lookTouch.y) * 0.005, -1.2, 1.2);
      lookTouch.x = t.clientX;
      lookTouch.y = t.clientY;
    }
  }
}, { passive: true });
ui.mobile.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) {
      Object.assign(joy, { id: null, x: 0, y: 0 });
      stick.style.transform = '';
    }
    if (t.identifier === lookTouch.id) lookTouch.id = null;
  }
});
ui.prompt.addEventListener('click', () => focused && openModal(focused));

// ---------------- 目录 / 传送 ----------------
function teleport(entry) {
  const s = entry.slot;
  // 竖屏视野窄，站远一点才能看全整幅画
  const pos = s.pos.clone().addScaledVector(s.normal, camera.aspect < 1 ? 5.2 : 3.2);
  camera.position.set(pos.x, EYE, pos.z);
  look.yaw = s.normal.x > 0 ? Math.PI / 2 : -Math.PI / 2;
  look.pitch = 0;
  setFocus(null);
}
function toggleMenu(force) {
  menuOpen = force ?? !menuOpen;
  ui.menu.hidden = !menuOpen;
  if (menuOpen) document.exitPointerLock?.();
  else lockPointer();
}
document.getElementById('menu-btn').addEventListener('click', () => toggleMenu());
document.getElementById('menu-close').addEventListener('click', () => toggleMenu(false));

// ---------------- 作品弹窗：宣传片 / 实机 ----------------
let focused = null;
let currentMode = 'video';
let currentEntry = null;
let cleanup = () => {};
const modalTitle = document.getElementById('modal-title');
const modalSub = document.getElementById('modal-sub');
const modalBody = document.getElementById('modal-body');
const modeBtns = [...document.querySelectorAll('[data-mode]')];
modeBtns.forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.mode)));
document.getElementById('modal-close').addEventListener('click', closeModal);

function openModal(entry) {
  currentEntry = entry;
  modalOpen = true;
  document.exitPointerLock?.();
  keys.clear();
  const p = entry.p;
  modalTitle.textContent = p.title;
  modalSub.textContent = p.subtitle;
  document.getElementById('modal-repo').href = p.repo;
  ui.modal.hidden = false;
  switchMode(p.video ? 'video' : 'live');
}
function closeModal() {
  cleanup();
  cleanup = () => {};
  modalBody.textContent = '';
  ui.modal.hidden = true;
  modalOpen = false;
  lockPointer();
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function gallery(shots) {
  if (!shots?.length) return null;
  const wrap = el('div', 'shots');
  const img = el('img');
  img.alt = '项目截图';
  let k = 0;
  const show = () => (img.src = shots[k]);
  const prev = el('button', 'chip', '◀');
  const next = el('button', 'chip', '▶');
  prev.onclick = () => { k = (k - 1 + shots.length) % shots.length; show(); };
  next.onclick = () => { k = (k + 1) % shots.length; show(); };
  wrap.append(img);
  if (shots.length > 1) {
    const nav = el('div', 'row center');
    nav.append(prev, next);
    wrap.append(nav);
  }
  show();
  return wrap;
}

function switchMode(mode) {
  const p = currentEntry.p;
  currentMode = mode;
  modeBtns.forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  cleanup();
  cleanup = () => {};
  modalBody.textContent = '';

  if (mode === 'video') {
    if (!p.video) {
      modalBody.append(el('p', 'muted', '这个项目还没有宣传片。切到「实机」看看它能做什么。'));
      const g = gallery(p.shots);
      if (g) modalBody.append(g);
      return;
    }
    const v = el('video', 'promo');
    v.src = p.video;
    v.controls = true;
    v.autoplay = true;
    v.playsInline = true;
    const fallback = el('p', 'muted', `播放不了？<a href="${p.repo}#readme" target="_blank" rel="noopener">到 GitHub 上观看宣传片 ↗</a>`);
    v.addEventListener('error', () => (fallback.innerHTML = `这段宣传片没能在当前浏览器里加载，请 <a href="${p.repo}#readme" target="_blank" rel="noopener">到 GitHub 上观看 ↗</a>`));
    modalBody.append(v, fallback);
    cleanup = () => v.pause();
    return;
  }

  // 实机
  if (p.demoUrl) {
    const f = el('iframe', 'live');
    f.src = p.demoUrl;
    f.allow = 'fullscreen; clipboard-write';
    modalBody.append(f, el('p', 'muted', `<a href="${p.demoUrl}" target="_blank" rel="noopener">在新标签页打开 ↗</a>`));
    return;
  }
  const grid = el('div', 'live-grid');
  const left = el('div', 'demo-pane');
  left.append(el('div', 'tag', '互动演示 · 浏览器内模拟'));
  const stage = el('div', 'demo');
  left.append(stage);
  cleanup = DEMOS[p.demo]?.(stage, p) ?? (() => {});
  const right = el('div', 'info-pane');
  right.append(el('p', '', p.desc));
  const g = gallery(p.shots);
  if (g) right.append(g);
  right.append(el('h4', '', '主要功能'), el('ul', '', p.features.map((f) => `<li>${f}</li>`).join('')));
  right.append(el('div', 'techs', p.tech.map((t) => `<span>${t}</span>`).join('')));
  grid.append(left, right);
  modalBody.append(grid);
}

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const toP = new THREE.Vector3();

function collide(pos) {
  pos.x = THREE.MathUtils.clamp(pos.x, -HALL.w / 2 + 0.5, HALL.w / 2 - 0.5);
  pos.z = THREE.MathUtils.clamp(pos.z, HALL.zBack + 0.5, HALL.zFront - 0.5);
  for (const c of colliders) {
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const px = c.hw + 0.3 - Math.abs(dx), pz = c.hd + 0.3 - Math.abs(dz);
    if (px > 0 && pz > 0) {
      if (px < pz) pos.x += Math.sign(dx || 1) * px;
      else pos.z += Math.sign(dz || 1) * pz;
    }
  }
}

function setFocus(entry) {
  if (focused) focused.spot.intensity = 28;
  focused = entry;
  if (focused) focused.spot.intensity = 45;
  ui.prompt.hidden = !focused || !started;
  if (focused) ui.prompt.innerHTML = `${isTouch ? '点这里' : '按 <kbd>E</kbd> 或单击'}观看「${focused.p.title}」`;
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');

  if (started && !modalOpen && !menuOpen) {
    let mx = 0, mz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    mx += joy.x;
    mz -= joy.y;
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6 : 3.2) * dt;
    fwd.set(-Math.sin(look.yaw), 0, -Math.cos(look.yaw));
    right.set(-fwd.z, 0, fwd.x);
    camera.position.addScaledVector(fwd, mz * speed).addScaledVector(right, mx * speed);
    collide(camera.position);
    camera.position.y = EYE + Math.sin(performance.now() / 160) * 0.015 * Math.min(1, Math.hypot(mx, mz));
  }

  // 找到正在看的画
  camera.getWorldDirection(fwd);
  let best = null, bestScore = 0;
  for (const e of paintings) {
    toP.copy(e.slot.pos).sub(camera.position);
    const d = toP.length();
    const facing = toP.normalize().dot(fwd);
    const score = facing - d / 20;
    if (d < 6 && facing > 0.6 && score > bestScore) { best = e; bestScore = score; }

    // 画框上的视频：走近播放、走远暂停
    if (e.videoEl) {
      const near = d < 9 && !modalOpen;
      if (near && e.videoEl.paused) {
        e.staticMap ??= e.artMat.map;
        e.videoEl.play().then(() => {
          e.artMat.map = e.artMat.emissiveMap = e.videoTex;
          e.artMat.needsUpdate = true;
        }).catch(() => {});
      } else if (!near && !e.videoEl.paused) {
        e.videoEl.pause();
        e.artMat.map = e.artMat.emissiveMap = e.staticMap;
        e.artMat.needsUpdate = true;
      }
    }
  }
  if (best !== focused) setFocus(best);
  if (!started) look.yaw = Math.sin(performance.now() / 4000) * 0.25;
  for (const s of sculptures) s.rotation.y += dt * 0.4;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------- 启动 ----------------
async function init() {
  PROJECTS.forEach(addPainting);
  wallText([`${OWNER.name} 的作品馆`, `${PROJECTS.length} 件公开项目 · 来自 GitHub`], HALL.zBack + 0.01, 0, { bg: '#1c1917', fg: '#f5efe6', size: 92 });
  wallText(['感谢参观', '按 M 打开展品目录随时传送'], HALL.zFront - 0.01, Math.PI, { bg: '#1c1917', fg: '#f5efe6', size: 92 });
  PROJECTS.forEach((p, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b> ${p.title}<span>${p.subtitle}</span>`;
    li.onclick = () => { teleport(paintings[i]); toggleMenu(false); };
    ui.menuList.append(li);
  });
  document.getElementById('count').textContent = PROJECTS.length;
  ui.enter.disabled = false;
  ui.enter.textContent = '进入展馆';
  tryLoadGalleryModel();
  tick();
}
init();
