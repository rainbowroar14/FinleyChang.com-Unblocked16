/* Dish-washing job — ported from Job application cleaning minigame */
(function (global) {
  "use strict";

  const CANVAS_W = 516;
  const CANVAS_H = 516;
  const BRUSH_RADIUS = 26;
  const ERASE_ALPHA = 0.085;
  const ERASE_DWELL = 0.14;
  const DONE_PCT = 92;
  const PLAID_CELL = 43;
  const DISPLAY_SCALE = 0.62;
  const OFFSET_X = (640 - CANVAS_W * DISPLAY_SCALE) / 2;
  const OFFSET_Y = 28;

  const DISH_LAYOUTS = [
    {
      drawW: 420,
      stains: [
        { src: "stain_sauce", x: 110, y: 158, size: 150 },
        { src: "stain_grease", x: 252, y: 212, size: 140 },
        { src: "dirt_specs", x: 178, y: 288, size: 130 },
        { src: "stain_crumb", x: 304, y: 132, size: 120 },
      ],
    },
    {
      drawW: 420,
      stains: [
        { src: "stain_grease", x: 122, y: 142, size: 145 },
        { src: "stain_sauce", x: 268, y: 198, size: 135 },
        { src: "stain_crumb", x: 192, y: 272, size: 125 },
        { src: "dirt_specs", x: 98, y: 224, size: 110 },
      ],
    },
    {
      drawW: 420,
      stains: [
        { src: "stain_crumb", x: 118, y: 168, size: 128 },
        { src: "dirt_specs", x: 240, y: 148, size: 120 },
        { src: "stain_sauce", x: 188, y: 258, size: 142 },
        { src: "stain_grease", x: 290, y: 228, size: 132 },
      ],
    },
  ];

  let active = false;
  let callbacks = null;
  let ready = false;
  let loadError = null;

  let washCanvas = null;
  let washCtx = null;
  let plaidCanvas = null;
  let images = {};
  let stainLayers = [];
  let initialDirty = 1;
  let dishIndex = 0;
  let platesDone = 0;
  let lastPay = 0;
  let cleanFlash = 0;

  let bubbles = [];
  let stickyBubbles = [];
  let animRaf = null;
  let lastFrame = 0;

  let pointerDown = false;
  let pointerId = null;
  let lastScrub = { x: 0, y: 0 };
  let scrubPoint = null;
  let spongeAngle = 0;

  let kbScrub = { x: 400, y: 360 };
  let kbScrubbing = false;
  let finishingPlate = false;

  const GRAVITY = 620;
  const FALL_OFF_Y = CANVAS_H * 0.55;
  const ENTER_START_Y = -460;
  const ENTER_EASE = 10;

  let plateTransition = null;

  let gameCanvas = null;
  let boundPointerDown = null;
  let boundPointerMove = null;
  let boundPointerUp = null;

  function loadAsset(name) {
    return new Promise(function (resolve, reject) {
      const data =
        global.CLEANING_SPRITE_DATA && global.CLEANING_SPRITE_DATA[name];
      const img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("missing sprite: " + name));
      };
      if (data) {
        img.src = "data:image/png;base64," + data;
      } else {
        const base =
          typeof global.GAME_BASE === "string" ? global.GAME_BASE : "";
        img.src = base + "assets/cleaning/" + name + ".png";
      }
    });
  }

  function ensurePlaid() {
    if (plaidCanvas) return plaidCanvas;
    const c = document.createElement("canvas");
    c.width = CANVAS_W;
    c.height = CANVAS_H;
    const g = c.getContext("2d");
    const cell = PLAID_CELL;
    const redA = "#c41e3a";
    const redB = "#b01832";
    const whiteA = "#faf8f5";
    const whiteB = "#ece8e2";

    for (let row = 0; row * cell < CANVAS_H; row++) {
      for (let col = 0; col * cell < CANVAS_W; col++) {
        const x = col * cell;
        const y = row * cell;
        const w = Math.min(cell, CANVAS_W - x);
        const h = Math.min(cell, CANVAS_H - y);
        const isRed = (col + row) % 2 === 0;
        g.fillStyle = isRed
          ? col % 2 === 0
            ? redA
            : redB
          : row % 2 === 0
            ? whiteA
            : whiteB;
        g.fillRect(x, y, w, h);
        if (isRed) {
          g.fillStyle = "rgba(255,255,255,0.06)";
          g.fillRect(x + 2, y + 2, Math.max(1, w - 4), 2);
          g.fillStyle = "rgba(0,0,0,0.12)";
          g.fillRect(x + 2, y + h - 4, Math.max(1, w - 4), 2);
        } else {
          g.fillStyle = "rgba(0,0,0,0.04)";
          g.fillRect(x + 2, y + 2, Math.max(1, w - 4), 2);
        }
      }
    }

    g.strokeStyle = "rgba(0,0,0,0.22)";
    g.lineWidth = 2;
    for (let x = 0; x <= CANVAS_W; x += cell) {
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, CANVAS_H);
      g.stroke();
    }
    for (let y = 0; y <= CANVAS_H; y += cell) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(CANVAS_W, y + 0.5);
      g.stroke();
    }

    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 4;
    g.strokeRect(2, 2, CANVAS_W - 4, CANVAS_H - 4);
    plaidCanvas = c;
    return c;
  }

  function getDishLayout() {
    return DISH_LAYOUTS[dishIndex % DISH_LAYOUTS.length];
  }

  function getDishRect(offsetY) {
    const dish = getDishLayout();
    const w = dish.drawW;
    const h = dish.drawW;
    const oy = offsetY || 0;
    return {
      x: (CANVAS_W - w) / 2,
      y: (CANVAS_H - h) / 2 + oy,
      w: w,
      h: h,
    };
  }

  function isScrubbingAllowed() {
    return (
      ready &&
      !finishingPlate &&
      !plateTransition &&
      stainLayers.length > 0
    );
  }

  function capturePlateSnapshot() {
    const pr = getDishRect(0);
    const c = document.createElement("canvas");
    c.width = pr.w;
    c.height = pr.h;
    const sctx = c.getContext("2d");
    if (images.plate) {
      drawDishAt(sctx, images.plate, pr.w / 2, pr.h / 2, pr.w, pr.h);
    }
    stainLayers.forEach(function (layer) {
      sctx.drawImage(
        layer.canvas,
        layer.x - pr.x,
        layer.y - pr.y,
        layer.w,
        layer.h
      );
    });
    return { canvas: c, w: pr.w, h: pr.h, cx: pr.x + pr.w / 2, cy: pr.y + pr.h / 2 };
  }

  function beginPlateTransition() {
    const snap = capturePlateSnapshot();
    plateTransition = {
      fall: {
        x: 0,
        y: 0,
        vx: (Math.random() - 0.5) * 55,
        vy: 40,
        rot: (Math.random() - 0.5) * 0.12,
        rotV: (Math.random() - 0.5) * 0.35,
        snap: snap,
      },
      enterY: ENTER_START_Y,
      stainsReady: false,
    };
    stainLayers = [];
    initialDirty = 1;
    bubbles = [];
    stickyBubbles = [];
    scrubPoint = null;
    pointerDown = false;
    setupStains().then(function () {
      if (plateTransition) plateTransition.stainsReady = true;
    });
  }

  function updatePlateTransition(dtSec) {
    if (!plateTransition) return;
    const tr = plateTransition;
    const f = tr.fall;

    f.vy += GRAVITY * dtSec;
    f.y += f.vy * dtSec;
    f.x += f.vx * dtSec;
    f.rot += f.rotV * dtSec;

    if (tr.stainsReady) {
      tr.enterY += (0 - tr.enterY) * Math.min(1, dtSec * ENTER_EASE);
    }

    if (
      tr.stainsReady &&
      f.y >= FALL_OFF_Y &&
      Math.abs(tr.enterY) < 1.5
    ) {
      plateTransition = null;
      finishingPlate = false;
      cleanFlash = 0;
    }
  }

  function drawFallingPlate(ctx) {
    const f = plateTransition.fall;
    const snap = f.snap;
    ctx.save();
    ctx.translate(snap.cx + f.x, snap.cy + f.y);
    ctx.rotate(f.rot);
    ctx.drawImage(snap.canvas, -snap.w / 2, -snap.h / 2, snap.w, snap.h);
    ctx.restore();
  }

  function drawActivePlateStack(ctx, offsetY) {
    const pr = getDishRect(offsetY);
    const cx = pr.x + pr.w / 2;
    const cy = pr.y + pr.h / 2;
    if (images.plate) drawDishAt(ctx, images.plate, cx, cy, pr.w, pr.h);
    stainLayers.forEach(function (layer) {
      ctx.drawImage(
        layer.canvas,
        layer.x,
        layer.y + offsetY,
        layer.w,
        layer.h
      );
    });
  }

  function getDishCenter() {
    const pr = getDishRect();
    return { x: pr.x + pr.w / 2, y: pr.y + pr.h / 2 };
  }

  function countDirtyPixels() {
    let dirty = 0;
    stainLayers.forEach(function (layer) {
      const data = layer.ctx.getImageData(0, 0, layer.w, layer.h).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 12) dirty += 1;
      }
    });
    return dirty;
  }

  function getScrubPercent() {
    if (!initialDirty) return 100;
    const dirty = countDirtyPixels();
    return Math.min(
      100,
      Math.max(0, ((initialDirty - dirty) / initialDirty) * 100)
    );
  }

  function clientToWash(clientX, clientY) {
    if (!gameCanvas) return { x: CANVAS_W / 2, y: CANVAS_H / 2 };
    const rect = gameCanvas.getBoundingClientRect();
    const scaleX = 640 / rect.width;
    const scaleY = 360 / rect.height;
    const gx = (clientX - rect.left) * scaleX;
    const gy = (clientY - rect.top) * scaleY;
    return {
      x: (gx - OFFSET_X) / DISPLAY_SCALE,
      y: (gy - OFFSET_Y) / DISPLAY_SCALE,
    };
  }

  function eraseAt(cx, cy, moved) {
    if (!stainLayers.length) return;
    const strength = moved ? ERASE_ALPHA : ERASE_DWELL;
    stainLayers.forEach(function (layer) {
      const lx = cx - layer.x;
      const ly = cy - layer.y;
      if (lx < -BRUSH_RADIUS || ly < -BRUSH_RADIUS) return;
      if (lx > layer.w + BRUSH_RADIUS || ly > layer.h + BRUSH_RADIUS) return;
      layer.ctx.save();
      layer.ctx.globalCompositeOperation = "destination-out";
      layer.ctx.globalAlpha = strength;
      const grad = layer.ctx.createRadialGradient(
        lx,
        ly,
        2,
        lx,
        ly,
        BRUSH_RADIUS
      );
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(0.6, "rgba(0,0,0,0.55)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      layer.ctx.fillStyle = grad;
      layer.ctx.beginPath();
      layer.ctx.arc(lx, ly, BRUSH_RADIUS, 0, Math.PI * 2);
      layer.ctx.fill();
      layer.ctx.restore();
    });
    if (moved && Math.random() < 0.08) {
      spawnBubble(cx, cy, Math.random() < 0.4);
    }
  }

  function spawnBubble(cx, cy, sticky) {
    const center = getDishCenter();
    if (sticky && Math.random() < 0.2) {
      stickyBubbles.push({
        ox: cx - center.x,
        oy: cy - center.y,
        size: 6,
        targetSize: 34 + Math.random() * 28,
        phase: "grow",
        holdLeft: 50 + Math.floor(Math.random() * 40),
        popT: 0,
        popMax: 18,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpd: 0.05 + Math.random() * 0.04,
      });
      if (stickyBubbles.length > 12) stickyBubbles.shift();
      return;
    }
    bubbles.push({
      x: cx + (Math.random() - 0.5) * 20,
      y: cy + (Math.random() - 0.5) * 16,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -0.4 - Math.random() * 0.8,
      life: 42 + Math.random() * 30,
      maxLife: 72,
      size: 22 + Math.random() * 26,
      spin: Math.random() * Math.PI * 2,
    });
    if (bubbles.length > 24) bubbles.shift();
  }

  function drawBubblePop(ctx, wx, wy, popT, maxT) {
    const t = popT / maxT;
    const alpha = Math.max(0, 1 - t);
    const ringR = 6 + t * 48;
    ctx.strokeStyle = "rgba(220, 245, 255, " + alpha * 0.95 + ")";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(wx, wy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 3;
      const dist = ringR * (0.5 + t * 0.9);
      const s = 5 - t * 3;
      ctx.fillStyle = "rgba(190, 230, 255, " + alpha + ")";
      ctx.fillRect(
        wx + Math.cos(a) * dist - s / 2,
        wy + Math.sin(a) * dist - s / 2,
        s,
        s
      );
    }
  }

  function updateStickyBubbles() {
    stickyBubbles = stickyBubbles.filter(function (b) {
      b.wobble += b.wobbleSpd;
      if (b.phase === "pop") {
        b.popT += 1;
        return b.popT < b.popMax;
      }
      if (b.phase === "grow") {
        b.size += (b.targetSize - b.size) * 0.11;
        if (b.size >= b.targetSize * 0.97) {
          b.phase = "hold";
          b.size = b.targetSize;
        }
        return true;
      }
      if (b.phase === "hold") {
        b.holdLeft -= 1;
        if (b.holdLeft <= 0) {
          b.phase = "pop";
          b.popT = 0;
        }
      }
      if (b.phase === "pop") return b.popT < b.popMax;
      return true;
    });
  }

  function drawStickyLayer(ctx, offsetY) {
    const bubbleImg = images.bubble || images.bubbleSmall;
    if (!bubbleImg) return;
    const pr = getDishRect(offsetY || 0);
    const center = { x: pr.x + pr.w / 2, y: pr.y + pr.h / 2 };
    stickyBubbles.forEach(function (b) {
      const wx = center.x + b.ox;
      const wy = center.y + b.oy;
      const wob = Math.sin(b.wobble) * 3;
      if (b.phase === "pop") {
        drawBubblePop(ctx, wx, wy + wob, b.popT, b.popMax);
        return;
      }
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.translate(wx, wy + wob);
      ctx.drawImage(bubbleImg, -b.size / 2, -b.size / 2, b.size, b.size);
      ctx.restore();
    });
  }

  function drawDishAt(ctx, img, cx, cy, w, h) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawWashFrame(now) {
    if (!washCtx || !ready) return;
    const ctx = washCtx;
    const dtMs = lastFrame ? now - lastFrame : 16.67;
    const dtSec = dtMs / 1000;
    lastFrame = now;

    if (plateTransition) updatePlateTransition(dtSec);

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(ensurePlaid(), 0, 0);

    if (plateTransition) {
      if (plateTransition.stainsReady) {
        drawActivePlateStack(ctx, plateTransition.enterY);
      }
      if (plateTransition.fall.y < CANVAS_H + 100) {
        drawFallingPlate(ctx);
      }
    } else {
      drawActivePlateStack(ctx, 0);
    }

    if (!plateTransition) {
      drawStickyLayer(ctx, 0);
      const bubbleImg = images.bubbleSmall || images.bubble;
      if (bubbleImg) {
        bubbles = bubbles.filter(function (b) {
          b.x += b.vx;
          b.y += b.vy;
          b.vy -= 0.02;
          b.life -= 1;
          b.spin += 0.06;
          if (b.life <= 0) return false;
          const a = Math.min(1, b.life / b.maxLife);
          ctx.save();
          ctx.globalAlpha = a * 0.9;
          ctx.translate(b.x, b.y);
          ctx.rotate(b.spin);
          ctx.drawImage(bubbleImg, -b.size / 2, -b.size / 2, b.size, b.size);
          ctx.restore();
          return true;
        });
      }
      updateStickyBubbles();
    }

    const pt = scrubPoint || (kbScrubbing ? kbScrub : null);
    if (pt && images.sponge && isScrubbingAllowed()) {
      const sw = 56;
      const sh = 56;
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(spongeAngle);
      ctx.drawImage(images.sponge, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
    }

    if (pointerDown && scrubPoint && isScrubbingAllowed()) {
      eraseAt(scrubPoint.x, scrubPoint.y, false);
    }

    if (cleanFlash > 0 && !plateTransition) {
      cleanFlash -= dtSec;
      ctx.fillStyle = "rgba(255,255,220," + Math.min(0.5, cleanFlash) + ")";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    if (isScrubbingAllowed()) {
      const pct = getScrubPercent();
      if (pct >= DONE_PCT && cleanFlash <= 0) {
        finishPlate();
      }
    }
  }

  function animLoop(now) {
    if (!active) return;
    drawWashFrame(now || performance.now());
    animRaf = requestAnimationFrame(animLoop);
  }

  function setupStains() {
    const dish = getDishLayout();
    const stainNames = dish.stains.map(function (s) {
      return s.src;
    });
    return Promise.all(stainNames.map(loadAsset)).then(function (stainImgs) {
      stainLayers = dish.stains.map(function (layout, i) {
        const w = layout.size;
        const h = layout.size;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const sctx = c.getContext("2d");
        sctx.drawImage(stainImgs[i], 0, 0, w, h);
        return { canvas: c, ctx: sctx, x: layout.x, y: layout.y, w: w, h: h };
      });
      initialDirty = countDirtyPixels() || 1;
      bubbles = [];
      stickyBubbles = [];
    });
  }

  function finishPlate() {
    if (finishingPlate || plateTransition) return;
    finishingPlate = true;
    const pay = Math.floor(Math.random() * 4) + 3;
    lastPay = pay;
    platesDone++;
    cleanFlash = 0.55;
    if (callbacks && callbacks.addMoney) callbacks.addMoney(pay);
    dishIndex++;
    beginPlateTransition();
  }

  function scrubAtClient(clientX, clientY, moved) {
    const c = clientToWash(clientX, clientY);
    scrubPoint = c;
    const dx = clientX - lastScrub.x;
    const dy = clientY - lastScrub.y;
    if (Math.hypot(dx, dy) > 0.4) {
      spongeAngle = Math.atan2(dy, dx) + Math.PI / 2;
    }
    eraseAt(c.x, c.y, moved);
    lastScrub.x = clientX;
    lastScrub.y = clientY;
  }

  function bindPointer() {
    gameCanvas = document.getElementById("game");
    if (!gameCanvas) return;

    boundPointerDown = function (e) {
      if (!active || !ready || plateTransition) return;
      if (e.button !== undefined && e.button !== 0) return;
      pointerDown = true;
      pointerId = e.pointerId != null ? e.pointerId : 0;
      if (gameCanvas.setPointerCapture && e.pointerId != null) {
        try {
          gameCanvas.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
      lastScrub.x = e.clientX;
      lastScrub.y = e.clientY;
      scrubAtClient(e.clientX, e.clientY, true);
      e.preventDefault();
    };

    boundPointerMove = function (e) {
      if (!active || !ready || !pointerDown || plateTransition) return;
      if (e.pointerId != null && pointerId != null && e.pointerId !== pointerId) {
        return;
      }
      const moved =
        Math.hypot(e.clientX - lastScrub.x, e.clientY - lastScrub.y) > 1;
      scrubAtClient(e.clientX, e.clientY, moved);
      e.preventDefault();
    };

    boundPointerUp = function (e) {
      if (!pointerDown) return;
      if (e.pointerId != null && pointerId != null && e.pointerId !== pointerId) {
        return;
      }
      pointerDown = false;
      pointerId = null;
      scrubPoint = null;
      e.preventDefault();
    };

    gameCanvas.addEventListener("pointerdown", boundPointerDown);
    gameCanvas.addEventListener("pointermove", boundPointerMove);
    gameCanvas.addEventListener("pointerup", boundPointerUp);
    gameCanvas.addEventListener("pointercancel", boundPointerUp);
    gameCanvas.addEventListener("lostpointercapture", boundPointerUp);
  }

  function unbindPointer() {
    if (!gameCanvas) return;
    if (boundPointerDown) {
      gameCanvas.removeEventListener("pointerdown", boundPointerDown);
      gameCanvas.removeEventListener("pointermove", boundPointerMove);
      gameCanvas.removeEventListener("pointerup", boundPointerUp);
      gameCanvas.removeEventListener("pointercancel", boundPointerUp);
      gameCanvas.removeEventListener("lostpointercapture", boundPointerUp);
    }
    boundPointerDown = null;
    boundPointerMove = null;
    boundPointerUp = null;
    pointerDown = false;
    scrubPoint = null;
  }

  function loadAllAssets() {
    return Promise.all([
      loadAsset("plate"),
      loadAsset("bubble_small"),
      loadAsset("bubble"),
      loadAsset("sponge"),
      loadAsset("stain_sauce"),
      loadAsset("stain_grease"),
      loadAsset("stain_crumb"),
      loadAsset("dirt_specs"),
    ]).then(function (arr) {
      images = {
        plate: arr[0],
        bubbleSmall: arr[1],
        bubble: arr[2],
        sponge: arr[3],
        stain_sauce: arr[4],
        stain_grease: arr[5],
        stain_crumb: arr[6],
        dirt_specs: arr[7],
      };
    });
  }

  function openWash(cbs) {
    active = true;
    ready = false;
    loadError = null;
    callbacks = cbs;
    platesDone = 0;
    lastPay = 0;
    dishIndex = 0;
    cleanFlash = 0;
    kbScrub = { x: 400, y: 360 };
    plaidCanvas = null;

    if (!washCanvas) {
      washCanvas = document.createElement("canvas");
      washCanvas.width = CANVAS_W;
      washCanvas.height = CANVAS_H;
      washCtx = washCanvas.getContext("2d");
    }

    bindPointer();
    ensurePlaid();

    loadAllAssets()
      .then(function () {
        return setupStains();
      })
      .then(function () {
        ready = true;
        lastFrame = performance.now();
        if (animRaf) cancelAnimationFrame(animRaf);
        animRaf = requestAnimationFrame(animLoop);
      })
      .catch(function (err) {
        loadError = err && err.message ? err.message : "load failed";
        console.error("Dish wash load error:", err);
      });
  }

  function closeWash() {
    active = false;
    ready = false;
    callbacks = null;
    kbScrubbing = false;
    plateTransition = null;
    finishingPlate = false;
    unbindPointer();
    if (animRaf) {
      cancelAnimationFrame(animRaf);
      animRaf = null;
    }
    stainLayers = [];
    bubbles = [];
    stickyBubbles = [];
  }

  function update(dt, keys) {
    if (!active || !ready || plateTransition) return;

    let ix = 0;
    let iy = 0;
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) ix -= 1;
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) ix += 1;
    if (keys["ArrowUp"] || keys["w"] || keys["W"]) iy -= 1;
    if (keys["ArrowDown"] || keys["s"] || keys["S"]) iy += 1;

    const keyMove = ix !== 0 || iy !== 0;
    if (keyMove && !pointerDown) {
      const len = Math.hypot(ix, iy) || 1;
      kbScrub.x += (ix / len) * 280 * dt;
      kbScrub.y += (iy / len) * 280 * dt;
      kbScrub.x = Math.max(40, Math.min(CANVAS_W - 40, kbScrub.x));
      kbScrub.y = Math.max(40, Math.min(CANVAS_H - 40, kbScrub.y));
      spongeAngle += 0.02 * (ix !== 0 ? ix : 0);
    }

    kbScrubbing =
      !pointerDown && (keys["z"] || keys["Z"] || keys[" "]);

    if (kbScrubbing) {
      scrubPoint = kbScrub;
      eraseAt(kbScrub.x, kbScrub.y, keyMove);
    }
  }

  function draw(ctx) {
    if (!active) return;

    ctx.fillStyle = "#1a2030";
    ctx.fillRect(0, 0, 640, 360);

    ctx.fillStyle = "#e8eef4";
    ctx.font = "14px monospace";
    ctx.fillText("DISH WASHING — State Kitchen", 16, 18);

    if (loadError) {
      ctx.fillStyle = "#f0a0a0";
      ctx.font = "12px monospace";
      ctx.fillText("Could not load cleaning sprites.", 16, 40);
      ctx.fillText(loadError, 16, 56);
      return;
    }

    if (!ready) {
      ctx.fillStyle = "#a8b8c8";
      ctx.font = "12px monospace";
      ctx.fillText("Loading suds…", 16, 40);
      return;
    }

    const dw = CANVAS_W * DISPLAY_SCALE;
    const dh = CANVAS_H * DISPLAY_SCALE;
    ctx.drawImage(washCanvas, OFFSET_X, OFFSET_Y, dw, dh);

    const pct = plateTransition ? 0 : getScrubPercent();
    ctx.fillStyle = "#a8b8c8";
    ctx.font = "12px monospace";
    ctx.fillText(
      "Drag sponge on plate — or arrows + hold Z",
      16,
      36
    );
    if (plateTransition) {
      ctx.fillText("Next plate incoming…", 16, 52);
    } else {
      ctx.fillText(
        "Scrubbed " + pct.toFixed(0) + "%  (need " + DONE_PCT + "%)",
        16,
        52
      );
    }
    ctx.fillText("X or E — leave job", 16, 68);

    if (lastPay > 0 && cleanFlash > 0.2) {
      ctx.fillStyle = "#ffe878";
      ctx.font = "16px monospace";
      ctx.fillText("+₩" + lastPay + " — next plate!", 16, 340);
    }

    ctx.fillStyle = "#8898a8";
    ctx.fillText("Plates washed: " + platesDone, 480, 18);
  }

  function handleExitKey() {
    return active;
  }

  global.Dishes = {
    get active() {
      return active;
    },
    openWash: openWash,
    closeWash: closeWash,
    update: update,
    draw: draw,
    handleExitKey: handleExitKey,
  };
})(typeof window !== "undefined" ? window : global);
