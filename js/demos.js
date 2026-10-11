// 「实机」模式的内置互动演示。
// 项目还没有在线部署地址时，用这些在浏览器里可玩的小样还原核心交互；
// 在 projects.js 里填上 demoUrl 后会改为嵌入真实应用。
// 每个演示函数接收容器元素，返回一个清理函数。

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) el.append(k instanceof Node ? k : document.createTextNode(k));
  return el;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 工业数智平台：实时监控仪表盘 ----------
function dashboard(root) {
  const sensors = [
    { name: '温度 TT-01', unit: '°C', base: 56, amp: 6, limit: 63 },
    { name: '压力 PT-01', unit: 'MPa', base: 0.78, amp: 0.12, limit: 0.88 },
    { name: '流量 FM-01', unit: 'm³/h', base: 128, amp: 14, limit: 999 },
    { name: '转速 PMP-01', unit: 'rpm', base: 1520, amp: 60, limit: 1575 },
  ];
  const alarms = h('ul', { class: 'd-log' });
  const cards = sensors.map((s) => {
    const val = h('b', {}, '--');
    const cv = h('canvas', { width: 240, height: 60 });
    s.hist = [];
    s.val = val;
    s.cv = cv;
    return h('div', { class: 'd-card' }, h('span', {}, s.name), val, cv);
  });
  root.append(h('div', { class: 'd-grid' }, cards), h('h4', {}, '报警记录'), alarms);
  let t = 0;
  const id = setInterval(() => {
    t += 1;
    for (const s of sensors) {
      const v = s.base + Math.sin(t / 6 + s.base) * s.amp * 0.6 + (Math.random() - 0.5) * s.amp;
      s.hist.push(v);
      if (s.hist.length > 40) s.hist.shift();
      s.val.textContent = `${v.toFixed(s.base < 10 ? 2 : 1)} ${s.unit}`;
      const alarm = v > s.limit;
      s.val.parentElement.classList.toggle('alarm', alarm);
      if (alarm && alarms.children.length < 50) {
        alarms.prepend(h('li', {}, `${new Date().toLocaleTimeString()}  ${s.name} 超出阈值 ${s.limit}${s.unit}`));
      }
      const g = s.cv.getContext('2d');
      g.clearRect(0, 0, 240, 60);
      g.strokeStyle = alarm ? '#f87171' : '#38bdf8';
      g.lineWidth = 2;
      g.beginPath();
      s.hist.forEach((y, i) => {
        const py = 55 - ((y - (s.base - s.amp)) / (2 * s.amp)) * 50;
        i ? g.lineTo(i * 6, py) : g.moveTo(0, py);
      });
      g.stroke();
    }
  }, 400);
  return () => clearInterval(id);
}

// ---------- 课析：分析流水线 ----------
function pipeline(root) {
  const stages = ['PPT 页面识别', '语音转写', '按页归类', '多模态评分', '生成报告'];
  const bars = stages.map((s) => h('div', { class: 'p-stage' }, h('span', {}, s), h('i', {})));
  const out = h('div', { class: 'p-out' });
  let alive = true;
  const run = async () => {
    btn.disabled = true;
    out.textContent = '';
    bars.forEach((b) => (b.querySelector('i').style.width = '0%'));
    for (const b of bars) {
      for (let p = 0; p <= 100 && alive; p += 4) {
        b.querySelector('i').style.width = p + '%';
        await sleep(25);
      }
    }
    if (!alive) return;
    const pages = Array.from({ length: 6 }, (_, i) => ({ page: i + 1, score: 60 + Math.round(Math.random() * 38) }));
    out.append(
      h('h4', {}, `总体关联度 ${Math.round(pages.reduce((a, p) => a + p.score, 0) / pages.length)} 分`),
      ...pages.map((p) => h('div', { class: 'p-row' }, `第 ${p.page} 页`, h('meter', { min: 0, max: 100, value: p.score }), `${p.score}`)),
    );
    btn.disabled = false;
  };
  const btn = h('button', { class: 'btn', onclick: run }, '▶ 分析一段示例课堂录像');
  root.append(btn, h('div', { class: 'p-stages' }, bars), out);
  return () => (alive = false);
}

// ---------- 对话类（MyNotebookLM / W&W Agent） ----------
function chat(root, project) {
  const isAgent = project.id === 'W-W_Agent';
  const scripts = isAgent
    ? {
        '帮我统计 src 目录下的代码行数': ['🛠 tool: shell  →  find src -name "*.py" | xargs wc -l', '📄 共 42 个文件，合计 8,316 行。最大的是 orchestrator.py（1,204 行）。'],
        '搜索一下今天的科技新闻': ['🛠 tool: web_search  →  "今日科技新闻"', '🌐 已抓取 5 条结果，整理出三条要点：……（演示内容）'],
        '把这张图里的文字识别出来': ['🛠 tool: image_analyze  →  screenshot.png', '🖼 识别结果：「W&W Agent 多智能体助手」'],
      }
    : {
        '这些资料的核心观点是什么？': ['🔎 混合检索：向量 6 条 + 全文 3 条', '核心观点有三：本地优先保护隐私 [S1]，混合检索提升召回 [S2]，引用可回溯原文 [S3]。'],
        '帮我生成一份测验': ['🧪 Studio → 测验', '1. NotebookLM 式助手的回答依据来自？ A. 模型记忆  B. 导入的来源 ✅'],
        '做一张思维导图': ['🧠 Studio → 思维导图', '研究助手 ├ 来源导入 ├ 带引用问答 ├ Studio 生成 └ 多模型支持'],
      };
  const log = h('div', { class: 'c-log' });
  const add = (who, text) => {
    log.append(h('div', { class: 'c-msg ' + who }, text));
    log.scrollTop = log.scrollHeight;
  };
  add('bot', isAgent ? '你好，我是 W&W Agent。选一个任务让我试试：' : '已导入 3 个来源。可以开始提问：');
  let busy = false;
  const ask = async (q) => {
    if (busy) return;
    busy = true;
    add('me', q);
    for (const line of scripts[q]) {
      await sleep(600);
      add('bot', line);
    }
    busy = false;
  };
  root.append(log, h('div', { class: 'c-chips' }, Object.keys(scripts).map((q) => h('button', { class: 'chip', onclick: () => ask(q) }, q))));
  return () => {};
}

// ---------- OpenHarness：Harness 与 MCP 注入 ----------
function harness(root) {
  const names = ['Claude Code', 'Codex', 'Cursor', 'Windsurf', 'Trae', 'Claude Desktop'];
  const servers = ['filesystem', 'github', 'browser'];
  const table = h('div', { class: 'hn-grid' });
  const status = h('p', { class: 'muted' }, '勾选 Harness，再把 MCP Server 批量注入。');
  const checks = names.map((n) => {
    const cb = h('input', { type: 'checkbox' });
    const tag = h('em', {}, '');
    table.append(h('label', { class: 'hn-item' }, cb, h('b', {}, n), tag));
    return { n, cb, tag };
  });
  const sel = h('select', {}, servers.map((s) => h('option', {}, s)));
  const inject = async () => {
    const picked = checks.filter((c) => c.cb.checked);
    if (!picked.length) return (status.textContent = '先勾选至少一个 Harness。');
    for (const c of picked) {
      c.tag.textContent = '备份中…';
      await sleep(300);
      c.tag.textContent = `✓ 已注入 ${sel.value}`;
    }
    status.textContent = `已为 ${picked.length} 个 Harness 注入 ${sel.value}，原配置备份为 .openharness.bak`;
  };
  root.append(table, h('div', { class: 'row' }, 'MCP Server：', sel, h('button', { class: 'btn', onclick: inject }, '批量注入')), status);
  return () => {};
}

// ---------- W&W 刷题：可答题 ----------
function quiz(root) {
  const qs = [
    { q: 'HTTP 状态码 404 表示？', a: ['服务器错误', '资源未找到', '未授权', '重定向'], c: 1 },
    { q: 'Python 中不可变的类型是？', a: ['list', 'dict', 'tuple', 'set'], c: 2 },
    { q: 'Git 中把暂存区提交到仓库的命令是？', a: ['git add', 'git push', 'git commit', 'git merge'], c: 2 },
    { q: 'SQL 中用于去重的关键字是？', a: ['UNIQUE', 'DISTINCT', 'GROUP', 'ONLY'], c: 1 },
  ];
  let i = 0, score = 0;
  const wrong = [];
  const box = h('div', {});
  const show = () => {
    box.textContent = '';
    if (i >= qs.length) {
      box.append(h('h4', {}, `得分 ${score} / ${qs.length}`), h('p', { class: 'muted' }, wrong.length ? '错题本：' + wrong.join('；') : '全对！'), h('button', { class: 'btn', onclick: () => { i = 0; score = 0; wrong.length = 0; show(); } }, '再来一次'));
      return;
    }
    const cur = qs[i];
    box.append(
      h('p', { class: 'muted' }, `单选题 ${i + 1} / ${qs.length}`),
      h('h4', {}, cur.q),
      ...cur.a.map((opt, k) =>
        h('button', {
          class: 'chip opt',
          onclick: (e) => {
            const ok = k === cur.c;
            e.target.classList.add(ok ? 'ok' : 'bad');
            if (ok) score++;
            else wrong.push(cur.q);
            setTimeout(() => { i++; show(); }, 600);
          },
        }, `${'ABCD'[k]}. ${opt}`),
      ),
    );
  };
  show();
  root.append(box);
  return () => {};
}

// ---------- Tab Scroller：可以真的滚轮切换的标签页 ----------
function tabs(root) {
  let list = ['GitHub', '掘金', 'B 站', 'MDN', 'Claude', '知乎'];
  let cur = 0;
  const bar = h('div', { class: 't-bar' });
  const page = h('div', { class: 't-page' });
  const render = () => {
    bar.textContent = '';
    list.forEach((t, k) => bar.append(h('div', { class: 't-tab' + (k === cur ? ' on' : '') }, t)));
    page.textContent = list.length ? `正在浏览：${list[cur]}` : '所有标签页都关掉了，按住 Shift 并长按左键新建一个';
  };
  const onWheel = (e) => {
    if (!e.shiftKey || !list.length) return;
    e.preventDefault();
    const d = (e.deltaY || e.deltaX) > 0 ? 1 : -1;
    cur = (cur + d + list.length) % list.length;
    render();
  };
  let pressTimer;
  const onDown = (e) => {
    if (!e.shiftKey) return;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      list.push('新标签页');
      cur = list.length - 1;
      render();
    }, 1200);
  };
  const onUp = (e) => {
    if (!pressTimer) return;
    clearTimeout(pressTimer);
    pressTimer = null;
    if (e.shiftKey && list.length) {
      list.splice(cur, 1);
      cur = Math.max(0, Math.min(cur, list.length - 1));
      render();
    }
  };
  const browser = h('div', { class: 't-browser', tabindex: 0 }, bar, page);
  browser.addEventListener('wheel', onWheel, { passive: false });
  browser.addEventListener('pointerdown', onDown);
  browser.addEventListener('pointerup', onUp);
  const prev = h('button', { class: 'chip', onclick: () => { cur = (cur - 1 + list.length) % list.length; render(); } }, '◀ 上一个');
  const next = h('button', { class: 'chip', onclick: () => { cur = (cur + 1) % list.length; render(); } }, '下一个 ▶');
  root.append(h('p', { class: 'muted' }, '在下面的浏览器里按住 Shift 滚动滚轮切换标签页；Shift + 单击关闭当前页，Shift + 长按新建。触屏用按钮。'), browser, h('div', { class: 'row' }, prev, next));
  render();
  return () => {};
}

// ---------- 链域：书签搜索与热榜 ----------
function bookmarks(root) {
  const data = [
    ['MDN Web Docs', '技术', 932], ['GitHub', '技术', 1288], ['Element Plus', '技术', 410], ['Figma', '工具', 377],
    ['Notion', '工具', 645], ['Coursera', '学习', 221], ['B 站', '娱乐', 1530], ['少数派', '新闻', 318], ['V2EX', '社区', 502],
  ].map(([name, cat, hits]) => ({ name, cat, hits }));
  const input = h('input', { placeholder: '搜索书签…', class: 'search' });
  const cats = ['全部', ...new Set(data.map((d) => d.cat))];
  let cat = '全部';
  const catBar = h('div', { class: 'c-chips' });
  const list = h('ol', { class: 'b-list' });
  const render = () => {
    catBar.textContent = '';
    cats.forEach((c) => catBar.append(h('button', { class: 'chip' + (c === cat ? ' on' : ''), onclick: () => { cat = c; render(); } }, c)));
    list.textContent = '';
    data
      .filter((d) => (cat === '全部' || d.cat === cat) && d.name.toLowerCase().includes(input.value.toLowerCase()))
      .sort((a, b) => b.hits - a.hits)
      .forEach((d) => list.append(h('li', { onclick: () => { d.hits++; render(); } }, h('b', {}, d.name), h('span', { class: 'muted' }, ` ${d.cat} · 访问 ${d.hits}`))));
  };
  input.addEventListener('input', render);
  root.append(input, catBar, h('p', { class: 'muted' }, '热门排行（点一下条目模拟一次访问）'), list);
  render();
  return () => {};
}

// ---------- 家庭记忆：物品去哪了 ----------
function finder(root) {
  const items = [
    { name: '护照', where: '主卧衣柜第二层的蓝色文件袋', who: '妈妈' },
    { name: '备用钥匙', where: '玄关鞋柜最上层的小铁盒', who: '爸爸' },
    { name: '充电宝', where: '书房抽屉，和数据线放在一起', who: '我' },
    { name: '冬天的被子', where: '次卧床底收纳箱', who: '妈妈' },
    { name: '医保卡', where: '客厅电视柜左侧抽屉', who: '爸爸' },
  ];
  const input = h('input', { placeholder: '问：钥匙在哪？', class: 'search' });
  const out = h('div', { class: 'f-out' });
  const ask = () => {
    const q = input.value.replace(/[在哪里？?呢放了]/g, '').trim();
    out.textContent = '';
    const hits = items.filter((i) => q && (i.name.includes(q) || q.includes(i.name)));
    if (!q) return;
    if (!hits.length) return out.append(h('p', { class: 'muted' }, `还没有关于「${q}」的记录，拍张照记一下吧。`));
    hits.forEach((i) => out.append(h('div', { class: 'f-card' }, h('b', {}, `📦 ${i.name}`), h('p', {}, i.where), h('span', { class: 'muted' }, `由 ${i.who} 记录`))));
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && ask());
  root.append(h('div', { class: 'row' }, input, h('button', { class: 'btn', onclick: ask }, '找一找')), h('div', { class: 'c-chips' }, items.map((i) => h('button', { class: 'chip', onclick: () => { input.value = i.name + '在哪？'; ask(); } }, i.name))), out);
  return () => {};
}

export const DEMOS = { dashboard, pipeline, chat, harness, quiz, tabs, bookmarks, finder };
