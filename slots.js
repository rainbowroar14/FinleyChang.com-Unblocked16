/* Giant slot machine — black market */
(function (global) {
  "use strict";

  const SYMBOLS = [
    { label: "!!!", mult: 2, color: "#ff5555", glow: "#ff8888", weight: 28 },
    { label: "@@@", mult: 5, color: "#55aaff", glow: "#88ccff", weight: 22 },
    { label: "###", mult: 10, color: "#66ee66", glow: "#aaffaa", weight: 14 },
    { label: "$$$", mult: 1000, color: "#ffd040", glow: "#fff0a0", weight: 0.35 },
  ];

  let phase = "idle";
  let betStr = "5";
  let bet = 5;
  let reels = [0, 0, 0];
  let finalReels = [0, 0, 0];
  let spinT = 0;
  let reelStop = [false, false, false];
  let reelOffsets = [0, 0, 0];
  let pull = 0;
  let flash = 0;
  let suspense = 0;
  let winFlash = 0;
  let resultMult = 0;
  let resultPayout = 0;
  let callbacks = null;
  let onSpinDone = null;
  let particles = [];
  let reelMsg = "";

  function pickSymbol() {
    let total = 0;
    SYMBOLS.forEach(function (s) {
      total += s.weight;
    });
    let r = Math.random() * total;
    for (let i = 0; i < SYMBOLS.length; i++) {
      r -= SYMBOLS[i].weight;
      if (r <= 0) return i;
    }
    return 0;
  }

  function parseBet() {
    const n = parseInt(betStr, 10);
    bet = isNaN(n) || n < 1 ? 0 : n;
    return bet;
  }

  function open(cbs) {
    callbacks = cbs;
    phase = "bet";
    const m = cbs.getMoney();
    betStr = m > 0 ? String(Math.min(5, m)) : "1";
    parseBet();
    pull = 0;
    flash = 0;
    suspense = 0;
    winFlash = 0;
    reels = [0, 1, 2];
    particles = [];
    reelMsg = "";
    onSpinDone = null;
  }

  function close() {
    phase = "idle";
    callbacks = null;
  }

  function getBoard() {
    return callbacks && callbacks.getBoard ? callbacks.getBoard() : null;
  }

  function getMoney() {
    return callbacks ? callbacks.getMoney() : 0;
  }

  function setMoney(v) {
    if (callbacks) callbacks.setMoney(v);
  }

  function getLeverRect(board) {
    return {
      x: board.x + board.w - 44,
      y: board.y + board.h * 0.28,
      w: 36,
      h: board.h * 0.5,
    };
  }

  function startSpin(board) {
    parseBet();
    if (bet < 1 || bet > getMoney()) return false;
    setMoney(getMoney() - bet);
    if (callbacks.onMoneyChange) callbacks.onMoneyChange();

    finalReels = [pickSymbol(), pickSymbol(), pickSymbol()];
    reelStop = [false, false, false];
    reelOffsets = [0, 0, 0];
    spinT = 0;
    suspense = 1;
    flash = 0;
    winFlash = 0;
    particles = [];
    reelMsg = "SPINNING...";
    phase = "spin";
    pull = 1;
    if (callbacks.onSpinStart) callbacks.onSpinStart();
    return true;
  }

  function spawnParticles(board, symIdx, count) {
    const cx = board.x + board.w / 2;
    const cy = board.y + board.h / 2;
    const col = SYMBOLS[symIdx].color;
    for (let n = 0; n < count; n++) {
      particles.push({
        x: cx + (Math.random() - 0.5) * board.w * 0.6,
        y: cy + (Math.random() - 0.5) * board.h * 0.4,
        vx: (Math.random() - 0.5) * 220,
        vy: -80 - Math.random() * 180,
        life: 0.6 + Math.random() * 0.8,
        color: col,
        size: 3 + Math.random() * 5,
      });
    }
  }

  function updateParticles(dt, board) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 320 * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (phase === "result" && resultMult >= 10 && particles.length < 40 && board) {
      spawnParticles(board, finalReels[0], 2);
    }
  }

  function update(dt) {
    if (pull > 0) pull = Math.max(0, pull - dt * 2.2);

    const board = getBoard();
    updateParticles(dt, board);

    if (phase === "result" && winFlash > 0) {
      winFlash = Math.max(0, winFlash - dt);
    }

    if (phase !== "spin") return;

    spinT += dt;
    flash += dt * 14;
    suspense = Math.max(0, suspense - dt * 0.35);

    const stopTimes = [1.8, 2.55, 3.35];
    const msgs = ["...", "First reel locks...", "Second reel locks...", "FINAL REEL..."];
    for (let i = 0; i < 3; i++) {
      reelOffsets[i] += dt * (22 + i * 4);
      if (!reelStop[i] && spinT >= stopTimes[i]) {
        reelStop[i] = true;
        reels[i] = finalReels[i];
        reelOffsets[i] = 0;
        reelMsg = msgs[i + 1] || "...";
        if (callbacks.onReelStop) callbacks.onReelStop(i);
        if (i === 2 && finalReels[0] === finalReels[1]) {
          suspense = 1;
          flash += 4;
        }
      }
      if (!reelStop[i]) {
        reels[i] = Math.floor(reelOffsets[i]) % SYMBOLS.length;
      }
    }

    if (reelStop[0] && reelStop[1] && reelStop[2] && phase === "spin") {
      phase = "result";
      calcResult();
      if (resultMult > 0 && board) {
        winFlash = resultMult >= 1000 ? 2.5 : resultMult >= 10 ? 1.2 : 0.5;
        spawnParticles(
          board,
          finalReels[0],
          resultMult >= 1000 ? 80 : resultMult >= 10 ? 35 : 12
        );
      }
      if (callbacks.onSpinEnd) callbacks.onSpinEnd(resultMult, resultPayout);
    }
  }

  function calcResult() {
    resultMult = 0;
    resultPayout = 0;
    if (finalReels[0] === finalReels[1] && finalReels[1] === finalReels[2]) {
      resultMult = SYMBOLS[finalReels[0]].mult;
      resultPayout = Math.floor(bet * resultMult);
      setMoney(getMoney() + resultPayout);
      if (callbacks.onMoneyChange) callbacks.onMoneyChange();
    }
  }

  function handleKey(key) {
    if (phase === "idle") return false;

    if (key === "x" || key === "X" || key === "Escape") {
      if (phase === "spin") return false;
      close();
      return "close";
    }

    if (phase === "bet") {
      if (key >= "0" && key <= "9") {
        if (betStr.length >= 6) return "bet";
        betStr += key;
        parseBet();
        return "bet";
      }
      if (key === "Backspace") {
        betStr = betStr.slice(0, -1);
        if (betStr.length === 0) betStr = "";
        parseBet();
        return "bet";
      }
      if (key === "Enter") {
        parseBet();
        if (bet >= 1 && bet <= getMoney()) {
          phase = "pull";
          pull = 0;
          return "pull";
        }
        return "bet";
      }
    }

    if (phase === "pull") {
      if (key === "z" || key === "Z" || key === "Enter") {
        const board = getBoard();
        if (board && startSpin(board)) return "spin";
        return false;
      }
    }

    if (phase === "result") {
      if (key === "z" || key === "Z" || key === "Enter") {
        phase = "bet";
        betStr = String(Math.min(bet || 5, getMoney()));
        parseBet();
        pull = 0;
        return "result";
      }
    }

    return false;
  }

  function drawSymbol(ctx, x, y, w, h, symIdx, alpha) {
    const s = SYMBOLS[symIdx];
    const a = alpha || 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "#0a0810";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = s.color;
    ctx.font = "bold " + (s.label === "$$$" ? 18 : 16) + "px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = s.glow;
    ctx.shadowBlur = s.label === "$$$" ? 12 : 6;
    ctx.fillText(s.label, x + w / 2, y + h / 2);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawMachine(ctx, cam, board, highlight) {
    const x = board.x - cam.x;
    const y = board.y - cam.y;
    const w = board.w;
    const h = board.h;

    ctx.fillStyle = highlight ? "#221830" : "#181024";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = highlight ? "#e8c030" : "#6a5080";
    ctx.lineWidth = highlight ? 4 : 3;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);

    ctx.fillStyle = "#2a1838";
    ctx.fillRect(x + 10, y + 10, w - 20, h - 20);

    ctx.fillStyle = "#f0d878";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillText("SLOT MACHINE", x + w / 2, y + 26);

    const reelW = Math.floor((w - 56) / 3);
    const reelH = h - 100;
    const reelY = y + 42;
    const reelX0 = x + 18;

    for (let i = 0; i < 3; i++) {
      const rx = reelX0 + i * (reelW + 8);
      ctx.fillStyle = "#08060c";
      ctx.fillRect(rx, reelY, reelW, reelH);
      const sym = reels[i];
      drawSymbol(ctx, rx + 4, reelY + reelH / 2 - 28, reelW - 8, 56, sym, 1);
      if (phase === "spin" && !reelStop[i]) {
        const blur = Math.sin(reelOffsets[i] * 3) * 0.35 + 0.45;
        drawSymbol(
          ctx,
          rx + 4,
          reelY + 8,
          reelW - 8,
          40,
          (sym + 1) % SYMBOLS.length,
          blur
        );
        drawSymbol(
          ctx,
          rx + 4,
          reelY + reelH - 48,
          reelW - 8,
          40,
          (sym + 2) % SYMBOLS.length,
          blur
        );
      }
    }

    if (phase === "spin") {
      const pulse = 0.12 + Math.sin(flash) * 0.1;
      ctx.fillStyle = "rgba(255, 220, 80, " + pulse + ")";
      ctx.fillRect(x + 14, reelY, w - 28, reelH);
      if (suspense > 0.5) {
        ctx.strokeStyle = "rgba(255, 200, 60, " + (0.4 + Math.sin(flash * 2) * 0.3) + ")";
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
      }
    }

    const L = getLeverRect(board);
    const lx = L.x - cam.x;
    const ly = L.y - cam.y + pull * (L.h - 24);
    ctx.fillStyle = "#8a2020";
    ctx.fillRect(lx, ly, L.w, L.h - pull * (L.h - 24));
    ctx.fillStyle = "#d04040";
    ctx.fillRect(lx + 6, ly - 18 - pull * 12, 24, 22);
    ctx.fillStyle = "#f0d878";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(phase === "pull" ? "[Z]" : "PULL", lx + L.w / 2, ly + L.h - 8);

    ctx.fillStyle = "#9a8898";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    let pay = "!!! 2x   @@@ 5x   ### 10x   $$$ 1000x";
    ctx.fillText(pay, x + 14, y + h - 14);
  }

  function drawParticles(ctx, cam) {
    particles.forEach(function (p) {
      const px = p.x - cam.x;
      const py = p.y - cam.y;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(px, py, p.size, p.size);
    });
    ctx.globalAlpha = 1;
  }

  function drawOverlay(ctx, cam, board) {
    if (phase === "idle") return;
    drawMachine(ctx, cam, board, true);
    drawParticles(ctx, cam);

    const x = board.x - cam.x;
    const y = board.y - cam.y;
    const w = board.w;

    if (winFlash > 0) {
      const a = Math.min(0.55, winFlash * 0.35);
      ctx.fillStyle =
        resultMult >= 1000 ? "rgba(255, 220, 60, " + a + ")" : "rgba(255, 180, 80, " + a + ")";
      ctx.fillRect(x - 8, y - 8, board.w + 16, board.h + 16);
    }

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y + board.h - 36, w, 32);

    ctx.fillStyle = "#fff";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";

    if (phase === "bet") {
      const ok = bet >= 1 && bet <= getMoney();
      ctx.fillStyle = ok ? "#aaffaa" : "#ff8888";
      ctx.fillText(
        "TYPE BET: ₩" + (betStr || "0") + "   ENTER confirm   X leave",
        x + w / 2,
        y + board.h - 18
      );
    } else if (phase === "pull") {
      ctx.fillStyle = "#ffdd88";
      ctx.fillText(
        "Press [Z] to spin!   (₩" + bet + " bet)   X leave",
        x + w / 2,
        y + board.h - 18
      );
    } else if (phase === "spin") {
      ctx.fillStyle = "#ffaa44";
      ctx.fillText(reelMsg || "SPINNING...", x + w / 2, y + board.h - 18);
    } else if (phase === "result") {
      if (resultMult > 0) {
        const sym = SYMBOLS[finalReels[0]];
        ctx.fillStyle = sym.color;
        ctx.font = "bold 12px monospace";
        ctx.fillText(
          sym.label + " JACKPOT! " + resultMult + "x  +₩" + resultPayout + "   Z again",
          x + w / 2,
          y + board.h - 18
        );
      } else {
        ctx.fillStyle = "#aaaaaa";
        ctx.fillText("No match... lost ₩" + bet + ".   Z spin again   X leave", x + w / 2, y + board.h - 18);
      }
    }
  }

  function getResultMult() {
    return resultMult;
  }

  global.Slots = {
    SYMBOLS,
    open,
    close,
    update,
    drawMachine,
    drawOverlay,
    handleKey,
    getResultMult,
    get phase() {
      return phase;
    },
  };
})(typeof window !== "undefined" ? window : global);
