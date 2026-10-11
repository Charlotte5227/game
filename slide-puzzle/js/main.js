(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= settings ================= */
  const settings = { n: 4, showNum: true, randomHole: false, showTimer: true, showMoves: true };
  try {
    const s = JSON.parse(store.get('slide-settings') || 'null');
    if (s) {
      if (Number.isInteger(s.n) && s.n >= 2) settings.n = s.n;
      settings.showNum = !!s.showNum;
      settings.randomHole = !!s.randomHole;
      if (typeof s.showTimer === 'boolean') settings.showTimer = s.showTimer;
      if (typeof s.showMoves === 'boolean') settings.showMoves = s.showMoves;
    }
  } catch (e) {}

  // picture: { img, url, name, crop:{sx,sy,size}, square, canvas }
  let picture = null;

  /* ================= colors ================= */
  let theme = {};
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    theme = {
      tray: cs.getPropertyValue('--tray').trim() || '#D3D9E5',
      stage: cs.getPropertyValue('--stage').trim() || '#E2E6EE'
    };
  }
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return [128, 128, 128];
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = k0 => { const k = (k0 + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }
  // Rainbow: hue runs top→bottom (red to violet); each row is one hue,
  // stepping from light on the left to dark on the right.
  function rainbowHSL(t, n) {
    const r = Math.floor(t / n), c = t % n;
    const u = n > 1 ? c / (n - 1) : 0, v = n > 1 ? r / (n - 1) : 0;
    return [v * 285, 80, 78 - u * 42];
  }

  /* ================= tile drawing ================= */
  function drawTile(ctx, t, x, y, s, n, img, showNum) {
    const g = s >= 24 ? Math.max(0.75, s * 0.025) : (s >= 8 ? 0.5 : 0);
    const rad = s >= 20 ? s * 0.09 : 0;
    const dx = x + g, dy = y + g, dw = s - 2 * g;
    ctx.beginPath();
    if (rad && ctx.roundRect) ctx.roundRect(dx, dy, dw, dw, rad); else ctx.rect(dx, dy, dw, dw);
    let light = false;
    if (img) {
      const ss = img.width / n;
      const r = Math.floor(t / n), c = t % n;
      ctx.save();
      ctx.clip();
      ctx.drawImage(img, c * ss, r * ss, ss, ss, x, y, s, s);
      ctx.restore();
    } else {
      const [h, sa, l] = rainbowHSL(t, n);
      ctx.fillStyle = `hsl(${h} ${sa}% ${l}%)`;
      ctx.fill();
      const [R, G, B] = hslToRgb(h, sa, l);
      light = (0.299 * R + 0.587 * G + 0.114 * B) / 255 > 0.62;
    }
    if (showNum && s >= 14) {
      const label = String(t + 1);
      let fs = Math.min(s * 0.4, 72);
      fs = Math.min(fs, (s * 0.82) / (label.length * 0.62));
      ctx.font = `700 ${fs}px "Chivo Mono", ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cx = x + s / 2, cy = y + s / 2 + fs * 0.04;
      if (img) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, fs * 0.22);
        ctx.strokeStyle = 'rgba(0,0,0,.65)';
        ctx.strokeText(label, cx, cy);
        ctx.fillStyle = '#FFFFFF';
      } else {
        ctx.fillStyle = light ? 'rgba(20,23,34,.86)' : '#FFFFFF';
      }
      ctx.fillText(label, cx, cy);
    }
  }

  /* ================= start screen ================= */
  const sizeInput = $('sizeInput'), sizeNote = $('sizeNote');
  const optNum = $('optNum'), optHole = $('optHole');
  sizeInput.value = settings.n;
  optNum.checked = settings.showNum;
  optHole.checked = settings.randomHole;

  function readSize() {
    const raw = sizeInput.value.trim();
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= 2 ? n : null;
  }
  function updateSizeNote() {
    const n = readSize();
    if (n === null) {
      sizeInput.setAttribute('aria-invalid', 'true');
      sizeNote.textContent = '幅は2以上の整数で入力してください。';
      sizeNote.className = 'note warn';
      return;
    }
    sizeInput.removeAttribute('aria-invalid');
    settings.n = n;
    let txt = `${n.toLocaleString('ja-JP')} × ${n.toLocaleString('ja-JP')}（動かすマスは${(n * n - 1).toLocaleString('ja-JP')}枚）`;
    let warn = false;
    if (n >= 2000) { txt += ' とても大きな盤面です。端末によっては開始できないことがあります。'; warn = true; }
    else if (n >= 100) { txt += ' 大きな盤面は動作が重くなることがあります。'; }
    sizeNote.textContent = txt;
    sizeNote.className = warn ? 'note warn' : 'note';
  }
  sizeInput.addEventListener('input', updateSizeNote);
  $('sizeDec').addEventListener('click', () => { sizeInput.value = Math.max(2, (readSize() || settings.n) - 1); updateSizeNote(); });
  $('sizeInc').addEventListener('click', () => { sizeInput.value = (readSize() || settings.n) + 1; updateSizeNote(); });
  optNum.addEventListener('change', () => { settings.showNum = optNum.checked; });
  optHole.addEventListener('change', () => { settings.randomHole = optHole.checked; });

  const optTimer = $('optTimer'), optMoves = $('optMoves');
  optTimer.checked = settings.showTimer;
  optMoves.checked = settings.showMoves;
  const scoring = () => settings.showTimer && settings.showMoves;
  function updateScoreWarn() { $('scoreWarn').hidden = scoring(); }
  optTimer.addEventListener('change', () => { settings.showTimer = optTimer.checked; updateScoreWarn(); });
  optMoves.addEventListener('change', () => { settings.showMoves = optMoves.checked; updateScoreWarn(); });
  updateScoreWarn();

  // image import
  const fileInput = $('fileInput');
  $('importBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (w === h) {
        setPicture({ img, url, name: f.name, square: true, crop: { sx: 0, sy: 0, size: w } });
      } else {
        openCrop({ img, url, name: f.name, square: false }, null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const note = $('imgNote');
      note.textContent = 'この画像は読み込めませんでした。JPEG・PNG・WebP などの画像を選んでください。';
      note.className = 'note warn imgName';
    };
    img.src = url;
  });
  $('clearImg').addEventListener('click', () => {
    if (picture) URL.revokeObjectURL(picture.url);
    picture = null;
    updateImgUI();
  });
  $('recropBtn').addEventListener('click', () => { if (picture) openCrop(picture, picture.crop); });

  function setPicture(p) {
    const { img, crop } = p;
    const out = Math.max(1, Math.min(2048, Math.round(crop.size)));
    const c = document.createElement('canvas');
    c.width = c.height = out;
    const cx = c.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, crop.sx, crop.sy, crop.size, crop.size, 0, 0, out, out);
    if (picture && picture.url !== p.url) URL.revokeObjectURL(picture.url);
    picture = { ...p, canvas: c };
    updateImgUI();
  }
  function updateImgUI() {
    const note = $('imgNote');
    note.className = 'note imgName';
    note.textContent = picture ? `画像：${picture.name}` : '虹のグラデーション（標準）';
    $('clearImg').disabled = !picture;
    $('recropBtn').hidden = !picture || picture.square;
  }

  $('setup').addEventListener('submit', e => {
    e.preventDefault();
    const n = readSize();
    if (n === null) { updateSizeNote(); sizeInput.focus(); return; }
    settings.n = n;
    store.set('slide-settings', JSON.stringify(settings));
    startGame();
  });

  /* ================= crop ================= */
  const cropCanvas = $('cropCanvas'), cctx = cropCanvas.getContext('2d');
  const crop = { p: null, W: 0, F: 0, m: 0, s: 1, minS: 1, maxS: 5, ix: 0, iy: 0 };
  function openCrop(p, prev) {
    crop.p = p;
    $('cropModal').hidden = false;
    const W = $('cropBox').getBoundingClientRect().width;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cropCanvas.width = cropCanvas.height = Math.round(W * dpr);
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    crop.W = W; crop.F = W * 0.84; crop.m = (W - crop.F) / 2;
    const iw = p.img.naturalWidth, ih = p.img.naturalHeight;
    crop.minS = crop.F / Math.min(iw, ih);
    crop.maxS = crop.minS * 6;
    if (prev) {
      crop.s = clamp(crop.F / prev.size, crop.minS, crop.maxS);
      crop.ix = crop.m - prev.sx * crop.s;
      crop.iy = crop.m - prev.sy * crop.s;
    } else {
      crop.s = crop.minS;
      crop.ix = (W - iw * crop.s) / 2;
      crop.iy = (W - ih * crop.s) / 2;
    }
    clampCrop(); syncCropSlider(); drawCrop();
    $('cropOk').focus();
  }
  function clampCrop() {
    const iw = crop.p.img.naturalWidth * crop.s, ih = crop.p.img.naturalHeight * crop.s;
    crop.ix = clamp(crop.ix, crop.m + crop.F - iw, crop.m);
    crop.iy = clamp(crop.iy, crop.m + crop.F - ih, crop.m);
  }
  function drawCrop() {
    const { W, F, m } = crop;
    const img = crop.p.img;
    cctx.clearRect(0, 0, W, W);
    cctx.fillStyle = theme.stage;
    cctx.fillRect(0, 0, W, W);
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(img, crop.ix, crop.iy, img.naturalWidth * crop.s, img.naturalHeight * crop.s);
    cctx.beginPath();
    cctx.rect(0, 0, W, W);
    cctx.rect(m, m, F, F);
    cctx.fillStyle = 'rgba(0,0,0,.55)';
    cctx.fill('evenodd');
    const n = settings.n;
    if (n <= 16) {
      cctx.strokeStyle = 'rgba(255,255,255,.35)';
      cctx.lineWidth = 1;
      cctx.beginPath();
      for (let i = 1; i < n; i++) {
        const o = m + (F * i) / n;
        cctx.moveTo(o, m); cctx.lineTo(o, m + F);
        cctx.moveTo(m, o); cctx.lineTo(m + F, o);
      }
      cctx.stroke();
    }
    cctx.strokeStyle = '#FFFFFF';
    cctx.lineWidth = 2;
    cctx.strokeRect(m, m, F, F);
  }
  function cropZoomAt(ns, px, py) {
    ns = clamp(ns, crop.minS, crop.maxS);
    const bx = (px - crop.ix) / crop.s, by = (py - crop.iy) / crop.s;
    crop.s = ns; crop.ix = px - bx * ns; crop.iy = py - by * ns;
    clampCrop(); syncCropSlider(); drawCrop();
  }
  function syncCropSlider() {
    $('cropZoom').value = Math.round(Math.log(crop.s / crop.minS) / Math.log(crop.maxS / crop.minS) * 1000);
  }
  $('cropZoom').addEventListener('input', e => {
    const v = Number(e.target.value) / 1000;
    const c = crop.W / 2;
    cropZoomAt(crop.minS * Math.pow(crop.maxS / crop.minS, v), c, c);
  });
  $('cropCancel').addEventListener('click', () => {
    if (!picture || picture.url !== crop.p.url) URL.revokeObjectURL(crop.p.url);
    $('cropModal').hidden = true;
  });
  $('cropOk').addEventListener('click', () => {
    const size = crop.F / crop.s;
    const sx = (crop.m - crop.ix) / crop.s, sy = (crop.m - crop.iy) / crop.s;
    setPicture({ img: crop.p.img, url: crop.p.url, name: crop.p.name, square: false, crop: { sx, sy, size } });
    $('cropModal').hidden = true;
  });
  attachGestures(cropCanvas, {
    getPan: () => ({ x: crop.ix, y: crop.iy }),
    setPan: (x, y) => { crop.ix = x; crop.iy = y; clampCrop(); drawCrop(); },
    getScale: () => crop.s,
    zoomAt: cropZoomAt,
    pinch: (g, scale, mx, my) => {
      const ns = clamp(g.scale * scale, crop.minS, crop.maxS);
      const bx = (g.mx - g.px) / g.scale, by = (g.my - g.py) / g.scale;
      crop.s = ns; crop.ix = mx - bx * ns; crop.iy = my - by * ns;
      clampCrop(); syncCropSlider(); drawCrop();
    },
    tap: null
  });

  /* ================= gestures (shared) ================= */
  function attachGestures(el, h) {
    const pts = new Map();
    let g = null;
    const at = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const pinchStart = () => {
      const [a, b] = [...pts.values()];
      const pan = h.getPan();
      return { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, scale: h.getScale(), px: pan.x, py: pan.y };
    };
    const panStart = p => { const pan = h.getPan(); return { type: 'pan', sx: p.x, sy: p.y, px: pan.x, py: pan.y }; };
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      const p = at(e);
      pts.set(e.pointerId, p);
      if (pts.size === 1) { g = panStart(p); g.type = 'tap'; }
      else if (pts.size === 2) g = pinchStart();
    });
    el.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const p = at(e);
      pts.set(e.pointerId, p);
      if (!g) return;
      if (g.type === 'tap' && Math.hypot(p.x - g.sx, p.y - g.sy) > 8) g.type = 'pan';
      if (g.type === 'pan' && pts.size === 1) {
        h.setPan(g.px + (p.x - g.sx), g.py + (p.y - g.sy));
      } else if (g.type === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        h.pinch(g, d / g.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return;
      const p = at(e);
      const wasTap = g && g.type === 'tap' && pts.size === 1 && e.type === 'pointerup';
      pts.delete(e.pointerId);
      if (wasTap && h.tap) h.tap(p.x, p.y);
      if (pts.size === 1) g = panStart([...pts.values()][0]);
      else if (pts.size === 0) g = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= 400;
      const f = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015));
      const p = at(e);
      h.zoomAt(h.getScale() * f, p.x, p.y);
    }, { passive: false });
  }
  document.addEventListener('gesturestart', e => e.preventDefault());

  /* ================= game ================= */
  const game = { n: 0, tiles: null, holeId: 0, holePos: 0, moves: 0, t0: 0, elapsed: 0, running: false, solved: false, wrong: 0, anim: null, img: null, showNum: true };
  const cam = { cell: 40, ox: 0, oy: 0, fit: 0, min: 1, max: 100, w: 0, h: 0, dpr: 1 };
  const ZOOM_NEED = 40;   // below this fitted cell size (CSS px) the zoom bar appears
  const PIXEL_MODE = 5;   // below this cell size the board is drawn one pixel per tile
  const board = $('board'), bctx = board.getContext('2d');
  const stage = $('stage');
  let pixel = null, avg = null;
  let timerId = 0;

  function shuffle(n, holeId) {
    const N2 = n * n;
    const a = new Int32Array(N2);
    let wrong = 0;
    do {
      for (let i = 0; i < N2; i++) a[i] = i;
      for (let i = N2 - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      // permutation parity via cycle count
      const seen = new Uint8Array(N2);
      let cycles = 0, holePos = 0;
      for (let i = 0; i < N2; i++) {
        if (a[i] === holeId) holePos = i;
        if (seen[i]) continue;
        cycles++;
        let j = i;
        while (!seen[j]) { seen[j] = 1; j = a[j]; }
      }
      const permParity = (N2 - cycles) & 1;
      const dist = Math.abs(Math.floor(holePos / n) - Math.floor(holeId / n)) + Math.abs((holePos % n) - (holeId % n));
      if (permParity !== (dist & 1)) {
        // swap two non-hole tiles to make it solvable
        let p1 = -1, p2 = -1;
        for (let i = 0; i < N2 && p2 < 0; i++) {
          if (a[i] === holeId) continue;
          if (p1 < 0) p1 = i; else p2 = i;
        }
        const t = a[p1]; a[p1] = a[p2]; a[p2] = t;
      }
      wrong = 0;
      for (let i = 0; i < N2; i++) if (a[i] !== i) wrong++;
    } while (wrong === 0);
    return a;
  }

  function startGame() {
    const n = settings.n, N2 = n * n;
    if (N2 > 2 ** 27) { sizeError(); return; }
    const holeId = settings.randomHole ? Math.floor(Math.random() * N2) : N2 - 1;
    let tiles;
    try { tiles = shuffle(n, holeId); } catch (e) { sizeError(); return; }
    stopTimer();
    Object.assign(game, {
      n, tiles, holeId, holePos: tiles.indexOf(holeId), moves: 0, t0: 0, elapsed: 0,
      running: false, solved: false, anim: null, img: picture ? picture.canvas : null, showNum: settings.showNum
    });
    let wrong = 0;
    for (let i = 0; i < N2; i++) if (tiles[i] !== i) wrong++;
    game.wrong = wrong;
    pixel = null; avg = null;
    $('timer').textContent = fmt(0);
    $('moves').textContent = '0';
    setResultView(false);
    game.result = null; game.shareBlob = null;
    $('hint').hidden = !settings.showTimer;
    $('statTime').hidden = !settings.showTimer;
    $('statMoves').hidden = !settings.showMoves;
    game.scoring = scoring();
    $('clearModal').hidden = true;
    showScreen('game');
    cam.fit = 0;
    layout(false);
    board.focus({ preventScroll: true });
  }
  function sizeError() {
    sizeNote.textContent = 'この幅は大きすぎて、この端末では盤面を用意できませんでした。幅を小さくしてください。';
    sizeNote.className = 'note warn';
  }

  function showScreen(which) {
    $('start').hidden = which !== 'start';
    $('game').hidden = which !== 'game';
    document.body.classList.toggle('playing', which === 'game');
    if (which === 'start') { setResultView(false); window.scrollTo(0, 0); }
  }

  function layout(keep) {
    if ($('game').hidden) return;
    const r = stage.getBoundingClientRect();
    const w = r.width, h = r.height;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const center = keep && cam.fit ? { x: (cam.w / 2 - cam.ox) / cam.cell, y: (cam.h / 2 - cam.oy) / cam.cell, z: cam.cell / cam.fit } : null;
    board.width = Math.round(w * dpr);
    board.height = Math.round(h * dpr);
    cam.w = w; cam.h = h; cam.dpr = dpr;
    const n = game.n;
    cam.fit = Math.max(1e-4, (Math.min(w, h) - 16) / n);
    cam.min = cam.fit;
    cam.max = cam.fit < ZOOM_NEED ? Math.max(72, cam.fit) : cam.fit * 2.5;
    $('zoomBar').hidden = !(cam.fit < ZOOM_NEED);
    if (center) {
      cam.cell = clamp(cam.fit * center.z, cam.min, cam.max);
      cam.ox = w / 2 - center.x * cam.cell;
      cam.oy = h / 2 - center.y * cam.cell;
    } else {
      cam.cell = cam.fit;
    }
    clampCam();
    $('hint').classList.toggle('off', cam.oy < 44);
    updateZoomUI();
    draw();
  }
  function clampCam() {
    const B = game.n * cam.cell, pad = 8;
    cam.ox = B <= cam.w - 2 * pad ? (cam.w - B) / 2 : clamp(cam.ox, cam.w - B - pad, pad);
    cam.oy = B <= cam.h - 2 * pad ? (cam.h - B) / 2 : clamp(cam.oy, cam.h - B - pad, pad);
  }
  function zoomAt(nc, px, py) {
    nc = clamp(nc, cam.min, cam.max);
    const bx = (px - cam.ox) / cam.cell, by = (py - cam.oy) / cam.cell;
    cam.cell = nc; cam.ox = px - bx * nc; cam.oy = py - by * nc;
    clampCam(); updateZoomUI(); requestDraw();
  }
  function updateZoomUI() {
    const span = Math.log(cam.max / cam.min);
    $('zoomRange').value = span > 0 ? Math.round(Math.log(cam.cell / cam.min) / span * 1000) : 0;
    $('zoomPct').textContent = Math.round(cam.cell / cam.fit * 100) + '%';
  }
  $('zoomRange').addEventListener('input', e => {
    const v = Number(e.target.value) / 1000;
    zoomAt(cam.min * Math.pow(cam.max / cam.min, v), cam.w / 2, cam.h / 2);
  });
  $('zoomIn').addEventListener('click', () => zoomAt(cam.cell * 1.3, cam.w / 2, cam.h / 2));
  $('zoomOut').addEventListener('click', () => zoomAt(cam.cell / 1.3, cam.w / 2, cam.h / 2));

  attachGestures(board, {
    getPan: () => ({ x: cam.ox, y: cam.oy }),
    setPan: (x, y) => { cam.ox = x; cam.oy = y; clampCam(); requestDraw(); },
    getScale: () => cam.cell,
    zoomAt,
    pinch: (g, scale, mx, my) => {
      const nc = clamp(g.scale * scale, cam.min, cam.max);
      const bx = (g.mx - g.px) / g.scale, by = (g.my - g.py) / g.scale;
      cam.cell = nc; cam.ox = mx - bx * nc; cam.oy = my - by * nc;
      clampCam(); updateZoomUI(); requestDraw();
    },
    tap: (x, y) => {
      if (game.solved) return;
      const c = Math.floor((x - cam.ox) / cam.cell), r = Math.floor((y - cam.oy) / cam.cell);
      if (r < 0 || c < 0 || r >= game.n || c >= game.n) return;
      tryMove(r * game.n + c);
    }
  });

  document.addEventListener('keydown', e => {
    if ($('game').hidden || game.solved || !$('clearModal').hidden) return;
    const n = game.n, h = game.holePos, hr = Math.floor(h / n), hc = h % n;
    let p = -1;
    if (e.key === 'ArrowUp' && hr < n - 1) p = h + n;
    else if (e.key === 'ArrowDown' && hr > 0) p = h - n;
    else if (e.key === 'ArrowLeft' && hc < n - 1) p = h + 1;
    else if (e.key === 'ArrowRight' && hc > 0) p = h - 1;
    else return;
    e.preventDefault();
    tryMove(p);
  });

  function colorOf(t) {
    if (avg) return [avg[t * 4], avg[t * 4 + 1], avg[t * 4 + 2]];
    const [h, s, l] = rainbowHSL(t, game.n);
    return hslToRgb(h, s, l);
  }
  function ensurePixel() {
    if (pixel) return pixel;
    const n = game.n;
    if (n > 8192) return null;
    try {
      if (game.img && !avg) {
        const t = document.createElement('canvas');
        t.width = t.height = n;
        const tx = t.getContext('2d');
        tx.imageSmoothingQuality = 'high';
        tx.drawImage(game.img, 0, 0, n, n);
        avg = tx.getImageData(0, 0, n, n).data;
      }
      const c = document.createElement('canvas');
      c.width = c.height = n;
      const x = c.getContext('2d');
      const id = x.createImageData(n, n), d = id.data;
      const hole = hexToRgb(theme.tray);
      for (let pos = 0, N2 = n * n; pos < N2; pos++) {
        const t = game.tiles[pos];
        const rgb = (t === game.holeId && !game.solved) ? hole : colorOf(t);
        d[pos * 4] = rgb[0]; d[pos * 4 + 1] = rgb[1]; d[pos * 4 + 2] = rgb[2]; d[pos * 4 + 3] = 255;
      }
      x.putImageData(id, 0, 0);
      pixel = { c, x };
      return pixel;
    } catch (e) { return null; }
  }
  function setPixel(pos, rgb) {
    if (!pixel) return;
    pixel.x.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    pixel.x.fillRect(pos % game.n, Math.floor(pos / game.n), 1, 1);
  }

  function tryMove(pos) {
    const n = game.n, h = game.holePos;
    const pr = Math.floor(pos / n), pc = pos % n, hr = Math.floor(h / n), hc = h % n;
    if (Math.abs(pr - hr) + Math.abs(pc - hc) !== 1) return false;
    const T = game.tiles, t = T[pos];
    const before = (T[pos] !== pos) + (T[h] !== h);
    T[h] = t; T[pos] = game.holeId;
    const after = (T[pos] !== pos) + (T[h] !== h);
    game.wrong += after - before;
    game.holePos = pos;
    game.moves++;
    if (game.moves === 1) { startTimer(); $('hint').hidden = true; }
    $('moves').textContent = game.moves.toLocaleString('ja-JP');
    game.anim = { tile: t, from: pos, to: h, t0: performance.now(), dur: reduceMotion ? 0 : 110 };
    if (pixel) { setPixel(h, colorOf(t)); setPixel(pos, hexToRgb(theme.tray)); }
    if (game.wrong === 0) finish();
    requestDraw();
    return true;
  }

  function finish() {
    stopTimer();
    game.solved = true;
    if (pixel) setPixel(game.holePos, colorOf(game.holeId));
    setTimeout(showClear, reduceMotion ? 150 : 550);
  }

  /* ---------- timer ---------- */
  const pad2 = v => String(v).padStart(2, '0');
  function fmt(sec) {
    const t = Math.floor(sec * 10);
    const ds = t % 10, s = Math.floor(t / 10) % 60, m = Math.floor(t / 600) % 60, h = Math.floor(t / 36000);
    return (h ? h + ':' + pad2(m) : pad2(m)) + ':' + pad2(s) + '.' + ds;
  }
  function tick() {
    game.elapsed = (performance.now() - game.t0) / 1000;
    $('timer').textContent = fmt(game.elapsed);
  }
  function startTimer() { game.t0 = performance.now(); game.running = true; clearInterval(timerId); timerId = setInterval(tick, 100); }
  function stopTimer() { if (game.running) tick(); game.running = false; clearInterval(timerId); }

  /* ---------- score ---------- */
  // Par moves and time grow with the board (≈ n³). Each rating is 1.00 at par,
  // approaches 2.00 when far quicker, and falls toward 0 when slower.
  function score(n, moves, secs) {
    const parMoves = 2.5 * n ** 3;
    const parTime = Math.max(parMoves * 0.6, 10);
    const base = 1000 * (n * n - 1);
    const mf = 2 / (1 + moves / parMoves);
    const tf = 2 / (1 + secs / parTime);
    return { points: Math.round(base * (mf + tf) / 2), base, mf, tf };
  }

  function showClear() {
    if (!game.solved || $('game').hidden) return;
    const n = game.n;
    $('clearSize').textContent = `${n.toLocaleString('ja-JP')} × ${n.toLocaleString('ja-JP')}`;
    $('rTime').textContent = fmt(game.elapsed);
    $('rMoves').textContent = game.moves.toLocaleString('ja-JP');
    $('resTime').hidden = !settings.showTimer;
    $('resMoves').hidden = !settings.showMoves;
    $('results').hidden = !settings.showTimer && !settings.showMoves;
    $('pointsBlock').hidden = !game.scoring;
    $('rFormula').hidden = !game.scoring;
    $('noPoints').hidden = game.scoring;
    game.result = { n, time: game.elapsed, moves: game.moves, scoring: game.scoring, showTimer: settings.showTimer, showMoves: settings.showMoves, points: 0 };
    if (!game.scoring) { finishResult(); return; }
    const sc = score(n, game.moves, game.elapsed);
    game.result.points = sc.points;
    $('rPoints').textContent = sc.points.toLocaleString('ja-JP');
    $('rFormula').textContent = `基礎点 ${sc.base.toLocaleString('ja-JP')}（盤の大きさ）×（手数評価 ${sc.mf.toFixed(2)} ＋ 時間評価 ${sc.tf.toFixed(2)}）÷ 2`;
    const key = 'slide-best-' + n;
    const prev = Number(store.get(key) || 0);
    const best = $('rBest');
    if (sc.points > prev) {
      store.set(key, String(sc.points));
      best.textContent = prev ? `自己ベスト更新（前回 ${prev.toLocaleString('ja-JP')}）` : 'この幅での初クリア';
      best.className = 'best new';
    } else {
      best.textContent = `この幅の自己ベスト ${prev.toLocaleString('ja-JP')}`;
      best.className = 'best';
    }
    finishResult();
  }

  function finishResult() {
    const r = game.result;
    $('dLabel').textContent = r.scoring ? 'ポイント' : '完成';
    $('dPoints').textContent = r.scoring ? r.points.toLocaleString('ja-JP') : '完成！';
    $('dLabel').hidden = !r.scoring;
    const sub = [];
    if (r.showTimer) sub.push('時間 ' + fmt(r.time));
    if (r.showMoves) sub.push('手数 ' + r.moves.toLocaleString('ja-JP'));
    $('dSub').textContent = sub.join(' ・ ');
    $('dSub').hidden = !sub.length;
    $('clearModal').hidden = false;
    $('again').focus();
    game.shareBlob = null;
    buildShareImage().then(c => new Promise(res => c.toBlob(res, 'image/png'))).then(b => { if (game.result === r) game.shareBlob = b; }).catch(() => {});
  }

  // Result view: shown after closing the clear dialog with ✕.
  function setResultView(on) {
    $('hud').hidden = on;
    $('doneTop').hidden = !on;
    $('doneBar').hidden = !on;
    if (on) $('hint').hidden = true;
  }
  $('clearClose').addEventListener('click', () => {
    $('clearModal').hidden = true;
    setResultView(true);
    $('doneAgain').focus();
  });
  $('doneStart').addEventListener('click', () => showScreen('start'));
  $('doneAgain').addEventListener('click', () => startGame());

  /* ---------- share image ---------- */
  function drawSolved(x, bx, by, B) {
    const n = game.n, s = B / n;
    if (s >= 2.5 && n <= 400) {
      for (let t = 0, N2 = n * n; t < N2; t++) {
        drawTile(x, t, bx + (t % n) * s, by + Math.floor(t / n) * s, s, n, game.img, game.showNum);
      }
    } else if (game.img) {
      x.imageSmoothingQuality = 'high';
      x.drawImage(game.img, bx, by, B, B);
    } else {
      const k = Math.min(n, 512), c = document.createElement('canvas');
      c.width = c.height = k;
      const cx = c.getContext('2d');
      for (let t = 0; t < k * k; t++) {
        const [h, sa, l] = rainbowHSL(t, k);
        cx.fillStyle = `hsl(${h} ${sa}% ${l}%)`;
        cx.fillRect(t % k, Math.floor(t / k), 1, 1);
      }
      x.imageSmoothingEnabled = true;
      x.drawImage(c, bx, by, B, B);
    }
  }
  function fitFont(x, text, weight, size, family, maxW) {
    x.font = `${weight} ${size}px ${family}`;
    const w = x.measureText(text).width;
    if (w > maxW) x.font = `${weight} ${Math.floor(size * maxW / w)}px ${family}`;
  }
  async function buildShareImage() {
    try {
      await Promise.all([
        document.fonts.load('400 112px "Dela Gothic One"'),
        document.fonts.load('700 64px "Chivo Mono"'),
        document.fonts.load('700 30px "Zen Kaku Gothic New"')
      ]);
    } catch (e) {}
    const r = game.result, n = r.n;
    const W = 1080, H = 1350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const C = { bg: '#EDEFF4', ink: '#181B24', muted: '#5A6172', accent: '#3239C8', tray: '#D3D9E5' };
    const DISPLAY = '"Dela Gothic One", "Hiragino Sans", sans-serif';
    const BODY = '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
    const MONO = '"Chivo Mono", ui-monospace, Menlo, monospace';
    x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
    const g = x.createLinearGradient(0, 0, W, 0);
    [0, 40, 70, 130, 190, 235, 300].forEach((h, i) => g.addColorStop(i / 6, `hsl(${h} 82% 56%)`));
    x.fillStyle = g; x.fillRect(0, 0, W, 16);
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';

    x.fillStyle = C.muted;
    x.font = `700 30px ${BODY}`;
    x.fillText(`虹のスライドパズル ・ ${n.toLocaleString('ja-JP')} × ${n.toLocaleString('ja-JP')}`, W / 2, 82);
    if (r.scoring) {
      x.font = `700 28px ${BODY}`;
      x.fillText('ポイント', W / 2, 142);
      x.fillStyle = C.accent;
      fitFont(x, r.points.toLocaleString('ja-JP'), 400, 112, DISPLAY, W - 120);
      x.fillText(r.points.toLocaleString('ja-JP'), W / 2, 252);
    } else {
      x.fillStyle = C.ink;
      x.font = `400 100px ${DISPLAY}`;
      x.fillText('完成！', W / 2, 240);
    }

    const B = 760, bx = (W - B) / 2, by = 300, pad = 14;
    x.fillStyle = C.tray;
    x.beginPath();
    if (x.roundRect) x.roundRect(bx - pad, by - pad, B + pad * 2, B + pad * 2, 28); else x.rect(bx - pad, by - pad, B + pad * 2, B + pad * 2);
    x.fill();
    drawSolved(x, bx, by, B);

    const stats = [];
    if (r.showTimer) stats.push(['かかった時間', fmt(r.time)]);
    if (r.showMoves) stats.push(['手数', r.moves.toLocaleString('ja-JP')]);
    stats.forEach(([k, v], i) => {
      const cx = W * (i + 0.5) / stats.length;
      x.textAlign = 'center';
      x.fillStyle = C.muted;
      x.font = `700 28px ${BODY}`;
      x.fillText(k, cx, 1160);
      x.fillStyle = C.ink;
      fitFont(x, v, 700, 66, MONO, W / stats.length - 60);
      x.fillText(v, cx, 1240);
    });
    x.fillStyle = C.muted;
    x.font = `400 24px ${BODY}`;
    x.fillText(new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }), W / 2, 1310);
    return c;
  }

  function showShareFallback(blob) {
    const img = $('shareImg');
    if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
    const url = URL.createObjectURL(blob);
    img.dataset.url = url;
    img.src = url;
    $('shareModal').hidden = false;
    $('shareClose').focus();
  }
  function closeShare() { $('shareModal').hidden = true; }
  $('shareX').addEventListener('click', closeShare);
  $('shareClose').addEventListener('click', closeShare);

  async function shareResult(btn) {
    const r = game.result;
    if (!r) return;
    let blob = game.shareBlob;
    if (!blob) {
      btn.disabled = true; btn.textContent = '画像を作成中…';
      try {
        const c = await buildShareImage();
        blob = await new Promise(res => c.toBlob(res, 'image/png'));
      } catch (e) { blob = null; }
      btn.disabled = false; btn.textContent = '共有する';
      if (!blob) return;
      game.shareBlob = blob;
    }
    const name = `slide-puzzle-${r.n}x${r.n}${r.scoring ? '-' + r.points : ''}.png`;
    const parts = [`虹のスライドパズル ${r.n}×${r.n} をクリア！`];
    if (r.scoring) parts.push(`ポイント ${r.points.toLocaleString('ja-JP')}`);
    if (r.showTimer) parts.push(`時間 ${fmt(r.time)}`);
    if (r.showMoves) parts.push(`手数 ${r.moves.toLocaleString('ja-JP')}`);
    let file = null;
    try { file = new File([blob], name, { type: 'image/png' }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: parts.join(' / ') }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    let topLevel = false;
    try { topLevel = window.self === window.top; } catch (e) {}
    if (topLevel) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } else {
      showShareFallback(blob);
    }
  }
  $('shareBtn').addEventListener('click', () => shareResult($('shareBtn')));
  $('doneShare').addEventListener('click', () => shareResult($('doneShare')));

  $('giveUp').addEventListener('click', () => {
    stopTimer();
    game.solved = true;
    $('clearModal').hidden = true;
    showScreen('start');
  });
  $('toStart').addEventListener('click', () => { $('clearModal').hidden = true; showScreen('start'); });
  $('again').addEventListener('click', () => { $('clearModal').hidden = true; startGame(); });

  /* ---------- rendering ---------- */
  let drawQueued = false;
  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; draw(); });
  }
  function draw() {
    if ($('game').hidden || !game.tiles) return;
    const { w, h, dpr } = cam;
    const ctx = bctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.stage;
    ctx.fillRect(0, 0, w, h);
    const n = game.n, s = cam.cell, B = n * s;
    ctx.fillStyle = theme.tray;
    ctx.fillRect(cam.ox, cam.oy, B, B);

    if (s < PIXEL_MODE) {
      const p = ensurePixel();
      if (p) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(p.c, cam.ox, cam.oy, B, B);
        ctx.imageSmoothingEnabled = true;
      }
      game.anim = null;
      return;
    }

    const c0 = Math.max(0, Math.floor(-cam.ox / s)), c1 = Math.min(n - 1, Math.floor((w - cam.ox) / s));
    const r0 = Math.max(0, Math.floor(-cam.oy / s)), r1 = Math.min(n - 1, Math.floor((h - cam.oy) / s));
    const a = game.anim;
    const T = game.tiles, img = game.img, showNum = game.showNum;
    for (let r = r0; r <= r1; r++) {
      const y = cam.oy + r * s;
      for (let c = c0; c <= c1; c++) {
        const t = T[r * n + c];
        if (t === game.holeId && !game.solved) continue;
        if (a && t === a.tile) continue;
        drawTile(ctx, t, cam.ox + c * s, y, s, n, img, showNum);
      }
    }
    if (a) {
      const p = a.dur ? Math.min(1, (performance.now() - a.t0) / a.dur) : 1;
      const e = 1 - Math.pow(1 - p, 3);
      const fr = Math.floor(a.from / n), fc = a.from % n, tr = Math.floor(a.to / n), tc = a.to % n;
      drawTile(ctx, a.tile, cam.ox + (fc + (tc - fc) * e) * s, cam.oy + (fr + (tr - fr) * e) * s, s, n, img, showNum);
      if (p < 1) requestDraw(); else game.anim = null;
    }
  }

  /* ================= wiring ================= */
  new ResizeObserver(() => layout(true)).observe(stage);
  function onTheme() {
    readTheme();
    pixel = null;
    requestDraw();
    if (!$('cropModal').hidden && crop.p) drawCrop();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestDraw());

  readTheme();
  updateSizeNote();
  updateImgUI();
})();
