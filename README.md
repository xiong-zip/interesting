# 🎬 Creator Studio · 个人自媒体创作平台

一个面向个人创作者的一站式工作台：**热点聚合 → 选题 → AI 脚本 → 剧情画布 → 剪映草稿 → 发布台账 → 数据回填**。

单机运行、无需登录、数据全部保存在本地 SQLite；面向 Windows + 剪映专业版的个人工作流。

## 功能

| 模块        | 说明                                                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🖥 工作台    | 项目/脚本/素材库存、近 30 天发布与播放数据条、今日热点速览与最近脚本双栏速览                                                                                               |
| 🔥 热点中心 | 聚合微博/知乎/抖音/头条/B站热榜，跨平台合并 + 热度/时效排序 + 一键生成脚本；AI 检索按拍摄条件（人手/地点/设备）筛选可拍热点，给出可行性、切入角度与分镜概要；按平台显示抓取状态，接口失败降级为模拟数据并明确提示 |
| 🗂 选题池    | 只沉淀「决定要做」的热点，记录首见时间/热度峰值，7 天未处理标过期，可关联多个脚本                                                                                          |
| 🎥 媒体库   | 扫描本地视频目录建索引，Range 在线预览、封面抽帧、分辨率/方向识别、标签备注、重复检测、使用统计、回收站，可挂到画布节点                                                    |
| 🎵 音乐库   | 扫描本地音乐，自动解码 `.ncm`，识别同名封面与 LRC 歌词，收藏/标签/转 MP3，可设为全局 BGM                                                                                   |
| 🕸 剧情画布  | 基于 Vue Flow 的无限画布：剧情/角色/镜头/集成/字幕/音乐节点；拖拽连线、2 秒防抖自动保存、**撤销/重做（Ctrl+Z / Ctrl+Shift+Z）**、一键整理、快捷键、全片字幕样式；角色节点参与 AI 脚本生成；导出前显示故事线顺序确认清单（含跳过素材与 BGM 冲突提示） |
| 🎞 草稿预览  | 页面内时间轴预览：入点/出点、变速、音量、滤镜、转场、画面位移、字幕与歌词轨，画面可直接拖动写回节点                                                                        |
| 📤 剪映导出 | 按故事线生成剪映专业版草稿：字幕、转场、滤镜、镜头配乐合并、全局 BGM、LRC 歌词字幕轨、横竖屏自适应；导出前校验滤镜/转场/字体名，名字不存在直接报错并给出候选，不再静默回退 |
| 🕘 版本历史 | 画布自动保存按内容去重，支持手动快照与恢复；恢复前自动留档；每天一份 SQLite 备份                                                                                           |
| 📝 脚本管理 | 手写 + AI 生成脚本统一管理，支持关联选题；各生成/编辑弹窗均支持 Markdown「预览/编辑」切换（分镜表按表格渲染）；保存 AI 脚本时分镜自动上画布 |
| 🚀 发布台账 | 抖音发布记录：链接、文案、话题、关联选题/脚本；支持单条快捷粘贴和表格批量回填播放/点赞/评论/分享/收藏/涨粉，Dashboard 汇总趋势（见 [docs/发布闭环.md](docs/发布闭环.md)）  |
| 🤖 AI 脚本  | 智谱 GLM 生成完整分镜脚本（默认 `glm-4-air`，免费档 `glm-4-flash` 易出雪景幻觉/主题跑题，实测 air 档无此问题，一条成本不到一分钱）；分镜表含时长/景别运镜/音效列，附口播完整版、字幕金句与拍摄剪辑建议；提示词内置真实性约束：画面真实可拍、符合拍摄地地理气候常识，无素材时不虚构素材名；未配置 Key 时返回带水印的模拟内容，不会假装成功 |
| ⚙️ 后台管理 | AI 服务商切换（智谱 GLM / DeepSeek，均为 OpenAI 兼容接口，Key/模型独立配置 + 连接测试）、媒体/素材/音乐目录、草稿字幕模式、全局 BGM；环境自检（Python/剪映依赖/ffmpeg/草稿目录/数据库）与立即备份 |

## 快速开始

```bash
npm install
python -m pip install pyJianYingDraft imageio-ffmpeg   # 剪映草稿导出 + 视频封面/分辨率
python -m pip install ncmdump                          # 可选：解码 .ncm 音乐
npm run dev        # 同时启动后端(3001)与前端(7200)
```

打开 http://localhost:7200 即可使用，无需登录。

前端按 `vite.config.js` 的 `server.host = true` 监听 `0.0.0.0`，同一局域网的手机/平板/其它电脑可用 `http://<本机IP>:7200` 打开（页面里的 `/api` 走 Vite 代理，不必单独开 3001）；启动脚本会把本机 IP 一起打印出来。

Windows 一键启动：双击根目录的 `start.bat`。它会检查 Node.js、首次自动安装依赖、启动前后端并打开浏览器；服务已经在运行时会直接打开页面，端口被旧进程占用时会提示占用 PID，避免旧后端造成的 404。只想检查环境可执行：

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 -Check
```

生产模式：

```bash
npm run build      # 构建前端到 dist/
npm start          # Express 托管 dist 并提供 API，单端口运行
```

## 配置

编辑 `.env`：

```ini
PORT=3001
GLM_API_KEY=          # https://open.bigmodel.cn 获取，也可在后台管理页配置
GLM_MODEL=glm-4-air  # 免费档 glm-4-flash 会偶发雪景幻觉/主题跑题，不建议
DEEPSEEK_API_KEY=     # 可选：platform.deepseek.com 获取；后台管理切到 DeepSeek 后生效
DEEPSEEK_MODEL=deepseek-flash
MEDIA_DIR=media       # 本地视频扫描目录
PYTHON=python         # 可选：指定 Python 解释器
FFMPEG_PATH=          # 可选：指定 ffmpeg，默认用 imageio-ffmpeg 自带的
```

媒体库、素材库、音乐库目录、剪映草稿目录、草稿字幕模式、全局 BGM 都可以在「后台管理」里改，不必改 `.env`。

## 使用流程

1. **蹭热点**：热点中心浏览各平台热榜 →「AI 检索」输入拍摄条件（如「一个人在厦门、只有手机，能拍哪些热点」）筛出可拍热点并查看拍摄方案 →「加入选题」或直接「生成脚本」
2. **梳理剧情**：剧情画布新建项目 → 添加剧情/角色节点 → 连线成故事线 → 「＋镜头」把本地视频挂到对应分镜
3. **AI 成稿**：画布「AI 生成脚本」把剧情笔记交给 GLM，产出含素材标注的分镜脚本
4. **预览与导出**：画布「▶ 预览」检查节奏、转场、字幕 → 「导出剪映草稿」→ 在剪映里微调并导出成片
5. **发布与复盘**：抖音手动发布 → 「发布台账」记录链接和文案 → 隔几天回填播放/互动数据 → 工作台看趋势

## 数据与备份

- 数据库：`data/creator-studio.db`（SQLite，WAL 模式）
- 每日备份：`data/backups/creator-studio-YYYYMMDD.db`，启动时补当天、之后每 6 小时检查，保留 14 天
- 删除项目前自动归档：`data/backups/projects/project-<id>-<时间>.json`（项目 + 脚本 + 历史版本 + 关联发布），保留 90 天
- 画布历史：`project_versions` 表，每个项目保留最近 100 个版本；自动保存按内容哈希去重，1 分钟内连续编辑合并为一条
- `data/`、`media/`、`music/`、`dist/`、`node_modules/`、`.env` 都不进版本库

## 开发与检查

```bash
npm run lint         # ESLint（Vue + Node）
npm run lint:fix
npm run format       # Prettier 格式化
npm test             # Vitest 单测（导出排序、热榜解析、分镜解析、歌词解析）
npx vite build       # 前端构建检查
```

提交前至少跑通 `npm run lint`、`npm test`、`npx vite build`；文档与代码在同一个提交里更新，规则见 [AGENTS.md](AGENTS.md)。

## 剪映导出与样式校验

- `generate_draft.py` 在写草稿**之前**校验滤镜/转场/字体名：本机 `pyJianYingDraft` 不认识的名字直接返回 `{code:"unknown_style"}`（退出码 2），不再生成一条样式被悄悄换掉的草稿
- `server/jianying/style-error.js` 把结构化错误翻成「滤镜『复古』…最接近：英伦复古、港风复古」这种可执行提示，前端直接弹出来
- 候选优先取本机库（能立刻用）；本机没有相近项时，才去读 `JY_SKILL_ROOT` 下 jianying-editor 技能素材库的 `data/filters.csv` / `transitions.csv`，提示「新版支持但本机依赖旧」。**没装该技能时自动跳过，不影响导出**
- 演示模式（`--demo`）用内置滤镜/转场轮换，不做这项校验

## 界面与样式

- 设计令牌都放在 `src/assets/global.css` 的 `:root`：品牌色 `--brand-*`（近黑，剪映式黑白极简）、中性色 `--ink-*`、圆角 `--r-*`、阴影 `--shadow-*`，改一处全站生效
- 卡片、表格、按钮、输入框、弹窗、标签等 Element Plus 组件的外观统一在该文件里覆盖，页面内只写布局与局部样式
- 侧边栏 + 内容区骨架在 `src/layouts/MainLayout.vue`（`el-main` 不留内边距，页面自己用 `.page` 控制留白）
- 保持浅色主题、近黑主色（`--el-color-primary: #16171a`，黑白高对比）；新增页面优先引用变量，不要写死颜色值
- 表格「操作」列统一用文本按钮（`el-button link`）：主操作用 `type="primary"`，删除用 `type="danger"`，其余用默认色，不要再套 `size="small" plain`
- 站点图标源文件是 `src/assets/logo.svg`（近黑圆角方块 + 白色方头 X，剪映式黑白标），侧栏品牌标通过 `import logoUrl from '../assets/logo.svg'` 引用、`index.html` 的 favicon 也指向它，两者同一份；**不要放回 `public/` 再写绝对路径**——那种写法 Vite 不会跟踪文件变化，换图后页面仍是旧的（曾踩过一次）
- 换图标：改 SVG → 按 32 / 180 / 192 / 512 重新导出 `public/` 下的 PNG（`favicon-32.png`、`apple-touch-icon.png`、`icon-192/512.png`）

## 项目结构

```
start.bat              Windows 一键启动入口（双击运行）
public/
  favicon-32.png       PNG 回退与小尺寸图标
  icon-192/512.png     PWA 图标，apple-touch-icon 供 iOS 添加桌面
  site.webmanifest     图标与主题色声明
scripts/
  start.ps1            启动逻辑：依赖检查、端口检测、局域网地址提示、自动打开浏览器
server/
  index.js              Express 入口、设置读写、静态托管
  db.js                 SQLite 初始化与老库补列/数据修复
  versions.js           画布版本快照
  backup.js             每日备份与项目归档
  runtime.js            Python/ffmpeg 路径解析与依赖探测
  ai-config.js          AI 服务商配置解析（智谱 GLM / DeepSeek，OpenAI 兼容）
  hot-match.js          热点 AI 检索的 prompt 构造与结果校验（纯函数）
  routes/               hot / media / music / projects / scripts / topics / ai / publish / health
  jianying/             build-plan、generate_draft.py、样式校验（style-error.js）、LRC 解析
  probe.js thumb.js     视频分辨率与封面抽帧
src/
  assets/global.css     设计令牌与 Element Plus 组件样式覆盖
  assets/logo.svg       站点图标源文件（favicon 与侧栏品牌标共用）
  layouts/MainLayout.vue 侧边栏 + 内容区骨架
  views/                Dashboard / Hot / Topics / Media / Music / Canvas / Scripts / Publish / Admin
  utils/platforms.js    平台 key → 名称/颜色（选题池等页面补平台标签）
  components/canvas/    画布节点与时间轴预览
docs/
  升级计划.md            后续规划（含 Whisper 自动字幕）
  发布闭环.md            抖音发布/数据回填方案
```

## 技术栈

- 前端：Vue 3 + Vite + Element Plus + Vue Router + Vue Flow + markdown-it（AI 脚本 Markdown 预览）
- 后端：Node.js（18+）+ Express + better-sqlite3（零配置 SQLite）
- 桌面能力：Python（pyJianYingDraft / imageio-ffmpeg / ncmdump）

后续升级项见 [docs/升级计划.md](docs/升级计划.md)。
