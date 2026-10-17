# 开源发布指南

本文件是**给你自己看的**操作手册（不是给用户看的），发布完成后可以删掉或留在仓库里。

插件本体就在**当前目录**（即本文件所在目录），
它已经是一个**自足的可发布包**：零依赖、零构建、文档齐全、测试全绿。

---

## 0. 发布前已经准备好的东西

| 文件 | 作用 |
|---|---|
| `README.md` | 中文主文档：徽章 + 真实渲染配图 + 快速开始 + 特性 + 文档索引 |
| `README.en.md` | 英文版（同一套内容） |
| `docs/SPEC.md` | 逐帧测量规格与复刻保真度对照 |
| `docs/ARCHITECTURE.md` | 架构说明（席位接管 / 状态机 / 几何 / 色彩 / 粒子 / 测试台） |
| `docs/INCIDENTS.md` | 11 条缺陷复盘（现象 → 根因 → 修法 → 断言） |
| `docs/images/*.png` | 4 张由**真实 CSS** 渲染的配图 + 2 张原版对照图 |
| `docs/prototype.html` | 可独立打开的原型（拖滑条、切主题） |
| `CHANGELOG.md` | 逐版改动（Keep a Changelog 格式） |
| `LICENSE` | MIT |
| `.gitignore` | 忽略生成物、编辑器噪音 |
| `.github/workflows/ci.yml` | GitHub Actions：5 个测试文件全跑（Node 20/22） |
| `package.json` | 已填 `repository` / `homepage` / `bugs` / `keywords` |

**测试现状**：`75` 项断言全绿（verify 33 · palette 10 · collapse 6 · slots 4 · encoding 22）。

---

## 1. 准备仓库

`git` 已装好，`gh`（GitHub CLI）**没装**。两条路任选。

### 1.1 先设一次 git 身份（只需一次）

```powershell
git config --global user.name  "ABING1111"
git config --global user.email "你的邮箱@example.com"
```

### 1.2 在 GitHub 网页上建空仓库

打开 <https://github.com/new>：

- **Repository name**：`dsh-codex-model-effort-selector`
- **Description**：`Codex desktop style model + reasoning-effort selector for DeepSeek Harness`
- 可见性：**Public**
- **不要**勾 Add a README / .gitignore / license —— 我们本地已经有了，勾了会冲突

> 仓库名要和 `package.json` 里的 `name` 一致（已经是 `dsh-codex-model-effort-selector`）。
> README 里的徽章链接、clone 命令、CHANGELOG 里的 compare 链接都按
> `github.com/ABING1111/dsh-codex-model-effort-selector` 写好了 —— 如果你用了别的仓库名，
> 记得全文替换。

---

## 2. 只把插件目录变成仓库（推荐）

工作区根目录 `C:\codex\推理滑块\` 里有大量**复刻过程的一次性脚本**（`measure*.py`、`refs/`、
`prototype/`、`analysis/*.png`）。这些**不要**进仓库 —— 它们不是插件的一部分，只会让仓库变乱。
**把 `plugin/dsh-codex-model-effort-selector/` 这一个目录作为仓库根**（本文件所在目录）。

```powershell
cd "C:\codex\推理滑块\plugin\dsh-codex-model-effort-selector"

git init -b main
git add .
git status                      # 先看一眼：不该出现 node_modules / dist / docs/images/*.html
git commit -m "feat: initial public release of dsh-codex-model-effort-selector"

git remote add origin https://github.com/ABING1111/dsh-codex-model-effort-selector.git
git push -u origin main
```

推送时会弹一次浏览器/凭据窗口让你登录 GitHub（或用 Personal Access Token 当密码）。

### 推之前自查

```powershell
# 确认 .gitignore 生效，没有生成物混进来
git status --short

# 确认没有把整个工作区（含 refs/、measure*.py）提交进来
git ls-files | Measure-Object          # 应该只有几十个文件
git ls-files | Select-String "\.py$"  # 应该没有任何输出
```

如果 `git ls-files` 里出现了 `refs/`、`*.py`、`prototype/`，说明你在**工作区根目录**执行了
`git init`。删掉 `.git` 重来：

```powershell
Remove-Item -Recurse -Force .git      # 确认当前目录确实是工作区根目录再执行
```

---

## 3. 让 README 配图正确显示

README 里的图是**相对路径**（`docs/images/hero.png`），所以只要 `docs/images/` 跟着一起提交，
GitHub 上就能直接显示，不需要图床。

配图是**提交进仓库的**；生成它们的中间 HTML 已被 `.gitignore` 忽略。

需要重新生成配图（改了 `client.js` 的 CSS 之后）：

```powershell
node test/make-readme-shots.mjs       # 需要本机有 Edge 或 Chrome
```

---

## 4. 打 Release

在 GitHub 仓库页面 → **Releases → Draft a new release**：

- **Choose a tag**：填 `v1.0.0` → *Create new tag on publish*
- **Title**：`v1.0.0`
- **Description**：直接抄 `CHANGELOG.md` 里 `## [1.0.0]` 那一段
- 附件：可选。因为本插件**零构建**，源码包就是可安装包 —— 可以不上传附件，
  用户 clone 或下载 ZIP 就能装

> `CHANGELOG.md` 末尾的 compare 链接指向
> `github.com/ABING1111/dsh-codex-model-effort-selector`，如果换了仓库名记得改。

---

## 5. 发布到 npm（可选）

现在 `package.json` 里是 `"private": true`，**故意**如此。想发 npm 才删掉这一行：

```powershell
cd "C:\codex\推理滑块\plugin\dsh-codex-model-effort-selector"
# 删掉 package.json 里的 "private": true
npm login
npm publish --access public
```

`files` 字段已经限定只发布：`index.js`、`client.js`、`cordis.patch.yml`、`icon.svg`、
`locale/`、`README.md`、`LICENSE` —— `test/` 与 `docs/` 不会进包（这没关系，源码在 GitHub 上）。

---

## 6. 发布后的自查清单

按顺序在浏览器里点一遍：

- [ ] 仓库首页：徽章显示正常，**hero 图正常显示**，中英文互链能跳
- [ ] `docs/SPEC.md` / `docs/ARCHITECTURE.md` / `docs/INCIDENTS.md` 里的图片与互链都打得开
- [ ] **Actions 标签页**：CI 跑绿（第一次 push 后自动触发）
- [ ] 在**干净的临时目录** clone 一份，确认 `node test/verify.mjs` 能跑（验证没有依赖本地文件）
- [ ] 在 DSH Desktop 里用插件面板装一遍 clone 下来的目录，确认功能正常
- [ ] Release 页面 tag 正确、说明完整

### 特别值得跑的一条

```powershell
# 换个目录 clone 出来，验证包是自足的
git clone https://github.com/ABING1111/dsh-codex-model-effort-selector.git $env:TEMP\dsh-verify
cd $env:TEMP\dsh-verify
node test/verify.mjs
node test/encoding.mjs
```

---

## 7. 后续维护

- 改了 `client.js`：记得 `node test/verify.mjs`，必要时重跑 `make-readme-shots.mjs` 更新配图
- 发新版：更新 `CHANGELOG.md` → 打新 tag → 同步 `package.json` 的 `version`
- 收到 issue：`docs/INCIDENTS.md` 是排查界面问题的第一站，README 的「常见问题」里也已覆盖最常见的几种

---

## 8. 建议加的仓库设置

| 设置 | 位置 | 为什么 |
|---|---|---|
| **Topics** | 仓库首页右上 ⚙ | 填 `dsh`、`deepseek-harness`、`codex`、`plugin` —— 方便被搜到 |
| **Issues** | Settings → Features | 建议开启（README 的 FAQ 引导用户去提 issue） |
| **Discussions** | Settings → Features | 可选，问答类内容放这里 |
| **Social preview** | Settings → General | 传一张 `docs/images/hero.png`，分享链接时好看 |
