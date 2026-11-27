/*! 꼬마일레븐 FC v26 — 우리만의 현대 전술 축구 RPG · 게임 상태 · UI (game.js) */
(function (global) {
  'use strict';

  var DS = global.DS;
  var U = DS.util;
  var fmt = U.fmt;
  var clamp = U.clamp;
  var chance = U.chance;
  var pick = U.pick;

  var SAVE_KEY = 'dot-soccer-v3-save';
  var MAX_SQUAD = 22;
  var BENCH_SIZE = 7;
  var DIV_SIZE = 20;              /* 1부 · 2부 각 20팀 */
  var DIV_TV = { 1: 260, 2: 90 }; /* 리그별 경기당 중계권 수입 */
  var DIV_SPONSOR = { 1: 1.6, 2: 1 };
  var CAND_COST = 2200;
  var REROLL_COST = 300;
  var EVO_COST = 900;

  var S = null;
  var EXTRA = {};
  var currentTab = 'home';
  var selId = null;
  var rolePick = null;
  var ioState = { candId: null, outId: null };
  var subState = { inId: null, outId: null };
  var trainSel = { playerId: null, menus: [] };
  var deckDraft = null;
  var TOAST_T = null;
  var hudStamp = 0;
  var subHalf = false;

  /* ═════════════════  공통 유틸  ═════════════════ */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(msg) {
    var box = document.getElementById('toast');
    if (!box) { return; }
    box.textContent = msg;
    box.classList.add('on');
    clearTimeout(TOAST_T);
    TOAST_T = setTimeout(function () { box.classList.remove('on'); }, 1900);
  }
  function shortName(n) { return !n ? '' : (n.length > 3 ? n.slice(1) : n); }
  function groupClass(code) { return DS.posGroup(code).toLowerCase(); }
  function posBadge(code, extra) {
    return '<span class="pb ' + groupClass(code) + '">' + (extra || code) + '</span>';
  }
  /* 주발 배지 — 왼쪽 파랑 · 오른쪽 빨강 · 양발 초록 */
  function footChip(p) {
    var f = (p && p.foot) ? p.foot : (DS.ensureFoot ? DS.ensureFoot(p) : '오른발');
    var c = DS.footColor ? DS.footColor(f) : '#4d7a2a';
    return '<span class="chip foot" style="background:' + c + '26;color:' + c + '">' + f + '</span>';
  }
  function stars(v) {
    var s = '', i;
    for (i = 1; i <= 5; i++) { s += i <= v ? '★' : '<i>★</i>'; }
    return '<span class="stars">' + s + '</span>';
  }
  function rareStars(n) {
    var s = '', i;
    for (i = 0; i < 5; i++) { s += i < n ? '★' : '☆'; }
    return s;
  }
  function rarityColor(p) { return DS.RARITY[p.rarity].color; }
  /* v23 — 금·은·동·전설 원형 등급 배지 */
  function tierDot(p) {
    var key = (p && p.rarity && DS.RARITY[p.rarity]) ? p.rarity : 'dong';
    var r = DS.RARITY[key];
    return '<span class="tier t-' + r.key + '" title="' + r.name + ' 등급">' + r.name.charAt(0) + '</span>';
  }

  /* ═════════════════  상태  ═════════════════ */
  /* v22 — 리그 표. 1부·2부 각 20팀이고, 우리 구단은 소속 리그 표에만 들어간다. */
  function makeTable(division, withMe) {
    var rows = [], list = divTeams(division), i;
    if (withMe) { rows.push({ id: 'me', name: '꼬마일레븐 FC', short: '꼬마', p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }); }
    for (i = 0; i < list.length; i++) {
      rows.push({ id: list[i].id, name: list[i].name, short: list[i].short, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    }
    return rows;
  }

  /* ═════════════════  리그 대진표 (v22: 20팀 · 38라운드 더블 라운드 로빈) ═════════════════
     19팀 + 우리 구단 = 20팀. 전반 19라운드(홈/원정 1회씩)를 표준 라운드 로빈으로 짜고,
     후반 19라운드는 같은 대진을 홈/원정만 뒤집어 순서를 반대로 붙인다 → 총 38라운드.
     (Circle Method — 매 라운드 모든 팀이 정확히 1경기.) */
  function makeFixtures(division, withMe) {
    var ids = withMe ? ['me'] : [], i, list = divTeams(division);
    for (i = 0; i < list.length; i++) { ids.push(list[i].id); }
    var n = ids.length;
    if (n % 2 !== 0) { ids.push('__bye'); n++; }
    var arr = ids.slice(), first = [], r, j, homeCount = {};
    for (i = 0; i < ids.length; i++) { homeCount[ids[i]] = 0; }
    for (r = 0; r < n - 1; r++) {
      var pairs = [];
      for (j = 0; j < n / 2; j++) {
        var a = arr[j], b = arr[n - 1 - j];
        if (a === '__bye' || b === '__bye') { continue; }
        /* 홈/원정: 지금까지 홈을 덜 치른 팀에 홈을 준다 */
        var ha = homeCount[a], hb = homeCount[b], aHome;
        if (ha < hb) { aHome = true; }
        else if (ha > hb) { aHome = false; }
        else { aHome = ((r + j) % 2 === 0); }
        homeCount[aHome ? a : b] += 1;
        pairs.push(aHome ? [a, b] : [b, a]);
      }
      first.push(pairs);
      arr.splice(1, 0, arr.pop());               /* 첫 팀 고정 · 나머지는 한 칸씩 회전 */
    }
    /* 후반: 홈/원정을 뒤집고 순서를 반대로 — 1라운드와 20라운드가 같은 상대가 되지 않게 */
    var second = [], k, p2;
    for (i = first.length - 1; i >= 0; i--) {
      p2 = [];
      for (j = 0; j < first[i].length; j++) { p2.push([first[i][j][1], first[i][j][0]]); }
      second.push(p2);
    }
    for (k = 0; k < second.length; k++) { first.push(second[k]); }
    return first;
  }

  /* 대진표 검사 — 20팀 38라운드 더블 라운드 로빈인지. 예전(8팀 7라운드) 세이브는 걸러낸다. */
  function fixturesValid(fx, division, withMe) {
    var list = divTeams(division);
    var teamCount = list.length + (withMe ? 1 : 0);
    var want = (teamCount - 1) * 2;
    if (!fx || !fx.length || fx.length !== want) { return false; }
    var pairHome = {}, r, i;
    for (r = 0; r < fx.length; r++) {
      var round = fx[r], used = {}, cnt = 0;
      if (!round || !round.length) { return false; }
      for (i = 0; i < round.length; i++) {
        var a = round[i][0], b = round[i][1];
        if (!a || !b || a === b) { return false; }
        if (used[a] || used[b]) { return false; }
        used[a] = 1; used[b] = 1;
        cnt++;
        pairHome[a + '>' + b] = (pairHome[a + '>' + b] || 0) + 1;
      }
      if (cnt !== teamCount / 2) { return false; }
      if (Object.keys(used).length !== teamCount) { return false; }
      if (withMe && !used.me) { return false; }
    }
    /* 각 팀이 홈·원정 한 번씩 서로 만나야 한다 */
    for (r = 0; r < list.length; r++) {
      var t = list[r].id;
      if (pairHome[t + '>' + t]) { return false; }
      if (withMe && (pairHome['me>' + t] !== 1 || pairHome[t + '>me'] !== 1)) { return false; }
    }
    return true;
  }

  /* v22 — 리그 헬퍼: 표 구성원 검사 · 정렬 · 득점 반영 */
  function tableFits(table, division) {
    var list = divTeams(division), i, have = {};
    if (!table || table.length !== list.length + 1) { return false; }
    for (i = 0; i < table.length; i++) { have[table[i].id] = 1; }
    if (!have.me) { return false; }
    for (i = 0; i < list.length; i++) { if (!have[list[i].id]) { return false; } }
    return true;
  }
  function cmpRows(a, b, pre) {
    if (!pre) {
      if (b.pts !== a.pts) { return b.pts - a.pts; }
      var da = a.gf - a.ga, db = b.gf - b.ga;
      if (db !== da) { return db - da; }
      if (b.gf !== a.gf) { return b.gf - a.gf; }
    } else {
      var sa = rowStrength(a), sb = rowStrength(b);
      if (sb !== sa) { return sb - sa; }
    }
    return a.name < b.name ? -1 : 1;
  }
  function sortRows(rows) {
    var pre = true, i;
    for (i = 0; i < rows.length; i++) { if (rows[i].p > 0) { pre = false; } }
    rows.sort(function (a, b) { return cmpRows(a, b, pre); });
    return rows;
  }
  function tableRowIn(table, id) {
    var i;
    if (!table) { return null; }
    for (i = 0; i < table.length; i++) { if (table[i].id === id) { return table[i]; } }
    return null;
  }
  function applyScoreTo(table, id, gf, ga) {
    var row = tableRowIn(table, id);
    if (!row) { return; }
    row.p++; row.gf += gf; row.ga += ga;
    if (gf > ga) { row.w++; row.pts += 3; }
    else if (gf === ga) { row.d++; row.pts += 1; }
    else { row.l++; }
  }
  /* 소속 리그 — 시즌 종료 승격·강등 결과(divs)가 기본값보다 우선한다.
     세이브를 읽는 동안에는 아직 S가 없으므로 DIV_OVERRIDE로 같은 값을 쓴다. */
  var DIV_OVERRIDE = null;
  function divTeams(division) {
    var out = [], i;
    for (i = 0; i < DS.TEAMS.length; i++) { if (teamDiv(DS.TEAMS[i].id) === division) { out.push(DS.TEAMS[i]); } }
    return out;
  }
  /* v23 — 리그 정원 20팀 유지: 우리 리그는 AI 19팀 + 'me' = 20팀, 반대 리그는 20팀(각 38라운드).
     v22 세이브 중 2부에 AI 20팀이 들어가 21팀·42라운드가 되고 1라운드가 부전승이던 것을 바로잡는다. */
  function normalizeDivs(d) {
    if (!d || (d.division !== 1 && d.division !== 2) || !d.divs) { return 0; }
    var mine = d.division, other = 3 - mine, moved = 0, guard = 0, list, t, cand, i;
    function pick(division, wantDefault, strongest) {
      var src = divTeams(division), cs = [], all = src.slice();
      for (var k = 0; k < src.length; k++) {
        if ((src[k].division || 1) === wantDefault) { cs.push(src[k]); }
      }
      list = (cs.length ? cs : all).sort(function (a, b) {
        return strongest ? (b.strength - a.strength) : (a.strength - b.strength);
      });
      return list[0] || null;
    }
    while (divTeams(mine).length > DIV_SIZE - 1 && guard < 6) {
      /* 우리 리그가 21팀이 되었다면 — 원래 반대 리그 소속이던 팀을 먼저 돌려보낸다 */
      t = pick(mine, other, false);
      if (!t) { break; }
      d.divs[t.id] = other;
      guard++;
      if (d.log) { d.log.push('리그 정원 정리 — ' + t.name + ' ' + divName(mine) + ' → ' + divName(other)); }
      moved++;
    }
    while (divTeams(other).length > DIV_SIZE && guard < 12) {
      t = pick(other, mine, true);
      if (!t) { break; }
      d.divs[t.id] = mine;
      guard++;
      if (d.log) { d.log.push('리그 정원 정리 — ' + t.name + ' ' + divName(other) + ' → ' + divName(mine)); }
      moved++;
    }
    if (moved) { d.divFixed = (d.divFixed || 0) + moved; }
    return moved;
  }

  function teamDiv(id) {
    var map = (S && S.divs) ? S.divs : DIV_OVERRIDE;
    if (map && map[id]) { return map[id]; }
    var i;
    for (i = 0; i < DS.TEAMS.length; i++) { if (DS.TEAMS[i].id === id) { return DS.TEAMS[i].division || 1; } }
    return 1;
  }

  function autoLineup(squad, formation) {
    var slots = DS.FORMATIONS[formation].slots;
    var used = {}, lineup = [], i, k, best, bestScore, p, sc;
    for (i = 0; i < slots.length; i++) {
      best = null; bestScore = -9999;
      for (k = 0; k < squad.length; k++) {
        p = squad[k];
        if (used[p.id]) { continue; }
        sc = DS.ratingOf(p);
        if (p.pos === slots[i].pos) { sc += 30; }
        else if (DS.posGroup(p.pos) === DS.posGroup(slots[i].pos)) { sc += 4; }
        else { sc -= 12; }
        sc += (p.apt[slots[i].pos] || 1) * 2.2;
        if (slots[i].k) { sc += 1; }
        if (sc > bestScore) { bestScore = sc; best = p; }
      }
      if (best) { lineup.push(best.id); used[best.id] = true; } else { lineup.push(null); }
    }
    return lineup;
  }

  function autoBench(squad, lineup) {
    var inLine = {}, i;
    for (i = 0; i < lineup.length; i++) { if (lineup[i]) { inLine[lineup[i]] = true; } }
    var rest = squad.filter(function (p) { return !inLine[p.id]; });
    rest.sort(function (a, b) { return DS.ratingOf(b) - DS.ratingOf(a); });
    var bench = [], need = ['GK', 'DF', 'MF', 'FW'], j, p, g;
    for (j = 0; j < need.length && bench.length < BENCH_SIZE; j++) {
      for (i = 0; i < rest.length; i++) {
        p = rest[i];
        g = DS.posGroup(p.pos);
        if ((need[j] === 'GK' && g === 'GK') || (need[j] !== 'GK' && g === need[j])) {
          if (bench.indexOf(p.id) < 0) { bench.push(p.id); break; }
        }
      }
    }
    for (i = 0; i < rest.length && bench.length < BENCH_SIZE; i++) {
      if (bench.indexOf(rest[i].id) < 0) { bench.push(rest[i].id); }
    }
    return bench;
  }

  function autoRoles() {
    var st = starters();
    if (!st.length) { return; }
    function best(fn) {
      var b = st[0], bv = -999, i, v;
      for (i = 0; i < st.length; i++) { v = fn(st[i]); if (v > bv) { bv = v; b = st[i]; } }
      return b.id;
    }
    S.roles = {
      cap: best(function (p) { return p.set.cap + p.tenure * 0.3; }),
      fk: best(function (p) { return p.set.fk + p.t * 0.4; }),
      ck: best(function (p) { return p.set.ck + p.t * 0.3; }),
      pk: best(function (p) { return p.set.pk + p.t * 0.4; })
    };
  }

  function defaultState() {
    DS.resetNames();
    var squad = DS.makeInitialSquad();
    var st = {
      v: 6,
      club: { name: '꼬마일레븐 FC', emblem: 'bolt', kit: { shirt: '#c8432f', shorts: '#16241f', trim: '#f0e6cc' } },
      money: 7200,
      fans: 1280,
      morale: 66,
      condition: 88,
      season: 1,
      round: 0,
      seasonOver: false,
      /* v22 — 1부/2부 리그. 새 게임은 2부에서 출발한다. */
      division: 2,
      divs: {},
      divView: 2,
      seasonReview: null,
      formation: '4-2-3-1',
      tactics: 'balanced',
      uiMode: 'basic',
      deck: DS.DEFAULT_DECK.slice(),
      squad: squad,
      lineup: [],
      bench: [],
      roles: {},
      facilities: { training: 0, medical: 0, shop: 0, fanclub: 0, cafe: 0 },
      sponsor: 'kimbap',
      combos: [],
      table: makeTable(2, true),
      fixtures: makeFixtures(2, true),
      otherTable: makeTable(1, false),
      otherFixtures: makeFixtures(1, false),
      career: [],
      challengeLeft: 1,
      smatchTickets: 3,
      smatchStreak: 0,
      totals: { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, conceded: 0 },
      lastResult: null,
      lastReport: null,
      scoutCandidates: [],
      scoutPity: 0,
      managers: ['m01'],
      manager: 'm01',
      mgrCand: [],
      /* v21 — 이적시장 · 유소년 아카데미 */
      transfer: { round: -1, listings: [], myListings: [], sold: 0, bought: 0 },
      youth: { intake: [], intakeRound: -1, coachTarget: null, coachPos: null, promoted: 0 },
      /* v23 — 2군 리그(아카데미 출전) · 시즌 전환 노화 알림 */
      reserve: { ids: [], log: [], last: null, played: 0 },
      /* v24 — 비동기 PvP(유저 대전) 전적 · 최근 대결 기록 */
      pvp: defaultPvp(),
      /* v25 — 무료 팀 휴식(라운드당 1회) 사용 라운드 */
      restRound: -1,
      ageNotices: [],
      expLog: [],
      dex: { players: {}, emblems: {}, kits: {} },
      /* v21b ⑥ — 초보자 3단계 가이드 진행 상태 (localStorage 세이브에 함께 저장) */
      guide: { done: {}, open: true, hidden: false },
      log: []
    };
    S = st;
    /* v24 — 새 게임 상태를 만들 때는 이전 플레이의 리그 소속 매핑(divs)이 남지 않게 한다.
       (S 를 새 상태로 바꾼 뒤에 표·대진표를 다시 만들어 21팀·42라운드가 생기지 않게) */
    DIV_OVERRIDE = st.divs;
    st.table = makeTable(st.division, true);
    st.fixtures = makeFixtures(st.division, true);
    st.otherTable = makeTable(3 - st.division, false);
    st.otherFixtures = makeFixtures(3 - st.division, false);
    st.lineup = autoLineup(squad, st.formation);
    st.bench = autoBench(squad, st.lineup);
    autoRoles();
    dexTouchAll();
    return st;
  }

  function dexTouchAll() {
    var i;
    for (i = 0; i < S.squad.length; i++) { S.dex.players[S.squad[i].name] = 1; }
    S.dex.emblems[S.club.emblem] = 1;
    S.dex.kits[S.club.kit.shirt] = 1;
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) { return null; }
      var d = JSON.parse(raw);
      if (!d || (d.v !== 3 && d.v !== 4 && d.v !== 5 && d.v !== 6 && d.v !== 7) || !d.squad || !d.lineup || !d.club) { return null; }
      /* v26 — 게임 이름 변경(도트싸커 → 꼬마일레븐 FC). 구단명을 직접 바꾼 세이브는 그대로 두고,
         손대지 않은 옛 기본값 '도트 유나이티드'만 새 기본값으로 옮긴다(세이브 키·진행은 그대로). */
      if (d.club.name === '도트 유나이티드') { d.club.name = '꼬마일레븐 FC'; }
      /* 같은 이유로 옛 기본값으로 저장된 최근 경기·결과서의 홈팀 표기도 함께 옮긴다 */
      if (d.lastResult) {
        if (d.lastResult.homeName === '도트 유나이티드') { d.lastResult.homeName = '꼬마일레븐 FC'; }
        if (d.lastResult.homeShort === '도트') { d.lastResult.homeShort = '꼬마일레븐'; }
      }
      if (d.lastReport) {
        if (d.lastReport.homeName === '도트 유나이티드') { d.lastReport.homeName = '꼬마일레븐 FC'; }
        if (d.lastReport.homeShort === '도트') { d.lastReport.homeShort = '꼬마일레븐'; }
        if (d.lastReport.stadium === '도트 파크') { d.lastReport.stadium = '꼬마일레븐 파크'; }
      }
      /* v22 — 1부/2부 리그: division 필드가 없는 구버전 세이브는 1부 유지로 안전 처리 */
      if (!d.divs || typeof d.divs !== 'object') { d.divs = {}; }
      DIV_OVERRIDE = d.divs;
      if (!d.log) { d.log = []; }
      /* v24 — 기존 세이브에는 PvP 전적이 없다: 기본값으로 채운다(리그·세이브 호환 유지) */
      ensurePvp(d);
      if (d.division !== 1 && d.division !== 2) {
        d.division = 1;
        d.migrated22 = 1;
        /* 1부는 20팀 정원 — 우리 구단이 들어가므로 가장 약한 1부 구단 하나를 2부로 내린다 */
        var weakD1 = DS.teamsOf(1).slice().sort(function (a, b) { return a.strength - b.strength; })[0];
        if (weakD1) { d.divs[weakD1.id] = 2; }
        d.log.push('S' + (d.season || 1) + ' 1·2부 리그 도입 — 기존 구단은 1부로 이어받고 ' + (weakD1 ? weakD1.name + '은(는) 2부로' : ''));
      }
      /* v23 — 리그 정원 정리: 우리 디비전은 AI 19팀 + me = 20팀, 반대 리그는 20팀 (각 38라운드).
         v22에서 2부에 AI 20팀이 있어 21팀·42라운드가 되고 1라운드가 부전승이던 세이브를 여기서 바로잡는다. */
      normalizeDivs(d);
      if (!tableFits(d.table, d.division)) {
        d.table = makeTable(d.division, true);
        d.round = 0;
        d.seasonOver = false;
        d.seasonReview = null;
        d.log.push('S' + (d.season || 1) + ' ' + d.division + '부 리그 20팀 38라운드로 리그 재편');
      }
      /* v15 — 깨진 대진표(팀 중복/누락·라운드 수 오류)는 표준 라운드 로빈으로 재생성 */
      if (!d.fixtures || !d.fixtures.length) {
        d.fixtures = makeFixtures(d.division, true);
        d.round = 0; d.seasonOver = false;
      } else if (d.fixtures.length !== 38 || !fixturesValid(d.fixtures, d.division, true)) {
        var badR = d.fixtures.length;
        d.fixtures = makeFixtures(d.division, true);
        d.round = 0;
        d.seasonOver = false;
        d.seasonReview = null;
        d.fixtureFixed = 1;
        d.log.push('S' + (d.season || 1) + ' ' + d.division + '부 ' + badR + '라운드 대진표 → 38라운드로 자동 복구');
      }
      /* 반대 리그(1부↔2부) 표·대진표 — 관전·순위표 탭용. 없으면 새로 만든다 */
      if (!d.otherTable || d.otherTable.length !== divTeams(3 - d.division).length) {
        d.otherTable = makeTable(3 - d.division, false);
      }
      if (!d.otherFixtures || !fixturesValid(d.otherFixtures, 3 - d.division, false)) {
        d.otherFixtures = makeFixtures(3 - d.division, false);
      }
      if (d.divView !== 1 && d.divView !== 2) { d.divView = d.division; }
      if (!('seasonReview' in d)) { d.seasonReview = null; }
      if (!DS.FORMATIONS[d.formation]) { d.formation = '4-2-3-1'; }
      if (!d.bench || d.bench.length < BENCH_SIZE) { d.bench = autoBench(d.squad, d.lineup); }
      if (!d.roles) { d.roles = {}; }
      if (!d.facilities) { d.facilities = { training: 0, medical: 0, shop: 0, fanclub: 0, cafe: 0 }; }
      if (!d.dex) { d.dex = { players: {}, emblems: {}, kits: {} }; }
      if (!d.totals) { d.totals = { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, conceded: 0 }; }
      if (!d.career) { d.career = []; }
      if (!d.combos) { d.combos = []; }
      if (!d.deck || !d.deck.length) { d.deck = DS.DEFAULT_DECK.slice(); }
      if (!d.uiMode) { d.uiMode = 'basic'; }
      if (typeof d.smatchTickets !== 'number') { d.smatchTickets = 3; }
      if (!d.transfer || !d.transfer.listings) { d.transfer = { round: -1, listings: [], myListings: [], sold: 0, bought: 0 }; }
      if (!d.transfer.myListings) { d.transfer.myListings = []; }
      /* v23 — 기존 세이브의 매물도 롤이 비어 있으면 포지션·등급에 맞춰 보정 */
      var mk0;
      for (i2 = 0; i2 < d.transfer.listings.length; i2++) {
        mk0 = d.transfer.listings[i2];
        if (mk0 && mk0.player && !mk0.player.role) { mk0.player.role = DS.pickRoleFor(mk0.player); }
      }
      if (!d.youth || !d.youth.intake) { d.youth = { intake: [], intakeRound: -1, coachTarget: null, coachPos: null, promoted: 0 }; }
      /* v23 — 2군 · 나이 · 유소년 출신 표식 마이그레이션 */
      if (!d.reserve || !d.reserve.ids) { d.reserve = { ids: [], log: [], last: null, played: 0 }; }
      if (!d.reserve.log) { d.reserve.log = []; }
      if (!d.ageNotices) { d.ageNotices = []; }
      var yk;
      for (i2 = 0; i2 < d.youth.intake.length; i2++) {
        yk = d.youth.intake[i2];
        if (yk) { yk.originYouth = true; if (typeof yk.age !== 'number') { yk.age = 16; } }
      }
      if (!d.expLog) { d.expLog = []; }
      /* v21b ⑥ — 기존 세이브: 이미 경기를 치른 구단에는 가이드를 접어 둔다 */
      if (!d.guide) { d.guide = { done: {}, open: true, hidden: !!(d.totals && d.totals.matches > 0) }; }
      if (!d.guide.done) { d.guide.done = {}; }
      var i2;
      for (i2 = 0; i2 < d.squad.length; i2++) {
        var sq0 = d.squad[i2];
        if (typeof sq0.exp !== 'number') { sq0.exp = 0; }
        if (typeof sq0.level !== 'number') { sq0.level = 0; }
        if (typeof sq0.pot !== 'number') { sq0.pot = Math.min(95, Math.max(60, DS.ratingOf(sq0) + 8)); }
      }
      if (typeof d.smatchStreak !== 'number') { d.smatchStreak = 0; }
      if (typeof d.restRound !== 'number') { d.restRound = -1; }
      if (typeof d.condition !== 'number') { d.condition = 88; }
      if (typeof d.morale !== 'number') { d.morale = 66; }
      if (!d.sponsor) { d.sponsor = 'kimbap'; }
      if (!d.scoutCandidates) { d.scoutCandidates = []; }
      if (typeof d.scoutPity !== 'number') { d.scoutPity = 0; }
      /* v5: 감독(매니저) — 기본 감독 1명 지급 */
      if (!d.managers || !d.managers.length) { d.managers = ['m01']; }
      if (!d.manager || d.managers.indexOf(d.manager) < 0) { d.manager = d.managers[0]; }
      if (!d.mgrCand) { d.mgrCand = []; }
      /* v2 → v3 포지션 마이그레이션 */
      var i;
      for (i = 0; i < d.squad.length; i++) {
        var p = d.squad[i];
        if (p.pos === 'DF') { p.pos = 'CB'; }
        else if (p.pos === 'MF') { p.pos = 'CM'; }
        else if (p.pos === 'FW') { p.pos = 'ST'; }
        if (!p.pic) { p.pic = 0; }
        if (!p.lock) { p.lock = DS.LOCKER[i % 4].key; }
        /* v13: 주발 — 기존 선수는 id/이름 시드로 결정적 배정 + 좌우 적성 재보정 */
        DS.ensureFoot(p);
        /* 이전 세이브의 좌우 적성 순서도 주발에 맞게 정돈 (반대쪽만 내림, 되돌려도 같은 값) */
        if (p.apt) { DS.enforceFootOrder(p.apt, p.foot); }
      }
      if (d.scoutCandidates && d.scoutCandidates.length) {
        for (i = 0; i < d.scoutCandidates.length; i++) { DS.ensureFoot(d.scoutCandidates[i]); }
      }
      /* v4: 선발 11 + 벤치 5 = 16명의 일러스트(p01~p32) 중복 제거 */
      DS.assignUniquePics(d.squad);
      if (d.scoutCandidates && d.scoutCandidates.length) { DS.assignUniquePics(d.scoutCandidates); }
      if (!d.homeFormation) { d.homeFormation = d.formation; }
      d.v = 6;
      return d;
    } catch (e) { global.__DS_LOAD_ERR = String((e && e.stack) || e); return null; }
  }

  /* ═════════════════  조회 ═════════════════ */
  /* 영입·후보가 기존 선수와 같은 얼굴을 쓰지 않도록 */
  function ensureUniquePic(p) {
    if (!p) { return; }
    var used = {}, dup = !p.pic || !DS.picAllowed(p.pos, p.pic), i, q;
    for (i = 0; i < S.squad.length; i++) {
      q = S.squad[i];
      if (q.id === p.id) { continue; }
      if (q.pic === p.pic) { dup = true; }
      used[q.pic] = 1;
    }
    if (dup) { p.pic = DS.nextFreePic(S.squad, p.pos); }
  }

  function byId(id) {
    var i;
    if (!id) { return null; }
    for (i = 0; i < S.squad.length; i++) { if (S.squad[i].id === id) { return S.squad[i]; } }
    return EXTRA[id] || null;
  }
  function starters() {
    var out = [], i, p;
    for (i = 0; i < S.lineup.length; i++) { p = byId(S.lineup[i]); if (p) { out.push(p); } }
    return out;
  }
  function benchPlayers() {
    var out = [], i, p;
    for (i = 0; i < S.bench.length; i++) {
      p = byId(S.bench[i]);
      if (p && S.lineup.indexOf(p.id) < 0) { out.push(p); }
    }
    return out;
  }
  function backups() {
    var used = {}, i;
    for (i = 0; i < S.lineup.length; i++) { used[S.lineup[i]] = 1; }
    for (i = 0; i < S.bench.length; i++) { used[S.bench[i]] = 1; }
    return S.squad.filter(function (p) { return !used[p.id]; });
  }

  /* ═════════════════  지표 ═════════════════ */
  function teamPower() {
    var f = DS.FORMATIONS[S.formation], sum = 0, n = 0, i, p, ov, apt;
    for (i = 0; i < f.slots.length; i++) {
      p = byId(S.lineup[i]);
      if (!p) { continue; }
      ov = DS.ratingOf(p);
      apt = p.apt[f.slots[i].pos] || 1;
      ov += (apt - 5) * 1.3;
      if (p.pos === f.slots[i].pos) { ov += 2; }
      if (f.slots[i].k && p.pos === f.slots[i].pos) { ov += 2; }
      if (p.role) { ov += 1; }
      sum += ov; n++;
    }
    var base = n ? sum / n : 40;
    var fx = mgrFx();
    return Math.round(base + (chemistry() - 55) / 12 + (fx.org || 0) * 0.35 + (mgrSync() ? 3 : 0));
  }

  function chemistry() {
    var f = DS.FORMATIONS[S.formation], st = starters(), i, p, apt, sum = 0, n = 0;
    for (i = 0; i < st.length; i++) {
      p = st[i];
      apt = p.apt[f.slots[i] ? f.slots[i].pos : p.pos] || 1;
      sum += apt * 10; n++;
    }
    var base = n ? sum / n : 40;
    var syn = DS.lockSynergy(st), bonus = 0;
    for (i = 0; i < syn.length; i++) { bonus += syn[i].value; }
    var fx = mgrFx();
    return Math.round(clamp(base * 0.8 + 22 + bonus + (fx.org || 0) * 1.2 + (mgrSync() ? 2 : 0), 5, 99));
  }

  /* ═════════════════  감독 (Manager) ═════════════════ */
  function mgr() { return DS.managerOf(S.manager); }
  function mgrFx() { return DS.managerFx(mgr()); }
  function mgrSync() { return !!(S.formation && mgr().formation === S.formation); }
  function managerHTML(cls) {
    var m = mgr(), fx = DS.managerFx(m), i, t, tags = '';
    for (i = 0; i < m.traits.length; i++) {
      t = DS.managerTrait(m.traits[i].k);
      tags += '<span class="mtag" style="background:' + t.color + '22;color:' + t.color + '">' + t.icon + ' ' + t.name + ' +' + m.traits[i].v + '</span>';
    }
    return '<div class="mgr ' + (cls || '') + '">' +
      '<span class="mgr-art"><img src="' + DS.Art.managerHead(m) + '" alt=""></span>' +
      '<span class="mgr-main"><span class="mgr-top"><b>' + esc(m.name) + ' 감독</b>' +
      '<span class="chip" style="background:' + DS.RARITY[m.rarity].color + '22;color:' + DS.RARITY[m.rarity].color + '">' + DS.RARITY[m.rarity].name + '</span></span>' +
      '<span class="mgr-sub">' + esc(DS.tacticStyle(m.tacticStyle).name) + ' · 고유 ' + m.formation + (mgrSync() ? ' <em class="sync">시너지 ON</em>' : '') + '</span>' +
      '<span class="mgr-tags">' + tags + '</span>' +
      (cls === 'club' ? '<span class="mgr-grow">🌱 육성: ' + esc(DS.growthLine(m)) + '</span>' : '') +
      '</span>' +
      '</div>';
  }
  function pickMgrCandidates() {
    var pool = [], i, pick3;
    for (i = 0; i < DS.MANAGERS.length; i++) {
      if (S.managers.indexOf(DS.MANAGERS[i].id) < 0) { pool.push(DS.MANAGERS[i].id); }
    }
    pool = U.shuffle(pool);
    pick3 = pool.slice(0, 4);
    S.mgrCand = pick3;
  }

  function opponentTeam(id) {
    var i;
    for (i = 0; i < DS.TEAMS.length; i++) { if (DS.TEAMS[i].id === id) { return DS.TEAMS[i]; } }
    return DS.TEAMS[0];
  }
  function strengthOf(id) {
    if (id === 'me') { return teamPower(); }
    return opponentTeam(id).strength;
  }

  function currentOpponent() {
    if (S.round >= S.fixtures.length) { return null; }
    var pairs = S.fixtures[S.round], i;
    for (i = 0; i < pairs.length; i++) {
      if (pairs[i][0] === 'me') { return { id: pairs[i][1], home: true }; }
      if (pairs[i][1] === 'me') { return { id: pairs[i][0], home: false }; }
    }
    return null;
  }
  function nextOppStrength() {
    var o = currentOpponent();
    if (!o) { return 70; }
    return opponentTeam(o.id).strength;
  }

  /* 기대 득점(xG) */
  function xgEstimate(oppStr) {
    var f = DS.FORMATIONS[S.formation];
    var power = teamPower();
    var base = 1.45 + (power - (oppStr || nextOppStrength())) / 16;
    base += (f.metrics.tempo - 70) / 95 + (f.metrics.press - 70) / 190;
    base += (S.condition - 80) / 150;
    var syn = DS.lockSynergy(starters()), i;
    for (i = 0; i < syn.length; i++) {
      if (syn[i].key === 'fight' || syn[i].key === 'crea') { base += syn[i].value / 26; }
    }
    var fx = mgrFx();
    base += (fx.atk || 0) * 0.03 + (fx.shoot || 0) * 0.025 + (fx.org || 0) * 0.012 + (fx.jump || 0) * 0.008;
    if (mgrSync()) { base += 0.08; }
    return Math.round(clamp(base, 0.3, 3.8) * 10) / 10;
  }
  function xgAgainst(oppStr) {
    var f = DS.FORMATIONS[oppStr.formation || '4-4-2'];
    var o = oppStr.strength || 70;
    var power = teamPower();
    var base = 1.5 + (o - power) / 18 - (f.metrics.press ? 0 : 0);
    var mine = DS.FORMATIONS[S.formation];
    base -= (mine.metrics.press - 70) / 260;
    var fx = mgrFx();
    base -= (fx.def || 0) * 0.03 + (fx.jump || 0) * 0.01;
    if (mgrSync()) { base -= 0.06; }
    return Math.round(clamp(base, 0.2, 3.6) * 10) / 10;
  }
  function pressLevel() {
    var f = DS.FORMATIONS[S.formation];
    var syn = DS.lockSynergy(starters()), i, dev = 0;
    for (i = 0; i < syn.length; i++) { if (syn[i].key === 'dev') { dev = syn[i].value; } }
    var fx = mgrFx();
    return Math.round(clamp(f.metrics.press + dev * 1.6 + (S.condition - 80) / 3 +
      (fx.press || 0) * 1.2 + (fx.speed || 0) * 0.4, 20, 99));
  }
  function staminaCost() {
    var f = DS.FORMATIONS[S.formation];
    return Math.round(clamp(f.metrics.press * 0.10 + f.metrics.tempo * 0.075 + 2, 5, 26));
  }

  /* ═════════════════  헤더 ═════════════════ */
  function paintEmblems(root) {
    var list = (root || document).querySelectorAll('canvas[data-emblem]'), i, c, parts;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      parts = (c.getAttribute('data-kit') || '#c8432f|#f0e6cc').split('|');
      DS.Art.drawEmblem(c, c.getAttribute('data-emblem'), { shirt: parts[0], trim: parts[1] });
    }
  }

  function renderHeader() {
    var h = document.getElementById('topbar');
    if (!h) { return; }
    h.innerHTML =
      '<div class="tb-club">' +
      '<canvas class="tb-emblem" data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="30" height="34"></canvas>' +
      '<div class="tb-txt"><div class="tb-name">' + esc(S.club.name) + '</div>' +
      '<div class="tb-sub">시즌 ' + S.season + ' · ' + divName(S.division) + ' · ' + roundLabel() + ' · ' + ourRank() + '위 · ' + S.formation + '</div></div>' +
      '</div>' +
      '<div class="tb-chips">' +
      '<span class="tb-chip gold" title="보유 금화"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h5M9.5 14h5"/></svg><em>금화</em>' + fmt(S.money) + '</span>' +
      '<span class="tb-chip" title="팬 수"><svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 7a3 3 0 0 1 0 6M18 20c0-2.4-1-4.5-2.6-5.6"/></svg><em>팬</em>' + fmt(S.fans) + '</span>' +
      '</div>';
    paintEmblems(h);
  }

  /* ═════════════════  홈 (공식전) ═════════════════ */
  /* v21b ④ — 개막 전(전 팀 0경기)에는 승점이 모두 0이라 가나다순으로 늘어서
     전력 1위 구단이 19위로 보였다. 경기가 하나도 없을 때는 전력(OVR) 내림차순,
     동률이면 가나다순으로 초기 순위를 잡고, 1경기부터는 승점/득실/다득점 정렬을 쓴다. */
  function rowStrength(r) {
    if (!r) { return 0; }
    if (r.id === 'me') { return teamPower(); }
    var i;
    for (i = 0; i < DS.TEAMS.length; i++) { if (DS.TEAMS[i].id === r.id) { return DS.TEAMS[i].strength; } }
    return 0;
  }
  /* v21b ⑥ — 첫 방문자를 위한 3단계 가이드. 진행은 S.guide 에 저장되고
     완료/접기/다시 보지 않기가 모두 기억된다. */
  var GUIDE_STEPS = [
    { k: 'team', n: '①', t: '마이팀 포메이션 확인', d: '선발 11인과 포메이션을 본다', tab: 'squad' },
    { k: 'kickoff', n: '②', t: '공식전 첫 경기 킥오프', d: '첫 경기를 치러 승점을 쌓는다', kick: true },
    { k: 'club', n: '③', t: '클럽 시설·유소년 둘러보기', d: '훈련장과 U-18 아카데미를 확인한다', tab: 'club' }
  ];
  function guideState() {
    if (!S.guide) { S.guide = { done: {}, open: true, hidden: false }; }
    if (!S.guide.done) { S.guide.done = {}; }
    if (typeof S.guide.open !== 'boolean') { S.guide.open = true; }
    return S.guide;
  }
  function guideDone(key) {
    var g = guideState();
    if (g.done[key]) { return true; }
    return key === 'kickoff' && S.totals && S.totals.matches > 0;
  }
  function guideMark(key) {
    var g = guideState(), was = guideDone(key);
    g.done[key] = 1;
    save();
    if (!was && currentTab === 'home') { renderHome(); }
  }
  function guideHTML() {
    var g = guideState(), i, done = 0, s, on, rows = '';
    if (g.hidden) { return ''; }
    for (i = 0; i < GUIDE_STEPS.length; i++) { if (guideDone(GUIDE_STEPS[i].k)) { done++; } }
    if (!g.open) {
      return '<div class="gd-bar"><b>초보자 가이드</b><span>' + done + '/3</span>' +
        '<button data-act="guideopen">이어서 보기 ›</button>' +
        '<button class="gd-x" data-act="guidehide" aria-label="가이드 숨기기">✕</button></div>';
    }
    for (i = 0; i < GUIDE_STEPS.length; i++) {
      s = GUIDE_STEPS[i]; on = guideDone(s.k);
      rows += '<div class="gd-step' + (on ? ' done' : '') + '">' +
        '<span class="gd-no">' + (on ? '✓' : s.n) + '</span>' +
        '<span class="gd-tx"><b>' + s.t + '</b><em>' + s.d + '</em></span>' +
        (on ? '<span class="gd-ok">완료</span>' :
          (s.kick ? '<button class="btn primary sm" data-act="kickoff">킥오프</button>' :
            '<button class="btn sm" data-act="guidego" data-tab="' + s.tab + '">열기</button>')) +
        '</div>';
    }
    return '<div class="card gd-card' + (done >= 3 ? ' all' : '') + '">' +
      '<div class="card-head"><span class="dot"></span><b>처음 오셨나요? 3단계면 끝</b><span class="meta">' + done + '/3 완료</span>' +
      '<button class="gd-x" data-act="guidefold" aria-label="가이드 접기">⌃</button></div>' +
      rows +
      '<div class="gd-foot"><span>' + (done >= 3 ? '모두 끝냈습니다. 이제 원하는 대로 즐기세요' : '순서대로 하면 첫 승까지 금방입니다') + '</span>' +
      '<button class="gd-hide" data-act="guidehide">다시 보지 않기</button></div></div>';
  }

  function sortTable() {
    sortRows(S.table);
  }
  function tableRow(id) {
    return tableRowIn(S.table, id);
  }
  function ourRank() {
    sortTable();
    var i;
    for (i = 0; i < S.table.length; i++) { if (S.table[i].id === 'me') { return i + 1; } }
    return 8;
  }
  /* v21 — 현재 / 총 라운드 (예: 3 / 38 라운드) */
  function roundInfo() {
    var total = S.fixtures ? S.fixtures.length : 38;
    var cur = Math.min(total, (S.round || 0) + (S.seasonOver ? 0 : 1));
    return { cur: S.seasonOver ? total : cur, total: total, n: S.round || 0 };
  }
  function roundLabel() {
    var r = roundInfo();
    return r.cur + '/' + r.total + 'R';
  }
  /* 리그 존 — 1부: 1~4 UCL · 5~6 UEL · 18~20 강등 / 2부: 1~2 자동 승격 · 3~6 승격 PO */
  function zoneOf(rank, total, division) {
    if (division === 2) {
      if (rank <= 2) { return { key: 'pro', name: '승격' }; }
      if (rank <= 6) { return { key: 'po', name: 'PO' }; }
      return null;
    }
    if (rank <= 4) { return { key: 'ucl', name: 'UCL' }; }
    if (rank <= 6) { return { key: 'uel', name: 'UEL' }; }
    if (rank > total - 3) { return { key: 'rel', name: '강등' }; }
    return null;
  }
  function divName(div) { return div === 1 ? '1부' : '2부'; }
  /* 우리 구단이 보는 리그 순위표 (1부/2부 탭) */
  function viewRows() {
    var v = S.divView === 1 || S.divView === 2 ? S.divView : S.division;
    return v === S.division ? S.table : S.otherTable;
  }
  function viewDivision() {
    return S.divView === 1 || S.divView === 2 ? S.divView : S.division;
  }

  function deckCards() {
    var out = [], i, d;
    for (i = 0; i < S.deck.length; i++) {
      d = DS.cardOf(S.deck[i]);
      if (d) { out.push(d); }
    }
    return out;
  }

  function renderHome() {
    var box = document.getElementById('screen-home');
    if (!box) { return; }
    if (S.seasonOver && !S.seasonReview) { ensureSeasonReview(); }
    var power = teamPower(), chem = chemistry(), rank = ourRank();
    var next = currentOpponent();
    sortRows(S.table); sortRows(S.otherTable);
    var view = viewDivision();
    var vrows = viewRows();
    var rows = '', i, r, isMe, zone;
    var totalTeams = vrows.length;
    for (i = 0; i < vrows.length; i++) {
      r = vrows[i];
      isMe = r.id === 'me';
      zone = zoneOf(i + 1, totalTeams, view);
      rows += '<tr class="' + (isMe ? 'me' : '') + (zone ? ' z-' + zone.key : '') + '"><td class="rk">' +
        (zone ? '<i class="zbar"></i>' : '') + (i + 1) + '</td>' +
        '<td class="tm">' + esc(isMe ? S.club.name : r.name) + '</td>' +
        '<td>' + r.p + '</td><td>' + (r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga) + '</td>' +
        '<td class="pts">' + r.pts + '</td></tr>';
    }
    var legendInner = view === 2
      ? '<span class="z-pro"><i></i>승격 1~2</span><span class="z-po"><i></i>PO 3~6</span>'
      : '<span class="z-ucl"><i></i>UCL 1~4</span><span class="z-uel"><i></i>UEL 5~6</span><span class="z-rel"><i></i>강등 18~20</span>';
    var divTabs = '<div class="seg mini divs">' +
      '<button data-act="divview" data-v="1" class="' + (view === 1 ? 'on' : '') + '">1부' + (S.division === 1 ? ' ·우리' : '') + '</button>' +
      '<button data-act="divview" data-v="2" class="' + (view === 2 ? 'on' : '') + '">2부' + (S.division === 2 ? ' ·우리' : '') + '</button></div>';

    var nextHTML = '';
    if (S.seasonOver) {
      var w = S.table[0];
      var rv = S.seasonReview;
      var outcome = rv ? rv.outcome : (S.division === 2 ? '잔류' : '잔류');
      var outCls = outcome === '승격' ? 'lime' : (outcome === '강등' ? 'coral' : '');
      nextHTML = '<div class="card">' +
        '<div class="card-head"><span class="dot"></span><b>시즌 ' + S.season + ' 종료</b><span class="meta">FINAL · ' + divName(S.division) + '</span></div>' +
        '<div class="row between"><div><div class="b" style="font-size:12.5px">우승 · ' + esc(w.id === 'me' ? S.club.name : w.name) + ' · <b class="' + outCls + '">' + outcome + '</b></div>' +
        '<div class="tiny muted">최종 ' + rank + '위 · 승점 ' + tableRow('me').pts + (rv && rv.playoffText ? ' · ' + rv.playoffText : '') + '</div></div>' +
        '<div class="row" style="gap:4px"><button class="btn sm" data-act="seasonreview">결산 보기</button>' +
        '<button class="btn primary sm" data-act="newseason">새 시즌</button></div></div></div>';
    } else if (next) {
      var opp = opponentTeam(next.id);
      nextHTML = '<div class="card">' +
        '<div class="card-head"><span class="dot"></span><b>다음 경기 · ' + roundLabel() + '</b><span class="meta">' + (next.home ? '홈' : '원정') + ' · ' + nextLabel() + '</span></div>' +
        '<div class="vs">' +
        '<div class="vs-team"><canvas data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="38" height="44"></canvas><span class="nm">' + esc(S.club.name) + '</span><span class="st">전력 ' + power + '</span></div>' +
        '<div class="vs-mid"><b>VS</b><span>' + oppFormation(opp) + ' · ' + DS.tacticStyle(oppManager(opp).tacticStyle).name + '</span></div>' +
        '<div class="vs-team"><canvas data-emblem="' + opp.emblem + '" data-kit="' + opp.kit.shirt + '|' + opp.kit.trim + '" width="38" height="44"></canvas><span class="nm">' + esc(opp.name) + '</span><span class="st">전력 ' + opp.strength + '</span></div>' +
        '</div>' +
        '<div class="kpis" style="margin-bottom:8px">' +
        '<div class="kpi"><b class="lime">' + xgEstimate(opp.strength).toFixed(1) + '</b><span>기대 득점 xG</span></div>' +
        '<div class="kpi"><b>' + pressLevel() + '</b><span>압박 강도</span></div>' +
        '<div class="kpi"><b class="coral">-' + staminaCost() + '%</b><span>체력 소모</span></div>' +
        '<div class="kpi"><b class="' + (S.condition < COND_WARN ? 'coral' : '') + '">' + S.condition + '</b><span>팀 컨디션</span></div>' +
        '</div>' +
        (S.condition < COND_WARN ? '<div class="cond-warn">⚠ 컨디션 ' + S.condition + ' — 경기 후 -6~10. <b>팀 휴식</b>으로 회복할 수 있습니다.' +
          (restAvailable() ? ' <button class="btn sm" data-act="rest">무료 휴식 +' + REST_GAIN + '</button>' : ' <span class="tiny muted">이번 라운드 휴식 사용함</span>') + '</div>' : '') +
        '<button class="btn primary wide" data-act="kickoff">' + (S.condition < COND_GATE ? '컨디션 회복 후 킥오프 · ' + S.condition : '공식전 킥오프') + '</button></div>' +
        scoutHTML(prepareOpp('league'));
    }

    var deckHTML = '';
    var dcs = deckCards();
    deckHTML = '<div class="card tight">' +
      '<div class="card-head"><b>전술 카드 덱</b><span class="meta">' + dcs.length + '장 편성 · 경기 중 손패 3장</span></div>' +
      '<div class="deckgrid">' + dcs.map(function (d) {
        return '<div class="deckcard" style="--cc:' + d.color + '">' +
          DS.tacticArtHTML(d.key, 'dc-art') +
          '<div class="tg">' + d.tag + '</div>' +
          '<div class="nm">' + d.name + '</div>' +
          '<div class="mt">MOM <em>' + d.cost + '</em></div></div>';
      }).join('') + '</div>' +
      '<button class="btn ghost sm wide" style="margin-top:5px" data-act="deck">덱 편성 · 6장 선택</button></div>';

    var lastHTML = '';
    if (S.lastResult && S.lastReport) {
      var lr = S.lastResult;
      lastHTML = '<div class="card tight">' +
        '<div class="card-head"><b>최근 경기</b><span class="meta">' + esc(lr.awayName) + '</span></div>' +
        '<div class="row between"><div class="b" style="font-size:13px">' + esc(lr.homeName) + '</div>' +
        '<div style="font-size:20px;font-weight:900;letter-spacing:-1px">' + lr.gf + ' : ' + lr.ga + '</div></div>' +
        '<div class="tiny muted" style="margin-top:2px">MVP ' + esc(lr.mvp) + ' · 평점 ' + lr.mvpRating.toFixed(1) + ' · 보상 ' + fmt(lr.reward) + '</div>' +
        '<button class="btn ghost sm wide" style="margin-top:6px" data-act="report">상세 결과서</button></div>';
    }

    box.innerHTML =
      guideHTML() +
      '<div class="hero">' +
      '<img class="hero-img" src="assets/hero-banner.jpg" alt="">' +
      '<div class="hero-badge"><svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z"/></svg>' + S.formation + ' · ' + DS.FORMATIONS[S.formation].tag + '</div>' +
      '<div class="hero-in">' +
      '<div class="hero-kicker"><b class="brand">꼬마일레븐 FC</b> · MODERN TACTICAL SOCCER RPG</div>' +
      '<div class="hero-title">' + esc(S.club.name) + '</div>' +
      '<div class="hero-sub">' + divName(S.division) + ' 리그 ' + rank + '위 · 전력 ' + power + ' · 조직력 ' + chem + ' · 시즌 ' + S.season + '</div>' +
      '</div></div>' +

      '<div class="card tight">' +
      '<div class="club-line">' +
      '<canvas class="club-emblem" data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="46" height="52"></canvas>' +
      '<div class="club-meta"><div class="nm">' + esc(S.club.name) + ' ' + stars(powerStars(power)) + '</div>' +
      '<div class="sub">' + divName(S.division) + ' ' + rank + '위 · 사기 ' + S.morale + ' · 컨디션 ' + S.condition + ' · 팬 ' + fmt(S.fans) + '</div></div>' +
      '<div class="rank-badge">' + rank + '<span>RANK</span></div>' +
      '</div></div>' +

      nextHTML + deckHTML +
      '<div class="card">' +
      '<div class="card-head"><b>' + divName(view) + ' 리그 순위</b>' + divTabs + '</div>' +
      '<table class="tbl"><thead><tr><th>#</th><th style="text-align:left">구단</th><th>경기</th><th>득실</th><th>승점</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="zlegend">' + legendInner + '</div>' +
      '<div class="tiny muted" style="margin-top:3px">' + (view === S.division ? '우리 리그' : '관전용 · ' + divName(view) + ' 다른 리그') + ' · ' + totalTeams + '팀 · ' + roundInfo().total + '라운드 · ' + roundLabel() + '</div>' +
      '</div>' +
      lastHTML +
      '<div class="card">' +
      '<div class="card-head"><b>시즌 기록</b><span class="meta">시즌 ' + S.season + ' · ' + divName(S.division) + ' 리그</span></div>' +
      '<div class="kpis">' +
      '<div class="kpi"><b>' + tableRow('me').p + '</b><span>경기</span></div>' +
      '<div class="kpi"><b class="lime">' + tableRow('me').w + '</b><span>승</span></div>' +
      '<div class="kpi"><b>' + tableRow('me').d + '</b><span>무</span></div>' +
      '<div class="kpi"><b class="coral">' + tableRow('me').l + '</b><span>패</span></div>' +
      '<div class="kpi"><b>' + tableRow('me').gf + '</b><span>득점</span></div>' +
      '<div class="kpi"><b>' + tableRow('me').ga + '</b><span>실점</span></div>' +
      '</div>' +
      /* v25 — 라벨을 내용에 맞춘다: 위는 이번 시즌 리그 기록, 아래는 통산(전 시즌 누적) */
      '<div class="tiny muted" style="margin-top:5px">통산 전적 · ' + S.totals.matches + '경기 ' +
      S.totals.wins + '승 ' + S.totals.draws + '무 ' + S.totals.losses + '패 · ' +
      S.totals.goals + '득 ' + S.totals.conceded + '실</div></div>' +
      '<div class="card tight"><div class="row between"><div><div class="b" style="font-size:11.5px">유저 대전 · 비동기 PvP</div>' +
      '<div class="tiny muted">내 구단 코드를 보내 친구와 붙기 · 전적 ' + ensurePvp().w + '-' + ensurePvp().d + '-' + ensurePvp().l + '</div></div>' +
      '<div class="row" style="gap:4px"><button class="btn sm" data-act="pvpmycode">코드 복사</button>' +
      '<button class="btn sm primary" data-act="pvpenter">도전</button></div></div></div>' +
      '<div class="card tight"><div class="row between"><div><div class="b" style="font-size:11.5px">챌린지 매치</div>' +
      '<div class="tiny muted">최강 구단과 붙어 보상 2배 · 오늘 ' + S.challengeLeft + '회</div></div>' +
      '<button class="btn sm" data-act="challenge" ' + (S.challengeLeft <= 0 ? 'disabled' : '') + '>도전</button></div></div>';

    paintEmblems(box);
  }

  function momentumHint() {
    return '경기 중 3장 손패';
  }
  function powerStars(v) {
    if (v >= 86) { return 5; }
    if (v >= 76) { return 4; }
    if (v >= 64) { return 3; }
    if (v >= 52) { return 2; }
    return 1;
  }
  function nextLabel() {
    return ['19:30', '20:00', '21:00'][S.round % 3];
  }
  function oppFormation(team) {
    return oppManager(team).formation;
  }
  /* v14 — 상대 팀에도 감독이 있다: 팀마다 전술 철학이 다른 감독이 벤치에 선다 */
  var OPP_MANAGER = {
    byeoksan: 'm19', hangang: 'm21', dokdo: 'm27', cheongchun: 'm12',
    cheolma: 'm29', byeolbit: 'm31', baekho: 'm09'
  };
  function oppManager(team) {
    var id = team && OPP_MANAGER[team.id];
    if (id) { return DS.managerOf(id); }
    var h = 0, i, tid = (team && team.id) || '';
    for (i = 0; i < tid.length; i++) { h = (h * 31 + tid.charCodeAt(i)) % 97; }
    return DS.managerOf(DS.MANAGERS[h % DS.MANAGERS.length].id);
  }

  /* ═════════════════  S매치 ═════════════════ */
  function smatchList() {
    var pool = DS.TEAMS.slice().sort(function (a, b) { return a.strength - b.strength; });
    return [
      { key: 's1', name: 'S1 · 연습 경기', team: pool[0], reward: 420, desc: '가볍게 몸을 푸는 매치', starsN: 1 },
      { key: 's2', name: 'S2 · 친선 경기', team: pool[Math.floor(pool.length / 2)], reward: 760, desc: '중위권과의 진검승부', starsN: 2 },
      { key: 's3', name: 'S3 · 숙적전', team: pool[pool.length - 1], reward: 1320, desc: '최강 구단과의 자존심 대결', starsN: 3 }
    ];
  }

  function renderSmatch() {
    var box = document.getElementById('screen-smatch');
    if (!box) { return; }
    var list = smatchList(), i, it, opp, cards = '';
    for (i = 0; i < list.length; i++) {
      it = list[i]; opp = it.team;
      cards += '<div class="card">' +
        '<div class="card-head"><b>' + it.name + '</b><span class="meta">' + stars(it.starsN) + '</span></div>' +
        '<div class="vs">' +
        '<div class="vs-team"><canvas data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="34" height="40"></canvas><span class="nm">' + esc(S.club.name) + '</span></div>' +
        '<div class="vs-mid"><b>VS</b><span>전력 ' + opp.strength + '</span></div>' +
        '<div class="vs-team"><canvas data-emblem="' + opp.emblem + '" data-kit="' + opp.kit.shirt + '|' + opp.kit.trim + '" width="34" height="40"></canvas><span class="nm">' + esc(opp.short) + '</span></div>' +
        '</div>' +
        '<div class="tiny muted" style="margin-bottom:6px">' + it.desc + ' · 보상 ' + fmt(it.reward) + (S.smatchStreak >= 3 ? ' (+연승 보너스)' : '') + '</div>' +
        /* v21b ① — 1판 소모량(1장)과 보유량을 분리해 표기 (3장 보유 = 3판 아님) */
        '<button class="btn ' + (i === 2 ? 'red' : '') + ' wide" data-act="smatch" data-k="' + it.key + '" ' + (S.smatchTickets <= 0 ? 'disabled' : '') + ' title="이용권 1장을 쓰고 1판을 치릅니다">' +
        'S매치 시작 · 1장 (보유 ' + S.smatchTickets + ')</button>' +
        '</div>';
    }

    box.innerHTML =
      '<div class="card dark">' +
      '<div class="card-head"><span class="dot"></span><b style="color:#eaf6dd">S매치 스페셜</b><span class="meta">SPECIAL MATCH</span></div>' +
      '<div class="kpis" style="margin-bottom:8px">' +
      '<div class="kpi"><b class="lime">' + S.smatchTickets + '</b><span>이용권</span></div>' +
      '<div class="kpi"><b>' + S.smatchStreak + '</b><span>연승</span></div>' +
      '<div class="kpi"><b>' + (S.smatchStreak >= 3 ? '+25%' : '—') + '</b><span>보너스</span></div>' +
      '</div>' +
      '<div class="tiny" style="color:rgba(233,244,221,.6)">리그와 별개로 치르는 특별 경기. 실시간 모멘텀 카드가 그대로 적용됩니다.</div>' +
      '<button class="btn dark wide" style="margin-top:7px" data-act="smatchticket" ' + (S.money < 800 ? 'disabled' : '') + '>이용권 충전 · ' + fmt(800) + '</button>' +
      '</div>' + pvpSectionHTML() + cards +
      '<div class="card tight"><div class="card-head"><b>S매치 안내</b></div>' +
      '<div class="tiny muted">· 이용권은 시즌마다 3장 지급됩니다.<br>· 하프타임에 선수 교체가 가능합니다.<br>· 3연승부터 보상이 25% 늘어납니다.</div></div>';

    paintEmblems(box);
  }

  /* ═════════════════  마이팀 ═════════════════ */
  var pitchBox = { x: 0, y: 0, w: 350, h: 420 };

  function renderSquad() {
    var box = document.getElementById('screen-squad');
    if (!box) { return; }
    var f = DS.FORMATIONS[S.formation];
    var master = S.uiMode === 'master';
    var i, slot, p, chips = '', toks = '';

    for (i = 0; i < DS.FORMATION_KEYS.length; i++) {
      var kk = DS.FORMATION_KEYS[i];
      chips += '<button class="fchip ' + (S.formation === kk ? 'on' : '') + '" data-act="formation" data-f="' + kk + '">' +
        '<b>' + kk + '</b><span>' + DS.FORMATIONS[kk].tag + '</span></button>';
    }
    /* v14 — 현재 감독이 보유한 변칙 포메이션은 여기서도 선택 가능 (감독 고유는 시너지 하이라이트) */
    var anoms = DS.managerAnomalies(mgr());
    if (S.formation && DS.isAnomaly(S.formation) && anoms.indexOf(S.formation) < 0) { anoms.push(S.formation); }
    for (i = 0; i < anoms.length; i++) {
      var ak = anoms[i];
      var owned = mgr().formation === ak;
      chips += '<button class="fchip anom' + (S.formation === ak ? ' on' : '') + '" data-act="formation" data-f="' + ak + '">' +
        '<b>' + ak + '</b><span>' + DS.FORMATIONS[ak].tag + ' · ' + (owned ? '감독 고유' : '감독 전용') + '</span></button>';
    }

    for (i = 0; i < f.slots.length; i++) {
      slot = f.slots[i];
      p = byId(S.lineup[i]);
      var tokBadge = master ? slot.pos : DS.posGroup(slot.pos);
      /* 가로 전술판: 길이(y) → 화면 x(왼→오른), 폭(x) → 화면 y(먼→가까운)
         v21 — 정규화 좌표를 data-u/data-v 로 들고 다닌다. 리사이즈 때 px로 바뀐
         left/top 을 다시 %로 읽어 토큰이 피치 밖으로 날아가던 버그의 원인 제거. */
      toks += '<button class="tok ' + (p ? 'r-' + p.rarity : 'empty') + (selId === (p && p.id) ? ' sel' : '') + '" ' +
        'style="left:' + (100 - slot.y).toFixed(1) + '%;top:' + slot.x.toFixed(1) + '%" ' +
        'data-u="' + ((100 - slot.y) / 100).toFixed(4) + '" data-v="' + (slot.x / 100).toFixed(4) + '" ' +
        'data-act="starter" data-slot="' + i + '" data-id="' + (p ? p.id : '') + '">' +
        (slot.k ? '<span class="key">☆</span>' : '') +
        '<span class="rl' + (master ? ' role' : '') + '">' + tokBadge + '</span>' +
        '<span class="ring">' + (p ? '<img src="' + DS.Art.headSrc(p) + '" alt="">' : '') + '</span>' +
        '<span class="nm">' + (p ? esc(shortName(p.name)) : slot.pos) + '</span>' +
        '</button>';
    }

    var bench = benchPlayers(), benchHTML = '';
    for (i = 0; i < BENCH_SIZE; i++) {
      var b = bench[i];
      if (b) {
        benchHTML += '<button class="pcard ' + (selId === b.id ? 'sel' : '') + (DS.isYouthOrigin(b) ? ' yth' : '') + '" data-act="bench" data-id="' + b.id + '">' +
          '<span class="ph"><img src="' + DS.Art.headSrc(b) + '" alt=""></span>' +
          '<span class="pn">' + esc(shortName(b.name)) + '</span>' +
          '<span class="pm">' + posBadge(b.pos, master ? b.pos : DS.posGroup(b.pos)) + '<span class="ov">' + DS.ratingOf(b) + '</span></span>' +
          (DS.isYouthOrigin(b) ? '<em class="pc-yt">유망주 ×' + DS.YOUTH_EXP_MULT.toFixed(1) + '</em>' : '') +
          '</button>';
      } else {
        benchHTML += '<div class="pcard" style="opacity:.5"><span class="ph"></span><span class="pn">공석</span><span class="pm tiny">BENCH</span></div>';
      }
    }

    var st = starters(), syn = DS.lockSynergy(st), synHTML = '';
    var counts = { fight: 0, crea: 0, dev: 0, calm: 0 };
    for (i = 0; i < st.length; i++) { if (st[i].lock) { counts[st[i].lock]++; } }
    for (i = 0; i < DS.LOCKER.length; i++) {
      var L = DS.LOCKER[i], on = counts[L.key] >= 3;
      synHTML += '<div class="row between" style="padding:2px 0">' +
        '<span class="chip" style="background:' + L.color + '22;color:' + L.color + '">' + L.name + ' ' + counts[L.key] + '</span>' +
        '<b style="font-size:10px;color:' + (on ? '#3d6b12' : '#9aa196') + '">' + (on ? '시너지 +' + (counts[L.key] >= 5 ? 6 : 3) : '3명↑') + '</b></div>';
    }
    void syn;

    var kpiHTML =
      '<div class="kpis">' +
      '<div class="kpi"><b class="lime">' + xgEstimate().toFixed(1) + '</b><span>기대득점 xG</span></div>' +
      '<div class="kpi"><b>' + pressLevel() + '</b><span>압박</span></div>' +
      '<div class="kpi"><b class="coral">-' + staminaCost() + '%</b><span>체력</span></div></div>';

    box.innerHTML =
      '<div class="sq">' +
      '<div class="sq-left">' +
      '<div class="sq-mode">' +
      '<div class="seg mode" id="ui-mode">' +
      '<button data-act="uimode" data-v="basic" class="' + (master ? '' : 'on') + '">기본</button>' +
      '<button data-act="uimode" data-v="master" class="' + (master ? 'on' : '') + '">마스터</button></div>' +
      '<span class="modehint">' + (master ? '세부 포지션 · 롤 · xG' : '직관 포지션 · 핵심 전력') + '</span>' +
      '<span class="sq-org">' + S.formation + ' · 조직력 <em>' + chemistry() + '</em> · 전력 <em>' + teamPower() + '</em></span>' +
      '</div>' +
      '<div class="pitch sq-pitch" id="pitch-squad">' +
      '<canvas id="pitch-bg"></canvas>' + toks + '</div>' +
      '<div class="sq-bench"><span class="sqb-lbl">벤치 ' + bench.length + '/' + BENCH_SIZE + '</span>' + benchHTML + '</div>' +
      '</div>' +

      '<aside class="sq-right">' +
      '<div class="mgr-wrap" data-act="mgrmodal">' + managerHTML('strip') + '<span class="mgr-strip-btn" data-act="mgrmodal">감독실 · 상세 ›</span></div>' +
      '<div class="sq-card"><div class="card-head"><b>포메이션</b><span class="meta">' + f.tag + '</span></div>' +
      '<div class="fwrap">' + chips + '</div></div>' +
      '<div class="sq-card">' + kpiHTML + '</div>' +
      '<div class="sq-actions">' +
      '<button class="btn dark sm" data-act="autolineup">자동 배치</button>' +
      '<button class="btn sm" data-act="rolesheet">역할 지정</button>' +
      '<button class="btn primary sm" data-act="evolvelist">롤 진화</button>' +
      '</div>' +
      '<div class="sq-card sq-syn"><div class="card-head"><b>라커룸 성향</b><span class="meta">3명↑ 시너지</span></div>' + synHTML + '</div>' +
      '</aside></div>';

    drawPitchBG();
    placePitchPlayers();
    paintEmblems(box);
  }

  function drawPitchBG() {
    var cv = document.getElementById('pitch-bg');
    if (!cv) { return; }
    var wrap = cv.parentNode;
    var w = wrap.clientWidth || 360;
    var h = wrap.clientHeight || 240;
    /* 레이아웃 전(탭 숨김·회전 직후)에는 높이가 0으로 잡힌다 — 그대로 그리면
       투영이 찌그러지므로 다음 프레임에 다시 그린다 */
    if (wrap.clientHeight < 24 && !cv.getAttribute('data-wait')) {
      cv.setAttribute('data-wait', '1');
      global.requestAnimationFrame(function () { if (document.getElementById('pitch-bg') === cv) { drawPitchBG(); placePitchPlayers(); } });
      return;
    }
    cv.removeAttribute('data-wait');
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    var g = cv.getContext('2d');
    if (!g) { return; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    pitchBox = { x: 0, y: 0, w: w, h: h };
    DS.Art.drawPitch(g, w, h, { landscape: true, crowd: false, proj: DS.Art.PROJ });
  }

  /* 전술판 가로 투영 — 경기 피치와 같은 원근을 쓴다 */
  function sqPt(u, v) {
    var P = DS.Art.PROJ;
    var l = pitchBox.x + pitchBox.w * (P.farL + (P.nearL - P.farL) * v);
    var r = pitchBox.x + pitchBox.w * (P.farR + (P.nearR - P.farR) * v);
    var y = pitchBox.y + pitchBox.h * (P.farY + (P.nearY - P.farY) * (0.52 * v + 0.48 * v * v));
    return { x: l + u * (r - l), y: y, s: P.s0 + (P.s1 - P.s0) * v };
  }

  function placePitchPlayers() {
    var dots = document.querySelectorAll('#pitch-squad .tok');
    var i, u, v, pt, du, dv;
    for (i = 0; i < dots.length; i++) {
      du = dots[i].getAttribute('data-u');
      dv = dots[i].getAttribute('data-v');
      if (du === null || dv === null) {
        /* v21 이전 마크업 폴백 — 이때만 %로 읽고 곧바로 정규화 값으로 고정한다 */
        u = parseFloat(dots[i].style.left) / 100;
        v = parseFloat(dots[i].style.top) / 100;
        if (isNaN(u) || isNaN(v)) { continue; }
        dots[i].setAttribute('data-u', u);
        dots[i].setAttribute('data-v', v);
      } else {
        u = parseFloat(du);
        v = parseFloat(dv);
      }
      if (isNaN(u) || isNaN(v)) { continue; }
      pt = sqPt(u, v);
      dots[i].style.left = pt.x.toFixed(1) + 'px';
      dots[i].style.top = pt.y.toFixed(1) + 'px';
      dots[i].style.transform = 'translate(-50%,-50%) scale(' + (0.82 + (pt.s - 0.85) * 0.85).toFixed(2) + ')';
    }
  }

  /* ═════════════════  클럽 ═════════════════ */
  function facEffect(fac, lv) { return fac.effect(lv); }
  function facValue(key) {
    var fac = DS.facilityOf(key);
    return fac ? facEffect(fac, S.facilities[key] || 0) : 0;
  }

  /* ═════════════════  v25 — 팀 컨디션 · 무료 휴식  ═════════════════
     경기마다 컨디션이 6~10씩 빠지는데 회복 수단이 유료 드링크뿐이라 3~4경기 만에
     진행이 막혔다. 라운드당 1회 무료 팀 휴식(+16)을 열고, 메디컬룸 회복량을 올렸으며,
     컨디션 25 미만으로 킥오프가 막힐 때는 조용한 토스트 대신 회복 선택 모달을 연다. */
  var COND_GATE = 25;
  var REST_GAIN = 16;
  var COND_WARN = 40;
  var pendingStart = null;

  function restAvailable() { return S.restRound !== S.round; }
  function restTeam() {
    if (!restAvailable()) {
      toast('이번 라운드 휴식은 이미 사용했습니다. 다음 라운드에 다시 쓸 수 있습니다.');
      return false;
    }
    if (S.condition >= 100) { toast('컨디션이 이미 최상입니다.'); return false; }
    var before = S.condition;
    S.condition = clamp(S.condition + REST_GAIN, 0, 100);
    S.restRound = S.round;
    save();
    renderAll();
    toast('팀 휴식 · 컨디션 ' + before + ' → ' + S.condition + ' (라운드당 1회)');
    return true;
  }

  function conditionModalHTML(inClub) {
    var med = S.facilities.medical || 0;
    var canStart = !!pendingStart && S.condition >= COND_GATE;
    return '<div class="condbox">' +
      '<div class="cond-row"><span>현재 컨디션</span><b class="' + (S.condition < COND_WARN ? 'coral' : 'lime') + '">' + S.condition + '</b></div>' +
      '<div class="cond-bar"><i class="' + (S.condition < COND_WARN ? 'low' : '') + '" style="width:' + clamp(S.condition, 0, 100) + '%"></i></div>' +
      '<div class="tiny muted" style="margin:6px 0 8px">경기 1회당 -6~10 · 메디컬룸 Lv.' + med + ' 회복 +' + facValue('medical') +
      ' · 이번 라운드 무료 휴식 ' + (restAvailable() ? '가능' : '사용함') + '</div>' +
      '<button class="btn primary wide" data-act="condrest" ' + (restAvailable() ? '' : 'disabled') + '>팀 휴식 · 무료 (컨디션 +' + REST_GAIN + ')</button>' +
      '<button class="btn dark wide" style="margin-top:5px" data-act="conddrink" ' + (S.money < 600 ? 'disabled' : '') + '>컨디션 드링크 · 600 (+20)</button>' +
      (inClub ? '' : '<button class="btn ghost wide" style="margin-top:5px" data-act="condclub">클럽 → 메디컬룸 업그레이드</button>') +
      (pendingStart ? '<button class="btn ' + (canStart ? 'primary' : 'ghost') + ' wide" style="margin-top:5px" data-act="condgo" ' + (canStart ? '' : 'disabled') + '>' +
        (canStart ? '이 컨디션으로 킥오프' : '컨디션 ' + COND_GATE + ' 이상이어야 킥오프할 수 있습니다') + '</button>' : '') +
      '</div>';
  }

  function openConditionModal(kind, opt) {
    pendingStart = { kind: kind, opt: opt || {} };
    setSheet('컨디션 ' + S.condition + ' — 회복하고 킥오프', conditionModalHTML(), 'narrow');
  }

  /* ═════════════════  유소년 아카데미 (v21) ═════════════════
     U-18 후보를 발굴해 포지션·롤을 지정해 키우고, 1군 승격이나 이적시장 매각으로 연결한다. */
  var YOUTH_SIZE = 3;
  var YOUTH_REROLL = 700;
  var youthSel = { id: null, pos: null };

  function ensureYouth() {
    if (!S.youth) { S.youth = { intake: [], intakeRound: -1, coachTarget: null, coachPos: null, promoted: 0 }; }
    var y = S.youth;
    if (!y.intake) { y.intake = []; }
    /* v23 — 시즌이 바뀌면 기존 유망주는 나이를 한 살 먹고 남는다.
       20세를 넘긴 유망주는 아카데미를 떠나고, 빈자리만 새 후보로 채운다. */
    if (y.season !== S.season) {
      var keep = [], k;
      for (k = 0; k < y.intake.length; k++) {
        if ((y.intake[k].age || 16) <= 20) { keep.push(y.intake[k]); }
      }
      y.intake = keep;
      y.season = S.season;
      if (S.reserve && S.reserve.ids) {
        S.reserve.ids = S.reserve.ids.filter(function (id) { return keep.some(function (q) { return q.id === id; }); });
      }
    }
    if (!y.intake.length) {
      for (var i = 0; i < YOUTH_SIZE; i++) { y.intake.push(DS.makeYouthProspect({})); }
    } else {
      while (y.intake.length < YOUTH_SIZE) { y.intake.push(DS.makeYouthProspect({})); }
    }
    if (!youthSel.id || !y.intake.some(function (q) { return q.id === youthSel.id; })) {
      youthSel.id = y.intake.length ? y.intake[0].id : null;
      youthSel.pos = y.intake.length ? y.intake[0].pos : null;
    }
    return y;
  }
  function youthById(id) {
    var y = S.youth;
    if (!y || !y.intake) { return null; }
    for (var i = 0; i < y.intake.length; i++) { if (y.intake[i].id === id) { return y.intake[i]; } }
    return null;
  }
  function youthCost(p) { return 420 + (p ? (p.level || 0) * 90 : 0); }

  function doYouthReroll() {
    if (S.money < YOUTH_REROLL) { toast('자금이 부족합니다.'); return; }
    var y = ensureYouth();
    S.money -= YOUTH_REROLL;
    y.intake = [];
    for (var i = 0; i < YOUTH_SIZE; i++) { y.intake.push(DS.makeYouthProspect({})); }
    youthSel.id = y.intake[0].id;
    youthSel.pos = y.intake[0].pos;
    save();
    renderClub();
    toast('새 유소년 후보 3명을 불러왔습니다.');
  }

  function doYouthCoach() {
    var y = ensureYouth(), p = youthById(youthSel.id);
    if (!p) { toast('선수를 고르세요.'); return; }
    var pos = youthSel.pos || p.pos;
    var cost = youthCost(p);
    if (S.money < cost) { toast('자금이 부족합니다.'); return; }
    S.money -= cost;
    /* 포지션 목표 코칭 — 해당 포지션 적성을 끌어올리고, 적성이 충분하면 포지션을 전환 */
    p.apt = p.apt || {};
    p.apt[pos] = clamp((p.apt[pos] || 1) + 2 + Math.floor(Math.random() * 2), 1, 9);
    var w = DS.POS[pos].w;
    var keys = ['s', 't', 'p'], best = 's', i;
    for (i = 1; i < keys.length; i++) { if ((w[keys[i]] || 0) > (w[best] || 0)) { best = keys[i]; } }
    if (chance(0.7)) { p[best] = clamp((p[best] || 1) + 1, 1, 10); }
    if (chance(0.35)) { p.set.cap = clamp((p.set.cap || 1) + 1, 1, 10); }
    p.exp = (p.exp || 0) + 120;
    if (p.exp >= DS.expToNext(p.level || 0)) {
      p.exp -= DS.expToNext(p.level || 0);
      p.level = (p.level || 0) + 1;
    }
    if (p.pos !== pos && (p.apt[pos] || 0) >= 7 && chance(0.6)) {
      p.pos = pos;
      p.playType = DS.playTypeFor(p);
    }
    p.stats = DS.statSheet(p);
    save();
    renderClub();
    toast(p.name + ' 코칭 완료 · 목표 ' + pos + (p.pos === pos ? ' (포지션 전환)' : ''));
  }

  function doYouthPromote(id) {
    var y = ensureYouth(), p = youthById(id || youthSel.id);
    if (!p) { return; }
    if (S.squad.length >= MAX_SQUAD) { toast('1군 자리가 없습니다. 선수를 내놓은 뒤 승격하세요.'); return; }
    p.youth = false;
    /* v23 — 유소년 출신 표식을 남긴다. 1군에서도 경기 EXP ×2.2를 계속 받는다. */
    p.originYouth = true;
    p.pot = p.pot || Math.min(95, Math.max(60, DS.ratingOf(p) + 10));
    S.squad.push(p);
    EXTRA[p.id] = p;
    S.dex.players[p.name] = 1;
    y.intake = y.intake.filter(function (q) { return q.id !== p.id; });
    if (S.reserve && S.reserve.ids) {
      S.reserve.ids = S.reserve.ids.filter(function (q) { return q !== p.id; });
    }
    y.promoted = (y.promoted || 0) + 1;
    S.bench = autoBench(S.squad, S.lineup);
    save();
    renderAll();
    toast(p.name + ' 1군 승격! (Lv.' + (p.level || 0) + ' · OVR ' + DS.ratingOf(p) + ')');
  }

  function doYouthSell(id) {
    var y = ensureYouth(), p = youthById(id || youthSel.id);
    if (!p) { return; }
    var fee = Math.round(DS.marketValue(p) * 0.8 / 50) * 50;
    S.money += fee;
    y.intake = y.intake.filter(function (q) { return q.id !== p.id; });
    S.log.push('유소년 ' + p.name + ' 매각 ' + fmt(fee));
    save();
    renderAll();
    toast(p.name + ' 이적시장 매각 · ' + fmt(fee));
  }

  /* ═════════════════  v23 — 2군 리그 (아카데미 유망주 출전) ═════════════════
     리그 라운드를 한 경기 치를 때마다 2군도 같은 라운드를 한 번 치른다.
     출전 등록한 아카데미 유망주는 상대 구단 2군과 경기해 평점·골·도움·EXP를 받는다. */
  function ensureReserve() {
    if (!S.reserve || !S.reserve.ids) { S.reserve = { ids: [], log: [], last: null, played: 0 }; }
    if (!S.reserve.log) { S.reserve.log = []; }
    if (typeof S.reserve.played !== 'number') { S.reserve.played = 0; }
    return S.reserve;
  }
  function reserveList() {
    var y = ensureYouth(), r = ensureReserve(), out = [], i;
    for (i = 0; i < y.intake.length; i++) {
      if (r.ids.indexOf(y.intake[i].id) >= 0) { out.push(y.intake[i]); }
    }
    return out;
  }
  function isReserve(id) { return ensureReserve().ids.indexOf(id) >= 0; }

  function doYouthReserve(id) {
    var y = ensureYouth(), r = ensureReserve();
    var p = youthById(id || youthSel.id);
    if (!p) { toast('선수를 고르세요.'); return; }
    var at = r.ids.indexOf(p.id), on;
    if (at >= 0) { r.ids.splice(at, 1); on = false; } else { r.ids.push(p.id); on = true; }
    save();
    renderClub();
    toast(p.name + (on ? ' 2군 출전 등록 — 리그 라운드마다 함께 뛰어요.' : ' 2군 대기로 돌렸습니다.'));
  }

  /* 상대 2군 — 같은 리그 구단의 전력에서 12를뺐은 수준. 라운드마다 다른 구단 */
  function reserveOpponent() {
    var pool = divTeams(S.division), i, t, idx;
    if (!pool.length) { pool = DS.TEAMS.slice(0, 4); }
    idx = (S.round + ensureReserve().played) % pool.length;
    t = pool[idx] || pool[0];
    return {
      id: t.id, name: t.name, short: t.short || t.name,
      strength: Math.max(38, Math.round((t.strength || 60) - 12))
    };
  }

  function playReserveRound() {
    var list = reserveList(), r = ensureReserve();
    if (!list.length) { return null; }
    var opp = reserveOpponent();
    var res = DS.reserveMatch(list, opp, mgr(), {});
    r.played++;
    var entry = {
      season: S.season, round: S.round, oppId: opp.id, oppName: opp.short || opp.name,
      oppStrength: opp.strength, gf: res.gf, ga: res.ga, power: res.power,
      rows: res.rows.map(function (x) {
        return {
          id: x.id, name: x.name, pos: x.pos, rating: x.rating, goals: x.goals, assists: x.assists,
          exp: x.exp, levels: x.levels, level: x.level, ovrFrom: x.ovrFrom, ovrTo: x.ovrTo
        };
      })
    };
    r.last = entry;
    r.log.unshift(entry);
    if (r.log.length > 8) { r.log.pop(); }
    return entry;
  }

  function reserveHTML() {
    var r = ensureReserve(), y = ensureYouth(), i, p, on, chips = '', rows = '', log = '', last = r.last;
    for (i = 0; i < y.intake.length; i++) {
      p = y.intake[i];
      on = r.ids.indexOf(p.id) >= 0;
      chips += '<button class="rvp' + (on ? ' on' : '') + '" data-act="youthreserve" data-id="' + p.id + '">' +
        '<span class="rvp-n">' + (on ? '▶ ' : '') + esc(shortName(p.name)) + '</span>' +
        '<span class="rvp-o">' + DS.ratingOf(p) + '</span></button>';
    }
    if (!chips) { chips = '<span class="tiny muted">아카데미 유망주가 없습니다.</span>'; }
    if (last) {
      for (i = 0; i < last.rows.length; i++) {
        var x = last.rows[i];
        if (!x || !x.name) { continue; }
        rows += '<div class="rl-row' + (x.levels ? ' up' : '') + '">' +
          '<span class="rl-nm">' + tierDot(x) + ' ' + esc(shortName(x.name)) + '<em>' + x.pos + '</em></span>' +
          '<span class="rl-rt">' + x.rating.toFixed(1) + '</span>' +
          '<span class="rl-g">' + (x.goals ? x.goals + '골' : '') + (x.assists ? ' ' + x.assists + '도움' : '') + (x.goals || x.assists ? '' : '—') + '</span>' +
          '<span class="rl-ex">+' + x.exp + '</span>' +
          '<span class="rl-ov">' + x.ovrFrom + '→' + x.ovrTo + '</span>' +
          (x.levels ? '<span class="rl-up">LV.' + x.level + ' ▲' + x.levels + '</span>' : '<span class="rl-lv">Lv.' + x.level + '</span>') +
          '</div>';
      }
    } else {
      rows = '<div class="tiny muted">' + (r.ids.length
        ? '다음 리그 라운드에서 2군 경기가 자동으로 치러집니다.'
        : '유망주를 2군 출전으로 올리면 리그 라운드마다 2군 경기를 치릅니다.') + '</div>';
    }
    /* v25 — 같은 라운드 로그가 두 번 쌓이거나 상대명이 빈 줄은 걸러낸다 */
    var seenLog = {}, shown = 0;
    for (i = 0; i < r.log.length && shown < 4; i++) {
      var L = r.log[i];
      if (!L || !L.oppName) { continue; }
      var lgKey = L.season + '|' + L.round + '|' + L.oppName;
      if (seenLog[lgKey]) { continue; }
      seenLog[lgKey] = 1;
      shown++;
      log += '<span class="rlg">S' + L.season + ' ' + L.round + 'R · ' + esc(L.oppName) + ' <b>' + L.gf + ':' + L.ga + '</b></span>';
    }
    return '<div class="card">' +
      '<div class="card-head"><b>2군 리그</b><span class="meta">리그 라운드마다 1경기 · 출전 ' + r.ids.length + '명</span></div>' +
      '<div class="rvp-wrap">' + chips + '</div>' +
      (last ? '<div class="rl-head"><span>최근 2군 경기</span><b>vs ' + esc(last.oppName) + '</b>' +
        '<span class="rl-sc">' + last.gf + ' : ' + last.ga + '</span>' +
        '<em>' + last.round + 'R</em></div>' : '') +
      '<div class="rl-rows">' + rows + '</div>' +
      (log ? '<div class="rl-log">' + log + '</div>' : '') +
      '</div>';
  }

  function youthStars(pot) {
    /* v24 — 잠재 구간 70~92를 티어와 1:1로: 70~78 ★2 · 79~84 ★3 · 85~88 ★4 · 89~92 ★5 */
    var n = pot >= 89 ? 5 : (pot >= 85 ? 4 : (pot >= 79 ? 3 : 2));
    var t = DS.youthPotTier ? DS.youthPotTier(pot) : null;
    return stars(n) + '<span class="tiny muted"> 잠재 ' + pot + '</span>' +
      (t && (t.key === 'elite' || t.key === 'wonderkid')
        ? '<span class="pot-tag" style="color:' + t.color + ';border-color:' + t.color + '55">' + t.name + '</span>' : '');
  }

  function youthHTML() {
    var y = ensureYouth(), i, p, cards = '', sel = youthById(youthSel.id);
    var rv = ensureReserve();
    for (i = 0; i < y.intake.length; i++) {
      p = y.intake[i];
      var inRv = rv.ids.indexOf(p.id) >= 0;
      cards += '<button class="yth' + (youthSel.id === p.id ? ' on' : '') + '" data-act="youthpick" data-id="' + p.id + '">' +
        '<span class="ph"><img src="' + DS.Art.headSrc(p) + '" alt=""></span>' +
        '<span class="nm">' + tierDot(p) + ' ' + esc(shortName(p.name)) + (inRv ? '<em class="yth-rv">2군</em>' : '') + '</span>' +
        '<span class="mt">' + posBadge(p.pos) + '<span class="chip">' + p.age + '세</span></span>' +
        '<span class="mt">' + footChip(p) + '<span class="ov">' + DS.ratingOf(p) + '</span></span>' +
        '<span class="pot">' + youthStars(p.pot || 70) + '</span></button>';
    }
    if (!cards) { cards = '<div class="tiny muted">이번 시즌 유소년 후보가 없습니다. 새로 불러오세요.</div>'; }

    var posChips = '', keys = DS.POS_LIST, j;
    for (j = 0; j < keys.length; j++) {
      posChips += '<button class="pc' + ((youthSel.pos || (sel && sel.pos)) === keys[j] ? ' on' : '') + '" data-act="youthpos" data-k="' + keys[j] + '">' + keys[j] + '</button>';
    }
    var aptLine = '';
    if (sel) {
      var bestApt = '', bv = -1, k;
      for (k in sel.apt) { if (sel.apt.hasOwnProperty(k) && sel.apt[k] > bv) { bv = sel.apt[k]; bestApt = k; } }
      var stage = DS.ageStage(sel.age);
      aptLine = '<div class="tiny muted" style="margin-top:3px">주 적성 ' + bestApt + ' ' + bv + '/9 · 롤 적성 ' +
        ((DS.rolesFor(sel.pos).length) ? DS.rolesFor(sel.pos)[0].name : '—') + ' · OVR ' + DS.ratingOf(sel) + ' / 잠재 ' + (sel.pot || 0) +
        (DS.youthPotTier ? ' (' + DS.youthPotTier(sel.pot || 70).name + ')' : '') + '</div>' +
        '<div class="tiny" style="margin-top:2px"><span class="age-badge" style="color:' + stage.color + ';border-color:' + stage.color + '55">' + stage.name + '</span>' +
        '<span class="age-badge youth">유망주 ×' + DS.YOUTH_EXP_MULT.toFixed(1) + '</span>' +
        '<span class="tiny muted">2군 1경기 +' + Math.round(140 * DS.YOUTH_EXP_MULT * stage.expMult * (DS.growthOf(mgr()).youthMult || 1)) + ' 내외</span></div>';
    }
    var cost = sel ? youthCost(sel) : 0;
    var inRes = sel ? (ensureReserve().ids.indexOf(sel.id) >= 0) : false;

    return '<div class="card">' +
      '<div class="card-head"><b>유소년 아카데미</b><span class="meta">U-18 · ' + y.intake.length + '명 · 시즌 ' + S.season + '</span></div>' +
      '<div class="youth-grid">' + cards + '</div>' +
      '<div class="youth-coach"><span class="tiny muted" style="flex:0 0 auto">포지션 목표</span><div class="pcwrap">' + posChips + '</div></div>' +
      aptLine +
      '<div class="row" style="gap:4px;margin-top:5px;flex-wrap:wrap">' +
      '<button class="btn primary sm" data-act="youthcoach" ' + (!sel || S.money < cost ? 'disabled' : '') + '>코칭 · ' + fmt(cost) + '</button>' +
      '<button class="btn ' + (inRes ? 'primary' : 'dark') + ' sm" data-act="youthreserve" data-id="' + (sel ? sel.id : '') + '" ' + (!sel ? 'disabled' : '') + '>' +
      (inRes ? '2군 출전중' : '2군 출전') + '</button>' +
      '<button class="btn dark sm" data-act="youthpromote" ' + (!sel ? 'disabled' : '') + '>1군 승격</button>' +
      '<button class="btn ghost sm" data-act="youthsell" ' + (!sel ? 'disabled' : '') + '>이적시장 매각</button>' +
      '<button class="btn ghost sm" data-act="youthreroll" ' + (S.money < YOUTH_REROLL ? 'disabled' : '') + '>새 후보 · ' + fmt(YOUTH_REROLL) + '</button>' +
      '</div></div>';
  }

  /* 시즌 전환 때 나이를 먹으며 피지컬이 빠진 선수 — 클럽 화면에 간단히 알린다 */
  function ageNoticeHTML() {
    var list = S.ageNotices || [], i, rows = '';
    if (!list.length) { return ''; }
    for (i = 0; i < list.length; i++) {
      rows += '<div class="rl-row"><span class="rl-nm">' + esc(list[i].name) + '</span>' +
        '<span class="rl-rt">' + list[i].ovrFrom + '→' + list[i].ovrTo + '</span>' +
        '<span class="rl-g">' + esc(list[i].lost) + '</span></div>';
    }
    return '<div class="card"><div class="card-head"><b>노화 리포트</b><span class="meta">S' + S.season + ' · 32세 이상</span></div>' +
      '<div class="rl-rows">' + rows + '</div>' +
      '<div class="tiny muted" style="margin-top:3px">32세부터는 시즌마다 피지컬(스피드·파워)이 떨어집니다. 하락기는 EXP도 ×0.2.</div></div>';
  }

  var clubRoleOpen = false;

  function renderClub() {
    var box = document.getElementById('screen-club');
    if (!box) { return; }
    var i, fac, lv, cost, facHTML = '';
    for (i = 0; i < DS.FACILITIES.length; i++) {
      fac = DS.FACILITIES[i];
      lv = S.facilities[fac.key] || 0;
      cost = DS.facilityCost(fac, lv);
      var ficon = { training: '🏋️', medical: '🚑', shop: '🛍️', fanclub: '📣', cafe: '☕' }[fac.key] || '🏟️';
      void ficon;
      facHTML += '<div class="fac">' +
        '<div class="fac-top">' +
        '<canvas class="fac-art" data-fac="' + fac.key + '" data-lv="' + lv + '" width="62" height="50"></canvas>' +
        '<div class="fac-tt"><span class="fac-name">' + fac.name + '</span>' +
        '<span class="fac-lv">Lv.' + lv + '/5</span></div></div>' +
        '<div class="bar" style="margin:4px 0 3px"><i style="width:' + (lv / 5 * 100) + '%"></i></div>' +
        '<div class="eff">' + fac.target + ' ' + (lv > 0 ? '+' + facEffect(fac, lv) + fac.unit : '—') + '</div>' +
        '<button class="btn sm wide" data-act="facility" data-k="' + fac.key + '" ' + (lv >= 5 || S.money < cost ? 'disabled' : '') + '>' +
        (lv >= 5 ? 'MAX' : (lv === 0 ? '건설 ' : '강화 ') + fmt(cost)) + '</button></div>';
    }

    var tp = trainSel.playerId ? byId(trainSel.playerId) : starters()[0];
    if (!tp) { tp = starters()[0] || null; }
    if (tp) { trainSel.playerId = tp.id; }
    var menuHTML = '', m, on;
    for (i = 0; i < DS.TRAIN_MENUS.length; i++) {
      m = DS.TRAIN_MENUS[i];
      on = trainSel.menus.indexOf(m.key) >= 0;
      menuHTML += '<button class="' + (on ? 'on' : '') + '" data-act="trainmenu" data-k="' + m.key + '">' +
        '<span>' + m.icon + '</span><div><b>' + m.name + '</b><em>' + m.desc + '</em></div></button>';
    }
    var combo = trainSel.menus.length === 2 ? DS.findCombo(trainSel.menus[0], trainSel.menus[1]) : null;
    var trainCost = tp ? (300 + tp.level * 120) : 0;

    var st = starters(), roleHTML = '', roleWait = 0, roleWaitHTML = '';
    for (i = 0; i < st.length; i++) {
      var r = DS.roleOf(st[i].role);
      /* v21b ② — 레벨이 모자라 롤을 열 수 없는 선수는 [진화]를 잠근다 */
      var canEvo = canEvolve(st[i]), needLv = evoNeed(st[i]);
      /* v25 — 아직 진화할 수 없는(롤도 없는) 선수는 접어서 목록 길이를 줄인다 */
      if (!canEvo && !r) {
        roleWait++;
        roleWaitHTML += '<div class="rw-row"><span class="rw-n">' + esc(shortName(st[i].name)) + '</span>' +
          '<span class="rw-p">' + st[i].pos + ' · Lv.' + (st[i].level || 0) + '</span>' +
          '<span class="rw-l">Lv.' + needLv + '부터</span></div>';
        continue;
      }
      roleHTML += '<div class="role-row">' +
        '<span class="minihead" style="width:30px;height:30px"><img src="' + DS.Art.headSrc(st[i]) + '"></span>' +
        '<div style="flex:1 1 auto;min-width:0"><div class="nm">' + tierDot(st[i]) + ' ' + esc(st[i].name) + ' <span class="tiny muted">' + st[i].pos + ' · Lv.' + (st[i].level || 0) + '</span></div>' +
        '<div class="ds">' + (r ? r.name + ' — ' + r.desc : (canEvo ? '아직 롤 없음 · 진화 가능' : '아직 롤 없음 · Lv.' + needLv + '부터 진화 가능')) + '</div></div>' +
        '<button class="btn sm ' + (canEvo ? (r ? 'ghost' : 'primary') : 'ghost locked') + '" data-act="evolve" data-id="' + st[i].id + '"' + (canEvo ? '' : ' disabled aria-disabled="true"') + '>' +
        (canEvo ? (r ? '변경' : '진화') : 'Lv.' + needLv) + '</button>' +
        '</div>';
    }

    var spHTML = '', sp, unlockedSp, active;
    for (i = 0; i < DS.SPONSORS.length; i++) {
      sp = DS.SPONSORS[i];
      unlockedSp = S.fans >= sp.fans;
      active = S.sponsor === sp.id;
      spHTML += '<div class="row between" style="padding:4px 0;opacity:' + (unlockedSp ? 1 : .5) + '">' +
        '<div style="min-width:0"><div class="b" style="font-size:10.5px">' + sp.name + (active ? ' <span class="chip lime">계약중</span>' : '') + '</div>' +
        '<div class="tiny muted">경기당 ' + fmt(sp.bonus) + ' · ' + sp.desc + '</div></div>' +
        (active ? '' : (unlockedSp ? '<button class="btn sm" data-act="sponsor" data-id="' + sp.id + '">계약</button>' :
          '<span class="tiny muted">팬 ' + fmt(sp.fans) + '</span>')) +
        '</div>';
    }

    var swatches = '', swatches2 = '', e, emb = '';
    for (i = 0; i < DS.KIT_COLORS.length; i++) {
      swatches += '<button class="swatch' + (S.club.kit.shirt === DS.KIT_COLORS[i] ? ' on' : '') + '" style="background:' + DS.KIT_COLORS[i] + '" data-act="kit" data-c="' + DS.KIT_COLORS[i] + '"></button>';
      swatches2 += '<button class="swatch' + (S.club.kit.shorts === DS.KIT_COLORS[i] ? ' on' : '') + '" style="background:' + DS.KIT_COLORS[i] + '" data-act="shorts" data-c="' + DS.KIT_COLORS[i] + '"></button>';
    }
    for (i = 0; i < DS.EMBLEMS.length; i++) {
      e = DS.EMBLEMS[i];
      emb += '<button class="embpick' + (S.club.emblem === e.id ? ' on' : '') + '" data-act="emblem" data-e="' + e.id + '">' +
        '<canvas width="26" height="30" data-emblem="' + e.id + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '"></canvas></button>';
    }

    box.innerHTML =
      youthHTML() +
      reserveHTML() +
      ageNoticeHTML() +
      '<div class="card">' +
      '<div class="card-head"><span class="dot"></span><b>팀 컨디션 · 회복</b><span class="meta">REST · CONDITION</span></div>' +
      conditionModalHTML(true) + '</div>' +
      '<div class="card dark">' +
      '<div class="card-head"><span class="dot"></span><b style="color:#eaf6dd">클럽 하우스</b><span class="meta">FACILITIES</span></div>' +
      '<div class="grid2">' + facHTML + '</div></div>' +
      '<div class="card">' +
      '<div class="card-head"><b>특훈 콤보</b><span class="meta">훈련 2개 조합 · Lv.상승</span></div>' +
      '<div class="row between" style="margin-bottom:6px"><span class="tiny muted">대상 선수 ' + (tp ? tierDot(tp) : '') + '</span>' +
      '<select id="train-player" class="pick" style="max-width:190px;height:28px;border-radius:8px;border:1px solid var(--line);background:#fff;font-size:10.5px;font-weight:700;padding:0 6px">' + playerOptions(tp ? tp.id : '') + '</select></div>' +
      '<div class="menu2">' + menuHTML + '</div>' +
      (combo ? '<div class="row between" style="margin-top:6px"><span class="chip lime">콤보 ' + combo.name + '</span><span class="tiny muted">' + combo.desc + '</span></div>' : '') +
      '<button class="btn primary wide" style="margin-top:7px" data-act="trainrun" ' + (trainSel.menus.length !== 2 || !tp || S.money < trainCost ? 'disabled' : '') + '>특훈 실행 · ' + fmt(trainCost) + '</button>' +
      '</div>' +
      '<div class="card">' +
      '<div class="card-head"><b>롤 진화</b><span class="meta">현대 롤 · Lv.3 / Lv.4</span></div>' +
      roleHTML +
      (roleWait ? '<button class="btn ghost sm wide" style="margin-top:5px" data-act="roletoggle">' +
        (clubRoleOpen ? '진화 대기 ' + roleWait + '명 접기 ▲' : '진화 대기 ' + roleWait + '명 펼치기 ▼') + '</button>' +
        (clubRoleOpen ? '<div class="rw-wrap">' + roleWaitHTML + '</div>' : '') : '') +
      '</div>' +
      '<div class="card"><div class="card-head"><b>감독실</b><span class="meta">선임 감독 · 고유 포메이션</span></div>' +
      managerHTML('club') +
      '<div class="grid2" style="margin-top:7px">' +
      '<button class="btn sm ' + (mgrSync() ? 'ghost' : 'primary') + '" data-act="mgrform" ' + (mgrSync() ? 'disabled' : '') + '>' +
      (mgrSync() ? '고유 포메이션 적용중' : '고유 포메이션 적용') + '</button>' +
      '<button class="btn sm" data-act="mgrmodal">감독 영입 · 교체</button></div></div>' +
      '<div class="card"><div class="card-head"><b>스폰서</b><span class="meta">' + divName(S.division) + ' · 경기당</span></div>' +
      '<div class="tiny muted" style="margin-bottom:4px">중계권 ' + fmt(DIV_TV[S.division] || 0) + ' · 스폰서 배율 ×' + (DIV_SPONSOR[S.division] || 1) +
      (S.division === 2 ? ' <span class="chip lime">1부 승격 시 ×' + DIV_SPONSOR[1] + ' · 중계권 ' + fmt(DIV_TV[1]) + '</span>' : '') + '</div>' +
      spHTML + '</div>' +
      '<div class="card">' +
      '<div class="card-head"><b>구단 꾸미기</b><span class="meta">이름 · 유니폼 · 엠블럼</span></div>' +
      '<div class="row" style="margin-bottom:6px"><input id="club-name-input" maxlength="12" value="' + esc(S.club.name) + '" style="flex:1 1 auto;height:32px;border-radius:9px;border:1px solid var(--line);padding:0 8px;font-size:11px;font-weight:700">' +
      '<button class="btn sm" data-act="rename">저장</button></div>' +
      '<div class="row" style="gap:4px;flex-wrap:wrap"><span class="tiny muted" style="width:38px">유니폼</span>' + swatches + '</div>' +
      '<div class="row" style="gap:4px;flex-wrap:wrap;margin-top:4px"><span class="tiny muted" style="width:38px">반바지</span>' + swatches2 + '</div>' +
      '<div class="row" style="gap:4px;flex-wrap:wrap;margin-top:6px">' + emb + '</div></div>' +
      '<div class="card tight"><div class="row between"><button class="btn ghost sm" data-act="reset">게임 초기화</button>' +
      '<span class="tiny muted">저장 데이터가 삭제됩니다</span></div></div>';

    paintEmblems(box);
    paintFacilities(box);
  }

  /* v20 — 시설 SD 일러스트 캔버스 페이팅 */
  function paintFacilities(root) {
    var list = (root || document).querySelectorAll('canvas[data-fac]'), i;
    for (i = 0; i < list.length; i++) {
      DS.Art.paintFacility(list[i], list[i].getAttribute('data-fac'), parseInt(list[i].getAttribute('data-lv'), 10) || 0);
    }
  }
  function paintStaffs(root) {
    var list = (root || document).querySelectorAll('canvas[data-staff]'), i;
    for (i = 0; i < list.length; i++) {
      DS.Art.paintStaff(list[i], list[i].getAttribute('data-staff'));
    }
  }

  function playerOptions(sel) {
    var list = S.squad.slice().sort(function (a, b) { return DS.ratingOf(b) - DS.ratingOf(a); });
    var s = '', i;
    for (i = 0; i < list.length; i++) {
      s += '<option value="' + list[i].id + '"' + (list[i].id === sel ? ' selected' : '') + '>' +
        '[' + (DS.RARITY[list[i].rarity] ? DS.RARITY[list[i].rarity].name : '동') + '] ' +
        esc(list[i].name) + ' · ' + list[i].pos + ' ' + DS.ratingOf(list[i]) + '</option>';
    }
    return s;
  }

  /* ═════════════════  상점 ═════════════════ */
  function rollScout() {
    S.scoutCandidates = [];
    var i;
    var taken = S.squad.slice();
    /* v15 — 30회 천장: 마일리지가 30에 도달하면 다음 스페셜 후보 1장은 레전드 100% 확정 */
    var pity = S.scoutPity || 0;
    var guaranteed = pity >= 30;
    for (i = 0; i < 4; i++) {
      var rarity = DS.pickRarity('special');
      if (i === 0 && guaranteed) { rarity = 'legend'; }
      var p = DS.makePlayer({ rarity: rarity });
      if (i === 0 && guaranteed) { p.guaranteed = true; }
      p.pic = DS.nextFreePic(taken, p.pos);
      taken.push(p);
      S.scoutCandidates.push(p);
      EXTRA[p.id] = p;
    }
  }

  /* ═════════════════  이적시장 (v21) ═════════════════
     상점의 선수 뽑기(스카우트)를 이적시장으로 갈아 끼웠다. 매물은 라운드마다 새로 올라오고,
     이적료·주급·나이·등급·포지션·롤·주발을 보고 영입한다. 내 선수도 내놓아 되팔 수 있다. */
  var MKT_SIZE = 8;
  var MKT_REROLL = 400;

  function ensureMarket() {
    if (!S.transfer) { S.transfer = { season: -1, round: -1, listings: [], myListings: [], sold: 0, bought: 0 }; }
    if (!S.transfer.myListings) { S.transfer.myListings = []; }
    var t = S.transfer;
    if (t.season !== S.season || t.round !== S.round || !t.listings.length) {
      t.listings = DS.makeMarketListings(MKT_SIZE, (S.season || 1) * 1000 + (S.round || 0) + 7, { round: S.round });
      t.season = S.season;
      t.round = S.round;
      marketSellTick();
    }
    return t;
  }

  /* 내가 내놓은 선수 — 라운드가 바뀔 때 다른 구단이 데려갈 수 있다 */
  function marketSellTick() {
    var t = S.transfer, i, keep = [];
    for (i = 0; i < t.myListings.length; i++) {
      var L = t.myListings[i], p = byId(L.id);
      if (!p) { continue; }
      if (chance(0.55)) {
        var fee = L.fee;
        S.money += fee;
        t.sold += 1;
        removeFromSquad(p);
        keep.push(null);
        S.log.push('이적시장 ' + p.name + ' 매각 ' + fmt(fee));
      } else {
        keep.push(L);
      }
    }
    t.myListings = keep.filter(function (x) { return !!x; });
  }

  function removeFromSquad(p) {
    if (!p) { return; }
    var li = S.lineup.indexOf(p.id), bi = S.bench.indexOf(p.id), i;
    S.squad = S.squad.filter(function (x) { return x.id !== p.id; });
    if (li >= 0) { S.lineup[li] = null; }
    if (bi >= 0) { S.bench.splice(bi, 1); }
    delete EXTRA[p.id];
    var roleKeys = ['cap', 'fk', 'ck', 'pk'], lostRole = false;
    for (i = 0; i < roleKeys.length; i++) { if (S.roles[roleKeys[i]] === p.id) { S.roles[roleKeys[i]] = null; lostRole = true; } }
    if (lostRole) { autoRoles(); }
    if (S.transfer) {
      S.transfer.myListings = (S.transfer.myListings || []).filter(function (x) { return x.id !== p.id; });
    }
    /* 선발에 구멍이 생겼으면 자동으로 메운다 (빈 자리로 경기를 시작하지 않게) */
    var hole = false, hi2;
    for (hi2 = 0; hi2 < S.lineup.length; hi2++) { if (!S.lineup[hi2]) { hole = true; } }
    if (hole) { S.lineup = autoLineup(S.squad, S.formation); }
    S.bench = autoBench(S.squad, S.lineup);
  }

  function listingPlayer(L) { return L && L.player ? L.player : byId(L && L.id); }

  function doSignListing(id) {
    var t = ensureMarket(), i, L = null;
    for (i = 0; i < t.listings.length; i++) { if (t.listings[i].id === id) { L = t.listings[i]; } }
    if (!L) { toast('이미 마감된 매물입니다.'); return; }
    if (S.squad.length >= MAX_SQUAD) { toast('선수단이 가득 찼습니다. 한 명을 내놓은 뒤 영입하세요.'); return; }
    if (S.money < L.fee) { toast('이적료가 부족합니다 (' + fmt(L.fee) + ')'); return; }
    var p = listingPlayer(L);
    S.money -= L.fee;
    t.bought += 1;
    t.listings = t.listings.filter(function (x) { return x.id !== id; });
    if (!p) { return; }
    p.exp = p.exp || 0;
    p.pot = p.pot || Math.min(95, Math.max(60, DS.ratingOf(p) + 6));
    S.squad.push(p);
    EXTRA[p.id] = p;
    S.dex.players[p.name] = 1;
    S.bench = autoBench(S.squad, S.lineup);
    save();
    renderAll();
    toast(p.name + ' 영입 완료 · ' + fmt(L.fee) + ' · 주급 ' + fmt(L.wage));
  }

  function doNegotiate(id) {
    var t = ensureMarket(), i, L = null;
    for (i = 0; i < t.listings.length; i++) { if (t.listings[i].id === id) { L = t.listings[i]; } }
    if (!L) { return; }
    /* v25 — 실패해도 이적료를 올리지 않는다(손해만 보는 구조 제거). 대신 재시도할수록
       성공 확률이 떨어지고, 최대 3회까지 협상할 수 있다. */
    var tries = L.negoTries || 0;
    if (tries >= 3) { toast('이 매물은 협상 3회를 모두 썼습니다.'); return; }
    L.negoTries = tries + 1;
    var p = 0.68 - tries * 0.16;
    if (chance(p)) {
      var cut = 0.80 + Math.random() * 0.10;
      L.fee = Math.max(280, Math.round(L.fee * cut / 50) * 50);
      L.negotiated = 1;
      toast('협상 성공! 이적료가 ' + fmt(L.fee) + ' 로 내려갔습니다.');
    } else {
      toast('상대 구단이 거절했습니다. 이적료는 그대로입니다 (재시도 ' + (2 - tries) + '회)');
    }
    save();
    renderShop();
  }

  function doListPlayer(id) {
    var p = byId(id);
    if (!p) { return; }
    if (S.squad.length <= 12) { toast('선수단이 너무 적습니다 (최소 12명 유지).'); return; }
    var t = ensureMarket(), i;
    for (i = 0; i < t.myListings.length; i++) { if (t.myListings[i].id === id) { toast('이미 내놓은 선수입니다.'); return; } }
    t.myListings.push({ id: p.id, name: p.name, pos: p.pos, fee: DS.marketValue(p), round: S.round });
    save();
    renderShop();
    toast(p.name + '을(를) 이적시장에 내놓았습니다 · ' + fmt(DS.marketValue(p)));
  }

  function doUnlistPlayer(id) {
    var t = ensureMarket();
    t.myListings = t.myListings.filter(function (x) { return x.id !== id; });
    save();
    renderShop();
    toast('매물을 거둬들였습니다.');
  }

  function doSellNow(id) {
    var p = byId(id);
    if (!p) { return; }
    if (S.squad.length <= 12) { toast('선수단이 너무 적습니다 (최소 12명 유지).'); return; }
    var fee = Math.round(DS.marketValue(p) * 0.92 / 50) * 50;
    S.money += fee;
    if (S.transfer) { S.transfer.sold += 1; }
    removeFromSquad(p);
    S.log.push('방출 ' + p.name + ' ' + fmt(fee));
    save();
    renderAll();
    toast(p.name + ' 즉시 방출 · ' + fmt(fee) + ' 회수');
  }

  function renderShop() {
    var box = document.getElementById('screen-shop');
    if (!box) { return; }
    var t = ensureMarket(), i, L, p, cards = '';
    for (i = 0; i < t.listings.length; i++) {
      L = t.listings[i]; p = listingPlayer(L);
      if (!p) { continue; }
      EXTRA[p.id] = p;
      var ovr = DS.ratingOf(p), rc = rarityColor(p);
      cards += '<div class="mkt">' +
        '<span class="art"><img src="' + DS.Art.portraitSrc(p) + '" alt="" draggable="false"></span>' +
        '<div class="mm">' +
        '<div class="nm">' + tierDot(p) + ' ' + esc(p.name) + '<span class="pv">' + ovr + '</span></div>' +
        '<div class="mt">' + posBadge(p.pos) +
        '<span class="chip" style="background:' + rc + '22;color:' + rc + '">' + p.age + '세</span>' + footChip(p) + '</div>' +
        '<div class="mt"><span class="chip">' + (DS.roleOf(p.role) ? DS.roleOf(p.role).name : '롤 없음') + '</span>' +
        '<span class="from">' + esc(L.fromName) + '</span></div>' +
        '<div class="fee"><b>' + fmt(L.fee) + '</b><span>주급 ' + fmt(L.wage) + '</span></div>' +
        '<div class="row mkt-btns">' +
        '<button class="btn primary sm" data-act="sign" data-id="' + L.id + '" ' + (S.money < L.fee ? 'disabled' : '') + '>영입</button>' +
        '<button class="btn ghost sm" data-act="nego" data-id="' + L.id + '" ' + (L.negotiated || (L.negoTries || 0) >= 3 ? 'disabled' : '') + '>' + (L.negotiated ? '협상됨' : '협상 ' + (3 - (L.negoTries || 0)) + '회') + '</button>' +
        '</div></div></div>';
    }
    if (!cards) { cards = '<div class="mkt-empty">이번 라운드 매물이 모두 마감됐습니다. 다음 라운드에 새 매물이 올라옵니다.</div>'; }

    var mine = '', j, myList = t.myListings;
    for (j = 0; j < myList.length; j++) {
      var ml = myList[j];
      mine += '<div class="ml-row"><b>' + esc(ml.name) + '</b><span class="tiny muted">' + ml.pos + ' · ' + fmt(ml.fee) + '</span>' +
        '<button class="btn ghost sm" data-act="unlist" data-id="' + ml.id + '">철회</button></div>';
    }
    if (!mine) { mine = '<div class="tiny muted">내놓은 선수가 없습니다. 아래에서 선수를 골라 내놓으면 다음 라운드에 다른 구단이 데려갑니다.</div>'; }

    var sq = S.squad.slice().sort(function (a, b) { return DS.marketValue(b) - DS.marketValue(a); });
    var sellRows = '';
    for (j = 0; j < sq.length; j++) {
      var sp = sq[j], listed = false, k;
      for (k = 0; k < myList.length; k++) { if (myList[k].id === sp.id) { listed = true; } }
      sellRows += '<div class="sl-row' + (listed ? ' listed' : '') + '">' +
        '<span class="ph"><img src="' + DS.Art.headSrc(sp) + '" alt=""></span>' +
        '<span class="nm">' + tierDot(sp) + ' ' + esc(shortName(sp.name)) + '<em>' + sp.pos + ' · ' + DS.ratingOf(sp) + '</em></span>' +
        '<span class="val">' + fmt(DS.marketValue(sp)) + '</span>' +
        (listed ? '<span class="tag">매물</span>' :
          '<button class="btn ghost sm" data-act="list" data-id="' + sp.id + '">내놓기</button>' +
          '<button class="btn sm" data-act="sellnow" data-id="' + sp.id + '">즉시 ' + fmt(Math.round(DS.marketValue(sp) * 0.92 / 50) * 50) + '</button>') +
        '</div>';
    }

    box.innerHTML =
      '<div class="card dark mkt-head">' +
      '<div class="card-head"><span class="dot"></span><b style="color:#eaf6dd">이적시장</b><span class="meta">TRANSFER · ' + roundLabel() + '</span></div>' +
      '<div class="kpis" style="margin-bottom:6px">' +
      '<div class="kpi"><b class="lime">' + fmt(S.money) + '</b><span>자금</span></div>' +
      '<div class="kpi"><b>' + t.listings.length + '</b><span>매물</span></div>' +
      '<div class="kpi"><b>' + t.myListings.length + '</b><span>내 매물</span></div>' +
      '</div>' +
      '<div class="tiny" style="color:rgba(233,244,221,.62)">매물은 라운드마다 바뀝니다. 협상으로 이적료를 깎거나, 내 선수를 내놓아 자금을 만들 수 있습니다.</div>' +
      '<div class="row between" style="margin-top:6px"><span class="tiny" style="color:rgba(233,244,221,.55)">선수단 ' + S.squad.length + '/' + MAX_SQUAD + '</span>' +
      '<button class="btn ghost sm" data-act="mktrefresh" ' + (S.money < MKT_REROLL ? 'disabled' : '') + '>매물 갱신 · ' + fmt(MKT_REROLL) + '</button></div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><b>영입 가능 매물</b><span class="meta">' + t.listings.length + '명</span></div>' +
      '<div class="mkt-grid">' + cards + '</div></div>' +
      '<div class="card"><div class="card-head"><b>내 매물</b><span class="meta">다음 라운드에 판매 시도</span></div>' + mine + '</div>' +
      '<div class="card"><div class="card-head"><b>선수 방출 · 내놓기</b><span class="meta">이적료 = OVR·나이·등급</span></div>' +
      '<div class="sl-list">' + sellRows + '</div></div>' +
      '<div class="card tight"><div class="card-head"><b>아이템</b></div>' +
      '<div class="row between" style="margin-bottom:5px"><span class="tiny muted">컨디션 드링크 · 컨디션 +20</span><button class="btn sm" data-act="item" data-k="drink" ' + (S.money < 600 ? 'disabled' : '') + '>600</button></div>' +
      '<div class="row between"><span class="tiny muted">응원단 파티 · 사기 +12</span><button class="btn sm" data-act="item" data-k="party" ' + (S.money < 900 ? 'disabled' : '') + '>900</button></div></div>';

    paintEmblems(box);
  }

  /* ═════════════════  모달 ═════════════════ */
  function closeModal() {
    var m = document.getElementById('modal');
    if (!m) { return; }
    var wasReport = m.getAttribute('data-report') === '1';
    m.className = '';
    m.innerHTML = '';
    m.removeAttribute('data-report');
    rolePick = null;
    ioState = { candId: null, outId: null };
    deckDraft = null;
    if (wasReport && currentTab === 'match') { setTab('home'); }
  }
  function setSheet(title, body, cls) {
    var m = document.getElementById('modal');
    if (!m) { return; }
    m.className = 'on';
    m.innerHTML = '<div class="sheet ' + (cls || '') + '"><div class="sheet-head"><b>' + title + '</b>' +
      '<button class="x" data-act="closemodal">닫기 ✕</button></div>' +
      '<div class="sheet-body">' + body + '</div></div>';
    m.scrollTop = 0;
  }

  function statRow(label, v, cls, max) {
    max = max || 10;
    return '<div class="st-row"><span class="lb">' + label + '</span>' +
      '<span class="gauge ' + cls + '"><i style="width:' + clamp(v / max * 100, 0, 100) + '%"></i></span>' +
      '<span class="num">' + v + '</span></div>';
  }

  function aptMap(p) {
    var html = '', slots = DS.APT_MAP_SLOTS || DS.APT_LIST, slot, code, v, lay, hi, x, y;
    for (var i = 0; i < slots.length; i++) {
      slot = slots[i];
      code = slot.code || slot;
      v = p.apt[code] || 1;
      lay = DS.APT_LAYOUT[code];
      if (!lay) { continue; }
      x = slot.side === 'R' ? 100 - lay.x : lay.x;
      y = lay.y;
      hi = code === p.pos ? ' hi' : (v >= 7 ? ' mid' : '');
      /* LWB·RWB는 하프라인 위 — 라벨 높이만큼 원 중심을 내려 선 위에 정확히 앉힌다 */
      if (code === 'LWB' || code === 'RWB') { hi += ' halfline'; }
      html += '<div class="aptcell' + hi + '" style="left:' + x + '%;top:' + y + '%">' +
        '<span class="v">' + v + '</span><span class="c">' + code + '</span></div>';
    }
    return '<div class="aptmap">' + html + '</div>';
  }

  /* ═════════════════  감독실 (영입 · 선임 · 고유 포메이션) ═════════════════ */
  function traitFxText(k, v) {
    if (k === 'org') { return '조직력 +' + Math.round(v * 1.2) + ' · 패스 연계·위치 선정 ↑'; }
    if (k === 'atk') { return '기대 득점 xG +' + (v * 0.03).toFixed(2) + ' · 슈팅 기회 ↑'; }
    if (k === 'def') { return '상대 xG -' + (v * 0.03).toFixed(2) + ' · 수비 라인 밀착 ↑'; }
    if (k === 'pass') { return '패스 오차 -' + Math.round(Math.min(0.5, v * 0.05) * 100) + '% · 패스 성공률 ↑'; }
    if (k === 'shoot') { return '슛 정확도 +' + Math.round(v * 0.8) + '%p · 결정력 ↑'; }
    if (k === 'jump') { return '공중볼 경합 +' + Math.round(v * 6) + '% · 코너 헤딩 ↑'; }
    if (k === 'press') { return '압박 강도 +' + Math.round(v * 1.2) + ' · 태클 성공률 +' + Math.round(v * 10) + '%'; }
    if (k === 'speed') { return '전원 스피드 +' + Math.round(v * 0.6) + '% · 역습·복귀 ↑'; }
    return '';
  }

  function managerRoom() {
    if (!S.mgrCand || !S.mgrCand.length) { pickMgrCandidates(); save(); }
    var m = mgr(), i, t, ownHTML = '', candHTML = '', fxHTML = '';
    for (i = 0; i < m.traits.length; i++) {
      t = DS.managerTrait(m.traits[i].k);
      fxHTML += '<div class="mfx"><span class="mfx-ico" style="background:' + t.color + '22;color:' + t.color + '">' + t.icon + '</span>' +
        '<div class="mfx-tx"><b>' + t.name + ' +' + m.traits[i].v + '</b><em>' + traitFxText(m.traits[i].k, m.traits[i].v) + '</em></div></div>';
    }
    /* v23 — 육성 특성: 경기 EXP·유소년 · 레벨업 능력치 분배에 실제 적용되는 값 */
    var gk = DS.growthKind(m), gg = DS.growthOf(m);
    fxHTML += '<div class="mfx"><span class="mfx-ico" style="background:rgba(200,241,105,.22);color:#3d6b12">' + gk.icon + '</span>' +
      '<div class="mfx-tx"><b>육성 · ' + gk.name + '</b><em>' + esc(DS.growthLine(m)) + '</em></div></div>';
    fxHTML += '<div class="mfx"><span class="mfx-ico" style="background:rgba(63,127,184,.18);color:#26648f">📈</span>' +
      '<div class="mfx-tx"><b>레벨업 능력치 분배</b><em>스피드 ×' + gg.bias.s.toFixed(2) + ' · 테크닉 ×' + gg.bias.t.toFixed(2) + ' · 파워 ×' + gg.bias.p.toFixed(2) + '</em></div></div>';

    for (i = 0; i < S.managers.length; i++) {
      var om = DS.managerOf(S.managers[i]);
      if (!om) { continue; }
      var on = om.id === m.id;
      ownHTML += '<button class="mrow' + (on ? ' on' : '') + '" data-act="mgrset" data-id="' + om.id + '">' +
        '<span class="mrow-art"><img src="' + DS.Art.managerHead(om) + '" alt=""></span>' +
        '<span class="mrow-main"><b>' + esc(om.name) + '</b>' +
        '<span class="mrow-sub">' + esc(DS.tacticStyle(om.tacticStyle).name) + ' · ' + om.formation + '</span>' +
        '<span class="mrow-tr">' + DS.managerTraitText(om) + '</span>' +
        '<span class="mrow-gr">🌱 ' + esc(DS.growthLine(om)) + '</span></span>' +
        '<span class="mrow-side" style="color:' + DS.RARITY[om.rarity].color + '">' + DS.RARITY[om.rarity].name +
        (on ? '<em class="on">선임중</em>' : '<em>선임</em>') + '</span></button>';
    }

    var cands = 0;
    for (i = 0; i < S.mgrCand.length; i++) {
      var cm = DS.managerOf(S.mgrCand[i]);
      if (!cm || S.managers.indexOf(cm.id) >= 0) { continue; }
      cands++;
      var price = DS.managerPrice(cm);
      candHTML += '<div class="mcard">' +
        '<span class="mcard-art"><img src="' + DS.Art.managerHead(cm) + '" alt=""></span>' +
        '<span class="mcard-main"><span class="mcard-top"><b>' + esc(cm.name) + '</b>' +
        '<span class="chip" style="background:' + DS.RARITY[cm.rarity].color + '22;color:' + DS.RARITY[cm.rarity].color + '">' + DS.RARITY[cm.rarity].name + '</span>' +
        '<span class="tiny muted">' + cm.age + '세</span></span>' +
        '<span class="mcard-sub">' + esc(DS.tacticStyle(cm.tacticStyle).name) + ' · 고유 ' + cm.formation + '</span>' +
        '<span class="mcard-tr">' + DS.managerTraitText(cm) + '</span>' +
        '<span class="mcard-gr">🌱 ' + esc(DS.growthLine(cm)) + '</span></span>' +
        '<button class="btn sm primary" data-act="mgrsign" data-id="' + cm.id + '" ' + (S.money < price ? 'disabled' : '') + '>' + fmt(price) + '</button></div>';
    }
    if (!cands) { candHTML = '<div class="tiny muted" style="padding:8px 2px">영입 가능한 후보가 없습니다. 후보를 다시 뽑아보세요.</div>'; }

    var body =
      '<div class="mhero">' +
      '<img class="mhero-art" src="' + DS.Art.managerHead(m) + '" alt="">' +
      '<div class="mhero-in">' +
      '<div class="mhero-kicker">' + DS.RARITY[m.rarity].name + ' · ' + m.age + '세</div>' +
      '<div class="mhero-name">' + esc(m.name) + ' <small>감독</small></div>' +
      '<div class="mhero-style">' + esc(m.style) + '</div>' +
      '<div class="mhero-tac">🧠 <b>' + esc(DS.tacticStyle(m.tacticStyle).name) + '</b> — ' + esc(m.tacticLine || '') + '</div>' +
      '<div class="mhero-form">고유 포메이션 <b>' + m.formation + '</b> · ' + DS.FORMATIONS[m.formation].tag +
      (mgrSync() ? ' <em class="sync">시너지 ON</em>' : '') + '</div>' +
      (function () {
        var an = DS.managerAnomalies(m), i, tags = [];
        if (!an.length) { return ''; }
        for (i = 0; i < an.length; i++) { tags.push(DS.FORMATIONS[an[i]].tag); }
        return '<div class="mhero-form">감독 전용 변칙 <b>' + an.join(' · ') + '</b> — ' + tags.join(' / ') + '</div>';
      })() +
      '</div></div>' +
      '<div class="mstory">' + esc(m.story) + '</div>' +
      fxHTML +
      '<button class="btn wide ' + (mgrSync() ? 'ghost' : 'primary') + '" style="margin:8px 0 4px" data-act="mgrform" ' + (mgrSync() ? 'disabled' : '') + '>' +
      (mgrSync() ? m.formation + ' · 고유 포메이션 적용중' : m.formation + ' · 고유 포메이션 원클릭 적용') + '</button>' +
      '<div class="band">보유 감독 <span>' + S.managers.length + '명 / ' + DS.MANAGERS.length + '명</span></div>' +
      '<div class="mlist">' + ownHTML + '</div>' +
      '<div class="band">영입 후보 <span>골드로 영입 · 즉시 선임</span></div>' +
      '<div class="mlist">' + candHTML + '</div>' +
      '<div class="row between" style="margin-top:8px">' +
      '<span class="tiny muted">후보 교체 · ' + fmt(REROLL_COST) + ' 골드</span>' +
      '<button class="btn ghost sm" data-act="mgrreroll">후보 교체</button></div>';

    var mm = document.getElementById('modal');
    mm.className = 'on';
    mm.innerHTML = '<div class="sheet"><div class="sheet-head"><b>감독실</b>' +
      '<span class="tiny muted">선임 · 영입 · 고유 포메이션</span>' +
      '<button class="x" data-act="closemodal">닫기 ✕</button></div>' +
      '<div class="sheet-body">' + body + '</div></div>';
  }

  function playerModal(p) {
    var inSquad = S.squad.indexOf(p) >= 0;
    var rt = DS.ratingOf(p), L = DS.lockOf(p.lock), role = DS.roleOf(p.role);
    var skills = '';
    if (p.skill) { skills += '<span class="sk">' + esc(p.skill) + '</span>'; }
    if (p.trained && p.trained.length) {
      var i;
      for (i = 0; i < p.trained.length && i < 3; i++) { skills += '<span class="sk">' + esc(p.trained[i]) + '</span>'; }
    }
    var body =
      '<div class="pd-hero">' +
      '<div class="pd-art"><img src="' + DS.Art.portraitSrc(p) + '" alt=""></div>' +
      '<div class="pd-info">' +
      '<div class="pd-nick">\'' + esc(p.nickname) + '\'</div>' +
      '<div class="pd-name">' + tierDot(p) + ' ' + esc(p.name) + ' <small>' + p.age + '세</small></div>' +
      '<div class="pd-line">' + posBadge(p.pos, p.pos + ' · ' + DS.POS[p.pos].name) +
      footChip(p) +
      '<span class="chip" style="background:' + L.color + '26;color:' + L.color + '">' + L.name + '</span>' +
      (role ? '<span class="chip lime">' + role.name + '</span>' : '') +
      (function () {
        var st = DS.ageStage(p.age);
        return '<span class="age-badge" style="color:' + st.color + ';border-color:' + st.color + '66">' + st.name + ' ×' + st.expMult + '</span>' +
          (DS.isYouthOrigin(p) ? '<span class="age-badge youth">유망주 ×' + DS.YOUTH_EXP_MULT.toFixed(1) + '</span>' : '');
      })() + '</div>' +
      '<div class="row" style="align-items:flex-end;gap:8px"><div class="pd-ov">' + rt + '<small>OVR</small></div>' +
      '<div class="tiny" style="color:rgba(233,244,221,.6);padding-bottom:2px">' + DS.RARITY[p.rarity].name + ' · ' + p.tenure + '기수 · Lv.' + (p.level || 0) + '</div></div>' +
      '<div class="pd-rows"><div><span>타입</span>' + esc(p.playType) + '</div><div><span>신장</span>' + p.height + 'cm</div></div>' +
      '<div class="pd-rows"><div><span>성장 곡선</span>' + DS.ageStage(p.age).age + ' · ' + DS.ageStage(p.age).desc + '</div>' +
      '<div><span>잠재</span>' + (p.pot || '—') + '</div></div>' +
      '</div></div>' +

      '<div class="band">STATUS<span>능력치 · 적성</span></div>' +
      aptMap(p) +
      statRow('스피드', p.s, 's') + statRow('테크닉', p.t, 't') + statRow('파워', p.p, 'p') +
      statRow('공격', p.stats.atk, 's', 99) + statRow('수비', p.stats.def, 'p', 99) +

      '<div class="band">ROLE<span>현대 롤 · 라커룸 성향</span></div>' +
      '<div class="tiny muted" style="line-height:1.55">' + (role ? '<b>' + role.name + '</b> — ' + role.desc : '아직 롤이 없습니다. Lv.3이 되면 롤을 선택해 진화할 수 있습니다.') +
      '<br><b style="color:' + L.color + '">' + L.name + '</b> — ' + L.desc + '</div>' +

      '<div class="band">PLAYER STORY<span>' + esc(p.nickname) + '</span></div>' +
      '<div class="pd-story">' + skills + DS.storyFor(p, S.club.name) + '</div>' +

      (inSquad ?
        '<div class="pd-edit">' +
        '<label>이름<input id="pd-name" maxlength="8" value="' + esc(p.name) + '"></label>' +
        '<label style="flex:0 0 76px">등번호<input id="pd-num" type="number" min="1" max="99" value="' + p.number + '"></label>' +
        '<button class="btn primary" data-act="saveplayer" data-id="' + p.id + '">저장</button></div>' +
        '<button class="btn dark wide" style="margin-top:8px" data-act="evolve" data-id="' + p.id + '"' + (canEvolve(p) ? '' : ' disabled aria-disabled="true"') + '>' +
        (canEvolve(p) ? '롤 진화 · ' + fmt(EVO_COST) : '롤 진화 · Lv.' + evoNeed(p) + '부터') + '</button>'
        : '<div class="empty-note">스카우트 후보입니다. 영입하면 이름과 등번호를 바꿀 수 있어요.</div>');

    setSheet('PLAYER DETAIL', body);
    paintEmblems(document.getElementById('modal'));
  }

  function deckModal() {
    deckDraft = S.deck.slice();
    var cards = '', i, d, on;
    for (i = 0; i < DS.CARDS.length; i++) {
      d = DS.CARDS[i];
      on = deckDraft.indexOf(d.key) >= 0;
      cards += '<button class="deckrow' + (on ? ' on' : '') + '" data-act="deckpick" data-k="' + d.key + '">' +
        '<span class="dr-art" style="--cc:' + d.color + '">' + DS.tacticArtHTML(d.key) +
        '<em style="color:' + d.color + '">' + d.tag + '</em></span>' +
        '<span class="dtxt"><b>' + d.name + ' <em>M ' + d.cost + '</em></b><span>' + d.desc + '</span></span>' +
        '<span class="dstate' + (on ? ' on' : '') + '">' + (on ? '편성' : '추가') + '</span></button>';
    }
    setSheet('전술 카드 덱 · ' + deckDraft.length + '/6',
      '<div class="tiny muted" style="margin-bottom:6px">경기 중 손패는 덱에서 3장이 뽑힙니다. 모멘텀을 모아 원하는 타이밍에 발동하세요.</div>' +
      cards +
      '<button class="btn primary wide" style="margin-top:8px" data-act="decksave">덱 저장</button>');
  }

  /* v21b ② — 지금 레벨에서 열 수 있는(현재 롤과 다른) 롤이 하나라도 있어야 진화 가능 */
  function canEvolve(p) {
    if (!p) { return false; }
    var list = DS.rolesFor(p.pos), lv = p.level || 0, i;
    for (i = 0; i < list.length; i++) {
      if (list[i].key === p.role) { continue; }
      if (lv >= list[i].need) { return true; }
    }
    return false;
  }
  function evoNeed(p) {
    var list = p ? DS.rolesFor(p.pos) : [], need = 3, i;
    for (i = 0; i < list.length; i++) {
      if (list[i].key === p.role) { continue; }
      need = Math.min(need, list[i].need);
    }
    return need;
  }

  function evolveModal(p) {
    var list = DS.rolesFor(p.pos), html = '', i, r, owned, can, reason;
    for (i = 0; i < list.length; i++) {
      r = list[i];
      owned = p.role === r.key;
      can = (p.level || 0) >= r.need && S.money >= EVO_COST && !owned;
      reason = owned ? '적용 중' : ((p.level || 0) < r.need ? 'Lv.' + r.need + ' 필요' : (S.money < EVO_COST ? '금화 부족' : '진화 가능'));
      html += '<div class="role-row">' +
        '<div style="flex:1 1 auto;min-width:0"><div class="nm">' + r.name + ' <span class="tiny muted">' + r.en + '</span></div>' +
        '<div class="ds">' + r.desc + '</div></div>' +
        '<button class="btn sm ' + (owned ? 'ghost' : (can ? 'primary' : 'ghost')) + '" data-act="evolvepick" data-p="' + p.id + '" data-k="' + r.key + '" ' + (can ? '' : 'disabled') + '>' + reason + '</button>' +
        '</div>';
    }
    setSheet('롤 진화 · ' + esc(p.name),
      '<div class="row" style="margin-bottom:8px;gap:8px"><span style="width:54px;height:54px;border-radius:50%;overflow:hidden;background:#e6e1d1;flex:0 0 auto"><img src="' + DS.Art.headSrc(p) + '" style="width:100%;height:100%;object-fit:cover"></span>' +
      '<div><div class="b" style="font-size:13px">' + esc(p.name) + ' · ' + p.pos + '</div>' +
      '<div class="tiny muted">Lv.' + (p.level || 0) + ' · 보유 ' + fmt(S.money) + '</div></div></div>' +
      html +
      '<div class="empty-note" style="margin-top:8px">롤 진화는 능력치를 영구히 올립니다. 특훈으로 레벨을 올려 더 많은 롤을 열어 보세요.</div>');
  }

  function roleModal() {
    var st = starters(), rows = '', i;
    var defs = [
      { k: 'cap', tag: 'CAP', name: '주장', desc: '경기 집중력 · 통솔' },
      { k: 'fk', tag: 'FK', name: '프리킥', desc: '직접 프리킥 담당' },
      { k: 'ck', tag: 'CK', name: '코너킥', desc: '코너킥 담당' },
      { k: 'pk', tag: 'PK', name: '페널티킥', desc: 'PK 키커' }
    ];
    for (i = 0; i < defs.length; i++) {
      var d = defs[i], cur = byId(S.roles[d.k]);
      rows += '<div class="role-row"><span class="chip lime">' + d.tag + '</span>' +
        '<div style="flex:1 1 auto;min-width:0"><div class="nm">' + (cur ? esc(cur.name) : '미지정') + '</div><div class="ds">' + d.name + ' · ' + d.desc + '</div></div>' +
        '<button class="btn ghost sm" data-act="roleopen" data-k="' + d.k + '">변경</button></div>';
      if (rolePick === d.k) {
        var picks = '';
        for (var j = 0; j < st.length; j++) {
          picks += '<button class="' + (S.roles[d.k] === st[j].id ? 'on' : '') + '" style="margin:2px" data-act="roleset" data-k="' + d.k + '" data-id="' + st[j].id + '">' +
            st[j].pos + ' ' + esc(shortName(st[j].name)) + '</button>';
        }
        rows += '<div class="role-pick" style="display:flex;flex-wrap:wrap;gap:3px;padding:4px 0">' + picks + '</div>';
      }
    }
    setSheet('역할 선택 · CAP / FK / CK / PK',
      '<div class="tiny muted" style="margin-bottom:6px">선발 11명 중에서 지정합니다. 주장은 통솔, 키커는 세트피스 능력이 반영됩니다.</div>' +
      rows + '<button class="btn dark wide" style="margin-top:8px" data-act="autorole">능력치 기준 자동 지정</button>');
  }

  function evolveListModal() {
    var st = starters(), rows = '', i;
    for (i = 0; i < st.length; i++) {
      var r = DS.roleOf(st[i].role);
      var canEvo2 = canEvolve(st[i]), needLv2 = evoNeed(st[i]);
      rows += '<div class="role-row">' +
        '<span class="minihead" style="width:30px;height:30px"><img src="' + DS.Art.headSrc(st[i]) + '"></span>' +
        '<div style="flex:1 1 auto;min-width:0"><div class="nm">' + tierDot(st[i]) + ' ' + esc(st[i].name) + ' <span class="tiny muted">' + st[i].pos + ' · Lv.' + (st[i].level || 0) + '</span></div>' +
        '<div class="ds">' + (r ? r.name : (canEvo2 ? '롤 없음 · 진화 가능' : '롤 없음 · Lv.' + needLv2 + ' 필요')) + '</div></div>' +
        '<button class="btn sm ' + (canEvo2 ? (r ? 'ghost' : 'primary') : 'ghost locked') + '" data-act="evolve" data-id="' + st[i].id + '"' + (canEvo2 ? '' : ' disabled aria-disabled="true"') + '>' +
        (canEvo2 ? (r ? '변경' : '진화') : 'Lv.' + needLv2) + '</button></div>';
    }
    setSheet('롤 진화 · 선발 11명',
      '<div class="tiny muted" style="margin-bottom:6px">선수를 선택해 현대 롤로 진화시키세요. Lv.3 / Lv.4부터 열립니다.</div>' + rows);
  }

  function scoutModal(cand) {
    ioState.candId = cand.id;
    var outList = '', i, p;
    var list = S.squad.slice().sort(function (a, b) { return DS.ratingOf(a) - DS.ratingOf(b); });
    for (i = 0; i < list.length; i++) {
      p = list[i];
      outList += '<button class="out-item' + (ioState.outId === p.id ? ' on' : '') + '" style="display:flex;width:100%;align-items:center;gap:5px;padding:6px;border-radius:8px;border:1px solid ' + (ioState.outId === p.id ? 'var(--lime2)' : 'var(--line)') + ';background:' + (ioState.outId === p.id ? 'rgba(200,241,105,.25)' : 'var(--card2)') + ';margin-bottom:3px;text-align:left" data-act="outpick" data-id="' + p.id + '">' +
        '<span class="minihead" style="width:26px;height:26px"><img src="' + DS.Art.headSrc(p) + '"></span>' +
        '<span style="flex:1 1 auto;font-size:10px;font-weight:700;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(p.name) + '</span>' +
        posBadge(p.pos) + '<span style="font-size:9.5px;font-weight:900;color:#4f7d13">' + DS.ratingOf(p) + '</span></button>';
    }
    var outP = ioState.outId ? byId(ioState.outId) : null;
    var body =
      '<div class="row" style="gap:8px;padding:8px;border-radius:11px;background:#f1ecdd;margin-bottom:8px">' +
      '<span style="width:62px;height:70px;flex:0 0 auto;display:flex;align-items:flex-end;justify-content:center;border-radius:9px;background:linear-gradient(160deg,#e9f3d5,#d8e6bd);overflow:hidden"><img src="' + DS.Art.portraitSrc(cand) + '" style="max-width:100%;max-height:100%"></span>' +
      '<div style="flex:1 1 auto;min-width:0"><div class="b" style="font-size:13px">' + esc(cand.name) + '</div>' +
      '<div class="tiny muted">' + cand.pos + ' · OVR ' + DS.ratingOf(cand) + ' · ' + DS.RARITY[cand.rarity].name + ' · ' + DS.lockOf(cand.lock).name + '</div>' +
      '<div class="tiny muted">' + cand.playType + '</div></div>' +
      '<div style="text-align:right"><div class="tiny muted">비용</div><div class="b">' + fmt(CAND_COST) + '</div></div></div>' +
      '<div class="tiny muted" style="margin-bottom:5px">방출할 선수를 선택하세요 (선수단 ' + S.squad.length + '/' + MAX_SQUAD + ')</div>' +
      outList +
      '<div class="row between" style="margin-top:9px">' +
      '<button class="btn ghost" data-act="closemodal">돌아가기</button>' +
      '<button class="btn red" data-act="scoutconfirm" ' + (!outP || S.money < CAND_COST ? 'disabled' : '') + '>IN / OUT 교환</button></div>';
    setSheet('스페셜 스카우트 · IN / OUT', body);
  }

  /* ═════════════════  결과서 ═════════════════ */
  /* ── v19 ④ — 2D 미니피치 (슈팅 xG맵 · 평균 포지션/패스 연결망) ──
     가로 피치·공격축을 화면 x로 투영한다 (월드 y=0 이 화면 왼쪽).
     홈은 왼쪽 골문을, 원정은 오른쪽 골문을 공격하는 실제 경기 화면과 같다. */
  function roundLabelOf(kind) {
    return kind === 'smatch' ? 'S매치' : (kind === 'pvp' ? '유저 대전' : '챌린지');
  }

  function paintShotMaps(root) {
    var r = shownReport;
    if (!root || !r || !r.tele) { return; }
    var cv = root.querySelector('canvas[data-mapcv]');
    if (!cv) { return; }
    var card = cv.parentNode;
    while (card && (!card.getAttribute || card.getAttribute('data-rmap') !== '1')) { card = card.parentNode; }
    var mode = (card && card.getAttribute('data-mapmode')) || 'xg';
    var side = (card && card.getAttribute('data-mapside')) || 'home';
    var rect = cv.getBoundingClientRect ? cv.getBoundingClientRect() : null;
    var w = Math.max(220, Math.round((rect && rect.width) || 320));
    var h = Math.round(w * 0.66);
    var dpr = Math.min(2, (global.devicePixelRatio || 1));
    cv.style.width = '100%';
    cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    var c = cv.getContext('2d');
    if (!c) { return; }
    if (c.setTransform) { c.setTransform(dpr, 0, 0, dpr, 0, 0); }
    drawMiniPitch(c, w, h, r, mode, side);
  }

  function drawMiniPitch(c, w, h, r, mode, side) {
    var pad = 7, legH = 18;   /* v25 — 하단 범례가 잘리지 않게 여유를 준다 */
    var pw = w - pad * 2, ph = h - pad * 2 - legH;
    /* v25 — 경기 화면과 같은 방향: 월드 y=0(홈의 공격 골문)이 오른쪽. 이전에는 좌우가 뒤집혀
       우리 슈팅이 상대 골문 반대편에 찍혔다. */
    var X = function (wy) { return pad + (1 - clamp(wy, 0, 120) / 120) * pw; };
    var Y = function (wx) { return pad + (clamp(wx, 0, 100) / 100) * ph; };
    var i, sh, xg, rad, col;
    c.clearRect(0, 0, w, h);
    /* 잔디 */
    c.fillStyle = '#0c3229';
    c.fillRect(pad, pad, pw, ph);
    for (i = 0; i < 6; i++) {
      if (i % 2 === 0) { continue; }
      c.fillStyle = 'rgba(255,255,255,.035)';
      c.fillRect(pad + pw * (i / 6), pad, pw / 6, ph);
    }
    /* 라인 */
    c.strokeStyle = 'rgba(210,240,220,.42)';
    c.lineWidth = 1;
    c.strokeRect(pad + 0.5, pad + 0.5, pw - 1, ph - 1);
    c.beginPath(); c.moveTo(X(60), pad); c.lineTo(X(60), pad + ph); c.stroke();
    c.beginPath(); c.arc(X(60), Y(50), Math.min(pw, ph) * 0.14, 0, Math.PI * 2); c.stroke();
    /* 페널티 박스 (양쪽) */
    var boxW = Math.abs(X(16.5) - X(0));
    c.strokeRect(Math.min(X(0), X(16.5)), Y(21), boxW, Y(79) - Y(21));
    c.strokeRect(Math.min(X(120), X(103.5)), Y(21), boxW, Y(79) - Y(21));
    /* 골문 */
    c.strokeStyle = 'rgba(200,241,105,.65)';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(pad, Y(43)); c.lineTo(pad, Y(57));
    c.moveTo(pad + pw, Y(43)); c.lineTo(pad + pw, Y(57)); c.stroke();
    /* v25b — 유니폼 색이 아니라 경기 화면과 같은 고정 팔레트(파랑 vs 빨강).
       초록·검정 유니폼 구단을 만나도 xG맵 점이 잔디와 겹치지 않는다. */
    var TC = (DS.Match && DS.Match.teamColors) || { home: '#2f8dff', away: '#ff4b4b' };
    var TEAM = { home: TC.home, away: TC.away };

    if (mode === 'xg') {
      var shots = (r.tele.shots || []);
      var maxXg = 0.35;
      for (i = 0; i < shots.length; i++) {
        xg = shots[i].xg || 0;
        if (xg > maxXg) { maxXg = xg; }
      }
      for (i = 0; i < shots.length; i++) {
        sh = shots[i];
        var cx = X(sh.y), cy = Y(sh.x);
        xg = sh.xg || 0;
        rad = 2.2 + Math.sqrt(xg / maxXg) * 9.5;
        col = TEAM[sh.side] || '#ddd';
        c.beginPath();
        c.arc(cx, cy, rad, 0, Math.PI * 2);
        if (sh.isGoal) {
          c.fillStyle = col; c.globalAlpha = 0.95; c.fill(); c.globalAlpha = 1;
          c.strokeStyle = '#ffe98a'; c.lineWidth = 2; c.stroke();
        } else if (sh.onTarget) {
          c.fillStyle = col; c.globalAlpha = 0.34; c.fill(); c.globalAlpha = 1;
          c.strokeStyle = col; c.lineWidth = 1.2; c.stroke();
        } else {
          c.globalAlpha = 0.55; c.strokeStyle = col; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
        }
        if (sh.set) {
          c.beginPath(); c.arc(cx, cy, 1.4, 0, Math.PI * 2); c.fillStyle = '#ffe98a'; c.fill();
        }
      }
      /* v25b — 범례도 팀 색과 같은 파랑·빨강으로 (스코어보드·점유율 바와 통일) */
      var nH = (r.tele.shots || []).filter(function (s) { return s.side === 'home'; }).length;
      var nA = (r.tele.shots || []).filter(function (s) { return s.side === 'away'; }).length;
      c.font = '700 7px system-ui, sans-serif';
      c.textAlign = 'left';
      var tx = pad + 1, ty = h - 3;
      function seg(label, color) {
        c.fillStyle = color;
        c.fillText(label, tx, ty);
        tx += c.measureText(label).width + 1;
      }
      seg((r.homeShort || 'HOME') + ' ' + nH, TEAM.home);
      seg(' · ', 'rgba(233,244,221,.45)');
      seg((r.awayShort || 'AWAY') + ' ' + nA, TEAM.away);
      seg('슛 (원 = xG)', 'rgba(233,244,221,.55)');
      return;
    }

    /* 평균 포지션 · 패스 연결망 */
    var avg = (r.tele.avg && r.tele.avg[side]) || [];
    var net = (r.tele.net && r.tele.net[side]) || [];
    var col2 = TEAM[side] || '#ddd';
    var byName = {};
    for (i = 0; i < avg.length; i++) { byName[avg[i].sn] = avg[i]; }
    var maxN = 1;
    for (i = 0; i < net.length; i++) { if (net[i].n > maxN) { maxN = net[i].n; } }
    for (i = 0; i < net.length; i++) {
      var l = net[i];
      var a1 = byName[l.from], a2 = byName[l.to];
      if (!a1 || !a2) { continue; }
      c.beginPath();
      c.moveTo(X(a1.y), Y(a1.x));
      c.lineTo(X(a2.y), Y(a2.x));
      c.strokeStyle = col2;
      c.globalAlpha = 0.14 + (l.n / maxN) * 0.5;
      c.lineWidth = 0.6 + (l.n / maxN) * 2.4;
      c.stroke();
      c.globalAlpha = 1;
    }
    for (i = 0; i < avg.length; i++) {
      var q = avg[i];
      var px = X(q.y), py = Y(q.x);
      c.beginPath(); c.arc(px, py, 7.2, 0, Math.PI * 2);
      c.fillStyle = 'rgba(9,33,27,.9)'; c.fill();
      c.strokeStyle = col2; c.lineWidth = 1.4; c.stroke();
      c.fillStyle = '#eaf6dd';
      c.font = '800 7px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(q.sn || '', px, py + 2.4);
      c.fillStyle = 'rgba(233,244,221,.6)';
      c.font = '700 5.8px system-ui, sans-serif';
      c.fillText(q.pos || '', px, py - 9.4);
    }
    var label = (r[side === 'home' ? 'homeShort' : 'awayShort'] || side.toUpperCase()) +
      ' 평균 포지션 · 패스 ' + net.length + '쌍';
    c.fillStyle = 'rgba(233,244,221,.62)';
    c.font = '600 7px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText(label, pad + 1, h - 6);
  }

  function mapCardHTML(r) {
    var t = r.tele;
    if (!t) { return ''; }
    var nShots = (t.shots || []).length;
    var nAvg = ((t.avg && t.avg.home) ? t.avg.home.length : 0) + ((t.avg && t.avg.away) ? t.avg.away.length : 0);
    if (!nShots && !nAvg) { return ''; }
    return '<div class="band">TACTICAL MAP <span>슈팅 xG · 평균 포지션</span></div>' +
      '<div class="card tight rmap" data-rmap="1" data-mapmode="xg" data-mapside="home">' +
      '<div class="rmap-tabs">' +
      '<button class="rmap-tab on" data-act="maptab" data-map="xg">슈팅 xG맵</button>' +
      '<button class="rmap-tab" data-act="maptab" data-map="pos">평균 포지션 · 패스</button>' +
      '</div>' +
      '<canvas class="rmap-cv" data-mapcv="1" width="320" height="198"></canvas>' +
      '<div class="rmap-foot">' +
      '<span class="rmap-sides">' +
      '<button class="rmap-side on" data-act="mapside" data-side="home">' + esc(r.homeShort || 'HOME') + '</button>' +
      '<button class="rmap-side" data-act="mapside" data-side="away">' + esc(r.awayShort || 'AWAY') + '</button>' +
      '</span>' +
      '<span class="rmap-note">' + (r.v19 && r.v19.aiShifts && r.v19.aiShifts.length
        ? '상대 감독 전술 변경 ' + r.v19.aiShifts.length + '회' : '') + '</span>' +
      '</div></div>';
  }

  function expHTML(r) {
    var list = r.expGain || [], i, rows = '';
    if (!list.length) { return ''; }
    for (i = 0; i < list.length; i++) {
      var e = list[i], pct = Math.max(2, Math.min(100, Math.round(e.expLeft / Math.max(1, e.need) * 100)));
      rows += '<div class="ex-row' + (e.levels ? ' up' : '') + '">' +
        '<span class="ex-nm">' + esc(e.name) + '<em>' + e.pos + '</em>' +
        (e.youth ? '<span class="ex-tag yth">유망주 ×' + (e.youthMult || 2.2) + '</span>' : '') +
        (e.stage && e.stage !== 'mature' ? '<span class="ex-tag ' + e.stage + '">' + e.stageName + '</span>' : '') +
        '</span>' +
        '<span class="ex-bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="ex-v">+' + e.exp + '</span>' +
        (e.levels ? '<span class="ex-up">LV.' + e.level + ' ▲' + e.levels + '</span>' : '<span class="ex-lv">Lv.' + e.level + '</span>') +
        '</div>';
    }
    return '<div class="band">EXP · LEVEL UP</div><div class="card tight" style="margin:0 0 8px">' + rows +
      '<div class="tiny muted" style="margin-top:4px">출전·평점·득점·도움으로 EXP가 쌓이고, 가득 차면 자동으로 레벨업합니다.</div></div>';
  }

  function reportHTML(r) {
    var i, goals = '', caut = '', pts = '', car = '';
    if (!r.goals.length) { goals = '<div class="rline empty">득점 없음</div>'; }
    for (i = 0; i < r.goals.length; i++) {
      var g = r.goals[i];
      goals += '<div class="rline ' + (g.side === 'away' ? 'away' : '') + '">' +
        '<b>' + esc(g.name) + '</b><span class="min">' + (g.half === 1 ? '후' : '전') + '반 ' + g.min + '분</span>' +
        (g.assist ? '<span class="min" style="margin-left:4px">도움 ' + esc(g.assist) + '</span>' : '') + '</div>';
    }
    if (!r.cautions.length) { caut = '<div class="rline empty">경고 없음</div>'; }
    for (i = 0; i < r.cautions.length; i++) {
      var c = r.cautions[i];
      caut += '<div class="rline ' + (c.side === 'away' ? 'away' : '') + '"><b>' + esc(c.name) + '</b>' +
        '<span class="min">' + (c.half === 1 ? '후' : '전') + '반 ' + c.min + '분 · ' + (c.type === 'red' ? '퇴장' : '경고') + '</span></div>';
    }
    var sorted = r.ratings.slice().sort(function (a, b) { return b.rating - a.rating; });
    for (i = 0; i < sorted.length; i++) {
      var rr = sorted[i];
      pts += '<div class="pts-row' + (rr.mvp ? ' mvp' : '') + '"><span class="pt">' + rr.rating.toFixed(1) + '</span>' +
        '<span class="nm">' + esc(rr.name) + (rr.goals ? ' · ' + rr.goals + '골' : '') + '</span>' +
        '<span class="rl">' + rr.role + '</span></div>';
    }
    var rows = S.career.slice();
    rows.push({ season: S.season, rank: ourRank(), p: tableRow('me').p, w: tableRow('me').w, d: tableRow('me').d, l: tableRow('me').l, gf: tableRow('me').gf, ga: tableRow('me').ga, pts: tableRow('me').pts, now: true });
    for (i = 0; i < rows.length; i++) {
      var cr = rows[i];
      car += '<tr class="' + (cr.now ? 'me' : '') + '"><td class="rk">' + cr.season + '</td><td>' + cr.rank + '위</td>' +
        '<td>' + cr.p + '</td><td>' + cr.w + '</td><td>' + cr.d + '</td><td>' + cr.l + '</td><td>' + cr.gf + ':' + cr.ga + '</td><td class="pts">' + cr.pts + '</td></tr>';
    }

    return '<div class="rs">' +
      '<div class="rs-team"><canvas data-emblem="' + r.homeEmblem + '" data-kit="' + r.homeKit.shirt + '|' + r.homeKit.trim + '" width="30" height="34"></canvas><b>' + esc(r.homeShort) + '</b><span>' + (r.venueHome === false ? 'AWAY' : 'HOME') + '</span></div>' +
      '<div class="rs-score"><b>' + r.homeScore + '</b><i>:</i><b>' + r.awayScore + '</b></div>' +
      '<div class="rs-team"><canvas data-emblem="' + r.awayEmblem + '" data-kit="' + r.awayKit.shirt + '|' + r.awayKit.trim + '" width="30" height="34"></canvas><b>' + esc(r.awayShort) + '</b><span>' + (r.venueHome === false ? 'HOME' : 'AWAY') + '</span></div>' +
      '</div>' +
      '<div class="kpis" style="margin-bottom:9px">' +
      '<div class="kpi"><b>' + r.xg[0].toFixed(1) + ' : ' + r.xg[1].toFixed(1) + '</b><span>xG</span></div>' +
      '<div class="kpi"><b>' + r.possession[0] + '%</b><span>점유율</span></div>' +
      '<div class="kpi"><b>' + r.cards + '</b><span>전술 카드</span></div>' +
      '</div>' +
      '<div class="band">SCORE<span>' + esc(r.competition) + ' · ' + r.roundLabel + '</span></div>' +
      (r.pvp ? '<div class="band">유저 대전 <span>' + (r.pvp.res === 'W' ? '승리' : (r.pvp.res === 'D' ? '무승부' : '패배')) +
        ' · ' + r.pvp.record + (r.pvp.streak > 1 ? ' · ' + r.pvp.streak + '연승' : '') + '</span></div>' +
        '<div class="card tight" style="margin:0 0 8px"><div class="rline"><span>상대 구단</span><b style="margin-left:auto">' + esc(r.pvp.opp) + '</b></div>' +
        '<div class="rline"><span>내 PvP 전적</span><b style="margin-left:auto">승 ' + r.pvp.w + ' · 무 ' + r.pvp.d + ' · 패 ' + r.pvp.l + '</b></div></div>' : '') +
      '<div class="card tight" style="margin:0 0 8px"><div class="rline"><span>일시</span><b style="margin-left:auto">' + r.date + '</b></div>' +
      '<div class="rline"><span>장소</span><b style="margin-left:auto">' + esc(r.stadium) + '</b></div>' +
      '<div class="rline"><span>관중</span><b style="margin-left:auto">' + fmt(r.attendance) + '명</b></div>' +
      '<div class="rline"><span>슛</span><b style="margin-left:auto">' + r.shots.home + ' : ' + r.shots.away + '</b></div>' +
      '<div class="rline"><span>패스 · 태클 · 선방</span><b style="margin-left:auto">' + r.passes + ' · ' + r.tackles + ' · ' + r.saves + '</b></div>' +
      '<div class="rline"><span>MVP</span><b style="margin-left:auto">' + esc(r.mvp.name) + ' (' + r.mvpRating.toFixed(1) + ')</b></div></div>' +
      mapCardHTML(r) +
      '<div class="band">GOALS</div><div class="card tight" style="margin:0 0 8px">' + goals + '</div>' +
      (r.manager ? '<div class="band">MANAGER</div><div class="card tight" style="margin:0 0 8px">' +
        '<div class="rline"><span>감독</span><b style="margin-left:auto">' + esc(r.manager.name) + ' · ' + esc(r.manager.style) + '</b></div>' +
        '<div class="rline"><span>고유 포메이션</span><b style="margin-left:auto">' + esc(r.manager.formation) + (r.manager.sync ? ' · 시너지 ON' : '') + '</b></div>' +
        '<div class="rline"><span>특기</span><b style="margin-left:auto">' + esc(r.manager.traits) + '</b></div></div>' : '') +
      '<div class="band">CAUTIONS</div><div class="card tight" style="margin:0 0 8px">' + caut + '</div>' +
      '<div class="band">PLAYER RATING</div><div class="card tight" style="margin:0 0 8px">' + pts + '</div>' +
      expHTML(r) +
      (r.reserve ? '<div class="band">2군 리그 <span>vs ' + esc(r.reserve.oppName) + ' ' + r.reserve.gf + ':' + r.reserve.ga + '</span></div>' +
        '<div class="card tight" style="margin:0 0 8px">' +
        r.reserve.rows.map(function (x) {
          return '<div class="rl-row' + (x.levels ? ' up' : '') + '"><span class="rl-nm">' + esc(shortName(x.name)) + '<em>' + x.pos + '</em></span>' +
            '<span class="rl-rt">' + x.rating.toFixed(1) + '</span>' +
            '<span class="rl-ex">+' + x.exp + '</span>' +
            '<span class="rl-ov">' + x.ovrFrom + '→' + x.ovrTo + '</span>' +
            (x.levels ? '<span class="rl-up">LV.' + x.level + ' ▲' + x.levels + '</span>' : '<span class="rl-lv">Lv.' + x.level + '</span>') +
            '</div>';
        }).join('') +
        '<div class="tiny muted" style="margin-top:3px">2군 경기는 리그 라운드마다 자동으로 치러집니다. 클럽 > 유소년에서 확인하세요.</div></div>' : '') +
      '<div class="band">CAREER</div><div class="card tight" style="margin:0 0 8px">' +
      '<table class="tbl"><thead><tr><th>시즌</th><th>순위</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th></tr></thead><tbody>' + car + '</tbody></table></div>' +
      '<div class="row between"><span class="tiny muted">보상 ' + fmt(r.reward) + (r.points ? ' · 승점 +' + r.points : '') + '</span>' +
      '<button class="btn primary" data-act="closemodal">확인</button></div>';
  }

  var shownReport = null;
  function showReport(r) {
    var m = document.getElementById('modal');
    shownReport = r;
    m.className = 'on';
    m.setAttribute('data-report', '1');
    m.innerHTML = '<div class="sheet"><div class="sheet-head"><b>RESULTS</b>' +
      '<span class="tiny muted">' + r.season + ' 시즌 · ' + r.roundLabel + '</span>' +
      '<button class="x" data-act="closemodal">닫기 ✕</button></div>' +
      '<div class="sheet-body">' + reportHTML(r) + '</div></div>';
    paintEmblems(m);
    paintShotMaps(m);
  }

  /* ═════════════════  v24 — 비동기 PvP (유저 대전) ═════════════════
     내 구단을 코드(?vs=)로 내보내고, 받은 코드로 상대 구단과 1:1 챌린지 매치를 치른다.
     리그 라운드·승점·S매치 이용권과 완전히 분리된 별도 경기이며, 유저 간 거래는 없다. */
  var pvpPreview = null;          /* 도전 확인 창에 떠 있는 상대 {snap, code} */

  function defaultPvp() {
    return { w: 0, d: 0, l: 0, streak: 0, bestStreak: 0, plays: 0, history: [], codeAt: 0 };
  }
  function ensurePvp(st) {
    st = st || S;
    if (!st.pvp || typeof st.pvp !== 'object') { st.pvp = defaultPvp(); }
    var pv = st.pvp, k = ['w', 'd', 'l', 'streak', 'bestStreak', 'plays', 'codeAt'], i;
    for (i = 0; i < k.length; i++) { if (typeof pv[k[i]] !== 'number') { pv[k[i]] = 0; } }
    if (!pv.history || typeof pv.history.length !== 'number') { pv.history = []; }
    return pv;
  }

  /* 내 구단 스냅샷 재료 — 선발 11 + 벤치 7 */
  function myPvpContext() {
    var list = [], i, p, bp;
    for (i = 0; i < S.lineup.length; i++) {
      p = byId(S.lineup[i]);
      if (p) { list.push(p); }
    }
    bp = benchPlayers();
    for (i = 0; i < bp.length && list.length < 18; i++) { list.push(bp[i]); }
    return { club: S.club, formation: S.formation, style: mgr().tacticStyle, players: list };
  }
  function myPvpCode() {
    if (!DS.Pvp) { return { ok: false, error: 'PvP 모듈을 불러오지 못했습니다.' }; }
    return DS.Pvp.exportSquadCode(myPvpContext());
  }

  /* 클립보드 — 실패하면 폴백 모달의 입력창에서 직접 복사하게 안내한다 */
  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed'; ta.style.left = '-9999px'; ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      if (ta.setSelectionRange) { ta.setSelectionRange(0, text.length); }
      var ok = document.execCommand ? document.execCommand('copy') : false;
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }
  function copyText(text, done) {
    var nav = global.navigator;
    if (nav && nav.clipboard && nav.clipboard.writeText) {
      try {
        nav.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
        return;
      } catch (e) { /* 아래 폴백 */ }
    }
    done(fallbackCopy(text));
  }

  /* 상대 코드 → 챌린지 매치 준비물(스카우팅 포함) */
  function pvpPrep(snap) {
    var team = DS.Pvp.toTeam(snap);
    var squad = DS.Pvp.toAwaySquad(snap);
    var om = DS.Pvp.virtualManager(snap);
    var prep = {
      kind: 'pvp', team: team, id: 'pvp', venueHome: true,
      formation: snap.formation, mgr: om, squad: squad, snap: snap
    };
    prep.scout = DS.scoutReport({
      formation: snap.formation, style: snap.style, players: squad, managerName: om.name
    });
    return prep;
  }
  function startPvp(snap) {
    if (!snap) { toast('상대 구단 정보가 없습니다.'); return; }
    pvpPreview = null;
    startMatch('pvp', { prep: pvpPrep(snap) });
  }

  /* 경기 종료 → 내 PvP 전적·최근 대결·레지스트리 기록 */
  function recordPvp(oppTeam, gf, ga) {
    var pv = ensurePvp();
    var win = gf > ga, draw = gf === ga;
    pv.plays += 1;
    if (win) { pv.w++; pv.streak++; }
    else if (draw) { pv.d++; pv.streak = 0; }
    else { pv.l++; pv.streak = 0; }
    if (pv.streak > pv.bestStreak) { pv.bestStreak = pv.streak; }
    var row = {
      opp: oppTeam.name, oppShort: oppTeam.short, gf: gf, ga: ga,
      res: win ? 'W' : (draw ? 'D' : 'L'), power: oppTeam.strength || 0, ts: Date.now()
    };
    pv.history.unshift(row);
    if (pv.history.length > 12) { pv.history.length = 12; }
    if (DS.Pvp && DS.Pvp.registry && DS.Pvp.registry.reportResult) {
      try {
        DS.Pvp.registry.reportResult({ opp: row.opp, gf: gf, ga: ga, res: row.res, power: row.power });
      } catch (e) { /* 기록 실패가 경기 결과를 막지는 않는다 */ }
    }
    return {
      opp: row.opp, res: row.res, gf: gf, ga: ga,
      w: pv.w, d: pv.d, l: pv.l, streak: pv.streak, bestStreak: pv.bestStreak,
      record: pv.w + '-' + pv.d + '-' + pv.l
    };
  }

  /* ?vs= 링크로 들어온 도전장 */
  function pvpIncoming(code) {    var res = DS.Pvp.importSquadCode(code);
    if (!res.ok) { toast(res.error); return; }
    pvpPreview = { snap: res.snap, code: res.code };
    pvpChallengeModal(res.snap, '링크로 도착한 도전장입니다.');
  }

  function pvpOpponentCard(snap) {
    var d = DS.Pvp.describe(snap), i, rows = '';
    for (i = 0; i < d.top.length; i++) {
      rows += '<div class="pvp-pl"><span class="pb ' + DS.posGroup(d.top[i].pos).toLowerCase() + '">' + d.top[i].pos + '</span>' +
        '<b>' + esc(d.top[i].name) + '</b><span class="pvp-ovr">' + d.top[i].ovr + '</span></div>';
    }
    return '<div class="pvp-vs">' +
      '<div class="pvp-vs-team"><canvas data-emblem="' + snap.emblem + '" data-kit="' + snap.kit.shirt + '|' + snap.kit.trim + '" width="34" height="40"></canvas>' +
      '<span class="nm">' + esc(d.club) + '</span><span class="st">전력 ' + d.power + '</span></div>' +
      '<div class="vs-mid"><b>VS</b><span>' + esc(d.formation) + ' · ' + esc(d.styleName) + '</span></div>' +
      '<div class="pvp-vs-team"><canvas data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="34" height="40"></canvas>' +
      '<span class="nm">' + esc(S.club.name) + '</span><span class="st">전력 ' + teamPower() + '</span></div>' +
      '</div>' +
      '<div class="pvp-top">' + rows + '</div>' +
      '<div class="tiny muted">선수 ' + d.count + '명 · 상대는 AI 감독이 지휘하고, 나는 실시간 전술 카드·교체로 개입합니다.</div>' +
      (d.clamped ? '<div class="tiny" style="color:#b8452f;margin-top:3px">비정상 수치 ' + d.clamped + '개를 상한(스탯 10 · 레벨 60)으로 조정했습니다.</div>' : '');
  }

  function pvpChallengeModal(snap, note) {
    var d = DS.Pvp.describe(snap);
    setSheet('도전장 · ' + esc(d.club),
      '<div class="tiny muted" style="margin-bottom:7px">' + esc(note || '') + '</div>' +
      pvpOpponentCard(snap) +
      '<div class="row" style="gap:5px;margin-top:9px">' +
      '<button class="btn primary" data-act="pvpstart">킥오프 · 유저 대전</button>' +
      '<button class="btn ghost" data-act="closemodal">나중에</button></div>');
    paintEmblems(document.getElementById('modal'));
  }

  function pvpMyCodeModal() {
    var ex = myPvpCode();
    if (!ex || !ex.ok) { toast((ex && ex.error) || '구단 코드를 만들지 못했습니다.'); return; }
    var pv = ensurePvp();
    pv.codeAt = Date.now();
    save();
    setSheet('내 구단 코드',
      '<div class="tiny muted" style="margin-bottom:6px">아래 링크나 코드를 카톡·디스코드로 보내면 친구가 내 구단과 바로 붙을 수 있습니다.</div>' +
      '<div class="pvp-share"><b>공유 링크</b>' +
      '<textarea class="pvp-input" id="pvp-link" readonly rows="5">' + esc(ex.url) + '</textarea></div>' +
      '<div class="pvp-share"><b>짧은 코드</b>' +
      '<textarea class="pvp-input" id="pvp-code" readonly rows="5">' + esc(ex.code) + '</textarea></div>' +
      '<div class="row" style="gap:5px;margin-top:4px">' +
      '<button class="btn primary" data-act="pvpcopy" data-which="url">링크 복사</button>' +
      '<button class="btn" data-act="pvpcopy" data-which="code">코드 복사</button>' +
      '<button class="btn ghost" data-act="closemodal">닫기</button></div>' +
      '<div class="tiny muted" style="margin-top:6px">전력 ' + ex.snap.power + ' · ' + ex.snap.players.length + '명 · ' + esc(ex.snap.formation) +
      ' · ' + esc(DS.tacticStyle(ex.snap.style).name) + ' · 코드 ' + ex.length + '자</div>');
    /* 클릭(사용자 제스처) 안에서 바로 복사까지 시도한다 */
    var taCode = document.getElementById('pvp-code'), taLink = document.getElementById('pvp-link');
    if (taLink) { taLink.style.height = Math.min(200, (taLink.scrollHeight || 0) + 8) + 'px'; }
    if (taCode) { taCode.style.height = Math.min(200, (taCode.scrollHeight || 0) + 8) + 'px'; }
    copyText(ex.url, function (ok) {
      toast(ok ? '공유 링크를 복사했습니다. 카톡에 붙여넣으세요.' : '자동 복사가 막혔습니다 — 링크를 길게 눌러 복사하세요.');
    });
  }

  function pvpSectionHTML() {
    var pv = ensurePvp(), total = pv.w + pv.d + pv.l;
    var rivals = DS.Pvp.presets(), i, r, d, rc = '', hc = '';
    for (i = 0; i < rivals.length; i++) {
      r = rivals[i];
      d = DS.Pvp.describe(r.snap);
      rc += '<div class="card pvp-rival">' +
        '<div class="card-head"><b>' + esc(d.club) + '</b><span class="meta">' + esc(r.tag) + '</span></div>' +
        '<div class="pvp-row">' +
        '<canvas data-emblem="' + r.snap.emblem + '" data-kit="' + r.snap.kit.shirt + '|' + r.snap.kit.trim + '" width="26" height="30"></canvas>' +
        '<div class="pvp-id"><b>' + esc(d.formation) + ' · ' + esc(d.styleName) + '</b>' +
        '<span>전력 ' + d.power + ' · 선수 ' + d.count + '명</span></div>' +
        '<button class="btn sm" data-act="pvprival" data-k="' + esc(r.key) + '">도전</button></div>' +
        '<div class="tiny muted">' + esc(r.desc) + '</div></div>';
    }
    for (i = 0; i < pv.history.length && i < 5; i++) {
      var h = pv.history[i];
      var cls = h.res === 'W' ? 'w' : (h.res === 'D' ? 'd' : 'l');
      var ko = h.res === 'W' ? '승' : (h.res === 'D' ? '무' : '패');
      hc += '<div class="pvp-rec"><span class="t-' + cls + '">' + ko + '</span><b>' + esc(h.opp) + '</b>' +
        '<em>' + h.gf + ' : ' + h.ga + '</em></div>';
    }
    if (!hc) { hc = '<div class="tiny muted">아직 유저 대전 기록이 없습니다. 내 코드를 보내거나 아래 라이벌에게 먼저 도전해 보세요.</div>'; }

    return '<div class="card dark">' +
      '<div class="card-head"><span class="dot"></span><b style="color:#eaf6dd">유저 대전 · 비동기 PvP</b><span class="meta">ASYNC PVP 1단계</span></div>' +
      '<div class="kpis" style="margin-bottom:7px">' +
      '<div class="kpi"><b class="lime">' + pv.w + '-' + pv.d + '-' + pv.l + '</b><span>승-무-패</span></div>' +
      '<div class="kpi"><b>' + pv.streak + '</b><span>연승</span></div>' +
      '<div class="kpi"><b>' + Math.max(pv.bestStreak, pv.streak) + '</b><span>최고 연승</span></div>' +
      '</div>' +
      '<div class="tiny" style="color:rgba(233,244,221,.62)">내 구단 코드/링크를 카톡 등으로 보내 친구와 대결하세요. 리그 승점·일정에는 영향이 없습니다.</div>' +
      '<div class="pvp-btns">' +
      '<button class="btn primary" data-act="pvpmycode">내 구단 코드 복사</button>' +
      '<button class="btn dark" data-act="pvpenter">상대 코드로 도전</button></div>' +
      '<div class="tiny" style="color:rgba(233,244,221,.45);margin-top:5px">전적 ' + total + '경기 · ' + (total ? '승률 ' + Math.round(pv.w / total * 100) + '%' : '첫 대전을 기다리는 중') + '</div>' +
      '</div>' +
      rc +
      '<div class="card"><div class="card-head"><b>내 PvP 전적</b><span class="meta">최근 5경기</span></div>' + hc + '</div>';
  }

  /* ═════════════════  경기 ═════════════════ */
  function buildAwaySquad(team, formation) {
    var f = DS.FORMATIONS[formation] || DS.FORMATIONS['4-4-2'];
    var out = [], i;
    for (i = 0; i < f.slots.length; i++) {
      var p = DS.makePlayer({ pos: f.slots[i].pos, rarity: 'eun' });
      var target = team.strength + U.irange(-4, 4);
      var sc = target / Math.max(30, DS.ratingOf(p));
      p.s = clamp(Math.round(p.s * sc * 1.04), 1, 10);
      p.t = clamp(Math.round(p.t * sc * 1.04), 1, 10);
      p.p = clamp(Math.round(p.p * sc * 1.04), 1, 10);
      p.stats = DS.statSheet(p);
      out.push(p);
    }
    DS.assignUniquePics(out);
    return out;
  }

  /* ── v20 ③ — 상대 준비 · 스카우팅 : 킥오프에 실제로 스폰되는 그 스쿼드/감독을 미리 만든다 ── */
  var pendingOpp = null;
  function oppFor(kind, opt) {
    opt = opt || {};
    var out = { kind: kind, team: null, id: null, venueHome: true };
    var i, best, o;
    if (kind === 'smatch') {
      out.id = opt.teamId;
      out.team = opponentTeam(out.id);
    } else if (kind === 'challenge') {
      best = DS.TEAMS[0];
      for (i = 0; i < DS.TEAMS.length; i++) { if (DS.TEAMS[i].strength > best.strength) { best = DS.TEAMS[i]; } }
      out.team = best;
      out.id = best.id;
    } else {
      o = currentOpponent();
      /* v23 — 부전승(bye)·42라운드 세이브 등으로 상대가 비어 있으면 38라운드로 자동 복구 */
      if (!o && !S.seasonOver) {
        normalizeDivs(S);
        S.table = makeTable(S.division, true);
        S.fixtures = makeFixtures(S.division, true);
        S.otherTable = makeTable(3 - S.division, false);
        S.otherFixtures = makeFixtures(3 - S.division, false);
        S.round = 0;
        S.seasonOver = false;
        S.seasonReview = null;
        S.log.push('S' + S.season + ' ' + divName(S.division) + ' 대진표 복구 — 20팀 38라운드');
        save();
        if (currentTab === 'home') { renderHome(); }
        o = currentOpponent();
        if (o) { toast('리그 대진표를 20팀 38라운드로 복구했습니다.'); }
      }
      if (!o) { return null; }
      out.team = opponentTeam(o.id);
      out.id = o.id;
      out.venueHome = !!o.home;
    }
    out.formation = oppFormation(out.team);
    out.mgr = oppManager(out.team);
    return out;
  }
  function prepareOpp(kind, opt) {
    var key = [kind, (opt && opt.teamId) || '', S.round, S.season, S.formation].join('|');
    if (pendingOpp && pendingOpp.key === key) { return pendingOpp; }
    var o = oppFor(kind, opt);
    if (!o) { return null; }
    o.key = key;
    o.squad = buildAwaySquad(o.team, o.formation);
    o.scout = DS.scoutReport({
      formation: o.formation, style: o.mgr.tacticStyle, players: o.squad, managerName: o.mgr.name
    });
    pendingOpp = o;
    return o;
  }
  /* 스카우팅 리포트 카드 — 포메이션 · 감독 철학 · 위험 선수 · 카운터 팁 */
  function scoutHTML(prep, cls) {
    if (!prep || !prep.scout) { return ''; }
    var sc = prep.scout, i, lanes = '', lg = [['left', '좌'], ['center', '중'], ['right', '우']];
    for (i = 0; i < lg.length; i++) {
      lanes += '<div class="sc-lane"><span>' + lg[i][1] + '</span>' +
        '<i style="width:' + Math.max(3, sc.lanes[lg[i][0]]) + '%"></i><b>' + sc.lanes[lg[i][0]] + '</b></div>';
    }
    var dg = '', d;
    for (i = 0; i < sc.danger.length; i++) {
      d = sc.danger[i];
      dg += '<div class="sc-danger-row"><span class="sc-rank">' + (i + 1) + '</span>' +
        '<b>' + esc(shortName(d.name)) + '</b><span class="sc-pos">' + d.pos + ' · ' + d.laneKo + '</span>' +
        (d.foot ? '<span class="sc-foot">' + d.foot + '</span>' : '') +
        '<em>' + d.ovr + '</em></div>';
    }
    var tips = '', t;
    for (i = 0; i < sc.tips.length; i++) {
      t = sc.tips[i];
      tips += '<li>' + esc(t) + '</li>';
    }
    return '<div class="card scout-card ' + (cls || '') + '">' +
      '<div class="card-head"><b>상대 스카우팅 리포트</b><span class="meta">SCOUTING · ' + esc(prep.team.short) + '</span></div>' +
      '<div class="sc-head">' +
      '<canvas class="sc-emblem" data-emblem="' + prep.team.emblem + '" data-kit="' + prep.team.kit.shirt + '|' + prep.team.kit.trim + '" width="26" height="30"></canvas>' +
      '<div class="sc-id"><b>' + esc(prep.team.name) + '</b><span>' + esc(prep.formation) + ' · ' + esc(sc.styleName) + ' · ' + esc(prep.mgr.name) + '</span></div>' +
      '<div class="sc-tag"><b>' + sc.press + '</b><span>압박</span></div>' +
      '<div class="sc-tag"><b>' + sc.depth + '</b><span>라인</span></div>' +
      '</div>' +
      '<div class="sc-lanes">' + lanes + '</div>' +
      '<div class="sc-danger">' + dg + '</div>' +
      '<ul class="sc-tips">' + tips + '</ul>' +
      '<div class="sc-note">주 루트 ' + sc.mainLaneKo + ' · ' + (sc.highLine ? '하이 라인' : (sc.lowBlock ? '로우 블록' : '표준 라인')) + ' · ' + esc(sc.styleLine) + '</div>' +
      '</div>';
  }

  function startMatch(kind, opt) {
    opt = opt || {};
    /* v17 — 경기 시작 클릭(사용자 제스처)에서 오디오 컨텍스트를 연다 */
    if (DS.Match && DS.Match.audioUnlock) { DS.Match.audioUnlock(); }
    if (kind === 'smatch' && S.smatchTickets <= 0) { toast('S매치 이용권이 없습니다.'); return; }
    if (kind === 'challenge' && S.challengeLeft <= 0) { toast('오늘 챌린지를 모두 소진했습니다.'); return; }
    /* v24 — 유저 대전(PvP)은 리그·S매치와 분리된 별도 경기: 준비된 상대 프렙을 그대로 쓴다 */
    var prep;
    if (kind === 'pvp') {
      if (!opt.prep) { toast('상대 구단 정보가 없습니다.'); return; }
      prep = opt.prep;
    } else {
      /* v20 ③ — 미리 만든 상대(스카우팅 리포트의 그 스쿼드)를 그대로 쓴다 */
      prep = prepareOpp(kind, opt);
      if (!prep) { toast('이번 시즌 일정이 끝났습니다.'); return; }
    }
    var oppTeam = prep.team, oppId = prep.id, venueHome = prep.venueHome, i;
    if (kind === 'smatch') { S.smatchTickets--; }

    var f = DS.FORMATIONS[S.formation], lineup = [], k, p;
    for (k = 0; k < S.lineup.length; k++) {
      p = byId(S.lineup[k]);
      if (!p) { continue; }
      lineup.push({ player: p, role: f.slots[k].role, pos: f.slots[k].pos, x: f.slots[k].x, y: f.slots[k].y });
    }
    if (lineup.length < 8) { toast('선발 선수가 부족합니다.'); return; }
    if (S.condition < COND_GATE) {
      /* v25 — 조용히 막지 않고, 바로 회복하고 이어갈 수 있게 모달을 연다 */
      toast('컨디션 ' + S.condition + ' — 회복이 필요합니다. 휴식이나 드링크를 고르세요.');
      openConditionModal(kind, opt);
      return;
    }

    /* v21b ⑥ — 실제로 킥오프까지 간 경기만 가이드 2단계로 기록 */
    if (kind === 'league') { guideMark('kickoff'); }
    save();
    setTab('match');
    renderMatchLive(oppTeam, kind);

    var benchList = benchPlayers().map(function (b) {
      return { player: b, pos: b.pos, rating: DS.ratingOf(b) };
    });
    var awayFormation = prep.formation;
    var oppMgr = prep.mgr;
    pendingOpp = null;                       /* 이 상대는 소모됐다 — 다음 경기는 새로 뽑는다 */

    var cfg = {
      homeName: S.club.name,
      awayName: oppTeam.name,
      homeShort: S.club.name.split(' ')[0],
      awayShort: oppTeam.short,
      homeKit: S.club.kit,
      awayKit: oppTeam.kit,
      homeEmblem: S.club.emblem,
      awayEmblem: oppTeam.emblem,
      lineup: lineup,
      bench: benchList,
      homeFormation: S.formation,
      awayPlayers: prep.squad,
      awayFormation: awayFormation,
      homeTacticStyle: mgr().tacticStyle,
      awayTacticStyle: oppMgr.tacticStyle,
      awayManagerName: oppMgr.name,
      awayManagerStyle: DS.tacticStyle(oppMgr.tacticStyle).name,
      tactics: S.tactics,
      condition: S.condition,
      roles: S.roles,
      deck: S.deck.slice(),
      managerFx: DS.managerFx(mgr()),
      managerTune: DS.managerTune(DS.managerFx(mgr())),
      managerName: mgr().name,
      managerFormation: mgr().formation,
      managerSync: mgrSync(),
      managerTraits: DS.managerTraitText(mgr()),
      kind: kind,
      onHalftime: function () { openSubs(true); },
      onHud: function (st) { updateHud(st); },
      onTouch: function (st) { updateTouchHud(st); },
      onEnd: function (res) { finishMatch(res, oppTeam, oppId, kind, venueHome); }
    };
    global.setTimeout(function () { if (DS.Match) { DS.Match.start(cfg); } }, 60);
  }

  function finishMatch(res, oppTeam, oppId, kind, venueHome) {
    var gf = res.homeScore, ga = res.awayScore;
    var win = gf > ga, draw = gf === ga;
    var base = win ? (420 + gf * 60 + (gf - ga) * 40) : (draw ? 210 : 110 + gf * 30);
    if (kind === 'challenge') { base = Math.round(base * 2); }
    if (kind === 'smatch') { base = Math.round(base * 1.35); }
    /* v24 — 유저 대전은 티켓 없이 몇 번이든 치를 수 있으므로, 리그 경기보다 적게 준다(0.9배).
       무한 파밍으로 경제가 틀어지지 않게 하는 장치. */
    if (kind === 'pvp') { base = Math.round(base * 0.9); }
    /* v22 — 1부는 스폰서 배율·중계권 수입이 커진다 */
    var spBonus = 0, i, tv = 0;
    for (i = 0; i < DS.SPONSORS.length; i++) {
      if (DS.SPONSORS[i].id === S.sponsor && S.fans >= DS.SPONSORS[i].fans) {
        spBonus = Math.round(DS.SPONSORS[i].bonus * (DIV_SPONSOR[S.division] || 1));
      }
    }
    if (kind === 'league') { tv = DIV_TV[S.division] || 0; }
    var reward = base + spBonus + tv + facValue('shop');
    if (kind === 'smatch' && S.smatchStreak >= 3) { reward = Math.round(reward * 1.25); }

    var fanGain = win ? U.irange(40, 90) : (draw ? U.irange(10, 30) : -U.irange(10, 30));
    if (win) { fanGain = Math.round(fanGain * (1 + facValue('fanclub') / 100)); }
    S.fans = Math.max(120, S.fans + fanGain);
    S.morale = clamp(S.morale + (win ? 6 : (draw ? 0 : -5)), 0, 100);
    S.condition = clamp(S.condition - U.irange(6, 10) + facValue('medical'), 12, 100);
    S.money += reward;
    /* v24 — 유저 대전(PvP)은 시즌 기록(전적·득실)에 넣지 않고 별도 PvP 전적에만 남긴다 */
    if (kind !== 'pvp') {
      S.totals.matches++;
      S.totals.goals += gf;
      S.totals.conceded += ga;
      if (win) { S.totals.wins++; } else if (draw) { S.totals.draws++; } else { S.totals.losses++; }
    }

    var points = null, reserveOut = null, pvpOut = null;
    if (kind === 'league') {
      playMatchRows(gf, ga, oppId);
      S.round++;
      /* v23 — 리그 라운드가 돌면 2군도 같은 라운드를 치른다 */
      reserveOut = playReserveRound();
      points = win ? 3 : (draw ? 1 : 0);
      if (S.round >= S.fixtures.length) { S.seasonOver = true; ensureSeasonReview(); }
    } else if (kind === 'challenge') {
      S.challengeLeft = Math.max(0, S.challengeLeft - 1);
    } else if (kind === 'smatch') {
      S.smatchStreak = win ? S.smatchStreak + 1 : 0;
    } else if (kind === 'pvp') {
      pvpOut = recordPvp(oppTeam, gf, ga);
    }

    var stadiums = ['도트 파크', '에메랄드 아레나', '한강 경기장', '벽산 스타디움'];
    /* v21 — 경기 EXP: 출전(선발·교체)한 모든 선수에게 평점·득점·도움으로 EXP를 주고
       임계치를 넘으면 자동 레벨업 + 능력치 성장. 결과서에 그대로 보인다. */
    var expGain = awardMatchExp(res, kind);
    var report = {
      season: S.season,
      roundLabel: kind === 'league' ? (S.round + '라운드') : (kind === 'smatch' ? 'S매치' : (kind === 'pvp' ? '유저 대전' : '챌린지')),
      competition: kind === 'league' ? '도트 리그' : (kind === 'smatch' ? 'S매치 스페셜' : (kind === 'pvp' ? '비동기 PvP · 유저 대전' : '챌린지 매치')),
      /* v25 — 고정된 2045년 날짜 대신 지금 시즌·라운드로 표기하고, 원정 경기는 상대 구장을 쓴다 */
      date: '시즌 ' + S.season + ' · ' + (kind === 'league' ? (S.round + '라운드') : roundLabelOf(kind)) +
        ' · ' + ['19:30', '20:00', '21:00'][S.round % 3],
      stadium: (venueHome === false ? (oppTeam.short + ' 경기장') : (S.club.name.split(' ')[0] + ' 파크')),
      attendance: 380 + Math.floor(S.fans / 12),
      homeName: S.club.name,
      awayName: oppTeam.name,
      homeShort: S.club.name.split(' ')[0],
      awayShort: oppTeam.short,
      homeEmblem: S.club.emblem,
      awayEmblem: oppTeam.emblem,
      homeKit: S.club.kit,
      awayKit: oppTeam.kit,
      homeScore: gf, awayScore: ga,
      half: res.half,
      goals: res.goals,
      cautions: res.cautions,
      ratings: res.ratings,
      mvp: res.mvp || { name: '-' },
      mvpRating: res.mvpRating || 6,
      shots: res.shots,
      passes: res.passes,
      tackles: res.tackles,
      saves: res.saves,
      possession: res.possession,
      xg: res.xg || [0, 0],
      cards: res.cards || 0,
      tele: res.tele || null,
      v19: res.v19 || null,
      manager: {
        name: mgr().name, style: mgr().style, formation: mgr().formation,
        traits: DS.managerTraitText(mgr()), sync: mgrSync()
      },
      reward: reward,
      points: points,
      expGain: expGain,
      reserve: reserveOut,
      pvp: pvpOut,
      kind: kind,
      venueHome: venueHome !== false
    };

    S.lastReport = report;
    S.lastResult = {
      homeName: S.club.name, awayName: oppTeam.name, gf: gf, ga: ga,
      mvp: report.mvp.name, mvpRating: report.mvpRating, reward: reward
    };
    if (S.log.length > 20) { S.log.shift(); }
    S.log.push('S' + S.season + ' ' + report.roundLabel + ' ' + oppTeam.short + ' ' + gf + ':' + ga);

    save();
    renderHeader();
    global.setTimeout(function () { showReport(report); }, 420);
  }

  /* ─────────────────────────  v21 — 경기 EXP · 자동 레벨업 (v23에서 data.js로 이동)  ───────────────────────── */
  function awardMatchExp(res, kind) {
    var mult = kind === 'league' ? 1 : (kind === 'challenge' ? 1.3 : (kind === 'pvp' ? 0.8 : 0.9));
    var goalsBy = {}, assistsBy = {}, i, out = [];
    var gs = (res && res.goals) || [];
    for (i = 0; i < gs.length; i++) {
      var g = gs[i];
      if (g.side && g.side !== 'home') { continue; }
      goalsBy[g.name] = (goalsBy[g.name] || 0) + 1;
      if (g.assist) { assistsBy[g.assist] = (assistsBy[g.assist] || 0) + 1; }
    }
    var rs = (res && res.ratings) || [];
    for (i = 0; i < rs.length; i++) {
      var rr = rs[i], p = byId(rr.id);
      if (!p) { continue; }
      var gl = goalsBy[rr.name] || 0, as = assistsBy[rr.name] || 0;
      /* v23 — 나이 곡선 · 감독 growth · 유소년 ×2.2 를 한곳(DS.matchExpGain)에서 계산한다 */
      var calc = DS.matchExpGain(p, {
        rating: rr.rating, goals: gl, assists: as, kindMult: mult, base: 70, mgr: mgr()
      });
      var exp = calc.exp;
      var ups = DS.addExp(p, exp, mgr(), 'first');
      p.apps = (p.apps || 0) + 1;
      p.goals = (p.goals || 0) + gl;
      p.assists = (p.assists || 0) + as;
      out.push({
        id: p.id, name: p.name, pos: p.pos,
        exp: exp, levels: ups, level: p.level || 0,
        expLeft: Math.round(p.exp), need: DS.expToNext(p.level || 0),
        rating: rr.rating,
        youth: calc.youth, youthMult: calc.youthMult,
        stage: calc.stage, stageName: calc.stageName, stageMult: calc.stageMult,
        mult: calc.mult
      });
    }
    out.sort(function (a, b) { return (b.levels - a.levels) || (b.exp - a.exp); });
    if (S.expLog) {
      S.expLog.unshift({ season: S.season, round: S.round, rows: out.slice(0, 16).map(function (x) { return { name: x.name, exp: x.exp, levels: x.levels }; }) });
      if (S.expLog.length > 12) { S.expLog.pop(); }
    }
    return out;
  }

  function playMatchRows(gf, ga, oppId) {
    var pairs = S.fixtures[S.round], i, a, b, sa, sb, g1, g2;
    for (i = 0; i < pairs.length; i++) {
      a = pairs[i][0]; b = pairs[i][1];
      if (a === 'me' || b === 'me') { continue; }
      sa = strengthOf(a); sb = strengthOf(b);
      g1 = simGoals(sa, sb); g2 = simGoals(sb, sa);
      applyScoreTo(S.table, a, g1, g2);
      applyScoreTo(S.table, b, g2, g1);
    }
    applyScoreTo(S.table, 'me', gf, ga);
    applyScoreTo(S.table, oppId, ga, gf);
    sortRows(S.table);
    /* v22 — 반대 리그도 같은 라운드를 함께 진행한다 (승격·강등 판정용) */
    var oPairs = S.otherFixtures && S.otherFixtures[S.round] ? S.otherFixtures[S.round] : [];
    for (i = 0; i < oPairs.length; i++) {
      a = oPairs[i][0]; b = oPairs[i][1];
      sa = strengthOf(a); sb = strengthOf(b);
      g1 = simGoals(sa, sb); g2 = simGoals(sb, sa);
      applyScoreTo(S.otherTable, a, g1, g2);
      applyScoreTo(S.otherTable, b, g2, g1);
    }
    if (S.otherTable) { sortRows(S.otherTable); }
  }
  function simGoals(atk, def) {
    var exp = 1.35 * Math.pow(atk / Math.max(35, def), 1.9);
    exp = clamp(exp, 0.25, 4.2);
    var g = 0, i;
    for (i = 0; i < 7; i++) { if (Math.random() < exp / 7) { g++; } }
    return g;
  }
  function applyScore(id, gf, ga) {
    applyScoreTo(S.table, id, gf, ga);
  }

  /* ═════════════════  v22 — 시즌 결산 · 승격 / 강등 / 승격 플레이오프  ═════════════════
     2부 1~2위 자동 승격 + 3~6위 승격 플레이오프(4강 → 결승) 우승 1팀 = 3팀 승격,
     1부 18~20위 = 3팀 강등. 플레이오프는 전력·홈 이점으로 결산 처리한다. */
  function simStrength(id) { return id === 'me' ? teamPower() : strengthOf(id); }
  function rowName(r) { return r.id === 'me' ? S.club.name : r.name; }
  function simH2H(aRow, bRow) {
    var sa = simStrength(aRow.id) + 2, sb = simStrength(bRow.id);
    var ga = simGoals(sa, sb), gb = simGoals(sb, sa), winner, pk = false;
    if (ga > gb) { winner = aRow; }
    else if (gb > ga) { winner = bRow; }
    else {
      pk = true;
      winner = Math.random() < (0.5 + (sa - sb) * 0.02) ? aRow : bRow;
    }
    return { a: aRow, b: bRow, ga: ga, gb: gb, pk: pk, winner: winner };
  }
  function playoffOf(rows) {
    if (!rows || rows.length < 6) { return null; }
    var s = rows.slice(2, 6);
    var sf1 = simH2H(s[0], s[3]);
    var sf2 = simH2H(s[1], s[2]);
    var fin = simH2H(sf1.winner, sf2.winner);
    return { sf: [sf1, sf2], final: fin, winner: fin.winner };
  }
  function rankedTable(div) {
    var rows = (div === S.division ? S.table : S.otherTable).slice();
    rows.sort(function (a, b) { return cmpRows(a, b, false); });
    return rows;
  }
  function ensureSeasonReview() {
    if (!S.seasonOver) { return null; }
    if (S.seasonReview) { return S.seasonReview; }
    var r1 = rankedTable(1), r2 = rankedTable(2);
    if (!r1.length || !r2.length) { return null; }
    var po = playoffOf(r2);
    var promoted = [r2[0], r2[1], po.winner];
    var relegated = [r1[r1.length - 3], r1[r1.length - 2], r1[r1.length - 1]];
    var myRank = 0, i, outcome = '잔류', mine = S.division === 1 ? r1 : r2;
    for (i = 0; i < mine.length; i++) { if (mine[i].id === 'me') { myRank = i + 1; } }
    if (S.division === 1) {
      outcome = myRank >= 18 ? '강등' : '잔류';
    } else if (myRank <= 2) {
      outcome = '승격';
    } else if (myRank >= 3 && myRank <= 6) {
      outcome = po.winner.id === 'me' ? '승격' : '잔류';
    }
    var poText = '';
    if (S.division === 2 && myRank >= 3 && myRank <= 6) {
      poText = po.winner.id === 'me' ? '승격 PO 승리' : '승격 PO 탈락';
    }
    var lines = [], sf = po.sf, fin = po.final;
    lines.push({ stage: 'PO 4강', home: rowName(sf[0].a), away: rowName(sf[0].b), hs: sf[0].ga, as: sf[0].gb, pk: sf[0].pk, win: rowName(sf[0].winner) });
    lines.push({ stage: 'PO 4강', home: rowName(sf[1].a), away: rowName(sf[1].b), hs: sf[1].ga, as: sf[1].gb, pk: sf[1].pk, win: rowName(sf[1].winner) });
    lines.push({ stage: 'PO 결승', home: rowName(fin.a), away: rowName(fin.b), hs: fin.ga, as: fin.gb, pk: fin.pk, win: rowName(fin.winner) });
    var nextDiv = outcome === '승격' ? 1 : (outcome === '강등' ? 2 : S.division);
    S.seasonReview = {
      season: S.season,
      division: S.division,
      nextDivision: nextDiv,
      rank: myRank,
      pts: tableRow('me') ? tableRow('me').pts : 0,
      outcome: outcome,
      playoffText: poText,
      promoted: promoted.map(function (r) { return { id: r.id, name: rowName(r) }; }),
      relegated: relegated.map(function (r) { return { id: r.id, name: rowName(r) }; }),
      playoff: lines,
      playoffWinner: rowName(po.winner),
      champion1: rowName(r1[0]),
      champion2: rowName(r2[0]),
      tvFrom: DIV_TV[S.division] || 0,
      tvTo: DIV_TV[nextDiv] || 0,
      sponsorFrom: DIV_SPONSOR[S.division] || 1,
      sponsorTo: DIV_SPONSOR[nextDiv] || 1
    };
    return S.seasonReview;
  }

  /* v23 — 시즌 전환: 1군·아카데미 전원 나이 +1, 32세 이상은 피지컬 하락 */
  function ageSeason() {
    var i, p, d, out = { count: 0, rows: [] };
    for (i = 0; i < S.squad.length; i++) {
      p = S.squad[i];
      p.age = (p.age || 20) + 1;
      d = DS.declinePhysical(p);
      if (d) { out.rows.push(d); }
    }
    var y = S.youth;
    if (y && y.intake) {
      for (i = 0; i < y.intake.length; i++) {
        p = y.intake[i];
        p.age = (p.age || 16) + 1;
        d = DS.declinePhysical(p);
        if (d) { out.rows.push(d); }
      }
    }
    out.count = out.rows.length;
    S.ageNotices = out.rows;
    if (out.count) {
      S.log.push('S' + S.season + ' 노화 — ' + out.count + '명 피지컬 하락 (' + out.rows.slice(0, 3).map(function (r) { return r.name; }).join(', ') + (out.count > 3 ? ' 외' : '') + ')');
    }
    return out;
  }

  function newSeason() {
    var rv = ensureSeasonReview();
    var rank = ourRank();
    var prize = S.division === 1
      ? (rank === 1 ? 5200 : (rank === 2 ? 3600 : (rank === 3 ? 2400 : 1400)))
      : (rank === 1 ? 3200 : (rank === 2 ? 2100 : (rank === 3 ? 1400 : 800)));
    var promoBonus = rv && rv.outcome === '승격' ? 2500 : 0;
    var me = tableRow('me');
    S.career.push({
      season: S.season, division: S.division, rank: rank, outcome: rv ? rv.outcome : '',
      p: me.p, w: me.w, d: me.d, l: me.l, gf: me.gf, ga: me.ga, pts: me.pts
    });
    S.money += prize + promoBonus;
    /* 이적: 2부 승격 3팀 ↔ 1부 강등 3팀 */
    var i;
    if (rv) {
      for (i = 0; i < rv.promoted.length; i++) {
        if (rv.promoted[i].id !== 'me') { S.divs[rv.promoted[i].id] = 1; }
      }
      for (i = 0; i < rv.relegated.length; i++) {
        if (rv.relegated[i].id !== 'me') { S.divs[rv.relegated[i].id] = 2; }
      }
      if (rv.nextDivision && rv.nextDivision !== S.division) { S.division = rv.nextDivision; }
    }
    /* v23 — 승격·강등 뒤에도 우리 리그 19 AI + me · 반대 리그 20 AI 정원을 맞춘다 */
    normalizeDivs(S);
    S.season++;
    S.seasonOver = false;
    S.round = 0;
    S.seasonReview = null;
    S.divView = S.division;
    S.table = makeTable(S.division, true);
    S.fixtures = makeFixtures(S.division, true);
    S.otherTable = makeTable(3 - S.division, false);
    S.otherFixtures = makeFixtures(3 - S.division, false);
    S.challengeLeft = 1;
    S.smatchTickets = 3;
    S.smatchStreak = 0;
    /* v23 — 시즌이 바뀌면 전원이 한 살을 먹는다 (32세 이상은 피지컬 하락) */
    var aged = ageSeason();
    S.fans += 120;
    S.morale = clamp(S.morale + 4, 0, 100);
    S.condition = clamp(S.condition + 20, 0, 100);
    for (i = 0; i < DS.TEAMS.length; i++) { DS.TEAMS[i].strength = clamp(DS.TEAMS[i].strength + 1, 52, 94); }
    save();
    var msg = '시즌 ' + S.season + ' 시작 · ' + divName(S.division) + ' 리그';
    if (rv && rv.outcome === '승격') { msg = '시즌 ' + S.season + ' · 1부 리그 승격! 중계권과 스폰서 수입이 올랐습니다'; }
    if (rv && rv.outcome === '강등') { msg = '시즌 ' + S.season + ' · 2부 리그로 강등 · 다시 올라가야 합니다'; }
    if (aged && aged.count) { msg += ' · 노화 ' + aged.count + '명 피지컬 하락'; }
    toast(msg);
    renderAll();
  }

  /* 시즌 결산 모달 — 승격/잔류/강등 결과 · 플레이오프 · 1부 진출 보상 상향 */
  function openSeasonReview() {
    var rv = ensureSeasonReview();
    if (!rv) { return; }
    var i, poHTML = '', proHTML = '', relHTML = '';
    for (i = 0; i < rv.playoff.length; i++) {
      var L = rv.playoff[i];
      poHTML += '<div class="rv-po"><span class="st">' + L.stage + '</span>' +
        '<span class="tm">' + esc(L.home) + '</span>' +
        '<b class="sc">' + L.hs + ' : ' + L.as + '</b>' +
        '<span class="tm away">' + esc(L.away) + '</span>' +
        (L.pk ? '<em>PK</em>' : '') + '</div>';
    }
    for (i = 0; i < rv.promoted.length; i++) { proHTML += '<span class="chip lime">' + esc(rv.promoted[i].name) + '</span>'; }
    for (i = 0; i < rv.relegated.length; i++) { relHTML += '<span class="chip coral">' + esc(rv.relegated[i].name) + '</span>'; }
    var outCls = rv.outcome === '승격' ? 'lime' : (rv.outcome === '강등' ? 'coral' : '');
    var body =
      '<div class="rv-hero"><span class="rv-out ' + outCls + '">' + rv.outcome + '</span>' +
      '<div><b>' + divName(rv.division) + ' 최종 ' + rv.rank + '위 · 승점 ' + rv.pts + '</b>' +
      '<em>' + (rv.division === 2 ? '2부 우승 ' + esc(rv.champion2) : '1부 우승 ' + esc(rv.champion1)) + (rv.playoffText ? ' · ' + rv.playoffText : '') + '</em></div></div>' +
      '<div class="rv-sec"><div class="rv-h">승격 플레이오프 <span>3~6위 · 4강 → 결승</span></div>' + poHTML +
      '<div class="tiny muted" style="margin-top:3px">승격 PO 우승 · ' + esc(rv.playoffWinner) + '</div></div>' +
      '<div class="rv-sec"><div class="rv-h">1부 승격 3팀</div><div class="rv-chips">' + proHTML + '</div></div>' +
      '<div class="rv-sec"><div class="rv-h">2부 강등 3팀</div><div class="rv-chips">' + relHTML + '</div></div>' +
      '<div class="rv-sec"><div class="rv-h">다음 시즌 보상</div>' +
      '<div class="rv-rows">' +
      '<div class="rv-row"><span>중계권</span><b>' + fmt(rv.tvFrom) + ' → ' + fmt(rv.tvTo) + '</b><em>경기당</em></div>' +
      '<div class="rv-row"><span>스폰서 배율</span><b>×' + rv.sponsorFrom + ' → ×' + rv.sponsorTo + '</b><em>1부 상향</em></div>' +
      '<div class="rv-row"><span>리그</span><b>' + divName(rv.division) + ' → ' + divName(rv.nextDivision) + '</b><em>20팀 · 38라운드</em></div>' +
      '</div></div>' +
      '<button class="btn primary wide" style="margin-top:8px" data-act="newseason">새 시즌 시작</button>';
    setSheet('시즌 ' + rv.season + ' 결산 · ' + divName(rv.division), body, 'rv-sheet');
  }

  function renderMatchIdle() {
    var box = document.getElementById('screen-match');
    if (!box) { return; }
    if (DS.Match && DS.Match.running) { return; }
    box.classList.add('idle');
    var next = currentOpponent(), html = '';
    html += '<div class="hero" style="margin-bottom:10px">' +
      '<img class="hero-img" style="height:132px;object-position:70% 45%" src="assets/hero-banner.jpg" alt="">' +
      '<div class="hero-in"><div class="hero-kicker">MATCH CENTER</div>' +
      '<div class="hero-title" style="font-size:17px">90분의 전술, 한 장의 카드</div>' +
      '<div class="hero-sub">모멘텀을 모아 경기를 뒤집으세요</div></div></div>' +
      '<div class="mgr-wrap" data-act="mgrmodal">' + managerHTML('strip') +
      '<span class="mgr-go">감독실 ›</span></div>';
    if (S.seasonOver) {
      html += '<div class="card"><div class="card-head"><b>시즌 종료</b></div><div class="tiny muted">공식전 탭에서 새 시즌을 시작하세요.</div></div>';
    } else if (next) {
      var opp = opponentTeam(next.id);
      var prep = prepareOpp('league');
      html += '<div class="card"><div class="card-head"><b>킥오프 준비</b><span class="meta">' + (S.round + 1) + '라운드</span></div>' +
        '<div class="vs"><div class="vs-team"><canvas data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="38" height="44"></canvas><span class="nm">' + esc(S.club.name) + '</span></div>' +
        '<div class="vs-mid"><b>VS</b><span>' + oppFormation(opp) + ' · ' + DS.tacticStyle(oppManager(opp).tacticStyle).name + '</span></div>' +
        '<div class="vs-team"><canvas data-emblem="' + opp.emblem + '" data-kit="' + opp.kit.shirt + '|' + opp.kit.trim + '" width="38" height="44"></canvas><span class="nm">' + esc(opp.short) + '</span></div></div>' +
        '<div class="kpis" style="margin-bottom:8px"><div class="kpi"><b class="lime">' + xgEstimate(opp.strength).toFixed(1) + '</b><span>xG</span></div>' +
        '<div class="kpi"><b>' + pressLevel() + '</b><span>압박</span></div><div class="kpi"><b class="coral">-' + staminaCost() + '%</b><span>체력</span></div></div>' +
        '<button class="btn primary wide" data-act="kickoff">킥오프</button></div>';
      html += scoutHTML(prep);
    }
    html += '<div class="card"><div class="card-head"><b>조작 안내</b></div>' +
      '<div class="tiny muted" style="line-height:1.75">· <b>모멘텀</b> — 패스·태클·슈팅으로 게이지를 채웁니다.<br>' +
      '· <b>전술 카드</b> — 하단 손패 3장 중 하나를 발동해 피치 AI와 득점 확률을 바꿉니다.<br>' +
      '· <b>배속 · 전술 · 교체</b> — 경기 중 언제든 조작할 수 있습니다.</div></div>';
    box.innerHTML = html;
    paintEmblems(box);
  }

  /* ── v20 ① — 라이브 터치라인 지시 UI (컴팩트 바 + 드로어) ── */
  var TOUCH_GROUPS = [
    { k: 'mentality', label: '공격 성향', opts: [['defensive', '수비적'], ['balanced', '균형'], ['attacking', '공격적'], ['allout', '총공세']] },
    { k: 'pressing', label: '압박 강도', opts: [['low', '낮음'], ['normal', '보통'], ['high', '전방 압박']] },
    { k: 'line', label: '수비 라인', opts: [['deep', '내리기'], ['standard', '표준'], ['high', '올리기']] },
    { k: 'focus', label: '공격 루트', opts: [['balance', '밸런스'], ['left', '좌측'], ['center', '중앙'], ['right', '우측']] }
  ];
  function touchInit() {
    var men = S.tactics === 'defense' ? 'defensive' : (S.tactics === 'attack' ? 'attacking' : (S.tactics === 'allout' ? 'allout' : 'balanced'));
    return { mentality: men, pressing: 'normal', line: 'standard', focus: 'balance' };
  }
  function touchLabelOf(k, v) {
    var i, j, g;
    for (i = 0; i < TOUCH_GROUPS.length; i++) {
      g = TOUCH_GROUPS[i];
      if (g.k !== k) { continue; }
      for (j = 0; j < g.opts.length; j++) { if (g.opts[j][0] === v) { return g.opts[j][1]; } }
    }
    return v;
  }
  function touchSummary(cur) {
    cur = cur || touchInit();
    return touchLabelOf('mentality', cur.mentality) + ' · ' + touchLabelOf('pressing', cur.pressing) + ' · ' +
      touchLabelOf('line', cur.line) + ' · ' + touchLabelOf('focus', cur.focus);
  }
  function touchDrawerHTML() {
    var cur = touchInit(), html = '', i, j, g;
    html += '<div class="mt-head"><b>터치라인 지시</b><button class="mt-x" data-act="touchdrawer" aria-label="닫기">✕</button></div>';
    html += '<div class="mt-groups">';
    for (i = 0; i < TOUCH_GROUPS.length; i++) {
      g = TOUCH_GROUPS[i];
      html += '<div class="mt-g"><span class="mt-lbl">' + g.label + '</span><div class="mt-opts">';
      for (j = 0; j < g.opts.length; j++) {
        html += '<button data-act="touch" data-k="' + g.k + '" data-v="' + g.opts[j][0] + '" class="' + (cur[g.k] === g.opts[j][0] ? 'on' : '') + '">' + g.opts[j][1] + '</button>';
      }
      html += '</div></div>';
    }
    html += '</div><div class="mt-foot">바꾸면 즉시 라인 · 압박 · 루트가 달라집니다</div>';
    return html;
  }
  function updateTouchHud(st) {
    if (!st) { return; }
    var chips = document.getElementById('m-tl-chips');
    if (chips) { chips.textContent = touchSummary(st); }
    var box = document.getElementById('m-touch');
    if (!box) { return; }
    var btns = box.querySelectorAll('button[data-act="touch"]'), i, k, v;
    for (i = 0; i < btns.length; i++) {
      k = btns[i].getAttribute('data-k');
      v = btns[i].getAttribute('data-v');
      btns[i].classList.toggle('on', st[k] === v);
    }
  }

  function renderMatchLive(oppTeam, kind) {
    document.body.classList.add('in-match');
    var box = document.getElementById('screen-match');
    if (box) { box.classList.remove('idle'); }
    box.innerHTML =
      '<div class="m-top">' +
      '<div class="mt-team home"><canvas data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="20" height="24"></canvas>' +
      '<span class="mt-name">' + esc(S.club.name) + '</span></div>' +
      '<div class="mt-mid"><div class="mt-score"><b id="m-gf">0</b><i>:</i><b id="m-ga">0</b></div>' +
      '<span class="mt-clock" id="m-clock">00\'</span></div>' +
      '<div class="mt-team away"><canvas data-emblem="' + oppTeam.emblem + '" data-kit="' + oppTeam.kit.shirt + '|' + oppTeam.kit.trim + '" width="20" height="24"></canvas>' +
      '<span class="mt-name">' + esc(oppTeam.short) + '</span></div>' +
      '<div class="mt-tools">' +
      '<button class="tbtn ico" data-act="mute" id="m-mute" title="음소거">' +
      ((DS.Match && DS.Match.isMuted && DS.Match.isMuted()) ? '🔇' : '🔊') + '</button>' +
      '<button class="tbtn" data-act="auto" id="m-auto" title="자동 개입">자동</button>' +
      '<div class="seg mini" id="m-speeds">' +
      '<button data-act="speed" data-v="1" class="on">×1</button>' +
      '<button data-act="speed" data-v="2">×2</button>' +
      '<button data-act="speed" data-v="3">×3</button></div>' +
      '<button class="tbtn ico" data-act="pause" id="m-pause">Ⅱ</button>' +
      '<button class="tbtn danger" data-act="exitmatch">나가기</button>' +
      '</div></div>' +

      '<div class="m-body">' +
      '<div class="m-pitch-col"><div class="pitch-wrap">' +
      '<canvas id="m-pitch"></canvas>' +
      '<div class="sit" id="m-sit"><i></i><b>킥오프</b><span>경기 시작</span></div>' +
      '<div id="m-banner" class="goal-banner"></div>' +
      /* v25 — 피치 위 활성 전술카드 스트립 (남은 시간 게이지) */
      '<div class="tac-strip" id="m-tacstrip"></div>' +
      '</div>' +
      /* v21b ③ — 피치 아래 실시간 선발 11인 체력·평점 바 (높은 화면에서만 펼침) */
      '<div class="m-squad off" id="m-squad"><div class="ms-head"><b>선발 11인</b><span>체력 · 평점</span></div>' +
      '<div class="ms-grid" id="m-squad-grid"></div></div>' +
      '</div>' +

      '<aside class="m-side">' +
      '<div class="mom">' +
      '<div class="mom-top"><b>MOMENTUM</b><span class="uses" id="m-uses">개입 6/6</span>' +
      '<span class="val"><span id="m-mom-val">0</span><small>/100</small></span></div>' +
      /* v21b ⑤ — 손패 카드 발동 기준 눈금 (게이지 위 숫자 · 바 위 틱) */
      '<div class="mom-scale" id="m-mom-scale"></div>' +
      '<div class="mom-bar"><i id="m-mom-fill"></i><span class="mom-ticks" id="m-mom-ticks"></span></div>' +
      '<div class="mom-hint" id="m-mom-hint">모멘텀을 모으면 카드가 열립니다</div>' +
      '<div class="mom-buffs" id="m-buffs"></div>' +
      '</div>' +
      '<div class="hand v7" id="m-hand"></div>' +
      '<div class="m-live" id="m-live">' +
      '<div class="lv-row"><span class="lv-lbl">점유</span><span class="lv-bar"><i id="m-poss"></i></span><b id="m-poss-v">50%</b></div>' +
      '<div class="lv-row"><span class="lv-lbl">슈팅</span><b class="lv-shots" id="m-shots">0 <em>:</em> 0</b><span class="lv-min" id="m-min">0\'</span></div>' +
      '<div class="lv-row"><span class="lv-lbl">유효</span><b class="lv-shots" id="m-ont">0 <em>:</em> 0</b><span class="lv-xg" id="m-xg">xG 0.0 : 0.0</span></div>' +
      '<div class="lv-rate" id="m-rate"></div>' +
      '<div class="lv-tired none" id="m-tired">체력 40% 이하 없음</div>' +
      '</div>' +
      /* v20 ① — 라이브 터치라인 지시: 한 줄 요약 + 탭하면 열리는 지시판 */
      '<div class="m-tac"><button class="tl-strip" id="m-tl-strip" data-act="touchdrawer">' +
      '<span class="tl-lbl">지시</span><span class="tl-chips" id="m-tl-chips">' + esc(touchSummary()) + '</span><span class="tl-go">조작 ›</span></button></div>' +
      '<div class="m-acts"><button class="btn dark sm wide" data-act="subs">선수 교체</button></div>' +
      '<div class="m-touch" id="m-touch">' + touchDrawerHTML() + '</div>' +
      '</aside></div>' +

      '<div class="m-ticker">' +
      '<span class="tk-lbl on" id="m-tk-cast">🎙 캐스터</span>' +
      '<span class="tk-lbl exp" id="m-tk-exp">🎧 해설</span>' +
      '<div class="cmt-body" id="m-comm-body"></div>' +
      '<span class="tk-mgr">👔 ' + esc(mgr().name) + ' · <b class="tk-style">' + esc(DS.tacticStyle(mgr().tacticStyle).name) + '</b> · ' + esc(S.formation) + '</span>' +
      '</div>';
    paintEmblems(box);
    var hand = document.getElementById('m-hand');
    if (hand) { hand.innerHTML = '<div class="tiny" style="color:rgba(233,244,221,.4)">카드를 불러오는 중…</div>'; }
  }

  function updateHud(st) {
    var now = Date.now();
    if (now - hudStamp < 150) { return; }
    hudStamp = now;
    var val = document.getElementById('m-mom-val');
    var fill = document.getElementById('m-mom-fill');
    if (val) { val.textContent = st.momentum; }
    if (fill) { fill.style.width = st.momentum + '%'; }
    updateMomentumGuide(st);
    updateLiveSquad(st);
    var buffs = document.getElementById('m-buffs');
    if (buffs) {
      var html = '', i, b2;
      for (i = 0; i < st.buffs.length; i++) {
        b2 = st.buffs[i];
        html += '<span class="buffchip v25" style="--bc:' + (b2.color || '#c8f169') + '">' +
          '<b>' + esc(b2.tag || '') + '</b>' + esc(b2.name || b2.key) + ' <em>' + b2.left + 's</em>' +
          '<span class="bc-bar"><i style="width:' + (b2.pct == null ? 100 : b2.pct) + '%"></i></span></span>';
      }
      buffs.innerHTML = html;
    }
    /* v25 — 피치 위 활성 전술 스트립: 카드가 살아 있는 동안 계속 보이고, 게이지가 줄어든다 */
    var strip = document.getElementById('m-tacstrip');
    if (strip) {
      if (!st.buffs || !st.buffs.length) {
        if (strip.className !== 'tac-strip') { strip.className = 'tac-strip'; strip.innerHTML = ''; strip.removeAttribute && strip.removeAttribute('data-sig'); }
      } else {
        var stripSig = st.buffs.map(function (x) { return x.key; }).join(',');
        if (strip.getAttribute('data-sig') !== stripSig) {
          var sh = '', si;
          for (si = 0; si < st.buffs.length; si++) {
            b2 = st.buffs[si];
            sh += '<div class="tac-pill" style="--pc:' + (b2.color || '#c8f169') + '">' +
              '<i class="d"></i><b>' + esc(b2.name || b2.key) + '</b>' +
              (b2.ace ? '<span class="ace">' + esc(b2.ace) + '</span>' : '') +
              '<u>' + b2.left + 's</u>' +
              '<span class="pbar"><i style="width:' + (b2.pct == null ? 100 : b2.pct) + '%"></i></span></div>';
          }
          strip.innerHTML = sh;
          strip.setAttribute('data-sig', stripSig);
        } else {
          var bars = strip.querySelectorAll('.pbar > i'), tus = strip.querySelectorAll('u'), bi;
          for (bi = 0; bi < bars.length && bi < st.buffs.length; bi++) {
            bars[bi].style.width = (st.buffs[bi].pct == null ? 100 : st.buffs[bi].pct) + '%';
            if (tus[bi]) { tus[bi].textContent = st.buffs[bi].left + 's'; }
          }
        }
        strip.className = 'tac-strip on';
      }
    }
    var usesEl = document.getElementById('m-uses');
    if (usesEl) {
      usesEl.textContent = '개입 ' + (st.usesLeft === undefined ? 6 : st.usesLeft) + '/' + (st.limit || 6);
      usesEl.classList.toggle('out', st.usesLeft === 0);
    }
    /* v9 — 실시간 미니 스탯 */
    if (st.poss) {
      var possEl = document.getElementById('m-poss');
      var possV = document.getElementById('m-poss-v');
      if (possEl) { possEl.style.width = st.poss[0] + '%'; }
      if (possV) { possV.textContent = st.poss[0] + '%'; }
      var shotsEl = document.getElementById('m-shots');
      if (shotsEl) { shotsEl.innerHTML = st.shots[0] + ' <em>:</em> ' + st.shots[1]; }
      var onEl = document.getElementById('m-ont');
      if (onEl && st.onTarget) { onEl.innerHTML = st.onTarget[0] + ' <em>:</em> ' + st.onTarget[1]; }
      var xgEl = document.getElementById('m-xg');
      if (xgEl && st.xg) { xgEl.textContent = 'xG ' + st.xg[0].toFixed(1) + ' : ' + st.xg[1].toFixed(1); }
      var rateEl = document.getElementById('m-rate');
      if (rateEl && st.ratings) {
        var rh = '', ri2, rx;
        for (ri2 = 0; ri2 < st.ratings.top.length; ri2++) {
          rx = st.ratings.top[ri2];
          rh += '<span class="rt high">' + esc(rx.name) + ' ' + rx.rating.toFixed(1) + '</span>';
        }
        for (ri2 = 0; ri2 < st.ratings.low.length; ri2++) {
          rx = st.ratings.low[ri2];
          if (rx.rating >= 6.3) { continue; }
          rh += '<span class="rt low">' + esc(rx.name) + ' ' + rx.rating.toFixed(1) + '</span>';
        }
        var rsig = rh;
        if (rateEl.getAttribute('data-sig') !== rsig) {
          rateEl.setAttribute('data-sig', rsig);
          rateEl.innerHTML = rh;
        }
      }
      var minEl = document.getElementById('m-min');
      if (minEl) { minEl.textContent = (st.minute || 0) + "'"; }
      var tiredEl = document.getElementById('m-tired');
      if (tiredEl) {
        var sig = (st.tired || []).map(function (x) { return x.name + x.stam; }).join(',');
        if (tiredEl.getAttribute('data-sig') !== sig) {
          tiredEl.setAttribute('data-sig', sig);
          if (!st.tired || !st.tired.length) {
            tiredEl.className = 'lv-tired none';
            tiredEl.innerHTML = '체력 40% 이하 없음';
          } else {
            var th = '<b>체력 경고 ' + st.tired.length + '명</b>';
            for (var ti = 0; ti < st.tired.length && ti < 3; ti++) {
              var tt = st.tired[ti];
              th += '<span class="lv-chip' + (tt.stam < 25 ? ' hot' : '') + '">' + esc(tt.name) + ' ' + tt.stam + '%</span>';
            }
            if (st.tired.length > 3) { th += '<span class="lv-more">+' + (st.tired.length - 3) + '</span>'; }
            tiredEl.className = 'lv-tired';
            tiredEl.innerHTML = th;
          }
        }
      }
    }
    var hand = document.getElementById('m-hand');
    if (hand) {
      var sig = st.hand.map(function (c) { return c.key; }).join(',') + '|' + (st.usesLeft === 0 ? 'x' : '');
      if (sig !== hand.getAttribute('data-sig')) {
        var h = '', i, c;
        for (i = 0; i < st.hand.length; i++) {
          c = st.hand[i];
          h += '<button class="tcard v7" style="--cc:' + c.color + '" data-act="playcard" data-k="' + c.key + '">' +
            '<span class="tc-face">' + DS.tacticArtHTML(c.key) + '</span>' +
            '<span class="tc-main"><span class="tag">' + c.tag + '</span><span class="nm">' + c.name + '</span>' +
            '<span class="tc-desc">' + c.desc + '</span><span class="cd"></span></span>' +
            '<span class="cost"><em>' + c.cost + '</em> M</span>' +
            '</button>';
        }
        hand.innerHTML = h;
        hand.setAttribute('data-sig', sig);
      }
      var btns = hand.querySelectorAll('.tcard'), j, b, cd;
      for (j = 0; j < st.hand.length && j < btns.length; j++) {
        b = btns[j]; c = st.hand[j];
        var noUse = st.usesLeft === 0;
        b.disabled = noUse || !c.ready;
        b.classList.toggle('ready', !noUse && !!c.ready);
        b.classList.toggle('locked', noUse || !c.ready);
        cd = b.querySelector('.cd');
        cd.textContent = noUse ? '이번 경기 개입 완료' : (c.cooldown > 0 ? ('재장전 ' + c.cooldown + 's') : '');
      }
    }
  }

  /* v22 ⑤ — 모멘텀 눈금 라벨(22M · 30M · 34M …)이 가까울 때 서로 겹치지 않게 배치한다.
     실제 글자 폭을 재서 좌우 3px 여유를 두고 줄을 나누고(r0·r1·r2), 세 줄로도 자리가 없으면
     오른쪽으로 밀어 최소 간격을 지킨다. */
  function layoutMomScale(scale) {
    var labels = scale.querySelectorAll('b'), i, j, r;
    if (!labels.length) { return; }
    var w = scale.clientWidth || 0;
    if (w < 40) { w = 220; }
    var rows = [[], [], []], used = 0;
    for (i = 0; i < labels.length; i++) {
      var el = labels[i];
      var pct = parseFloat(el.getAttribute('data-c')) || 0;
      var lw = el.offsetWidth || 22;
      var cx = w * pct / 100;
      var left = cx - lw / 2, right = cx + lw / 2;
      if (left < 1) { left = 1; right = left + lw; }
      if (right > w - 1) { right = w - 1; left = right - lw; if (left < 1) { left = 1; } }
      var placed = -1;
      for (r = 0; r < rows.length && placed < 0; r++) {
        var ok = true;
        for (j = 0; j < rows[r].length; j++) {
          if (left < rows[r][j][1] + 3 && right > rows[r][j][0] - 3) { ok = false; break; }
        }
        if (ok) { rows[r].push([left, right]); placed = r; }
      }
      if (placed < 0) {
        var last = rows[2][rows[2].length - 1];
        var nl = last ? Math.min(w - lw - 1, last[1] + 3) : left;
        if (nl < 1) { nl = 1; }
        rows[2].push([nl, nl + lw]);
        placed = 2;
      }
      if (placed + 1 > used) { used = placed + 1; }
      var finalLeft = ((left + right) / 2) / w * 100;
      if (placed >= 0 && rows[placed][rows[placed].length - 1][0] !== left) {
        var rw = rows[placed][rows[placed].length - 1];
        finalLeft = ((rw[0] + rw[1]) / 2) / w * 100;
      }
      el.className = 'r' + placed;
      el.style.left = finalLeft.toFixed(2) + '%';
    }
    scale.style.height = used >= 3 ? '31px' : (used === 2 ? '21px' : '11px');
    scale.setAttribute('data-w', String(w));
  }

  /* v21b ⑤ — 손패 카드들의 발동 기준(코스트)을 게이지 위 눈금과 틱으로 보여주고,
     지금 모멘텀에서 가장 싼 카드까지 얼마나 남았는지 한 줄로 안내한다. */
  function updateMomentumGuide(st) {
    var scale = document.getElementById('m-mom-scale');
    var ticks = document.getElementById('m-mom-ticks');
    var hint = document.getElementById('m-mom-hint');
    if (!ticks && !scale && !hint) { return; }
    var costs = [], i, c;
    for (i = 0; i < st.hand.length; i++) {
      c = st.hand[i].cost;
      if (costs.indexOf(c) < 0) { costs.push(c); }
    }
    costs.sort(function (a, b) { return a - b; });
    var sig = costs.join(',');
    if (ticks && ticks.getAttribute('data-costs') !== sig) {
      var th = '', t;
      for (t = 0; t < costs.length; t++) {
        th += '<b data-c="' + costs[t] + '" style="left:' + costs[t] + '%"></b>';
      }
      ticks.innerHTML = th;
      ticks.setAttribute('data-costs', sig);
    }
    if (scale && (scale.getAttribute('data-costs') !== sig || scale.getAttribute('data-w') !== String(scale.clientWidth))) {
      var sh = '';
      for (t = 0; t < costs.length; t++) {
        sh += '<b data-c="' + costs[t] + '" style="left:' + costs[t] + '%">' + costs[t] + '<i>M</i></b>';
      }
      scale.innerHTML = sh;
      scale.setAttribute('data-costs', sig);
      layoutMomScale(scale);
    }
    /* 지금 바로 누를 수 있는 카드 중 가장 싼 코스트 */
    var next = null;
    for (i = 0; i < st.hand.length; i++) {
      if (st.hand[i].cooldown > 0) { continue; }
      if (next === null || st.hand[i].cost < next) { next = st.hand[i].cost; }
    }
    var nodes = ticks ? ticks.querySelectorAll('b') : [], n;
    for (n = 0; n < nodes.length; n++) {
      var cv = +nodes[n].getAttribute('data-c');
      nodes[n].className = (next !== null && cv === next && st.momentum < cv) ? 'next' : (st.momentum >= cv ? 'on' : '');
    }
    if (hint) {
      var ht, cls = 'mom-hint';
      if (st.usesLeft === 0) { ht = '이번 경기 개입 완료'; cls += ' done'; }
      else if (next === null) { ht = '카드 재장전 중…'; }
      else if (st.momentum >= next) { ht = '지금 발동 가능 · 최소 ' + next + 'M'; cls += ' ready'; }
      else { ht = '다음 카드까지 -' + (next - st.momentum) + 'M · ' + next + 'M'; cls += ' next'; }
      if (hint.getAttribute('data-t') !== ht) { hint.textContent = ht; hint.setAttribute('data-t', ht); }
      hint.className = cls;
    }
  }

  /* v21b ③ — 선발 11인 체력·평점 (넓은 화면에서 피치 아래를 채운다) */
  function updateLiveSquad(st) {
    var box = document.getElementById('m-squad-grid');
    if (!box || !st.pitch) { return; }
    var sig = st.pitch.map(function (p) { return p.name + p.stam + p.rating; }).join('|');
    if (box.getAttribute('data-sig') === sig) { return; }
    box.setAttribute('data-sig', sig);
    var html = '', i, p, tone;
    for (i = 0; i < st.pitch.length; i++) {
      p = st.pitch[i];
      tone = p.stam <= 30 ? ' hot' : (p.stam <= 50 ? ' warn' : '');
      html += '<div class="ms-card' + tone + '">' +
        '<span class="ms-face">' + (p.face ? '<img src="' + p.face + '" alt="">' : '') + '</span>' +
        '<span class="ms-tx"><b>' + esc(p.name) + '</b><em>' + p.pos + ' · ' + p.stam + '%</em></span>' +
        '<span class="ms-bar"><i style="width:' + Math.max(2, Math.min(100, p.stam)) + '%"></i></span>' +
        '<b class="ms-rt" title="평점">' + p.rating.toFixed(1) + '<em>평점</em></b></div>';
    }
    box.innerHTML = html;
  }

  /* ═════════════════  교체 ═════════════════ */
  /* v25 — 교체창 포지션 적성: 지금 내보낼 선수의 자리(pos)에 벤치 선수가 얼마나 맞는지 */
  function posFitOf(playerPos, slotPos) {
    if (!playerPos || !slotPos) { return null; }
    if (playerPos === slotPos) { return { m: '◎', l: '완전', c: 'f1' }; }
    var gp = DS.posGroup(playerPos), gs = DS.posGroup(slotPos);
    var lp = playerPos.charAt(0), ls = slotPos.charAt(0);
    var sideOk = lp === ls || lp === 'C' || ls === 'C';
    if (gp === gs) { return sideOk ? { m: '○', l: '적합', c: 'f2' } : { m: '△', l: '반대발', c: 'f3' }; }
    if ((gp === 'DF' && gs === 'MF') || (gp === 'MF' && gs === 'DF') || (gp === 'MF' && gs === 'FW') || (gp === 'FW' && gs === 'MF')) {
      return { m: '△', l: '인접', c: 'f3' };
    }
    return { m: '×', l: '부적합', c: 'f4' };
  }

  function openSubs(halftime) {
    subHalf = !!halftime;
    if (!halftime && DS.Match && DS.Match.running && DS.Match.pause) { DS.Match.pause(); }
    var st = DS.Match && DS.Match.subState ? DS.Match.subState() : null;
    if (!st) { return; }
    var ov = document.getElementById('m-overlay');
    if (!ov) { return; }
    var outHTML = '', inHTML = '', i, it;
    for (i = 0; i < st.onPitch.length; i++) {
      it = st.onPitch[i];
      outHTML += '<button class="sub-item' + (subState.outId === it.id ? ' on' : '') + (it.off ? ' off' : '') + '" data-act="subpick" data-side="out" data-id="' + it.id + '" ' + (it.off ? 'disabled' : '') + '>' +
        '<span class="sp">' + it.role + '</span><span class="sn">' + esc(it.name) + '</span><span class="sr">' + it.rating + '</span></button>';
    }
    /* 선택된 OUT 선수의 자리에 대한 적성 표시 */
    var outPos = null, k2;
    for (k2 = 0; k2 < st.onPitch.length; k2++) { if (st.onPitch[k2].id === subState.outId) { outPos = st.onPitch[k2]; } }
    for (i = 0; i < st.bench.length; i++) {
      it = st.bench[i];
      var fit = outPos ? posFitOf(it.pos, outPos.pos) : null;
      inHTML += '<button class="sub-item' + (subState.inId === it.id ? ' on' : '') + (it.used ? ' off' : '') + '" data-act="subpick" data-side="in" data-id="' + it.id + '" ' + (it.used ? 'disabled' : '') + '>' +
        '<span class="sp">' + it.pos + '</span><span class="sn">' + esc(it.name) + '</span>' +
        (fit ? '<span class="sf ' + fit.c + '" title="' + fit.l + '">' + fit.m + '</span>' : '') +
        '<span class="sr">' + it.rating + '</span></button>';
    }
    ov.innerHTML = '<div class="sub-panel">' +
      '<div class="sub-head"><b>선수 교체</b><span>남은 교체 ' + st.subsLeft + '/' + (st.subsMax || 5) + '회 · 최대 5회 · 벤치 ' + st.bench.length + '명' + (halftime ? ' · 하프타임' : '') + '</span></div>' +
      '<div class="sub-min">현재 ' + st.minute + '분 · 스코어 ' + st.score + '</div>' +
      '<div class="sub-cols"><div><div class="sub-title">OUT · 선발</div><div class="sub-list">' + outHTML + '</div></div>' +
      '<div><div class="sub-title">IN · 벤치</div><div class="sub-list">' + inHTML + '</div></div></div>' +
      '<div class="sub-btns"><button class="btn ghost" data-act="subclose">' + (halftime ? '그대로 후반' : '닫기') + '</button>' +
      '<button class="btn primary" data-act="subconfirm" ' + (!subState.inId || !subState.outId ? 'disabled' : '') + '>투입</button></div>' +
      (halftime ? '<button class="btn dark wide" style="margin-top:5px" data-act="halftime2">후반 시작</button>' : '') +
      '</div>';
    ov.classList.add('on');
  }
  function closeSubs() {
    var ov = document.getElementById('m-overlay');
    if (ov) { ov.classList.remove('on'); }
    subState.inId = null; subState.outId = null;
  }

  /* ═════════════════  탭 · 렌더 ═════════════════ */
  function setTab(tab) {
    var sec = document.getElementById('screen-' + tab);
    if (!sec) { return; }
    currentTab = tab;
    var i, secs = document.querySelectorAll('.screen'), btns = document.querySelectorAll('.tabbar button');
    for (i = 0; i < secs.length; i++) { secs[i].classList.toggle('on', secs[i].id === 'screen-' + tab); }
    var active = tab === 'match' ? 'home' : tab;
    for (i = 0; i < btns.length; i++) { btns[i].classList.toggle('on', btns[i].getAttribute('data-tab') === active); }
    var main = document.getElementById('main');
    if (main) { main.scrollTop = 0; }
    if (tab !== 'match') { document.body.classList.remove('in-match'); }
    renderAll();
    /* v21b ⑥ — 마이팀·클럽을 둘러보면 가이드 단계가 완료된다 */
    if (tab === 'squad') { guideMark('team'); }
    else if (tab === 'club') { guideMark('club'); }
  }

  function renderAll() {
    renderHeader();
    if (currentTab === 'home') { renderHome(); }
    else if (currentTab === 'smatch') { renderSmatch(); }
    else if (currentTab === 'squad') { renderSquad(); }
    else if (currentTab === 'club') { renderClub(); }
    else if (currentTab === 'shop') { renderShop(); }
    else if (currentTab === 'match') { renderMatchIdle(); }
  }

  /* ═════════════════  액션 ═════════════════ */
  function doFormation(f) {
    if (!DS.FORMATIONS[f]) { return; }
    S.formation = f;
    S.lineup = autoLineup(S.squad, f);
    S.bench = autoBench(S.squad, S.lineup);
    selId = null;
    autoRoles();
    save();
    renderAll();
    toast(f + ' · ' + DS.FORMATIONS[f].tag + ' 적용');
  }

  function swapSlot(fromId, slot) {
    var cur = S.lineup[slot], i;
    var benchIdx = -1, lineIdx = -1;
    for (i = 0; i < S.bench.length; i++) { if (S.bench[i] === fromId) { benchIdx = i; } }
    for (i = 0; i < S.lineup.length; i++) { if (S.lineup[i] === fromId) { lineIdx = i; } }
    if (lineIdx >= 0) {
      S.lineup[lineIdx] = cur;
      S.lineup[slot] = fromId;
    } else if (benchIdx >= 0) {
      S.bench[benchIdx] = cur;
      S.lineup[slot] = fromId;
    } else {
      S.lineup[slot] = fromId;
    }
    selId = null;
    autoRoles();
    save();
    renderAll();
    toast('자리를 바꿨습니다.');
  }

  function doFacility(key) {
    var fac = DS.facilityOf(key);
    if (!fac) { return; }
    var lv = S.facilities[key] || 0;
    if (lv >= 5) { toast('이미 최고 레벨입니다.'); return; }
    var cost = DS.facilityCost(fac, lv);
    if (S.money < cost) { toast('금화가 부족합니다.'); return; }
    S.money -= cost;
    S.facilities[key] = lv + 1;
    if (key === 'cafe') { S.morale = clamp(S.morale + 3, 0, 100); }
    save();
    renderAll();
    toast(fac.name + ' Lv.' + (lv + 1) + (lv === 0 ? ' 건설 완료' : ' 강화 완료'));
  }

  function doTrain() {
    var p = byId(trainSel.playerId);
    if (!p || trainSel.menus.length !== 2) { toast('선수와 훈련 2개를 선택하세요.'); return; }
    var cost = 300 + p.level * 120;
    if (S.money < cost) { toast('금화가 부족합니다.'); return; }
    S.money -= cost;
    p.level++;
    var gain = { s: 0, t: 0, p: 0, cap: 0, fk: 0, ck: 0 }, i, m, k;
    for (i = 0; i < 2; i++) {
      m = DS.trainMenuOf(trainSel.menus[i]);
      for (k in m.gain) { if (m.gain.hasOwnProperty(k)) { gain[k] += m.gain[k]; } }
    }
    var combo = DS.findCombo(trainSel.menus[0], trainSel.menus[1]);
    if (combo) {
      for (k in combo.gain) { if (combo.gain.hasOwnProperty(k)) { gain[k] += combo.gain[k]; } }
      p.skill = combo.skill;
      if (S.combos.indexOf(combo.skill) < 0) { S.combos.push(combo.skill); }
      if (!p.trained) { p.trained = []; }
      if (p.trained.indexOf(combo.name) < 0) { p.trained.push(combo.name); }
    }
    var bonus = facValue('training');
    if (bonus > 0 && chance(bonus / 100)) { gain[pick(['s', 't', 'p'])] += 1; }
    p.s = clamp(p.s + gain.s, 1, 10);
    p.t = clamp(p.t + gain.t, 1, 10);
    p.p = clamp(p.p + gain.p, 1, 10);
    p.set.cap = clamp(p.set.cap + gain.cap, 1, 10);
    p.set.fk = clamp(p.set.fk + gain.fk, 1, 10);
    p.set.ck = clamp(p.set.ck + gain.ck, 1, 10);
    p.stats = DS.statSheet(p);
    trainSel.menus = [];
    save();
    renderAll();
    toast(combo ? '특훈 콤보 ' + combo.name + ' · ' + p.name + ' 각성' : p.name + ' 특훈 완료 (Lv.' + p.level + ')');
  }

  function doEvolve(p, key) {
    var r = DS.roleOf(key);
    if (!p || !r) { return; }
    if ((p.level || 0) < r.need) { toast('Lv.' + r.need + ' 이상이어야 합니다.'); return; }
    if (S.money < EVO_COST) { toast('금화가 부족합니다.'); return; }
    S.money -= EVO_COST;
    p.role = key;
    var g = r.gain;
    if (g.s) { p.s = clamp(p.s + g.s, 1, 10); }
    if (g.t) { p.t = clamp(p.t + g.t, 1, 10); }
    if (g.p) { p.p = clamp(p.p + g.p, 1, 10); }
    p.stats = DS.statSheet(p);
    if (g.atk) { p.stats.atk = clamp(p.stats.atk + g.atk, 10, 99); }
    if (g.def) { p.stats.def = clamp(p.stats.def + g.def, 10, 99); }
    if (g.pass) { p.stats.spd = clamp(p.stats.spd + 1, 10, 99); }
    save();
    closeModal();
    renderAll();
    toast(p.name + ' → ' + r.name + ' 진화 완료');
  }

  function doScoutNormal() {
    if (S.money < 600) { toast('금화가 부족합니다.'); return; }
    if (S.squad.length >= MAX_SQUAD) { toast('선수단이 가득 찼습니다. IN/OUT으로 교환하세요.'); return; }
    S.money -= 600;
    var p = DS.makePlayer({ rarity: DS.pickRarity('normal') });
    p.pic = DS.nextFreePic(S.squad, p.pos);
    S.squad.push(p);
    EXTRA[p.id] = p;
    S.dex.players[p.name] = 1;
    S.bench = autoBench(S.squad, S.lineup);
    save();
    renderAll();
    toast(DS.RARITY[p.rarity].name + ' 등급 ' + p.name + ' 영입');
  }

  function doScoutConfirm() {
    var cand = byId(ioState.candId);
    var outP = byId(ioState.outId);
    if (!cand || !outP) { toast('방출할 선수를 선택하세요.'); return; }
    if (S.money < CAND_COST) { toast('금화가 부족합니다.'); return; }
    S.money -= CAND_COST;
    var li = S.lineup.indexOf(outP.id), bi = S.bench.indexOf(outP.id);
    if (li >= 0) { S.lineup[li] = cand.id; }
    if (bi >= 0) { S.bench[bi] = cand.id; }
    S.squad = S.squad.filter(function (x) { return x.id !== outP.id; });
    ensureUniquePic(cand);
    S.squad.push(cand);
    delete EXTRA[cand.id];
    S.dex.players[cand.name] = 1;
    if (S.roles.cap === outP.id || S.roles.fk === outP.id || S.roles.ck === outP.id || S.roles.pk === outP.id) { autoRoles(); }
    S.scoutCandidates = S.scoutCandidates.filter(function (x) { return x.id !== cand.id; });
    /* v15 — 천장(마일리지): 스페셜 영입 1회당 +1, 30 도달 시 다음 영입은 레전드 확정 */
    if (cand.guaranteed) {
      S.scoutPity = 0;
    } else {
      S.scoutPity = Math.min(30, (S.scoutPity || 0) + 1);
    }
    if (!S.scoutCandidates.length || (S.scoutPity >= 30 && !S.scoutCandidates.some(function (x) { return x.guaranteed; }))) {
      rollScout();
    }
    save();
    closeModal();
    renderAll();
    toast('IN ' + cand.name + ' / OUT ' + outP.name);
  }

  function onAction(act, t) {
    var id, v, j;
    if (!act) { return; }
    if (act === 'closemodal') {
      closeModal();
      /* v22 — 시즌 최종전 결과서를 닫으면 시즌 결산 모달을 한 번 이어서 보여준다 */
      if (S.seasonOver && S.seasonReview && !S.seasonReview.seen) {
        S.seasonReview.seen = 1;
        save();
        global.setTimeout(openSeasonReview, 200);
      }
      return;
    }
    if (act === 'maptab' || act === 'mapside') {
      /* v19 ④ — 상세 결과서 미니피치 탭 · 홈/원정 토글 */
      var mcard = t;
      while (mcard && (!mcard.getAttribute || mcard.getAttribute('data-rmap') !== '1')) { mcard = mcard.parentNode; }
      if (!mcard || !mcard.setAttribute) { return; }
      var isTab = act === 'maptab';
      var mval = isTab ? t.getAttribute('data-map') : t.getAttribute('data-side');
      if (!mval) { return; }
      mcard.setAttribute(isTab ? 'data-mapmode' : 'data-mapside', mval);
      var mkey = isTab ? 'data-map' : 'data-side';
      var mbase = isTab ? 'rmap-tab' : 'rmap-side';
      var mlist = mcard.querySelectorAll ? mcard.querySelectorAll('.' + mbase) : [];
      var mi;
      for (mi = 0; mi < mlist.length; mi++) {
        mlist[mi].className = mbase + (mlist[mi].getAttribute(mkey) === mval ? ' on' : '');
      }
      paintShotMaps(document.getElementById('modal'));
      return;
    }
    if (act === 'tab') { closeModal(); setTab(t.getAttribute('data-tab')); return; }
    /* v21b ⑥ — 초보자 가이드: 열기 / 접기 / 다시 보지 않기 */
    if (act === 'guidego') { var gtab = t.getAttribute('data-tab'); if (gtab) { closeModal(); setTab(gtab); } return; }
    if (act === 'guidefold') { guideState().open = false; save(); renderHome(); return; }
    if (act === 'guideopen') { guideState().open = true; save(); renderHome(); return; }
    if (act === 'guidehide') { var gs = guideState(); gs.hidden = true; gs.open = false; save(); renderHome(); return; }

    if (act === 'player') { id = t.getAttribute('data-id'); var pp = byId(id); if (pp) { playerModal(pp); } return; }
    if (act === 'backup') { id = t.getAttribute('data-id'); if (selId) { swapSlot(id, findBestSlot(id)); return; } var bp = byId(id); if (bp) { playerModal(bp); } return; }

    if (act === 'formation') { doFormation(t.getAttribute('data-f')); return; }

    if (act === 'mgrmodal') { managerRoom(); return; }
    if (act === 'mgrset') {
      id = t.getAttribute('data-id');
      if (!id || S.managers.indexOf(id) < 0) { return; }
      S.manager = id; save(); renderAll(); managerRoom();
      toast(DS.managerOf(id).name + ' 감독 선임');
      return;
    }
    if (act === 'mgrsign') {
      var sm = DS.managerOf(t.getAttribute('data-id'));
      if (!sm || S.managers.indexOf(sm.id) >= 0) { return; }
      var mprice = DS.managerPrice(sm);
      if (S.money < mprice) { toast('금화가 부족합니다.'); return; }
      S.money -= mprice;
      S.managers.push(sm.id);
      S.manager = sm.id;
      S.mgrCand = (S.mgrCand || []).filter(function (x) { return x !== sm.id; });
      save(); renderAll(); managerRoom();
      toast(sm.name + ' 감독 영입 · 선임 완료');
      return;
    }
    if (act === 'mgrreroll') {
      if (S.money < REROLL_COST) { toast('금화가 부족합니다.'); return; }
      S.money -= REROLL_COST;
      pickMgrCandidates(); save(); renderAll(); managerRoom();
      toast('감독 후보를 새로 뽑았습니다.');
      return;
    }
    if (act === 'mgrform') {
      closeModal();
      doFormation(mgr().formation);
      return;
    }
    if (act === 'autolineup') {
      S.lineup = autoLineup(S.squad, S.formation);
      S.bench = autoBench(S.squad, S.lineup);
      autoRoles(); selId = null; save(); renderAll();
      toast('최적 라인업으로 자동 배치했습니다.'); return;
    }
    if (act === 'bench') {
      id = t.getAttribute('data-id');
      selId = (selId === id) ? null : id;
      renderSquad();
      if (selId) { toast('피치에서 바꿀 선수를 선택하세요.'); }
      return;
    }
    if (act === 'starter') {
      var slot = parseInt(t.getAttribute('data-slot'), 10);
      id = t.getAttribute('data-id');
      if (selId) { swapSlot(selId, slot); return; }
      if (!id) { toast('빈 자리입니다. 벤치 선수를 먼저 선택하세요.'); return; }
      var sp = byId(id); if (sp) { playerModal(sp); } return;
    }

    if (act === 'deck') { deckModal(); return; }
    if (act === 'deckpick') {
      var dk = t.getAttribute('data-k'), di = deckDraft.indexOf(dk);
      if (di >= 0) { if (deckDraft.length <= 1) { toast('최소 1장은 필요합니다.'); return; } deckDraft.splice(di, 1); }
      else if (deckDraft.length >= 6) { toast('덱은 6장까지입니다. 하나를 빼세요.'); return; }
      else { deckDraft.push(dk); }
      deckModal(); return;
    }
    if (act === 'decksave') {
      if (!deckDraft.length) { return; }
      S.deck = deckDraft.slice();
      save(); closeModal(); renderAll();
      toast('전술 카드 덱 ' + S.deck.length + '장 편성 완료'); return;
    }

    if (act === 'rolesheet') { rolePick = null; roleModal(); return; }
    if (act === 'roleopen') { rolePick = t.getAttribute('data-k'); roleModal(); return; }
    if (act === 'roleset') {
      S.roles[t.getAttribute('data-k')] = t.getAttribute('data-id');
      rolePick = null; save(); renderSquad(); roleModal(); toast('역할을 지정했습니다.'); return;
    }
    if (act === 'autorole') { autoRoles(); save(); renderSquad(); roleModal(); toast('능력치 기준으로 지정했습니다.'); return; }

    if (act === 'uimode') {
      S.uiMode = t.getAttribute('data-v') === 'master' ? 'master' : 'basic';
      save();
      renderSquad();
      toast(S.uiMode === 'master' ? '마스터 모드 · 세부 전술 표시' : '기본 모드 · 간단 표시');
      return;
    }
    if (act === 'evolvelist') { evolveListModal(); return; }
    if (act === 'evolve') { var ep = byId(t.getAttribute('data-id')); if (ep) { evolveModal(ep); } return; }
    if (act === 'evolvepick') { doEvolve(byId(t.getAttribute('data-p')), t.getAttribute('data-k')); return; }

    if (act === 'facility') { doFacility(t.getAttribute('data-k')); return; }
    /* v25 — 컨디션 회복 · 무료 휴식 */
    if (act === 'rest') { restTeam(); return; }
    if (act === 'roletoggle') { clubRoleOpen = !clubRoleOpen; renderClub(); return; }
    if (act === 'condrest') {
      var rested = restTeam();
      var pk = pendingStart ? pendingStart.kind : 'league';
      var po = pendingStart ? pendingStart.opt : {};
      openConditionModal(pk, po);
      if (rested) { toast('회복 완료 · 컨디션 ' + S.condition); }
      return;
    }
    if (act === 'conddrink') {
      if (S.money < 600) { toast('금화가 부족합니다.'); return; }
      S.money -= 600;
      S.condition = clamp(S.condition + 20, 0, 100);
      save(); renderAll();
      openConditionModal(pendingStart ? pendingStart.kind : 'league', pendingStart ? pendingStart.opt : {});
      toast('컨디션 +20 · 현재 ' + S.condition);
      return;
    }
    if (act === 'condclub') { closeModal(); setTab('club'); return; }
    if (act === 'condgo') {
      if (!pendingStart) { closeModal(); return; }
      var ps = pendingStart;
      pendingStart = null;
      closeModal();
      startMatch(ps.kind, ps.opt);
      return;
    }

    /* ── v21: 이적시장 ── */
    if (act === 'sign') { doSignListing(t.getAttribute('data-id')); return; }
    if (act === 'nego') { doNegotiate(t.getAttribute('data-id')); return; }
    if (act === 'list') { doListPlayer(t.getAttribute('data-id')); return; }
    if (act === 'unlist') { doUnlistPlayer(t.getAttribute('data-id')); return; }
    if (act === 'sellnow') { doSellNow(t.getAttribute('data-id')); return; }
    if (act === 'mktrefresh') {
      if (S.money < MKT_REROLL) { toast('자금이 부족합니다.'); return; }
      S.money -= MKT_REROLL;
      S.transfer.listings = DS.makeMarketListings(MKT_SIZE, (S.season || 1) * 1000 + (S.round || 0) + Math.floor(Math.random() * 9000), { round: S.round });
      S.transfer.season = S.season; S.transfer.round = S.round;
      save(); renderShop(); toast('매물을 새로 불러왔습니다.'); return;
    }

    /* ── v21: 유소년 아카데미 ── */
    if (act === 'youthpick') {
      youthSel.id = t.getAttribute('data-id');
      var yp0 = youthById(youthSel.id);
      if (yp0) { youthSel.pos = yp0.pos; }
      renderClub(); return;
    }
    if (act === 'youthpos') { youthSel.pos = t.getAttribute('data-k'); renderClub(); return; }
    if (act === 'youthcoach') { doYouthCoach(); return; }
    if (act === 'youthpromote') { doYouthPromote(youthSel.id); return; }
    if (act === 'youthreserve') { doYouthReserve(t.getAttribute('data-id') || youthSel.id); return; }
    if (act === 'youthsell') { doYouthSell(youthSel.id); return; }
    if (act === 'youthreroll') { doYouthReroll(); return; }
    if (act === 'trainmenu') {
      var key = t.getAttribute('data-k'), idx = trainSel.menus.indexOf(key);
      if (idx >= 0) { trainSel.menus.splice(idx, 1); }
      else if (trainSel.menus.length < 2) { trainSel.menus.push(key); }
      else { trainSel.menus = [trainSel.menus[1], key]; }
      renderClub(); return;
    }
    if (act === 'trainrun') { doTrain(); return; }
    if (act === 'sponsor') {
      var sid = t.getAttribute('data-id'), spn = null, i;
      for (i = 0; i < DS.SPONSORS.length; i++) { if (DS.SPONSORS[i].id === sid) { spn = DS.SPONSORS[i]; } }
      if (!spn || S.fans < spn.fans) { toast('팬 수가 부족합니다.'); return; }
      S.sponsor = sid; save(); renderAll(); toast(spn.name + ' 계약 · 경기당 ' + fmt(spn.bonus)); return;
    }
    if (act === 'kit') {
      S.club.kit.shirt = t.getAttribute('data-c');
      S.club.kit.trim = DS.Art.shade(S.club.kit.shirt, 80);
      S.dex.kits[S.club.kit.shirt] = 1;
      save(); renderAll(); return;
    }
    if (act === 'shorts') { S.club.kit.shorts = t.getAttribute('data-c'); save(); renderAll(); return; }
    if (act === 'emblem') { S.club.emblem = t.getAttribute('data-e'); S.dex.emblems[S.club.emblem] = 1; save(); renderAll(); return; }
    if (act === 'rename') {
      var inp = document.getElementById('club-name-input');
      if (!inp) { return; }
      var name = (inp.value || '').trim();
      if (name.length < 2) { toast('구단명은 2자 이상이어야 합니다.'); return; }
      S.club.name = name.slice(0, 12);
      save(); renderAll(); toast('구단명 변경 완료'); return;
    }

    if (act === 'saveplayer') {
      var pid = t.getAttribute('data-id'), p = byId(pid);
      if (!p) { return; }
      var ni = document.getElementById('pd-name'), nu = document.getElementById('pd-num');
      if (ni) {
        var nm = (ni.value || '').trim();
        if (nm.length < 2) { toast('이름은 2자 이상이어야 합니다.'); return; }
        delete S.dex.players[p.name];
        p.name = nm.slice(0, 8);
        S.dex.players[p.name] = 1;
      }
      if (nu) {
        var no = parseInt(nu.value, 10);
        if (isNaN(no) || no < 1 || no > 99) { toast('등번호는 1~99 사이입니다.'); return; }
        p.number = no;
      }
      save(); playerModal(p); renderAll(); toast('선수 정보를 저장했습니다.'); return;
    }

    if (act === 'scoutpick') {
      var cand = byId(t.getAttribute('data-id'));
      if (!cand) { return; }
      ioState = { candId: cand.id, outId: null };
      scoutModal(cand); return;
    }
    if (act === 'outpick') { ioState.outId = t.getAttribute('data-id'); scoutModal(byId(ioState.candId)); return; }
    if (act === 'scoutconfirm') { doScoutConfirm(); return; }
    if (act === 'reroll') {
      if (S.money < REROLL_COST) { toast('금화가 부족합니다.'); return; }
      S.money -= REROLL_COST; rollScout(); save(); renderAll(); toast('리스트를 갱신했습니다.'); return;
    }
    if (act === 'normalScout') { doScoutNormal(); return; }
    if (act === 'item') {
      var kk = t.getAttribute('data-k');
      if (kk === 'drink') { if (S.money < 600) { toast('금화가 부족합니다.'); return; } S.money -= 600; S.condition = clamp(S.condition + 20, 0, 100); save(); renderAll(); toast('컨디션 +20'); }
      else { if (S.money < 900) { toast('금화가 부족합니다.'); return; } S.money -= 900; S.morale = clamp(S.morale + 12, 0, 100); save(); renderAll(); toast('팀 사기 +12'); }
      return;
    }

    if (act === 'kickoff') {
      /* v17 — 첫 사용자 터치에서 오디오 문을 연다 (모바일 자동재생 정책) */
      if (DS.Match && DS.Match.audioUnlock) { DS.Match.audioUnlock(); }
      startMatch('league'); return;
    }
    if (act === 'challenge') { startMatch('challenge'); return; }
    /* ── v24 — 유저 대전 (비동기 PvP) ── */
    if (act === 'pvpmycode') { pvpMyCodeModal(); return; }
    if (act === 'pvpcopy') {
      var pvWhich = t.getAttribute('data-which');
      var pvField = document.getElementById(pvWhich === 'code' ? 'pvp-code' : 'pvp-link');
      var pvVal = pvField ? pvField.value : '';
      copyText(pvVal, function (ok) {
        toast(ok ? '복사했습니다. 카톡에 붙여넣으세요.' : '복사가 막혔습니다. 입력창을 길게 눌러 직접 복사하세요.');
      });
      return;
    }
    if (act === 'pvpenter') {
      setSheet('상대 구단 코드로 도전',
        '<div class="tiny muted" style="margin-bottom:6px">친구에게 받은 구단 코드나 링크(?vs=)를 붙여넣으세요. 링크 전체를 넣어도 됩니다.</div>' +
        '<textarea class="pvp-input" id="pvp-in" rows="4" spellcheck="false" autocomplete="off" placeholder="DSP1-... 또는 https://...?vs=DSP1-..."></textarea>' +
        '<div class="row" style="gap:5px;margin-top:6px">' +
        '<button class="btn primary" data-act="pvpdecode">코드 확인</button>' +
        '<button class="btn ghost" data-act="closemodal">닫기</button></div>' +
        '<div class="tiny muted" style="margin-top:6px">· 코드에는 구단명 · 포메이션 · 전술 · 선수 18명이 담깁니다.<br>· 비정상 수치(스탯·레벨)는 자동으로 상한 처리됩니다.<br>· 리그 승점·일정에는 영향이 없습니다.</div>');
      return;
    }
    if (act === 'pvpdecode') {
      var pvpIn = document.getElementById('pvp-in');
      var pvpRaw = pvpIn ? pvpIn.value : '';
      var pvpRes = DS.Pvp.importSquadCode(pvpRaw);
      if (!pvpRes.ok) { toast(pvpRes.error); return; }
      pvpPreview = { snap: pvpRes.snap, code: pvpRes.code };
      pvpChallengeModal(pvpRes.snap, '붙여넣은 코드를 확인했습니다.');
      return;
    }
    if (act === 'pvprival') {
      var prKey = t.getAttribute('data-k'), prList = DS.Pvp.presets(), pi;
      for (pi = 0; pi < prList.length; pi++) {
        if (prList[pi].key === prKey) {
          pvpPreview = { snap: prList[pi].snap, code: prList[pi].code };
          pvpChallengeModal(prList[pi].snap, prList[pi].tag + ' · ' + prList[pi].desc);
          return;
        }
      }
      return;
    }
    if (act === 'pvpstart') {
      if (!pvpPreview) { toast('상대 구단 정보가 없습니다. 코드를 다시 넣어 주세요.'); return; }
      var pvpSnap = pvpPreview.snap;
      closeModal();
      startPvp(pvpSnap);
      return;
    }
    if (act === 'smatch') {
      var key2 = t.getAttribute('data-k'), list = smatchList(), i2;
      for (i2 = 0; i2 < list.length; i2++) { if (list[i2].key === key2) { startMatch('smatch', { teamId: list[i2].team.id }); return; } }
      return;
    }
    if (act === 'smatchticket') {
      if (S.money < 800) { toast('금화가 부족합니다.'); return; }
      S.money -= 800; S.smatchTickets++; save(); renderAll(); toast('S매치 이용권 +1'); return;
    }
    if (act === 'newseason') { closeModal(); newSeason(); return; }
    if (act === 'report') { if (S.lastReport) { showReport(S.lastReport); } return; }
    if (act === 'seasonreview') { openSeasonReview(); return; }
    if (act === 'divview') {
      var dv = parseInt(t.getAttribute('data-v'), 10);
      if (dv === 1 || dv === 2) { S.divView = dv; save(); renderHome(); }
      return;
    }

    if (act === 'playcard') {
      var ck = t.getAttribute('data-k');
      var ok = DS.Match ? DS.Match.playCard(ck) : false;
      if (!ok) {
        var hs = DS.Match && DS.Match.handState ? DS.Match.handState() : null;
        toast(hs && hs.usesLeft === 0 ? '이번 경기는 개입 ' + (hs.limit || 6) + '회를 모두 사용했습니다.' : '모멘텀이 부족합니다.');
      }
      return;
    }
    if (act === 'speed') {
      v = parseInt(t.getAttribute('data-v'), 10);
      if (DS.Match) { DS.Match.setSpeed(v); }
      var sib = document.querySelectorAll('#m-speeds button');
      for (j = 0; j < sib.length; j++) { sib[j].classList.toggle('on', sib[j] === t); }
      return;
    }
    if (act === 'touchdrawer') {
      var tdr = document.getElementById('m-touch');
      var tstrip = document.getElementById('m-tl-strip');
      if (!tdr) { return; }
      var openNow = !tdr.classList.contains('on');
      tdr.classList.toggle('on', openNow);
      if (tstrip) { tstrip.classList.toggle('on', openNow); }
      return;
    }
    if (act === 'touch') {
      var tk = t.getAttribute('data-k'), tv = t.getAttribute('data-v');
      if (DS.Match && DS.Match.setTouch) {
        DS.Match.setTouch(tk, tv);
        var stT = DS.Match.touchState ? DS.Match.touchState() : null;
        if (stT) { updateTouchHud(stT); }
      }
      return;
    }
    if (act === 'tactics') {
      v = t.getAttribute('data-v');
      S.tactics = v; save();
      if (DS.Match) { DS.Match.setTactics(v); }
      var sib2 = document.querySelectorAll('#m-tactics button');
      for (j = 0; j < sib2.length; j++) { sib2[j].classList.toggle('on', sib2[j] === t); }
      toast(t.textContent + ' 전술로 전환');
      return;
    }
    if (act === 'auto') {
      var autoOn = (DS.Match && DS.Match.setAuto) ? DS.Match.setAuto(!(DS.Match.isAuto && DS.Match.isAuto())) : false;
      var ab = document.getElementById('m-auto');
      if (ab) { ab.classList.toggle('on', !!autoOn); }
      return;
    }
    if (act === 'mute') {
      if (!DS.Match || !DS.Match.toggleMute) { return; }
      var mm = DS.Match.toggleMute();
      t.textContent = mm ? '🔇' : '🔊';
      t.classList.toggle('off', !!mm);
      return;
    }
    if (act === 'pause') {
      if (!DS.Match || !DS.Match.running) { return; }
      if (DS.Match.paused) { DS.Match.resume(true); } else { DS.Match.pause(); }
      var pb = document.getElementById('m-pause');
      if (pb) {
        pb.classList.toggle('on', !!DS.Match.paused);
        pb.textContent = DS.Match.paused ? '▶' : 'Ⅱ';
      }
      return;
    }
    if (act === 'exitmatch') {
      if (global.confirm('경기를 중단하고 나가시겠어요?')) { leaveMatchNow(); }
      return;
    }
    if (act === 'rotgo') {
      document.body.classList.add('rot-off');
      try {
        var de = document.documentElement;
        var lock = function () {
          try {
            if (global.screen && screen.orientation && screen.orientation.lock) {
              var pr = screen.orientation.lock('landscape');
              if (pr && pr['catch']) { pr['catch'](function () {}); }
            }
          } catch (e) { /* 미지원 기기 */ }
        };
        if (de.requestFullscreen) {
          var fr = de.requestFullscreen();
          if (fr && fr.then) { fr.then(lock)['catch'](lock); } else { lock(); }
        } else { lock(); }
      } catch (e2) { /* 미지원 기기 */ }
      toast('가로 화면으로 전환합니다.');
      return;
    }
    if (act === 'rotstay') {
      document.body.classList.add('rot-off');
      toast('세로 화면으로 계속합니다. 가로로 돌리면 더 넓게 보입니다.');
      return;
    }
    if (act === 'subs') { openSubs(false); return; }
    if (act === 'subclose') {
      if (DS.Match && DS.Match.running) { DS.Match.resume(subHalf ? false : true); }
      subHalf = false; closeSubs(); return;
    }
    if (act === 'halftime2') { if (DS.Match) { DS.Match.resume(); } subHalf = false; closeSubs(); return; }
    if (act === 'subpick') {
      var side = t.getAttribute('data-side');
      if (side === 'in') { subState.inId = t.getAttribute('data-id'); }
      else { subState.outId = t.getAttribute('data-id'); }
      openSubs(subHalf); return;
    }
    if (act === 'subconfirm') {
      if (!subState.inId || !subState.outId) { return; }
      var done = DS.Match ? DS.Match.substitute(subState.inId, subState.outId) : false;
      if (done) { toast('선수 교체 완료'); subState.inId = null; subState.outId = null; openSubs(subHalf); }
      else { toast('교체할 수 없습니다.'); }
      return;
    }

    if (act === 'reset') {
      if (global.confirm('정말 처음부터 다시 시작할까요? 저장 데이터가 사라집니다.')) {
        localStorage.removeItem(SAVE_KEY);
        defaultState();
        save();
        setTab('home');
        toast('새 게임을 시작합니다.');
      }
      return;
    }
  }

  function findBestSlot(playerId) {
    var p = byId(playerId), f = DS.FORMATIONS[S.formation];
    if (!p) { return 0; }
    var best = 0, score = -999, i, s;
    for (i = 0; i < f.slots.length; i++) {
      s = (f.slots[i].pos === p.pos ? 30 : 0) + (p.apt[f.slots[i].pos] || 0) * 2;
      if (s > score) { score = s; best = i; }
    }
    return best;
  }

  /* ═════════════════  뒤로가기 가드 (앱 이탈 방지) ═════════════════ */
  var backGuard = { lastAt: 0, leaving: false, armed: false };

  function anyOverlayOpen() {
    var m = document.getElementById('modal');
    if (m && String(m.className).indexOf('on') >= 0) { return true; }
    var ov = document.getElementById('m-overlay');
    if (ov && String(ov.className).indexOf('on') >= 0) { return true; }
    return false;
  }
  function armGuard() {
    try { history.pushState({ ds: 'guard' }, ''); backGuard.armed = true; } catch (e) { /* noop */ }
  }
  function leaveMatchNow() {
    if (DS.Match && DS.Match.running) { DS.Match.stop(); }
    if (DS.Match && DS.Match.resume) { try { DS.Match.resume(true); } catch (e) { /* noop */ } }
    closeSubs();
    setTab('home');
    toast('경기를 중단했습니다.');
  }
  function installBackGuard() {
    if (!global.history || !history.pushState || !global.addEventListener) { return; }
    try {
      history.replaceState({ ds: 'root' }, '');
      history.pushState({ ds: 'guard' }, '');
      backGuard.armed = true;
    } catch (e) { return; }
    global.addEventListener('popstate', function () {
      if (backGuard.leaving) { return; }
      /* 1) 경기 진행 중 — 확인 후 중단 */
      if (DS.Match && DS.Match.running && !DS.Match.paused) {
        if (global.confirm('경기를 중단하고 나가시겠어요?')) { leaveMatchNow(); }
        armGuard();
        return;
      }
      /* 2) 열린 시트/모달 닫기 (하프타임 교체창이면 후반도 함께 시작) */
      if (anyOverlayOpen()) {
        var wasHalf = subHalf;
        closeSubs();
        closeModal();
        if (wasHalf && DS.Match && DS.Match.resume) { subHalf = false; DS.Match.resume(); }
        armGuard();
        return;
      }
      /* 3) 다른 탭이면 홈으로 */
      if (currentTab !== 'home') { setTab('home'); armGuard(); return; }
      /* 4) 홈 — 두 번 누르면 종료 */
      var now = Date.now();
      if (now - backGuard.lastAt < 2000) {
        backGuard.leaving = true;
        try { history.back(); } catch (e) { /* noop */ }
        return;
      }
      backGuard.lastAt = now;
      toast('한 번 더 누르면 종료됩니다');
      armGuard();
    });
  }

  /* ═════════════════  가로 회전 안내 ═════════════════ */
  function checkRotate() {
    var w = global.innerWidth || 0, h = global.innerHeight || 0;
    var portrait = h > w && w > 0 && w < 900;
    if (document.body && document.body.classList) {
      document.body.classList.toggle('rot', portrait);
    }
  }

  /* ═════════════════  부트 ═════════════════ */
  function boot() {
    var saved = load();
    if (saved) { S = saved; } else { defaultState(); save(); }
    var i;
    for (i = 0; i < S.squad.length; i++) { EXTRA[S.squad[i].id] = S.squad[i]; }
    renderHeader();
    setTab('home');

    /* v24 — ?vs= 공유 링크로 들어오면 도전장을 바로 띄운다 */
    var vsCode = (DS.Pvp && DS.Pvp.codeFromUrl) ? DS.Pvp.codeFromUrl(global.location && global.location.href) : '';
    if (vsCode) {
      global.setTimeout(function () { pvpIncoming(vsCode); }, 320);
    }

    document.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== document && !(t.getAttribute && t.getAttribute('data-act'))) { t = t.parentNode; }
      if (!t || t === document || !t.getAttribute) { return; }
      e.preventDefault();
      onAction(t.getAttribute('data-act'), t);
    });

    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.id === 'train-player') {
        trainSel.playerId = t.value;
        renderClub();
      }
    });

    global.addEventListener('resize', function () {
      checkRotate();
      if (currentTab === 'squad') { drawPitchBG(); placePitchPlayers(); }
      if (DS.Match && DS.Match.running) { DS.Match.resize(); }
      var sc = document.getElementById('m-mom-scale');
      if (sc) { layoutMomScale(sc); }
    });
    if (global.addEventListener) { global.addEventListener('orientationchange', checkRotate); }
    checkRotate();
    /* v22 — assets/tactics/{cardId}.webp 가 있으면 그 이미지로 바꿔 그린다 */
    if (DS.probeTacticArt) {
      DS.probeTacticArt(function () {
        if (DS.Match && DS.Match.running) { return; }
        if (currentTab === 'home') { renderHome(); }
      });
    }

    document.addEventListener('visibilitychange', function () { if (document.hidden) { save(); } });
    global.addEventListener('beforeunload', save);
    installBackGuard();
  }

  DS.game = {
    state: function () { return S; },
    save: save,
    setTab: setTab,
    toast: toast,
    playerModal: playerModal,
    showReport: showReport,
    managerRoom: managerRoom,
    act: function (a, el) { onAction(a, el); },
    currentTab: function () { return currentTab; },
    renderAll: renderAll,
    /* QA·디버깅용 — 저장소 밖 하네스가 결과를 검증할 때만 쓴다 */
    finishMatch: finishMatch,
    awardMatchExp: awardMatchExp,
    roundInfo: roundInfo,
    ensureMarket: ensureMarket,
    ensureYouth: ensureYouth,
    /* v23 — 2군 리그 · 나이 곡선 검증용 */
    ensureReserve: ensureReserve,
    reserveList: reserveList,
    playReserveRound: playReserveRound,
    ageSeason: ageSeason,
    youthReserve: doYouthReserve,
    /* v24 — 비동기 PvP 검증용 */
    pvpExport: function () { return myPvpCode(); },
    pvpImport: function (code) { return DS.Pvp.importSquadCode(code); },
    pvpPresets: function () {
      return DS.Pvp.presets().map(function (x) {
        return { key: x.key, tag: x.tag, club: x.snap.club, power: x.snap.power, code: x.code };
      });
    },
    pvpStart: function (code) {
      var r = DS.Pvp.importSquadCode(code);
      if (!r.ok) { return r; }
      startPvp(r.snap);
      return { ok: true, power: r.snap.power, club: r.snap.club };
    },
    pvpStartPreset: function (key) {
      var list = DS.Pvp.presets(), i;
      for (i = 0; i < list.length; i++) { if (list[i].key === key) { startPvp(list[i].snap); return { ok: true }; } }
      return { ok: false, error: '프리셋을 찾지 못했습니다.' };
    },
    pvpState: function () { return ensurePvp(); },
    pvpIncoming: pvpIncoming,
    load: load,
    defaultState: defaultState,
    saveKey: SAVE_KEY,
    sellPlayer: removeFromSquad,
    fixturesValid: fixturesValid,
    /* v22 — 1·2부 리그 검증용 */
    newSeason: newSeason,
    ensureSeasonReview: ensureSeasonReview,
    openSeasonReview: openSeasonReview,
    makeTable: makeTable,
    makeFixtures: makeFixtures,
    teamPower: teamPower,
    divTeams: divTeams,
    teamDiv: teamDiv,
    /* 리그 한 라운드를 경기 화면 없이 즉시 결산 (QA 시즌 시뮬레이션용) */
    simRound: function () {
      if (S.seasonOver) { return null; }
      var o = currentOpponent();
      if (!o) { return null; }
      var sa = strengthOf(o.id);
      var g1 = simGoals(teamPower(), sa), g2 = simGoals(sa, teamPower());
      playMatchRows(g1, g2, o.id);
      S.round++;
      /* QA 시즌 시뮬레이션에서도 2군 라운드를 함께 진행한다 */
      playReserveRound();
      if (S.round >= S.fixtures.length) { S.seasonOver = true; ensureSeasonReview(); }
      save();
      return { me: g1, opp: g2, round: S.round };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);
