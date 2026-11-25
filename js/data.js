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

  /* ─────────────────────────  포지션  ───────────────────────── */
  var POS = {
    GK: { key: 'GK', name: '골키퍼',   short: 'GK', color: '#2f6f9e', w: { s: 0.22, t: 0.20, p: 0.58 } },
    DF: { key: 'DF', name: '수비수',   short: 'DF', color: '#2f6fbf', w: { s: 0.28, t: 0.28, p: 0.44 } },
    MF: { key: 'MF', name: '미드필더', short: 'MF', color: '#2f8f4a', w: { s: 0.30, t: 0.46, p: 0.24 } },
    FW: { key: 'FW', name: '공격수',   short: 'FW', color: '#b93c2c', w: { s: 0.32, t: 0.50, p: 0.18 } }
  };
  var POS_ORDER = ['GK', 'DF', 'MF', 'FW'];
  DS.POS = POS;
  DS.POS_ORDER = POS_ORDER;

  /* 포지션 적성 3열 × 4행 (위 = 공격) */
  var APT_GRID = [
    ['LW', 'ST', 'RW'],
    ['LM', 'CM', 'RM'],
    ['LB', 'CB', 'RB'],
    ['GK']
  ];
  DS.APT_GRID = APT_GRID;
  var APT_LIST = ['LW', 'ST', 'RW', 'LM', 'CM', 'RM', 'LB', 'CB', 'RB', 'GK'];
  var APT_FAMILY = {
    LW: 'FW', ST: 'FW', RW: 'FW',
    LM: 'MF', CM: 'MF', RM: 'MF',
    LB: 'DF', CB: 'DF', RB: 'DF',
    GK: 'GK'
  };
  var APT_NEAR = {
    LW: ['LM', 'ST', 'RW'], ST: ['LW', 'RW', 'CM'], RW: ['RM', 'ST', 'LW'],
    LM: ['LW', 'CM', 'LB'], CM: ['LM', 'RM', 'ST'], RM: ['RW', 'CM', 'RB'],
    LB: ['LM', 'CB', 'LW'], CB: ['LB', 'RB', 'CM'], RB: ['RM', 'CB', 'RW'],
    GK: ['CB']
  };
  DS.APT_FAMILY = APT_FAMILY;

  /* ─────────────────────────  포메이션  ───────────────────────── */
  /* x: 0(왼쪽)~100(오른쪽), y: 0(상대 골대)~100(우리 골대) / k: ☆ 핵심 자리 */
  var FORMATIONS = {
    '4-3-3': {
      name: '4-3-3', desc: '측면 공격 · 균형', key: 3,
      slots: [
        { role: 'GK', pos: 'GK', x: 50, y: 92 },
        { role: 'LB', pos: 'DF', x: 13, y: 74 },
        { role: 'CB', pos: 'DF', x: 37, y: 78, k: true },
        { role: 'CB', pos: 'DF', x: 63, y: 78 },
        { role: 'RB', pos: 'DF', x: 87, y: 74 },
        { role: 'CM', pos: 'MF', x: 27, y: 54 },
        { role: 'CM', pos: 'MF', x: 50, y: 58, k: true },
        { role: 'CM', pos: 'MF', x: 73, y: 54 },
        { role: 'LW', pos: 'FW', x: 18, y: 27 },
        { role: 'ST', pos: 'FW', x: 50, y: 20, k: true },
        { role: 'RW', pos: 'FW', x: 82, y: 27 }
      ]
    },
    '4-4-2': {
      name: '4-4-2', desc: '수비 안정 · 역습', key: 3,
      slots: [
        { role: 'GK', pos: 'GK', x: 50, y: 92 },
        { role: 'LB', pos: 'DF', x: 12, y: 74 },
        { role: 'CB', pos: 'DF', x: 37, y: 78, k: true },
        { role: 'CB', pos: 'DF', x: 63, y: 78, k: true },
        { role: 'RB', pos: 'DF', x: 88, y: 74 },
        { role: 'LM', pos: 'MF', x: 13, y: 51 },
        { role: 'CM', pos: 'MF', x: 38, y: 55 },
        { role: 'CM', pos: 'MF', x: 62, y: 55 },
        { role: 'RM', pos: 'MF', x: 87, y: 51 },
        { role: 'ST', pos: 'FW', x: 37, y: 23, k: true },
        { role: 'ST', pos: 'FW', x: 63, y: 23 }
      ]
    },
    '3-5-2': {
      name: '3-5-2', desc: '중원 장악 · 윙백', key: 3,
      slots: [
        { role: 'GK', pos: 'GK', x: 50, y: 92 },
        { role: 'CB', pos: 'DF', x: 27, y: 78 },
        { role: 'CB', pos: 'DF', x: 50, y: 80, k: true },
        { role: 'CB', pos: 'DF', x: 73, y: 78 },
        { role: 'LWB', pos: 'MF', x: 8, y: 57 },
        { role: 'CM', pos: 'MF', x: 31, y: 56, k: true },
        { role: 'CM', pos: 'MF', x: 50, y: 60 },
        { role: 'CM', pos: 'MF', x: 69, y: 56 },
        { role: 'RWB', pos: 'MF', x: 92, y: 57 },
        { role: 'ST', pos: 'FW', x: 37, y: 23, k: true },
        { role: 'ST', pos: 'FW', x: 63, y: 23 }
      ]
    },
    '4-2-3-1': {
      name: '4-2-3-1', desc: '두 줄 수비 · 한 명의 창', key: 4,
      slots: [
        { role: 'GK', pos: 'GK', x: 50, y: 92 },
        { role: 'LB', pos: 'DF', x: 12, y: 76 },
        { role: 'CB', pos: 'DF', x: 37, y: 79 },
        { role: 'CB', pos: 'DF', x: 63, y: 79 },
        { role: 'RB', pos: 'DF', x: 88, y: 76 },
        { role: 'DM', pos: 'MF', x: 36, y: 59, k: true },
        { role: 'DM', pos: 'MF', x: 64, y: 59 },
        { role: 'LAM', pos: 'MF', x: 17, y: 39 },
        { role: 'CAM', pos: 'MF', x: 50, y: 35, k: true },
        { role: 'RAM', pos: 'MF', x: 83, y: 39 },
        { role: 'ST', pos: 'FW', x: 50, y: 18, k: true }
      ]
    }
  };
  DS.FORMATIONS = FORMATIONS;
  DS.FORMATION_KEYS = ['4-3-3', '4-4-2', '3-5-2', '4-2-3-1'];

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
    { id: 'baekho',   name: '백호 유나이티드', short: '백호', kit: { shirt: '#1b7f88', shorts: '#f2e8d2', trim: '#b0eef2' }, emblem: 'moon', strength: 68 }
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

  function pickRarity(kind) {
    if (kind === 'normal') {
      var r = Math.random();
      return r < 0.52 ? 'dong' : (r < 0.84 ? 'eun' : 'geum');
    }
    if (kind === 'special') {
      var q = Math.random();
      if (q < 0.34) { return 'eun'; }
      if (q < 0.84) { return 'geum'; }
      return 'legend';
    }
    var total = 0, i;
    for (i = 0; i < RARITY_ORDER.length; i++) { total += (5 - i) * 10; }
    var x = Math.random() * total;
    for (i = 0; i < RARITY_ORDER.length; i++) {
      x -= (5 - i) * 10;
      if (x <= 0) { return RARITY_ORDER[i]; }
    }
    return 'dong';
  }

  function makeAptitude(pos) {
    var apt = {};
    var i, code, fam, base;
    for (i = 0; i < APT_LIST.length; i++) {
      code = APT_LIST[i];
      fam = APT_FAMILY[code];
      if (code === pos) { apt[code] = irange(8, 9); continue; }
      if (fam === pos) { base = irange(5, 8); }
      else if (APT_NEAR[pos] && APT_NEAR[pos].indexOf(code) >= 0) { base = irange(4, 7); }
      else { base = irange(1, 4); }
      if (pos === 'GK' && code !== 'GK') { base = irange(1, 3); }
      if (code === 'GK' && pos !== 'GK') { base = irange(1, 2); }
      apt[code] = clamp(base, 1, 9);
    }
    return apt;
  }

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
    '{name}은(는) {club}의 자랑인 {nickname}. 훈련이 끝난 뒤에도 골대 앞에 남아 공을 정리하는 성실함으로 유명하다. {traitdesc} 팬들은 그의 등번호가 적힌 유니폼을 입고 관중석 한쪽을 채운다.',
    '한때 방출 통보를 받고 짐을 싸던 {name}. 마지막 연습 경기에서 보여 준 집념이 감독의 마음을 바꿨고, 그날 이후로 그는 매 경기 출전 명단에 이름을 올린다. {traitdesc}',
    '{club} 유스 출신의 {name}. 구단 시설이 낡아 바닥이 젖은 날에도 혼자 남아 슛을 쏘던 소년은 이제 경기장을 지휘하는 선수가 되었다. {traitdesc}',
    '조용한 성격의 {name}. 인터뷰에서는 말수가 적지만, 라커룸에서 가장 먼저 웃음을 만드는 사람도 그다. {traitdesc} 감독은 그를 두고 "팀의 온도"라고 부른다.',
    '이적 시장 마지막 날, 팬들이 지켜보는 가운데 {club} 유니폼을 입은 {name}. 첫 경기에서 보여 준 플레이 하나로 관중석이 그의 이름을 연호했다. {traitdesc}',
    '{name}의 플레이는 계산적이다. 상대의 버릇을 세 번의 공격으로 읽어내고, 네 번째에 결정적인 한 방을 만든다. {traitdesc} 벤치에서도 그의 목소리는 가장 또렷하다.'
  ];

  function storyFor(p, clubName) {
    var t = pick(STORY);
    var tr = traitOf(p.trait);
    var nick = p.nickname || '조용한 주인공';
    return t
      .replace(/\{club\}/g, clubName || '도트 유나이티드')
      .replace(/\{name\}/g, p.name)
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
    var pos = opts.pos || pick(['GK', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW']);
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
    var p = {
      id: opts.id || newId(),
      name: name,
      number: opts.number || irange(1, 45),
      pos: pos,
      rarity: rarity,
      s: s, t: t, p: pw,
      level: opts.level || 0,
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
      apt: makeAptitude(pos),
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
    var keys = APT_LIST.slice(0, 9);
    var i, top = -1;
    for (i = 0; i < keys.length; i++) {
      if (a[keys[i]] > top) { top = a[keys[i]]; best = keys[i]; }
    }
    var style = p.t >= 8 ? '테크니션' : (p.s >= 8 ? '스피더' : (p.p >= 8 ? '피지컬' : '밸런스'));
    return style + '형 ' + best;
  }

  function makeInitialSquad() {
    var squad = [];
    var roles = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW', 'DF', 'MF', 'FW', 'GK', 'MF'];
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
        p.apt = makeAptitude('GK'); p.stats = statSheet(p);
      }
      squad.push(p);
    }
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
    { key: 'weight', name: '웨이트',    icon: '🏋️', gain: { p: 1 },        desc: '파워 +' },
    { key: 'tactic', name: '전술 회의', icon: '📋', gain: { cap: 1 },      desc: '통솔 +' },
    { key: 'setpiece', name: '세트피스', icon: '🎪', gain: { fk: 1 },      desc: 'FK +' }
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
    { pair: ['pass', 'shoot'],     name: '원터치 캐논', desc: 'S +1 · T +1', gain: { s: 1, t: 1 }, skill: '결정력',      skillDesc: '골문 앞에서 흔들리지 않는다' },
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

  /* ── 초상화 도트 (20 × 26, 2.5등신) ── */
  var PW = 20, PH = 26;
  var FIG_CACHE = {};
  var FIG_N = 0;

  var HEAD_ROWS = [
    [6, 13], [5, 14], [4, 15], [4, 15], [4, 15], [4, 15],
    [4, 15], [5, 14], [5, 14], [6, 13], [7, 12]
  ];

  /* 3×5 픽셀 숫자 */
  var DIGIT = {
    '0': [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
    '1': [0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
    '2': [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
    '3': [1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1],
    '4': [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
    '5': [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1],
    '6': [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    '7': [1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    '8': [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    '9': [1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1]
  };
  function drawNumber(g, cx, y, text, color) {
    var chars = String(text).split(''), i, j, k, ox;
    var w = chars.length * 4 - 1;
    ox = Math.round(cx - w / 2);
    for (i = 0; i < chars.length; i++) {
      var d = DIGIT[chars[i]];
      if (!d) { continue; }
      for (j = 0; j < 5; j++) {
        for (k = 0; k < 3; k++) {
          if (d[j * 3 + k]) { fill(g, ox + i * 4 + k, y + j, 1, 1, color); }
        }
      }
    }
  }

  function drawHairBack(g, style, hair, hairD) {
    if (style === 'long') {
      fill(g, 3, 3, 2, 8, hairD);
      fill(g, 15, 3, 2, 8, hairD);
      fill(g, 3, 10, 3, 3, hairD);
      fill(g, 14, 10, 3, 3, hairD);
    } else if (style === 'ponytail') {
      fill(g, 16, 3, 2, 6, hairD);
      fill(g, 17, 8, 2, 3, shade(hair, -14));
      fill(g, 15, 3, 1, 2, hair);
    } else if (style === 'afro') {
      fill(g, 4, 0, 12, 1, hairD);
      fill(g, 2, 2, 16, 4, hairD);
      fill(g, 2, 5, 2, 3, hairD);
      fill(g, 16, 5, 2, 3, hairD);
    } else if (style === 'curly') {
      fill(g, 3, 2, 1, 3, hairD);
      fill(g, 16, 2, 1, 3, hairD);
    }
  }

  function drawHairFront(g, style, hair, hairD, hairL) {
    switch (style) {
      case 'buzz':
        fill(g, 7, 0, 6, 1, hair);
        fill(g, 6, 1, 8, 1, hair);
        fill(g, 5, 2, 10, 1, hair);
        fill(g, 6, 3, 3, 1, hairD);
        fill(g, 12, 3, 3, 1, hairD);
        break;
      case 'long':
        fill(g, 5, 0, 10, 1, hair);
        fill(g, 4, 1, 12, 1, hair);
        fill(g, 3, 2, 14, 1, hair);
        fill(g, 4, 3, 4, 1, hair);
        fill(g, 12, 3, 4, 1, hair);
        fill(g, 3, 3, 2, 7, hair);
        fill(g, 15, 3, 2, 7, hair);
        fill(g, 5, 1, 4, 1, hairL);
        break;
      case 'afro':
        fill(g, 4, 0, 12, 1, hair);
        fill(g, 3, 1, 14, 2, hair);
        fill(g, 2, 3, 3, 3, hair);
        fill(g, 15, 3, 3, 3, hair);
        fill(g, 5, 2, 3, 1, hair);
        fill(g, 12, 2, 3, 1, hair);
        fill(g, 7, 1, 3, 1, hairL);
        break;
      case 'slick':
        fill(g, 6, 0, 8, 1, hair);
        fill(g, 5, 1, 10, 1, hair);
        fill(g, 4, 2, 6, 1, hair);
        fill(g, 11, 2, 5, 1, hairD);
        fill(g, 4, 3, 7, 1, hair);
        fill(g, 13, 3, 2, 1, hairD);
        fill(g, 4, 4, 1, 1, hair);
        fill(g, 15, 4, 1, 1, hair);
        fill(g, 6, 1, 4, 1, hairL);
        break;
      case 'twoblock':
        fill(g, 5, 0, 10, 1, hair);
        fill(g, 4, 1, 12, 2, hair);
        fill(g, 4, 3, 1, 2, hairD);
        fill(g, 15, 3, 1, 2, hairD);
        fill(g, 4, 3, 12, 1, hairD);
        fill(g, 6, 1, 5, 1, hairL);
        break;
      case 'curly':
        fill(g, 5, 0, 2, 1, hair); fill(g, 8, 0, 2, 1, hair); fill(g, 11, 0, 3, 1, hair);
        fill(g, 4, 1, 12, 2, hair);
        fill(g, 3, 2, 2, 2, hair); fill(g, 15, 2, 2, 2, hair);
        fill(g, 5, 3, 3, 1, hairD); fill(g, 12, 3, 3, 1, hairD);
        fill(g, 6, 1, 1, 1, hairL); fill(g, 10, 1, 1, 1, hairL);
        break;
      case 'mohawk':
        fill(g, 8, 0, 4, 1, hair);
        fill(g, 8, 1, 4, 2, hair);
        fill(g, 9, 1, 1, 2, hairL);
        fill(g, 5, 2, 3, 1, hairD);
        fill(g, 12, 2, 3, 1, hairD);
        fill(g, 4, 3, 1, 1, hairD);
        fill(g, 15, 3, 1, 1, hairD);
        break;
      case 'ponytail':
        fill(g, 5, 0, 10, 1, hair);
        fill(g, 4, 1, 12, 1, hair);
        fill(g, 4, 2, 12, 1, hair);
        fill(g, 4, 3, 4, 1, hair);
        fill(g, 12, 3, 4, 1, hair);
        fill(g, 4, 4, 1, 2, hairD);
        fill(g, 15, 4, 1, 2, hairD);
        fill(g, 5, 1, 4, 1, hairL);
        break;
      case 'bald':
        fill(g, 4, 2, 1, 2, hairD);
        fill(g, 15, 2, 1, 2, hairD);
        fill(g, 6, 1, 5, 1, hairL);
        fill(g, 5, 2, 2, 1, hairL);
        break;
      default: /* short */
        fill(g, 6, 0, 8, 1, hair);
        fill(g, 5, 1, 10, 1, hair);
        fill(g, 4, 2, 12, 1, hair);
        fill(g, 4, 3, 3, 1, hair);
        fill(g, 8, 3, 4, 1, hair);
        fill(g, 13, 3, 3, 1, hair);
        fill(g, 4, 4, 1, 1, hair);
        fill(g, 15, 4, 1, 1, hair);
        fill(g, 6, 1, 5, 1, hairL);
        break;
    }
  }

  function drawEyes(g, style, dark, white) {
    var xs = [6, 11], i, ex;
    for (i = 0; i < 2; i++) {
      ex = xs[i];
      if (style === 'sleepy') {
        fill(g, ex, 7, 2, 1, dark);
        fill(g, ex, 6, 2, 1, hexAlpha(dark, 0.25));
        continue;
      }
      if (style === 'happy') {
        fill(g, ex, 7, 1, 1, dark);
        fill(g, ex + 1, 6, 1, 1, dark);
        fill(g, ex + 2, 7, 1, 1, dark);
        continue;
      }
      if (style === 'sharp') {
        fill(g, ex, 6, 2, 1, dark);
        fill(g, ex, 7, 2, 1, hexAlpha(dark, 0.35));
        fill(g, ex + 1, 6, 1, 1, white);
        continue;
      }
      fill(g, ex, 6, 2, 2, dark);
      fill(g, ex, 6, 1, 1, white);
      if (style === 'wide') { fill(g, ex + 1, 6, 1, 1, white); }
    }
  }

  function drawBrows(g, style, color, dark) {
    var y = 4, i, xs = [5, 12];
    if (style === 'raised') { y = 3; }
    for (i = 0; i < 2; i++) {
      var x = xs[i];
      if (style === 'thin') {
        fill(g, x + 1, y, 2, 1, color);
      } else if (style === 'angry') {
        if (i === 0) { fill(g, x, y - 1, 2, 1, color); fill(g, x + 2, y, 1, 1, color); }
        else { fill(g, x + 1, y, 2, 1, color); fill(g, x - 1, y - 1, 1, 1, color); }
      } else if (style === 'flat') {
        fill(g, x, y, 3, 1, color);
      } else {
        fill(g, x, y, 3, 1, color);
        if (style === 'thick') { fill(g, x + 1, y + 1, 2, 1, dark); }
      }
    }
  }

  function drawMouth(g, style, dark, lip) {
    if (style === 'flat') {
      fill(g, 9, 9, 2, 1, dark);
    } else if (style === 'smirk') {
      fill(g, 9, 9, 2, 1, dark);
      fill(g, 11, 8, 1, 1, dark);
    } else if (style === 'open') {
      fill(g, 9, 9, 2, 2, dark);
      fill(g, 9, 9, 2, 1, lip);
    } else if (style === 'grit') {
      fill(g, 8, 9, 4, 1, dark);
      fill(g, 8, 9, 3, 1, lip);
    } else {
      fill(g, 8, 9, 1, 1, dark);
      fill(g, 9, 9, 2, 1, hexAlpha(dark, 0.85));
      fill(g, 11, 9, 1, 1, dark);
      fill(g, 7, 8, 1, 1, hexAlpha(dark, 0.5));
      fill(g, 12, 8, 1, 1, hexAlpha(dark, 0.5));
    }
  }

  function drawBeard(g, style, hair, hairD, skin) {
    if (style === 'stubble') {
      fill(g, 6, 9, 1, 1, hairD); fill(g, 13, 9, 1, 1, hairD);
      fill(g, 8, 10, 1, 1, hairD); fill(g, 11, 10, 1, 1, hairD);
      fill(g, 9, 11, 2, 1, hairD);
    } else if (style === 'goatee') {
      fill(g, 8, 10, 4, 1, hair);
      fill(g, 8, 8, 4, 1, hairD);
      fill(g, 9, 11, 2, 1, hair);
    } else if (style === 'mustache') {
      fill(g, 8, 8, 4, 1, hair);
      fill(g, 7, 8, 1, 1, hairD);
      fill(g, 12, 8, 1, 1, hairD);
    } else if (style === 'full') {
      fill(g, 5, 8, 1, 4, hair);
      fill(g, 14, 8, 1, 4, hair);
      fill(g, 6, 9, 8, 2, hair);
      fill(g, 8, 8, 4, 1, hair);
      fill(g, 9, 9, 2, 1, skin);
      fill(g, 8, 10, 4, 1, skin);
    }
  }

  function drawFigure(g, p, kit, opt) {
    var F = p.face || {};
    var skin = F.skin || '#f0c49a';
    var skinD = shade(skin, -24);
    var skinD2 = shade(skin, -44);
    var skinL = shade(skin, 16);
    var hair = F.hairColor || '#2b1d14';
    var hairD = shade(hair, -22);
    var hairL = shade(hair, 26);
    var shirt = kit.shirt || '#c8432f';
    var shirtD = shade(shirt, -38);
    var shirtL = shade(shirt, 22);
    var trim = kit.trim || '#f2e6c4';
    var shorts = kit.shorts || '#f2e6c4';
    var shortsD = shade(shorts, -30);
    var dark = '#2a2018';
    var isGk = p.pos === 'GK' || opt.gk;
    var i, y, row;

    /* 그림자 */
    g.fillStyle = 'rgba(40,24,8,0.22)';
    g.beginPath();
    g.ellipse(10, 25, 6.2, 1.5, 0, 0, Math.PI * 2);
    g.fill();

    /* 다리 · 양말 · 축구화 */
    fill(g, 6, 20, 2, 3, skin);
    fill(g, 12, 20, 2, 3, skin);
    fill(g, 6, 20, 1, 3, skinD);
    fill(g, 12, 20, 1, 3, skinD);
    fill(g, 5, 22, 3, 2, trim);
    fill(g, 12, 22, 3, 2, trim);
    fill(g, 5, 22, 1, 2, shade(trim, -30));
    fill(g, 14, 22, 1, 2, shade(trim, -30));
    fill(g, 4, 24, 4, 2, '#3a2c22');
    fill(g, 12, 24, 4, 2, '#3a2c22');
    fill(g, 4, 24, 4, 1, '#5a4634');
    fill(g, 12, 24, 4, 1, '#5a4634');

    /* 뒤머리 */
    drawHairBack(g, F.hair || 'short', hair, hairD);

    /* 반바지 */
    fill(g, 5, 18, 10, 3, shorts);
    fill(g, 5, 18, 10, 1, shade(shorts, 16));
    fill(g, 9, 18, 2, 3, shortsD);
    fill(g, 5, 20, 10, 1, shortsD);

    /* 몸통 */
    fill(g, 4, 12, 12, 7, shirt);
    fill(g, 4, 12, 2, 7, shirtL);
    fill(g, 14, 12, 2, 7, shirtD);
    fill(g, 4, 18, 12, 1, shirtD);

    /* 목 */
    fill(g, 8, 10, 4, 2, skinD);

    /* 머리 */
    for (i = 0; i < HEAD_ROWS.length; i++) {
      y = i + 1;
      row = HEAD_ROWS[i];
      fill(g, row[0], y, row[1] - row[0] + 1, 1, skin);
      if (row[0] > 4) { fill(g, row[0], y, 1, 1, skinD); }
      if (row[1] < 15) { fill(g, row[1], y, 1, 1, skinD); }
    }
    fill(g, 4, 7, 1, 3, hexAlpha(skinD, 0.5));
    fill(g, 15, 7, 1, 3, hexAlpha(skinD, 0.5));
    fill(g, 6, 2, 4, 1, skinL);
    /* 귀 */
    fill(g, 3, 6, 1, 2, skin);
    fill(g, 16, 6, 1, 2, skin);

    /* 앞머리 */
    drawHairFront(g, F.hair || 'short', hair, hairD, hairL);

    /* 얼굴 */
    var browCol = hex2rgb(hair)[0] + hex2rgb(hair)[1] + hex2rgb(hair)[2] < 210 ? shade(hair, 40) : hairD;
    drawBrows(g, F.brow || 'thick', browCol, shade(hairD, -10));
    drawEyes(g, F.eye || 'round', dark, '#fffdf5');
    if (F.nose === 'wide') { fill(g, 8, 8, 3, 1, skinD); }
    else if (F.nose === 'point') { fill(g, 9, 8, 1, 2, skinD); }
    else if (F.nose === 'flat') { fill(g, 9, 8, 2, 1, skinD); }
    else { fill(g, 9, 8, 1, 1, skinD); fill(g, 10, 8, 1, 1, hexAlpha(skinD, 0.6)); }
    drawBeard(g, F.beard || 'none', hair, hairD, skin);
    drawMouth(g, F.mouth || 'smile', dark, '#fff6e6');
    fill(g, 5, 8, 1, 1, hexAlpha('#d4674f', 0.4));
    fill(g, 14, 8, 1, 1, hexAlpha('#d4674f', 0.4));

    /* 팔 */
    var sleeveEnd = isGk ? 16 : 14;
    fill(g, 2, 12, 2, sleeveEnd - 12, shirt);
    fill(g, 16, 12, 2, sleeveEnd - 12, shirt);
    fill(g, 2, 12, 1, sleeveEnd - 12, shirtL);
    fill(g, 17, 12, 1, sleeveEnd - 12, shirtD);
    fill(g, 2, sleeveEnd - 1, 2, 1, trim);
    fill(g, 16, sleeveEnd - 1, 2, 1, trim);
    fill(g, 2, sleeveEnd, 2, 20 - sleeveEnd, skin);
    fill(g, 16, sleeveEnd, 2, 20 - sleeveEnd, skin);
    fill(g, 2, 20, 2, 1, skinD);
    fill(g, 16, 20, 2, 1, skinD);

    /* 칼라 */
    var collar = F.collar || 'v';
    if (collar === 'round') {
      fill(g, 7, 12, 6, 1, trim);
      fill(g, 9, 12, 2, 1, skinD2);
    } else if (collar === 'polo') {
      fill(g, 7, 12, 1, 1, trim);
      fill(g, 12, 12, 1, 1, trim);
      fill(g, 8, 12, 4, 1, shirtD);
      fill(g, 9, 13, 2, 1, trim);
    } else {
      fill(g, 7, 12, 1, 2, trim);
      fill(g, 12, 12, 1, 2, trim);
      fill(g, 8, 12, 4, 1, trim);
      fill(g, 9, 12, 2, 2, skinD2);
    }

    /* 등번호 */
    if (opt.number) { drawNumber(g, 10, 14, opt.number, '#fff6e4'); }
    /* 주장 완장 */
    if (opt.captain) {
      fill(g, 2, 15, 2, 1, '#e8b62c');
      fill(g, 2, 16, 2, 1, '#a87a10');
    }
    /* 골키퍼 장갑 */
    if (isGk) {
      fill(g, 2, 19, 2, 2, '#f6f2e4');
      fill(g, 16, 19, 2, 2, '#f6f2e4');
    }
  }

  function figKey(p, kit, opt) {
    var F = p.face || {};
    return [p.id, p.pos, p.rarity, F.hair, F.hairColor, F.skin, F.brow, F.eye, F.nose, F.mouth, F.beard, F.collar,
      kit.shirt, kit.shorts, kit.trim, opt.number || 0, opt.captain ? 1 : 0, opt.gk ? 1 : 0].join('|');
  }

  function addOutline(g, w, h, color) {
    var img = g.getImageData(0, 0, w, h);
    var d = img.data;
    var out = new Uint8ClampedArray(d);
    var c = hex2rgb(color);
    function op(x, y) {
      return x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40;
    }
    var x, y;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (op(x, y)) { continue; }
        if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) {
          var o = (y * w + x) * 4;
          out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 235;
        }
      }
    }
    img.data.set(out);
    g.putImageData(img, 0, 0);
  }

  Art.portrait = function (p, kit, opt) {
    opt = opt || {};
    if (!p || !p.face) { p = { id: 'x', pos: 'MF', face: {}, name: '' }; }
    var key = figKey(p, kit, opt);
    if (FIG_CACHE[key]) { return FIG_CACHE[key]; }
    var c = makeCanvas(PW, PH);
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    drawFigure(g, p, kit, opt);
    addOutline(g, PW, PH, '#3a2a18');
    FIG_N++;
    if (FIG_N > 240) { FIG_CACHE = {}; FIG_N = 0; }
    FIG_CACHE[key] = c;
    return c;
  };

  /* 캔버스에 선수 도트 그리기 (정수 배율 · 픽셀 유지) */
  Art.paint = function (canvas, p, kit, opt) {
    if (!canvas) { return; }
    opt = opt || {};
    if (opt.number === true) { opt = { k: opt.k, number: p.number, captain: opt.captain, gk: opt.gk }; }
    var fig = Art.portrait(p, kit, opt);
    var k = opt.k || 2;
    var cw = fig.width * k, ch = fig.height * k;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw; canvas.height = ch;
    }
    var g = canvas.getContext('2d');
    g.clearRect(0, 0, cw, ch);
    g.imageSmoothingEnabled = false;
    g.drawImage(fig, 0, 0, cw, ch);
  };

  /* ── 경기장 스프라이트 (14 × 19) ── */
  var MATCH_CACHE = {};
  Art.matchFig = function (p, kit, frame, face) {
    var F = p.face || {};
    var key = [p.id, F.hair, F.hairColor, F.skin, kit.shirt, kit.shorts, kit.trim, frame % 4, face > 0 ? 1 : 0].join('|');
    if (MATCH_CACHE[key]) { return MATCH_CACHE[key]; }
    var W = 16, H = 20;
    var c = makeCanvas(W, H);
    var g = c.getContext('2d');
    var skin = F.skin || '#f0c49a';
    var skinD = shade(skin, -24);
    var hair = F.hairColor || '#2b1d14';
    var hairD = shade(hair, -24);
    var shirt = kit.shirt, shirtD = shade(shirt, -36), trim = kit.trim || '#f2e6c4';
    var shorts = kit.shorts || '#f2e6c4', shortsD = shade(shorts, -28);
    var swing = [0, 1, 0, -1][frame % 4];
    var ey = 0;

    /* 다리 */
    fill(g, 5, 15 - Math.max(0, swing), 2, 3, skin);
    fill(g, 9, 15 + Math.min(0, swing), 2, 3, skin);
    fill(g, 4, 17 - Math.max(0, swing), 3, 2, '#3a2c22');
    fill(g, 9, 17 + Math.min(0, swing), 3, 2, '#3a2c22');
    fill(g, 5, 14, 2, 1, trim);
    fill(g, 9, 14, 2, 1, trim);
    /* 반바지 */
    fill(g, 4, 12, 8, 3, shorts);
    fill(g, 7, 12, 2, 3, shortsD);
    /* 몸통 */
    fill(g, 4, 7, 8, 5, shirt);
    fill(g, 4, 7, 2, 5, shade(shirt, 22));
    fill(g, 11, 7, 1, 5, shirtD);
    fill(g, 4, 7, 8, 1, trim);
    /* 팔 */
    fill(g, 2, 7, 2, 4, shirt);
    fill(g, 12, 7, 2, 4, shirt);
    fill(g, 2, 11, 2, 2, skin);
    fill(g, 12, 11, 2, 2, skin);
    /* 목 */
    fill(g, 6, 6, 4, 1, skinD);
    /* 머리 */
    fill(g, 4, 1, 8, 5, skin);
    fill(g, 4, 6, 8, 1, skin);
    fill(g, 3, 3, 1, 2, skin);
    fill(g, 12, 3, 1, 2, skin);
    /* 머리카락 */
    var st = F.hair || 'short';
    if (st === 'afro') {
      fill(g, 2, 0, 12, 3, hair);
      fill(g, 2, 3, 2, 2, hair);
      fill(g, 12, 3, 2, 2, hair);
    } else if (st === 'long' || st === 'ponytail') {
      fill(g, 4, 0, 8, 2, hair);
      fill(g, 3, 1, 2, 5, hair);
      fill(g, 11, 1, 2, 5, hair);
    } else if (st === 'bald') {
      fill(g, 3, 2, 1, 2, hairD);
      fill(g, 12, 2, 1, 2, hairD);
    } else if (st === 'mohawk') {
      fill(g, 6, 0, 4, 2, hair);
      fill(g, 4, 1, 2, 1, hairD);
      fill(g, 10, 1, 2, 1, hairD);
    } else if (st === 'slick') {
      fill(g, 4, 0, 8, 2, hair);
      fill(g, 4, 2, 3, 1, hair);
      fill(g, 9, 2, 3, 1, hairD);
    } else {
      fill(g, 4, 0, 8, 2, hair);
      fill(g, 3, 2, 1, 2, hair);
      fill(g, 12, 2, 1, 2, hair);
      fill(g, 4, 2, 2, 1, hairD);
      fill(g, 10, 2, 2, 1, hairD);
    }
    /* 얼굴 */
    var ex1 = face > 0 ? 6 : 5, ex2 = face > 0 ? 9 : 8;
    fill(g, ex1, 3, 1, 1, '#2a2018');
    fill(g, ex2, 3, 1, 1, '#2a2018');
    fill(g, 7, 5, 2, 1, shade(skin, -40));
    MATCH_CACHE[key] = c;
    void ey;
    return c;
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

  /* ── 잔디 경기장 ── */
  Art.pitchMargin = function (W, H) {
    return Math.max(12, Math.round(Math.min(W, H) * 0.035));
  };

  Art.drawPitch = function (g, W, H, opt) {
    opt = opt || {};
    var g1 = '#2c5220', g2 = '#335c26';
    var rows = 12, i;
    fill(g, 0, 0, W, H, g1);
    for (i = 0; i < rows; i++) {
      if (i % 2 === 1) { fill(g, 0, Math.floor(H / rows) * i, W, Math.ceil(H / rows) + 1, g2); }
    }
    /* 잔디 결 */
    g.fillStyle = 'rgba(255,255,255,0.028)';
    for (i = 0; i < 30; i++) { g.fillRect((i * 41) % W, 0, 2, H); }
    /* 비네트 */
    var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(8,26,6,0.34)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    var m = opt.margin || Art.pitchMargin(W, H);
    var fx = m, fy = m, fw = W - m * 2, fh = H - m * 2;
    g.strokeStyle = 'rgba(247,244,226,0.80)';
    g.lineWidth = 1.6;
    g.strokeRect(fx, fy, fw, fh);
    g.beginPath();
    g.moveTo(fx, fy + fh / 2); g.lineTo(fx + fw, fy + fh / 2); g.stroke();
    g.beginPath(); g.arc(W / 2, fy + fh / 2, fh * 0.125, 0, Math.PI * 2); g.stroke();
    fill(g, W / 2 - 1.2, fy + fh / 2 - 1.2, 2.4, 2.4, 'rgba(247,244,226,0.85)');

    var boxW = fw * 0.56, boxH = fh * 0.15;
    g.strokeRect(W / 2 - boxW / 2, fy, boxW, boxH);
    g.strokeRect(W / 2 - boxW / 2, fy + fh - boxH, boxW, boxH);
    var sw = fw * 0.28, sh = fh * 0.065;
    g.strokeRect(W / 2 - sw / 2, fy, sw, sh);
    g.strokeRect(W / 2 - sw / 2, fy + fh - sh, sw, sh);
    g.beginPath(); g.arc(W / 2, fy + fh * 0.1, 2, 0, Math.PI * 2); g.fillStyle = 'rgba(247,244,226,0.85)'; g.fill();
    g.beginPath(); g.arc(W / 2, fy + fh - fh * 0.1, 2, 0, Math.PI * 2); g.fill();

    /* 골대 */
    var goalW = fw * 0.24, goalD = Math.max(8, Math.min(16, fh * 0.045));
    var gx = W / 2 - goalW / 2;
    g.strokeStyle = 'rgba(247,244,226,0.55)';
    g.lineWidth = 1;
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(gx, fy, goalW, goalD);
    for (i = 0; i <= 7; i++) {
      g.beginPath(); g.moveTo(gx + (goalW / 7) * i, fy); g.lineTo(gx + (goalW / 7) * i, fy + goalD); g.stroke();
    }
    g.lineWidth = 2; g.strokeStyle = '#f7f4e2';
    g.beginPath();
    g.moveTo(gx, fy + goalD); g.lineTo(gx + goalW, fy + goalD);
    g.moveTo(gx, fy); g.lineTo(gx, fy + goalD);
    g.moveTo(gx + goalW, fy); g.lineTo(gx + goalW, fy + goalD);
    g.stroke();
    g.lineWidth = 1; g.strokeStyle = 'rgba(247,244,226,0.55)';
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(gx, fy + fh - goalD, goalW, goalD);
    for (i = 0; i <= 7; i++) {
      g.beginPath(); g.moveTo(gx + (goalW / 7) * i, fy + fh - goalD); g.lineTo(gx + (goalW / 7) * i, fy + fh); g.stroke();
    }
    g.lineWidth = 2; g.strokeStyle = '#f7f4e2';
    g.beginPath();
    g.moveTo(gx, fy + fh - goalD); g.lineTo(gx + goalW, fy + fh - goalD);
    g.moveTo(gx, fy + fh - goalD); g.lineTo(gx, fy + fh);
    g.moveTo(gx + goalW, fy + fh - goalD); g.lineTo(gx + goalW, fy + fh);
    g.stroke();

    /* 관중석 띠 (위/아래) */
    if (opt.crowd !== false) {
      var ch = Math.max(7, Math.round(H * 0.022));
      var colors = ['#c8432f', '#2f5fa8', '#d8a419', '#2a7a45', '#8a5a3a', '#e6d9b8', '#6a34c0'];
      for (i = 0; i < Math.floor(W / 3); i++) {
        fill(g, i * 3, 0, 2, ch, colors[(i * 7 + 3) % colors.length]);
        fill(g, i * 3 + 1, ch, 2, ch, colors[(i * 5 + 1) % colors.length]);
        fill(g, i * 3, H - ch, 2, ch, colors[(i * 3 + 2) % colors.length]);
      }
      fill(g, 0, 0, W, 1, 'rgba(20,34,16,0.55)');
      fill(g, 0, H - 1, W, 1, 'rgba(20,34,16,0.55)');
    }
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

  /* ── 시설 도트 일러스트 (26 × 22) ── */
  Art.facilityFig = function (kind, level) {
    var W = 26, H = 22;
    var c = makeCanvas(W, H);
    var g = c.getContext('2d');
    var i;
    if (kind === 'training') {
      fill(g, 1, 8, 24, 12, '#3a6a2a');
      for (i = 0; i < 6; i++) { fill(g, 1 + i * 4, 8, 2, 12, '#427631'); }
      g.strokeStyle = 'rgba(247,244,226,0.9)'; g.lineWidth = 1;
      g.strokeRect(3.5, 10.5, 19, 8);
      g.beginPath(); g.moveTo(3.5, 14.5); g.lineTo(22.5, 14.5); g.stroke();
      /* 골대 */
      fill(g, 9, 4, 8, 1, '#f4efdc');
      fill(g, 9, 5, 1, 4, '#f4efdc');
      fill(g, 16, 5, 1, 4, '#f4efdc');
      for (i = 0; i < 5; i++) { fill(g, 9 + i * 1.8, 5, 0.6, 4, 'rgba(247,244,226,0.5)'); }
      /* 콘 */
      fill(g, 6, 16, 2, 2, '#e0822c'); fill(g, 6, 16, 1, 1, '#f6a04a');
      fill(g, 18, 12, 2, 2, '#e0822c'); fill(g, 18, 12, 1, 1, '#f6a04a');
      /* 공 */
      Art.drawBall(g, 13, 18, 1.9);
    } else if (kind === 'medical') {
      fill(g, 3, 6, 20, 15, '#efe6cf');
      fill(g, 3, 6, 20, 2, '#d8cbb0');
      fill(g, 3, 20, 20, 1, '#c3b596');
      fill(g, 9, 13, 8, 6, '#f7f2e2');
      fill(g, 10, 11, 6, 2, '#f7f2e2');
      fill(g, 12, 8, 3, 7, '#c8432f');
      fill(g, 10, 10, 7, 3, '#c8432f');
      fill(g, 5, 9, 3, 3, '#8fc4e0');
      fill(g, 18, 9, 3, 3, '#8fc4e0');
      fill(g, 7, 15, 6, 1, '#d8cbb0');
    } else if (kind === 'shop') {
      fill(g, 3, 8, 20, 13, '#e8dcc0');
      fill(g, 3, 8, 20, 2, '#c9b793');
      fill(g, 2, 4, 22, 4, '#c8432f');
      for (i = 0; i < 7; i++) { fill(g, 2 + i * 3, 4, 2, 4, '#f2e6c4'); }
      fill(g, 6, 12, 14, 9, '#b8d8ea');
      fill(g, 6, 12, 14, 1, '#8fb8d0');
      fill(g, 8, 14, 5, 3, '#f7f2e2');
      Art.drawBall(g, 16, 16, 2);
      fill(g, 11, 19, 4, 2, '#8a6a3a');
    } else if (kind === 'fanclub') {
      fill(g, 4, 7, 18, 14, '#e6d9b8');
      fill(g, 3, 5, 20, 3, '#2f5fa8');
      fill(g, 5, 6, 2, 2, '#f2e6c4');
      /* 깃발 */
      fill(g, 12, 1, 1, 6, '#8a6a3a');
      fill(g, 13, 1, 7, 4, '#c8432f');
      fill(g, 14, 2, 4, 2, '#f6d968');
      /* 관중 */
      var cols = ['#c8432f', '#2f5fa8', '#d8a419', '#2a7a45', '#8a5a3a'];
      for (i = 0; i < 5; i++) {
        fill(g, 6 + i * 3, 12, 2, 2, cols[i % cols.length]);
        fill(g, 6 + i * 3, 14, 2, 5, cols[(i + 2) % cols.length]);
      }
      fill(g, 5, 19, 16, 1, '#b8a582');
    } else {
      /* cafe */
      fill(g, 3, 7, 20, 14, '#efe2c6');
      fill(g, 2, 4, 22, 3, '#2a7a45');
      fill(g, 3, 5, 2, 2, '#f2e6c4');
      fill(g, 4, 11, 18, 8, '#c9a97a');
      fill(g, 4, 10, 18, 1, '#8a6134');
      /* 컵 */
      fill(g, 9, 10, 5, 5, '#f7f2e2');
      fill(g, 9, 10, 5, 1, '#6b4a2a');
      fill(g, 14, 11, 1, 3, '#f7f2e2');
      fill(g, 11, 7, 1, 2, 'rgba(255,255,255,0.5)');
      fill(g, 13, 8, 1, 1, 'rgba(255,255,255,0.4)');
      /* 의자 */
      fill(g, 6, 15, 2, 5, '#8a5a3a');
      fill(g, 15, 15, 2, 5, '#8a5a3a');
    }
    /* 레벨 핍 */
    var lv = level || 0;
    for (i = 0; i < 5; i++) {
      fill(g, 3 + i * 4, 20.5, 3, 1, i < lv ? '#e8b62c' : 'rgba(60,40,20,0.20)');
    }
    return c;
  };

  Art.paintFacility = function (canvas, kind, level) {
    var fig = Art.facilityFig(kind, level);
    var k = 2;
    canvas.width = fig.width * k;
    canvas.height = fig.height * k;
    var g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(fig, 0, 0, canvas.width, canvas.height);
  };

  /* ── 스태프 (스카우터 안내원 등) ── */
  Art.staffFig = function (kind) {
    var W = 20, H = 26;
    var c = makeCanvas(W, H);
    var g = c.getContext('2d');
    var skin = kind === 'medic' ? '#f7d3ae' : '#f0c49a';
    var hair = kind === 'scout' ? '#d8b45a' : (kind === 'coach' ? '#4a3423' : '#3a2a1c');
    /* 다리 */
    fill(g, 6, 20, 2, 5, kind === 'scout' ? '#3a4a6a' : '#4a4a4a');
    fill(g, 12, 20, 2, 5, kind === 'scout' ? '#3a4a6a' : '#4a4a4a');
    fill(g, 4, 24, 4, 2, '#3a2c22');
    fill(g, 12, 24, 4, 2, '#3a2c22');
    /* 몸통 */
    var uniform = kind === 'scout' ? '#2f8fc4' : (kind === 'medic' ? '#f2efe4' : '#2a2a2a');
    fill(g, 4, 12, 12, 9, uniform);
    fill(g, 4, 12, 2, 9, shade(uniform, 24));
    fill(g, 14, 12, 2, 9, shade(uniform, -30));
    fill(g, 4, 19, 12, 1, shade(uniform, -26));
    /* 목 */
    fill(g, 8, 10, 4, 2, skin);
    /* 머리 */
    var i;
    for (i = 0; i < HEAD_ROWS.length; i++) {
      fill(g, HEAD_ROWS[i][0], i + 1, HEAD_ROWS[i][1] - HEAD_ROWS[i][0] + 1, 1, skin);
    }
    if (kind === 'scout') {
      fill(g, 5, 0, 10, 1, hair);
      fill(g, 4, 1, 12, 3, hair);
      fill(g, 4, 4, 2, 5, hair);
      fill(g, 14, 4, 2, 5, hair);
      fill(g, 6, 2, 4, 1, shade(hair, 24));
      fill(g, 6, 6, 1, 1, '#2a2018');
      fill(g, 9, 6, 1, 1, '#2a2018');
      fill(g, 8, 8, 2, 1, shade(skin, -40));
      fill(g, 7, 9, 4, 1, '#a8442e');
    } else if (kind === 'coach') {
      fill(g, 4, 0, 12, 3, hair);
      fill(g, 4, 2, 12, 1, shade(hair, -20));
      fill(g, 6, 5, 2, 1, '#2a2018'); fill(g, 10, 5, 2, 1, '#2a2018');
      fill(g, 8, 7, 2, 1, shade(skin, -40));
      fill(g, 7, 9, 4, 1, '#8a4a3a');
      /* 모자 */
      fill(g, 4, 0, 12, 2, '#2a3a5a');
      fill(g, 3, 2, 14, 1, '#3a4a6a');
    } else {
      fill(g, 5, 0, 10, 2, hair);
      fill(g, 4, 1, 2, 4, hair);
      fill(g, 14, 1, 2, 4, hair);
      fill(g, 6, 5, 2, 1, '#2a2018'); fill(g, 10, 5, 2, 1, '#2a2018');
      fill(g, 8, 7, 2, 1, shade(skin, -40));
      fill(g, 7, 9, 4, 1, '#a8442e');
      /* 간호 모자 */
      fill(g, 7, 0, 6, 2, '#f7f2e2');
      fill(g, 9, 0, 2, 2, '#c8432f');
    }
    /* 팔 */
    fill(g, 2, 12, 2, 5, uniform);
    fill(g, 16, 12, 2, 5, uniform);
    fill(g, 2, 17, 2, 3, skin);
    fill(g, 16, 17, 2, 3, skin);
    /* 넥타이 / 목걸이 */
    if (kind === 'scout') {
      fill(g, 9, 12, 2, 6, '#f2e6c4');
      fill(g, 8, 12, 4, 1, '#e8b62c');
    }
    /* 소품 */
    if (kind === 'scout') {
      /* 돋보기 */
      fill(g, 16, 18, 2, 2, '#c9a227');
      fill(g, 17, 19, 2, 2, '#8a6a3a');
    } else if (kind === 'coach') {
      fill(g, 16, 16, 2, 2, '#f2e6c4');
    }
    return c;
  };

  Art.paintStaff = function (canvas, kind) {
    var fig = Art.staffFig(kind);
    var k = 3;
    canvas.width = fig.width * k;
    canvas.height = fig.height * k;
    var g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(fig, 0, 0, canvas.width, canvas.height);
  };

  /* ── 선수 목록형 카드용 S/T/P 게이지 ── */
  Art.gaugeHTML = function (v, cls) {
    var pct = clamp(v, 0, 10) * 10;
    return '<span class="gauge ' + (cls || '') + '"><i style="width:' + pct + '%"></i></span>';
  };

  DS.Art = Art;

})(window);
