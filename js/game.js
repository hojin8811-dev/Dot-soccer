/*! 도트싸커 v1 — 게임 상태, 저장, UI (game.js) */
(function (global) {
  'use strict';

  var DS = global.DS;
  var U = DS.util;
  var fmt = U.fmt;
  var pick = U.pick;
  var clamp = U.clamp;
  var chance = U.chance;

  var SAVE_KEY = 'dot-soccer-v1-save';
  var S = null;

  var LEAGUE_SIZE = 8;
  var ROUNDS = 7;

  /* ─────────────────────────  상태 생성  ───────────────────────── */
  function makeTable() {
    var rows = [{ id: 'me', name: '도트 유나이티드', short: '도트', p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }];
    var i;
    for (i = 0; i < DS.TEAMS.length; i++) {
      rows.push({ id: DS.TEAMS[i].id, name: DS.TEAMS[i].name, short: DS.TEAMS[i].short, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    }
    return rows;
  }

  function makeFixtures() {
    var ids = ['me'];
    var i;
    for (i = 0; i < DS.TEAMS.length; i++) { ids.push(DS.TEAMS[i].id); }
    var n = ids.length;
    var arr = ids.slice(1);
    var rounds = [];
    var r, j;
    for (r = 0; r < n - 1; r++) {
      var pairs = [];
      pairs.push([ids[0], arr[arr.length - 1 - 0]]);
      for (j = 0; j < (n - 2) / 2; j++) {
        pairs.push([arr[j], arr[n - 2 - j]]);
      }
      rounds.push(pairs);
      /* 회전 */
      var last = arr.pop();
      arr.unshift(last);
    }
    return rounds;
  }

  function autoLineup(squad, formation) {
    var slots = DS.FORMATIONS[formation].slots;
    var used = {};
    var lineup = [];
    var i, k, best, bestScore;
    for (i = 0; i < slots.length; i++) {
      best = null;
      bestScore = -1;
      for (k = 0; k < squad.length; k++) {
        var p = squad[k];
        if (used[p.id] || p.pos !== slots[i].pos) { continue; }
        var o = DS.overall(p, slots[i].pos);
        if (o > bestScore) { bestScore = o; best = p; }
      }
      if (best) { lineup.push(best.id); used[best.id] = true; } else { lineup.push(null); }
    }
    /* 빈 슬롯 채우기 */
    for (i = 0; i < lineup.length; i++) {
      if (lineup[i]) { continue; }
      best = null; bestScore = -1;
      for (k = 0; k < squad.length; k++) {
        if (used[squad[k].id]) { continue; }
        var oo = DS.overall(squad[k], slots[i].pos);
        if (oo > bestScore) { bestScore = oo; best = squad[k]; }
      }
      if (best) { lineup[i] = best.id; used[best.id] = true; }
    }
    return lineup;
  }

  function defaultState() {
    DS.resetNames();
    var squad = DS.makeInitialSquad();
    var st = {
      v: 1,
      club: {
        name: '도트 유나이티드',
        emblem: 'flame',
        kit: { shirt: '#e23b3b', shorts: '#ffffff', trim: '#ffd24a' }
      },
      money: 4800,
      fans: 1280,
      morale: 64,
      season: 1,
      formation: '4-3-3',
      tactics: 'balanced',
      squad: squad,
      lineup: [],
      table: makeTable(),
      fixtures: makeFixtures(),
      round: 0,
      challengeLeft: 1,
      seasonOver: false,
      lastResult: null,
      lastScout: null,
      totals: { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, conceded: 0 }
    };
    st.lineup = autoLineup(squad, st.formation);
    return st;
  }

  /* ─────────────────────────  저장/불러오기  ───────────────────────── */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    } catch (e) { /* 저장 실패는 조용히 무시 */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) { return null; }
      var data = JSON.parse(raw);
      if (!data || data.v !== 1 || !data.squad || !data.lineup) { return null; }
      if (!data.club || !data.table || !data.fixtures) { return null; }
      if (!DS.FORMATIONS[data.formation]) { data.formation = '4-3-3'; }
      if (!DS.KIT_COLORS) { return null; }
      /* 구버전 저장 데이터 보정 */
      if (!data.totals) { data.totals = { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, conceded: 0 }; }
      if (typeof data.challengeLeft !== 'number') { data.challengeLeft = 1; }
      if (typeof data.morale !== 'number') { data.morale = 60; }
      if (typeof data.seasonOver !== 'boolean') { data.seasonOver = false; }
      if (typeof data.fans !== 'number') { data.fans = 1000; }
      if (typeof data.money !== 'number') { data.money = 3000; }
      if (!data.table || !data.table.length) { data.table = makeTable(); }
      if (!data.fixtures || !data.fixtures.length) { data.fixtures = makeFixtures(); }
      if (!data.lineup || data.lineup.length !== 11) { data.lineup = autoLineup(data.squad, data.formation); }
      if (!data.club.kit.shorts) { data.club.kit.shorts = '#ffffff'; }
      if (!data.club.kit.trim) { data.club.kit.trim = '#ffd24a'; }
      return data;
    } catch (e) {
      return null;
    }
  }

  /* ─────────────────────────  계산  ───────────────────────── */
  function byId(id) {
    var i;
    for (i = 0; i < S.squad.length; i++) {
      if (S.squad[i].id === id) { return S.squad[i]; }
    }
    return null;
  }

  function starters() {
    var out = [];
    var i;
    for (i = 0; i < S.lineup.length; i++) {
      var p = byId(S.lineup[i]);
      if (p) { out.push(p); }
    }
    return out;
  }

  function benchPlayers() {
    var inLine = {};
    var i;
    for (i = 0; i < S.lineup.length; i++) { inLine[S.lineup[i]] = true; }
    return S.squad.filter(function (p) { return !inLine[p.id]; });
  }

  function adjacent(a, b) {
    var order = ['GK', 'DF', 'MF', 'FW'];
    return Math.abs(order.indexOf(a) - order.indexOf(b)) === 1;
  }

  function chemistry() {
    var f = DS.FORMATIONS[S.formation];
    var matched = 0, near = 0, off = 0, rare = 0, missing = 0;
    var i, p, slot;
    for (i = 0; i < f.slots.length; i++) {
      slot = f.slots[i];
      p = byId(S.lineup[i]);
      if (!p) { missing++; continue; }
      if (p.pos === slot.pos) { matched++; } else if (adjacent(p.pos, slot.pos)) { near++; } else { off++; }
      rare += DS.RARITY_ORDER.indexOf(p.rarity);
    }
    var v = 46 + matched * 2.6 + near * 0.4 - off * 4.5 - missing * 6 + rare * 0.55;
    return Math.round(clamp(v, 5, 99));
  }

  function teamPower() {
    var f = DS.FORMATIONS[S.formation];
    var sum = 0, n = 0, i, p;
    for (i = 0; i < f.slots.length; i++) {
      p = byId(S.lineup[i]);
      if (!p) { continue; }
      sum += DS.overall(p, f.slots[i].pos);
      n++;
    }
    var base = n ? sum / n : 40;
    return Math.round(base + (chemistry() - 55) / 9);
  }

  function ourStrength() { return teamPower(); }

  function opponentTeam(id) {
    var i;
    for (i = 0; i < DS.TEAMS.length; i++) {
      if (DS.TEAMS[i].id === id) { return DS.TEAMS[i]; }
    }
    return DS.TEAMS[0];
  }

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
    for (i = 0; i < S.table.length; i++) {
      if (S.table[i].id === id) { return S.table[i]; }
    }
    return null;
  }

  function ourRank() {
    sortTable();
    var i;
    for (i = 0; i < S.table.length; i++) {
      if (S.table[i].id === 'me') { return i + 1; }
    }
    return 8;
  }

  function currentOpponent() {
    if (S.round >= S.fixtures.length) { return null; }
    var pairs = S.fixtures[S.round];
    var i;
    for (i = 0; i < pairs.length; i++) {
      if (pairs[i][0] === 'me') { return { id: pairs[i][1], home: true }; }
      if (pairs[i][1] === 'me') { return { id: pairs[i][0], home: false }; }
    }
    return null;
  }

  function playMatchRows(ourScore, oppScore, oppId) {
    /* 같은 라운드의 다른 경기 결과 시뮬레이션 */
    var pairs = S.fixtures[S.round];
    var i, j;
    for (i = 0; i < pairs.length; i++) {
      var a = pairs[i][0], b = pairs[i][1];
      if (a === 'me' || b === 'me') { continue; }
      var sa = strengthOf(a), sb = strengthOf(b);
      var ga = simGoals(sa, sb), gb = simGoals(sb, sa);
      applyScore(a, ga, gb);
      applyScore(b, gb, ga);
    }
    applyScore('me', ourScore, oppScore);
    applyScore(oppId, oppScore, ourScore);
    sortTable();
  }

  function strengthOf(id) {
    if (id === 'me') { return ourStrength(); }
    return opponentTeam(id).strength;
  }

  function simGoals(atk, def) {
    var exp = 1.35 * Math.pow(atk / Math.max(35, def), 1.9);
    exp = clamp(exp, 0.25, 4.2);
    var g = 0, i;
    for (i = 0; i < 7; i++) {
      if (Math.random() < exp / 7) { g++; }
    }
    return g;
  }

  function applyScore(id, gf, ga) {
    var row = tableRow(id);
    if (!row) { return; }
    row.p++;
    row.gf += gf;
    row.ga += ga;
    if (gf > ga) { row.w++; row.pts += 3; } else if (gf === ga) { row.d++; row.pts += 1; } else { row.l++; }
  }

  /* ─────────────────────────  화면 공통  ───────────────────────── */
  var TOAST_T = null;
  function toast(msg) {
    var box = document.getElementById('toast');
    if (!box) { return; }
    box.textContent = msg;
    box.classList.add('on');
    clearTimeout(TOAST_T);
    TOAST_T = setTimeout(function () { box.classList.remove('on'); }, 1800);
  }

  function starsHTML(n) {
    var s = '';
    var i;
    for (i = 1; i <= 5; i++) { s += '<span class="' + (i <= n ? 'st on' : 'st') + '">★</span>'; }
    return s;
  }

  function hammer(n) { return fmt(n); }

  function headerHTML() {
    return '<div class="logo"><span class="logo-ball"></span><b>도트싸커</b></div>' +
      '<div class="hchips">' +
      '<span class="hchip coin">🪙 ' + fmt(S.money) + '</span>' +
      '<span class="hchip fan">👥 ' + fmt(S.fans) + '</span>' +
      '<span class="hchip season">시즌 ' + S.season + '</span>' +
      '</div>';
  }

  function renderHeader() {
    var h = document.getElementById('topbar');
    if (h) { h.innerHTML = headerHTML(); }
  }

  /* ─────────────────────────  홈  ───────────────────────── */
  function renderHome() {
    var box = document.getElementById('screen-home');
    if (!box) { return; }
    var em = S.club.emblem;
    var rank = ourRank();
    var power = teamPower();
    var chem = chemistry();
    var rows = '';
    var i;
    sortTable();
    for (i = 0; i < S.table.length; i++) {
      var r = S.table[i];
      var isMe = r.id === 'me';
      rows += '<tr class="' + (isMe ? 'me' : '') + '">' +
        '<td class="rk">' + (i + 1) + '</td>' +
        '<td class="tm">' + (isMe ? '<i class="dot me"></i>' : '<i class="dot"></i>') + esc(isMe ? S.club.name : r.name) + '</td>' +
        '<td class="num">' + r.p + '</td>' +
        '<td class="num">' + (r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga) + '</td>' +
        '<td class="num pts">' + r.pts + '</td>' +
        '</tr>';
    }

    var next = currentOpponent();
    var nextHTML = '';
    if (S.seasonOver) {
      var winner = S.table[0];
      nextHTML =
        '<div class="card cta-card season-end">' +
        '<div class="card-title">🏆 시즌 ' + S.season + ' 종료</div>' +
        '<div class="season-winner">우승: <b>' + esc(winner.id === 'me' ? S.club.name : winner.name) + '</b></div>' +
        '<div class="season-me">우리 구단 최종 <b>' + ourRank() + '위</b> · 승점 ' + tableRow('me').pts + '</div>' +
        '<button class="cta" data-act="newseason">새 시즌 시작</button>' +
        '</div>';
    } else if (next) {
      var opp = opponentTeam(next.id);
      nextHTML =
        '<div class="card cta-card">' +
        '<div class="card-title">📅 ' + (S.round + 1) + '라운드 · ' + (next.home ? '홈' : '원정') + '</div>' +
        '<div class="vsrow">' +
        '<div class="vs-team"><canvas class="vs-emblem" data-emblem="' + em + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="54" height="62"></canvas><span>' + esc(S.club.name) + '</span></div>' +
        '<div class="vs-mid"><b>VS</b><span>' + ['19:30', '20:00', '21:00'][S.round % 3] + '</span></div>' +
        '<div class="vs-team"><canvas class="vs-emblem" data-emblem="' + opp.emblem + '" data-kit="' + opp.kit.shirt + '|' + opp.kit.trim + '" width="54" height="62"></canvas><span>' + esc(opp.name) + '</span></div>' +
        '</div>' +
        '<button class="cta" data-act="kickoff">오늘의 경기 킥오프</button>' +
        '</div>';
    }

    box.innerHTML =
      '<div class="card club-card">' +
      '<canvas class="club-emblem" data-emblem="' + em + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="64" height="74"></canvas>' +
      '<div class="club-main">' +
      '<div class="club-name">' + esc(S.club.name) + '</div>' +
      '<div class="club-stars">' + starsHTML(DS.stars(power)) + '<span class="power">전력 ' + power + '</span></div>' +
      '<div class="club-sub">리그 ' + rank + '위 · 조직력 ' + chem + ' · 사기 ' + S.morale + '</div>' +
      '</div>' +
      '<button class="mini" data-act="tab" data-tab="scout">관리</button>' +
      '</div>' +
      nextHTML +
      '<div class="card">' +
      '<div class="card-title">🏆 리그 순위표 <span class="muted">8팀 · 7라운드</span></div>' +
      '<table class="ltable"><thead><tr><th>#</th><th>구단</th><th>경기</th><th>득실</th><th>승점</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div>' +
      '<div class="card challenge-card">' +
      '<div class="chal-left"><div class="card-title">⚔️ 챌린지 매치</div>' +
      '<div class="muted">강호와 붙어 보상 2배. 오늘 ' + S.challengeLeft + '회 남음.</div></div>' +
      '<button class="cta ghost small" data-act="challenge" ' + (S.challengeLeft <= 0 ? 'disabled' : '') + '>도전</button>' +
      '</div>' +
      statCard() +
      (S.lastResult ? lastResultCard() : '');

    paintEmblems(box);
  }

  function statCard() {
    var t = S.totals;
    var winRate = t.matches ? Math.round(t.wins / t.matches * 100) : 0;
    return '<div class="card statcard">' +
      '<div class="card-title">📊 시즌 기록 <span class="muted">승률 ' + winRate + '%</span></div>' +
      '<div class="statgrid">' +
      '<div><b>' + t.matches + '</b><span>경기</span></div>' +
      '<div><b class="w">' + t.wins + '</b><span>승</span></div>' +
      '<div><b>' + t.draws + '</b><span>무</span></div>' +
      '<div><b class="l">' + t.losses + '</b><span>패</span></div>' +
      '<div><b>' + t.goals + '</b><span>득점</span></div>' +
      '<div><b>' + t.conceded + '</b><span>실점</span></div>' +
      '</div>' +
      '<div class="morale-row"><span>팀 사기</span><div class="morale"><i style="width:' + S.morale + '%"></i></div><b>' + S.morale + '</b></div>' +
      '</div>';
  }

  function lastResultCard() {
    var r = S.lastResult;
    return '<div class="card last-result">' +
      '<div class="card-title">📋 최근 경기</div>' +
      '<div class="lr-row"><span>' + esc(r.awayName) + '</span><b class="lr-score">' + r.gf + ' : ' + r.ga + '</b></div>' +
      '<div class="muted">MVP ' + esc(r.mvp) + ' · 평점 ' + r.mvpRating.toFixed(1) + ' · 보상 🪙' + fmt(r.reward) + '</div>' +
      '</div>';
  }

  function paintEmblems(root) {
    var canvases = root.querySelectorAll('canvas[data-emblem]');
    var i;
    for (i = 0; i < canvases.length; i++) {
      var c = canvases[i];
      var parts = (c.getAttribute('data-kit') || '#e23b3b|#ffd24a').split('|');
      DS.Art.drawEmblem(c, c.getAttribute('data-emblem'), { shirt: parts[0], trim: parts[1] });
    }
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ─────────────────────────  스쿼드  ───────────────────────── */
  var selectedId = null;

  function rarityClass(r) { return 'r-' + r; }

  function renderSquad() {
    var box = document.getElementById('screen-squad');
    if (!box) { return; }
    var f = DS.FORMATIONS[S.formation];
    var chem = chemistry();
    var power = teamPower();

    var chips = '';
    var keys = ['4-3-3', '4-4-2', '3-5-2'];
    var i;
    for (i = 0; i < keys.length; i++) {
      chips += '<button class="fchip ' + (S.formation === keys[i] ? 'on' : '') + '" data-act="formation" data-f="' + keys[i] + '">' + keys[i] + '</button>';
    }

    var playersHTML = '';
    for (i = 0; i < f.slots.length; i++) {
      var slot = f.slots[i];
      var p = byId(S.lineup[i]);
      if (p) {
        playersHTML += '<button class="pdot ' + rarityClass(p.rarity) + (selectedId === p.id ? ' sel' : '') + '" ' +
          'data-x="' + slot.x + '" data-y="' + slot.y + '" data-act="starter" data-id="' + p.id + '" data-slot="' + i + '">' +
          '<canvas class="pcanvas" width="30" height="40" data-player="' + p.id + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.shorts + '"></canvas>' +
          '<span class="plabel"><i>' + slot.role + '</i>' + esc(shortName(p.name)) + '</span>' +
          '</button>';
      } else {
        playersHTML += '<button class="pdot empty" data-x="' + slot.x + '" data-y="' + slot.y + '" data-act="starter" data-slot="' + i + '"><span class="plabel"><i>' + slot.role + '</i>공석</span></button>';
      }
    }

    var bench = benchPlayers();
    var benchHTML = '';
    if (!bench.length) {
      benchHTML = '<div class="bench-empty">후보 선수가 없습니다. 스카우트에서 영입하세요.</div>';
    }
    for (i = 0; i < bench.length; i++) {
      var b = bench[i];
      var ovr = DS.overall(b);
      benchHTML += '<button class="pcard ' + rarityClass(b.rarity) + (selectedId === b.id ? ' sel' : '') + '" data-act="bench" data-id="' + b.id + '">' +
        '<span class="pc-rare">' + DS.RARITY[b.rarity].name + '</span>' +
        '<span class="pc-ovr">' + ovr + '</span>' +
        '<canvas class="pcanvas small" width="26" height="34" data-player="' + b.id + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.shorts + '"></canvas>' +
        '<span class="pc-pos">' + b.pos + '</span>' +
        '<span class="pc-name">' + esc(shortName(b.name)) + '</span>' +
        '</button>';
    }

    var selP = selectedId ? byId(selectedId) : null;
    var detail = '';
    if (selP) {
      var isStarter = S.lineup.indexOf(selP.id) >= 0;
      detail = '<div class="sel-bar">' +
        '<div><b>' + esc(selP.name) + '</b> <span class="muted">' + selP.pos + ' · ' + DS.RARITY[selP.rarity].name + ' · OVR ' + DS.overall(selP) + '</span>' +
        '<div class="statline"><span>공격 ' + selP.stats.atk + '</span><span>수비 ' + selP.stats.def + '</span><span>속도 ' + selP.stats.spd + '</span></div></div>' +
        '<button class="mini" data-act="clearsel">닫기</button>' +
        '</div>' +
        '<div class="muted tiny">' + (isStarter ? '후보 선수를 눌러 교체하세요.' : '피치의 선수를 눌러 자리를 바꾸세요.') + '</div>';
    }

    box.innerHTML =
      '<div class="squad-top">' +
      '<div class="fchips">' + chips + '</div>' +
      '<div class="team-meta"><span class="pill">조직력 <b class="chem">' + chem + '</b></span><span class="pill">종합 <b>' + power + '</b></span></div>' +
      '</div>' +
      '<div class="pitch" id="pitch-squad">' +
      '<canvas id="pitch-bg" class="pitch-bg"></canvas>' +
      playersHTML +
      '</div>' +
      '<div class="bench">' +
      '<div class="bench-head"><span>후보 선수</span><span class="muted tiny">탭해서 교체</span></div>' +
      '<div class="bench-list">' + benchHTML + '</div>' +
      '</div>' +
      detail;

    drawPitchBG();
    placePitchPlayers();
    var canvases = box.querySelectorAll('canvas[data-player]');
    for (i = 0; i < canvases.length; i++) {
      var cv = canvases[i];
      var pp = byId(cv.getAttribute('data-player'));
      if (!pp) { continue; }
      var ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      var parts = (cv.getAttribute('data-kit') || '#e23b3b|#fff').split('|');
      DS.Art.drawPlayer(ctx, cv.width / 2, cv.height - 3, 2.1, { shirt: parts[0], shorts: parts[1] }, pp, { frame: 0, shadow: false, number: 0 });
    }
  }

  function shortName(n) {
    if (!n) { return ''; }
    if (n.length <= 3) { return n; }
    return n.slice(1);
  }

  var pitchBox = { x: 0, y: 0, w: 358, h: 320 };

  function drawPitchBG() {
    var cv = document.getElementById('pitch-bg');
    if (!cv) { return; }
    var wrap = cv.parentNode;
    var w = wrap.clientWidth || 358;
    var h = wrap.clientHeight || 320;
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var m = DS.Art.pitchMargin(w, h);
    pitchBox = { x: m, y: m, w: w - m * 2, h: h - m * 2 };
    DS.Art.drawPitch(ctx, w, h, { margin: m });
  }

  /* 피치 위 선수를 경기장 좌표(0~100)에 맞춰 배치 */
  function placePitchPlayers() {
    var dots = document.querySelectorAll('#pitch-squad .pdot');
    var i;
    for (i = 0; i < dots.length; i++) {
      var x = parseFloat(dots[i].getAttribute('data-x'));
      var y = parseFloat(dots[i].getAttribute('data-y'));
      if (isNaN(x) || isNaN(y)) { continue; }
      var px = pitchBox.x + (x / 100) * pitchBox.w;
      var py = pitchBox.y + (y / 100) * pitchBox.h;
      dots[i].style.left = px.toFixed(1) + 'px';
      dots[i].style.top = py.toFixed(1) + 'px';
    }
  }

  /* ─────────────────────────  스카우트/구단 관리  ───────────────────────── */
  function renderScout() {
    var box = document.getElementById('screen-scout');
    if (!box) { return; }
    var squadList = S.squad.slice().sort(function (a, b) { return DS.overall(b) - DS.overall(a); });
    var rows = '';
    var i;
    for (i = 0; i < squadList.length; i++) {
      var p = squadList[i];
      var isStarter = S.lineup.indexOf(p.id) >= 0;
      var cost = trainCost(p);
      rows += '<div class="train-row">' +
        '<span class="tr-rare ' + rarityClass(p.rarity) + '">' + DS.RARITY[p.rarity].name + '</span>' +
        '<span class="tr-name">' + esc(p.name) + (isStarter ? '<i class="tr-tag">선발</i>' : '') + '</span>' +
        '<span class="tr-pos">' + p.pos + '</span>' +
        '<span class="tr-ovr">' + DS.overall(p) + '</span>' +
        '<span class="tr-lv">Lv.' + p.level + '</span>' +
        '<button class="mini train" data-act="train" data-id="' + p.id + '" ' + (S.money < cost ? 'disabled' : '') + '>🪙' + fmt(cost) + '</button>' +
        '</div>';
    }

    var swatches = '';
    for (i = 0; i < DS.KIT_COLORS.length; i++) {
      swatches += '<button class="swatch ' + (S.club.kit.shirt === DS.KIT_COLORS[i] ? 'on' : '') + '" style="background:' + DS.KIT_COLORS[i] + '" data-act="kit" data-c="' + DS.KIT_COLORS[i] + '" aria-label="유니폼 색"></button>';
    }
    var swatches2 = '';
    for (i = 0; i < DS.KIT_COLORS.length; i++) {
      swatches2 += '<button class="swatch ' + (S.club.kit.shorts === DS.KIT_COLORS[i] ? 'on' : '') + '" style="background:' + DS.KIT_COLORS[i] + '" data-act="shorts" data-c="' + DS.KIT_COLORS[i] + '" aria-label="반바지 색"></button>';
    }
    var emblems = '';
    for (i = 0; i < DS.EMBLEMS.length; i++) {
      var e = DS.EMBLEMS[i];
      emblems += '<button class="embpick ' + (S.club.emblem === e.id ? 'on' : '') + '" data-act="emblem" data-e="' + e.id + '" aria-label="' + e.name + '">' +
        '<canvas width="34" height="40" data-emblem="' + e.id + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '"></canvas></button>';
    }

    var last = '';
    if (S.lastScout) {
      var sp = S.lastScout;
      last = '<div class="scout-result ' + rarityClass(sp.rarity) + '">' +
        '<div class="sr-head">' + DS.RARITY[sp.rarity].name + ' 등급 영입!</div>' +
        '<div class="sr-body"><canvas width="40" height="52" data-player="' + sp.id + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.shorts + '"></canvas>' +
        '<div><b>' + esc(sp.name) + '</b><span class="muted">' + sp.pos + ' · OVR ' + DS.overall(sp) + '</span></div></div>' +
        '</div>';
    }

    box.innerHTML =
      '<div class="card scout-top">' +
      '<div class="scout-money">보유 금화 <b>🪙 ' + fmt(S.money) + '</b><span class="muted tiny">선수 ' + S.squad.length + '/20명</span></div>' +
      '<div class="scout-btns">' +
      '<button class="scout-btn normal" data-act="scout" data-kind="normal" ' + (S.money < 600 ? 'disabled' : '') + '><b>일반 스카우트</b><span>동~금</span><em>🪙 600</em></button>' +
      '<button class="scout-btn special" data-act="scout" data-kind="special" ' + (S.money < 2200 ? 'disabled' : '') + '><b>스페셜 스카우트</b><span>은~레전드</span><em>🪙 2,200</em></button>' +
      '</div>' +
      (last || '') +
      '</div>' +
      '<div class="card">' +
      '<div class="card-title">🏋️ 선수 훈련 <span class="muted tiny">금화로 능력치 강화</span></div>' +
      '<div class="train-list">' + rows + '</div>' +
      '</div>' +
      '<div class="card">' +
      '<div class="card-title">🎨 구단 꾸미기</div>' +
      '<label class="field"><span>구단명</span><input id="club-name-input" maxlength="12" value="' + esc(S.club.name) + '"><button class="mini" data-act="rename">저장</button></label>' +
      '<div class="kit-row"><div class="kit-preview"><canvas width="44" height="56" id="kit-tshirt"></canvas></div>' +
      '<div class="kit-cols"><div class="sw-line">유니폼' + swatches + '</div><div class="sw-line">반바지' + swatches2 + '</div></div></div>' +
      '<div class="emb-row">' + emblems + '</div>' +
      '</div>' +
      '<div class="card danger-zone">' +
      '<button class="mini ghost" data-act="reset">게임 초기화</button>' +
      '<span class="muted tiny">저장 데이터가 삭제됩니다.</span>' +
      '</div>';

    paintEmblems(box);
    /* 스카우트 결과 선수 도트 */
    var pc = box.querySelector('#kit-tshirt');
    if (pc) {
      var c2 = pc.getContext('2d');
      DS.Art.drawPlayer(c2, pc.width / 2, pc.height - 2, 2.9, S.club.kit, { skin: '#f2c49b', hair: '#2b1d14' }, { frame: 1, shadow: false, number: 9 });
    }
    var pl = box.querySelector('canvas[data-player="' + (S.lastScout ? S.lastScout.id : '') + '"]');
    if (pl && S.lastScout) {
      var c3 = pl.getContext('2d');
      DS.Art.drawPlayer(c3, pl.width / 2, pl.height - 2, 2.6, S.club.kit, S.lastScout, { frame: 0, shadow: false });
    }
  }

  function trainCost(p) {
    return 200 + p.level * 120 + DS.RARITY_ORDER.indexOf(p.rarity) * 80;
  }

  function doTrain(id) {
    var p = byId(id);
    if (!p) { return; }
    var cost = trainCost(p);
    if (S.money < cost) { toast('금화가 부족합니다.'); return; }
    if (p.level >= 10) { toast('최대 레벨입니다.'); return; }
    S.money -= cost;
    p.level++;
    var w = DS.POS[p.pos].weights;
    var r = Math.random();
    if (r < w.atk + 0.3) { p.stats.atk = clamp(p.stats.atk + U.irange(1, 2), 20, 99); }
    if (r < w.def + 0.3) { p.stats.def = clamp(p.stats.def + U.irange(1, 2), 20, 99); }
    p.stats.spd = clamp(p.stats.spd + (chance(0.45) ? 1 : 0), 20, 99);
    toast(p.name + ' 훈련 완료! Lv.' + p.level);
    save();
    renderAll();
  }

  function doScout(kind) {
    var cost = kind === 'normal' ? 600 : 2200;
    if (S.money < cost) { toast('금화가 부족합니다.'); return; }
    if (S.squad.length >= 20) { toast('선수단이 가득 찼습니다(20명).'); return; }
    S.money -= cost;
    var p = DS.makePlayer({ rarity: DS.pickRarity(kind) });
    S.squad.push(p);
    S.lastScout = p;
    toast(DS.RARITY[p.rarity].name + ' 등급 ' + p.name + ' 영입!');
    save();
    renderAll();
    var card = document.querySelector('.scout-result');
    if (card) { card.classList.add('pop'); }
  }

  /* ─────────────────────────  경기 시작/정산  ───────────────────────── */
  function currentOpponentFull() {
    var o = currentOpponent();
    if (!o) { return null; }
    return { team: opponentTeam(o.id), home: o.home };
  }

  function buildAwaySquad(team) {
    var out = [];
    var roles = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW'];
    var i;
    for (i = 0; i < 11; i++) {
      var p = DS.makePlayer({ pos: roles[i], rarity: 'eun' });
      var target = team.strength + U.irange(-6, 6);
      var scale = target / Math.max(30, DS.overall(p));
      p.stats.atk = clamp(Math.round(p.stats.atk * scale), 25, 95);
      p.stats.def = clamp(Math.round(p.stats.def * scale), 25, 95);
      p.stats.spd = clamp(Math.round(p.stats.spd * scale), 25, 95);
      out.push(p);
    }
    return out;
  }

  function startMatch(kind) {
    var oppFull, oppTeam, oppId, isChallenge = kind === 'challenge';
    if (isChallenge) {
      /* 가장 강한 팀과의 챌린지 */
      var best = DS.TEAMS[0];
      var i;
      for (i = 0; i < DS.TEAMS.length; i++) {
        if (DS.TEAMS[i].strength > best.strength) { best = DS.TEAMS[i]; }
      }
      oppTeam = best;
      oppId = best.id;
    } else {
      oppFull = currentOpponentFull();
      if (!oppFull) { toast('이번 시즌 일정이 끝났습니다.'); return; }
      oppTeam = oppFull.team;
      oppId = oppTeam.id;
    }

    var lineup = [];
    var f = DS.FORMATIONS[S.formation];
    var k;
    for (k = 0; k < S.lineup.length; k++) {
      var p = byId(S.lineup[k]);
      if (!p) { continue; }
      lineup.push({ player: p, role: f.slots[k].role, pos: f.slots[k].pos, x: f.slots[k].x, y: f.slots[k].y });
    }
    if (lineup.length < 8) { toast('선발 선수가 부족합니다.'); return; }

    setTab('match');
    renderMatchLive(oppTeam, oppId, lineup, isChallenge);

    var cfg = {
      homeName: S.club.name,
      awayName: oppTeam.name,
      homeKit: S.club.kit,
      awayKit: oppTeam.kit,
      homeEmblem: S.club.emblem,
      awayEmblem: oppTeam.emblem,
      lineup: lineup,
      awayPlayers: buildAwaySquad(oppTeam),
      tactics: S.tactics,
      challenge: isChallenge,
      onEnd: function (result) { finishMatch(result, oppTeam, oppId, isChallenge); }
    };
    global.setTimeout(function () {
      if (DS.Match) { DS.Match.start(cfg); }
    }, 60);
  }

  function finishMatch(res, oppTeam, oppId, isChallenge) {
    var gf = res.homeScore, ga = res.awayScore;
    var reward = 0;
    if (gf > ga) { reward = 420 + gf * 60 + (gf - ga) * 40; }
    else if (gf === ga) { reward = 210; }
    else { reward = 110 + gf * 30; }
    if (isChallenge) { reward = Math.round(reward * 2); }

    S.money += reward;
    S.totals.matches++;
    S.totals.goals += gf;
    S.totals.conceded += ga;
    if (gf > ga) { S.totals.wins++; S.morale = clamp(S.morale + 6, 0, 100); S.fans += U.irange(40, 90); }
    else if (gf === ga) { S.totals.draws++; }
    else { S.totals.losses++; S.morale = clamp(S.morale - 5, 0, 100); S.fans = Math.max(100, S.fans - U.irange(10, 40)); }

    if (!isChallenge) {
      playMatchRows(gf, ga, oppId);
      S.round++;
      if (S.round >= S.fixtures.length) { S.seasonOver = true; }
    } else {
      S.challengeLeft = Math.max(0, S.challengeLeft - 1);
    }

    res.reward = reward;
    res.points = isChallenge ? null : (gf > ga ? 3 : (gf === ga ? 1 : 0));
    res.homeName = S.club.name;
    res.awayShort = oppTeam.short;

    S.lastResult = {
      awayName: oppTeam.name, gf: gf, ga: ga,
      mvp: res.mvp ? res.mvp.name : '-',
      mvpRating: res.mvp ? res.mvpRating : 6,
      reward: reward
    };
    save();
    renderHeader();
  }

  function newSeason() {
    var rank = ourRank();
    var prize = rank === 1 ? 3000 : (rank === 2 ? 2000 : (rank === 3 ? 1400 : 800));
    S.money += prize;
    S.season++;
    S.seasonOver = false;
    S.round = 0;
    S.table = makeTable();
    S.fixtures = makeFixtures();
    S.challengeLeft = 1;
    S.fans += 120;
    S.morale = clamp(S.morale + 4, 0, 100);
    /* 상대 팀 전력 약간 상승 */
    var i;
    for (i = 0; i < DS.TEAMS.length; i++) {
      DS.TEAMS[i].strength = clamp(DS.TEAMS[i].strength + 1, 55, 92);
    }
    save();
    toast('시즌 ' + S.season + ' 시작! 우승 상금 🪙' + fmt(prize));
    renderAll();
  }

  /* ─────────────────────────  경기 화면  ───────────────────────── */
  function renderMatchIdle() {
    var box = document.getElementById('screen-match');
    if (!box) { return; }
    if (DS.Match && DS.Match.running) { return; }
    var next = currentOpponentFull();
    var html = '';
    if (S.seasonOver) {
      html += '<div class="card"><div class="card-title">🏟️ 도트 경기장</div><div class="muted">이번 시즌 일정이 모두 끝났습니다. 클럽 홈에서 새 시즌을 시작하세요.</div></div>';
    } else if (next) {
      html += '<div class="card"><div class="card-title">🏟️ 도트 경기장</div>' +
        '<div class="vsrow small">' +
        '<div class="vs-team"><canvas class="vs-emblem" data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="44" height="50"></canvas><span>' + esc(S.club.name) + '</span></div>' +
        '<div class="vs-mid"><b>VS</b><span>' + esc(next.team.name) + '</span></div>' +
        '<div class="vs-team"><canvas class="vs-emblem" data-emblem="' + next.team.emblem + '" data-kit="' + next.team.kit.shirt + '|' + next.team.kit.trim + '" width="44" height="50"></canvas><span>' + esc(next.team.short) + '</span></div>' +
        '</div>' +
        '<button class="cta" data-act="kickoff">킥오프!</button>' +
        '</div>';
    }
    html += '<div class="card guide">' +
      '<div class="card-title">조작 안내</div>' +
      '<ul class="guide-list">' +
      '<li><b>배속</b> ×1 / ×2 / ×3 으로 경기 속도를 조절</li>' +
      '<li><b>전술</b> 공격적 · 균형 · 수비적으로 실시간 지시</li>' +
      '<li>골이 들어가면 중계창이 뜨겁게 달아오릅니다 🔥</li>' +
      '<li>경기 종료 후 MVP · 평점 · 승점 · 보상이 정산됩니다</li>' +
      '</ul></div>' +
      (S.lastResult ? lastResultCard() : '');
    box.innerHTML = html;
    paintEmblems(box);
  }

  function renderMatchLive(oppTeam, oppId, lineup, isChallenge) {
    var box = document.getElementById('screen-match');
    box.innerHTML =
      '<div class="scoreboard">' +
      '<div class="sb-team home"><canvas class="sb-emblem" data-emblem="' + S.club.emblem + '" data-kit="' + S.club.kit.shirt + '|' + S.club.kit.trim + '" width="30" height="34"></canvas><span class="sb-name">' + esc(S.club.name) + '</span></div>' +
      '<div class="sb-score"><b id="m-gf">0</b><i>:</i><b id="m-ga">0</b><span id="m-clock">00:00</span></div>' +
      '<div class="sb-team away"><canvas class="sb-emblem" data-emblem="' + oppTeam.emblem + '" data-kit="' + oppTeam.kit.shirt + '|' + oppTeam.kit.trim + '" width="30" height="34"></canvas><span class="sb-name">' + esc(oppTeam.short) + '</span></div>' +
      (isChallenge ? '<div class="sb-badge">챌린지</div>' : '') +
      '</div>' +
      '<div class="pitch-wrap"><canvas id="m-pitch"></canvas><div id="m-banner" class="goal-banner"></div></div>' +
      '<div class="commentary" id="m-comm"><div class="cmt-head"><span class="mic">🎙️</span><b>중계</b></div><div class="cmt-body" id="m-comm-body"></div></div>' +
      '<div class="match-ctrl">' +
      '<div class="ctrl-group"><span class="ctrl-label">배속</span><div class="seg" id="m-speeds">' +
      '<button data-act="speed" data-v="1" class="on">×1</button><button data-act="speed" data-v="2">×2</button><button data-act="speed" data-v="3">×3</button>' +
      '</div></div>' +
      '<div class="ctrl-group"><span class="ctrl-label">전술</span><div class="seg tactics" id="m-tactics">' +
      '<button data-act="tactics" data-v="attack" class="' + (S.tactics === 'attack' ? 'on' : '') + '">공격적</button>' +
      '<button data-act="tactics" data-v="balanced" class="' + (S.tactics === 'balanced' ? 'on' : '') + '">균형</button>' +
      '<button data-act="tactics" data-v="defense" class="' + (S.tactics === 'defense' ? 'on' : '') + '">수비적</button>' +
      '</div></div>' +
      '</div>' +
      '<div class="match-overlay" id="m-overlay"></div>';
    paintEmblems(box);
  }

  function showResult(res) {
    var ov = document.getElementById('m-overlay');
    if (!ov) { return; }
    var gf = res.homeScore, ga = res.awayScore;
    var verdict = gf > ga ? '승리!' : (gf === ga ? '무승부' : '패배');
    var cls = gf > ga ? 'win' : (gf === ga ? 'draw' : 'lose');
    var list = '';
    var rows = res.ratings.slice().sort(function (a, b) { return b.rating - a.rating; });
    var i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      list += '<div class="rt-row' + (r.mvp ? ' mvp' : '') + '">' +
        '<span class="rt-name">' + esc(r.name) + (r.mvp ? ' 👑' : '') + '</span>' +
        '<span class="rt-role">' + r.role + '</span>' +
        '<span class="rt-goal">' + (r.goals ? '⚽' + r.goals : '') + '</span>' +
        '<span class="rt-rate">' + r.rating.toFixed(1) + '</span>' +
        '</div>';
    }
    var reward = res.reward || 0;
    var points = res.points;
    ov.innerHTML = '<div class="result-card ' + cls + '">' +
      '<div class="res-verdict">' + verdict + '</div>' +
      '<div class="res-score">' + res.homeName + ' <b>' + gf + ' : ' + ga + '</b> ' + res.awayShort + '</div>' +
      '<div class="res-mvp">👑 MVP <b>' + esc(res.mvp ? res.mvp.name : '-') + '</b> · 평점 ' + (res.mvpRating || 0).toFixed(1) + '</div>' +
      '<div class="res-meta">' + ((points !== null && points !== undefined && points > 0) ? '승점 +' + points + ' · ' : '') + '보상 🪙 ' + fmt(reward) + '</div>' +
      '<div class="rt-list">' + list + '</div>' +
      '<div class="res-btns"><button class="cta" data-act="close-result">확인</button>' +
      '<button class="cta ghost" data-act="kickoff">한 번 더</button></div>' +
      '</div>';
    ov.classList.add('on');
  }

  /* ─────────────────────────  탭  ───────────────────────── */
  var currentTab = 'home';

  function setTab(tab) {
    currentTab = tab;
    var secs = document.querySelectorAll('.screen');
    var i;
    for (i = 0; i < secs.length; i++) {
      secs[i].classList.toggle('on', secs[i].id === 'screen-' + tab);
    }
    var btns = document.querySelectorAll('.tabbar button');
    for (i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-tab') === tab);
    }
    renderAll();
  }

  function renderAll() {
    renderHeader();
    if (currentTab === 'home') { renderHome(); }
    else if (currentTab === 'squad') { renderSquad(); }
    else if (currentTab === 'scout') { renderScout(); }
    else if (currentTab === 'match') { renderMatchIdle(); }
  }

  /* ─────────────────────────  이벤트  ───────────────────────── */
  function onAction(act, t) {
    if (act === 'tab') { setTab(t.getAttribute('data-tab')); return; }
    if (act === 'formation') {
      var f = t.getAttribute('data-f');
      if (!DS.FORMATIONS[f]) { return; }
      S.formation = f;
      S.lineup = autoLineup(S.squad, f);
      selectedId = null;
      save(); renderAll();
      toast(f + ' 포메이션 적용');
      return;
    }
    if (act === 'starter') {
      var id = t.getAttribute('data-id');
      var slot = parseInt(t.getAttribute('data-slot'), 10);
      if (!id) { toast('빈 자리입니다. 후보 선수를 선택하세요.'); return; }
      if (selectedId && selectedId !== id) {
        /* 후보 ↔ 선발 스왑 */
        swapWithLineup(selectedId, slot);
        return;
      }
      selectedId = (selectedId === id) ? null : id;
      renderSquad();
      return;
    }
    if (act === 'bench') {
      var bid = t.getAttribute('data-id');
      if (!selectedId) { selectedId = bid; renderSquad(); return; }
      if (selectedId === bid) { selectedId = null; renderSquad(); return; }
      var inIdx = S.lineup.indexOf(selectedId);
      if (inIdx >= 0) {
        /* 선발 선택 후 후보 누름 → 선발 자리로 후보 투입 */
        swapPlayerAt(inIdx, bid);
      } else {
        selectedId = bid;
        renderSquad();
        toast('자리를 바꿀 선발 선수를 피치에서 선택하세요.');
      }
      return;
    }
    if (act === 'clearsel') { selectedId = null; renderSquad(); return; }
    if (act === 'scout') { doScout(t.getAttribute('data-kind')); return; }
    if (act === 'train') { doTrain(t.getAttribute('data-id')); return; }
    if (act === 'kickoff') { startMatch('league'); return; }
    if (act === 'challenge') {
      if (S.challengeLeft <= 0) { toast('오늘 챌린지는 모두 소진했습니다.'); return; }
      startMatch('challenge');
      return;
    }
    if (act === 'speed') {
      var v = parseInt(t.getAttribute('data-v'), 10);
      if (DS.Match) { DS.Match.setSpeed(v); }
      var sib = document.querySelectorAll('#m-speeds button');
      var i;
      for (i = 0; i < sib.length; i++) { sib[i].classList.toggle('on', sib[i] === t); }
      return;
    }
    if (act === 'tactics') {
      var tv = t.getAttribute('data-v');
      S.tactics = tv;
      save();
      if (DS.Match) { DS.Match.setTactics(tv); }
      var sib2 = document.querySelectorAll('#m-tactics button');
      var j;
      for (j = 0; j < sib2.length; j++) { sib2[j].classList.toggle('on', sib2[j] === t); }
      toast(t.textContent + ' 전술로 전환');
      return;
    }
    if (act === 'close-result') {
      var ov = document.getElementById('m-overlay');
      if (ov) { ov.classList.remove('on'); }
      setTab('home');
      return;
    }
    if (act === 'newseason') { newSeason(); return; }
    if (act === 'kit') {
      S.club.kit.shirt = t.getAttribute('data-c');
      S.club.kit.trim = DS.Art.shade(S.club.kit.shirt, 70);
      save(); renderAll();
      return;
    }
    if (act === 'shorts') {
      S.club.kit.shorts = t.getAttribute('data-c');
      save(); renderAll();
      return;
    }
    if (act === 'emblem') {
      S.club.emblem = t.getAttribute('data-e');
      save(); renderAll();
      return;
    }
    if (act === 'rename') {
      var inp = document.getElementById('club-name-input');
      if (!inp) { return; }
      var name = (inp.value || '').trim();
      if (name.length < 2) { toast('구단명은 2자 이상이어야 합니다.'); return; }
      S.club.name = name.slice(0, 12);
      save(); renderAll();
      toast('구단명 변경 완료');
      return;
    }
    if (act === 'reset') {
      if (global.confirm('정말 처음부터 다시 시작할까요? 저장 데이터가 사라집니다.')) {
        localStorage.removeItem(SAVE_KEY);
        S = defaultState();
        save();
        setTab('home');
        toast('새 게임을 시작합니다.');
      }
      return;
    }
  }

  function swapWithLineup(benchId, slot) {
    var cur = S.lineup[slot];
    var benchIdx = -1, i;
    for (i = 0; i < S.lineup.length; i++) { if (S.lineup[i] === benchId) { benchIdx = i; } }
    if (benchIdx >= 0) {
      /* 둘 다 선발 → 자리 교환 */
      S.lineup[benchIdx] = cur;
      S.lineup[slot] = benchId;
    } else {
      swapPlayerAt(slot, benchId);
      return;
    }
    selectedId = null;
    save(); renderAll();
    toast('자리를 바꿨습니다.');
  }

  function swapPlayerAt(slot, benchId) {
    var b = byId(benchId);
    if (!b) { return; }
    S.lineup[slot] = benchId;
    selectedId = null;
    save(); renderAll();
    toast(b.name + ' 투입!');
  }

  /* ─────────────────────────  부트  ───────────────────────── */
  function boot() {
    var saved = load();
    S = saved || defaultState();
    if (!saved) { save(); }
    renderHeader();
    drawPitchBG();
    setTab('home');

    document.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== document && !(t.getAttribute && t.getAttribute('data-act'))) {
        t = t.parentNode;
      }
      if (!t || t === document || !t.getAttribute) { return; }
      e.preventDefault();
      onAction(t.getAttribute('data-act'), t);
    });

    global.addEventListener('resize', function () {
      if (currentTab === 'squad') { drawPitchBG(); placePitchPlayers(); }
      if (DS.Match && DS.Match.running) { DS.Match.resize(); }
    });

    /* 자동 저장: 탭 전환/가려짐 */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { save(); }
    });
    global.addEventListener('beforeunload', save);
    if (DS.registerSW && 'serviceWorker' in navigator) { DS.registerSW(); }
  }

  DS.game = {
    state: function () { return S; },
    save: save,
    setTab: setTab,
    showResult: showResult,
    renderMatchIdle: renderMatchIdle,
    toast: toast,
    currentTab: function () { return currentTab; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);
