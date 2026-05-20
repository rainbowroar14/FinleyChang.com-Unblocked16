/* Outside — black market behind, road + crosswalk in front */
(function (global) {
  "use strict";

  const T = {
    GRASS: 0,
    WALL: 1,
    SIDEWALK: 2,
    HIGHWAY: 3,
    MY_HOUSE: 4,
    ALLEY: 5,
    NEIGHBOR: 6,
    ALLEY_DEEP: 7,
    DOOR: 8,
    BLACKMARKET: 9,
    CROSSWALK: 10,
    SIDEWALK_CRACKED: 11,
    JOB_HOUSE: 12,
    SOUTH_WALK: 13,
  };

  const W = 48;
  const H = 28;
  const TILE = 32;

  const SPR = typeof GameSprites !== "undefined" ? GameSprites : null;

  const SNIPER_TOWER = { x: 14 * TILE + 16, y: 2 * TILE + 4 };
  const CROSSWALK_X = 7;

  let tiles = [];
  let walkDecor = [];
  let troops = [];
  let walkers = [];
  let shadyPassed = false;
  let drawCtx = null;
  let nextWalkerId = 0;

  const WALK_ROWS = [16, 17, 18];
  const TARGET_WALKERS = 7;
  const SPAWN_MARGIN = 100;

  const houseRect = { x: 2 * TILE, y: 10 * TILE, w: 12 * TILE, h: 5 * TILE };
  const doorRect = { x: 7 * TILE, y: 14 * TILE, w: 2 * TILE, h: TILE };
  const outsideDoor = {
    x: 6 * TILE,
    y: 15 * TILE,
    w: 4 * TILE,
    h: TILE + 8,
    interactPad: 44,
  };

  const shady = {
    x: 14 * TILE,
    y: 11 * TILE,
    w: 2 * TILE,
    h: TILE,
    interactPad: 36,
    name: "Shady Slim",
  };

  const slotMachine = {
    x: 17 * TILE,
    y: 1 * TILE,
    w: 12 * TILE,
    h: 7 * TILE,
    interactPad: 52,
  };

  const jobHouseRect = { x: 5 * TILE, y: 24 * TILE, w: 6 * TILE, h: 3 * TILE };
  const jobOutsideDoor = {
    x: 6 * TILE,
    y: 24 * TILE,
    w: 4 * TILE,
    h: TILE,
    interactPad: 48,
  };
  const jobSpawn = { x: 7 * TILE - 8, y: 23 * TILE + 6 };

  function hashTile(x, y) {
    return ((x * 92837111) ^ (y * 689287499)) >>> 0;
  }

  function isBorder(x, y) {
    return x === 0 || y === 0 || x === W - 1 || y === H - 1;
  }

  function isHouseGapAlley(x, y) {
    return x >= 14 && x <= 15 && y >= 10 && y <= 17;
  }

  function isBlackMarket(x, y) {
    return y >= 1 && y <= 7 && x >= 1 && x <= W - 2;
  }

  function isMyHouse(x, y) {
    return x >= 2 && x <= 13 && y >= 10 && y <= 14;
  }

  function isNeighbor(x, y) {
    return x >= 16 && x <= 27 && y >= 10 && y <= 14;
  }

  function isDoorCell(x, y) {
    return x >= 7 && x <= 8 && y === 14;
  }

  function isCrosswalk(x, y) {
    return y >= 19 && y <= 23 && x === CROSSWALK_X;
  }

  function isSouthWalk(x, y) {
    if (y !== 23) return false;
    if (x === CROSSWALK_X) return false;
    return x >= 1 && x <= W - 2;
  }

  function isJobHouse(x, y) {
    return x >= 5 && x <= 10 && y >= 24 && y <= 26;
  }

  function isJobDoorCell(x, y) {
    return x >= 7 && x <= 8 && y === 24;
  }

  function isHighway(x, y) {
    return y >= 19 && y <= 22 && x >= 1 && x <= W - 2 && !isCrosswalk(x, y);
  }

  function isFrontWalk(x, y) {
    if (y < 15 || y > 18) return false;
    if (isMyHouse(x, y) || isNeighbor(x, y) || isDoorCell(x, y)) return false;
    return x >= 1 && x <= W - 2;
  }

  function buildWalkDecor() {
    walkDecor = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        const h = hashTile(x, y);
        row.push({
          cracked: h % 5 === 0 || h % 11 === 3,
          flipH: h % 3 === 0,
          flipV: h % 7 === 1,
        });
      }
      walkDecor.push(row);
    }
  }

  function buildMap() {
    tiles = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        if (isBorder(x, y)) {
          row.push(T.WALL);
        } else if (isCrosswalk(x, y)) {
          row.push(T.CROSSWALK);
        } else if (isHighway(x, y)) {
          row.push(T.HIGHWAY);
        } else if (isHouseGapAlley(x, y)) {
          row.push(T.ALLEY);
        } else if (isBlackMarket(x, y)) {
          row.push(T.BLACKMARKET);
        } else if (isMyHouse(x, y)) {
          row.push(T.MY_HOUSE);
        } else if (isNeighbor(x, y)) {
          row.push(T.NEIGHBOR);
        } else if (isJobHouse(x, y)) {
          row.push(T.JOB_HOUSE);
        } else if (isSouthWalk(x, y)) {
          row.push(T.SOUTH_WALK);
        } else if (isFrontWalk(x, y)) {
          const d = walkDecor[y] && walkDecor[y][x];
          row.push(d && d.cracked ? T.SIDEWALK_CRACKED : T.SIDEWALK);
        } else {
          row.push(T.GRASS);
        }
      }
      tiles.push(row);
    }
  }

  function rollPedType() {
    if (Math.random() < 0.1) return "guard";
    if (Math.random() < 0.1) return "undercover";
    return "citizen";
  }

  function createWalker() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const row = WALK_ROWS[Math.floor(Math.random() * WALK_ROWS.length)];
    const pedType = rollPedType();
    return {
      id: nextWalkerId++,
      pedType: pedType,
      x:
        dir === 1
          ? -SPAWN_MARGIN - Math.random() * 80
          : W * TILE + SPAWN_MARGIN + Math.random() * 80,
      y: row * TILE + 6,
      dir: dir,
      speed: 28 + Math.random() * 10,
      frame: 0,
      step: 0,
      timer: 0,
      shirt: ["#4a6a9a", "#8a5a4a", "#5a7a5a"][Math.floor(Math.random() * 3)],
      busy: false,
      fleeing: false,
      removed: false,
      bumpCd: 0,
      opinion: null,
      stopped: false,
      aiming: false,
      revealed: false,
      talkCount: 0,
      faceDir: dir,
    };
  }

  function trimAndSpawnWalkers() {
    walkers = walkers.filter(function (w) {
      return !w.removed;
    });
    while (walkers.length < TARGET_WALKERS) {
      walkers.push(createWalker());
    }
  }

  function faceToward(ent, tx, ty) {
    const ex = ent.x + 16;
    ent.faceDir = tx < ex ? -1 : 1;
  }

  function updateFacing(player) {
    if (!player) return;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    troops.forEach(function (g) {
      if (g.aiming || g.stopped || g.following) faceToward(g, px, py);
    });
    walkers.forEach(function (w) {
      if (w.removed) return;
      if (w.aiming || w.stopped || w.revealed) faceToward(w, px, py);
    });
  }

  function initNPCs() {
    nextWalkerId = 0;
    troops = [];
    const streetRows = [19, 20, 21];
    const guardCount = 8;
    for (let i = 0; i < guardCount; i++) {
      const row = streetRows[i % streetRows.length];
      const laneY = row * TILE + (row === 19 ? 10 : 6);
      const baseSpeed = 36 + (i % 5) * 4;
      const streetDir = i % 2 === 0 ? 1 : -1;
      troops.push({
        x: 40 + (i * 110) % (W * TILE - 120),
        y: laneY,
        laneY: laneY,
        patrolKind: "street",
        baseSpeed: baseSpeed,
        streetDir: streetDir,
        speed: streetDir * baseSpeed,
        dir: streetDir,
        minX: 2 * TILE,
        maxX: (W - 4) * TILE,
        step: 0,
        stopped: false,
        aiming: false,
        aimT: 0,
        following: false,
        faceDir: streetDir,
      });
    }
    walkers = [];
    for (let j = 0; j < TARGET_WALKERS; j++) {
      walkers.push(createWalker());
    }
  }

  function reset() {
    shadyPassed = false;
    initNPCs();
  }

  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return T.WALL;
    return tiles[ty][tx];
  }

  function samplePlayerTiles(player) {
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    const feetX = player.x + player.w * 0.25;
    const feetY = player.y + player.h * 0.85;
    return [
      { tx: Math.floor(cx / TILE), ty: Math.floor(cy / TILE) },
      { tx: Math.floor(feetX / TILE), ty: Math.floor(feetY / TILE) },
    ];
  }

  function playerOnTile(player, tileType) {
    return samplePlayerTiles(player).some(function (p) {
      return tileAt(p.tx, p.ty) === tileType;
    });
  }

  function playerOnDangerRoad(player) {
    return samplePlayerTiles(player).some(function (p) {
      return tileAt(p.tx, p.ty) === T.HIGHWAY;
    });
  }

  function isShadyBlocking(player) {
    if (shadyPassed) return false;
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    const tx = Math.floor(cx / TILE);
    const ty = Math.floor(cy / TILE);
    return tx >= 14 && tx <= 15 && ty >= 11 && ty <= 12;
  }

  function getSolids() {
    const s = [];
    const hy = 10 * TILE;
    const hh = 5 * TILE;
    s.push({ x: 2 * TILE, y: hy, w: 5 * TILE, h: hh });
    s.push({ x: 9 * TILE, y: hy, w: 5 * TILE, h: hh });
    s.push({ x: 16 * TILE, y: hy, w: 12 * TILE, h: hh });
    s.push({ x: 5 * TILE, y: 25 * TILE, w: 6 * TILE, h: 2 * TILE });
    s.push({ x: 5 * TILE, y: 24 * TILE, w: 2 * TILE, h: TILE });
    s.push({ x: 9 * TILE, y: 24 * TILE, w: 2 * TILE, h: TILE });
    if (!shadyPassed) {
      s.push({ x: 14 * TILE, y: 11 * TILE, w: 2 * TILE, h: TILE });
    }
    return s;
  }

  function resumeTroopPatrol(g) {
    if (!g) return;
    g.stopped = false;
    g.aiming = false;
    g.following = false;
    if (g.pedType) {
      g.busy = false;
      return;
    }
    if (g.laneY != null) g.y = g.laneY;
    if (g.patrolKind === "street") {
      g.speed = (g.streetDir || 1) * (g.baseSpeed || 38);
    } else {
      g.speed = g.baseSpeed || 38;
    }
  }

  function troopBox(g) {
    return { x: g.x + 2, y: g.y + 4, w: 28, h: 40 };
  }

  function walkerBox(w) {
    return { x: w.x + 4, y: w.y + 6, w: 24, h: 38 };
  }

  function getNearestTroop(wx, wy) {
    let best = null;
    let bestD = Infinity;
    troops.forEach(function (g) {
      const d = Math.hypot(g.x + 16 - wx, g.y + 20 - wy);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    });
    return best;
  }

  function isOnHighway(wx, wy) {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    return tileAt(tx, ty) === T.HIGHWAY;
  }

  function pushWalkerToRoad(w) {
    w.y = 20 * TILE + 8;
    let tx = Math.floor((w.x + 12) / TILE);
    tx = Math.max(2, Math.min(W - 3, tx));
    if (tileAt(tx, 20) !== T.HIGHWAY) {
      tx = 7;
    }
    w.x = tx * TILE + 4;
  }

  function updateWalkerFlee(w, dt) {
    if (!w.fleeing || w.removed) return null;
    const g = getNearestTroop(w.x, w.y);
    if (!g) return null;
    const gx = g.x + 16;
    const gy = g.y + 20;
    const dx = gx - (w.x + 12);
    const dy = gy - (w.y + 20);
    const len = Math.hypot(dx, dy) || 1;
    w.x += (dx / len) * 78 * dt;
    w.y += (dy / len) * 78 * dt;
    w.timer += dt;
    if (w.timer > 0.15) {
      w.timer = 0;
      w.frame = 1 - w.frame;
    }
    if (len < 44) return g;
    return null;
  }

  function checkGuardBump(player) {
    const pb = {
      x: player.x + 6,
      y: player.y + 8,
      w: player.w - 12,
      h: player.h - 10,
    };
    let i;
    for (i = 0; i < troops.length; i++) {
      const g = troops[i];
      if (g.stopped || g.following) continue;
      const gb = troopBox(g);
      if (
        pb.x < gb.x + gb.w &&
        pb.x + pb.w > gb.x &&
        pb.y < gb.y + gb.h &&
        pb.y + pb.h > gb.y
      ) {
        return g;
      }
    }
    for (i = 0; i < walkers.length; i++) {
      const w = walkers[i];
      if (w.removed || w.pedType !== "guard" || w.stopped || w.busy) continue;
      const gb = troopBox(w);
      if (
        pb.x < gb.x + gb.w &&
        pb.x + pb.w > gb.x &&
        pb.y < gb.y + gb.h &&
        pb.y + pb.h > gb.y
      ) {
        return w;
      }
    }
    return null;
  }

  function update(dt) {
    troops.forEach(function (s) {
      if (s.following) return;
      if (s.stopped) {
        s.aimT += dt;
        return;
      }
      if (s.patrolKind === "walk") {
        s.x += s.dir * Math.abs(s.speed) * dt;
        if (s.x <= s.minX) {
          s.x = s.minX;
          s.dir = 1;
        }
        if (s.x >= s.maxX) {
          s.x = s.maxX;
          s.dir = -1;
        }
        s.faceDir = s.dir;
      } else {
        s.x += s.speed * dt;
        if (s.speed > 0 && s.x > W * TILE + 50) {
          s.x = -40 - Math.random() * 160;
        }
        if (s.speed < 0 && s.x < -60) {
          s.x = W * TILE + 30 + Math.random() * 120;
        }
        s.faceDir = s.speed < 0 ? -1 : 1;
      }
      s.y = s.laneY;
      s.step += dt;
    });
    walkers.forEach(function (w) {
      if (w.bumpCd > 0) w.bumpCd -= dt;
      if (w.removed) return;
      if (w.fleeing) return;
      if (w.stopped || w.aiming || w.revealed) return;
      if (w.busy) return;
      w.x += w.dir * w.speed * dt;
      w.step += dt;
      w.timer += dt;
      if (w.timer > 0.2) {
        w.timer = 0;
        w.frame = 1 - w.frame;
      }
      w.faceDir = w.dir;
      if (!w.busy && !w.stopped && !w.aiming) {
        if (w.dir === 1 && w.x > W * TILE + 70) w.removed = true;
        if (w.dir === -1 && w.x < -70) w.removed = true;
      }
    });
    trimAndSpawnWalkers();
  }

  function drawPixel(x, y, w, h, c) {
    if (!drawCtx) return;
    drawCtx.fillStyle = c;
    drawCtx.fillRect(Math.floor(x), Math.floor(y), w, h);
  }

  function drawSidewalkTile(x, y, tx, ty, cracked) {
    const dec = walkDecor[ty] && walkDecor[ty][tx];
    const sprite = cracked
      ? SPR && SPR.sidewalkCracked
      : SPR && SPR.sidewalk;
    if (SPR && SPR.drawTile && sprite) {
      SPR.drawTile(drawCtx, sprite, x, y, TILE, TILE, {
        flipH: dec && dec.flipH,
        flipV: dec && dec.flipV,
        darken: true,
      });
      return;
    }
    drawPixel(x, y, TILE, TILE, cracked ? "#6a6864" : "#7a7874");
  }

  function drawDoorInWall(cam) {
    const dx = doorRect.x - cam.x;
    const dy = doorRect.y - cam.y;
    drawPixel(dx, dy, doorRect.w, doorRect.h, "#1a1410");
    drawPixel(dx + 4, dy + 2, doorRect.w - 8, doorRect.h - 4, "#2a2018");
    drawPixel(dx + doorRect.w - 10, dy + doorRect.h / 2 - 2, 4, 6, "#6a5a30");
    drawPixel(dx + 2, dy + 2, 2, doorRect.h - 4, "#0e0806");
    drawPixel(dx + doorRect.w - 4, dy + 2, 2, doorRect.h - 4, "#0e0806");
  }

  function drawHouse(cam) {
    const x = houseRect.x - cam.x;
    const y = houseRect.y - cam.y;
    drawPixel(x, y, houseRect.w, houseRect.h, "#4a4038");
    drawPixel(x + 4, y + 4, houseRect.w - 8, houseRect.h - 8, "#5a5048");
    drawPixel(x + 8, y + 8, houseRect.w - 16, 4, "#6a6058");
    for (let i = 0; i < 3; i++) {
      drawPixel(x + 16 + i * 28, y + 12, 12, 14, "#3a4858");
      drawPixel(x + 18 + i * 28, y + 14, 8, 8, "#6a8098");
    }
    drawPixel(x + houseRect.w / 2 - 20, y + houseRect.h - 4, 40, 4, "#3a3830");
    drawDoorInWall(cam);
  }

  function drawNeighbor(cam) {
    const x = 16 * TILE - cam.x;
    const y = 10 * TILE - cam.y;
    drawPixel(x, y, 12 * TILE, 5 * TILE, "#3a3834");
    drawPixel(x + 6, y + 8, 9 * TILE, 4, "#4a4844");
    for (let i = 0; i < 4; i++) {
      drawPixel(x + 12 + i * 22, y + 12, 10, 12, "#2a3848");
    }
  }

  function drawBlackMarketProps(cam) {
    const stalls = [
      { x: 4, y: 3, w: 3, h: 2, c: "#3a2838" },
      { x: 32, y: 2, w: 4, h: 2, c: "#2a2430" },
      { x: 38, y: 5, w: 3, h: 2, c: "#3a2834" },
    ];
    stalls.forEach(function (s) {
      const sx = s.x * TILE - cam.x;
      const sy = s.y * TILE - cam.y;
      drawPixel(sx, sy, s.w * TILE, s.h * TILE, s.c);
      drawPixel(sx + 4, sy + 4, s.w * TILE - 8, 8, "#5a4a58");
    });
    if (typeof Slots !== "undefined") {
      Slots.drawMachine(drawCtx, cam, slotMachine, false);
    } else {
      const bx = slotMachine.x - cam.x;
      const by = slotMachine.y - cam.y;
      drawPixel(bx, by, slotMachine.w, slotMachine.h, "#1a1428");
      drawPixel(bx + 8, by + 12, slotMachine.w - 16, slotMachine.h - 24, "#2a2238");
    }
  }

  function drawSniperTower(cam) {
    const x = SNIPER_TOWER.x - cam.x;
    const y = SNIPER_TOWER.y - cam.y;
    drawPixel(x - 12, y + 8, 40, 28, "#3a3834");
    drawPixel(x - 8, y, 32, 12, "#4a4844");
    drawPixel(x - 4, y - 10, 16, 14, "#2a2a30");
    drawPixel(x - 2, y - 14, 8, 6, "#1a1a20");
    drawPixel(x + 14, y + 4, 6, 20, "#2a3020");
  }

  function drawTroop(cam, s) {
    const x = s.x - cam.x;
    const y = s.y - cam.y;
    const leg = s.stopped ? 0 : Math.floor((s.step || 0) * 8) % 2;
    const left = s.faceDir === -1;
    const mw = 32;
    const p = function (ox, oy, w, h, c) {
      if (!left) drawPixel(x + ox, y + oy, w, h, c);
      else drawPixel(x + mw - ox - w, y + oy, w, h, c);
    };

    p(6, 28 + leg, 6, 10, "#1a1a22");
    p(16, 28 - leg, 6, 10, "#1a1a22");
    p(4, 14, 20, 16, "#4a5a38");
    p(4, 24, 20, 4, "#2a3020");
    p(8, 6, 12, 12, "#c8a888");
    p(6, 2, 16, 4, "#222820");
    p(8, -2, 12, 6, "#3a4034");
    p(12, 0, 4, 4, "#d42020");
    p(11, 1, 6, 2, "#d42020");
    p(13, -1, 2, 2, "#d42020");
    p(22, 4, 8, 20, "#2a3020");
    if (s.aiming || s.stopped) {
      if (!left) {
        drawPixel(x + 24, y + 16, 14, 6, "#c8a888");
        drawPixel(x + 34, y + 14, 10, 10, "#1a1a1a");
      } else {
        drawPixel(x - 2, y + 16, 14, 6, "#c8a888");
        drawPixel(x - 12, y + 14, 10, 10, "#1a1a1a");
      }
    }
  }

  function drawWalker(cam, w) {
    if (w.removed) return;
    const x = w.x - cam.x;
    const y = w.y - cam.y;
    const leg = w.frame;
    const left = w.faceDir === -1;
    const mw = 28;
    const p = function (ox, oy, ww, h, c) {
      if (!left) drawPixel(x + ox, y + oy, ww, h, c);
      else drawPixel(x + mw - ox - ww, y + oy, ww, h, c);
    };
    if (w.fleeing) {
      drawPixel(x - 2, y - 4, 28, 6, "rgba(255,80,80,0.5)");
    }
    p(8, 36 + leg, 6, 10, "#2a2a32");
    p(18, 36 - leg, 6, 10, "#2a2a32");
    p(6, 18, 20, 20, w.shirt);
    p(10, 6, 12, 14, "#e8c4a0");
    p(8, 4, 16, 6, "#3a2820");
    if (w.aiming || w.revealed) {
      if (!left) {
        drawPixel(x + 22, y + 18, 12, 5, "#e8c4a0");
        drawPixel(x + 30, y + 16, 8, 8, "#1a1a1a");
      } else {
        drawPixel(x - 4, y + 18, 12, 5, "#e8c4a0");
        drawPixel(x - 12, y + 16, 8, 8, "#1a1a1a");
      }
    }
  }

  function drawShady(cam) {
    if (shadyPassed) return;
    const x = shady.x - cam.x;
    const y = shady.y - cam.y;
    drawPixel(x + 8, y + 36, 6, 10, "#1a1a22");
    drawPixel(x + 18, y + 36, 6, 10, "#1a1a22");
    drawPixel(x + 6, y + 18, 20, 20, "#2a2830");
    drawPixel(x + 10, y + 6, 12, 14, "#9a8878");
    drawPixel(x + 8, y + 4, 16, 6, "#1a1418");
    drawPixel(x + 34, y + 20, 8, 14, "#3a3028");
  }

  function drawZoneFilters(cam) {
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const t = tileAt(tx, ty);
        const x = tx * TILE - cam.x;
        const y = ty * TILE - cam.y;
        if (t === T.BLACKMARKET) {
          drawCtx.fillStyle = "rgba(0,0,0,0.48)";
          drawCtx.fillRect(x, y, TILE, TILE);
        } else if (t === T.ALLEY) {
          drawCtx.fillStyle = "rgba(0,0,0,0.34)";
          drawCtx.fillRect(x, y, TILE, TILE);
        }
      }
    }
  }

  function drawJobHouse(cam) {
    const x = jobHouseRect.x - cam.x;
    const y = jobHouseRect.y - cam.y;
    const w = jobHouseRect.w;
    const h = jobHouseRect.h;

    drawPixel(x, y, w, h, "#4a4844");
    drawPixel(x + 3, y + 3, w - 6, h - 6, "#5a5450");
    drawPixel(x + 6, y + 6, w - 12, 4, "#6a6058");

    for (let i = 0; i < 3; i++) {
      const wx = x + 16 + i * 36;
      drawPixel(wx, y + 14, 14, 18, "#1e2838");
      drawPixel(wx + 2, y + 16, 10, 14, "#5a88b0");
      drawPixel(wx + 4, y + 18, 6, 8, "#9ac8f0");
      drawPixel(wx + 5, y + 20, 4, 4, "#d8ecff");
    }

    const dx = jobOutsideDoor.x - cam.x;
    const dy = jobOutsideDoor.y - cam.y;
    drawPixel(dx, dy, jobOutsideDoor.w, jobOutsideDoor.h, "#2a2018");
    drawPixel(dx + 8, dy + 4, jobOutsideDoor.w - 16, jobOutsideDoor.h - 8, "#1a1410");
    drawPixel(dx + jobOutsideDoor.w / 2 - 4, dy + jobOutsideDoor.h / 2 - 3, 8, 10, "#c8a040");

    drawPixel(x + w / 2 - 36, y - 12, 72, 10, "#3a3834");
    drawPixel(x + w / 2 - 28, y - 10, 56, 8, "#5a5048");
    if (drawCtx) {
      drawCtx.fillStyle = "#e8dcc8";
      drawCtx.font = "10px monospace";
      drawCtx.fillText("DISH JOB", x + w / 2 - 28, y - 2);
    }
  }

  function drawFloor(cam) {
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const t = tileAt(tx, ty);
        const x = tx * TILE - cam.x;
        const y = ty * TILE - cam.y;
        if (t === T.WALL) {
          drawPixel(x, y, TILE, TILE, "#1a1818");
        } else if (t === T.HIGHWAY) {
          const stripe = ty % 2 === 0 ? "#454550" : "#383840";
          drawPixel(x, y, TILE, TILE, stripe);
          if (tx % 4 === 0) drawPixel(x + 4, y + 12, 12, 4, "#5a5a62");
        } else if (t === T.CROSSWALK) {
          drawPixel(x, y, TILE, TILE, ty % 2 === 0 ? "#454550" : "#383840");
          drawPixel(x + 4, y + 2, TILE - 8, TILE - 4, "#f0f0f4");
        } else if (t === T.SIDEWALK_CRACKED) {
          drawSidewalkTile(x, y, tx, ty, true);
        } else if (t === T.SIDEWALK) {
          drawSidewalkTile(x, y, tx, ty, false);
        } else if (t === T.BLACKMARKET) {
          drawPixel(x, y, TILE, TILE, (tx + ty) % 2 === 0 ? "#2a2230" : "#241c28");
        } else if (t === T.ALLEY) {
          drawPixel(x, y, TILE, TILE, "#1c1a24");
        } else if (t === T.GRASS) {
          drawPixel(x, y, TILE, TILE, (tx + ty) % 2 === 0 ? "#2a4a2a" : "#244424");
        } else if (t === T.SOUTH_WALK) {
          drawSidewalkTile(x, y, tx, ty, false);
        } else if (t === T.JOB_HOUSE) {
          drawPixel(x, y, TILE, TILE, (tx + ty) % 2 === 0 ? "#4a4840" : "#424038");
        } else if (t === T.MY_HOUSE || t === T.NEIGHBOR) {
          drawPixel(x, y, TILE, TILE, "#3a3834");
        }
      }
    }
  }

  function draw(ctx, cam, player) {
    drawCtx = ctx;
    drawFloor(cam);
    drawZoneFilters(cam);
    drawBlackMarketProps(cam);
    drawSniperTower(cam);
    drawHouse(cam);
    drawNeighbor(cam);
    drawJobHouse(cam);
    troops.forEach(function (s) {
      drawTroop(cam, s);
    });
    walkers.forEach(function (w) {
      if (w.removed) return;
      if (w.pedType === "guard" || w.revealed) drawTroop(cam, w);
      else drawWalker(cam, w);
    });
    drawShady(cam);
    drawCtx = null;
  }

  global.Outdoors = {
    TILE,
    W,
    H,
    TILE_SIZE: TILE,
    SNIPER_TOWER,
    spawn: { x: 7 * TILE, y: 16 * TILE + 4 },
    outsideDoor,
    doorRect,
    shady,
    slotMachine,
    jobOutsideDoor,
    jobHouseRect,
    jobSpawn,
    get tiles() {
      return tiles;
    },
    init: function () {
      buildWalkDecor();
      buildMap();
      initNPCs();
    },
    reset,
    tileAt,
    playerOnTile,
    playerOnDangerRoad,
    isShadyBlocking,
    getSolids,
    checkGuardBump,
    troopBox,
    resumeTroopPatrol,
    faceToward,
    updateFacing,
    walkerBox,
    getNearestTroop,
    isOnHighway,
    pushWalkerToRoad,
    updateWalkerFlee,
    get walkers() {
      return walkers;
    },
    get troops() {
      return troops;
    },
    update,
    draw,
    setShadyPassed: function (v) {
      shadyPassed = v;
    },
    get shadyPassed() {
      return shadyPassed;
    },
  };

  buildWalkDecor();
  buildMap();
  initNPCs();
})(typeof window !== "undefined" ? window : global);
