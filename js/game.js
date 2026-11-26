/*! 도트싸커 v3 — 우리만의 현대 전술 축구 RPG · 게임 상태 · UI (game.js) */
(function (global) {
  'use strict';

  var DS = global.DS;
  var U = DS.util;
  var fmt = U.fmt;
  var clamp = U.clamp;
  var chance = U.chance;
  var pick = U.pick;

  var SAVE_KEY = 'dot-soccer-v3-save';
  var MAX_SQUAD = 20;
  var BENCH_SIZE = 5;
  var CAND_COST = 2400;
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

  /* ═════════════════  상태  ═════════════════ */
  function makeTable() {
    var rows = [{ id: 'me', name: '도트 유나이티드', short: '도트', p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }];
    var i;
    for (i = 0; i < DS.TEAMS.length; i++) {
      rows.push({ id: DS.TEAMS[i].id, name: DS.TEAMS[i].name, short: DS.TEAMS[i].short, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    }
    return rows;
  }

  function makeFixtures() {
    var ids = ['me'], i;
    for (i = 0; i < DS.TEAMS.length; i++) { ids.push(DS.TEAMS[i].id); }
    var n = ids.length, arr = ids.slice(1), rounds = [], r, j;
    for (r = 0; r < n - 1; r++) {
      var pairs = [[ids[0], arr[arr.length - 1]]];
      for (j = 0; j < (n - 2) / 2; j++) { pairs.push([arr[j], arr[n - 2 - j]]); }
      rounds.push(pairs);
      arr.unshift(arr.pop());
    }
    return rounds;
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
      v: 5,
      club: { name: '도트 유나이티드', emblem: 'bolt', kit: { shirt: '#c8432f', shorts: '#16241f', trim: '#f0e6cc' } },
      money: 7200,
      fans: 1280,
      morale: 66,
      condition: 88,
      season: 1,
      round: 0,
      seasonOver: false,
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
      table: makeTable(),
      fixtures: makeFixtures(),
      career: [],
      challengeLeft: 1,
      smatchTickets: 3,
      smatchStreak: 0,
      totals: { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, conceded: 0 },
      lastResult: null,
      lastReport: null,
      scoutCandidates: [],
      managers: ['m01'],
      manager: 'm01',
      mgrCand: [],
      dex: { players: {}, emblems: {}, kits: {} },
      log: []
    };
    S = st;
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
      if (!d || (d.v !== 3 && d.v !== 4 && d.v !== 5) || !d.squad || !d.lineup || !d.club) { return null; }
      if (!d.table || !d.table.length) { d.table = makeTable(); }
      if (!d.fixtures || !d.fixtures.length) { d.fixtures = makeFixtures(); }
      if (!DS.FORMATIONS[d.formation]) { d.formation = '4-2-3-1'; }
      if (!d.bench) { d.bench = autoBench(d.squad, d.lineup); }
      if (!d.roles) { d.roles = {}; }
      if (!d.facilities) { d.facilities = { training: 0, medical: 0, shop: 0, fanclub: 0, cafe: 0 }; }
      if (!d.dex) { d.dex = { players: {}, emblems: {}, kits: {} }; }
      if (!d.totals) { d.totals = { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, conceded: 0 }; }
      if (!d.career) { d.career = []; }
      if (!d.combos) { d.combos = []; }
      if (!d.deck || !d.deck.length) { d.deck = DS.DEFAULT_DECK.slice(); }
      if (!d.uiMode) { d.uiMode = 'basic'; }
      if (typeof d.smatchTickets !== 'number') { d.smatchTickets = 3; }
      if (typeof d.smatchStreak !== 'number') { d.smatchStreak = 0; }
      if (typeof d.condition !== 'number') { d.condition = 88; }
      if (typeof d.morale !== 'number') { d.morale = 66; }
      if (!d.sponsor) { d.sponsor = 'kimbap'; }
      if (!d.scoutCandidates) { d.scoutCandidates = []; }
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
      }
      /* v4: 선발 11 + 벤치 5 = 16명의 일러스트(p01~p32) 중복 제거 */
      DS.assignUniquePics(d.squad);
      if (d.scoutCandidates && d.scoutCandidates.length) { DS.assignUniquePics(d.scoutCandidates); }
      if (!d.homeFormation) { d.homeFormation = d.formation; }
      d.v = 5;
      return d;
    } catch (e) { return null; }
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
      '<span class="mgr-sub">' + esc(m.style) + ' · 고유 ' + m.formation + (mgrSync() ? ' <em class="sync">시너지 ON</em>' : '') + '</span>' +
      '<span class="mgr-tags">' + tags + '</span></span>' +
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
      '<div class="tb-sub">시즌 ' + S.season + ' · ' + ourRank() + '위 · ' + S.formation + '</div></div>' +
      '</div>' +
      '<div class="tb-chips">' +
      '<span class="tb-chip gold"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h5M9.5 14h5"/></svg>' + fmt(S.money) + '</span>' +
      '<span class="tb-chip"><svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 7a3 3 0 0 1 0 6M18 20c0-2.4-1-4.5-2.6-5.6"/></svg>' + fmt(S.fans) + '</span>' +
      '</div>';
    paintEmblems(h);
  }

  /* ═════════════════  홈 (공식전) ═════════════════ */
  function sortTable() {
    S.table.sort(function (a, b) {
      if (b.pts !== a.pts) { return b.pts - a.pts; }
      var da = a.gf - a.ga, db = b.gf - b.ga;
      if (db !== da) { return db - da; }
      if (b.gf !== a.gf) { return b.gf - a.gf; }
      return a.name < b.name ? -1 : 1;
    });
  }
  function tableRow(id) {
    var i;
    for (i = 0; i < S.table.length; i++) { if (S.table[i].id === id) { return S.table[i]; } }
    return null;
  }
  function ourRank() {
    sortTable();
    var i;
    for (i = 0; i < S.table.length; i++) { if (S.table[i].id === 'me') { return i + 1; } }
    return 8;
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
    var power = teamPower(), chem = chemistry(), rank = ourRank();
    var next = currentOpponent();
    var rows = '', i, r, isMe;
    sortTable();
    for (i = 0; i < S.table.length; i++) {
      r = S.table[i];
      isMe = r.id === 'me';
      rows += '<tr class="' + (isMe ? 'me' : '') + '"><td class="rk">' + (i + 1) + '</td>' +
        '<td class="tm">' + esc(isMe ? S.club.name : r.name) + '</td>' +
        '<td>' + r.p + '</td><td>' + (r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga) + '</td>' +
        '<td class="pts">' + r.pts + '</td></tr>';
    }

    var nextHTML = '';
    if (S.seasonOver) {
      var w = S.table[0];
      nextHTML = '<div class="card">' +
        '<div class="card-head"><span class="dot"></span><b>시즌 ' + S.season + ' 종료</b><span class="meta">FINAL</span></div>' +
        '<div class="row between"><div><div class="b" style="font-size:12.5px">우승 · ' + esc(w.id === 'me' ? S.club.name : w.name) + '</div>' +
        '<div class="tiny muted">최종 ' + rank + '위 · 승점 ' + tableRow('me').pts + '</div></div>' +
        '<button class="btn primary sm" data-act="newseason">새 시즌</button></div></div>';
    } else if (next) {
      var opp = opponentTeam(next.id);
      nextHTML = '<div class="card">' +
        '<div class="card-head"><span class="dot"></span><b>다음 경기 · ' + (S.round + 1) + '라운드</b><span class="meta">' + (next.home ? '홈' : '원정') + ' · ' + nextLabel() + '</span></div>' +
        '<div class="vs">' +
        '<div class="vs-team"><canvas data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="38" height="44"></canvas><span class="nm">' + esc(S.club.name) + '</span><span class="st">전력 ' + power + '</span></div>' +
        '<div class="vs-mid"><b>VS</b><span>' + DS.FORMATIONS[oppFormation(opp)].tag + '</span></div>' +
        '<div class="vs-team"><canvas data-emblem="' + opp.emblem + '" data-kit="' + opp.kit.shirt + '|' + opp.kit.trim + '" width="38" height="44"></canvas><span class="nm">' + esc(opp.name) + '</span><span class="st">전력 ' + opp.strength + '</span></div>' +
        '</div>' +
        '<div class="kpis" style="margin-bottom:8px">' +
        '<div class="kpi"><b class="lime">' + xgEstimate(opp.strength).toFixed(1) + '</b><span>기대 득점 xG</span></div>' +
        '<div class="kpi"><b>' + pressLevel() + '</b><span>압박 강도</span></div>' +
        '<div class="kpi"><b class="coral">-' + staminaCost() + '%</b><span>체력 소모</span></div>' +
        '</div>' +
        '<button class="btn primary wide" data-act="kickoff">공식전 킥오프</button></div>';
    }

    var deckHTML = '';
    var dcs = deckCards();
    deckHTML = '<div class="card tight">' +
      '<div class="card-head"><b>전술 카드 덱</b><span class="meta">' + dcs.length + '장 편성 · 경기 중 손패 3장</span></div>' +
      '<div class="deckgrid">' + dcs.map(function (d) {
        return '<div class="deckcard" style="--cc:' + d.color + '">' +
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
      '<div class="hero">' +
      '<img class="hero-img" src="assets/hero-banner.jpg" alt="">' +
      '<div class="hero-badge"><svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z"/></svg>' + S.formation + ' · ' + DS.FORMATIONS[S.formation].tag + '</div>' +
      '<div class="hero-in">' +
      '<div class="hero-kicker">MODERN TACTICAL SOCCER RPG</div>' +
      '<div class="hero-title">' + esc(S.club.name) + '</div>' +
      '<div class="hero-sub">리그 ' + rank + '위 · 전력 ' + power + ' · 조직력 ' + chem + ' · 시즌 ' + S.season + '</div>' +
      '</div></div>' +

      '<div class="card tight">' +
      '<div class="club-line">' +
      '<canvas class="club-emblem" data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="46" height="52"></canvas>' +
      '<div class="club-meta"><div class="nm">' + esc(S.club.name) + ' ' + stars(powerStars(power)) + '</div>' +
      '<div class="sub">리그 ' + rank + '위 · 사기 ' + S.morale + ' · 컨디션 ' + S.condition + ' · 팬 ' + fmt(S.fans) + '</div></div>' +
      '<div class="rank-badge">' + rank + '<span>RANK</span></div>' +
      '</div></div>' +

      nextHTML + deckHTML +
      '<div class="card">' +
      '<div class="card-head"><b>리그 순위</b><span class="meta">8팀 · ' + S.fixtures.length + '라운드</span></div>' +
      '<table class="tbl"><thead><tr><th>#</th><th style="text-align:left">구단</th><th>경기</th><th>득실</th><th>승점</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div>' +
      lastHTML +
      '<div class="card">' +
      '<div class="card-head"><b>시즌 기록</b><span class="meta">승률 ' + (S.totals.matches ? Math.round(S.totals.wins / S.totals.matches * 100) : 0) + '%</span></div>' +
      '<div class="kpis">' +
      '<div class="kpi"><b>' + S.totals.matches + '</b><span>경기</span></div>' +
      '<div class="kpi"><b class="lime">' + S.totals.wins + '</b><span>승</span></div>' +
      '<div class="kpi"><b>' + S.totals.draws + '</b><span>무</span></div>' +
      '<div class="kpi"><b class="coral">' + S.totals.losses + '</b><span>패</span></div>' +
      '<div class="kpi"><b>' + S.totals.goals + '</b><span>득점</span></div>' +
      '<div class="kpi"><b>' + S.totals.conceded + '</b><span>실점</span></div>' +
      '</div></div>' +
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
    var keys = DS.FORMATION_KEYS, h = 0, i;
    for (i = 0; i < team.id.length; i++) { h = (h * 31 + team.id.charCodeAt(i)) % 97; }
    return keys[h % keys.length];
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
        '<button class="btn ' + (i === 2 ? 'red' : '') + ' wide" data-act="smatch" data-k="' + it.key + '" ' + (S.smatchTickets <= 0 ? 'disabled' : '') + '>S매치 시작 · 이용권 ' + S.smatchTickets + '장</button>' +
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
      '</div>' + cards +
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

    for (i = 0; i < f.slots.length; i++) {
      slot = f.slots[i];
      p = byId(S.lineup[i]);
      var tokBadge = master ? slot.pos : DS.posGroup(slot.pos);
      /* 가로 전술판: 길이(y) → 화면 x(왼→오른), 폭(x) → 화면 y(먼→가까운) */
      toks += '<button class="tok ' + (p ? 'r-' + p.rarity : 'empty') + (selId === (p && p.id) ? ' sel' : '') + '" ' +
        'style="left:' + (100 - slot.y).toFixed(1) + '%;top:' + slot.x.toFixed(1) + '%" data-act="starter" data-slot="' + i + '" data-id="' + (p ? p.id : '') + '">' +
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
        benchHTML += '<button class="pcard ' + (selId === b.id ? 'sel' : '') + '" data-act="bench" data-id="' + b.id + '">' +
          '<span class="ph"><img src="' + DS.Art.headSrc(b) + '" alt=""></span>' +
          '<span class="pn">' + esc(shortName(b.name)) + '</span>' +
          '<span class="pm">' + posBadge(b.pos, master ? b.pos : DS.posGroup(b.pos)) + '<span class="ov">' + DS.ratingOf(b) + '</span></span>' +
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
      '<div class="sq-bench"><span class="sqb-lbl">벤치</span>' + benchHTML + '</div>' +
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
    var i, u, v, pt;
    for (i = 0; i < dots.length; i++) {
      u = parseFloat(dots[i].style.left) / 100;
      v = parseFloat(dots[i].style.top) / 100;
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

  function renderClub() {
    var box = document.getElementById('screen-club');
    if (!box) { return; }
    var i, fac, lv, cost, facHTML = '';
    for (i = 0; i < DS.FACILITIES.length; i++) {
      fac = DS.FACILITIES[i];
      lv = S.facilities[fac.key] || 0;
      cost = DS.facilityCost(fac, lv);
      var ficon = { training: '🏋️', medical: '🚑', shop: '🛍️', fanclub: '📣', cafe: '☕' }[fac.key] || '🏟️';
      facHTML += '<div class="fac">' +
        '<div class="row between"><div class="row" style="gap:5px;min-width:0"><span class="ico">' + ficon + '</span><span class="fac-name">' + fac.name + '</span></div><span class="fac-lv">Lv.' + lv + '/5</span></div>' +
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

    var st = starters(), roleHTML = '';
    for (i = 0; i < st.length; i++) {
      var r = DS.roleOf(st[i].role);
      roleHTML += '<div class="role-row">' +
        '<span class="minihead" style="width:30px;height:30px"><img src="' + DS.Art.headSrc(st[i]) + '"></span>' +
        '<div style="flex:1 1 auto;min-width:0"><div class="nm">' + esc(st[i].name) + ' <span class="tiny muted">' + st[i].pos + ' · Lv.' + (st[i].level || 0) + '</span></div>' +
        '<div class="ds">' + (r ? r.name + ' — ' + r.desc : '아직 롤 없음 · Lv.3부터 진화 가능') + '</div></div>' +
        '<button class="btn sm ' + (r ? 'ghost' : 'primary') + '" data-act="evolve" data-id="' + st[i].id + '">' + (r ? '변경' : '진화') + '</button>' +
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
      '<div class="card dark">' +
      '<div class="card-head"><span class="dot"></span><b style="color:#eaf6dd">클럽 하우스</b><span class="meta">FACILITIES</span></div>' +
      '<div class="grid2">' + facHTML + '</div></div>' +
      '<div class="card">' +
      '<div class="card-head"><b>특훈 콤보</b><span class="meta">훈련 2개 조합 · Lv.상승</span></div>' +
      '<div class="row between" style="margin-bottom:6px"><span class="tiny muted">대상 선수</span>' +
      '<select id="train-player" class="pick" style="max-width:190px;height:28px;border-radius:8px;border:1px solid var(--line);background:#fff;font-size:10.5px;font-weight:700;padding:0 6px">' + playerOptions(tp ? tp.id : '') + '</select></div>' +
      '<div class="menu2">' + menuHTML + '</div>' +
      (combo ? '<div class="row between" style="margin-top:6px"><span class="chip lime">콤보 ' + combo.name + '</span><span class="tiny muted">' + combo.desc + '</span></div>' : '') +
      '<button class="btn primary wide" style="margin-top:7px" data-act="trainrun" ' + (trainSel.menus.length !== 2 || !tp || S.money < trainCost ? 'disabled' : '') + '>특훈 실행 · ' + fmt(trainCost) + '</button>' +
      '</div>' +
      '<div class="card">' +
      '<div class="card-head"><b>롤 진화</b><span class="meta">현대 롤 · Lv.3 / Lv.4</span></div>' +
      roleHTML + '</div>' +
      '<div class="card"><div class="card-head"><b>감독실</b><span class="meta">선임 감독 · 고유 포메이션</span></div>' +
      managerHTML('club') +
      '<div class="grid2" style="margin-top:7px">' +
      '<button class="btn sm ' + (mgrSync() ? 'ghost' : 'primary') + '" data-act="mgrform" ' + (mgrSync() ? 'disabled' : '') + '>' +
      (mgrSync() ? '고유 포메이션 적용중' : '고유 포메이션 적용') + '</button>' +
      '<button class="btn sm" data-act="mgrmodal">감독 영입 · 교체</button></div></div>' +
      '<div class="card"><div class="card-head"><b>스폰서</b><span class="meta">경기당 보너스</span></div>' + spHTML + '</div>' +
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
  }

  function playerOptions(sel) {
    var list = S.squad.slice().sort(function (a, b) { return DS.ratingOf(b) - DS.ratingOf(a); });
    var s = '', i;
    for (i = 0; i < list.length; i++) {
      s += '<option value="' + list[i].id + '"' + (list[i].id === sel ? ' selected' : '') + '>' +
        esc(list[i].name) + ' · ' + list[i].pos + ' ' + DS.ratingOf(list[i]) + '</option>';
    }
    return s;
  }

  /* ═════════════════  상점 ═════════════════ */
  function rollScout() {
    S.scoutCandidates = [];
    var i;
    var taken = S.squad.slice();
    for (i = 0; i < 4; i++) {
      var p = DS.makePlayer({ rarity: DS.pickRarity('special') });
      p.pic = DS.nextFreePic(taken, p.pos);
      taken.push(p);
      S.scoutCandidates.push(p);
      EXTRA[p.id] = p;
    }
  }

  function renderShop() {
    var box = document.getElementById('screen-shop');
    if (!box) { return; }
    if (!S.scoutCandidates || !S.scoutCandidates.length) { rollScout(); }
    var i, p, cards = '';
    for (i = 0; i < S.scoutCandidates.length; i++) {
      p = S.scoutCandidates[i];
      EXTRA[p.id] = p;
      cards += '<button class="scout" data-act="scoutpick" data-id="' + p.id + '">' +
        '<span class="art"><img src="' + DS.Art.portraitSrc(p) + '" alt=""></span>' +
        '<span class="main"><span class="nm">' + esc(p.name) + '</span>' +
        '<span class="mt">' + posBadge(p.pos) + '<span class="chip" style="background:' + rarityColor(p) + '22;color:' + rarityColor(p) + '">' + DS.RARITY[p.rarity].name + '</span>' +
        '<span>' + p.tenure + '기수</span></span>' +
        '<span class="mt"><span class="chip">' + DS.lockOf(p.lock).name + '</span><span class="chip">' + p.playType + '</span></span></span>' +
        '<span class="ov">' + DS.ratingOf(p) + '<small>OVR</small></span>' +
        '</button>';
    }

    var dex = S.dex;
    var dexP = Object.keys(dex.players).length, dexE = Object.keys(dex.emblems).length, dexK = Object.keys(dex.kits).length;
    var pctP = Math.min(100, Math.round(dexP / 40 * 100));
    var pctE = Math.round(dexE / DS.EMBLEMS.length * 100);
    var pctK = Math.round(dexK / DS.KIT_COLORS.length * 100);

    var eCells = '', em;
    for (i = 0; i < DS.EMBLEMS.length; i++) {
      em = DS.EMBLEMS[i];
      var got = !!dex.emblems[em.id];
      eCells += '<div class="dexcell' + (got ? ' got' : '') + '">' +
        (got ? '<canvas width="20" height="23" data-emblem="' + em.id + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '"></canvas>' : '<span style="font-size:12px">?</span>') +
        '<div>' + (got ? em.name : '???') + '</div></div>';
    }
    var kCells = '';
    for (i = 0; i < DS.KIT_COLORS.length; i++) {
      var kc = DS.KIT_COLORS[i], kg = !!dex.kits[kc];
      kCells += '<div class="dexcell' + (kg ? ' got' : '') + '"><span style="display:block;width:16px;height:16px;margin:0 auto 2px;border-radius:4px;background:' + (kg ? kc : '#cdc6b3') + '"></span></div>';
    }

    box.innerHTML =
      '<div class="card dark">' +
      '<div class="card-head"><span class="dot"></span><b style="color:#eaf6dd">스페셜 스카우트</b><span class="meta">4인 후보</span></div>' +
      '<div class="tiny" style="color:rgba(233,244,221,.62);margin-bottom:7px">영입 비용 ' + fmt(CAND_COST) + ' · 방출할 선수를 고르면 바로 교환됩니다.</div>' +
      '<div class="scout-grid">' + cards + '</div>' +
      '<div class="row between" style="margin-top:6px">' +
      '<button class="btn ghost sm" data-act="reroll" ' + (S.money < REROLL_COST ? 'disabled' : '') + '>리스트 갱신 · ' + fmt(REROLL_COST) + '</button>' +
      '<button class="btn primary sm" data-act="normalScout" ' + (S.money < 600 ? 'disabled' : '') + '>일반 스카우트 · 600</button>' +
      '</div></div>' +
      '<div class="card">' +
      '<div class="card-head"><b>컬렉션 도감</b><span class="meta">수집률</span></div>' +
      '<div class="row between"><span class="tiny muted">선수 ' + dexP + '/40</span><b class="tiny">' + pctP + '%</b></div>' +
      '<div class="dexbar"><i style="width:' + pctP + '%"></i></div>' +
      '<div class="row between"><span class="tiny muted">엠블럼 ' + dexE + '/' + DS.EMBLEMS.length + '</span><b class="tiny">' + pctE + '%</b></div>' +
      '<div class="dexbar"><i style="width:' + pctE + '%"></i></div>' +
      '<div class="dexgrid">' + eCells + '</div>' +
      '<div class="row between" style="margin-top:6px"><span class="tiny muted">유니폼 ' + dexK + '/' + DS.KIT_COLORS.length + '</span><b class="tiny">' + pctK + '%</b></div>' +
      '<div class="dexbar"><i style="width:' + pctK + '%"></i></div>' +
      '<div class="dexgrid">' + kCells + '</div></div>' +
      '<div class="card tight">' +
      '<div class="card-head"><b>아이템</b></div>' +
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
    var html = '', code, v, lay, hi;
    for (var i = 0; i < DS.APT_LIST.length; i++) {
      code = DS.APT_LIST[i];
      v = p.apt[code] || 1;
      lay = DS.APT_LAYOUT[code];
      if (!lay) { continue; }
      hi = code === p.pos ? ' hi' : (v >= 7 ? ' mid' : '');
      html += '<div class="aptcell' + hi + '" style="left:' + lay.x + '%;top:' + lay.y + '%">' +
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

    for (i = 0; i < S.managers.length; i++) {
      var om = DS.managerOf(S.managers[i]);
      if (!om) { continue; }
      var on = om.id === m.id;
      ownHTML += '<button class="mrow' + (on ? ' on' : '') + '" data-act="mgrset" data-id="' + om.id + '">' +
        '<span class="mrow-art"><img src="' + DS.Art.managerHead(om) + '" alt=""></span>' +
        '<span class="mrow-main"><b>' + esc(om.name) + '</b>' +
        '<span class="mrow-sub">' + esc(om.style) + ' · ' + om.formation + '</span>' +
        '<span class="mrow-tr">' + DS.managerTraitText(om) + '</span></span>' +
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
        '<span class="mcard-art"><img src="' + DS.Art.managerPortrait(cm) + '" alt=""></span>' +
        '<span class="mcard-main"><span class="mcard-top"><b>' + esc(cm.name) + '</b>' +
        '<span class="chip" style="background:' + DS.RARITY[cm.rarity].color + '22;color:' + DS.RARITY[cm.rarity].color + '">' + DS.RARITY[cm.rarity].name + '</span>' +
        '<span class="tiny muted">' + cm.age + '세</span></span>' +
        '<span class="mcard-sub">' + esc(cm.style) + ' · 고유 ' + cm.formation + '</span>' +
        '<span class="mcard-tr">' + DS.managerTraitText(cm) + '</span></span>' +
        '<button class="btn sm primary" data-act="mgrsign" data-id="' + cm.id + '" ' + (S.money < price ? 'disabled' : '') + '>' + fmt(price) + '</button></div>';
    }
    if (!cands) { candHTML = '<div class="tiny muted" style="padding:8px 2px">영입 가능한 후보가 없습니다. 후보를 다시 뽑아보세요.</div>'; }

    var body =
      '<div class="mhero">' +
      '<img class="mhero-art" src="' + DS.Art.managerPortrait(m) + '" alt="">' +
      '<div class="mhero-in">' +
      '<div class="mhero-kicker">' + DS.RARITY[m.rarity].name + ' · ' + m.age + '세</div>' +
      '<div class="mhero-name">' + esc(m.name) + ' <small>감독</small></div>' +
      '<div class="mhero-style">' + esc(m.style) + '</div>' +
      '<div class="mhero-form">고유 포메이션 <b>' + m.formation + '</b> · ' + DS.FORMATIONS[m.formation].tag +
      (mgrSync() ? ' <em class="sync">시너지 ON</em>' : '') + '</div>' +
      '</div></div>' +
      '<div class="mstory">' + esc(m.story) + '</div>' +
      fxHTML +
      '<button class="btn wide ' + (mgrSync() ? 'ghost' : 'primary') + '" style="margin:8px 0 4px" data-act="mgrform" ' + (mgrSync() ? 'disabled' : '') + '>' +
      (mgrSync() ? m.formation + ' · 고유 포메이션 적용중' : m.formation + ' · 고유 포메이션 원클릭 적용') + '</button>' +
      '<div class="band">보유 감독 <span>' + S.managers.length + '명 / 32명</span></div>' +
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
      '<div class="pd-name">' + esc(p.name) + ' <small>' + p.age + '세</small></div>' +
      '<div class="pd-line">' + posBadge(p.pos, p.pos + ' · ' + DS.POS[p.pos].name) +
      '<span class="chip" style="background:' + L.color + '26;color:' + L.color + '">' + L.name + '</span>' +
      (role ? '<span class="chip lime">' + role.name + '</span>' : '') + '</div>' +
      '<div class="row" style="align-items:flex-end;gap:8px"><div class="pd-ov">' + rt + '<small>OVR</small></div>' +
      '<div class="tiny" style="color:rgba(233,244,221,.6);padding-bottom:2px">' + DS.RARITY[p.rarity].name + ' · ' + p.tenure + '기수 · Lv.' + (p.level || 0) + '</div></div>' +
      '<div class="pd-rows"><div><span>타입</span>' + esc(p.playType) + '</div><div><span>신장</span>' + p.height + 'cm</div></div>' +
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
        '<button class="btn dark wide" style="margin-top:8px" data-act="evolve" data-id="' + p.id + '">롤 진화 · ' + fmt(EVO_COST) + '</button>'
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
        '<span class="dtag" style="background:' + d.color + '22;color:' + d.color + '">' + d.tag + '</span>' +
        '<span class="dtxt"><b>' + d.name + ' <em>M ' + d.cost + '</em></b><span>' + d.desc + '</span></span>' +
        '<span class="dstate' + (on ? ' on' : '') + '">' + (on ? '편성' : '추가') + '</span></button>';
    }
    setSheet('전술 카드 덱 · ' + deckDraft.length + '/6',
      '<div class="tiny muted" style="margin-bottom:6px">경기 중 손패는 덱에서 3장이 뽑힙니다. 모멘텀을 모아 원하는 타이밍에 발동하세요.</div>' +
      cards +
      '<button class="btn primary wide" style="margin-top:8px" data-act="decksave">덱 저장</button>');
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
      rows += '<div class="role-row">' +
        '<span class="minihead" style="width:30px;height:30px"><img src="' + DS.Art.headSrc(st[i]) + '"></span>' +
        '<div style="flex:1 1 auto;min-width:0"><div class="nm">' + esc(st[i].name) + ' <span class="tiny muted">' + st[i].pos + ' · Lv.' + (st[i].level || 0) + '</span></div>' +
        '<div class="ds">' + (r ? r.name : '롤 없음') + '</div></div>' +
        '<button class="btn sm ' + (r ? 'ghost' : 'primary') + '" data-act="evolve" data-id="' + st[i].id + '">' + (r ? '변경' : '진화') + '</button></div>';
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
      '<div class="rs-team"><canvas data-emblem="' + r.homeEmblem + '" data-kit="' + r.homeKit.shirt + '|' + r.homeKit.trim + '" width="30" height="34"></canvas><b>' + esc(r.homeShort) + '</b><span>HOME</span></div>' +
      '<div class="rs-score"><b>' + r.homeScore + '</b><i>:</i><b>' + r.awayScore + '</b></div>' +
      '<div class="rs-team"><canvas data-emblem="' + r.awayEmblem + '" data-kit="' + r.awayKit.shirt + '|' + r.awayKit.trim + '" width="30" height="34"></canvas><b>' + esc(r.awayShort) + '</b><span>AWAY</span></div>' +
      '</div>' +
      '<div class="kpis" style="margin-bottom:9px">' +
      '<div class="kpi"><b>' + r.xg[0].toFixed(1) + ' : ' + r.xg[1].toFixed(1) + '</b><span>xG</span></div>' +
      '<div class="kpi"><b>' + r.possession[0] + '%</b><span>점유율</span></div>' +
      '<div class="kpi"><b>' + r.cards + '</b><span>전술 카드</span></div>' +
      '</div>' +
      '<div class="band">SCORE<span>' + esc(r.competition) + ' · ' + r.roundLabel + '</span></div>' +
      '<div class="card tight" style="margin:0 0 8px"><div class="rline"><span>일시</span><b style="margin-left:auto">' + r.date + '</b></div>' +
      '<div class="rline"><span>장소</span><b style="margin-left:auto">' + esc(r.stadium) + '</b></div>' +
      '<div class="rline"><span>관중</span><b style="margin-left:auto">' + fmt(r.attendance) + '명</b></div>' +
      '<div class="rline"><span>슛</span><b style="margin-left:auto">' + r.shots.home + ' : ' + r.shots.away + '</b></div>' +
      '<div class="rline"><span>패스 · 태클 · 선방</span><b style="margin-left:auto">' + r.passes + ' · ' + r.tackles + ' · ' + r.saves + '</b></div>' +
      '<div class="rline"><span>MVP</span><b style="margin-left:auto">' + esc(r.mvp.name) + ' (' + r.mvpRating.toFixed(1) + ')</b></div></div>' +
      '<div class="band">GOALS</div><div class="card tight" style="margin:0 0 8px">' + goals + '</div>' +
      (r.manager ? '<div class="band">MANAGER</div><div class="card tight" style="margin:0 0 8px">' +
        '<div class="rline"><span>감독</span><b style="margin-left:auto">' + esc(r.manager.name) + ' · ' + esc(r.manager.style) + '</b></div>' +
        '<div class="rline"><span>고유 포메이션</span><b style="margin-left:auto">' + esc(r.manager.formation) + (r.manager.sync ? ' · 시너지 ON' : '') + '</b></div>' +
        '<div class="rline"><span>특기</span><b style="margin-left:auto">' + esc(r.manager.traits) + '</b></div></div>' : '') +
      '<div class="band">CAUTIONS</div><div class="card tight" style="margin:0 0 8px">' + caut + '</div>' +
      '<div class="band">PLAYER RATING</div><div class="card tight" style="margin:0 0 8px">' + pts + '</div>' +
      '<div class="band">CAREER</div><div class="card tight" style="margin:0 0 8px">' +
      '<table class="tbl"><thead><tr><th>시즌</th><th>순위</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th></tr></thead><tbody>' + car + '</tbody></table></div>' +
      '<div class="row between"><span class="tiny muted">보상 ' + fmt(r.reward) + (r.points ? ' · 승점 +' + r.points : '') + '</span>' +
      '<button class="btn primary" data-act="closemodal">확인</button></div>';
  }

  function showReport(r) {
    var m = document.getElementById('modal');
    m.className = 'on';
    m.setAttribute('data-report', '1');
    m.innerHTML = '<div class="sheet"><div class="sheet-head"><b>RESULTS</b>' +
      '<span class="tiny muted">' + r.season + ' 시즌 · ' + r.roundLabel + '</span>' +
      '<button class="x" data-act="closemodal">닫기 ✕</button></div>' +
      '<div class="sheet-body">' + reportHTML(r) + '</div></div>';
    paintEmblems(m);
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

  function startMatch(kind, opt) {
    opt = opt || {};
    var oppTeam = null, oppId = null, i;
    if (kind === 'smatch') {
      oppId = opt.teamId;
      oppTeam = opponentTeam(oppId);
      if (S.smatchTickets <= 0) { toast('S매치 이용권이 없습니다.'); return; }
      S.smatchTickets--;
    } else if (kind === 'challenge') {
      if (S.challengeLeft <= 0) { toast('오늘 챌린지를 모두 소진했습니다.'); return; }
      oppTeam = DS.TEAMS[0];
      for (i = 0; i < DS.TEAMS.length; i++) { if (DS.TEAMS[i].strength > oppTeam.strength) { oppTeam = DS.TEAMS[i]; } }
      oppId = oppTeam.id;
    } else {
      var o = currentOpponent();
      if (!o) { toast('이번 시즌 일정이 끝났습니다.'); return; }
      oppTeam = opponentTeam(o.id);
      oppId = o.id;
    }

    var f = DS.FORMATIONS[S.formation], lineup = [], k, p;
    for (k = 0; k < S.lineup.length; k++) {
      p = byId(S.lineup[k]);
      if (!p) { continue; }
      lineup.push({ player: p, role: f.slots[k].role, pos: f.slots[k].pos, x: f.slots[k].x, y: f.slots[k].y });
    }
    if (lineup.length < 8) { toast('선발 선수가 부족합니다.'); return; }
    if (S.condition < 25) { toast('컨디션이 너무 낮습니다. 회복이 필요합니다.'); return; }

    save();
    setTab('match');
    renderMatchLive(oppTeam, kind);

    var benchList = benchPlayers().map(function (b) {
      return { player: b, pos: b.pos, rating: DS.ratingOf(b) };
    });
    var awayFormation = oppFormation(oppTeam);

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
      awayPlayers: buildAwaySquad(oppTeam, awayFormation),
      awayFormation: awayFormation,
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
      onEnd: function (res) { finishMatch(res, oppTeam, oppId, kind); }
    };
    global.setTimeout(function () { if (DS.Match) { DS.Match.start(cfg); } }, 60);
  }

  function finishMatch(res, oppTeam, oppId, kind) {
    var gf = res.homeScore, ga = res.awayScore;
    var win = gf > ga, draw = gf === ga;
    var base = win ? (420 + gf * 60 + (gf - ga) * 40) : (draw ? 210 : 110 + gf * 30);
    if (kind === 'challenge') { base = Math.round(base * 2); }
    if (kind === 'smatch') { base = Math.round(base * 1.35); }
    var spBonus = 0, i;
    for (i = 0; i < DS.SPONSORS.length; i++) {
      if (DS.SPONSORS[i].id === S.sponsor && S.fans >= DS.SPONSORS[i].fans) { spBonus = DS.SPONSORS[i].bonus; }
    }
    var reward = base + spBonus + facValue('shop');
    if (kind === 'smatch' && S.smatchStreak >= 3) { reward = Math.round(reward * 1.25); }

    var fanGain = win ? U.irange(40, 90) : (draw ? U.irange(10, 30) : -U.irange(10, 30));
    if (win) { fanGain = Math.round(fanGain * (1 + facValue('fanclub') / 100)); }
    S.fans = Math.max(120, S.fans + fanGain);
    S.morale = clamp(S.morale + (win ? 6 : (draw ? 0 : -5)), 0, 100);
    S.condition = clamp(S.condition - U.irange(6, 10) + facValue('medical'), 12, 100);
    S.money += reward;
    S.totals.matches++;
    S.totals.goals += gf;
    S.totals.conceded += ga;
    if (win) { S.totals.wins++; } else if (draw) { S.totals.draws++; } else { S.totals.losses++; }

    var points = null;
    if (kind === 'league') {
      playMatchRows(gf, ga, oppId);
      S.round++;
      points = win ? 3 : (draw ? 1 : 0);
      if (S.round >= S.fixtures.length) { S.seasonOver = true; }
    } else if (kind === 'challenge') {
      S.challengeLeft = Math.max(0, S.challengeLeft - 1);
    } else if (kind === 'smatch') {
      S.smatchStreak = win ? S.smatchStreak + 1 : 0;
    }

    var stadiums = ['도트 파크', '에메랄드 아레나', '한강 경기장', '벽산 스타디움'];
    var report = {
      season: S.season,
      roundLabel: kind === 'league' ? (S.round + '라운드') : (kind === 'smatch' ? 'S매치' : '챌린지'),
      competition: kind === 'league' ? '도트 리그' : (kind === 'smatch' ? 'S매치 스페셜' : '챌린지 매치'),
      date: '2045/11/' + (14 + (S.round % 12)) + ' ' + ['19:30', '20:00', '21:00'][S.round % 3],
      stadium: stadiums[S.round % stadiums.length],
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
      manager: {
        name: mgr().name, style: mgr().style, formation: mgr().formation,
        traits: DS.managerTraitText(mgr()), sync: mgrSync()
      },
      reward: reward,
      points: points,
      kind: kind
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

  function playMatchRows(gf, ga, oppId) {
    var pairs = S.fixtures[S.round], i;
    for (i = 0; i < pairs.length; i++) {
      var a = pairs[i][0], b = pairs[i][1];
      if (a === 'me' || b === 'me') { continue; }
      var sa = strengthOf(a), sb = strengthOf(b);
      applyScore(a, simGoals(sa, sb), simGoals(sb, sa));
      applyScore(b, simGoals(sb, sa), simGoals(sa, sb));
    }
    applyScore('me', gf, ga);
    applyScore(oppId, ga, gf);
    sortTable();
  }
  function simGoals(atk, def) {
    var exp = 1.35 * Math.pow(atk / Math.max(35, def), 1.9);
    exp = clamp(exp, 0.25, 4.2);
    var g = 0, i;
    for (i = 0; i < 7; i++) { if (Math.random() < exp / 7) { g++; } }
    return g;
  }
  function applyScore(id, gf, ga) {
    var row = tableRow(id);
    if (!row) { return; }
    row.p++; row.gf += gf; row.ga += ga;
    if (gf > ga) { row.w++; row.pts += 3; }
    else if (gf === ga) { row.d++; row.pts += 1; }
    else { row.l++; }
  }

  function newSeason() {
    var rank = ourRank();
    var prize = rank === 1 ? 3200 : (rank === 2 ? 2100 : (rank === 3 ? 1400 : 800));
    var me = tableRow('me');
    S.career.push({ season: S.season, rank: rank, p: me.p, w: me.w, d: me.d, l: me.l, gf: me.gf, ga: me.ga, pts: me.pts });
    S.money += prize;
    S.season++;
    S.seasonOver = false;
    S.round = 0;
    S.table = makeTable();
    S.fixtures = makeFixtures();
    S.challengeLeft = 1;
    S.smatchTickets = 3;
    S.smatchStreak = 0;
    S.fans += 120;
    S.morale = clamp(S.morale + 4, 0, 100);
    S.condition = clamp(S.condition + 20, 0, 100);
    var i;
    for (i = 0; i < DS.TEAMS.length; i++) { DS.TEAMS[i].strength = clamp(DS.TEAMS[i].strength + 1, 55, 92); }
    save();
    toast('시즌 ' + S.season + ' 시작 · 우승 상금 ' + fmt(prize));
    renderAll();
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
      html += '<div class="card"><div class="card-head"><b>킥오프 준비</b><span class="meta">' + (S.round + 1) + '라운드</span></div>' +
        '<div class="vs"><div class="vs-team"><canvas data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="38" height="44"></canvas><span class="nm">' + esc(S.club.name) + '</span></div>' +
        '<div class="vs-mid"><b>VS</b><span>' + DS.FORMATIONS[oppFormation(opp)].tag + '</span></div>' +
        '<div class="vs-team"><canvas data-emblem="' + opp.emblem + '" data-kit="' + opp.kit.shirt + '|' + opp.kit.trim + '" width="38" height="44"></canvas><span class="nm">' + esc(opp.short) + '</span></div></div>' +
        '<div class="kpis" style="margin-bottom:8px"><div class="kpi"><b class="lime">' + xgEstimate(opp.strength).toFixed(1) + '</b><span>xG</span></div>' +
        '<div class="kpi"><b>' + pressLevel() + '</b><span>압박</span></div><div class="kpi"><b class="coral">-' + staminaCost() + '%</b><span>체력</span></div></div>' +
        '<button class="btn primary wide" data-act="kickoff">킥오프</button></div>';
    }
    html += '<div class="card"><div class="card-head"><b>조작 안내</b></div>' +
      '<div class="tiny muted" style="line-height:1.75">· <b>모멘텀</b> — 패스·태클·슈팅으로 게이지를 채웁니다.<br>' +
      '· <b>전술 카드</b> — 하단 손패 3장 중 하나를 발동해 피치 AI와 득점 확률을 바꿉니다.<br>' +
      '· <b>배속 · 전술 · 교체</b> — 경기 중 언제든 조작할 수 있습니다.</div></div>';
    box.innerHTML = html;
    paintEmblems(box);
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
      '</div></div>' +

      '<aside class="m-side">' +
      '<div class="mom">' +
      '<div class="mom-top"><b>MOMENTUM</b><span class="uses" id="m-uses">개입 6/6</span>' +
      '<span class="val"><span id="m-mom-val">0</span><small>/100</small></span></div>' +
      '<div class="mom-bar"><i id="m-mom-fill"></i></div>' +
      '<div class="mom-buffs" id="m-buffs"></div>' +
      '</div>' +
      '<div class="hand v7" id="m-hand"></div>' +
      '<div class="m-live" id="m-live">' +
      '<div class="lv-row"><span class="lv-lbl">점유</span><span class="lv-bar"><i id="m-poss"></i></span><b id="m-poss-v">50%</b></div>' +
      '<div class="lv-row"><span class="lv-lbl">슈팅</span><b class="lv-shots" id="m-shots">0 <em>:</em> 0</b><span class="lv-min" id="m-min">0\'</span></div>' +
      '<div class="lv-tired none" id="m-tired">체력 40% 이하 없음</div>' +
      '</div>' +
      '<div class="m-tac"><span class="ctrl-lbl">전술</span><div class="seg" id="m-tactics">' +
      '<button data-act="tactics" data-v="defense" class="' + (S.tactics === 'defense' ? 'on' : '') + '">수 비</button>' +
      '<button data-act="tactics" data-v="balanced" class="' + (S.tactics === 'balanced' ? 'on' : '') + '">균 형</button>' +
      '<button data-act="tactics" data-v="attack" class="' + (S.tactics === 'attack' ? 'on' : '') + '">공 격</button></div></div>' +
      '<div class="m-acts"><button class="btn dark sm wide" data-act="subs">선수 교체</button></div>' +
      '</aside></div>' +

      '<div class="m-ticker">' +
      '<span class="tk-lbl">🎙 캐스터</span>' +
      '<div class="cmt-body" id="m-comm-body"></div>' +
      '<span class="tk-mgr">👔 ' + esc(mgr().name) + ' · ' + esc(DS.managerTraitText(mgr())) + '</span>' +
      '</div>';
    paintEmblems(box);
    var hand = document.getElementById('m-hand');
    if (hand) { hand.innerHTML = '<div class="tiny" style="color:rgba(233,244,221,.4)">카드를 불러오는 중…</div>'; }
  }

  function updateHud(st) {
    var now = Date.now();
    if (now - hudStamp < 320) { return; }
    hudStamp = now;
    var val = document.getElementById('m-mom-val');
    var fill = document.getElementById('m-mom-fill');
    if (val) { val.textContent = st.momentum; }
    if (fill) { fill.style.width = st.momentum + '%'; }
    var buffs = document.getElementById('m-buffs');
    if (buffs) {
      var names = {
        press: '압박', atk: '침투', def: '차단', build: '빌드업', tempo: '템포',
        setpiece: '세트피스', through: '스루패스', trigger: '트리거',
        tiki: '티키타카', offside: '오프사이드', longshot: '중거리', roar: '일갈'
      };
      var html = '', i;
      for (i = 0; i < st.buffs.length; i++) {
        html += '<span class="buffchip">' + (names[st.buffs[i].key] || st.buffs[i].key) + ' <em>' + st.buffs[i].left + 's</em></span>';
      }
      buffs.innerHTML = html;
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
            '<span class="tc-face">' + (c.face ? '<img src="' + c.face + '" alt="">' : '') + '</span>' +
            '<span class="tc-main"><span class="tag">' + c.tag + '</span><span class="nm">' + c.name + '</span>' +
            '<span class="cd"></span></span>' +
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

  /* ═════════════════  교체 ═════════════════ */
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
    for (i = 0; i < st.bench.length; i++) {
      it = st.bench[i];
      inHTML += '<button class="sub-item' + (subState.inId === it.id ? ' on' : '') + (it.used ? ' off' : '') + '" data-act="subpick" data-side="in" data-id="' + it.id + '" ' + (it.used ? 'disabled' : '') + '>' +
        '<span class="sp">' + it.pos + '</span><span class="sn">' + esc(it.name) + '</span><span class="sr">' + it.rating + '</span></button>';
    }
    ov.innerHTML = '<div class="sub-panel">' +
      '<div class="sub-head"><b>선수 교체</b><span>남은 교체 ' + st.subsLeft + '회' + (halftime ? ' · 하프타임' : '') + '</span></div>' +
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
    save();
    closeModal();
    renderAll();
    toast('IN ' + cand.name + ' / OUT ' + outP.name);
  }

  function onAction(act, t) {
    var id, v, j;
    if (!act) { return; }
    if (act === 'closemodal') { closeModal(); return; }
    if (act === 'tab') { closeModal(); setTab(t.getAttribute('data-tab')); return; }

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

    if (act === 'kickoff') { startMatch('league'); return; }
    if (act === 'challenge') { startMatch('challenge'); return; }
    if (act === 'smatch') {
      var key2 = t.getAttribute('data-k'), list = smatchList(), i2;
      for (i2 = 0; i2 < list.length; i2++) { if (list[i2].key === key2) { startMatch('smatch', { teamId: list[i2].team.id }); return; } }
      return;
    }
    if (act === 'smatchticket') {
      if (S.money < 800) { toast('금화가 부족합니다.'); return; }
      S.money -= 800; S.smatchTickets++; save(); renderAll(); toast('S매치 이용권 +1'); return;
    }
    if (act === 'newseason') { newSeason(); return; }
    if (act === 'report') { if (S.lastReport) { showReport(S.lastReport); } return; }

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
    });
    if (global.addEventListener) { global.addEventListener('orientationchange', checkRotate); }
    checkRotate();

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
    renderAll: renderAll
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);
