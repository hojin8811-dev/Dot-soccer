/*! 도트싸커 × 포켓리그 v2 — 게임 데이터 · 선수 생성 · 픽셀 아트 (data.js) */
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
  function shuffle(arr) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = rnd(i + 1); t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  DS.util = {
    rnd: rnd, range: range, irange: irange, pick: pick, clamp: clamp,
    chance: chance, fmt: fmt, hasJong: hasJong, josa: josa, shuffle: shuffle
  };

  /* ─────────────────────────  등급  ───────────────────────── */
  var RARITY = {
    dong:   { key: 'dong',   name: '동',     en: 'BRONZE', color: '#a86a26', light: '#e7c191', stars: 2, base: [3, 5] },
    eun:    { key: 'eun',    name: '은',     en: 'SILVER', color: '#7d8b99', light: '#dbe4ed', stars: 3, base: [4, 6] },
    geum:   { key: 'geum',   name: '금',     en: 'GOLD',   color: '#c1911b', light: '#ffe7a4', stars: 4, base: [5, 7] },
    legend: { key: 'legend', name: '레전드', en: 'LEGEND', color: '#8248bf', light: '#e6d0ff', stars: 5, base: [6, 9] }
  };
  var RARITY_ORDER = ['dong', 'eun', 'geum', 'legend'];
  DS.RARITY = RARITY;
  DS.RARITY_ORDER = RARITY_ORDER;

  /* ─────────────────────────  포지션 (현대 13종)  ───────────────────────── */
  /* group: GK / DF / MF / FW, line: 0(골키퍼)~3(최전방), w: 평가 가중치 */
  var POS = {
    GK:  { key: 'GK',  name: '골키퍼',        short: 'GK',  group: 'GK', line: 0, color: '#2f6f9e', w: { s: 0.20, t: 0.22, p: 0.58 } },
    CB:  { key: 'CB',  name: '센터백',        short: 'CB',  group: 'DF', line: 1, color: '#2f6fbf', w: { s: 0.26, t: 0.26, p: 0.48 } },
    LB:  { key: 'LB',  name: '레프트백',      short: 'LB',  group: 'DF', line: 1, color: '#3a7ac8', w: { s: 0.40, t: 0.30, p: 0.30 } },
    RB:  { key: 'RB',  name: '라이트백',      short: 'RB',  group: 'DF', line: 1, color: '#3a7ac8', w: { s: 0.40, t: 0.30, p: 0.30 } },
    LWB: { key: 'LWB', name: '레프트 윙백',   short: 'LWB', group: 'DF', line: 1, color: '#4a86d4', w: { s: 0.46, t: 0.32, p: 0.22 } },
    RWB: { key: 'RWB', name: '라이트 윙백',   short: 'RWB', group: 'DF', line: 1, color: '#4a86d4', w: { s: 0.46, t: 0.32, p: 0.22 } },
    DM:  { key: 'DM',  name: '수비형 미드필더', short: 'DM', group: 'MF', line: 2, color: '#2f8f62', w: { s: 0.26, t: 0.36, p: 0.38 } },
    CM:  { key: 'CM',  name: '중앙 미드필더',  short: 'CM',  group: 'MF', line: 2, color: '#2f8f4a', w: { s: 0.30, t: 0.46, p: 0.24 } },
    AM:  { key: 'AM',  name: '공격형 미드필더', short: 'AM', group: 'MF', line: 2, color: '#43a34f', w: { s: 0.30, t: 0.56, p: 0.14 } },
    LWF: { key: 'LWF', name: '레프트 윙포워드', short: 'LWF', group: 'FW', line: 3, color: '#b93c2c', w: { s: 0.44, t: 0.40, p: 0.16 } },
    RWF: { key: 'RWF', name: '라이트 윙포워드', short: 'RWF', group: 'FW', line: 3, color: '#b93c2c', w: { s: 0.44, t: 0.40, p: 0.16 } },
    CF:  { key: 'CF',  name: '센터포워드',    short: 'CF',  group: 'FW', line: 3, color: '#d1482f', w: { s: 0.28, t: 0.52, p: 0.20 } },
    ST:  { key: 'ST',  name: '스트라이커',    short: 'ST',  group: 'FW', line: 3, color: '#c23428', w: { s: 0.34, t: 0.42, p: 0.24 } }
  };
  var POS_ORDER = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'DM', 'CM', 'AM', 'LWF', 'RWF', 'CF', 'ST'];
  var POS_LIST = POS_ORDER;
  DS.POS = POS;
  DS.POS_ORDER = POS_ORDER;
  DS.POS_LIST = POS_LIST;
  function posGroup(code) { return (POS[code] || POS.CM).group; }
  DS.posGroup = posGroup;
  DS.posName = function (code) { return POS[code] ? POS[code].name : code; };

  /* 포지션 적성 배치 (미니 피치 위 좌표 %, 위 = 상대 골대) */
  /* 적성 피치맵: 13 포지션, 좌우 완전 대칭 (위 = 상대 골대)
     중앙축 x=50 한 줄: AM → DM → GK (DM은 CM 두 자리 뒤쪽 정중앙)
     좌우 2자리: CM(좌 37 / 우 63), CB(좌 38 / 우 62) — 좌표는 왼쪽 자리 기준,
     오른쪽 자리는 슬롯 side:'R'로 x를 100 기준 뒤집어 그린다
     윙백(LWB/RWB)은 하프라인(y=50) 위 — CM(y=40)과 DM(y=56) 사이 중앙선에 걸친다
     좌우 날개: ST/CF · LWF/RWF · LB/RB 는 x=50 기준 정대칭 */
  var APT_LAYOUT = {
    ST:  { x: 41, y: 11 }, CF: { x: 59, y: 11 },
    LWF: { x: 11, y: 25 }, AM: { x: 50, y: 25 }, RWF: { x: 89, y: 25 },
    LWB: { x: 7,  y: 50 }, CM: { x: 37, y: 40 }, RWB: { x: 93, y: 50 },
    DM:  { x: 50, y: 56 },
    LB:  { x: 17, y: 71 }, CB: { x: 38, y: 71 }, RB: { x: 83, y: 71 },
    GK:  { x: 50, y: 87 }
  };
  DS.APT_LAYOUT = APT_LAYOUT;
  /* 피치맵 표시 슬롯(15개) — CM·CB는 좌우 한 자리씩 두 번 그린다.
     포지션 목록(APT_LIST)은 13종 그대로 두고 표시용으로만 2자리를 만든다. */
  var APT_MAP_SLOTS = [
    { code: 'ST' }, { code: 'CF' },
    { code: 'LWF' }, { code: 'AM' }, { code: 'RWF' },
    { code: 'LWB' }, { code: 'CM', side: 'L' }, { code: 'CM', side: 'R' }, { code: 'RWB' },
    { code: 'DM' },
    { code: 'LB' }, { code: 'CB', side: 'L' }, { code: 'CB', side: 'R' }, { code: 'RB' },
    { code: 'GK' }
  ];
  DS.APT_MAP_SLOTS = APT_MAP_SLOTS;
  var APT_LIST = POS_ORDER.slice();
  var APT_NEAR = {
    GK:  ['CB'],
    CB:  ['DM', 'LB', 'RB'],
    LB:  ['LWB', 'CB', 'CM'],
    RB:  ['RWB', 'CB', 'CM'],
    LWB: ['LB', 'LWF', 'CM'],
    RWB: ['RB', 'RWF', 'CM'],
    DM:  ['CM', 'CB'],
    CM:  ['DM', 'AM', 'LB'],
    AM:  ['CM', 'CF', 'LWF', 'RWF'],
    LWF: ['LWB', 'AM', 'CF', 'RWF'],
    RWF: ['RWB', 'AM', 'CF', 'LWF'],
    CF:  ['ST', 'AM', 'LWF', 'RWF'],
    ST:  ['CF', 'LWF', 'RWF']
  };
  DS.APT_LIST = APT_LIST;
  DS.APT_NEAR = APT_NEAR;

  /* ─────────────────────────  주발 (왼발 · 오른발 · 양발)  ───────────────────────── */
  /* 왼쪽 측면(LB·LWB·LWF)은 왼발잡이, 오른쪽 측면(RB·RWB·RWF)은 오른발잡이에게
     적성 보너스를 준다. 반대쪽은 감점하되 인버티드 윙어(RWF·LWF)만 -1로 살짝 허용. */
  var FOOT_LIST = ['왼발', '오른발', '양발'];
  var FOOT_COLOR = { '왼발': '#2f6fbf', '오른발': '#b93c2c', '양발': '#4d7a2a' };
  var FOOT_SIDE = { LB: 'L', LWB: 'L', LWF: 'L', RB: 'R', RWB: 'R', RWF: 'R' };
  DS.FOOT_LIST = FOOT_LIST;
  DS.FOOT_COLOR = FOOT_COLOR;
  DS.FOOT_SIDE = FOOT_SIDE;
  DS.footColor = function (f) { return FOOT_COLOR[f] || '#4d7a2a'; };

  function footAdjust(foot, code) {
    var side = FOOT_SIDE[code];
    if (!side) { return 0; }
    if (foot === '양발') { return 1; }
    if (foot === '왼발') { return side === 'L' ? 2 : (code === 'RWF' ? -1 : -2); }
    if (foot === '오른발') { return side === 'R' ? 2 : (code === 'LWF' ? -1 : -2); }
    return 0;
  }
  DS.footAdjust = footAdjust;

  /* 좌우 같은 줄 쌍 — 주발이 왼발이면 왼쪽 값이 오른쪽보다 항상 크거나 같게, 오른발이면 그 반대.
     어울리지 않는 반대쪽만 내리고, 주 포지션·같은 쪽 값은 건드리지 않는다. */
  var SIDE_PAIRS = [['LB', 'RB'], ['LWB', 'RWB'], ['LWF', 'RWF']];
  function enforceFootOrder(apt, foot) {
    if (!apt) { return apt; }
    var i, a, b, va, vb;
    for (i = 0; i < SIDE_PAIRS.length; i++) {
      a = SIDE_PAIRS[i][0]; b = SIDE_PAIRS[i][1];
      va = apt[a] || 1; vb = apt[b] || 1;
      if (foot === '왼발' && va < vb) { apt[b] = va; }
      else if (foot === '오른발' && vb < va) { apt[a] = vb; }
    }
    return apt;
  }
  DS.enforceFootOrder = enforceFootOrder;

  /* 새 선수 — 주 포지션에 맞춰 왼발/오른발을 뽑는다 (중앙·GK는 현실 비율 68/22/10) */
  function pickFoot(pos) {
    var r = Math.random();
    if (FOOT_SIDE[pos] === 'L') { return r < 0.72 ? '왼발' : (r < 0.90 ? '양발' : '오른발'); }
    if (FOOT_SIDE[pos] === 'R') { return r < 0.72 ? '오른발' : (r < 0.90 ? '양발' : '왼발'); }
    return r < 0.68 ? '오른발' : (r < 0.90 ? '왼발' : '양발');
  }
  DS.pickFoot = pickFoot;

  function footSeed(str) {
    var h = 2166136261, i, s = String(str || '');
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return (h >>> 0) / 4294967296;
  }
  /* 기존 세이브 마이그레이션 — id+이름 시드로 결정적 배정(새로고침해도 주발이 바뀌지 않는다).
     측면 선수는 주 발/양발만 — 주 포지션 적성과 주발이 어긋나 보이지 않게 한다. */
  DS.ensureFoot = function (p) {
    if (!p) { return '오른발'; }
    if (FOOT_LIST.indexOf(p.foot) >= 0) { return p.foot; }
    var pos = POS[p.pos] ? p.pos : 'CM';
    var r = footSeed((p.id || '') + '|' + (p.name || '') + '|foot');
    var foot;
    if (FOOT_SIDE[pos] === 'L') { foot = r < 0.82 ? '왼발' : '양발'; }
    else if (FOOT_SIDE[pos] === 'R') { foot = r < 0.82 ? '오른발' : '양발'; }
    else { foot = r < 0.68 ? '오른발' : (r < 0.90 ? '왼발' : '양발'); }
    p.foot = foot;
    if (p.apt) {
      var i, code;
      for (i = 0; i < APT_LIST.length; i++) {
        code = APT_LIST[i];
        if (!FOOT_SIDE[code]) { continue; }
        p.apt[code] = clamp((p.apt[code] || 1) + footAdjust(foot, code), 1, 9);
      }
      enforceFootOrder(p.apt, foot);
    }
    return foot;
  };

  /* ─────────────────────────  포메이션 (현대 8종)  ───────────────────────── */
  /* x: 0(왼쪽)~100(오른쪽), y: 0(상대 골대)~100(우리 골대) / k: ☆ 핵심 자리 */
  /* press: 압박 강도, line: 수비 라인 높이, width: 공격 폭, tempo: 템포 */
  var FORMATIONS = {
    '4-2-3-1': {
      name: '4-2-3-1', tag: '게겐프레싱', desc: '두 줄 압박 · 즉시 탈취', key: 4,
      metrics: { press: 88, line: 78, width: 62, tempo: 84 },
      slots: [
        { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
        { pos: 'LB',  role: 'LB',  x: 12, y: 76 },
        { pos: 'CB',  role: 'CB',  x: 36, y: 80, k: true },
        { pos: 'CB',  role: 'CB',  x: 64, y: 80 },
        { pos: 'RB',  role: 'RB',  x: 88, y: 76 },
        { pos: 'DM',  role: 'DM',  x: 34, y: 60, k: true },
        { pos: 'DM',  role: 'DM',  x: 66, y: 60 },
        { pos: 'LWF', role: 'LWF', x: 16, y: 38 },
        { pos: 'AM',  role: 'AM',  x: 50, y: 36, k: true },
        { pos: 'RWF', role: 'RWF', x: 84, y: 38 },
        { pos: 'ST',  role: 'ST',  x: 50, y: 17, k: true }
      ]
    },
    '3-4-2-1': {
      name: '3-4-2-1', tag: '윙백 오버래핑', desc: '스리백 · 측면 수적 우위', key: 3,
      metrics: { press: 74, line: 68, width: 90, tempo: 78 },
      slots: [
        { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
        { pos: 'CB',  role: 'CB',  x: 26, y: 80 },
        { pos: 'CB',  role: 'CB',  x: 50, y: 82, k: true },
        { pos: 'CB',  role: 'CB',  x: 74, y: 80 },
        { pos: 'LWB', role: 'LWB', x: 7,  y: 56, k: true },
        { pos: 'CM',  role: 'CM',  x: 34, y: 58 },
        { pos: 'CM',  role: 'CM',  x: 66, y: 58 },
        { pos: 'RWB', role: 'RWB', x: 93, y: 56, k: true },
        { pos: 'AM',  role: 'AM',  x: 33, y: 34 },
        { pos: 'AM',  role: 'AM',  x: 67, y: 34 },
        { pos: 'ST',  role: 'ST',  x: 50, y: 17, k: true }
      ]
    },
    '4-3-3': {
      name: '4-3-3', tag: '폴스 나인', desc: '최전방 내려오며 중원 창출', key: 3,
      metrics: { press: 70, line: 66, width: 78, tempo: 76 },
      slots: [
        { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
        { pos: 'LB',  role: 'LB',  x: 12, y: 75 },
        { pos: 'CB',  role: 'CB',  x: 36, y: 79 },
        { pos: 'CB',  role: 'CB',  x: 64, y: 79, k: true },
        { pos: 'RB',  role: 'RB',  x: 88, y: 75 },
        { pos: 'DM',  role: 'DM',  x: 50, y: 62, k: true },
        { pos: 'CM',  role: 'CM',  x: 28, y: 52 },
        { pos: 'CM',  role: 'CM',  x: 72, y: 52 },
        { pos: 'LWF', role: 'LWF', x: 18, y: 28 },
        { pos: 'CF',  role: 'CF',  x: 50, y: 24, k: true },
        { pos: 'RWF', role: 'RWF', x: 82, y: 28 }
      ]
    },
    '4-1-4-1': {
      name: '4-1-4-1', tag: '원볼란치', desc: '홀딩 미드필더가 전방 보호', key: 3,
      metrics: { press: 62, line: 58, width: 74, tempo: 64 },
      slots: [
        { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
        { pos: 'LB',  role: 'LB',  x: 12, y: 76 },
        { pos: 'CB',  role: 'CB',  x: 36, y: 80 },
        { pos: 'CB',  role: 'CB',  x: 64, y: 80 },
        { pos: 'RB',  role: 'RB',  x: 88, y: 76 },
        { pos: 'DM',  role: 'DM',  x: 50, y: 64, k: true },
        { pos: 'LWF', role: 'LWF', x: 14, y: 44 },
        { pos: 'AM',  role: 'AM',  x: 38, y: 42 },
        { pos: 'CM',  role: 'CM',  x: 62, y: 44 },
        { pos: 'RWF', role: 'RWF', x: 86, y: 44 },
        { pos: 'ST',  role: 'ST',  x: 50, y: 19, k: true }
      ]
    },
    '4-4-2': {
      name: '4-4-2', tag: '다이아몬드', desc: '중앙 다이아몬드 · 정면 돌파', key: 4,
      metrics: { press: 66, line: 62, width: 46, tempo: 70 },
      slots: [
        { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
        { pos: 'LB',  role: 'LB',  x: 12, y: 76 },
        { pos: 'CB',  role: 'CB',  x: 36, y: 80 },
        { pos: 'CB',  role: 'CB',  x: 64, y: 80, k: true },
        { pos: 'RB',  role: 'RB',  x: 88, y: 76 },
        { pos: 'DM',  role: 'DM',  x: 50, y: 64 },
        { pos: 'CM',  role: 'CM',  x: 26, y: 50 },
        { pos: 'CM',  role: 'CM',  x: 74, y: 50 },
        { pos: 'AM',  role: 'AM',  x: 50, y: 36, k: true },
        { pos: 'ST',  role: 'ST',  x: 38, y: 18 },
        { pos: 'ST',  role: 'ST',  x: 62, y: 18, k: true }
      ]
    },
    '3-5-2': {
      name: '3-5-2', tag: '투톱 압박', desc: '투톱이 수비수를 물고 늘어짐', key: 3,
      metrics: { press: 84, line: 70, width: 66, tempo: 80 },
      slots: [
        { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
        { pos: 'CB',  role: 'CB',  x: 26, y: 80 },
        { pos: 'CB',  role: 'CB',  x: 50, y: 82, k: true },
        { pos: 'CB',  role: 'CB',  x: 74, y: 80 },
        { pos: 'LWB', role: 'LWB', x: 8,  y: 58 },
        { pos: 'DM',  role: 'DM',  x: 38, y: 60 },
        { pos: 'CM',  role: 'CM',  x: 50, y: 52 },
        { pos: 'DM',  role: 'DM',  x: 62, y: 60 },
        { pos: 'RWB', role: 'RWB', x: 92, y: 58 },
        { pos: 'ST',  role: 'ST',  x: 38, y: 20, k: true },
        { pos: 'ST',  role: 'ST',  x: 62, y: 20 }
      ]
    },
    '5-3-2': {
      name: '5-3-2', tag: '카운터', desc: '다섯 수비 → 한 번의 역습', key: 5,
      metrics: { press: 44, line: 40, width: 60, tempo: 58 },
      slots: [
        { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
        { pos: 'LWB', role: 'LWB', x: 8,  y: 72 },
        { pos: 'CB',  role: 'CB',  x: 28, y: 84 },
        { pos: 'CB',  role: 'CB',  x: 50, y: 86, k: true },
        { pos: 'CB',  role: 'CB',  x: 72, y: 84 },
        { pos: 'RWB', role: 'RWB', x: 92, y: 72 },
        { pos: 'CM',  role: 'CM',  x: 28, y: 56 },
        { pos: 'DM',  role: 'DM',  x: 50, y: 58, k: true },
        { pos: 'CM',  role: 'CM',  x: 72, y: 56 },
        { pos: 'ST',  role: 'ST',  x: 38, y: 24, k: true },
        { pos: 'ST',  role: 'ST',  x: 62, y: 24 }
      ]
    },
    '4-2-2-2': {
      name: '4-2-2-2', tag: '하프스페이스', desc: '두 개의 하프스페이스 침투', key: 4,
      metrics: { press: 76, line: 72, width: 58, tempo: 82 },
      slots: [
        { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
        { pos: 'LB',  role: 'LB',  x: 12, y: 76 },
        { pos: 'CB',  role: 'CB',  x: 36, y: 80 },
        { pos: 'CB',  role: 'CB',  x: 64, y: 80 },
        { pos: 'RB',  role: 'RB',  x: 88, y: 76 },
        { pos: 'DM',  role: 'DM',  x: 36, y: 60 },
        { pos: 'DM',  role: 'DM',  x: 64, y: 60, k: true },
        { pos: 'AM',  role: 'AM',  x: 30, y: 38 },
        { pos: 'AM',  role: 'AM',  x: 70, y: 38, k: true },
        { pos: 'ST',  role: 'ST',  x: 38, y: 18 },
        { pos: 'ST',  role: 'ST',  x: 62, y: 18, k: true }
      ]
    }
  };

  /* ─────────────────────────  감독 전용 변칙 포메이션 (v14 · 6종)  ─────────────────────────
     정통 8종으로는 표현되지 않는 감독의 색. morph 는 경기 중 실제 대형 변형을 지시한다.
       boxMid  : 공격 시 DM·풀백이 중앙 박스 미드필더로 좁혀 들어온다
       wbUp    : 윙백이 하프라인을 넘어 최전방까지 오버래핑
       diamond : 2선이 다이아몬드로 모이고 투톱과 연결
       fbIn    : 풀백이 인버티드로 중원에 합류
       wingHigh: 윙어가 터치라인을 붙잡고 최전방 유지 */
  FORMATIONS['3-2-4-1'] = {
    name: '3-2-4-1', tag: '박스 미드필더', desc: '공격 시 DM·풀백이 중앙 4각으로', key: 3, anom: true,
    morph: { boxMid: 1, wbUp: 1 },
    metrics: { press: 82, line: 76, width: 58, tempo: 82 },
    slots: [
      { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
      { pos: 'CB',  role: 'CB',  x: 26, y: 82 },
      { pos: 'CB',  role: 'CB',  x: 50, y: 84, k: true },
      { pos: 'CB',  role: 'CB',  x: 74, y: 82 },
      { pos: 'DM',  role: 'DM',  x: 38, y: 62, k: true },
      { pos: 'DM',  role: 'DM',  x: 62, y: 62 },
      { pos: 'LWB', role: 'LWB', x: 12, y: 44 },
      { pos: 'AM',  role: 'AM',  x: 40, y: 36 },
      { pos: 'AM',  role: 'AM',  x: 60, y: 36, k: true },
      { pos: 'RWB', role: 'RWB', x: 88, y: 44 },
      { pos: 'ST',  role: 'ST',  x: 50, y: 16, k: true }
    ]
  };
  FORMATIONS['3-4-1-2'] = {
    name: '3-4-1-2', tag: '더블 볼란테', desc: '두 명의 6번이 전방을 보호', key: 3, anom: true,
    morph: { boxMid: 0.8, wbUp: 1 },
    metrics: { press: 70, line: 64, width: 66, tempo: 72 },
    slots: [
      { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
      { pos: 'CB',  role: 'CB',  x: 26, y: 82 },
      { pos: 'CB',  role: 'CB',  x: 50, y: 84, k: true },
      { pos: 'CB',  role: 'CB',  x: 74, y: 82 },
      { pos: 'LWB', role: 'LWB', x: 8,  y: 58 },
      { pos: 'DM',  role: 'DM',  x: 40, y: 62, k: true },
      { pos: 'DM',  role: 'DM',  x: 60, y: 62 },
      { pos: 'RWB', role: 'RWB', x: 92, y: 58 },
      { pos: 'AM',  role: 'AM',  x: 50, y: 36, k: true },
      { pos: 'ST',  role: 'ST',  x: 38, y: 18 },
      { pos: 'ST',  role: 'ST',  x: 62, y: 18 }
    ]
  };
  FORMATIONS['4-1-3-2'] = {
    name: '4-1-3-2', tag: '전방 다이아', desc: '2선 다이아몬드 · 투톱 연결', key: 4, anom: true,
    morph: { diamond: 1, fbIn: 0.6 },
    metrics: { press: 72, line: 68, width: 50, tempo: 76 },
    slots: [
      { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
      { pos: 'LB',  role: 'LB',  x: 12, y: 76 },
      { pos: 'CB',  role: 'CB',  x: 36, y: 80 },
      { pos: 'CB',  role: 'CB',  x: 64, y: 80, k: true },
      { pos: 'RB',  role: 'RB',  x: 88, y: 76 },
      { pos: 'DM',  role: 'DM',  x: 50, y: 64, k: true },
      { pos: 'LWF', role: 'LWF', x: 18, y: 46 },
      { pos: 'AM',  role: 'AM',  x: 50, y: 40, k: true },
      { pos: 'RWF', role: 'RWF', x: 82, y: 46 },
      { pos: 'ST',  role: 'ST',  x: 38, y: 18 },
      { pos: 'ST',  role: 'ST',  x: 62, y: 18, k: true }
    ]
  };
  FORMATIONS['5-2-2-1'] = {
    name: '5-2-2-1', tag: '더블 10번', desc: '두 명의 10번이 하프스페이스 점령', key: 5, anom: true,
    morph: { wbUp: 1, boxMid: 0.6 },
    metrics: { press: 58, line: 52, width: 64, tempo: 66 },
    slots: [
      { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
      { pos: 'LWB', role: 'LWB', x: 8,  y: 74 },
      { pos: 'CB',  role: 'CB',  x: 28, y: 84 },
      { pos: 'CB',  role: 'CB',  x: 50, y: 86, k: true },
      { pos: 'CB',  role: 'CB',  x: 72, y: 84 },
      { pos: 'RWB', role: 'RWB', x: 92, y: 74 },
      { pos: 'DM',  role: 'DM',  x: 40, y: 62 },
      { pos: 'DM',  role: 'DM',  x: 60, y: 62, k: true },
      { pos: 'AM',  role: 'AM',  x: 36, y: 38 },
      { pos: 'AM',  role: 'AM',  x: 64, y: 38, k: true },
      { pos: 'ST',  role: 'ST',  x: 50, y: 16 }
    ]
  };
  FORMATIONS['3-3-1-3'] = {
    name: '3-3-1-3', tag: '비엘사식 초공격', desc: '세 명 최전방 · 전원 전진', key: 3, anom: true,
    morph: { wingHigh: 1 },
    metrics: { press: 94, line: 88, width: 84, tempo: 92 },
    slots: [
      { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
      { pos: 'CB',  role: 'CB',  x: 26, y: 80 },
      { pos: 'CB',  role: 'CB',  x: 50, y: 82, k: true },
      { pos: 'CB',  role: 'CB',  x: 74, y: 80 },
      { pos: 'CM',  role: 'CM',  x: 30, y: 58 },
      { pos: 'DM',  role: 'DM',  x: 50, y: 62, k: true },
      { pos: 'CM',  role: 'CM',  x: 70, y: 58 },
      { pos: 'AM',  role: 'AM',  x: 50, y: 36 },
      { pos: 'LWF', role: 'LWF', x: 18, y: 22 },
      { pos: 'ST',  role: 'ST',  x: 50, y: 15, k: true },
      { pos: 'RWF', role: 'RWF', x: 82, y: 22 }
    ]
  };
  FORMATIONS['4-2-4'] = {
    name: '4-2-4', tag: '클래식 초공격', desc: '윙 2 + 투톱 · 측면 폭주', key: 4, anom: true,
    morph: { wingHigh: 1, fbIn: 0.2 },
    metrics: { press: 80, line: 74, width: 96, tempo: 88 },
    slots: [
      { pos: 'GK',  role: 'GK',  x: 50, y: 93 },
      { pos: 'LB',  role: 'LB',  x: 12, y: 78 },
      { pos: 'CB',  role: 'CB',  x: 36, y: 82 },
      { pos: 'CB',  role: 'CB',  x: 64, y: 82, k: true },
      { pos: 'RB',  role: 'RB',  x: 88, y: 78 },
      { pos: 'CM',  role: 'CM',  x: 36, y: 58 },
      { pos: 'CM',  role: 'CM',  x: 64, y: 58, k: true },
      { pos: 'LWF', role: 'LWF', x: 12, y: 28 },
      { pos: 'ST',  role: 'ST',  x: 38, y: 16, k: true },
      { pos: 'ST',  role: 'ST',  x: 62, y: 16 },
      { pos: 'RWF', role: 'RWF', x: 88, y: 28 }
    ]
  };

  DS.FORMATIONS = FORMATIONS;
  DS.FORMATION_KEYS = ['4-2-3-1', '3-4-2-1', '4-3-3', '4-1-4-1', '4-4-2', '3-5-2', '5-3-2', '4-2-2-2'];
  DS.ANOMALY_KEYS = ['3-2-4-1', '3-4-1-2', '4-1-3-2', '5-2-2-1', '3-3-1-3', '4-2-4'];
  DS.ALL_FORMATION_KEYS = DS.FORMATION_KEYS.concat(DS.ANOMALY_KEYS);
  DS.isAnomaly = function (key) {
    var f = FORMATIONS[key];
    return !!(f && f.anom);
  };

  /* ─────────────────────────  감독 전술 철학 (v14 · 7종)  ─────────────────────────
     경기 엔진이 이 수치를 그대로 읽어 라인·압박·패스 선택·침투를 바꾼다.
       press/line/width/tempo : 포메이션 지표에 더해지는 보정
       counterPress           : 볼을 잃은 직후 즉시 달려드는 인원 (게겐프레싱)
       supportGap             : 볼 소유자 주변 삼각 지원 거리
       maxPass / shortBias / longBias : 패스 거리 취향
       throughBias / crossBias        : 스루패스 · 크로스 빈도
       blockBank / blockWidth         : 수비 시 두 줄 간격 · 폭
       longBallAfterWin              : 자기 진영에서 탈취 직후 전방 롱패스 확률 */
  var TACTIC_STYLES = {
    gegenpress: {
      key: 'gegenpress', name: '게겐프레싱', short: 'GEGEN', color: '#e2553f',
      line: '잃으면 3명이 즉시 달려들어 6초 안에 되찾는다',
      press: 14, line: 8, width: 2, tempo: 8,
      counterPress: 3, supportGap: 9.6, maxPass: 50,
      shortBias: 0.5, longBias: -0.4, throughBias: 1.2, crossBias: 0.9, shootBias: 1.08,
      runCount: 2, fwStay: 9, blockBank: 11.6, blockWidth: 0.96, longBallAfterWin: 0.08
    },
    tikitaka: {
      key: 'tikitaka', name: '티키타카', short: 'TIKI', color: '#38a86b',
      line: '짧은 패스로 삼각을 만들고 점유로 조른다',
      press: -4, line: 4, width: -2, tempo: -4,
      counterPress: 1, supportGap: 7.4, maxPass: 42,
      shortBias: 1.7, longBias: -1.3, throughBias: 0.7, crossBias: 0.6, shootBias: 0.88,
      runCount: 1, fwStay: 0, blockBank: 12.2, blockWidth: 0.90, longBallAfterWin: 0
    },
    counter: {
      key: 'counter', name: '질식 역습', short: 'BLOCK', color: '#3f7fb8',
      line: '두 줄 블록으로 내려앉아 탈취 후 한 번에 찌른다',
      press: -10, line: -10, width: -8, tempo: 2,
      counterPress: 0, supportGap: 11.5, maxPass: 62,
      shortBias: -0.6, longBias: 0.9, throughBias: 1.9, crossBias: 0.8, shootBias: 1.2,
      runCount: 2, fwStay: 15, blockBank: 8.2, blockWidth: 0.78, longBallAfterWin: 0.6
    },
    wingplay: {
      key: 'wingplay', name: '측면 오버래핑', short: 'WING', color: '#c8a83a',
      line: '풀백·윙백이 터치라인을 타고 박스까지 올라간다',
      press: 2, line: 2, width: 14, tempo: 6,
      counterPress: 1, supportGap: 11.0, maxPass: 56,
      shortBias: -0.2, longBias: 0.4, throughBias: 0.9, crossBias: 2.3, shootBias: 1.0,
      runCount: 2, fwStay: 4, blockBank: 11.8, blockWidth: 1.14, longBallAfterWin: 0.16
    },
    hybrid3241: {
      key: 'hybrid3241', name: '가변 3-2-4-1', short: 'HYBRID', color: '#8a5cd6',
      line: '공격 시 DM·풀백이 중앙 4각, 수비 시 3-2 두 줄로 변형',
      press: 8, line: 6, width: 0, tempo: 6,
      counterPress: 2, supportGap: 9.2, maxPass: 48,
      shortBias: 0.9, longBias: -0.3, throughBias: 1.25, crossBias: 1.0, shootBias: 1.0,
      runCount: 2, fwStay: 5, blockBank: 10.4, blockWidth: 0.94, longBallAfterWin: 0.1
    },
    direct: {
      key: 'direct', name: '직선 롱볼', short: 'DIRECT', color: '#4aa8e0',
      line: '중원을 건너뛰고 최전방·측면으로 곧장 보낸다',
      press: 0, line: 0, width: 4, tempo: 10,
      counterPress: 0, supportGap: 12.0, maxPass: 66,
      shortBias: -1.1, longBias: 1.7, throughBias: 1.3, crossBias: 1.4, shootBias: 1.04,
      runCount: 1, fwStay: 7, blockBank: 10.8, blockWidth: 1.0, longBallAfterWin: 0.4
    },
    balanced: {
      key: 'balanced', name: '균형', short: 'BAL', color: '#9aa196',
      line: '라인과 간격을 지키며 상황에 맞춰 전환한다',
      press: 0, line: 0, width: 0, tempo: 0,
      counterPress: 0, supportGap: 10.5, maxPass: 55,
      shortBias: 0, longBias: 0, throughBias: 1, crossBias: 1, shootBias: 1.0,
      runCount: 1, fwStay: 0, blockBank: 12.6, blockWidth: 1.0, longBallAfterWin: 0.12
    }
  };
  DS.TACTIC_STYLES = TACTIC_STYLES;
  DS.STYLE_KEYS = ['gegenpress', 'tikitaka', 'counter', 'wingplay', 'hybrid3241', 'direct', 'balanced'];
  DS.tacticStyle = function (key) { return TACTIC_STYLES[key] || TACTIC_STYLES.balanced; };

  /* ─────────────────────────  v20 ③ — 상대 스카우팅 리포트  ─────────────────────────
     실제로 스폰될 원정 스쿼드(포지션·주발·롤)와 감독 철학을 그대로 읽어 FM식 리포트를 만든다.
     formation · style · players(그 경기에 뛸 11명)를 넘기면 리포트의 모든 문장이 그 데이터에서 나온다. */
  var LANE_KO = { left: '왼쪽', right: '오른쪽', center: '중앙' };
  /* 감독 철학 한 줄 요약 — TACTIC_STYLES.line은 수치 보정과 이름이 겹쳐 숫자만 남아 있어
     리포트용 문구는 여기서 따로 둔다. */
  var STYLE_DESC = {
    gegenpress: '잃으면 3명이 즉시 달려들어 되찾는다',
    tikitaka: '짧은 패스로 삼각을 만들고 점유로 조른다',
    counter: '낮은 두 줄 블록 뒤 탈취 한 번에 찌른다',
    wingplay: '풀백·윙백이 터치라인을 타고 박스까지 올라간다',
    hybrid3241: '공격 시 3-2-4-1로 변형되는 가변 빌드업',
    direct: '중원을 건너뛰는 직선 롱볼',
    balanced: '라인과 간격을 지키며 상황에 맞춰 전환한다'
  };
  DS.scoutReport = function (opt) {
    opt = opt || {};
    var key = opt.formation || '4-4-2';
    var f = FORMATIONS[key] || FORMATIONS['4-4-2'];
    var st = TACTIC_STYLES[opt.style] || TACTIC_STYLES.balanced;
    var players = opt.players || [];
    var slots = f.slots || [];
    var lanes = { left: 0, center: 0, right: 0 };
    var i, s, x, w, g, p, ovr, threat, side, x2;
    for (i = 0; i < slots.length; i++) {
      s = slots[i];
      if (s.pos === 'GK') { continue; }
      g = posGroup(s.pos);
      w = g === 'FW' ? 3 : (g === 'MF' ? 1.5 : 0.45);
      x = s.x;
      if (x < 34) { lanes.left += w; } else if (x > 66) { lanes.right += w; } else { lanes.center += w; }
    }
    /* 감독 철학 보정 — 측면형은 좌우, 중앙 점유형은 중앙으로 무게가 실린다 */
    if (st.width > 6) { lanes.left *= 1 + st.width / 90; lanes.right *= 1 + st.width / 90; }
    if (st.crossBias > 1.5) { lanes.left *= 1.12; lanes.right *= 1.12; }
    if (st.key === 'tikitaka' || st.key === 'hybrid3241') { lanes.center *= 1.22; }
    var total = lanes.left + lanes.center + lanes.right || 1;
    var share = {
      left: Math.round(lanes.left / total * 100),
      center: Math.round(lanes.center / total * 100),
      right: Math.round(lanes.right / total * 100)
    };
    var main = 'center';
    if (share.right > share.center && share.right >= share.left) { main = 'right'; }
    else if (share.left > share.center && share.left > share.right) { main = 'left'; }
    /* 위험 선수 — OVR · 공격 지표 · 전방 가중치 순 */
    var cand = [];
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (!p || p.pos === 'GK') { continue; }
      ovr = ratingOf(p);
      x2 = i < slots.length ? slots[i].x : 50;
      side = x2 < 34 ? 'left' : (x2 > 66 ? 'right' : 'center');
      g = posGroup(p.pos);
      threat = ovr + (g === 'FW' ? 11 : (g === 'MF' ? 6 : 0)) + ((p.stats && p.stats.atk) ? p.stats.atk * 0.14 : 0);
      cand.push({
        name: p.name, pos: p.pos, foot: p.foot || '', role: p.role || '',
        ovr: ovr, lane: side, laneKo: LANE_KO[side], threat: Math.round(threat * 10) / 10, x: x2
      });
    }
    cand.sort(function (a, b) { return b.threat - a.threat; });
    var danger = cand.slice(0, 2);
    /* 카운터 팁 — 실제 수치에서만 나온다 */
    var tips = [];
    if (main !== 'center') {
      tips.push('상대 ' + LANE_KO[main] + ' 측면 비중 ' + share[main] + '% · ' + (main === 'left' ? '오른쪽' : '왼쪽') + ' 윙백을 내려 그쪽을 닫아라');
    } else {
      tips.push('상대 중앙 비중 ' + share.center + '% · DM 두 줄로 하프스페이스를 먼저 막아라');
    }
    if (st.counterPress >= 3) { tips.push('상대 ' + st.name + ' · 후방 짧은 패스 대신 GK 롱킥·직선 롤로 1선을 건너뛰어라'); }
    else if (st.key === 'counter') { tips.push('상대 두 줄 블록 · 라인을 올려 조르되 탈취 직후 역습 대비 2명은 남겨라'); }
    else if (st.crossBias >= 1.8) { tips.push('상대 크로스 성향 ' + st.crossBias.toFixed(1) + ' · 겹쳐 오는 풀백과 윙어의 터치라인을 먼저 지워라'); }
    else if (st.key === 'tikitaka') { tips.push('상대 짧은 패스 위주 · 지시 "압박 강도: 전방 압박"으로 후방 빌드업을 끊어라'); }
    else if (st.key === 'direct') { tips.push('상대 직선 롱볼 · 수비 라인을 내리고 세컨볼을 선점해라'); }
    else { tips.push('상대 균형형 · 초반 15분은 라인을 지키며 패턴을 읽어라'); }
    if (danger[0]) {
      tips.push('경계: ' + danger[0].name + '(' + danger[0].pos + '·' + danger[0].laneKo + '·OVR ' + danger[0].ovr + ') — ' +
        ((danger[0].pos === 'LWF' || danger[0].pos === 'RWF') ? '풀백 1:1과 안쪽 커버를 겹쳐라' : '볼을 받기 전에 몸을 붙여라'));
    }
    var press = clamp((f.metrics ? f.metrics.press : 70) + st.press, 20, 99);
    var depth = clamp((f.metrics ? f.metrics.line : 65) + st.line, 15, 99);
    return {
      formation: key, formationTag: f.tag || '', formationDesc: f.desc || '',
      styleKey: st.key, styleName: st.name, styleLine: STYLE_DESC[st.key] || STYLE_DESC.balanced, manager: opt.managerName || '',
      lanes: share, mainLane: main, mainLaneKo: LANE_KO[main],
      danger: danger, press: press, depth: depth,
      highLine: depth >= 72, lowBlock: depth <= 54,
      tips: tips.slice(0, 2)
    };
  };

  /* ─────────────────────────  현대 롤  ───────────────────────── */
  var ROLES = [
    { key: 'poacher',   name: '포처',            en: 'Poacher',        pos: ['ST', 'CF'],          need: 3, desc: '골문 앞에서만 산다. 슈팅·결정력 급상승.', gain: { atk: 7, s: 1 } },
    { key: 'false9',    name: '폴스 나인',        en: 'False 9',        pos: ['CF', 'ST', 'AM'],    need: 3, desc: '내려와서 중원을 만들고 다시 침투한다.', gain: { t: 1, atk: 4, pass: 8 } },
    { key: 'target',    name: '타겟맨',           en: 'Target Man',     pos: ['ST', 'CF'],          need: 3, desc: '공중볼과 등지는 플레이의 정점.', gain: { p: 1, atk: 5, hold: 8 } },
    { key: 'inverted',  name: '인버티드 윙어',    en: 'Inverted Winger', pos: ['LWF', 'RWF'],       need: 3, desc: '측면에서 안쪽으로 접어 들어와 슛을 노린다.', gain: { t: 1, atk: 6 } },
    { key: 'b2b',       name: '박스 투 박스',     en: 'Box to Box',     pos: ['CM', 'DM', 'AM'],    need: 3, desc: '양쪽 박스를 오가는 엔진.', gain: { p: 1, s: 1, atk: 2, def: 3 } },
    { key: 'regista',   name: '레지스타',         en: 'Regista',        pos: ['DM', 'CM'],          need: 3, desc: '경기의 템포를 혼자서 지휘한다.', gain: { t: 1, pass: 10 } },
    { key: 'mezzala',   name: '메짤라',           en: 'Mezzala',        pos: ['CM', 'AM'],          need: 4, desc: '하프스페이스로 흘러들어 수적 우위를 만든다.', gain: { t: 1, s: 1, atk: 3 } },
    { key: 'bpd',       name: '볼플레잉 수비수',  en: 'Ball-Playing CB', pos: ['CB'],               need: 3, desc: '후방에서 빌드업을 시작하는 수비수.', gain: { t: 1, pass: 8, def: 3 } },
    { key: 'ifb',       name: '인버티드 풀백',    en: 'Inverted Full-back', pos: ['LB', 'RB', 'LWB', 'RWB'], need: 4, desc: '중원으로 접혀 들어와 수적 우위를 만든다.', gain: { t: 1, def: 3, pass: 5 } },
    { key: 'wingback',  name: '공격형 윙백',      en: 'Attacking Wing-back', pos: ['LWB', 'RWB', 'LB', 'RB'], need: 3, desc: '터치라인을 따라 끝까지 올라간다.', gain: { s: 1, atk: 4, pass: 4 } },
    { key: 'sweeper',   name: '스위퍼 키퍼',      en: 'Sweeper Keeper', pos: ['GK'],                need: 3, desc: '수비 라인 뒤를 쓸어담고 발밑으로도 시작한다.', gain: { s: 2, pass: 8, def: 4 } }
  ];
  DS.ROLES = ROLES;
  DS.roleOf = function (key) {
    var i;
    for (i = 0; i < ROLES.length; i++) { if (ROLES[i].key === key) { return ROLES[i]; } }
    return null;
  };
  DS.rolesFor = function (pos) {
    var out = [], i;
    for (i = 0; i < ROLES.length; i++) { if (ROLES[i].pos.indexOf(pos) >= 0) { out.push(ROLES[i]); } }
    return out;
  };

  /* ─────────────────────────  라커룸 성향  ───────────────────────── */
  var LOCKER = [
    { key: 'fight', name: '승부욕', color: '#e2553f', desc: '지는 순간을 견디지 못한다. 추격·결승 골 확률 상승.' },
    { key: 'crea',  name: '창의',   color: '#8a5cd6', desc: '예측 불가한 발상. 패스·찬스 창출 상승.' },
    { key: 'dev',   name: '헌신',   color: '#2f8f62', desc: '몸을 아끼지 않는다. 압박·태클·체력 유지 상승.' },
    { key: 'calm',  name: '냉정',   color: '#3f7fb8', desc: '흔들리지 않는다. 실점 후 집중력·수비 안정 상승.' }
  ];
  DS.LOCKER = LOCKER;
  DS.lockOf = function (key) {
    var i;
    for (i = 0; i < LOCKER.length; i++) { if (LOCKER[i].key === key) { return LOCKER[i]; } }
    return LOCKER[0];
  };
  /* 성향 시너지: 같은 성향 3명 이상이면 발동 */
  DS.lockSynergy = function (list) {
    var cnt = {}, i, k, out = [];
    for (i = 0; i < LOCKER.length; i++) { cnt[LOCKER[i].key] = 0; }
    for (i = 0; i < list.length; i++) { if (list[i] && list[i].lock) { cnt[list[i].lock] = (cnt[list[i].lock] || 0) + 1; } }
    for (i = 0; i < LOCKER.length; i++) {
      k = LOCKER[i].key;
      if (cnt[k] >= 3) {
        out.push({
          key: k, name: LOCKER[i].name, count: cnt[k],
          tier: cnt[k] >= 5 ? 2 : 1,
          value: cnt[k] >= 5 ? 6 : 3
        });
      }
    }
    return out;
  };

  /* ─────────────────────────  전술 카드  ───────────────────────── */
  /* cost: 모멘텀 소모, dur: 지속 초(경기 내부 시간) */
  var CARDS = [
    { key: 'gegen',    name: '게겐프레싱',      en: 'GEGENPRESS',  tag: '압박', icon: 'press',
      cost: 34, dur: 22, color: '#e2553f',
      desc: '전원이 앞으로 나가 6초 안에 공을 되찾는다. 태클 성공률 · 상대 패스 실패율 급증.', fx: 'press' },
    { key: 'halfspace', name: '하프스페이스 침투', en: 'HALF-SPACE', tag: '공격', icon: 'run',
      cost: 30, dur: 20, color: '#8a5cd6',
      desc: '윙어가 안쪽으로 접어 들어가 수비 라인 사이로 침투한다. 슈팅 정확도 상승.', fx: 'atk' },
    { key: 'isolate',  name: '원톱 고립 차단',   en: 'ISOLATE',     tag: '수비', icon: 'shield',
      cost: 28, dur: 24, color: '#3f7fb8',
      desc: '상대 최전방을 고립시켜 지원을 끊는다. 상대 공격 전개력 하락.', fx: 'def' },
    { key: 'build',    name: '골키퍼 빌드업',    en: 'BUILD-UP',    tag: '전개', icon: 'boot',
      cost: 22, dur: 26, color: '#2f8f62',
      desc: '골키퍼가 짧게 시작해 수적 우위를 만든다. 점유율 · 패스 성공률 상승.', fx: 'build' },
    { key: 'joker',    name: '조커 타임',        en: 'JOKER TIME',  tag: '템포', icon: 'zap',
      cost: 26, dur: 18, color: '#e8a33a',
      desc: '교체 선수와 함께 템포를 끌어올린다. 전 선수 이동 속도 상승.', fx: 'tempo' },
    { key: 'setpiece', name: '세트피스 트릭',    en: 'SET PIECE',   tag: '세트피스', icon: 'flag',
      cost: 32, dur: 8,  color: '#b662c9',
      desc: '연습한 세트피스 패턴으로 결정적 한 번을 만든다. 즉시 고확률 슈팅.', fx: 'setpiece' },
    { key: 'linebreak', name: '라인 브레이크',   en: 'LINE BREAK',  tag: '공격', icon: 'arrow',
      cost: 30, dur: 20, color: '#4aa8e0',
      desc: '수비 라인 뒤 공간으로 스루패스를 찔러 넣는다. 결정적 패스 확률 상승.', fx: 'through' },
    { key: 'trigger',  name: '압박 트리거',      en: 'PRESS TRIGGER', tag: '압박', icon: 'target',
      cost: 24, dur: 16, color: '#c8c23a',
      desc: '백패스 순간을 신호로 전방 압박을 시작한다. 즉시 태클 2회 보장.', fx: 'trigger' },
    { key: 'tikitaka', name: '티키타카 원투패스', en: 'TIKI-TAKA',    tag: '전개', icon: 'pass',
      cost: 24, dur: 20, color: '#38a86b',
      desc: '짧은 원투패스로 상대를 벗겨낸다. 패스 속도·성공률 상승, 모멘텀 회복 증가.', fx: 'tiki' },
    { key: 'offside',  name: '오프사이드 트랩',  en: 'OFFSIDE TRAP', tag: '수비', icon: 'flag',
      cost: 26, dur: 16, color: '#2f7fb8',
      desc: '수비 라인이 동시에 전진해 상대 침투를 오프사이드로 잡아낸다.', fx: 'offside' },
    { key: 'longshot', name: '중거리 대포알 슛', en: 'LONG RANGE',  tag: '공격', icon: 'bolt',
      cost: 30, dur: 18, color: '#d2691e',
      desc: '박스 밖에서도 과감하게 때린다. 슈팅 사거리·정확도가 크게 올라간다.', fx: 'longshot' },
    { key: 'roar',     name: '라커룸 일갈',      en: 'TEAM TALK',   tag: '템포', icon: 'shout',
      cost: 20, dur: 12, color: '#c8a83a',
      desc: '벤치의 일갈로 전 선수가 달아오른다. 즉시 모멘텀 회복 + 전원 스피드 상승.', fx: 'roar' }
  ];
  DS.CARDS = CARDS;
  DS.cardOf = function (key) {
    var i;
    for (i = 0; i < CARDS.length; i++) { if (CARDS[i].key === key) { return CARDS[i]; } }
    return null;
  };
  DS.DEFAULT_DECK = ['gegen', 'halfspace', 'isolate', 'build', 'tikitaka', 'longshot'];

  /* ─────────────────────────  감독 특기 (버프 8종)  ───────────────────────── */
  /* v: 특기 레벨(2~8) — 수치 효과는 이 값을 기준으로 환산한다 */
  var MANAGER_TRAITS = {
    org:   { key: 'org',   name: '조직력 업',  icon: '🤝', color: '#2f8f62',
      desc: '패스 연계와 오프더볼 위치 선정이 좋아집니다.', mark: 'ORG' },
    atk:   { key: 'atk',   name: '공격 업',    icon: '⚡', color: '#d1482f',
      desc: '공격 전개가 빨라지고 슈팅 기회가 늘어납니다.', mark: 'ATK' },
    def:   { key: 'def',   name: '수비 업',    icon: '🛡️', color: '#3f7fb8',
      desc: '수비 라인이 촘촘해지고 상대 슈팅 확률이 줄어듭니다.', mark: 'DEF' },
    pass:  { key: 'pass',  name: '패스율 업',  icon: '🔁', color: '#38a86b',
      desc: '패스 성공률이 오르고 패스가 발밑에 붙습니다.', mark: 'PAS' },
    shoot: { key: 'shoot', name: '슛 업',      icon: '🎯', color: '#c1911b',
      desc: '슈팅 정확도와 결정력이 오릅니다.', mark: 'SHT' },
    jump:  { key: 'jump',  name: '점프볼 업',  icon: '🙌', color: '#8a5cd6',
      desc: '코너킥·크로스 공중볼 경합과 헤딩 슛이 강해집니다.', mark: 'JMP' },
    press: { key: 'press', name: '압박 업',    icon: '🔥', color: '#e2553f',
      desc: '전방 압박 강도와 태클 성공률이 오릅니다.', mark: 'PRS' },
    speed: { key: 'speed', name: '스피드 업',  icon: '💨', color: '#4aa8e0',
      desc: '전 선수 발이 빨라져 역습과 수비 복귀가 좋아집니다.', mark: 'SPD' }
  };
  var MANAGER_TRAIT_LIST = ['org', 'atk', 'def', 'pass', 'shoot', 'jump', 'press', 'speed'];
  DS.MANAGER_TRAITS = MANAGER_TRAITS;
  DS.MANAGER_TRAIT_LIST = MANAGER_TRAIT_LIST;
  DS.managerTrait = function (key) { return MANAGER_TRAITS[key] || MANAGER_TRAITS.org; };

  /* ─────────────────────────  감독 32명 (100% 가상 창작)  ───────────────────────── */
  /* rarity: 동/은/금/전설 · formation: 고유 포메이션 · alt: 두 번째 포메이션
     tacticStyle: 전술 철학(경기 엔진이 실제 좌표·패스·압박을 바꾼다) · tacticLine: 1줄 전술 특징 · traits: 특기 1~2종 */
  var MANAGERS = [
    /* ── 동급 8명 ── */
    { id: 'm01', name: '김두식',  age: 58, rarity: 'dong', formation: '4-4-2', alt: '4-1-3-2', tacticStyle: 'balanced',
      tacticLine: '간격과 기본기 — 화려함 없이 4-4-2 균형을 지킨다',
      style: '무명의 장인', story: '동네 체육관에서 30년을 가르친 지도자. 화려함보다 기본기를 믿고, 매일 같은 훈련을 반복시킨다.',
      traits: [{ k: 'org', v: 3 }] },
    { id: 'm02', name: '나승표',  age: 47, rarity: 'dong', formation: '4-1-4-1', alt: '5-2-2-1', tacticStyle: 'counter',
      tacticLine: '홀딩이 내려앉아 두 줄 블록, 탈취 후 한 번에 전진',
      style: '짜임새 수비', story: '선수 시절 수비형 미드필더. 실점을 줄이는 재주 하나로 지도자 자리를 지켜 왔다.',
      traits: [{ k: 'def', v: 3 }] },
    { id: 'm03', name: '문태산',  age: 52, rarity: 'dong', formation: '3-5-2', alt: '3-3-1-3', tacticStyle: 'gegenpress',
      tacticLine: '산악 훈련으로 만든 체력 — 전방에서부터 물고 늘어진다',
      style: '산골 압박', story: '산악 마라톤 출신. 체력 훈련 하나는 누구에게도 지지 않는다고 자부한다.',
      traits: [{ k: 'press', v: 3 }] },
    { id: 'm04', name: '서을녀',  age: 44, rarity: 'dong', formation: '4-3-3', alt: '3-2-4-1', tacticStyle: 'tikitaka',
      tacticLine: '짧은 패스 백 번 — 삼각 간격을 좁혀 점유로 조른다',
      style: '기본기 신봉자', story: '여자 실업 리그에서 잔뼈가 굵은 지도자. 짧은 패스 하나를 백 번 다시 시킨다.',
      traits: [{ k: 'pass', v: 3 }] },
    { id: 'm05', name: '하동철',  age: 55, rarity: 'dong', formation: '5-3-2', alt: '3-4-1-2', tacticStyle: 'direct',
      tacticLine: '공중볼 장인 — 롱볼과 크로스로 머리 싸움을 건다',
      style: '공중볼 장인', story: '장신 센터백 출신. 코너킥 Situation만 따로 연구하는 별난 지도자.',
      traits: [{ k: 'jump', v: 3 }] },
    { id: 'm06', name: '고만복',  age: 61, rarity: 'dong', formation: '4-2-2-2', alt: '4-2-4', tacticStyle: 'direct',
      tacticLine: '두 줄로 나란히 밀어붙이는 직선 축구',
      style: '두 줄 공격', story: '두 줄로 나란히 서서 밀어붙이는 단순한 축구를 고집한다. 그런데 자주 통한다.',
      traits: [{ k: 'atk', v: 3 }] },
    { id: 'm07', name: '진선우',  age: 39, rarity: 'dong', formation: '4-2-3-1', alt: '3-3-1-3', tacticStyle: 'gegenpress',
      tacticLine: '벤치에서 제일 크게 소리치며 전원 압박을 지시한다',
      style: '젊은 열정', story: '은퇴 3년 차 초보 감독. 벤치에서 제일 크게 소리치고, 선수들과 같이 뛴다.',
      traits: [{ k: 'speed', v: 3 }] },
    { id: 'm08', name: '임복순',  age: 49, rarity: 'dong', formation: '4-4-2', alt: '4-2-4', tacticStyle: 'wingplay',
      tacticLine: '측면에서 올려주고 골문 앞에서 마무리 — 크로스 축구',
      style: '슛 하나만', story: '골문 앞에서의 결정력만 파고드는 지도자. 연습장에 골대를 세 개나 세워 놨다.',
      traits: [{ k: 'shoot', v: 3 }] },
    /* ── 은급 10명 ── */
    { id: 'm09', name: '백인호',  age: 43, rarity: 'eun', formation: '4-2-3-1', alt: '3-2-4-1', tacticStyle: 'gegenpress',
      tacticLine: '구역별 압박 타이밍 도면 — 잃으면 3명이 동시에 덮친다',
      style: '구역 압박 설계자', story: '구역별 압박 타이밍을 도면에 그려 지시하는 지도자. 선수들은 그 도면을 외우고 뛴다.',
      traits: [{ k: 'org', v: 4 }, { k: 'press', v: 3 }] },
    { id: 'm10', name: '오달수',  age: 50, rarity: 'eun', formation: '4-1-3-2', alt: '4-4-2', tacticStyle: 'counter',
      tacticLine: '두 공격수의 움직임을 반대로 엮는 투톱 다이아 역습',
      style: '투톱 연출가', story: '두 공격수의 움직임을 서로 반대로 엮는 데 열광한다. 수비수들은 늘 헷갈린다.',
      traits: [{ k: 'atk', v: 4 }, { k: 'shoot', v: 3 }] },
    { id: 'm11', name: '차민서',  age: 37, rarity: 'eun', formation: '4-3-3', alt: '4-1-3-2', tacticStyle: 'tikitaka',
      tacticLine: '한 번의 패스로 라인을 가르는 전방 다이아 점유',
      style: '패스 마에스트로', story: '한 번의 패스로 수비 라인을 가르는 그림을 머릿속에 그리고 지시한다.',
      traits: [{ k: 'pass', v: 4 }, { k: 'org', v: 3 }] },
    { id: 'm12', name: '노경필',  age: 54, rarity: 'eun', formation: '5-3-2', alt: '5-2-2-1', tacticStyle: 'counter',
      tacticLine: '골문 앞 다섯 명 — 로우 블록 후 한 번의 역습',
      style: '철벽 스리백', story: '스리백을 두 줄의 벽으로 만든다. “안 넣기면 이긴다”가 좌우명이다.',
      traits: [{ k: 'def', v: 4 }, { k: 'jump', v: 3 }] },
    { id: 'm13', name: '문정아',  age: 41, rarity: 'eun', formation: '3-4-2-1', alt: '3-2-4-1', tacticStyle: 'wingplay',
      tacticLine: '윙백을 미드필더처럼 — 측면 한 번 뚫리면 끝장',
      style: '측면 질주', story: '윙백을 미드필더처럼 쓰는 지도자. 측면 한 번 뚫리면 그것으로 끝장을 본다.',
      traits: [{ k: 'speed', v: 4 }, { k: 'pass', v: 3 }] },
    { id: 'm14', name: '서강토',  age: 46, rarity: 'eun', formation: '3-5-2', alt: '3-3-1-3', tacticStyle: 'wingplay',
      tacticLine: '크로스 3천 개의 감각 — 측면 공중볼 지배',
      style: '공중전 지배자', story: '크로스만 3천 개를 올려 보고 감각을 잡은 지도자. 공중볼 경합은 그의 영지다.',
      traits: [{ k: 'jump', v: 4 }, { k: 'press', v: 3 }] },
    { id: 'm15', name: '이완수',  age: 62, rarity: 'eun', formation: '3-4-1-2', alt: '4-1-4-1', tacticStyle: 'tikitaka',
      tacticLine: '두 명의 6번이 균형을 잡고 짧게 돌리는 고전 점유',
      style: '홀딩의 미학', story: '한 명의 홀딩 미드필더가 전체 균형을 잡게 만드는 고전파 지도자.',
      traits: [{ k: 'org', v: 4 }, { k: 'def', v: 3 }] },
    { id: 'm16', name: '한지예',  age: 35, rarity: 'eun', formation: '3-2-4-1', alt: '4-2-2-2', tacticStyle: 'hybrid3241',
      tacticLine: '공격 시 DM·풀백이 중앙 4각으로 — 박스 침투 6경로',
      style: '박스 침투 요원', story: '박스 안으로 들어가는 경로를 여섯 가지로 나눠 훈련시키는 신세대 지도자.',
      traits: [{ k: 'shoot', v: 4 }, { k: 'atk', v: 3 }] },
    { id: 'm17', name: '최돌이',  age: 57, rarity: 'eun', formation: '4-2-3-1', alt: '3-3-1-3', tacticStyle: 'gegenpress',
      tacticLine: '백패스가 나오면 벤치가 먼저 뛰어나온다 — 압박 교본',
      style: '전방 압박 교본', story: '상대 후방 빌드업을 읽는 눈이 남다르다. 백패스가 나오면 벤치가 먼저 뛰어나온다.',
      traits: [{ k: 'press', v: 4 }, { k: 'speed', v: 3 }] },
    { id: 'm18', name: '석민관',  age: 48, rarity: 'eun', formation: '4-4-2', alt: '4-1-3-2', tacticStyle: 'tikitaka',
      tacticLine: '두 번 터치하면 벌점 — 원터치로 경기를 누른다',
      style: '원터치 축구', story: '두 번 터치하면 벌점을 주는 훈련을 한다. 패스 속도로 경기를 눌러 버린다.',
      traits: [{ k: 'pass', v: 4 }, { k: 'shoot', v: 3 }] },
    /* ── 금급 9명 ── */
    { id: 'm19', name: '강태오',  age: 45, rarity: 'geum', formation: '4-2-3-1', alt: '3-3-1-3', tacticStyle: 'gegenpress',
      tacticLine: '잃으면 3초 안에 되찾는다 — 게겐프레싱 전도사',
      style: '게겐프레싱 전도사', story: '독일어 교재를 스스로 번역해 훈련에 적용한 지도자. 잃으면 3초 안에 되찾는다.',
      traits: [{ k: 'org', v: 6 }, { k: 'press', v: 5 }] },
    { id: 'm20', name: '백만호',  age: 52, rarity: 'geum', formation: '4-2-4', alt: '4-4-2', tacticStyle: 'direct',
      tacticLine: '윙 2 + 투톱으로 골문을 향해 곧장 — 득점 설계사',
      style: '득점 설계사', story: '리그 득점 1위 팀을 세 번 만들었다. 공격수의 버릇을 하루면 간파한다.',
      traits: [{ k: 'shoot', v: 6 }, { k: 'atk', v: 5 }] },
    { id: 'm21', name: '윤소라',  age: 38, rarity: 'geum', formation: '3-2-4-1', alt: '4-3-3', tacticStyle: 'hybrid3241',
      tacticLine: '짧은 패스 200개 — 공격 시 중앙 4각으로 변형되는 점유',
      style: '티키타카 사제', story: '짧은 패스 200개를 3분 안에 성공시키는 훈련을 매일 돌린다. 경기장이 연습장처럼 보인다.',
      traits: [{ k: 'pass', v: 6 }, { k: 'org', v: 5 }] },
    { id: 'm22', name: '도정한',  age: 56, rarity: 'geum', formation: '5-3-2', alt: '5-2-2-1', tacticStyle: 'counter',
      tacticLine: '골문 앞 30미터 사수 — 두 줄 블록 후 전방 롱패스',
      style: '로우 블록 장인', story: '골문 앞 30미터를 절대 내주지 않는 로우 블록의 대가. 강팀을 상대로 특히 무섭다.',
      traits: [{ k: 'def', v: 6 }, { k: 'jump', v: 5 }] },
    { id: 'm23', name: '김세비',  age: 40, rarity: 'geum', formation: '3-4-2-1', alt: '4-2-4', tacticStyle: 'wingplay',
      tacticLine: '윙백을 최전방까지 — 측면에서 수적 우위 오버래핑',
      style: '윙백 오버래핑', story: '윙백을 최전방까지 밀어 올리는 윙백 축구의 신봉자. 측면에서 수적 우위를 만든다.',
      traits: [{ k: 'speed', v: 6 }, { k: 'atk', v: 5 }] },
    { id: 'm24', name: '마재운',  age: 49, rarity: 'geum', formation: '3-5-2', alt: '5-2-2-1', tacticStyle: 'wingplay',
      tacticLine: '장신 자원 + 코너킥 제국 — 크로스와 세트피스',
      style: '공중볼 제국', story: '장신 자원을 모아 세트피스 제국을 세웠다. 코너킥 한 번이 곧 득점 기회다.',
      traits: [{ k: 'jump', v: 6 }, { k: 'press', v: 5 }] },
    { id: 'm25', name: '성민규',  age: 43, rarity: 'geum', formation: '3-4-1-2', alt: '4-1-4-1', tacticStyle: 'balanced',
      tacticLine: '더블 볼란테로 균형 — 절반씩 바꿔도 흔들리지 않는다',
      style: '균형의 귀재', story: '경기마다 전술을 절반씩 바꿔도 흔들리지 않는 팀을 만든다. 균형 자체가 무기다.',
      traits: [{ k: 'def', v: 6 }, { k: 'org', v: 5 }] },
    { id: 'm26', name: '우지환',  age: 51, rarity: 'geum', formation: '4-2-2-2', alt: '4-1-3-2', tacticStyle: 'hybrid3241',
      tacticLine: '되살린 2-2 배열 — 하프스페이스에서 숫자로 누른다',
      style: '투톱 투메짤라', story: '없어진 줄 알았던 2-2 배열을 되살린 지도자. 중원에서 숫자로 눌러 버린다.',
      traits: [{ k: 'atk', v: 6 }, { k: 'shoot', v: 5 }] },
    { id: 'm27', name: '남궁혁',  age: 47, rarity: 'geum', formation: '3-3-1-3', alt: '4-2-4', tacticStyle: 'gegenpress',
      tacticLine: '전반 15분에 끝내는 3명 최전방 압박 — 미친 압박',
      style: '미친 압박', story: '전반 15분에 경기를 끝내는 압박 축구. 후반 체력은 그의 유일한 약점이다.',
      traits: [{ k: 'press', v: 6 }, { k: 'speed', v: 5 }] },
    /* ── 전설 5명 ── */
    { id: 'm28', name: '조영광',  age: 63, rarity: 'legend', formation: '4-3-3', alt: '3-2-4-1', tacticStyle: 'tikitaka',
      tacticLine: '패스 성공률 20년 1위 — 공이 발에 붙어 도는 점유',
      style: '패스의 신', story: '리그 통산 패스 성공률 1위를 20년째 지키는 전설. 그의 팀은 공이 발에 붙어 다닌다.',
      traits: [{ k: 'pass', v: 8 }, { k: 'org', v: 7 }] },
    { id: 'm29', name: '하태봉',  age: 59, rarity: 'legend', formation: '5-2-2-1', alt: '5-3-2', tacticStyle: 'counter',
      tacticLine: '한 시즌 최소 실점 — 다섯 수비 두 줄 블록',
      style: '철벽의 전설', story: '한 시즌 최소 실점 기록을 세운 지도자. 상대 공격수들이 그 앞에서 작아진다.',
      traits: [{ k: 'def', v: 8 }, { k: 'jump', v: 7 }] },
    { id: 'm30', name: '유일한',  age: 55, rarity: 'legend', formation: '4-2-4', alt: '4-3-3', tacticStyle: 'direct',
      tacticLine: '찬스 한 번을 놓치지 않는 직선 초공격',
      style: '결정력의 화신', story: '슛 하나로 경기를 뒤집는 법을 아는 지도자. 찬스가 오면 절대 놓치지 않는 팀을 만든다.',
      traits: [{ k: 'shoot', v: 8 }, { k: 'atk', v: 7 }] },
    { id: 'm31', name: '문세진',  age: 46, rarity: 'legend', formation: '3-4-2-1', alt: '3-3-1-3', tacticStyle: 'wingplay',
      tacticLine: '손짓 한 번에 라인이 30미터 — 폭풍 윙백',
      style: '폭풍의 지휘자', story: '경기장을 세로로 찢는 윙백 축구의 완성자. 벤치에서 손짓 한 번이면 라인이 30미터 올라간다.',
      traits: [{ k: 'speed', v: 8 }, { k: 'press', v: 7 }] },
    { id: 'm32', name: '배영달',  age: 66, rarity: 'legend', formation: '4-4-2', alt: '4-1-4-1', tacticStyle: 'balanced',
      tacticLine: '무패 우승 두 번 — 화려함 없이 이기는 균형',
      style: '무패의 설계자', story: '한 시즌 무패 우승을 두 번 달성한 원로. 화려함 없이도 이기는 법을 안다.',
      traits: [{ k: 'org', v: 8 }, { k: 'jump', v: 7 }] },
    /* ── v21 — 50명으로 확장 (동 5 · 은 6 · 금 5 · 전설 2) ── */
    { id: 'm33', name: '구본재',  age: 51, rarity: 'dong', formation: '4-4-2', alt: '4-2-3-1', tacticStyle: 'balanced',
      tacticLine: '두 줄 간격만 지켜도 절반은 이긴다',
      style: '간격의 신앙', story: '지방 구단에서 20년을 버틴 베테랑. 화려한 전술보다 줄 간격 하나를 끝까지 다듬는다.',
      traits: [{ k: 'org', v: 3 }] },
    { id: 'm34', name: '탁영수',  age: 46, rarity: 'dong', formation: '4-1-4-1', alt: '3-5-2', tacticStyle: 'counter',
      tacticLine: '내려서 기다리다 한 번에 뒤집는다',
      style: '한 방의 사냥꾼', story: '강팀 상대로 유독 강한 지도자. “먼저 넣지 말고 먼저 버텨라”가 지론이다.',
      traits: [{ k: 'def', v: 3 }] },
    { id: 'm35', name: '편다인',  age: 38, rarity: 'dong', formation: '3-5-2', alt: '3-3-1-3', tacticStyle: 'gegenpress',
      tacticLine: '전방에서부터 세 명이 물고 늘어진다',
      style: '물고 늘어지기', story: '선수 시절 압박 하나로 이름을 남긴 지도자. 후반 체력 관리가 숙제다.',
      traits: [{ k: 'press', v: 3 }] },
    { id: 'm36', name: '허문자',  age: 57, rarity: 'dong', formation: '4-3-3', alt: '4-1-3-2', tacticStyle: 'tikitaka',
      tacticLine: '짧게 주고 짧게 받는다 — 점유가 곧 수비',
      style: '점유의 장인', story: '패스 하나를 백 번 반복시키는 지도자. 선수들은 지루해도 결과는 따른다.',
      traits: [{ k: 'pass', v: 3 }] },
    { id: 'm37', name: '길상호',  age: 60, rarity: 'dong', formation: '5-3-2', alt: '5-2-2-1', tacticStyle: 'direct',
      tacticLine: '크게 걷어내고 머리로 싸운다',
      style: '공중볼 노장', story: '장신 자원을 모으는 재주가 있다. 세트피스 한 번에 경기를 가져간다.',
      traits: [{ k: 'jump', v: 3 }] },
    { id: 'm38', name: '채유진',  age: 42, rarity: 'eun', formation: '4-2-3-1', alt: '3-2-4-1', tacticStyle: 'hybrid3241',
      tacticLine: '공격 시 3-2-4-1로 늘어나 중앙을 점령한다',
      style: '가변의 설계자', story: '수비와 공격의 모양을 완전히 바꿔 쓰는 신세대 지도자. 판독이 어렵다.',
      traits: [{ k: 'org', v: 4 }, { k: 'pass', v: 3 }] },
    { id: 'm39', name: '오현우',  age: 49, rarity: 'eun', formation: '4-4-2', alt: '4-2-4', tacticStyle: 'wingplay',
      tacticLine: '터치라인 끝까지 붙잡고 크로스를 올린다',
      style: '측면 고집', story: '측면 한 줄만 파는 지도자. 상대가 알면서도 막기 어렵다는 평가를 받는다.',
      traits: [{ k: 'speed', v: 4 }, { k: 'atk', v: 3 }] },
    { id: 'm40', name: '진하람',  age: 36, rarity: 'eun', formation: '3-4-1-2', alt: '4-1-4-1', tacticStyle: 'tikitaka',
      tacticLine: '더블 볼란테로 중원을 잠그고 짧게 돌린다',
      style: '중원 잠금', story: '두 명의 6번으로 중원을 잠그는 축구를 한다. 경기 템포가 늘 같다.',
      traits: [{ k: 'pass', v: 4 }, { k: 'def', v: 3 }] },
    { id: 'm41', name: '표강일',  age: 53, rarity: 'eun', formation: '4-1-3-2', alt: '3-3-1-3', tacticStyle: 'direct',
      tacticLine: '투톱에게 곧장 넣고 두 번째 공을 노린다',
      style: '투톱 직선', story: '투톱의 몸싸움을 믿는 지도자. 두 번째 공을 잡는 자리가 곧 득점이다.',
      traits: [{ k: 'jump', v: 4 }, { k: 'atk', v: 3 }] },
    { id: 'm42', name: '남기범',  age: 44, rarity: 'eun', formation: '3-4-2-1', alt: '4-3-3', tacticStyle: 'counter',
      tacticLine: '스리백 두 줄 뒤에서 역습 한 번',
      style: '카운터 장인', story: '수비 숫자를 늘려 놓고 역습 타이밍만 노린다. 강팀일수록 잘 통한다.',
      traits: [{ k: 'def', v: 4 }, { k: 'speed', v: 3 }] },
    { id: 'm43', name: '서정후',  age: 47, rarity: 'eun', formation: '4-2-2-2', alt: '4-2-3-1', tacticStyle: 'gegenpress',
      tacticLine: '하프스페이스에서 숫자로 눌러 탈취한다',
      style: '하프스페이스 압박', story: '중앙 두 칸을 숫자로 채워 압박하는 지도자. 볼을 뺏는 위치가 늘 좋다.',
      traits: [{ k: 'press', v: 4 }, { k: 'org', v: 3 }] },
    { id: 'm44', name: '권태산',  age: 54, rarity: 'geum', formation: '4-3-3', alt: '4-2-3-1', tacticStyle: 'wingplay',
      tacticLine: '윙어를 최전방에 붙이고 윙백이 그 뒤를 채운다',
      style: '측면 수적 우위', story: '측면 두 줄로 수적 우위를 만드는 데 집착한다. 크로스 숫자가 리그 1위다.',
      traits: [{ k: 'speed', v: 6 }, { k: 'atk', v: 5 }] },
    { id: 'm45', name: '천지안',  age: 41, rarity: 'geum', formation: '3-2-4-1', alt: '3-4-1-2', tacticStyle: 'hybrid3241',
      tacticLine: '박스 미드필더 4각 — 침투 경로를 미리 그려 둔다',
      style: '경로 설계자', story: '박스로 들어가는 경로를 도면처럼 그려 훈련시키는 지도자. 상대는 늘 한 발 늦다.',
      traits: [{ k: 'atk', v: 6 }, { k: 'org', v: 5 }] },
    { id: 'm46', name: '하윤슬',  age: 39, rarity: 'geum', formation: '4-1-3-2', alt: '4-4-2', tacticStyle: 'tikitaka',
      tacticLine: '전방 다이아로 라인 사이를 계속 흔든다',
      style: '라인 사이의 마법사', story: '라인 사이 공간을 쓰는 법을 선수들에게 각인시키는 지도자. 패스 각이 남다르다.',
      traits: [{ k: 'pass', v: 6 }, { k: 'atk', v: 5 }] },
    { id: 'm47', name: '고강민',  age: 50, rarity: 'geum', formation: '5-2-2-1', alt: '5-3-2', tacticStyle: 'counter',
      tacticLine: '다섯 수비로 잠그고 두 명의 10번으로 역습',
      style: '철벽 역습', story: '실점을 극도로 싫어하는 지도자. 한 시즌 최소 실점 기록을 노린다.',
      traits: [{ k: 'def', v: 6 }, { k: 'speed', v: 5 }] },
    { id: 'm48', name: '유시온',  age: 43, rarity: 'geum', formation: '4-2-4', alt: '3-3-1-3', tacticStyle: 'direct',
      tacticLine: '윙 2 + 투톱 — 골문을 향해 곧장 밀어붙인다',
      style: '화력 집중', story: '공격 숫자를 최대로 올려 상대를 눌러 버린다. 수비 불안은 득점으로 메운다.',
      traits: [{ k: 'shoot', v: 6 }, { k: 'atk', v: 5 }] },
    { id: 'm49', name: '명재현',  age: 58, rarity: 'legend', formation: '4-3-3', alt: '3-2-4-1', tacticStyle: 'tikitaka',
      tacticLine: '20년 동안 같은 축구 — 점유와 위치로 상대를 질식시킨다',
      style: '점유의 거장', story: '한 시대를 지배한 점유 축구의 거장. 그의 팀은 공을 잃는 순간이 가장 위험하다.',
      traits: [{ k: 'pass', v: 8 }, { k: 'org', v: 7 }] },
    { id: 'm50', name: '백서진',  age: 62, rarity: 'legend', formation: '3-4-2-1', alt: '4-2-3-1', tacticStyle: 'gegenpress',
      tacticLine: '잃으면 6초 안에 되찾는다 — 압박의 교과서',
      style: '압박의 교과서', story: '압박 축구를 리그의 표준으로 만든 지도자. 그의 팀을 상대로는 빌드업이 곧 위험이다.',
      traits: [{ k: 'press', v: 8 }, { k: 'speed', v: 7 }] }
  ];

  /* 감독이 보유한 변칙 포메이션 (고유 + 두 번째) — 마이팀에서 선택 가능 */
  DS.managerAnomalies = function (m) {
    var out = [], i, k;
    if (!m) { return out; }
    var keys = [m.formation, m.alt];
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (k && DS.isAnomaly(k) && out.indexOf(k) < 0) { out.push(k); }
    }
    return out;
  };
  DS.managerFormations = function (m) {
    var out = [], i, keys;
    if (!m) { return out; }
    keys = [m.formation, m.alt];
    for (i = 0; i < keys.length; i++) { if (keys[i] && DS.FORMATIONS[keys[i]] && out.indexOf(keys[i]) < 0) { out.push(keys[i]); } }
    return out;
  };
  DS.managerStyle = function (m) { return DS.tacticStyle(m && m.tacticStyle); };
  DS.MANAGERS = MANAGERS;
  DS.managerOf = function (id) {
    var i;
    for (i = 0; i < MANAGERS.length; i++) { if (MANAGERS[i].id === id) { return MANAGERS[i]; } }
    return MANAGERS[0];
  };
  DS.managerIndex = function (id) {
    var i;
    for (i = 0; i < MANAGERS.length; i++) { if (MANAGERS[i].id === id) { return i; } }
    return -1;
  };
  /* 영입 가격 (동/은/금/전설) */
  var MANAGER_PRICE = { dong: 1200, eun: 3200, geum: 6800, legend: 14000 };
  DS.MANAGER_PRICE = MANAGER_PRICE;
  DS.managerPrice = function (mgr) { return mgr ? (MANAGER_PRICE[mgr.rarity] || 3200) : 0; };
  /* 특기 → 경기·전력 수치 (없는 특기는 undefined → 0) */
  DS.managerFx = function (mgr) {
    var fx = {}, i, t;
    if (!mgr || !mgr.traits) { return fx; }
    for (i = 0; i < mgr.traits.length; i++) {
      t = mgr.traits[i];
      fx[t.k] = (fx[t.k] || 0) + t.v;
    }
    return fx;
  };
  /* 감독 고유 전술 → 포메이션 지표 보정 (압박/라인/폭/템포) */
  DS.managerTune = function (fx) {
    fx = fx || {};
    return {
      press: (fx.press || 0) * 1.2 - (fx.speed || 0) * 0.2,
      line: (fx.atk || 0) * 0.6 - (fx.def || 0) * 0.8 + (fx.press || 0) * 0.35,
      width: (fx.speed || 0) * 0.5 + (fx.jump || 0) * 0.25,
      tempo: (fx.speed || 0) * 0.9 + (fx.atk || 0) * 0.4
    };
  };
  DS.managerTraitText = function (mgr) {
    var out = [], i, t, d;
    if (!mgr || !mgr.traits) { return ''; }
    for (i = 0; i < mgr.traits.length; i++) {
      t = mgr.traits[i]; d = MANAGER_TRAITS[t.k];
      if (d) { out.push(d.name + ' +' + t.v); }
    }
    return out.join(' · ');
  };

  /* ─────────────────────────  이름 · 얼굴  ───────────────────────── */
  var SURNAME = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍', '유', '고', '문', '양', '손', '배', '백', '허', '남', '심', '노', '하', '곽', '성', '차', '주', '우', '구', '민', '류'];
  var GIVEN = ['도훈', '민재', '서준', '지훈', '태양', '하늘', '승우', '재민', '우빈', '건우', '현우', '정우', '시우', '태윤', '예준', '준서', '민준', '지후', '로운', '이안', '하준', '은우', '도윤', '주원', '수호', '강민', '찬영', '동현', '성민', '규현', '태민', '영호', '상현', '기범', '재혁', '승민', '다온', '한결', '우진', '시현', '진호', '범석', '경수', '동욱', '석현', '태오', '건율', '무영', '재이', '하람'];

  var HAIR_STYLE = ['short', 'buzz', 'long', 'afro', 'slick', 'twoblock', 'curly', 'ponytail', 'mohawk', 'bald'];
  var HAIR_COLOR = ['#1b1b1b', '#2b1d14', '#3d2a19', '#523218', '#6b4423', '#8a6034', '#b8874a', '#d3b98a', '#3b3f47', '#7d3b2a'];
  var SKIN_COLOR = ['#f7d3ae', '#f0c49a', '#e6b285', '#d59a6a', '#bd7f50', '#9c6238'];
  var BROW = ['thick', 'thin', 'angry', 'raised', 'flat'];
  var EYE = ['round', 'sharp', 'sleepy', 'wide', 'happy'];
  var NOSE = ['small', 'wide', 'point', 'flat'];
  var MOUTH = ['smile', 'flat', 'smirk', 'open', 'grit'];
  var BEARD = ['none', 'none', 'none', 'stubble', 'goatee', 'mustache', 'full'];
  var COLLAR = ['v', 'round', 'polo', 'v'];

  DS.NAMES = { surname: SURNAME, given: GIVEN };
  DS.FACE_OPTS = {
    hair: HAIR_STYLE, hairColor: HAIR_COLOR, skin: SKIN_COLOR,
    brow: BROW, eye: EYE, nose: NOSE, mouth: MOUTH, beard: BEARD, collar: COLLAR
  };

  /* ─────────────────────────  개성  ───────────────────────── */
  var TRAITS = [
    { key: 'clutch',   name: '승부사', val: 8, mod: {},        desc: '후반 막판에 눈빛이 달라진다.' },
    { key: 'gale',     name: '질풍',   val: 9, mod: { s: 1 },  desc: '발이 유난히 빠르다.' },
    { key: 'artist',   name: '예술가', val: 8, mod: { t: 1 },  desc: '볼 터치가 섬세하다.' },
    { key: 'spirit',   name: '투혼',   val: 7, mod: { p: 1 },  desc: '몸을 아끼지 않는다.' },
    { key: 'leader',   name: '지휘관', val: 9, mod: { cap: 2 }, desc: '동료를 이끄는 목소리.' },
    { key: 'cool',     name: '냉철',   val: 6, mod: {},        desc: '경고를 거의 받지 않는다.' },
    { key: 'odd',      name: '괴짜',   val: 7, mod: { t: 1 },  desc: '예측할 수 없는 플레이.' },
    { key: 'diligent', name: '성실',   val: 5, mod: {},        desc: '훈련 효과가 크다.' },
    { key: 'streaky',  name: '기복',   val: 4, mod: {},        desc: '컨디션에 따라 기복이 있다.' },
    { key: 'brute',    name: '폭군',   val: 6, mod: { p: 1 },  desc: '힘은 세지만 경고가 잦다.' }
  ];
  DS.TRAITS = TRAITS;
  function traitOf(key) {
    var i;
    for (i = 0; i < TRAITS.length; i++) { if (TRAITS[i].key === key) { return TRAITS[i]; } }
    return TRAITS[0];
  }
  DS.traitOf = traitOf;

  /* ─────────────────────────  리그 팀  ───────────────────────── */
  var TEAMS = [
    { id: 'byeoksan', name: '벽산 유나이티드', short: '벽산', kit: { shirt: '#2f5fa8', shorts: '#f0e6cc', trim: '#a8c4f0' }, emblem: 'bolt', strength: 72 },
    { id: 'hangang',  name: '한강 FC',        short: '한강', kit: { shirt: '#2a7a45', shorts: '#20301f', trim: '#c8ecc0' }, emblem: 'wave', strength: 69 },
    { id: 'dokdo',    name: '독도 웨일즈',    short: '독도', kit: { shirt: '#41368a', shorts: '#221e3d', trim: '#cfd0f5' }, emblem: 'wave', strength: 76 },
    { id: 'cheongchun', name: '청춘 FC',      short: '청춘', kit: { shirt: '#c85a1e', shorts: '#2b2622', trim: '#ffd8a8' }, emblem: 'flame', strength: 66 },
    { id: 'cheolma',  name: '철마 SC',        short: '철마', kit: { shirt: '#a82020', shorts: '#f2e8d2', trim: '#f0a8a8' }, emblem: 'claw', strength: 74 },
    { id: 'byeolbit', name: '별빛 레인저스',  short: '별빛', kit: { shirt: '#6a34c0', shorts: '#241634', trim: '#dcc8f8' }, emblem: 'star', strength: 71 },
    { id: 'baekho',   name: '백호 유나이티드', short: '백호', kit: { shirt: '#1b7f88', shorts: '#f2e8d2', trim: '#b0eef2' }, emblem: 'moon', strength: 68 },
    /* ── v21 — 프리미어리그 20팀 (우리 구단 + 아래 19팀) ── */
    { id: 'seorak',   name: '설악 FC',        short: '설악', kit: { shirt: '#2c6fa8', shorts: '#14202c', trim: '#bfe0ff' }, emblem: 'claw', strength: 70 },
    { id: 'haeundae', name: '해운대 웨이브',  short: '해운대', kit: { shirt: '#197f8c', shorts: '#f2e8d2', trim: '#b6f0f4' }, emblem: 'wave', strength: 67 },
    { id: 'mudeung',  name: '무등 산악',      short: '무등', kit: { shirt: '#b8461e', shorts: '#241a14', trim: '#ffcf9e' }, emblem: 'flame', strength: 65 },
    { id: 'jeonju',   name: '전주 청솔',      short: '전주', kit: { shirt: '#2f7a55', shorts: '#1b2a20', trim: '#c9f0cf' }, emblem: 'moon', strength: 73 },
    { id: 'ulsan',    name: '울산 강철',      short: '울산', kit: { shirt: '#34427e', shorts: '#1a1f30', trim: '#c8d0ff' }, emblem: 'bolt', strength: 77 },
    { id: 'suwon',    name: '수원 성곽',      short: '수원', kit: { shirt: '#8a2f3f', shorts: '#f2e8d2', trim: '#ffc8cf' }, emblem: 'crown', strength: 75 },
    { id: 'incheon',  name: '인천 항로',      short: '인천', kit: { shirt: '#1f6f9e', shorts: '#0e1e28', trim: '#a8e2ff' }, emblem: 'wave', strength: 72 },
    { id: 'daegu',    name: '대구 열매',      short: '대구', kit: { shirt: '#c07a12', shorts: '#241a10', trim: '#ffe0a8' }, emblem: 'ball', strength: 70 },
    { id: 'jeju',     name: '제주 바람',      short: '제주', kit: { shirt: '#3b8a3f', shorts: '#f2e8d2', trim: '#cff5c0' }, emblem: 'star', strength: 78 },
    { id: 'busan',    name: '부산 갈매기',    short: '부산', kit: { shirt: '#2a5f9e', shorts: '#f2e8d2', trim: '#ffe9a8' }, emblem: 'wave', strength: 79 },
    { id: 'taebaek',  name: '태백 정상',      short: '태백', kit: { shirt: '#5c6b3a', shorts: '#1d2418', trim: '#e6f0bc' }, emblem: 'claw', strength: 66 },
    { id: 'hanseong', name: '한성 레전드',    short: '한성', kit: { shirt: '#1f2430', shorts: '#c8a83a', trim: '#ffd34d' }, emblem: 'crown', strength: 92 }
  ];
  DS.TEAMS = TEAMS;

  var EMBLEMS = [
    { id: 'flame', name: '불꽃' }, { id: 'star', name: '별' },
    { id: 'bolt', name: '번개' }, { id: 'crown', name: '왕관' },
    { id: 'ball', name: '축구공' }, { id: 'wave', name: '파도' },
    { id: 'claw', name: '발톱' }, { id: 'moon', name: '달' }
  ];
  DS.EMBLEMS = EMBLEMS;

  var KIT_COLORS = ['#c8432f', '#2f5fa8', '#2a7a45', '#d08a1e', '#6a34c0', '#1b7f88', '#c03a76', '#2b2b2b', '#f0e6cc', '#7aa832'];
  DS.KIT_COLORS = KIT_COLORS;

  /* ─────────────────────────  선수 생성  ───────────────────────── */
  var USED = {};

  function randName() {
    var n = '', guard = 0;
    do { n = pick(SURNAME) + pick(GIVEN); guard++; } while (USED[n] && guard < 80);
    USED[n] = true;
    return n;
  }

  var ID_SEQ = 1;
  function newId() { return 'p' + (Date.now() % 1000000) + '_' + (ID_SEQ++); }

  /* v15 — 스카우트 확률 피라미드 (수석QA 개편안): 위 등급일수록 급격히 좁아지는 상용 모델 */
  var SCOUT_RATES = {
    normal: { dong: 0.75, eun: 0.22, geum: 0.03, legend: 0.00 },
    special: { eun: 0.79, geum: 0.20, legend: 0.01 }
  };
  DS.SCOUT_RATES = SCOUT_RATES;
  function scoutRateText(kind) {
    var t = SCOUT_RATES[kind] || SCOUT_RATES.normal;
    var keys = kind === 'normal' ? ['dong', 'eun', 'geum', 'legend'] : ['eun', 'geum', 'legend'];
    var icon = { dong: '🥉', eun: '🥈', geum: '🥇', legend: '👑' };
    var out = [], i;
    for (i = 0; i < keys.length; i++) {
      out.push(icon[keys[i]] + ' ' + RARITY[keys[i]].name + ' ' + (Math.round((t[keys[i]] || 0) * 1000) / 10) + '%');
    }
    return out.join(' · ');
  }
  DS.scoutRateText = scoutRateText;

  function pickRarity(kind) {
    if (kind === 'normal' || kind === 'special') {
      var t = SCOUT_RATES[kind];
      var keys = kind === 'normal' ? ['dong', 'eun', 'geum', 'legend'] : ['eun', 'geum', 'legend'];
      var r = Math.random(), acc = 0, i;
      for (i = 0; i < keys.length; i++) {
        acc += (t[keys[i]] || 0);
        if (r < acc) { return keys[i]; }
      }
      return kind === 'normal' ? 'dong' : 'eun';
    }
    var total = 0, k;
    for (k = 0; k < RARITY_ORDER.length; k++) { total += (5 - k) * 10; }
    var x = Math.random() * total;
    for (k = 0; k < RARITY_ORDER.length; k++) {
      x -= (5 - k) * 10;
      if (x <= 0) { return RARITY_ORDER[k]; }
    }
    return 'dong';
  }

  function makeAptitude(pos, foot) {
    var apt = {};
    var i, code, base, gp = posGroup(pos);
    for (i = 0; i < APT_LIST.length; i++) {
      code = APT_LIST[i];
      if (code === pos) { apt[code] = clamp(Math.max(7, irange(8, 9) + footAdjust(foot, code)), 1, 9); continue; }
      if (posGroup(code) === gp) { base = irange(5, 8); }
      else if (APT_NEAR[pos] && APT_NEAR[pos].indexOf(code) >= 0) { base = irange(4, 7); }
      else { base = irange(1, 4); }
      if (gp === 'GK' && code !== 'GK') { base = irange(1, 3); }
      if (code === 'GK' && gp !== 'GK') { base = irange(1, 2); }
      apt[code] = clamp(base + footAdjust(foot, code), 1, 9);
    }
    enforceFootOrder(apt, foot);
    return apt;
  }

  /* 일러스트(1~32)별 헤어 · 피부 · 유니폼 특징 — SD 스프라이트와 매칭 */
  var PIC_META = [
    null,
    { hair: 'spiky',    color: '#6b4423', skin: '#f3cba4' },
    { hair: 'spiky',    color: '#23262e', skin: '#f2c9a2' },
    { hair: 'undercut', color: '#e6cf8a', skin: '#f6d5ae' },
    { hair: 'ponytail', color: '#c4435c', skin: '#f6d2ad' },
    { hair: 'wavy',     color: '#7a4a24', skin: '#f0c49a' },
    { hair: 'mohawk',   color: '#1e2027', skin: '#eec49c' },
    { hair: 'swoop',    color: '#e3c169', skin: '#f7d7b2' },
    { hair: 'spiky',    color: '#24301f', skin: '#c9905f' },
    { hair: 'spiky',    color: '#9ec9e0', skin: '#f7d5b0' },
    { hair: 'spiky',    color: '#4a2a18', skin: '#eabf94' },
    { hair: 'silver',   color: '#cfd3d6', skin: '#f4d3ae' },
    { hair: 'ponytail', color: '#d9b06a', skin: '#f3cba2' },
    { hair: 'ponytail', color: '#5a3620', skin: '#f0c49a' },
    { hair: 'spiky',    color: '#e6e0e6', skin: '#f6d4ae' },
    { hair: 'buzz',     color: '#6a4526', skin: '#eec49c' },
    { hair: 'spiky',    color: '#2b3a63', skin: '#f1c8a0' },
    { hair: 'silver',   color: '#d5d8dc', skin: '#f5d4ae' },
    { hair: 'spiky',    color: '#2aa2a0', skin: '#f2c9a2' },
    { hair: 'spiky',    color: '#e8722a', skin: '#f0c096' },
    { hair: 'buzz',     color: '#22252b', skin: '#e8bd93' },
    { hair: 'swoop',    color: '#e2c375', skin: '#f7d7b2' },
    { hair: 'afro',     color: '#241f1c', skin: '#9c6238' },
    { hair: 'undercut', color: '#1d1f26', skin: '#eec49c' },
    { hair: 'braids',   color: '#d9b471', skin: '#f5d3ac' },
    { hair: 'spiky',    color: '#26334e', skin: '#f1c8a0' },
    { hair: 'spiky',    color: '#c2477a', skin: '#f6d2ad' },
    { hair: 'spiky',    color: '#6a4f9e', skin: '#f4d0aa' },
    { hair: 'spiky',    color: '#23262b', skin: '#eec49c' },
    { hair: 'wavy',     color: '#ded3b4', skin: '#f7d7b2' },
    { hair: 'spiky',    color: '#2f6bad', skin: '#f2c9a2' },
    { hair: 'spiky',    color: '#e0c377', skin: '#f5d3ac' },
    { hair: 'ponytail', color: '#cfd2d6', skin: '#f6d4ae' },
    { hair: 'spiky',    color: '#6b4423', skin: '#f3cba4' },
    { hair: 'buzz',     color: '#1e2028', skin: '#f2c9a2' },
    { hair: 'spiky',    color: '#e3c169', skin: '#f7d7b2' },
    { hair: 'ponytail', color: '#d5d8dc', skin: '#f6d4ae' }
  ];
  /* v21 — p331~p500 신규 170종. 아트가 함께 배포될 때 PIC_MAX 를 500으로 올린다.
     500일 때 gk = 6·15·20 · 294~330 · 471~500 = 70종 / field = 430종 (assets/portraits/pools.json 과 같다) */
  var PIC_MAX = 330;
  DS.PIC_COUNT = PIC_MAX;
  DS.PIC_LEGACY = 330;
  /* p37~p330: 일러스트 시트에서 슬라이스된 나머지 선수 — 번호 기반으로 헤어·피부를 고정 배정 */
  (function () {
    var HAIRS = [
      { hair: 'spiky',    color: '#23262e' }, { hair: 'undercut', color: '#6b4423' },
      { hair: 'swoop',    color: '#e3c169' }, { hair: 'buzz',     color: '#1e2028' },
      { hair: 'wavy',     color: '#5a3620' }, { hair: 'ponytail', color: '#d9b06a' },
      { hair: 'afro',     color: '#241f1c' }, { hair: 'silver',   color: '#cfd3d6' },
      { hair: 'mohawk',   color: '#2b3a63' }, { hair: 'braids',   color: '#8a6034' }
    ];
    var SKINS = ['#f7d3ae', '#f2c9a2', '#eec49c', '#e8bd93', '#d59a6a', '#9c6238'];
    var n, a, b, c;
    for (n = 37; n <= DS.PIC_COUNT; n++) {
      a = HAIRS[(n * 7 + 3) % HAIRS.length];
      b = SKINS[(n * 11 + 5) % SKINS.length];
      c = HAIRS[(n * 5 + 9) % HAIRS.length];
      PIC_META[n] = { hair: a.hair, color: (n % 4 === 0 ? c.color : a.color), skin: b };
    }
  })();
  DS.PIC_META = PIC_META;
  /* 골키퍼 장갑을 낀 일러스트는 GK 전용 — 필드 선수와 절대 섞이지 않는다.
     assets/portraits/pools.json (count 330 · gk 40종) 과 100% 일치해야 한다. */
  var GK_PORTRAITS = [6, 15, 20];
  var FIELD_PORTRAITS = [];
  (function () {
    var n;
    for (n = 294; n <= DS.PIC_LEGACY; n++) { GK_PORTRAITS.push(n); }
    for (n = 471; n <= DS.PIC_COUNT; n++) { GK_PORTRAITS.push(n); }
    for (n = 1; n <= DS.PIC_COUNT; n++) {
      if (GK_PORTRAITS.indexOf(n) < 0) { FIELD_PORTRAITS.push(n); }
    }
  })();
  DS.GK_PORTRAITS = GK_PORTRAITS;
  DS.FIELD_PORTRAITS = FIELD_PORTRAITS;
  DS.picPoolFor = function (pos) { return pos === 'GK' ? GK_PORTRAITS : FIELD_PORTRAITS; };
  DS.picAllowed = function (pos, pic) { return DS.picPoolFor(pos).indexOf(pic) >= 0; };
  function pickPicFor(pos) {
    return pick(DS.picPoolFor(pos));
  }
  function pickPic() {
    var t = irange(1, DS.PIC_COUNT);
    return t;
  }
  /* 16명 스쿼드 · 영입 후보가 같은 얼굴을 쓰지 않도록 pic을 고유 배정 (GK/필드 풀 분리) */
  DS.assignUniquePics = function (list) {
    if (!list) { return list; }
    var used = {}, i, n, fi = 0, p, pic, pool, free;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p) { continue; }
      pic = p.pic;
      if (typeof pic === 'number' && DS.picAllowed(p.pos, pic) && !used[pic]) { used[pic] = 1; }
      else { p.pic = 0; }
    }
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p || p.pic) { continue; }
      pool = DS.picPoolFor(p.pos);
      free = [];
      for (n = 0; n < pool.length; n++) { if (!used[pool[n]]) { free.push(pool[n]); } }
      if (!free.length) { free = pool.slice(); }
      free = shuffle(free);
      p.pic = free[0];
      used[p.pic] = 1;
      fi++;
    }
    void fi;
    return list;
  };
  DS.nextFreePic = function (list, pos) {
    var pool = DS.picPoolFor(pos), used = {}, free = [], i, n;
    for (i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].pic) { used[list[i].pic] = 1; }
    }
    for (n = 0; n < pool.length; n++) { if (!used[pool[n]]) { free.push(pool[n]); } }
    return free.length ? pick(free) : pick(pool);
  };
  DS.picMeta = function (p) {
    var i = p && p.pic ? p.pic : 1;
    return PIC_META[i] || PIC_META[1];
  };

  function makeTend() {
    return {
      int: irange(3, 9), org: irange(3, 9), emo: irange(3, 9), ind: irange(3, 9)
    };
  }

  var NICK_A = ['주장의', '강철', '번개', '황소', '예술', '초록', '붉은', '조용한', '거침없는', '새벽', '마지막', '투명한'];
  var NICK_B = ['품격', '심장', '발끝', '돌파', '마술사', '사냥꾼', '수호자', '엔진', '승부사', '연금술사', '지휘자', '방패'];

  var STORY = [
    '{club}의 {posname} {name}. 어린 시절 마을 잔디밭에서 혼자 공을 차던 시절의 버릇이 아직 남아 있다. {traitdesc} 경기장에 들어서면 표정이 먼저 바뀌고, 동료들은 그 눈빛을 보고 공을 맡긴다.',
    '지방 리그에서 이름을 알린 {name}. 스카우터의 수첩에 "느리지만 절대 틀리지 않는 선수"라고 적혀 있던 것이 인연이 되어 {club}에 입단했다. {traitdesc} 최근에는 후배들에게 먼저 다가가 말을 거는 모습이 자주 보인다.',
    '{nameJosa} {club}의 자랑인 {nickname}. 훈련이 끝난 뒤에도 골대 앞에 남아 공을 정리하는 성실함으로 유명하다. {traitdesc} 팬들은 그의 등번호가 적힌 유니폼을 입고 관중석 한쪽을 채운다.',
    '한때 방출 통보를 받고 짐을 싸던 {name}. 마지막 연습 경기에서 보여 준 집념이 감독의 마음을 바꿨고, 그날 이후로 그는 매 경기 출전 명단에 이름을 올린다. {traitdesc}',
    '{club} 유스 출신의 {name}. 구단 시설이 낡아 바닥이 젖은 날에도 혼자 남아 슛을 쏘던 소년은 이제 경기장을 지휘하는 선수가 되었다. {traitdesc}',
    '조용한 성격의 {name}. 인터뷰에서는 말수가 적지만, 라커룸에서 가장 먼저 웃음을 만드는 사람도 그다. {traitdesc} 감독은 그를 두고 "팀의 온도"라고 부른다.',
    '이적 시장 마지막 날, 팬들이 지켜보는 가운데 {club} 유니폼을 입은 {name}. 첫 경기에서 보여 준 플레이 하나로 관중석이 그의 이름을 연호했다. {traitdesc}',
    '{name}의 플레이는 계산적이다. 상대의 버릇을 세 번의 공격으로 읽어내고, 네 번째에 결정적인 한 방을 만든다. {traitdesc} 벤치에서도 그의 목소리는 가장 또렷하다.'
  ];

  function storyFor(p, clubName) {
    if (typeof p.storyTpl !== 'number') { p.storyTpl = rnd(STORY.length); }
    var t = STORY[p.storyTpl % STORY.length];
    var tr = traitOf(p.trait);
    var nick = p.nickname || '조용한 주인공';
    return t
      .replace(/\{club\}/g, clubName || '도트 유나이티드')
      .replace(/\{name\}/g, p.name)
      .replace(/\{nameJosa\}/g, josa(p.name, '은/는'))
      .replace(/\{posname\}/g, POS[p.pos].name)
      .replace(/\{nickname\}/g, nick)
      .replace(/\{traitdesc\}/g, tr.desc);
  }

  function statSheet(p) {
    var w = POS[p.pos].w;
    var spd = clamp(Math.round(26 + p.s * 6.4 + p.t * 0.8), 20, 99);
    var atk = clamp(Math.round(24 + p.t * (5.4 + w.t * 2) + p.p * 1.8), 20, 99);
    var def = clamp(Math.round(24 + p.p * (5.2 + w.p * 2) + p.s * 1.4), 20, 99);
    if (p.pos === 'GK') {
      def = clamp(Math.round(30 + p.p * 4.4 + p.t * 2.6), 20, 99);
      atk = clamp(Math.round(16 + p.t * 2.0), 20, 60);
      spd = clamp(Math.round(24 + p.s * 4.0), 20, 80);
    }
    return { spd: spd, atk: atk, def: def };
  }

  function ratingOf(p) {
    var w = POS[p.pos].w;
    var v = p.s * w.s + p.t * w.t + p.p * w.p;
    var lv = p.level || 0;
    var raw = 22 + v * 7.2 + lv * 1.1 + (RARITY[p.rarity].stars - 2) * 1.2;
    return clamp(Math.round(raw), 20, 99);
  }

  function starsOf(p) {
    var r = ratingOf(p);
    if (r >= 88) { return 5; }
    if (r >= 78) { return 4; }
    if (r >= 66) { return 3; }
    if (r >= 54) { return 2; }
    return 1;
  }

  function makePlayer(opts) {
    opts = opts || {};
    var pos = opts.pos || pick(['CB', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'DM', 'CM', 'CM', 'AM', 'AM', 'LWF', 'RWF', 'CF', 'ST', 'GK']);
    var rarity = opts.rarity || pickRarity('normal');
    var base = RARITY[rarity].base;
    var tr = opts.trait ? traitOf(opts.trait) : pick(TRAITS);
    var s = typeof opts.s === 'number' ? opts.s : irange(base[0], base[1]);
    var t = typeof opts.t === 'number' ? opts.t : irange(base[0], base[1]);
    var pw = typeof opts.p === 'number' ? opts.p : irange(base[0], base[1]);
    /* 포지션 보정 */
    var w = POS[pos].w;
    if (w.s >= 0.3) { s = clamp(s + 1, 1, 10); }
    if (w.t >= 0.44) { t = clamp(t + 1, 1, 10); }
    if (w.p >= 0.42) { pw = clamp(pw + 1, 1, 10); }
    if (pos === 'GK') { pw = clamp(pw + 2, 1, 10); t = clamp(t - 1, 1, 10); }
    /* 개성 보정 */
    s = clamp(s + (tr.mod.s || 0), 1, 10);
    t = clamp(t + (tr.mod.t || 0), 1, 10);
    pw = clamp(pw + (tr.mod.p || 0), 1, 10);

    var name = opts.name || randName();
    var pic = (typeof opts.pic === 'number' && DS.picAllowed(pos, opts.pic)) ? opts.pic : pickPicFor(pos);
    var foot = (opts.foot && FOOT_LIST.indexOf(opts.foot) >= 0) ? opts.foot : pickFoot(pos);
    var p = {
      id: opts.id || newId(),
      name: name,
      foot: foot,
      number: opts.number || irange(1, 45),
      pos: pos,
      rarity: rarity,
      s: s, t: t, p: pw,
      level: opts.level || 0,
      pic: pic,
      lock: opts.lock || pick(LOCKER).key,
      role: opts.role || null,
      trait: tr.key,
      tenure: opts.tenure || irange(1, 6),
      age: opts.age || irange(19, 34),
      height: opts.height || irange(164, 192),
      weight: 0,
      nickname: opts.nickname || (pick(NICK_A) + ' ' + pick(NICK_B)),
      playType: '',
      face: {
        hair: pick(HAIR_STYLE),
        hairColor: pick(HAIR_COLOR),
        skin: pick(SKIN_COLOR),
        brow: pick(BROW),
        eye: pick(EYE),
        nose: pick(NOSE),
        mouth: pick(MOUTH),
        beard: pick(BEARD),
        collar: pick(COLLAR)
      },
      apt: makeAptitude(pos, foot),
      tend: makeTend(),
      set: {
        pk: clamp(Math.round(t * 0.6 + pw * 0.3 + irange(-1, 1)), 1, 10),
        fk: clamp(Math.round(t * 0.8 + irange(-1, 1)), 1, 10),
        ck: clamp(Math.round((t + s) / 2), 1, 10),
        cap: clamp(Math.round((t + pw) / 2 * 0.7 + (tr.mod.cap || 0) + irange(0, 2)), 1, 10)
      },
      tough: irange(3, 10),
      stamina: irange(4, 10),
      fame: irange(2, 10),
      goals: 0, apps: 0, assists: 0,
      skill: null,
      trained: []
    };
    p.weight = Math.round((p.height - 100) * 0.92 + irange(-4, 4));
    p.playType = playTypeFor(p);
    p.stats = statSheet(p);
    return p;
  }

  function playTypeFor(p) {
    var a = p.apt;
    var best = 'CM';
    var keys = APT_LIST.slice();
    var i, top = -1;
    for (i = 0; i < keys.length; i++) {
      if (a[keys[i]] > top) { top = a[keys[i]]; best = keys[i]; }
    }
    var style = p.t >= 8 ? '테크니션' : (p.s >= 8 ? '스피더' : (p.p >= 8 ? '피지컬' : '밸런스'));
    return style + '형 ' + best;
  }

  function makeInitialSquad() {
    var squad = [];
    var roles = ['GK', 'CB', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LWF', 'ST', 'RWF', 'CB', 'DM', 'CM', 'GK', 'ST'];
    var i;
    for (i = 0; i < roles.length; i++) {
      var r;
      if (roles[i] === 'GK') { r = 'eun'; }
      else if (i < 11) { r = chance(0.4) ? 'geum' : 'eun'; }
      else { r = chance(0.5) ? 'dong' : 'eun'; }
      var p = makePlayer({ pos: roles[i], rarity: r });
      if (i === 9) {
        p.name = '차도훈'; p.rarity = 'geum'; p.s = 8; p.t = 8; p.p = 5;
        p.trait = 'clutch'; p.stats = statSheet(p); p.nickname = '마지막 한 방';
      }
      if (i === 0) {
        p.name = '한지호'; p.s = 6; p.t = 6; p.p = 8; p.pos = 'GK';
        p.apt = makeAptitude('GK', p.foot); p.stats = statSheet(p);
      }
      squad.push(p);
    }
    DS.assignUniquePics(squad);
    return squad;
  }

  DS.makePlayer = makePlayer;
  DS.makeInitialSquad = makeInitialSquad;
  DS.ratingOf = ratingOf;
  DS.starsOf = starsOf;
  DS.statSheet = statSheet;
  DS.storyFor = storyFor;
  DS.pickRarity = pickRarity;
  DS.randName = randName;
  DS.playTypeFor = playTypeFor;
  DS.resetNames = function () { USED = {}; };

  /* ─────────────────────────  v21 — 경기 EXP · 이적시장 · 유소년 아카데미  ───────────────────────── */
  /* 레벨업에 필요한 EXP. 레벨이 오를수록 선형으로 늘어나 성장이 느려진다. */
  DS.expToNext = function (level) { return 520 + (level || 0) * 420; };

  /* 이적료 — OVR·등급·나이·레벨. 20대 중반이 정점, 33세 이상은 급락. */
  DS.marketValue = function (p) {
    if (!p) { return 0; }
    var ovr = Math.max(20, ratingOf(p));
    var base = Math.pow(ovr / 55, 3.1) * 4200;
    var age = p.age || 26;
    var ageK = age <= 20 ? 1.4 : (age <= 23 ? 1.28 : (age <= 26 ? 1.14 : (age <= 29 ? 1 : (age <= 32 ? 0.74 : 0.46))));
    var rarK = { dong: 0.85, eun: 1, geum: 1.22, legend: 1.55 }[p.rarity] || 1;
    var fee = base * ageK * rarK * (1 + (p.level || 0) * 0.035);
    return Math.max(260, Math.round(fee / 50) * 50);
  };
  /* 주급 — 이적료의 3.5% 수준(경기당이 아니라 시즌 주급 감각) */
  DS.wageOf = function (p) {
    if (!p) { return 0; }
    return Math.max(40, Math.round(DS.marketValue(p) * 0.035 / 10) * 10);
  };
  /* 라운드마다 같은 목록이 보이도록 고정 시드 난수 */
  function seedRnd(seed) {
    var s = (seed | 0) % 2147483647;
    if (s <= 0) { s += 2147483646; }
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  DS.seedRnd = seedRnd;

  /* 이적시장 매물 — 라운드·시즌 시드로 고정. 라운드가 바뀌면 새 매물이 올라온다. */
  DS.makeMarketListings = function (count, seed, opts) {
    opts = opts || {};
    var R = seedRnd((seed || 1) * 7919 + 13);
    var out = [], i, p, rarity, roll, age, fee, from;
    var teams = DS.TEAMS.length ? DS.TEAMS : [{ name: '자유계약', short: 'FA' }];
    for (i = 0; i < count; i++) {
      roll = R();
      rarity = roll < 0.30 ? 'dong' : (roll < 0.72 ? 'eun' : (roll < 0.96 ? 'geum' : 'legend'));
      p = makePlayer({ rarity: rarity });
      age = 18 + Math.floor(R() * 17);
      p.age = age;
      /* 어린 선수는 현재 능력치를 낮춰 잠재 성장 여지를 만든다 */
      if (age <= 21) {
        p.s = clamp(p.s - 1, 1, 10); p.t = clamp(p.t - 1, 1, 10); p.p = clamp(p.p - 1, 1, 10);
        p.stats = statSheet(p);
      }
      fee = Math.round(DS.marketValue(p) * (0.92 + R() * 0.34) / 50) * 50;
      from = teams[Math.floor(R() * teams.length)];
      out.push({
        id: p.id, player: p, fee: Math.max(300, fee),
        wage: DS.wageOf(p), fromId: from.id || 'fa', fromName: from.short || from.name,
        round: opts.round || 0, sold: false
      });
      DS.assignUniquePics([p]);
    }
    return out;
  };

  /* 유소년 후보 — 15~18세, 현재 능력치는 낮고 잠재력(pot)은 높다. */
  DS.makeYouthProspect = function (opts) {
    opts = opts || {};
    var p = makePlayer({ rarity: opts.rarity || (Math.random() < 0.16 ? 'eun' : 'dong') });
    p.age = opts.age || (15 + Math.floor(Math.random() * 4));
    p.s = clamp(1 + Math.floor(Math.random() * 3), 1, 10);
    p.t = clamp(1 + Math.floor(Math.random() * 3), 1, 10);
    p.p = clamp(1 + Math.floor(Math.random() * 3), 1, 10);
    p.level = 0;
    p.exp = 0;
    p.pot = opts.pot || (58 + Math.floor(Math.random() * 38));       /* 58~95 */
    p.youth = true;
    p.stats = statSheet(p);
    DS.assignUniquePics([p]);
    return p;
  };
  /* 잠재력 대비 성장 여유 (0~1) */
  DS.headroom = function (p) {
    if (!p || !p.pot) { return 0; }
    var cur = ratingOf(p);
    return clamp((p.pot - cur) / 40, 0, 1);
  };

  /* ─────────────────────────  구단 시설  ───────────────────────── */
  var FACILITIES = [
    {
      key: 'training', name: '미니 연습장', icon: 'training',
      desc: '훈련 효과 +{v}%', target: '훈련 효과',
      base: 1400, grow: 1.55,
      effect: function (lv) { return lv * 8; },
      unit: '%'
    },
    {
      key: 'medical', name: '메디컬룸', icon: 'medical',
      desc: '경기 후 컨디션 회복 +{v}', target: '컨디션 회복',
      base: 1200, grow: 1.5,
      effect: function (lv) { return lv * 4; },
      unit: ''
    },
    {
      key: 'shop', name: '굿즈샵', icon: 'shop',
      desc: '경기 부수입 +{v}', target: '경기 부수입',
      base: 1600, grow: 1.52,
      effect: function (lv) { return lv * 70; },
      unit: ''
    },
    {
      key: 'fanclub', name: '팬클럽', icon: 'fanclub',
      desc: '승리 시 팬 +{v}%', target: '팬 증가',
      base: 1500, grow: 1.5,
      effect: function (lv) { return lv * 12; },
      unit: '%'
    },
    {
      key: 'cafe', name: '카페테리아', icon: 'cafe',
      desc: '팀 사기 +{v}', target: '사기',
      base: 1100, grow: 1.48,
      effect: function (lv) { return lv * 3; },
      unit: ''
    }
  ];
  DS.FACILITIES = FACILITIES;
  DS.facilityOf = function (key) {
    var i;
    for (i = 0; i < FACILITIES.length; i++) { if (FACILITIES[i].key === key) { return FACILITIES[i]; } }
    return null;
  };
  DS.facilityCost = function (fac, lv) {
    return Math.round(fac.base * Math.pow(fac.grow, lv) / 10) * 10;
  };

  /* ─────────────────────────  스폰서  ───────────────────────── */
  var SPONSORS = [
    { id: 'kimbap',  name: '한입 김밥',      fans: 0,    bonus: 90,  desc: '동네 김밥집, 든든한 후원' },
    { id: 'stationery', name: '도트 문구점', fans: 1500, bonus: 180, desc: '공책과 연필을 지원합니다' },
    { id: 'electronics', name: '태양 전자',  fans: 2600, bonus: 320, desc: '구단 전자제품 협찬' },
    { id: 'laundry', name: '하늘 빨래방',    fans: 4200, bonus: 480, desc: '유니폼 세탁 담당' },
    { id: 'hotel',   name: '그랜드 호텔',    fans: 6500, bonus: 720, desc: '원정 숙소를 제공합니다' },
    { id: 'energy',  name: '불꽃 에너지',    fans: 9000, bonus: 1100, desc: '경기장 조명 협찬' }
  ];
  DS.SPONSORS = SPONSORS;

  /* ─────────────────────────  특훈 메뉴 & 콤보  ───────────────────────── */
  var TRAIN_MENUS = [
    { key: 'shoot',  name: '슈팅 연습', icon: '🎯', gain: { t: 1 },        desc: '테크닉 +' },
    { key: 'pass',   name: '패스 훈련', icon: '🔁', gain: { t: 1 },        desc: '테크닉 +' },
    { key: 'sprint', name: '스프린트',  icon: '💨', gain: { s: 1 },        desc: '스피드 +' },
    { key: 'weight', name: '웨이트',    icon: '💪', gain: { p: 1 },        desc: '파워 +' },
    { key: 'tactic', name: '전술 회의', icon: '📋', gain: { cap: 1 },      desc: '통솔 +' },
    { key: 'setpiece', name: '세트피스', icon: '⚑', gain: { fk: 1 },      desc: 'FK +' }
  ];
  DS.TRAIN_MENUS = TRAIN_MENUS;
  DS.trainMenuOf = function (key) {
    var i;
    for (i = 0; i < TRAIN_MENUS.length; i++) { if (TRAIN_MENUS[i].key === key) { return TRAIN_MENUS[i]; } }
    return null;
  };

  var COMBOS = [
    { pair: ['shoot', 'pass'],     name: '원터치 캐논', desc: 'S +1 · T +1', gain: { s: 1, t: 1 }, skill: '결정력',  skillDesc: '골문 앞에서 흔들리지 않는다' },
    { pair: ['sprint', 'shoot'],   name: '번개 슛',     desc: 'S +2',        gain: { s: 2 },        skill: '폭발적 스피드', skillDesc: '수비 라인을 한 번에 벗어난다' },
    { pair: ['weight', 'shoot'],   name: '중거리 포격', desc: 'P +1 · T +1', gain: { p: 1, t: 1 }, skill: '중거리 슛',   skillDesc: '박스 밖에서도 골문을 노린다' },
    { pair: ['pass', 'tactic'],    name: '시야 확보',   desc: 'T +1 · 통솔 +1', gain: { t: 1, cap: 1 }, skill: '경기 읽기', skillDesc: '상대의 빈 공간을 먼저 본다' },
    { pair: ['sprint', 'weight'],  name: '강철 폐활량', desc: 'S +1 · P +1', gain: { s: 1, p: 1 }, skill: '지구력',      skillDesc: '후반에도 발이 가볍다' },
    { pair: ['setpiece', 'shoot'], name: '프리킥 장인', desc: 'FK +2',       gain: { fk: 2 },       skill: '감아차기',    skillDesc: '벽을 넘겨 골망을 흔든다' },
    { pair: ['setpiece', 'tactic'], name: '코너 전술',  desc: 'CK +2',       gain: { ck: 2 },       skill: '코너 설계',   skillDesc: '코너킥 한 번으로 경기를 바꾼다' },
    { pair: ['weight', 'tactic'],  name: '주장의 품격', desc: '통솔 +2',     gain: { cap: 2 },      skill: '카리스마',    skillDesc: '동료들이 그를 따라 움직인다' },
    { pair: ['sprint', 'setpiece'], name: '돌파 세트피스', desc: 'S +1 · FK +1', gain: { s: 1, fk: 1 }, skill: '순간 돌파', skillDesc: '세트피스 상황에서 빠져나간다' },
    { pair: ['weight', 'pass'],    name: '피벗 플레이', desc: 'P +1 · T +1', gain: { p: 1, t: 1 }, skill: '볼 지키기',   skillDesc: '압박 속에서도 공을 지킨다' },
    { pair: ['tactic', 'shoot'],   name: '결정적 한 방', desc: 'T +1 · 통솔 +1', gain: { t: 1, cap: 1 }, skill: '승부수',  skillDesc: '필요한 순간에 득점한다' }
  ];
  DS.COMBOS = COMBOS;
  DS.findCombo = function (a, b) {
    var i, pr;
    for (i = 0; i < COMBOS.length; i++) {
      pr = COMBOS[i].pair;
      if ((pr[0] === a && pr[1] === b) || (pr[1] === a && pr[0] === b)) { return COMBOS[i]; }
    }
    return null;
  };

  /* ═════════════════════════  픽셀 아트  ═════════════════════════ */
  var Art = {};

  function hex2rgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function shade(hex, amount) {
    var c = hex2rgb(hex);
    return 'rgb(' + clamp(c[0] + amount, 0, 255) + ',' + clamp(c[1] + amount, 0, 255) + ',' + clamp(c[2] + amount, 0, 255) + ')';
  }
  function hexAlpha(hex, a) {
    var c = hex2rgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  Art.shade = shade;
  Art.hexAlpha = hexAlpha;

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function fill(g, x, y, w, h, c) {
    if (!c) { return; }
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /* ── 초상화 (v20 — 도트 폴백 제거: 고해상도 SD 스프라이트를 그대로 쓴다) ──
     예전 20×26 픽셀 도트는 쓰이지 않게 되어 없앴다. 폴백 초상화가 필요하면
     Art.chibi()의 SD 스프라이트(외곽선·명암이 살아 있는 벡터풍)를 돌려준다. */
  Art.portrait = function (p, kit, opt) {
    opt = opt || {};
    var fig = Art.chibi(p || { id: 'x', pos: 'CM', pic: 1 }, kit || { shirt: '#c8432f', shorts: '#1c2a25', trim: '#f1e7cf' }, opt.frame || 0, 1);
    return fig;
  };

  /* 캔버스에 선수 전신 그리기 (고해상도 · 부드러운 축소) */
  Art.paint = function (canvas, p, kit, opt) {
    if (!canvas) { return; }
    opt = opt || {};
    var fig = Art.portrait(p, kit, opt);
    var k = opt.k || 1;
    var cw = Math.round(fig.width * k), ch = Math.round(fig.height * k);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw; canvas.height = ch;
    }
    var g = canvas.getContext('2d');
    g.clearRect(0, 0, cw, ch);
    g.imageSmoothingEnabled = true;
    g.drawImage(fig, 0, 0, cw, ch);
  };

  /* ── 공 ── */
  Art.drawBall = function (g, x, y, r) {
    r = r || 4;
    g.fillStyle = 'rgba(30,20,8,0.20)';
    g.beginPath();
    g.ellipse(x, y + r * 0.95, r * 0.85, r * 0.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fffdf2';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(60,44,24,0.45)';
    g.lineWidth = 0.7;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#2b2118';
    g.fillRect(x - r * 0.2, y - r * 0.5, Math.ceil(r * 0.4), Math.ceil(r * 0.4));
    g.fillRect(x - r * 0.82, y + r * 0.1, Math.ceil(r * 0.32), Math.ceil(r * 0.32));
    g.fillRect(x + r * 0.42, y + r * 0.18, Math.ceil(r * 0.3), Math.ceil(r * 0.3));
  };

  /* 가로 피치 원근 투영 상수 (match.js · 마이팀 전술판이 함께 쓴다) */
  Art.PROJ = {
    farL: 0.070, farR: 0.930,
    nearL: 0.028, nearR: 0.972,
    farY: 0.318, nearY: 0.910,
    s0: 0.85, s1: 1.12
  };

  Art.pitchMargin = function (W, H) {
    return Math.max(9, Math.round(Math.min(W, H) * 0.032));
  };

  /* ── 현대 잔디 경기장 ── */
  Art.drawPitch = function (g, W, H, opt) {
    opt = opt || {};
    if (opt.landscape) { Art.drawPitchLandscape(g, W, H, opt); return; }
    var deep = '#0e3b32', mid = '#12493c', light = '#16564276';
    var i, cols = 9;
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b332c');
    bg.addColorStop(0.5, '#11503f');
    bg.addColorStop(1, '#0a2d27');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    /* 잔디 줄무늬 */
    var cw = W / cols;
    for (i = 0; i < cols; i++) {
      if (i % 2 === 0) {
        g.fillStyle = 'rgba(255,255,255,0.035)';
        g.fillRect(i * cw, 0, cw, H);
      }
    }
    /* 잔디 결 */
    g.fillStyle = 'rgba(255,255,255,0.02)';
    for (i = 0; i < 26; i++) { g.fillRect((i * 53) % W, 0, 1.5, H); }
    /* 비네트 */
    var vg = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.15, W / 2, H * 0.5, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(255,255,255,0.05)');
    vg.addColorStop(0.55, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2,16,13,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    var m = opt.margin || Art.pitchMargin(W, H);
    var r = opt.rect || { x: m, y: m, w: W - m * 2, h: H - m * 2 };
    var fx = r.x, fy = r.y, fw = r.w, fh = r.h;
    var lw = Math.max(1, Math.round(W / 240));
    g.strokeStyle = 'rgba(228,255,240,0.55)';
    g.lineWidth = lw;
    g.strokeRect(fx, fy, fw, fh);
    /* 하프라인 · 센터서클 */
    g.beginPath();
    g.moveTo(fx, fy + fh / 2); g.lineTo(fx + fw, fy + fh / 2); g.stroke();
    g.beginPath(); g.arc(W / 2, fy + fh / 2, Math.min(fw, fh) * 0.13, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(228,255,240,0.7)';
    g.beginPath(); g.arc(W / 2, fy + fh / 2, Math.max(1.4, lw), 0, Math.PI * 2); g.fill();

    var boxW = fw * 0.58, boxH = fh * 0.155;
    g.strokeRect(W / 2 - boxW / 2, fy, boxW, boxH);
    g.strokeRect(W / 2 - boxW / 2, fy + fh - boxH, boxW, boxH);
    var sw = fw * 0.3, sh = fh * 0.062;
    g.strokeRect(W / 2 - sw / 2, fy, sw, sh);
    g.strokeRect(W / 2 - sw / 2, fy + fh - sh, sw, sh);
    g.beginPath(); g.arc(W / 2, fy + fh * 0.105, Math.max(1.4, lw), 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(W / 2, fy + fh - fh * 0.105, Math.max(1.4, lw), 0, Math.PI * 2); g.fill();
    /* 코너 아크 */
    [[fx, fy, 0], [fx + fw, fy, Math.PI / 2], [fx, fy + fh, -Math.PI / 2], [fx + fw, fy + fh, Math.PI]].forEach(function (c) {
      g.beginPath();
      g.arc(c[0], c[1], Math.min(fw, fh) * 0.035, c[2], c[2] + Math.PI / 2);
      g.stroke();
    });

    /* 골대 */
    var goalW = fw * 0.26, goalD = Math.max(7, Math.min(15, fh * 0.042));
    var gx = W / 2 - goalW / 2;
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(232,255,246,0.85)';
    g.beginPath();
    g.moveTo(gx, fy + goalD); g.lineTo(gx + goalW, fy + goalD);
    g.moveTo(gx, fy + goalD); g.lineTo(gx, fy);
    g.moveTo(gx + goalW, fy + goalD); g.lineTo(gx + goalW, fy);
    g.moveTo(gx, fy + fh - goalD); g.lineTo(gx + goalW, fy + fh - goalD);
    g.moveTo(gx, fy + fh - goalD); g.lineTo(gx, fy + fh);
    g.moveTo(gx + goalW, fy + fh - goalD); g.lineTo(gx + goalW, fy + fh);
    g.stroke();
    g.strokeStyle = 'rgba(232,255,246,0.28)';
    g.lineWidth = 1;
    for (i = 0; i <= 8; i++) {
      g.beginPath(); g.moveTo(gx + (goalW / 8) * i, fy); g.lineTo(gx + (goalW / 8) * i, fy + goalD); g.stroke();
      g.beginPath(); g.moveTo(gx + (goalW / 8) * i, fy + fh - goalD); g.lineTo(gx + (goalW / 8) * i, fy + fh); g.stroke();
    }

    /* 관중석 (위/아래 띠) */
    if (opt.crowd) {
      var ch = Math.max(6, Math.round(H * 0.022));
      var top = g.createLinearGradient(0, 0, 0, ch * 2.6);
      top.addColorStop(0, 'rgba(4,18,16,0.95)');
      top.addColorStop(1, 'rgba(6,26,22,0)');
      g.fillStyle = top; g.fillRect(0, 0, W, ch * 2.6);
      var bot = g.createLinearGradient(0, H, 0, H - ch * 2.6);
      bot.addColorStop(0, 'rgba(4,18,16,0.95)');
      bot.addColorStop(1, 'rgba(6,26,22,0)');
      g.fillStyle = bot; g.fillRect(0, H - ch * 2.6, W, ch * 2.6);
      var colors = ['#7fe3b0', '#f2d06b', '#5fa8e8', '#ef7f6b', '#c9a6f0'];
      for (i = 0; i < 90; i++) {
        var cx2 = (i * 37 + 11) % W;
        g.fillStyle = colors[i % colors.length];
        g.globalAlpha = 0.18 + ((i * 13) % 7) / 26;
        g.fillRect(cx2, ch * 0.5 + ((i * 7) % 3) * 2.2, 1.7, 1.7);
        g.fillRect(cx2 + 3, H - ch * 1.4 - ((i * 5) % 3) * 2.2, 1.7, 1.7);
      }
      g.globalAlpha = 1;
    }
  };

  /* ── 가로(16:9) 잔디 경기장 — 골대가 좌우, 홈은 왼쪽→오른쪽 공격 (이미지 로드 전 폴백) ── */
  Art.drawPitchLandscape = function (g, W, H, opt) {
    opt = opt || {};
    var P = opt.proj || Art.PROJ;
    var i, a, b;
    function pt(u, v) {
      var l = W * (P.farL + (P.nearL - P.farL) * v);
      var r = W * (P.farR + (P.nearR - P.farR) * v);
      var y = H * (P.farY + (P.nearY - P.farY) * (0.52 * v + 0.48 * v * v));
      return { x: l + u * (r - l), y: y };
    }
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a2b25');
    bg.addColorStop(0.45, '#12523f');
    bg.addColorStop(1, '#0d3b2f');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    /* 잔디 줄무늬 (길이 방향) */
    for (i = 0; i < 12; i++) {
      if (i % 2 === 0) {
        a = pt(i / 12, 0); b = pt(i / 12, 1);
        g.fillStyle = 'rgba(255,255,255,0.035)';
        g.beginPath();
        g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        var c2 = pt((i + 1) / 12, 1), d2 = pt((i + 1) / 12, 0);
        g.lineTo(c2.x, c2.y); g.lineTo(d2.x, d2.y); g.closePath(); g.fill();
      }
    }
    /* 관중석 띠 */
    if (opt.crowd !== false) {
      var ch = Math.max(10, Math.round(H * 0.1));
      var top = g.createLinearGradient(0, 0, 0, ch * 1.7);
      top.addColorStop(0, 'rgba(4,16,14,0.96)');
      top.addColorStop(1, 'rgba(8,34,28,0)');
      g.fillStyle = top; g.fillRect(0, 0, W, ch * 1.7);
      var bot = g.createLinearGradient(0, H, 0, H - ch * 1.5);
      bot.addColorStop(0, 'rgba(4,16,14,0.96)');
      bot.addColorStop(1, 'rgba(8,34,28,0)');
      g.fillStyle = bot; g.fillRect(0, H - ch * 1.5, W, ch * 1.5);
      var colors = ['#7fe3b0', '#f2d06b', '#5fa8e8', '#ef7f6b', '#c9a6f0'];
      for (i = 0; i < 110; i++) {
        var cx = (i * 41 + 13) % W;
        g.fillStyle = colors[i % colors.length];
        g.globalAlpha = 0.16 + ((i * 11) % 7) / 28;
        g.fillRect(cx, ch * 0.35 + ((i * 7) % 3) * 2.4, 1.8, 1.8);
        g.fillRect(cx + 4, H - ch * 1.1 - ((i * 5) % 3) * 2.4, 1.8, 1.8);
      }
      g.globalAlpha = 1;
    }
    var lw = Math.max(1, Math.round(W / 260));
    g.strokeStyle = 'rgba(228,255,240,0.48)';
    g.lineWidth = lw;
    function line(u1, v1, u2, v2) {
      var p1 = pt(u1, v1), p2 = pt(u2, v2);
      g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
    }
    line(0, 0, 1, 0); line(1, 0, 1, 1); line(1, 1, 0, 1); line(0, 1, 0, 0);
    line(0.5, 0, 0.5, 1);
    /* 센터서클 (원근 타원) */
    g.beginPath();
    for (i = 0; i <= 40; i++) {
      var th = i / 40 * Math.PI * 2;
      a = pt(0.5 + 0.088 * Math.cos(th), 0.5 + 0.135 * Math.sin(th));
      if (i === 0) { g.moveTo(a.x, a.y); } else { g.lineTo(a.x, a.y); }
    }
    g.closePath(); g.stroke();
    a = pt(0.5, 0.5);
    g.fillStyle = 'rgba(228,255,240,0.75)';
    g.beginPath(); g.arc(a.x, a.y, Math.max(1.4, lw), 0, Math.PI * 2); g.fill();
    /* 페널티 박스 · 골 에어리어 · 페널티 스팟 */
    [[0, 1], [1, -1]].forEach(function (e) {
      var u0 = e[0];
      line(u0, 0.215, u0 + e[1] * 0.165, 0.215);
      line(u0 + e[1] * 0.165, 0.215, u0 + e[1] * 0.165, 0.785);
      line(u0 + e[1] * 0.165, 0.785, u0, 0.785);
      line(u0, 0.365, u0 + e[1] * 0.058, 0.365);
      line(u0 + e[1] * 0.058, 0.365, u0 + e[1] * 0.058, 0.635);
      line(u0 + e[1] * 0.058, 0.635, u0, 0.635);
      a = pt(u0 + e[1] * 0.11, 0.5);
      g.beginPath(); g.arc(a.x, a.y, Math.max(1.3, lw), 0, Math.PI * 2); g.fill();
      /* 골대 + 그물망 */
      g.save();
      g.strokeStyle = 'rgba(240,255,250,0.92)';
      g.lineWidth = 1.8;
      var gd = (e[1] < 0 ? -1 : 1) * 0.026;
      line(u0 + gd * 0.06, 0.437, u0 + gd, 0.446);
      line(u0 + gd, 0.446, u0 + gd, 0.554);
      line(u0 + gd, 0.554, u0 + gd * 0.06, 0.563);
      g.strokeStyle = 'rgba(235,255,248,0.22)';
      g.lineWidth = 1;
      var gi, gu;
      for (gi = 0; gi <= 6; gi++) {
        gu = u0 + gd * (0.06 + (0.94 * gi / 6));
        line(gu, 0.446 + (0.008 * gi), gu, 0.554 - (0.008 * gi) * -1);
      }
      for (gi = 0; gi <= 3; gi++) {
        line(u0 + gd * 0.06, 0.446 + (0.108 * gi / 3), u0 + gd, 0.45 + (0.1 * gi / 3));
      }
      g.restore();
    });
  };

  /* ── 엠블럼 ── */
  function shieldPath(g, x, y, w, h) {
    g.beginPath();
    g.moveTo(x, y + h * 0.04);
    g.lineTo(x + w, y + h * 0.04);
    g.lineTo(x + w, y + h * 0.54);
    g.quadraticCurveTo(x + w, y + h, x + w / 2, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h * 0.54);
    g.closePath();
  }
  function starPath(g, cx, cy, spikes, outer, inner) {
    var rot = -Math.PI / 2;
    var step = Math.PI / spikes, i;
    g.beginPath();
    g.moveTo(cx, cy - outer);
    for (i = 0; i < spikes; i++) {
      rot += step;
      g.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
      g.lineTo(cx + Math.cos(rot + step / 2) * outer, cy + Math.sin(rot + step / 2) * outer);
    }
    g.closePath();
  }

  Art.drawEmblem = function (canvas, id, kit) {
    if (!canvas) { return; }
    var g = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    var shirt = (kit && kit.shirt) || '#c8432f';
    var trim = (kit && kit.trim) || '#f2e6c4';
    var pad = Math.round(W * 0.07);
    var w = W - pad * 2, h = H - pad * 2;
    shieldPath(g, pad, pad, w, h);
    var grd = g.createLinearGradient(0, pad, 0, pad + h);
    grd.addColorStop(0, shade(shirt, 34));
    grd.addColorStop(0.55, shirt);
    grd.addColorStop(1, shade(shirt, -44));
    g.fillStyle = grd;
    g.fill();
    g.lineWidth = Math.max(1.6, W * 0.045);
    g.strokeStyle = trim;
    g.stroke();
    g.lineWidth = Math.max(1, W * 0.02);
    g.strokeStyle = shade(shirt, -60);
    g.stroke();

    g.save();
    shieldPath(g, pad, pad, w, h);
    g.clip();
    var cx = W / 2, cy = pad + h * 0.45, u = W / 15;
    g.fillStyle = trim;
    if (id === 'star') {
      starPath(g, cx, cy, 5, u * 4.4, u * 1.9); g.fill();
    } else if (id === 'flame') {
      g.beginPath();
      g.moveTo(cx, cy + u * 4);
      g.quadraticCurveTo(cx - u * 3.2, cy + u * 0.8, cx - u * 0.3, cy - u * 4);
      g.quadraticCurveTo(cx - u * 0.1, cy - u * 1.2, cx + u * 1.7, cy - u * 1);
      g.quadraticCurveTo(cx + u * 3.2, cy + u * 0.6, cx + u * 2, cy + u * 2.6);
      g.quadraticCurveTo(cx + u * 1.2, cy + u * 3.8, cx, cy + u * 4);
      g.fill();
    } else if (id === 'bolt') {
      g.beginPath();
      g.moveTo(cx + u * 1.4, cy - u * 4.2);
      g.lineTo(cx - u * 2.4, cy + u * 0.4);
      g.lineTo(cx - u * 0.2, cy + u * 0.4);
      g.lineTo(cx - u * 1.1, cy + u * 4.2);
      g.lineTo(cx + u * 2.6, cy - u * 0.6);
      g.lineTo(cx + u * 0.2, cy - u * 0.6);
      g.closePath(); g.fill();
    } else if (id === 'crown') {
      g.beginPath();
      g.moveTo(cx - u * 3.4, cy + u * 2.4);
      g.lineTo(cx - u * 3.4, cy - u * 2.2);
      g.lineTo(cx - u * 1.3, cy - u * 0.1);
      g.lineTo(cx, cy - u * 3.2);
      g.lineTo(cx + u * 1.3, cy - u * 0.1);
      g.lineTo(cx + u * 3.4, cy - u * 2.2);
      g.lineTo(cx + u * 3.4, cy + u * 2.4);
      g.closePath(); g.fill();
    } else if (id === 'ball') {
      g.beginPath(); g.arc(cx, cy, u * 3.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = shade(shirt, -55);
      g.beginPath(); g.arc(cx, cy, u * 1.2, 0, Math.PI * 2); g.fill();
      g.fillRect(cx - u * 0.4, cy - u * 3.4, u * 0.8, u * 1.2);
    } else if (id === 'wave') {
      g.beginPath();
      g.moveTo(cx - u * 4, cy + u * 0.4);
      g.quadraticCurveTo(cx - u * 2, cy - u * 2.6, cx, cy + u * 0.3);
      g.quadraticCurveTo(cx + u * 2, cy + u * 2.8, cx + u * 4, cy + u * 0.1);
      g.lineTo(cx + u * 4, cy + u * 3);
      g.lineTo(cx - u * 4, cy + u * 3);
      g.closePath(); g.fill();
    } else if (id === 'claw') {
      var k;
      for (k = -1; k <= 1; k++) {
        g.beginPath();
        g.moveTo(cx + k * u * 2.3 - u * 0.5, cy - u * 3.4);
        g.quadraticCurveTo(cx + k * u * 2.3 + u * 1.1, cy, cx + k * u * 2.3 - u * 0.6, cy + u * 3.4);
        g.quadraticCurveTo(cx + k * u * 2.3 - u * 1.0, cy, cx + k * u * 2.3 - u * 0.5, cy - u * 3.4);
        g.fill();
      }
    } else if (id === 'moon') {
      g.beginPath(); g.arc(cx, cy, u * 3.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = shade(shirt, -22);
      g.beginPath(); g.arc(cx + u * 1.7, cy - u * 0.6, u * 2.9, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  };

  /* ── 유니폼 (티셔츠) 미리보기 ── */
  Art.drawKit = function (canvas, kit, p) {
    var g = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    var u = W / 16;
    var shirt = kit.shirt, trim = kit.trim || '#f2e6c4';
    /* 몸통 */
    fill(g, 4 * u, 4 * u, 8 * u, 10 * u, shirt);
    fill(g, 4 * u, 4 * u, 2 * u, 10 * u, shade(shirt, 24));
    fill(g, 11 * u, 4 * u, 1 * u, 10 * u, shade(shirt, -34));
    /* 소매 */
    fill(g, 2 * u, 4 * u, 2 * u, 4 * u, shirt);
    fill(g, 12 * u, 4 * u, 2 * u, 4 * u, shirt);
    fill(g, 2 * u, 7 * u, 2 * u, 1 * u, trim);
    fill(g, 12 * u, 7 * u, 2 * u, 1 * u, trim);
    /* 칼라 */
    fill(g, 6 * u, 3 * u, 4 * u, 1 * u, trim);
    fill(g, 7 * u, 4 * u, 1 * u, 2 * u, trim);
    fill(g, 9 * u, 4 * u, 1 * u, 2 * u, trim);
    fill(g, 8 * u, 4 * u, 1 * u, 1 * u, shade(shirt, -50));
    /* 등번호 */
    if (p) {
      g.fillStyle = 'rgba(255,253,244,0.95)';
      g.font = 'bold ' + Math.round(4 * u) + 'px "DungGeunMo", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(p.number || 9), 8 * u, 9 * u);
    }
  };

  /* ═════════════════════════  v20 — SD 일러스트 (깔끔한 외곽선 · 곡선 · 그라데이션) ═════════════════════════
     도트(픽셀) 흔적을 걷어낸 고해상도 벡터풍 캔버스 아트. 시설 · 스태프 · 초상화 폴백이 모두
     같은 규칙을 쓴다: 위에서 내려오는 빛, 왼쪽의 밝은 면, 오른쪽의 어두운 면, 짙은 잉크 외곽선. */
  var SD_INK = '#1c2a23';
  function sdRR(g, x, y, w, h, r) {
    var rr = Math.min(r == null ? 6 : r, Math.min(w, h) / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.lineTo(x + w - rr, y);
    g.quadraticCurveTo(x + w, y, x + w, y + rr);
    g.lineTo(x + w, y + h - rr);
    g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    g.lineTo(x + rr, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - rr);
    g.lineTo(x, y + rr);
    g.quadraticCurveTo(x, y, x + rr, y);
    g.closePath();
  }
  function sdBox(g, x, y, w, h, r, col, stroke, lw) {
    sdRR(g, x, y, w, h, r);
    if (col) { g.fillStyle = col; g.fill(); }
    if (stroke !== false) {
      g.lineWidth = lw || 1.7;
      g.strokeStyle = stroke || SD_INK;
      g.stroke();
    }
  }
  function sdGrad(g, x0, y0, x1, y1, c0, c1) {
    var gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, c0);
    gr.addColorStop(1, c1);
    return gr;
  }
  function sdShine(g, x, y, w, h, r, a) {
    sdRR(g, x, y, w, h, r);
    var gr = g.createLinearGradient(x, y, x, y + h);
    gr.addColorStop(0, 'rgba(255,255,255,' + (a || 0.42) + ')');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fill();
  }
  function sdScallops(g, x0, x1, y, h, colA, colB, n) {
    var w = (x1 - x0) / n, i;
    for (i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? colB : colA;
      g.beginPath();
      g.moveTo(x0 + i * w, y);
      g.lineTo(x0 + (i + 1) * w, y);
      g.lineTo(x0 + (i + 1) * w, y + h * 0.45);
      g.quadraticCurveTo(x0 + i * w + w / 2, y + h * 1.15, x0 + i * w, y + h * 0.45);
      g.closePath();
      g.fill();
    }
  }
  function sdCone(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = 'rgba(16,28,20,0.18)';
    g.beginPath(); g.ellipse(0, 4, 7, 2.2, 0, 0, Math.PI * 2); g.fill();
    var gr = g.createLinearGradient(-6, 0, 6, 0);
    gr.addColorStop(0, '#ffb066');
    gr.addColorStop(0.55, '#f2761f');
    gr.addColorStop(1, '#c1510d');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, -13);
    g.quadraticCurveTo(3.6, -4, 6, 3.2);
    g.lineTo(-6, 3.2);
    g.quadraticCurveTo(-3.6, -4, 0, -13);
    g.closePath();
    g.fill();
    g.lineWidth = 1.1; g.strokeStyle = SD_INK; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(-2.6, -6.6, 5.2, 1.6);
    g.restore();
  }
  function sdFlag(g, x, y, h, col, flutter) {
    g.strokeStyle = '#6b5334'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x, y - h);
    g.quadraticCurveTo(x + 7, y - h + 1, x + 13 + (flutter || 0), y - h + 4);
    g.quadraticCurveTo(x + 7, y - h + 7, x, y - h + 8);
    g.closePath();
    g.fill();
    g.lineWidth = 1; g.strokeStyle = SD_INK; g.stroke();
  }

  /* ── 시설 SD 일러스트 (124 × 100 고해상도) ── */
  Art.facilityFig = function (kind, level) {
    var W = 124, H = 100;
    var c = makeCanvas(W, H);
    var g = c.getContext('2d');
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.clearRect(0, 0, W, H);
    var i, j;

    /* 바닥 그림자 */
    g.fillStyle = 'rgba(18,30,22,0.15)';
    g.beginPath(); g.ellipse(62, 91, 46, 6, 0, 0, Math.PI * 2); g.fill();

    if (kind === 'training') {
      /* 잔디 판 */
      sdBox(g, 14, 52, 96, 37, 9, sdGrad(g, 0, 52, 0, 89, '#8ecb62', '#45873a'));
      g.save();
      sdRR(g, 14, 52, 96, 37, 9);
      g.clip();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      for (i = 0; i < 4; i++) { g.fillRect(14 + i * 25, 52, 12, 37); }
      g.restore();
      /* 하프라인 · 센터서클 */
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(62, 60); g.lineTo(62, 86); g.stroke();
      g.beginPath(); g.arc(62, 73, 9, 0, Math.PI * 2); g.stroke();
      /* 골대 */
      g.strokeStyle = '#f7f4e8';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(38, 74); g.lineTo(38, 36); g.lineTo(86, 36); g.lineTo(86, 74); g.stroke();
      g.strokeStyle = 'rgba(247,244,232,0.40)';
      g.lineWidth = 0.9;
      for (i = 1; i < 9; i++) { g.beginPath(); g.moveTo(38 + i * 6, 36); g.lineTo(38 + i * 6, 74); g.stroke(); }
      for (i = 1; i < 7; i++) { g.beginPath(); g.moveTo(38, 36 + i * 5.4); g.lineTo(86, 36 + i * 5.4); g.stroke(); }
      /* 골 라인 */
      g.strokeStyle = '#fbf9ee';
      g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(34, 74.5); g.lineTo(90, 74.5); g.stroke();
      /* 콘 */
      sdCone(g, 28, 76, 1.15);
      sdCone(g, 96, 68, 0.95);
      /* 공 */
      Art.drawBall(g, 62, 82, 4.6);
    } else if (kind === 'medical') {
      /* 본관 */
      sdBox(g, 26, 36, 72, 49, 8, sdGrad(g, 0, 36, 0, 85, '#fdfbf1', '#e4dcc6'));
      sdShine(g, 30, 39, 26, 30, 6, 0.55);
      /* 지붕 띠 */
      sdBox(g, 21, 28, 82, 13, 6, sdGrad(g, 0, 28, 0, 41, '#e7dfc8', '#cabd9f'));
      /* 적십자 간판 */
      sdBox(g, 52, 8, 22, 22, 7, '#ffffff', '#ded6c0', 1.5);
      sdBox(g, 61.4, 12.5, 3.2, 13, 1.4, '#d8432c', false);
      sdBox(g, 56.6, 17.3, 13, 3.2, 1.4, '#d8432c', false);
      /* 문 */
      sdBox(g, 53, 60, 18, 25, 3.5, sdGrad(g, 0, 60, 0, 85, '#cfe2ea', '#9dc0cf'));
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(62, 60); g.lineTo(62, 85); g.stroke();
      /* 창문 */
      sdBox(g, 33, 50, 13, 11, 3, '#c7e6f2', '#b6cfd9', 1.2);
      sdBox(g, 78, 50, 13, 11, 3, '#c7e6f2', '#b6cfd9', 1.2);
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(33, 55.5); g.lineTo(46, 55.5); g.stroke();
      g.beginPath(); g.moveTo(78, 55.5); g.lineTo(91, 55.5); g.stroke();
      /* 구급 가방 */
      sdBox(g, 93, 68, 24, 17, 5, sdGrad(g, 0, 68, 0, 85, '#f7f4e7', '#ddd5be'));
      sdBox(g, 100.5, 64, 9, 4.5, 2, '#c9bfa4', SD_INK, 1.1);
      sdBox(g, 104.6, 72, 2.6, 8, 1.1, '#c8432f', false);
      sdBox(g, 101.8, 74.7, 8.2, 2.6, 1.1, '#c8432f', false);
    } else if (kind === 'shop') {
      /* 건물 */
      sdBox(g, 18, 44, 88, 44, 7, sdGrad(g, 0, 44, 0, 88, '#fbf4e0', '#e3d5b6'));
      /* 처마 */
      sdBox(g, 14, 31, 96, 12, 5, sdGrad(g, 0, 31, 0, 43, '#3f7050', '#2a4f38'));
      /* 차양 */
      sdScallops(g, 15, 109, 42, 11, '#e8563f', '#f6ecd6', 6);
      g.strokeStyle = SD_INK; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(15, 42); g.lineTo(109, 42); g.stroke();
      /* 쇼윈도 */
      sdBox(g, 26, 58, 40, 25, 4, sdGrad(g, 0, 58, 0, 83, '#d6eef6', '#a7cfdd'));
      sdShine(g, 28, 60, 36, 12, 3, 0.5);
      /* 진열: 유니폼 + 공 */
      g.fillStyle = '#c8432f';
      g.beginPath();
      g.moveTo(36, 66); g.lineTo(42, 63); g.lineTo(47, 66); g.lineTo(47, 78); g.lineTo(36, 78);
      g.closePath(); g.fill();
      g.strokeStyle = '#f2e6c4'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(36, 66); g.lineTo(47, 66); g.stroke();
      Art.drawBall(g, 58, 74, 3.4);
      /* 문 */
      sdBox(g, 76, 56, 22, 32, 4, sdGrad(g, 0, 56, 0, 88, '#d8b483', '#b88f5c'));
      sdBox(g, 84, 56, 1.8, 32, 0.8, 'rgba(70,45,20,0.5)', false);
      /* 간판 공 */
      sdBox(g, 55, 12, 14, 14, 7, '#f7f4e8', '#d9d1bb', 1.3);
      Art.drawBall(g, 62, 19, 4.2);
      /* 화분 */
      sdBox(g, 22, 78, 9, 10, 2.4, '#b9754a');
      g.fillStyle = '#4f9a4a';
      g.beginPath(); g.ellipse(26.5, 74, 6, 4.5, 0, 0, Math.PI * 2); g.fill();
    } else if (kind === 'fanclub') {
      /* 스탠드 */
      sdBox(g, 16, 50, 92, 36, 8, sdGrad(g, 0, 50, 0, 86, '#e7dcc0', '#c9b998'));
      for (i = 0; i < 3; i++) {
        sdBox(g, 20 + i * 3, 55 + i * 8, 84 - i * 6, 7, 3, i % 2 ? '#d5c8a6' : '#ded2b3', 'rgba(60,70,50,0.35)', 1);
      }
      /* 관중 */
      var crowdCols = ['#e2553f', '#2f6fbf', '#f0b429', '#3d8f5c', '#8a5cd6', '#e0e6d8'];
      for (i = 0; i < 9; i++) {
        var cx = 26 + i * 9.4, cy = 56 + (i % 3) * 8;
        var cc = crowdCols[i % crowdCols.length];
        g.fillStyle = cc;
        g.beginPath(); g.arc(cx, cy, 2.6, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(cx, cy + 5, 3.4, 3.2, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(28,42,35,0.55)'; g.lineWidth = 0.7;
        g.beginPath(); g.arc(cx, cy, 2.6, 0, Math.PI * 2); g.stroke();
      }
      /* 깃발 */
      sdFlag(g, 34, 50, 34, '#e2553f', 1.5);
      sdFlag(g, 62, 50, 40, '#2f6fbf', -1);
      sdFlag(g, 90, 50, 32, '#f0b429', 2);
      /* 배너 */
      sdBox(g, 44, 26, 36, 11, 4, '#f7f2e0', '#cfc5a8', 1.2);
      g.fillStyle = '#c8432f';
      g.beginPath(); g.arc(52, 31.5, 3.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3d6b48';
      for (i = 0; i < 3; i++) { sdBox(g, 59 + i * 6, 29.5, 4.4, 2, 1, '#3d6b48', false); }
      g.fillStyle = '#3d6b48';
      for (i = 0; i < 3; i++) { sdBox(g, 59 + i * 6, 32.5, 4.4, 1.6, 0.8, 'rgba(60,110,70,0.5)', false); }
    } else {
      /* 카페 */
      sdBox(g, 20, 44, 84, 44, 8, sdGrad(g, 0, 44, 0, 88, '#fbf1dd', '#e5d3b2'));
      /* 차양 */
      sdBox(g, 16, 33, 92, 11, 5, sdGrad(g, 0, 33, 0, 44, '#3f7050', '#2a4f38'));
      sdScallops(g, 17, 107, 43, 10, '#f6ecd6', '#3f7050', 6);
      /* 창 */
      sdBox(g, 27, 56, 42, 26, 5, sdGrad(g, 0, 56, 0, 82, '#e8f4ea', '#bcd9cd'));
      sdShine(g, 29, 58, 38, 12, 4, 0.55);
      /* 컵 */
      sdBox(g, 37, 66, 14, 11, 3, '#fdfcf6', '#cfc7b2', 1.3);
      sdBox(g, 50, 68, 4, 6, 2, 'rgba(253,252,246,0.9)', '#cfc7b2', 1.1);
      g.fillStyle = '#8a5a34';
      g.beginPath(); g.ellipse(44, 67.2, 6, 1.8, 0, 0, Math.PI * 2); g.fill();
      /* 김 */
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 1.5;
      for (i = 0; i < 2; i++) {
        g.beginPath();
        g.moveTo(41 + i * 6, 63);
        g.quadraticCurveTo(38 + i * 6, 58, 42 + i * 6, 54);
        g.stroke();
      }
      /* 문 */
      sdBox(g, 78, 56, 20, 32, 4, sdGrad(g, 0, 56, 0, 88, '#c9a97a', '#a8845a'));
      sdBox(g, 86, 56, 1.6, 32, 0.8, 'rgba(80,52,24,0.45)', false);
      /* 테이블 · 의자 */
      sdBox(g, 96, 72, 20, 3.4, 1.6, '#8a5a3a');
      sdBox(g, 98, 75, 2.6, 9, 1.2, '#6b4529', false);
      sdBox(g, 112, 75, 2.6, 9, 1.2, '#6b4529', false);
    }

    /* 레벨 핍 (5칸) */
    var lv = level || 0;
    for (i = 0; i < 5; i++) {
      sdRR(g, 82 + i * 8, 91.5, 5.4, 4.2, 2);
      g.fillStyle = i < lv ? '#f0b429' : 'rgba(28,42,35,0.18)';
      g.fill();
      if (i < lv) { g.strokeStyle = '#a87513'; g.lineWidth = 0.8; g.stroke(); }
    }
    return c;
  };

  Art.paintFacility = function (canvas, kind, level) {
    var fig = Art.facilityFig(kind, level);
    /* 표시 크기(40×33)보다 넉넉한 내부 해상도로 그려 어떤 화면에서도 또렷하게 */
    var dpr = Math.max(2.4, Math.min(3, (typeof global !== 'undefined' && global.devicePixelRatio) || 2));
    var w = 124, h = 100;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.imageSmoothingEnabled = true;
    g.drawImage(fig, 0, 0, canvas.width, canvas.height);
  };

  /* ── 스태프 SD 초상 (스카우터 안내원 · 코치 · 메디컬) ── */
  var STAFF_DEF = {
    scout: { skin: '#f0c8a0', hair: '#3a2a1a', uniform: '#2f8fc4', accent: '#f2e6c4', cap: 'scout', prop: 'clip' },
    coach: { skin: '#e8bd92', hair: '#4a3423', uniform: '#2b3a4a', accent: '#c8f169', cap: 'coach', prop: 'board' },
    medic: { skin: '#f7d3ae', hair: '#5a4632', uniform: '#f6f4ea', accent: '#d8432c', cap: 'medic', prop: 'cross' }
  };
  Art.staffFig = function (kind) {
    var d = STAFF_DEF[kind] || STAFF_DEF.scout;
    var W = 96, H = 112;
    var c = makeCanvas(W, H);
    var g = c.getContext('2d');
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.clearRect(0, 0, W, H);
    var skin = d.skin || '#f0c8a0';
    var skinD = shade(skin, -26);
    var skinL = shade(skin, 14);
    var hair = d.hair || '#3a2a1a';
    var hairD = shade(hair, -26);
    var uni = d.uniform || '#2f8fc4';
    var uniD = shade(uni, -34);

    /* 어깨 · 몸통 */
    g.beginPath();
    g.moveTo(10, 112);
    g.quadraticCurveTo(12, 82, 48, 78);
    g.quadraticCurveTo(84, 82, 86, 112);
    g.closePath();
    g.fillStyle = sdGrad(g, 0, 78, 0, 112, shade(uni, 16), uniD);
    g.fill();
    g.lineWidth = 1.9; g.strokeStyle = SD_INK; g.stroke();
    /* 셔츠 깃 */
    g.fillStyle = d.accent || '#f2e6c4';
    g.beginPath();
    g.moveTo(38, 79); g.lineTo(48, 92); g.lineTo(58, 79);
    g.lineTo(52, 77); g.lineTo(48, 84); g.lineTo(44, 77);
    g.closePath();
    g.fill();
    g.lineWidth = 1.1; g.strokeStyle = 'rgba(28,42,35,0.55)'; g.stroke();
    /* 목 */
    sdBox(g, 40, 66, 16, 16, 7, skin, SD_INK, 1.7);
    g.fillStyle = skinD;
    g.beginPath(); g.ellipse(48, 79, 8, 3.4, 0, 0, Math.PI * 2); g.fill();
    /* 귀 */
    g.fillStyle = skin;
    g.beginPath(); g.ellipse(24, 44, 4.2, 6, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(72, 44, 4.2, 6, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 1.6; g.strokeStyle = SD_INK;
    g.beginPath(); g.ellipse(24, 44, 4.2, 6, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.ellipse(72, 44, 4.2, 6, 0, 0, Math.PI * 2); g.stroke();
    /* 얼굴 */
    sdBox(g, 27, 22, 42, 46, 19, sdGrad(g, 27, 22, 69, 68, skinL, skin));
    g.save();
    sdRR(g, 27, 22, 42, 46, 19);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.20)';
    g.beginPath(); g.ellipse(38, 34, 8, 11, -0.35, 0, Math.PI * 2); g.fill();
    g.fillStyle = skinD;
    g.beginPath(); g.ellipse(66, 46, 9, 14, 0.2, 0, Math.PI * 2); g.fill();
    g.restore();
    /* 눈썹 · 눈 */
    g.strokeStyle = hairD;
    g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(35, 40); g.quadraticCurveTo(39, 37.6, 43, 39.4); g.stroke();
    g.beginPath(); g.moveTo(53, 39.4); g.quadraticCurveTo(57, 37.6, 61, 40); g.stroke();
    var eyes = [[39, 47], [57, 47]];
    for (var e = 0; e < 2; e++) {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(eyes[e][0], eyes[e][1], 4.4, 4.9, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#243029';
      g.beginPath(); g.arc(eyes[e][0] + 0.4, eyes[e][1] + 0.5, 2.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath(); g.arc(eyes[e][0] + 1.5, eyes[e][1] - 1.3, 0.85, 0, Math.PI * 2); g.fill();
      g.strokeStyle = SD_INK; g.lineWidth = 0.9;
      g.beginPath(); g.ellipse(eyes[e][0], eyes[e][1], 4.4, 4.9, 0, 0, Math.PI * 2); g.stroke();
    }
    /* 코 · 입 */
    g.strokeStyle = shade(skin, -52);
    g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(48, 52); g.quadraticCurveTo(49.4, 56, 47.4, 57.2); g.stroke();
    g.strokeStyle = '#a8442e';
    g.lineWidth = 1.7;
    g.beginPath(); g.moveTo(44, 61); g.quadraticCurveTo(48, 63.4, 52, 61); g.stroke();
    /* 볼터치 */
    g.fillStyle = 'rgba(226,120,96,0.20)';
    g.beginPath(); g.ellipse(35, 55, 4.6, 2.8, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(61, 55, 4.6, 2.8, 0, 0, Math.PI * 2); g.fill();
    /* 헤어 */
    g.fillStyle = hair;
    g.beginPath();
    g.moveTo(26, 40);
    g.quadraticCurveTo(24, 16, 48, 15);
    g.quadraticCurveTo(72, 16, 70, 40);
    g.quadraticCurveTo(66, 30, 56, 28);
    g.quadraticCurveTo(44, 26, 34, 31);
    g.quadraticCurveTo(28, 33, 26, 40);
    g.closePath();
    g.fill();
    g.lineWidth = 1.7; g.strokeStyle = SD_INK; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath(); g.ellipse(38, 24, 8, 4, -0.5, 0, Math.PI * 2); g.fill();
    /* 모자 */
    if (d.cap === 'scout') {
      g.fillStyle = '#23445c';
      g.beginPath();
      g.moveTo(26, 30); g.quadraticCurveTo(28, 12, 48, 11); g.quadraticCurveTo(68, 12, 70, 30);
      g.closePath(); g.fill();
      g.lineWidth = 1.7; g.strokeStyle = SD_INK; g.stroke();
      sdBox(g, 22, 28, 52, 6, 3, '#2f5d7d', SD_INK, 1.6);
      g.fillStyle = d.accent; g.beginPath(); g.arc(48, 19, 3.4, 0, Math.PI * 2); g.fill();
    } else if (d.cap === 'coach') {
      g.fillStyle = '#2b3a4a';
      g.beginPath();
      g.moveTo(27, 28); g.quadraticCurveTo(30, 14, 48, 13); g.quadraticCurveTo(66, 14, 69, 28);
      g.closePath(); g.fill();
      g.lineWidth = 1.7; g.strokeStyle = SD_INK; g.stroke();
      sdBox(g, 20, 26, 56, 5.5, 2.6, '#3d5266', SD_INK, 1.5);
      g.fillStyle = d.accent; g.fillRect(46, 15, 5, 2.4);
    } else {
      g.fillStyle = '#fbfaf4';
      sdBox(g, 30, 12, 36, 13, 5, '#fbfaf4', SD_INK, 1.5);
      sdBox(g, 45.4, 14.6, 5.2, 8, 1.6, '#d8432c', false);
      sdBox(g, 41.4, 18.2, 13.2, 2.8, 1.2, '#d8432c', false);
    }
    /* 가슴 소품 */
    if (d.prop === 'clip') {
      sdBox(g, 52, 88, 26, 22, 3, '#f7f4e8', SD_INK, 1.5);
      g.fillStyle = '#b9c4c9';
      for (var r = 0; r < 4; r++) { sdBox(g, 56, 92 + r * 4, 18, 1.6, 0.8, r === 0 ? '#c8432f' : 'rgba(90,105,100,0.55)', false); }
      sdBox(g, 56, 84, 12, 6, 2, '#c9d2d6', SD_INK, 1.2);
    } else if (d.prop === 'board') {
      sdBox(g, 54, 88, 28, 20, 3, '#2f6b4a', SD_INK, 1.5);
      g.strokeStyle = 'rgba(255,255,255,0.78)'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(58, 104); g.lineTo(78, 104); g.stroke();
      g.beginPath(); g.arc(68, 96, 4.4, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(68, 90); g.lineTo(68, 102); g.stroke();
      g.fillStyle = '#ffe28a';
      for (var q = 0; q < 3; q++) { g.beginPath(); g.arc(60 + q * 6, 93 + (q % 2) * 5, 1.5, 0, Math.PI * 2); g.fill(); }
    } else {
      sdBox(g, 53, 86, 24, 24, 4, '#fbfaf4', SD_INK, 1.5);
      sdBox(g, 63.4, 90, 3.2, 15, 1.3, '#d8432c', false);
      sdBox(g, 57.6, 95.9, 15, 3.2, 1.3, '#d8432c', false);
      /* 청진기 */
      g.strokeStyle = '#3d4a55'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(40, 84); g.quadraticCurveTo(34, 96, 44, 100); g.stroke();
      g.fillStyle = '#9fb4c0';
      g.beginPath(); g.arc(44, 100, 2.6, 0, Math.PI * 2); g.fill();
    }
    return c;
  };

  Art.paintStaff = function (canvas, kind) {
    var fig = Art.staffFig(kind);
    var dpr = Math.max(2, Math.min(3, (typeof global !== 'undefined' && global.devicePixelRatio) || 2));
    canvas.width = Math.round(96 * dpr);
    canvas.height = Math.round(112 * dpr);
    var g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.imageSmoothingEnabled = true;
    g.drawImage(fig, 0, 0, canvas.width, canvas.height);
  };

  /* ── 선수 목록형 카드용 S/T/P 게이지 ── */
  Art.gaugeHTML = function (v, cls) {
    var pct = clamp(v, 0, 10) * 10;
    return '<span class="gauge ' + (cls || '') + '"><i style="width:' + pct + '%"></i></span>';
  };

  /* ───────── 일러스트 · SD 스프라이트 ───────── */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /* 파일명: p01~p99 (2자리) / p100~p330 (3자리) */
  function pad3(n) { return n < 10 ? '0' + n : String(n); }

  Art.assetPrefix = '';
  Art.portraitSrc = function (p) {
    var n = (p && p.pic) ? p.pic : 1;
    return Art.assetPrefix + 'assets/portraits/p' + pad3(n) + '.png';
  };
  /* 감독 일러스트 (assets/managers/m01~m32) */
  Art.managerPortrait = function (mgr) {
    var n = (mgr && mgr.id) ? String(mgr.id).replace(/[^0-9]/g, '') : '01';
    return 'assets/managers/m' + (n.length < 2 ? '0' + n : n) + '.png';
  };
  Art.managerHead = function (mgr) {
    var n = (mgr && mgr.id) ? String(mgr.id).replace(/[^0-9]/g, '') : '01';
    return 'assets/managers/head/m' + (n.length < 2 ? '0' + n : n) + '.png';
  };
  Art.headSrc = function (p) {
    var n = (p && p.pic) ? p.pic : 1;
    return Art.assetPrefix + 'assets/portraits/head/p' + pad3(n) + '.png';
  };
  /* 카드 · 전술판용 일러스트 태그 */
  Art.portraitTag = function (p, cls, kind) {
    var src = kind === 'head' ? Art.headSrc(p) : Art.portraitSrc(p);
    return '<img class="' + (cls || '') + '" src="' + src + '" alt="" draggable="false" loading="lazy">';
  };

  var CHIBI_W = 44, CHIBI_H = 62, CHIBI_S = 3;
  var chibiCache = {};

  /* 2.5등신 SD 스프라이트 (일러스트의 헤어·피부·유니폼 색 매칭) */
  Art.chibi = function (p, kit, frame, face) {
    frame = ((frame || 0) % 4 + 4) % 4;
    face = face >= 0 ? 1 : -1;
    var key = p.id + '|' + (kit.shirt) + '|' + (kit.shorts) + '|' + frame + '|' + face + '|' + (p.pic || 0) + '|' + (p.number || 0);
    if (chibiCache[key]) { return chibiCache[key]; }
    var meta = DS.picMeta(p);
    var cv = makeCanvas(CHIBI_W * CHIBI_S, CHIBI_H * CHIBI_S);
    var g = cv.getContext('2d');
    g.setTransform(CHIBI_S, 0, 0, CHIBI_S, 0, 0);
    g.lineJoin = 'round'; g.lineCap = 'round';

    var shirt = kit.shirt || '#c8432f';
    var shorts = kit.shorts || '#1c2a25';
    var trim = kit.trim || '#f1e7cf';
    var skin = meta.skin || '#f2c9a2';
    var skinD = shade(skin, -26);
    var hair = meta.color || '#3a2a1a';
    var hairD = shade(hair, -34);
    var ink = '#141d1a';
    var out = function (w) { g.lineWidth = w || 1.05; g.strokeStyle = ink; };

    var swing = [1, 0, -1, 0][frame];
    var lift = frame === 1 ? 1 : (frame === 3 ? 0.4 : 0);
    var bob = frame % 2 === 0 ? 0 : 0.5;
    g.translate(0, bob);

    function boot(x, y, dir) {
      g.save();
      g.translate(x, y);
      if (dir < 0) { g.scale(-1, 1); }
      g.fillStyle = '#20262a';
      g.beginPath();
      g.moveTo(-3.2, 0);
      g.lineTo(2.2, 0);
      g.quadraticCurveTo(4.6, 0.4, 4.4, 2.1);
      g.lineTo(-3.4, 2.1);
      g.closePath(); g.fill();
      out(0.9); g.stroke();
      g.fillStyle = trim;
      g.fillRect(-3.2, 0.5, 6.6, 0.9);
      g.restore();
    }
    function leg(hipX, dir, phase) {
      var footX = hipX + dir * (2.4 + phase * 2.6);
      var footY = 57.2 - (phase > 0 ? 3.2 : 0);
      var kneeX = hipX + dir * (1.2 + phase * 1.4);
      var kneeY = (48 + footY) / 2 - 0.6;
      g.strokeStyle = skin; g.lineWidth = 3.5;
      g.beginPath(); g.moveTo(hipX, 45.4); g.lineTo(kneeX, kneeY); g.lineTo(footX, footY - 1.5); g.stroke();
      /* 스타킹 */
      g.strokeStyle = trim; g.lineWidth = 3.6;
      g.beginPath(); g.moveTo(kneeX, kneeY); g.lineTo(footX, footY - 1.6); g.stroke();
      g.strokeStyle = shirt;
      g.beginPath(); g.moveTo(kneeX, kneeY + 0.4); g.lineTo(footX - (footX - kneeX) * 0.35, footY - 1.9); g.stroke();
      boot(footX, footY - 1.6, dir);
      return { x: footX, y: footY };
    }
    function arm(shX, shY, dir, phase, back) {
      var handX = shX + dir * (2.2 + phase * 2.2);
      var handY = shY + 8.4 - phase * 2.4;
      g.strokeStyle = back ? shade(skin, -18) : skin;
      g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(shX, shY); g.lineTo(shX + dir * 1.6, shY + 4.4); g.lineTo(handX, handY); g.stroke();
      /* 소매 */
      g.strokeStyle = shirt; g.lineWidth = 3.6;
      g.beginPath(); g.moveTo(shX, shY); g.lineTo(shX + dir * 1.7, shY + 3.6); g.stroke();
      g.fillStyle = back ? shade(skin, -18) : skin;
      g.beginPath(); g.arc(handX, handY, 1.7, 0, Math.PI * 2); g.fill();
    }

    /* 뒤쪽 팔 · 다리 */
    arm(12.6, 31.4, -1, -swing, true);
    leg(19.2, -1, -swing * 0.9 + (frame === 1 ? 0.6 : 0));

    /* 몸통 (유니폼) */
    var bodyG = g.createLinearGradient(13, 27, 31, 43);
    bodyG.addColorStop(0, shade(shirt, 16));
    bodyG.addColorStop(0.55, shirt);
    bodyG.addColorStop(1, shade(shirt, -26));
    g.fillStyle = bodyG;
    g.beginPath();
    g.moveTo(14.6, 27.6);
    g.quadraticCurveTo(22, 25.4, 29.4, 27.6);
    g.quadraticCurveTo(32.4, 33, 31.4, 42.6);
    g.quadraticCurveTo(22, 44.8, 12.6, 42.6);
    g.quadraticCurveTo(11.6, 33, 14.6, 27.6);
    g.closePath(); g.fill();
    out(1.1); g.stroke();
    /* 어깨 트림 · 칼라 */
    g.fillStyle = trim;
    g.beginPath();
    g.moveTo(14.8, 27.4); g.quadraticCurveTo(12.4, 29.6, 12.8, 32.2);
    g.lineTo(16.4, 31.6); g.quadraticCurveTo(16.6, 29.2, 17.8, 27.4);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(29.2, 27.4); g.quadraticCurveTo(31.6, 29.6, 31.2, 32.2);
    g.lineTo(27.6, 31.6); g.quadraticCurveTo(27.4, 29.2, 26.2, 27.4);
    g.closePath(); g.fill();
    g.strokeStyle = trim; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(19.4, 26.6); g.quadraticCurveTo(22, 29.2, 24.6, 26.6); g.stroke();
    /* 등번호 */
    if (p.number) {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.font = 'bold 6px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(p.number), 22, 36.4);
    }
    /* 반바지 */
    g.fillStyle = shorts;
    g.beginPath();
    g.moveTo(13.4, 42.2); g.quadraticCurveTo(22, 44.4, 30.6, 42.2);
    g.lineTo(30, 47.6); g.quadraticCurveTo(26, 48.8, 22.6, 47.4);
    g.quadraticCurveTo(18, 48.8, 14, 47.6);
    g.closePath(); g.fill();
    out(1); g.stroke();
    g.strokeStyle = trim; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(14, 44.4); g.lineTo(30, 44.4); g.stroke();

    /* 앞쪽 다리 · 팔 */
    leg(24.8, 1, swing);
    arm(31.4, 31.4, 1, swing, false);

    /* 목 */
    g.fillStyle = skinD;
    g.fillRect(20, 24.6, 4, 3.6);

    /* 머리 */
    g.save();
    var hx = 22, hy = 14.6;
    /* 헤어 뒷면 */
    g.fillStyle = hairD;
    if (meta.hair === 'afro') {
      g.beginPath(); g.arc(hx, hy - 1.5, 13.4, 0, Math.PI * 2); g.fill();
    } else if (meta.hair === 'ponytail' || meta.hair === 'braids') {
      g.beginPath();
      g.ellipse(hx + 9.6, hy + 2.2, 4.6, 8.2, -0.35, 0, Math.PI * 2);
      g.fill();
      out(1); g.stroke();
    }
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(hx, hy, 10.4, 10.9, 0, 0, Math.PI * 2);
    g.fill();
    out(1); g.stroke();

    /* 헤어 앞면 */
    g.fillStyle = hair;
    var style = meta.hair || 'spiky';
    g.beginPath();
    if (style === 'spiky') {
      g.moveTo(hx - 10.4, hy + 1.6);
      g.quadraticCurveTo(hx - 12.4, hy - 8, hx - 6.2, hy - 10.4);
      g.lineTo(hx - 7.4, hy - 14.2);
      g.lineTo(hx - 2.2, hy - 11.2);
      g.lineTo(hx - 0.4, hy - 15.6);
      g.lineTo(hx + 3.4, hy - 11.4);
      g.lineTo(hx + 6.6, hy - 14.6);
      g.lineTo(hx + 7.2, hy - 9.8);
      g.quadraticCurveTo(hx + 12.6, hy - 7, hx + 10.4, hy + 1.4);
      g.quadraticCurveTo(hx + 8.2, hy - 5.4, hx + 4.2, hy - 6.4);
      g.quadraticCurveTo(hx - 2.4, hy - 3.4, hx - 5.2, hy - 5.2);
      g.quadraticCurveTo(hx - 8.2, hy - 4.4, hx - 10.4, hy + 1.6);
    } else if (style === 'undercut' || style === 'swoop' || style === 'silver') {
      g.moveTo(hx - 10.6, hy + 1.2);
      g.quadraticCurveTo(hx - 12.6, hy - 8.6, hx - 5.4, hy - 10.8);
      g.quadraticCurveTo(hx + 2.6, hy - 13.4, hx + 8.6, hy - 9.4);
      g.lineTo(hx + 11.4, hy - 6.2);
      g.quadraticCurveTo(hx + 4.4, hy - 8.2, hx + 1.4, hy - 5.6);
      g.quadraticCurveTo(hx - 3.4, hy - 3.2, hx - 10.6, hy + 1.2);
    } else if (style === 'mohawk') {
      g.moveTo(hx - 10.2, hy + 0.8);
      g.quadraticCurveTo(hx - 8.6, hy - 7.6, hx - 3.2, hy - 9.6);
      g.lineTo(hx - 1.6, hy - 14.6);
      g.lineTo(hx + 2.4, hy - 10.2);
      g.lineTo(hx + 5.4, hy - 14.2);
      g.lineTo(hx + 6.2, hy - 9.2);
      g.quadraticCurveTo(hx + 10.4, hy - 6.4, hx + 10.2, hy + 0.8);
      g.quadraticCurveTo(hx + 5.4, hy - 4.6, hx, hy - 5.4);
      g.quadraticCurveTo(hx - 5.6, hy - 4.4, hx - 10.2, hy + 0.8);
    } else if (style === 'buzz') {
      g.moveTo(hx - 10.2, hy - 1.4);
      g.quadraticCurveTo(hx - 8.4, hy - 10.4, hx, hy - 11.2);
      g.quadraticCurveTo(hx + 8.4, hy - 10.4, hx + 10.2, hy - 1.4);
      g.quadraticCurveTo(hx + 4, hy - 6.6, hx, hy - 6.6);
      g.quadraticCurveTo(hx - 4, hy - 6.6, hx - 10.2, hy - 1.4);
    } else if (style === 'afro') {
      g.moveTo(hx - 11.4, hy - 0.6);
      g.arc(hx, hy - 1.8, 12.6, Math.PI * 0.95, Math.PI * 2.1);
      g.quadraticCurveTo(hx + 4.6, hy - 8.4, hx, hy - 6.4);
      g.quadraticCurveTo(hx - 5.2, hy - 8.2, hx - 11.4, hy - 0.6);
    } else if (style === 'braids') {
      g.moveTo(hx - 10.4, hy - 0.4);
      g.quadraticCurveTo(hx - 9.6, hy - 10.6, hx, hy - 11.4);
      g.quadraticCurveTo(hx + 9.6, hy - 10.6, hx + 10.4, hy - 0.4);
      g.quadraticCurveTo(hx + 4.8, hy - 6.6, hx, hy - 6.6);
      g.quadraticCurveTo(hx - 4.8, hy - 6.6, hx - 10.4, hy - 0.4);
    } else {
      g.moveTo(hx - 10.4, hy + 0.6);
      g.quadraticCurveTo(hx - 10.6, hy - 9.6, hx, hy - 10.6);
      g.quadraticCurveTo(hx + 10.6, hy - 9.6, hx + 10.4, hy + 0.6);
      g.quadraticCurveTo(hx + 5, hy - 5.6, hx, hy - 5.6);
      g.quadraticCurveTo(hx - 5, hy - 5.6, hx - 10.4, hy + 0.6);
    }
    g.closePath(); g.fill();
    out(0.9); g.stroke();

    /* 눈 · 눈썹 · 입 */
    g.fillStyle = '#20262c';
    g.beginPath(); g.ellipse(hx - 4.2, hy + 2.2, 1.85, 2.7, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(hx + 4.2, hy + 2.2, 1.85, 2.7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(hx - 4.9, hy + 1.1, 0.75, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(hx + 3.5, hy + 1.1, 0.75, 0, Math.PI * 2); g.fill();
    g.strokeStyle = hairD; g.lineWidth = 1;
    g.beginPath(); g.moveTo(hx - 6.4, hy - 1.4); g.lineTo(hx - 2.6, hy - 2.2); g.stroke();
    g.beginPath(); g.moveTo(hx + 6.4, hy - 1.4); g.lineTo(hx + 2.6, hy - 2.2); g.stroke();
    g.strokeStyle = '#8a4a3c'; g.lineWidth = 0.8;
    g.beginPath(); g.arc(hx, hy + 5.2, 1.6, 0.25, Math.PI - 0.25); g.stroke();
    g.restore();

    chibiCache[key] = cv;
    return cv;
  };

  /* ───────── 피치용 2.5등신 SD v6 — 일러스트 얼굴 + 유니폼 디테일 + 포즈 애니메이션 ───────── */
  var SD_W = 60, SD_H = 84, SD_S = 2.0;
  var sdCache = {};
  var headImgCache = {};

  /* 얼굴 크롭 실측 사각형(p01~p330) — 일러스트마다 여백·구도가 달라 얼굴만 잘라 쓴다 */
  var HEAD_BOX_RAW = '-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-20,-5,269;-21,-6,283;-21,-6,279;-7,-5,253;-20,-5,273;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;-21,-6,283;42,-2,121;53,-3,133;31,-4,160;30,-3,138;31,-4,164;53,-3,112;65,-2,103;74,-2,109;36,-3,147;36,-3,148;37,-3,142;76,-2,97;29,-4,193;22,-4,177;45,-3,148;33,-4,178;53,-3,146;39,-3,161;28,-4,205;8,-5,224;34,-3,145;23,-3,165;52,-3,141;26,-3,149;22,-3,159;15,-4,195;17,-3,171;10,-4,197;52,-3,142;11,-4,192;16,-4,186;12,-5,210;22,-4,168;15,-4,184;12,-5,208;5,-4,192;27,-4,182;9,-4,182;-13,-5,269;58,-4,179;13,-3,171;13,-4,213;6,-5,227;-1,-4,217;-2,-5,240;6,-4,178;34,-4,182;4,-5,230;55,-3,132;63,-3,134;60,-3,118;33,-3,130;35,-3,133;38,-3,135;64,-3,141;90,-3,127;60,-3,108;19,-4,174;63,-3,151;53,-2,121;-12,-5,243;24,-4,162;26,-4,197;-16,-5,273;49,-4,188;40,-3,138;63,-3,136;33,-2,121;20,-4,211;45,-3,138;-21,-6,276;44,-3,130;63,-3,149;30,-4,160;21,-3,127;26,-3,161;28,-4,182;59,-4,185;48,-2,109;23,-4,201;34,-3,165;24,-4,181;21,-4,188;59,-4,152;36,-4,166;16,-4,198;47,-3,140;25,-4,156;12,-4,184;31,-4,172;42,-3,149;2,-4,191;32,-3,175;58,-4,152;39,-3,155;88,-3,139;71,-2,121;40,-4,191;59,-3,134;-3,-5,244;13,-5,206;34,-3,134;40,-4,182;47,-3,151;36,-3,133;6,-4,225;30,-3,155;63,-3,126;17,-4,172;48,-3,145;16,-4,160;18,-5,218;51,-3,145;25,-4,179;25,-3,147;8,-4,192;38,-4,187;-7,-3,138;-3,-5,241;32,-3,146;15,-4,184;36,-4,179;-19,-5,273;25,-4,189;39,-4,162;41,-3,171;40,-3,159;7,-5,231;47,-3,167;35,-3,146;49,-4,168;31,-3,173;27,-4,166;49,-4,152;50,-3,142;28,-4,152;63,-3,149;32,-4,181;36,-4,166;30,-4,186;57,-4,158;30,-4,166;55,-4,156;23,-4,178;46,-3,139;17,-4,185;28,-4,186;63,-3,132;19,-4,186;25,-4,166;27,-3,165;11,-4,200;53,-3,149;35,-3,173;36,-4,156;43,-3,175;61,-3,132;65,-3,138;51,-3,132;25,-3,151;32,-4,168;37,-3,143;65,-3,116;39,-3,143;48,-3,169;47,-3,143;29,-4,194;49,-3,130;75,-3,102;32,-4,198;34,-3,133;66,-3,126;6,-4,225;23,-4,215;26,-3,149;56,-3,136;65,-3,143;78,-3,106;44,-3,136;24,-3,167;59,-3,145;85,-2,100;-5,-5,244;11,-5,206;28,-4,195;44,-3,142;28,-4,181;29,-3,173;21,-5,208;25,-3,165;43,-3,159;26,-4,174;12,-4,217;84,-3,128;36,-3,153;33,-3,134;41,-4,162;20,-4,160;46,-3,149;48,-3,139;16,-4,188;30,-3,143;1,-5,233;54,-4,158;43,-4,178;56,-3,134;14,-5,233;59,-4,162;36,-3,159;50,-4,164;8,-3,173;33,-3,169;7,-4,215;48,-3,130;8,-3,167;19,-4,194;10,-4,205;20,-4,189;42,-3,142;80,-3,135;-13,-5,273;-3,-5,237;34,-3,138;44,-3,141;70,-3,149;13,-5,232;42,-3,134;-14,-4,188;50,-4,166;37,-4,172;-2,-5,218;31,-4,166;80,-3,155;28,-3,171;75,-3,130;6,-5,241;18,-3,145;7,-4,217;32,-4,189;-1,-5,227;59,-4,180;7,-5,226;24,-3,167;12,-4,185;17,-4,197;9,-4,192;17,-4,168;14,-3,145;19,-3,149;10,-3,161;31,-5,210;33,-3,165;72,-4,160;7,-4,187;41,-3,169;-17,-5,259;9,-4,160;59,-4,152;-10,-4,197;19,-3,173;51,-3,146;44,-3,147;33,-3,146;7,-5,250;9,-5,244;35,-4,207;-11,-5,210;46,-3,133;39,-4,186;-10,-6,270;53,-3,140;-12,-3,161;47,-5,206;28,-3,143;3,-4,186;14,-3,146;-15,-5,265;40,-4,217;-8,-5,265;23,-4,195;62,-3,141;13,-4,162;37,-4,179;0,-4,194;-11,-4,205;-1,-5,261;53,-4,160;-10,-3,173;32,-4,164;29,-3,161;2,-4,193;54,-4,164;-16,-4,217;28,-4,172;58,-3,133;24,-3,169;71,-3,127;31,-4,152';
  var HEAD_BOX = null;
  function headBox(n) {
    if (!HEAD_BOX) {
      HEAD_BOX = {};
      var arr = HEAD_BOX_RAW.split(';'), i, q;
      for (i = 0; i < arr.length; i++) {
        q = arr[i].split(',');
        HEAD_BOX[i + 1] = { x: +q[0], y: +q[1], s: +q[2] };
      }
    }
    return HEAD_BOX[n] || { x: -21, y: -6, s: 283 };
  }
  Art.headBox = headBox;

  /* 일러스트 얼굴(head/*.png) 이미지 로더 — 한 번만 생성 */
  Art.headImage = function (p) {
    var n = (p && p.pic) ? p.pic : 1;
    if (headImgCache[n]) { return headImgCache[n]; }
    if (typeof Image === 'undefined') { return null; }
    var img = new Image();
    img.src = Art.assetPrefix + 'assets/portraits/head/p' + pad3(n) + '.png';
    headImgCache[n] = img;
    return img;
  };
  /* 이미지가 디코드되면 complete 플래그가 늦게 서는 브라우저가 있어 naturalWidth 로 판정 */
  Art.headReady = function (p) {
    var img = Art.headImage(p);
    return !!(img && (img.naturalWidth || img.width) > 0);
  };
  /* 경기 전 얼굴 이미지 프리로드 — 첫 프레임부터 얼굴이 뜨도록 */
  Art.preloadHeads = function (list) {
    var i;
    for (i = 0; i < (list || []).length; i++) { Art.headImage(list[i] && list[i].player ? list[i].player : list[i]); }
  };

  /* 유니폼 패턴 — 같은 유니폼은 항상 같은 디자인 (0 단색 · 1 세로줄 · 2 가로밴드 · 3 새시 · 4 어깨배색) */
  var KIT_STYLE = {};
  function kitStyleOf(kit) {
    var k = (kit && kit.shirt ? kit.shirt : '#888888') + '|' + (kit && kit.trim ? kit.trim : '#ffffff') + '|' + (kit && kit.shorts ? kit.shorts : '#222222');
    if (KIT_STYLE[k] != null) { return KIT_STYLE[k]; }
    var h = 7, i;
    for (i = 0; i < k.length; i++) { h = (h * 37 + k.charCodeAt(i)) % 99991; }
    KIT_STYLE[k] = h % 5;
    return KIT_STYLE[k];
  }

  /* 헤어 실루엣 — 일러스트 얼굴 뒤로 삐져나오는 머리카락 (스타일별로 모양이 다르다) */
  function hairBackPath(g, st, cx, cy, hair) {
    g.save();
    g.beginPath();
    g.rect(cx - 17, cy - 24, 34, 24.6);   /* 머리 위쪽(정수리)만 노출 */
    g.clip();
    g.fillStyle = hair;
    if (st === 'afro') {
      g.beginPath(); g.ellipse(cx, cy - 2.0, 14.8, 14.6, 0, 0, Math.PI * 2); g.fill();
    } else if (st === 'mohawk') {
      g.beginPath();
      g.moveTo(cx - 12, cy - 3);
      g.quadraticCurveTo(cx - 4, cy - 20, cx + 1, cy - 19);
      g.quadraticCurveTo(cx + 8, cy - 18, cx + 12, cy - 3);
      g.closePath(); g.fill();
    } else if (st === 'spiky') {
      g.beginPath();
      g.moveTo(cx - 13.6, cy - 1);
      g.lineTo(cx - 16.5, cy - 12);
      g.lineTo(cx - 9.5, cy - 11.5);
      g.lineTo(cx - 9.5, cy - 20.5);
      g.lineTo(cx - 2.5, cy - 14.5);
      g.lineTo(cx + 1.5, cy - 22);
      g.lineTo(cx + 6.5, cy - 14);
      g.lineTo(cx + 12.5, cy - 18.5);
      g.lineTo(cx + 12.5, cy - 9.5);
      g.lineTo(cx + 16.6, cy - 11);
      g.lineTo(cx + 13.8, cy - 1);
      g.closePath(); g.fill();
    } else if (st === 'ponytail' || st === 'braids') {
      g.beginPath(); g.ellipse(cx, cy - 2.4, 14.0, 14.8, 0, 0, Math.PI * 2); g.fill();
      g.beginPath();
      g.moveTo(cx - 12.6, cy + 1);
      g.quadraticCurveTo(cx - 20, cy + 6, cx - 17.4, cy + 15);
      g.quadraticCurveTo(cx - 13.4, cy + 8, cx - 10.6, cy + 4);
      g.closePath(); g.fill();
      if (st === 'braids') {
        g.beginPath();
        g.moveTo(cx + 12.4, cy + 2);
        g.quadraticCurveTo(cx + 18.6, cy + 9, cx + 15.6, cy + 17);
        g.quadraticCurveTo(cx + 12.4, cy + 9, cx + 10.4, cy + 5);
        g.closePath(); g.fill();
      }
    } else if (st === 'wavy' || st === 'long') {
      g.beginPath(); g.ellipse(cx, cy - 1.0, 14.4, 15.2, 0, 0, Math.PI * 2); g.fill();
      g.beginPath();
      g.moveTo(cx - 14.4, cy + 1);
      g.quadraticCurveTo(cx - 17.6, cy + 9, cx - 12.6, cy + 14);
      g.quadraticCurveTo(cx - 11.6, cy + 7, cx - 11, cy + 3);
      g.closePath(); g.fill();
    } else if (st === 'buzz' || st === 'bald') {
      g.beginPath(); g.ellipse(cx, cy - 7.4, 11.2, 8.4, 0, 0, Math.PI * 2); g.fill();
    } else {
      /* short · slick · undercut · swoop */
      g.beginPath(); g.ellipse(cx, cy - 5.6, 11.6, 10.6, 0, 0, Math.PI * 2); g.fill();
    }
    g.restore()
  }

  function hairFrontPath(g, st, cx, cy, hair, hairD) {
    g.save();
    g.beginPath(); g.ellipse(cx, cy + 0.2, 12.4, 14.2, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = hexAlpha(hair, 0.94);
    g.fillRect(cx - 14, cy - 16.4, 28, 8.0);
    if (st === 'spiky' || st === 'mohawk' || st === 'swoop' || st === 'undercut') {
      g.beginPath();
      g.moveTo(cx - 12.4, cy - 8.2);
      g.lineTo(cx - 7.6, cy - 4.4);
      g.lineTo(cx - 3.4, cy - 8.4);
      g.lineTo(cx + 1.4, cy - 4.0);
      g.lineTo(cx + 5.6, cy - 8.2);
      g.lineTo(cx + 9.8, cy - 4.6);
      g.lineTo(cx + 12.4, cy - 8.4);
      g.lineTo(cx + 12.4, cy - 13.0);
      g.lineTo(cx - 12.4, cy - 13.0);
      g.closePath(); g.fill();
    } else if (st === 'wavy' || st === 'long' || st === 'ponytail' || st === 'braids') {
      g.beginPath();
      g.moveTo(cx - 12.6, cy - 8.0);
      g.quadraticCurveTo(cx - 10.0, cy - 5.6, cx - 7.2, cy - 7.8);
      g.quadraticCurveTo(cx - 3.2, cy - 10.4, cx + 0.6, cy - 8.2);
      g.quadraticCurveTo(cx + 5.0, cy - 5.8, cx + 8.4, cy - 8.4);
      g.quadraticCurveTo(cx + 10.8, cy - 10.2, cx + 12.6, cy - 8.4);
      g.lineTo(cx + 12.6, cy - 13.2);
      g.lineTo(cx - 12.6, cy - 13.2);
      g.closePath(); g.fill();
    }
    g.restore();
    /* 머리카락 하이라이트 */
    g.strokeStyle = hexAlpha('#ffffff', 0.24);
    g.lineWidth = 1.0;
    g.beginPath();
    g.ellipse(cx, cy - 8.6, 9.6, 4.4, 0, Math.PI * 1.08, Math.PI * 1.94);
    g.stroke();
  }

  /* 포즈별 관절 각도 (라디안, 0 = 아래로 수직) */
  function poseRig(pose, frame, tSec) {
    var f = ((frame || 0) % 4 + 4) % 4;
    var r = {
      lean: 0.06, bob: 0, hop: 0,
      legA: { a: 0.16, k: 0.10 }, legB: { a: -0.16, k: 0.10 },
      armA: { a: -0.30, e: 0.42 }, armB: { a: 0.30, e: 0.42 },
      headTilt: 0, headDy: 0
    };
    var t = tSec || 0;
    if (pose === 'run' || pose === 'dribble') {
      var thr = [[0.78, -0.66], [0.24, -0.16], [-0.66, 0.78], [-0.16, 0.24]][f];
      var kne = [[0.28, 0.98], [0.92, 0.22], [0.98, 0.28], [0.20, 0.94]][f];
      r.legA = { a: thr[0], k: kne[0] };
      r.legB = { a: thr[1], k: kne[1] };
      r.armA = { a: -thr[0] * 0.78, e: 0.55 + (f % 2 ? 0.2 : -0.1) };
      r.armB = { a: -thr[1] * 0.78, e: 0.55 + (f % 2 ? -0.1 : 0.2) };
      r.lean = pose === 'dribble' ? 0.22 : 0.15;
      r.bob = f % 2 ? 0.9 : 0;
      r.headDy = f % 2 ? 0.4 : 0;
      r.headTilt = 0.04;
    } else if (pose === 'kick') {
      r.legA = { a: 1.22, k: -0.42 };        /* 슈팅 다리 — 앞으로 뻗는다 */
      r.legB = { a: 0.02, k: 0.06 };         /* 디딤발 */
      r.armA = { a: -1.05, e: 0.30 };
      r.armB = { a: 0.95, e: 0.45 };
      r.lean = -0.10;
      r.headTilt = -0.06;
    } else if (pose === 'pass') {
      r.legA = { a: 0.86, k: -0.20 };
      r.legB = { a: -0.06, k: 0.10 };
      r.armA = { a: -0.62, e: 0.48 };
      r.armB = { a: 0.66, e: 0.50 };
      r.lean = 0.04;
    } else if (pose === 'tackle') {
      r.legA = { a: 1.32, k: 0.10 };
      r.legB = { a: 0.42, k: 0.85 };
      r.armA = { a: -1.55, e: 0.24 };
      r.armB = { a: 1.30, e: 0.30 };
      r.lean = -0.30;
      r.headTilt = -0.10;
    } else if (pose === 'dive') {
      r.legA = { a: 0.30, k: 0.55 };
      r.legB = { a: -0.34, k: 0.35 };
      r.armA = { a: -2.30, e: -0.16 };
      r.armB = { a: -2.05, e: -0.10 };
      r.lean = 0.10;
      r.headTilt = 0.10;
    } else if (pose === 'celebrate') {
      r.legA = { a: 0.26, k: 0.34 };
      r.legB = { a: -0.30, k: 0.30 };
      r.armA = { a: -2.60, e: 0.22 };
      r.armB = { a: 2.60, e: -0.22 };
      r.lean = -0.06;
      r.hop = Math.abs(Math.sin(t * 7)) * 2.2;
    } else {
      /* idle — 가슴이 오르내리는 호흡 */
      r.legA = { a: 0.13, k: 0.06 };
      r.legB = { a: -0.13, k: 0.06 };
      r.armA = { a: -0.24, e: 0.34 };
      r.armB = { a: 0.24, e: 0.34 };
      r.lean = 0.05;
      r.bob = Math.sin(t * 2.6) * 0.4;
    }
    return r;
  }

  Art.sdSprite = function (p, kit, optOrFrame, facingArg) {
    var opt = (optOrFrame && typeof optOrFrame === 'object') ? optOrFrame : { frame: optOrFrame, facing: facingArg };
    var pose = opt.pose || 'idle';
    var frame = ((opt.frame || 0) % 4 + 4) % 4;
    var gk = opt.gk != null ? !!opt.gk : (p.pos === 'GK');
    var ready = Art.headReady(p) ? 1 : 0;
    var key = p.id + '|' + kit.shirt + '|' + kit.shorts + '|' + kit.trim + '|' + pose + '|' +
      (pose === 'idle' || pose === 'celebrate' ? '' : frame) + '|' + (gk ? 'g' : 'f') + '|' + (p.pic || 0) + '|' + (p.number || 0) + '|' + ready;
    if (sdCache[key]) { return sdCache[key]; }
    var meta = DS.picMeta(p);
    var cv = makeCanvas(SD_W * SD_S, SD_H * SD_S);
    var g = cv.getContext('2d');
    g.setTransform(SD_S, 0, 0, SD_S, 0, 0);
    g.lineJoin = 'round'; g.lineCap = 'round';

    var shirt = kit.shirt || '#c8432f';
    var shorts = kit.shorts || '#16241f';
    var trim = kit.trim || '#f1e7cf';
    var skin = meta.skin || '#f2c9a2';
    var skinD = shade(skin, -26);
    var skinD2 = shade(skin, -44);
    var hair = meta.color || '#3a2a1a';
    var hairD = shade(hair, -36);
    var ink = '#101a16';
    var sock = opt.sock || trim;
    var glove = gk ? '#f4fbff' : skin;
    var gkKit = gk ? shade(shirt, -8) : shirt;
    var style = opt.style != null ? opt.style : kitStyleOf(kit);

    var rig = poseRig(pose, frame, opt.t || 0);
    var hipX = 30, hipY = 60.4;
    var hairSt = meta.hair || 'short';
    var OL = function (w) { g.lineWidth = w || 1.0; g.strokeStyle = ink; };

    /* ── 다리 ── */
    function boot(x, y, ang, front) {
      g.save();
      g.translate(x, y);
      g.rotate(-ang * 0.55);
      g.fillStyle = front ? '#1a2226' : '#12181c';
      g.beginPath();
      g.moveTo(-3.0, 0.2);
      g.lineTo(2.4, -0.5);
      g.quadraticCurveTo(5.6, 0.1, 5.0, 2.4);
      g.lineTo(-3.2, 2.4);
      g.closePath(); g.fill();
      OL(0.8); g.stroke();
      g.fillStyle = trim;
      g.fillRect(-3.0, 0.85, 7.6, 0.8);
      g.fillStyle = 'rgba(240,248,255,0.8)';
      g.fillRect(-3.0, 2.1, 7.8, 0.6);
      g.restore();
    }

    function leg(hx, hy, a, k, front) {
      var kx = hx + Math.sin(a) * 10.4, ky = hy + Math.cos(a) * 10.4;
      var ax = kx + Math.sin(a + k) * 9.2, ay = ky + Math.cos(a + k) * 9.2;
      g.strokeStyle = front ? skin : skinD;
      g.lineWidth = 5.7;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.stroke();
      /* 스타킹 */
      g.strokeStyle = front ? sock : shade(sock, -18);
      g.lineWidth = 5.1;
      g.beginPath(); g.moveTo(kx, ky); g.lineTo(ax, ay); g.stroke();
      /* 스타킹 밴드 */
      g.strokeStyle = front ? shirt : shade(shirt, -24);
      g.lineWidth = 5.2;
      g.beginPath();
      g.moveTo(kx + (ax - kx) * 0.10, ky + (ay - ky) * 0.10);
      g.lineTo(kx + (ax - kx) * 0.20, ky + (ay - ky) * 0.20);
      g.stroke();
      boot(ax, ay, a + k, front);
    }

    /* ── 팔 ── */
    function arm(sx, sy, a, e, front) {
      var ex = sx + Math.sin(a) * 7.6, ey = sy + Math.cos(a) * 7.6;
      var hx = ex + Math.sin(a + e) * 6.8, hy = ey + Math.cos(a + e) * 6.8;
      g.strokeStyle = front ? gkKit : shade(gkKit, -22);
      g.lineWidth = 5.6;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
      /* 소매 트림 */
      g.strokeStyle = front ? trim : shade(trim, -22);
      g.lineWidth = 5.7;
      g.beginPath();
      g.moveTo(ex - (ex - sx) * 0.18, ey - (ey - sy) * 0.18);
      g.lineTo(ex, ey);
      g.stroke();
      g.strokeStyle = front ? (gk ? gkKit : skin) : shade(gk ? gkKit : skin, -20);
      g.lineWidth = 4.3;
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(hx, hy); g.stroke();
      g.fillStyle = front ? glove : shade(glove, -14);
      g.beginPath(); g.arc(hx, hy, gk ? 2.5 : 1.8, 0, Math.PI * 2); g.fill();
      OL(0.8); g.stroke();
    }

    /* ── 몸통 · 유니폼 ── */
    function torsoPath() {
      g.beginPath();
      g.moveTo(21.6, 39.8);
      g.quadraticCurveTo(18.0, 43.4, 18.6, 50.0);
      g.quadraticCurveTo(19.1, 56.6, 21.0, 60.2);
      g.lineTo(39.0, 60.2);
      g.quadraticCurveTo(40.9, 56.6, 41.4, 50.0);
      g.quadraticCurveTo(42.0, 43.4, 38.4, 39.8);
      g.quadraticCurveTo(30.0, 36.8, 21.6, 39.8);
      g.closePath();
    }

    function drawTorso() {
      var bodyG = g.createLinearGradient(18, 40, 42, 62);
      bodyG.addColorStop(0, shade(shirt, 16));
      bodyG.addColorStop(0.55, shirt);
      bodyG.addColorStop(1, shade(shirt, -26));
      g.fillStyle = bodyG;
      torsoPath(); g.fill(); OL(1.05); g.stroke();

      g.save();
      torsoPath(); g.clip();
      var i;
      if (style === 1) {                      /* 세로 줄무늬 */
        g.fillStyle = hexAlpha(trim, 0.85);
        for (i = 0; i < 7; i++) { g.fillRect(19 + i * 3.4, 36, 1.7, 25); }
      } else if (style === 2) {               /* 가로 밴드 */
        g.fillStyle = hexAlpha(trim, 0.8);
        g.fillRect(16, 45.6, 28, 3.2);
        g.fillRect(16, 54.0, 28, 2.2);
      } else if (style === 3) {               /* 사선 새시 */
        g.strokeStyle = hexAlpha(trim, 0.75);
        g.lineWidth = 4.2;
        g.beginPath(); g.moveTo(17, 43.4); g.lineTo(43, 57.4); g.stroke();
      } else if (style === 4) {               /* 어깨 배색 */
        g.fillStyle = hexAlpha(trim, 0.72);
        g.beginPath();
        g.moveTo(16, 36.4); g.lineTo(44, 36.4); g.lineTo(44, 43.8);
        g.quadraticCurveTo(30, 48.0, 16, 43.8);
        g.closePath(); g.fill();
      }
      /* 유니폼 결 */
      g.strokeStyle = hexAlpha('#ffffff', 0.10);
      g.lineWidth = 0.7;
      for (i = 0; i < 3; i++) { g.beginPath(); g.moveTo(20 + i * 7, 38); g.lineTo(20 + i * 7, 61); g.stroke(); }
      g.restore();

      /* 칼라 */
      g.fillStyle = trim;
      g.beginPath();
      g.moveTo(25.4, 38.8);
      g.quadraticCurveTo(30, 43.4, 34.6, 38.8);
      g.quadraticCurveTo(30, 41.6, 25.4, 38.8);
      g.closePath(); g.fill();
      g.strokeStyle = shade(trim, -30); g.lineWidth = 0.7; g.stroke();
      /* 어깨 라인 */
      g.strokeStyle = hexAlpha('#000000', 0.18); g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(21.4, 40.0); g.quadraticCurveTo(30, 37.0, 38.6, 40.0); g.stroke();

      /* 등번호 */
      if (p.number) {
        g.fillStyle = hexAlpha('#ffffff', 0.94);
        g.font = '800 5.6px system-ui, -apple-system, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(p.number), 30, 49.4);
        g.strokeStyle = hexAlpha('#000000', 0.20); g.lineWidth = 0.6;
        g.strokeText(String(p.number), 30, 50.2);
      }
    }

    function drawShorts() {
      g.fillStyle = shorts;
      g.beginPath();
      g.moveTo(20.2, 58.6);
      g.lineTo(39.8, 58.6);
      g.lineTo(40.8, 67.4);
      g.quadraticCurveTo(35.4, 68.6, 33.4, 66.2);
      g.quadraticCurveTo(30, 68.6, 26.6, 66.2);
      g.quadraticCurveTo(24.6, 68.6, 19.2, 67.4);
      g.closePath(); g.fill();
      OL(0.95); g.stroke();
      g.strokeStyle = trim; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(20.6, 60.8); g.lineTo(39.4, 60.8); g.stroke();
    }

    /* ── 머리 ── */
    function drawHead(cx, cy) {
      /* 목 */
      g.fillStyle = skinD;
      g.beginPath();
      g.moveTo(cx - 3.5, cy + 8.4);
      g.lineTo(cx + 3.5, cy + 8.4);
      g.lineTo(cx + 3.3, cy + 20.0);
      g.lineTo(cx - 3.3, cy + 20.0);
      g.closePath(); g.fill();

      hairBackPath(g, hairSt, cx, cy, hair);

      /* 귀 */
      g.fillStyle = skin;
      g.beginPath(); g.ellipse(cx - 11.8, cy + 1.4, 2.1, 2.9, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(cx + 11.8, cy + 1.4, 2.1, 2.9, 0, 0, Math.PI * 2); g.fill();

      /* 얼굴 — 일러스트 크롭 (투명 여백은 피부색으로 채운다) */
      var img = Art.headImage(p);
      g.fillStyle = skin;
      g.beginPath(); g.ellipse(cx, cy + 0.2, 12.4, 14.2, 0, 0, Math.PI * 2); g.fill();
      g.save();
      g.beginPath(); g.ellipse(cx, cy + 0.2, 12.4, 14.2, 0, 0, Math.PI * 2); g.clip();
      if (img && (img.naturalWidth || img.width) > 0) {
        var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        var fb = headBox(p.pic || 1);
        var kx = iw / 240, ky = ih / 240;
        g.drawImage(img, fb.x * kx, fb.y * ky, fb.s * kx, fb.s * ky, cx - 13.9, cy - 17.8, 27.8, 28.8);
      } else {
        g.fillStyle = skin;
        g.fillRect(cx - 15, cy - 16, 30, 32);
        g.fillStyle = hair;
        g.beginPath(); g.ellipse(cx, cy - 5, 12.6, 10.6, 0, Math.PI, Math.PI * 2); g.fill();
        g.fillStyle = '#20262c';
        g.beginPath(); g.ellipse(cx - 4.4, cy + 1.4, 1.7, 2.5, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(cx + 4.4, cy + 1.4, 1.7, 2.5, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#8a4a3c'; g.lineWidth = 0.9;
        g.beginPath(); g.arc(cx, cy + 5.4, 2.2, 0.3, Math.PI - 0.3); g.stroke();
      }
      /* 얼굴 아래쪽 음영 (턱 브이) */
      var sh = g.createLinearGradient(0, cy + 6, 0, cy + 15);
      sh.addColorStop(0, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.16)');
      g.fillStyle = sh;
      g.fillRect(cx - 14, cy + 6, 28, 10);
      g.restore();

      hairFrontPath(g, hairSt, cx, cy, hair, hairD);

      /* 얼굴 테두리 */
      g.strokeStyle = hexAlpha(ink, 0.62);
      g.lineWidth = 0.95;
      g.beginPath(); g.ellipse(cx, cy + 0.2, 12.4, 14.2, 0, 0, Math.PI * 2); g.stroke();
      /* 뺨 · 턱 */
      g.strokeStyle = hexAlpha(skinD2, 0.45);
      g.lineWidth = 0.8;
      g.beginPath(); g.ellipse(cx, cy + 4.0, 9.8, 8.8, 0, 0.55, Math.PI - 0.55); g.stroke();
    }

    /* ── 조립 ── */
    g.save();
    g.translate(0, -(rig.hop || 0) - (rig.bob || 0));

    /* 뒤쪽 다리 · 팔 */
    leg(hipX - 3.4, hipY + 1.2, rig.legB.a, rig.legB.k, false);
    g.save();
    g.translate(hipX, hipY);
    g.rotate(rig.lean * 0.5);
    g.translate(-hipX, -hipY);
    arm(22.0, 41.8, rig.armB.a, rig.armB.e, false);
    g.restore();

    /* 몸통 + 머리 (허리를 축으로 상체 기울기) */
    g.save();
    g.translate(hipX, hipY);
    g.rotate(rig.lean);
    g.translate(-hipX, -hipY);
    drawTorso();
    g.save();
    g.translate(30, 32);
    g.rotate(rig.headTilt || 0);
    g.translate(-30, -32);
    drawHead(30, 18.4 + (rig.headDy || 0));
    g.restore();
    g.restore();

    drawShorts();

    /* 앞쪽 다리 · 팔 */
    leg(hipX + 3.4, hipY + 1.2, rig.legA.a, rig.legA.k, true);
    g.save();
    g.translate(hipX, hipY);
    g.rotate(rig.lean);
    g.translate(-hipX, -hipY);
    arm(38.0, 41.8, rig.armA.a, rig.armA.e, true);
    g.restore();

    g.restore();

    if (Object.keys(sdCache).length > 240) { sdCache = {}; }
    sdCache[key] = cv;
    return cv;
  };
  Art.SD_SIZE = { w: SD_W, h: SD_H };
  Art.clearSdCache = function () { sdCache = {}; };

  DS.Art = Art;

})(window);
