# dsh-codex-model-effort-selector

> A **Codex-desktop-style "model + reasoning effort" selector** for
> [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH):
> it replaces the compact model seat above the composer with a Codex-style
> popover — one trigger, two panes.

![version](https://img.shields.io/badge/version-1.0.1-blue?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![tests](https://img.shields.io/badge/tests-93%20passing-brightgreen?style=flat-square)
![dsh](https://img.shields.io/badge/DSH-0.2.0--rc.2-5b6ef5?style=flat-square)
![platform](https://img.shields.io/badge/platform-Windows-0078d4?style=flat-square)

![Rendered preview of the plugin](docs/images/hero.png)

> This image and every other screenshot below are rendered from the plugin's
> **real CSS and class names**, extracted verbatim from `client.js` by
> `test/make-readme-shots.mjs` (only the React runtime is replaced). They are not
> hand-drawn mockups.

[中文说明](README.md) · **English**

---

## Table of contents

- [What it is](#what-it-is)
- [Features](#features)
  - [Dark mode](#dark-mode)
- [Install](#install)
- [Usage](#usage)
- [Compatibility & known limitations](#compatibility--known-limitations)
- [Development](#development)
- [Project layout](#project-layout)
- [Docs](#docs)
- [FAQ](#faq)
- [Credits & license](#credits--license)

---

## What it is

DSH ships a tiny model button above the composer. This plugin **takes over that
seat** (via `priority: -1`) and opens a Codex-style popover with two panes:

| Pane | Contents |
|---|---|
| **Reasoning effort** | A pixel-replica Codex effort slider: evenly spaced stops, one colour per stop, a violet stardust rail at Ultra |
| **Model list** | A provider-grouped two-level drill-down (provider → models + search), each row badged with its level count |

One trigger drives both, exactly like the Codex desktop app.

**The geometry is not eyeballed.** Card height, rail position and size, knob
diameter, tick dots and row pitch were all measured **frame-by-frame from a
93-frame recording of the Codex desktop app** (the recording is 1.385×, so
`CSS px = recorded px ÷ 1.385`); colours were sampled the same way. Full
measurements are in [`docs/SPEC.md`](docs/SPEC.md).

---

## Features

### Reasoning-effort pane

![Seven evenly spaced stops, one colour each](docs/images/effort-levels.png)

- **Evenly spaced stops**: re-ordered to whatever levels the model actually declares — as many
  stops as the model has. The Codex ladder holds up to 7:
  `off → minimal → low → medium → high → xhigh → Ultra`
- **One colour per stop**: fill, rail tint, heading ink and the collapsed trigger all
  change together — hue advances monotonically from blue `216.6°` to violet `263.9°`,
  instead of only Ultra being special
- **Drag tracks the pointer**: while dragging the knob follows continuously (**no snapping**);
  snapping happens on release
- **Keyboard**: `←/→` or `↑/↓` move one stop, `Home`/`End` jump to either end
- **Ultra**: the rail switches to an animated violet gradient plus 22 stardust
  particles, and shows a "consumes quota faster" warning for 1.8 s
- **Fast toggle** (⚡): visual only — it does **not** change real speed or usage
- **Reset** button: restores the model's default level

#### Fast on / off

![Fast toggle compared on and off](docs/images/fast.png)

The same `high` level, side by side — the ⚡ turns from an outline into a solid bolt, the rail
lights up with stardust particles, and the collapsed seat grows its own ⚡. None of it changes
real speed or usage.

### Model pane (two-level drill-down)

![Model pane drill-down](docs/images/model-panel.png)

| Level | Contents |
|---|---|
| **First** | Provider list; **the provider holding the current model carries a blue dot on the right**. Each row is just provider name + dot + trailing chevron |
| **Second** | Slides in after tapping a provider: back button + provider title + search box + that provider's models |

- Each model row carries an **"N levels" badge**; models without reasoning support are
  greyed out as "unsupported"; the current model shows a check mark
- **Search**: case-insensitive, with **non-contiguous in-order character matching**
  (the same rule the official menu uses)
- **Switching model lands on the middle level**: `floor(n/2)` — 4 levels → the 3rd;
  models with no levels omit the `reasoningEffort` key entirely (absent means "no
  opinion", which differs from an explicit `null`)
- **Provider load failures are surfaced**, not swallowed: once this plugin shadows the
  official seat, the official per-provider failure messages become its responsibility —
  a failing row reads `{name} failed to load: {message}` instead of a blank panel
- `Escape` **steps back one level at a time**: second → first → effort pane → closed

### Two details that are easy to miss

![Fast tooltip and the Ultra warning](docs/images/details.png)

- **The Fast tooltip is a `position:fixed` layer**: as a child of the popover it would be
  clipped by `overflow:hidden`, so it is rendered as a fixed layer and positioned dynamically
- **The Ultra warning's timing**: the moment you cross **into** Ultra from a non-Ultra level, the
  middle column and both tool buttons fade out while the warning fades in with a single sweep
  (1.1 s, 0.2 s delay); it then **stays for 1.8 s** before fading back to the level heading.
  So the warning appears **immediately** rather than after 1.8 s. Staying on Ultra does not
  re-trigger it, and leaving Ultra restores the heading **instantly** (no need to wait out the 1.8 s)

### Dark mode

![Dark mode showcase](docs/images/dark-mode.png)

The whole image is a headless render of the **same real CSS** in the dark theme: the popover
floating above the composer with the collapsed seats, then eight cards — the seven levels live
(each recolouring its fill, track and heading ink together) plus the Ultra warning state. In the
dark theme **the entire palette is re-solved against the shipped dark surfaces**:

- **Theme detection reads the official signal**: the `data-ds-dark-theme` attribute on `<body>`
  (set by the official theme boot script; every shipped dark token keys off that same selector).
  It deliberately does **not** use `prefers-color-scheme` — when the user pins "dark" while the
  OS is light, the media query disagrees with the palette actually in force. A `MutationObserver`
  subscription recolours **live** when the theme is switched in settings, no reload needed
- **All seven stops re-solved**: v1.0.0's light inks all fall below AA on the dark card
  (`high` reached only 1.83:1 — practically invisible). The dark table keeps the same hue axis
  (blue → violet) but luminance now **rises** with effort — on a dark card, "darker" means
  "less visible"
- **The rail becomes an inset groove** `#232324`: the pale `#e8e7e8` was an 11.3:1 glare bar
  on the dark card
- **The knob becomes a bright puck**: the token it inherited resolved to `#2c2c2e` in dark,
  nearly identical to the track — the knob simply vanished
- **The Ultra warning sweep inverts**: the light theme sweeps a dark band over violet text,
  which drops below contrast on a dark card, so dark sweeps a light band; all 15 gradient stops
  were lifted above the track floor too
- The light theme is **bit-for-bit unchanged**: both palettes are validated against every WCAG
  floor by `test/palette.mjs` (24 assertions), with a regression guard against light values
  leaking back into the dark table

### Accessibility & robustness

- `role="slider"` with `aria-valuemin/max/now/valuetext`; the popover carries
  `aria-expanded`/`aria-haspopup`/`aria-busy` and is `inert` while closed
- Every fill and ink clears its WCAG floor **in both themes** (asserted per-item
  by `test/palette.mjs`, once per palette)
- **Dark mode**: see [the section above](#dark-mode) — official signal detection, shipped dark
  surfaces, live recolouring on theme switch
- **Fail-open**: it registers no host hooks, emits no events and touches no official
  classes or text. If any anchor is unrecognisable (directory not ready, not its own
  session, subagent session) it **does nothing**, leaving the official UI intact

---

## Install

### Requirements

- DSH `0.2.0-rc.2` (this plugin is written against that version's slot contract)
- **No build step**: `client.js` *is* the release artifact — hand-written and
  statically auditable

### Option 1 — DSH Desktop plugin panel (recommended)

The `desktop` profile is managed exclusively by Electron, so it cannot be installed
from the CLI. Use the panel:

1. Copy this directory anywhere on your machine (**do not move or delete it afterwards**)
2. Open DSH Desktop → **Settings → Plugins → Add plugin**
3. Enter **the full path of this directory** (not a zip, not `package.json`)
4. Tick the trust confirmation → **Install** → **Enable now**
5. If prompted to restart, **fully quit and reopen** DSH Desktop

### Option 2 — command line (non-desktop profiles only)

```powershell
dsh plugin --profile web add link:"<absolute path to this directory>"
dsh --profile web --dump-config    # confirm dsh-codex-model-effort-selector appears
```

### Verify it took effect

After restarting DSH, open the model name below the composer — it should expand into
the Codex-style popover (effort slider + model list).

```powershell
dsh plugin --profile desktop list | Select-String codex-model-effort
```

### Updating & uninstalling

- **Updating**: reinstall from the panel / point it at the new directory, then
  **fully quit and reopen** DSH Desktop.
- **Uninstalling**: from the panel, or
  `dsh plugin --profile <profile> remove dsh-codex-model-effort-selector`.
- ⚠️ Do **not** delete a junction with `Remove-Item -Recurse` — it can follow the link
  and delete the plugin's own files.

---

## Usage

**Collapsed** (one button on the right of the composer, still carrying the level colour):

```
[ ⚡ 6 Astra  Ultra  ⌄ ]
```

**Once open**:

| Action | Result |
|---|---|
| Drag the rail / tap it | Change level; dragging tracks continuously, releasing snaps to the nearest stop |
| `←/→` `↑/↓` / `Home` `End` | Change level from the keyboard |
| Tap the middle heading | Flip to the model list's first level |
| Tap a provider row | Slide in that provider's model list (with a search box) |
| Tap a model | Switch model, return to the effort pane, landing on the **middle level** |
| `Esc` | Step back: second level → first level → effort pane → closed |
| ⚡ | Fast visual toggle (visual only) |
| ↻ | Reset to the model's default level |

---

## Compatibility & known limitations

| Item | Notes |
|---|---|
| DSH | Verified on **DSH Desktop 0.2.0-rc.2 (Windows)** |
| Runtime dependencies | **None** (`client.js` is hand-written, zero-build, zero third-party code) |
| Theme | Follows DSH theme tokens (`--dsw-*`), falling back to neutral grey + `#4d93f8` |
| Platform | Verified on Windows; other platforms untested |

- **A restart is required** (the client bundle is injected at startup)
- **Depends on the official slot contract**: if the official
  `conversation.input.model` shape changes, this plugin **silently falls back to doing
  nothing** rather than breaking the official UI
- **The official model menu loses its entry point**: that seat was the only entry to the
  official menu; switching models still works through this plugin's pane and the official
  **`/model` command**
- **Levels come from the model**: the slider only shows the reasoning levels the current
  model actually declares; with no reasoning metadata the pane says "this model provides
  no reasoning effort levels"
- **The name "Ultra"**: the `max` level is called Ultra in Codex and this plugin keeps that
  naming; if a model names its top level differently, that model's own name is shown
- **Model ordering follows the host catalog**: models the catalog does not list are not
  shown in the pane

---

## Development

The package itself is **dependency-free** — no `npm install` needed:

```powershell
# syntax check
node --check client.js

# offline assertion suite (35: loading / registration contract / shadowing / geometry /
# palette / theme wiring / fail-open / accessibility / two-level drill-down)
node test/verify.mjs

# palette assertions (24: the three WCAG floors for BOTH themes + monotonic hue +
# chroma + uniqueness + theme-signal checks)
node test/palette.mjs

# collapse-bug regression (6: runs BOTH the buggy and the fixed state machine)
node test/collapse-regression.mjs

# integration against the REAL SlotCore (4; auto-skips when DSH is not installed)
node test/slots-integration.mjs
# point it at a custom install with the DSH_ASAR or DSH_RESOURCES env var

# encoding guard (23: every text file must be clean, BOM-free UTF-8)
node test/encoding.mjs

# regenerate the README screenshots (extracts the real CSS from client.js; needs Edge/Chrome)
node test/make-readme-shots.mjs

# build the browser preview page (same real-CSS extraction, light and dark side by side)
node test/make-preview.mjs   # then open test/preview.html

# regenerate the dark-mode comparison shot (light vs dark, headless real-CSS render)
node test/make-dark-shot.mjs   # writes docs/images/dark-mode.png
```

A few deliberate choices in the test bench:

- `test/verify.mjs` **actually executes** `client.js`, captures the slot it registers, and
  asserts the registration shape matches the official docs
- `test/palette.mjs` **reads the real colour values out of the source** and computes
  contrast, so changing a colour re-validates it
- `test/collapse-regression.mjs` implements the **buggy** state machine too: it first proves
  that version really does expand everything on one click, then proves the fixed one does
  not — a regression test should not only test the good version
- `test/slots-integration.mjs` **unpacks the real SlotCore** out of `app.asar`, drives it with
  this plugin's real registration, and end-to-end verifies shadowing and uninstall recovery

---

## Project layout

```
client.js                  release artifact: the browser bundle, hand-written, zero-build, auditable
index.js                   host-side half, deliberately empty — it only makes this package a node on the cordis tree
cordis.patch.yml           inserts this package into the profile's composition layer
package.json               declares dsh.bundle.patch and dsh.client (with its inject dependencies)
locale/{zh,en}.json        plugin title & description shown in the plugin manager
icon.svg                   plugin icon
docs/                      architecture, incident postmortems, pixel spec and the images used here
test/                      offline assertions + palette + collapse regression + real-SlotCore integration + shot generator
```

---

## Docs

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it works: seat takeover, state machine, geometry, colour, particle maths, accessibility, test-bench strategy |
| [docs/INCIDENTS.md](docs/INCIDENTS.md) | **Incident postmortems**: symptom → root cause → fix → assertion. Start here when something looks wrong |
| [docs/SPEC.md](docs/SPEC.md) | Frame-by-frame measurement spec and replica fidelity comparison (original vs this plugin) |
| [CHANGELOG.md](CHANGELOG.md) | Release-by-release changes |

---

## FAQ

**Nothing happens after installing.**
First **fully quit and reopen** DSH Desktop (not just the window). If it still does not
work, check the plugin's detail page for an error line — the host `JSON.parse`s
`package.json` directly, so a malformed manifest (a BOM, for instance) gets the whole
package discarded and the UI shows nothing at all.

**The official model menu still opens instead.**
That means the plugin was not loaded. Make sure it is actually enabled in the profile and
that you **fully restarted** DSH Desktop. This plugin shadows the official seat with
`priority: -1`, and `test/slots-integration.mjs` asserts that against the real SlotCore.

**The pane says "the host listed no providers".**
That means the **host's model catalog is empty** — it is not the plugin's fault: the
official `/model` command is empty at that moment too. Check DSH's **Settings → Models /
Account**: usually there is no available provider, or the account cannot get a token.

**The pane says "no session yet — send a message to pick a model".**
You are sitting on a fresh, empty session shell, where the composer has no session id yet.
Send a message, or open an existing session.

**The level the slider shows is not what I expected.**
The slider only shows the levels the **current model actually declares**. With no reasoning
metadata, the pane says "this model provides no reasoning effort levels".

---

## Credits & license

- The model pane's interaction follows the **two-level drill-down** of
  [Bai-2008/a-better-dsh-codex-effort-slider](https://github.com/Bai-2008/a-better-dsh-codex-effort-slider)
  (this plugin adopted it to replace an earlier, self-contradictory collapsible-set scheme).
- The original geometry and palette take a Codex desktop recording as their primary
  evidence and were cross-checked against other community Codex slider ports; see the
  evidence section of [`docs/SPEC.md`](docs/SPEC.md).
- The target host is [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness);
  this plugin only uses its public surface (slots, the `modelDirectories` service and
  semantic DOM anchors).
- Licensed **MIT** (see [LICENSE](LICENSE)). **No optional third-party code**: the bolt and
  chevron icons are hand-drawn paths, and the particle layer and all CSS are hand-written.
