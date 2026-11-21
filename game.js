/* ============================================================
   ГИПЕРГАМИЯ · game.js — мир, физика, рендер (чистый Canvas 2D)
   ============================================================ */
(function () {
'use strict';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const mod = (v, m) => ((v % m) + m) % m;
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
const glowCache = {};
function glowSprite(color) {
  if (glowCache[color]) return glowCache[color];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const [r, gr, b] = hexRgb(color);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(${r},${gr},${b},.85)`);
  grad.addColorStop(.28, `rgba(${r},${gr},${b},.36)`);
  grad.addColorStop(.62, `rgba(${r},${gr},${b},.1)`);
  grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  glowCache[color] = c; return c;
}
function glow(ctx, x, y, r, color, a) {
  ctx.globalAlpha = a;
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}
const ctxCache = new WeakMap();
function caches(ctx) {
  let c = ctxCache.get(ctx);
  if (!c) {
    const ring = ctx.createLinearGradient(0, -118, 0, -10);
    ring.addColorStop(0, '#7c5cff'); ring.addColorStop(.55, '#4cc9f0'); ring.addColorStop(1, '#ff8fd3');
    const core = ctx.createRadialGradient(0, -64, 4, 0, -64, 54);
    core.addColorStop(0, '#070518'); core.addColorStop(.7, '#1b0f3f'); core.addColorStop(1, '#5b2fb0');
    const haz = ctx.createLinearGradient(0, -40, 0, 0);
    haz.addColorStop(0, '#ff6ba9'); haz.addColorStop(.6, '#a03cff'); haz.addColorStop(1, '#5b21b6');
    c = { ring, core, haz };
    ctxCache.set(ctx, c);
  }
  return c;
}
const easeBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

/* ---------------- уровень ---------------- */
const VIEW_H = 560;
const LEVEL = {
  width: 4180, killY: 600,
  spawn: { x: 120, y: 470 },
  platforms: [
    { x: 30,   y: 470, w: 310 },
    { x: 430,  y: 450, w: 200 },
    { x: 720,  y: 410, w: 180 },
    { x: 990,  y: 440, w: 250 },
    { x: 1330, y: 390, w: 150 },
    { x: 1570, y: 430, w: 150, bobA: 18, bobS: .9,  ph: .5 },
    { x: 1810, y: 400, w: 260 },
    { x: 2160, y: 350, w: 170 },
    { x: 2420, y: 380, w: 140, movA: 35, movS: .7,  ph: 2.1 },
    { x: 2680, y: 420, w: 240 },
    { x: 3010, y: 380, w: 160 },
    { x: 3260, y: 340, w: 150, bobA: 16, bobS: 1.1, ph: 4 },
    { x: 3500, y: 400, w: 200 },
    { x: 3790, y: 430, w: 330 }
  ],
  stars: [[530, 385], [810, 345], [1105, 350], [1405, 325], [1645, 350], [1930, 330],
          [2245, 285], [2860, 355], [3090, 315], [3335, 270], [3600, 335], [3860, 370]],
  hazards: [{ x: 1105, pi: 3 }, { x: 1930, pi: 6 }, { x: 2790, pi: 9 }],
  portal: { x: 3990, y: 430 }
};

/* ---------------- острова ---------------- */
function buildIsland(ctx, p, seed) {
  const R = mulberry(seed);
  const depth = clamp(34 + p.w * .18, 40, 96);
  const grass = ctx.createLinearGradient(0, 0, 0, 26);
  grass.addColorStop(0, '#43e6a0'); grass.addColorStop(1, '#177a58');
  const rock = ctx.createLinearGradient(0, 22, 0, 22 + depth);
  rock.addColorStop(0, '#332a63'); rock.addColorStop(1, '#141033');
  const decor = [];
  const n = Math.floor(p.w / 34);
  for (let i = 0; i < n; i++) {
    const t = R();
    decor.push({
      type: t < .55 ? 'grass' : t < .8 ? 'flower' : 'mush',
      dx: 16 + R() * (p.w - 32), h: 6 + R() * 7, ph: R() * TAU,
      c: R() < .5 ? '#ff8fd3' : '#ffd166'
    });
  }
  const crystals = [];
  const cn = 1 + Math.floor(R() * 2);
  for (let i = 0; i < cn; i++) crystals.push({ dx: p.w * (.25 + R() * .5), s: 6 + R() * 7, ph: R() * TAU });
  const pebbles = [];
  const pn = 1 + Math.floor(R() * 2);
  for (let i = 0; i < pn; i++) pebbles.push({ dx: p.w * (.3 + R() * .4), dy: depth + 12 + R() * 14, s: 4 + R() * 5, ph: R() * TAU });
  return { p, depth, grass, rock, decor, crystals, pebbles };
}
function drawIsland(ctx, isl, t) {
  const p = isl.p, w = p.w, d = isl.depth;
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, w / 2, d * .8, w * .5, '#7c5cff', .16);
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.moveTo(6, 22);
  ctx.bezierCurveTo(w * .12, 22 + d * .8, w * .38, 22 + d, w * .5, 22 + d);
  ctx.bezierCurveTo(w * .64, 22 + d, w * .9, 22 + d * .75, w - 6, 22);
  ctx.closePath();
  ctx.fillStyle = isl.rock; ctx.fill();
  ctx.strokeStyle = 'rgba(151,120,255,.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  for (const c of isl.crystals) {
    const cy = 22 + d * .5, sway = Math.sin(t * 1.4 + c.ph) * 1.5;
    ctx.save(); ctx.translate(c.dx + sway, cy);
    ctx.beginPath(); ctx.moveTo(0, c.s * 1.6); ctx.lineTo(c.s * .6, 0); ctx.lineTo(0, -c.s * .4); ctx.lineTo(-c.s * .6, 0); ctx.closePath();
    ctx.fillStyle = 'rgba(139,92,246,.85)'; ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, c.s * .5, c.s * 2.6, '#8b5cf6', .4);
    ctx.globalCompositeOperation = 'source-over'; ctx.restore();
  }
  for (const pb of isl.pebbles) {
    const by = pb.dy + Math.sin(t * 1.2 + pb.ph) * 3;
    rr(ctx, pb.dx - pb.s / 2, by, pb.s, pb.s * .8, 2.5);
    ctx.fillStyle = '#241d4e'; ctx.fill();
    ctx.strokeStyle = 'rgba(151,120,255,.3)'; ctx.lineWidth = 1; ctx.stroke();
  }
  rr(ctx, 0, 0, w, 26, 13);
  ctx.fillStyle = isl.grass; ctx.fill();
  ctx.strokeStyle = 'rgba(10,20,16,.4)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, 4.5); ctx.lineTo(w - 12, 4.5);
  ctx.strokeStyle = 'rgba(210,255,235,.4)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
  for (const g of isl.decor) {
    const sway = Math.sin(t * 2 + g.ph) * 1.6;
    if (g.type === 'grass') {
      ctx.strokeStyle = 'rgba(61,220,151,.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath(); ctx.moveTo(g.dx + k * 3, 1);
        ctx.quadraticCurveTo(g.dx + k * 3 + sway, -g.h * .6, g.dx + k * 4 + sway, -g.h + Math.abs(k) * 3);
        ctx.stroke();
      }
    } else if (g.type === 'flower') {
      ctx.strokeStyle = '#2f9d77'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(g.dx, 1); ctx.quadraticCurveTo(g.dx + sway, -5, g.dx + sway, -9); ctx.stroke();
      ctx.fillStyle = g.c; ctx.beginPath(); ctx.arc(g.dx + sway, -10.5, 2.4, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, g.dx + sway, -10.5, 7, g.c, .5);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = 'rgba(207,214,255,.55)'; rr(ctx, g.dx - 1.3, -4.5, 2.6, 5, 1.2); ctx.fill();
      ctx.fillStyle = '#4cc9f0'; ctx.beginPath(); ctx.arc(g.dx, -4.5, 3.6, Math.PI, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, g.dx, -5, 8, '#4cc9f0', .45);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.restore();
}

/* ---------------- робот ---------------- */
function drawRobot(ctx, o, t) {
  const s = o.scale == null ? 1 : o.scale;
  if (s <= 0.01) return;
  ctx.save(); ctx.translate(o.x, o.y);
  if (o.spin) ctx.rotate(o.spin);
  ctx.scale(s * (o.sx || 1), s * (o.sy || 1));
  if (o.invuln > 0 && Math.floor(t * 14) % 2 === 0) ctx.globalAlpha *= .45;
  ctx.rotate(clamp((o.vx || 0) * .0006, -.12, .12));
  const moving = Math.abs(o.vx || 0) > 20 && o.grounded;
  if (o.grounded && !moving) ctx.translate(0, Math.sin(t * 2.4) * 1.6);
  if (!o.grounded && (o.vy || 0) < -40) {
    const fl = clamp(-(o.vy || 0) * .02, 4, 14) + Math.random() * 3;
    const fg = ctx.createLinearGradient(0, -8, 0, fl + 4);
    fg.addColorStop(0, 'rgba(76,201,240,.9)'); fg.addColorStop(1, 'rgba(76,201,240,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.moveTo(-6, -8); ctx.quadraticCurveTo(0, fl + 6, 6, -8); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 0, 14, '#4cc9f0', .55);
    ctx.globalCompositeOperation = 'source-over';
  }
  const run = o.runPhase || 0;
  const legH = o.grounded ? 10 : 7;
  const l1 = moving ? Math.max(0, Math.sin(run)) * 5 : 0;
  const l2 = moving ? Math.max(0, Math.sin(run + Math.PI)) * 5 : 0;
  ctx.fillStyle = '#3a3468';
  rr(ctx, -12, -legH - l1, 9, legH, 4); ctx.fill();
  rr(ctx, 3, -legH - l2, 9, legH, 4); ctx.fill();
  const arm = moving ? Math.sin(run + Math.PI) * 2 : Math.sin(t * 2.4);
  ctx.fillStyle = '#c7c2ef'; ctx.strokeStyle = 'rgba(20,16,50,.5)'; ctx.lineWidth = 1.2;
  rr(ctx, -21, -30 + arm, 6, 12, 3); ctx.fill(); ctx.stroke();
  rr(ctx, 15, -30 - arm, 6, 12, 3); ctx.fill(); ctx.stroke();
  const bg = ctx.createLinearGradient(0, -42, 0, -10);
  bg.addColorStop(0, '#f6f4ff'); bg.addColorStop(1, '#c7c2ef');
  rr(ctx, -17, -42, 34, 32, 12); ctx.fillStyle = bg; ctx.fill();
  ctx.strokeStyle = 'rgba(20,16,50,.55)'; ctx.lineWidth = 1.5; ctx.stroke();
  rr(ctx, -10, -24, 20, 10, 5); ctx.fillStyle = 'rgba(124,92,255,.18)'; ctx.fill();
  ctx.fillStyle = '#ff8fd3'; ctx.beginPath(); ctx.arc(0, -19, 2.4, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -19, 7, '#ff8fd3', .5);
  ctx.globalCompositeOperation = 'source-over';
  rr(ctx, -13, -39, 26, 17, 8); ctx.fillStyle = '#14112e'; ctx.fill();
  ctx.strokeStyle = 'rgba(76,201,240,.3)'; ctx.lineWidth = 1.2; ctx.stroke();
  const look = (o.facing || 1) * 2.4;
  const bk = o.blink == null ? 1 : o.blink;
  for (const side of [-1, 1]) {
    const ex = side * 6 + look;
    if (o.happy > 0) {
      ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(ex, -29.5, 3.4, Math.PI, TAU); ctx.stroke();
    } else {
      const eh = 7 * bk;
      rr(ctx, ex - 2.4, -34.5 + (7 - eh) / 2, 4.8, eh, 2.4);
      ctx.fillStyle = '#4cc9f0'; ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, ex, -31, 8, '#4cc9f0', .4);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (o.happy > 0) {
    ctx.fillStyle = 'rgba(255,143,211,.6)';
    ctx.beginPath(); ctx.arc(-10, -26.5, 1.8, 0, TAU); ctx.arc(10, -26.5, 1.8, 0, TAU); ctx.fill();
  }
  const sway = Math.sin(t * 3) * 2 - (o.vx || 0) * .01;
  ctx.strokeStyle = '#3a3468'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -42); ctx.quadraticCurveTo(sway * .5, -48, sway, -52); ctx.stroke();
  ctx.fillStyle = '#ff8fd3'; ctx.beginPath(); ctx.arc(sway, -53.5, 3, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'lighter'; glow(ctx, sway, -53.5, 10, '#ff8fd3', .7);
  ctx.globalCompositeOperation = 'source-over';
  if (o.invuln > 0) {
    ctx.strokeStyle = `rgba(76,201,240,${.3 + .2 * Math.sin(t * 10)})`;
    ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 30;
    ctx.beginPath(); ctx.arc(0, -24, 32, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

/* ---------------- звезда / кристаллы / портал ---------------- */
function drawStar(ctx, s, t, i) {
  const y = s.y + Math.sin(t * 2 + i) * 4;
  const rot = t * .9 + i;
  ctx.save(); ctx.translate(s.x, y);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, 0, 24, '#ffd166', .5 + .2 * Math.sin(t * 3 + i));
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(rot);
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 4.8 : 11, a = k * Math.PI / 5 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffcf5e'; ctx.fill();
  ctx.strokeStyle = '#fff2c8'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#fff8e6'; ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawHazard(ctx, h, t) {
  if (h.spawn <= 0) return;
  const sc = easeBack(clamp(h.spawn, 0, 1)) * (1 + .035 * Math.sin(t * 3 + h.x));
  ctx.save(); ctx.translate(h.x, h.y); ctx.scale(sc, sc);
  ctx.fillStyle = '#1c1440';
  ctx.beginPath(); ctx.ellipse(0, 0, 24, 6, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(255,77,141,${.25 + .15 * Math.sin(t * 4)})`; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 1, 27, 7.5, 0, 0, TAU); ctx.stroke();
  const grad = caches(ctx).haz;
  for (const [dx, hh, ww] of [[-13, 26, 9], [0, 38, 11], [13, 22, 8]]) {
    ctx.beginPath();
    ctx.moveTo(dx, -hh);
    ctx.quadraticCurveTo(dx + ww, -hh * .35, dx + ww * .5, 0);
    ctx.lineTo(dx - ww * .5, 0);
    ctx.quadraticCurveTo(dx - ww, -hh * .35, dx, -hh);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,170,.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(dx, -hh + 4); ctx.lineTo(dx - 2, -4); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, -16, 26, '#ff4d8d', .4 + .12 * Math.sin(t * 3.4));
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}
function drawPortal(ctx, px, py, t, winT) {
  const C = caches(ctx);
  ctx.save(); ctx.translate(px, py);
  ctx.globalCompositeOperation = 'lighter';
  const beam = ctx.createLinearGradient(0, -212, 0, 0);
  beam.addColorStop(0, 'rgba(124,92,255,0)'); beam.addColorStop(1, 'rgba(124,92,255,.16)');
  ctx.fillStyle = beam; ctx.fillRect(-26, -212, 52, 212);
  glow(ctx, 0, -64, 82, '#7c5cff', .5 + .15 * Math.sin(t * 2));
  glow(ctx, 0, -64, 46, '#ff8fd3', .3);
  if (winT > 0) glow(ctx, 0, -64, 120 * winT + 40, '#ffffff', .7 * winT);
  ctx.globalCompositeOperation = 'source-over';
  rr(ctx, -34, -8, 68, 12, 6);
  ctx.fillStyle = '#241d4e'; ctx.fill();
  ctx.strokeStyle = 'rgba(151,120,255,.45)'; ctx.lineWidth = 1.5; ctx.stroke();
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = '#4cc9f0';
    ctx.globalAlpha = .4 + .4 * Math.sin(t * 3 + i * 2);
    ctx.beginPath(); ctx.arc(i * 16, -2, 2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  const rs = 1 + winT * .5;
  ctx.save(); ctx.translate(0, -64); ctx.scale(rs, rs); ctx.translate(0, 64);
  ctx.beginPath(); ctx.ellipse(0, -64, 24, 46, 0, 0, TAU); ctx.fillStyle = C.core; ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(151,120,255,${.5 - i * .1})`; ctx.lineWidth = 3 - i * .6;
    ctx.beginPath();
    ctx.ellipse(0, -64, 18 - i * 5, 38 - i * 11, t * (1.1 + i * .3), .4, 4.6);
    ctx.stroke();
  }
  if (winT > 0) {
    ctx.fillStyle = `rgba(255,255,255,${clamp(winT, 0, 1) * .9})`;
    ctx.beginPath(); ctx.ellipse(0, -64, 24, 46, 0, 0, TAU); ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(0, -64, 30, 52, 0, 0, TAU);
  ctx.strokeStyle = C.ring; ctx.lineWidth = 7; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -64, 24, 46, 0, 0, TAU);
  ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.restore();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const a = t * 1.6 + i * TAU / 6;
    const sx = Math.cos(a) * 31 * rs, sy = -64 + Math.sin(a) * 53 * rs;
    glow(ctx, sx, sy, 8, i % 2 ? '#4cc9f0' : '#ff8fd3', .8);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/* ---------------- частицы ---------------- */
function makeParts() { return []; }
function part(parts, o) {
  if (parts.length > 320) parts.splice(0, parts.length - 320);
  parts.push(Object.assign({ vx: 0, vy: 0, g: 0, life: .7, max: .7, size: 4, type: 'spark', c: '#ffd166' }, o, { max: o.life || .7 }));
}
function burst(parts, x, y, c, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = spd * (.4 + Math.random() * .8);
    part(parts, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 260, life: .5 + Math.random() * .5, size: 3 + Math.random() * 4, c });
  }
}
function dust(parts, x, y, n) {
  for (let i = 0; i < n; i++)
    part(parts, { type: 'puff', x: x + (Math.random() - .5) * 22, y, vx: (Math.random() - .5) * 90, vy: -20 - Math.random() * 45, g: -25, life: .45 + Math.random() * .3, size: 4 + Math.random() * 4, c: '#b9b3ea' });
}
function updateParts(parts, dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
    if (p.type === 'ring') p.size += 150 * dt;
    if (p.type === 'puff') p.size += 14 * dt;
  }
}
function drawParts(parts, ctx, front) {
  for (const p of parts) {
    const isFront = p.type !== 'puff';
    if (isFront !== front) continue;
    const a = clamp(p.life / p.max, 0, 1);
    if (p.type === 'spark') {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, p.x, p.y, p.size * (0.5 + a), p.c, a);
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.type === 'puff') {
      ctx.globalAlpha = a * .35; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.type === 'ring') {
      ctx.globalAlpha = a; ctx.strokeStyle = p.c; ctx.lineWidth = 2.5 * a + .5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (p.type === 'text') {
      ctx.globalAlpha = a; ctx.fillStyle = p.c;
      ctx.font = '800 15px Manrope, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
  }
}

/* ============================================================
   GAME
   ============================================================ */
class Game {
  constructor(canvas, cb) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cb = cb || {};
    this.cssW = 320; this.cssH = 180; this.dpr = 1;
    this.scale = this.cssH / VIEW_H; this.viewW = this.cssW / this.scale;
    this.input = { left: false, right: false, jumpHeld: false };
    this.touchMode = false; this.reduceMotion = false;
    this.totalStars = LEVEL.stars.length;
    this.t = 0; this.parts = makeParts();
    this.plats = LEVEL.platforms.map(d => Object.assign({}, d, { bx: d.x, by: d.y, px: d.x, py: d.y }));
    this.islands = this.plats.map((p, i) => buildIsland(this.ctx, p, 100 + i * 17));
    this.hazDefs = LEVEL.hazards.map(h => ({ x: h.x, y: this.plats[h.pi].by, p: this.plats[h.pi] }));
    this.initBackground();
    this.skyGrad = null; this.vignette = null;
    this.startRun();
  }
  initBackground() {
    const R = mulberry(42);
    this.skyStars = [];
    for (let i = 0; i < 70; i++) this.skyStars.push({ x: R() * 2200, y: R() * 310, r: .6 + R() * 1.5, tw: R() * TAU, par: i % 2 ? .1 : .2, c: i % 9 === 0 ? '#ffd166' : i % 7 === 0 ? '#ff8fd3' : '#cfd6ff' });
    this.farIslands = [];
    for (let i = 0; i < 6; i++) this.farIslands.push({ x: R() * 1800, y: 255 + R() * 130, w: 90 + R() * 120, par: .32 });
    this.clouds = [];
    for (let i = 0; i < 10; i++) {
      const puffs = [];
      const pn = 4 + Math.floor(R() * 3);
      for (let k = 0; k < pn; k++) puffs.push([(k - pn / 2) * 26 + R() * 14, (R() - .5) * 12, 16 + R() * 15]);
      this.clouds.push({ x: R() * 2400, y: 40 + R() * 215, s: .6 + R() * .9, spd: 5 + R() * 9, par: .25 + R() * .45, puffs });
    }
  }
  resize(w, h, dpr) {
    if (w === this.cssW && h === this.cssH && dpr === this.dpr && this.skyGrad) return;
    this.cssW = w; this.cssH = h; this.dpr = dpr;
    this.cv.width = Math.max(1, Math.round(w * dpr));
    this.cv.height = Math.max(1, Math.round(h * dpr));
    this.scale = h / VIEW_H; this.viewW = w / this.scale;
    const g = this.ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#050614'); g.addColorStop(.42, '#141040'); g.addColorStop(.72, '#2c1a58'); g.addColorStop(1, '#0e0a26');
    this.skyGrad = g;
    const v = this.ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .42, w / 2, h / 2, Math.max(w, h) * .78);
    v.addColorStop(0, 'rgba(3,4,12,0)'); v.addColorStop(1, 'rgba(3,4,12,.5)');
    this.vignette = v;
  }
  startRun() {
    this.runState = 'ready';
    this.lives = 3; this.starsGot = 0; this.runTime = 0;
    this.simT = 0; this.acc = 0; this.freeze = 0;
    this.shake = 0; this.flash = 0; this.winT = 0;
    this.fw = [false, false, false];
    this.camX = 0; this.camSnap = 0;
    this.parts.length = 0;
    this.plats.forEach(p => { p.x = p.bx; p.y = p.by; p.px = p.bx; p.py = p.by; });
    this.stars = LEVEL.stars.map(([x, y]) => ({ x, y, got: false }));
    this.hazards = this.hazDefs.map((h, i) => ({ x: h.x, y: h.y, p: h.p, spawn: 0, delay: .25 + i * .18 }));
    const p0 = this.plats[0];
    this.player = {
      x: LEVEL.spawn.x, y: LEVEL.spawn.y, vx: 0, vy: 0,
      grounded: true, ground: p0, facing: 1, runPhase: 0,
      sx: 1, sy: 1, invuln: 0, scale: 1, spin: 0
    };
    this.safe = { p: p0, rel: LEVEL.spawn.x - p0.x };
    this.safeTimer = 0;
    this.coyote = 0; this.jumpBuf = 0;
    this.blinkT = 2; this.blinkPh = 0; this.happy = 0;
    this.portalTimer = 0; this.lastProg = -1;
    this.input.left = this.input.right = this.input.jumpHeld = false;
    const tm = this.touchMode;
    this.hints = [
      { x: 185, y: 335, text: tm ? 'Кнопки ◀ ▶ — движение' : 'A / D или ← → — движение', a: 0 },
      { x: 490, y: 300, text: tm ? 'Кнопка ⬆ — прыжок' : 'SPACE / W — прыжок', a: 0 },
      { x: 1105, y: 262, text: 'Осторожно: колючие кристаллы!', a: 0 },
      { x: 3960, y: 250, text: 'Войди в портал — это финиш!', a: 0 }
    ];
    if (this.cb.onLife) this.cb.onLife(3);
    if (this.cb.onStar) this.cb.onStar(0, this.totalStars);
    if (this.cb.onProgress) this.cb.onProgress(0);
  }
  setLive() { if (this.runState === 'ready') this.runState = 'playing'; }
  pressJump() { this.input.jumpHeld = true; this.jumpBuf = .14; }
  releaseJump() {
    this.input.jumpHeld = false;
    if (this.player.vy < -230) this.player.vy *= .52;
  }
  emit(name, a, b) { const f = this.cb[name]; if (f) f(a, b); }

  update(dt) {
    this.t += dt;
    for (const h of this.hazards) {
      if (h.delay > 0) h.delay -= dt;
      else if (h.spawn < 1) h.spawn = Math.min(1, h.spawn + dt / .5);
    }
    if (this.freeze > 0) { this.freeze -= dt; return; }
    if (this.runState === 'playing' || this.runState === 'winning') {
      this.acc = Math.min(this.acc + dt, .1);
      const step = 1 / 120;
      while (this.acc >= step) { this.physics(step); this.acc -= step; }
    }
    const pl = this.player;
    pl.sx += (1 - pl.sx) * Math.min(1, dt * 10);
    pl.sy += (1 - pl.sy) * Math.min(1, dt * 10);
    if (pl.invuln > 0) pl.invuln -= dt;
    if (this.happy > 0) this.happy -= dt;
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkPh = .13; this.blinkT = 2 + Math.random() * 3; }
    if (this.blinkPh > 0) this.blinkPh -= dt;
    if (pl.grounded) pl.runPhase += Math.abs(pl.vx) * dt * .09;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 1.4);
    if (this.camSnap > 0) this.camSnap -= dt;
    const target = clamp(pl.x + pl.facing * 70 - this.viewW * .42, 0, Math.max(0, LEVEL.width - this.viewW));
    const k = this.camSnap > 0 ? 13 : 6;
    this.camX += (target - this.camX) * (1 - Math.exp(-k * dt));
    this.portalTimer -= dt;
    if (this.portalTimer <= 0 && this.runState !== 'over') {
      this.portalTimer = .14;
      part(this.parts, { x: LEVEL.portal.x + (Math.random() - .5) * 52, y: LEVEL.portal.y - 10 - Math.random() * 100, vy: -30 - Math.random() * 25, life: .9, size: 3, c: Math.random() < .5 ? '#7c5cff' : '#4cc9f0' });
    }
    updateParts(this.parts, dt);
    for (const h of this.hints) {
      const passed = pl.x > h.x + 150;
      const visible = h.x > this.camX - 80 && h.x < this.camX + this.viewW + 80;
      const tgt = (!passed && visible && (this.runState === 'ready' || this.runState === 'playing')) ? 1 : 0;
      h.a += (tgt - h.a) * Math.min(1, dt * 5);
    }
  }
  physics(step) {
    const pl = this.player;
    if (this.runState === 'winning') {
      this.winT += step;
      pl.x += (LEVEL.portal.x - pl.x) * Math.min(1, step * 6);
      pl.y += (LEVEL.portal.y - 60 - pl.y) * Math.min(1, step * 6);
      pl.spin += step * 9;
      pl.scale = Math.max(0, 1 - this.winT / .8);
      const th = [.15, .45, .75];
      for (let i = 0; i < 3; i++) if (!this.fw[i] && this.winT > th[i]) {
        this.fw[i] = true;
        burst(this.parts, LEVEL.portal.x + (Math.random() - .5) * 160, LEVEL.portal.y - 90 - Math.random() * 90, ['#ffd166', '#ff8fd3', '#4cc9f0'][i], 18, 220);
      }
      if (this.winT >= 1.12) {
        this.runState = 'won';
        this.emit('onWin', { stars: this.starsGot, total: this.totalStars, time: this.runTime });
      }
      return;
    }
    this.simT += step; this.runTime += step;
    for (const p of this.plats) {
      p.px = p.x; p.py = p.y;
      if (p.bobA) p.y = p.by + Math.sin(this.simT * p.bobS + p.ph) * p.bobA;
      if (p.movA) p.x = p.bx + Math.sin(this.simT * p.movS + p.ph) * p.movA;
    }
    if (pl.ground) {
      const p = pl.ground;
      pl.x += p.x - p.px; pl.y += p.y - p.py;
      if (pl.x + 13 < p.x || pl.x - 13 > p.x + p.w) { pl.ground = null; pl.grounded = false; }
      else { pl.y = p.y; pl.vy = 0; }
    }
    const dir = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const accel = pl.grounded ? 1900 : 1330;
    if (dir !== 0) {
      pl.facing = dir;
      pl.vx = clamp(pl.vx + dir * accel * step, -260, 260);
    } else {
      const fr = (pl.grounded ? 2400 : 300) * step;
      pl.vx = Math.abs(pl.vx) <= fr ? 0 : pl.vx - Math.sign(pl.vx) * fr;
    }
    if (pl.grounded) this.coyote = .12; else this.coyote -= step;
    this.jumpBuf -= step;
    if (this.jumpBuf > 0 && (pl.grounded || this.coyote > 0)) {
      pl.vy = -560; pl.grounded = false; pl.ground = null;
      this.coyote = 0; this.jumpBuf = 0;
      pl.sx = .84; pl.sy = 1.16;
      dust(this.parts, pl.x, pl.y, 5);
      this.emit('onJump');
    }
    if (!pl.grounded) pl.vy = Math.min(pl.vy + 1500 * step, 900);
    const prevBottom = pl.y;
    pl.x = clamp(pl.x + pl.vx * step, 16, LEVEL.width - 16);
    pl.y += pl.vy * step;
    if (!pl.grounded && pl.vy >= 0) {
      for (const p of this.plats) {
        if (pl.x + 13 > p.x && pl.x - 13 < p.x + p.w && prevBottom <= p.y + 8 && pl.y >= p.y) {
          const fall = pl.vy;
          pl.y = p.y; pl.vy = 0; pl.grounded = true; pl.ground = p;
          if (fall > 420) { pl.sx = 1.16; pl.sy = .84; dust(this.parts, pl.x, pl.y, 8); this.emit('onLand'); }
          else { pl.sx = 1.06; pl.sy = .94; }
          break;
        }
      }
    }
    if (pl.invuln <= 0) {
      for (const h of this.hazards) {
        if (h.spawn < .85) continue;
        if (pl.x + 12 > h.x - 13 && pl.x - 12 < h.x + 13 && pl.y - 2 > h.y - 32 && pl.y - 40 < h.y) {
          this.hurt(false, h.x); break;
        }
      }
    }
    if (this.runState !== 'playing') return;
    const pcx = pl.x, pcy = pl.y - 22;
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      if (s.got) continue;
      const dx = pcx - s.x, dy = pcy - s.y, d = Math.hypot(dx, dy);
      if (d < 80) { s.x += dx * Math.min(1, step * 6); s.y += dy * Math.min(1, step * 6); }
      if (d < 30) {
        s.got = true; this.starsGot++; this.happy = .7;
        burst(this.parts, s.x, s.y, '#ffd166', 10, 170);
        part(this.parts, { type: 'ring', x: s.x, y: s.y, life: .4, size: 8, c: '#ffe9a3' });
        part(this.parts, { type: 'text', x: s.x, y: s.y - 16, vy: -55, life: .8, c: '#ffe3a3', text: '+1 ★' });
        this.emit('onStar', this.starsGot, this.totalStars);
      }
    }
    if (Math.abs(pl.x - LEVEL.portal.x) < 30 && pl.y > LEVEL.portal.y - 118 && pl.y <= LEVEL.portal.y + 2) {
      this.runState = 'winning'; this.winT = 0;
      this.input.left = this.input.right = false;
      pl.vx = pl.vy = 0; pl.grounded = false; pl.ground = null;
      this.emit('onProgress', 1);
      return;
    }
    if (pl.y > LEVEL.killY) { this.hurt(true, pl.x); return; }
    this.safeTimer -= step;
    if (pl.grounded && pl.ground && this.safeTimer <= 0) {
      const p = pl.ground;
      if (pl.x > p.x + 18 && pl.x < p.x + p.w - 18) {
        let danger = false;
        for (const h of this.hazards) if (h.p === p && Math.abs(h.x - pl.x) < 70) { danger = true; break; }
        if (!danger) { this.safe = { p, rel: pl.x - p.x }; this.safeTimer = .25; }
      }
    }
    const prog = clamp((pl.x - LEVEL.spawn.x) / (LEVEL.portal.x - LEVEL.spawn.x), 0, 1);
    if (Math.abs(prog - this.lastProg) > .004) { this.lastProg = prog; this.emit('onProgress', prog); }
  }
  hurt(fromFall, srcX) {
    this.lives--;
    this.emit('onLife', this.lives);
    if (this.lives <= 0) { this.die(); return; }
    const pl = this.player;
    if (fromFall) {
      const p = this.safe.p;
      pl.x = p.x + clamp(this.safe.rel, 18, p.w - 18);
      pl.y = p.y; pl.vx = 0; pl.vy = 0;
      pl.grounded = true; pl.ground = p; pl.invuln = 1.5;
      this.camSnap = .3;
      burst(this.parts, pl.x, pl.y - 22, '#4cc9f0', 12, 150);
      part(this.parts, { type: 'ring', x: pl.x, y: pl.y - 22, life: .5, size: 10, c: '#4cc9f0' });
      this.emit('onRespawn');
    } else {
      pl.invuln = 1.6; pl.vy = -330;
      pl.vx = pl.x < srcX ? -260 : 260;
      pl.grounded = false; pl.ground = null;
      this.freeze = .05; this.shake = .5; this.flash = .3;
      burst(this.parts, pl.x, pl.y - 22, '#ff4d8d', 14, 200);
    }
  }
  die() {
    this.runState = 'over';
    burst(this.parts, this.player.x, this.player.y - 22, '#ff8fd3', 26, 260);
    burst(this.parts, this.player.x, this.player.y - 22, '#ffffff', 10, 180);
    this.shake = .6;
    this.emit('onLose');
  }
  groundBelow(x, y) {
    let best = null;
    for (const p of this.plats)
      if (x + 10 > p.x && x - 10 < p.x + p.w && p.y >= y - 2 && (!best || p.y < best.y)) best = p;
    return best;
  }
  render() {
    const ctx = this.ctx, w = this.cssW, h = this.cssH, sc = this.scale, t = this.t;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.skyGrad || '#0e0a26'; ctx.fillRect(0, 0, w, h);
    const cam = this.camX, span = this.viewW + 400;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, w * .22 - cam * .04 * sc, h * .3, h * .55, '#4b2fd8', .3);
    glow(ctx, w * .78 - cam * .06 * sc, h * .2, h * .45, '#2f6bff', .22);
    glow(ctx, w * .5 - cam * .1 * sc, h * .86, h * .5, '#ff5fa8', .14);
    ctx.globalCompositeOperation = 'source-over';
    for (const s of this.skyStars) {
      const sx = mod(s.x - cam * s.par, span) - 200;
      const a = .25 + .55 * Math.pow(Math.sin(t * 1.5 + s.tw), 2);
      ctx.globalAlpha = a; ctx.fillStyle = s.c;
      ctx.beginPath(); ctx.arc(sx * sc, s.y * sc, s.r * sc, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of this.farIslands) {
      const sx = (mod(f.x - cam * f.par, span) - 200) * sc, sy = f.y * sc, fw = f.w * sc;
      ctx.fillStyle = '#191542';
      ctx.beginPath();
      ctx.ellipse(sx, sy, fw / 2, fw * .14, 0, Math.PI, TAU);
      ctx.bezierCurveTo(sx + fw * .3, sy + fw * .3, sx - fw * .3, sy + fw * .3, sx - fw / 2, sy);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(124,92,255,.18)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(139,92,246,.5)';
      ctx.beginPath(); ctx.arc(sx, sy + fw * .18, 2 * sc, 0, TAU); ctx.fill();
    }
    for (const c of this.clouds) {
      const cx = (mod(c.x + t * c.spd - cam * c.par, span) - 200) * sc, cy = c.y * sc;
      const a = .05 + c.par * .13;
      ctx.fillStyle = `rgba(200,190,255,${a})`;
      for (const [dx, dy, r] of c.puffs) { ctx.beginPath(); ctx.arc(cx + dx * c.s * sc, cy + dy * c.s * sc, r * c.s * sc, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      for (const [dx, dy, r] of c.puffs) { ctx.beginPath(); ctx.arc(cx + dx * c.s * sc, cy + (dy - 5) * c.s * sc, r * .7 * c.s * sc, 0, TAU); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      const lx = w * (.25 + i * .45) + Math.sin(t * .1 + i * 2) * 40;
      const lg = ctx.createLinearGradient(0, 0, 0, h);
      lg.addColorStop(0, 'rgba(124,92,255,.07)'); lg.addColorStop(1, 'rgba(124,92,255,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.moveTo(lx - 30, 0); ctx.lineTo(lx + 30, 0); ctx.lineTo(lx + 150, h); ctx.lineTo(lx - 150, h); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    const shScale = this.reduceMotion ? .25 : 1;
    const shx = (Math.random() - .5) * 2 * 10 * this.shake * shScale;
    const shy = (Math.random() - .5) * 2 * 8 * this.shake * shScale;
    ctx.save();
    ctx.translate(-cam * sc + shx, shy);
    ctx.scale(sc, sc);
    for (const isl of this.islands) {
      if (isl.p.x + isl.p.w < cam - 60 || isl.p.x > cam + this.viewW + 60) continue;
      drawIsland(ctx, isl, t);
    }
    for (const hz of this.hazards) drawHazard(ctx, hz, t);
    for (let i = 0; i < this.stars.length; i++) if (!this.stars[i].got) drawStar(ctx, this.stars[i], t, i);
    drawPortal(ctx, LEVEL.portal.x, LEVEL.portal.y, t, this.runState === 'winning' || this.runState === 'won' ? clamp(this.winT, 0, 1) : 0);
    drawParts(this.parts, ctx, false);
    const pl = this.player;
    if (this.runState !== 'over') {
      const gp = pl.grounded ? pl.ground : this.groundBelow(pl.x, pl.y);
      if (gp) {
        const dist = gp.y - pl.y;
        if (dist < 240) {
          ctx.globalAlpha = .4 * (1 - dist / 240);
          ctx.fillStyle = 'rgba(4,5,14,.9)';
          ctx.beginPath(); ctx.ellipse(pl.x, gp.y + 4, 16 * pl.scale, 4, 0, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      const bk = this.blinkPh > 0 ? clamp(Math.abs(this.blinkPh - .065) / .065, .1, 1) : 1;
      drawRobot(ctx, {
        x: pl.x, y: pl.y, vx: pl.vx, vy: pl.vy, grounded: pl.grounded, facing: pl.facing,
        runPhase: pl.runPhase, sx: pl.sx, sy: pl.sy, blink: bk, happy: this.happy,
        invuln: pl.invuln, scale: pl.scale, spin: pl.spin
      }, t);
    }
    drawParts(this.parts, ctx, true);
    ctx.font = '600 13px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const hn of this.hints) {
      if (hn.a < .02) continue;
      const tw = ctx.measureText(hn.text).width;
      const hy = hn.y + Math.sin(t * 2 + hn.x) * 3;
      ctx.globalAlpha = hn.a;
      rr(ctx, hn.x - tw / 2 - 13, hy - 15, tw + 26, 30, 15);
      ctx.fillStyle = 'rgba(10,12,30,.78)'; ctx.fill();
      ctx.strokeStyle = 'rgba(124,92,255,.45)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#dfe3ff'; ctx.fillText(hn.text, hn.x, hy + .5);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
    ctx.fillStyle = this.vignette || 'rgba(0,0,0,0)'; ctx.fillRect(0, 0, w, h);
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,45,85,${this.flash * .35})`; ctx.fillRect(0, 0, w, h); }
    if ((this.runState === 'winning' || this.runState === 'won') && this.winT > .85) {
      ctx.fillStyle = `rgba(255,255,255,${clamp((this.winT - .85) / .3, 0, 1) * .8})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
}

/* ============================================================
   ФОН САЙТА (аврора + пыль)
   ============================================================ */
function createBackdrop(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 2, h = 2, dpr = 1, acc = 0, t = 0;
  const R = mulberry(7);
  const dots = [];
  for (let i = 0; i < 70; i++) dots.push({ nx: R(), ny: R(), r: .6 + R() * 1.8, sp: .008 + R() * .02, ph: R() * TAU, c: ['#7c5cff', '#4cc9f0', '#ff8fd3', '#cfd6ff'][Math.floor(R() * 4)] });
  const blobs = [
    { c: '#6d4aff', nx: .2, ny: .25, r: .5, sp: .05, ph: 0 },
    { c: '#2f6bff', nx: .8, ny: .2, r: .45, sp: .04, ph: 2 },
    { c: '#ff5fa8', nx: .6, ny: .85, r: .4, sp: .06, ph: 4 }
  ];
  return {
    resize(cw, ch, cd) { w = cw; h = ch; dpr = cd; canvas.width = Math.round(cw * cd); canvas.height = Math.round(ch * cd); },
    render(dt) {
      acc += dt;
      if (acc < 1 / 30) return;
      const d = Math.min(acc, .1); acc = 0; t += d;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const b of blobs) {
        const x = (b.nx + Math.sin(t * b.sp + b.ph) * .06) * w;
        const y = (b.ny + Math.cos(t * b.sp * .8 + b.ph) * .05) * h;
        glow(ctx, x, y, b.r * Math.max(w, h) * .6, b.c, .14);
      }
      for (const p of dots) {
        p.ny -= p.sp * d; if (p.ny < -.02) p.ny = 1.02;
        ctx.globalAlpha = .25 + .55 * Math.pow(Math.sin(t * 1.3 + p.ph), 2);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.nx * w, p.ny * h, p.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  };
}

/* ============================================================
   ЖИВАЯ СЦЕНА НА ГЛАВНОЙ (attract-режим)
   ============================================================ */
function createAttract(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let w = 2, h = 2, dpr = 1, t = 0;
  const sky = ctx.createLinearGradient(0, 0, 0, 400);
  sky.addColorStop(0, '#050614'); sky.addColorStop(.45, '#141040'); sky.addColorStop(.75, '#2c1a58'); sky.addColorStop(1, '#0e0a26');
  const main = { x: 70, y: 300, w: 230 };
  const small = { x: 470, y: 315, w: 140 };
  const islA = buildIsland(ctx, main, 900);
  const islB = buildIsland(ctx, small, 950);
  const stars = [{ x: 320, y: 218 }, { x: 365, y: 196 }, { x: 410, y: 218 }];
  const parts = makeParts();
  const R = mulberry(13);
  const skyDots = [];
  for (let i = 0; i < 16; i++) skyDots.push({ x: R() * 640, y: R() * 200, r: .6 + R() * 1.3, tw: R() * TAU });
  const clouds = [
    { x: 60, y: 70, s: .8, spd: 7, puffs: [[-30, 0, 18], [-6, -6, 22], [20, 0, 17], [40, 4, 12]] },
    { x: 420, y: 120, s: .6, spd: 10, puffs: [[-24, 0, 15], [0, -5, 19], [22, 2, 13]] }
  ];
  const bot = { x: 185, y: 300, vx: 0, vy: 0, grounded: true, facing: 1, runPhase: 0, sx: 1, sy: 1, blink: 1, happy: 0, invuln: 0, scale: 1, spin: 0 };
  let hopClock = 2.2, blinkT = 2.4, blinkPh = 0, portalTimer = 0;
  const HOP_P = 3.6, HOP_D = .62, HOP_H = 48;
  return {
    resize(cw, ch, cd) { w = cw; h = ch; dpr = cd; canvas.width = Math.round(cw * cd); canvas.height = Math.round(ch * cd); },
    render(dt) {
      t += dt;
      hopClock += dt;
      const cyc = hopClock % HOP_P;
      let yOff = 0, air = false;
      if (cyc < HOP_D) {
        const pr = cyc / HOP_D;
        yOff = -4 * HOP_H * pr * (1 - pr); air = true;
        bot.vy = (pr < .5 ? -1 : 1) * 200;
        if (pr > .96 && bot.grounded === false) { /* landing below */ }
      } else if (bot.grounded === false) {
        bot.grounded = true; bot.sx = 1.15; bot.sy = .85; bot.happy = .6;
        dust(parts, bot.x, main.y, 6);
      }
      if (air && bot.grounded) { bot.grounded = false; bot.sx = .85; bot.sy = 1.15; dust(parts, bot.x, main.y, 4); }
      bot.y = main.y + yOff;
      bot.sx += (1 - bot.sx) * Math.min(1, dt * 10);
      bot.sy += (1 - bot.sy) * Math.min(1, dt * 10);
      if (bot.happy > 0) bot.happy -= dt;
      blinkT -= dt;
      if (blinkT <= 0) { blinkPh = .13; blinkT = 2 + Math.random() * 3; }
      if (blinkPh > 0) blinkPh -= dt;
      bot.blink = blinkPh > 0 ? clamp(Math.abs(blinkPh - .065) / .065, .1, 1) : 1;
      portalTimer -= dt;
      if (portalTimer <= 0) { portalTimer = .18; part(parts, { x: 540 + (Math.random() - .5) * 44, y: 300 - Math.random() * 90, vy: -25, life: .9, size: 3, c: Math.random() < .5 ? '#7c5cff' : '#4cc9f0' }); }
      updateParts(parts, dt);
      const s = Math.min(w / 640, h / 400);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0e0a26'; ctx.fillRect(0, 0, w, h);
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w - 640 * s) / 2, dpr * (h - 400 * s) / 2);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, 640, 400);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 140, 110, 200, '#4b2fd8', .35);
      glow(ctx, 520, 90, 170, '#2f6bff', .25);
      glow(ctx, 340, 380, 220, '#ff5fa8', .16);
      ctx.globalCompositeOperation = 'source-over';
      for (const d of skyDots) {
        ctx.globalAlpha = .3 + .5 * Math.pow(Math.sin(t * 1.5 + d.tw), 2);
        ctx.fillStyle = '#cfd6ff';
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const c of clouds) {
        const cx = mod(c.x + t * c.spd, 760) - 60;
        ctx.fillStyle = 'rgba(200,190,255,.12)';
        for (const [dx, dy, r] of c.puffs) { ctx.beginPath(); ctx.arc(cx + dx * c.s, c.y + dy * c.s, r * c.s, 0, TAU); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,255,255,.06)';
        for (const [dx, dy, r] of c.puffs) { ctx.beginPath(); ctx.arc(cx + dx * c.s, c.y + (dy - 5) * c.s, r * .7 * c.s, 0, TAU); ctx.fill(); }
      }
      drawIsland(ctx, islA, t);
      drawIsland(ctx, islB, t);
      for (let i = 0; i < stars.length; i++) drawStar(ctx, stars[i], t, i);
      drawPortal(ctx, 540, 315, t, 0);
      drawParts(parts, ctx, false);
      ctx.globalAlpha = .35; ctx.fillStyle = 'rgba(4,5,14,.9)';
      ctx.beginPath(); ctx.ellipse(bot.x, main.y + 4, 16, 4, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      drawRobot(ctx, bot, t);
      drawParts(parts, ctx, true);
    }
  };
}

window.HyperGame = { Game, createBackdrop, createAttract };
})();