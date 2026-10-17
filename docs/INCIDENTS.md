# 缺陷复盘 · dsh-codex-model-effort-selector

每个已修缺陷写成 **现象 → 根因 → 修法 → 断言** 四段。编号沿用 [README](../README.md) 的原始编号（因此不连续，缺 12+ 是因为那些号从未使用）。架构背景见 [ARCHITECTURE.md](./ARCHITECTURE.md)，像素测量见 [SPEC.md](./SPEC.md)。每个断言都能在 `test/*.mjs` 里找到对应的那一行。

| # | 现象 | 根因一句话 | 断言位置 |
|---|---|---|---|
| 1 | 点一个分组，全部一起展开 | 同一个 `Set` 被当成两种含义读 | `collapse-regression.mjs` |
| 2 | 从模型列表关闭后再打开推理条，界面「从上面收回」 | `close()` 没有重置 `pane` | `verify.mjs` |
| 3 | 只有 Ultra 有特殊颜色 | 填充/标题写死单色 | `palette.mjs` + `verify.mjs` |
| 4 | ⚡ 的说明浮层被遮挡 | 浮层是弹层子元素，被 `overflow:hidden` 裁掉 | 预览 + 源码断言 |
| 5 | 拖动不平滑、不跟手 | 拖动时直接吸附到离散档位 | `verify.mjs` |
| 6 | 有时无法选中 | 三个独立缺陷叠加 | `verify.mjs` |
| 7 | 看不出当前模型在哪个分组 | 第一级没有活动标记 | `verify.mjs` |
| 8 | 最底下的分组被遮挡、滚轮没反应 | flex 链失去确定高度 + 第一级没有滚动容器 | `verify.mjs` |
| 9 | 滑条能停在任意位置 | React 因状态未变而跳过重渲染，吸附值从未写回 | `verify.mjs` |
| 10 | 第一级每行右侧的灰色模型名是冗余的 | 第二级已经列出并标勾选 | `verify.mjs` |
| 11 | 蓝点在 provider 名左侧，与「状态在右」的阅读习惯相反 | 渲染顺序是 name → dot → chevron | `verify.mjs` |
| 4b | ⚡ 浮层**悬停完全不显示**（4 的修法没生效） | 弹层的 `backdrop-filter` 使弹层成为 fixed 子元素的包含块，视口坐标被当成相对弹层解释后裁掉 | `verify.mjs` ×3 |
| 13 | 滑条在最右端时**按住拖不动** | 旋钮 30px / 轨道 26px，旋钮上下 2px 悬空且不可命中，按下落到面板上 | `verify.mjs` |
| 14 | 无坐标的释放把旋钮甩出轨道 | `nearestIndex(NaN)` → `--pos: NaN` 使 `left:calc()` 非法 | `verify.mjs` |
| 15 | 悬停刻度点不高亮 | 把**事件对象**当 `clientX` 传入，映射恒为 `NaN` | `verify.mjs` |
| 16 | 升级 0.2.1 后模型名上的「1017」徽标消失 | 子槽位 `conversation.input.model.label` 只在声明它的条目挂载期间存在 | `slots-integration.mjs` |
| 17 | 拖动到一半「变成无法选中」 | 手势依赖指针捕获，捕获一丢就再也收不到 `pointermove`；旋钮可命中又让事件目标一直变 | `verify.mjs` |
| 18 | 按住时的柔光环（按需求去掉） | 设计变更：按压只保留放大 | `verify.mjs` |

---

## 第 4b 条 · ⚡ 浮层悬停完全不显示（第 4 条并未真正修好）

### 现象

悬停 ⚡ 按钮，**什么也不出现**。不是「被裁掉一部分」，而是**整块看不到**。

### 根因

第 4 条把浮层改成 `position:fixed`，假设这样就能逃出弹层的 `overflow:hidden`。**这个假设不成立**，
因为弹层还画了官方菜单材质：

```css
.${P}-popover{ ... backdrop-filter:var(--dsw-menu-backdrop-filter); overflow:hidden }
/* 主题令牌实测值： blur(40px) saturate(150%) */
```

按 CSS 规范，**非 `none` 的 `backdrop-filter`（以及 `transform` / `filter` / `contain` / `will-change`）
会让该元素成为其后代的包含块**。于是浮层的 `position:fixed` 不再是相对视口，而是相对弹层的 padding box；
`positionTip()` 算出的视口坐标被原样当作「相对弹层」的坐标使用。真实浏览器实测：

```
想放在  top = 479            （= 按钮 top 551 − 浮层高 66 − 6）
实际落在  top = 1023          （= 弹层 top 544 + 479）
```

随后 `overflow:hidden` 把它整块裁掉。悬停其实**成功**把 `opacity` 置成了 1、`visibility` 置成了 `visible` ——
只是没有任何东西被画出来，所以从「看不出 hover 生效」推断成「hover 没触发」是错的。

### 修法

把浮层从弹层里**搬出去**，渲染成弹层的**兄弟节点**（仍在 `.cmes-root` 内）：

```
<div class="cmes-root">
  <button class="cmes-trigger">…</button>
  <section class="cmes-popover">… ⚡（不再包含浮层） …</section>
  <span role="tooltip" class="cmes-tip show">…</span>   ← 在这里
</div>
```

`.cmes-root` 上没有任何 transform / filter / backdrop-filter，`position:fixed` 重新相对视口生效
（探针实测：同一个 fixed 盒子放在弹层里报 `12,544`，放在 root 里报 `0,0`）。
因为它不再是按钮的后代，原来的 `.cmes-fast:hover [role=tooltip]` **本来就无法命中**，
所以显隐改为 `pointerenter/leave` + `focus/blur` 驱动的 `.show` 类。

顺带修掉第二个隐患：定位原本在 hover 回调里做，**首次悬停时浮层还没参与过布局**，
`offsetWidth/offsetHeight` 走的是占位值，于是它按错尺寸被摆放。改为 `useLayoutEffect` 在布局后定位。

### 断言

- 根因的两半仍在源码里（弹层确实有 `backdrop-filter` 与 `overflow:hidden`），而旧的 `:hover` 后代规则**必须消失**
- 浮层节点必须渲染在 `h('section'` **之后**，且全文件只有一个 `role: 'tooltip'`
- 显隐是 `.show` 状态类；定位在布局效应里做且读取真实 `offsetHeight`
- 浮层随弹层关闭、随面板切换收起

---

## 第 13 条 · 滑条在最右端时按住拖不动

### 现象

滑条已经在最右端时，按住旋钮往左拖，**偶尔完全不动**；换个位置按又能拖。最右端最容易复现。

### 根因

旋钮可见直径 **30px**，轨道高度只有 **26px**，所以旋钮上下各有 **2px** 悬在轨道外；
而旋钮当时是 `pointer-events:none`。在悬出来的那 2px 上按下，命中测试落在**面板**上，
`pointerdown` 从未到达轨道 —— 手势根本没开始。真实浏览器逐点实测（右端、按住后左移 60px）：

```
STUCK   knob top edge          pos 1 -> 1   hit=cmes-pane cmes-main
STUCK   knob bottom edge       pos 1 -> 1   hit=cmes-pane cmes-main
SLIDES  knob centre            pos 1 -> 0.33 hit=cmes-rail
```

右端之所以最容易中招：轨道右端的填充已经铺满，旋钮就是那一段**唯一的抓手**，指尖稍偏就落在死区。

### 修法

1.1.0 先试过「让旋钮可命中 + 加抓取带」两层。**前者是错的**，见第 17 条：旋钮一旦可命中，
拖动时它会从光标下面移走，事件目标就跟着变，反而制造了新的中断。

最终形态只有一条：把命中范围**长在轨道自己身上**。

```
.cmes-rail::before{content:"";position:absolute;inset:-6px -3px;border-radius:20px}
```

抓取带是轨道的盒，命中测试返回轨道本身；它上下各覆盖 6px，把旋钮悬出的 2px 完全包住。
旋钮保持 `pointer-events:none` —— 于是**整段手势始终落在同一个目标（轨道）上**。

### 断言

抓取带存在、`pointer-events:none` 仍在旋钮上、`nearestIndex` 对非有限数有保护。
浏览器逐点复测右端 8 个抓取点（旋钮中心 / 上下边缘 / 轨道上下悬出 / 轨道右边缘 / 旋钮右边缘 /
轨道左侧）全部可拖，且命中目标全部是 `cmes-rail`。

---

## 第 14 条 · 无坐标的释放把旋钮甩出轨道

### 现象

（潜在缺陷）某些释放路径下旋钮会瞬间跳到轨道外面。

### 根因

`finish()` 用 `nearestIndex(event ? event.clientX : NaN)`。没有坐标时 `NaN` 一路穿过
`fractionAt` → `nearestIndex` → `stopFraction` → `--${P}-pos: NaN`，
而 `left:calc((100% - 30px)*NaN)` 是**非法值**，声明被丢弃，旋钮退回 `left:auto`。
第 13 条的窗口级兜底正好会调用「无事件」的 `finish()`，所以这条必须先修。

### 修法

无坐标时解析到**当前档位**（`known ? nearestIndex(event.clientX) : index`），
`nearestIndex` 也加了 `Number.isFinite` 保护。

### 断言

`finish` 里有 `Number.isFinite(event.clientX)`、回落表达式、且**去掉注释后**函数体里不再出现 `NaN`。

---

## 第 15 条 · 悬停刻度点不高亮

### 现象

（潜在缺陷）指针掠过某个刻度点时，本该放大的刻度点毫无反应。

### 根因

`pointerMove` 的非拖动分支把**事件对象**传给了只接受坐标的函数：

```js
const i = nearestIndex(event);        // 应该是 event.clientX
```

`(eventObj - box.left - 15)` 是 `NaN`，于是 `tickX` 是 `NaN`、比较恒假，`setHovered(-1)` 永远成立。

### 修法

改传 `event.clientX`。

### 断言

源码里存在 `nearestIndex(event.clientX)`，且**不存在** `nearestIndex(event)`。

---

## 第 16 条 · 升级 0.2.1 后模型名上的徽标消失

### 现象

DSH 从 `0.2.0-rc.2` 升到 `0.2.1-rc.2` 后，被装饰过的模型名（如内置「1017」徽标）不再出现，
**控制台没有任何报错**。

### 根因

0.2.1 的席位条目要**声明自己的子槽位**，而且子槽位只在**声明它的那一条挂载期间**存在：

```js
// 官方 dsh-client-ui-model-selection：
scope.slots.register({
  name: 'conversation.input.model',
  children: { 'conversation.input.model.label': { kind:'single', scope:'session', inline:true } },
  inject: …
}, ModelSelect);
```

内置 `dsh-client-ui-deepseek-model-label-1017` 通过 `ctx.slots.inject('conversation.input.model.label', …)`
往这个子槽位注册。本插件以 `priority:-1` 遮蔽了父席位却没声明子槽位 → 子槽位不存在 →
`slots.inject` 的回调**永远不会被调用**，装饰静默消失。

### 修法

遮蔽时**声明同样的子槽位**（`{kind:'single', scope:'session', inline:true}`），并把它**渲染出来**
（trigger 用 `placement:'trigger'`、模型行用 `placement:'option'`，无贡献时回退到目录模型名）。
声明 children 后渲染器才会把 `renderSlot` 注入组件；0.2.0 没有这个绑定，调用处做了条件化。

### 断言

`test/slots-integration.mjs` 从随包发布的官方源码里**读出**官方声明的子槽位集合，
与本插件声明的集合逐一比对，并核对 `kind/scope/inline` 三元组与两处 `renderSlot` 调用；
0.2.1 不再单独发布 `@deepseek-ai/dsh-client-ui-slots`，因此「实例化真实 SlotCore」的两条断言自动 skip，
只有在仍能读到该包的环境里才执行。

---

## 第 17 条 · 拖动到一半「变成无法选中」

### 现象

按住旋钮拖动，拖到中途滑条突然不再跟手、松手也不提交，看起来像「从按住状态掉成了无法选中」。
1.1.0 修完第 13 条后**反而更频繁**，而且**任意位置**都可能出现。

### 根因

两个原因叠加，第二个是 1.1.0 自己引入的。

1. **手势的所有权押在了指针捕获上。** 代码在 `pointerdown` 里 `setPointerCapture`，之后靠轨道上的
   `onPointerMove` 跟手。可捕获并不牢靠：捕获元素被替换、按下触发**原生拖拽或文字选择**、
   指针移出窗口、浏览器决定接管手势 —— 都会派发 `pointercancel` / `lostpointercapture`。
   一旦如此，轨道再也收不到 `pointermove`，拖动**当场卡死**；而 `lostpointercapture`
   当时被显式忽略（"capture loss is not a cancel"），于是既不结算也不跟手。
2. **1.1.0 把旋钮改成了可命中元素。** 拖动时旋钮会跟着数值**从光标下面移走**，
   于是指针下的元素在「旋钮 / 填充 / 轨道 / 面板」之间不断切换。捕获正常时看不出问题，
   一旦捕获丢失（原因见上），事件就落到别的元素上 —— 这正是「任意位置都会断」的来源。

### 修法

把手势的**所有权从「轨道 + 指针捕获」搬到 document**，并让事件目标固定：

```js
// 拖动期间：document 捕获阶段监听，捕获丢了也照样跟手
document.addEventListener('pointermove', move, true);
document.addEventListener('pointerup', up, true);
document.addEventListener('pointercancel', cancel, true);
window.addEventListener('blur', blur);          // 窗口外松手也能结算
```

- 按下时 `event.preventDefault()`，掐掉会引发 `pointercancel` 的原生拖拽/选择默认行为；
- 只认发起手势的 `pointerId`（`owns(e)`），多指不会互相打断；
- 轨道的 `onPointerMove` 退化为**只做悬停高亮**（`if (dragRef.current) return`），
  拖动分支只由 document 那一处执行 —— 每个 `pointermove` 恰好应用一次；
- 指针捕获降级为「顺手取一下」，不再承担正确性；
- 旋钮恢复 `pointer-events:none`，抓取带（第 13 条）继续覆盖它悬出的部分 ——
  整段手势的目标恒定是轨道。

### 断言

document 三个监听 + `blur` 兜底存在、`pointerId` 所有权判断存在、`preventDefault()` 存在、
轨道 handler 在拖动时早退、旋钮仍不可命中。

浏览器实测（伪造最坏情况）：拖动中途强制 `releasePointerCapture` 后再移动，
滑条仍逐像素跟手，拖到轨道下方 220px 再拖回来也正常，松手正确提交。

---

## 第 18 条 · 按住时的柔光环（设计变更）

### 现象

按住旋钮时，除了放大，还有一圈向外扩散的柔光环。

### 处理

按需求**去掉光环、只保留放大**：删除 `box-shadow: 0 0 0 7px …` 那层外扩，
按压只剩 `transform:scale(1.16)`，松手沿回弹曲线回位。

### 断言

按住时的 `box-shadow` 必须与静止时**逐像素相同**（实测：两串计算值完全一致），
且源码里不得再出现 `pressRing` 或按压态的 `box-shadow`。

---

## 第 1 条 · 点一个分组，全部一起展开

### 现象

点一个**折叠着**的 provider 分组，**所有**分组同时展开；再点一次又全部收起。

### 根因

旧实现用一个 `Set` 保存折叠状态，但两半的读法**互相矛盾**：

```js
// 写入侧：把 Set 当作「已展开的 id」集合
if (cur) next.add(gid);          // 展开 -> 加入
else     next.delete(gid);       // 收起 -> 移除

// 读取侧：把同一个 Set 当作「已收起的 id」集合
return !collapsedIds.has(gid);   // 不在集合里 == 展开
```

第一次点击一个折叠分组时：写入侧算出「当前是折叠 → 应展开」，执行 `next.add(gid)`；读取侧把「在集合里」解释成「已收起」，于是对刚加进去的那个 id 返回 `false`（收起），对其余所有 id 返回 `true`（展开）。集合里只有一个 id，读取侧就认为「只有一个分组是收起的，其他都是展开的」—— **全部展开**。

这个 bug 的形状不是「状态错了」，而是**同一个状态被两种语义读取**。任何「再补一个字段」「再加一次同步」的修法都只会加深矛盾。

### 修法

不再用折叠集合，改为参照 [Bai-2008/a-better-dsh-codex-effort-slider](https://github.com/Bai-2008/a-better-dsh-codex-effort-slider) 的**两级下钻**：一个 `view` 页码 + 一个 `subProvider` id。

```js
const [view, setView] = useState(1);                    // 1 = provider 列表，2 = 某 provider 的模型
const [subProvider, setSubProvider] = useState(null);

function enterProvider(gid) { setSubProvider(gid); setQuery(''); setHighlight(0); setView(2); }
function goBack()            { setView(1); setSubProvider(null); setQuery(''); setHighlight(0); }
```

「哪个分组是打开的」现在由 `view === 2 && subProvider === gid` 单点定义，而不是由某个集合的成员关系**推断**出来。两半不可能再对同一个状态有两种解释。

### 断言

`test/collapse-regression.mjs` 里**同时实现了有 bug 与修好后的两个状态机**：

```js
check('the buggy model really does expand everything on one click', () => {
  const m = buggy('A');
  assert.equal(m.isExpanded('B'), false, 'B starts collapsed');
  m.toggle('B');                                  // 用户点击 COLLAPSED 分组
  const opened = m.groups.filter(m.isExpanded);
  assert.deepEqual(opened, ['A', 'B', 'C'], 'buggy model opens all three');
});

check('the fixed model opens exactly one provider', () => {
  const m = fixed('A');
  assert.deepEqual(m.groups.filter(m.isOpen), [], 'nothing is drilled in initially');
  m.enter('B');
  assert.deepEqual(m.groups.filter(m.isOpen), ['B'], 'exactly B, not all three');
});
```

先证明有 bug 的版本确实会「一次全开」，再证明修好后的版本不会 —— 这样这个 bug 的**形状**不可能再悄悄回来。另外四条断言源码里反转读法与旧标识符已彻底消失：`!collapsedIds\.has\(`、`collapsedIds`、`toggleGroup`、`next\.add\(gid\)`。`verify.mjs` 从另一侧钉住同一个不变量：`assert.doesNotMatch(src, /!collapsedIds\.has/)` 与 `assert.match(src, /if \(view !== 2 \|\| !activeProvider\)/)`。

---

## 第 2 条 · 界面「从上面收回」

### 现象

打开弹层 → 切到模型列表（面板变高）→ 关闭 → 重新打开。弹层高度从**列表高度**动画回 104px，视觉上是「界面从上面收回」。同时下钻状态残留：重开后还在某个 provider 的模型列表里。

### 根因

`close()` 只关了 `open`，没有重置 `pane`：

```js
function close() {
  cancelDrag();
  setOpen(false);
  setQuery('');
  /* 这里少了 pane 与下钻状态的重置 */
}
```

popover 高度由 `--cmes-height` 驱动，值是 `pane === 'models' ? cappedHeight : 104`。`pane` 停留在 `'models'`，重开时 CSS 的 `transition:height .2s cubic-bezier(.2,.8,.2,1)` 就把高度从列表高度动画到 104px —— 一段用户没要求过的动画。

### 修法

`close()` 复位全部视野状态，与官方行为一致（官方总是从强度面板打开）：

```js
setPane('effort'); setView(1); setSubProvider(null); setHighlight(0);
triggerRef.current?.focus({ preventScroll: true });
```

`setPane('effort')` 让 `--cmes-height` 在下一次打开时**已经是** 104px，没有可动画的差值；`setView(1)` / `setSubProvider(null)` 清掉下钻残留。

### 断言

`verify.mjs` 从 `close()` 的函数体里取出源码再断言：

```js
const closeFn = src.match(/function close\(\) \{([\s\S]*?)\n      \}/);
assert.match(closeFn[1], /setView\(1\)/, 'view reset');
assert.match(closeFn[1], /setSubProvider\(null\)/, 'sub-provider reset');
```

高度公式本身也被断言：`assert.match(src, /\$\{pane === 'models' \? cappedHeight : 104\}px/)`。

---

## 第 3 条 · 只有 Ultra 有特殊颜色

### 现象

滑条在轻度 / 中 / 高 / 极高四档外观完全相同；只有 Ultra 换色。收起态的席按钮同样只有 Ultra 才变色，因此点开菜单前看不出强度。

### 根因

填充与标题是**写死的单色**（`#3a83f7`），Ultra 走一条独立的 `.peak` 分支。颜色不是从档位派生的，所以档位本身没有视觉区分度。

### 修法

引入按档位派生的色板，填充 / 轨道底色 / 标题 ink / 刻度点 / 收起态按钮**全部**从当前档位派生：

```js
style: {
  [`--${P}-fill`]:  fillFor(displayed),
  [`--${P}-track`]: mixHex('#e8e7e8', fillFor(displayed), 0.22),
  [`--${P}-ink`]:   inkFor(displayed),
  [`--${P}-dot`]:   'var(--dsw-alias-label-caption,#b6b6b8)',
  [`--${P}-pos`]:   fraction
}
```

轨道底色用 `mixHex` 把未填充段朝当前档位的填充色混 22%，因此轨道本身也读得出「现在是哪一档」。排序轴是**色相**（蓝 `216.6°` → 紫罗兰 `263.9°` 单调推进），而不是亮度 —— 见 [ARCHITECTURE.md 的色彩一节](./ARCHITECTURE.md#色彩)。

### 断言

`palette.mjs` 从源码里读出真实色值再算：

```js
check('every fill is visible against the unfilled rail (>= 2.5)', () => {
  for (const k of LEVELS) assert.ok(cr(FILL[k], RAIL) >= 2.5, `${k} vs rail < 2.5`);
});
check('hue advances monotonically blue -> violet (the real ordering axis)', () => { /* ... */ });
check('every level has a DISTINCT fill (no accidental duplicates)', () => { /* ... */ });
```

`verify.mjs` 断言五个实测色值仍在源码里：

```js
for (const c of ['#3a83f7', '#3b83f6', '#a779fe', '#7448ee', '#8b46ee']) {
  assert.ok(src.includes(c), `missing ${c}`);
}
```

---

## 第 4 条 · ⚡ 的说明浮层被遮挡

### 现象

悬停 ⚡ 按钮时，说明浮层（「1.5 倍速 / 用量更多 / (仅视觉效果)」）被弹层裁掉一部分。

### 根因

浮层是弹层的**子元素**，而弹层有 `overflow:hidden`（为了圆角与面板滑入动画必须保留）。浮层定位在按钮上方、超出弹层边界，于是被裁。

### 修法

改为 `position:fixed` 的**视口层**，由 JS 动态定位到按钮上方并夹进视口：

```css
.cmes-tip{position:fixed;z-index:1400;padding:6px 9px;white-space:nowrap;
  background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));
  box-shadow:var(--dsw-elevation-panel);border-radius:8px;
  font-size:12px;line-height:18px;text-align:center;
  color:var(--dsw-alias-label-primary);
  opacity:0;visibility:hidden;pointer-events:none;
  transition:opacity .12s ease,visibility 0s .12s}
```

```js
function positionTip(event) {
  const tip = tipRef.current;
  const btn = event?.currentTarget ?? fastBtnRef.current;
  if (!tip || !btn) return;
  const r = btn.getBoundingClientRect();
  const tw = tip.offsetWidth || 160;
  const left = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, window.innerWidth - tw - 8));
  tip.style.left = `${left}px`;
  tip.style.top  = `${Math.max(8, r.top - (tip.offsetHeight || 56) - 6)}px`;
}
```

左右都被夹进视口（`Math.max(8, Math.min(..., innerWidth - tw - 8))`），上方同样 `Math.max(8, ...)`，所以即使按钮贴着窗口顶边，浮层也不会跑到屏幕外。

显示/隐藏是**纯 CSS** 驱动的，不需要 JS 悬停状态（`.cmes-fast:hover [role=tooltip]` 与
`.cmes-fast:focus-visible [role=tooltip]` 都置 `opacity:1;visibility:visible`）。
`transition` 里 `visibility 0s .12s` 是刻意的：淡出时延迟 120ms 再切 `visibility`，避免浮层在淡出过程中就消失。

### 断言

`positionTip` 挂在按钮的 `onMouseEnter` 与 `onFocus` 两处，键盘用户同样能看到。`make-preview.mjs` 把浮层强制显示出来做视觉对照：

```js
${effortPane(2).replace('class="' + P + '-tip"',
   'class="' + P + '-tip" style="opacity:1;visibility:visible;left:60px;top:-4px"')}
```

---

## 第 5 条 · 拖动不平滑、不跟手

### 现象

按住旋钮拖动时，旋钮一格一格跳，不跟指针走。

### 根因

拖动期间每次 `pointermove` 都直接吸附到最近的**离散档位**，所以 218px 的行程上只有 N−1 个可停位置。指针在两个档位之间移动时，旋钮不动。

### 修法

拖动期间写**原始小数**（连续跟手），松手才吸附：

```js
function paintLive(frac) {
  const rail = railRef.current;
  if (!rail) return;
  rail.style.setProperty(`--${P}-pos`, String(frac));
}

// pointerMove 的拖动分支
const frac = fractionAt(event.clientX);
liveRef.current = frac;
paintLive(frac);                     // 连续跟手，不吸附
const i = Math.round(frac * (efforts.length - 1));
const id = efforts[i]?.id;
if (id && id !== previewRef.current) showEffort(id);
```

吸附只发生在 `finish` 里（见第 9 条）。拖动期间还要关掉 CSS 过渡，否则会拖出橡皮筋感：

```css
.cmes-rail.dragging .cmes-knob{transition:none}
.cmes-rail.dragging .cmes-fill{transition:none}
.cmes-rail.dragging{cursor:grabbing}
```

### 断言

`verify.mjs` 断言 `paintLive` 写的是原始分数、`pointerMove` 在拖动分支里调它、吸附只在 `finish` 里发生：

```js
assert.match(src, /function paintLive\(frac\)[\s\S]*?setProperty\(`--\$\{P\}-pos`, String\(frac\)\)/);
assert.match(src, /if \(dragRef\.current\) \{[\s\S]*?paintLive\(frac\)/, 'move tracks pointer');
assert.match(src, /function finish\(event\)[\s\S]*?nearestIndex\(event \? event\.clientX : NaN\)/);
```

---

## 第 6 条 · 有时无法选中（三个独立缺陷）

### 现象

滑条**有时候**拖不动、点了没反应；快速拖完松手后，界面显示的档位从未真正提交。间歇性出现，难以稳定复现。

### 根因

三个独立缺陷叠加，任何一个都足以造成「有时」：

**6a · `setPointerCapture` 抛错中断了 `pointerdown`。** `dragRef` 在它**之后**才设置，所以一旦抛错就完全拖不动：

```js
// 旧代码
event.currentTarget.setPointerCapture(event.pointerId);   // 可能抛
dragRef.current = true;                                    // 永远到不了这里
```

**6b · `onLostPointerCapture` 误调 `cancelDrag`。** 指针捕获丢失被当成取消，于是回滚而非提交 —— 用户明明选好了，结果弹回原位。

**6c · 在途提交被 `busyRef` 静默丢弃。** 快速拖完松手时，若上一次提交还在跑，这一次就被丢掉：

```js
// 旧代码
if (busyRef.current) return;   // 这一行把「最后一次选择」吃掉了
```

界面显示的是 `preview`，但 `select()` 从未收到那个档位。

### 修法

**6a** 用 `try/catch` 兜住捕获，无论成败都继续：

```js
/* BUG FIX (issue 6): capture can throw if the pointer is already gone
 * (or the element was re-rendered); an uncaught throw here aborted the
 * handler *before* dragRef was set, which is exactly the "sometimes I
 * cannot grab it" symptom. Guard it and keep going. */
try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* non-fatal */ }
dragRef.current = true;
```

**6b** 把捕获丢失处理成空操作，注释直接写明语义：

```js
onLostPointerCapture: () => { /* capture loss is not a cancel */ },
```

真正的取消只有两个来源：`onPointerCancel` → `cancelDrag`，以及 `close()` 的第一句。

**6c** 改为**合并**：记住最新意图，当前请求结束后继续提交，因此「最后一次选择必定落地」：

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
} catch (cause) { /* ... */ }
```

### 断言

```js
check('in-flight commits coalesce instead of being dropped', () => {
  assert.match(src, /pendingRef\.current = next;/, 'newest intent remembered');
  assert.match(src, /if \(busyRef\.current\) return;/, 'only the first runs the loop');
  assert.match(src, /while \(pendingRef\.current\)/, 'queued intent is drained');
});
```

6b 由源码文本直接核对（`onLostPointerCapture: () => { /* capture loss is not a cancel */ }`）。

### 附带 · 6d 与 6e（自查发现，与 6 号同源）

**6d · `pointerDown` 用 `busyRef` 拦了一道。** 提交期间整条轨道变成不可抓，这正是「有时候拖不动」的另一半原因。提交既然会合并，就没有理由拦住新的拖动。现改为只以「真正不可交互」为条件设闸：

```js
function pointerDown(event) {
  /* Deliberately NOT gated on `busyRef`. An in-flight commit must never
   * make the rail ungrabbable — that was a large part of the "sometimes
   * I cannot grab it" symptom. Commits coalesce, so a drag started during
   * one simply supersedes it. Only a genuinely non-interactive rail
   * (disabled session / single level) refuses the gesture. */
  if (disabled || efforts.length < 2) return;
  /* ... */
}
```

断言方式比较特别 —— 它从源码里**取出 `pointerDown` 的函数体**再断言里面不含 `busyRef.current`：

```js
const pd = src.match(/function pointerDown\(event\) \{([\s\S]*?)\n      \}/);
assert.doesNotMatch(pd[1], /busyRef\.current/, 'pointerDown must not gate on busyRef');
```

注意这是**局部**断言：整个文件里 `busyRef.current` 当然存在（`commit()` 用它），只有 `pointerDown` 里不能有。全局断言做不到这一点。

**6e · 拖动时写像素值，React 写 `calc()`。** 旧实现把**像素值**写进两个变量（`--cmes-knob-x`、`--cmes-w`），而 React 渲染时写的是 `calc()`。两者是同一个属性，React 可能不会重新写回，**旋钮会卡在拖到的位置不吸附**。现改为只驱动**一个无单位的 `--cmes-pos` 分数**（0..1）：

```js
/* one unitless fraction drives both knob and fill */
[`--${P}-pos`]: fraction
```

```js
assert.doesNotMatch(src, /--\$\{P\}-knob-x/, 'knob-x pixel var must be gone');
assert.doesNotMatch(src, /--\$\{P\}-w,/, 'fill width pixel var must be gone');
```

---

## 第 7 条 · 看不出当前模型在哪个分组

### 现象

模型列表第一级是纯 provider 名，看不出当前模型住在哪一组，用户得逐个点进去找。

### 根因

第一级没有活动标记。而在两级下钻里，**下钻到哪个 provider** 与**当前模型属于哪个 provider** 是两件不同的事 —— 前者是临时导航状态，后者是持久选择状态。

### 修法

加一个蓝色小圆点，**按 `selection.provider` 判定**（不是按下钻状态）：

```js
const isCurrent = selection?.provider === g.id;
h('span', { className: `${P}-rowDot`, hidden: !isCurrent, 'aria-hidden': true })
```

```css
.cmes-rowDot{flex:none;width:6px;height:6px;border-radius:50%;background:#3a83f7;
  box-shadow:0 0 0 3px rgba(58,131,247,.16)}
```

用 `hidden` 属性而不是条件渲染，行高不会因为标记有无而变化。蓝点 `aria-hidden` —— 它表达的信息在第二级的勾选标记里已经有了，屏幕阅读器不必读两遍。

### 断言

```js
check('ISSUE 1: the active provider is marked with a blue dot', () => {
  assert.match(src, /\$\{P\}-rowDot\{[^}]*border-radius:50%;background:#3a83f7/, 'dot style');
  assert.match(src, /className: `\$\{P\}-rowDot`, hidden: !isCurrent/, 'dot only on the current provider');
  // keyed off the SELECTION, not off which provider is drilled into
  assert.match(src, /const isCurrent = selection\?\.provider === g\.id;/, 'keyed on selection');
});
```

「按 selection 判定」被单独断言，因为按下钻状态判定看起来也「能用」—— 用户下钻时那个点会跟着走，直到他发现关掉再打开时点跑到了错的地方。位置断言见第 11 条。

---

## 第 8 条 · 最底下的分组被遮挡、滚轮没反应

### 现象

provider 多到装不下时，**最后一行被裁掉**，且滚轮没有任何反应 —— 那个分组永远点不到。

### 根因

三个问题叠在一起：

**8a · `.cmes-pane` 用 `bottom:0` 定位但没有 `top`。** 高度是内容撑的：

```css
/* 旧代码 */
.cmes-pane{position:absolute;left:0;right:0;bottom:0;/* 没有 top */}
```

于是 `.cmes-models{height:100%}` 解析成 `auto`，**整条 flex 链失去确定高度**，`min-height:0` 无从生效，内部滚动容器分不到可用空间。

**8b · 第一级（provider 列表）根本没有滚动容器。** 页面被 `overflow:hidden` 裁掉后滚不回来。

**8c · 弹层高度按内容算**，长列表会超过窗口可用空间。

### 修法

给 pane 钉 `top:0` 拿到确定高度：

```css
/* Issue 2 fix: the pane is anchored with bottom:0 but no top, so its height is
   content-driven. That made the models pane's height:100% resolve to auto, the
   whole flex chain lost its definite height, and a long provider list simply
   overflowed the popover and got clipped with nothing to scroll. Pinning top:0
   gives the pane a definite height so min-height:0 on the descendants can
   actually hand the leftover space to the row list. */
.cmes-models{top:0;height:100%;padding:10px;overflow:hidden;
  display:flex;flex-direction:column}
```

每一页做成 `height:100%` 的 flex 列，行列表加 `flex:1 1 auto; min-height:0; overflow-y:auto`：

```css
.cmes-viewport{position:relative;overflow:hidden;
  transition:height .3s cubic-bezier(.32,.72,.28,1);flex:1 1 auto;min-height:0}
.cmes-page{position:absolute;top:0;left:0;width:100%;height:100%;
  display:flex;flex-direction:column;overflow:hidden;
  transition:transform .3s cubic-bezier(.32,.72,.28,1)}
.cmes-rows{flex:1 1 auto;min-height:0;overflow-y:auto;
  overscroll-behavior:contain;padding:0 2px 4px}
```

`overscroll-behavior:contain` 防止滚到边界后把滚动传给宿主页面。弹层高度夹到触发器上方的可用空间，保证滚动容器**始终有高度可分**：

```js
const roomAbove = typeof window === 'undefined'
  ? Infinity
  : Math.max(120, window.innerHeight - bottomVar - 24);
const cappedHeight = Math.min(menuHeight, roomAbove);
```

`Math.max(120, ...)` 是下限：即使窗口很矮，也留 120px 而不是压到 0。

### 断言

```js
check('ISSUE 2: every page list is its own scroller', () => {
  assert.match(src, /\$\{P\}-models\{top:0;height:100%/, 'pane pinned top:0 for a definite height');
  assert.match(src, /\$\{P\}-viewport\{[^}]*min-height:0/, 'viewport min-height:0');
  assert.match(src, /\$\{P\}-page\{[^}]*height:100%;display:flex;flex-direction:column;overflow:hidden/);
  assert.match(src, /\$\{P\}-rows\{flex:1 1 auto;min-height:0;overflow-y:auto/, 'page-1 scroller');
  assert.match(src, /h\('div', \{ className: `\$\{P\}-rows` \}, \.\.\.providerNodes, \.\.\.noticeNodes\)/);
  assert.match(src, /const cappedHeight = Math\.min\(menuHeight, roomAbove\)/, 'height is capped');
  assert.match(src, /\$\{pane === 'models' \? cappedHeight : 104\}px/, 'capped height applied');
});
```

**高度常量也在这个 bug 的因果链里**：行高常量比真实值小 3px 时，第一级最后一行会被 `overflow:hidden` 裁掉。所以 `verify.mjs` 断言常量与 CSS 声明必须一致：

```js
assert.match(src, /const ROW_H = 41, MODEL_H = 39, LIST_MAX_H = 252, LIST_PAD_B = 4;/, 'row constants');
assert.match(src, /\$\{P\}-row\{[^}]*padding:10px;border-radius:10px/, 'row padding 10 (=> 41 high)');
assert.match(src, /\$\{P\}-model\{[^}]*padding:9px 10px;border-radius:9px/, 'model padding 9 (=> 39 high)');
assert.match(src, /\$\{P\}-list\{[^}]*max-height:252px/, 'list cap matches');
```

---

## 第 9 条 · 滑条能停在任意位置

### 现象

松手后旋钮**停在手指松开的位置**，不回落到最近的档位点。不是每次都出现 —— 只在「松手落到的档位 == 拖动时最后预览的档位」时出现。

### 根因

拖动时 `paintLive` 把 `--cmes-pos` 写成**原始小数**。松手落到的那一档如果**恰好等于拖动时最后预览的那一档**：

1. `chooseEffort(id)` 里 `if (id !== savedEffort) void commit(...)` —— `preview` 已经是这个 id，`showEffort(id)` 里 `setPreview(id)` 的值没变；
2. React 对**相同的 state 值**会 **bail out**（跳过重渲染）；
3. 于是没有任何代码把 `--cmes-pos` 从原始小数改回吸附分数；
4. 旋钮就停在手指松开的位置。

这是最容易漏的一类 bug：**逻辑是对的，视觉是错的**，因为「视觉更新」被委托给了「React 会重渲染」这个并不成立的前提。

### 修法

`snapLive(i)` 在**释放路径**里显式写回吸附分数，不依赖 React 一定会重渲染：

```js
/** Force the knob onto a stop, bypassing React's bail-out. */
function snapLive(i) {
  const rail = railRef.current;
  if (!rail) return;
  rail.style.setProperty(`--${P}-pos`, String(stopFraction(i)));
}
```

三条释放路径都调用它：

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
  /* ... */
  snapLive(index);      // 回滚到「已提交」的档位，不是原始像素位置
}
function keyDown(event) {
  /* ...算出 i... */
  snapLive(i);          // 键盘移动本来就落在档位上，同样显式写回
  const target = efforts[i];
  if (target) chooseEffort(target.id);
}
```

`cancelDrag` 回滚到的是**已提交的档位** `index`，而不是拖动开始前的原始像素位置 —— 取消应该是「什么都没发生」，而不是「回到半个档位」。`--cmes-pos` 是单一的无单位分数变量（见第 6e 条），旋钮与填充都从它派生，所以一次写回同时修正两者。

### 断言

```js
check('ISSUE 3: the knob always settles on a stop on release', () => {
  assert.match(src, /function snapLive\(i\)[\s\S]*?setProperty\(`--\$\{P\}-pos`, String\(stopFraction\(i\)\)\)/);
  assert.match(src.match(/function finish\(event\) \{([\s\S]*?)\n      \}/)[1], /snapLive\(i\)/, 'finish snaps');
  assert.match(src.match(/function cancelDrag\(\) \{([\s\S]*?)\n      \}/)[1], /snapLive\(index\)/, 'cancel rolls back');
  assert.match(src.match(/function keyDown\(event\) \{([\s\S]*?)\n      \}/)[1], /snapLive\(i\)/, 'keyboard snaps');
  assert.match(src, /function stopFraction\(i\)/, 'stop fraction helper');
});
```

三条路径**分别**断言，因为修好其中一条并不能保证另外两条也修好了 —— 而键盘路径最容易被忘掉（它本来就在档位上，看起来不需要吸附）。

---

## 第 10 条 · 第一级每行右侧的灰色模型名是冗余的

### 现象

第一级 provider 行的右侧有一列灰色文字，显示「该 provider 当前选中的模型名」。但它和雪弗龙挤在一起，读起来像第二个标签，而且信息重复。

### 根因

第二级已经完整列出该 provider 的模型并标勾选，第一级再显示一遍是**信息冗余**。冗余本身还不是最大的问题：它占据的正是行右侧那个「状态位」，与蓝点争位置。

### 修法

**移除**右侧灰色文字。第一级只留 provider 名 + 蓝点 + 雪弗龙：

```js
h('span', { className: `${P}-rowName` }, g.name),
h('span', { className: `${P}-rowDot`, hidden: !isCurrent, 'aria-hidden': true }),
icon('chevron', `${P}-rowChev`)
```

### 断言

删除的是一整个 CSS 类（`.cmes-rowCur`）与它的渲染节点，所以断言方式是**断言它不存在**：

```js
check('page 1 rows show the provider name + chevron (no gray model text)', () => {
  assert.doesNotMatch(src, /\$\{P\}-rowCur/, 'current-model column removed');
  assert.doesNotMatch(src, /\$\{P\}-rowCur\{/, 'current-model style removed');
  assert.match(src, /\$\{P\}-rowChev/, 'chevron');
});
```

「名字吸收剩余空间」是这次移除的**前提**：只有名字 `flex:1`，蓝点和雪弗龙才会被一起推到右边缘。

```js
assert.match(src, /\$\{P\}-rowName\{flex:1 1 auto;min-width:0;overflow:hidden/, 'name fills the row');
assert.match(src, /aria-expanded': view === 2 && subProvider === g\.id/, 'expanded state');
```

---

## 第 11 条 · 蓝点在 provider 名左侧

### 现象

蓝点渲染在 provider 名的**左侧**，与「状态在右」的阅读习惯相反 —— 眼睛在行的右侧找状态，结果状态在最左边。

### 根因

渲染顺序决定了位置。旧顺序把标记放在名字之前：

```js
// 旧顺序
h('span', { className: `${P}-rowDot`, ... }),
h('span', { className: `${P}-rowName` }, g.name),
icon('chevron', `${P}-rowChev`)
```

### 修法

蓝点移到行**右侧**：名字之后、雪弗龙之前。渲染顺序就是第 10 条修法里给出的那一份（`rowName` → `rowDot` → `rowChev`），名字 `flex:1` 把蓝点和雪弗龙一起推到右边缘。

### 断言

这条断言**不读 CSS，读的是渲染顺序** —— 它从源码里取出 `providerNodes` 的构造块，再比较三个类名第一次出现的下标：

```js
const row = src.match(/const providerNodes = groups\.map\(g => \{[\s\S]*?\n      \}\);/);
const nameAt = row[0].indexOf('${P}-rowName');
const dotAt  = row[0].indexOf('${P}-rowDot');
const chevAt = row[0].indexOf('${P}-rowChev');
assert.ok(nameAt < dotAt, 'dot comes AFTER the name (right side)');
assert.ok(dotAt < chevAt, 'dot comes BEFORE the chevron');
```

顺序断言是必要的：CSS 只描述样式，**位置由 JSX 顺序决定**，读 CSS 永远查不出这个问题。而 `.cmes-row` 是 `justify-content:space-between`，即使顺序错了外观也「像那么回事」—— 只是点跑到了左边。

---

## 关于回归测试的一条设计说明

`test/collapse-regression.mjs` **同时实现了有 bug 与修好后的两个状态机**：

```js
/* ---------- the BUGGY model, kept to prove the failure is real ---------- */
function buggy(selected = 'A') {
  const groups = ['A', 'B', 'C'];
  let expanded = null;   // null = default; else a Set
  const isExpanded = gid => expanded === null ? gid === selected : !expanded.has(gid);
  const toggle = gid => {
    const base = expanded ? new Set(expanded) : null;
    const cur = base ? !base.has(gid) : (gid === selected);
    const next = new Set(base ?? []);
    if (cur) next.add(gid); else next.delete(gid);
    expanded = next;
  };
  return { groups, isExpanded, toggle };
}

/* ---------- the FIXED model (what ships) ---------- */
function fixed(selected = 'A') {
  const groups = ['A', 'B', 'C'];
  let view = 1;              // 1 = provider list, 2 = models of subProvider
  let subProvider = null;
  const isOpen = gid => view === 2 && subProvider === gid;
  const enter = gid => { subProvider = gid; view = 2; };
  const back = () => { view = 1; subProvider = null; };
  return { groups, isOpen, enter, back };
}
```

**为什么要有 bug 版本。** 只测「修好后的版本不会全开」无法区分两种情形：

| 情形 | 只测好版本的结论 | 同时测 bug 版本的结论 |
|---|---|---|
| 状态机确实修好了 | 通过 | 通过（好版本通过、bug 版本失败） |
| 测试根本没走到那条路径 | **通过**（假阳性） | bug 版本也「通过」→ 暴露测试无效 |

换句话说，bug 版本是**测试自身的对照组**：它必须失败，才能证明这个测试真的能捕获那个失败。这也让「这个 bug 的形状」以可执行的形式留在了仓库里 —— 任何人重构状态机时，只要重新引入「同一个集合被两种语义读取」，第一条断言就会响。配套的四条断言（`fixed` 只开一个、切换 provider 时仍只开一个、`back` 回到列表、源码里反转读法已消失）覆盖了修好后的行为与源码形状两个层面。完整列表见 [ARCHITECTURE.md 的测试台策略](./ARCHITECTURE.md#测试台策略)。
