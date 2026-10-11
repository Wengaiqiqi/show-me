// 展品清单：每个公开仓库一幅画。
// 字段说明：
//   video    宣传片地址。放在 assets/video/ 下的 mp4 会像电视一样在画框上一直循环播放；GitHub 附件地址只能在弹窗里播放
//   demoUrl  已部署的在线地址；填上后项目介绍里会出现「在线体验」按钮
//   cover    画框上的画面；不填时自动生成一幅抽象画
//   shots    项目介绍里轮播的截图
const GH = 'https://github.com/Wengaiqiqi/';
const ATT = 'https://github.com/user-attachments/assets/';

export const OWNER = { name: 'Wengaiqiqi', github: 'https://github.com/Wengaiqiqi' };

export const PROJECTS = [
  {
    id: 'Industrial-Digital-Intelligence-Platform',
    title: '工业数智平台',
    subtitle: 'Industrial Digital Intelligence Platform',
    desc: '面向工业生产现场的综合管控与可视化平台：设备实时监控、报警管理、历史数据分析、机器学习预测、Three.js 3D 场景、MQTT 通信与 Modbus TCP 仿真。',
    tech: ['Vue 3', 'Three.js', 'ECharts', 'Flask', 'MQTT', 'Modbus TCP', 'scikit-learn', 'LSTM'],
    features: ['实时设备监控与智能报警', '历史数据查询与导出', '异常检测与预测性维护', '3D 工业场景可视化', '内置 MQTT Broker 与 PLC 仿真'],
    palette: ['#1d4ed8', '#38bdf8', '#e2e8f0', '#0f172a'],
    cover: 'assets/img/industrial.jpg',
    shots: ['assets/img/industrial.jpg'],
    demoUrl: '',
    video: '',
  },
  {
    id: 'EduCipher',
    title: '课析',
    subtitle: 'EduCipher',
    desc: '课堂视频 PPT 识别、语音转写与讲授内容关联度分析桌面应用。从课堂录像识别 PPT 页面与时间，按页整理讲话文字，再用多模态大模型评估讲话与 PPT 的关联程度。',
    tech: ['Python', 'FFmpeg', 'faster-whisper', '多模态 LLM', 'Windows 桌面端'],
    features: ['自动识别 PPT 页面与起止时间', '本地或云端语音识别', '按页归类讲话文字', '多模态大模型逐页评分', '多任务流水线并行处理'],
    palette: ['#7c3aed', '#f472b6', '#fde68a', '#1e1b4b'],
    demoUrl: '',
    video: 'assets/video/kexi.mp4',
  },
  {
    id: 'MyNotebookLM',
    title: 'MyNotebookLM',
    subtitle: '本地优先的研究助手',
    desc: '类似 NotebookLM 的 Windows 桌面研究助手：导入文档与网页，基于来源做带引用的问答，并生成笔记、测验、思维导图和播客。',
    tech: ['Electron', 'React', 'TypeScript', 'SQLite', 'LanceDB', 'Playwright'],
    features: ['多格式来源导入（PDF / Word / PPT / 网页）', '向量 + 全文混合检索', '带 [S1] 引用的问答', '笔记、测验、思维导图、播客', '多家模型提供方'],
    palette: ['#0f766e', '#5eead4', '#fef3c7', '#042f2e'],
    cover: 'assets/img/nb-project-list.jpg',
    shots: ['assets/img/nb-project-list.jpg', 'assets/img/nb-first-launch.jpg', 'assets/img/nb-index.jpg', 'assets/img/nb-notes.jpg'],
    demoUrl: '',
    video: 'assets/video/mynotebooklm.mp4',
  },
  {
    id: 'OpenHarness',
    title: 'OpenHarness',
    subtitle: '桌面 Agent Harness 统一集成',
    desc: '把散落在本机的各类桌面 AI Agent（Claude Code、Codex、Cursor、Windsurf、Trae 等）聚合到一个入口统一管理：MCP 中心、Skills 中心、模型服务与统一对话。',
    tech: ['Electron', 'TypeScript', 'node-pty', 'SSE', 'MCP'],
    features: ['自动检测本机 Harness', 'MCP Server 批量注入', 'Skill 扫描、导入与同步', '统一 LLM Provider 配置', '多模型流式对话'],
    palette: ['#ea580c', '#facc15', '#fff7ed', '#1c1917'],
    demoUrl: '',
    video: 'assets/video/openharness.mp4',
  },
  {
    id: 'Practice-Grind',
    title: 'W&W 刷题',
    subtitle: 'Practice Grind',
    desc: '多用户题库应用：导入 PDF / DOCX 由大模型生成题目草稿，刷题练习（单选、多选、判断、填空、简答），错题本，浏览并 Fork 公开题库。',
    tech: ['React', 'TypeScript', 'Vite', 'FastAPI', 'SQLAlchemy', 'Celery'],
    features: ['文档导入自动出题', '五种题型练习', '错题本', '公开题库与 Fork', '个人模型服务商配置'],
    palette: ['#16a34a', '#a3e635', '#f0fdf4', '#052e16'],
    demoUrl: '',
    video: 'assets/video/practice-grind.mp4',
  },
  {
    id: 'Tab_Scroller',
    title: 'Tab Scroller',
    subtitle: '滚轮切换标签页',
    desc: '轻量 Chrome 扩展：按住修饰键滚动鼠标滚轮即可快速切换标签页，支持键盘快捷键、快速关闭/新建与循环切换。',
    tech: ['Chrome Extension', 'Manifest V3', 'JavaScript'],
    features: ['修饰键 + 滚轮切换标签页', '自定义键盘快捷键', '修饰键 + 单击关闭标签页', '循环切换', '设置跨设备同步'],
    palette: ['#2563eb', '#f43f5e', '#f8fafc', '#111827'],
    demoUrl: '',
    video: '',
  },
  {
    id: 'W-W_Agent',
    title: 'W&W Agent',
    subtitle: '多智能体 AI 助手',
    desc: '跑在你电脑上的多智能体 AI 助手：读写文件、执行命令、上网搜索、看图、接入飞书 / QQ 当机器人，支持 HMAC 签名的远程 Agent 协作。',
    tech: ['Python', 'FastAPI', 'MCP', 'A2A', 'SSE'],
    features: ['中心编排器 + 专家子 Agent', '13 个内置工具', '三级权限控制', 'SKILL.md 技能系统', '飞书 / QQ 机器人桥接'],
    palette: ['#be123c', '#fb923c', '#ffe4e6', '#1f0a12'],
    demoUrl: '',
    video: 'assets/video/ww-agent.mp4',
  },
  {
    id: 'lianyu-pro',
    title: '链域 Lianyu Pro',
    subtitle: '书签管理与网址导航',
    desc: '基于 Vue 3 + Flask 的书签管理与网址导航系统：个人收藏、公开网址广场、热门排行、全局搜索、AI 兴趣分析与管理后台。',
    tech: ['Vue 3', 'Element Plus', 'ECharts', 'Flask', 'JWT', 'Nginx'],
    features: ['书签分类与访问统计', '公开网址广场', '日 / 周 / 月热门榜单', 'AI 兴趣分析与推荐', '管理后台与内容审核'],
    palette: ['#0284c7', '#22d3ee', '#f0f9ff', '#082f49'],
    cover: 'assets/img/lianyu.jpg',
    shots: ['assets/img/lianyu.jpg', 'assets/img/lianyu-2.jpg'],
    demoUrl: '',
    video: 'assets/video/lianyu-pro.mp4',
  },
  {
    id: 'Household-Item-Finder',
    title: '家庭记忆',
    subtitle: 'Household Item Finder',
    desc: '记录与检索家庭物品位置的微信小程序。拍照记下东西放在哪，之后通过搜索或 AI 问答快速找回，支持家庭空间共享。',
    tech: ['微信小程序', '微信云开发', 'TypeScript', 'Vitest', '视觉大模型'],
    features: ['拍照记录物品位置', '“某个东西在哪”搜索', 'AI 图片识别', '家庭空间与邀请码', '本地 mock 模式'],
    palette: ['#ca8a04', '#fb7185', '#fefce8', '#291a05'],
    demoUrl: '',
    video: '',
  },
].map((p) => ({ ...p, repo: GH + p.id }));

// 音乐作品集展厅：第一首挂在大银幕上，侧墙还有两个位置留给以后的作品
export const MUSIC = [
  {
    id: 'next-token',
    music: true,
    title: '下一个 Token',
    subtitle: '音乐 MV · 3 分 26 秒',
    desc: '一首写给大模型的歌：从加载权重、向量空间里的星团，到「幻觉」与一个字一个字吐出的句子，用赛博风的画面唱出「预测下一个 token」的过程。',
    palette: ['#a21caf', '#22d3ee', '#f5d0fe', '#0b0614'],
    cover: 'assets/img/next-token.jpg',
    shots: ['assets/img/next-token.jpg', 'assets/img/next-token-2.jpg', 'assets/img/next-token-3.jpg'],
    video: 'assets/video/next-token.mp4',
  },
];
