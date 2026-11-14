/**
 * Regression test for the popover anchor.
 *
 * The bug: the seat lives in the composer, and a host wrapper can become the
 * containing block for position:fixed (transform/filter/backdrop-filter,
 * will-change:transform, or containment). The viewport `left` is then
 * interpreted as a local offset and the popover drifts to the right. The fix
 * has two independent parts:
 *   - portal the popover (and Fast tooltip) to <body>
 *   - right-align the 272px card to the trigger instead of centering it
 *
 * The placement helper is pure and OverlayLayer is dependency-light, so both
 * are extracted from the real bundle and exercised without a browser. The
 * remaining assertions guard the portal contract and the right-edge anchor.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(HERE, '..', 'client.js'), 'utf8');

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const end = source.indexOf('\n    }', start);
  assert.ok(end > start, `${name} is extractable`);
  return source.slice(start, end + 6);
}

const constants = source.match(/const POPOVER_WIDTH = \d+;/)[0] + '\n' + source.match(/const POPOVER_MIN_HEIGHT = \d+;/)[0];
const popoverPlacement = new Function(`${constants}\n${extract('popoverPlacement')}; return popoverPlacement;`)();

const viewport = { width: 1440, height: 900 };

const right = popoverPlacement({ left: 1200, right: 1260, top: 800 }, viewport, 272);
assert.equal(right.left, 988, 'right edge of the card follows the trigger right edge');
assert.equal(right.bottom, 108, 'sits 8px above the trigger');

const clamped = popoverPlacement({ left: 1400, right: 1460, top: 800 }, viewport, 272);
assert.equal(clamped.left, 1156, 'clamps to the 12px viewport gutter');

const leftEdge = popoverPlacement({ left: 100, right: 160, top: 800 }, viewport, 272);
assert.equal(leftEdge.left, 12, 'never leaves the left viewport gutter');

const narrow = popoverPlacement({ left: 100, right: 200, top: 800 }, { width: 240, height: 900 }, 272);
assert.equal(narrow.left, 12, 'narrow viewports still clamp safely');

/* A true right-edge fallback: left + width == 1260, which must right-align at
 * 988 rather than look like the clamp-to-12 case. */
const noRight = popoverPlacement({ left: 1200, width: 60, top: 800 }, viewport, 272);
assert.equal(noRight.left, 988, 'falls back to left + width when right is missing');

/* Near the top, keep the 104px effort card inside the viewport instead of
 * letting max-height clip the rail. */
const shortTop = popoverPlacement({ left: 1200, right: 1260, top: 50 }, viewport, 272);
assert.equal(shortTop.bottom, 784, 'keeps the minimum card height above the viewport floor');

/* OverlayLayer is the actual portal primitive. Run the real source with a
 * fake h/createPortal/document so this is not just a regex assertion. */
const overlaySource = extract('OverlayLayer');
const h = (type, props, ...kids) => ({ type, props: props || {}, kids });
const portalCalls = [];
const fakeDocument = { body: { tag: 'body' } };
const createPortal = (node, target) => {
  portalCalls.push({ node, target });
  return { portal: node, target };
};
const makeOverlay = (portal, doc) =>
  new Function('h', 'P', 'createPortal', 'document', `${overlaySource}; return OverlayLayer;`)(h, 'cmes', portal, doc);

const children = [{ key: 'popover' }, { key: 'fast-tip' }];
const layerRef = { current: null };
makeOverlay(createPortal, fakeDocument)({ layerRef, children });
const layer = portalCalls[0].node;
assert.equal(portalCalls.length, 1, 'OverlayLayer portals exactly once');
assert.equal(portalCalls[0].target, fakeDocument.body, 'portal target is document.body');
assert.equal(layer.props.className, 'cmes-root', 'portal layer keeps the codex root class');
assert.equal(layer.props.style.display, 'contents', 'portal layer has no layout box');
assert.equal(layer.props.ref, layerRef, 'portal layer exposes the ref for align()');
assert.equal(layer.kids[0], children, 'both overlays survive the portal');

const fallback = makeOverlay(null, {})({ layerRef, children });
assert.equal(fallback.type, 'div', 'createPortal-unavailable fallback stays inline');
assert.equal(fallback.props.style.display, 'contents', 'fallback still has no layout box');

assert.match(source, /max-width:calc\(100vw - 24px\)/, 'CSS and JS use the same viewport gutter');
assert.match(source, /transform-origin:bottom right/, 'open animation scales from the anchored corner');
assert.match(source, /createPortal\(layer, document\.body\)/, 'overlay is portalled to body');
assert.match(source, /popupRef\.current\?\.contains\(event\.target\)/, 'outside click accepts the portalled popover');
assert.match(source, /portalRootRef\.current\?\.contains\(event\.target\)/, 'outside click accepts the portal layer');
assert.match(source, /h\(OverlayLayer, \{ layerRef: portalRootRef \}/, 'popover and tooltip share the overlay layer');
assert.match(source, /watchFrame = requestAnimationFrame\(watchAnchor\)/, 'anchor is watched while open');
assert.match(source, /'aria-controls': `\$\{P\}-popover`/, 'trigger is associated with the dialog');
assert.match(source, /function popoverKeyDown\(/, 'dialog keeps Tab inside itself');
assert.doesNotMatch(source, /\(trigger\.left \+ trigger\.right - width\) \/ 2/, 'old center formula is gone');

console.log('placement: 23 checks passed');
