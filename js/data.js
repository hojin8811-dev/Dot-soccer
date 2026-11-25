/*! 도트싸커 v1 — 게임 데이터, 선수 생성, 픽셀 아트 (data.js) */
(function (global) {
  'use strict';

  var DS = global.DS || (global.DS = {});

  /* ─────────────────────────  기본 유틸  ───────────────────────── */
  function rnd(n) { return Math.floor(Math.random() * n); }
  function range(a, b) { return a + Math.random() * (b - a); }
  function irange(a, b) { return a + rnd(b - a + 1); }
  function pick(arr) { return arr[rnd(arr.length)]; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function chance(p) { return Math.random() < p; }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* 한글 조사 선택: josa('김도훈','이/가') → '김도훈이' */
  function hasJong(word) {
    if (!word) { return false; }
    var c = word.charCodeAt(word.length - 1);
    if (c < 0xac00 || c > 0xd7a3) { return false; }
    return ((c - 0xac00) % 28) !== 0;
  }
  function josa(word, pair) {
    var parts = pair.split('/');
    var tail = parts.length > 1 ? (hasJong(word) ? parts[0] : parts[1]) : parts[0];
    return word + tail;
  }

  DS.util = { rnd: rnd, range: range, irange: irange, pick: pick, clamp: clamp, chance: chance, fmt: fmt, hasJong: hasJong, josa: josa };

  /* ─────────────────────────  등급  ───────────────────────── */
  var RARITY = {
    dong:   { key: 'dong',   name: '동',     color: '#c07b3d', glow: '#e6a766', weight: 52, base: [46, 60] },
    eun:    { key: 'eun',    name: '은',     color: '#b9c7d6', glow: '#eef6ff', weight: 28, base: [58, 71] },
    geum:   { key: 'geum',   name: '금',     color: '#f6c945', glow: '#fff3ad', weight: 15, base: [69, 83] },
    legend: { key: 'legend', name: '레전드', color: '#b46bff', glow: '#e8d2ff', weight: 5,  base: [82, 97] }
  };
  var RARITY_ORDER = ['dong', 'eun', 'geum', 'legend'];
  DS.RARITY = RARITY;
  DS.RARITY_ORDER = RARITY_ORDER;

  /* ─────────────────────────  포지션  ───────────────────────── */
  var POS = {
    GK: { key: 'GK', name: '골키퍼',   short: 'GK', color: '#3ad6a3', weights: { atk: 0.08, def: 0.62, spd: 0.30 } },
    DF: { key: 'DF', name: '수비수',   short: 'DF', color: '#5aa9ff', weights: { atk: 0.20, def: 0.55, spd: 0.25 } },
    MF: { key: 'MF', name: '미드필더', short: 'MF', color: '#ffcf4d', weights: { atk: 0.40, def: 0.28, spd: 0.32 } },
    FW: { key: 'FW', name: '공격수',   short: 'FW', color: '#ff6b6b', weights: { atk: 0.60, def: 0.10, spd: 0.30 } }
  };
  var POS_ORDER = ['GK', 'DF', 'MF', 'FW'];
  DS.POS = POS;
  DS.POS_ORDER = POS_ORDER;

  /* ─────────────────────────  포메이션  ───────────────────────── */
  /* x: 0(왼쪽)~100(오른쪽), y: 0(상대 골대)~100(우리 골대) */
  var FORMATIONS = {
    '4-3-3': {
      name: '4-3-3', desc: '측면 공격에 강한 균형형',
      slots: [
        { role: 'GK', pos: 'GK', x: 50, y: 92 },
        { role: 'LB', pos: 'DF', x: 14, y: 74 },
        { role: 'CB', pos: 'DF', x: 37, y: 78 },
        { role: 'CB', pos: 'DF', x: 63, y: 78 },
        { role: 'RB', pos: 'DF', x: 86, y: 74 },
        { role: 'CM', pos: 'MF', x: 28, y: 53 },
        { role: 'CM', pos: 'MF', x: 50, y: 57 },
        { role: 'CM', pos: 'MF', x: 72, y: 53 },
        { role: 'LW', pos: 'FW', x: 19, y: 27 },
        { role: 'ST', pos: 'FW', x: 50, y: 20 },
        { role: 'RW', pos: 'FW', x: 81, y: 27 }
      ]
    },
    '4-4-2': {
      name: '4-4-2', desc: '수비 안정 + 역습형',
      slots: [
        { role: 'GK', pos: 'GK', x: 50, y: 92 },
        { role: 'LB', pos: 'DF', x: 13, y: 74 },
        { role: 'CB', pos: 'DF', x: 37, y: 78 },
        { role: 'CB', pos: 'DF', x: 63, y: 78 },
        { role: 'RB', pos: 'DF', x: 87, y: 74 },
        { role: 'LM', pos: 'MF', x: 14, y: 51 },
        { role: 'CM', pos: 'MF', x: 38, y: 55 },
        { role: 'CM', pos: 'MF', x: 62, y: 55 },
        { role: 'RM', pos: 'MF', x: 86, y: 51 },
        { role: 'ST', pos: 'FW', x: 37, y: 24 },
        { role: 'ST', pos: 'FW', x: 63, y: 24 }
      ]
    },
    '3-5-2': {
      name: '3-5-2', desc: '중원 장악형, 측면 윙백',
      slots: [
        { role: 'GK', pos: 'GK', x: 50, y: 92 },
        { role: 'CB', pos: 'DF', x: 27, y: 78 },
        { role: 'CB', pos: 'DF', x: 50, y: 80 },
        { role: 'CB', pos: 'DF', x: 73, y: 78 },
        { role: 'LWB', pos: 'MF', x: 9, y: 56 },
        { role: 'CM', pos: 'MF', x: 32, y: 56 },
        { role: 'CM', pos: 'MF', x: 50, y: 59 },
        { role: 'CM', pos: 'MF', x: 68, y: 56 },
        { role: 'RWB', pos: 'MF', x: 91, y: 56 },
        { role: 'ST', pos: 'FW', x: 37, y: 24 },
        { role: 'ST', pos: 'FW', x: 63, y: 24 }
      ]
    }
  };
  DS.FORMATIONS = FORMATIONS;

  /* ─────────────────────────  이름  ───────────────────────── */
  var SURNAME = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍', '유', '고', '문', '양', '손', '배', '백', '허', '남', '심'];
  var GIVEN = ['도훈', '민재', '서준', '지훈', '태양', '하늘', '승우', '재민', '우빈', '건우', '현우', '정우', '시우', '태윤', '예준', '준서', '민준', '지후', '로운', '이안', '하준', '은우', '도윤', '주원', '수호', '강민', '찬영', '동현', '성민', '규현', '태민', '영호', '상현', '기범', '재혁', '승민', '다온', '한결', '우진', '시현', '진호', '범석', '경수', '동욱', '석현'];

  var HAIR_COLORS = ['#2b1d14', '#171717', '#4a2c17', '#6b4423', '#1d1a2b', '#7d5330', '#c9a86a'];
  var SKIN_COLORS = ['#f2c49b', '#e8b78a', '#d9a072', '#c48b5c', '#a8724a'];

  DS.NAMES = { surname: SURNAME, given: GIVEN, hair: HAIR_COLORS, skin: SKIN_COLORS };

  /* ─────────────────────────  리그 팀  ───────────────────────── */
  var TEAMS = [
    { id: 'byeoksan', name: '벽산 유나이티드', short: '벽산', kit: { shirt: '#2f6bd8', shorts: '#ffffff', trim: '#9fc2ff' }, emblem: 'bolt', strength: 72 },
    { id: 'hangang',  name: '한강 FC',        short: '한강', kit: { shirt: '#1f9d55', shorts: '#0f2f1d', trim: '#b6ffcf' }, emblem: 'wave', strength: 69 },
    { id: 'dokdo',    name: '독도 웨일즈',    short: '독도', kit: { shirt: '#4b3f9e', shorts: '#1a1633', trim: '#cfd6ff' }, emblem: 'wave', strength: 76 },
    { id: 'cheongchun', name: '청춘 FC',      short: '청춘', kit: { shirt: '#ff7a1a', shorts: '#1a1a1a', trim: '#ffe0a8' }, emblem: 'flame', strength: 66 },
    { id: 'cheolma',  name: '철마 SC',        short: '철마', kit: { shirt: '#d81b1b', shorts: '#ffffff', trim: '#ffb3b3' }, emblem: 'claw', strength: 74 },
    { id: 'byeolbit', name: '별빛 레인저스',  short: '별빛', kit: { shirt: '#7b3ff2', shorts: '#1c1030', trim: '#e0cfff' }, emblem: 'star', strength: 71 },
    { id: 'baekho',   name: '백호 유나이티드', short: '백호', kit: { shirt: '#0f9ba8', shorts: '#ffffff', trim: '#b8f6ff' }, emblem: 'moon', strength: 68 }
  ];
  DS.TEAMS = TEAMS;

  var EMBLEMS = [
    { id: 'flame', name: '불꽃' },
    { id: 'star',  name: '별' },
    { id: 'bolt',  name: '번개' },
    { id: 'crown', name: '왕관' },
    { id: 'ball',  name: '축구공' },
    { id: 'wave',  name: '파도' },
    { id: 'claw',  name: '발톱' },
    { id: 'moon',  name: '달' }
  ];
  DS.EMBLEMS = EMBLEMS;

  var KIT_COLORS = ['#e23b3b', '#2f6bd8', '#1f9d55', '#f2a01f', '#7b3ff2', '#0f9ba8', '#e83e8c', '#212121', '#ffffff', '#8bd450'];

  DS.KIT_COLORS = KIT_COLORS;

  /* ─────────────────────────  선수 생성  ───────────────────────── */
  var USED = {};

  function randName() {
    var n = '';
    var guard = 0;
    do {
      n = pick(SURNAME) + pick(GIVEN);
      guard++;
    } while (USED[n] && guard < 60);
    USED[n] = true;
    return n;
  }

  function pickRarity(kind) {
    if (kind === 'normal') {
      return chance(0.55) ? 'dong' : (chance(0.8) ? 'eun' : 'geum');
    }
    if (kind === 'special') {
      var r = Math.random();
      if (r < 0.40) { return 'eun'; }
      if (r < 0.86) { return 'geum'; }
      return 'legend';
    }
    /* 완전 랜덤(가중치) */
    var total = 0, i, k;
    for (i = 0; i < RARITY_ORDER.length; i++) { total += RARITY[RARITY_ORDER[i]].weight; }
    var x = Math.random() * total;
    for (i = 0; i < RARITY_ORDER.length; i++) {
      k = RARITY_ORDER[i];
      x -= RARITY[k].weight;
      if (x <= 0) { return k; }
    }
    return 'dong';
  }

  var ID_SEQ = 1;
  function newId() { return 'p' + (Date.now() % 100000) + '_' + (ID_SEQ++); }

  function makePlayer(opts) {
    opts = opts || {};
    var pos = opts.pos || pick(['GK', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW']);
    var rarity = opts.rarity || pickRarity('normal');
    var base = RARITY[rarity].base;
    var w = POS[pos].weights;
    var lvl = opts.level || 0;
    var stats = {
      atk: Math.round(range(base[0], base[1]) * (w.atk > 0.35 ? 1.08 : 0.86)),
      def: Math.round(range(base[0], base[1]) * (w.def > 0.35 ? 1.08 : 0.86)),
      spd: Math.round(range(base[0], base[1]) * (w.spd > 0.3 ? 1.06 : 0.9))
    };
    if (pos === 'GK') {
      stats.def = Math.round(range(base[0] + 4, base[1] + 3));
      stats.atk = Math.round(range(base[0] - 16, base[0] - 6));
    }
    stats.atk = clamp(stats.atk, 20, 99);
    stats.def = clamp(stats.def, 20, 99);
    stats.spd = clamp(stats.spd, 20, 99);

    return {
      id: opts.id || newId(),
      name: opts.name || randName(),
      pos: pos,
      rarity: rarity,
      stats: stats,
      level: lvl,
      hair: opts.hair || pick(HAIR_COLORS),
      skin: opts.skin || pick(SKIN_COLORS),
      goals: 0,
      apps: 0
    };
  }

  function overall(p, role) {
    var w = p.pos === 'GK'
      ? { atk: 0.05, def: 0.70, spd: 0.25 }
      : POS[p.pos].weights;
    var v = p.stats.atk * w.atk + p.stats.def * w.def + p.stats.spd * w.spd;
    v += p.level * 1.2;
    if (role && role !== p.pos) {
      /* 슬롯과 포지션이 어긋나면 전력 손실 */
      v -= 4;
    }
    return Math.round(clamp(v, 20, 99));
  }

  function stars(ovr) {
    if (ovr >= 90) { return 5; }
    if (ovr >= 80) { return 4; }
    if (ovr >= 70) { return 3; }
    if (ovr >= 58) { return 2; }
    return 1;
  }

  /* 초기 선수단 16명 */
  function makeInitialSquad() {
    var squad = [];
    var roles = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW', 'DF', 'MF', 'FW', 'GK', 'MF'];
    var i;
    for (i = 0; i < roles.length; i++) {
      var r;
      if (roles[i] === 'GK') { r = 'eun'; }
      else if (i < 11) { r = chance(0.35) ? 'geum' : 'eun'; }
      else { r = chance(0.5) ? 'dong' : 'eun'; }
      var p = makePlayer({ pos: roles[i], rarity: r });
      if (i === 9) { p.name = '차도훈'; p.rarity = 'geum'; p.stats = { atk: 78, def: 30, spd: 74 }; }
      if (i === 0) { p.name = '한지호'; p.stats = { atk: 22, def: 73, spd: 55 }; }
      squad.push(p);
    }
    return squad;
  }

  DS.makePlayer = makePlayer;
  DS.makeInitialSquad = makeInitialSquad;
  DS.overall = overall;
  DS.stars = stars;
  DS.pickRarity = pickRarity;
  DS.randName = randName;
  DS.resetNames = function () { USED = {}; };

  /* ─────────────────────────  픽셀 아트  ───────────────────────── */
  /* 12 x 13 상반신 도트맵 + 절차적 다리. 2.5등신 치비 스타일. */
  var UPPER = [
    '...HHHHHH...',
    '..HHHHHHHH..',
    '..HHSSSSHH..',
    '..HSSSSSSH..',
    '..HSESSESH..',
    '..HSSSSSSH..',
    '...SSSSSS...',
    '..JJJJJJJJ..',
    '.JJJJJJJJJJ.',
    '.SJJJJJJJJS.',
    '..JJJJJJJJ..',
    '..KKKKKKKK..',
    '..KKKKKKKK..'
  ];

  var Art = {};

  function hexAlpha(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  Art.hexAlpha = hexAlpha;

  function shade(hex, amount) {
    var h = hex.replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    var r = clamp(parseInt(h.slice(0, 2), 16) + amount, 0, 255);
    var g = clamp(parseInt(h.slice(2, 4), 16) + amount, 0, 255);
    var b = clamp(parseInt(h.slice(4, 6), 16) + amount, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  Art.shade = shade;

  /* 선수 도트: (x,y)=발 중앙, s=1도트 픽셀 크기 */
  Art.drawPlayer = function (ctx, x, y, s, kit, p, opt) {
    opt = opt || {};
    var frame = opt.frame || 0;       /* 0~3 달리기 사이클 */
    var face = opt.face === undefined ? 1 : opt.face; /* 1 오른쪽, -1 왼쪽 */
    var shirt = kit.shirt;
    var shorts = kit.shorts || '#ffffff';
    var skin = p && p.skin ? p.skin : '#f2c49b';
    var hair = p && p.hair ? p.hair : '#2b1d14';
    var dark = shade(shirt, -46);
    var i, j, ch, col;

    /* 그림자 */
    if (opt.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(Math.round(x), Math.round(y) + Math.round(s), Math.round(6 * s), Math.round(2 * s), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    var top = y - 17 * s;   /* 도트맵(13줄) + 다리(4줄) = 17도트 */
    var left = x - 6 * s;

    /* 다리 */
    var swing = [0, 1, 0, -1][frame % 4];
    var legH = [3, 4, 3, 4][frame % 4];
    ctx.fillStyle = skin;
    ctx.fillRect(Math.round(left + 2 * s), Math.round(top + 13 * s), Math.round(3 * s), Math.round(legH * s));
    ctx.fillRect(Math.round(left + 7 * s), Math.round(top + 13 * s), Math.round(3 * s), Math.round((4 - (legH - 3)) * s));
    /* 축구화 */
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(Math.round(left + 1 * s + swing * s), Math.round(top + (13 + legH) * s), Math.round(4 * s), Math.round(1 * s));
    ctx.fillRect(Math.round(left + 7 * s - swing * s), Math.round(top + (17 - (legH - 3)) * s), Math.round(4 * s), Math.round(1 * s));

    /* 상반신 도트맵 */
    for (j = 0; j < UPPER.length; j++) {
      var row = UPPER[j];
      for (i = 0; i < row.length; i++) {
        ch = row.charAt(i);
        if (ch === '.') { continue; }
        if (ch === 'H') { col = hair; }
        else if (ch === 'S') { col = skin; }
        else if (ch === 'E') { col = '#20140e'; }
        else if (ch === 'J') {
          col = shirt;
          if (j === 8 && (i === 0 || i === 11)) { col = shade(shirt, -30); }
          if (j === 3 && i > 2 && i < 9) { col = shade(shirt, 14); }
        } else if (ch === 'K') { col = shorts; }
        else { col = shirt; }
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(left + i * s), Math.round(top + j * s), Math.ceil(s), Math.ceil(s));
      }
    }

    /* 눈 방향(좌우 반전 느낌) */
    if (face < 0) {
      ctx.fillStyle = '#20140e';
      ctx.fillRect(Math.round(left + 2 * s), Math.round(top + 4 * s), Math.ceil(s), Math.ceil(s));
    }

    /* 등번호 (선택) */
    if (opt.number) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold ' + Math.max(5, Math.round(3.4 * s)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(opt.number), Math.round(x), Math.round(top + 9.6 * s));
    }

    /* 압박 표시 */
    if (opt.ring) {
      ctx.strokeStyle = opt.ring;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(Math.round(x), Math.round(y) + Math.round(s * 0.4), Math.round(6.5 * s), Math.round(2.6 * s), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    void dark;
  };

  /* 공 */
  Art.drawBall = function (ctx, x, y, r) {
    r = r || 4;
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y + r * 0.9), r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(Math.round(x - r * 0.15), Math.round(y - r * 0.45), Math.ceil(r * 0.4), Math.ceil(r * 0.4));
    ctx.fillRect(Math.round(x - r * 0.75), Math.round(y + r * 0.15), Math.ceil(r * 0.35), Math.ceil(r * 0.35));
    ctx.fillRect(Math.round(x + r * 0.35), Math.round(y + r * 0.2), Math.ceil(r * 0.32), Math.ceil(r * 0.32));
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
    ctx.stroke();
  };

  /* 경기장 */
  Art.pitchMargin = function (W, H) {
    return Math.max(14, Math.round(Math.min(W, H) * 0.04));
  };

  Art.drawPitch = function (ctx, W, H, opt) {
    opt = opt || {};
    var g1 = '#3f9b46';
    var g2 = '#47a84e';
    var rows = 10;
    var i;
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);
    for (i = 0; i < rows; i++) {
      if (i % 2 === 0) { continue; }
      ctx.fillStyle = g2;
      ctx.fillRect(0, Math.floor(H / rows) * i, W, Math.ceil(H / rows) + 1);
    }
    /* 잔디 결 */
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (i = 0; i < 26; i++) {
      ctx.fillRect((i * 37) % W, 0, 2, H);
    }

    var m = opt.margin || Art.pitchMargin(W, H);  /* 경기장 여백 */
    var fx = m, fy = m, fw = W - m * 2, fh = H - m * 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.82)';
    ctx.lineWidth = 2;
    ctx.strokeRect(fx, fy, fw, fh);

    /* 하프라인 + 센터서클 */
    ctx.beginPath();
    ctx.moveTo(fx, fy + fh / 2);
    ctx.lineTo(fx + fw, fy + fh / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, fy + fh / 2, fh * 0.13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(W / 2 - 1.5, fy + fh / 2 - 1.5, 3, 3);

    /* 페널티 박스 (상/하) */
    var boxW = fw * 0.58, boxH = fh * 0.15;
    ctx.strokeRect(W / 2 - boxW / 2, fy, boxW, boxH);
    ctx.strokeRect(W / 2 - boxW / 2, fy + fh - boxH, boxW, boxH);
    var smallW = fw * 0.30, smallH = fh * 0.07;
    ctx.strokeRect(W / 2 - smallW / 2, fy, smallW, smallH);
    ctx.strokeRect(W / 2 - smallW / 2, fy + fh - smallH, smallW, smallH);
    ctx.beginPath();
    ctx.arc(W / 2, fy + fh * 0.105, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W / 2, fy + fh - fh * 0.105, 2, 0, Math.PI * 2);
    ctx.fill();

    /* 골대 + 그물 */
    var goalW = fw * 0.22;
    var goalD = Math.max(10, m - 3);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    var gx = W / 2 - goalW / 2;
    /* 위쪽 골대 */
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(gx, fy - goalD, goalW, goalD);
    for (i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(gx + (goalW / 8) * i, fy - goalD);
      ctx.lineTo(gx + (goalW / 8) * i, fy);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(gx, fy - goalD); ctx.lineTo(gx + goalW, fy - goalD);
    ctx.moveTo(gx, fy); ctx.lineTo(gx, fy - goalD);
    ctx.moveTo(gx + goalW, fy); ctx.lineTo(gx + goalW, fy - goalD);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#f4f8ff';
    ctx.stroke();
    /* 아래쪽 골대 */
    gx = W / 2 - goalW / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(gx, fy + fh, goalW, goalD);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    for (i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(gx + (goalW / 8) * i, fy + fh);
      ctx.lineTo(gx + (goalW / 8) * i, fy + fh + goalD);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(gx, fy + fh + goalD); ctx.lineTo(gx + goalW, fy + fh + goalD);
    ctx.moveTo(gx, fy + fh); ctx.lineTo(gx, fy + fh + goalD);
    ctx.moveTo(gx + goalW, fy + fh); ctx.lineTo(gx + goalW, fy + fh + goalD);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#f4f8ff';
    ctx.stroke();
    ctx.restore();
  };

  function shieldPath(ctx, x, y, w, h) {
    ctx.moveTo(x, y + h * 0.06);
    ctx.lineTo(x + w, y + h * 0.06);
    ctx.lineTo(x + w, y + h * 0.52);
    ctx.quadraticCurveTo(x + w, y + h, x + w / 2, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h * 0.52);
    ctx.closePath();
  }

  /* 엠블럼 (문양별) */
  Art.drawEmblem = function (canvas, id, kit) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    var shirt = (kit && kit.shirt) || '#e23b3b';
    var trim = (kit && kit.trim) || '#ffd24a';
    var pad = Math.round(W * 0.06);
    var w = W - pad * 2, h = H - pad * 2;
    /* 방패 */
    ctx.beginPath();
    shieldPath(ctx, pad, pad, w, h);
    var grd = ctx.createLinearGradient(0, pad, 0, pad + h);
    grd.addColorStop(0, shade(shirt, 30));
    grd.addColorStop(1, shade(shirt, -40));
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.lineWidth = Math.max(2, W * 0.05);
    ctx.strokeStyle = trim;
    ctx.stroke();

    /* 문양 (방패 모양으로 클리핑) */
    ctx.save();
    ctx.beginPath();
    shieldPath(ctx, pad, pad, w, h);
    ctx.clip();
    var cx = W / 2, cy = pad + h * 0.46;
    var u = W / 16;
    ctx.fillStyle = trim;
    if (id === 'star') {
      drawStar(ctx, cx, cy, 5, u * 4.6, u * 2.1);
      ctx.fill();
    } else if (id === 'flame') {
      ctx.beginPath();
      ctx.moveTo(cx, cy + u * 4);
      ctx.quadraticCurveTo(cx - u * 3.4, cy + u * 1, cx - u * 0.4, cy - u * 4.2);
      ctx.quadraticCurveTo(cx - u * 0.2, cy - u * 1.4, cx + u * 1.6, cy - u * 1.2);
      ctx.quadraticCurveTo(cx + u * 3.4, cy + u * 0.4, cx + u * 2.2, cy + u * 2.6);
      ctx.quadraticCurveTo(cx + u * 1.4, cy + u * 4, cx, cy + u * 4);
      ctx.fill();
    } else if (id === 'bolt') {
      ctx.beginPath();
      ctx.moveTo(cx + u * 1.4, cy - u * 4.4);
      ctx.lineTo(cx - u * 2.6, cy + u * 0.4);
      ctx.lineTo(cx - u * 0.2, cy + u * 0.4);
      ctx.lineTo(cx - u * 1.2, cy + u * 4.4);
      ctx.lineTo(cx + u * 2.8, cy - u * 0.6);
      ctx.lineTo(cx + u * 0.2, cy - u * 0.6);
      ctx.closePath();
      ctx.fill();
    } else if (id === 'crown') {
      ctx.beginPath();
      ctx.moveTo(cx - u * 3.6, cy + u * 2.4);
      ctx.lineTo(cx - u * 3.6, cy - u * 2.4);
      ctx.lineTo(cx - u * 1.4, cy - u * 0.2);
      ctx.lineTo(cx, cy - u * 3.4);
      ctx.lineTo(cx + u * 1.4, cy - u * 0.2);
      ctx.lineTo(cx + u * 3.6, cy - u * 2.4);
      ctx.lineTo(cx + u * 3.6, cy + u * 2.4);
      ctx.closePath();
      ctx.fill();
    } else if (id === 'ball') {
      ctx.beginPath();
      ctx.arc(cx, cy, u * 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(shirt, -50);
      ctx.beginPath();
      ctx.arc(cx, cy, u * 1.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'wave') {
      ctx.beginPath();
      ctx.moveTo(cx - u * 4, cy + u * 0.6);
      ctx.quadraticCurveTo(cx - u * 2, cy - u * 2.6, cx, cy + u * 0.4);
      ctx.quadraticCurveTo(cx + u * 2, cy + u * 3, cx + u * 4, cy + u * 0.2);
      ctx.lineTo(cx + u * 4, cy + u * 3);
      ctx.lineTo(cx - u * 4, cy + u * 3);
      ctx.closePath();
      ctx.fill();
    } else if (id === 'claw') {
      var k;
      for (k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(cx + k * u * 2.4 - u * 0.5, cy - u * 3.6);
        ctx.quadraticCurveTo(cx + k * u * 2.4 + u * 1.1, cy, cx + k * u * 2.4 - u * 0.6, cy + u * 3.6);
        ctx.quadraticCurveTo(cx + k * u * 2.4 - u * 1.0, cy, cx + k * u * 2.4 - u * 0.5, cy - u * 3.6);
        ctx.fill();
      }
    } else if (id === 'moon') {
      ctx.beginPath();
      ctx.arc(cx, cy, u * 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(shirt, -18);
      ctx.beginPath();
      ctx.arc(cx + u * 1.8, cy - u * 0.6, u * 3.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  function drawStar(ctx, cx, cy, spikes, outer, inner) {
    var rot = Math.PI / 2 * 3;
    var step = Math.PI / spikes;
    var i;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outer);
    for (i = 0; i < spikes; i++) {
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
      ctx.lineTo(cx + Math.cos(rot + step / 2) * outer, cy + Math.sin(rot + step / 2) * outer);
    }
    ctx.closePath();
  }

  /* 작은 아이콘용 공/별 */
  Art.iconBall = function (canvas) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width;
    ctx.clearRect(0, 0, W, canvas.height);
    Art.drawBall(ctx, W / 2, W / 2, W * 0.42);
  };

  DS.Art = Art;

})(window);
