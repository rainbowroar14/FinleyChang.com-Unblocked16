/* Pixly-style sprites — matches reference art (stain crater, white cobweb, room layout) */
(function (global) {
  "use strict";

  function assetPath(path) {
    const base =
      typeof window !== "undefined" && window.GAME_BASE ? window.GAME_BASE : "";
    return base + path;
  }

  const PX = 1;

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = false;
    return { canvas: c, ctx: x, w, h };
  }

  function px(ctx, x, y, c) {
    if (!c) return;
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  }

  function rect(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  }

  function flipHorizontal(sprite) {
    const { canvas, ctx, w, h } = makeCanvas(sprite.w, sprite.h);
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite.canvas, 0, 0);
    return { canvas, ctx, w, h };
  }

  function stripBlack(img, threshold) {
    const { canvas, ctx, w, h } = makeCanvas(img.width, img.height);
    ctx.drawImage(img, 0, 0);
    try {
      const data = ctx.getImageData(0, 0, w, h);
      const p = data.data;
      const t = threshold || 28;
      for (let i = 0; i < p.length; i += 4) {
        if (p[i] < t && p[i + 1] < t && p[i + 2] < t) p[i + 3] = 0;
      }
      ctx.putImageData(data, 0, 0);
    } catch (_) {
      /* file:// blocks getImageData — use image as-is */
    }
    return { canvas, ctx, w, h };
  }

  function scaleSprite(sprite, tw, th) {
    const { canvas, ctx, w, h } = makeCanvas(tw, th);
    ctx.drawImage(sprite.canvas, 0, 0, tw, th);
    return { canvas, ctx, w: tw, h: th };
  }

  function loadImg(path, strip) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        if (strip) resolve(stripBlack(img, 24));
        else {
          const { canvas, ctx, w, h } = makeCanvas(img.width, img.height);
          ctx.drawImage(img, 0, 0);
          resolve({ canvas, ctx, w, h });
        }
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = assetPath(path);
    });
  }

  /** Bed — top-down 3/4 like room reference, transparent bg */
  function buildBed() {
    const w = 112;
    const h = 88;
    const { canvas, ctx } = makeCanvas(w, h);

    function P(x, y, c) {
      px(ctx, x, y, c);
    }
    function R(x, y, bw, bh, c) {
      rect(ctx, x, y, bw, bh, c);
    }

    // Floor shadow only (not full rect bg)
    R(10, 78, 88, 6, "rgba(0,0,0,0.35)");

    // Legs
    R(12, 72, 6, 10, "#2a1e14");
    R(14, 74, 4, 8, "#3d2c20");
    R(88, 72, 6, 10, "#221810");
    R(90, 74, 4, 8, "#342418");

    // Wooden frame / sides
    R(8, 28, 12, 48, "#3a2a1c");
    R(9, 29, 10, 46, "#4d3828");
    R(10, 30, 8, 44, "#5c4834");
    P(10, 30, "#6e5840");
    R(18, 66, 78, 8, "#2a1e14");
    R(19, 67, 76, 6, "#3d2c20");

    // Red mattress — bright with fold shading
    R(20, 32, 76, 36, "#7a1818");
    R(21, 33, 74, 34, "#a02020");
    R(22, 34, 72, 32, "#c82828");
    R(23, 35, 70, 30, "#e03030");
    R(24, 36, 20, 12, "#f04040");
    R(26, 38, 12, 6, "#ff5858");
    R(72, 48, 18, 14, "#8a1818");
    R(76, 52, 14, 10, "#601010");
    R(78, 54, 10, 6, "#480c0c");

    // White pillow (head against top wall)
    R(22, 22, 28, 16, "#9098a8");
    R(23, 23, 26, 14, "#c0c8d8");
    R(24, 24, 24, 12, "#e4eaf4");
    R(25, 25, 10, 6, "#f8fafc");
    R(44, 26, 4, 10, "#687888");
    P(26, 27, "#a8b0c0");
    P(30, 28, "#a8b0c0");
    P(34, 28, "#a8b0c0");

    return { canvas, ctx, w, h };
  }

  /** Cobweb — thick white strands, anchored top-left (flip for top-right corner) */
  function buildCobwebRaw() {
    const w = 96;
    const h = 88;
    const { canvas, ctx } = makeCanvas(w, h);

    function P(x, y, c) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      px(ctx, x, y, c);
    }
    function thickLine(x0, y0, x1, y1, c, t) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const x = Math.round(x0 + (x1 - x0) * f);
        const y = Math.round(y0 + (y1 - y0) * f);
        for (let dx = -t; dx <= t; dx++) {
          for (let dy = -t; dy <= t; dy++) {
            if (Math.abs(dx) + Math.abs(dy) <= t + 1) P(x + dx, y + dy, c);
          }
        }
      }
    }

    const w1 = "#e8eaee";
    const w2 = "#c8ccd4";
    const w3 = "#9898a0";
    const w4 = "#686870";

    // Heavy corner knot
    for (let dy = 0; dy < 10; dy++) {
      for (let dx = 0; dx < 10; dx++) {
        const d = dx + dy;
        P(dx, dy, d < 4 ? w1 : d < 7 ? w2 : w3);
      }
    }

    thickLine(4, 4, 92, 14, w2, 2);
    thickLine(4, 4, 88, 36, w3, 2);
    thickLine(4, 4, 70, 72, w3, 2);
    thickLine(4, 4, 28, 84, w2, 2);
    thickLine(4, 4, 8, 58, w3, 2);
    thickLine(4, 4, 20, 24, w2, 2);
    thickLine(4, 4, 52, 8, w3, 2);

    thickLine(4, 4, 92, 14, w1, 1);
    thickLine(4, 4, 70, 72, w1, 1);

    // Arc segments (corner quarter-circles)
    for (let r = 12; r <= 40; r += 10) {
      for (let a = 0; a < 85; a++) {
        const rad = (a / 85) * (Math.PI / 2);
        const x = Math.round(4 + Math.cos(rad) * r);
        const y = Math.round(4 + Math.sin(rad) * r);
        P(x, y, r < 22 ? w2 : w3);
        P(x + 1, y, w3);
        P(x, y + 1, w4);
      }
    }

    thickLine(14, 10, 78, 28, w4, 1);
    thickLine(10, 22, 58, 62, w4, 1);
    thickLine(24, 8, 40, 44, w3, 1);

    // Drips / clumps
    P(86, 18, w2);
    P(87, 19, w3);
    P(62, 78, w2);
    P(63, 79, w3);
    P(18, 82, w2);
    P(74, 44, w1);
    P(75, 45, w2);

    return { canvas, ctx, w, h };
  }

  /** Dust crater — jagged brown stain like reference */
  function buildCraterStain() {
    const w = 80;
    const h = 72;
    const { canvas, ctx } = makeCanvas(w, h);
    const cx = 38;
    const cy = 34;

    function P(x, y, c) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      px(ctx, x, y, c);
    }

    const seeds = [
      [0, 0, 14], [1, 0, 12], [0, 1, 11], [-1, 1, 10], [1, 1, 13],
      [2, 0, 9], [-2, 0, 8], [0, 2, 10], [0, -1, 12], [-1, 0, 11],
      [2, 1, 8], [-2, 1, 7], [1, 2, 9], [-1, 2, 8], [2, -1, 7],
    ];

    const pal = ["#1a1410", "#2a2018", "#3a3024", "#4a4030", "#5a5040", "#6a5844", "#8a7058"];

    for (let ring = 0; ring < 18; ring++) {
      const radius = 6 + ring * 1.6;
      for (let a = 0; a < 360; a += 14 + (ring % 5) * 3) {
        const rad = (a * Math.PI) / 180;
        const jitter = (ring * 7 + a) % 5;
        const x = Math.round(cx + Math.cos(rad) * (radius + jitter * 0.4));
        const y = Math.round(cy + Math.sin(rad) * (radius + jitter * 0.35));
        const col = pal[Math.min(pal.length - 1, ring % pal.length)];
        P(x, y, col);
        if (ring > 4) {
          P(x + 1, y, pal[Math.max(0, (ring % pal.length) - 1)]);
          P(x, y + 1, pal[Math.max(0, (ring % pal.length) - 1)]);
        }
      }
    }

    for (const [ux, uy, len] of seeds) {
      for (let i = 0; i < len; i++) {
        const x = cx + ux * i + ((i * 3) % 2);
        const y = cy + uy * i + ((i * 5) % 2);
        P(x, y, pal[i % 4]);
        if (i % 3 === 0) P(x + 1, y, "#6a5844");
      }
    }

    // Tan highlight specks
    const specks = [
      [30, 20, "#9a8068"], [44, 26, "#8a7058"], [50, 38, "#7a6850"],
      [28, 42, "#9a8868"], [42, 48, "#6a5844"], [36, 30, "#b0a080"],
    ];
    for (const [x, y, c] of specks) P(x, y, c);

    return { canvas, ctx, w, h };
  }

  /** Circular pit crater (plate reference) — layered rings */
  function buildCraterPlate() {
    const w = 72;
    const h = 72;
    const { canvas, ctx } = makeCanvas(w, h);
    const cx = 36;
    const cy = 36;

    function ring(r, c) {
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const d = x * x + y * y;
          if (d <= r * r && d > (r - 2) * (r - 2)) {
            px(ctx, cx + x, cy + y, c);
          }
        }
      }
    }

    ring(28, "#3a3a3a");
    ring(24, "#5a5a5a");
    ring(20, "#7a7a7a");
    ring(16, "#9a9a9a");
    for (let y = -14; y <= 14; y++) {
      for (let x = -14; x <= 14; x++) {
        if (x * x + y * y <= 196) {
          const speck = (x * 3 + y * 7) % 11;
          px(ctx, cx + x, cy + y, speck < 2 ? "#6a7080" : speck < 4 ? "#8a9098" : "#b0b4bc");
        }
      }
    }
    ring(14, "#888c94");

    return { canvas, ctx, w, h };
  }

  /** Table + radio for corner */
  function buildRadioTable() {
    const w = 88;
    const h = 80;
    const { canvas, ctx } = makeCanvas(w, h);

    function R(x, y, bw, bh, c) {
      rect(ctx, x, y, bw, bh, c);
    }
    function P(x, y, c) {
      px(ctx, x, y, c);
    }

    R(6, 48, 76, 28, "#2a1e14");
    R(8, 50, 72, 4, "#1a120c");
    R(8, 46, 72, 6, "#3d2c20");
    R(10, 28, 68, 20, "#4a3828");
    R(11, 29, 66, 18, "#5c4834");
    R(12, 30, 2, 16, "#6e5840");

    R(18, 8, 52, 28, "#1a1a1a");
    R(19, 9, 50, 26, "#2a2a2a");
    R(20, 10, 48, 24, "#222222");
    R(22, 14, 44, 12, "#0a0a0a");
    R(24, 16, 40, 8, "#1a2818");
    P(26, 17, "#44cc44");
    P(28, 17, "#55dd55");
    R(58, 10, 8, 8, "#aa2222");
    R(59, 11, 6, 6, "#cc3333");
    P(60, 12, "#ee5555");
    R(62, 6, 3, 12, "#333");
    for (let i = 0; i < 6; i++) {
      P(26 + i * 6, 20, "#555");
    }
    R(38, 4, 4, 6, "#444");

    return { canvas, ctx, w, h };
  }

  /** Kitchen sponge */
  function buildSponge() {
    const w = 36;
    const h = 28;
    const { canvas, ctx } = makeCanvas(w, h);
    rect(ctx, 2, 4, 32, 20, "#c8d040");
    rect(ctx, 4, 6, 28, 16, "#dce858");
    rect(ctx, 6, 8, 8, 6, "#a8b830");
    rect(ctx, 18, 10, 10, 8, "#a8b830");
    rect(ctx, 10, 16, 12, 6, "#98a828");
    px(ctx, 8, 10, "#f0f8a0");
    px(ctx, 22, 12, "#f0f8a0");
    return { canvas, ctx, w, h };
  }

  let bedSprite = null;
  let cobwebSprite = null;
  let craterSprite = null;
  let radioSprite = null;
  let sidewalkSprite = null;
  let sidewalkCrackedSprite = null;
  let washPlateSprite = null;
  let washStainSprite = null;
  let washBubbleSprite = null;
  let washSpongeSprite = null;

  function init() {
    bedSprite = buildBed();
    cobwebSprite = flipHorizontal(buildCobwebRaw());
    radioSprite = buildRadioTable();
    craterSprite = buildCraterStain();
    washSpongeSprite = buildSponge();

    loadImg("assets/crater_stain.png", false).then(function (stain) {
      if (stain) craterSprite = scaleSprite(stain, 96, 86);
    });
    loadImg("assets/crater_plate.png", true).then(function (img) {
      if (img) washPlateSprite = scaleSprite(img, 96, 86);
    });
    loadImg("assets/crater_stain.png", true).then(function (img) {
      if (img) washStainSprite = scaleSprite(img, 88, 78);
    });
    loadImg("assets/crater_bubble.png", true).then(function (img) {
      if (img) washBubbleSprite = scaleSprite(img, 24, 24);
    });
    loadImg("assets/sidewalk.png", false).then(function (img) {
      if (img) sidewalkSprite = scaleSprite(img, 32, 32);
    });
    loadImg("assets/sidewalk_cracked.png", false).then(function (img) {
      if (img) sidewalkCrackedSprite = scaleSprite(img, 32, 32);
    });
  }

  function draw(ctx, sprite, worldX, worldY) {
    if (!sprite) return;
    ctx.drawImage(sprite.canvas, Math.floor(worldX), Math.floor(worldY));
  }

  function drawTile(ctx, sprite, worldX, worldY, tw, th, opts) {
    if (!sprite) return false;
    const o = opts || {};
    const fx = Math.floor(worldX);
    const fy = Math.floor(worldY);
    ctx.save();
    if (o.darken) {
      ctx.filter = "brightness(0.68) contrast(1.05)";
    }
    if (o.flipH || o.flipV) {
      ctx.translate(fx + (o.flipH ? tw : 0), fy + (o.flipV ? th : 0));
      ctx.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
      ctx.drawImage(sprite.canvas, 0, 0, sprite.w, sprite.h, 0, 0, tw, th);
    } else {
      ctx.drawImage(sprite.canvas, 0, 0, sprite.w, sprite.h, fx, fy, tw, th);
    }
    ctx.restore();
    return true;
  }

  const api = {
    init,
    draw,
    get bed() {
      return bedSprite;
    },
    get cobweb() {
      return cobwebSprite;
    },
    get crater() {
      return craterSprite;
    },
    get radio() {
      return radioSprite;
    },
    get sidewalk() {
      return sidewalkSprite;
    },
    get sidewalkCracked() {
      return sidewalkCrackedSprite;
    },
    get washPlate() {
      return washPlateSprite;
    },
    get washStain() {
      return washStainSprite;
    },
    get washBubble() {
      return washBubbleSprite;
    },
    get washSponge() {
      return washSpongeSprite;
    },
    drawTile,
    bedSize: { w: 112, h: 88 },
    cobwebSize: { w: 96, h: 88 },
    craterSize: { w: 96, h: 86 },
    radioSize: { w: 88, h: 80 },
  };

  global.GameSprites = api;
  init();
})(typeof window !== "undefined" ? window : global);
