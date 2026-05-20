(function () {
  "use strict";

  const TILE = 32;
  const SCALE = 1;
  const VIEW_W = 640;
  const VIEW_H = 360;
  const ROOM_PLAYER = { w: 64, h: 64, speed: 95 };
  const OUT_PLAYER = { w: 32, h: 48, speed: 85 };

  const canvas = document.getElementById("game");
  if (!canvas) {
    document.getElementById("load-error")?.classList.remove("hidden");
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    document.getElementById("load-error")?.classList.remove("hidden");
    return;
  }
  ctx.imageSmoothingEnabled = false;

  const dialogUi = document.getElementById("dialog-ui");
  const dialogText = document.getElementById("dialog-text");
  const dialogArrow = document.getElementById("dialog-arrow");
  const fadeOverlay = document.getElementById("fade-overlay");
  const controlsHint = document.getElementById("controls-hint");
  const ePrompt = document.getElementById("e-prompt");
  const moneyUi = document.getElementById("money-ui");

  const keys = {};
  let state = "intro";
  let introStep = 0;
  let fade = { active: false, from: 0, to: 0, t: 0, duration: 1, onDone: null };
  let doorExitStep = 0;
  let doorEnterStep = 0;
  let mapId = "room";
  let typewriter = { full: "", shown: 0, speed: 38, done: false, lastChar: 0 };
  let showControlsUntil = 0;
  let doorUsed = false;
  let radioChannel = 1;
  let screenShake = 0;
  let hasSalt = false;
  let playerDown = false;
  let money = 12;

  const sniper = {
    aiming: false,
    timer: 0,
    delay: 0.5,
    line: null,
  };

  const guardShot = {
    guard: null,
    timer: 0,
    aimDelay: 0.38,
  };

  const guardBribe = {
    active: false,
    guard: null,
    timer: 0,
    window: 2.0,
    demand: 0,
    phase: "none",
  };

  let radioGoonPlaying = false;

  const SPR = typeof GameSprites !== "undefined" ? GameSprites : null;
  const OUT = typeof Outdoors !== "undefined" ? Outdoors : null;
  const SLOTS = typeof Slots !== "undefined" ? Slots : null;

  const saltBag = {
    x: 4 * TILE,
    y: 9 * TILE,
    w: 28,
    h: 28,
    taken: false,
    interactPad: 32,
  };

  const INTRO_LINES = [
    { text: "* I cant stop having bad dreams..." },
    { text: "* Press Z to wake up." },
  ];

  const WAKE_LINES = [
    { text: "* You wake up in bed..." },
    { text: "* Press Z to get up." },
  ];

  const player = {
    x: 180,
    y: 200,
    w: ROOM_PLAYER.w,
    h: ROOM_PLAYER.h,
    speed: ROOM_PLAYER.speed,
    facing: "down",
    walkFrame: 0,
    walkTimer: 0,
    moving: false,
    frozen: true,
  };

  const bed = {
    x: 28,
    y: 28,
    w: SPR ? SPR.bedSize.w : 112,
    h: SPR ? SPR.bedSize.h : 88,
    interactPad: 40,
  };

  const radioTable = {
    x: 14 * TILE - (SPR ? SPR.radioSize.w : 88) - 14,
    y: 8 * TILE,
    w: SPR ? SPR.radioSize.w : 88,
    h: SPR ? SPR.radioSize.h : 80,
    interactPad: 44,
    destroyed: false,
  };

  const crater = {
    active: false,
    x: 0,
    y: 0,
    w: SPR ? SPR.craterSize.w : 128,
    h: SPR ? SPR.craterSize.h : 128,
  };

  const knockback = { active: false, vx: 0, vy: 0, t: 0, duration: 0.55 };

  const door = {
    x: 6 * TILE,
    y: 11 * TILE,
    w: 2 * TILE,
    h: TILE,
    interactPad: 36,
  };

  const cobweb = {
    x: 14 * TILE - (SPR ? SPR.cobwebSize.w : 96) - 6,
    y: 10,
    w: SPR ? SPR.cobwebSize.w : 96,
    h: SPR ? SPR.cobwebSize.h : 88,
  };

  const roomMap = {
    w: 14,
    h: 12,
    tiles: buildRoomTiles(),
    bed,
  };


  function buildRoomTiles() {
    const t = [];
    for (let y = 0; y < 12; y++) {
      const row = [];
      for (let x = 0; x < 14; x++) {
        if (y === 0 || x === 0 || y === 11 || x === 13) row.push(1);
        else if (y === 11 && x >= 6 && x <= 7) row.push(3);
        else row.push(0);
      }
      t.push(row);
    }
    return t;
  }

  const ROOM_SPAWN = { x: 180, y: 200 };

  function updateMoneyUi() {
    if (!moneyUi) return;
    moneyUi.textContent = "₩ " + money;
    moneyUi.classList.toggle("hidden", mapId !== "outside");
  }

  function centerPlayerOnResize(oldW, oldH) {
    const cx = player.x + oldW / 2;
    const cy = player.y + oldH / 2;
    player.x = cx - player.w / 2;
    player.y = cy - player.h / 2;
  }

  function applyPlayerSizeForMap() {
    const oldW = player.w;
    const oldH = player.h;
    if (mapId === "outside") {
      player.w = OUT_PLAYER.w;
      player.h = OUT_PLAYER.h;
      player.speed = OUT_PLAYER.speed;
    } else {
      player.w = ROOM_PLAYER.w;
      player.h = ROOM_PLAYER.h;
      player.speed = ROOM_PLAYER.speed;
    }
    centerPlayerOnResize(oldW, oldH);
  }

  function resetSniper() {
    sniper.aiming = false;
    sniper.timer = 0;
    sniper.line = null;
    guardShot.guard = null;
    guardShot.timer = 0;
    guardBribe.active = false;
    guardBribe.phase = "none";
    guardBribe.guard = null;
  }

  function placePlayerOnBed() {
    applyPlayerSizeForMap();
    player.x = bed.x + bed.w / 2 - player.w / 2;
    player.y = bed.y + 14;
    player.facing = "up";
    let tries = 0;
    while (isSolid(roomMap, player.x, player.y) && tries < 30) {
      player.y += 8;
      tries++;
    }
  }

  function placePlayerAtInsideDoor() {
    applyPlayerSizeForMap();
    player.x = 6 * TILE + 14;
    player.y = 10 * TILE + 28;
    player.facing = "up";
    let tries = 0;
    while (isSolid(roomMap, player.x, player.y) && tries < 30) {
      player.y -= 8;
      tries++;
    }
    if (isSolid(roomMap, player.x, player.y)) {
      player.x = 6 * TILE + 14;
      player.y = 8 * TILE + 40;
    }
  }

  function placePlayerSafeInRoom() {
    placePlayerOnBed();
  }

  function beginWakeLine() {
    const line = WAKE_LINES[introStep];
    if (!line) return;
    typewriter.full = line.text;
    typewriter.shown = 0;
    typewriter.done = false;
    typewriter.lastChar = 0;
    dialogText.textContent = "";
    dialogArrow.classList.add("hidden");
    dialogUi.classList.remove("hidden");
  }

  function startWakeInBed() {
    Sound.stopRadioGoon();
    radioGoonPlaying = false;
    mapId = "room";
    doorUsed = false;
    doorExitStep = 0;
    doorEnterStep = 0;
    playerDown = false;
    player.frozen = true;
    knockback.active = false;
    clearFade();
    hasSalt = false;
    saltBag.taken = false;
    radioTable.destroyed = false;
    crater.active = false;
    if (OUT) OUT.reset();
    resetSniper();
    placePlayerOnBed();
    updateMoneyUi();
    introStep = 0;
    state = "wake";
    beginWakeLine();
  }

  function advanceWake() {
    Sound.init();
    if (!typewriter.done) {
      typewriter.shown = typewriter.full.length;
      typewriter.done = true;
      dialogText.textContent = typewriter.full;
      dialogArrow.classList.remove("hidden");
      Sound.confirm();
      return;
    }
    introStep++;
    if (introStep < WAKE_LINES.length) {
      beginWakeLine();
      Sound.confirm();
      return;
    }
    dialogUi.classList.add("hidden");
    state = "play";
    player.frozen = false;
    Sound.confirm();
  }

  const Sound = {
    ctx: null,
    ready: false,
    sniper: null,
    radioGoon: null,
    init() {
      if (this.ready) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.ready = true;
      } catch (_) {}
      if (!this.sniper) {
        this.sniper = new Audio("assets/sniper.mp3");
        this.sniper.volume = 0.85;
        this.sniper.preload = "auto";
      }
      if (!this.radioGoon) {
        this.radioGoon = new Audio("assets/kim-jong-un-goon.mp3");
        this.radioGoon.loop = true;
        this.radioGoon.volume = 0.88;
        this.radioGoon.preload = "auto";
      }
    },
    playRadioGoon() {
      this.init();
      if (!this.radioGoon) return;
      this.radioGoon.currentTime = 0;
      this.radioGoon.play().catch(function () {});
    },
    stopRadioGoon() {
      if (!this.radioGoon) return;
      this.radioGoon.pause();
      this.radioGoon.currentTime = 0;
    },
    play(freq, dur, vol, type) {
      if (!this.ready || !this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || "square";
      osc.frequency.value = freq;
      gain.gain.value = vol || 0.06;
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + dur);
    },
    blip() {
      this.play(440 + Math.random() * 80, 0.05, 0.05);
    },
    confirm() {
      this.play(660, 0.08, 0.07);
    },
    interact() {
      this.play(520, 0.1, 0.08);
    },
    door() {
      this.play(220, 0.2, 0.1, "sawtooth");
    },
    step() {
      this.play(180, 0.03, 0.025);
    },
    staticTune() {
      this.play(90 + Math.random() * 40, 0.12, 0.04, "sawtooth");
    },
    explosion() {
      if (!this.ready || !this.ctx) return;
      const t = this.ctx.currentTime;
      const noise = this.ctx.createBufferSource();
      const len = this.ctx.sampleRate * 0.4;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      noise.buffer = buf;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      noise.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(t);
      noise.stop(t + 0.45);
      this.play(80, 0.35, 0.12, "sawtooth");
    },
    gunshot() {
      this.init();
      if (this.sniper) {
        const s = this.sniper.cloneNode();
        s.volume = 0.85;
        s.currentTime = 0;
        s.play().catch(function () {
          Sound.gunshotFallback();
        });
        return;
      }
      this.gunshotFallback();
    },
    gunshotFallback() {
      if (!this.ready || !this.ctx) return;
      const t = this.ctx.currentTime;
      const noise = this.ctx.createBufferSource();
      const len = Math.floor(this.ctx.sampleRate * 0.15);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      noise.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      noise.connect(g);
      g.connect(this.ctx.destination);
      noise.start(t);
      noise.stop(t + 0.12);
      this.play(120, 0.06, 0.15, "sawtooth");
    },
  };

  function getMap() {
    if (mapId === "room") return roomMap;
    return { w: OUT ? OUT.W : 48, h: OUT ? OUT.H : 28, tiles: OUT ? OUT.tiles : [] };
  }

  function tileAt(map, tx, ty) {
    if (mapId === "outside" && OUT) return OUT.tileAt(tx, ty);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return 1;
    return map.tiles[ty][tx];
  }

  function getSolids(map) {
    if (mapId === "outside" && OUT) return OUT.getSolids();
    const solids = [];
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const t = tileAt(map, tx, ty);
        if (t === 1 || t === 3) {
          solids.push({ x: tx * TILE, y: ty * TILE, w: TILE, h: TILE });
        }
      }
    }
    if (mapId === "room") {
      solids.push({ x: bed.x, y: bed.y, w: bed.w, h: bed.h });
      if (!radioTable.destroyed) {
        solids.push({ x: radioTable.x, y: radioTable.y, w: radioTable.w, h: radioTable.h });
      }
    }
    return solids;
  }

  function isSolid(map, px, py) {
    const margin = 4;
    const box = {
      x: px + margin,
      y: py + margin,
      w: player.w - margin * 2,
      h: player.h - margin * 2,
    };
    for (const s of getSolids(map)) {
      if (rectsOverlap(box, s)) return true;
    }
    return false;
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function dist(a, b) {
    return Math.hypot(
      a.x + a.w / 2 - (b.x + b.w / 2),
      a.y + a.h / 2 - (b.y + b.h / 2)
    );
  }

  function distToRect(px, py, r) {
    const cx = Math.max(r.x, Math.min(px, r.x + r.w));
    const cy = Math.max(r.y, Math.min(py, r.y + r.h));
    return Math.hypot(px - cx, py - cy);
  }

  function getInteractZone(obj) {
    const pad = obj.interactPad || 28;
    return {
      x: obj.x - pad,
      y: obj.y - pad,
      w: obj.w + pad * 2,
      h: obj.h + pad * 2,
    };
  }

  function getInteractables() {
    const list = [];
    if (mapId === "room" && !doorUsed) {
      list.push({ id: "door", obj: door, action: useDoor });
    }
    if (mapId === "room") {
      list.push({ id: "bed", obj: bed, action: examineBed });
    }
    if (mapId === "room" && !radioTable.destroyed) {
      list.push({ id: "radio", obj: radioTable, action: openRadio });
    }
    if (mapId === "room" && !saltBag.taken) {
      list.push({ id: "salt", obj: saltBag, action: takeSalt });
    }
    if (mapId === "outside" && OUT) {
      list.push({
        id: "enter",
        obj: OUT.outsideDoor,
        reach: 42,
        action: useEnterHouse,
      });
      list.push({ id: "slots", obj: OUT.slotMachine, action: openSlots });
      if (!OUT.shadyPassed) {
        list.push({ id: "shady", obj: OUT.shady, action: talkShady });
      }
    }
    return list;
  }

  function findNearestInteractable() {
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    let best = null;
    let bestDist = Infinity;
    for (const item of getInteractables()) {
      const zone = getInteractZone(item.obj);
      const reach = item.reach != null ? item.reach : Math.max(40, Math.min(zone.w, zone.h) * 0.45);
      const d = distToRect(px, py, zone);
      if (d > reach) continue;
      if (d < bestDist) {
        bestDist = d;
        best = item;
      }
    }
    return best;
  }

  function takeSalt() {
    saltBag.taken = true;
    hasSalt = true;
    player.frozen = true;
    state = "dialog";
    typewriter.full = "* You picked up a bag of salt.";
    typewriter.shown = 0;
    typewriter.done = false;
    typewriter.lastChar = 0;
    dialogText.textContent = "";
    dialogArrow.classList.add("hidden");
    dialogUi.classList.remove("hidden");
    Sound.confirm();
  }

  function talkShady() {
    player.frozen = true;
    state = "dialog";
    if (hasSalt) {
      OUT.setShadyPassed(true);
      money += 5;
      updateMoneyUi();
      typewriter.full =
        "* Shady Slim eyes the bag.\n* ...aight. Go on then.\n* Dont tell nobody you saw me.\n* (+₩5)";
    } else {
      typewriter.full =
        "* Shady Slim blocks the alley between the houses.\n* You aint goin further without a bag of salt for me.";
    }
    typewriter.shown = 0;
    typewriter.done = false;
    typewriter.lastChar = 0;
    dialogText.textContent = "";
    dialogArrow.classList.add("hidden");
    dialogUi.classList.remove("hidden");
    Sound.interact();
  }

  function triggerShotDeath() {
    if (playerDown || state === "dead") return;
    sniper.aiming = false;
    sniper.timer = 0;
    playerDown = true;
    player.frozen = true;
    player.moving = false;
    state = "dead";
    Sound.gunshot();
    screenShake = 0.5;
    typewriter.full =
      "* A sniper line cuts you down!\n* You collapse...\n* Press Z to wake up in bed.\n* Use the crosswalk to cross safely.";
    typewriter.shown = 0;
    typewriter.done = false;
    typewriter.lastChar = 0;
    dialogText.textContent = "";
    dialogArrow.classList.add("hidden");
    dialogUi.classList.remove("hidden");
    ePrompt.classList.add("hidden");
  }

  function resetToBed() {
    startWakeInBed();
  }

  function shotLineFromTower() {
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const tower = OUT && OUT.SNIPER_TOWER ? OUT.SNIPER_TOWER : { x: px, y: 0 };
    return { x1: tower.x, y1: tower.y, x2: px, y2: py };
  }

  function fireSniperShot() {
    sniper.line = shotLineFromTower();
    sniper.aiming = false;
    sniper.timer = 0;
    Sound.init();
    Sound.gunshot();
    triggerShotDeath();
  }

  function endCitizenTalk(cooldownWalker) {
    const w = citizenTalk.walker;
    if (w) {
      w.busy = false;
      w.fleeing = false;
      if (cooldownWalker) w.bumpCd = 10;
    }
    citizenTalk.active = false;
    citizenTalk.walker = null;
    citizenTalk.phase = "none";
    citizenTalk.tipTimer = 0;
    citizenTalk.tipRolled = false;
    if (state === "dialog" && !radioGoonPlaying) {
      state = "play";
      player.frozen = false;
      dialogUi.classList.add("hidden");
    }
  }

  function showCitizenDialog(text) {
    if (!dialogUi || !dialogText) return;
    state = "dialog";
    player.frozen = true;
    typewriter.full = text;
    typewriter.shown = text.length;
    typewriter.done = true;
    typewriter.lastChar = text.length;
    dialogText.textContent = text;
    dialogArrow.classList.remove("hidden");
    dialogUi.classList.remove("hidden");
    dialogUi.style.display = "";
    ePrompt.classList.add("hidden");
  }

  function startCitizenTalk(walker) {
    if (!walker || walker.removed) return;
    if (!canTalkToCitizens()) return;
    citizenTalk.active = true;
    citizenTalk.walker = walker;
    citizenTalk.phase = "talk";
    citizenTalk.agreed = false;
    walker.busy = true;
    Sound.init();
    Sound.interact();
    showCitizenDialog(
      '* You stop them on the sidewalk.\n* [Z] "I hate the dictator"\n* [X] Let them go'
    );
  }

  function rollDictatorTalk() {
    const w = citizenTalk.walker;
    if (!w) return;
    if (Math.random() < 0.75) {
      citizenTalk.agreed = true;
      citizenTalk.phase = "agreed_choice";
      showCitizenDialog(
        '* They nod slowly.\n* "Yeah... I hate him too."\n* [Z] Snitch to a guard\n* [X] Say nothing and leave'
      );
    } else {
      citizenTalk.agreed = false;
      citizenTalk.phase = "disagree_flee";
      showCitizenDialog(
        '* Their eyes go wide.\n* "TRAITOR!"\n* They bolt toward a guard!'
      );
      window.setTimeout(function () {
        if (citizenTalk.phase !== "disagree_flee") return;
        w.fleeing = true;
        w.busy = true;
        state = "play";
        player.frozen = false;
        dialogUi.classList.add("hidden");
      }, 1400);
    }
  }

  function startCitizenSnitchRun() {
    citizenTalk.phase = "snitch_run";
    state = "play";
    player.frozen = false;
    dialogUi.classList.add("hidden");
    Sound.confirm();
  }

  function startCitizenAgreedNothing() {
    const w = citizenTalk.walker;
    citizenTalk.phase = "tip_wait";
    citizenTalk.tipTimer = 0;
    citizenTalk.tipRolled = false;
    if (w) {
      w.busy = false;
      w.fleeing = false;
    }
    state = "play";
    player.frozen = false;
    dialogUi.classList.add("hidden");
    Sound.confirm();
  }

  function fireNpcSniperAt(wx, wy) {
    const tower = OUT && OUT.SNIPER_TOWER ? OUT.SNIPER_TOWER : { x: wx, y: 0 };
    npcShot.line = { x1: tower.x, y1: tower.y, x2: wx, y2: wy };
    npcShot.timer = 0;
    npcShot.active = true;
    Sound.init();
    Sound.gunshot();
    screenShake = 0.35;
  }

  function killCitizenWalker(walker) {
    if (!walker) return;
    fireNpcSniperAt(walker.x + 14, walker.y + 22);
    walker.removed = true;
    walker.busy = false;
    walker.fleeing = false;
  }

  function resolveCitizenSnitch() {
    const w = citizenTalk.walker;
    if (!w || citizenTalk.phase !== "snitch_run" || !OUT) return;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    let guard = null;
    let bestD = 80;
    OUT.troops.forEach(function (g) {
      const d = Math.hypot(g.x + 16 - px, g.y + 20 - py);
      if (d < bestD) {
        bestD = d;
        guard = g;
      }
    });
    if (!guard) return;

    killCitizenWalker(w);
    const reward = Math.floor(Math.random() * 9) + 10;
    money += reward;
    updateMoneyUi();
    Sound.confirm();

    if (Math.random() < 0.1) {
      state = "dialog";
      player.frozen = true;
      typewriter.full =
        '* Guard: "You\'re snitching too?"\n* He turns the gun on YOU...';
      typewriter.shown = 0;
      typewriter.done = false;
      dialogText.textContent = "";
      dialogArrow.classList.add("hidden");
      dialogUi.classList.remove("hidden");
      window.setTimeout(function () {
        endCitizenTalk(false);
        startGuardShot(guard);
      }, 1600);
      return;
    }

    state = "dialog";
    player.frozen = true;
    typewriter.full =
      "* The guard nods.\n* A sniper line erases your \"friend.\"\n* (+₩" +
      reward +
      " reward)";
    typewriter.shown = 0;
    typewriter.done = false;
    dialogText.textContent = "";
    dialogArrow.classList.add("hidden");
    dialogUi.classList.remove("hidden");
    endCitizenTalk(true);
  }

  function tryPushFleeingCitizen() {
    const w = citizenTalk.walker;
    if (!w || citizenTalk.phase !== "disagree_flee" || !w.fleeing || w.removed || !OUT) return false;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const dist = Math.hypot(px - (w.x + 12), py - (w.y + 20));
    if (dist > 46) return false;

    OUT.pushWalkerToRoad(w);
    killCitizenWalker(w);
    state = "dialog";
    player.frozen = true;
    typewriter.full =
      "* You shove them onto the highway.\n* The sniper tower does the rest.";
    typewriter.shown = 0;
    typewriter.done = false;
    dialogText.textContent = "";
    dialogArrow.classList.add("hidden");
    dialogUi.classList.remove("hidden");
    Sound.confirm();
    endCitizenTalk(true);
    return true;
  }

  function distToNearestGuard() {
    if (!OUT) return Infinity;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    let best = Infinity;
    OUT.troops.forEach(function (g) {
      const d = Math.hypot(g.x + 16 - px, g.y + 20 - py);
      if (d < best) best = d;
    });
    return best;
  }

  function distToCitizenWalker() {
    const w = citizenTalk.walker;
    if (!w || w.removed) return Infinity;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    return Math.hypot(px - (w.x + 12), py - (w.y + 20));
  }

  function updateCitizenTalk(dt) {
    if (!citizenTalk.active || !OUT) return;

    if (npcShot.active) {
      npcShot.timer += dt;
      if (npcShot.timer >= npcShot.duration) {
        npcShot.active = false;
        npcShot.line = null;
      }
    }

    if (citizenTalk.phase === "tip_wait") {
      citizenTalk.tipTimer += dt;
      if (!citizenTalk.tipRolled && citizenTalk.tipTimer >= 1.6) {
        citizenTalk.tipRolled = true;
        if (Math.random() < 0.7) {
          const tip = Math.floor(Math.random() * 5) + 3;
          money += tip;
          updateMoneyUi();
          state = "dialog";
          player.frozen = true;
          typewriter.full =
            '* They slip you a few won.\n* "Keep your mouth shut."\n* (+₩' +
            tip +
            ")";
          typewriter.shown = 0;
          typewriter.done = false;
          dialogText.textContent = "";
          dialogArrow.classList.add("hidden");
          dialogUi.classList.remove("hidden");
          Sound.confirm();
          endCitizenTalk(true);
        } else {
          endCitizenTalk(true);
        }
      }
      if (citizenTalk.tipTimer >= 5) endCitizenTalk(true);
    }

    if (citizenTalk.phase === "disagree_flee" && citizenTalk.walker && citizenTalk.walker.fleeing) {
      const reached = OUT.updateWalkerFlee(citizenTalk.walker, dt);
      if (reached && !citizenTalk.walker.removed) {
        const g = reached;
        citizenTalk.walker.fleeing = false;
        killCitizenWalker(citizenTalk.walker);
        endCitizenTalk(false);
        startGuardEncounter(g);
      }
    }
  }

  function drawCitizenDialogHud() {
    if (!citizenTalk.active || !typewriter.full) return;
    const lines = typewriter.full.split("\n");
    const boxH = 20 + lines.length * 16;
    const y0 = VIEW_H - boxH - 8;
    ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
    ctx.fillRect(8, y0, VIEW_W - 16, boxH);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.strokeRect(10, y0 + 2, VIEW_W - 20, boxH - 4);
    ctx.fillStyle = "#fff";
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    lines.forEach(function (line, i) {
      ctx.fillText(line.replace(/^\* /, ""), 20, y0 + 22 + i * 16);
    });
    ctx.textAlign = "left";
  }

  function drawCitizenHint() {
    if (!citizenTalk.active || state === "dialog") return;
    let hint = "";
    if (citizenTalk.phase === "snitch_run") {
      if (distToNearestGuard() < 80) {
        hint = "Near a guard — press [Z] to snitch! (+₩10-18, 10% YOU get shot)";
      } else {
        hint = "Run to a guard and press [Z] to report them";
      }
    } else if (citizenTalk.phase === "disagree_flee" && citizenTalk.walker && citizenTalk.walker.fleeing) {
      if (distToCitizenWalker() < 46) {
        hint = "Press [Z] to shove them onto the road!";
      } else {
        hint = "Catch them before they reach a guard! [Z] to push on road";
      }
    }
    if (!hint) return;
    ctx.fillStyle = "rgba(10, 8, 16, 0.82)";
    ctx.fillRect(8, 8, VIEW_W - 16, 30);
    ctx.strokeStyle = "#e8c030";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, VIEW_W - 16, 30);
    ctx.fillStyle = "#f0e8d8";
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    ctx.fillText(hint, 16, 28);
  }

  function onCitizenKey(e) {
    if (!citizenTalk.active || state !== "dialog") return false;
    const phase = citizenTalk.phase;

    if (phase === "talk") {
      if (e.key === "z" || e.key === "Z" || e.key === "Enter") {
        rollDictatorTalk();
        e.preventDefault();
        return true;
      }
      if (e.key === "x" || e.key === "X" || e.key === "Escape") {
        endCitizenTalk(true);
        Sound.confirm();
        e.preventDefault();
        return true;
      }
    }

    if (phase === "agreed_choice") {
      if (e.key === "z" || e.key === "Z") {
        showCitizenDialog("* Run to a guard and press [Z] to turn them in.");
        citizenTalk.phase = "snitch_confirm";
        e.preventDefault();
        return true;
      }
      if (e.key === "x" || e.key === "X") {
        startCitizenAgreedNothing();
        e.preventDefault();
        return true;
      }
    }

    if (phase === "snitch_confirm") {
      if (e.key === "z" || e.key === "Z" || e.key === "Enter") {
        startCitizenSnitchRun();
        e.preventDefault();
        return true;
      }
    }

    return false;
  }

  function startGuardEncounter(guard) {
    if (guardShot.guard || guardBribe.active || playerDown) return;
    if (citizenTalk.active) endCitizenTalk(false);
    guard.stopped = true;
    guard.aiming = false;
    guard.speed = 0;
    guardBribe.active = true;
    guardBribe.guard = guard;
    guardBribe.timer = 0;
    guardBribe.demand = Math.floor(Math.random() * 10) + 1;
    guardBribe.phase = "prompt";
    player.frozen = true;
    dialogUi.classList.remove("hidden");
    dialogText.textContent = "* GUARD! Quick — press [Z] to bribe!";
    dialogArrow.classList.add("hidden");
    typewriter.done = true;
    ePrompt.classList.add("hidden");
  }

  function updateGuardBribe(dt) {
    if (!guardBribe.active || guardBribe.phase !== "prompt") return;
    guardBribe.timer += dt;
    const left = Math.max(0, guardBribe.window - guardBribe.timer);
    dialogText.textContent =
      "* GUARD caught you!\n* Press [Z] to bribe! (" + left.toFixed(1) + "s left)";
    if (guardBribe.timer >= guardBribe.window) {
      guardBribeTimeout();
    }
  }

  function guardBribeTimeout() {
    const g = guardBribe.guard;
    guardBribe.active = false;
    guardBribe.phase = "none";
    guardBribe.guard = null;
    dialogUi.classList.add("hidden");
    if (g) startGuardShot(g);
  }

  function openGuardBribeOffer() {
    guardBribe.phase = "offer";
    state = "bribe";
    player.frozen = true;
    typewriter.full =
      '* Guard: "Pay me ₩' +
      guardBribe.demand +
      '... maybe I see nothing."\n* [Z] pay   [X] refuse';
    typewriter.shown = 0;
    typewriter.done = false;
    typewriter.lastChar = 0;
    dialogText.textContent = "";
    dialogArrow.classList.add("hidden");
    dialogUi.classList.remove("hidden");
    Sound.interact();
  }

  function resolveGuardBribe(paid) {
    const g = guardBribe.guard;
    const demand = guardBribe.demand;
    guardBribe.active = false;
    guardBribe.phase = "none";
    guardBribe.guard = null;

    if (!paid) {
      state = "play";
      player.frozen = false;
      dialogUi.classList.add("hidden");
      if (g) startGuardShot(g);
      return;
    }

    if (money < demand) {
      state = "dialog";
      typewriter.full =
        "* You only have ₩" + money + "...\n* The guard is not amused.";
      typewriter.shown = 0;
      typewriter.done = false;
      dialogText.textContent = "";
      dialogArrow.classList.add("hidden");
      dialogUi.classList.remove("hidden");
      window.setTimeout(function () {
        if (g) startGuardShot(g);
      }, 1200);
      return;
    }

    money -= demand;
    updateMoneyUi();
    const success = Math.random() < 0.7;

    if (success && g) {
      g.stopped = false;
      g.aiming = false;
      g.speed = 40;
      g.x += g.x < player.x ? -90 : 90;
      state = "dialog";
      player.frozen = true;
      typewriter.full =
        "* He shoves the ₩" +
        demand +
        " in his pocket.\n* ...aight. Get lost.";
      typewriter.shown = 0;
      typewriter.done = false;
      dialogText.textContent = "";
      dialogArrow.classList.add("hidden");
      dialogUi.classList.remove("hidden");
      Sound.confirm();
    } else {
      state = "dialog";
      typewriter.full =
        "* He takes your ₩" +
        demand +
        "...\n* ...and shoots you anyway.";
      typewriter.shown = 0;
      typewriter.done = false;
      dialogText.textContent = "";
      dialogArrow.classList.add("hidden");
      dialogUi.classList.remove("hidden");
      window.setTimeout(function () {
        if (g) startGuardShot(g);
      }, 1400);
    }
  }

  function advanceBribeDialog() {
    Sound.init();
    if (!typewriter.done) {
      typewriter.shown = typewriter.full.length;
      typewriter.done = true;
      dialogText.textContent = typewriter.full;
      dialogArrow.classList.remove("hidden");
      Sound.confirm();
      return;
    }
    dialogUi.classList.add("hidden");
    state = "play";
    player.frozen = false;
    Sound.confirm();
  }

  function tryQuickGuardBribe() {
    if (!guardBribe.active || guardBribe.phase !== "prompt") return false;
    openGuardBribeOffer();
    return true;
  }

  function startGuardShot(guard) {
    if (guardShot.guard || playerDown) return;
    guardBribe.active = false;
    guardBribe.phase = "none";
    guardBribe.guard = null;
    guard.stopped = true;
    guard.aiming = true;
    guard.speed = 0;
    guardShot.guard = guard;
    guardShot.timer = 0;
    player.frozen = true;
    dialogUi.classList.add("hidden");
  }

  function updateGuardShot(dt) {
    if (!guardShot.guard) return;
    guardShot.timer += dt;
    if (guardShot.timer >= guardShot.aimDelay) {
      const g = guardShot.guard;
      const px = player.x + player.w / 2;
      const py = player.y + player.h / 2;
      sniper.line = {
        x1: g.x + 20,
        y1: g.y + 18,
        x2: px,
        y2: py,
      };
      guardShot.guard = null;
      Sound.init();
      Sound.gunshot();
      triggerShotDeath();
    }
  }

  function updateSniper(dt) {
    if (mapId !== "outside" || playerDown) {
      if (state !== "dead") {
        if (!guardShot.guard) resetSniper();
      }
      return;
    }

    updateGuardBribe(dt);
    if (guardBribe.active) return;

    if (state !== "play") {
      if (state !== "dead" && !guardShot.guard) resetSniper();
      return;
    }

    updateGuardShot(dt);
    if (guardShot.guard) return;

    if (!OUT || !OUT.playerOnDangerRoad(player)) {
      sniper.aiming = false;
      sniper.timer = 0;
      return;
    }

    if (!sniper.aiming) sniper.aiming = true;
    sniper.timer += dt;
    if (sniper.timer >= sniper.delay) {
      fireSniperShot();
    }
  }

  function drawYellowShotLine(cam, line, alpha) {
    const x1 = line.x1 - cam.x;
    const y1 = line.y1 - cam.y;
    const x2 = line.x2 - cam.x;
    const y2 = line.y2 - cam.y;
    const a = alpha || 1;
    ctx.strokeStyle = "rgba(220, 180, 20, " + a + ")";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 240, 80, " + a + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawSniperFx(cam) {
    if (mapId !== "outside") return;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;

    if (sniper.line) {
      drawYellowShotLine(cam, sniper.line, 1);
    }
    if (npcShot.active && npcShot.line) {
      drawYellowShotLine(cam, npcShot.line, 1);
    }

    if (guardShot.guard && state === "play") {
      const g = guardShot.guard;
      const pulse = guardShot.timer / guardShot.aimDelay;
      drawYellowShotLine(
        cam,
        {
          x1: g.x + 20,
          y1: g.y + 18,
          x2: px,
          y2: py,
        },
        0.2 + pulse * 0.45
      );
    }

    if (sniper.aiming && state === "play" && !guardShot.guard) {
      const pulse = sniper.timer / sniper.delay;
      const tower = OUT && OUT.SNIPER_TOWER ? OUT.SNIPER_TOWER : { x: px, y: 0 };
      drawYellowShotLine(
        cam,
        { x1: tower.x, y1: tower.y, x2: px, y2: py },
        0.15 + pulse * 0.5
      );
    }
  }

  function updateInteractPrompt() {
    if (state !== "play" || player.frozen || fade.active || knockback.active || playerDown) {
      ePrompt.classList.add("hidden");
      return;
    }
    const cam = getCamera();
    const citizen = findNearestCitizen();
    if (citizen) {
      const pos = getCitizenPromptPos(citizen, cam);
      const sx = ((pos.x - cam.x) * SCALE) / VIEW_W * 100;
      const sy = ((pos.y - cam.y) * SCALE) / VIEW_H * 100;
      ePrompt.style.left = sx + "%";
      ePrompt.style.top = sy + "%";
      ePrompt.classList.remove("hidden");
      return;
    }
    const target = findNearestInteractable();
    if (!target) {
      ePrompt.classList.add("hidden");
      return;
    }
    const obj = target.obj;
    const sx = ((obj.x + obj.w / 2 - cam.x) * SCALE) / VIEW_W * 100;
    const sy = ((obj.y - cam.y) * SCALE) / VIEW_H * 100;
    ePrompt.style.left = sx + "%";
    ePrompt.style.top = sy + "%";
    ePrompt.classList.remove("hidden");
  }

  function startFade(from, to, duration, onDone, white) {
    fade.active = true;
    fade.from = from;
    fade.to = to;
    fade.t = 0;
    fade.duration = Math.max(0.01, duration);
    fade.onDone = onDone;
    if (white) fadeOverlay.classList.add("white");
    else fadeOverlay.classList.remove("white");
    fadeOverlay.style.opacity = String(from);
  }

  function clearFade() {
    fade.active = false;
    fade.onDone = null;
    fadeOverlay.style.opacity = "0";
    fadeOverlay.classList.remove("white");
  }

  function updateFade(dt) {
    if (!fade.active) return;
    fade.t += dt;
    const p = Math.min(1, fade.t / fade.duration);
    fadeOverlay.style.opacity = String(fade.from + (fade.to - fade.from) * p);
    if (p >= 1) {
      fadeOverlay.style.opacity = String(fade.to);
      fade.active = false;
      const cb = fade.onDone;
      fade.onDone = null;
      if (cb) {
        try {
          cb();
        } catch (err) {
          console.error(err);
          clearFade();
          player.frozen = false;
          state = "play";
        }
      }
    }
  }

  function updateDoorExit(dt) {
    if (doorExitStep === 0) return;
    if (doorExitStep === 1 && !fade.active) {
      doorExitStep = 2;
      mapId = "outside";
      applyPlayerSizeForMap();
      if (OUT) {
        OUT.reset();
        player.x = OUT.spawn.x;
        player.y = OUT.spawn.y;
      } else {
        player.x = 200;
        player.y = 600;
      }
      player.facing = "down";
      resetSniper();
      updateMoneyUi();
      startFade(1, 0, 0.55, null, true);
      return;
    }
    if (doorExitStep === 2 && !fade.active) {
      doorExitStep = 0;
      clearFade();
      player.frozen = false;
      state = "play";
    }
  }

  function updateDoorEnter(dt) {
    if (doorEnterStep === 0) return;
    if (doorEnterStep === 1 && !fade.active) {
      doorEnterStep = 2;
      mapId = "room";
      doorUsed = false;
      resetSniper();
      placePlayerAtInsideDoor();
      player.facing = "up";
      updateMoneyUi();
      startFade(1, 0, 0.55, null, true);
      return;
    }
    if (doorEnterStep === 2 && !fade.active) {
      doorEnterStep = 0;
      clearFade();
      player.frozen = false;
      state = "play";
      applyPlayerSizeForMap();
      placePlayerAtInsideDoor();
    }
  }

  function useEnterHouse() {
    if (mapId !== "outside" || fade.active || doorEnterStep !== 0 || doorExitStep !== 0) {
      return;
    }
    doorEnterStep = 1;
    player.frozen = true;
    ePrompt.classList.add("hidden");
    Sound.door();
    startFade(0, 1, 0.45, null, true);
    window.setTimeout(function () {
      if (doorEnterStep !== 0) {
        doorEnterStep = 0;
        clearFade();
        mapId = "room";
        doorUsed = false;
        resetSniper();
        placePlayerAtInsideDoor();
        player.frozen = false;
        state = "play";
        updateMoneyUi();
      }
    }, 2000);
  }

  function showDialog(text, showArrow) {
    dialogUi.classList.remove("hidden");
    dialogText.textContent = text;
    dialogArrow.classList.toggle("hidden", !showArrow);
    typewriter.done = true;
    typewriter.full = text;
  }

  function beginIntroLine() {
    const line = INTRO_LINES[introStep];
    if (!line) return;
    typewriter.full = line.text;
    typewriter.shown = 0;
    typewriter.done = false;
    typewriter.lastChar = 0;
    dialogText.textContent = "";
    dialogArrow.classList.add("hidden");
    dialogUi.classList.remove("hidden");
  }

  function advanceIntro() {
    Sound.init();
    if (!typewriter.done) {
      typewriter.shown = typewriter.full.length;
      typewriter.done = true;
      dialogText.textContent = typewriter.full;
      dialogArrow.classList.remove("hidden");
      Sound.confirm();
      return;
    }
    introStep++;
    if (introStep < INTRO_LINES.length) {
      beginIntroLine();
      Sound.confirm();
      return;
    }
    dialogUi.classList.add("hidden");
    startFade(1, 0, 1.2, function () {
      state = "play";
      player.frozen = false;
      playerDown = false;
      knockback.active = false;
      placePlayerSafeInRoom();
      controlsHint.classList.remove("hidden");
      showControlsUntil = performance.now() + 14000;
    }, false);
    Sound.confirm();
  }

  function updateTypewriter(dt) {
    if (
      state !== "intro" &&
      state !== "wake" &&
      state !== "dialog" &&
      state !== "dead"
    ) {
      return;
    }
    if (typewriter.done) return;
    typewriter.shown += typewriter.speed * dt;
    const chars = Math.floor(typewriter.shown);
    if (chars > typewriter.lastChar) {
      typewriter.lastChar = chars;
      Sound.init();
      Sound.blip();
    }
    if (typewriter.shown >= typewriter.full.length) {
      typewriter.shown = typewriter.full.length;
      typewriter.done = true;
      dialogArrow.classList.remove("hidden");
    }
    dialogText.textContent = typewriter.full.slice(0, Math.floor(typewriter.shown));
  }

  function tryInteract() {
    if (state !== "play" || fade.active || knockback.active || playerDown) return;
    if (citizenTalk.active) return;

    const citizen = findNearestCitizen();
    if (citizen) {
      startCitizenTalk(citizen);
      return;
    }
    const target = findNearestInteractable();
    if (!target) return;
    Sound.init();
    Sound.interact();
    target.action();
  }

  function examineBed() {
    player.frozen = true;
    state = "dialog";
    typewriter.full = "* The sheets smell like old dust.\n* You should get up.";
    typewriter.shown = 0;
    typewriter.done = false;
    typewriter.lastChar = 0;
    dialogText.textContent = "";
    dialogArrow.classList.add("hidden");
    dialogUi.classList.remove("hidden");
  }

  function advanceDialog() {
    if (citizenTalk.active) return;
    if (state === "bribe") {
      advanceBribeDialog();
      return;
    }
    if (!typewriter.done) {
      typewriter.shown = typewriter.full.length;
      typewriter.done = true;
      dialogText.textContent = typewriter.full;
      dialogArrow.classList.remove("hidden");
      Sound.confirm();
      return;
    }
    if (radioGoonPlaying) {
      Sound.stopRadioGoon();
      radioGoonPlaying = false;
      state = "play";
      player.frozen = false;
      dialogUi.classList.add("hidden");
      Sound.confirm();
      return;
    }
    if (state === "dead") {
      dialogUi.classList.add("hidden");
      startFade(0, 1, 0.45, function () {
        startWakeInBed();
        startFade(1, 0, 0.75, null, false);
      }, false);
      Sound.confirm();
      return;
    }
    dialogUi.classList.add("hidden");
    state = "play";
    player.frozen = false;
    if (knockback.active) player.frozen = true;
    Sound.confirm();
  }

  function openRadio() {
    Sound.stopRadioGoon();
    radioGoonPlaying = false;
    player.frozen = true;
    state = "radio";
    radioChannel = 1;
    updateRadioDialog();
    Sound.init();
    Sound.staticTune();
  }

  function openSlots() {
    if (!SLOTS || !OUT) return;
    Sound.init();
    Sound.interact();
    player.frozen = true;
    state = "slots";
    dialogUi.classList.add("hidden");
    SLOTS.open({
      getBoard: function () {
        return OUT.slotMachine;
      },
      getMoney: function () {
        return money;
      },
      setMoney: function (v) {
        money = Math.max(0, Math.floor(v));
      },
      onMoneyChange: updateMoneyUi,
      onSpinStart: function () {
        Sound.play(180, 0.15, 0.08, "sawtooth");
      },
      onReelStop: function (i) {
        Sound.play(320 + i * 80, 0.06, 0.1);
      },
      onSpinEnd: function (mult) {
        if (mult >= 1000) {
          screenShake = 0.75;
          Sound.explosion();
        } else if (mult >= 10) {
          screenShake = 0.35;
          Sound.confirm();
        } else if (mult > 0) {
          Sound.confirm();
        } else {
          Sound.play(120, 0.12, 0.06, "sawtooth");
        }
      },
    });
  }

  function closeSlots() {
    if (SLOTS) SLOTS.close();
    dialogUi.classList.add("hidden");
    state = "play";
    player.frozen = false;
  }

  function updateRadioDialog() {
    showDialog(
      "* A cracked radio sits on the table.\n" +
        "* Channel: " +
        radioChannel +
        "\n" +
        "* [← →] change channel   [Z] tune in",
      false
    );
  }

  function tuneRadio() {
    if (radioChannel === 67) {
      Sound.stopRadioGoon();
      radioGoonPlaying = false;
      dialogUi.classList.add("hidden");
      state = "play";
      triggerExplosion();
      return;
    }
    if (radioChannel === 21 || radioChannel === 69) {
      Sound.init();
      Sound.playRadioGoon();
      radioGoonPlaying = true;
      state = "dialog";
      player.frozen = true;
      typewriter.full =
        "* ...that signal.\n* You should not have tuned to channel " +
        radioChannel +
        ".";
      typewriter.shown = 0;
      typewriter.done = false;
      typewriter.lastChar = 0;
      dialogText.textContent = "";
      dialogArrow.classList.add("hidden");
      dialogUi.classList.remove("hidden");
      return;
    }
    Sound.stopRadioGoon();
    radioGoonPlaying = false;
    Sound.staticTune();
    state = "dialog";
    typewriter.full = "* ...just static.";
    typewriter.shown = 0;
    typewriter.done = false;
    typewriter.lastChar = 0;
    dialogText.textContent = "";
    dialogArrow.classList.add("hidden");
    dialogUi.classList.remove("hidden");
  }

  function triggerExplosion() {
    radioTable.destroyed = true;
    crater.active = true;
    crater.w = SPR ? SPR.craterSize.w : 96;
    crater.h = SPR ? SPR.craterSize.h : 86;
    crater.x = radioTable.x + radioTable.w / 2 - crater.w / 2;
    crater.y = radioTable.y + radioTable.h / 2 - crater.h / 2;

    const pcx = player.x + player.w / 2;
    const pcy = player.y + player.h / 2;
    const ecx = radioTable.x + radioTable.w / 2;
    const ecy = radioTable.y + radioTable.h / 2;
    let dx = pcx - ecx;
    let dy = pcy - ecy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    knockback.active = true;
    knockback.vx = dx * 320;
    knockback.vy = dy * 320;
    knockback.t = 0;
    player.frozen = true;
    screenShake = 0.45;
    Sound.explosion();

    window.setTimeout(function () {
      player.frozen = false;
      state = "dialog";
      typewriter.full =
        "* The radio erupted in a burst of dust.\n* Your ears ring.";
      typewriter.shown = 0;
      typewriter.done = false;
      typewriter.lastChar = 0;
      dialogText.textContent = "";
      dialogArrow.classList.add("hidden");
      dialogUi.classList.remove("hidden");
    }, 700);
  }

  function updateKnockback(dt) {
    if (!knockback.active) return;
    knockback.t += dt;
    const map = getMap();
    const nx = player.x + knockback.vx * dt;
    if (!isSolid(map, nx, player.y)) player.x = nx;
    const ny = player.y + knockback.vy * dt;
    if (!isSolid(map, player.x, ny)) player.y = ny;
    knockback.vx *= 0.88;
    knockback.vy *= 0.88;
    if (knockback.t >= knockback.duration) {
      knockback.active = false;
    }
  }

  function useDoor() {
    if (doorUsed || fade.active || doorExitStep !== 0) return;
    doorUsed = true;
    doorExitStep = 1;
    player.frozen = true;
    ePrompt.classList.add("hidden");
    controlsHint.classList.add("hidden");
    Sound.door();
    startFade(0, 1, 0.45, null, true);
    window.setTimeout(function () {
      if (doorExitStep !== 0) {
        doorExitStep = 0;
        clearFade();
        mapId = "outside";
        applyPlayerSizeForMap();
        if (OUT) {
          OUT.reset();
          player.x = OUT.spawn.x;
          player.y = OUT.spawn.y;
        }
        player.facing = "down";
        resetSniper();
        updateMoneyUi();
        player.frozen = false;
        state = "play";
      }
    }, 2000);
  }

  let stepCooldown = 0;

  function updatePlayer(dt) {
    if (knockback.active) {
      updateKnockback(dt);
      player.moving = false;
      updateInteractPrompt();
      return;
    }

    if (
      playerDown ||
      player.frozen ||
      state === "intro" ||
      state === "dialog" ||
      state === "radio" ||
      state === "slots" ||
      state === "dead"
    ) {
      player.moving = false;
      return;
    }

    let ix = 0;
    let iy = 0;
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) ix -= 1;
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) ix += 1;
    if (keys["ArrowUp"] || keys["w"] || keys["W"]) iy -= 1;
    if (keys["ArrowDown"] || keys["s"] || keys["S"]) iy += 1;

    if (ix !== 0 || iy !== 0) {
      const len = Math.hypot(ix, iy) || 1;
      ix /= len;
      iy /= len;
      if (Math.abs(ix) > Math.abs(iy)) {
        player.facing = ix > 0 ? "right" : "left";
      } else {
        player.facing = iy > 0 ? "down" : "up";
      }
      if (showControlsUntil > 0) {
        controlsHint.classList.add("hidden");
        showControlsUntil = 0;
      }
    }

    player.moving = ix !== 0 || iy !== 0;
    const map = getMap();
    const ox = player.x;
    const oy = player.y;
    const nx = player.x + ix * player.speed * dt;
    if (!isSolid(map, nx, player.y)) player.x = nx;
    const ny = player.y + iy * player.speed * dt;
    if (!isSolid(map, player.x, ny)) player.y = ny;

    if (mapId === "outside" && OUT) {
      if (OUT.isShadyBlocking(player)) {
        player.x = ox;
        player.y = oy;
      } else if (!guardShot.guard && !guardBribe.active && !playerDown && !citizenTalk.active) {
        const bumped = OUT.checkGuardBump(player);
        if (bumped) startGuardEncounter(bumped);
      }
    }

    if (player.moving) {
      player.walkTimer += dt;
      if (player.walkTimer > 0.18) {
        player.walkTimer = 0;
        player.walkFrame = 1 - player.walkFrame;
        stepCooldown -= dt;
        if (stepCooldown <= 0) {
          stepCooldown = 0.22;
          Sound.init();
          Sound.step();
        }
      }
    } else {
      player.walkFrame = 0;
      player.walkTimer = 0;
    }

    if (showControlsUntil > 0 && performance.now() > showControlsUntil) {
      controlsHint.classList.add("hidden");
      showControlsUntil = 0;
    }

    updateInteractPrompt();
  }

  function getCamera() {
    const map = getMap();
    const worldW = map.w * TILE;
    const worldH = map.h * TILE;
    let shakeX = 0;
    let shakeY = 0;
    if (screenShake > 0) {
      shakeX = (Math.random() - 0.5) * 8;
      shakeY = (Math.random() - 0.5) * 8;
      screenShake -= 0.016;
    }
    let cx = player.x + player.w / 2 - VIEW_W / (2 * SCALE) + shakeX;
    let cy = player.y + player.h / 2 - VIEW_H / (2 * SCALE) + shakeY;
    const maxX = Math.max(0, worldW - VIEW_W / SCALE);
    const maxY = Math.max(0, worldH - VIEW_H / SCALE);
    cx = Math.max(0, Math.min(maxX, cx));
    cy = Math.max(0, Math.min(maxY, cy));
    return { x: cx, y: cy };
  }

  function drawPixel(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
  }

  function drawRoomFloor(map, cam) {
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const t = map.tiles[ty][tx];
        const x = tx * TILE - cam.x;
        const y = ty * TILE - cam.y;
        if (t === 1) {
          drawPixel(x, y, TILE, TILE, "#121018");
          for (let i = 0; i < 4; i++) {
            drawPixel(x, y + 4 + i * 7, TILE, 2, "#1a1824");
          }
          drawPixel(x, y + TILE - 4, TILE, 4, "#0a080c");
        } else if (t === 3) {
          drawPixel(x, y, TILE, TILE, "#2a2018");
          drawPixel(x + 6, y + 4, TILE - 12, TILE - 8, "#0e0806");
          drawPixel(x + TILE / 2 - 3, y + 10, 6, 8, "#6a5a30");
        } else {
          const c = (tx + ty) % 2 === 0 ? "#282038" : "#201830";
          drawPixel(x, y, TILE, TILE, c);
        }
      }
    }
    drawRoomVignette(cam, map);
  }

  function drawRoomVignette(cam, map) {
    const w = map.w * TILE;
    const h = map.h * TILE;
    const g = ctx.createRadialGradient(
      w / 2 - cam.x,
      h / 2 - cam.y,
      40,
      w / 2 - cam.x,
      h / 2 - cam.y,
      Math.max(w, h) * 0.75
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(-cam.x, -cam.y, w, h);
  }

  function drawCobweb(cam) {
    if (!SPR || !SPR.cobweb) return;
    SPR.draw(ctx, SPR.cobweb, cobweb.x - cam.x, cobweb.y - cam.y);
  }

  function drawSalt(cam) {
    if (saltBag.taken || mapId !== "room") return;
    const x = saltBag.x - cam.x;
    const y = saltBag.y - cam.y;
    drawPixel(x + 4, y + 8, 20, 14, "#e8e8ec");
    drawPixel(x + 6, y + 6, 16, 4, "#c8c8d0");
    drawPixel(x + 8, y + 10, 12, 10, "#f0f0f4");
  }

  function drawBedSprite(cam) {
    if (!SPR || !SPR.bed) return;
    SPR.draw(ctx, SPR.bed, bed.x - cam.x, bed.y - cam.y);
  }

  function drawRadioTable(cam) {
    if (radioTable.destroyed) return;
    if (SPR && SPR.radio) {
      SPR.draw(ctx, SPR.radio, radioTable.x - cam.x, radioTable.y - cam.y);
    }
  }

  function drawCrater(cam) {
    if (!crater.active || !SPR || !SPR.crater) return;
    SPR.draw(ctx, SPR.crater, crater.x - cam.x, crater.y - cam.y);
  }

  function drawPlayerOutside(cam) {
    const px = player.x - cam.x;
    const py = player.y - cam.y;

    if (playerDown) {
      drawPixel(px + 4, py + 30, 24, 10, "#7b4fd4");
      drawPixel(px + 8, py + 28, 16, 8, "#e8c4a0");
      drawPixel(px + 2, py + 38, 28, 6, "#2a2a3a");
      return;
    }

    const leg = player.moving && player.walkFrame === 1 ? 2 : 0;
    drawPixel(px + 8, py + 36 + leg, 6, 10, "#2a2a32");
    drawPixel(px + 18, py + 36 - leg, 6, 10, "#2a2a32");
    drawPixel(px + 6, py + 18, 20, 20, "#7b4fd4");
    drawPixel(px + 10, py + 6, 12, 14, "#e8c4a0");
    drawPixel(px + 8, py + 4, 16, 6, "#4a3020");

    if (player.facing === "down") {
      drawPixel(px + 12, py + 10, 3, 3, "#1a1a1a");
      drawPixel(px + 18, py + 10, 3, 3, "#1a1a1a");
    } else if (player.facing === "up") {
      drawPixel(px + 8, py + 4, 16, 10, "#4a3020");
    } else if (player.facing === "left") {
      drawPixel(px + 10, py + 9, 3, 3, "#1a1a1a");
    } else {
      drawPixel(px + 20, py + 9, 3, 3, "#1a1a1a");
    }
  }

  function drawPlayer(cam) {
    if (mapId === "outside") {
      drawPlayerOutside(cam);
      return;
    }

    const px = player.x - cam.x;
    const py = player.y - cam.y;

    if (playerDown) {
      drawPixel(px + 8, py + 40, 48, 16, "#7b4fd4");
      drawPixel(px + 12, py + 36, 40, 12, "#6a3fc0");
      drawPixel(px + 16, py + 32, 32, 12, "#e8c4a0");
      drawPixel(px + 10, py + 52, 44, 8, "#2a2a3a");
      return;
    }

    const legSwing = player.moving && player.walkFrame === 1 ? 3 : 0;

    drawPixel(px + 20, py + 48 + legSwing, 10, 14, "#2a2a3a");
    drawPixel(px + 34, py + 48 - legSwing, 10, 14, "#2a2a3a");
    drawPixel(px + 14, py + 28, 36, 24, "#7b4fd4");
    drawPixel(px + 16, py + 24, 32, 8, "#6a3fc0");
    drawPixel(px + 22, py + 10, 20, 20, "#e8c4a0");
    drawPixel(px + 18, py + 6, 28, 10, "#4a3020");

    if (player.facing === "down") {
      drawPixel(px + 24, py + 16, 4, 4, "#1a1a1a");
      drawPixel(px + 34, py + 16, 4, 4, "#1a1a1a");
    } else if (player.facing === "up") {
      drawPixel(px + 20, py + 8, 24, 14, "#4a3020");
    } else if (player.facing === "left") {
      drawPixel(px + 20, py + 14, 4, 4, "#1a1a1a");
    } else {
      drawPixel(px + 38, py + 14, 4, 4, "#1a1a1a");
    }
  }

  function drawDoor(cam) {
    if (doorUsed) return;
    const x = door.x - cam.x;
    const y = door.y - cam.y;
    drawPixel(x, y, door.w, door.h, "#2a2018");
    drawPixel(x + 8, y + 6, door.w - 16, door.h - 10, "#0e0806");
    drawPixel(x + door.w / 2 - 4, y + door.h / 2 - 4, 8, 10, "#6a5a30");
  }

  function render() {
    const map = getMap();
    const cam = getCamera();

    ctx.save();
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = "#0a0810";
    ctx.fillRect(0, 0, VIEW_W / SCALE, VIEW_H / SCALE);

    if (mapId === "room") {
      drawRoomFloor(map, cam);
      drawCrater(cam);
      drawBedSprite(cam);
      if (!radioTable.destroyed) drawRadioTable(cam);
      drawCobweb(cam);
      drawDoor(cam);
    } else if (OUT) {
      OUT.draw(ctx, cam, player);
    }

    if (mapId === "room") drawSalt(cam);

    drawSniperFx(cam);
    if (state === "slots" && SLOTS && OUT) {
      SLOTS.drawOverlay(ctx, cam, OUT.slotMachine);
    }
    drawCitizenHint();
    drawPlayer(cam);
    if (citizenTalk.active) drawCitizenDialogHud();
    ctx.restore();
  }

  let last = performance.now();

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (
      state === "intro" ||
      state === "wake" ||
      state === "dialog" ||
      state === "bribe" ||
      state === "dead"
    ) {
      updateTypewriter(dt);
    }

    updateFade(dt);
    updateDoorExit(dt);
    updateDoorEnter(dt);

    if (mapId === "outside" && OUT) {
      OUT.update(dt);
      updateCitizenTalk(dt);
      if (state === "play" || guardShot.guard || guardBribe.active || citizenTalk.active) {
        updateSniper(dt);
      }
    }

    if (state === "slots" && SLOTS) {
      SLOTS.update(dt);
    }

    if (state === "play" || knockback.active) {
      updatePlayer(dt);
    } else if (state !== "play") {
      ePrompt.classList.add("hidden");
    }

    render();
    requestAnimationFrame(loop);
  }

  function onAdvanceKey(e) {
    if (e.repeat) return;
    if (e.key === "z" || e.key === "Z" || e.key === "Enter") {
      if (state === "intro") {
        e.preventDefault();
        Sound.init();
        advanceIntro();
      } else if (state === "wake") {
        e.preventDefault();
        Sound.init();
        advanceWake();
      } else if (state === "dialog" || state === "dead") {
        e.preventDefault();
        Sound.init();
        if (citizenTalk.active) return;
        advanceDialog();
      } else if (state === "radio") {
        e.preventDefault();
        Sound.init();
        tuneRadio();
      } else if (guardBribe.active && guardBribe.phase === "prompt") {
        e.preventDefault();
        Sound.init();
        tryQuickGuardBribe();
      } else if (state === "bribe") {
        e.preventDefault();
        Sound.init();
        resolveGuardBribe(true);
      } else if (citizenTalk.phase === "snitch_run") {
        e.preventDefault();
        Sound.init();
        resolveCitizenSnitch();
      } else if (citizenTalk.phase === "disagree_flee") {
        e.preventDefault();
        Sound.init();
        tryPushFleeingCitizen();
      }
    }
  }

  function onBribeRefuseKey(e) {
    if (state !== "bribe" || e.repeat) return;
    if (e.key === "x" || e.key === "X" || e.key === "Escape") {
      e.preventDefault();
      Sound.init();
      resolveGuardBribe(false);
    }
  }

  function onCitizenChoiceKey(e) {
    if (!citizenTalk.active || state !== "dialog" || e.repeat) return;
    if (
      e.key === "x" ||
      e.key === "X" ||
      e.key === "Escape" ||
      e.key === "z" ||
      e.key === "Z" ||
      e.key === "Enter"
    ) {
      Sound.init();
      if (onCitizenKey(e)) e.preventDefault();
    }
  }

  function onSlotsKey(e) {
    if (!SLOTS || state !== "slots") return;
    const r = SLOTS.handleKey(e.key);
    if (r === "close") {
      closeSlots();
      Sound.confirm();
      e.preventDefault();
    } else if (r === "bet") {
      Sound.blip();
      e.preventDefault();
    } else if (r === "pull") {
      Sound.confirm();
      e.preventDefault();
    } else if (r === "spin") {
      Sound.confirm();
      e.preventDefault();
    } else if (r === "result") {
      e.preventDefault();
    }
  }

  function onRadioChannelKey(e) {
    if (state !== "radio" || e.repeat) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      radioChannel = radioChannel <= 1 ? 99 : radioChannel - 1;
      if (radioChannel !== 21 && radioChannel !== 69) {
        Sound.stopRadioGoon();
        radioGoonPlaying = false;
      }
      updateRadioDialog();
      Sound.staticTune();
      e.preventDefault();
    }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      radioChannel = radioChannel >= 99 ? 1 : radioChannel + 1;
      if (radioChannel !== 21 && radioChannel !== 69) {
        Sound.stopRadioGoon();
        radioGoonPlaying = false;
      }
      updateRadioDialog();
      Sound.staticTune();
      e.preventDefault();
    }
  }

  window.addEventListener("keydown", function (e) {
    keys[e.key] = true;
    Sound.init();
    onAdvanceKey(e);
    onCitizenChoiceKey(e);
    onRadioChannelKey(e);
    onBribeRefuseKey(e);
    if (state === "slots" && !e.repeat) {
      onSlotsKey(e);
    }
    if ((e.key === "e" || e.key === "E") && !e.repeat && state === "play") {
      tryInteract();
    }
  });

  window.addEventListener("keyup", function (e) {
    keys[e.key] = false;
  });

  window.addEventListener("click", function () {
    Sound.init();
  });

  if (SPR) SPR.init();
  if (OUT) OUT.init();
  updateMoneyUi();

  fadeOverlay.style.opacity = "1";
  dialogUi.classList.remove("hidden");
  beginIntroLine();
  requestAnimationFrame(loop);
})();
