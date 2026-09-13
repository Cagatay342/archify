import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../bin/visual-check.mjs';
import { disposeBundleFixture, stageBundleFixture } from './helpers/bundle-fixture.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const chromePath = process.env.ARCHIFY_CHROME ? findChrome() : null;
const options = { skip: chromePath ? false : 'Set ARCHIFY_CHROME to run zoom-dive browser checks.' };

// `test/fixtures/bundle-dive/`: entry -> middle -> leaf, three diagrams each
// 400x300 with a single drilldown-carrying node ("hub"/"mid") or plain leaf
// node ("leafNode") placed EXACTLY at its own diagram's viewBox center
// (pos [130,120] size [140,60] inside a 400x300 viewBox — the rect's own
// center is (200,150), the viewBox's own center). Anchoring every wheel
// tick at that node's own current screen position therefore keeps it
// pinned there for the rest of the gesture (zoomAt's whole point), which
// is *also* the viewport's own logical center from the very first tick —
// no panning/convergence needed, unlike a node near the edge of a wider
// diagram. This is what removes the flake this suite had before.
const WAIT = `function fixtureWait(predicate, timeout) {
  return new Promise((resolve, reject) => {
    const deadline = performance.now() + (timeout || 6000);
    (function sample() {
      if (predicate()) return resolve();
      if (performance.now() > deadline) return reject(new Error('condition did not settle: ' + predicate));
      requestAnimationFrame(sample);
    })();
  });
}`;

async function serve(dir) {
  const server = http.createServer((request, response) => {
    const name = path.basename(new URL(request.url, 'http://localhost').pathname);
    const file = path.join(dir, name);
    response.setHeader('Cache-Control', 'no-store');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Missing fixture file.');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(fs.readFileSync(file));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

async function openHarness({ entry = 'entry.html' } = {}) {
  const dir = stageBundleFixture({ prefix: 'archify-dive-', fixture: 'dive' });
  const server = await serve(dir);
  const browser = new ChromeVisualBrowser(chromePath);
  const session = await browser.sessionPromise;
  const send = (method, params = {}) => browser.cdp.send(method, params, session, 30000);
  async function run(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    return result.result?.value;
  }
  // Pre-armed observer (installed before any page script runs, on every
  // document including nested iframes) instead of sampling for
  // data-dive-preview after the fact: each transition is timestamped as it
  // happens, so a 250ms dwell window is never raced by a fixed poll delay.
  // "document start" (when addScriptToEvaluateOnNewDocument scripts run) is
  // before the HTML parser has created documentElement — observe() would
  // throw there — so arm on DOMContentLoaded instead, still always well
  // before Page.loadEventFired (which every test awaits before interacting).
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__diveEvents = [];
    document.addEventListener('DOMContentLoaded', function () {
      var obs = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          if (m.attributeName !== 'data-dive-preview') return;
          var el = m.target;
          window.__diveEvents.push({ t: performance.now(), present: el.hasAttribute('data-dive-preview'), id: el.getAttribute('data-node-id') });
        });
      });
      obs.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-dive-preview'] });
    }, { once: true });
  ` });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const url = `http://127.0.0.1:${server.address().port}/${entry}`;
  async function open() {
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session, 30000);
    await send('Page.navigate', { url });
    await loaded;
    await run(`document.fonts.ready.then(()=>Archify.readerLayout.whenStable()).then(()=>Archify.viewerChromeLayout.whenStable())`);
  }
  await open();

  async function point(selector) {
    return run(`(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
  }
  async function wheel(x, y, deltaY) {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  }
  async function moveMouseTo(x, y) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  }
  async function dragBy(dx, dy) {
    const rect = await run(`(() => {
      const r = document.querySelector('.diagram-container').getBoundingClientRect();
      return { x: r.x + 18, y: r.y + 18 };
    })()`);
    const to = { x: rect.x + dx, y: rect.y + dy };
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: to.x, y: to.y, button: 'left', buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
  }
  async function pressKey(key, code, windowsVirtualKeyCode) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
  }
  async function pressZ() { await pressKey('z', 'KeyZ', 90); }
  async function frames(n) {
    for (let i = 0; i < n; i += 1) {
      await run(`new Promise(resolve => requestAnimationFrame(resolve))`, true);
    }
  }
  async function wait(ms) {
    await run(`new Promise(resolve => setTimeout(resolve, ${ms}))`, true);
  }
  // Zooms in on a drilldown node that already sits at its own diagram's
  // logical center (see the fixture note above): every tick is anchored at
  // the node's OWN current screen position, which keeps it pinned there —
  // no panning is needed for it to also cover the viewport's own center.
  // Small ticks (~13% scale growth each) so the loop exits soon after
  // *first* crossing targetScale rather than overshooting by a lot in one
  // big tick — a test that then wants to act mid-dwell (a cancelling pan,
  // pointerleave, reduced-motion) needs the still-live 250ms dwell window,
  // not just a historical record of one that already fired and finished
  // while still ramping up.
  async function zoomOntoCenteredNode(nodeSelector, targetScale) {
    for (let i = 0; i < 24; i += 1) {
      const scale = await run(`Archify.view.state().scale`);
      if (scale >= targetScale) return;
      const node = await point(nodeSelector);
      await wheel(node.x, node.y, -90);
      await frames(3);
    }
  }
  // Independent of Archify.view.logicalViewport()/getBBox(): purely a CDP-
  // measured screen check that the anchor point used to zoom in is still
  // (after however much zooming) inside the node's own rendered rect.
  async function anchorStillInsideNode(nodeSelector, anchor) {
    const rect = await run(`(() => {
      const r = document.querySelector(${JSON.stringify(nodeSelector)}).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    })()`);
    return anchor.x >= rect.left && anchor.x <= rect.right && anchor.y >= rect.top && anchor.y <= rect.bottom;
  }
  async function diveEventsFor(nodeId, present) {
    return run(`window.__diveEvents.filter(e => e.id === ${JSON.stringify(nodeId)} && e.present === ${JSON.stringify(!!present)})`);
  }
  async function waitForDiveEvent(nodeId, present, timeoutMs) {
    await run(`(async () => {
      ${WAIT}
      await fixtureWait(() => window.__diveEvents.some(e => e.id === ${JSON.stringify(nodeId)} && e.present === ${JSON.stringify(!!present)}), ${timeoutMs || 2000});
    })()`);
  }

  return {
    dir, server, browser, session, run, send, point, wheel, moveMouseTo, dragBy, pressKey, pressZ, frames, wait,
    zoomOntoCenteredNode, anchorStillInsideNode, diveEventsFor, waitForDiveEvent,
    async close() {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
      disposeBundleFixture(dir);
    },
  };
}

test('toggle off: zooming a centered drilldown node past scale 2.5 never dives', options, async () => {
  const h = await openHarness();
  try {
    const anchor = await h.point('[data-node-id="hub"]');
    await h.zoomOntoCenteredNode('[data-node-id="hub"]', 2.75);
    assert.ok(await h.anchorStillInsideNode('[data-node-id="hub"]', anchor), 'the anchor point stays inside the node through zoom (sanity: no pan needed)');
    const scale = await h.run(`Archify.view.state().scale`);
    assert.ok(scale >= 2.5, `expected scale >= 2.5, got ${scale}`);
    await h.wait(700);
    const state = await h.run(`({
      active: Archify.drilldown.active(),
      diveOn: document.documentElement.getAttribute('data-dive'),
    })`);
    assert.equal(state.diveOn, null, 'toggle defaults off');
    assert.equal(state.active, false, 'no descent starts while the toggle is off');
    assert.deepEqual(await h.diveEventsFor('hub', true), [], 'no dwell preview ever appeared');
  } finally {
    await h.close();
  }
});

test('Z turns the toggle on; the same zoom dwells then descends, ACK-gated like a manual descend', options, async () => {
  const h = await openHarness();
  try {
    await h.pressZ();
    assert.equal(await h.run(`document.documentElement.getAttribute('data-dive')`), 'on');
    await h.zoomOntoCenteredNode('[data-node-id="hub"]', 2.75);
    await h.waitForDiveEvent('hub', true, 1500);
    await h.run(`(async () => { ${WAIT} await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open', 3000); })()`);
    const after = await h.run(`({
      active: Archify.drilldown.active(),
      preview: document.querySelector('[data-dive-preview]'),
      frameSrc: document.getElementById('archify-drilldown-frame').getAttribute('src'),
    })`);
    assert.equal(after.active, true, 'the dive completed a real descend');
    assert.equal(after.preview, null, 'the preview attribute is cleared once open');
    assert.match(after.frameSrc || '', /middle\.html/);
  } finally {
    await h.close();
  }
});

test('a real pan during the dwell cancels it and clears the preview', options, async () => {
  const h = await openHarness();
  try {
    await h.pressZ();
    // A target close to the 2.5 threshold (not a big overshoot) leaves the
    // full 250ms dwell window available for the cancelling action below —
    // under load, a large overshoot can let the dwell fire and finish
    // during the ramp-up itself, before there is anything left to cancel.
    await h.zoomOntoCenteredNode('[data-node-id="hub"]', 2.55);
    await h.waitForDiveEvent('hub', true, 1500);
    // Large enough that the viewport's own center actually leaves the
    // node's (now large, at this scale) bbox — not just enough to trip the
    // cameraMoved epsilon, which would cancel this dwell but immediately
    // start a fresh, equally legitimate one for the same still-covered node.
    await h.dragBy(260, 0);
    await h.wait(600);
    const state = await h.run(`({
      preview: document.querySelector('[data-dive-preview]'),
      active: Archify.drilldown.active(),
    })`);
    assert.equal(state.preview, null, 'the pan cancelled the dwell preview');
    assert.equal(state.active, false, 'no descent happened');
  } finally {
    await h.close();
  }
});

test('moving the pointer out of the container cancels an in-progress dwell', options, async () => {
  const h = await openHarness();
  try {
    await h.pressZ();
    // Minimal overshoot past the 2.5 threshold — see the pan test above.
    await h.zoomOntoCenteredNode('[data-node-id="hub"]', 2.55);
    await h.waitForDiveEvent('hub', true, 1500);
    // CDP's synthetic wheel events (used throughout the zoom-in above) do
    // not themselves establish real pointer-hover state on the container
    // the way a mouseMoved does; move onto the node first so the browser
    // actually considers the pointer "inside" the container, then move
    // well outside its box — a real pointerleave, independent of any
    // camera change.
    const hubNow = await h.point('[data-node-id="hub"]');
    await h.moveMouseTo(hubNow.x, hubNow.y);
    await h.moveMouseTo(5, 5);
    await h.wait(500);
    const state = await h.run(`({
      preview: document.querySelector('[data-dive-preview]'),
      active: Archify.drilldown.active(),
    })`);
    assert.equal(state.preview, null, 'pointerleave cancelled the dwell preview');
    assert.equal(state.active, false);
  } finally {
    await h.close();
  }
});

test('reduced motion set before zooming blocks the dive but not the always-on highlight', options, async () => {
  const h = await openHarness();
  try {
    await h.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await h.pressZ();
    await h.zoomOntoCenteredNode('[data-node-id="hub"]', 2.75);
    await h.wait(700);
    const state = await h.run(`({
      active: Archify.drilldown.active(),
      preview: document.querySelector('[data-dive-preview]'),
      detail: document.querySelector('.diagram-container').getAttribute('data-detail-level'),
    })`);
    assert.equal(state.active, false, 'reduced motion blocks the automatic dive from ever starting a dwell');
    assert.equal(state.preview, null);
    assert.equal(state.detail, 'full', 'the always-on highlight attribute is unaffected by reduced motion');
    assert.deepEqual(await h.diveEventsFor('hub', true), [], 'no dwell preview was ever shown');
  } finally {
    await h.close();
  }
});

test('reduced motion turning on mid-dwell cancels the in-progress preview', options, async () => {
  const h = await openHarness();
  try {
    await h.pressZ();
    // Minimal overshoot past the 2.5 threshold — see the pan test above.
    await h.zoomOntoCenteredNode('[data-node-id="hub"]', 2.55);
    await h.waitForDiveEvent('hub', true, 1500);
    // Flip reduced-motion on mid-dwell, well before the 250ms elapses.
    await h.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await h.wait(500);
    const state = await h.run(`({
      preview: document.querySelector('[data-dive-preview]'),
      active: Archify.drilldown.active(),
    })`);
    assert.equal(state.preview, null, 'reduced-motion turning on mid-dwell cancelled it');
    assert.equal(state.active, false);
  } finally {
    await h.close();
  }
});

test('a leaf with no further drilldown of its own can still be zoom-out-escaped', options, async () => {
  const h = await openHarness();
  try {
    await h.pressZ();
    // Reach the leaf via manual descends (this test targets escape-from-a-
    // leaf specifically, not the dwell mechanism, which other tests cover).
    await h.run(`(async () => {
      ${WAIT}
      Archify.drilldown.descend('hub');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const child = document.getElementById('archify-drilldown-frame').contentWindow;
      child.Archify.drilldown.descend('mid');
      await fixtureWait(() => child.document.documentElement.getAttribute('data-drilldown-state') === 'open');
    })()`);
    const grandchild = `document.getElementById('archify-drilldown-frame').contentWindow.document.getElementById('archify-drilldown-frame').contentWindow`;
    const leafCapableInfo = await h.run(`({
      capable: ${grandchild}.Archify.dive.capable,
      nested: ${grandchild}.document.documentElement.getAttribute('data-bundle-nested'),
    })`);
    assert.equal(leafCapableInfo.capable, false, 'the leaf has no drilldown row of its own');
    assert.equal(leafCapableInfo.nested, 'true');
    const leafDiveEnabled = await h.run(`${grandchild}.Archify.dive.enabled()`);
    assert.equal(leafDiveEnabled, true, 'the leaf still inherits the toggle (shared localStorage, same-origin)');

    const leafFrame = await h.run(`(() => {
      const r = ${grandchild}.document.querySelector('.diagram-container').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await h.wheel(leafFrame.x, leafFrame.y, 120);
    await h.frames(3);
    await h.wait(220);
    await h.wheel(leafFrame.x, leafFrame.y, 120);
    await h.frames(6);
    await h.run(`(async () => {
      ${WAIT}
      const child = document.getElementById('archify-drilldown-frame').contentWindow;
      await fixtureWait(() => !child.Archify.drilldown.active());
    })()`);
    const childActive = await h.run(`document.getElementById('archify-drilldown-frame').contentWindow.Archify.drilldown.active()`);
    assert.equal(childActive, false, 'two distinct zoom-out gestures inside the leaf ascended it out of the leaf');
    assert.equal(await h.run(`Archify.drilldown.active()`), true, 'the root still has its own child (middle) open');
  } finally {
    await h.close();
  }
});

test('the redive lock ignores a continuing wheel flow but lifts after real silence, and requires the camera to re-arm below scale 2.5', options, async () => {
  const h = await openHarness();
  try {
    await h.pressZ();
    await h.zoomOntoCenteredNode('[data-node-id="hub"]', 2.7);
    await h.waitForDiveEvent('hub', true, 1500);
    await h.run(`(async () => { ${WAIT} await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open', 3000); })()`);
    assert.equal(await h.run(`Archify.drilldown.active()`), true);

    const frame = await h.point('#archify-drilldown-frame');
    await h.wheel(frame.x, frame.y, 120);
    await h.frames(3);
    await h.wait(220);
    await h.wheel(frame.x, frame.y, 120);
    await h.frames(6);
    await h.run(`(async () => { ${WAIT} await fixtureWait(() => !Archify.drilldown.active(), 3000); })()`);
    assert.equal(await h.run(`Archify.drilldown.active()`), false, 'ascended after two distinct zoom-out gestures');
    const scaleAfterBack = await h.run(`Archify.view.state().scale`);
    assert.ok(scaleAfterBack >= 2.5, `camera stays zoomed in after back(): ${scaleAfterBack}`);
    // Reset the dive-event log: the initial (intended) dive-in above
    // legitimately produced a 'true' event, and diveEventsFor(...) reads
    // the whole history, not just what happens after this point.
    await h.run(`window.__diveEvents = []`);

    // The SAME physical wheel flow continuing on the now-revealed parent,
    // within well under 400ms: must NOT lift the lock or dive, even though
    // the parent's own gesture-id space is unrelated to the child's.
    const hubNow = await h.point('[data-node-id="hub"]');
    await h.wheel(hubNow.x, hubNow.y, -20);
    await h.frames(6);
    await h.wait(400);
    assert.equal(await h.run(`Archify.drilldown.active()`), false, 'a same-flow wheel tick right after ascend does not lift the lock');
    assert.deepEqual(await h.diveEventsFor('hub', true), [], 'still no dwell while locked');

    // Now bring scale below 2.5 (re-arm), then let true silence pass
    // (>= 400ms of no gesture activity at all), then start a genuinely new
    // gesture — only now should the lock lift and a fresh dive be possible.
    await h.wheel(hubNow.x, hubNow.y, 400);
    await h.frames(6);
    const scaleAfterRearmTick = await h.run(`Archify.view.state().scale`);
    assert.ok(scaleAfterRearmTick < 2.5, `expected a re-arming dip below 2.5: ${scaleAfterRearmTick}`);
    await h.wait(600);
    await h.zoomOntoCenteredNode('[data-node-id="hub"]', 2.7);
    await h.run(`(async () => { ${WAIT} await fixtureWait(() => Archify.drilldown.active(), 4000); })()`);
    assert.equal(await h.run(`Archify.drilldown.active()`), true, 'a fresh gesture after real silence and a re-arming dip dives again');
  } finally {
    await h.close();
  }
});

test('a semantic-camera reveal at scale >= 2.5 never dives (manual mode only)', options, async () => {
  const h = await openHarness();
  try {
    await h.pressZ();
    await h.run(`(async () => {
      ${WAIT}
      Archify.view.reveal(['hub'], { maxScale: 2.75, includeNeighbors: false, reason: 'test' });
      await fixtureWait(() => Archify.view.state().mode === 'semantic' && Archify.view.state().scale >= 2.5, 3000);
    })()`);
    const state = await h.run(`Archify.view.state()`);
    assert.equal(state.mode, 'semantic');
    assert.ok(state.scale >= 2.5, `expected scale >= 2.5 in semantic mode: ${state.scale}`);
    await h.wait(700);
    assert.equal(await h.run(`Archify.drilldown.active()`), false, 'semantic mode is excluded regardless of scale');
    assert.deepEqual(await h.diveEventsFor('hub', true), [], 'no dwell preview under semantic mode');
  } finally {
    await h.close();
  }
});

test('a plain (non-bundle) diagram shows no toggle and treats Z as a no-op', options, async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-dive-plain-'));
  const file = path.join(scratch, 'architecture.html');
  execFileSync(process.execPath, [
    path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'),
    path.join(skillRoot, 'examples/web-app.architecture.json'),
    file,
  ]);
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const session = await browser.sessionPromise;
    const send = (method, params = {}) => browser.cdp.send(method, params, session, 30000);
    async function run(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
      return result.result?.value;
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session, 30000);
    await send('Page.navigate', { url: `file://${file}` });
    await loaded;
    await run(`document.fonts.ready`);
    const before = await run(`({ hidden: document.getElementById('btn-drilldown-dive').hidden, capable: !!Archify.dive.capable })`);
    assert.equal(before.hidden, true, 'the dive toggle stays hidden on a diagram with no drilldown row');
    assert.equal(before.capable, false);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    const after = await run(`({ dive: document.documentElement.getAttribute('data-dive'), hidden: document.getElementById('btn-drilldown-dive').hidden })`);
    assert.equal(after.dive, null, 'Z is a no-op on a plain diagram');
    assert.equal(after.hidden, true);
  } finally {
    await browser.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('Z is guarded: a native key-repeat is a no-op, and so is Z while focus is in a SELECT or a role=textbox element', options, async () => {
  const h = await openHarness();
  try {
    // CDP's Input.dispatchKeyEvent does not model OS-level key-repeat (each
    // dispatched keydown independently comes back with event.repeat===false,
    // confirmed empirically: three scripted keydowns with no keyUp between
    // them toggled the dive state three times, not once) — there is no way
    // to produce a *real* repeat=true keydown through CDP's synthetic input.
    // The !e.repeat guard is exercised the only way that is actually
    // possible here: a synthetic KeyboardEvent constructed with
    // repeat:true. This is not a harness limitation being worked around; a
    // browser's OS-level key-repeat is simply not something CDP's scripted
    // Input domain reproduces, in or out of an iframe.
    assert.equal(await h.run(`document.documentElement.getAttribute('data-dive')`), null, 'off by default');
    await h.run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true, repeat: true }))`);
    assert.equal(await h.run(`document.documentElement.getAttribute('data-dive')`), null, 'a repeat keydown must not toggle the dive setting');

    // The real (non-repeat) press still works, proving the guard above
    // isn't just a fluke of the fixture not reaching the handler at all.
    await h.pressZ();
    assert.equal(await h.run(`document.documentElement.getAttribute('data-dive')`), 'on', 'a genuine, non-repeat Z still toggles it');

    // SELECT and [role=textbox]: real focus (no iframe boundary here, so a
    // plain .focus() call is real input-routing focus, unlike the
    // triply-nested case in drilldown-nested-browser.test.mjs) plus a real
    // CDP keypress.
    await h.run(`(() => {
      const select = document.createElement('select');
      select.id = 'archify-test-select';
      select.appendChild(new Option('a'));
      document.body.appendChild(select);
      select.focus();
    })()`);
    assert.equal(await h.run(`document.activeElement && document.activeElement.id`), 'archify-test-select');
    await h.pressZ();
    assert.equal(await h.run(`document.documentElement.getAttribute('data-dive')`), 'on', 'Z while a SELECT is focused must not toggle it');

    await h.run(`(() => {
      document.getElementById('archify-test-select').remove();
      const box = document.createElement('div');
      box.id = 'archify-test-textbox';
      box.setAttribute('role', 'textbox');
      box.tabIndex = 0;
      document.body.appendChild(box);
      box.focus();
    })()`);
    assert.equal(await h.run(`document.activeElement && document.activeElement.id`), 'archify-test-textbox');
    await h.pressZ();
    assert.equal(await h.run(`document.documentElement.getAttribute('data-dive')`), 'on', 'Z while a role=textbox element is focused must not toggle it');

    await h.run(`document.getElementById('archify-test-textbox').remove()`);
    await h.pressZ();
    assert.equal(await h.run(`document.documentElement.getAttribute('data-dive')`), null, 'once focus is back on the page body, Z works again');
  } finally {
    await h.close();
  }
});

// Both lock-isolation tests below need the descend actually closed first
// (drilldownOpenOrBusy() is its own, separate eligibility gate — while a
// child is open, no amount of lock/rearm manipulation can start a new dive)
// — so each repeats the same "dive in, then escape back out with two
// zoom-out gestures" setup as the combined lock test above, before
// isolating one guard from the other.
async function diveInThenEscapeBackOut(h) {
  await h.pressZ();
  await h.zoomOntoCenteredNode('[data-node-id="hub"]', 2.7);
  await h.waitForDiveEvent('hub', true, 1500);
  await h.run(`(async () => { ${WAIT} await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open', 3000); })()`);
  assert.equal(await h.run(`Archify.drilldown.active()`), true);

  const frame = await h.point('#archify-drilldown-frame');
  await h.wheel(frame.x, frame.y, 120);
  await h.frames(3);
  await h.wait(220);
  await h.wheel(frame.x, frame.y, 120);
  await h.frames(6);
  await h.run(`(async () => { ${WAIT} await fixtureWait(() => !Archify.drilldown.active(), 6000); })()`);
  assert.equal(await h.run(`Archify.drilldown.active()`), false, 'escaped back out; diveLock=true, rearmed=false from here');
  const scaleAfterBack = await h.run(`Archify.view.state().scale`);
  assert.ok(scaleAfterBack >= 2.5, `camera stays zoomed in after back(): ${scaleAfterBack}`);
  await h.run(`window.__diveEvents = []`);
}

test('the redive lock: silence alone (without a re-arming dip below 2.5) is not enough to allow a dive', options, async () => {
  const h = await openHarness();
  try {
    await diveInThenEscapeBackOut(h);

    // >= GESTURE_SILENCE_MS (400ms) of true silence: no wheel/pointer/key at
    // all. This alone lifts diveLock on the next gesture 'start', but the
    // camera never dipped below 2.5 in the meantime, so `rearmed` is still
    // false.
    await h.wait(700);
    const scaleStillHigh = await h.run(`Archify.view.state().scale`);
    assert.ok(scaleStillHigh >= 2.5, `camera never left the dived-in scale: ${scaleStillHigh}`);

    // One small wheel tick that stays >= 2.5 (zooming further in, not out):
    // this is the 'gesture start' that would lift diveLock (silence was
    // long enough), but it can never produce the rearming dip.
    const hubNow = await h.point('[data-node-id="hub"]');
    await h.wheel(hubNow.x, hubNow.y, -20);
    await h.frames(6);
    const scaleAfterTick = await h.run(`Archify.view.state().scale`);
    assert.ok(scaleAfterTick >= 2.5, `the probe tick must not itself rearm: ${scaleAfterTick}`);
    await h.wait(400); // past DWELL_MS if a dwell had (wrongly) started
    assert.equal(await h.run(`Archify.drilldown.active()`), false, 'silence lifted the lock, but without a re-arming dip below 2.5 no dive starts');
    assert.deepEqual(await h.diveEventsFor('hub', true), [], 'no dwell preview appeared either');
  } finally {
    await h.close();
  }
});

test('the redive lock: a re-arming dip below 2.5 alone (without real silence) is not enough to allow a dive', options, async () => {
  const h = await openHarness();
  try {
    await diveInThenEscapeBackOut(h);

    // The dip-below-2.5-then-straight-back-up sequence must never let
    // GESTURE_SILENCE_MS (400ms) of real silence pass between ticks, or
    // this test would be proving nothing (the lock would legitimately
    // lift). Node-side h.wheel()/h.frames() each cost their own CDP round
    // trip; under heavy --test-concurrency=2 load the gap between two such
    // round trips can itself exceed 400ms, producing a real (not
    // spurious) redive and flaking this test — observed in practice.
    // Dispatching every wheel tick from INSIDE one Runtime.evaluate call,
    // as synthetic WheelEvents on the camera's own container (the exact
    // element viewer-camera.js's onWheel listens on — Archify.view has no
    // public zoomAt()/emit() escape hatch, so a synthetic 'wheel' DOM
    // event through the real listener is the closest in-page equivalent
    // to a real gesture), keeps every gap governed by requestAnimationFrame
    // timing alone, never by Node<->Chrome IPC scheduling.
    const outcome = await h.run(`(async () => {
      const container = document.querySelector('.diagram-container');
      function dispatchWheel(x, y, deltaY) {
        container.dispatchEvent(new WheelEvent('wheel', {
          deltaY, deltaX: 0, clientX: x, clientY: y, bubbles: true, cancelable: true,
        }));
      }
      function frame() { return new Promise(resolve => requestAnimationFrame(resolve)); }
      function centerOf(selector) {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
      let p = centerOf('[data-node-id="hub"]');
      dispatchWheel(p.x, p.y, 400);
      await frame(); await frame();
      const scaleAfterDip = Archify.view.state().scale;
      for (let i = 0; i < 24 && Archify.view.state().scale < 2.7; i += 1) {
        p = centerOf('[data-node-id="hub"]');
        dispatchWheel(p.x, p.y, -90);
        await frame(); await frame(); await frame();
      }
      return { scaleAfterDip, scaleBack: Archify.view.state().scale };
    })()`);
    assert.ok(outcome.scaleAfterDip < 2.5, `expected the dip to rearm: ${outcome.scaleAfterDip}`);
    assert.ok(outcome.scaleBack >= 2.5, `back at dive scale: ${outcome.scaleBack}`);
    await h.wait(400); // past DWELL_MS if a dwell had (wrongly) started
    assert.equal(await h.run(`Archify.drilldown.active()`), false, 'rearmed became true, but without real silence the lock is still held');
    assert.deepEqual(await h.diveEventsFor('hub', true), [], 'no dwell preview appeared either');
  } finally {
    await h.close();
  }
});

test('the dive preference reaches a nested child purely through the validated session channel (no shared storage needed), and a wrong-session preference message is rejected', options, async () => {
  const h = await openHarness();
  try {
    // Astra review: reassigning localStorage.setItem/getItem AFTER the
    // child has already loaded is not reliable fault injection (it can
    // shadow the wrong thing, and it never proves storage access actually
    // failed). Instead, shim `window.localStorage` itself to throw — the
    // same shape a real file:// child's storage-denied SecurityError takes
    // — via a script registered before the child's own navigation, scoped
    // to `window !== window.top` so only the nested child (never the root)
    // is affected. Then assert the throw is real before trusting anything
    // downstream of it.
    await h.browser.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      if (window !== window.top) {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() { throw new DOMException('storage disabled for this test', 'SecurityError'); },
        });
      }
    ` }, h.session);

    await h.run(`(async () => {
      ${WAIT}
      Archify.drilldown.descend('hub');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
    })()`);
    const CHILD = `document.getElementById('archify-drilldown-frame').contentWindow`;

    const storageProbe = await h.run(`(() => {
      try { void ${CHILD}.localStorage; return 'no-throw'; }
      catch (e) { return e.name || 'threw'; }
    })()`);
    assert.equal(storageProbe, 'SecurityError', 'sanity: the child\'s own localStorage access really does throw');
    assert.equal(await h.run(`(() => { try { void localStorage; return 'no-throw'; } catch (e) { return 'threw'; } })()`), 'no-throw', 'sanity: the root\'s own localStorage is untouched (the shim is scoped to window !== window.top)');
    assert.equal(await h.run(`${CHILD}.Archify.dive.enabled()`), false, 'child starts with the toggle off');

    // A forged dive-pref message with a session that cannot possibly match
    // (helloSession is a small monotonic counter) must be rejected outright.
    await h.run(`(() => {
      const child = ${CHILD};
      child.postMessage({ type: 'archify:dive-pref', enabled: true, session: 999999999 }, '*');
    })()`);
    await h.run(`new Promise(resolve => setTimeout(resolve, 200))`);
    assert.equal(await h.run(`${CHILD}.Archify.dive.enabled()`), false, 'a wrong-session dive-pref message must be ignored');

    // The real toggle, sent through the actual validated hello/session
    // channel (Archify.dive's own sendPrefToChild), must still land even
    // though the child's localStorage is unusable.
    await h.pressZ();
    await h.run(`(async () => {
      ${WAIT}
      await fixtureWait(() => ${CHILD}.Archify.dive.enabled() === true, 2000);
    })()`);
    assert.equal(await h.run(`${CHILD}.Archify.dive.enabled()`), true, 'the real preference message reached the child over the session channel alone');
  } finally {
    await h.close();
  }
});

test('export SVG bytes are unaffected by an in-progress dive dwell preview', options, async () => {
  const h = await openHarness();
  try {
    async function exportSvgText() {
      return h.run(`(async () => {
        const original = URL.createObjectURL;
        let blob;
        URL.createObjectURL = value => { if (value.type.startsWith('image/svg+xml')) blob = value; return original.call(URL, value); };
        try { await Archify.exportMenu.run('svg'); } finally { URL.createObjectURL = original; }
        return blob.text();
      })()`);
    }
    const pristine = await exportSvgText();

    await h.pressZ();
    const anchor = await h.point('[data-node-id="hub"]');
    await h.zoomOntoCenteredNode('[data-node-id="hub"]', 2.7);
    // Astra review: the sanity check (preview really active) and the export
    // capture were two separate h.run() calls — a separate CDP round trip
    // between them can let the 250ms dwell finish first, so the "during
    // dwell" export would actually be captured post-descend instead. Do
    // both in the SAME script turn: wait for the preview attribute, read
    // the sanity fields, and capture the export bytes back to back with no
    // round trip in between (only intra-page microtask time, not
    // Node<->Chrome IPC time, elapses between the read and the export).
    const outcome = await h.run(`(async () => {
      ${WAIT}
      await fixtureWait(() => document.querySelector('[data-node-id="hub"]').getAttribute('data-dive-preview') === 'true', 1500);
      const previewAttr = document.querySelector('[data-node-id="hub"]').getAttribute('data-dive-preview');
      const statusText = document.getElementById('archify-dive-status').textContent;
      const original = URL.createObjectURL;
      let blob;
      URL.createObjectURL = value => { if (value.type.startsWith('image/svg+xml')) blob = value; return original.call(URL, value); };
      try { await Archify.exportMenu.run('svg'); } finally { URL.createObjectURL = original; }
      const svgText = await blob.text();
      return { previewAttr, statusText, svgText };
    })()`);
    assert.equal(outcome.previewAttr, 'true', 'sanity: the dwell preview really is active right now, at the moment export was captured');
    assert.notEqual(outcome.statusText.trim(), '', 'sanity: the live status region really has text right now');
    assert.equal(outcome.svgText, pristine, 'export bytes must be identical whether or not a dive dwell preview is currently showing');
    void anchor;
  } finally {
    await h.close();
  }
});

// The live region is real (role="status" aria-live="polite", see
// viewer/template.source.html) and its text really does change in the DOM
// at the moments a screen reader would announce something — that much is
// verified below. What is NOT verified here (no real assistive-technology
// harness exists in this repo) is that a screen reader actually announces
// it; that part stays manually unverified.
test('the dive live status region gets real text while dwelling and clears once the dwell ends (DOM only; not manually verified with a screen reader)', options, async () => {
  const h = await openHarness();
  try {
    assert.equal(await h.run(`document.getElementById('archify-dive-status').textContent`), '', 'empty before any dive activity');
    await h.pressZ();
    await h.zoomOntoCenteredNode('[data-node-id="hub"]', 2.7);
    // Capture the status text in the SAME script turn as the wait resolving
    // (no separate CDP round trip in between): under concurrent test load
    // (--test-concurrency=2 across many browser test files), a second,
    // later h.run() call to re-read the text can lose the race against the
    // dwell firing and clearing it (DWELL_MS is only 250ms) — this happened
    // in practice under full-suite load, not in isolation.
    const duringDwell = await h.run(`(async () => {
      ${WAIT}
      await fixtureWait(() => document.querySelector('[data-dive-preview]') !== null, 1500);
      return document.getElementById('archify-dive-status').textContent;
    })()`);
    assert.notEqual(duringDwell.trim(), '', 'the live region has real text while the dwell preview is showing');
    assert.equal(await h.run(`document.getElementById('archify-dive-status').getAttribute('aria-live')`), 'polite');
    assert.equal(await h.run(`document.getElementById('archify-dive-status').getAttribute('role')`), 'status');

    // Cancel the dwell (real pan) before it fires; the live region must go
    // back to empty rather than leaving stale text behind.
    await h.dragBy(40, 0);
    await h.run(`(async () => { ${WAIT} await fixtureWait(() => !document.querySelector('[data-dive-preview]'), 2000); })()`);
    assert.equal(await h.run(`document.getElementById('archify-dive-status').textContent`), '', 'cleared once the dwell is cancelled');
  } finally {
    await h.close();
  }
});
