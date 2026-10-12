import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PROJECTS, MUSIC } from './projects.js';
import { abstractPainting, plaque, textPanel } from './art.js';

// 展馆模型由 blender/build_gallery.py 生成：gallery.glb 是建筑本体，gallery.json 是画位、碰撞等布局数据。
const LAYOUT_URL = 'assets/gallery.json';

const EYE = 1.65;

// ---------------- 渲染器与场景 ----------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// 手机屏幕像素密度很高，按 3 倍渲染太吃力，最多按 1.5 倍
const isTouch = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1714');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 150);
// 手机竖屏时画面很窄，把视角调大一点，左右能多看到一些
const fitFov = () => (camera.fov = camera.aspect < 1 ? 80 : 70);
fitFov();
camera.updateProjectionMatrix();
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
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    // 进馆前一个字节都不下，把带宽先让给展馆模型；进馆后由 updateWallVideos 决定谁先下载
    v.preload = 'none';
    entry.videoEl = v;
    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace;
    // 屏幕直接显示视频原色：不受射灯影响，也不走色调映射（ACES 会把画面压灰、发白）
    entry.tvMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    // 出画面之后再换上视频贴图，加载期间先显示封面
    v.addEventListener('playing', () => {
      entry.tv = true;
      if (focused === entry) setFocus(entry);
      art.material = entry.tvMat;
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
  } else if (s.kind === 'note') {
    // 八分音符：斜放的符头 + 符干 + 符尾
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 16), mat);
    head.scale.set(1.35, 0.95, 0.8);
    head.rotation.z = 0.45;
    head.position.set(-0.1, -0.3, 0);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.68, 16), mat);
    stem.position.set(0.045, 0.03, 0);
    const flag = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0.045, 0.37, 0), new THREE.Vector3(0.2, 0.3, 0),
      new THREE.Vector3(0.3, 0.12, 0), new THREE.Vector3(0.19, -0.04, 0));
    g.add(head, stem, new THREE.Mesh(new THREE.TubeGeometry(flag, 48, 0.028, 12), mat));
  } else {
    // 「W」形的金属管
    const pts = [[-0.44, 0.3], [-0.22, -0.3], [0, 0.14], [0.22, -0.3], [0.44, 0.3]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    const path = new THREE.CurvePath();
    let from = pts[0];
    for (let k = 1; k < pts.length - 1; k++) {
      const a = pts[k].clone().lerp(pts[k - 1], 0.08 / pts[k].distanceTo(pts[k - 1]));
      const b = pts[k].clone().lerp(pts[k + 1], 0.08 / pts[k].distanceTo(pts[k + 1]));
      path.add(new THREE.LineCurve3(from, a));
      path.add(new THREE.QuadraticBezierCurve3(a, pts[k], b));
      from = b;
    }
    path.add(new THREE.LineCurve3(from, pts.at(-1)));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 240, 0.075, 20), mat));
    for (const end of [pts[0], pts.at(-1)]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12), mat);
      cap.position.copy(end);
      g.add(cap);
    }
  }
  g.scale.setScalar(s.scale);
  g.position.set(s.pos[0], s.pos[1] + 0.45 * s.scale, s.pos[2]);
  scene.add(g);
  sculptures.push(g);
}

// ---------------- 展馆模型 ----------------
const LIGHTMAP_GAIN = Math.PI;

async function loadGallery(layout, onProgress) {
  // 模型和两张光照贴图同时下载，进度条把三者都算进去（以前只算模型，到 100% 后还要再等贴图）。
  // GitHub Pages 用 gzip 传输时，响应头里的大小是压缩后的，而 loaded 数的是解压后的字节，
  // 所以总量用 gallery.json 里记下的原始大小
  const maps = Object.entries(layout.lightmaps || {});
  const sizes = [layout.modelBytes, ...maps.map(([, lm]) => lm.bytes)];
  const total = sizes.every(Boolean) ? sizes.reduce((a, b) => a + b, 0) : 0;
  const got = sizes.map(() => 0);
  const track = (k) => (e) => {
    got[k] = e.loaded;
    if (total) onProgress(Math.min(1, got.reduce((a, b) => a + b, 0) / total));
  };
  const file = (type) => new THREE.FileLoader().setResponseType(type);
  const [glb, ...blobs] = await Promise.all([
    file('arraybuffer').loadAsync(layout.model, track(0)),
    ...maps.map(([, lm], k) => file('blob').loadAsync(lm.file, track(k + 1))),
  ]);
  const gltf = await new GLTFLoader().parseAsync(glb, layout.model.replace(/[^/]*$/, ''));
  await Promise.all(maps.map(async ([name, lm], k) => {
    const url = URL.createObjectURL(blobs[k]);
    const tex = await loader.loadAsync(url);
    URL.revokeObjectURL(url);
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
  // 进馆前先把着色器编译好，免得点「进入展馆」后画面卡住；显卡支持的话在后台并行编译。
  // 视频画面的材质也借一块屏幕先编译，第一次走近电视时就不会卡一下
  const tv = paintings.find((e) => e.tvMat && !e.tv);
  const cover = tv?.art.material;
  if (tv) tv.art.material = tv.tvMat;
  if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  if (tv && !tv.tv) tv.art.material = cover;
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
let started = false;
let modalOpen = false;
let menuOpen = false;

function lockPointer() {
  if (!isTouch && !modalOpen && !menuOpen) canvas.requestPointerLock?.();
}
ui.enter.addEventListener('click', () => {
  started = true;
  // 有些浏览器要等用户点过一次才允许自动播放。iOS 还要求每个视频都在这次点击里 play() 过一次，
  // 之后才允许脚本给它开声音；轮不到的下一帧会再被暂停、停止下载
  if (!canFade) for (const e of paintings) {
    if (!e.videoEl) continue;
    e.videoEl.src = e.p.video;
    e.videoEl.play().catch(() => {});
  }
  wallOn = true;
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
// 音乐厅的大银幕坐在长椅上也要听得到，范围放大
const hearing = (e) => (e.slot.room === 'music' ? [12, 8] : [HEAR_FAR, HEAR_NEAR]);
function hearLevel(e, d) {
  const [far, near] = hearing(e);
  return THREE.MathUtils.clamp((far - d) / (far - near), 0, 1);
}
let audioOn = false; // 浏览器要求用户点过页面才能出声，点「进入展馆」后打开
// iOS 上 video.volume 是只读的，只能用 muted 硬切
const canFade = (() => {
  const v = document.createElement('video');
  v.volume = 0.5;
  return v.volume === 0.5;
})();

// 视频是 1080p 原画质，网速慢时几台一起下载谁都播不顺。所以带宽排队用：
// （手机上每台 1080p 都要解码、每帧传进显卡，同时播两台会掉帧，所以只播眼前这一台）
// 离你最近、正对着你的那台先下载先播；它整段下载完了，下一台才开始下载。
// 轮不到的电视停在封面或最后一帧，并且中断下载，不跟正在看的那台抢带宽
const PLAY_FAR = isTouch ? 15 : 25;
const MAX_PLAYING = isTouch ? 1 : 4;
let wallOn = false;

const bufferedEnd = (v) => (v.readyState >= 2 && v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0);
const fullyLoaded = (v) => bufferedEnd(v) >= v.duration - 0.5;
// 长片（比如 3 分多钟的 MV）浏览器未必一口气下完，缓冲出一分钟以上就算够了
const aheadEnough = (v) => fullyLoaded(v) || bufferedEnd(v) - v.currentTime > 60;

function updateWallVideo(e, want) {
  const v = e.videoEl;
  if (want) {
    if (!v.getAttribute('src')) {
      v.preload = 'auto';
      v.src = e.p.video;
      e.dl = null;
      if (e.resumeAt) v.addEventListener('loadedmetadata', () => (v.currentTime = e.resumeAt % v.duration), { once: true });
    }
    if (v.paused && readyToPlay(e)) v.play().catch(() => {});
  } else if (v.getAttribute('src')) {
    if (!v.paused) v.pause();
    if (!fullyLoaded(v)) {
      // 停止下载：屏幕上留着最后一帧，下次轮到时从这里接着播（浏览器缓存里已有的部分不用重下）
      e.resumeAt = v.currentTime;
      v.removeAttribute('src');
      v.load();
    }
  }
}

// 网速跟不上码率时先攒缓冲：按眼下的下载速度，剩下的部分能赶在播到之前下完才开播。
// 宁可晚几秒开始（期间显示封面），也不要播几秒卡一下。
// iOS 不播放就不下载，量不出速度，等 3 秒还没动静就直接播（电脑上首包慢就继续等）
function readyToPlay(e) {
  const v = e.videoEl, now = performance.now() / 1000, end = bufferedEnd(v);
  if (fullyLoaded(v)) return true;
  if (!e.dl) e.dl = { t: now, end };
  const dt = now - e.dl.t;
  if (dt < 1) return false;
  const speed = (end - e.dl.end) / dt; // 每秒能下载几秒的视频
  if (speed >= 1.5) return true;
  if (speed <= 0) return !canFade && dt > 3;
  // 刚开始那一下的速度不准，至少量 2 秒再下结论
  return dt >= 2 && (v.duration - end) / speed <= v.duration - v.currentTime;
}

// tvs: [entry, 排队距离]。排队距离 = 真实距离，身后的 +10 米，别的展厅的 +8 米；
// 正在播的那台再让 2 米，免得两台差不多远时来回切换
function updateWallVideos(tvs) {
  const rank = ([e, d]) => d - (e.playing ? 2 : 0);
  tvs.sort((a, b) => rank(a) - rank(b));
  let allowed = wallOn && !modalOpen;
  let n = 0;
  for (const [e] of tvs) {
    const want = allowed && e.slot.pos.distanceTo(camera.position) < PLAY_FAR && n < MAX_PLAYING;
    e.playing = want;
    updateWallVideo(e, want);
    if (want) {
      n++;
      // 前面这台还没下载完，后面的先别抢
      if (!aheadEnough(e.videoEl)) allowed = false;
    }
  }
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

function updateAudio(loudest, level, dt) {
  const k = Math.min(1, dt * 4);
  for (const e of paintings) {
    const v = e.videoEl;
    if (!v) continue;
    let target = 0;
    if (audioOn && !modalOpen && !menuOpen && e === loudest) target = level;
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
  const repoLink = document.getElementById('modal-repo');
  repoLink.hidden = !p.repo;
  if (p.repo) repoLink.href = p.repo;
  ui.modal.hidden = false;
  for (const b of modeBtns) b.textContent = b.dataset.mode === 'intro' ? `📖 ${kindName(p)}介绍` : p.music ? '🎬 视频' : '🎬 宣传片';
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

const kindName = (p) => (p.music ? '作品' : '项目');

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
    const fallback = el('p', 'muted', p.repo ? `播放不了？<a href="${p.repo}#readme" target="_blank" rel="noopener">到 GitHub 上观看宣传片 ↗</a>` : '');
    v.addEventListener('error', () => (fallback.innerHTML = p.repo
      ? `这段宣传片没能在当前浏览器里加载，请 <a href="${p.repo}#readme" target="_blank" rel="noopener">到 GitHub 上观看 ↗</a>`
      : '这段视频没能在当前浏览器里加载。'));
    modalBody.append(v, fallback);
    cleanup = () => v.pause();
    return;
  }

  // 项目介绍：只放文字
  const info = el('div', 'info-pane');
  info.append(el('p', 'lead', p.desc));
  if (p.features) info.append(el('h4', '', '主要功能'), el('ul', '', p.features.map((f) => `<li>${f}</li>`).join('')));
  if (p.tech) info.append(el('h4', '', '技术栈'), el('div', 'techs', p.tech.map((t) => `<span>${t}</span>`).join('')));
  // GitHub 链接在弹窗右上角已经有了，这里只放在线体验
  if (p.demoUrl) {
    const links = el('div', 'row links');
    links.append(el('a', 'btn', '在线体验 ↗'));
    Object.assign(links.lastChild, { href: p.demoUrl, target: '_blank', rel: 'noopener' });
    info.append(links);
  }
  modalBody.append(info);
}

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const toP = new THREE.Vector3();

let walkable = [];
let obstacles = [];
let rooms = [];
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
    ? `<button data-act="intro">📖 ${t}</button>${canReplay ? '<button data-act="replay">↻ 重播</button>' : ''}`
    : `<button data-act="intro">按 <kbd>E</kbd> 查看「${t}」${kindName(focused.p)}介绍</button>${canReplay ? '<button data-act="replay">按 <kbd>R</kbd> 重新播放</button>' : ''}`;
}

const tvs = []; // 每帧按距离排序的电视，决定哪几台在播

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
  const { x: cx, z: cz } = camera.position;
  const here = rooms.find((r) => cx >= r.x0 && cx <= r.x1 && cz >= r.z0 && cz <= r.z1)?.name;
  let best = null, bestScore = 0;
  let loudest = null, loudLevel = 0;
  for (const e of paintings) {
    toP.copy(e.slot.pos).sub(camera.position);
    const d = toP.length();
    const facing = toP.normalize().dot(fwd);
    const score = facing - d / 20;
    // 大银幕从远一点的地方也能选中
    if (d < Math.max(7, e.slot.w * 1.6) && facing > 0.6 && score > bestScore) { best = e; bestScore = score; }

    if (e.videoEl) tvs.push([e, d + (facing > 0 ? 0 : 10) + (e.slot.room === here ? 0 : 8)]);
    const lv = e.tv ? hearLevel(e, d) : 0;
    if (lv > loudLevel) { loudest = e; loudLevel = lv; }
  }
  updateWallVideos(tvs);
  tvs.length = 0;
  updateAudio(loudest, loudLevel, dt);
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
  fitFov();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------- 启动 ----------------
async function init() {
  const layout = await (await fetch(LAYOUT_URL)).json();
  walkable = layout.walkable;
  rooms = layout.rooms;
  obstacles = layout.obstacles;
  const [sx, , sz] = layout.spawn.pos;
  camera.position.set(sx, EYE, sz);
  spawnYaw = look.yaw = layout.spawn.yaw;

  const isMusic = (s) => s.room === 'music';
  const main = layout.slots.filter((s) => s.tier === 1 && !isMusic(s));
  const extra = layout.slots.filter((s) => s.tier !== 1 && !isMusic(s));
  const slots = [...main, ...extra];
  if (PROJECTS.length > slots.length) console.warn(`画位只有 ${slots.length} 个，多出的 ${PROJECTS.length - slots.length} 件作品没有上墙`);
  PROJECTS.slice(0, slots.length).forEach((p, i) => addPainting(p, i, slots[i]));
  main.slice(PROJECTS.length).forEach(addPlaceholder);
  // 音乐作品集：第一首上大银幕，侧墙的位置留给以后的作品
  const musicSlots = layout.slots.filter(isMusic);
  MUSIC.slice(0, musicSlots.length).forEach((m, j) => addPainting(m, j, musicSlots[j]));

  const dark = { bg: '#1c1917', fg: '#f5efe6' };
  const TEXTS = {
    title: [['翁子良的作品馆'], { ...dark, size: 130 }],
    thanks: [['感谢参观', '按 M 打开展品目录，随时传送'], { ...dark, size: 110 }],
    hero: [['翁子良的作品馆'], { ...dark, size: 120 }],
    west: [['西展厅'], { ...dark, size: 130 }],
    east: [['东展厅'], { ...dark, size: 130 }],
    grand: [['长廊'], { ...dark, size: 130 }],
    music: [['音乐作品集'], { ...dark, size: 130 }],
    music_title: [['音乐作品集'], { ...dark, size: 110 }],
  };
  for (const l of layout.labels) if (TEXTS[l.id]) wallText(TEXTS[l.id][0], l, TEXTS[l.id][1]);
  layout.sculptures.forEach(addSculpture);

  paintings.forEach((e, i) => {
    const p = e.p;
    const li = document.createElement('li');
    li.innerHTML = `<b>${p.music ? '♪' : String(i + 1).padStart(2, '0')}</b> ${p.title}<span>${p.subtitle}</span>`;
    li.onclick = () => { teleport(e); toggleMenu(false); };
    ui.menuList.append(li);
  });
  tick();

  try {
    await loadGallery(layout, (f) => (ui.enter.textContent = `展馆布置中… ${Math.round(f * 100)}%`));
  } catch (err) {
    console.error('展馆模型加载失败', err);
    fallbackFloors(layout);
  }
  ui.enter.disabled = false;
  ui.enter.textContent = '进入展馆';
  // 调试用：地址后加 ?debug 可以在控制台里用 gallery.camera / gallery.look 摆机位
  if (new URLSearchParams(location.search).has('debug')) window.gallery = { camera, look, paintings, teleport, renderer };
}
init();
