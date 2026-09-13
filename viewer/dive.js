    /* ============================================================
       Zoom-dive — opt-in automatic descend triggered by manual zoom.
       Belirginleştirme (the always-on drilldown-mark/Descend highlight at
       full detail) is pure CSS keyed off the existing
       .diagram-container[data-detail-level="full"] attribute the camera
       already writes; nothing here drives it. Everything below is the
       opt-in toggle, the dwell-gated auto-descend and the double
       zoom-out escape, reading Archify.view/Archify.drilldown only
       through their existing public interface — viewer-camera.js is not
       touched by this fragment.
       ============================================================ */
    Archify.dive = (function () {
      var STORAGE_KEY = 'archify-dive';
      var DWELL_MS = 250;
      var DIVE_SCALE = 2.5;
      var CAMERA_EPSILON_SCALE = 0.004;
      var CAMERA_EPSILON_PX = 0.5;
      var ESCAPE_WINDOW_MS = 600;
      // A gesture 'start' only lifts the redive lock once at least this
      // much time has passed since any gesture activity on THIS document
      // (start/move/end/cancel all count) — a still-continuing physical
      // gesture keeps re-touching that clock (wheel ticks group within
      // 150ms in viewer-camera.js, well under this), so only an actual
      // pause followed by a fresh gesture satisfies it.
      var GESTURE_SILENCE_MS = 400;
      var html = document.documentElement;
      var svg = document.querySelector('.diagram-container svg');
      var container = document.querySelector('.diagram-container');
      var btn = document.getElementById('btn-drilldown-dive');
      var status = document.getElementById('archify-dive-status');
      var reducedQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
      var nestedChild = html.getAttribute('data-bundle-nested') === 'true';
      var embed = html.getAttribute('data-embed') === 'true';
      // Two independent capabilities: "capable" is this document's own
      // dive-in target (toggle button + dwell); "escapeCapable" is being
      // able to zoom-out-escape to a parent, which a leaf with no further
      // drilldown of its own still needs — a leaf must not lose the
      // minZoomOut subscription merely because it has nothing to dive into.
      var capable = !embed && !!(svg && svg.querySelector('[data-drilldown-child]'));
      var escapeCapable = !embed && nestedChild;

      function text(key, values) {
        return typeof viewerText === 'function' ? viewerText(key, values) : key;
      }

      if (!capable && !escapeCapable) {
        if (btn) btn.hidden = true;
        return {
          capable: false,
          enabled: function () { return false; },
          toggle: function () { return false; },
          receivePreference: function () {}
        };
      }

      function readStored() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
      }
      function writeStored(next) {
        try {
          if (next) localStorage.setItem(STORAGE_KEY, 'on');
          else localStorage.removeItem(STORAGE_KEY);
        } catch (_) {}
      }

      var enabled = readStored() === 'on';
      var dwell = null;
      var diveLock = false;
      var rearmed = true;
      var lastGestureActivityTime = 0;
      var minZoomOutLog = [];
      var wasOpen = html.hasAttribute('data-drilldown-open');
      var wasStateOpen = html.getAttribute('data-drilldown-state') === 'open';

      function render() {
        if (btn) {
          btn.hidden = !capable;
          btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        }
        if (enabled) html.setAttribute('data-dive', 'on');
        else html.removeAttribute('data-dive');
      }
      // Same-origin (http) children already see this toggle through shared
      // localStorage; a file:// child cannot, so the parent also hands it
      // down through the same validated handshake channel Archify.drilldown
      // owns (its own hello/ack/session protocol), once ACK-open and again
      // on every toggle change, so a file:// child stays in sync too.
      function sendPrefToChild() {
        var frame = document.getElementById('archify-drilldown-frame');
        var session = Archify.drilldown && typeof Archify.drilldown.activeChildSession === 'function'
          ? Archify.drilldown.activeChildSession() : null;
        if (!frame || !frame.contentWindow || typeof session !== 'number') return;
        try {
          frame.contentWindow.postMessage({ type: 'archify:dive-pref', enabled: enabled, session: session }, '*');
        } catch (_) {}
      }
      function setEnabled(next, options) {
        options = options || {};
        enabled = !!next;
        if (options.persist !== false) writeStored(enabled);
        if (!enabled) { cancelDwell(); minZoomOutLog = []; }
        render();
        if (options.announceToChild !== false) sendPrefToChild();
        return enabled;
      }

      function mobileContained() {
        return window.innerWidth <= 720 && container.hasAttribute('data-wide-diagram');
      }
      function reducedMotion() {
        return !!(reducedQuery && reducedQuery.matches);
      }
      // Route Probe picking/result, Semantic Lens open and a playing guided
      // story are deliberate, exclusive exploration modes — genuinely
      // incompatible with an automatic descend. Presentation itself is not:
      // it only hides chrome, and a reader zooming by hand on stage is
      // exactly the audience a dive is for. Intent Trace's own "active" node is
      // just its ordinary 90ms fine-pointer hover preview, which is true
      // almost the entire time a real mouse is hovering the very node
      // being wheel-zoomed (the normal way a reader would trigger a dive):
      // treating that as blocking would make the feature nearly
      // unreachable from a real mouse, so it is deliberately excluded here.
      function blockingActive() {
        if (Archify.routeProbe && Archify.routeProbe.active && Archify.routeProbe.active()) return true;
        if (Archify.semanticLens && Archify.semanticLens.active && Archify.semanticLens.active()) return true;
        if (Archify.guidedViews && Archify.guidedViews.isPlaying && Archify.guidedViews.isPlaying()) return true;
        return false;
      }
      function drilldownOpenOrBusy() {
        return !!(Archify.drilldown && Archify.drilldown.active && Archify.drilldown.active());
      }
      function clearDwellVisual() {
        if (dwell && dwell.node) dwell.node.removeAttribute('data-dive-preview');
        if (status) status.textContent = '';
      }
      function cancelDwell() {
        if (!dwell) return;
        window.clearTimeout(dwell.timer);
        clearDwellVisual();
        dwell = null;
      }
      // Positions the persistent live region right above the node, in the
      // container's own coordinate space, instead of a fixed page corner.
      function positionStatus(node) {
        if (!status || !node || typeof node.getBoundingClientRect !== 'function') return;
        var nodeRect = node.getBoundingClientRect();
        var containerRect = container.getBoundingClientRect();
        var left = nodeRect.left - containerRect.left + nodeRect.width / 2;
        var top = nodeRect.top - containerRect.top;
        status.style.left = Math.max(4, left) + 'px';
        status.style.top = Math.max(4, top - 22) + 'px';
      }
      function showDwell(node) {
        node.setAttribute('data-dive-preview', 'true');
        if (status) {
          positionStatus(node);
          status.textContent = text('viewer.dive.opening', {
            label: node.getAttribute('data-node-label') || node.getAttribute('data-node-id') || ''
          });
        }
      }
      function hitTestNode() {
        var viewport = Archify.view && typeof Archify.view.logicalViewport === 'function'
          ? Archify.view.logicalViewport() : null;
        if (!viewport) return null;
        var cx = viewport.x + viewport.width / 2;
        var cy = viewport.y + viewport.height / 2;
        var nodes = svg.querySelectorAll('[data-drilldown-child]');
        for (var i = 0; i < nodes.length; i += 1) {
          var node = nodes[i];
          var box;
          try { box = node.getBBox(); } catch (_) { continue; }
          if (!box || box.width <= 0 || box.height <= 0) continue;
          if (cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height) return node;
        }
        return null;
      }
      function eligible(snapshot) {
        return enabled
          && snapshot.mode === 'manual'
          && snapshot.scale >= DIVE_SCALE
          && !reducedMotion()
          && !mobileContained()
          && !blockingActive()
          && !diveLock
          && rearmed
          && !drilldownOpenOrBusy();
      }
      function cameraMoved(snapshot) {
        if (!dwell) return false;
        return Math.abs(snapshot.scale - dwell.scale) > CAMERA_EPSILON_SCALE
          || Math.abs(snapshot.x - dwell.x) > CAMERA_EPSILON_PX
          || Math.abs(snapshot.y - dwell.y) > CAMERA_EPSILON_PX;
      }
      function startDwell(node, snapshot) {
        dwell = { node: node, scale: snapshot.scale, x: snapshot.x, y: snapshot.y, timer: 0 };
        showDwell(node);
        dwell.timer = window.setTimeout(function () {
          var target = dwell && dwell.node;
          clearDwellVisual();
          dwell = null;
          if (!target) return;
          // Re-verify at fire time, not just at dwell start: eligibility
          // (mode/scale/reduced-motion/blocking/lock) and the hit target
          // itself can both have changed without an intervening onChange
          // (e.g. a blocking mode opened, or reduced-motion flipped via
          // its own change event) between the last evaluation and now.
          var freshState = Archify.view && typeof Archify.view.state === 'function' ? Archify.view.state() : null;
          if (!freshState || !eligible(freshState)) return;
          if (hitTestNode() !== target) return;
          if (!Archify.drilldown || typeof Archify.drilldown.descend !== 'function') return;
          Archify.drilldown.descend(target.getAttribute('data-node-id'));
        }, DWELL_MS);
      }
      // Dwell is only started or re-evaluated as a *candidate change* on a
      // settled (transitioning:false) snapshot; but a loss of eligibility —
      // camera moved beyond epsilon, or any other eligible() condition
      // flipping false — cancels an already-running dwell immediately, on
      // either notification, rather than waiting for settle.
      function onCameraChange(snapshot) {
        if (!rearmed && snapshot.scale < DIVE_SCALE) rearmed = true;
        if (dwell && (cameraMoved(snapshot) || !eligible(snapshot))) cancelDwell();
        if (snapshot.transitioning) return;
        if (!eligible(snapshot)) { cancelDwell(); return; }
        var target = hitTestNode();
        if (!target) { cancelDwell(); return; }
        if (dwell && dwell.node === target) return;
        cancelDwell();
        startDwell(target, snapshot);
      }
      // A blocking mode opening or reduced-motion flipping on doesn't
      // necessarily fire a camera onChange; re-check independently.
      function cancelDwellIfIneligible() {
        if (!dwell) return;
        var state = Archify.view && typeof Archify.view.state === 'function' ? Archify.view.state() : null;
        if (!state || !eligible(state)) cancelDwell();
      }
      // Two minZoomOut events count only when they carry two different
      // (source, gestureId) pairs within the window — a continuing
      // physical gesture (same pair repeated) is one attempt, not two.
      function onMinZoomOut(payload) {
        if (!escapeCapable || !enabled) return;
        if (!Archify.drilldown || typeof Archify.drilldown.escapeToParent !== 'function') return;
        var key = payload.source + ':' + payload.gestureId;
        var now = Date.now();
        minZoomOutLog = minZoomOutLog.filter(function (entry) { return now - entry.time <= ESCAPE_WINDOW_MS; });
        var last = minZoomOutLog.length ? minZoomOutLog[minZoomOutLog.length - 1] : null;
        if (!last || last.key !== key) minZoomOutLog.push({ key: key, time: now });
        if (minZoomOutLog.length >= 2) {
          minZoomOutLog = [];
          Archify.drilldown.escapeToParent();
        }
      }
      // The redive lock lifts only on (i) a fresh pointerdown/keydown, or
      // (ii) a gesture 'start' preceded by >= GESTURE_SILENCE_MS of no
      // gesture activity at all on this document — deliberately time-based
      // and document-local rather than comparing gesture ids, since the
      // escaping gesture physically happened in a different document (the
      // child) with its own independent id space; comparing ids across
      // that boundary cannot tell a continuing wheel flow from a fresh one,
      // but silence can. watchOwnAscend() seeds the clock to "now" the
      // instant the lock is set, so a wheel tick landing on the
      // newly-revealed parent a few milliseconds later (the same physical
      // gesture) still fails the silence check.
      function onGesture(payload) {
        if (payload.phase === 'start') {
          // No prior activity this document has ever seen (lastGestureActivityTime
          // still 0) always counts as past the threshold — GESTURE_SILENCE_MS + 1
          // is a small finite stand-in for that, deliberately not an
          // unbounded numeric literal: this source ships verbatim inside
          // every generated viewer artifact (every delivered diagram HTML),
          // and archify's own artifact validators reject any such literal
          // appearing in delivered output as a likely non-finite computed
          // value, whether or not it is actually one.
          var silence = lastGestureActivityTime ? (Date.now() - lastGestureActivityTime) : (GESTURE_SILENCE_MS + 1);
          if (diveLock && silence >= GESTURE_SILENCE_MS) diveLock = false;
        }
        lastGestureActivityTime = Date.now();
      }
      function clearLockOnInput() { diveLock = false; }
      function watchOwnAscend() {
        if (typeof MutationObserver === 'undefined') return;
        var observer = new MutationObserver(function () {
          var isOpen = html.hasAttribute('data-drilldown-open');
          if (wasOpen && !isOpen) {
            diveLock = true;
            rearmed = false;
            lastGestureActivityTime = Date.now();
          }
          wasOpen = isOpen;
          var isStateOpen = html.getAttribute('data-drilldown-state') === 'open';
          if (isStateOpen && !wasStateOpen) sendPrefToChild();
          wasStateOpen = isStateOpen;
        });
        observer.observe(html, { attributes: true, attributeFilter: ['data-drilldown-open', 'data-drilldown-state'] });
      }
      function watchBlockingModes() {
        if (typeof MutationObserver === 'undefined') return;
        var observer = new MutationObserver(cancelDwellIfIneligible);
        observer.observe(html, {
          subtree: true,
          attributes: true,
          attributeFilter: ['data-present', 'data-route-picking', 'data-route-active', 'data-lens-active']
        });
      }

      render();
      if (Archify.view) {
        if (capable && typeof Archify.view.onChange === 'function') Archify.view.onChange(onCameraChange);
        if (typeof Archify.view.on === 'function') {
          if (escapeCapable) Archify.view.on('minZoomOut', onMinZoomOut);
          Archify.view.on('gesture', onGesture);
        }
      }
      watchOwnAscend();
      watchBlockingModes();
      if (reducedQuery) {
        if (typeof reducedQuery.addEventListener === 'function') reducedQuery.addEventListener('change', cancelDwellIfIneligible);
        else if (typeof reducedQuery.addListener === 'function') reducedQuery.addListener(cancelDwellIfIneligible);
      }
      document.addEventListener('pointerdown', clearLockOnInput, true);
      document.addEventListener('keydown', clearLockOnInput, true);
      container.addEventListener('pointerleave', function () { cancelDwell(); });
      container.addEventListener('pointercancel', function () { cancelDwell(); });
      window.addEventListener('blur', function () { cancelDwell(); });
      if (btn) btn.addEventListener('click', function () { setEnabled(!enabled); });

      return {
        capable: capable,
        enabled: function () { return enabled; },
        toggle: function () { return setEnabled(!enabled); },
        receivePreference: function (nextEnabled) { setEnabled(!!nextEnabled, { persist: true }); }
      };
    })();
