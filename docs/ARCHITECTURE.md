# 架构说明 · dsh-codex-model-effort-selector

插件的运行时结构：两半的生命周期、席位接管、弹层状态机、几何与色彩的推导、粒子与交互细节、测试台分工。像素测量与逐帧对照见 [SPEC.md](./SPEC.md)；每个已修缺陷的因果链见 [INCIDENTS.md](./INCIDENTS.md)。所有事实均可在 `client.js`（1120 行）、`test/*.mjs` 与 `README.md` 中核对。

---

## 数据与生命周期

| 文件 | 行数 | 角色 |
|---|---|---|
| `index.js` | 12 | 宿主半边。`export function apply() {}` —— **空实现** |
| `client.js` | 1120 | 客户端 bundle，**发布产物本身**，手写、零构建、可静态审计 |

`index.js` 刻意什么都不做：不注册钩子、不发事件、不装服务。它存在的唯一理由是让本包成为 cordis 树上的一个节点 —— 没有宿主条目，`package.json` 里的 `dsh.client` bundle **不会被扫进启动图**。

`client.js` 不是编译输出，没有构建步骤，源码即产物。因此可以 `node --check client.js` 做语法检查，也可以用正则从源码里直接读出色值与几何常量 —— 这正是 `test/verify.mjs` 与 `test/palette.mjs` 的做法。

### 注册入口

bundle 是普通脚本，只调用一次模块加载器：

```js
window.__ModuleLoader__.load({
  id: 'dsh-codex-model-effort-selector',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    // 组件、CSS、色板全部内联在这个闭包内
    return { inject: [...], apply(ctx) { /* ... */ } };
  }
});
```

`factory` 从宿主模块表取 `react`（不打包 React），返回 cordis 插件对象。`id` 必须等于包名，`verify.mjs` 第一条断言就校验它。

### 宿主启动时注入

| `package.json` 字段 | 值 | 作用 |
|---|---|---|
| `dsh.bundle.patch` | `./cordis.patch.yml` | 把本包 `insert` 进 profile 组合层 |
| `dsh.client.platform` | `web` | 只在 Web/桌面客户端注入 |
| `dsh.client.immediately` | `true` | 启动即注入，不等懒加载 |
| `dsh.client.inject` | `dsh-client-ui-conversation` / `-model-selection` / `-locale` | 依赖的兄弟 bundle |

`cordis.patch.yml` 只有四行，把本包 `insert` 进组合层（`id` / `name` 均为包名，`config: {}`）。

时序：宿主启动 → 读 profile → 应用 patch → 扫描 `dsh.client` → 注入 bundle → `load()` → `apply(ctx)` → `ctx.slots.register(...)`。注入发生在启动期，所以**改动客户端 bundle 必须重启 DSH 才生效**。

### 依赖注入与注销

| 注入 | 用途 |
|---|---|
| `ctx.slots` | 注册并接管 `conversation.input.model` 席位 |
| `ctx.modelDirectories` | 会话级模型目录：`directoryFor(sessionId)` → `{ store, load, select }` |
| `ctx.sessions` | `subagentAddress(sessionId)` 判定子代理会话 |
| `ctx.locale` | 注册 `zh` / `en` 两份字典 |

字典注册包在 `ctx.effect(() => ctx.locale.register(NS, { zh, en }))` 里：回调返回值由框架在卸载时调用，字典随插件生命周期自动注销。`verify.mjs` 用一条断言钉住这个形状。

---

## 席位接管

### 官方已经占了这一席

`conversation.input.model` 是 **`kind: 'single'`** 槽位，官方包 `@deepseek-ai/dsh-client-ui-model-selection` 已以 **priority 0** 占着它。

`single` 槽的语义是**同一优先级只允许一个注册**，重复注册直接抛错：

```
single slot "conversation.input.model" already has a registration at priority 0
  (registered by …) — register at a different priority to shadow it (lowest renders)
```

所以照抄官方用默认优先级注册，**整个插件加载会失败**，而不是「界面不显示」这么轻的后果。

### 遮蔽而非替换

本插件显式传 `priority: -1`：

```js
ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
  name: 'conversation.input.model', locale: NS, priority: -1,
  inject(sessionId) { /* ... */ }
}, Selector));
```

投影规则是**保留每个 cell 中优先级最低的条目**，因此 `-1` 赢得席位；官方注册**仍留在账本上**，未被移除或改写。卸载本插件时官方席位**自动恢复，无残留**。`test/slots-integration.mjs` 对着**真实 SlotCore** 断言完整三段式：

| 断言 | 含义 |
|---|---|
| 同优先级重复注册 `assert.throws(/already has a registration/)` | priority 0 是致命的 |
| `entriesOfSlot(...)` 只有 1 条且 component 是本插件 | `-1` 赢得 cell |
| `entries(...)` 有 2 条 | 官方条目仍在账本上 |
| `dispose()` 后 `entriesOfSlot` 只剩官方那条 | 卸载即恢复，无残留 |

### inject() 的契约形状

```js
inject(sessionId) {
  const directory = ctx.modelDirectories.directoryFor(sessionId);
  const available = ctx.sessions.subagentAddress(sessionId) === undefined;
  return {
    available,
    directory: directory.store,
    load: () => { if (available) directory.load().catch(() => {}); },
    select: sel => (available ? directory.select(sel) : Promise.resolve(undefined))
  };
}
```

- `available` —— 子代理会话时为 `false`，此时轨道与触发按钮置灰，`select` 返回 `Promise.resolve(undefined)`，`commit()` 把它解释成「此会话不能切换模型」。
- `locked` **不在**返回值里：它由槽宿主在 `renderSlot(..., { locked })` 时传入，业务半边自己声明就会覆盖宿主真值。`verify.mjs` 断言 `'locked' in api === false`。
- `key` / `id` 也不传：`single` 槽的 cell 就是整个槽，唯一冲突源是优先级数值本身，`verify.mjs` 断言这两个字段为 `undefined`。

### 数据流

组件用 `useSyncExternalStore` 订阅目录快照，再逐层派生：

```js
const selection = state.pending || state.current;   // 在途提交优先于已提交
const group = groups.find(g => g.id === selection?.provider);
const model = group?.models.find(m => m.id === selection?.model);
const efforts = sortEfforts(model?.reasoning?.efforts);
const savedEffort = selection?.reasoningEffort ?? model?.reasoning?.defaultEffort;
const displayed = preview ?? savedEffort;           // 拖动预览覆盖已提交值
const index = Math.max(0, efforts.findIndex(e => e.id === displayed));
const fraction = efforts.length > 1 ? index / (efforts.length - 1) : 0;
```

档位阶梯把 Codex 的词汇套到模型自己声明的 id 上，未识别的 id 排在 `high` 之后（`rank()` 返回 50）：

```js
const EFFORT_ORDER = [
  'off', 'none', 'minimal', 'low', 'medium', 'mid',
  'high', 'xhigh', 'extra-high', 'max', 'ultra'
];
```

标签走 `EFFORT_KEY` → 字典键 → 模型自带的 `effort.name` 三级回退；字典查不到时 `t(key)` 会原样回显键名，因此代码显式判断 `translated !== key`。

`PEAK_IDS = ['max', 'ultra']` 只用来决定紫罗兰主题与额度警示，**按 id 判定而不是按位置** —— 否则只声明 `light/high` 两档的模型，最高档会被错误染成 Ultra 紫。`verify.mjs` 同时断言旧的位置判定（`nextIdx === efforts.length - 1 && nextIdx > 0`）已从源码消失。

---

## 状态机

### 三态弹层

| 状态 | 真值 | 视觉 |
|---|---|---|
| `effort` | `pane === 'effort'` | 推理滑条面板，popover 高 `104px` |
| `models` 第一级 | `pane === 'models'` 且 `view === 1` | provider 列表 + 自己的滚动容器 |
| `models` 第二级 | `pane === 'models'` 且 `view === 2` 且 `subProvider !== null` | 该 provider 的模型 + 搜索框 |

两级下钻取代了早期「可折叠分组列表」，**为了消除一个有两半解释的状态**（见 [INCIDENTS.md 第 1 条](./INCIDENTS.md)）。现在只有一个真值来源：

```js
const [view, setView] = useState(1);            // 1 = provider 列表，2 = 某 provider 的模型
const [subProvider, setSubProvider] = useState(null);
```

判定当前页只有一处：`if (view !== 2 || !activeProvider) { /* 第一级高度 */ } else { ... }`。`test/collapse-regression.mjs` 断言源码里 `collapsedIds` / `toggleGroup` / `isExpanded` 与 `!collapsedIds.has(...)` 这种反转读法**全部不存在**。

### Escape 逐层退避

监听挂在 `document` 捕获阶段（`keydown`, `capture: true`）并阻止冒泡，避免宿主 composer 同时处理这次按键：

```js
if (latest.current.pane === 'models') {
  if (latest.current.view === 2) { goBack(); }
  else { setPane('effort'); setQuery(''); }
} else close();
```

第二级 → 第一级 → 强度面板 → 关闭。用 `latest` ref 读取而非闭包变量，因为监听器只在 `[open]` 变化时重建，闭包里的 `view` / `pane` 会过期。

### 关闭即复位

```js
setPane('effort'); setView(1); setSubProvider(null); setHighlight(0);
triggerRef.current?.focus({ preventScroll: true });
```

不重置 `pane` 会导致重开时 popover 高度从列表高度动画回 104px，表现为「界面从上面收回」（[INCIDENTS.md 第 2 条](./INCIDENTS.md)）。焦点显式回到触发按钮，键盘用户不会掉到页面根。打开时 `setPane(model ? 'effort' : 'models')` —— 当前模型没有推理元数据时直接落到模型列表，因为强度面板此时只有一行「此模型未提供推理强度」。

### 呈现与逻辑分离

`open` 管逻辑与 aria，`present` 管延迟撤销：`useLayoutEffect` 在 `open` 为真时立即 `setPresent(true)`，为假时挂一个 180ms 定时器再 `setPresent(false)`。180ms 与 popover `.closed` 的 `visibility` 过渡延迟（`transition-delay:0s,0s,0s,.18s`）同拍，保证关闭动画期间节点还在。

---

## 几何

### 三者共用一套内缩公式

```css
.cmes-knob{ left: calc((100% - 30px) * var(--cmes-pos,0));         top:-2px;
            width:30px;height:30px;border-radius:50% }
.cmes-fill{ width: calc((100% - 30px) * var(--cmes-pos,0) + 15px); /* 止于旋钮圆心 */
            border-radius:13px 0 0 13px }
.cmes-dot { left: calc((100% - 30px) * var(--cmes-tick,0) + 15px); top:11px;
            width:4px;height:4px;margin-left:-2px;border-radius:50% }
```

### 为什么是 30px

旋钮直径 = 30px，半径 = 15px。圆心只能在 `[15px, 宽度−15px]` 之间移动，所以 `pos=0` 时圆心落在左端圆角半径内、`pos=1` 时落在右端圆角半径内 —— **圆永远是完整的圆**。若让行程越过轨道端点，30px 的圆会被 `overflow:hidden` 切成半圆或方块。

同一个 15px 也出现在指针数学里，两端必须一致：

```js
function fractionAt(clientX) {
  const box = railRef.current?.getBoundingClientRect();
  if (!box || box.width <= 30) return 0;   // 避免除零产生 NaN
  return Math.max(0, Math.min(1, (clientX - box.left - 15) / (box.width - 30)));
}
function knobX(frac) { return 15 + frac * (box.width - 30); }   // 旋钮圆心 px
function fillW(frac) { return knobX(frac); }                     // 填充恰好止于圆心
```

### 实测盒子

| 元素 | CSS 值 | 来源 |
|---|---|---|
| popover | 宽 `272px`，高 `var(--cmes-height,104px)` | 实测 277.3 取整 |
| 强度面板 | `.cmes-main{height:104px}` | 卡片高实测 144 ÷ 1.385 = 104.0 |
| 轨道 | `left:12px;right:12px;top:65px;height:26px;border-radius:16px` | 轨道顶实测 91 ÷ 1.385 = 65.7 |
| 旋钮 | `30px` 正圆，`top:-2px`（在 26px 轨道上下各溢出 2px，对称） | 实测 28.9 |
| 刻度点 | `4px`，`top:11px`（居中于 26px 轨道） | 实测 ~3.6 |
| 左右工具 | `28×28`，`top:7px`，`left/right:7px` | 实测命中区 28.2 |
| 中列 | `left:43px;right:43px;top:8px;height:42px` | 点击下钻模型列表 |

轨道在 272px 卡片内左右各缩 12px，实际宽 248px，旋钮行程 218px。`top:65px + 26px` 结束于 91px，下方余 13px，与录屏一致。

### 高度是算出来的，不是写死的

```js
const ROW_H = 41, MODEL_H = 39, LIST_MAX_H = 252, LIST_PAD_B = 4;
const HEAD_H = 36, SEARCH_H = 40, EMPTY_H = 48, SEC_H = 30, PAD = 20;
```

| 常量 | 对应 CSS | 由什么决定 |
|---|---|---|
| `ROW_H = 41` | `.cmes-row{padding:10px}` | 行高 21 + 上下 10 |
| `MODEL_H = 39` | `.cmes-model{padding:9px 10px}` | 行高 21 + 上下 9 |
| `LIST_MAX_H = 252` | `.cmes-list{max-height:252px}` | 列表上限 |
| `HEAD_H = 36` | 返回按钮 26 + 内边距 | 第二级头部 |
| `SEARCH_H = 40` | `.cmes-search{padding:7px 10px}` | 搜索框 |
| `EMPTY_H = 48` | `.cmes-empty{padding:14px 10px}` | 空态 |
| `SEC_H = 30` | `.cmes-sec{padding:4px 8px 8px}` | 第一级小标题 |

`verify.mjs` 逐条断言这些常量与 CSS 声明**同时**存在 —— 行高常量比真实值小 3px 时，第一级最后一行会被 `overflow:hidden` 裁掉，而第一级没有别的补救办法。高度还会夹到触发器上方的可用空间，`bottomVar` 读的正是定位副作用写下的 `--cmes-bottom`：

```js
const roomAbove = Math.max(120, window.innerHeight - bottomVar - 24);
const cappedHeight = Math.min(menuHeight, roomAbove);
```

CSS 侧第二道保险：`max-height:calc(100vh - var(--cmes-bottom,40px) - 12px)`。

### 定位

`align()` 在打开、`resize`、`scroll`（捕获阶段）时运行，把 `--cmes-left` / `--cmes-bottom` 写进 root。水平方向按触发器中心对齐再夹进视口（`width = Math.min(272, innerWidth - 24)`，`left` 夹在 `[12, innerWidth - width - 12]`），垂直方向取 `bottom = Math.max(12, innerHeight - trigger.top + 8)`。`resize` 额外用 `requestAnimationFrame` 在 500ms 窗口内持续重算，跟随宿主的展开动画。

---

## 色彩

### 每档一色

| 桶 | fill | ink |
|---|---|---|
| `off` | `#8a8a8f` | `#707073` |
| `minimal` | `#4a8ef8` | `#2b62bd` |
| `low` | `#3a83f7` | `#2f6fd0` |
| `medium` | `#4a72f2` | `#3a55b8` |
| `high` | `#5f5ce8` | `#4a3fc0` |
| `xhigh` | `#7b48e8` | `#6a35c8` |
| `max` | `#914ef6` | `#8b46ee` |

`off` 刻意是中性石板灰：关闭的档位不该看起来有能量，也不能被误认成淡紫的 Ultra。未识别的 id 落到 `FILL_FALLBACK = '#3a83f7'` / `INK_FALLBACK = '#2f6fd0'`（即 `low` 与 `high` 之间），自定义档位仍读得出来。填充、轨道底色（`mixHex('#e8e7e8', fill, 0.22)`）、标题 ink、刻度点、以及**收起态席按钮**全部由当前档位派生，不再只有 Ultra 特殊。

### 排序轴是色相，不是亮度

色相从蓝 `216.6°` **单调推进**到紫罗兰 `263.9°`，`palette.mjs` 逐档断言 `hues[i] >= hues[i-1] - 1` 且总跨度 > 30°。

亮度**故意不单调**：同饱和度下紫罗兰天生比蓝暗。若强行要求「越往右越暗」，`max` 就必须往粉色去、不再像 Ultra。因此 `max` 是紫罗兰那一对里**最亮**的（`palette.mjs` 断言 `b > r > g`）。所有彩色档位饱和度 ≥ 0.5，不会洗成灰。

### WCAG 三条下限

`palette.mjs` 从源码里**读出**真实色值再算对比度，色值一改就重新校验：

| 约束 | 下限 | 实测最低 |
|---|---|---|
| 填充 vs 未填充轨道 `#e8e7e8` | ≥ 2.5 | 2.61 |
| 白色旋钮 vs 填充 | ≥ 2.2 | 2.79 |
| 标题 ink vs 卡片底 `#f8f8f8` | ≥ 4.5 | 4.59 |

`minimal` **不能**用真正的浅蓝：比 `#4a8ef8` 更浅就会掉到轨道对比度 2.5 以下，在浅色轨道上糊成一片。「低能量感」因此靠**色相与饱和度**表达，而不是靠亮度。

### Ultra 渐变非单调

峰值在 `#a779fe`（CSS 色标 65% 处；20 点采样给出的峰值位置约 70%），随后**回落变深**到 `#7448ee`。这是「能量感」的来源，做成单调渐变会明显不像：

```css
.cmes-popover.peak .cmes-fill{
  background:linear-gradient(90deg,#3b83f6 0%,#3b82f6 10%,#3d7bf3 20%,#4c75f4 30%,
    #6473fa 40%,#8d80fc 50%,#9375fd 55%,#9d78fd 60%,#a779fe 65%,#a476fe 70%,
    #9e73fe 75%,#9166fe 80%,#845af9 85%,#7d55f6 93%,#7448ee 100%);
  background-size:155% 100%;animation:cmes-colorflow 3.8s ease-in-out infinite alternate }
```

`#3a83f7`、`#3b83f6`、`#a779fe`、`#7448ee`、`#8b46ee` 五个实测色值被 `verify.mjs` 断言必须存在于源码里。峰值态还叠加：`::before` 斜向扫光（`shimmer 4.5s`，`translateX(-45%) → 45%`）、刻度点 `opacity:0`、星尘粒子层亮起。

---

## 粒子

22 颗星尘粒子**不用 `Math.random`**，否则每次重渲染都会跳变。`verify.mjs` 先剥掉注释再断言源码里没有 `Math.random`，防止一句注释把真实调用掩盖过去：

```js
const PHI = 0.6180339887498949;
function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function buildSparkles(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const b = 0.5 + 0.5 * hash01(i * 7 + 3);
    out.push({ key: i,
      top: (8 + 84 * hash01(i * 13 + 5)).toFixed(1) + '%',
      b: b.toFixed(2),
      dur: (1.6 + 2.4 * hash01(i * 3 + 11)).toFixed(2) + 's',
      delay: (-(i * PHI % 1) * 4).toFixed(2) + 's' });
  }
  return out;
}
```

两件事被**刻意解耦**：**相位**（`delay`）用黄金比低差异序列 `i * PHI mod 1`，任意前缀都铺得开；**高度**（`top`）用**独立哈希** `hash01(i * 13 + 5)`，与相位取不同系数。若高度与相位取同一个数，「越靠右的星越高」，22 颗会排成一条斜线。亮度 `b`、周期 `dur` 也各用独立系数（`i*7+3`、`i*3+11`）。

粒子通过 CSS 变量驱动，React 只写值、动画全在 CSS：

```css
.cmes-sp{position:absolute;width:3px;height:3px;border-radius:50%;background:#fff;
  opacity:var(--b,1);transform:scale(var(--b,1));
  animation:cmes-drift var(--dur,3s) linear infinite;animation-delay:var(--delay,0s)}
@keyframes cmes-drift{0%{left:-4%;opacity:0}6%{opacity:var(--b,1)}
  94%{opacity:var(--b,1)}100%{left:104%;opacity:0}}
```

`buildSparkles(22)` 包在 `useMemo(..., [])` 里，整个组件生命周期只算一次。

### `prefers-reduced-motion` 是放缓而非冻结

```css
@media (prefers-reduced-motion:reduce){
  .cmes-sp{animation-duration:calc(var(--dur,3s) * 2.6)}
}
```

周期 ×2.6，粒子仍在流动。冻成静态图会让「能量在流动」这个表达整个消失 —— 而那个表达正是 Ultra 档的全部意义。`verify.mjs` 断言媒体查询与 `* 2.6` 同时存在。

---

## 交互与吸附

### 拖动连续跟手，松手才吸附

按住指针时旋钮**连续跟指针**（`paintLive` 写原始小数），松手才落到最近的档位点。拖动期间 CSS 过渡被关掉，否则会拖出橡皮筋感：

```css
.cmes-rail.dragging .cmes-knob{transition:none}
.cmes-rail.dragging .cmes-fill{transition:none}
.cmes-rail.dragging{cursor:grabbing}
```

非拖动状态下 `left` / `width` 走 `.18s cubic-bezier(.2,.8,.2,1)`，吸附时看得到一段短动画。

### 单一无单位分数变量

`--cmes-pos` 是唯一的位置真值，旋钮 `left` 与填充 `width` 都由它派生。拖动直接写它，React 每次渲染也写它（`[--cmes-pos]: fraction`）—— **两边写的是同一个变量**。

早期版本把**像素值**写进两个变量（`--cmes-knob-x`、`--cmes-w`），而 React 渲染时写的是 `calc()`。两者是同一个属性，React 可能不会重新写回，旋钮就卡在拖到的位置不吸附。`verify.mjs` 断言这两个像素变量名已从源码消失。

### `snapLive` 为什么必须在释放路径显式写回

这是整个交互里最容易漏的一处。`paintLive` 写的是**原始小数**。如果松手落到的那一档**恰好等于拖动时最后预览的那一档**，`setState` 的值没变 → React **跳过重渲染** → 没有任何代码把变量改回吸附值 → 旋钮停在手指松开的位置。

所以三条释放路径都**显式**调用 `snapLive`，不依赖 React 一定会重渲染：

```js
function finish(event) {
  if (!dragRef.current) return;
  dragRef.current = false; setDragging(false); liveRef.current = null;
  const i = nearestIndex(event ? event.clientX : NaN);
  snapLive(i);                                  // 先钉住旋钮
  const target = efforts[i] ?? efforts[index];
  if (target) chooseEffort(target.id);
}
function cancelDrag() {
  if (!dragRef.current) return;
  /* ...清预览与警示... */
  snapLive(index);                              // 回滚到「已提交」的档位，同样吸附
}
function keyDown(event) {
  /* ...算出 i... */
  snapLive(i);                                  // 键盘同样显式写回
  const target = efforts[i];
  if (target) chooseEffort(target.id);
}
```

`cancelDrag` 回滚到的是**已提交的档位** `index`，不是拖动开始前的原始像素位置。

### 提交合并

```js
pendingRef.current = next;
if (busyRef.current) return;          // 只有第一个请求跑循环
busyRef.current = true;
try {
  while (pendingRef.current) {        // 排队的意图一定会被排空
    const want = pendingRef.current;
    pendingRef.current = null;
    const result = await select(want);
    if (result && !result.ok) throw new Error(result.error?.message || t('failed'));
    if (result === undefined) throw new Error(t('unavailable'));
  }
} catch (cause) { pendingRef.current = null; if (mountedRef.current) setError(...); }
finally { busyRef.current = false; /* ... */ }
```

因此「最后一次选择必定落地」。反过来说，`pointerDown` **不能**以 `busyRef` 设闸 —— 提交期间整条轨道不可抓，正是「有时候拖不动」的另一半原因。提交既然会合并，就没有理由拦住新的拖动。`verify.mjs` 专门断言 `pointerDown` 函数体里不出现 `busyRef.current`。

注意差异：**换模型仍然挡并发**（`chooseModel` 里 `if (disabled || busyRef.current) return;`）—— 换模型是一次性动作，重复触发没有意义；滑条是连续手势，必须让后来者覆盖前者。

### 悬停提示与关闭路径

非拖动状态下，指针靠近某个刻度点（`|clientX - tickX| < 10` 且不是当前档）时该点放大 `1.75` 倍，作为「可以落到这里」的提示；`onPointerLeave` 清空悬停。

`close()` 第一件事是 `cancelDrag()`，保证任何在途拖动都被正确回滚并吸附，不会留下一个半途的旋钮。

---

## 无障碍

| 元素 | 声明 |
|---|---|
| 轨道 | `role="slider"`、`tabIndex:0`、`aria-label`、`aria-valuemin:0`、`aria-valuemax:efforts.length-1`、`aria-valuenow:index`、`aria-valuetext:currentLabel`、`aria-disabled:busy\|\|disabled` |
| 触发按钮 | `aria-label`（模型名 + 档位）、`aria-expanded:open`、`aria-haspopup:"dialog"`、`aria-busy:busy` |
| 弹层 | `role="dialog"`、`aria-label` 随 `pane` 切换、`aria-hidden:!open`、`inert:!open ? '' : undefined` |
| 模型面板 | `role="menu"`、`aria-label`、`inert` 在隐藏态生效 |
| provider 行 | `aria-expanded: view === 2 && subProvider === g.id` |
| 模型行 | `role="menuitemradio"`、`aria-checked:selected` |
| 忙碌态 / 错误态 | `.cmes-sr` + `role="status"`；`role="alert"` |
| 装饰 | 所有 `<svg>` 带 `aria-hidden`；蓝点 `aria-hidden` |

`inert` 是关键一笔：两个面板**同时存在**于 DOM（靠 `opacity` / `visibility` / `transform` 切换），收起的那一半必须对指针、焦点与辅助技术同时不可达，否则键盘 `Tab` 会走进一个看不见的面板。`aria-valuetext` 用本地化档位名而不是裸数字，屏幕阅读器播报的是「极高」而不是「5」。

| 场景 | 键 | 行为 |
|---|---|---|
| 轨道 | `←` / `↓` | 退一档 |
| 轨道 | `→` / `↑` | 进一档 |
| 轨道 | `Home` / `End` | 到两端 |
| 模型列表 | `↑` / `↓` | 高亮循环移动（取模） |
| 模型列表 | `Enter` | 选定 |
| 模型列表 | `Home` / `End` | 高亮到两端 |
| 全局 | `Escape` | 逐层退避（见状态机） |

焦点环用 `:focus-visible` 加 `outline:2px solid` + `outline-offset:2px`，鼠标点击不会留下焦点环。`tabIndex` 的轨道在 `pointerDown` 里显式 `focus({preventScroll:true})`，指针用户与键盘用户落在同一处焦点。

---

## fail-open 策略与它的代价

### 策略

插件不注册任何宿主钩子、不发事件、不订阅事件、不装子插件、不碰官方 class 与文字。`verify.mjs` 用三条 `doesNotMatch` 断言源码里不存在 `ctx.on(`（不发/不收事件）、`ctx.plugin(`（不装插件）、`productAnalytics`（无埋点）。

任何一步认不出就什么都不做：

| 失败点 | 表现 |
|---|---|
| `directory.load()` 抛错 | `.catch(() => {})` 吞掉，界面停在空态文案 |
| 会话是子代理 | `available = false`，触发按钮 `disabled`，`select` 返回 `undefined` |
| 目录未就绪 | 显示 `t('loading')` / `t('empty')`，不崩 |
| 槽契约变了 | 注册失败 → 插件加载失败，但官方界面**保持原样** |

唯一的硬失败是注册本身（槽形状变了），后果是「插件不生效」，不是「官方界面坏掉」。

### 代价

1. **静默失败对用户不可见。** 一旦本插件遮蔽了官方席位，插件又因任何原因不渲染，用户看到的是**什么都没有** —— 一个空位，而不是一个坏掉的按钮。官方那一份仍在账本上，但不会显示。
2. **接管即接管错误上报。** 遮蔽官方席之后，官方那份逐 provider 的失败列表也归本插件负责。所以 `state.failures` 被如实渲染成 `{name} 加载失败：{message}`，而不是一片空白。这不是可选的美化，是遮蔽的必然义务。
3. **诊断成本转移。** 静默失败意味着排查必须靠外部手段（`dsh --dump-config`、重启、开发者工具），插件自己不会主动报错。

---

## 测试台策略

| 文件 | 项数 | 测什么 |
|---|---|---|
| `test/verify.mjs` | 33 | 加载、注册契约、遮蔽、几何常量、配色存在性、fail-open、无障碍、两级下钻 |
| `test/palette.mjs` | 10 | 三条 WCAG 下限、色相单调、饱和度、去重、混色助手 |
| `test/collapse-regression.mjs` | 6 | **同时实现有 bug 与修好后的两个状态机**，并断言源码里反转读法已消失 |
| `test/slots-integration.mjs` | 4 | 对着**真实 SlotCore** 的遮蔽与卸载恢复 |
| `test/encoding.mjs` | 逐文件 | 干净 UTF-8、无 BOM、无 GBK 乱码；README 标题未被截断 |

**verify.mjs 会真正执行 bundle。** 它把 `client.js` 塞进桩化的 `window.__ModuleLoader__`，用最小 React 桩把 bundle **跑起来**，捕获 `apply()` 注册的东西再断言注册形状。React 渲染路径被桩掉（离线没有真 React），几何与配色因此分别由源码断言和 HTML 预览验证。大量断言是**读源码文本**而不是跑逻辑（例如 `assert.match(src, /const PEAK_IDS = \['max', 'ultra'\];/)`）—— 常量一旦被改动，文本断言立刻失败，比「跑一遍但没走到那条分支」可靠。

**palette.mjs 从源码读色值。** 它用正则**解析出** `EFFORT_FILL` / `EFFORT_INK` 的实际值，再按 WCAG 公式算对比度、按 HSL 公式算色相。不会出现「测试里写死一份色板、源码里是另一份」的漂移。

**collapse-regression.mjs 测的是「bug 的形状」。** 它把有 bug 的状态机也实现了一遍，先证明它确实会「一次全开」，再证明修好后的版本不会。回归测试不该只测好版本 —— 只测好版本无法区分「修好了」和「这个测试根本没覆盖到那条路径」。详见 [INCIDENTS.md](./INCIDENTS.md#关于回归测试的一条设计说明)。

**为什么 slots-integration 要对着真实 SlotCore。**「`single` 槽同优先级重复注册会抛错」「投影保留最低优先级条目」「卸载后官方席位恢复」这三条**都是框架行为，不是本插件的代码**。读文档推断出来的是**我们以为的契约**；契约本身如果和文档不一致，插件照样会挂。所以这个测试从 `app.asar` 里**解包出真实的 `@deepseek-ai/dsh-client-ui-slots/lib/index.js`**，起一个真实例，先把官方席位注册进去，再拿本插件**真实的注册定义**去驱动它 —— `core.register(def, Comp)` 这一行在 `priority` 为 0 时会直接抛出。断言包括：赢家恰好 1 条、`winners[0].options.priority === -1`、账本上仍有 2 条、`dispose()` 后赢家又变回官方组件。找不到 asar 或包形状变了时**自动 SKIP（exit 0）**，让套件在没有装 DSH 的机器上照样可跑。

**encoding.mjs 是一次事故的产物。** 一次 PowerShell `Set-Content` 用系统 ANSI 代码页重编码了 README，产生 559 个不可恢复的字符。这个守卫遍历包内所有文本文件，断言：严格 UTF-8 可解码、无 `U+FFFD`、无 BOM（宿主直接 `JSON.parse` 读 `package.json`，BOM 会让整个插件被丢弃）、无常见 GBK 乱码序列，并单独校验 README 的标题与长度未被悄悄截断。

---

## 已知取舍

| 取舍 | 说明 |
|---|---|
| **需要重启** | 客户端 bundle 在启动时注入，改完必须完全退出并重开 DSH Desktop |
| **依赖官方 slot 契约** | 官方若改动 `conversation.input.model` 的形状，插件静默退回「什么都不做」 |
| **档位由模型决定** | 滑条只显示当前模型实际公布的推理强度；无推理元数据时显示「此模型未提供推理强度」 |
| **宽度 272 / 旋钮 30** | 取参考实现的整数值；实测 277.3 / 28.9（差 <2%，肉眼不可辨） |
| **粒子相位不可复现** | 录屏无法提取原始随机种子，改用确定性伪随机 |
| **行高常量硬编码** | `ROW_H` 等必须与 CSS 手工同步；`verify.mjs` 断言二者一致来兜住漂移 |
| **轨道底色基色固定** | `mixHex('#e8e7e8', fill, 0.22)` 以浅色为基，未按深色主题切换（其余部分走 `--dsw-alias-*`） |
| **一级列表不可搜索** | 搜索框只在第二级；provider 数量远小于模型数量，故未做 |
| **换模型落在中间档** | `floor(n/2)` 是参考实现规则；无档位的模型整个不发 `reasoningEffort` 键（缺席 = 「对档位没意见」，与显式 `null` 不同） |
| **Ultra 命名沿用 Codex** | `max` 档在 Codex 里叫 Ultra；若某模型把最高档命名为别的 id，则显示模型自己的名字 |
