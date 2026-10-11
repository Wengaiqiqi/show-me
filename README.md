# show-me · Wengaiqiqi 作品馆

一座可以在浏览器里走进去的 3D 艺术馆，墙上的每幅画都是我的一个公开 GitHub 项目。

- **WASD** 行走，**Shift** 快走，鼠标转视角；手机上左下摇杆行走、右侧滑动转头
- 走近一幅画按 **E**（或单击 / 点按提示）打开作品
- 作品弹窗里按 **Tab**（或点按钮）在「🎬 宣传片」和「🎮 实机」之间切换
- **M** 打开展品目录，一键传送到任意作品前

## 技术选择

- **Three.js（WebGL）**，纯静态网页，无需构建，打开即玩。Three.js 已放在 `vendor/` 里，不依赖外部 CDN，国内访问也稳定。
- 没有用虚幻 5：UE5 已不再支持导出 HTML5，网页上要跑 UE5 只能走像素流送（Pixel Streaming），每位访客都要占用一台云端 GPU 服务器，成本高、并发低，不适合公开分享的作品集链接。
- 展馆目前由代码程序生成（墙、木地板、天窗灯带、射灯、长椅、雕塑）。

## 换成自己用 Blender 做的展馆

1. 在 Blender 里建好展馆，导出为 `glTF Binary (.glb)`，保存为 `assets/gallery.glb`。
2. 刷新页面即可：检测到这个文件时会隐藏程序生成的墙和地面，改用你的模型。
3. 画框位置在 `js/main.js` 的 `slotFor()` 里，按你的模型调整坐标即可。

## 添加 / 修改作品

所有作品信息都在 [`js/projects.js`](js/projects.js)：

| 字段 | 作用 |
| --- | --- |
| `video` | 宣传片。放在 `assets/video/` 下的 mp4 会在画框上直接播放；GitHub 附件链接只在弹窗里播放 |
| `demoUrl` | 已部署的在线地址。填上后「实机」模式会直接嵌入真实应用 |
| `demo` | 没有在线地址时使用的内置互动演示（`js/demos.js`） |
| `cover` / `shots` | 画框画面与截图轮播；不填 `cover` 时自动生成一幅抽象画 |

## 部署

仓库自带 GitHub Pages 工作流（`.github/workflows/pages.yml`），推送到 `main` 后自动发布到
`https://wengaiqiqi.github.io/show-me/`。首次使用需要在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

## 素材来源

- 截图与宣传片均来自各项目仓库本身。
- [Three.js](https://threejs.org) r160，MIT 许可证（见 `vendor/three/LICENSE`）。
