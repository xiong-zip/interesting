# 项目协作规则

本文件是本仓库的**规则来源**，优先级高于个人/全局的提交习惯（包括全局的 `git-commit` 技能）。
发生冲突时，以本文档为准。

## 一、分支策略

- **所有提交直接提交到 `main`，不额外开分支。**
- 不使用 `feature/xxx`、`姓名+日期`（如 `xiaoxiong1110`）这类临时分支。
- 提交前确认当前分支：

  ```bash
  git branch --show-current   # 必须是 main
  ```

- 如果当前不在 `main`，先切回来再提交：

  ```bash
  git checkout main
  ```

- 不执行 `git merge` / `git rebase` 往 main 上合别人的分支；这个仓库只有一条主线，保持线性历史。
- 禁止 `git push --force` 覆盖 `main`（除非用户明确要求回滚且已确认）。

## 二、提交信息规范

格式固定为：`<类型>(<作用域>): <描述>`，正文用分点列表。

```
feat(canvas): 镜头模块支持自带配乐

- 镜头节点新增配乐字段与音量
- 导出时连续镜头同曲合并为单条音轨
```

- 类型：`feat` / `fix` / `refactor` / `perf` / `docs` / `style` / `test` / `chore` / `build`
- 作用域：受影响的模块，如 `canvas` / `music` / `jianying` / `scripts`；无明确归属可省略
- 描述：一句话说清整体目的，结尾不加句号
- 正文：每条以动作动词开头（新增 / 修复 / 调整 / 移除…），按逻辑改动点分条，不逐行堆砌
- 一次改动一个提交；只有确实互不相关时才拆成多个提交

## 三、提交前检查

- 前端改动先跑通构建：`npx vite build`
- 后端改动先确认能启动：`node server/index.js`
- 不提交以下内容（已在 `.gitignore` 中，注意别用 `git add -f` 绕过）：
  - `data/`（SQLite 数据库与缩略图）
  - `music/`、`media/`（本地素材）
  - `dist/`、`node_modules/`、`.env`、日志文件
- 提交前看一眼 `git status`，确认没有把临时验证文件带进去

## 四、推送方式

- 本机 **`github.com:443` 不通**（git 协议被拦截），`git push` / `git fetch` 会直接超时失败。
- `api.github.com` 可访问，推送走 **GitHub REST API**：
  1. 从 Windows 凭据管理器取 token：`git credential fill`（`protocol=https` / `host=github.com`）
  2. `POST /repos/{owner}/{repo}/git/blobs` —— 逐个上传改动文件（base64）
  3. `POST /repos/{owner}/{repo}/git/trees` —— `base_tree` 用父提交的 tree，带上改动文件
  4. `POST /repos/{owner}/{repo}/git/commits` —— 指定 message/tree/parents
  5. `PATCH /repos/{owner}/{repo}/git/refs/heads/main` —— 更新远端 main
- 推送后校验：远端提交的 `tree` SHA 必须与本地 `git rev-parse HEAD^{tree}` 一致。
- 注意：API 生成的提交时间戳会被规范化为 UTC，**commit SHA 可能与本地不同，但 tree（内容）一致**。网络恢复后执行
  `git fetch origin && git reset --hard origin/main` 对齐 SHA 即可。
- 不要用 API 删除/重建 `main` 分支引用，只做更新。

## 五、数据与本地环境

- 数据库文件在 `data/creator-studio.db`，属于本地运行数据，不进版本库。
- 音频解码依赖 `ncmdump`、草稿导出依赖 `pyJianYingDraft` + `pymediainfo` + `uiautomation`，媒体探测依赖 `imageio-ffmpeg`。
  新环境需要先 `pip install` 这些包（README 有说明）。
- 导出草稿的目录由后台设置 `jianying_draft_dir` 决定，默认在 `%LOCALAPPDATA%\JianyingPro\...`，不要把草稿产物提交进仓库。

## 六、代码风格

- 前端：Vue 3 `<script setup>` + Element Plus，注释用中文，保持与周边代码一致的写法和命名
- 后端：Express 路由按模块拆分在 `server/routes/`，共享逻辑放 `server/`，剪映相关放 `server/jianying/`
- 新增依赖前先确认是否必要；改动涉及导出/预览时，同步检查 `build-plan.js`、`preview-plan`、`generate_draft.py` 三处是否一致
