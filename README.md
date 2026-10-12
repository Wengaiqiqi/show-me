# show-me · Wengaiqiqi 作品馆

一座可以在浏览器里走进去的 3D 艺术馆，墙上的每幅画都是我的一个公开 GitHub 项目。

- **WASD** 行走，**Shift** 快走，鼠标转视角；手机上左下摇杆行走、右侧滑动转头
- 有宣传片的作品像挂在墙上的电视，一直循环播放；同一时间只有离你最近（6 米内）的那台出声，走近变大、走开淡出，不会串音。走近按 **R** 从头重播
- 手机上墙面电视播 720p 版（`assets/video/720/`，手机屏幕显示不出 1080p 的细节），同一时间只播眼前一台；点开弹窗看的仍是 1080p 原片
- 网速慢时视频排队下载：离你最近、正对着的那台先下先播，下完了下一台才开始；网速跟不上码率时先攒够缓冲再开播，画质不降、播放不卡
- 走近一幅画按 **E**（或单击 / 点按提示）打开项目介绍，弹窗里按 **Tab** 可以切到「🎬 宣传片」
- **M** 打开展品目录，一键传送到任意作品前

## 技术选择

- **Three.js（WebGL）**，纯静态网页，无需构建，打开即玩。Three.js 已放在 `vendor/` 里，不依赖外部 CDN，国内访问也稳定。
- 没有用虚幻 5：UE5 已不再支持导出 HTML5，网页上要跑 UE5 只能走像素流送（Pixel Streaming），每位访客都要占用一台云端 GPU 服务器，成本高、并发低，不适合公开分享的作品集链接。
- 展馆用 **Blender** 建模并烘焙光照（`blender/build_gallery.py`），导出成 `assets/gallery.glb` + 两张光照贴图，网页里只做实时的画框、射灯和雕塑。

## 展馆布局

参考了 MECCHA CHAMELEON 创意工坊地图「ART GALLERY」那种古典美术馆的感觉（只参考风格，模型和贴图都是自己生成的）：

- **大堂**：黑白大理石地面、红地毯、藻井天花、吊灯、前台、入口上方的监控摄像头
- **中庭**：11 米挑高，玻璃天窗把阳光洒在罗盘拼花地面上；12 根柱子围成柱廊，中间是围着红绒绳的展台
- **西展厅**（酒红锦缎墙）/ **东展厅**（墨绿墙）：人字拼木地板、护墙板、柔光灯箱顶
- **长廊**：横梁天花与长条灯箱，尽头是标题墙
- **音乐作品集**：大堂左手边的小放映厅，深蓝墙面、木格栅顶，尽头的大银幕循环播放音乐 MV，坐在长椅上就能听到

作品挂画的顺序：长廊 4 幅 → 西展厅 3 幅 → 东展厅 3 幅；作品不够时空画位挂「敬请期待」，超过 10 件时启用中庭的 4 个备用画位。

## 用 Blender 修改展馆

展馆完全由 [`blender/build_gallery.py`](blender/build_gallery.py) 用代码生成，房间尺寸、门洞、材质颜色、灯光、画位都在这个文件里。

- **在 Blender 里看 / 改**：打开 Blender（4.2 及以上），在 Scripting 面板打开这个文件点运行，会新建一个「作品馆」场景（不会动你当前的文件）。界面里运行默认不烘焙、不导出。
- **重新生成网站用的文件**：
  ```bash
  blender -b -P blender/build_gallery.py      # 或者 pip install bpy 之后：python blender/build_gallery.py
  ```
  会写出 `assets/gallery.glb`、`assets/gallery-light.jpg`、`assets/gallery-light-detail.jpg` 和 `assets/gallery.json`（画位、碰撞区域、出生点）。默认 2048 光照贴图 × 256 采样，4 核 CPU 大约半小时；调试时可以 `LM_SIZE=1024 SAMPLES=64` 先看效果。

## 添加 / 修改作品

所有作品信息都在 [`js/projects.js`](js/projects.js)（音乐作品在同一个文件的 `MUSIC` 列表里，第一首上大银幕，侧墙还有两个空位）：

| 字段 | 作用 |
| --- | --- |
| `video` | 宣传片。放在 `assets/video/` 下的 mp4 会在画框上一直循环播放；GitHub 附件链接只在弹窗里播放 |
| `demoUrl` | 已部署的在线地址。填上后项目介绍里会出现「在线体验」按钮 |
| `cover` / `shots` | 画框画面，以及没有宣传片时「宣传片」页里的截图轮播；不填 `cover` 时自动生成一幅抽象画 |

## 部署

仓库自带 GitHub Pages 工作流（`.github/workflows/pages.yml`），推送到 `main` 后自动发布到
`https://wengaiqiqi.github.io/show-me/`。首次使用需要在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

## 素材来源

- 截图与宣传片均来自各项目仓库本身。
- [Three.js](https://threejs.org) r160，MIT 许可证（见 `vendor/three/LICENSE`）。
