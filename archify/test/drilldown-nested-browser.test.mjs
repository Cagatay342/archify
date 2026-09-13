import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { ChromeVisualBrowser, findChrome } from '../bin/visual-check.mjs';
import { disposeBundleFixture, stageBundleFixture } from './helpers/bundle-fixture.mjs';

const chromePath = process.env.ARCHIFY_CHROME ? findChrome() : null;
const options = { skip: chromePath ? false : 'Set ARCHIFY_CHROME to run nested drilldown browser checks.' };

// Faz 2: entry (checkout-platform) -> child (payments, component "payments")
// -> grandchild (settlement, component "psp"), from the Faz 1 deep fixture.
// Served over a same-origin HTTP server (not file://) so the three nested
// documents can reach each other's `contentWindow` directly, the same way
// `bundle-message-origin-browser.test.mjs` does for its single-level checks.

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

async function openHarness({ beforeOpen } = {}) {
  const dir = stageBundleFixture({ prefix: 'archify-nested-', deep: true });
  if (beforeOpen) await beforeOpen(dir);
  const server = await serve(dir);
  const browser = new ChromeVisualBrowser(chromePath);
  const session = await browser.sessionPromise;
  async function run(expression) {
    const result = await browser.cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, session, 30000);
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    return result.result?.value;
  }
  await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, session);
  const url = `http://127.0.0.1:${server.address().port}/checkout-platform.html`;
  async function open() {
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session, 30000);
    await browser.cdp.send('Page.navigate', { url }, session);
    await loaded;
    await run(`document.fonts.ready.then(()=>Archify.readerLayout.whenStable()).then(()=>Archify.viewerChromeLayout.whenStable())`);
  }
  await open();
  return {
    dir, server, browser, session, run,
    async close() {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
      disposeBundleFixture(dir);
    },
  };
}

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

// Chains of `.contentWindow` reach the payments (depth 1) and settlement
// (depth 2) documents directly, because the harness serves every diagram
// from the same origin.
const CHILD = `document.getElementById('archify-drilldown-frame').contentWindow`;
const GRANDCHILD = `${CHILD}.document.getElementById('archify-drilldown-frame').contentWindow`;

test('entry descends into a child and a grandchild, readiness gated on ACK', options, async () => {
  const h = await openHarness();
  try {
    const rootDescend = await h.run(`(async () => {
      ${WAIT}
      const ok = Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      return { ok, state: document.documentElement.getAttribute('data-drilldown-state') };
    })()`);
    assert.equal(rootDescend.ok, true);
    assert.equal(rootDescend.state, 'open');

    const childDescend = await h.run(`(async () => {
      ${WAIT}
      const child = ${CHILD};
      const ok = child.Archify.drilldown.descend('psp');
      await fixtureWait(() => child.document.documentElement.getAttribute('data-drilldown-state') === 'open');
      return { ok, state: child.document.documentElement.getAttribute('data-drilldown-state') };
    })()`);
    assert.equal(childDescend.ok, true);
    assert.equal(childDescend.state, 'open');

    const grandchildIdentity = await h.run(`({
      nested: ${GRANDCHILD}.document.documentElement.getAttribute('data-bundle-nested'),
      depth: ${GRANDCHILD}.document.documentElement.getAttribute('data-drilldown-depth'),
      role: ${GRANDCHILD}.document.querySelector('.diagram-container svg').getAttribute('data-bundle-role'),
    })`);
    assert.equal(grandchildIdentity.nested, 'true');
    assert.equal(grandchildIdentity.depth, '2');
    assert.equal(grandchildIdentity.role, 'child');

    const rootCrumb = await h.run(`[...document.querySelectorAll('.archify-drilldown-crumb *')].map(n => n.textContent).join('|')`);
    assert.match(rootCrumb, /Payment Rail/);
    assert.match(rootCrumb, /Card Network/);
  } finally {
    await h.close();
  }
});

test('root breadcrumb aggregates a three-rung chain; the middle rung closes only the grandchild', options, async () => {
  const h = await openHarness();
  try {
    await h.run(`(async () => {
      ${WAIT}
      Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const child = ${CHILD};
      child.Archify.drilldown.descend('psp');
      await fixtureWait(() => child.document.documentElement.getAttribute('data-drilldown-state') === 'open');
    })()`);

    const rungs = await h.run(`[...document.querySelectorAll('.archify-drilldown-crumb button, .archify-drilldown-crumb [aria-current]')].map(n => ({
      tag: n.tagName, text: n.textContent, current: n.getAttribute('aria-current'),
    }))`);
    assert.equal(rungs.length, 3, JSON.stringify(rungs));
    assert.equal(rungs[0].tag, 'BUTTON', 'root rung is clickable');
    assert.equal(rungs[1].tag, 'BUTTON', 'middle rung (payments) is clickable');
    assert.equal(rungs[2].current, 'page', 'last rung (settlement) is the current one');

    await h.run(`(async () => {
      ${WAIT}
      [...document.querySelectorAll('.archify-drilldown-crumb button')][1].click();
      await fixtureWait(() => ${CHILD}.document.documentElement.getAttribute('data-drilldown-state') !== 'open'
        || !${CHILD}.Archify.drilldown.active());
      await fixtureWait(() => !${CHILD}.Archify.drilldown.active());
    })()`);

    const after = await h.run(`({
      childActive: ${CHILD}.Archify.drilldown.active(),
      childSrc: ${CHILD}.document.getElementById('archify-drilldown-frame').getAttribute('src'),
      rootActive: Archify.drilldown.active(),
      crumb: [...document.querySelectorAll('.archify-drilldown-crumb *')].map(n => n.textContent).join('|'),
    })`);
    assert.equal(after.rootActive, true, 'root keeps its own child (payments) open');
    assert.equal(after.childActive, false, 'payments no longer has settlement open');
    assert.equal(after.childSrc, null, 'the grandchild iframe was torn down');
    assert.match(after.crumb, /Payment Rail/);
    assert.doesNotMatch(after.crumb, /Card Network/);
  } finally {
    await h.close();
  }
});

// NOTE on this test's keyboard technique (Faz 5, supersedes the earlier
// "harness limitation" finding): a real OS-level Escape keypress, delivered
// through CDP's top-level Input.dispatchKeyEvent, DOES reach a doubly-nested
// (grandchild) same-origin iframe's focused element — but two extra steps,
// beyond a plain `.focus()` call, are required for Chrome to actually route
// it there instead of the root document:
//   1. `Page.bringToFront` + `Emulation.setFocusEmulationEnabled({enabled:
//      true})` so `document.hasFocus()` is true at every nesting level
//      (without it, even a real click leaves the grandchild's own
//      `document.hasFocus()` reporting false and the key still lands on
//      root).
//   2. A real `Input.dispatchMouseEvent` click on the target node's actual
//      screen coordinates (computed by summing the outer and inner
//      `<iframe>` `getBoundingClientRect()` offsets with the node's own
//      rect inside the grandchild). A plain `contentWindow.focus()` +
//      `node.focus()` chain (astra tur-2's attempt) sets
//      `document.activeElement` correctly but does NOT move Chrome's real
//      input-routing target across the iframe boundary; only a real,
//      trusted pointer event does.
// That real click has a side effect worth documenting: clicking a diagram
// node also engages the viewer's own click-driven focus/trace highlight
// (`Archify.focus` / `Archify.intentTrace`), and the shared keydown
// handler's Escape ladder clears that highlight *before* it ascends a
// drilldown level (see the handler's doc comment: "clear temporary
// trace/focus/view first, then exit presentation"). So each drilldown level
// needs two real Escape presses here: the first is consumed by the
// highlight-clear branch, the second reaches `escapeToParent()`. This was
// verified directly (a temporary counter-wrapped `escapeToParent`,
// `focus.clear`, `intentTrace.clear` showed exactly this two-press
// sequence) before being folded into the assertions below.
test('Escape inside the grandchild closes one level at a time and restores focus to the entry node, via real OS-level keyboard input', options, async () => {
  const h = await openHarness();
  try {
    await h.run(`(async () => {
      ${WAIT}
      Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const child = ${CHILD};
      child.Archify.drilldown.descend('psp');
      await fixtureWait(() => child.document.documentElement.getAttribute('data-drilldown-state') === 'open');
    })()`);

    await h.browser.cdp.send('Page.bringToFront', {}, h.session);
    await h.browser.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, h.session);

    async function realClickOn(windowExpr) {
      const coords = await h.run(`(() => {
        const outerRect = document.getElementById('archify-drilldown-frame').getBoundingClientRect();
        const innerRect = ${CHILD}.document.getElementById('archify-drilldown-frame').getBoundingClientRect();
        const node = ${windowExpr}.document.querySelector('.diagram-container svg [data-node-id]');
        const nodeRect = node.getBoundingClientRect();
        return {
          x: outerRect.left + innerRect.left + nodeRect.left + nodeRect.width / 2,
          y: outerRect.top + innerRect.top + nodeRect.top + nodeRect.height / 2,
        };
      })()`);
      await h.browser.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: coords.x, y: coords.y }, h.session);
      await h.browser.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: coords.x, y: coords.y, button: 'left', clickCount: 1 }, h.session);
      await h.browser.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coords.x, y: coords.y, button: 'left', clickCount: 1 }, h.session);
    }

    async function realEscape() {
      await h.browser.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, h.session, 15000);
      await h.browser.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, h.session, 15000);
    }

    await realClickOn(GRANDCHILD);
    const clickedIdentity = await h.run(`({
      activeInGrandchild: ${GRANDCHILD}.document.activeElement && ${GRANDCHILD}.document.activeElement.getAttribute('data-node-id'),
      hasFocus: ${GRANDCHILD}.document.hasFocus(),
    })`);
    assert.ok(clickedIdentity.activeInGrandchild, 'the real click gave the grandchild a real focused node');
    assert.equal(clickedIdentity.hasFocus, true);

    // Press #1: clears the click-triggered focus/trace highlight.
    await realEscape();
    await h.run(`new Promise((resolve) => setTimeout(resolve, 300))`);
    // Press #2: reaches the isNestedChild branch and calls escapeToParent().
    await realEscape();
    await h.run(`(async () => { ${WAIT} await fixtureWait(() => !${CHILD}.Archify.drilldown.active()); })()`);
    let state = await h.run(`({
      childActive: ${CHILD}.Archify.drilldown.active(),
      rootActive: Archify.drilldown.active(),
    })`);
    assert.equal(state.childActive, false, 'the real Escape presses closed the innermost (grandchild) level');
    assert.equal(state.rootActive, true, 'the child (payments) stays open after the grandchild closes');

    // back()'s restoreFocus already moved real focus to payments' own "psp"
    // node (verified below); no extra click is needed at this level.
    const restoredFocus = await h.run(`({
      activeInChild: ${CHILD}.document.activeElement && ${CHILD}.document.activeElement.getAttribute('data-node-id'),
      hasFocus: ${CHILD}.document.hasFocus(),
    })`);
    assert.equal(restoredFocus.activeInChild, 'psp', "restoreFocus moved real focus to payments' own descended-from node");
    assert.equal(restoredFocus.hasFocus, true);

    await realEscape();
    await realEscape();
    await h.run(`(async () => { ${WAIT} await fixtureWait(() => !Archify.drilldown.active()); })()`);
    state = await h.run(`({ rootActive: Archify.drilldown.active() })`);
    assert.equal(state.rootActive, false, 'the second pair of real Escape presses closes the child too');

    const focused = await h.run(`document.activeElement && document.activeElement.getAttribute('data-node-id')`);
    assert.equal(focused, 'payments', 'focus returns to the component node that was originally descended from');
  } finally {
    await h.close();
  }
});

test('Escape with real focus on the root breadcrumb rung closes only the innermost open level', options, async () => {
  const h = await openHarness();
  try {
    await h.run(`(async () => {
      ${WAIT}
      Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const child = ${CHILD};
      child.Archify.drilldown.descend('psp');
      await fixtureWait(() => child.document.documentElement.getAttribute('data-drilldown-state') === 'open');
    })()`);

    // Real focus on the root's own current breadcrumb rung (not document.body):
    // the root document itself never sits inside an iframe, so this focus()
    // call and the subsequent real CDP keypress are both native, same-frame
    // input — no cross-frame routing involved, unlike the grandchild test.
    const focusedRung = await h.run(`(() => {
      const rung = document.querySelector('.archify-drilldown-crumb [aria-current="page"]');
      if (rung && rung.tabIndex < 0) rung.tabIndex = -1;
      if (rung) rung.focus();
      return document.activeElement === rung ? rung.textContent : null;
    })()`);
    assert.match(focusedRung || '', /Card Network/, 'the current rung is real, focusable and now focused');

    await h.browser.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, h.session, 15000);
    await h.browser.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, h.session, 15000);
    await h.run(`(async () => { ${WAIT} await fixtureWait(() => !${CHILD}.Archify.drilldown.active()); })()`);

    const state = await h.run(`({
      childActive: ${CHILD}.Archify.drilldown.active(),
      rootActive: Archify.drilldown.active(),
    })`);
    assert.equal(state.childActive, false, 'root Escape closes the innermost (grandchild) level');
    assert.equal(state.rootActive, true, 'root Escape leaves its own direct child (payments) open');
  } finally {
    await h.close();
  }
});

test('a corrupted grandchild identity shows a stale card at the intermediate level and in the root chain', options, async () => {
  const h = await openHarness();
  try {
    const settlementPath = path.join(h.dir, 'settlement.html');
    const original = fs.readFileSync(settlementPath, 'utf8');
    fs.writeFileSync(settlementPath, original.replace(/data-bundle-spec-sha256="[a-f0-9]{64}"/, `data-bundle-spec-sha256="${'a'.repeat(64)}"`));

    const outcome = await h.run(`(async () => {
      ${WAIT}
      Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const child = ${CHILD};
      child.Archify.drilldown.descend('psp');
      await fixtureWait(() => child.document.documentElement.getAttribute('data-drilldown-state') === 'stale');
      const staleEl = child.document.getElementById('archify-drilldown-stale');
      return { state: child.document.documentElement.getAttribute('data-drilldown-state'), staleHidden: staleEl.hidden, staleText: staleEl.textContent };
    })()`);
    assert.equal(outcome.state, 'stale');
    assert.equal(outcome.staleHidden, false);
    assert.match(outcome.staleText, /settlement/);

    const rootCrumb = await h.run(`[...document.querySelectorAll('.archify-drilldown-crumb *')].map(n => n.textContent).join('|')`);
    assert.match(rootCrumb, /Payment Rail/, 'root chain still shows the intermediate (payments) rung');
  } finally {
    await h.close();
  }
});

test('a stale-session ack from an earlier descend is ignored', options, async () => {
  const h = await openHarness();
  try {
    const outcome = await h.run(`(async () => {
      ${WAIT}
      Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const staleSession = 1; // session id assigned to this very first descend
      Archify.drilldown.back();
      await fixtureWait(() => !Archify.drilldown.active());
      Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const stateBefore = document.documentElement.getAttribute('data-drilldown-state');
      // The forged ack must come from the real child window (event.source
      // check) but carry the earlier, now-stale session id.
      const child = document.getElementById('archify-drilldown-frame').contentWindow;
      const forged = new MessageEvent('message', {
        data: { type: 'archify:bundle-ack', id: 'not-payments', specSha256: 'f'.repeat(64), session: staleSession },
        source: child,
      });
      window.dispatchEvent(forged);
      await new Promise(r => setTimeout(r, 200));
      return { stateBefore, stateAfter: document.documentElement.getAttribute('data-drilldown-state') };
    })()`);
    assert.equal(outcome.stateBefore, 'open');
    assert.equal(outcome.stateAfter, 'open', 'a stale-session ack must not disturb the current descent');
  } finally {
    await h.close();
  }
});

// --- Astra tur-2 (2026-09-13): P1-a/P1-b/P2-a/P2-c repros -----------------

test('a session-less ack and a duplicate already-open ack are both rejected without disturbing the descent', options, async () => {
  const h = await openHarness();
  try {
    const outcome = await h.run(`(async () => {
      ${WAIT}
      Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const child = document.getElementById('archify-drilldown-frame').contentWindow;
      const crumbBefore = document.querySelector('.archify-drilldown-crumb').textContent;
      // No "session" field at all: must be rejected outright, unlike the
      // former "typeof session === 'number' ? compare : accept" leniency.
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'archify:bundle-ack', id: 'payments', specSha256: child.document.querySelector('.diagram-container svg').getAttribute('data-bundle-spec-sha256') },
        source: child,
      }));
      await new Promise(r => setTimeout(r, 150));
      const afterSessionless = document.documentElement.getAttribute('data-drilldown-state');
      // Correct session, but already "open": must be rejected too (no
      // re-running finishHandshake, no chainBelow reset).
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'archify:bundle-ack', id: 'payments', specSha256: child.document.querySelector('.diagram-container svg').getAttribute('data-bundle-spec-sha256'), session: 1 },
        source: child,
      }));
      await new Promise(r => setTimeout(r, 150));
      return {
        afterSessionless,
        afterDuplicate: document.documentElement.getAttribute('data-drilldown-state'),
        activeAfter: Archify.drilldown.active(),
        crumbBefore,
        crumbAfter: document.querySelector('.archify-drilldown-crumb').textContent,
      };
    })()`);
    assert.equal(outcome.afterSessionless, 'open', 'session-less ack rejected, state unchanged');
    assert.equal(outcome.afterDuplicate, 'open', 'duplicate already-open ack rejected, state unchanged');
    assert.equal(outcome.activeAfter, true);
    assert.equal(outcome.crumbAfter, outcome.crumbBefore, 'crumb/chain untouched by either rejected ack');
  } finally {
    await h.close();
  }
});

// Astra tur-3 item 4: the session gate must also hold while the handshake is
// still pending ("descending"), not only once already "open" (covered
// above) — a session-less or wrong-session ack must not open the descent
// early, and the real child's own correct ack must still open it normally
// afterwards.
test('during a pending handshake, a session-less ack and a wrong-session ack are rejected before the real ack opens it', options, async () => {
  const h = await openHarness();
  try {
    const outcome = await h.run(`(async () => {
      ${WAIT}
      Archify.drilldown.descend('payments');
      // Synchronous: the real child's own ack requires an iframe navigation
      // and a postMessage round trip, so it cannot possibly have arrived
      // yet — dispatchEvent itself also delivers synchronously, unlike a
      // real postMessage delivery.
      const stateRightAfterDescend = document.documentElement.getAttribute('data-drilldown-state');
      const child = document.getElementById('archify-drilldown-frame').contentWindow;
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'archify:bundle-ack', id: 'payments', specSha256: 'a'.repeat(64) },
        source: child,
      }));
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'archify:bundle-ack', id: 'payments', specSha256: 'a'.repeat(64), session: 999 },
        source: child,
      }));
      const stateAfterForged = document.documentElement.getAttribute('data-drilldown-state');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      return {
        stateRightAfterDescend,
        stateAfterForged,
        stateAfterRealAck: document.documentElement.getAttribute('data-drilldown-state'),
      };
    })()`);
    assert.equal(outcome.stateRightAfterDescend, 'descending');
    assert.equal(outcome.stateAfterForged, 'descending', 'a session-less ack and a wrong-session ack must not open the descent early');
    assert.equal(outcome.stateAfterRealAck, 'open', 'the real child still completes the handshake normally afterwards');
  } finally {
    await h.close();
  }
});

test('back() immediately followed by a redescend is not corrupted by an earlier pending ascend settle (P1-b repro)', options, async () => {
  const h = await openHarness();
  try {
    const outcome = await h.run(`(async () => {
      ${WAIT}
      // Open payments (session 1) and start an ascend-request round trip to
      // it (200ms settle timer running at the root for payments' reply),
      // then close payments directly and reopen it before that 200ms
      // elapses. Without the fix, the stale timer fires ~200ms after it was
      // armed — by then session 2 is open — and incorrectly calls back()
      // on it.
      Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      Archify.drilldown.ascendTo(0); // arms the root's own 200ms settle timer for payments
      Archify.drilldown.back(); // supersedes it: must cancel the timer, not just the callback pointer
      await fixtureWait(() => !Archify.drilldown.active());
      Archify.drilldown.descend('payments'); // session 2
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const stateAt170ms = document.documentElement.getAttribute('data-drilldown-state');
      await new Promise(r => setTimeout(r, 260)); // outlast the original 200ms timer
      return {
        stateAt170ms,
        stateAfter260ms: document.documentElement.getAttribute('data-drilldown-state'),
        activeAfter260ms: Archify.drilldown.active(),
      };
    })()`);
    assert.equal(outcome.stateAt170ms, 'open');
    assert.equal(outcome.stateAfter260ms, 'open', 'the reopened (session 2) descent must still be open');
    assert.equal(outcome.activeAfter260ms, true, 'a stale settle from session 1 must not have closed session 2');
  } finally {
    await h.close();
  }
});

// Astra tur-3 item 3: the previous version of this test sampled whether the
// grandchild's <iframe src> was gone, but once the CHILD's own src is
// removed, child.contentWindow.document becomes a fresh document and the
// grandchild element lookup through it silently reads as "gone" too — so a
// reversed close order (root closing payments before payments closes
// settlement) would have looked identical to the correct order. This
// version instead watches each level's own data-drilldown-state with a
// MutationObserver, installed on stable element references captured before
// anything starts closing, and compares the timestamp each level's own
// "ascending" phase begins — a signal recorded in-frame, before either
// document is torn down.
test('a root rung click ascends two levels at once, closing the innermost level first', options, async () => {
  const h = await openHarness();
  try {
    await h.run(`(async () => {
      ${WAIT}
      Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const child = ${CHILD};
      child.Archify.drilldown.descend('psp');
      await fixtureWait(() => child.document.documentElement.getAttribute('data-drilldown-state') === 'open');
    })()`);

    const trace = await h.run(`(async () => {
      ${WAIT}
      const start = performance.now();
      const events = [];
      const rootHtml = document.documentElement;
      const paymentsHtml = ${CHILD}.document.documentElement;
      function watch(el, label) {
        const obs = new MutationObserver(() => {
          events.push({ t: Math.round(performance.now() - start), label, state: el.getAttribute('data-drilldown-state') });
        });
        obs.observe(el, { attributes: true, attributeFilter: ['data-drilldown-state'] });
        return obs;
      }
      const obsRoot = watch(rootHtml, 'root');
      const obsPayments = watch(paymentsHtml, 'payments');
      // Click the root's own "Kok" (first) rung: ascendTo(0), closing both
      // levels — payments must start (and finish) ascending no later than
      // root, since root must wait for payments before closing it.
      document.querySelectorAll('.archify-drilldown-crumb button')[0].click();
      await fixtureWait(() => !Archify.drilldown.active(), 3000);
      obsRoot.disconnect();
      try { obsPayments.disconnect(); } catch (_) {}
      const paymentsAscending = events.find(e => e.label === 'payments' && e.state === 'ascending');
      const rootAscending = events.find(e => e.label === 'root' && e.state === 'ascending');
      return {
        events,
        paymentsAscendingAt: paymentsAscending && paymentsAscending.t,
        rootAscendingAt: rootAscending && rootAscending.t,
        finalActive: Archify.drilldown.active(),
      };
    })()`);
    assert.equal(trace.finalActive, false, 'both levels end up closed');
    assert.ok(trace.paymentsAscendingAt !== undefined, JSON.stringify(trace.events));
    assert.ok(trace.rootAscendingAt !== undefined, JSON.stringify(trace.events));
    assert.ok(trace.paymentsAscendingAt <= trace.rootAscendingAt,
      `payments must start ascending no later than root: ${JSON.stringify(trace.events)}`);
  } finally {
    await h.close();
  }
});

// Astra tur-3 item 1/3, updated in tur-4 for the depth-derived fallback: a
// settlement reply delayed via a same-target postMessage override (rather
// than arriving from settlement's own untouched call) is not attributable
// to settlement's own window once replayed asynchronously through a closure
// that was not itself defined inside settlement's realm — the viewer
// correctly treats it as not from the expected frame and ignores it, so
// payments settles via its own fallback timeout instead of the (attempted)
// message. That still exercises the property under test: the outer level's
// own, larger, depth-scaled fallback must not close it before the inner
// level closes on its own timeout, and must not race it into the wrong
// order. Deep fixture max_depth=3: payments (myDepth=1) fallback is
// 250*max(1,3-1)=500ms; root (myDepth=0) fallback is 250*max(1,3-0)=750ms,
// but root actually closes promptly after payments via payments' own
// ascend-done, well before root's own 750ms would otherwise elapse.
test('a slow grandchild ascend reply does not make the root close the child before the child closes the grandchild', options, async () => {
  const h = await openHarness();
  try {
    await h.run(`(async () => {
      ${WAIT}
      Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const child = ${CHILD};
      child.Archify.drilldown.descend('psp');
      await fixtureWait(() => child.document.documentElement.getAttribute('data-drilldown-state') === 'open');
    })()`);

    const trace = await h.run(`(async () => {
      ${WAIT}
      const start = performance.now();
      const events = [];
      const rootHtml = document.documentElement;
      const child = ${CHILD};
      const paymentsHtml = child.document.documentElement;
      function watch(el, label) {
        const obs = new MutationObserver(() => {
          events.push({ t: Math.round(performance.now() - start), label, state: el.getAttribute('data-drilldown-state') });
        });
        obs.observe(el, { attributes: true, attributeFilter: ['data-drilldown-state'] });
        return obs;
      }
      const obsRoot = watch(rootHtml, 'root');
      const obsPayments = watch(paymentsHtml, 'payments');
      // Attempt to delay only settlement's own archify:drilldown-ascend-done
      // reply (addressed to payments) by 300ms; replayed this way it no
      // longer carries settlement's own window as its source (see the test
      // block comment above), so the viewer correctly ignores it and
      // payments falls through to its own fallback timeout instead.
      const originalPostMessage = child.postMessage.bind(child);
      child.postMessage = function (message, origin) {
        if (message && message.type === 'archify:drilldown-ascend-done') {
          setTimeout(() => originalPostMessage(message, origin), 300);
        } else {
          originalPostMessage(message, origin);
        }
      };
      document.querySelectorAll('.archify-drilldown-crumb button')[0].click();
      await fixtureWait(() => !Archify.drilldown.active(), 3000);
      obsRoot.disconnect();
      try { obsPayments.disconnect(); } catch (_) {}
      const paymentsAscending = events.find(e => e.label === 'payments' && e.state === 'ascending');
      const rootAscending = events.find(e => e.label === 'root' && e.state === 'ascending');
      return {
        events,
        paymentsAscendingAt: paymentsAscending && paymentsAscending.t,
        rootAscendingAt: rootAscending && rootAscending.t,
        finalActive: Archify.drilldown.active(),
      };
    })()`);
    assert.equal(trace.finalActive, false, 'both levels still end up closed despite the delayed reply');
    assert.ok(trace.paymentsAscendingAt !== undefined, JSON.stringify(trace.events));
    assert.ok(trace.rootAscendingAt !== undefined, JSON.stringify(trace.events));
    assert.ok(trace.paymentsAscendingAt <= trace.rootAscendingAt,
      `payments must still start ascending no later than root despite the delayed grandchild reply: ${JSON.stringify(trace.events)}`);
    // Payments settles via its own ~500ms fallback; root then learns of it
    // via payments' own prompt ascend-done message, not by waiting out its
    // own larger (~750ms) fallback — root closing well under that confirms
    // the fast message path won the race, not a coincidence of two
    // unrelated timers landing close together.
    assert.ok(trace.paymentsAscendingAt >= 400, `payments should wait out close to its own ~500ms fallback: ${JSON.stringify(trace.events)}`);
    assert.ok(trace.rootAscendingAt < 650, `root should close via payments' prompt ascend-done, well under its own ~750ms fallback: ${JSON.stringify(trace.events)}`);
  } finally {
    await h.close();
  }
});

// Astra tur-4 (final) item: the fallback must not depend on chainBelow, which
// can still be empty while a deeper handshake is genuinely in flight (the
// grandchild has not yet acked, so it never reported anything upward). Both
// settlement's own handshake ack AND its ascend-done reply to payments are
// swallowed here (payments' path to root is untouched), so payments has
// nothing to go on but its own fallback timer, with chainBelow empty at
// both levels the whole time — the previous chainBelow-derived formula gave
// both levels the same (minimum) timeout in exactly this situation. The
// observed payments timestamp doubles as a black-box check of the
// depth-derived formula itself (deep fixture max_depth=3): payments
// (myDepth=1) settles at its own ~250*max(1,3-1)=500ms fallback; root then
// follows promptly via payments' own prompt ascend-done, well under root's
// own larger (~750ms) fallback.
test('ascend order stays innermost-first when the grandchild handshake is still pending and chainBelow is empty at every level', options, async () => {
  const h = await openHarness();
  try {
    const trace = await h.run(`(async () => {
      ${WAIT}
      Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const start = performance.now();
      const events = [];
      const rootHtml = document.documentElement;
      const child = ${CHILD};
      const paymentsHtml = child.document.documentElement;
      function watch(el, label) {
        const obs = new MutationObserver(() => {
          events.push({ t: Math.round(performance.now() - start), label, state: el.getAttribute('data-drilldown-state') });
        });
        obs.observe(el, { attributes: true, attributeFilter: ['data-drilldown-state'] });
        return obs;
      }
      const obsRoot = watch(rootHtml, 'root');
      const obsPayments = watch(paymentsHtml, 'payments');
      // Swallow only settlement's own outgoing messages to payments (its
      // ack and its ascend-done reply); root's own hello/ascend-request to
      // payments are a different message type and pass through untouched.
      const originalPostMessage = child.postMessage.bind(child);
      child.postMessage = function (message, origin) {
        if (message && (message.type === 'archify:bundle-ack' || message.type === 'archify:drilldown-ascend-done')) return;
        originalPostMessage(message, origin);
      };
      child.Archify.drilldown.descend('psp');
      await fixtureWait(() => child.document.documentElement.getAttribute('data-drilldown-state') === 'descending');
      const stillDescending = child.document.documentElement.getAttribute('data-drilldown-state');
      Archify.drilldown.ascendTo(0);
      await fixtureWait(() => !Archify.drilldown.active(), 5000);
      obsRoot.disconnect();
      try { obsPayments.disconnect(); } catch (_) {}
      const paymentsAscending = events.find(e => e.label === 'payments' && e.state === 'ascending');
      const rootAscending = events.find(e => e.label === 'root' && e.state === 'ascending');
      return {
        stillDescending,
        events,
        paymentsAscendingAt: paymentsAscending && paymentsAscending.t,
        rootAscendingAt: rootAscending && rootAscending.t,
        finalActive: Archify.drilldown.active(),
      };
    })()`);
    assert.equal(trace.stillDescending, 'descending', 'the grandchild handshake is genuinely still pending (chainBelow empty) when the batch ascend starts');
    assert.equal(trace.finalActive, false, 'both levels still end up closed despite the total message loss below payments');
    assert.ok(trace.paymentsAscendingAt !== undefined && trace.rootAscendingAt !== undefined, JSON.stringify(trace.events));
    assert.ok(trace.paymentsAscendingAt < trace.rootAscendingAt,
      `payments must close strictly before root even though chainBelow was empty at both levels the whole time: ${JSON.stringify(trace.events)}`);
    // Payments has no message from settlement at all (fully swallowed), so
    // it settles via its own fallback: myDepth=1, maxDepth=3 -> ~500ms.
    assert.ok(Math.abs(trace.paymentsAscendingAt - 500) < 200, `payments' own fallback (myDepth=1, maxDepth=3) should land near 500ms: ${JSON.stringify(trace.events)}`);
    // Root's own path to payments is untouched, so root learns of payments'
    // closure promptly via its own ascend-done message — well under root's
    // own ~750ms fallback (myDepth=0, maxDepth=3), which this proves root
    // did not need to fall back on.
    assert.ok(trace.rootAscendingAt - trace.paymentsAscendingAt < 100,
      `root should follow payments promptly via its own ascend-done message: ${JSON.stringify(trace.events)}`);
    assert.ok(trace.rootAscendingAt < 650, `root should close well under its own ~750ms fallback: ${JSON.stringify(trace.events)}`);
  } finally {
    await h.close();
  }
});

// Astra tur-3 item 2: drillFor() must match the full (parent, component,
// child) triple, not just (parent, component) — a manifest row whose
// declared child names a different (but real) diagram than the node's own
// baked data-drilldown-child must not resolve, and the wrong file must
// never load.
test('a drilldown row whose declared child does not match the node\'s own annotation is rejected as a missing row, never loading the wrong file', options, async () => {
  const h = await openHarness({
    beforeOpen(dir) {
      const entryPath = path.join(dir, 'checkout-platform.html');
      const html = fs.readFileSync(entryPath, 'utf8');
      const match = html.match(/(<script id="archify-bundle-manifest" type="application\/json">)([\s\S]*?)(<\/script>)/);
      assert.ok(match, 'entry must embed a manifest script');
      const manifest = JSON.parse(match[2]);
      const row = manifest.drilldowns.find((r) => r.parent === 'checkout-platform' && r.component === 'payments');
      assert.ok(row, 'fixture must have a checkout-platform/payments drilldown row');
      assert.notEqual(row.child, 'ledger-flow');
      row.child = 'ledger-flow'; // a real diagram in the bundle, just the wrong one
      const tampered = html.replace(match[0], match[1] + JSON.stringify(manifest) + match[3]);
      fs.writeFileSync(entryPath, tampered);
    },
  });
  try {
    const outcome = await h.run(`(async () => {
      ${WAIT}
      const ok = Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'stale');
      const frame = document.getElementById('archify-drilldown-frame');
      return {
        ok,
        state: document.documentElement.getAttribute('data-drilldown-state'),
        frameSrc: frame.getAttribute('src'),
        staleText: document.getElementById('archify-drilldown-stale').textContent,
      };
    })()`);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.state, 'stale', 'a child-mismatched row must not open normally');
    assert.equal(outcome.frameSrc, null, 'ledger-flow.html (the wrong file) must never be loaded');
    assert.match(outcome.staleText, /payments/, 'the stale card still names the expected (payments) child');
  } finally {
    await h.close();
  }
});

test('switching from one sibling child to another shows the correct breadcrumb', options, async () => {
  const h = await openHarness();
  try {
    const outcome = await h.run(`(async () => {
      ${WAIT}
      // checkout-platform has two independent drilldown components at the
      // root: "payments" -> payments.html and "queue" -> ledger-flow.html.
      Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const crumbA = document.querySelector('.archify-drilldown-crumb').textContent;
      Archify.drilldown.back();
      await fixtureWait(() => !Archify.drilldown.active());
      Archify.drilldown.descend('queue');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const crumbB = document.querySelector('.archify-drilldown-crumb').textContent;
      return { crumbA, crumbB };
    })()`);
    assert.match(outcome.crumbA, /Payment Rail/);
    assert.doesNotMatch(outcome.crumbA, /Ledger/);
    assert.match(outcome.crumbB, /Ledger/);
    assert.doesNotMatch(outcome.crumbB, /Payment Rail/);
  } finally {
    await h.close();
  }
});

test('closing a stale grandchild attempt returns the intermediate level to normal without disturbing the root crumb for its still-open child', options, async () => {
  const h = await openHarness();
  try {
    const settlementPath = path.join(h.dir, 'settlement.html');
    const original = fs.readFileSync(settlementPath, 'utf8');
    fs.writeFileSync(settlementPath, original.replace(/data-bundle-spec-sha256="[a-f0-9]{64}"/, `data-bundle-spec-sha256="${'a'.repeat(64)}"`));

    await h.run(`(async () => {
      ${WAIT}
      Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const child = ${CHILD};
      child.Archify.drilldown.descend('psp');
      await fixtureWait(() => child.document.documentElement.getAttribute('data-drilldown-state') === 'stale');
    })()`);
    // The stale (failed) attempt itself is still shown as the deepest rung
    // while payments' stale card is up — the root chain reports the whole
    // attempted path, success or not.
    const rootCrumbBefore = await h.run(`document.querySelector('.archify-drilldown-crumb').textContent`);
    assert.match(rootCrumbBefore, /Payment Rail/);
    assert.match(rootCrumbBefore, /Card Network/);

    // Synthetic keydown on payments' own document: this test is about the
    // stale-card recovery logic itself, not about proving real keyboard
    // routing (the grandchild test above already does that with real CDP
    // input), so the cheaper synthetic dispatch is enough here.
    await h.run(`(() => {
      const target = ${CHILD};
      target.document.dispatchEvent(new target.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    })()`);
    await h.run(`(async () => { ${WAIT} await fixtureWait(() => !${CHILD}.Archify.drilldown.active()); })()`);

    const after = await h.run(`({
      childActive: ${CHILD}.Archify.drilldown.active(),
      childState: ${CHILD}.document.documentElement.getAttribute('data-drilldown-state'),
      rootActive: Archify.drilldown.active(),
      rootCrumb: document.querySelector('.archify-drilldown-crumb').textContent,
    })`);
    assert.equal(after.childActive, false, 'payments closed its own (failed) child slot');
    assert.equal(after.childState, null, 'payments returned to its normal, non-descended state');
    assert.equal(after.rootActive, true, "payments itself is still root's open child");
    // Closing the stale attempt drops only the failed (grandchild) rung;
    // the root keeps showing its own, still fully open child (payments).
    assert.match(after.rootCrumb, /Payment Rail/, "root's crumb for its still-open child (payments) survives");
    assert.doesNotMatch(after.rootCrumb, /Card Network/, 'the failed attempt\'s rung is gone once payments closes it');
  } finally {
    await h.close();
  }
});

// Faz 5 "before you ship" gap: every test above serves the fixture over a
// local HTTP server so nested `contentWindow` reads are same-origin. Real
// users who just double-click the generated HTML (or open a ZIP export)
// load it as `file://` instead, where Chrome treats each *file* as its own
// opaque origin unless `--allow-file-access-from-files` is set — this test
// exists purely to prove the three-level descend still works under that
// real, unmodified `file://` protocol (no local server, no CORS help), by
// launching a second Chrome instance with that one extra flag. It changes
// nothing about the viewer or the CLI; it only proves the existing
// same-origin-postMessage design already tolerates `file://`'s stricter
// per-file origin model.
test('a three-level descend also works when the bundle is opened directly as file:// (no HTTP server)', options, async () => {
  if (!chromePath) return;
  const dir = stageBundleFixture({ prefix: 'archify-nested-file-', deep: true });
  const browser = new ChromeVisualBrowser(chromePath, { extraArgs: ['--allow-file-access-from-files'] });
  const session = await browser.sessionPromise;
  async function run(expression) {
    const result = await browser.cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, session, 30000);
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    return result.result?.value;
  }
  try {
    await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, session);
    const url = `file://${path.join(dir, 'checkout-platform.html')}`;
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session, 30000);
    await browser.cdp.send('Page.navigate', { url }, session);
    await loaded;
    await run(`document.fonts.ready.then(()=>Archify.readerLayout.whenStable()).then(()=>Archify.viewerChromeLayout.whenStable())`);

    const outcome = await run(`(async () => {
      ${WAIT}
      const rootOk = Archify.drilldown.descend('payments');
      await fixtureWait(() => document.documentElement.getAttribute('data-drilldown-state') === 'open');
      const child = ${CHILD};
      const childOk = child.Archify.drilldown.descend('psp');
      await fixtureWait(() => child.document.documentElement.getAttribute('data-drilldown-state') === 'open');
      return {
        rootOk, childOk,
        grandProtocol: ${GRANDCHILD}.location.protocol,
        grandNested: ${GRANDCHILD}.document.documentElement.getAttribute('data-bundle-nested'),
        grandDepth: ${GRANDCHILD}.document.documentElement.getAttribute('data-drilldown-depth'),
        grandRole: ${GRANDCHILD}.document.querySelector('.diagram-container svg').getAttribute('data-bundle-role'),
      };
    })()`);
    assert.equal(outcome.rootOk, true);
    assert.equal(outcome.childOk, true);
    assert.equal(outcome.grandProtocol, 'file:', 'the grandchild really loaded over file://, not http(s)');
    assert.equal(outcome.grandNested, 'true');
    assert.equal(outcome.grandDepth, '2');
    assert.equal(outcome.grandRole, 'child');
  } finally {
    await browser.close();
    disposeBundleFixture(dir);
  }
});
