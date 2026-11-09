---
name: "jianying-draft"
description: "把 Creator Studio 的剧情画布按故事线导出为带转场、调色、字幕样式和片头片尾的剪映专业版草稿，剧情文字可写成字幕或留空交给剪映智能字幕。当用户要求「生成视频 / 导出剪映草稿 / 把画布剪成视频 / 用剪映剪辑剧情」时使用。"
---

# 剧情画布 → 剪映草稿

## 适用场景

- 用户已在本项目（`d:\interesting`，Creator Studio）的画布上用「剧情节点 + 视频素材节点 + 连线」梳理好故事线，想把它们变成可剪辑的视频工程。
- 用户说「生成剪映草稿」「按画布剪视频」「导出到剪映」等。

## 前置条件

- Python 3 可用，且已安装 `pyJianYingDraft`（`python -m pip install pyJianYingDraft`）。
- 剪映专业版已安装，草稿目录默认为 `%LOCALAPPDATA%\JianyingPro\User Data\Projects\com.lveditor.draft`。
- 画布上的视频节点必须来自媒体库（`media_files` 表），且文件真实存在。

## 执行步骤

1. 确认项目 id：查数据库 `data/creator-studio.db` 的 `projects` 表（`SELECT id, name FROM projects`），或让用户提供项目名。
2. 在项目根目录执行：

   ```powershell
   node server/jianying/cli.js <projectId>
   ```

   可选环境变量：`JIANYING_DRAFT_DIR` 覆盖草稿输出目录；`PYTHON` 指定 Python 可执行文件。
3. 成功时输出 JSON：

   ```json
   { "ok": true, "draftPath": "...", "segments": 2, "durationUs": 6000000, "skipped": [] }
   ```

   - `skipped` 表示画布上引用了但文件已丢失/未入库的素材。
4. 告知用户：打开剪映专业版 → 首页「草稿」列表里会有该草稿（名称格式 `项目名-时间戳`），点开可微调，右上角「导出」生成 mp4。

## 规则（与后端一致）

- **顺序**：沿连线从入度为 0 的节点出发深度优先遍历；孤立节点按画布坐标（先 x 后 y）补在后面。
- **字幕**：只有「字幕节点」（或集成节点里的字幕元素）会写入字幕，且可为每条字幕单独选择字体（默认抖音美好体）；剧情节点仅作创作说明，不参与导出。同一镜头多条字幕按时间均分。
- **转场/调色**：相邻片段间加「叠化」转场（0.5s），每个片段加「清透自然」滤镜（强度 60），可在 plan JSON 里改 `transition`/`filter`/`filterIntensity`。
- **片头片尾**：片头显示项目名（2s，渐显），片尾显示「完」（1.5s），放在独立文字轨，不与字幕冲突。
- **背景音乐**：设置项 `bgm_path` 指向 mp3/wav 时自动加音频轨（音量 0.25、淡入 1s、淡出 2s）。
- **画面**：草稿画布 1080×1920、30fps；片段按素材原始时长顺序排列，不做裁剪。
- 角色节点、热点节点不参与剪辑（仅作为剧情参考）。

## 限制

- 只生成**剪映草稿**，不自动导出 mp4；导出需在剪映里点「导出」。
- 不做语音识别字幕：需要语音字幕时，打开草稿后在剪映里「文本 → 智能字幕 → 识别字幕」。
- 素材时长依赖 `pymediainfo` 读取，mkv/webm 等格式可能被剪映拒绝，优先用 mp4/mov。
- 剪映专业版 8.x 与 pyJianYingDraft 的兼容性以实测为准；若剪映提示草稿损坏，可换 5.9 版本或改用项目内 `server/jianying/generate_draft.py` 调整格式。
