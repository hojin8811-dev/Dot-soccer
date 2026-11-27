/*! 꼬마일레븐 FC v31 — 대각선 쿼터뷰(diorama) 피치 · 3D 카메라 · 미니맵 (quarter.js)
    · 월드 좌표(0..100 폭, 0..120 길이, z 높이)를 3D 카메라로 투영한다.
      화면 가로 = 공격축(길이), 화면 세로(깊이) = 폭 → 관중석·광고판이 늘 화면 위/아래에 보인다.
    · 잔디 줄무늬 · 터치라인 · 페널티박스 · 센터서클 · 코너 아크 · 입체 골대/골망
      · 터치라인 광고판 · 관중석(치비 관중)을 모두 같은 투영으로 그린다.
    · 공을 부드럽게 따라가는 중계 카메라(리드 + 찬스 줌인)와 전체뷰(줌아웃),
      그리고 우하단 반투명 미니맵 레이더. */
(function (global) {
  'use strict';

  var Q = {};
  DS.Q = Q;

  var PW = 68;                 /* 피치 실제 폭(m) */
  var PL = 105;                /* 피치 실제 길이(m) */
  var ZU = 0.36;               /* 시뮬레이션 z 1단위 = 0.36m */

  var W = 844, H = 390;
  var cam = {
    yaw: Math.PI + 0.26,       /* 길이축을 대각선으로 보는 좌우 각도 */
    pitch: 0.47,               /* 내려다보는 각도(rad, ≈27°) */
    dist: 120,
    tx: 0, ty: 3, tz: 0,
    mode: 'broadcast'
  };
  var eye = { x: 0, y: 0, z: 0 };
  var fwd = { x: 0, y: 0, z: 1 }, right = { x: 1, y: 0, z: 0 }, up = { x: 0, y: 1, z: 0 };
  var FO = 1200;               /* 초점거리(px) */
  var DREF = 120;              /* 기준 심도 — s = 1 이 되는 거리 */
  var PPM = 9.6;               /* 기준점에서 1m = 9.6px (원근 강도) */
  var TZ_BIAS = -2.0;          /* 시점을 먼 터치라인 쪽으로 살짝 밀어 관중석이 화면 위에 남게 */
  var sprH = 34;
  var dirty = true;

  Q.W = W; Q.H = H;
  Q.camera = cam;
  Q.FOCUS_DIST = 120;
  Q.FULL_DIST = 180;

  function v3(x, y, z) { return { x: x, y: y, z: z }; }
  function sub(a, b) { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross(a, b) { return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
  function norm(a) { var l = Math.hypot(a.x, a.y, a.z) || 1; return v3(a.x / l, a.y / l, a.z / l); }

  /* 월드(0..100 폭, 0..120 길이, z 높이) → 3D 미터 좌표
     X = 길이(공격축, +X = 상대 골문 = 화면 오른쪽), Z = 폭(+Z = 가까운 터치라인) */
  function to3(wx, wy, wz) {
    return v3((0.5 - (wy || 0) / 120) * PL, (wz || 0) * ZU, ((wx || 0) / 100 - 0.5) * PW);
  }
  Q.to3 = to3;

  function rebuildBasis() {
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    fwd = v3(Math.sin(cam.yaw) * cp, -sp, Math.cos(cam.yaw) * cp);
    right = norm(cross(fwd, v3(0, 1, 0)));
    up = norm(cross(right, fwd));
    eye = v3(cam.tx - fwd.x * cam.dist, cam.ty - fwd.y * cam.dist, cam.tz - fwd.z * cam.dist);
    DREF = Q.FOCUS_DIST;
    FO = PPM * DREF;
    dirty = false;
  }
  Q.rebuild = rebuildBasis;

  Q.setSize = function (w, h, s) {
    W = w; H = h; Q.W = w; Q.H = h;
    sprH = s || Math.round(Math.max(20, Math.min(46, h * 0.086)));
    /* 화면이 좁으면 같은 시야(가로 m)를 유지하도록 초점거리를 비율로 맞춘다 */
    PPM = 9.6 * (h / 390) * 0.92 + 0.6;
    rebuildBasis();
  };
  Q.setSpr = function (s) { sprH = s; rebuildBasis(); };
  Q.setMode = function (m) { cam.mode = m === 'full' ? 'full' : 'broadcast'; };
  Q.setZoomFrame = function (focus, full) { Q.FOCUS_DIST = focus; Q.FULL_DIST = full; rebuildBasis(); };

  Q.focus = function (wx, wy, targetDist, dt, leadX) {
    var t = to3(wx, wy, 0);
    var k = 1 - Math.exp(-Math.max(0, dt) * 5.4);
    var kd = 1 - Math.exp(-Math.max(0, dt) * 2.6);
    cam.tx += (t.x + (leadX || 0) - cam.tx) * k;
    cam.ty += (t.y + 2.4 - cam.ty) * k;
    cam.tz += (t.z + TZ_BIAS - cam.tz) * k;
    cam.dist += (targetDist - cam.dist) * kd;
    clampCam();
    rebuildBasis();
  };
  Q.snap = function (wx, wy, dist, leadX) {
    var t = to3(wx, wy, 0);
    cam.tx = t.x + (leadX || 0); cam.ty = t.y + 2.4; cam.tz = t.z + TZ_BIAS;
    if (dist) { cam.dist = dist; }
    rebuildBasis();
  };
  /* 경기장 밖 허공이 크게 드러나지 않도록 시점을 가둔다 */
  function clampCam() {
    /* 화면이 스타디움 밖으로 새지 않게 시선 목표를 경기장 안쪽으로 가둔다 */
    cam.tx = Math.max(-44, Math.min(44, cam.tx));
    cam.tz = Math.max(-10, Math.min(22, cam.tz));
    cam.ty = Math.max(0.4, cam.ty);
  }
  Q.clamp = clampCam;
  Q.dist = function (d) { if (d) { cam.dist = d; rebuildBasis(); } return cam.dist; };
  Q.state = function () {
    return { tx: Math.round(cam.tx * 10) / 10, ty: Math.round(cam.ty * 10) / 10, tz: Math.round(cam.tz * 10) / 10,
      dist: Math.round(cam.dist * 10) / 10, mode: cam.mode, ppm: Math.round(PPM * 100) / 100, fo: Math.round(FO) };
  };

  /* 투영 — 호출마다 새 객체를 돌려준다(두 점을 동시에 들고 그리는 코드가 많다) */
  Q.project = function (wx, wy, wz) {
    if (dirty) { rebuildBasis(); }
    var P = to3(wx, wy, wz), v = sub(P, eye);
    var cz = dot(v, fwd);
    if (cz < 6) { cz = 6; }
    return {
      x: W / 2 + FO * dot(v, right) / cz,
      y: H / 2 - FO * dot(v, up) / cz,
      s: DREF / cz,
      d: cz,
      v: (wy || 0) / 120
    };
  };
  Q.projectRaw = function (wx, wy, wz) { return Q.project(wx, wy, wz); };
  Q.zpx = function (z, s) { return (z * ZU) * (s || 1) * PPM * Math.cos(cam.pitch) * 0.96; };
  Q.focal = function () { return FO; };
  Q.dref = function () { return DREF; };
  Q.ppm = function () { return PPM; };

  /* ─────────────────────────  팔레트  ───────────────────────── */
  var LINE = 'rgba(248,255,251,0.92)';
  var CROWD_COLS = ['#e8e2d0', '#cdd7e8', '#f0c98a', '#c7e7c0', '#e0b8c8', '#b9c6e8', '#f2e6b6', '#d9cdb4'];

  function q(ctx, pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) { ctx.lineTo(pts[i].x, pts[i].y); }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }
  function seg(ctx, ax, ay, bx, by, wpx, col) {
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.strokeStyle = col || LINE;
    ctx.lineWidth = wpx;
    ctx.stroke();
  }
  function wpoly(ctx, pts, fill, stroke) {
    var i, p, arr = [];
    for (i = 0; i < pts.length; i++) {
      p = Q.project(pts[i][0], pts[i][1], pts[i][2] || 0);
      arr.push({ x: p.x, y: p.y });
    }
    q(ctx, arr, fill);
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function lineW(s) { return Math.max(1, 0.14 * s * PPM * 1.05); }
  function wline(ctx, a, b, col) {
    var p1 = Q.project(a[0], a[1], a[2] || 0), p2 = Q.project(b[0], b[1], b[2] || 0);
    seg(ctx, p1.x, p1.y, p2.x, p2.y, lineW((p1.s + p2.s) * 0.5), col || LINE);
  }
  function wcircle(ctx, cx, cy, rx, ry, col) {
    var i, p, n = 44, first = true;
    ctx.beginPath();
    for (i = 0; i <= n; i++) {
      var th = i / n * Math.PI * 2;
      p = Q.project(cx + rx * Math.cos(th), cy + ry * Math.sin(th), 0);
      if (first) { ctx.moveTo(p.x, p.y); first = false; } else { ctx.lineTo(p.x, p.y); }
    }
    ctx.closePath();
    if (col) { ctx.fillStyle = col; ctx.fill(); }
    ctx.strokeStyle = LINE;
    ctx.lineWidth = lineW(Q.project(cx, cy, 0).s);
    ctx.stroke();
  }

  /* ─────────────────────────  관중석  ───────────────────────── */
  var crowdCache = null;
  function buildCrowd() {
    var rows = [], i, tier;
    function band(x0, x1, count, tiers) {
      for (i = 0; i < count; i++) {
        var t = (i + 0.5) / count;
        tier = (Math.random() * tiers) | 0;
        var xa = x0 + (x1 - x0) * (tier / Math.max(1, tiers - 1));
        rows.push({
          x: xa, y: -16 + 132 * t,
          z: 0.9 + tier * 1.55,
          h: 1.0 + Math.random() * 0.35,
          c: CROWD_COLS[(Math.random() * CROWD_COLS.length) | 0],
          ph: Math.random() * 6.28
        });
      }
    }
    /* 먼 터치라인 뒤 (화면 위쪽), 가까운 터치라인 뒤 (화면 아래쪽) */
    band(-24.5, -3.1, 230, 8);
    band(102.5, 124.5, 200, 8);
    /* 골 뒤 (좌/우) */
    for (i = 0; i < 60; i++) {
      var tz = (Math.random() * 4) | 0;
      rows.push({ x: -2.5 - tz * 2.3, y: -13 + (i * 4.1) % 130, z: 0.9 + tz * 1.3, h: 1.0 + Math.random() * 0.35, c: CROWD_COLS[(Math.random() * CROWD_COLS.length) | 0], ph: Math.random() * 6.28 });
      rows.push({ x: 102.5 + tz * 2.3, y: -13 + (i * 4.7) % 130, z: 0.9 + tz * 1.3, h: 1.0 + Math.random() * 0.35, c: CROWD_COLS[(Math.random() * CROWD_COLS.length) | 0], ph: Math.random() * 6.28 });
    }
    crowdCache = rows;
  }

  /* 계단식 스탠드 단(段) — 관중이 앉은 계단면 */
  function standTiers(ctx) {
    var i, x0, x1, z0, z1;
    var far = [[-3.2, -5.9], [-5.9, -8.6], [-8.6, -11.3], [-11.3, -14.0], [-14.0, -16.7], [-16.7, -19.4], [-19.4, -22.1], [-22.1, -24.8]];
    var near = [[102.6, 105.3], [105.3, 108.0], [108.0, 110.7], [110.7, 113.4], [113.4, 116.1], [116.1, 118.8], [118.8, 121.5], [121.5, 124.2]];
    function tierRow(list, flip) {
      for (i = 0; i < list.length; i++) {
        x0 = list[i][0]; x1 = list[i][1];
        z0 = 0.55 + i * 1.55; z1 = z0 + 1.55;
        /* 계단면(수직) */
        wpoly(ctx, [[x0, -18, z1], [x0, 138, z1], [x1, 138, z1], [x1, -18, z1]], '#1c4536');
        /* 단 입면 */
        wpoly(ctx, [[x0, -18, z0], [x0, 138, z0], [x0, 138, z1], [x0, -18, z1]], i % 2 ? '#17392d' : '#1a4033');
      }
    }
    /* 먼 쪽은 뒤에서 앞으로, 가까운 쪽은 앞에서 뒤로 그려 겹침을 맞춘다 */
    tierRow(far, true);
    tierRow(near, false);
  }

  function drawStands(ctx, t) {
    if (!crowdCache) { buildCrowd(); }
    var i, c, p, s, hpx, rpx, bob;
    for (i = 0; i < crowdCache.length; i++) {
      c = crowdCache[i];
      p = Q.project(c.x, c.y, c.z || 0);
      if (p.x < -24 || p.x > W + 24 || p.y < -16 || p.y > H + 16) { continue; }
      s = p.s;
      hpx = Math.max(3.2, c.h * PPM * s * 1.15);
      rpx = Math.max(1.2, hpx * 0.30);
      bob = Math.sin((t || 0) * 2.1 + c.ph) * hpx * 0.10;
      ctx.fillStyle = c.c;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - hpx * 0.40 + bob, rpx * 0.95, hpx * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(244,220,192,0.96)';
      ctx.beginPath();
      ctx.arc(p.x, p.y - hpx * 0.86 + bob, rpx * 0.80, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBoard(ctx, x0, y0, x1, y1, hgt, colA, colB, label) {
    var a = Q.project(x0, y0, 0), b = Q.project(x1, y1, 0);
    var a2 = Q.project(x0, y0, hgt), b2 = Q.project(x1, y1, hgt);
    var mid = Q.project((x0 + x1) / 2, (y0 + y1) / 2, 0);
    var g = ctx.createLinearGradient(a2.x, a2.y, a.x, a.y);
    g.addColorStop(0, colA); g.addColorStop(1, colB);
    q(ctx, [a2, b2, b, a], g);
    ctx.strokeStyle = 'rgba(2,14,10,0.18)';
    ctx.lineWidth = Math.max(0.5, mid.s * 0.35);
    ctx.stroke();
    if (label) {
      var fs = Math.max(4.5, mid.s * 5.6);
      var cx = (a2.x + b2.x + a.x + b.x) / 4, cy = (a2.y + b2.y + a.y + b.y) / 4;
      ctx.save();
      ctx.font = '900 ' + fs.toFixed(1) + 'px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.86;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(label, cx, cy);
      ctx.restore();
    }
  }

  /* ─────────────────────────  골대  ───────────────────────── */
  function drawGoal(ctx, end, netFx) {
    /* end: 'opp' = 상대 골문(y=0, 화면 오른쪽) / 'own' = 우리 골문(y=120, 왼쪽) */
    var y0 = end === 'opp' ? 0 : 120;
    var dir = end === 'opp' ? -1 : 1;
    var x0 = 44.4, x1 = 55.6, hgt = 2.44, depth = 2.1;
    var yb = y0 + dir * depth;
    var i, a, b;
    var lw = Math.max(1.8, Q.project(50, y0, 1).s * 3.2);
    var netC = 'rgba(240,255,250,0.50)';
    var nw = Math.max(0.6, lw * 0.30);
    /* 골문 안쪽 — 옅은 그늘만 (골대가 벽처럼 보이지 않게) */
    wpoly(ctx, [[x0, y0, 0], [x1, y0, 0], [x1, yb, 0], [x0, yb, 0]], 'rgba(4,26,20,0.20)');
    /* 골망 — 뒤판 */
    for (i = 0; i <= 10; i++) {
      var gx = x0 + (x1 - x0) * i / 10;
      a = Q.project(gx, yb, 0); b = Q.project(gx, yb, hgt);
      seg(ctx, a.x, a.y, b.x, b.y, nw, netC);
    }
    for (i = 0; i <= 4; i++) {
      var gh = hgt * i / 4;
      a = Q.project(x0, yb, gh); b = Q.project(x1, yb, gh);
      seg(ctx, a.x, a.y, b.x, b.y, nw, netC);
    }
    /* 골망 — 천장 */
    for (i = 0; i <= 10; i++) {
      var gx2 = x0 + (x1 - x0) * i / 10;
      a = Q.project(gx2, y0, hgt); b = Q.project(gx2, yb, hgt);
      seg(ctx, a.x, a.y, b.x, b.y, nw, netC);
    }
    /* 골망 — 옆판 */
    for (i = 0; i <= 4; i++) {
      var gh2 = hgt * i / 4;
      a = Q.project(x0, y0, gh2); b = Q.project(x0, yb, gh2);
      seg(ctx, a.x, a.y, b.x, b.y, nw, netC);
      a = Q.project(x1, y0, gh2); b = Q.project(x1, yb, gh2);
      seg(ctx, a.x, a.y, b.x, b.y, nw, netC);
    }
    /* 프레임 */
    var postA = Q.project(x0, y0, 0), postB = Q.project(x0, y0, hgt);
    var postC = Q.project(x1, y0, 0), postD = Q.project(x1, y0, hgt);
    /* 기둥은 어두운 테두리 + 흰 심 — 잔디·관중 위에서도 또렷하게 */
    seg(ctx, postA.x, postA.y, postB.x, postB.y, lw * 2.1, 'rgba(4,20,16,0.55)');
    seg(ctx, postC.x, postC.y, postD.x, postD.y, lw * 2.1, 'rgba(4,20,16,0.55)');
    seg(ctx, postB.x, postB.y, postD.x, postD.y, lw * 2.1, 'rgba(4,20,16,0.55)');
    seg(ctx, postA.x, postA.y, postB.x, postB.y, lw, 'rgba(255,255,255,0.98)');
    seg(ctx, postC.x, postC.y, postD.x, postD.y, lw, 'rgba(255,255,255,0.98)');
    seg(ctx, postB.x, postB.y, postD.x, postD.y, lw, 'rgba(255,255,255,0.98)');
    var pb = Q.project(x0, yb, 0), pd = Q.project(x1, yb, 0);
    var pbt = Q.project(x0, yb, hgt), pdt = Q.project(x1, yb, hgt);
    seg(ctx, pb.x, pb.y, pbt.x, pbt.y, lw * 0.7, 'rgba(226,240,236,0.68)');
    seg(ctx, pd.x, pd.y, pdt.x, pdt.y, lw * 0.7, 'rgba(226,240,236,0.68)');
    seg(ctx, pbt.x, pbt.y, pdt.x, pdt.y, lw * 0.7, 'rgba(226,240,236,0.68)');
  }

  /* ─────────────────────────  경기장 전체  ───────────────────────── */
  Q.drawStadium = function (ctx, t, opt) {
    opt = opt || {};
    var i;
    /* 스타디움 배경 */
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#04120f');
    bg.addColorStop(0.42, '#0a211c');
    bg.addColorStop(1, '#04100d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* 스타디움 바닥 — 화면 어디를 봐도 허공이 드러나지 않게 크게 깐다 */
    wpoly(ctx, [[-260, -260], [360, -260], [360, 380], [-260, 380]], '#0b201a');
    wpoly(ctx, [[-34, -34], [134, -34], [134, 148], [-34, 148]], '#0e2620');
    /* 외곽 스탠드 벽 (관중석 뒤) */
    wpoly(ctx, [[-27, -44, 15], [-27, 158, 15], [-27, 158, 0], [-27, -44, 0]], '#0c231c');
    wpoly(ctx, [[127, -44, 15], [127, 158, 15], [127, 158, 0], [127, -44, 0]], '#0c231c');
    wpoly(ctx, [[-44, -34, 15], [160, -34, 15], [160, -34, 0], [-44, -34, 0]], '#0a1f19');
    wpoly(ctx, [[-44, 148, 15], [160, 148, 15], [160, 148, 0], [-44, 148, 0]], '#0a1f19');

    /* 피치 바깥 잔디 (러닝 트랙 · 잔디 여유) */
    wpoly(ctx, [[-20, -24], [120, -24], [120, 134], [-20, 134]], '#2b7437');
    wpoly(ctx, [[-6, -10], [106, -10], [106, 130], [-6, 130]], '#2f7d3b');

    /* 관중석 — 피치 바깥에 세워진 계단식 스탠드 */
    standTiers(ctx);
    drawStands(ctx, t || 0);

    /* 잔디 줄무늬 — 길이축 띠 (터치라인과 나란한 세로 줄) */
    var bands = 14;
    for (i = 0; i < bands; i++) {
      var y0 = 120 * i / bands, y1 = 120 * (i + 1) / bands;
      var col = i % 2 === 0 ? '#55ab59' : '#479e4c';
      wpoly(ctx, [[0, y0], [100, y0], [100, y1], [0, y1]], col);
    }
    /* 잔디 결 */
    ctx.save();
    ctx.globalAlpha = 0.05;
    for (i = 0; i < 34; i++) {
      var gx = (i * 7.7) % 100;
      var a = Q.project(gx, 0, 0), b = Q.project(gx, 120, 0);
      seg(ctx, a.x, a.y, b.x, b.y, Math.max(1, a.s * 4), '#ffffff');
    }
    ctx.restore();

    /* 라인 */
    wline(ctx, [0, 0], [0, 120]);          /* 먼 터치라인 */
    wline(ctx, [100, 0], [100, 120]);      /* 가까운 터치라인 */
    wline(ctx, [0, 0], [100, 0]);          /* 상대 골라인 */
    wline(ctx, [0, 120], [100, 120]);      /* 우리 골라인 */
    wline(ctx, [0, 60], [100, 60]);        /* 하프라인 */
    wcircle(ctx, 50, 60, 13.5, 10.5, null);
    var cp = Q.project(50, 60, 0);
    ctx.fillStyle = LINE;
    ctx.beginPath(); ctx.arc(cp.x, cp.y, Math.max(1.2, cp.s * 1.15), 0, Math.PI * 2); ctx.fill();

    /* 페널티 박스 · 골 에어리어 · 스팟 · 코너 아크 */
    [[0, 1], [120, -1]].forEach(function (gd) {
      var yb = gd[0], sgn = gd[1];
      var d16 = 18.9 * sgn, d55 = 6.3 * sgn;
      wline(ctx, [20.4, yb], [20.4, yb + d16]);
      wline(ctx, [79.6, yb], [79.6, yb + d16]);
      wline(ctx, [20.4, yb + d16], [79.6, yb + d16]);
      wline(ctx, [36.5, yb], [36.5, yb + d55]);
      wline(ctx, [63.5, yb], [63.5, yb + d55]);
      wline(ctx, [36.5, yb + d55], [63.5, yb + d55]);
      var sp = Q.project(50, yb + 12.6 * sgn, 0);
      ctx.fillStyle = LINE;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, Math.max(1, sp.s), 0, Math.PI * 2); ctx.fill();
      /* 코너 아크 두 곳 */
      [0, 100].forEach(function (cxw) {
        var cc = Q.project(cxw, yb, 0);
        ctx.save();
        ctx.strokeStyle = LINE;
        ctx.lineWidth = lineW(cc.s);
        ctx.beginPath();
        for (var k = 0; k <= 16; k++) {
          var th = k / 16 * Math.PI / 2;
          var dirx = cxw === 0 ? 1 : -1;
          var p2 = Q.project(cxw + dirx * 2.6 * Math.cos(th), yb + (-sgn) * 2.6 * Math.sin(th), 0);
          if (k === 0) { ctx.moveTo(p2.x, p2.y); } else { ctx.lineTo(p2.x, p2.y); }
        }
        ctx.stroke();
        ctx.restore();
      });
    });

    /* 광고판 — 먼 터치라인 뒤 · 가까운 터치라인 뒤 · 골 뒤 */
    drawBoard(ctx, -1.6, -6, -1.6, 126, 1.2, '#1b5a93', '#0e3357', 'FOOTBALL DREAM  ·  KKOMA ELEVEN  ·  FOOTBALL DREAM  ·  KKOMA ELEVEN');
    drawBoard(ctx, 101.6, -6, 101.6, 126, 1.2, '#1c5c3a', '#0f3722', '');
    drawBoard(ctx, -2, -1.6, 102, -1.6, 1.2, '#5b1230', '#3c0c20', '');
    drawBoard(ctx, -2, 121.6, 102, 121.6, 1.2, '#5b1230', '#3c0c20', '');

    /* 골대 */
    drawGoal(ctx, 'opp', opt.netFx);
    drawGoal(ctx, 'own', opt.netFx);

    /* 조명 비네트 — 화면 가장자리를 살짝 어둡게 해 쿼터뷰 깊이를 살린다 */
    var vg = ctx.createRadialGradient(W * 0.5, H * 0.52, Math.min(W, H) * 0.30, W * 0.5, H * 0.52, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(255,255,255,0.04)');
    vg.addColorStop(0.62, 'rgba(2,14,10,0)');
    vg.addColorStop(1, 'rgba(2,14,10,0.34)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  };

  /* ─────────────────────────  미니맵 레이더  ───────────────────────── */
  Q.drawMinimap = function (ctx, players, ball, opt) {
    opt = opt || {};
    var mw = Math.min(158, W * 0.19), mh = mw * 0.62;
    var mx = W - mw - 9, my = H - mh - 7;
    var i, p, r = Math.max(1.6, mw * 0.0125);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 9;
    var bg = ctx.createLinearGradient(mx, my, mx, my + mh);
    bg.addColorStop(0, 'rgba(6,34,27,0.70)');
    bg.addColorStop(1, 'rgba(3,20,16,0.80)');
    ctx.fillStyle = bg;
    roundRect(ctx, mx, my, mw, mh, 8);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(200,241,105,0.26)';
    ctx.lineWidth = 1;
    roundRect(ctx, mx, my, mw, mh, 8);
    ctx.stroke();

    var pad = 5;
    var px = mx + pad, py = my + pad, pw = mw - pad * 2, ph = mh - pad * 2;
    function fx(wx) { return px + wx / 100 * pw; }
    function fy(wy) { return py + wy / 120 * ph; }
    ctx.fillStyle = 'rgba(56,128,64,0.60)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(226,255,240,0.40)';
    ctx.lineWidth = 0.9;
    ctx.strokeRect(px, py, pw, ph);
    ctx.beginPath();
    ctx.moveTo(px, py + ph / 2); ctx.lineTo(px + pw, py + ph / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph / 2, Math.min(pw, ph) * 0.15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(px + pw * 0.20, py, pw * 0.60, ph * 0.15);
    ctx.strokeRect(px + pw * 0.20, py + ph * 0.85, pw * 0.60, ph * 0.15);
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off) { continue; }
      var isHome = p.side === 'home';
      ctx.beginPath();
      ctx.arc(fx(p.x), fy(p.y), p === ball.carrier ? r * 1.5 : r, 0, Math.PI * 2);
      ctx.fillStyle = isHome ? '#4aa3ff' : '#ff5b5b';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    if (ball) {
      ctx.beginPath();
      ctx.arc(fx(ball.x), fy(ball.y), r * 1.05, 0, Math.PI * 2);
      ctx.fillStyle = '#fffdf0';
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,40,30,0.85)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();
  };

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  Q.roundRect = roundRect;
})(window);
