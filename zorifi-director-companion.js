/* Vanessa's companion surface shares the application's voice and chat engines. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZorifiDirectorCompanion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const instances = new WeakMap();
  const clamp = (value, min, max) => Math.max(min, Math.min(Math.max(min, max), value));
  const statuses = new Set(['idle', 'listening', 'thinking', 'speaking', 'error']);

  function create({document: doc = globalThis.document, onOpen, onDismiss, onInteract} = {}) {
    if (!doc?.body) throw new Error('Vanessa’s companion needs a document with a body.');
    instances.get(doc)?.dispose();
    const win = doc.defaultView;
    const lifecycle = new win.AbortController();
    let disposed = false, currentUser = '', savedPosition = null, drag = null, suppressClick = false;
    let snapshot = {visible: false, chatOpen: false, caption: '', hint: false, mode: 'companion', status: 'idle', captionKind: 'message', wordRange: null};
    let renderedText = '', wordNodes = [], positionFrame = null;

    const surface = doc.createElement('section');
    surface.className = 'director-companion';
    surface.dataset.directorCompanion = '';
    surface.setAttribute('aria-label', 'Vanessa companion');
    surface.hidden = true;
    surface.innerHTML = '<div class="director-companion-safe-area" aria-hidden="true"></div>' +
      '<button type="button" class="director-companion-orb" data-director-open aria-label="Open Vanessa" title="Open Vanessa · drag to move · Alt + arrow keys to move">' +
      '<span class="director-companion-orbit" aria-hidden="true"></span><img src="assets/vanessa-orb.webp?v=231" alt="" draggable="false">' +
      '<span class="director-companion-status" aria-hidden="true"></span></button>' +
      '<div class="director-companion-notes"><div class="director-companion-caption" data-director-caption hidden>' +
      '<header><span class="director-caption-identity"><b>Vanessa</b><small data-director-speaking-status>Creative companion</small></span><span class="director-caption-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><button type="button" data-director-caption-close aria-label="Dismiss Vanessa’s caption">×</button></header>' +
      '<p role="status" aria-live="polite" aria-atomic="true" data-director-caption-text></p><small class="director-caption-timing" data-director-caption-timing hidden></small></div>' +
      '<div class="director-companion-hint" data-director-hint hidden><span>Find me in the Vanessa tab</span>' +
      '<span class="director-companion-hint-arrow" aria-hidden="true">↘</span><button type="button" data-director-hint-close aria-label="Dismiss Vanessa introduction">×</button></div></div>';
    doc.body.append(surface);
    const orb = surface.querySelector('[data-director-open]');
    const notes = surface.querySelector('.director-companion-notes');
    const caption = surface.querySelector('[data-director-caption]');
    const captionText = surface.querySelector('[data-director-caption-text]');
    const speakingStatus = surface.querySelector('[data-director-speaking-status]');
    const timing = surface.querySelector('[data-director-caption-timing]');
    const hint = surface.querySelector('[data-director-hint]');
    const safeProbe = surface.querySelector('.director-companion-safe-area');

    function storageKey() { return 'zorifi-director-orb-position:' + currentUser; }
    function readPosition() {
      try {
        const value = JSON.parse(win.sessionStorage.getItem(storageKey()) || 'null');
        return Number.isFinite(value?.x) && Number.isFinite(value?.y) ? {x: clamp(value.x, 0, 1), y: clamp(value.y, 0, 1)} : null;
      } catch { return null; }
    }
    function savePosition() {
      if (!currentUser || !savedPosition) return;
      try { win.sessionStorage.setItem(storageKey(), JSON.stringify(savedPosition)); } catch { /* Position remains usable without storage. */ }
    }
    function bounds() {
      const visual = win.visualViewport, style = win.getComputedStyle(safeProbe);
      const x = visual?.offsetLeft || 0, y = visual?.offsetTop || 0;
      const width = visual?.width || win.innerWidth || doc.documentElement.clientWidth;
      const height = visual?.height || win.innerHeight || doc.documentElement.clientHeight;
      const edge = side => Math.max(12, parseFloat(style['padding' + side]) || 0);
      return {left: x + edge('Left'), right: x + width - edge('Right'), top: y + edge('Top'), bottom: y + height - edge('Bottom')};
    }
    function visibleRect(selector) {
      for (const node of doc.querySelectorAll(selector)) {
        const rect = node.getBoundingClientRect(), style = win.getComputedStyle(node);
        if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') return rect;
      }
      return null;
    }
    function defaultPosition(area, size) {
      const preview = visibleRect('main[data-view="editor"] .preview-wrap') || visibleRect('main[data-view="editor"] .stage, .music-waveform-stage');
      if (preview && preview.width >= size + 24 && preview.height >= size + 24) {
        return {x: preview.right - size - 12, y: preview.bottom - size - 12};
      }
      let bottom = area.bottom;
      const navigation = visibleRect('.mobile-home-nav, .mobile-editor-dock, .mobile-bottom-nav');
      if (navigation && navigation.top > area.top) bottom = Math.min(bottom, navigation.top - 12);
      return {x: area.right - size, y: bottom - size};
    }
    function setPosition(x, y, {remember = false} = {}) {
      const area = bounds(), size = orb.getBoundingClientRect().width || 56;
      const left = clamp(x, area.left, area.right - size), top = clamp(y, area.top, area.bottom - size);
      orb.style.left = left + 'px'; orb.style.top = top + 'px';
      if (remember) {
        savedPosition = {x: (left - area.left) / Math.max(1, area.right - area.left - size), y: (top - area.top) / Math.max(1, area.bottom - area.top - size)};
      }
      // Speech stays visible when chat is embedded, within the preview rather
      // than over the timeline, transport bar, or mobile editing dock.
      const chat = snapshot.chatOpen && visibleRect('.vanessa-assistant.open .vanessa-messages');
      const preview = snapshot.captionKind === 'speech' && (snapshot.chatOpen && doc.body.classList.contains('touch-workspace') ? chat : visibleRect('main[data-view="editor"] .preview-wrap') || visibleRect('main[data-view="editor"] .stage, .music-waveform-stage') || chat);
      if (preview && preview.height >= 60 && snapshot.caption) {
        const width = Math.max(1, Math.min(420, area.right-area.left, preview.width-20));
        notes.style.width = width+'px';
        notes.style.left = clamp(preview.left+(preview.width-width)/2, area.left, area.right-width)+'px';
        notes.style.maxHeight = Math.max(1, Math.min(180, Math.max(64,preview.height*.52), preview.height-12, area.bottom-area.top))+'px';
        const height = notes.getBoundingClientRect().height;
        notes.style.top = clamp(preview.bottom-height-10, Math.max(area.top,preview.top), Math.min(area.bottom-height,preview.bottom-height))+'px';
        notes.dataset.side = 'preview';
        return;
      }
      const width = Math.max(1, Math.min(300, area.right - area.left));
      notes.style.width = width + 'px';
      notes.style.left = clamp(left + size - width, area.left, area.right - width) + 'px';
      const above = Math.max(0, top - area.top - 12), below = Math.max(0, area.bottom - top - size - 12);
      const useAbove = above >= below;
      notes.style.maxHeight = Math.max(1, useAbove ? above : below) + 'px';
      const height = notes.getBoundingClientRect().height;
      notes.style.top = clamp(useAbove ? top - height - 12 : top + size + 12, area.top, area.bottom - height) + 'px';
      notes.dataset.side = useAbove ? 'above' : 'below';
    }
    function position() {
      if (disposed || surface.hidden || drag) return;
      const area = bounds(), size = orb.getBoundingClientRect().width || 56;
      const point = savedPosition ? {x: area.left + savedPosition.x * Math.max(0, area.right - area.left - size), y: area.top + savedPosition.y * Math.max(0, area.bottom - area.top - size)} : defaultPosition(area, size);
      setPosition(point.x, point.y);
    }
    function interact() { onInteract?.(); }
    function dismiss() {
      interact();
      snapshot = {...snapshot, caption: '', hint: false};
      caption.hidden = true; hint.hidden = true;
      onDismiss?.();
    }

    orb.addEventListener('click', event => {
      if (!currentUser || !snapshot.visible || snapshot.chatOpen) return;
      if (suppressClick) { suppressClick = false; event.preventDefault(); return; }
      interact(); onOpen?.();
    }, {signal: lifecycle.signal});
    orb.addEventListener('pointerdown', event => {
      if (event.button !== 0 || disposed) return;
      interact(); suppressClick = false;
      const rect = orb.getBoundingClientRect();
      drag = {id: event.pointerId, startX: event.clientX, startY: event.clientY, x: rect.left, y: rect.top, moved: false};
      orb.setPointerCapture?.(event.pointerId);
    }, {signal: lifecycle.signal});
    orb.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 8) return;
      drag.moved = true; surface.dataset.dragging = 'true';
      event.preventDefault(); setPosition(drag.x + dx, drag.y + dy, {remember: true});
    }, {signal: lifecycle.signal});
    function endDrag(event) {
      if (!drag || event.pointerId !== drag.id) return;
      suppressClick = drag.moved;
      if (drag.moved) savePosition();
      if (orb.hasPointerCapture?.(event.pointerId)) orb.releasePointerCapture(event.pointerId);
      drag = null; delete surface.dataset.dragging;
    }
    orb.addEventListener('pointerup', endDrag, {signal: lifecycle.signal});
    orb.addEventListener('pointercancel', endDrag, {signal: lifecycle.signal});
    orb.addEventListener('keydown', event => {
      if (!event.altKey) return;
      if (event.key === 'Home') { event.preventDefault(); savedPosition = null; try { win.sessionStorage.removeItem(storageKey()); } catch {} position(); interact(); return; }
      const movement = {ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16]}[event.key];
      if (!movement) return;
      event.preventDefault(); const rect = orb.getBoundingClientRect();
      setPosition(rect.left + movement[0], rect.top + movement[1], {remember: true}); savePosition(); interact();
    }, {signal: lifecycle.signal});
    surface.querySelector('[data-director-caption-close]').addEventListener('click', dismiss, {signal: lifecycle.signal});
    surface.querySelector('[data-director-hint-close]').addEventListener('click', dismiss, {signal: lifecycle.signal});
    win.addEventListener('resize', position, {signal: lifecycle.signal});
    win.visualViewport?.addEventListener('resize', position, {signal: lifecycle.signal});
    win.visualViewport?.addEventListener('scroll', position, {signal: lifecycle.signal});
    const observer = win.ResizeObserver ? new win.ResizeObserver(position) : null;
    let observed = [];
    function observeLayout() {
      const nodes = [notes, ...doc.querySelectorAll('.preview-wrap, .stage, .timeline-area, .music-waveform-stage, .mobile-home-nav, .mobile-editor-dock')];
      if (nodes.length === observed.length && nodes.every((node, index) => node === observed[index])) return;
      observer?.disconnect(); observed = nodes;
      for (const node of nodes) observer?.observe(node);
    }
    function update(value = {}) {
      if (disposed) return;
      snapshot = {...snapshot, ...value};
      const owner = String(snapshot.userId || '');
      if (owner !== currentUser) {
        currentUser = owner; savedPosition = owner ? readPosition() : null; drag = null; suppressClick = false;
        // A new account must never inherit a previous account's subtitle.
        if (!Object.prototype.hasOwnProperty.call(value, 'caption')) snapshot.caption = '';
        if (!Object.prototype.hasOwnProperty.call(value, 'wordRange')) snapshot.wordRange = null;
        if (!Object.prototype.hasOwnProperty.call(value, 'hint')) snapshot.hint = false;
      }
      const speechVisible = snapshot.captionKind === 'speech' && Boolean(snapshot.caption);
      surface.hidden = !owner || !snapshot.visible || Boolean(snapshot.chatOpen && !speechVisible);
      orb.hidden = Boolean(snapshot.chatOpen);
      surface.dataset.chatOpen = String(Boolean(snapshot.chatOpen));
      surface.dataset.mode = snapshot.mode === 'director' ? 'director' : 'companion';
      surface.dataset.status = statuses.has(snapshot.status) ? snapshot.status : 'idle';
      if (!owner || !snapshot.visible) { snapshot.caption = ''; snapshot.hint = false; }
      const text = String(snapshot.caption || '').trim();
      if (renderedText !== text) {
        renderedText = text; wordNodes = []; captionText.replaceChildren();
        let cursor = 0;
        for (const word of text.matchAll(/\S+/gu)) {
          if (word.index > cursor) captionText.append(doc.createTextNode(text.slice(cursor,word.index)));
          const node = doc.createElement('span'); node.className = 'director-caption-word';
          node.textContent = word[0]; captionText.append(node);
          wordNodes.push({node,start:word.index,end:word.index+word[0].length});
          cursor = word.index+word[0].length;
        }
        if (cursor < text.length) captionText.append(doc.createTextNode(text.slice(cursor)));
      }
      const index = snapshot.wordRange?.charIndex;
      for (const word of wordNodes) {
        const active = speechVisible && Number.isInteger(index) && index >= word.start && index < word.end;
        word.node.classList.toggle('is-current',active);
        if(active)word.node.setAttribute('aria-current','true');else word.node.removeAttribute('aria-current');
        if(active){const box=word.node.getBoundingClientRect(),viewport=captionText.getBoundingClientRect();if(box.bottom>viewport.bottom)captionText.scrollTop+=box.bottom-viewport.bottom+4;else if(box.top<viewport.top)captionText.scrollTop-=viewport.top-box.top+4;}
      }
      caption.dataset.kind = snapshot.captionKind === 'speech' ? 'speech' : 'message';
      caption.dataset.timing = snapshot.wordRange ? 'boundary' : 'unavailable';
      speakingStatus.textContent = speechVisible ? snapshot.status === 'speaking' ? 'Speaking' : snapshot.status === 'error' ? 'Voice unavailable' : 'Preparing voice' : 'Creative companion';
      timing.hidden = !speechVisible || snapshot.status !== 'speaking' || Boolean(snapshot.wordRange);
      timing.textContent = timing.hidden ? '' : 'Full spoken text · word timing is not available from this voice yet';
      caption.hidden = !text; hint.hidden = !snapshot.hint;
      orb.title = `${surface.dataset.mode === 'director' ? 'Vanessa Director' : 'Vanessa companion'} · drag to move · Alt + arrow keys to move`;
      observeLayout(); position();
      win.cancelAnimationFrame(positionFrame);positionFrame=win.requestAnimationFrame(()=>{positionFrame=null;position();});
    }
    const controller = {
      update,
      dispose() {
        if (disposed) return;
        disposed = true; lifecycle.abort(); observer?.disconnect();win.cancelAnimationFrame(positionFrame); observed = []; drag = null;
        surface.remove();
        if (instances.get(doc) === controller) instances.delete(doc);
      }
    };
    instances.set(doc, controller);
    return controller;
  }
  return {create};
});
