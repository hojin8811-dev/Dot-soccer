/*! 꼬마일레븐 FC v35 — 포켓리그 스타일 픽셀 도트 치비 엔진 (pixel_player.js)

    16비트 감성의 진짜 픽셀 도트 선수. 벡터 관절 + 일러스트 머리 파츠를 쓰지 않고,
    도트 격자에 검은 픽셀 외곽선을 두른 2.5등신 치비를 코드로 찍어낸다.

    · 격자: 1 dot = 스프라이트 최소 픽셀. 발바닥이 캔버스 맨 아래.
    · 방향: 4방향(down 앞 · up 뒤 · side 옆 → 좌우 반전).
    · 레이어: 헤어 덩어리 → 얼굴 오벌 → 앞머리 → 눈/입 → 액세서리.
    · 동작: run 4 · idle 2 · kick 3 · tackle 2 · dive 2 · jump 2 · celebrate 2 · stun.
    · 개성: 헤어 10종 × PIC_META 머리색/피부 × 액세서리(안경·선글라스·머리띠) × 유니폼.
*/
(function (global) {
  'use strict';

  var DS = global.DS = global.DS || {};

  /* ─────────────────────────  격자 · 래스터  ───────────────────────── */
  var GW = 36, GH = 36;
  var CX = 18;
  var GROUND = 35;               /* 발바닥 바닥선 (이 아래 1행 여유) */
  var OUT = '#171426';

  function Grid() {
    this.w = GW; this.h = GH;
    this.d = new Uint8Array(GW * GH);
    this.pal = [null];
    this.map = {};
  }
  Grid.prototype.c = function (hex) {
    if (!hex) { return 0; }
    var i = this.map[hex];
    if (i === undefined) { i = this.pal.length; this.pal.push(hex); this.map[hex] = i; }
    return i;
  };
  Grid.prototype.put = function (x, y, ci) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) { return; }
    if (ci) { this.d[y * this.w + x] = ci; }
  };
  Grid.prototype.ellipse = function (cx, cy, rx, ry, hex) {
    var ci = this.c(hex), x, y, dx, dy, x0, x1, y0, y1;
    x0 = Math.floor(cx - rx); x1 = Math.ceil(cx + rx);
    y0 = Math.floor(cy - ry); y1 = Math.ceil(cy + ry);
    for (y = y0; y <= y1; y++) {
      dy = (y + 0.5 - cy) / (ry || 0.5);
      for (x = x0; x <= x1; x++) {
        dx = (x + 0.5 - cx) / (rx || 0.5);
        if (dx * dx + dy * dy <= 1) { this.put(x, y, ci); }
      }
    }
  };
  Grid.prototype.rect = function (x0, y0, x1, y1, hex) {
    var ci = this.c(hex), x, y;
    for (y = Math.round(Math.min(y0, y1)); y <= Math.round(Math.max(y0, y1)); y++) {
      for (x = Math.round(Math.min(x0, x1)); x <= Math.round(Math.max(x0, x1)); x++) { this.put(x, y, ci); }
    }
  };
  /* 모서리 둥근 사각형 — 몸통·반바지 */
  Grid.prototype.rrect = function (x0, y0, x1, y1, r, hex) {
    var ci = this.c(hex), x, y, cx, cy, dx, dy, left, right, top, bot;
    left = Math.min(x0, x1); right = Math.max(x0, x1);
    top = Math.min(y0, y1); bot = Math.max(y0, y1);
    for (y = Math.floor(top); y <= Math.ceil(bot); y++) {
      for (x = Math.floor(left); x <= Math.ceil(right); x++) {
        var px = x + 0.5, py = y + 0.5;
        if (px < left || px > right || py < top || py > bot) { continue; }
        cx = px < left + r ? left + r : (px > right - r ? right - r : px);
        cy = py < top + r ? top + r : (py > bot - r ? bot - r : py);
        dx = px - cx; dy = py - cy;
        if (dx * dx + dy * dy <= r * r + 0.001) { this.put(x, y, ci); }
      }
    }
  };
  Grid.prototype.capsule = function (ax, ay, bx, by, r, hex) {
    var ci = this.c(hex), x, y, x0, x1, y0, y1, vx, vy, wx, wy, t, dx, dy, rr = r * r;
    x0 = Math.floor(Math.min(ax, bx) - r); x1 = Math.ceil(Math.max(ax, bx) + r);
    y0 = Math.floor(Math.min(ay, by) - r); y1 = Math.ceil(Math.max(ay, by) + r);
    vx = bx - ax; vy = by - ay;
    var len2 = vx * vx + vy * vy || 0.0001;
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        wx = x + 0.5 - ax; wy = y + 0.5 - ay;
        t = (wx * vx + wy * vy) / len2;
        if (t < 0) { t = 0; } else if (t > 1) { t = 1; }
        dx = wx - vx * t; dy = wy - vy * t;
        if (dx * dx + dy * dy <= rr) { this.put(x, y, ci); }
      }
    }
  };
  Grid.prototype.tri = function (ax, ay, bx, by, cx2, cy2, hex) {
    var ci = this.c(hex), x, y, x0, x1, y0, y1, d1, d2, d3, neg, pos;
    x0 = Math.floor(Math.min(ax, bx, cx2)); x1 = Math.ceil(Math.max(ax, bx, cx2));
    y0 = Math.floor(Math.min(ay, by, cy2)); y1 = Math.ceil(Math.max(ay, by, cy2));
    function side(px, py, qx, qy, rx, ry) { return (qx - px) * (ry - py) - (qy - py) * (rx - px); }
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        var px = x + 0.5, py = y + 0.5;
        d1 = side(ax, ay, bx, by, px, py);
        d2 = side(bx, by, cx2, cy2, px, py);
        d3 = side(cx2, cy2, ax, ay, px, py);
        neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
        if (!(neg && pos)) { this.put(x, y, ci); }
      }
    }
  };
  Grid.prototype.outline = function (color) {
    var ci = this.c(color || OUT), w = this.w, h = this.h, src = this.d.slice(), x, y, i;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (src[i]) { continue; }
        if ((x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) ||
            (y > 0 && src[i - w]) || (y < h - 1 && src[i + w])) {
          this.d[i] = ci;
        }
      }
    }
  };

  var rgbCache = {};
  function rgb(hex) {
    var v = rgbCache[hex];
    if (v) { return v; }
    var h = hex.replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    rgbCache[hex] = v;
    return v;
  }
  function toCanvas(g) {
    var cv = global.document.createElement('canvas');
    cv.width = g.w; cv.height = g.h;
    var c2 = cv.getContext('2d');
    var img = c2.createImageData(g.w, g.h), data = img.data, i, p, c;
    for (i = 0; i < g.d.length; i++) {
      c = g.d[i];
      if (!c) { continue; }
      p = rgb(g.pal[c] || '#000000');
      data[i * 4] = p[0]; data[i * 4 + 1] = p[1]; data[i * 4 + 2] = p[2]; data[i * 4 + 3] = 255;
    }
    c2.putImageData(img, 0, 0);
    return cv;
  }

  /* ─────────────────────────  팔레트  ───────────────────────── */
  function darken(hex, k) {
    var p = rgb(hex), f = function (v) { return Math.max(0, Math.min(255, Math.round(v * k))); };
    return '#' + [f(p[0]), f(p[1]), f(p[2])].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  function lighten(hex, k) {
    var p = rgb(hex), f = function (v) { return Math.max(0, Math.min(255, Math.round(255 - (255 - v) * k))); };
    return '#' + [f(p[0]), f(p[1]), f(p[2])].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }

  var KITS = {
    home: { shirt: '#2f5ce0', shirtD: '#1f3fa6', shirtL: '#6a92ff', trim: '#ffd34d', shorts: '#f4f2e8', shortsD: '#cdc8b8', shortsTrim: '#2f5ce0', sock: '#2f5ce0', sockD: '#1f3fa6', sockTrim: '#ffd34d', boot: '#242633', bootD: '#13141c', glove: null },
    away: { shirt: '#e2232e', shirtD: '#a8121c', shirtL: '#ff6b6b', trim: '#f7f4ea', shorts: '#20222c', shortsD: '#12131a', shortsTrim: '#e2232e', sock: '#20222c', sockD: '#12131a', sockTrim: '#f7f4ea', boot: '#ebe8dc', bootD: '#b6b1a2', glove: null },
    gk:   { shirt: '#ffd93d', shirtD: '#d3a80c', shirtL: '#fff6a4', trim: '#1e7a3c', shorts: '#1e7a3c', shortsD: '#105526', shortsTrim: '#ffd93d', sock: '#ffd93d', sockD: '#d3a80c', sockTrim: '#1e7a3c', boot: '#1e7a3c', bootD: '#105526', glove: '#46c96a' },
    gk2:  { shirt: '#3ad07c', shirtD: '#1e9552', shirtL: '#9cf7bd', trim: '#14322a', shorts: '#14322a', shortsD: '#0b211a', shortsTrim: '#3ad07c', sock: '#3ad07c', sockD: '#1e9552', sockTrim: '#14322a', boot: '#14322a', bootD: '#0b211a', glove: '#f2f7f0' },
    ref:  { shirt: '#2b2b36', shirtD: '#16161d', shirtL: '#4a4a5c', trim: '#f2f2f8', shorts: '#2b2b36', shortsD: '#16161d', shortsTrim: '#f2f2f8', sock: '#2b2b36', sockD: '#16161d', sockTrim: '#f2f2f8', boot: '#101116', bootD: '#08090c', glove: null }
  };
  var SKINS = [
    ['#ffe4c6', '#e9ba90'],
    ['#f5c99e', '#d9a274'],
    ['#d29a68', '#ab7446'],
    ['#a06a3c', '#7a4c29']
  ];

  /* ─────────────────────────  룩  ───────────────────────── */
  var lookCache = {};
  function lookOf(pic, kit) {
    pic = Math.max(1, Math.min(DS.PIC_COUNT || 500, pic || 1));
    var key = pic + '|' + kit;
    var v = lookCache[key];
    if (v) { return v; }
    var meta = (DS.PIC_META && DS.PIC_META[pic]) || { hair: 'spiky', color: '#3a2a1a', skin: '#f2c9a2' };
    var p = rgb(meta.skin || '#f2c9a2');
    var lum = (p[0] * 0.30 + p[1] * 0.59 + p[2] * 0.11) / 255;
    var sk = lum > 0.86 ? 0 : (lum > 0.76 ? 1 : (lum > 0.62 ? 2 : 3));
    var acc = 'none';
    if (pic % 9 === 4) { acc = 'glasses'; }
    else if (pic % 13 === 7) { acc = 'headband'; }
    else if (pic % 17 === 11) { acc = 'shades'; }
    v = { kit: kit || 'home', hair: meta.hair || 'spiky', hairColor: meta.color || '#3a2a1a', skin: sk, acc: acc, pic: pic };
    lookCache[key] = v;
    return v;
  }
  function lookKey(l) {
    return l.kit + '|' + l.hair + '|' + l.hairColor + '|' + l.skin + '|' + (l.acc || 'none');
  }

  /* ─────────────────────────  몸 비율 (도트)  ─────────────────────────
     머리 꼭대기 y≈3 · 턱 y≈15.5 · 어깨 18.2 · 허리 23.4 · 무릎 27.4 · 발바닥 35 */
  var HIP_Y = 23.4, SH_Y = 17.2, HEAD_Y = 9.0, HEAD_RX = 6.1, HEAD_RY = 6.3;
  var THIGH = 4.8, SHIN = 4.7, UARM = 3.8, FARM = 3.9;
  var FOOT_Y = 32.9;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function ik(ax, ay, bx, by, l1, l2, bend) {
    var dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy);
    var dd = clamp(d, 0.4, l1 + l2 - 0.05);
    var cosA = clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1);
    var a = Math.acos(cosA);
    var base = Math.atan2(dx, dy);
    var ang = base + bend * a;
    return { mx: ax + Math.sin(ang) * l1, my: ay + Math.cos(ang) * l1, bx: bx, by: by };
  }

  /* 자세 관절 */
  function rig(look, dir, pose, f, t) {
    var hipY = HIP_Y, shY = SH_Y, headY = HEAD_Y, headX = CX;
    var side = dir === 'side';
    var lean = 0, feet, hands, i;

    feet = [{ x: CX + (side ? -0.6 : -2.3), y: FOOT_Y }, { x: CX + (side ? 0.6 : 2.3), y: FOOT_Y }];
    hands = [{ x: CX + (side ? 1.4 : -5.6), y: 26.6 }, { x: CX + (side ? 0.2 : 5.6), y: 26.6 }];

    if (pose === 'idle' || pose === 'dribble') {
      var br = Math.sin((t || 0) * 2.1);
      hipY -= br * 0.16;
      headY -= br * 0.2;
      hands[0].y -= br * 0.25; hands[1].y -= br * 0.25;
      if (pose === 'dribble') { headY += 0.25; hands[0].y -= 0.3; }
    } else if (pose === 'run' || pose === 'celebrate') {
      var ph = (f % 4) * Math.PI / 2;
      if (side) {
        var s = Math.sin(ph);
        feet[0] = { x: CX + 3.2 * s, y: FOOT_Y - Math.max(0, -Math.cos(ph)) * 2.9 };
        feet[1] = { x: CX - 3.2 * s, y: FOOT_Y - Math.max(0, Math.cos(ph)) * 2.9 };
        hipY = HIP_Y - 0.3 - Math.abs(Math.cos(ph)) * 0.5;
        hands[0] = { x: CX - 2.7 * s + 0.4, y: 25.2 - Math.max(0, s) * 2.8 };
        hands[1] = { x: CX + 2.7 * s + 0.4, y: 25.2 - Math.max(0, -s) * 2.8 };
        lean = 1;
      } else {
        var u0 = Math.max(0, Math.sin(ph)), u1 = Math.max(0, Math.sin(ph + Math.PI));
        feet[0] = { x: CX - 2.2 - u0 * 0.7, y: FOOT_Y - u0 * 3.0 };
        feet[1] = { x: CX + 2.2 + u1 * 0.7, y: FOOT_Y - u1 * 3.0 };
        hipY = HIP_Y - 0.2 - Math.abs(Math.sin(ph * 2)) * 0.3;
        hands[0] = { x: CX - 5.3 - u1 * 0.7, y: 26.2 - u1 * 2.2 };
        hands[1] = { x: CX + 5.3 + u0 * 0.7, y: 26.2 - u0 * 2.2 };
        lean = 1;
      }
      if (pose === 'celebrate') {
        var cv = Math.sin((t || 0) * 7.2);
        feet[0] = { x: CX - 2.3, y: FOOT_Y - 1.0 - Math.abs(cv) * 1.0 };
        feet[1] = { x: CX + 2.5, y: FOOT_Y - 2.2 + Math.abs(cv) * 0.6 };
        hands[0] = { x: CX - 3.8, y: 11.4 - cv * 0.8 };
        hands[1] = { x: CX + 4.0, y: 11.0 + cv * 0.8 };
        hipY = HIP_Y - 0.5; headY = HEAD_Y - 0.5; lean = 0;
      }
    } else if (pose === 'kick' || pose === 'pass') {
      var kp = pose === 'pass' ? 0.6 : 1;
      if (f === 0) {
        feet[0] = { x: CX - 2.9 * kp, y: FOOT_Y - 2.6 * kp };
        feet[1] = { x: CX + 1.3, y: FOOT_Y };
        hands[0] = { x: CX + 2.6, y: 23.6 };
        hands[1] = { x: CX - 4.6, y: 22.8 };
      } else if (f === 1) {
        feet[0] = { x: CX + 3.6 * kp + 0.3, y: FOOT_Y - 3.2 * kp };
        feet[1] = { x: CX - 0.7, y: FOOT_Y };
        hands[0] = { x: CX - 3.0, y: 24.0 };
        hands[1] = { x: CX + 3.8, y: 22.0 };
        lean = -1;
      } else {
        feet[0] = { x: CX + 2.8 * kp + 0.5, y: FOOT_Y - (5.8 + 3.0 * kp) };
        feet[1] = { x: CX - 0.5, y: FOOT_Y };
        hands[0] = { x: CX - 3.8, y: 24.8 };
        hands[1] = { x: CX + 4.4, y: 21.0 };
        lean = -2; headY += 0.2;
      }
    } else if (pose === 'tackle') {
      var e = f === 0 ? 0 : 1;
      hipY = HIP_Y + 3.4 + e * 0.9;
      headY = HEAD_Y + 5.6 + e * 0.5;
      headX = CX - 1.5 - e * 1.0;
      feet[0] = { x: CX + 5.4 + e * 0.8, y: FOOT_Y - 0.2 };
      feet[1] = { x: CX + 1.5, y: FOOT_Y };
      hands[0] = { x: CX - 3.8, y: 23.0 + e };
      hands[1] = { x: CX - 1.2, y: 22.0 + e };
      lean = -3;
    } else if (pose === 'dive') {
      var d = f === 0 ? 0.5 : 1;
      hipY = HIP_Y + 4.6 + d * 0.5;
      headY = HEAD_Y + 7.0;
      headX = CX + 3.8 + d * 1.4;
      feet[0] = { x: CX - 4.8, y: FOOT_Y - 1.2 };
      feet[1] = { x: CX - 3.2, y: FOOT_Y - 3.6 };
      hands[0] = { x: CX + 9.0 + d * 1.4, y: headY - 2.6 };
      hands[1] = { x: CX + 8.0 + d, y: headY + 2.8 };
      lean = -5;
    } else if (pose === 'jump') {
      feet[0] = { x: CX - 1.9, y: FOOT_Y - 2.8 };
      feet[1] = { x: CX + 1.9, y: FOOT_Y - 2.0 };
      hands[0] = { x: CX - 3.8, y: 11.2 };
      hands[1] = { x: CX + 4.0, y: 10.8 };
      hipY = HIP_Y - 0.3; headY = HEAD_Y - 0.2;
    } else if (pose === 'stun') {
      var sv = Math.sin((t || 0) * 9);
      headX += sv * 0.7;
      hands[0] = { x: CX - 5.8, y: 22.8 + sv * 0.7 };
      hands[1] = { x: CX + 5.8, y: 23.2 - sv * 0.7 };
    }

    var L = [], A = [];
    for (i = 0; i < 2; i++) {
      var hipX = CX + (side ? (i === 0 ? 1.0 : -1.0) : (i === 0 ? -2.2 : 2.2));
      L.push(ik(hipX, hipY, feet[i].x, feet[i].y, THIGH, SHIN, 1));
      L[i].hx = hipX; L[i].hy = hipY;
    }
    for (i = 0; i < 2; i++) {
      var shX = CX + (side ? (i === 0 ? 1.7 : -1.5) : (i === 0 ? -5.3 : 5.3));
      var shY2 = shY + (side && i === 1 ? 0.5 : 0);
      A.push(ik(shX, shY2, hands[i].x, hands[i].y, UARM, FARM, -1));
      A[i].sx = shX; A[i].sy = shY2;
    }
    return { hipY: hipY, shY: shY, headX: headX, headY: headY, lean: lean, legs: L, arms: A, side: side, dir: dir, pose: pose };
  }

  /* ─────────────────────────  부위별 그리기  ───────────────────────── */
  function ringCaps(g, ax, ay, bx, by, r, col, dark) {
    g.capsule(ax, ay, bx, by, r + 0.55, OUT);
    if (dark) { g.capsule(ax, ay + 1, bx, by + 1, r, dark); }
    g.capsule(ax, ay, bx, by, r, col);
    if (dark) { g.capsule(ax - 0.25, ay - 0.55, bx - 0.25, by - 0.55, r - 0.5, col); }
  }
  function ringEll(g, cx, cy, rx, ry, col, dark) {
    g.ellipse(cx, cy, rx + 0.55, ry + 0.55, OUT);
    if (dark) { g.ellipse(cx, cy + 1, rx, ry, dark); }
    g.ellipse(cx, cy, rx, ry, col);
    if (dark) { g.ellipse(cx - 0.2, cy - 0.6, rx - 0.6, ry - 0.6, col); }
  }

  function drawLeg(g, look, K, R, i, near) {
    var lg = R.legs[i];
    var sk = SKINS[look.skin];
    var skinC = near ? sk[0] : darken(sk[0], 0.84);
    var sockC = near ? K.sock : darken(K.sock, 0.82);
    var bootC = near ? K.boot : darken(K.boot, 0.85);
    var w = near ? 1.15 : 1.0;
    /* 허벅지 (살색) */
    g.capsule(lg.hx, lg.hy - 0.8, lg.mx, lg.my + 0.6, w, skinC);
    /* 스타킹 — 무릎부터 발목까지 */
    g.capsule(lg.mx, lg.my, lg.bx, lg.by - 0.4, w, sockC);
    /* 축구화 — 발목에서 앞으로 뻗는다 */
    var ax = lg.bx, ay = lg.by - 0.2;
    if (R.side) {
      g.rect(ax - 1.3, ay, ax + 2.4, ay + 1.4, bootC);
      g.rect(ax - 1.3, ay + 1.4, ax + 2.4, ay + 1.7, darken(bootC, 0.55));
    } else {
      g.rect(ax - 1.5, ay, ax + 1.5, ay + 1.4, bootC);
      g.rect(ax - 1.5, ay + 1.4, ax + 1.5, ay + 1.7, darken(bootC, 0.55));
    }
    /* 무릎 살색 이음매 */
    if (near) { g.rect(lg.mx - 0.8, lg.my - 0.2, lg.mx + 0.8, lg.my + 0.3, darken(skinC, 0.86)); }
  }

  function drawArm(g, look, K, R, i, near) {
    var a = R.arms[i];
    var sk = SKINS[look.skin];
    var skinC = near ? sk[0] : darken(sk[0], 0.84);
    var kitC = near ? K.shirt : darken(K.shirt, 0.82);
    var w = near ? 1.0 : 0.9;
    /* 짧은 소매 (어깨 ~ 팔꿈치) */
    g.capsule(a.sx, a.sy + 0.4, a.mx, a.my - 0.4, w + 0.15, kitC);
    /* 소매 끝 트림 */
    var dx = a.mx - a.sx, dy = a.my - a.sy, dl = Math.sqrt(dx * dx + dy * dy) || 1;
    var tx = a.mx - dx / dl * 1.1, ty = a.my - dy / dl * 1.1;
    g.rect(tx - 0.8, ty - 0.4, tx + 0.8, ty + 0.4, near ? K.trim : darken(K.trim, 0.86));
    /* 팔뚝 (살색) */
    g.capsule(a.mx, a.my, a.bx, a.by, w, skinC);
    /* 손 */
    g.ellipse(a.bx, a.by + 0.4, 1.05, 1.05, K.glove ? (near ? K.glove : darken(K.glove, 0.85)) : skinC);
  }

  function drawTorso(g, look, K, R) {
    var hipY = R.hipY, shY = R.shY;
    var lk = R.lean * 0.25;
    var hx = CX + lk * 0.6;
    var top = shY + 0.2;
    /* 반바지 */
    g.rrect(hx - 3.6, hipY - 1.9, hx + 3.6, hipY + 1.5, 1.5, K.shorts);
    /* 유니폼 상의 */
    g.rrect(hx - 4.7, top, hx + 4.7, hipY - 0.8, 2.2, K.shirt);
    /* 깃 */
    if (!R.side) {
      g.rect(hx - 1.2, top + 0.2, hx + 1.2, top + 0.7, K.trim);
      g.rect(hx - 0.4, top + 0.8, hx + 0.4, top + 1.1, K.shirtD);
    } else {
      g.rect(hx + 0.9, top + 0.2, hx + 2.2, top + 0.7, K.trim);
    }
    /* 상의 밑단 그늘 */
    g.rect(hx - 4.5, hipY - 1.9, hx + 4.5, hipY - 1.1, K.shirtD);
    /* 반바지 밑단 */
    g.rect(hx - 3.7, hipY + 1.6, hx + 3.7, hipY + 2.0, K.shortsD);
  }

  /* ── 머리 — 헤어 캡 + 큰 얼굴 오벌 ── */
  function drawHead(g, look, R) {
    var hx = R.headX, hy = R.headY;
    var rx = HEAD_RX, ry = HEAD_RY;
    var sk = SKINS[look.skin];
    var skinC = sk[0], skinD = sk[1];
    var hair = look.hairColor, hairD = darken(hair, 0.74);
    var style = look.hair, i, side = R.side;
    var top = hy - ry;

    /* 목 */
    g.rect(hx - 1.0, hy + ry - 1.2, hx + 1.0, hy + ry + 0.8, skinD);

    /* 헤어 캡 — 머리 전체 실루엣 */
    g.ellipse(hx - (side ? 0.7 : 0), hy - 0.7, rx + 0.4, ry + 0.2, hair);
    /* 얼굴 — 캡 위에 얹어 이마선을 만든다 (큰 오벌) */
    g.ellipse(hx + (side ? 1.2 : 0), hy + 2.9, rx - 1.2, ry - 2.7, skinC);
    if (side) {
      g.rect(hx + rx - 0.9, hy + 3.0, hx + rx + 0.1, hy + 3.9, skinC);   /* 코 */
      g.rect(hx - 1.2, hy + 2.2, hx - 0.2, hy + 3.8, skinD);             /* 귀 */
    } else {
      g.rect(hx - rx + 0.1, hy + 2.4, hx - rx + 0.9, hy + 3.8, skinC);   /* 귀 */
      g.rect(hx + rx - 0.9, hy + 2.4, hx + rx - 0.1, hy + 3.8, skinC);
    }
    /* 털 경계 — 이마에 살짝 내려오는 앞머리 (스타일별 모양) */
    var fl = hy - 1.0;   /* 이마선(앞머리 아래 끝) */
    if (style === 'buzz' || style === 'undercut') {
      g.rect(hx - rx + 1.6, fl - 0.2, hx + rx - 1.6, fl + 0.4, hair);
    } else if (style === 'swoop') {
      g.tri(hx - rx + 1.2, fl + 0.5, hx + 1.4, fl - 0.4, hx + rx - 1.4, fl + 0.8, hair);
    } else if (style === 'wavy') {
      g.tri(hx - 4.0, fl - 0.2, hx - 1.6, fl - 0.2, hx - 3.4, fl + 1.4, hair);
      g.tri(hx + 0.8, fl - 0.2, hx + 3.4, fl - 0.2, hx + 2.4, fl + 1.6, hair);
      g.rect(hx - rx + 1.0, fl - 0.4, hx + rx - 1.0, fl + 0.2, hair);
    } else if (style === 'ponytail') {
      g.rect(hx - rx + 1.4, fl - 0.3, hx + rx - 1.4, fl + 0.3, hair);
      g.tri(hx - 3.6, fl, hx - 1.2, fl, hx - 2.2, fl + 1.6, hair);
    } else if (style === 'afro') {
      g.rect(hx - 4.6, fl - 0.3, hx + 4.6, fl + 0.4, hair);
    } else if (style === 'mohawk') {
      /* 옆머리 짧게 */
      g.rect(hx - rx + 1.2, fl - 0.2, hx - 1.8, fl + 0.5, hairD);
      g.rect(hx + 1.8, fl - 0.2, hx + rx - 1.2, fl + 0.5, hairD);
    } else if (style === 'braids') {
      g.rect(hx - rx + 1.4, fl - 0.3, hx + rx - 1.4, fl + 0.3, hair);
      g.tri(hx + 1.0, fl, hx + 3.0, fl, hx + 2.2, fl + 1.4, hair);
    } else {  /* spiky · silver */
      g.tri(hx - 3.4, fl - 0.3, hx - 0.8, fl - 0.3, hx - 2.6, fl + 1.4, hair);
      g.tri(hx + 0.6, fl - 0.3, hx + 3.2, fl - 0.3, hx + 2.0, fl + 1.2, hair);
      g.rect(hx - rx + 1.2, fl - 0.4, hx + rx - 1.2, fl + 0.2, hair);
    }

    /* 스타일별 덧붙임 — 실루엣 밖으로 나가는 부분 */
    if (style === 'spiky' || style === 'silver') {
      for (i = 0; i < 5; i++) {
        var sx = hx - 4.4 + i * 2.2;
        var hgt = 2.6 - Math.abs(i - 2) * 0.45;
        g.tri(sx - 1.3, top + 0.8, sx + 1.3, top + 0.8, sx + (i % 2 ? 0.9 : -0.5), top + 0.8 - hgt, hair);
      }
    } else if (style === 'mohawk') {
      g.rect(hx - 1.6, top - 2.6, hx + 1.6, top + 2.0, hair);
      g.rect(hx - 0.6, top - 3.4, hx + 0.6, top - 1.0, hair);
      g.rect(hx - 0.4, top - 2.0, hx + 0.4, top + 1.4, lighten(hair, 0.3));
    } else if (style === 'afro') {
      for (i = 0; i < 6; i++) {
        g.ellipse(hx - 5.2 + i * 2.1, top + 0.6 + (i % 2 ? 1.0 : 0), 1.3, 1.2, hair);
      }
      g.ellipse(hx, hy - 0.9, rx + 1.5, ry - 0.4, hair);
      g.ellipse(hx, hy + 2.9, rx - 1.2, ry - 2.7, skinC);
      if (!side) {
        g.rect(hx - rx + 0.1, hy + 2.4, hx - rx + 0.9, hy + 3.8, skinC);
        g.rect(hx + rx - 0.9, hy + 2.4, hx + rx - 0.1, hy + 3.8, skinC);
      }
      g.rect(hx - 4.6, fl - 0.3, hx + 4.6, fl + 0.4, hair);
    } else if (style === 'ponytail') {
      if (!side) {
        g.rect(hx - rx - 1.4, hy - 1.6, hx - rx + 0.2, hy + 5.2, hair);
        g.rect(hx + rx - 0.2, hy - 1.6, hx + rx + 1.4, hy + 5.2, hair);
      } else {
        g.rect(hx - rx - 3.0, hy - 2.4, hx - rx + 0.4, hy + 0.6, hair);
        g.rect(hx - rx - 3.8, hy - 1.0, hx - rx - 1.0, hy + 5.2, hair);
      }
    } else if (style === 'braids') {
      if (!side) {
        g.rect(hx - rx - 1.0, hy - 1.8, hx - rx + 0.8, hy + 5.4, hair);
        g.rect(hx + rx - 0.8, hy - 1.8, hx + rx + 1.0, hy + 5.4, hair);
        g.rect(hx - rx - 1.0, hy + 3.2, hx - rx + 0.8, hy + 5.4, hairD);
        g.rect(hx + rx - 0.8, hy + 3.2, hx + rx + 1.0, hy + 5.4, hairD);
      } else {
        g.rect(hx - rx - 1.8, hy - 1.8, hx - rx + 1.2, hy + 5.2, hair);
      }
    } else if (style === 'wavy' || style === 'undercut') {
      if (!side) {
        g.rect(hx - rx + 0.1, hy + 0.6, hx - rx + 1.4, hy + 4.4, hair);
        g.rect(hx + rx - 1.4, hy + 0.6, hx + rx - 0.1, hy + 4.4, hair);
      } else {
        g.rect(hx - rx + 0.1, hy + 0.6, hx - rx + 1.6, hy + 4.2, hair);
      }
    }

    /* 눈 · 코 · 입 — 큰 검은 눈 + 흰 반짝임 (포켓리그 감성) */
    var eyeY = hy + 2.0;
    if (side) {
      g.rect(hx + 2.3, eyeY, hx + 3.6, eyeY + 1.9, '#241c2b');
      g.put(hx + 2.4, eyeY + 0.3, '#ffffff');
      g.rect(hx + 1.8, hy + 5.0, hx + 3.0, hy + 5.4, '#a2564f');
    } else {
      g.rect(hx - 3.6, eyeY, hx - 1.9, eyeY + 1.9, '#241c2b');
      g.rect(hx + 1.9, eyeY, hx + 3.6, eyeY + 1.9, '#241c2b');
      g.put(hx - 3.5, eyeY + 0.3, '#ffffff');
      g.put(hx + 2.0, eyeY + 0.3, '#ffffff');
      g.rect(hx - 0.9, hy + 5.0, hx + 0.9, hy + 5.4, '#a2564f');
    }

    /* 액세서리 */
    if (look.acc === 'glasses') {
      if (side) {
        g.rect(hx + 2.0, eyeY - 1.0, hx + 3.9, eyeY + 2.2, '#2c2c3c');
        g.rect(hx + 2.3, eyeY - 0.4, hx + 3.6, eyeY + 1.6, '#c8ecff');
        g.rect(hx + 2.3, eyeY + 1.2, hx + 3.6, eyeY + 1.6, '#2c2c3c');
      } else {
        g.rect(hx - 4.8, eyeY - 1.0, hx + 4.8, eyeY + 2.2, '#2c2c3c');
        g.rect(hx - 1.0, eyeY - 1.0, hx + 1.0, eyeY + 2.2, '#2c2c3c');
        g.rect(hx - 4.4, eyeY - 0.4, hx - 1.4, eyeY + 1.6, '#c8ecff');
        g.rect(hx + 1.4, eyeY - 0.4, hx + 4.4, eyeY + 1.6, '#c8ecff');
      }
    } else if (look.acc === 'shades') {
      g.rect(hx - 4.8, eyeY - 1.0, hx + 4.8, eyeY + 1.8, '#1b1b26');
      g.rect(hx - 1.0, eyeY - 0.6, hx + 1.0, eyeY + 0.4, '#1b1b26');
      g.rect(hx - 4.0, eyeY - 0.6, hx - 2.2, eyeY - 0.1, '#6d8598');
      g.rect(hx + 2.2, eyeY - 0.6, hx + 4.0, eyeY - 0.1, '#6d8598');
    } else if (look.acc === 'headband') {
      if (side) { g.rect(hx - rx + 0.4, fl - 1.4, hx + rx - 2.0, fl - 0.3, '#e2382e'); }
      else {
        g.rect(hx - rx + 0.6, fl - 1.4, hx + rx - 0.6, fl - 0.3, '#e2382e');
        g.rect(hx - rx + 1.0, fl - 1.1, hx + rx - 1.0, fl - 0.7, '#ff6d5e');
      }
    }
  }

  function paint(g, look, dir, pose, f, t) {
    var K = KITS[look.kit] || KITS.home;
    var R = rig(look, dir, pose, f, t || 0);
    if (dir === 'side') {
      drawArm(g, look, K, R, 1, false);
      drawLeg(g, look, K, R, 1, false);
      drawTorso(g, look, K, R);
      drawLeg(g, look, K, R, 0, true);
      drawArm(g, look, K, R, 0, true);
    } else {
      drawLeg(g, look, K, R, 0, true);
      drawLeg(g, look, K, R, 1, true);
      drawTorso(g, look, K, R);
      drawArm(g, look, K, R, 0, true);
      drawArm(g, look, K, R, 1, true);
    }
    drawHead(g, look, R);
  }

  var cache = {}, cacheN = 0, CACHE_MAX = 1400;

  function sprite(look, dir, pose, f, t) {
    var key = lookKey(look) + '|' + dir + '|' + pose + '|' + f;
    var cv = cache[key];
    if (cv) { return cv; }
    if (cacheN > CACHE_MAX) { cache = {}; cacheN = 0; }
    var g = new Grid();
    paint(g, look, dir, pose, f, t);
    g.outline(OUT);
    cv = toCanvas(g);
    cache[key] = cv;
    cacheN += 1;
    return cv;
  }

  function frameOf(pose, gait, u, t) {
    if (pose === 'run' || pose === 'dribble') { return Math.floor((gait || 0) / (Math.PI / 2)) & 3; }
    if (pose === 'kick' || pose === 'pass') { return u < 0.34 ? 0 : (u < 0.62 ? 1 : 2); }
    if (pose === 'tackle') { return u < 0.45 ? 0 : 1; }
    if (pose === 'dive') { return u < 0.45 ? 0 : 1; }
    if (pose === 'jump') { return u < 0.5 ? 0 : 1; }
    if (pose === 'celebrate') { return Math.floor((t || 0) * 6) & 1; }
    return Math.floor((t || 0) * 1.6) & 1;
  }

  var API = {};
  API.scaleFor = function (pxH) { return Math.max(1.25, Math.round((pxH / (GROUND - 3)) * 4) / 4); };

  API.draw = function (ctx, s) {
    var pose = s.pose || 'idle';
    var dir = s.dir || 'down';
    var f = frameOf(pose, s.gait, s.u, s.t);
    var cv = sprite(s.look, dir, pose, f, s.t);
    var sc = s.sc || 2;
    var w = cv.width * sc, h = cv.height * sc;
    var y = Math.round(s.y - GROUND * sc);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if ((s.face || 1) < 0) {
      ctx.translate(Math.round(s.x) + CX * sc, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(cv, 0, y, w, h);
    } else {
      ctx.drawImage(cv, Math.round(s.x - CX * sc), y, w, h);
    }
    ctx.restore();
  };

  API.shadow = function (ctx, x, y, w, h, air) {
    var a = air || 0;
    var k = Math.max(0.55, 1 - a * 0.35);
    ctx.save();
    ctx.globalAlpha = Math.max(0.18, 0.52 - a * 0.30);
    ctx.fillStyle = '#0e2a18';
    ctx.beginPath();
    ctx.ellipse(x, y, w * k, h * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /* 첫 프레임 끊김 방지 — 22명분 자주 쓰는 스프라이트만 미리 캐시 */
  API.warm = function (list) {
    var i, j, k, p, look, dirs = [['down', 'idle', 0], ['side', 'run', 0], ['side', 'run', 1],
      ['side', 'run', 2], ['side', 'run', 3], ['up', 'run', 0], ['up', 'idle', 0]];
    for (i = 0; i < list.length; i++) {
      p = list[i];
      look = (p && p._look) || null;
      if (!look) { continue; }
      for (k = 0; k < dirs.length; k++) { sprite(look, dirs[k][0], dirs[k][1], dirs[k][2]); }
    }
    for (j = 0; j < 2; j++) {
      sprite(API.REF_LOOK, 'down', 'run', 0);
      sprite(API.REF_LOOK, 'side', 'run', j);
    }
  };
  API.REF_LOOK = { kit: 'ref', hair: 'buzz', hairColor: '#2b2b36', skin: 1, acc: 'none' };
  API.rig = rig;
  API.lookOf = lookOf;
  API.lookKey = lookKey;
  API.sprite = sprite;
  API.render = function (look, dir, pose, f, t) {
    var g = new Grid();
    paint(g, look, dir, pose, f, t || 0);
    g.outline(OUT);
    return toCanvas(g);
  };
  API.GW = GW; API.GH = GH; API.CX = CX; API.GROUND = GROUND;
  API.KITS = KITS; API.SKINS = SKINS;
  API.Grid = Grid;
  DS.PIXEL = API;
})(window);
