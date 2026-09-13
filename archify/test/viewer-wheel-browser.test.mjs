import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome } from '../bin/visual-check.mjs';
import { desktopBrowser, desktopPointerCheck } from './helpers/desktop-browser.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.ARCHIFY_CHROME ? findChrome() : null;

test('Camera wheel and pinch gestures zoom continuously around a fixed point', {
  skip: chrome ? false : 'Set ARCHIFY_CHROME to run real-browser wheel/pinch checks.',
}, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-wheel-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const file = path.join(scratch, 'architecture.html');
  execFileSync(process.execPath, [
    path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'),
    path.join(skillRoot, 'examples/web-app.architecture.json'),
    file,
  ]);
  const browser = desktopBrowser(chrome);
  t.after(() => browser.close());
  const session = await browser.sessionPromise;
  const checkPointer = await desktopPointerCheck(browser, session);
  const send = (method, params = {}) => browser.cdp.send(method, params, session);
  await browser.cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
  async function run(expression, awaitPromise = false) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    return result.result?.value;
  }
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.wheelErrors = [];
    addEventListener('error', e => wheelErrors.push(e.message));
    addEventListener('unhandledrejection', e => wheelErrors.push(String(e.reason)));
    window.wheelWait = predicate => new Promise((resolve, reject) => {
      let frames = 0;
      function sample() {
        if (predicate()) return resolve();
        if (++frames > 300) return reject(new Error('Wheel observation did not settle'));
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  ` });
  async function settle() {
    await run(`(async () => {
      await document.fonts.ready;
      const start = performance.now();
      let previous = '', equal = 0;
      await wheelWait(() => {
        const svg = document.querySelector('.diagram-container > svg');
        const current = getComputedStyle(svg).transform;
        equal = current === previous ? equal + 1 : 0;
        previous = current;
        // Require both frame-to-frame stability and a real-time floor comfortably
        // past the 0.18s CSS transition, so a coarse or stalled frame cadence
        // under CPU contention cannot report "settled" mid-transition.
        return equal >= 6 && (performance.now() - start) >= 260;
      });
    })()`, true);
  }
  async function load({ width = 1440, height = 900 } = {}) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
    await send('Page.navigate', { url: pathToFileURL(file).href });
    await loaded;
    await checkPointer();
    await run('document.fonts.ready');
    await settle();
    const errors = await run('wheelErrors');
    assert.deepEqual(errors, [], 'no runtime errors after load');
  }
  async function point(selector) {
    return run(`(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
  }
  async function wheel(x, y, deltaY, { ctrlKey = false } = {}) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x, y, deltaX: 0, deltaY, modifiers: ctrlKey ? 2 : 0,
    });
  }
  async function assertNoErrors(label) {
    assert.deepEqual(await run('wheelErrors'), [], label);
  }
  async function frame() {
    await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`, true);
  }
  // touchStart/touchMove list every currently active touch (including ones
  // already down); touchEnd/touchCancel list only the touches that are ending.
  // Confirmed empirically: a touch id absent from a touchStart/touchMove call
  // is treated as lifted, while a touch id present in a touchEnd/touchCancel
  // call is the one that ends (not the one that survives).
  function touchList(points) { return points.map(p => ({ x: p.x, y: p.y, id: p.id })); }
  async function touchStart(points) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchList(points) }); }
  async function touchMove(points) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchList(points) }); }
  async function touchEnd(points) { await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: touchList(points) }); }
  async function touchCancel(points) { await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: touchList(points) }); }

  await t.test('wheel-up zooms in and keeps the content point under the cursor fixed', async () => {
    await load();
    const before = await point('[data-node-id="api"]');
    const beforeScale = await run(`Number(document.querySelector('.diagram-container > svg').getAttribute('data-view-scale'))`);
    assert.equal(beforeScale, 1);
    await wheel(before.x, before.y, -120);
    await settle();
    const afterScale = await run(`Number(document.querySelector('.diagram-container > svg').getAttribute('data-view-scale'))`);
    assert.ok(afterScale > beforeScale, `scale should increase: ${beforeScale} -> ${afterScale}`);
    const after = await point('[data-node-id="api"]');
    assert.ok(Math.abs(after.x - before.x) <= 1, `x drifted: ${before.x} -> ${after.x}`);
    assert.ok(Math.abs(after.y - before.y) <= 1, `y drifted: ${before.y} -> ${after.y}`);
    await assertNoErrors('wheel-up');
  });

  await t.test('wheel-down at minimum scale scrolls the page instead of zooming', async () => {
    await load({ height: 500 });
    const before = await run('window.scrollY');
    const target = await point('.diagram-container');
    await wheel(target.x, target.y, 240);
    await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`, true);
    const after = await run('window.scrollY');
    const scale = await run(`Archify.view.state().scale`);
    assert.equal(scale, 1, 'scale must stay at the minimum');
    assert.ok(after > before, `page should have scrolled: ${before} -> ${after}`);
    await assertNoErrors('wheel-down-min');
  });

  await t.test('ctrl+wheel (trackpad pinch gesture) zooms with the stronger 0.01 multiplier', async () => {
    await load();
    const target = await point('[data-node-id="api"]');
    await wheel(target.x, target.y, -50, { ctrlKey: true });
    await settle();
    const scale = await run(`Archify.view.state().scale`);
    const expected = Math.min(3, Math.max(1, Math.exp(50 * 0.01)));
    assert.ok(Math.abs(scale - expected) < 0.001, `ctrl+wheel should match the 0.01 coefficient: expected ${expected}, got ${scale}`);
    await assertNoErrors('ctrl-wheel');
  });

  await t.test('deltaMode 1 (line) and 2 (page) scale deltaY by 16x/100x', async () => {
    await load();
    for (const [deltaMode, multiplier] of [[1, 16], [2, 100]]) {
      await run(`Archify.view.reset()`);
      await settle();
      const target = await point('[data-node-id="api"]');
      const rawDeltaY = -0.5;
      const expected = Math.min(3, Math.max(1, Math.exp(-(rawDeltaY * multiplier) * 0.0015)));
      await run(`document.querySelector('.diagram-container').dispatchEvent(new WheelEvent('wheel', {
        deltaY: ${rawDeltaY}, deltaMode: ${deltaMode}, clientX: ${target.x}, clientY: ${target.y},
        bubbles: true, cancelable: true
      }))`);
      await settle();
      const scale = await run(`Archify.view.state().scale`);
      assert.ok(Math.abs(scale - expected) < 0.001, `deltaMode ${deltaMode}: expected ${expected}, got ${scale}`);
    }
    await assertNoErrors('delta-mode');
  });

  await t.test('two rapid wheel-up ticks fired before the CSS transition settles stay numerically finite and point-fixed', async () => {
    await load();
    const target = await point('[data-node-id="api"]');
    await wheel(target.x, target.y, -120);
    await wheel(target.x, target.y, -120);
    await settle();
    const state = await run(`Archify.view.state()`);
    assert.ok(Number.isFinite(state.x) && Number.isFinite(state.y) && Number.isFinite(state.scale),
      `state must stay finite across back-to-back ticks: ${JSON.stringify(state)}`);
    const after = await point('[data-node-id="api"]');
    assert.ok(Math.abs(after.x - target.x) <= 2, `x should stay close to the wheel point across both ticks: ${target.x} -> ${after.x}`);
    assert.ok(Math.abs(after.y - target.y) <= 2, `y should stay close to the wheel point across both ticks: ${target.y} -> ${after.y}`);
    await assertNoErrors('rapid-wheel');
  });

  await t.test('two-finger touch pinch zooms in and keeps the midpoint fixed', async () => {
    await load();
    const target = await point('[data-node-id="api"]');
    const p1 = { x: target.x - 30, y: target.y, id: 1 };
    const p2 = { x: target.x + 30, y: target.y, id: 2 };
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p1.x, y: p1.y, id: p1.id }] });
    await send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: p1.x, y: p1.y, id: p1.id }, { x: p2.x, y: p2.y, id: p2.id }],
    });
    const p1b = { x: target.x - 60, y: target.y };
    const p2b = { x: target.x + 60, y: target.y };
    await send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: p1b.x, y: p1b.y, id: p1.id }, { x: p2b.x, y: p2b.y, id: p2.id }],
    });
    await settle();
    const scale = await run(`Archify.view.state().scale`);
    assert.ok(scale > 1, `pinch should zoom in: ${scale}`);
    const renderedScale = await run(`getComputedStyle(document.querySelector('.diagram-container > svg')).transform`);
    assert.notEqual(renderedScale, 'none', 'the SVG transform must be a valid, applied matrix');
    const after = await point('[data-node-id="api"]');
    assert.ok(Math.abs(after.x - target.x) <= 2, `pinch midpoint x drifted: ${target.x} -> ${after.x}`);
    assert.ok(Math.abs(after.y - target.y) <= 2, `pinch midpoint y drifted: ${target.y} -> ${after.y}`);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await assertNoErrors('pinch');
  });

  await t.test('wheel does nothing on a narrow, mobile-contained wide diagram', async () => {
    await load({ width: 400, height: 700 });
    const wide = await run(`document.querySelector('.diagram-container').hasAttribute('data-wide-diagram')`);
    assert.equal(wide, true, 'the fixture must be a wide diagram for this branch');
    const before = await run(`Archify.view.state()`);
    const target = await point('.diagram-container');
    await wheel(target.x, target.y, -120);
    await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`, true);
    const after = await run(`Archify.view.state()`);
    assert.deepEqual(after, before, 'camera state must be untouched in mobile-contained mode');
    await assertNoErrors('mobile-contained-wheel');
  });

  await t.test('pinch does nothing on a narrow, mobile-contained wide diagram', async () => {
    await load({ width: 400, height: 700 });
    const wide = await run(`document.querySelector('.diagram-container').hasAttribute('data-wide-diagram')`);
    assert.equal(wide, true, 'the fixture must be a wide diagram for this branch');
    const before = await run(`Archify.view.state()`);
    const target = await point('.diagram-container');
    const p1 = { x: target.x - 30, y: target.y, id: 101 };
    const p2 = { x: target.x + 30, y: target.y, id: 102 };
    await touchStart([p1]);
    await touchStart([p1, p2]);
    await touchMove([{ ...p1, x: target.x - 60 }, { ...p2, x: target.x + 60 }]);
    await frame();
    const after = await run(`Archify.view.state()`);
    assert.deepEqual(after, before, 'camera state must be untouched by pinch in mobile-contained mode, same as wheel');
    await touchEnd([{ x: target.x - 60, y: target.y, id: p1.id }, { x: target.x + 60, y: target.y, id: p2.id }]);
    await assertNoErrors('mobile-contained-pinch');
  });

  await t.test('svgOrigin accounts for the container\'s own internal scroll (narrow wide-diagram mode)', async () => {
    await load({ width: 400, height: 700 });
    const wide = await run(`document.querySelector('.diagram-container').hasAttribute('data-wide-diagram')`);
    assert.equal(wide, true, 'the fixture must be a wide diagram for this branch');
    const before = await run(`(() => {
      const c = document.querySelector('.diagram-container');
      // The container's own CSS scroll-behavior:smooth makes even a plain
      // scrollLeft assignment animate in Chrome; force instant so the
      // fixed-point math below sees the real, already-committed offset.
      c.style.scrollBehavior = 'auto';
      c.scrollLeft = 100;
      const r = document.querySelector('[data-node-id="api"]').getBoundingClientRect();
      const point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      Archify.view.zoomAt(2, point.x, point.y);
      return point;
    })()`);
    await frame();
    const after = await point('[data-node-id="api"]');
    assert.ok(Math.abs(after.x - before.x) <= 1, `x drifted with 100px internal scroll: ${before.x} -> ${after.x}`);
    assert.ok(Math.abs(after.y - before.y) <= 1, `y drifted with 100px internal scroll: ${before.y} -> ${after.y}`);
    await assertNoErrors('scroll-origin');
  });

  await t.test('a third touch during an active pinch does not start a drag', async () => {
    await load();
    const target = await point('[data-node-id="api"]');
    const p1 = { x: target.x - 30, y: target.y, id: 111 };
    const p2 = { x: target.x + 30, y: target.y, id: 112 };
    await touchStart([p1]);
    await touchStart([p1, p2]);
    await settle();
    const beforeThird = await run(`Archify.view.state()`);
    const p3 = { x: target.x + 200, y: target.y + 200, id: 113 };
    await touchStart([p1, p2, p3]);
    await touchMove([p1, p2, { x: p3.x - 300, y: p3.y - 300, id: p3.id }]);
    await frame();
    const afterThird = await run(`Archify.view.state()`);
    assert.deepEqual(afterThird, beforeThird, 'a third touch must not pan the camera while a pinch is active');
    await touchEnd([p1, p2, { x: p3.x - 300, y: p3.y - 300, id: p3.id }]);
    await assertNoErrors('third-finger');
  });

  await t.test('lifting one pinch finger ends the gesture and the remaining finger does not resume panning', async () => {
    await load();
    const target = await point('[data-node-id="api"]');
    const p1 = { x: target.x - 30, y: target.y, id: 121 };
    const p2 = { x: target.x + 30, y: target.y, id: 122 };
    await touchStart([p1]);
    await touchStart([p1, p2]);
    await touchMove([{ ...p1, x: target.x - 60 }, { ...p2, x: target.x + 60 }]);
    await settle();
    const afterPinch = await run(`Archify.view.state()`);
    assert.ok(afterPinch.scale > 1, 'pinch should have zoomed in first');
    await touchEnd([{ x: target.x - 60, y: target.y, id: p1.id }]);
    await frame();
    await touchMove([{ x: target.x - 260, y: target.y - 200, id: p2.id }]);
    await frame();
    const afterDrag = await run(`Archify.view.state()`);
    assert.deepEqual(afterDrag, afterPinch, 'the remaining finger must not resume panning after the pinch ends');
    await touchEnd([{ x: target.x - 260, y: target.y - 200, id: p2.id }]);
    await assertNoErrors('one-finger-continuation');
  });

  await t.test('a cancelled pinch cleans up so a fresh pinch still works afterward', async () => {
    await load();
    const target = await point('[data-node-id="api"]');
    const p1 = { x: target.x - 30, y: target.y, id: 131 };
    const p2 = { x: target.x + 30, y: target.y, id: 132 };
    await touchStart([p1]);
    await touchStart([p1, p2]);
    await settle();
    // CDP's touchCancel only supports cancelling the entire active touch
    // sequence at once (an empty touchPoints list), never a single finger.
    await touchCancel([]);
    await frame();
    const q1 = { x: target.x - 30, y: target.y, id: 141 };
    const q2 = { x: target.x + 30, y: target.y, id: 142 };
    await touchStart([q1]);
    await touchStart([q1, q2]);
    await touchMove([{ ...q1, x: target.x - 60 }, { ...q2, x: target.x + 60 }]);
    await settle();
    const scale = await run(`Archify.view.state().scale`);
    assert.ok(scale > 1, `a fresh pinch after a cancelled one should still zoom in: ${scale}`);
    await touchEnd([{ x: target.x - 60, y: target.y, id: q1.id }, { x: target.x + 60, y: target.y, id: q2.id }]);
    await assertNoErrors('pinch-cancel-cleanup');
  });

  await t.test('losing pointer capture mid-drag stops further panning', async () => {
    await load();
    await run(`Archify.view.zoomIn()`);
    await settle();
    await run(`(() => {
      window.dragPointerId = null;
      document.querySelector('.diagram-container').addEventListener('pointerdown', e => { window.dragPointerId = e.pointerId; }, { once: true });
    })()`);
    const target = await point('.diagram-container');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x + 20, y: target.y + 10, button: 'left' });
    await frame();
    const beforeLoss = await run(`Archify.view.state()`);
    const pointerId = await run(`window.dragPointerId`);
    assert.equal(typeof pointerId, 'number', 'the drag pointerdown must have been observed');
    await run(`document.querySelector('.diagram-container').releasePointerCapture(${pointerId})`);
    await frame();
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x + 300, y: target.y + 300, button: 'left' });
    await frame();
    const afterLoss = await run(`Archify.view.state()`);
    assert.deepEqual(afterLoss, beforeLoss, 'losing capture must stop the drag from panning further');
    assert.equal(await run(`document.querySelector('.diagram-container').classList.contains('is-panning')`), false,
      'is-panning must be cleared when capture is lost');
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x + 300, y: target.y + 300, button: 'left' });
    await assertNoErrors('lostpointercapture-drag');
  });

  await t.test('a pointerup fired outside the container still ends the drag (capture keeps delivering it)', async () => {
    await load();
    await run(`Archify.view.zoomIn()`);
    await settle();
    const target = await point('.diagram-container');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x + 20, y: target.y + 10, button: 'left' });
    await frame();
    const beforeUp = await run(`Archify.view.state()`);
    // Release far outside the container's own box; capture routes the event
    // to the container regardless of where the pointer physically is.
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left' });
    await frame();
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x + 300, y: target.y + 300 });
    await frame();
    const afterUp = await run(`Archify.view.state()`);
    assert.deepEqual(afterUp, beforeUp, 'an outside pointerup must end the drag, not leave it panning');
    await assertNoErrors('pointerup-outside');
  });

  await t.test('zoomAt stays cursor-fixed under RTL (negative scrollLeft)', async () => {
    await load({ width: 400, height: 700 });
    const wide = await run(`document.querySelector('.diagram-container').hasAttribute('data-wide-diagram')`);
    assert.equal(wide, true, 'the fixture must be a wide diagram for this branch');
    const before = await run(`(() => {
      const c = document.querySelector('.diagram-container');
      document.documentElement.setAttribute('dir', 'rtl');
      c.setAttribute('dir', 'rtl');
      c.style.scrollBehavior = 'auto';
      // RTL scrollLeft is 0 or negative in Chrome/Firefox's default model;
      // push it toward its negative end.
      c.scrollLeft = -80;
      const r = document.querySelector('[data-node-id="api"]').getBoundingClientRect();
      const point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      Archify.view.zoomAt(2, point.x, point.y);
      return { point: point, scrollLeft: c.scrollLeft };
    })()`);
    assert.ok(before.scrollLeft <= 0, `RTL scrollLeft should be zero or negative, got ${before.scrollLeft}`);
    await frame();
    const after = await point('[data-node-id="api"]');
    assert.ok(Math.abs(after.x - before.point.x) <= 1, `x drifted under RTL scroll: ${before.point.x} -> ${after.x}`);
    assert.ok(Math.abs(after.y - before.point.y) <= 1, `y drifted under RTL scroll: ${before.point.y} -> ${after.y}`);
    await run(`(() => {
      document.documentElement.removeAttribute('dir');
    })()`);
    await assertNoErrors('rtl-scroll-origin');
  });

  await t.test('zoomAt stays cursor-fixed after a resize', async () => {
    await load();
    await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 760, deviceScaleFactor: 1, mobile: false });
    await run(`window.dispatchEvent(new Event('resize'))`);
    await frame();
    const target = await point('[data-node-id="api"]');
    await run(`Archify.view.zoomAt(2, ${JSON.stringify(target.x)}, ${JSON.stringify(target.y)})`);
    await frame();
    const after = await point('[data-node-id="api"]');
    assert.ok(Math.abs(after.x - target.x) <= 1, `x drifted after resize: ${target.x} -> ${after.x}`);
    assert.ok(Math.abs(after.y - target.y) <= 1, `y drifted after resize: ${target.y} -> ${after.y}`);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await assertNoErrors('resize-origin');
  });

  await t.test('wheel gesture id groups rapid ticks and starts a new id after a pause', async () => {
    await load();
    const target = await point('[data-node-id="api"]');
    await run(`(() => {
      window.gestureLog = [];
      window.gestureCb = e => window.gestureLog.push(e);
      Archify.view.on('gesture', window.gestureCb);
    })()`);
    await wheel(target.x, target.y, -20);
    await wheel(target.x, target.y, -20);
    await run(`new Promise(resolve => setTimeout(resolve, 220))`, true);
    await wheel(target.x, target.y, -20);
    await run(`new Promise(resolve => setTimeout(resolve, 220))`, true);
    const log = (await run(`window.gestureLog`)).filter(e => e.source === 'wheel');
    assert.equal(log[0].phase, 'start');
    assert.equal(log[1].phase, 'move');
    assert.equal(log[0].id, log[1].id, 'ticks within 150ms share one gesture id');
    const endIndex = log.findIndex(e => e.phase === 'end');
    assert.ok(endIndex > 1, 'an end phase must follow 150ms of silence');
    assert.equal(log[endIndex].id, log[0].id);
    const nextStart = log.find((e, i) => i > endIndex && e.phase === 'start');
    assert.ok(nextStart, 'a wheel tick after the pause must start a new gesture');
    assert.notEqual(nextStart.id, log[0].id, 'the new gesture must have a different id');
    await run(`Archify.view.off('gesture', window.gestureCb)`);
    await assertNoErrors('wheel-gesture-id');
  });

  await t.test('pinch gesture emits start, move and end with a stable id', async () => {
    await load();
    const target = await point('[data-node-id="api"]');
    await run(`(() => {
      window.pinchGestureLog = [];
      window.pinchGestureCb = e => window.pinchGestureLog.push(e);
      Archify.view.on('gesture', window.pinchGestureCb);
    })()`);
    const p1 = { x: target.x - 30, y: target.y, id: 151 };
    const p2 = { x: target.x + 30, y: target.y, id: 152 };
    await touchStart([p1]);
    await touchStart([p1, p2]);
    await touchMove([{ ...p1, x: target.x - 60 }, { ...p2, x: target.x + 60 }]);
    await settle();
    await touchEnd([{ x: target.x - 60, y: target.y, id: p1.id }, { x: target.x + 60, y: target.y, id: p2.id }]);
    const log = (await run(`window.pinchGestureLog`)).filter(e => e.source === 'pinch');
    assert.equal(log[0].phase, 'start');
    assert.ok(log.some(e => e.phase === 'move'), 'pinch should report move phases');
    const last = log[log.length - 1];
    assert.equal(last.phase, 'end');
    assert.equal(last.id, log[0].id, 'start/move/end must share one gesture id');
    await run(`Archify.view.off('gesture', window.pinchGestureCb)`);
    await assertNoErrors('pinch-gesture-id');
  });

  await t.test('pinching inward (closing) at the 1x floor emits minZoomOut', async () => {
    await load();
    const target = await point('[data-node-id="api"]');
    await run(`(() => {
      window.minZoomLog = [];
      window.minZoomCb = e => window.minZoomLog.push(e);
      Archify.view.on('minZoomOut', window.minZoomCb);
    })()`);
    const p1 = { x: target.x - 60, y: target.y, id: 161 };
    const p2 = { x: target.x + 60, y: target.y, id: 162 };
    await touchStart([p1]);
    await touchStart([p1, p2]);
    await touchMove([{ ...p1, x: target.x - 20 }, { ...p2, x: target.x + 20 }]);
    await frame();
    const scale = await run(`Archify.view.state().scale`);
    assert.equal(scale, 1, 'scale must stay clamped at the floor');
    const log = await run(`window.minZoomLog`);
    // Chrome can split one compound two-finger touchMove into two separate
    // per-pointer pointermove events, each independently satisfying "closing
    // while already at the floor" — so at least one event is the real
    // contract, not an exact count (the exact-zero contracts below are).
    assert.ok(log.length >= 1, `closing at the floor must emit at least one event, got ${JSON.stringify(log)}`);
    assert.equal(log[0].source, 'pinch');
    assert.equal(typeof log[0].gestureId, 'number');
    await touchEnd([{ x: target.x - 20, y: target.y, id: p1.id }, { x: target.x + 20, y: target.y, id: p2.id }]);
    await run(`Archify.view.off('minZoomOut', window.minZoomCb)`);
    await assertNoErrors('pinch-min-zoom-out');
  });

  await t.test('reopening a pinch after hitting the floor does not emit additional minZoomOut events', async () => {
    await load();
    const target = await point('[data-node-id="api"]');
    await run(`(() => {
      window.minZoomLog2 = [];
      window.minZoomCb2 = e => window.minZoomLog2.push(e);
      Archify.view.on('minZoomOut', window.minZoomCb2);
    })()`);
    const p1 = { x: target.x - 60, y: target.y, id: 163 };
    const p2 = { x: target.x + 60, y: target.y, id: 164 };
    await touchStart([p1]);
    await touchStart([p1, p2]);
    // Close in past the floor first (one or more legitimate events, depending
    // on how Chrome splits the compound move), then reopen the fingers again
    // without exceeding the original start distance: the resolved scale still
    // computes below 1x for part of this move, but the instantaneous
    // direction is now opening, so no new event may fire.
    await touchMove([{ ...p1, x: target.x - 20 }, { ...p2, x: target.x + 20 }]);
    await frame();
    const countAfterClose = (await run(`window.minZoomLog2`)).length;
    assert.ok(countAfterClose >= 1, `closing at the floor must emit at least one event, got ${countAfterClose}`);
    await touchMove([{ ...p1, x: target.x - 50 }, { ...p2, x: target.x + 50 }]);
    await frame();
    const countAfterReopen = (await run(`window.minZoomLog2`)).length;
    assert.equal(countAfterReopen, countAfterClose, `reopening must not add events beyond the initial close: ${JSON.stringify(await run('window.minZoomLog2'))}`);
    await touchEnd([{ x: target.x - 50, y: target.y, id: p1.id }, { x: target.x + 50, y: target.y, id: p2.id }]);
    await run(`Archify.view.off('minZoomOut', window.minZoomCb2)`);
    await assertNoErrors('pinch-reopen-no-extra-event');
  });

  await t.test('a third touch moving during an active pinch does not emit minZoomOut', async () => {
    await load();
    const target = await point('[data-node-id="api"]');
    await run(`(() => {
      window.minZoomLog3 = [];
      window.minZoomCb3 = e => window.minZoomLog3.push(e);
      Archify.view.on('minZoomOut', window.minZoomCb3);
    })()`);
    const p1 = { x: target.x - 60, y: target.y, id: 165 };
    const p2 = { x: target.x + 60, y: target.y, id: 166 };
    await touchStart([p1]);
    await touchStart([p1, p2]);
    await touchMove([{ ...p1, x: target.x - 20 }, { ...p2, x: target.x + 20 }]);
    await frame();
    const countAfterClose = (await run(`window.minZoomLog3`)).length;
    assert.ok(countAfterClose >= 1, `the initial close must emit at least one legitimate event, got ${countAfterClose}`);
    const p3 = { x: target.x + 200, y: target.y + 200, id: 167 };
    const closed1 = { x: target.x - 20, y: target.y, id: p1.id };
    const closed2 = { x: target.x + 20, y: target.y, id: p2.id };
    await touchStart([closed1, closed2, p3]);
    await touchMove([closed1, closed2, { x: p3.x - 300, y: p3.y - 300, id: p3.id }]);
    await frame();
    const countAfterThird = (await run(`window.minZoomLog3`)).length;
    assert.equal(countAfterThird, countAfterClose, 'a third finger moving alone must not emit minZoomOut');
    await touchEnd([closed1, closed2, { x: p3.x - 300, y: p3.y - 300, id: p3.id }]);
    await run(`Archify.view.off('minZoomOut', window.minZoomCb3)`);
    await assertNoErrors('pinch-third-finger-no-event');
  });

  await t.test('onChange reports transitioning:true immediately and transitioning:false once settled', async () => {
    await load();
    await run(`(() => {
      window.transSeen = [];
      window.transCb = s => window.transSeen.push(s);
      Archify.view.onChange(window.transCb);
    })()`);
    await run(`Archify.view.zoomIn()`);
    const immediate = await run(`window.transSeen[window.transSeen.length - 1]`);
    assert.equal(immediate.transitioning, true);
    assert.equal(immediate.scale, 1.25);
    await run(`new Promise(resolve => setTimeout(resolve, 400))`, true);
    const settled = await run(`window.transSeen[window.transSeen.length - 1]`);
    assert.equal(settled.transitioning, false);
    assert.equal(settled.scale, 1.25);
    await run(`Archify.view.offChange(window.transCb)`);
    await assertNoErrors('onchange-transitioning');
  });

  await t.test('export SVG bytes are byte-identical whether or not the camera moved first', async () => {
    await load();
    async function exportSvgText() {
      return run(`(async () => {
        const original = URL.createObjectURL;
        let blob;
        URL.createObjectURL = value => { if (value.type.startsWith('image/svg+xml')) blob = value; return original.call(URL, value); };
        try { await Archify.exportMenu.run('svg'); } finally { URL.createObjectURL = original; }
        return blob.text();
      })()`, true);
    }
    const pristine = await exportSvgText();
    const target = await point('[data-node-id="api"]');
    await wheel(target.x, target.y, -120);
    await settle();
    const p1 = { x: target.x - 30, y: target.y, id: 171 };
    const p2 = { x: target.x + 30, y: target.y, id: 172 };
    await touchStart([p1]);
    await touchStart([p1, p2]);
    await touchMove([{ ...p1, x: target.x - 60 }, { ...p2, x: target.x + 60 }]);
    await settle();
    await touchEnd([{ x: target.x - 60, y: target.y, id: p1.id }, { x: target.x + 60, y: target.y, id: p2.id }]);
    const moved = await exportSvgText();
    assert.equal(moved, pristine, 'export bytes must not depend on prior wheel/pinch camera moves');
    await assertNoErrors('export-byte-identity');
  });

  await t.test('manual zoom still works under prefers-reduced-motion', async () => {
    await send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await load();
    const target = await point('[data-node-id="api"]');
    await wheel(target.x, target.y, -120);
    await settle();
    const scale = await run(`Archify.view.state().scale`);
    assert.ok(scale > 1, `manual zoom should still work under reduced motion: ${scale}`);
    await assertNoErrors('reduced-motion-zoom');
    await send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  });

  await t.test('the + control still steps by a quarter and onChange fires on every apply', async () => {
    await load();
    await run(`(() => {
      window.wheelSeen = [];
      window.wheelCb = snapshot => window.wheelSeen.push(snapshot.scale);
      Archify.view.onChange(window.wheelCb);
    })()`);
    await run(`Archify.view.zoomIn()`);
    await settle();
    assert.equal(await run(`window.wheelSeen[window.wheelSeen.length - 1]`), 1.25);
    await run(`Archify.view.zoomIn()`);
    await settle();
    assert.equal(await run(`window.wheelSeen[window.wheelSeen.length - 1]`), 1.5);
    const countBeforeOff = await run(`window.wheelSeen.length`);
    await run(`Archify.view.offChange(window.wheelCb)`);
    await run(`Archify.view.zoomIn()`);
    await settle();
    const countAfterOff = await run(`window.wheelSeen.length`);
    assert.equal(countAfterOff, countBeforeOff, 'offChange must stop further notifications');
    const scale = await run(`Archify.view.state().scale`);
    assert.equal(scale, 1.75);
    await assertNoErrors('onChange');
  });
});
