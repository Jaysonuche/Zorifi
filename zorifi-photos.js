(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ZorifiPhotos = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const RATIOS = { original: null, square: 1, portrait: 4 / 5, story: 9 / 16, landscape: 16 / 9, classic: 4 / 3, tall: 3 / 4 };
  const FILTERS = {
    original: { brightness: 100, contrast: 100, saturation: 100, warmth: 0 },
    vivid: { brightness: 104, contrast: 114, saturation: 135, warmth: 3 },
    cinema: { brightness: 94, contrast: 122, saturation: 86, warmth: 8 },
    golden: { brightness: 105, contrast: 108, saturation: 115, warmth: 20 },
    cool: { brightness: 101, contrast: 108, saturation: 110, warmth: -24 },
    mono: { brightness: 102, contrast: 115, saturation: 0, warmth: 0 }
  };
  const LAYOUTS = ['grid', 'rows', 'columns', 'focus', 'mosaic', 'filmstrip'];
  const LIMIT = 9;
  const LIBRARY_LIMIT = 80;
  const IMPORT_LIMIT = 12;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const id = () => root.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const overlayPosition = count => [{ x: 50, y: 50 }, { x: 76, y: 24 }, { x: 25, y: 76 }, { x: 75, y: 75 }][count % 4];
  const canvasFilterWorks = (() => {
    if (!root.document) return false;
    const canvas = root.document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#404040'; ctx.filter = 'brightness(200%)'; ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data[0] > 100;
  })();

  function gridCells(count, columns) {
    const rows = Math.ceil(count / columns), cells = [];
    for (let row = 0, index = 0; row < rows; row++) {
      const inRow = Math.min(columns, count - index);
      for (let column = 0; column < inRow; column++, index++) cells.push({ x: column / inRow, y: row / rows, w: 1 / inRow, h: 1 / rows });
    }
    return cells;
  }
  function layoutCells(count, layout = 'grid') {
    if (!Number.isInteger(count) || count < 1 || count > LIMIT) throw new Error('Choose one to nine photos.');
    if (count === 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
    if (layout === 'rows') return gridCells(count, 1);
    if (layout === 'columns') return Array.from({ length: count }, (_, index) => ({ x: index / count, y: 0, w: 1 / count, h: 1 }));
    if (layout === 'focus') return [{ x: 0, y: 0, w: .63, h: 1 }, ...gridCells(count - 1, count > 5 ? 2 : 1).map(cell => ({ x: .63 + cell.x * .37, y: cell.y, w: cell.w * .37, h: cell.h }))];
    if (layout === 'mosaic') return [{ x: 0, y: 0, w: 1, h: .58 }, ...gridCells(count - 1, Math.min(4, count - 1)).map(cell => ({ x: cell.x, y: .58 + cell.y * .42, w: cell.w, h: cell.h * .42 }))];
    if (layout === 'filmstrip') return [{ x: 0, y: 0, w: 1, h: .72 }, ...gridCells(count - 1, count - 1).map(cell => ({ x: cell.x, y: .72, w: cell.w, h: .28 }))];
    return gridCells(count, Math.ceil(Math.sqrt(count)));
  }

  const session = {
    origin: 'home', stage: 'choose', mode: 'photo', tab: 'edit', textTab: 'write', items: [], selected: [], activeId: '',
    layout: 'grid', ratio: 'original', spacing: 3, rounding: 0, background: '#0d0b17', backgroundPreset: 'solid',
    brightness: 100, contrast: 100, saturation: 100, warmth: 0, filter: 'original',
    transforms: {}, overlays: [], selectedOverlay: '', history: [], future: [], busy: false, message: ''
  };
  let host = null, callbacks = {}, drawScheduled = false, drag = null, activeControlEdit = null;
  const stickerImages = new Map();
  function stickerImage(stickerId) {
    if (stickerImages.has(stickerId)) return stickerImages.get(stickerId);
    if (!root.ZorifiStickers?.byId(stickerId)) return null;
    const image = new root.Image();
    image.onload = redraw;
    image.src = root.ZorifiStickers.dataUrl(stickerId);
    stickerImages.set(stickerId, image);
    return image;
  }

  function editable() {
    return { layout: session.layout, ratio: session.ratio, spacing: session.spacing, rounding: session.rounding,
      background: session.background, backgroundPreset: session.backgroundPreset, brightness: session.brightness, contrast: session.contrast,
      saturation: session.saturation, warmth: session.warmth, filter: session.filter,
      transforms: JSON.parse(JSON.stringify(session.transforms)), overlays: JSON.parse(JSON.stringify(session.overlays)),
      selectedOverlay: session.selectedOverlay, activeId: session.activeId };
  }
  function remember() { session.history.push(editable()); if (session.history.length > 40) session.history.shift(); session.future = []; }
  function restore(snapshot) { Object.assign(session, snapshot); redraw(); render(); }
  function undo() { if (!session.history.length) return; session.future.push(editable()); restore(session.history.pop()); }
  function redo() { if (!session.future.length) return; session.history.push(editable()); restore(session.future.pop()); }
  function transformFor(itemId) { return session.transforms[itemId] ||= { zoom: 100, x: 0, y: 0, rotation: 0, cutout: false }; }
  function activeItem() { return session.items.find(item => item.id === session.activeId) || session.items.find(item => item.id === session.selected[0]); }
  function chosenItems() { return session.selected.map(itemId => session.items.find(item => item.id === itemId)).filter(Boolean).slice(0, session.mode === 'photo' ? 1 : LIMIT); }
  function dimensions() {
    const first = chosenItems()[0];
    const sourceRatio = first ? first.width / first.height : 1;
    const ratio = RATIOS[session.ratio] || sourceRatio;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  }
  function show(message) { session.message = message; const node = host?.querySelector('[data-photos-message]'); if (node) { node.textContent = message; node.hidden = !message; } }
  function releaseItems() { for (const item of session.items) if (item.ownedUrl) root.URL.revokeObjectURL(item.url); session.items = []; session.selected = []; session.transforms = {}; session.overlays = []; session.history = []; session.future = []; }
  function dispose() { releaseItems(); host = null; callbacks = {}; drag = null; activeControlEdit = null; }

  function start({ origin = 'home', items = [], mode = 'photo' } = {}) {
    releaseItems();
    Object.assign(session, { origin, stage: 'choose', mode, tab: mode === 'collage' ? 'layout' : 'edit', textTab: 'write', selected: [], activeId: '', layout: 'grid', ratio: 'original', spacing: 3, rounding: 0, background: '#0d0b17', backgroundPreset: 'solid', brightness: 100, contrast: 100, saturation: 100, warmth: 0, filter: 'original', transforms: {}, overlays: [], selectedOverlay: '', history: [], future: [], busy: false, message: '' });
    for (const asset of items.filter(item => item.type === 'image' && item.url).slice(0, LIBRARY_LIMIT)) addExisting(asset);
    if (items.length > LIBRARY_LIMIT) session.message = `Showing the first ${LIBRARY_LIMIT} project photos. You can also add photos from this device.`;
    return session;
  }
  function addExisting(asset) {
    const item = { id: id(), name: asset.name || 'Project photo', url: asset.url, thumbnail: asset.thumbnail || asset.url, image: null, width: asset.width || 1, height: asset.height || 1, ownedUrl: false };
    session.items.push(item);
  }
  function decodeImage(url, name) {
    return new Promise((resolve, reject) => {
      const image = new root.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`${name} could not be decoded on this device.`));
      image.src = url;
    });
  }
  async function loadImage(file) {
    if (!file || !(file.type.startsWith('image/') || /\.(png|jpe?g|webp|avif|heic|heif)$/i.test(file.name))) throw new Error(`${file?.name || 'That file'} is not an image.`);
    let url = root.URL.createObjectURL(file);
    try {
      let image = await decodeImage(url, file.name);
      const maxEdge = root.matchMedia?.('(max-width:760px)').matches ? 1800 : 2600;
      if (Math.max(image.naturalWidth, image.naturalHeight) > maxEdge) {
        const scale = maxEdge / Math.max(image.naturalWidth, image.naturalHeight), canvas = root.document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const proxy = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .92));
        if (!proxy) throw new Error(`${file.name} could not be prepared for this device.`);
        const proxyUrl = root.URL.createObjectURL(proxy);
        try {
          const resized = await decodeImage(proxyUrl, file.name);
          root.URL.revokeObjectURL(url); url = proxyUrl; image = resized;
        } catch (error) { root.URL.revokeObjectURL(proxyUrl); throw error; }
      }
      return { id: id(), name: file.name || 'Photo', url, image, width: image.naturalWidth, height: image.naturalHeight, ownedUrl: true };
    } catch (error) { root.URL.revokeObjectURL(url); throw error; }
  }
  async function prepareItem(item) {
    if (item.image?.complete && item.image.naturalWidth) return item;
    if (!item.preparing) item.preparing = decodeImage(item.url, item.name).then(image => {
      item.image = image; item.width = image.naturalWidth; item.height = image.naturalHeight; item.preparing = null; redraw(); return item;
    }).catch(error => { item.preparing = null; throw error; });
    return item.preparing;
  }
  async function addFiles(files) {
    const importedCount = session.items.filter(item => item.ownedUrl).length;
    const openSlots = Math.max(0, Math.min(IMPORT_LIMIT - importedCount, LIBRARY_LIMIT - session.items.length));
    if (!openSlots) return show(`This Photos session can hold ${LIBRARY_LIMIT} project images and ${IMPORT_LIMIT} new files. Select up to nine for one collage.`);
    session.busy = true; show('Opening photos…');
    const results = [];
    for (const [index, file] of Array.from(files).slice(0, openSlots).entries()) {
      show(`Opening photo ${index + 1} of ${Math.min(files.length, openSlots)}…`);
      try { results.push({ status: 'fulfilled', value: await loadImage(file) }); }
      catch (reason) { results.push({ status: 'rejected', reason }); }
    }
    const accepted = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    session.items.push(...accepted);
    accepted.forEach(item => { if (!session.selected.includes(item.id) && session.selected.length < (session.mode === 'collage' ? LIMIT : 1)) session.selected.push(item.id); });
    session.busy = false; render();
    const rejected = results.filter(result => result.status === 'rejected');
    if (rejected.length) show(`${accepted.length} opened; ${rejected.length} could not be decoded. ${rejected[0].reason.message}`);
    else if (Array.from(files).length > openSlots) show(`Only the first ${openSlots} photos were added. Start another Photos session for more files.`);
    else show(accepted.length ? `${accepted.length} ${accepted.length === 1 ? 'photo' : 'photos'} ready.` : 'Choose photos to begin.');
  }

  function roundedPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y); ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r); ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function filterCss() {
    const preset = FILTERS[session.filter] || FILTERS.original;
    return `brightness(${preset.brightness * session.brightness / 100}%) contrast(${preset.contrast * session.contrast / 100}%) saturate(${preset.saturation * session.saturation / 100}%) sepia(${Math.max(0, preset.warmth + session.warmth) / 2}%) hue-rotate(${Math.min(0, preset.warmth + session.warmth)}deg)`;
  }
  function applyPixelFilter(ctx, width, height) {
    const preset = FILTERS[session.filter] || FILTERS.original;
    const brightness = preset.brightness * session.brightness / 10000;
    const contrast = preset.contrast * session.contrast / 10000;
    const saturation = preset.saturation * session.saturation / 10000;
    const warmth = preset.warmth + session.warmth;
    if (Math.abs(brightness - 1) < .001 && Math.abs(contrast - 1) < .001 && Math.abs(saturation - 1) < .001 && !warmth) return;
    const image = ctx.getImageData(0, 0, width, height), data = image.data;
    for (let index = 0; index < data.length; index += 4) {
      let red = data[index], green = data[index + 1], blue = data[index + 2];
      const gray = red * .2126 + green * .7152 + blue * .0722;
      red = (gray + (red - gray) * saturation - 128) * contrast + 128;
      green = (gray + (green - gray) * saturation - 128) * contrast + 128;
      blue = (gray + (blue - gray) * saturation - 128) * contrast + 128;
      data[index] = clamp(red * brightness + warmth * .55, 0, 255);
      data[index + 1] = clamp(green * brightness + warmth * .08, 0, 255);
      data[index + 2] = clamp(blue * brightness - warmth * .55, 0, 255);
    }
    ctx.putImageData(image, 0, 0);
  }
  function drawPhoto(ctx, item, cell, canvasWidth, canvasHeight) {
    const image = transformFor(item.id).cutout && item.cutoutImage ? item.cutoutImage : item.image;
    if (!image?.complete || !image.naturalWidth) return;
    const gap = session.mode === 'collage' ? session.spacing / 100 * Math.min(canvasWidth, canvasHeight) : 0;
    const x = cell.x * canvasWidth + gap / 2, y = cell.y * canvasHeight + gap / 2;
    const w = cell.w * canvasWidth - gap, h = cell.h * canvasHeight - gap;
    if (w <= 0 || h <= 0) return;
    const transform = transformFor(item.id), radians = transform.rotation * Math.PI / 180;
    const cosine = Math.abs(Math.cos(radians)), sine = Math.abs(Math.sin(radians));
    const factor = Math.max((w * cosine + h * sine) / image.naturalWidth, (w * sine + h * cosine) / image.naturalHeight) * transform.zoom / 100;
    const layer = canvasFilterWorks ? null : root.document.createElement('canvas');
    if (layer) { layer.width = Math.max(1, Math.ceil(w)); layer.height = Math.max(1, Math.ceil(h)); }
    const painter = layer ? layer.getContext('2d') : ctx, left = layer ? 0 : x, top = layer ? 0 : y;
    painter.save(); roundedPath(painter, left, top, w, h, session.rounding / 100 * Math.min(w, h)); painter.clip();
    if (canvasFilterWorks) painter.filter = filterCss();
    painter.translate(left + w / 2 + transform.x / 200 * w, top + h / 2 + transform.y / 200 * h);
    painter.rotate(radians); painter.drawImage(image, -image.naturalWidth * factor / 2, -image.naturalHeight * factor / 2, image.naturalWidth * factor, image.naturalHeight * factor);
    painter.restore();
    if (layer) { applyPixelFilter(painter, layer.width, layer.height); ctx.drawImage(layer, x, y, w, h); }
  }
  function paint(canvas, edge = 1000) {
    const ratio = dimensions();
    canvas.width = Math.max(1, Math.round(ratio >= 1 ? edge : edge * ratio));
    canvas.height = Math.max(1, Math.round(ratio >= 1 ? edge / ratio : edge));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (session.backgroundPreset === 'solid') ctx.fillStyle = session.background;
    else {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      const colors = { aurora: ['#140b32', '#6335a3', '#ed6faf'], dusk: ['#20112c', '#ba467e', '#f4a65c'], midnight: ['#020713', '#0f294f', '#5037a5'] }[session.backgroundPreset] || ['#0d0b17', '#4a2c79', '#d968bd'];
      gradient.addColorStop(0, colors[0]); gradient.addColorStop(.56, colors[1]); gradient.addColorStop(1, colors[2]); ctx.fillStyle = gradient;
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const items = chosenItems(), cells = layoutCells(items.length || 1, session.mode === 'photo' ? 'grid' : session.layout);
    items.forEach((item, index) => drawPhoto(ctx, item, cells[index], canvas.width, canvas.height));
    for (const overlay of session.overlays) {
      const x = overlay.x / 100 * canvas.width, y = overlay.y / 100 * canvas.height;
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = overlay.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (overlay.kind === 'text') {
        const fonts = { modern: 'system-ui,sans-serif', editorial: 'Georgia,serif', mono: 'ui-monospace,monospace', display: 'Impact,Arial Black,sans-serif' };
        const fontSize = Math.round(overlay.size / 100 * canvas.width), lines = String(overlay.text).split('\n').slice(0, 5).map(line => line.slice(0, 80));
        ctx.font = `700 ${fontSize}px ${fonts[overlay.font] || fonts.modern}`;
        if (overlay.bubble && overlay.bubble !== 'none') {
          const textWidth = Math.min(canvas.width * .9, Math.max(...lines.map(line => ctx.measureText(line).width), fontSize * 2));
          const bubbleWidth = textWidth + fontSize * .9, bubbleHeight = lines.length * fontSize * 1.28 + fontSize * .65;
          ctx.fillStyle = overlay.bubble === 'light' ? '#f5ebffeb' : '#171021e8';
          roundedPath(ctx, -bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, fontSize * .35); ctx.fill();
          ctx.fillStyle = overlay.bubble === 'light' ? '#241333' : overlay.color;
        }
        if (overlay.effect === 'glow') { ctx.shadowColor = overlay.color; ctx.shadowBlur = fontSize * .55; }
        else if (overlay.effect === 'shadow') { ctx.shadowColor = '#000b'; ctx.shadowBlur = fontSize * .25; }
        for (const [index, line] of lines.entries()) {
          const lineY = (index - (lines.length - 1) / 2) * fontSize * 1.28;
          if (overlay.effect === 'outline') { ctx.lineWidth = Math.max(2, fontSize * .12); ctx.strokeStyle = '#160c24'; ctx.strokeText(line, 0, lineY, canvas.width * .9); }
          ctx.fillText(line, 0, lineY, canvas.width * .9);
        }
      } else if (overlay.kind === 'star') {
        const radius = overlay.size / 100 * canvas.width; ctx.beginPath();
        for (let point = 0; point < 10; point++) { const angle = -Math.PI / 2 + point * Math.PI / 5, r = point % 2 ? radius * .44 : radius; ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r); }
        ctx.closePath(); ctx.fill();
      } else if (overlay.kind === 'heart') {
        const r = overlay.size / 100 * canvas.width; ctx.beginPath(); ctx.moveTo(0, r * .7); ctx.bezierCurveTo(-r * 1.3, 0, -r * .7, -r, 0, -r * .32); ctx.bezierCurveTo(r * .7, -r, r * 1.3, 0, 0, r * .7); ctx.fill();
      } else if (overlay.kind === 'sticker') {
        const image = stickerImage(overlay.stickerId), size = overlay.size / 50 * canvas.width;
        if (image?.complete && image.naturalWidth) ctx.drawImage(image, -size / 2, -size / 2, size, size);
      } else { ctx.beginPath(); ctx.arc(0, 0, overlay.size / 100 * canvas.width, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    return canvas;
  }
  function redraw() {
    if (drawScheduled) return;
    drawScheduled = true;
    (root.requestAnimationFrame || setTimeout)(() => { drawScheduled = false; const canvas = host?.querySelector('[data-photos-canvas]'); if (canvas && session.stage === 'edit') paint(canvas, 1000); });
  }
  async function exportBlob() {
    await Promise.all(session.overlays.filter(overlay => overlay.kind === 'sticker').map(overlay => stickerImage(overlay.stickerId)?.decode?.().catch(() => {})));
    const canvas = root.document.createElement('canvas'); paint(canvas, 2048);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The image could not be encoded.')), 'image/png'));
  }
  async function exportPhoto({ useInEditor = false } = {}) {
    if (session.busy) return;
    session.busy = true; show('Preparing your PNG…');
    try {
      const blob = await exportBlob(), name = `Zorifi-${session.mode}-${Date.now()}.png`, file = new File([blob], name, { type: 'image/png' });
      if (useInEditor && callbacks.onUseInEditor) { await callbacks.onUseInEditor(file); return; }
      let shared = false;
      if (root.navigator?.share && root.navigator?.canShare?.({ files: [file] })) {
        try { await root.navigator.share({ files: [file], title: 'Zorifi photo' }); shared = true; }
        catch (error) { if (error.name === 'AbortError') return; }
      }
      if (!shared) { const url = root.URL.createObjectURL(blob), link = root.document.createElement('a'); link.href = url; link.download = name; root.document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => root.URL.revokeObjectURL(url), 60000); }
      show('Finished PNG ready to save.');
    } catch (error) { if (error.name !== 'AbortError') show(error.message || 'The photo could not be exported.'); }
    finally { session.busy = false; }
  }
  async function cutout() {
    const item = activeItem(); if (!item) return;
    if (!root.ZorifiPhase11?.removeImageBackground) return show('The local cutout engine is unavailable.');
    session.busy = true; show('Removing a plain background locally…');
    try {
      const width = Math.min(1024, item.width), height = Math.round(width * item.height / item.width), canvas = root.document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(item.image, 0, 0, width, height);
      const result = root.ZorifiPhase11.removeImageBackground(ctx.getImageData(0, 0, width, height), { threshold: 30, feather: 35 });
      ctx.putImageData(new ImageData(result.data, width, height), 0, 0);
      const image = new root.Image(); image.src = canvas.toDataURL('image/png'); await image.decode();
      remember(); item.cutoutImage = image; transformFor(item.id).cutout = true; redraw(); show('Background removed. Best results are photos with a plain, even backdrop.');
    } catch (error) { show(error.message || 'The background could not be removed on this device.'); }
    finally { session.busy = false; }
  }

  function chooseMarkup() {
    return `<section class="photos-choose"><header class="photos-heading"><p>PHOTO WORKSPACE</p><h1>Give every frame its place.</h1><span>Edit a photograph or compose several into one finished image.</span></header><nav class="photos-mode-tabs" aria-label="Photo creation mode"><button data-photos-mode="photo" class="${session.mode === 'photo' ? 'active' : ''}">Edit photo</button><button data-photos-mode="collage" class="${session.mode === 'collage' ? 'active' : ''}">Collage</button></nav><div class="photos-import-row"><label class="photos-import"><input data-photos-input type="file" accept="image/*,.heic,.heif" multiple><span>＋</span><b>Add photos</b></label><span>${session.mode === 'collage' ? 'Choose 2–9 images in the order you want them to appear.' : 'Choose one photo to edit.'}</span></div><div class="photos-picker-grid">${session.items.map(item => { const number = session.selected.indexOf(item.id) + 1; return `<button class="photos-picker-item ${number ? 'selected' : ''}" data-photos-item="${item.id}" aria-label="${esc(item.name)}${number ? ` selected ${number}` : ''}"><img src="${esc(item.thumbnail || item.url)}" alt=""><i>${number || '+'}</i><small>${esc(item.name)}</small></button>`; }).join('') || '<div class="photos-empty"><i>◈</i><b>Your photos stay on this device.</b><span>Pick images to start editing or make a collage.</span></div>'}</div></section><footer class="photos-choose-footer"><div class="photos-selection-strip">${session.selected.map((itemId, index) => { const item = session.items.find(entry => entry.id === itemId); return item ? `<button data-photos-remove="${item.id}" title="Remove ${esc(item.name)}"><img src="${esc(item.thumbnail || item.url)}" alt=""><i>${index + 1}</i></button>` : ''; }).join('')}</div><button class="photos-create" data-photos-create ${session.mode === 'photo' ? !session.selected.length ? 'disabled' : '' : session.selected.length < 2 ? 'disabled' : ''}>${session.mode === 'collage' ? `Create collage (${session.selected.length})` : 'Edit photo'}</button></footer>`;
  }
  function toolbar() {
    return session.mode === 'collage' ? [['layout', 'Layout'], ['ratio', 'Ratio'], ['edit', 'Edit'], ['adjust', 'Adjust'], ['filter', 'Filters'], ['text', 'Text'], ['elements', 'Elements'], ['background', 'Background']] : [['edit', 'Crop'], ['ratio', 'Ratio'], ['adjust', 'Adjust'], ['filter', 'Filters'], ['text', 'Text'], ['elements', 'Elements'], ['background', 'Background']];
  }
  function range(label, key, min, max, step = 1, value = session[key]) { return `<label class="photos-range"><span>${label}<output>${Math.round(value)}</output></span><input type="range" data-photos-range="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`; }
  function textControlsMarkup() {
    const selected = session.overlays.find(overlay => overlay.id === session.selectedOverlay && overlay.kind === 'text');
    const tabs = [['write', 'Write'], ['templates', 'Templates'], ['fonts', 'Fonts'], ['styles', 'Effects'], ['bubbles', 'Bubbles']];
    const tabBar = `<nav class="photos-text-tabs" aria-label="Text controls">${tabs.map(([value, label]) => `<button class="${session.textTab === value ? 'active' : ''}" data-photos-text-tab="${value}">${label}</button>`).join('')}</nav>`;
    if (session.textTab === 'templates') return `${tabBar}<div class="photos-option-list">${[['headline', 'Bold title'], ['editorial', 'Editorial'], ['neon', 'Neon glow'], ['caption', 'Caption card']].map(([value, label]) => `<button data-photos-text-template="${value}"><i class="photos-font-sample photos-template-${value}">Aa</i>${label}</button>`).join('')}</div><small class="photos-hint">Choose a style, then open Write to change its words.</small>`;
    if (session.textTab === 'fonts') return `${tabBar}<div class="photos-option-list">${[['modern', 'Modern'], ['editorial', 'Editorial'], ['mono', 'Mono'], ['display', 'Display']].map(([value, label]) => `<button data-photos-font="${value}" class="${selected?.font === value ? 'active' : ''}" ${selected ? '' : 'disabled'}><i class="photos-font-sample photos-font-${value}">Aa</i>${label}</button>`).join('')}</div><small class="photos-hint">Select or add text to change its font.</small>`;
    if (session.textTab === 'styles') return `${tabBar}<div class="photos-option-list">${[['clean', 'Clean'], ['shadow', 'Shadow'], ['outline', 'Outline'], ['glow', 'Glow']].map(([value, label]) => `<button data-photos-text-effect="${value}" class="${selected?.effect === value ? 'active' : ''}" ${selected ? '' : 'disabled'}><i class="photos-font-sample photos-effect-${value}">Aa</i>${label}</button>`).join('')}</div><small class="photos-hint">Effects are rendered into the exported PNG.</small>`;
    if (session.textTab === 'bubbles') return `${tabBar}<div class="photos-option-list">${[['none', 'None'], ['dark', 'Dark card'], ['light', 'Light card']].map(([value, label]) => `<button data-photos-bubble="${value}" class="${(selected?.bubble || 'none') === value ? 'active' : ''}" ${selected ? '' : 'disabled'}><i class="photos-bubble-sample photos-bubble-${value}">Text</i>${label}</button>`).join('')}</div><small class="photos-hint">A readable background follows your text as you move it.</small>`;
    return `${tabBar}<div class="photos-text-form"><label>${selected ? 'Edit selected text' : 'New text'}<input data-photos-text-input maxlength="80" placeholder="Type something memorable" value="${esc(selected?.text || '')}"></label><div class="photos-action-row"><button data-photos-add-text>Add text</button><button data-photos-new-text ${selected ? '' : 'disabled'}>New text layer</button></div><label>Colour<input type="color" data-photos-overlay-color value="${esc(selected?.color || '#ffffff')}"></label>${range('Size', 'overlay-size', 2, 18, 1, selected?.size || 6)}<button data-photos-remove-overlay ${selected ? '' : 'disabled'}>Remove selected</button></div><small class="photos-hint">Drag text on the image to position it. Choose New text layer before typing a separate caption.</small>`;
  }
  function controlsMarkup() {
    const item = activeItem(), transform = item && transformFor(item.id);
    if (session.tab === 'layout') return `<div class="photos-option-list" role="group" aria-label="Collage layouts">${LAYOUTS.map(value => `<button data-photos-layout="${value}" class="${session.layout === value ? 'active' : ''}"><i class="photos-layout-icon photos-layout-${value}"></i><span>${value === 'filmstrip' ? 'Story strip' : value[0].toUpperCase() + value.slice(1)}</span></button>`).join('')}</div>${range('Gap', 'spacing', 0, 12)}${range('Rounded corners', 'rounding', 0, 50)}`;
    if (session.tab === 'ratio') return `<div class="photos-option-list" role="group" aria-label="Image aspect ratio">${Object.keys(RATIOS).map(value => `<button data-photos-ratio="${value}" class="${session.ratio === value ? 'active' : ''}"><i class="photos-ratio-icon photos-ratio-${value}"></i><span>${({ original: 'Original', square: '1:1', portrait: '4:5', story: '9:16', landscape: '16:9', classic: '4:3', tall: '3:4' })[value]}</span></button>`).join('')}</div>`;
    if (session.tab === 'edit') return `<div class="photos-target"><b>${esc(item?.name || 'Select a photo')}</b><small>Tap a cell to select it. Drag the image to change the crop.</small></div>${range('Zoom', 'zoom', 100, 300, 1, transform?.zoom || 100)}${range('Rotate', 'rotation', -180, 180, 1, transform?.rotation || 0)}<div class="photos-action-row"><button data-photos-reset-transform>Reset position</button><button data-photos-rotate="-90">↶ 90°</button><button data-photos-rotate="90">↷ 90°</button></div>`;
    if (session.tab === 'adjust') return `${range('Brightness', 'brightness', 40, 180)}${range('Contrast', 'contrast', 40, 180)}${range('Saturation', 'saturation', 0, 200)}${range('Warmth', 'warmth', -50, 50)}<button class="photos-reset" data-photos-reset-adjust>Reset adjustments</button>`;
    if (session.tab === 'filter') return `<div class="photos-option-list" role="group" aria-label="Photo filters">${Object.keys(FILTERS).map(value => `<button data-photos-filter="${value}" class="${session.filter === value ? 'active' : ''}"><i class="photos-filter-icon photos-filter-${value}"></i><span>${value[0].toUpperCase() + value.slice(1)}</span></button>`).join('')}</div>`;
    if (session.tab === 'text') return textControlsMarkup();
    if (session.tab === 'elements') return `<div class="photos-option-list"><button data-photos-add-element="star"><i>✦</i>Star</button><button data-photos-add-element="heart"><i>♥</i>Heart</button><button data-photos-add-element="circle"><i>●</i>Circle</button></div><div class="photos-subheading">Original Zorifi stickers</div><div class="photos-sticker-grid">${(root.ZorifiStickers?.STICKERS || []).slice(0, 18).map(sticker => `<button data-photos-sticker="${esc(sticker.id)}" aria-label="Add ${esc(sticker.name)}"><img src="${esc(root.ZorifiStickers.dataUrl(sticker.id))}" alt=""><span>${esc(sticker.name)}</span></button>`).join('')}</div>${range('Element size', 'overlay-size', 2, 30, 1, session.overlays.find(overlay => overlay.id === session.selectedOverlay)?.size || 5)}<div class="photos-action-row"><label>Shape colour<input type="color" data-photos-overlay-color value="${esc(session.overlays.find(overlay => overlay.id === session.selectedOverlay)?.color || '#e79aff')}"></label><button data-photos-remove-overlay ${session.selectedOverlay ? '' : 'disabled'}>Remove selected</button></div><small class="photos-hint">Drag a shape or sticker on the image to position it.</small>`;
    return `<div class="photos-background-options"><div class="photos-subheading">Canvas background</div><div class="photos-background-presets">${[['solid', 'Colour'], ['aurora', 'Aurora'], ['dusk', 'Dusk'], ['midnight', 'Midnight']].map(([value, label]) => `<button data-photos-background-preset="${value}" class="photos-background-${value} ${session.backgroundPreset === value ? 'active' : ''}">${label}</button>`).join('')}</div><label>Custom colour<input type="color" data-photos-background value="${esc(session.background)}"></label><button data-photos-cutout ${!item || session.busy ? 'disabled' : ''}>Remove plain background</button><button data-photos-reset-cutout ${!transform?.cutout ? 'disabled' : ''}>Restore original photo</button></div><small class="photos-hint">Local cutout works best against an even background. Complex hair and busy scenes may need manual editing.</small>`;
  }
  function editMarkup() {
    return `<section class="photos-studio"><div class="photos-stage"><canvas data-photos-canvas aria-label="${session.mode === 'collage' ? 'Collage' : 'Photo'} preview"></canvas><span class="photos-preview-caption">${session.mode === 'collage' ? 'COLLAGE' : 'PHOTO'} · ${chosenItems().length} ${chosenItems().length === 1 ? 'IMAGE' : 'IMAGES'}</span></div><aside class="photos-controls"><nav class="photos-tool-tabs" aria-label="Photo tools">${toolbar().map(([value, label]) => `<button data-photos-tab="${value}" class="${session.tab === value ? 'active' : ''}" aria-current="${session.tab === value}">${label}</button>`).join('')}</nav><div class="photos-control-content">${controlsMarkup()}</div></aside></section>`;
  }
  function render(element = host, options = callbacks) {
    if (!element) return;
    host = element; callbacks = options || callbacks;
    element.innerHTML = `<main data-view="photos" class="zorifi-photos"><header class="photos-topbar"><button data-photos-back aria-label="${session.stage === 'edit' ? 'Back to photos' : 'Back to Zorifi'}">‹</button><div><small>ZORIFI PHOTOS</small><b>${session.stage === 'edit' ? session.mode === 'collage' ? 'Collage Studio' : 'Photo Editor' : 'Photos'}</b></div><div class="photos-top-spacer"></div>${session.stage === 'edit' ? `<button data-photos-undo ${session.history.length ? '' : 'disabled'} aria-label="Undo">↶</button><button data-photos-redo ${session.future.length ? '' : 'disabled'} aria-label="Redo">↷</button>${session.origin === 'editor' ? '<button data-photos-use-in-editor>Use in edit</button>' : ''}<button class="photos-export" data-photos-export>Export PNG</button>` : ''}</header>${session.stage === 'choose' ? chooseMarkup() : editMarkup()}<p class="photos-message" data-photos-message role="status" ${session.message ? '' : 'hidden'}>${esc(session.message)}</p></main>`;
    const main = element.querySelector('.zorifi-photos');
    main.addEventListener('click', handleClick);
    main.addEventListener('input', handleInput);
    main.addEventListener('change', handleChange);
    main.addEventListener('focusin', beginControlEdit);
    main.addEventListener('pointerdown', beginControlEdit);
    main.addEventListener('focusout', endControlEdit);
    main.querySelector('[data-photos-canvas]')?.addEventListener('pointerdown', pointerDown);
    main.querySelector('[data-photos-canvas]')?.addEventListener('pointermove', pointerMove);
    main.querySelector('[data-photos-canvas]')?.addEventListener('pointerup', pointerUp);
    main.querySelector('[data-photos-canvas]')?.addEventListener('pointercancel', pointerUp);
    redraw();
  }
  async function handleClick(event) {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-photos-back')) { if (session.stage === 'edit') { session.stage = 'choose'; render(); } else { const origin = session.origin, onBack = callbacks.onBack; dispose(); onBack?.(origin); } return; }
    if (button.hasAttribute('data-photos-undo')) return undo();
    if (button.hasAttribute('data-photos-redo')) return redo();
    if (button.hasAttribute('data-photos-export')) return exportPhoto();
    if (button.hasAttribute('data-photos-use-in-editor')) return exportPhoto({ useInEditor: true });
    if (button.dataset.photosMode) { session.mode = button.dataset.photosMode; if (session.mode === 'photo') session.selected = session.selected.slice(0, 1); session.tab = session.mode === 'collage' ? 'layout' : 'edit'; render(); return; }
    if (button.dataset.photosItem) {
      const itemId = button.dataset.photosItem, index = session.selected.indexOf(itemId);
      if (index >= 0) session.selected.splice(index, 1);
      else if (session.mode === 'photo') session.selected = [itemId];
      else if (session.selected.length < LIMIT) session.selected.push(itemId);
      else return show('A collage can use up to nine photos.');
      render(); return;
    }
    if (button.dataset.photosRemove) { session.selected = session.selected.filter(itemId => itemId !== button.dataset.photosRemove); render(); return; }
    if (button.hasAttribute('data-photos-create')) {
      const items = chosenItems();
      if (items.length < (session.mode === 'collage' ? 2 : 1)) return show('Choose more photos first.');
      if (session.busy) return;
      session.busy = true; show('Preparing your photos…');
      try { await Promise.all(items.map(prepareItem)); session.stage = 'edit'; session.activeId = session.selected[0]; session.ratio = 'original'; session.message = ''; render(); }
      catch (error) { show(error.message || 'The selected photo could not be opened.'); }
      finally { session.busy = false; }
      return;
    }
    if (button.dataset.photosTab) { session.tab = button.dataset.photosTab; render(); return; }
    if (button.dataset.photosTextTab) { session.textTab = button.dataset.photosTextTab; render(); return; }
    if (button.dataset.photosLayout) { remember(); session.layout = button.dataset.photosLayout; render(); return; }
    if (button.dataset.photosRatio) { remember(); session.ratio = button.dataset.photosRatio; render(); return; }
    if (button.dataset.photosFilter) { remember(); session.filter = button.dataset.photosFilter; render(); return; }
    if (button.hasAttribute('data-photos-reset-transform')) { remember(); session.transforms[session.activeId] = { ...transformFor(session.activeId), zoom: 100, x: 0, y: 0, rotation: 0 }; render(); return; }
    if (button.dataset.photosRotate) { remember(); const transform = transformFor(session.activeId); transform.rotation = ((transform.rotation + Number(button.dataset.photosRotate) + 540) % 360) - 180; render(); return; }
    if (button.hasAttribute('data-photos-reset-adjust')) { remember(); Object.assign(session, { brightness: 100, contrast: 100, saturation: 100, warmth: 0 }); render(); return; }
    if (button.hasAttribute('data-photos-new-text')) { session.selectedOverlay = ''; render(); host.querySelector('[data-photos-text-input]')?.focus(); return; }
    if (button.hasAttribute('data-photos-add-text')) { const field = host.querySelector('[data-photos-text-input]'), text = field?.value.trim(); if (!text) return show('Type some text first.'); remember(); const overlay = { id: id(), kind: 'text', text, ...overlayPosition(session.overlays.length), size: 6, color: '#ffffff', font: 'modern', effect: 'shadow', bubble: 'none' }; session.overlays.push(overlay); session.selectedOverlay = overlay.id; render(); return; }
    if (button.dataset.photosFont || button.dataset.photosTextEffect || button.dataset.photosBubble) { const overlay = session.overlays.find(entry => entry.id === session.selectedOverlay && entry.kind === 'text'); if (!overlay) return show('Add or select text first.'); remember(); if (button.dataset.photosFont) overlay.font = button.dataset.photosFont; if (button.dataset.photosTextEffect) overlay.effect = button.dataset.photosTextEffect; if (button.dataset.photosBubble) overlay.bubble = button.dataset.photosBubble; render(); return; }
    if (button.dataset.photosTextTemplate) {
      const presets = { headline: { font: 'display', effect: 'shadow', bubble: 'none', color: '#ffffff', size: 9 }, editorial: { font: 'editorial', effect: 'clean', bubble: 'none', color: '#ffe8ce', size: 8 }, neon: { font: 'modern', effect: 'glow', bubble: 'none', color: '#e38dff', size: 8 }, caption: { font: 'mono', effect: 'clean', bubble: 'dark', color: '#ffffff', size: 5 } };
      remember(); let overlay = session.overlays.find(entry => entry.id === session.selectedOverlay && entry.kind === 'text');
      if (!overlay) { overlay = { id: id(), kind: 'text', text: 'Your story', ...overlayPosition(session.overlays.length), size: 6, color: '#ffffff' }; session.overlays.push(overlay); session.selectedOverlay = overlay.id; }
      Object.assign(overlay, presets[button.dataset.photosTextTemplate]); render(); return;
    }
    if (button.dataset.photosAddElement) { remember(); const overlay = { id: id(), kind: button.dataset.photosAddElement, ...overlayPosition(session.overlays.length), size: 5, color: '#e79aff' }; session.overlays.push(overlay); session.selectedOverlay = overlay.id; render(); return; }
    if (button.dataset.photosSticker) { remember(); const overlay = { id: id(), kind: 'sticker', stickerId: button.dataset.photosSticker, ...overlayPosition(session.overlays.length), size: 12, color: '#ffffff' }; session.overlays.push(overlay); session.selectedOverlay = overlay.id; stickerImage(overlay.stickerId); render(); return; }
    if (button.hasAttribute('data-photos-remove-overlay')) { remember(); session.overlays = session.overlays.filter(overlay => overlay.id !== session.selectedOverlay); session.selectedOverlay = ''; render(); return; }
    if (button.dataset.photosBackgroundPreset) { remember(); session.backgroundPreset = button.dataset.photosBackgroundPreset; render(); return; }
    if (button.hasAttribute('data-photos-cutout')) return cutout();
    if (button.hasAttribute('data-photos-reset-cutout')) { remember(); transformFor(session.activeId).cutout = false; render(); }
  }
  function handleInput(event) {
    const input = event.target;
    if (input.dataset.photosRange) {
      const key = input.dataset.photosRange, value = Number(input.value);
      if (key === 'zoom' || key === 'rotation') transformFor(session.activeId)[key] = value;
      else if (key === 'overlay-size') { const overlay = session.overlays.find(entry => entry.id === session.selectedOverlay); if (overlay) overlay.size = value; }
      else session[key] = value;
      input.closest('label')?.querySelector('output')?.replaceChildren(String(Math.round(value)));
      redraw();
    } else if (input.hasAttribute('data-photos-background')) { session.background = input.value; session.backgroundPreset = 'solid'; redraw(); }
    else if (input.hasAttribute('data-photos-overlay-color')) { const overlay = session.overlays.find(entry => entry.id === session.selectedOverlay); if (overlay) { overlay.color = input.value; redraw(); } }
    else if (input.hasAttribute('data-photos-text-input')) { const overlay = session.overlays.find(entry => entry.id === session.selectedOverlay && entry.kind === 'text'); if (overlay) { overlay.text = input.value; redraw(); } }
  }
  function beginControlEdit(event) {
    const control = event.target.closest?.('[data-photos-range],[data-photos-background],[data-photos-overlay-color],[data-photos-text-input]');
    if (!control || activeControlEdit === control) return;
    activeControlEdit = control; remember();
  }
  function endControlEdit(event) { if (event.target === activeControlEdit) activeControlEdit = null; }
  function handleChange(event) {
    const input = event.target;
    if (input.hasAttribute('data-photos-input')) { const files = [...input.files]; input.value = ''; addFiles(files); }
  }
  function canvasPoint(event) {
    const canvas = event.currentTarget, rect = canvas.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  }
  function pointerDown(event) {
    const point = canvasPoint(event), items = chosenItems(), cells = layoutCells(items.length || 1, session.mode === 'photo' ? 'grid' : session.layout);
    const overlay = [...session.overlays].reverse().find(entry => Math.hypot(point.x - entry.x / 100, point.y - entry.y / 100) < .12);
    if (overlay) { session.selectedOverlay = overlay.id; drag = { type: 'overlay', id: overlay.id, point, x: overlay.x, y: overlay.y }; }
    else { const index = cells.findIndex(cell => point.x >= cell.x && point.x <= cell.x + cell.w && point.y >= cell.y && point.y <= cell.y + cell.h); const item = items[index]; if (!item) return; session.activeId = item.id; const t = transformFor(item.id); drag = { type: 'image', id: item.id, point, x: t.x, y: t.y, cell: cells[index] }; }
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event) {
    if (!drag) return;
    const point = canvasPoint(event), dx = point.x - drag.point.x, dy = point.y - drag.point.y;
    if (!drag.remembered && Math.hypot(dx, dy) > .001) { remember(); drag.remembered = true; }
    if (drag.type === 'overlay') { const overlay = session.overlays.find(entry => entry.id === drag.id); if (overlay) { overlay.x = clamp(drag.x + dx * 100, 0, 100); overlay.y = clamp(drag.y + dy * 100, 0, 100); } }
    else { const t = transformFor(drag.id); t.x = clamp(drag.x + dx / drag.cell.w * 200, -100, 100); t.y = clamp(drag.y + dy / drag.cell.h * 200, -100, 100); }
    redraw();
  }
  function pointerUp() { if (!drag) return; drag = null; if (session.stage === 'edit') { const selected = host?.querySelector('.photos-target b'); if (selected) selected.textContent = activeItem()?.name || ''; } }

  return { RATIOS, FILTERS, LAYOUTS, layoutCells, start, render, addFiles, paint, exportBlob, dispose, get origin() { return session.origin; }, get state() { return session; } };
});
