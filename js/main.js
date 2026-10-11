import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PROJECTS, OWNER } from './projects.js';
import { abstractPainting, plaque, textPanel } from './art.js';

// 展馆模型由 blender/build_gallery.py 生成：gallery.glb 是建筑本体，gallery.json 是画位、碰撞等布局数据。
const LAYOUT_URL = 'assets/gallery.json';

const EYE = 1.65;

// ---------------- 渲染器与场景 ----------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1714');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 150);
const look = { yaw: 0, pitch: 0 };
let spawnYaw = 0;

// 建筑本体的光照都烘焙在贴图里，这盏半球光只给画框、雕塑这类实时物体补一点环境光
const hemi = new THREE.HemisphereLight('#fff6e8', '#3b2f25', 0.5);
scene.add(hemi);

function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// ---------------- 画作 ----------------
const loader = new THREE.TextureLoader();
const paintings = [];
const sculptures = [];
const frameMat = new THREE.MeshStandardMaterial({ color: '#16120f', roughness: 0.35, metalness: 0.3 });
const goldMat = new THREE.MeshStandardMaterial({ color: '#b08d57', roughness: 0.3, metalness: 0.9 });

function placeOnWall(obj, s) {
  obj.position.set(...s.pos);
  obj.rotation.y = Math.atan2(s.normal[0], s.normal[2]);
}

function frameGroup(slot, artMat) {
  const g = new THREE.Group();
  placeOnWall(g, slot);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(slot.w + 0.3, slot.h + 0.3, 0.08), frameMat);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(slot.w + 0.07, slot.h + 0.07, 0.09), goldMat);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(slot.w, slot.h), artMat);
  art.position.z = 0.051;
  g.add(frame, inner, art);
  scene.add(g);
  return { g, art };
}

function addSpot(slot) {
  const spot = new THREE.SpotLight('#fff3e0', 40, 14, 0.42, 0.6, 1.3);
  spot.position.set(...slot.spot);
  spot.target.position.set(...slot.pos);
  scene.add(spot, spot.target);
  return spot;
}

function addPainting(p, i, slot) {
  const artMat = new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.08 });
  const { g, art } = frameGroup(slot, artMat);

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
  pl.position.set(slot.w / 2 + 0.65, -slot.h / 2 + 0.35, 0.02);
  g.add(pl);

  const pos = new THREE.Vector3(...slot.pos);
  const normal = new THREE.Vector3(...slot.normal);
  const entry = { p, i, group: g, art, artMat, slot: { ...slot, pos, normal }, spot: addSpot(slot), videoEl: null };
  // 网站里自带的宣传片像墙上的电视一样一直循环播放。GitHub 附件地址不允许跨域读取画面，
  // 贴不到画框上，只能在弹窗里看，所以要上墙就得把 mp4 放进 assets/video/
  if (p.video && !/^https?:/.test(p.video)) {
    const v = document.createElement('video');
    v.src = p.video;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'metadata';
    entry.videoEl = v;
    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace;
    // 出画面之后再换上视频贴图，加载期间先显示封面
    v.addEventListener('playing', () => {
      entry.tv = true;
      if (focused === entry) setFocus(entry);
      // 屏幕直接显示视频原色：不受射灯影响，也不走色调映射（ACES 会把画面压灰、发白）
      art.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      artMat.dispose();
    }, { once: true });
  }
  paintings.push(entry);
}

// 作品比画位少时，空着的画框挂一幅「敬请期待」
function addPlaceholder(slot) {
  const mat = new THREE.MeshStandardMaterial({
    map: canvasTex(textPanel(['敬请期待', '下一件作品正在路上'], { w: 1024, h: Math.round(1024 * slot.h / slot.w), bg: '#2a2521', fg: '#d6a65c', size: 96 })),
    roughness: 0.8,
  });
  frameGroup(slot, mat);
  addSpot(slot).intensity = 20;
}

// 墙上的文字牌（标题、展厅名）
function wallText(lines, l, opts) {
  const h = Math.round(1024 * l.h / l.w);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(l.w, l.h),
    new THREE.MeshStandardMaterial({ map: canvasTex(textPanel(lines, { w: 1024, h, ...opts })), roughness: 0.9, emissive: '#ffffff', emissiveIntensity: 0.05 }),
  );
  m.material.emissiveMap = m.material.map;
  placeOnWall(m, l);
  scene.add(m);
}

// 展台上缓缓转动的金属雕塑
function addSculpture(s) {
  const mat = new THREE.MeshStandardMaterial({ color: s.color, metalness: 0.9, roughness: 0.2 });
  const g = new THREE.Group();
  if (s.kind === 'rings') {
    [0.42, 0.33, 0.24].forEach((r, k) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 12, 96), mat);
      ring.rotation.set(k * 1.1, k * 0.7, 0);
      ring.userData.spin = 0.3 + k * 0.25;
      g.add(ring);
    });
  } else {
    g.add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.28, 0.09, 160, 16), mat));
  }
  g.scale.setScalar(s.scale);
  g.position.set(s.pos[0], s.pos[1] + 0.45 * s.scale, s.pos[2]);
  scene.add(g);
  sculptures.push(g);
}

// ---------------- 展馆模型 ----------------
const LIGHTMAP_GAIN = Math.PI;

async function loadGallery(layout, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(layout.model, (e) => e.total && onProgress(e.loaded / e.total));
  const maps = layout.lightmaps || {};
  await Promise.all(Object.entries(maps).map(async ([name, lm]) => {
    const tex = await loader.loadAsync(lm.file);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.channel = 1;
    gltf.scene.getObjectByName(name)?.traverse((o) => {
      if (!o.isMesh) return;
      o.material.lightMap = tex;
      o.material.lightMapIntensity = lm.scale * LIGHTMAP_GAIN;
      o.material.envMapIntensity = 0.25;
      o.material.needsUpdate = true;
    });
  }));
  scene.add(gltf.scene);
}

// 模型加载失败时，至少铺上地面让人能走动
function fallbackFloors(layout) {
  hemi.intensity = 1.2;
  const mat = new THREE.MeshStandardMaterial({ color: '#6b5844', roughness: 0.8 });
  for (const r of layout.rooms) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2);
    scene.add(m);
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
  // 有些浏览器要等用户点过一次才允许自动播放
  startWallVideos();
  enableAudio();
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
      switchMode(currentMode === 'video' ? 'intro' : 'video');
    } else if (e.key === 'Escape') closeModal();
    return;
  }
  if (e.key.toLowerCase() === 'm') return toggleMenu();
  if (menuOpen && e.key === 'Escape') return toggleMenu(false);
  if (e.key.toLowerCase() === 'e' && focused) return openModal(focused);
  if (e.key.toLowerCase() === 'r' && focused) return replay(focused);
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
ui.prompt.addEventListener('click', (e) => {
  if (!focused) return;
  if (e.target.closest('[data-act="replay"]')) replay(focused);
  else openModal(focused);
});

// ---------------- 目录 / 传送 ----------------
function teleport(entry) {
  const s = entry.slot;
  // 竖屏视野窄，站远一点才能看全整幅画
  // 被长椅等挡住时往画的方向挪近一点
  let d = (camera.aspect < 1 ? 6.2 : 3.6) * s.w / 4.2;
  const pos = new THREE.Vector3();
  do pos.copy(s.pos).addScaledVector(s.normal, d); while (blocked(pos.x, pos.z) && (d -= 0.2) > 1);
  camera.position.set(pos.x, EYE, pos.z);
  look.yaw = Math.atan2(s.normal.x, s.normal.z);
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

// ---------------- 墙上的电视：所有宣传片一直循环 ----------------
// 声音：同一时间只有离你最近（6 米内）的那台出声，随距离淡入淡出，其余静音，避免串音
const HEAR_FAR = 6, HEAR_NEAR = 3.5;
let audioOn = false; // 浏览器要求用户点过页面才能出声，点「进入展馆」后打开
// iOS 上 video.volume 是只读的，只能用 muted 硬切
const canFade = (() => {
  const v = document.createElement('video');
  v.volume = 0.5;
  return v.volume === 0.5;
})();

// 视频是 1080p 原画质，远处（别的展厅、看不到）的电视先暂停，走近再接着播，省流量也省解码
const PLAY_FAR = 25;
let wallOn = false;

function startWallVideos() {
  wallOn = true;
  for (const e of paintings) e.playing = false; // 让每台电视下一帧重新判断要不要播
}

function updateWallVideo(e, d) {
  const want = wallOn && d < PLAY_FAR;
  if (want === e.playing) return;
  e.playing = want;
  if (want) e.videoEl.play().catch(() => {});
  else e.videoEl.pause();
}

function enableAudio() {
  audioOn = true;
  for (const e of paintings) {
    const v = e.videoEl;
    if (!v || !canFade) continue;
    v.volume = 0;
    v.muted = false;
  }
}

function updateAudio(nearest, nearestDist, dt) {
  const k = Math.min(1, dt * 4);
  for (const e of paintings) {
    const v = e.videoEl;
    if (!v) continue;
    let target = 0;
    if (audioOn && !modalOpen && !menuOpen && e === nearest) {
      target = THREE.MathUtils.clamp((HEAR_FAR - nearestDist) / (HEAR_FAR - HEAR_NEAR), 0, 1);
    }
    if (canFade) {
      v.volume = THREE.MathUtils.clamp(v.volume + (target - v.volume) * k, 0, 1);
    } else {
      const mute = target < 0.3;
      if (v.muted !== mute) {
        v.muted = mute;
        if (!mute) v.play().catch(() => (v.muted = true));
      }
    }
  }
}

// 从头重播
function replay(entry) {
  const v = entry.videoEl;
  if (!entry.tv) return;
  v.currentTime = 0;
  v.play().catch(() => {});
}

// ---------------- 作品弹窗：宣传片 / 项目介绍 ----------------
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
  switchMode('intro');
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
      modalBody.append(el('p', 'muted', '这个项目还没有宣传片，先看看截图吧。'));
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

  // 项目介绍
  const grid = el('div', 'intro-grid');
  const left = el('div', 'info-media');
  const g = gallery(p.shots?.length ? p.shots : p.cover ? [p.cover] : null);
  if (g) left.append(g);
  else left.append(el('div', 'no-shot', '暂无截图'));
  const info = el('div', 'info-pane');
  info.append(el('p', 'lead', p.desc));
  info.append(el('h4', '', '主要功能'), el('ul', '', p.features.map((f) => `<li>${f}</li>`).join('')));
  info.append(el('h4', '', '技术栈'), el('div', 'techs', p.tech.map((t) => `<span>${t}</span>`).join('')));
  const links = el('div', 'row links');
  links.append(el('a', 'btn', '在 GitHub 查看源码 ↗'));
  links.lastChild.href = p.repo;
  if (p.demoUrl) {
    links.append(el('a', 'chip', '在线体验 ↗'));
    links.lastChild.href = p.demoUrl;
  }
  links.querySelectorAll('a').forEach((a) => Object.assign(a, { target: '_blank', rel: 'noopener' }));
  info.append(links);
  grid.append(left, info);
  modalBody.append(grid);
}

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const toP = new THREE.Vector3();

let walkable = [];
let obstacles = [];
const R = 0.3; // 人的半径

function blocked(x, z) {
  if (!walkable.some((w) => x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1)) return true;
  for (const o of obstacles) {
    if (o.type === 'circle') {
      if (Math.hypot(x - o.x, z - o.z) < o.r + R) return true;
    } else if (x > o.x0 - R && x < o.x1 + R && z > o.z0 - R && z < o.z1 + R) return true;
  }
  return false;
}

// 先整体移动，撞墙时分别尝试只沿 x / 只沿 z 滑动
function moveTo(pos, nx, nz) {
  if (!blocked(nx, nz)) pos.set(nx, pos.y, nz);
  else if (!blocked(nx, pos.z)) pos.x = nx;
  else if (!blocked(pos.x, nz)) pos.z = nz;
}

function setFocus(entry) {
  if (focused) focused.spot.intensity = 40;
  focused = entry;
  if (focused) focused.spot.intensity = 65;
  ui.prompt.hidden = !focused || !started;
  if (!focused) return;
  const t = focused.p.title;
  const canReplay = !!focused.tv;
  ui.prompt.innerHTML = isTouch
    ? `<button data-act="intro">「${t}」项目介绍</button>${canReplay ? '<button data-act="replay">↻ 重新播放</button>' : ''}`
    : `<button data-act="intro">按 <kbd>E</kbd> 查看「${t}」项目介绍</button>${canReplay ? '<button data-act="replay">按 <kbd>R</kbd> 重新播放</button>' : ''}`;
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
    moveTo(camera.position,
      camera.position.x + (fwd.x * mz + right.x * mx) * speed,
      camera.position.z + (fwd.z * mz + right.z * mx) * speed);
    camera.position.y = EYE + Math.sin(performance.now() / 160) * 0.015 * Math.min(1, Math.hypot(mx, mz));
  }

  // 找到正在看的画
  camera.getWorldDirection(fwd);
  let best = null, bestScore = 0;
  let nearest = null, nearestDist = Infinity;
  for (const e of paintings) {
    toP.copy(e.slot.pos).sub(camera.position);
    const d = toP.length();
    const facing = toP.normalize().dot(fwd);
    const score = facing - d / 20;
    if (d < 7 && facing > 0.6 && score > bestScore) { best = e; bestScore = score; }

    if (e.videoEl) updateWallVideo(e, d);
    if (e.tv && d < nearestDist) { nearest = e; nearestDist = d; }
  }
  updateAudio(nearest, nearestDist, dt);
  if (best !== focused) setFocus(best);
  if (!started) look.yaw = spawnYaw + Math.sin(performance.now() / 4000) * 0.25;
  for (const s of sculptures) {
    s.rotation.y += dt * 0.4;
    for (const c of s.children) if (c.userData.spin) c.rotation.x += dt * c.userData.spin;
  }
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
  const layout = await (await fetch(LAYOUT_URL)).json();
  walkable = layout.walkable;
  obstacles = layout.obstacles;
  const [sx, , sz] = layout.spawn.pos;
  camera.position.set(sx, EYE, sz);
  spawnYaw = look.yaw = layout.spawn.yaw;

  const main = layout.slots.filter((s) => s.tier === 1);
  const extra = layout.slots.filter((s) => s.tier !== 1);
  const slots = [...main, ...extra];
  if (PROJECTS.length > slots.length) console.warn(`画位只有 ${slots.length} 个，多出的 ${PROJECTS.length - slots.length} 件作品没有上墙`);
  PROJECTS.slice(0, slots.length).forEach((p, i) => addPainting(p, i, slots[i]));
  main.slice(PROJECTS.length).forEach(addPlaceholder);

  const dark = { bg: '#1c1917', fg: '#f5efe6' };
  const TEXTS = {
    title: [[`${OWNER.name} 的作品馆`, `${PROJECTS.length} 件公开项目 · 来自 GitHub`], { ...dark, size: 110 }],
    thanks: [['感谢参观', '按 M 打开展品目录，随时传送'], { ...dark, size: 110 }],
    hero: [[`${OWNER.name} 的作品馆`, `${PROJECTS.length} 件公开项目 · 来自 GitHub`], { ...dark, size: 92 }],
    west: [['西展厅', 'WEST WING'], { ...dark, size: 150 }],
    east: [['东展厅', 'EAST WING'], { ...dark, size: 150 }],
    grand: [['长廊', 'GRAND GALLERY'], { ...dark, size: 150 }],
  };
  for (const l of layout.labels) if (TEXTS[l.id]) wallText(TEXTS[l.id][0], l, TEXTS[l.id][1]);
  layout.sculptures.forEach(addSculpture);

  PROJECTS.forEach((p, i) => {
    if (!paintings[i]) return;
    const li = document.createElement('li');
    li.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b> ${p.title}<span>${p.subtitle}</span>`;
    li.onclick = () => { teleport(paintings[i]); toggleMenu(false); };
    ui.menuList.append(li);
  });
  document.getElementById('count').textContent = PROJECTS.length;
  tick();

  try {
    await loadGallery(layout, (f) => (ui.enter.textContent = `展馆布置中… ${Math.round(f * 100)}%`));
  } catch (err) {
    console.error('展馆模型加载失败', err);
    fallbackFloors(layout);
  }
  ui.enter.disabled = false;
  ui.enter.textContent = '进入展馆';
  startWallVideos();
  // 调试用：地址后加 ?debug 可以在控制台里用 gallery.camera / gallery.look 摆机位
  if (new URLSearchParams(location.search).has('debug')) window.gallery = { camera, look, paintings, teleport, renderer };
}
init();
