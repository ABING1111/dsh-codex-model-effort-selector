# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.1.2] — 2026-10-17

### 修复

- **Fast 开关不保存：切换对话再切回来会变回默认**。⚡ 此前只是组件内的 `useState`，
  而席位是**会话级**的 —— 切到别的对话再切回来，组件会**重新挂载**，状态随之丢失。
  现在按会话保存：
  - **挂载时恢复**，任何一次切换（点 ⚡、重置按钮的 `setFast(false)`）都会写回；
  - key 沿用宿主自己的约定（官方 composer 用 `dsh.conversation.<sessionId>` 存草稿/视图偏好）：
    `dsh.codex-effort-selector.fast.v1.<sessionId>`；
  - 宿主若**复用同一个组件实例**而不是重挂载，也会在 `sessionId` 变化时改用新会话的值；
  - **双层存储**：内存镜像让「同一次运行内的切换」完全不依赖磁盘（存储被禁用也照样记住），
    `localStorage` 负责跨重启；
  - 全部 `try/catch` 包裹 —— 存储不可用只意味着「重启后不记得」，绝不会影响输入框（fail-open）。
  - 行为边界：全新会话仍从**关闭**开始（这是按会话的记忆，不是全局偏好）。
  浏览器实测（真实组件、真实重挂载）：A 打开 Fast → 切到 B（关闭）→ 切回 A（**打开**，
  收起态也带 ⚡）；全新会话 C 为关闭；模拟 `localStorage.setItem` 抛错后，同一次运行内重挂载仍是打开。
- **「重置为默认」只在 DeepSeek 组有效，其他组点了没反应**。`defaultEffort` 在宿主目录投影里是
  **可选**的：会话控制器只在该 provider 解析出默认值时才带上这个键
  （`...(resolved.reasoning.defaultEffort === undefined ? {} : …)`），而 Trae 适配器仅在上游模型
  自身声明 `default_reasoning_effort` 时转出它 —— 多数模型只公布档位列表、不公布默认值。
  重置按钮却无条件调用 `chooseEffort(model.reasoning.defaultEffort)`，而 `chooseEffort` 会拒绝
  **不在档位列表里的 id**（`undefined` 自然也不在），于是点击**静默无效**；同时按钮的禁用条件
  是 `!model.reasoning`，所以它看起来还是可点的。
  现在给「默认」一个统一含义（`defaultStopId()`）：provider **声明了**默认值且该值确实是已公布的档位时用它，
  否则落到**中间档**（`floor(n/2)`，也就是切模型时插件本来就用的规则）—— 顺带覆盖了
  「provider 声明了默认值但不在档位列表里」这种错配。按钮的禁用条件也改成
  `efforts.length === 0`，没档位可重置时才是禁用态。
  浏览器实测（真实组件）：有默认值的模型（默认 `高`）从 `中` 重置回 **高**；无默认值的 3 档模型
  从 `极高` 重置到**中间档 `高`** 并真的提交了 `reasoningEffort`（修复前是完全不动）。

## [1.1.1] — 2026-10-17

### 修复

- **拖动到一半「变成无法选中」**（1.1.0 之后报告，且比之前更频繁）：手势此前**依赖
  `setPointerCapture`**。捕获一旦丢失——捕获元素被替换、按下触发了原生拖拽或文字选择、
  指针移出窗口、浏览器决定接管手势（这些都会派发 `pointercancel` / `lostpointercapture`）——
  轨道就再也收不到 `pointermove`，拖动当场卡死，松手也不生效。
  现在手势的**所有权归 document**：
  - 拖动期间在 document 的**捕获阶段**监听 `pointermove / pointerup / pointercancel`，
    捕获丢失也照样跟手；指针可以拖到弹层外面再拖回来；
  - 按下时 `event.preventDefault()`，抑制会引发 `pointercancel` 的原生拖拽 / 选择默认行为；
  - 只认发起手势的那个 `pointerId`（多指/多设备不会互相打断）；
  - **窗口失焦也会结算**：指针在窗口外松开拿不到 `pointerup` 时，拖动不会「粘住」；
  - 指针捕获降级为「顺手取一下」，不再是机制本身。
  浏览器实测：拖动中途强制 `releasePointerCapture` 后继续移动，滑条仍逐像素跟手并在松手时提交。
- **旋钮恢复 `pointer-events:none`**：1.1.0 为了让旋钮可点而把它变成可命中元素，但拖动过程中
  旋钮会随数值从光标下面移走，**事件目标因此一直在变**——这正是「拖到一半断掉」的一个重要来源。
  抓取带（`::before`，上下各 6px）本来就完全覆盖旋钮上下的 2px 悬出部分，旋钮不必可点；
  现在整段手势始终落在**同一个目标（轨道）**上。右端 8 个抓取点逐点复测：全部可拖。

### 变更

- **按压形变只保留放大**：去掉按住时旋钮外扩的柔光环（`box-shadow: 0 0 0 7px`），
  只保留 `transform:scale(1.16)` 与松手回弹——按住时旋钮的阴影与静止时**逐像素相同**（实测一致）。

## [1.1.0] — 2026-10-17

### 新增

- **抵达最右端时的粒子绽放**：滑条落到**最右端那一档**时，从旋钮炸开一圈粒子（一圈柔光 + 18 颗光点），
  0.6–0.9 秒内向外扩散并淡出。触发条件是「**抵达**」这个跃迁本身——拖动、点轨道、按 `End`、
  重置按钮，凡是从别的档位落到右端的动作都会触发一次；**打开弹层时本来就停在右端不会触发**。
  几何照录屏量：光点从旋钮边缘（≈9–14px）出发，最远到横向 ≈44px、纵向 ≈22px，直径 3.4–6px，
  只朝**左侧**扇形散开（旋钮停在卡片右缘，整圆会被裁掉一半）。颜色取当前档位的填充色提亮，
  所以 Ultra 是紫罗兰、其它档位是自己的颜色。粒子仍用确定性哈希生成（`test/verify.mjs` 继续禁止 `Math.random`），
  重渲染不会重排正在飞的粒子；`prefers-reduced-motion` 下直接坍缩成一次淡出。
- **按压 / 释放形变**：按住旋钮时它放大到 1.16 倍并亮起一圈柔光环，松手时沿回弹曲线
  （`cubic-bezier(.34,1.56,.64,1)`）弹回——只动 `transform:scale`，绕旋钮自身中心缩放，
  所以旋钮的布局盒（拖拽计算读的那个）完全不动。拖动期间 `left` 仍然没有过渡，跟手不受影响。

### 修复

- **⚡ 的说明悬浮窗悬停时不显示（根因不是 `overflow`）**：浮层此前是 ⚡ 按钮的子元素，靠
  `position:fixed` 逃出弹层的 `overflow:hidden`。但弹层要画官方菜单材质
  `backdrop-filter: var(--dsw-menu-backdrop-filter)`（`blur(40px) saturate(150%)`），
  而**非 `none` 的 backdrop-filter 会让该元素成为 fixed 子元素的包含块**——于是 `positionTip`
  算出的视口坐标被当成相对弹层的坐标来解释（实测：想放在 `top:479`，实际落在 `1023` = 弹层顶 544 + 479），
  再被 `overflow:hidden` 裁掉。悬停确实把 `opacity` 置成了 1，只是**什么都没画出来**。
  现改为把浮层渲染成弹层的**兄弟节点**（仍在 `.cmes-root` 内，该盒没有 transform/filter），
  `position:fixed` 重新相对视口生效；显隐改由 `pointerenter/leave` + `focus/blur` 驱动 `.show` 类
  （它不再是按钮的后代，原来的 `:hover [role=tooltip]` 规则本来就无法命中）。
  顺带修掉第二个隐患：定位此前在 hover 回调里做，首次悬停时浮层还没参与过布局，
  `offsetWidth/offsetHeight` 是占位值，改为在 `useLayoutEffect` 里按真实尺寸定位。
  浮层外观按参考图改为两行卡片（`1.5 倍速` + `用量更多`），「(仅视觉效果)」改为仅供读屏器读取，
  `aria-describedby` 指向浮层。
- **滑条在最右端时可能「按住却拖不动」**：旋钮可见直径 30px，而轨道只有 26px 高，
  旋钮上下各 2px 悬在轨道外；那两圈此前 `pointer-events:none`，按上去命中的是**面板**，
  `pointerdown` 根本没到轨道。右端时旋钮就是轨道上唯一的抓手，所以最容易复现。
  修法两层：旋钮恢复可命中（事件冒泡到轨道，手势仍归轨道处理），并给轨道加了一条
  透明抓取带（`::before`，上下 6px / 左右 3px），贴着轨道边缘按也能抓住。
  另加窗口级 `pointerup/pointercancel` 兜底：即使指针捕获丢失、`pointerup` 没回到轨道，
  手势也一定会结算，不会卡在「拖动中」。
- **无坐标的释放会把 `NaN` 写进滑条**：`finish()` 此前用 `nearestIndex(event ? event.clientX : NaN)`，
  `NaN` 一路传到 `--cmes-pos`，使旋钮的 `left:calc(...)` 变成非法值、旋钮被甩到轨道外。
  现在无坐标时解析到**当前档位**，`nearestIndex` 也加了非有限数保护。
- **悬停刻度不高亮**：`pointerMove` 把**事件对象**当 `clientX` 传给了 `nearestIndex`，
  映射恒为 `NaN`，`.cmes-dot.hovered` 的放大效果从未生效。改传坐标后恢复。

### 变更

- **适配 DSH `0.2.1-rc.2`**：
  - 席位条目现在声明**子槽位** `conversation.input.model.label`（`{kind:'single', scope:'session', inline:true}`）。
    子槽位只在声明它的条目挂载期间存在，官方模型列表与内置「1017」徽标都往这个子槽位注册；
    若只遮蔽父席位而不声明子槽位，这些装饰会在**没有报错的情况下集体消失**。
  - 同样把该子槽位**渲染出来**（trigger 用 `placement:'trigger'`、模型行用 `placement:'option'`，
    缺贡献时回退到目录里的模型名），所以遮蔽官方席之后徽标照常显示。
  - `renderSlot` 只在条目声明了 children 时才存在，调用处做了条件化，DSH `0.2.0` 上仍回退到纯模型名。
  - `peerDependencies` 放宽为 `>=0.2.0-rc.2 <0.3.0`。
  - `test/slots-integration.mjs` 重写：0.2.1 起 `@deepseek-ai/dsh-client-ui-slots` 不再单独发布
    （并入渲染器），旧版「实例化真实 SlotCore」的断言自动 skip；改为**对着随包发布的官方源码**断言
    「子槽位声明与官方一致」「runner 会给动态包重新排优先级」「贡献在槽位声明前会挂起」，
    只有在仍能读到该包的环境里才跑真实 SlotCore。

### 修复（承 Unreleased）

- **深色模式下推理强度看不清（尤其「高」档）**：v1.0.0 的整套色板是按浅色表面解出的——
  「高」档标题 ink `#4a3fc0` 落在官方深色卡片 `#2a2b2e` 上对比度只有 **1.83:1**（AA 需要 4.5），
  七档 ink 全部不达标；轨道底色基色固定为浅灰 `#e8e7e8`，在深色卡片上是一条 11.3:1 的刺眼亮条。
  现按主题拆成两套色板：
  - **主题判定走官方信号**：读 `<body>` 上的 `data-ds-dark-theme` 属性（官方主题启动脚本在插件运行前就写好、
    且官方深色 token 全部挂在这个选择器上），而不是 `prefers-color-scheme`——用户固定选「深色」而系统是浅色时，
    媒体查询会与实际生效的色板相反。用 `useSyncExternalStore` + `MutationObserver` 订阅，切主题即时变色、无需重载。
  - **深色色板按官方深色表面重新求解**：卡片取 `--dsw-specific-menu`（`#43454a73` 叠在页面 `#151517` 上 ≈ `#2a2b2e`）、
    轨道取 `--dsw-alias-bg-layer-1`（`#232324` 内嵌凹槽）、旋钮取 `--dsw-alias-label-primary`（`#f9fafb` 亮色圆钮）。
    色相轴与浅色一致（216°→264° 蓝→紫），但能量读数反转：亮度随档位 **上升**（0.245 → 0.383）——
    深色底上「更暗」意味着「更看不清」。浅色主题逐位未动。
  - **CSS 静态外观随主题切换**：深色旋钮改为亮色圆钮（原 token 会解析成 `#2c2c2e`，与 `#232324` 轨道几乎同色而消失）、
    已过刻度点取旋钮同色、⚡/蓝点强调色抬到官方深色业务色、Ultra 警示文字的扫光带反转为亮色、
    Ultra 流动渐变 15 个色标全部抬到轨道对比度下限之上。
  - **回归防护**：`test/palette.mjs` 从 10 项扩到 24 项，对浅色/深色各跑一遍全部 WCAG 下限
    （深色 ink 按**最亮**的深色表面校验），并新增「深色 ink 必须比卡片亮」「两套色板必须不同」两条；
    `test/verify.mjs` 新增主题接线断言与 v1.0.0 缺陷形状回归（浅色 ink 色值不得回到深色表）。

### 变更

- `test/make-preview.mjs` / 新增 `test/make-dark-shot.mjs`：预览页改为浅色/深色并排；README 新增
  `docs/images/dark-mode.png` 纯深色展示图（主视觉 + 七档卡片 + 警示态），由真实 CSS 无头渲染生成。

## [1.0.0] — 2026-10-17

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
