# 🎬 Creator Studio · 个人自媒体创作平台

一个面向个人创作者的一站式工作台：**热点聚合 → 选题 → AI 脚本 → 剧情画布 → 剪映草稿 → 发布台账 → 数据回填**。

单机运行、无需登录、数据全部保存在本地 SQLite；面向 Windows + 剪映专业版的个人工作流。

## 功能

| 模块        | 说明                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🖥 工作台    | 项目/脚本/素材统计、今日热点速览、近 30 天发布与播放概览                                                                                                                  |
| 🔥 热点中心 | 聚合微博/知乎/抖音/头条/B站热榜，跨平台合并 + 热度/时效排序 + 一键生成脚本；按平台显示抓取状态，接口失败降级为模拟数据并明确提示                                          |
| 🗂 选题池    | 只沉淀「决定要做」的热点，记录首见时间/热度峰值，7 天未处理标过期，可关联多个脚本                                                                                         |
| 🎥 媒体库   | 扫描本地视频目录建索引，Range 在线预览、封面抽帧、分辨率/方向识别、标签备注、重复检测、使用统计、回收站，可挂到画布节点                                                   |
| 🎵 音乐库   | 扫描本地音乐，自动解码 `.ncm`，识别同名封面与 LRC 歌词，收藏/标签/转 MP3，可设为全局 BGM                                                                                  |
| 🕸 剧情画布  | 基于 Vue Flow 的无限画布：剧情/角色/镜头/集成/字幕/音乐/热点节点；拖拽连线、2 秒防抖自动保存、一键整理、快捷键、全片字幕样式                                              |
| 🎞 草稿预览  | 页面内时间轴预览：入点/出点、变速、音量、滤镜、转场、画面位移、字幕与歌词轨，画面可直接拖动写回节点                                                                       |
| 📤 剪映导出 | 按故事线生成剪映专业版草稿：字幕、转场、滤镜、镜头配乐合并、全局 BGM、LRC 歌词字幕轨、横竖屏自适应；未知滤镜/转场会提示回退项                                             |
| 🕘 版本历史 | 画布自动保存按内容去重，支持手动快照与恢复；恢复前自动留档；每天一份 SQLite 备份                                                                                          |
| 📝 脚本管理 | 手写 + AI 生成脚本统一管理，支持关联选题；保存 AI 脚本时分镜自动上画布                                                                                                    |
| 🚀 发布台账 | 抖音发布记录：链接、文案、话题、关联选题/脚本；支持单条快捷粘贴和表格批量回填播放/点赞/评论/分享/收藏/涨粉，Dashboard 汇总趋势（见 [docs/发布闭环.md](docs/发布闭环.md)） |
| 🤖 AI 脚本  | 智谱 GLM（glm-4-flash 等）生成分镜脚本；未配置 Key 时返回带水印的模拟内容，不会假装成功                                                                                   |
| ⚙️ 后台管理 | GLM Key/模型、媒体/素材/音乐目录、草稿字幕模式、全局 BGM；环境自检（Python/剪映依赖/ffmpeg/草稿目录/数据库）与立即备份                                                    |

## 快速开始

```bash
npm install
python -m pip install pyJianYingDraft imageio-ffmpeg   # 剪映草稿导出 + 视频封面/分辨率
python -m pip install ncmdump                          # 可选：解码 .ncm 音乐
npm run dev        # 同时启动后端(3001)与前端(7200)
```

打开 http://localhost:7200 即可使用，无需登录。

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
GLM_MODEL=glm-4-flash
MEDIA_DIR=media       # 本地视频扫描目录
PYTHON=python         # 可选：指定 Python 解释器
FFMPEG_PATH=          # 可选：指定 ffmpeg，默认用 imageio-ffmpeg 自带的
```

媒体库、素材库、音乐库目录、剪映草稿目录、草稿字幕模式、全局 BGM 都可以在「后台管理」里改，不必改 `.env`。

## 使用流程

1. **蹭热点**：热点中心浏览各平台热榜 → 「加入选题」或直接「生成脚本」
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

## 项目结构

```
server/
  index.js              Express 入口、设置读写、静态托管
  db.js                 SQLite 初始化与老库补列/数据修复
  versions.js           画布版本快照
  backup.js             每日备份与项目归档
  runtime.js            Python/ffmpeg 路径解析与依赖探测
  routes/               hot / media / music / projects / scripts / topics / ai / publish / health
  jianying/             build-plan、generate_draft.py、LRC 解析
  probe.js thumb.js     视频分辨率与封面抽帧
src/
  views/                Dashboard / Hot / Topics / Media / Music / Canvas / Scripts / Publish / Admin
  components/canvas/    画布节点与时间轴预览
docs/
  升级计划.md            后续规划（含 Whisper 自动字幕）
  发布闭环.md            抖音发布/数据回填方案
```

## 技术栈

- 前端：Vue 3 + Vite + Element Plus + Vue Router + Vue Flow
- 后端：Node.js（18+）+ Express + better-sqlite3（零配置 SQLite）
- 桌面能力：Python（pyJianYingDraft / imageio-ffmpeg / ncmdump）

后续升级项见 [docs/升级计划.md](docs/升级计划.md)。
