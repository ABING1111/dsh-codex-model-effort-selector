# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.0.0] — 2026-02-14

首个公开发布版本。

### 新增

- **推理强度面板**：逐像素复刻的 Codex 推理滑条
  - 七档等距（`关闭 → 极低 → 轻度 → 中 → 高 → 极高 → Ultra`），按模型实际公布的档位重排
  - 每档一色：填充 / 轨道底色 / 标题文字 / 收起态按钮同步换色，色相从 `216.6°` 单调推进到 `263.9°`
  - 拖动连续跟手、松手吸附；`←/→`、`↑/↓`、`Home`/`End` 键盘操作
  - Ultra 档：紫罗兰流动渐变 + 22 颗确定性星尘粒子 + 「更快消耗使用额度」警示
  - Fast 视觉开关与「重置为默认」按钮
- **模型面板**：按 provider 分组的两级下钻列表（provider → 模型 + 搜索）
  - 当前模型所在 provider 行右侧带蓝色小圆点
  - 模型行带「N 档」徽标；不支持推理的模型灰化显示「不支持」
  - 搜索支持不连续字符按序匹配；`Escape` 逐层退避
  - 换模型落在中间档 `floor(n/2)`；无档位模型不发 `reasoningEffort` 键
- **席位接管**：以 `priority: -1` 遮蔽官方 `conversation.input.model`（`kind: 'single'`），
  卸载后官方席位自动恢复、无残留
- **fail-open**：不注册宿主钩子、不发事件；任何一步认不出就什么都不做
- **无障碍**：`role="slider"` + aria 属性、`inert` 收起态、每档均过 WCAG 对比度下限
- **测试台**：68 项离线断言
  - `test/verify.mjs`（33）—— 真正执行 `client.js` 并断言注册契约
  - `test/palette.mjs`（10）—— 从源码读出真实色值再算对比度
  - `test/collapse-regression.mjs`（6）—— 同时实现有 bug 与修好后的状态机
  - `test/slots-integration.mjs`（4）—— 从 `app.asar` 解包真实 SlotCore 端到端验证
  - `test/encoding.mjs`（15）—— 所有文本文件必须是无 BOM 的干净 UTF-8
- **文档**：`docs/SPEC.md`（逐帧测量规格）、`docs/ARCHITECTURE.md`、`docs/INCIDENTS.md`
- **截图生成器** `test/make-readme-shots.mjs`：从 `client.js` 抽取真实 CSS 渲染 README 配图

### 修复

首版发布前已修复的缺陷（完整因果链见 [`docs/INCIDENTS.md`](docs/INCIDENTS.md)）：

| # | 现象 | 根因 |
|---|---|---|
| 1 | 点一个分组，全部一起展开 | 同一个 `Set` 被写入侧与读取侧当成两种相反含义 |
| 2 | 从模型列表关闭后再打开推理条，界面「从上面收回」 | `close()` 没有重置 `pane`，弹层高度从列表高度动画回 104px |
| 3 | 只有 Ultra 有特殊颜色 | 填充/标题是写死的单色 |
| 4 | ⚡ 的说明浮层被遮挡 | 浮层是弹层子元素，被 `overflow:hidden` 裁掉 |
| 5 | 拖动不平滑、不跟手 | 拖动时直接吸附到离散档位 |
| 6 | 有时无法选中（三个独立缺陷叠加） | `setPointerCapture` 抛错中断处理函数；`onLostPointerCapture` 误当取消；在途提交被 `busyRef` 静默丢弃 |
| 7 | 看不出当前模型在哪个分组 | 第一级没有活动标记 |
| 8 | 最底下的分组被遮挡、滚轮没反应 | `.cmes-pane` 有 `bottom:0` 却没有 `top`，flex 链失去确定高度 |
| 9 | 滑条能停在任意位置 | React 因状态未变跳过重渲染，吸附值从未写回 |
| 10 | 第一级每行右侧的灰色模型名冗余 | 第二级已经列出并标勾选 |
| 11 | 蓝点在 provider 名左侧，与「状态在右」的阅读习惯相反 | 蓝点位置未随名字推到右侧 |

[Unreleased]: https://github.com/ABING1111/dsh-codex-model-effort-selector/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ABING1111/dsh-codex-model-effort-selector/releases/tag/v1.0.0
