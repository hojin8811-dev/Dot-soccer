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
  /* 적성 피치맵: 13 포지션 전부, 좌우 완전 대칭 (위 = 상대 골대) */
  var APT_LAYOUT = {
    LWF: { x: 12, y: 22 }, ST: { x: 41, y: 11 }, CF: { x: 59, y: 11 }, RWF: { x: 88, y: 22 },
    AM:  { x: 50, y: 36 },
    LWB: { x: 7,  y: 42 }, RWB: { x: 93, y: 42 },
    CM:  { x: 37, y: 55 }, DM: { x: 63, y: 55 },
    LB:  { x: 24, y: 70 }, CB: { x: 50, y: 75 }, RB: { x: 76, y: 70 },
    GK:  { x: 50, y: 89 }
  };
  DS.APT_LAYOUT = APT_LAYOUT;
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
  DS.FORMATIONS = FORMATIONS;
  DS.FORMATION_KEYS = ['4-2-3-1', '3-4-2-1', '4-3-3', '4-1-4-1', '4-4-2', '3-5-2', '5-3-2', '4-2-2-2'];

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
    var i, code, base, gp = posGroup(pos);
    for (i = 0; i < APT_LIST.length; i++) {
      code = APT_LIST[i];
      if (code === pos) { apt[code] = irange(8, 9); continue; }
      if (posGroup(code) === gp) { base = irange(5, 8); }
      else if (APT_NEAR[pos] && APT_NEAR[pos].indexOf(code) >= 0) { base = irange(4, 7); }
      else { base = irange(1, 4); }
      if (gp === 'GK' && code !== 'GK') { base = irange(1, 3); }
      if (code === 'GK' && gp !== 'GK') { base = irange(1, 2); }
      apt[code] = clamp(base, 1, 9);
    }
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
    /* p33~p36: 골키퍼 전용 일러스트(장갑) */
    { hair: 'spiky',    color: '#6b4423', skin: '#f3cba4' },
    { hair: 'buzz',     color: '#1e2028', skin: '#f2c9a2' },
    { hair: 'spiky',    color: '#e3c169', skin: '#f7d7b2' },
    { hair: 'ponytail', color: '#d5d8dc', skin: '#f6d4ae' }
  ];
  DS.PIC_META = PIC_META;
  DS.PIC_COUNT = 36;
  /* 골키퍼 장갑을 낀 일러스트는 GK 전용 — 필드 선수와 절대 섞이지 않는다 */
  var GK_PORTRAITS = [6, 15, 20, 33, 34, 35, 36];
  var FIELD_PORTRAITS = [];
  (function () {
    var n;
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
    var p = {
      id: opts.id || newId(),
      name: name,
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
        p.apt = makeAptitude('GK'); p.stats = statSheet(p);
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
    fill(g, 5, 22, 3, 2, shirt);
    fill(g, 12, 22, 3, 2, shirt);
    fill(g, 5, 22, 3, 1, trim);
    fill(g, 12, 22, 3, 1, trim);
    fill(g, 5, 22, 1, 2, shade(shirt, 18));
    fill(g, 14, 22, 1, 2, shade(shirt, -30));
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
    var browCol = hex2rgb(hair)[0] + hex2rgb(hair)[1] + hex2rgb(hair)[2] < 210 ? '#5a3a24' : shade(hair, -12);
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
      fill(g, 7, 12, 6, 1, trim);
      fill(g, 7, 13, 1, 1, trim);
      fill(g, 12, 13, 1, 1, trim);
      fill(g, 8, 12, 4, 1, skinD2);
      fill(g, 9, 13, 2, 1, skinD2);
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

  Art.pitchMargin = function (W, H) {
    return Math.max(9, Math.round(Math.min(W, H) * 0.032));
  };

  /* ── 현대 잔디 경기장 ── */
  Art.drawPitch = function (g, W, H, opt) {
    opt = opt || {};
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
    var fx = m, fy = m, fw = W - m * 2, fh = H - m * 2;
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

  /* ───────── 일러스트 · SD 스프라이트 ───────── */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  Art.portraitSrc = function (p) {
    var n = (p && p.pic) ? p.pic : 1;
    return 'assets/portraits/p' + pad2(n) + '.png';
  };
  Art.headSrc = function (p) {
    var n = (p && p.pic) ? p.pic : 1;
    return 'assets/portraits/head/p' + pad2(n) + '.png';
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

  /* ───────── 피치용 2.5등신 SD — 일러스트 얼굴 + 벡터 유니폼 바디 ───────── */
  var SD_W = 44, SD_H = 62, SD_S = 3;
  var sdCache = {};
  var headImgCache = {};

  /* 일러스트 얼굴(head/*.png) 이미지 로더 — 한 번만 생성 */
  Art.headImage = function (p) {
    var n = (p && p.pic) ? p.pic : 1;
    if (headImgCache[n]) { return headImgCache[n]; }
    if (typeof Image === 'undefined') { return null; }
    var img = new Image();
    img.src = 'assets/portraits/head/p' + pad2(n) + '.png';
    headImgCache[n] = img;
    return img;
  };
  Art.headReady = function (p) {
    var img = Art.headImage(p);
    return !!(img && img.complete && (img.naturalWidth || img.width) > 0);
  };

  Art.sdSprite = function (p, kit, frame, facing) {
    frame = ((frame || 0) % 4 + 4) % 4;
    facing = facing >= 0 ? 1 : -1;
    var pic = p.pic || 0;
    var ready = Art.headReady(p);
    var key = p.id + '|' + kit.shirt + '|' + kit.shorts + '|' + kit.trim + '|' + frame + '|' + facing + '|' + pic + '|' + (p.number || 0) + '|' + (ready ? 1 : 0);
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
    var skinD = shade(skin, -30);
    var hair = meta.color || '#3a2a1a';
    var ink = '#111c17';
    var s = facing;                      /* 달리는 방향 */
    var swing = [1, 0.15, -1, -0.15][frame];
    var lift = frame % 2 === 1 ? 1.1 : 0;
    var bob = frame % 2 === 1 ? 0.6 : 0;
    g.translate(0, bob);
    var OL = function (w) { g.lineWidth = w || 1.1; g.strokeStyle = ink; };

    function boot(x, y, dir) {
      g.save();
      g.translate(x, y);
      if (dir < 0) { g.scale(-1, 1); }
      g.fillStyle = '#1b2327';
      g.beginPath();
      g.moveTo(-2.6, 0);
      g.lineTo(1.9, -0.4);
      g.quadraticCurveTo(4.4, 0.2, 4.2, 2.0);
      g.lineTo(-2.8, 2.0);
      g.closePath(); g.fill();
      OL(0.85); g.stroke();
      g.fillStyle = trim;
      g.fillRect(-2.4, 0.5, 5.6, 0.9);
      g.restore();
    }

    function leg(hipX, dir, phase, back) {
      var footX = hipX + dir * (1.4 + phase * 2.9);
      var footY = 59.4 - (phase > 0 ? 3.0 : 0) - lift * 0.4;
      var kneeX = hipX + dir * (0.8 + phase * 1.5);
      var kneeY = (44 + footY) / 2 + 0.4;
      g.strokeStyle = back ? shade(skin, -16) : skin;
      g.lineWidth = 3.4;
      g.beginPath(); g.moveTo(hipX, 43.4); g.lineTo(kneeX, kneeY); g.lineTo(footX, footY - 1.4); g.stroke();
      /* 스타킹 */
      g.strokeStyle = back ? shade(trim, -14) : trim;
      g.lineWidth = 3.5;
      g.beginPath(); g.moveTo(kneeX, kneeY); g.lineTo(footX, footY - 1.5); g.stroke();
      g.strokeStyle = back ? shade(shirt, -20) : shirt;
      g.lineWidth = 3.5;
      g.beginPath();
      g.moveTo(kneeX + (footX - kneeX) * 0.30, kneeY + (footY - 1.5 - kneeY) * 0.30);
      g.lineTo(footX - (footX - kneeX) * 0.18, footY - 1.8);
      g.stroke();
      boot(footX, footY - 1.5, dir);
    }

    function arm(shX, shY, dir, phase, back) {
      var handX = shX + dir * (1.4 + phase * 1.9);
      var handY = shY + 8.2 - phase * 2.0;
      g.strokeStyle = back ? shade(skin, -18) : skin;
      g.lineWidth = 2.9;
      g.beginPath(); g.moveTo(shX, shY); g.lineTo(shX + dir * 1.2, shY + 4.2); g.lineTo(handX, handY); g.stroke();
      g.strokeStyle = back ? shade(shirt, -20) : shirt;
      g.lineWidth = 3.3;
      g.beginPath(); g.moveTo(shX, shY); g.lineTo(shX + dir * 1.4, shY + 3.4); g.stroke();
      g.fillStyle = back ? shade(skin, -18) : skin;
      g.beginPath(); g.arc(handX, handY, 1.5, 0, Math.PI * 2); g.fill();
    }

    /* 뒤쪽 팔 · 다리 */
    arm(15.6, 29.4, -s, -swing, true);
    leg(19.2, -s, -swing * 0.85, true);

    /* 몸통 (유니폼) */
    var bodyG = g.createLinearGradient(13, 25, 31, 43);
    bodyG.addColorStop(0, shade(shirt, 20));
    bodyG.addColorStop(0.5, shirt);
    bodyG.addColorStop(1, shade(shirt, -28));
    g.fillStyle = bodyG;
    g.beginPath();
    g.moveTo(14.4, 26.6);
    g.quadraticCurveTo(22, 24.6, 29.6, 26.6);
    g.quadraticCurveTo(32.2, 32, 31.0, 42.2);
    g.quadraticCurveTo(22, 44.4, 13.0, 42.2);
    g.quadraticCurveTo(11.8, 32, 14.4, 26.6);
    g.closePath(); g.fill();
    OL(1.05); g.stroke();
    /* 어깨 · 소매 트림 */
    g.fillStyle = trim;
    g.beginPath();
    g.moveTo(14.7, 26.4); g.quadraticCurveTo(12.0, 28.8, 12.6, 31.6);
    g.lineTo(16.2, 31.0); g.quadraticCurveTo(16.4, 28.4, 17.4, 26.2);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(29.3, 26.4); g.quadraticCurveTo(32.0, 28.8, 31.4, 31.6);
    g.lineTo(27.8, 31.0); g.quadraticCurveTo(27.6, 28.4, 26.6, 26.2);
    g.closePath(); g.fill();
    /* 칼라 */
    g.strokeStyle = trim; g.lineWidth = 1.15;
    g.beginPath(); g.moveTo(19.2, 25.8); g.quadraticCurveTo(22, 28.6, 24.8, 25.8); g.stroke();
    /* 사이드 라인 */
    g.strokeStyle = hexAlpha('#ffffff', 0.22); g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(15.6, 30); g.quadraticCurveTo(14.6, 36, 14.6, 41.4); g.stroke();
    g.beginPath(); g.moveTo(28.4, 30); g.quadraticCurveTo(29.4, 36, 29.4, 41.4); g.stroke();
    /* 등번호(가슴) */
    if (p.number) {
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.font = '800 5.6px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(p.number), 22, 34.6);
    }
    /* 반바지 */
    g.fillStyle = shorts;
    g.beginPath();
    g.moveTo(13.4, 41.6); g.quadraticCurveTo(22, 43.8, 30.6, 41.6);
    g.lineTo(30.0, 46.8); g.quadraticCurveTo(26, 48.0, 22.6, 46.6);
    g.quadraticCurveTo(18, 48.0, 14.0, 46.8);
    g.closePath(); g.fill();
    OL(0.95); g.stroke();
    g.strokeStyle = trim; g.lineWidth = 0.85;
    g.beginPath(); g.moveTo(14.4, 43.2); g.lineTo(29.6, 43.2); g.stroke();

    /* 앞쪽 다리 · 팔 */
    leg(24.8, s, swing, false);
    arm(28.4, 29.4, s, swing, false);

    /* 목 */
    g.fillStyle = skinD;
    g.fillRect(19.6, 22.4, 4.8, 4.2);
    OL(0.8); g.strokeRect(19.6, 22.4, 4.8, 4.2);

    /* 머리 — 일러스트 얼굴 이미지 */
    var img = Art.headImage(p);
    /* 뒤 실루엣 (배경 분리) */
    g.fillStyle = hexAlpha(hair, 0.35);
    g.beginPath(); g.ellipse(22, 11.6, 12.6, 12.4, 0, 0, Math.PI * 2); g.fill();
    if (img && img.complete && (img.naturalWidth || img.width) > 0) {
      g.save();
      g.beginPath();
      g.ellipse(22, 11.0, 13.8, 13.2, 0, 0, Math.PI * 2);
      g.clip();
      g.drawImage(img, 6.6, -3.6, 30.8, 30.8);
      g.restore();
    } else {
      /* 이미지 로딩 전 임시 얼굴 */
      g.fillStyle = skin;
      g.beginPath(); g.ellipse(22, 11.6, 10.2, 10.6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = hair;
      g.beginPath(); g.ellipse(22, 6.6, 10.6, 7.0, 0, Math.PI, Math.PI * 2); g.fill();
      g.fillStyle = '#20262c';
      g.beginPath(); g.arc(18, 12.4, 1.6, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(26, 12.4, 1.6, 0, Math.PI * 2); g.fill();
    }
    /* 턱 밑 그림자 */
    g.strokeStyle = hexAlpha('#000000', 0.18); g.lineWidth = 1.4;
    g.beginPath(); g.ellipse(22, 23.4, 7.2, 2.2, 0, 0.15, Math.PI - 0.15); g.stroke();

    sdCache[key] = cv;
    return cv;
  };
  Art.SD_SIZE = { w: SD_W, h: SD_H };
  Art.clearSdCache = function () { sdCache = {}; };

  DS.Art = Art;

})(window);
