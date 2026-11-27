/*! 꼬마일레븐 FC v27 — 비동기 PvP (pvp.js)
    · 구단 스냅샷 직렬화(URL-safe Base64 + 체크섬) → 공유 URL(?vs=) · 짧은 복사 코드
    · importSquadCode() 유효성 검증 + 치팅 스탯 상한 클램프
    · 챌린지 매치용 상대 스쿼드 복원(내 팀은 실시간 개입, 상대는 AI 지휘)
    · PvpRegistry 인터페이스(local 모드) — 무료 DB 키를 연결하면 그대로 전체 랭킹전으로 확장
    이번 단계에서는 유저 간 이적시장 거래를 넣지 않는다(치팅·어뷰징 방지). */
(function (global) {
  'use strict';

  var DS = global.DS || (global.DS = {});
  var P = {};
  DS.Pvp = P;

  var VERSION = 1;                 /* 코드 포맷 버전 (비트 3개) */
  var PREFIX = 'DSP1';             /* 사람이 알아보는 접두어 */
  var SEP = '-';
  /* v25c (M4) — 공유 링크·캐시 쿼리에 쓰는 버전은 하드코딩하지 않고,
     index.html이 실제로 불러온 이 스크립트의 쿼리(?v=&b=)에서 읽는다.
     그래야 배포 때 캐시 버스터를 올리면 공유 링크도 같이 따라온다. */
  function scriptVer() {
    var out = { v: '27', b: '21' };
    try {
      var doc = global.document, src = '';
      if (doc && doc.querySelector) {
        var sc = doc.querySelector('script[src*="pvp.js"]');
        src = (sc && (sc.getAttribute('src') || sc.src)) || '';
      }
      if (!src && global.location && global.location.search) { src = global.location.search; }
      var mv = /[?&]v=([0-9]+)/.exec(src), mb = /[?&]b=([0-9]+)/.exec(src);
      if (mv) { out.v = mv[1]; }
      if (mb) { out.b = mb[1]; }
    } catch (e) { /* 기본값 */ }
    return out;
  }
  var VER = scriptVer();
  var APP_VERSION = VER.v;
  var BUILD_TAG = VER.b;
  var LIVE_BASE = 'https://hojin8811-dev.github.io/Dot-soccer/';

  /* ── 치팅 방어 상한 ──
     코드는 누구나 만들 수 있으므로, 읽는 쪽에서 반드시 이 상한으로 자른다.
     v25c (L5) — 스탯 3종은 1~10 그대로 두되(정상 성장으로도 도달 가능),
     실제 성장 곡선으로는 나올 수 없는 레벨·총전력을 현실 상한으로 깎는다.
     · 레벨: expToNext = 520 + 420×Lv → Lv.15까지 약 3.4만 EXP(여러 시즌)
     · 전력(선발 11인 평균 OVR): 잠재력 상한(유소년 70~92·성인 pot≤95) 안의 값
   */
  var LIMITS = {
    statMin: 1, statMax: 10,
    levelMax: 15,
    powerMax: 91,
    playersMin: 11, playersMax: 18,
    /* v27 — 엔트리 규격은 선발 11 + 벤치 7 = 18명 하나로 고정한다 */
    squadSize: 18, benchSize: 7, starterSize: 11,
    clubMax: 14, nameMax: 12,
    picMax: 511,
    minCodeLen: 60               /* 11명짜리 실제 코드도 150자 이상 — 잘린 입력은 먼저 걸러진다 */
  };
  P.LIMITS = LIMITS;
  P.VERSION_TAG = 'v' + APP_VERSION;
  P.BUILD_TAG = 'b' + BUILD_TAG;

  /* ── 오류 문구 ── */
  var ERRORS = {
    EMPTY: '코드가 비어 있습니다. 상대에게 받은 구단 코드를 붙여넣어 주세요.',
    BAD_B64: '구단 코드 형식이 아닙니다. 코드 전체를 정확히 붙여넣어 주세요.',
    TOO_SHORT: '코드가 잘렸습니다. 전체 코드를 붙여넣어 주세요.',
    CHECKSUM: '코드가 손상되었습니다(체크섬 불일치). 다시 복사해 주세요.',
    UNSUPPORTED: '이 버전에서 읽을 수 없는 코드입니다. 최신 버전(v' + APP_VERSION + ')에서 다시 받아 주세요.',
    PLAYER_COUNT: '선수 수가 11~18명이 아닙니다. 코드를 다시 확인해 주세요.',
    URL_NO_CODE: '주소에 구단 코드(?vs=)가 없습니다.'
  };
  P.ERRORS = ERRORS;
  function mkErr(code) {
    var e = new Error(ERRORS[code] || '구단 코드를 읽지 못했습니다.');
    e.code = code;
    return e;
  }
  P.errorText = function (e) {
    if (!e) { return '구단 코드를 읽지 못했습니다.'; }
    if (e.code && ERRORS[e.code]) { return ERRORS[e.code]; }
    return e.message || '구단 코드를 읽지 못했습니다.';
  };

  /* ═════════════════  기본 유틸  ═════════════════ */
  function clampInt(v, lo, hi) {
    v = Math.round(Number(v));
    if (!isFinite(v)) { v = lo; }
    if (v < lo) { return lo; }
    if (v > hi) { return hi; }
    return v;
  }
  function isHangul(code) { return code >= 0xAC00 && code <= 0xD7A3; }
  function cleanText(s, max) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }
  P.clampInt = clampInt;

  /* ═════════════════  Base64URL (패딩 없음)  ═════════════════ */
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64url(bytes) {
    var s = '', i, a, b, c;
    for (i = 0; i < bytes.length; i += 3) {
      a = bytes[i]; b = bytes[i + 1]; c = bytes[i + 2];
      s += B64.charAt(a >> 2);
      if (b === undefined) { s += B64.charAt((a & 3) << 4); break; }
      s += B64.charAt(((a & 3) << 4) | (b >> 4));
      if (c === undefined) { s += B64.charAt((b & 15) << 2); break; }
      s += B64.charAt(((b & 15) << 2) | (c >> 6));
      s += B64.charAt(c & 63);
    }
    return s;
  }
  function unb64url(str) {
    var out = [], buf = 0, bits = 0, i, v;
    for (i = 0; i < str.length; i++) {
      v = B64.indexOf(str.charAt(i));
      if (v < 0) { throw mkErr('BAD_B64'); }
      buf = ((buf << 6) | v) & 0xFFFFFF;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((buf >> bits) & 255);
        buf = buf & ((1 << bits) - 1);
      }
    }
    return out;
  }

  /* ═════════════════  비트 라이터 / 리더  ═════════════════ */
  function BW() { this.bytes = []; this.acc = 0; this.n = 0; }
  BW.prototype.w = function (v, nb) {
    var i, bit;
    v = v >>> 0;
    for (i = nb - 1; i >= 0; i--) {
      bit = (v >>> i) & 1;
      this.acc = (this.acc << 1) | bit;
      this.n++;
      if (this.n === 8) { this.bytes.push(this.acc & 255); this.acc = 0; this.n = 0; }
    }
  };
  BW.prototype.done = function () {
    if (this.n) { this.bytes.push((this.acc << (8 - this.n)) & 255); this.acc = 0; this.n = 0; }
    return this.bytes;
  };
  function BR(bytes) { this.b = bytes; this.i = 0; }
  BR.prototype.r = function (nb) {
    var v = 0, i, bi, byte, bit;
    for (i = 0; i < nb; i++) {
      bi = this.i++;
      byte = this.b[bi >> 3];
      if (byte === undefined) { throw mkErr('TOO_SHORT'); }
      bit = (byte >> (7 - (bi & 7))) & 1;
      v = (v << 1) | bit;
    }
    return v >>> 0;
  };

  /* ── 체크섬: FNV-1a 32bit → 16bit ── */
  function checksum(bytes) {
    var h = 0x811c9dc5, i;
    for (i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 16777619) >>> 0;
    }
    return ((h ^ (h >>> 16)) & 0xffff);
  }

  /* ═════════════════  사전(딕셔너리)  ═════════════════ */
  function dict(list, key, fallback) {
    var out = [], i, k;
    for (i = 0; i < list.length; i++) {
      k = key ? list[i][key] : list[i];
      if (k) { out.push(k); }
    }
    if (!out.length && fallback) { out.push(fallback); }
    return out;
  }
  function idxOf(arr, v) { var i = arr.indexOf(v); return i < 0 ? 0 : i; }
  function bounds(nb) { return Math.ceil(Math.log(nb + 1) / Math.LN2) || 1; }

  function posK() { return DS.POS_ORDER || ['GK', 'CM']; }
  function rarK() { return DS.RARITY_ORDER || ['dong']; }
  function roleK() { return dict(DS.ROLES || [], 'key'); }
  function footK() { return DS.FOOT_LIST || ['왼발', '오른발', '양발']; }
  function traitK() { return dict(DS.TRAITS || [], 'key'); }
  function formK() { return DS.ALL_FORMATION_KEYS || DS.FORMATION_KEYS || ['4-4-2']; }
  function styleK() { return DS.STYLE_KEYS || ['balanced']; }
  function emblemK() { return dict(DS.EMBLEMS || [], 'id', 'bolt'); }

  var BITS = {
    ver: 3, clubLen: 5, nameLen: 4, pos: 4, rarity: 2, stat: 4, level: 6,
    pic: 9, role: 4, foot: 2, trait: 4, form: 4, style: 3, count: 5, color: 8
  };

  /* v27 — 18명 규격 보정용 아카데미 선수.
     · 구버전(11~16명) 코드를 읽을 때와, 선수단이 18명이 안 되는 세이브를 내보낼 때
       부족한 자리만 채운다(선발 11명은 절대 건드리지 않으므로 전력 계산에 영향 없음).
     · 스탯 4/4/4(OVR 약 51)의 동 등급이라 상대 전력을 올리지 않는다. */
  var FILLER_POS = ['GK', 'CB', 'LB', 'CM', 'CM', 'RB', 'ST'];
  function fillerRecords(n, offset) {
    var out = [], i, k;
    offset = offset || 0;
    for (i = 0; i < n; i++) {
      k = (offset + i) % FILLER_POS.length;
      out.push({
        name: cleanText('아카데미' + (offset + i + 1), LIMITS.nameMax),
        pos: FILLER_POS[k], rarity: 'dong',
        s: 4, t: 4, p: 4, level: 0, pic: 0,
        role: '', foot: '', trait: '', pad: true
      });
    }
    return out;
  }
  P.fillerRecords = fillerRecords;

  function writeName(w, name, lenBits, maxLen) {
    var chars = String(name || '').split('').slice(0, maxLen), i, hangul = false, c;
    if (!chars.length) { chars = ['?']; }
    hangul = true;
    for (i = 0; i < chars.length; i++) {
      if (!isHangul(chars[i].charCodeAt(0))) { hangul = false; break; }
    }
    w.w(chars.length, lenBits);
    w.w(hangul ? 1 : 0, 1);
    for (i = 0; i < chars.length; i++) {
      c = chars[i].charCodeAt(0);
      if (hangul) { w.w(c - 0xAC00, 14); }
      else { w.w(c, 16); }
    }
    return hangul;
  }
  function readName(r, lenBits, maxLen) {
    var len = r.r(lenBits), hangul = r.r(1), out = '', i, c;
    if (len > maxLen) { len = maxLen; }
    for (i = 0; i < len; i++) {
      c = hangul ? (r.r(14) + 0xAC00) : r.r(16);
      out += String.fromCharCode(c);
    }
    return cleanText(out, maxLen) || '?';
  }
  function writeColor(w, hex) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ''));
    var v = m ? parseInt(m[1], 16) : 0x2f5fa8;
    w.w((v >> 16) & 255, 8); w.w((v >> 8) & 255, 8); w.w(v & 255, 8);
  }
  function readColor(r) {
    var rr = r.r(8), gg = r.r(8), bb = r.r(8);
    return '#' + ((1 << 24) + (rr << 16) + (gg << 8) + bb).toString(16).slice(1);
  }

  /* ═════════════════  스냅샷 만들기 (내 구단 → 경량 JSON)  ═════════════════
     ctx = { club:{name, emblem, kit:{shirt, trim}}, formation, style, players:[...] } */
  P.snapshot = function (ctx) {
    ctx = ctx || {};
    var club = ctx.club || {};
    var players = [], list = ctx.players || [], i, src;
    for (i = 0; i < list.length && players.length < LIMITS.playersMax; i++) {
      src = list[i];
      if (!src || !src.pos || !DS.POS[src.pos]) { continue; }
      players.push({
        name: cleanText(src.name, LIMITS.nameMax) || '선수',
        pos: src.pos,
        rarity: DS.RARITY[src.rarity] ? src.rarity : 'dong',
        s: clampInt(src.s, LIMITS.statMin, LIMITS.statMax),
        t: clampInt(src.t, LIMITS.statMin, LIMITS.statMax),
        p: clampInt(src.p, LIMITS.statMin, LIMITS.statMax),
        level: clampInt(src.level || 0, 0, LIMITS.levelMax),
        pic: (typeof src.pic === 'number') ? clampInt(src.pic, 0, LIMITS.picMax) : 0,
        role: src.role || '',
        foot: src.foot || '',
        trait: src.trait || ''
      });
    }
    /* v27 — 어떤 세이브에서도 내보내기는 항상 18명(선발 11 + 벤치 7) */
    if (players.length < LIMITS.squadSize) {
      var add = fillerRecords(LIMITS.squadSize - players.length, 0), ai;
      for (ai = 0; ai < add.length; ai++) { players.push(add[ai]); }
    }
    var kit = club.kit || {};
    var snap = {
      v: VERSION,
      club: cleanText(club.name, LIMITS.clubMax) || '이름 없는 구단',
      emblem: club.emblem || 'bolt',
      kit: { shirt: kit.shirt || '#2f5fa8', trim: kit.trim || '#f0e6cc' },
      formation: DS.FORMATIONS[ctx.formation] ? ctx.formation : '4-4-2',
      style: styleK().indexOf(ctx.style) >= 0 ? ctx.style : 'balanced',
      players: players
    };
    snap.power = powerOf(snap.players);
    return snap;
  };

  /* 전력 — 코드에 실어 보내지 않고 읽는 쪽에서 다시 계산한다(치팅 무효화) */
  function powerOf(players) {
    var n = 0, sum = 0, i, p;
    for (i = 0; i < players.length && i < 11; i++) {
      p = players[i];
      sum += DS.ratingOf({ pos: p.pos, rarity: p.rarity, s: p.s, t: p.t, p: p.p, level: p.level || 0 });
      n++;
    }
    return n ? Math.round(sum / n) : 40;
  }
  P.powerOf = powerOf;

  /* v25c (L5) — 전력 상한 클램프. 전원 10/10/10·Lv.63 같은 코드는 전력 99가 나와
     정상 육성 구단을 무의미하게 만든다. 가장 센 선수부터 레벨 → 스탯 순으로 깎아
     전력을 현실 상한(LIMITS.powerMax) 아래로 내린다. 깎은 횟수를 돌려준다. */
  function clampPower(players, maxPower) {
    var trimmed = 0, guard = 0, topN = Math.min(11, players.length);
    while (powerOf(players) > maxPower && guard < 400) {
      guard++;
      var bi = -1, br = -1, i;
      for (i = 0; i < topN; i++) {
        var q0 = players[i];
        var r0 = DS.ratingOf({ pos: q0.pos, rarity: q0.rarity, s: q0.s, t: q0.t, p: q0.p, level: q0.level || 0 });
        if (r0 > br) { br = r0; bi = i; }
      }
      if (bi < 0) { break; }
      var q = players[bi], k2, keys = ['s', 't', 'p'], done = false;
      if ((q.level || 0) > 0) { q.level -= 1; done = true; }
      else {
        for (k2 = 0; k2 < 3; k2++) {
          if (q[keys[k2]] > LIMITS.statMin) { q[keys[k2]] -= 1; done = true; break; }
        }
      }
      if (!done) { break; }
      trimmed++;
    }
    return trimmed;
  }
  P.clampPower = clampPower;

  /* ═════════════════  스냅샷 → 코드 ═════════════════ */
  P.encodeSnapshot = function (snap) {
    var w = new BW(), players = snap.players || [], i, p, k;
    w.w(VERSION, BITS.ver);
    writeName(w, snap.club, BITS.clubLen, LIMITS.clubMax);
    w.w(idxOf(emblemK(), snap.emblem), 3);
    writeColor(w, snap.kit && snap.kit.shirt);
    writeColor(w, snap.kit && snap.kit.trim);
    w.w(idxOf(formK(), snap.formation), BITS.form);
    w.w(idxOf(styleK(), snap.style), BITS.style);
    w.w(clampInt(players.length, 0, 31), BITS.count);
    for (i = 0; i < players.length; i++) {
      p = players[i];
      w.w(idxOf(posK(), p.pos), BITS.pos);
      w.w(idxOf(rarK(), p.rarity), BITS.rarity);
      w.w(clampInt(p.s, 0, 15), BITS.stat);
      w.w(clampInt(p.t, 0, 15), BITS.stat);
      w.w(clampInt(p.p, 0, 15), BITS.stat);
      w.w(clampInt(p.level || 0, 0, 63), BITS.level);
      w.w(clampInt(p.pic || 0, 0, LIMITS.picMax), BITS.pic);
      k = roleK().indexOf(p.role);
      w.w(k < 0 ? 0 : k + 1, BITS.role);
      k = footK().indexOf(p.foot);
      w.w(k < 0 ? 0 : k + 1, BITS.foot);
      w.w(idxOf(traitK(), p.trait), BITS.trait);
      writeName(w, p.name, BITS.nameLen, LIMITS.nameMax);
    }
    var bytes = w.done();
    var sum = checksum(bytes);
    bytes.push((sum >> 8) & 255, sum & 255);
    return PREFIX + SEP + b64url(bytes);
  };

  /* ═════════════════  코드 → 스냅샷 (검증 + 클램프)  ═════════════════ */
  P.normalizeCode = function (input) {
    var s = String(input === undefined || input === null ? '' : input)
      .replace(/[\s\u200B-\u200D\uFEFF]/g, '');
    if (!s) { throw mkErr('EMPTY'); }
    if (/^(https?:)?\/\//i.test(s)) {
      var m = /[?&]vs=([^&#]+)/i.exec(s);
      if (!m) { throw mkErr('URL_NO_CODE'); }
      s = m[1];
    } else if (/[?&]vs=/i.test(s)) {
      s = /[?&]vs=([^&#]+)/i.exec(s)[1];
    }
    try { s = decodeURIComponent(s); } catch (e) { /* 이미 풀린 문자열 */ }
    if (s.indexOf(PREFIX + SEP) === 0) { s = s.slice(PREFIX.length + 1); }
    else if (s.indexOf(PREFIX) === 0) { s = s.slice(PREFIX.length); }
    return s.replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  };

  P.decode = function (raw) {
    var input = String(raw === undefined || raw === null ? '' : raw);
    var looksLikeCode = /DSP1/i.test(input);
    var code = P.normalizeCode(raw);
    /* v25c (L4) — 형식 검사를 체크섬보다 먼저 한다. 'hello world' 같은 쓰레기 입력이
       '체크섬 불일치(다시 복사해 주세요)'로 안내되어 원인을 오해하게 했다. */
    if (!/^[A-Za-z0-9_-]+$/.test(code)) { throw mkErr('BAD_B64'); }
    if (code.length < LIMITS.minCodeLen) { throw mkErr(looksLikeCode ? 'TOO_SHORT' : 'BAD_B64'); }
    var bytes = unb64url(code);
    if (bytes.length < 3) { throw mkErr('TOO_SHORT'); }
    var body = bytes.slice(0, bytes.length - 2);
    var sum = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
    if (checksum(body) !== sum) { throw mkErr('CHECKSUM'); }
    var r = new BR(body), clamped = 0, i, p, v, rec, k;
    var ver = r.r(BITS.ver);
    if (ver !== VERSION) { throw mkErr('UNSUPPORTED'); }
    var snap = {
      v: ver,
      club: readName(r, BITS.clubLen, LIMITS.clubMax),
      emblem: emblemK()[r.r(3)] || 'bolt',
      kit: { shirt: readColor(r), trim: readColor(r) },
      formation: formK()[r.r(BITS.form)] || '4-4-2',
      style: styleK()[r.r(BITS.style)] || 'balanced',
      players: []
    };
    var count = r.r(BITS.count);
    if (count < LIMITS.playersMin || count > LIMITS.playersMax) { throw mkErr('PLAYER_COUNT'); }
    for (i = 0; i < count; i++) {
      rec = {};
      k = r.r(BITS.pos);
      rec.pos = posK()[k];
      k = r.r(BITS.rarity);
      rec.rarity = rarK()[k];
      if (!rec.pos || !rec.rarity) { throw mkErr('BAD_B64'); }
      v = { s: r.r(BITS.stat), t: r.r(BITS.stat), p: r.r(BITS.stat) };
      ['s', 't', 'p'].forEach(function (key) {
        if (v[key] < LIMITS.statMin || v[key] > LIMITS.statMax) { clamped++; }
        rec[key] = clampInt(v[key], LIMITS.statMin, LIMITS.statMax);
      });
      rec.level = r.r(BITS.level);
      if (rec.level > LIMITS.levelMax) { clamped++; rec.level = LIMITS.levelMax; }
      rec.pic = r.r(BITS.pic);
      k = r.r(BITS.role);
      rec.role = k > 0 ? (roleK()[k - 1] || '') : '';
      k = r.r(BITS.foot);
      rec.foot = k > 0 ? (footK()[k - 1] || '') : '';
      k = r.r(BITS.trait);
      rec.trait = traitK()[k] || '';
      rec.name = readName(r, BITS.nameLen, LIMITS.nameMax);
      if (!rec.role || (DS.rolesFor && DS.rolesFor(rec.pos).map(function (x) { return x.key; }).indexOf(rec.role) < 0)) {
        rec.role = '';
      }
      if (rec.foot && footK().indexOf(rec.foot) < 0) { rec.foot = ''; }
      snap.players.push(rec);
    }
    /* v27 — 구버전 코드(11~16명)는 부족한 벤치 자리만 아카데미 선수로 채워 18명 규격으로 맞춘다.
       선발 11명은 그대로라 전력·치팅 상한 판정에는 영향이 없고, 채운 수는 도전장에 표시한다. */
    var padded = 0;
    if (snap.players.length < LIMITS.squadSize) {
      padded = LIMITS.squadSize - snap.players.length;
      var pads = fillerRecords(padded, 0), pi;
      for (pi = 0; pi < pads.length; pi++) { snap.players.push(pads[pi]); }
    }
    snap.padded = padded;
    snap.power = powerOf(snap.players);
    snap.clamped = clamped;
    snap.codeLength = code.length;
    if (snap.power > LIMITS.powerMax) {
      snap.trimmed = clampPower(snap.players, LIMITS.powerMax);
      snap.power = powerOf(snap.players);
      clamped += snap.trimmed;
      snap.clamped = clamped;
    }
    return snap;
  };

  /* ═════════════════  공개 API (브리프 지정 이름)  ═════════════════ */
  /* 내 구단 코드/링크 만들기 */
  P.exportSquadCode = function (ctx) {
    var snap = P.snapshot(ctx);
    var code = P.encodeSnapshot(snap);
    return { ok: true, code: code, url: P.urlFor(code), snap: snap, length: code.length };
  };
  /* 코드 또는 ?vs= 링크 읽기 — 실패하면 {ok:false, error} */
  P.importSquadCode = function (raw) {
    try {
      var snap = P.decode(raw);
      return { ok: true, snap: snap, code: PREFIX + SEP + P.normalizeCode(raw) };
    } catch (e) {
      return { ok: false, error: P.errorText(e), errorCode: e.code || 'UNKNOWN' };
    }
  };
  /* 주소에서 ?vs= 코드만 뽑기 (없으면 '') */
  P.codeFromUrl = function (url) {
    var s = String(url || '');
    var m = /[?&]vs=([^&#]+)/i.exec(s);
    if (!m) { return ''; }
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  };
  P.urlFor = function (code) {
    var base = LIVE_BASE, loc = global.location;
    /* 지금 보고 있는 주소(로컬 테스트 · 라이브 모두)에서 그대로 공유한다 */
    if (loc && /^https?:/i.test(loc.href || '')) { base = loc.origin + (loc.pathname || '/'); }
    return base + '?v=' + APP_VERSION + '&b=' + BUILD_TAG + '&vs=' + encodeURIComponent(code);
  };
  P.shortName = function (name) {
    var s = String(name || '');
    return s.split(' ')[0].slice(0, 5) || '상대';
  };

  /* ═════════════════  스냅샷 → 경기 엔진용 선수 객체  ═════════════════ */
  P.toSquad = function (snap) {
    var out = [], i, rec, p, rr;
    for (i = 0; i < snap.players.length; i++) {
      rec = snap.players[i];
      /* makePlayer로 뼈대(개성·apt·set 등)를 만들고, 코드에 담긴 실제 수치로 되돌린다.
         makePlayer가 포지션·개성 보정으로 s/t/p를 흔들기 때문에 반드시 덮어써야 한다. */
      p = DS.makePlayer({ pos: rec.pos, rarity: rec.rarity, s: rec.s, t: rec.t, p: rec.p, name: rec.name });
      p.s = rec.s; p.t = rec.t; p.p = rec.p;
      p.level = rec.level || 0;
      p.pos = rec.pos; p.rarity = rec.rarity;
      if (rec.pic && DS.picAllowed(p.pos, rec.pic)) { p.pic = rec.pic; }
      if (rec.foot && (DS.FOOT_LIST || []).indexOf(rec.foot) >= 0) { p.foot = rec.foot; }
      if (rec.trait) { p.trait = rec.trait; }
      rr = rec.role && DS.roleOf ? DS.roleOf(rec.role) : null;
      p.role = (rr && rr.pos.indexOf(p.pos) >= 0) ? rec.role : null;
      p.set = {
        pk: clampInt(Math.round(p.t * 0.6 + p.p * 0.3), 1, 10),
        fk: clampInt(p.t, 1, 10),
        ck: clampInt(Math.round((p.t + p.s) / 2), 1, 10),
        cap: clampInt(Math.round((p.t + p.p) / 2 * 0.7), 1, 10)
      };
      if (DS.makeAptitude) { p.apt = DS.makeAptitude(p.pos, p.foot); }
      p.stats = DS.statSheet(p);
      p.tenure = p.tenure || 2;
      p.number = i + 1;
      p.id = 'pvp' + (i + 1) + '-' + p.id;
      out.push(p);
    }
    if (DS.assignUniquePics) { DS.assignUniquePics(out); }
    return out;
  };
  /* 경기 엔진은 한 팀 11명을 기대한다 — 선발 11명만 넘긴다 */
  P.toAwaySquad = function (snap) {
    return P.toSquad(snap).slice(0, 11);
  };

  /* 상대 감독 — 코드에는 감독을 담지 않는다. 구단명 해시로 실제 감독 중 한 명을 붙이고,
     전술 철학·포메이션은 상대가 저장한 값으로 맞춘다(AI 지휘). */
  P.virtualManager = function (snap) {
    var list = DS.MANAGERS || [], h = 0, i, seed = String((snap && snap.club) || 'pvp');
    for (i = 0; i < seed.length; i++) { h = (h * 31 + seed.charCodeAt(i)) % 100003; }
    var base = (list.length && DS.managerOf) ? DS.managerOf(list[h % list.length].id) : null;
    var m = {}, k;
    if (base) { for (k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) { m[k] = base[k]; } } }
    m.id = 'pvp-' + h;
    m.name = (base && base.name) || '원격 감독';
    m.formation = snap.formation;
    m.tacticStyle = snap.style;
    m.pvp = true;
    return m;
  };

  /* 상대 구단 카드용 팀 객체 (엠블럼·킷은 상대가 쓰던 것) */
  P.toTeam = function (snap) {
    return {
      id: 'pvp',
      name: snap.club,
      short: P.shortName(snap.club),
      emblem: snap.emblem,
      kit: { shirt: snap.kit.shirt, shorts: '#16241f', trim: snap.kit.trim },
      strength: snap.power,
      pvp: true
    };
  };

  /* UI 요약 정보 */
  P.describe = function (snap) {
    var st = DS.tacticStyle ? DS.tacticStyle(snap.style) : { name: snap.style };
    var lineup = snap.players.slice(0, 11).map(function (p) {
      return {
        name: p.name, pos: p.pos, rarity: p.rarity, pic: p.pic,
        ovr: DS.ratingOf({ pos: p.pos, rarity: p.rarity, s: p.s, t: p.t, p: p.p, level: p.level || 0 })
      };
    });
    var top = lineup.slice().sort(function (a, b) { return b.ovr - a.ovr; });
    return {
      club: snap.club, short: P.shortName(snap.club),
      formation: snap.formation, style: snap.style, styleName: st.name,
      power: snap.power, count: snap.players.length,
      starters: Math.min(LIMITS.starterSize, snap.players.length),
      bench: Math.max(0, snap.players.length - LIMITS.starterSize),
      lineup: lineup, top: top.slice(0, 4),
      clamped: snap.clamped || 0,
      padded: snap.padded || 0
    };
  };

  /* ═════════════════  프리셋 라이벌 3팀  ═════════════════
     코드가 없는 혼자 테스트 유저도 바로 맛볼 수 있게, 실제 코드 포맷으로 구운 샘플 구단.
     (같은 decode 경로를 타므로 프리셋도 검증·클램프를 그대로 통과한다)
     v27 — 세 팀 모두 선발 11 + 벤치 7 = 18명 규격으로 다시 구웠다(전력 61 / 70 / 81). */
  var PRESET_DEFS = [
    { key: 'r1', tag: '2부 다크호스', desc: '낮은 블록 + 한 방 역습. 2부에서 올라오는 팀',
      code: 'DSP1-JWZW5swAEAAjACGMhaHv_YqEUgTNwK7eZ1ZBusqASGVQLjWB2yAAVP_BERwDXFJ6VwB0bKBERwB5FJ1Rx0AVHDGVQG7M52ZFCUVHWEZgOytJ1ZA_8brHEdANu-hxKhUcdAHEcwGCyxwWwIwQlIEcgIgSh3BVa5asMFdAEWbJ2iR3EqOMFZAFgbB3HCTcP_ACJwJ1cR3BVbcqBBERgE3EZ6VylYLjCFRAOfUR2ySTcbJHEUwNY-JxXgbkaKHEUwDmsxxXgC9WGKFUgI-lB3PxqwSSMEYwG8cR1RxbcasAjkU' },
    { key: 'r2', tag: '1부 중위권', desc: '측면 오버래핑으로 폭을 넓히는 1부 중위권',
      code: 'DSP1-JWquVgqAEGFuaXhSp6RcjswAcgTSQKZdB2UiTcP_CXZgCJSZzVgAVP_BVWAPFDB2UiTcZkRVWANXFJzzgC9WGDXZgEbUBwWxa5asGVdwNKsJxXiTcZkWVeAN2yZ3ARbcasJXcwH6iZ2yRusbdIVggCgqh1ZBqwSSKYcwGqmR6cilYGmMWhAACcxxXg80aAQTOAKndJ3ARz8a0BURwIBE52yBCUVHSWVQEXWx3PwbkaKHVdAD6sx6k2lYLjHUdALq1JxXgHcqBKXYgNAjJ0DBusP_MVZAFkKxz_xt0ZSAius' },
    { key: 'r3', tag: '1부 강호', desc: '전방 압박 + 하이 라인. 1부 상위권 강호',
      code: 'DSP1-KF4Y6xwAEGOQWExjuml4Wm5xt_iLDu8iEglagAfcZ3PxCUVHSpdwFpU52rBusP_BmagPhGRxXh3AqxBXegEdFJ0DFoIdADadwGZUh1uBwVasGmiQCesJ6VwbkaKHnpQCu7JwkA80aAXmpQL48xwOBtAasJpgwFGmx1uB0AVHLmpQAmUh2rCTcbJKpgwNykh6VhUcdAATSgJvcJ6k0HcqBBVWQLpCB0DA_8dACoZgAZMhwWx3AqxHmlABo8R2yQHcqBHWlACMsJwP13AqxKocwFWk53BVoIdAMXlQPOUh1uBUxP_ACyw' }
  ];
  var presetCache = null;
  P.presets = function () {
    if (presetCache) { return presetCache; }
    var out = [], i, def, r;
    for (i = 0; i < PRESET_DEFS.length; i++) {
      def = PRESET_DEFS[i];
      r = P.importSquadCode(def.code);
      if (!r.ok) { continue; }
      out.push({ key: def.key, tag: def.tag, desc: def.desc || '', snap: r.snap, code: r.code });
    }
    presetCache = out;
    return out;
  };

  /* ═════════════════  PvpRegistry — 추후 DB 확장 포인트  ═════════════════
     uploadSquad(snap)   → { ok:true, id }        내 구단을 랭킹 풀에 올린다
     fetchRivals(opt)    → [snap] (또는 Promise)  상대 구단 목록
     reportResult(rec)   → { ok:true }             대전 결과 보고
     mode                → 'local' | 'remote'
     지금은 localStorage 로컬 모드. Firebase/Supabase 무료 키를 붙일 때는
     같은 세 메서드를 가진 백엔드 객체를 만들어 DS.Pvp.setRegistry() 로 넣기만 하면 된다. */
  var REG_KEY = 'dot-soccer-pvp-registry-v1';

  function LocalRegistry() { this.mode = 'local'; }
  LocalRegistry.prototype.read = function () {
    try {
      var raw = global.localStorage && global.localStorage.getItem(REG_KEY);
      var d = raw ? JSON.parse(raw) : null;
      if (!d || typeof d !== 'object') { d = {}; }
      d.squads = d.squads || [];
      d.results = d.results || [];
      return d;
    } catch (e) { return { squads: [], results: [] }; }
  };
  LocalRegistry.prototype.write = function (d) {
    try { global.localStorage.setItem(REG_KEY, JSON.stringify(d)); } catch (e) { /* 저장 실패 무시 */ }
  };
  LocalRegistry.prototype.uploadSquad = function (snap) {
    var d = this.read(), code = P.encodeSnapshot(snap), i, hit = -1;
    for (i = 0; i < d.squads.length; i++) { if (d.squads[i].code === code) { hit = i; } }
    var row = { id: 'sq' + Date.now().toString(36), ts: Date.now(), code: code, club: snap.club, power: snap.power };
    if (hit >= 0) { row.id = d.squads[hit].id; d.squads[hit] = row; }
    else { d.squads.unshift(row); }
    if (d.squads.length > 20) { d.squads.length = 20; }
    this.write(d);
    return { ok: true, id: row.id };
  };
  LocalRegistry.prototype.fetchRivals = function () {
    var out = [], i, pre = P.presets(), d = this.read();
    for (i = 0; i < pre.length; i++) { out.push(pre[i].snap); }
    /* 로컬 모드에서는 내가 올린 구단도 풀에 남는다(다른 기기에서 받은 코드 포함) */
    for (i = 0; i < d.squads.length; i++) {
      var r = P.importSquadCode(d.squads[i].code);
      if (r.ok) { out.push(r.snap); }
    }
    return out;
  };
  LocalRegistry.prototype.reportResult = function (rec) {
    var d = this.read();
    d.results.unshift({
      ts: Date.now(), opp: rec && rec.opp, gf: rec && rec.gf, ga: rec && rec.ga,
      res: rec && rec.res, power: rec && rec.power
    });
    if (d.results.length > 50) { d.results.length = 50; }
    this.write(d);
    return { ok: true };
  };

  var registry = new LocalRegistry();
  P.registry = registry;
  P.setRegistry = function (next) {
    if (next && typeof next.uploadSquad === 'function' && typeof next.fetchRivals === 'function') {
      registry = next;
      P.registry = next;
      return true;
    }
    return false;
  };
  P.registryMode = function () { return registry.mode || 'local'; };
  /* 레지스트리 결과가 동기 배열이든 Promise든 같은 방식으로 받아 준다 */
  P.rivals = function (cb) {
    var res;
    try { res = registry.fetchRivals({}); } catch (e) { res = null; }
    if (res && typeof res.then === 'function') {
      res.then(function (list) { if (cb) { cb(list || []); } }, function () { if (cb) { cb(P.presets().map(function (x) { return x.snap; })); } });
      return;
    }
    if (cb) { cb(res || []); }
  };
})(typeof window !== 'undefined' ? window : this);
