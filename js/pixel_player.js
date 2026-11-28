/*! 꼬마일레븐 FC v36b — 고퀄 스프라이트 시트 엔진 (pixel_player.js)

    v35의 코드 래스터 도트(Grid) 대신, 사용자가 뽑아온 카이로소프트 화풍 시트에서
    정밀 추출한 아틀라스를 그대로 찍는다.

    · assets/sprites/players_home.png  — 필드 선수 12종(홈 레드) · 12행 × 6열
    · assets/sprites/players_away.png  — 같은 12종(원정 로열블루) · 12행 × 6열
    · assets/sprites/gk_ref.png        — 초록 GK · 노랑 GK · 주심 · 감독 · 4행 × 4열

    필드 선수 6열 = run0 · run1 · run2 · run3 · kick · 개성(태클/뒷모습/앞모습/세리머니)
      v36b부터 달리기는 새 4프레임 달리기 시트에서 뽑은 run0~run3를 걸음 위상(p.gait)에
      1:1로 물려 순환한다(포니테일·머리띠는 4열이 못 써서 run3 = run1 핑퐁).

    아틀라스 생성: scripts/sprite_extract.py (배경 투명화·부속 공 제거·원정 블루 변환·정규화)
    셀은 102×91, 스프라이트는 셀 안에서 머리중심 x=51 · 발바닥 y=89 에 고정돼 있다.
    → 매 프레임 그 점만 월드 좌표에 맞추면 12종 전부 같은 발밑선에서 뛴다.
*/
(function (global) {
  'use strict';

  var DS = global.DS = global.DS || {};

  /* ─────────────────────────  아틀라스 정의  ───────────────────────── */
  var CELL_W = 102, CELL_H = 91, CX = 51, FEET = 89;
  var SPR_H = 84;                        /* 셀 안 실제 스프라이트 높이(px) */
  var COL_RUN = 0, COL_KICK = 4, COL_EXTRA = 5;   /* 필드 선수 열 */
  var SHEETS = {
    home: 'assets/sprites/players_home.png',
    away: 'assets/sprites/players_away.png',
    gk: 'assets/sprites/gk_ref.png'
  };

  /* 12종 필드 선수 — 시트에서 뽑은 순서 그대로 아틀라스 행 번호와 같다 */
  var CHARS = [
    'spiky_brown',      /* 0  갈색 스파이키 · 태클 */
    'ponytail_blonde',  /* 1  금발 포니테일 · 뒷모습 */
    'glasses_black',    /* 2  검은 머리 + 안경 · 앞모습 */
    'headband_brown',   /* 3  빨간 머리띠 · 세리머니 */
    'spiky_silver',     /* 4  은발 스파이키 · 뒷모습 */
    'sunglasses_black', /* 5  검은 머리 + 선글라스 · 앞모습 */
    'afro_dark',        /* 6  아프로 흑피부 · 태클 */
    'navy_long',        /* 7  네이비 장발 · 뒷모습 */
    'mohawk_brown',     /* 8  갈색 모호크 · 앞모습 */
    'ginger_freckles',  /* 9  주황 적발 주근깨 · 세리머니 */
    'blond_curtain',    /* 10 금발 커튼헤어 · 뒷모습 */
    'blue_spiky'        /* 11 파스텔블루 스파이키 · 앞모습 */
  ];
  /* 각 캐릭터 4번째 칸의 개성 프레임 */
  var EXTRA = {
    spiky_brown: 'tackle', ponytail_blonde: 'up', glasses_black: 'down', headband_brown: 'celebrate',
    spiky_silver: 'up', sunglasses_black: 'down', afro_dark: 'tackle', navy_long: 'up',
    mohawk_brown: 'down', ginger_freckles: 'celebrate', blond_curtain: 'up', blue_spiky: 'down'
  };
  /* PIC_META 매칭 프로필 — 헤어 스타일군 · 대표 색조(H) · 밝기 · 피부 · 액세서리 */
  var PROFILE = {
    spiky_brown:      { hairs: ['spiky', 'buzz'],             hue: 26,  lum: 0.36, dark: 0, acc: '' },
    ponytail_blonde:  { hairs: ['ponytail'],                  hue: 44,  lum: 0.82, dark: 0, acc: '' },
    glasses_black:    { hairs: ['swoop', 'wavy', 'undercut'], hue: 225, lum: 0.17, dark: 0, acc: 'glasses' },
    headband_brown:   { hairs: ['spiky', 'buzz'],             hue: 24,  lum: 0.30, dark: 0, acc: 'headband' },
    spiky_silver:     { hairs: ['silver'],                    hue: 210, lum: 0.82, dark: 0, acc: '' },
    sunglasses_black: { hairs: ['spiky', 'undercut'],         hue: 228, lum: 0.14, dark: 0, acc: 'shades' },
    afro_dark:        { hairs: ['afro', 'braids'],            hue: 20,  lum: 0.14, dark: 1, acc: '' },
    navy_long:        { hairs: ['wavy', 'swoop'],             hue: 228, lum: 0.20, dark: 0, acc: '' },
    mohawk_brown:     { hairs: ['mohawk'],                    hue: 26,  lum: 0.26, dark: 0, acc: '' },
    ginger_freckles:  { hairs: ['spiky', 'wavy'],             hue: 16,  lum: 0.42, dark: 0, acc: '' },
    blond_curtain:    { hairs: ['swoop', 'wavy'],             hue: 42,  lum: 0.78, dark: 0, acc: '' },
    blue_spiky:       { hairs: ['spiky'],                     hue: 205, lum: 0.70, dark: 0, acc: '' }
  };

  /* ─────────────────────────  이미지 로드  ───────────────────────── */
  var IMG = {}, loaded = 0, total = 0;
  function load(sheet) {
    var src = SHEETS[sheet];
    total += 1;
    var im = new global.Image();
    im.onload = function () { loaded += 1; };
    im.onerror = function () { if (global.console) { console.warn('sprite load fail', src); } };
    im.src = src;
    IMG[sheet] = im;
  }
  for (var sk in SHEETS) { if (SHEETS.hasOwnProperty(sk)) { load(sk); } }

  /* ─────────────────────────  색 도구  ───────────────────────── */
  var rgbCache = {};
  function rgb(hex) {
    var v = rgbCache[hex];
    if (v) { return v; }
    var h = String(hex || '#000000').replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    rgbCache[hex] = v;
    return v;
  }
  function hueOf(hex) {
    var p = rgb(hex), r = p[0] / 255, g = p[1] / 255, b = p[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d < 1e-6) { return 0; }
    if (mx === r) { h = 60 * (((g - b) / d) % 6); }
    else if (mx === g) { h = 60 * ((b - r) / d + 2); }
    else { h = 60 * ((r - g) / d + 4); }
    return (h + 360) % 360;
  }
  function lumOf(hex) {
    var p = rgb(hex);
    return (p[0] * 0.30 + p[1] * 0.59 + p[2] * 0.11) / 255;
  }

  /* ─────────────────────────  룩  ───────────────────────── */
  var lookCache = {};
  /* pic(1..500) → 12종 매칭 점수 */
  function scoreChar(key, meta) {
    var pf = PROFILE[key];
    if (!pf) { return -1e9; }
    var s = 0;
    if (pf.hairs.indexOf(meta.hair) >= 0) { s += 5.5; }
    var hd = Math.abs(hueOf(meta.color || '#000') - pf.hue);
    if (hd > 180) { hd = 360 - hd; }
    s += Math.max(0, 2.6 - hd / 60);
    var lm = lumOf(meta.color || '#000');
    s += Math.max(0, 2.2 - Math.abs(lm - pf.lum) * 4.2);
    var sl = lumOf(meta.skin || '#f0c090');
    if (pf.dark) { s += Math.max(0, 1.6 - Math.abs(sl - 0.42) * 5); }
    else { s += Math.max(0, 1.2 - Math.abs(sl - 0.80) * 4); }
    if (pf.acc && meta.acc === pf.acc) { s += 4; }
    return s;
  }
  function charForPic(pic) {
    pic = Math.max(1, Math.min(DS.PIC_COUNT || 500, pic || 1));
    var meta = (DS.PIC_META && DS.PIC_META[pic]) || { hair: 'spiky', color: '#3a2a1a', skin: '#f2c9a2' };
    /* 액세서리 — v35와 같은 규칙으로 소수에게만 안경·선글라스·머리띠를 준다 */
    meta = { hair: meta.hair, color: meta.color, skin: meta.skin };
    if (pic % 9 === 4) { meta.acc = 'glasses'; }
    else if (pic % 13 === 7) { meta.acc = 'headband'; }
    else if (pic % 17 === 11) { meta.acc = 'shades'; }
    meta.acc = meta.acc || '';
    var best = 0, bestS = -1e9, i, s;
    for (i = 0; i < CHARS.length; i++) {
      s = scoreChar(CHARS[i], meta);
      if (s > bestS) { bestS = s; best = i; }
    }
    return best;
  }

  function lookOf(pic, kit, chWanted) {
    kit = kit || 'home';
    var key = (kit === 'gk_home' || kit === 'gk_away' || kit === 'ref' || kit === 'coach')
      ? kit : ((kit === 'away') ? 'away' : 'home');
    var ck = pic + '|' + key + '|' + (chWanted == null ? '' : chWanted);
    var v = lookCache[ck];
    if (v) { return v; }
    var ch, sheet, row;
    if (key === 'gk_home') { sheet = 'gk'; row = 0; ch = -1; }
    else if (key === 'gk_away') { sheet = 'gk'; row = 1; ch = -1; }
    else if (key === 'ref') { sheet = 'gk'; row = 2; ch = -1; }
    else if (key === 'coach') { sheet = 'gk'; row = 3; ch = -1; }
    else {
      ch = (chWanted != null && chWanted >= 0 && chWanted < CHARS.length) ? chWanted : charForPic(pic);
      row = ch; sheet = (key === 'away') ? 'away' : 'home';
    }
    v = { kit: key, ch: ch, row: row, sheet: sheet, pic: pic,
      key: (ch >= 0 ? CHARS[ch] : key), extra: (ch >= 0 ? EXTRA[CHARS[ch]] : '') };
    lookCache[ck] = v;
    return v;
  }

  /* 팀 안에서 12종이 겹치지 않게 — 이미 쓴 캐릭터는 두 번째로 잘 맞는 것으로 */
  function assignSquad(list) {
    var used = {}, i, k, p;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      var pic = (p && p.player && p.player.pic) || (1 + ((i * 37) % 500));
      var meta = (DS.PIC_META && DS.PIC_META[pic]) || { hair: 'spiky', color: '#3a2a1a', skin: '#f2c9a2' };
      meta = { hair: meta.hair, color: meta.color, skin: meta.skin };
      if (pic % 9 === 4) { meta.acc = 'glasses'; }
      else if (pic % 13 === 7) { meta.acc = 'headband'; }
      else if (pic % 17 === 11) { meta.acc = 'shades'; }
      meta.acc = meta.acc || '';
      var order = [];
      for (k = 0; k < CHARS.length; k++) { order.push({ i: k, s: scoreChar(CHARS[k], meta) }); }
      order.sort(function (a, b) { return b.s - a.s; });
      var pick = order[0].i, j;
      for (j = 0; j < order.length; j++) {
        if (!used[order[j].i]) { pick = order[j].i; break; }
      }
      used[pick] = 1;
      p._ch = pick;
    }
    return used;
  }

  /* ─────────────────────────  프레임 선택  ───────────────────────── */
  /* v36b — 달리기 4프레임을 걸음 위상에 1:1로 묶는다.
     gait는 한 걸음(위상 π)마다 잔디 먼지가 터지도록 적분되므로(+1칸 위상 이동),
     디딤 순간이 정확히 run1·run3 프레임과 겹진다. */
  function runCol(gait) {
    return (Math.floor((gait || 0) / (Math.PI / 2)) + 1) & 3;
  }

  function frameCol(look, pose, dir, s) {
    if (look.key === 'ref') {
      if (pose === 'run' || pose === 'dribble') { return (Math.floor((s.gait || 0) / 2.4) & 1) ? 2 : 1; }
      return 0;
    }
    if (look.key === 'coach') {
      if (pose === 'celebrate') { return 3; }
      if (pose === 'kick' || pose === 'pass' || pose === 'point') { return 1; }
      if (pose === 'shout' || pose === 'tackle') { return 2; }
      return 0;
    }
    if (look.key === 'gk_home' || look.key === 'gk_away') {
      if (pose === 'dive') { return 2; }
      if (pose === 'run' || pose === 'dribble' || pose === 'jump') { return 1; }
      return 0;
    }
    /* 필드 선수 — run0~run3 · kick · 개성 */
    var ex = look.extra;
    if (pose === 'dive') { return 2; }
    if (pose === 'tackle') { return ex === 'tackle' ? COL_EXTRA : COL_KICK; }
    if (pose === 'celebrate') { return ex === 'celebrate' ? COL_EXTRA : COL_RUN; }
    if (pose === 'kick' || pose === 'pass') { return COL_KICK; }
    if (pose === 'jump') { return COL_RUN + 1; }
    if (dir === 'up' && ex === 'up') { return COL_EXTRA; }
    if (dir === 'down' && ex === 'down') { return COL_EXTRA; }
    if (pose === 'run' || pose === 'dribble') { return runCol(s.gait); }
    return COL_RUN;
  }

  /* ─────────────────────────  그리기  ───────────────────────── */
  var API = {};

  /* pxH = 화면에서 원하는 스프라이트 높이(px)를 그대로 돌려준다 */
  API.scaleFor = function (pxH) { return Math.max(10, pxH * 1.02); };

  API.draw = function (ctx, s) {
    var look = s.look;
    if (!look) { return; }
    var img = IMG[look.sheet];
    if (!img || !img.complete || !img.width) {
      /* 아틀라스를 아직 못 받았을 때(첫 로딩·오프라인) — 유니폼 색 점으로 대체 */
      var hpx0 = s.sc || 54, kc = (look.kit === 'away') ? '#2f5ce0' : (look.kit === 'gk_home' ? '#3ad07c'
        : (look.kit === 'gk_away' ? '#ffd93d' : (look.kit === 'ref' || look.kit === 'coach' ? '#2b2b36' : '#e2232e')));
      ctx.save();
      ctx.fillStyle = kc;
      ctx.beginPath();
      ctx.arc(s.x, s.y - hpx0 * 0.5, Math.max(3, hpx0 * 0.22), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    var col = frameCol(look, s.pose || 'idle', s.dir || 'down', s);
    var sx = col * CELL_W, sy = look.row * CELL_H;
    var hpx = s.sc || 54;
    var sc = hpx / SPR_H;
    var w = CELL_W * sc, h = CELL_H * sc;
    var bob = 0;
    var pose = s.pose || 'idle';
    if (pose === 'run' || pose === 'dribble') {
      bob = Math.abs(Math.sin(s.gait || 0)) * 1.6;          /* 도트 2px 생동감 */
    } else if (pose === 'celebrate') {
      bob = 1.2 + Math.abs(Math.sin((s.t || 0) * 7.5)) * 2.4;
    } else if (pose === 'idle') {
      bob = Math.sin((s.t || 0) * 2.1) * 0.5 + 0.5;
    }
    var y = Math.round(s.y - FEET * sc - bob * sc);
    var face = (s.face || 1);
    /* 위·아래(뒷모습/앞모습) 프레임은 좌우 반전하지 않는다 */
    if (look.key === 'ref' || look.key === 'coach') { face = 1; }
    /* v36b — 이동 가속에 따른 미세한 몸 기울기(화면 기준 라디안, 발밑 축 회전) */
    var tilt = s.tilt || 0;
    if (tilt) {
      ctx.save();
      ctx.translate(s.x, y + FEET * sc);
      ctx.rotate(tilt);
      if (face < 0) {
        ctx.scale(-1, 1);
        ctx.drawImage(img, sx, sy, CELL_W, CELL_H, -CX * sc, -FEET * sc, w, h);
      } else {
        ctx.drawImage(img, sx, sy, CELL_W, CELL_H, -CX * sc, -FEET * sc, w, h);
      }
      ctx.restore();
    } else if (face < 0) {
      ctx.save();
      ctx.translate(Math.round(s.x), 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, CELL_W, CELL_H, -CX * sc, y, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, sx, sy, CELL_W, CELL_H, Math.round(s.x - CX * sc), y, w, h);
    }
  };

  API.shadow = function (ctx, x, y, w, h, air) {
    var a = air || 0;
    var k = Math.max(0.55, 1 - a * 0.35);
    ctx.save();
    ctx.globalAlpha = Math.max(0.18, 0.50 - a * 0.30);
    ctx.fillStyle = '#0e2a18';
    ctx.beginPath();
    ctx.ellipse(x, y, w * k, h * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  API.warm = function () { /* 아틀라스는 로드 시 1회 디코드 — 별도 워밍 없음 */ };
  API.ready = function () { return loaded >= total && total > 0; };

  API.REF_LOOK = { kit: 'ref', row: 2, sheet: 'gk', key: 'ref', ch: -1, extra: '', pic: 0 };
  API.COACH_LOOK = { kit: 'coach', row: 3, sheet: 'gk', key: 'coach', ch: -1, extra: '', pic: 0 };
  API.lookOf = lookOf;
  API.assignSquad = assignSquad;
  API.charForPic = charForPic;
  API.CHARS = CHARS;
  API.CELL_W = CELL_W; API.CELL_H = CELL_H; API.CX = CX; API.FEET = FEET; API.SPR_H = SPR_H;
  DS.PIXEL = API;
})(window);
