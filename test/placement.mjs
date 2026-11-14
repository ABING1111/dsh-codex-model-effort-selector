/**
 * Regression test for the popover anchor.
 *
 * The bug: the seat lives in the composer, and a host wrapper can become the
 * containing block for position:fixed (transform/filter/backdrop-filter or
 * containment). The viewport `left` is then interpreted as a local offset and
 * the popover drifts to the right. The fix has two independent parts:
 *   - portal the popover (and Fast tooltip) to <body>
 *   - right-align the 272px card to the trigger instead of centering it
 *
 * The placement helper is pure, so it can be extracted and exercised without
 * a browser. The portal contract is asserted at the source level because the
 * offline harness has no react-dom.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(HERE, '..', 'client.js'), 'utf8');
const start = source.indexOf('function popoverPlacement(');
const end = source.indexOf('\n    }', start);
assert.ok(start >= 0 && end > start, 'popoverPlacement helper exists');
const body = source.slice(start, end + 6);
const popoverPlacement = new Function(`${body}; return popoverPlacement;`)();

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

const noRight = popoverPlacement({ left: 100, top: 800, width: 60 }, viewport, 272);
assert.equal(noRight.left, 12, 'falls back to left + width when right is missing');

assert.match(source, /createPortal\(layer, document\.body\)/, 'overlay is portalled to body');
assert.match(source, /popupRef\.current\?\.contains\(event\.target\)/, 'outside click accepts the portalled popover');
assert.match(source, /h\(OverlayLayer, \{ layerRef: portalRootRef \}/, 'popover and tooltip share the overlay layer');
assert.doesNotMatch(source, /\(trigger\.left \+ trigger\.right - width\) \/ 2/, 'old center formula is gone');

console.log('placement: 7 checks passed');
