/*! 꼬마일레븐 FC v26 — BGM (Web Audio 합성 · 외부 음원 0)
    ─ 로비 테마: 홈·리그·마이팀·클럽·이적시장·S매치 — 밝은 장조 플럭/패드 + 부드러운 베이스
    ─ 경기 테마: 전반·후반 — 132BPM 아르페지오·비트, 하프타임엔 톤을 낮춘다
    ─ AudioContext는 경기 사운드(match.js SND)가 만든 것을 그대로 빌려 쓴다(중복 생성·누수 없음).
      음소거(dot-soccer-mute)는 SND 마스터 게인 하나로 함께 꺼진다.
    ─ 첫 사용자 제스처에서 resume, 탭 비활성/백그라운드에서 자동 일시정지 → 복귀 시 재개.
    ─ 효과음(휘슬·골·카드 컷인) 순간에는 볼륨을 잠깐 덕킹한다. */
(function (global) {
  'use strict';

  var DS = global.DS = global.DS || {};

  /* 테마별 기본 음량 — 경기 사운드(SFX)보다 한 단계 아래로 박혀 들리기 */
  var BASE = { lobby: 0.45, match: 0.50 };
  var BPM = { lobby: 100, match: 132 };
  var LEN = 128;                 /* 16분음표 × 16 × 8마디 = 루프 한 바퀴 */

  var A = null, dest = null;     /* 빌려 쓴 AudioContext · 마스터 게인(음소거 담당) */
  var tone = null, duckN = null, bgN = null;
  var an = null;                 /* QA용 미터 */
  var nb = null;                 /* 노이즈 버퍼 */
  var timer = null, nextT = 0, step = 0;
  var want = '', playing = false, half = false;
  var gen = 0, notes = 0, hidden = false, unlocked = false;

  /* ── 음이름 → 주파수 ── */
  var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function nn(s) {
    var m = /^([A-Ga-g])(#|b)?(-?\d)$/.exec(s);
    if (!m) { return 60; }
    var v = PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0));
    return v + (parseInt(m[3], 10) + 1) * 12;
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function chord(list) { var out = [], i; for (i = 0; i < list.length; i++) { out.push(nn(list[i])); } return out; }

  /* ── 악보 ── */
  /* 로비: F장조 8마디 (F△7 · Dm7 · B♭△7 · C7 · F△7 · Am7 · Gm7 · C7) */
  var LOB = [
    { c: chord(['F3', 'A3', 'C4', 'E4']), b: 'F2' },
    { c: chord(['D3', 'F3', 'A3', 'C4']), b: 'D2' },
    { c: chord(['Bb2', 'D3', 'F3', 'A3']), b: 'Bb1' },
    { c: chord(['C3', 'E3', 'G3', 'Bb3']), b: 'C2' },
    { c: chord(['F3', 'A3', 'C4', 'E4']), b: 'F2' },
    { c: chord(['A2', 'C3', 'E3', 'G3']), b: 'A1' },
    { c: chord(['G2', 'Bb2', 'D3', 'F3']), b: 'G1' },
    { c: chord(['C3', 'E3', 'G3', 'Bb3']), b: 'C2' }
  ];
  /* 경기: A단조 8마디 (Am · Am · F · G · Am · C · F · G) */
  var MAT = [
    { c: chord(['A3', 'C4', 'E4']), b: 'A1' },
    { c: chord(['A3', 'C4', 'E4']), b: 'A1' },
    { c: chord(['F3', 'A3', 'C4']), b: 'F1' },
    { c: chord(['G3', 'B3', 'D4']), b: 'G1' },
    { c: chord(['A3', 'C4', 'E4']), b: 'A1' },
    { c: chord(['C3', 'E3', 'G3']), b: 'C2' },
    { c: chord(['F3', 'A3', 'C4']), b: 'F1' },
    { c: chord(['G3', 'B3', 'D4']), b: 'G1' }
  ];
  var LOB_ARP = [0, 2, 3, 1, 2, 4, 3, 1];              /* 8분음표 8개 — 화음을 오르내린다 */
  var MAT_ARP = [0, 2, 4, 1, 3, 5, 2, 4, 0, 3, 1, 4, 2, 5, 3, 1];

  /* ── 그래프 ── */
  function makeNoise() {
    var n = Math.floor(A.sampleRate * 1.2), i, buf = A.createBuffer(1, n, A.sampleRate), d = buf.getChannelData(0);
    for (i = 0; i < n; i++) { d[i] = Math.random() * 2 - 1; }
    return buf;
  }
  function ensure() {
    if (A) { return true; }
    if (!DS.Match || !DS.Match.audioUnlock || !DS.Match.audioBus) { return false; }
    try { DS.Match.audioUnlock(); } catch (e) { /* 무시 */ }
    var b = null;
    try { b = DS.Match.audioBus(); } catch (e2) { b = null; }
    if (!b || !b.ctx) { return false; }
    A = b.ctx; dest = b.dest || b.ctx.destination;
    nb = makeNoise();
    return true;
  }
  /* 테마가 바뀔 때마다 출력 체인을 새로 만든다 — 이전 테마의 잔향(패드 꼬리)이
     새 테마 위에 겹쳐 들리지 않고, 끊긴 노드는 그대로 GC된다. */
  function chain() {
    tone = A.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 5200; tone.Q.value = 0.5;
    duckN = A.createGain(); duckN.gain.value = 1;
    bgN = A.createGain(); bgN.gain.value = 0.0001;
    tone.connect(duckN); duckN.connect(bgN); bgN.connect(dest);
    an = null;
  }
  function level() {
    var base = BASE[want] || 0.2;
    if (want === 'match' && half) { base *= 0.8; }
    return base;
  }
  function fadedIn(sec) {
    if (!A || !bgN) { return; }
    var now = A.currentTime;
    try {
      bgN.gain.cancelScheduledValues(now);
      bgN.gain.setValueAtTime(0.0001, now);
      bgN.gain.linearRampToValueAtTime(level(), now + (sec || 0.7));
    } catch (e) { bgN.gain.value = level(); }
  }

  /* ── 악기 ── */
  function pluck(freq, when, dur, gain) {
    var o = A.createOscillator(), g = A.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(tone);
    o.start(when); o.stop(when + dur + 0.02);
  }
  function pad(freq, when, dur, gain) {
    var o = A.createOscillator(), g = A.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, when);
    o.detune.setValueAtTime(-4, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + dur * 0.28);
    g.gain.setValueAtTime(gain, when + dur * 0.60);
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(tone);
    o.start(when); o.stop(when + dur + 0.06);
    var o2 = A.createOscillator(), g2 = A.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(freq * 2, when);
    o2.detune.setValueAtTime(6, when);
    g2.gain.setValueAtTime(0.0001, when);
    g2.gain.linearRampToValueAtTime(gain * 0.34, when + dur * 0.35);
    g2.gain.linearRampToValueAtTime(0.0001, when + dur);
    o2.connect(g2); g2.connect(tone);
    o2.start(when); o2.stop(when + dur + 0.06);
  }
  function bass(freq, when, dur, gain) {
    var o = A.createOscillator(), g = A.createGain(), lp = A.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, when);
    lp.type = 'lowpass'; lp.frequency.value = 460; lp.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(lp); lp.connect(g); g.connect(tone);
    o.start(when); o.stop(when + dur + 0.02);
  }
  function kick(when, gain) {
    var o = A.createOscillator(), g = A.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(124, when);
    o.frequency.exponentialRampToValueAtTime(46, when + 0.10);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.20);
    o.connect(g); g.connect(tone);
    o.start(when); o.stop(when + 0.24);
  }
  function snare(when, gain) {
    var s = A.createBufferSource(), f = A.createBiquadFilter(), g = A.createGain();
    s.buffer = nb;
    f.type = 'bandpass'; f.frequency.value = 2100; f.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.15);
    s.connect(f); f.connect(g); g.connect(tone);
    s.start(when, Math.random() * 0.5); s.stop(when + 0.17);
    var o = A.createOscillator(), og = A.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(196, when);
    og.gain.setValueAtTime(0.0001, when);
    og.gain.exponentialRampToValueAtTime(gain * 0.7, when + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
    o.connect(og); og.connect(tone);
    o.start(when); o.stop(when + 0.11);
  }
  function hat(when, gain) {
    var s = A.createBufferSource(), f = A.createBiquadFilter(), g = A.createGain();
    s.buffer = nb;
    f.type = 'highpass'; f.frequency.value = 7600; f.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.055);
    s.connect(f); f.connect(g); g.connect(tone);
    s.start(when, Math.random() * 0.5); s.stop(when + 0.07);
  }
  function stab(freqs, when, gain) {
    var i, o, g, lp = A.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, when); lp.Q.value = 0.9;
    lp.connect(tone);
    for (i = 0; i < freqs.length; i++) {
      o = A.createOscillator(); g = A.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(freqs[i], when);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(gain, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.32);
      o.connect(g); g.connect(lp);
      o.start(when); o.stop(when + 0.35);
    }
  }

  /* ── 한 스텝(16분음표) ── */
  function stepLobby(when, bar, i, sd) {
    var c = LOB[bar % 8].c, k;
    if (i === 0) {
      for (k = 0; k < c.length; k++) { pad(mtof(c[k]), when, sd * 15.4, 0.058); }
      bass(mtof(nn(LOB[bar % 8].b)), when, sd * 3.1, 0.32);
      kick(when, 0.22);
    }
    if (i === 8) { bass(mtof(nn(LOB[bar % 8].b) + 7), when, sd * 2.6, 0.24); }
    if (i % 2 === 0) {
      var idx = LOB_ARP[(i / 2) % 8];
      var n = c[idx % c.length] + (idx >= c.length ? 12 : 0) + 12;
      pluck(mtof(n), when, sd * 1.7, 0.115);
    }
    if (i === 4 || i === 12) { hat(when, 0.05); }
    if (i === 2 || i === 6 || i === 10 || i === 14) { hat(when, 0.028); }
    if (i === 12 && bar % 2 === 1) { snare(when, 0.055); }
  }
  function stepMatch(when, bar, i, sd) {
    var m = MAT[bar % 8], c = m.c, k, tr = half ? -3 : 0;
    if (i === 0 || i === 6 || i === 8) { kick(when, 0.30); }
    if (i === 4 || i === 12) { snare(when, half ? 0.05 : 0.10); }
    if (i % 2 === 0) { hat(when, i % 4 === 0 ? 0.045 : 0.026); }
    if (i % 2 === 0) {
      var bn = nn(m.b) + ((i === 6 || i === 14) ? 12 : 0) + tr;
      bass(mtof(bn), when, sd * 1.5, 0.26);
    }
    var idx = MAT_ARP[i], n2 = c[idx % c.length] + (idx >= c.length ? 12 : 0) + 12;
    pluck(mtof(n2 + tr), when, sd * 0.95, 0.085);
    if (i === 0 && (bar % 4 === 3)) {
      var fr = [];
      for (k = 0; k < c.length; k++) { fr.push(mtof(c[k] + tr)); }
      stab(fr, when, 0.035);
    }
  }
  function stepDur() { return 60 / (BPM[want] || 110) / 4; }

  function tick() {
    if (!playing || !A || hidden) { return; }
    var horizon = A.currentTime + 0.18, sd = stepDur(), guard = 0;
    while (nextT < horizon && guard++ < 16) {
      var bar = Math.floor(step / 16), i = step % 16;
      try {
        if (want === 'lobby') { stepLobby(nextT, bar, i, sd); }
        else { stepMatch(nextT, bar, i, sd); }
        notes++;
      } catch (e) { /* 오디오 미지원 · 무시 */ }
      step = (step + 1) % LEN;
      nextT += sd;
    }
    if (nextT < A.currentTime - 1) { nextT = A.currentTime + 0.05; }   /* 백그라운드에서 밀렸을 때 */
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  function begin(name, fadeIn) {
    want = name;
    if (!ensure()) { return; }
    if (DS.Match && DS.Match.isMuted && DS.Match.isMuted()) { stopTimer(); playing = false; return; }
    if (A.state === 'suspended') {
      try { var pr = A.resume(); if (pr && pr['catch']) { pr['catch'](function () {}); } } catch (e) { /* 무시 */ }
    }
    stopTimer();
    chain();
    step = 0;
    nextT = A.currentTime + 0.12;
    playing = true;
    fadedIn(fadeIn || 0.7);
    timer = setInterval(tick, 30);
    tick();
  }

  /* ── 공개 API ── */
  function play(name, fadeOut) {
    if (!name) { return; }
    if (want === name && playing && !hidden) { return; }
    /* 아직 사용자 제스처가 없으면 컨텍스트를 만들지 않고 예약만 해 둔다
       (모바일 자동재생 경고를 만들지 않기 위해 첫 터치까지 기다린다) */
    if (!unlocked && !A) {
      want = name;
      playing = false;
      return;
    }
    if (playing && fadeOut > 0 && A && bgN) {
      var my = ++gen;
      try {
        var now = A.currentTime;
        bgN.gain.cancelScheduledValues(now);
        bgN.gain.setTargetAtTime(0.0001, now, Math.max(0.05, fadeOut / 3));
      } catch (e) { /* 무시 */ }
      stopTimer();
      playing = false;
      global.setTimeout(function () {
        if (my !== gen) { return; }
        begin(name, 0.55);
      }, Math.round(fadeOut * 1000));
      want = name;
      return;
    }
    gen++;
    begin(name, 0.7);
  }
  function stop(fadeOut) {
    want = '';
    gen++;
    stopTimer();
    playing = false;
    if (A && bgN) {
      var now = A.currentTime, f = Math.max(0.05, (fadeOut || 0.3) / 3);
      try {
        bgN.gain.cancelScheduledValues(now);
        bgN.gain.setTargetAtTime(0.0001, now, f);
      } catch (e) { /* 무시 */ }
    }
  }
  function setHalf(v) {
    var h = !!v;
    if (h === half) { return; }
    half = h;
    if (!A || !tone) { return; }
    var now = A.currentTime;
    try {
      tone.frequency.cancelScheduledValues(now);
      tone.frequency.setValueAtTime(tone.frequency.value, now);
      tone.frequency.linearRampToValueAtTime(half ? 1250 : 5200, now + 0.45);
      if (bgN) {
        bgN.gain.cancelScheduledValues(now);
        bgN.gain.setTargetAtTime(playing ? level() : 0.0001, now, 0.18);
      }
    } catch (e) { /* 무시 */ }
  }
  function duck(ms) {
    if (!playing || !A || !duckN) { return; }
    var now = A.currentTime, hold = Math.max(0.18, (ms || 600) / 1000);
    try {
      /* 지금 값이 아니라 '덕킹 레벨'을 기준으로 다시 건다 — 연속 덕킹에서도 값이 튀지 않는다 */
      duckN.gain.cancelScheduledValues(now);
      duckN.gain.setValueAtTime(duckN.gain.value > 0.9 ? 1 : duckN.gain.value, now);
      duckN.gain.linearRampToValueAtTime(0.26, now + 0.06);
      duckN.gain.setValueAtTime(0.26, now + hold);
      duckN.gain.linearRampToValueAtTime(1, now + hold + 0.35);
    } catch (e) { /* 무시 */ }
  }
  function refreshMute() {
    var muted = !!(DS.Match && DS.Match.isMuted && DS.Match.isMuted());
    if (muted) { stopTimer(); playing = false; }
    else if (want && !hidden) { begin(want, 0.6); }
  }
  function onHide() {
    if (hidden) { return; }
    hidden = true;
    stopTimer();
    if (!A) { return; }
    try {
      var now = A.currentTime;
      if (bgN) {
        bgN.gain.cancelScheduledValues(now);
        bgN.gain.setTargetAtTime(0.0001, now, 0.04);
      }
    } catch (e) { /* 무시 */ }
    global.setTimeout(function () {
      if (!hidden || !A || !A.suspend) { return; }
      try { A.suspend(); } catch (e) { /* 무시 */ }
    }, 160);
  }
  function onShow() {
    if (!hidden) { return; }
    hidden = false;
    if (!A) { return; }
    if (A.state === 'suspended') {
      try { var pr = A.resume(); if (pr && pr['catch']) { pr['catch'](function () {}); } } catch (e) { /* 무시 */ }
    }
    if (DS.Match && DS.Match.isMuted && DS.Match.isMuted()) { return; }
    if (want) { begin(want, 0.5); }
  }
  function unlock() {
    unlocked = true;
    if (DS.Match && DS.Match.isMuted && DS.Match.isMuted()) {
      if (DS.Match.audioUnlock) { try { DS.Match.audioUnlock(); } catch (e) { /* 무시 */ } }
      return;
    }
    if (!ensure()) { return; }
    if (want) { begin(want, 0.8); }
  }
  function state() {
    var muted = !!(DS.Match && DS.Match.isMuted && DS.Match.isMuted());
    return {
      theme: want, playing: !!playing, half: !!half, muted: muted,
      ctx: A ? A.state : 'none', gain: bgN ? Math.round(bgN.gain.value * 100) / 100 : 0,
      duck: duckN ? Math.round(duckN.gain.value * 100) / 100 : 0,
      step: step, notes: notes, unlocked: unlocked, hidden: hidden
    };
  }
  /* QA — 지금 BGM이 실제로 소리를 내고 있는지 수치로 본다 (RMS/피크) */
  function meter() {
    if (!A || !bgN) { return null; }
    if (!an) { an = A.createAnalyser(); an.fftSize = 2048; bgN.connect(an); }
    var buf = new Float32Array(an.fftSize), i, v, pk = 0, sum = 0;
    an.getFloatTimeDomainData(buf);
    for (i = 0; i < buf.length; i++) { v = Math.abs(buf[i]); if (v > pk) { pk = v; } sum += v * v; }
    return { rms: Math.round(Math.sqrt(sum / buf.length) * 10000) / 10000, peak: Math.round(pk * 1000) / 1000 };
  }

  DS.Bgm = {
    play: play, stop: stop, setHalf: setHalf, duck: duck, refreshMute: refreshMute,
    unlock: unlock, onHide: onHide, onShow: onShow, state: state, meter: meter
  };

  /* 첫 사용자 제스처에서 오디오 문을 연다 (모바일 자동재생 정책) */
  function onFirst() {
    if (unlocked) { return; }
    offGesture();
    unlock();
  }
  var GEST = ['pointerdown', 'touchstart', 'mousedown', 'click', 'keydown'];
  function offGesture() {
    var i;
    for (i = 0; i < GEST.length; i++) {
      try { global.removeEventListener(GEST[i], onFirst, true); } catch (e) { /* 무시 */ }
    }
  }
  (function bind() {
    var i;
    for (i = 0; i < GEST.length; i++) {
      try { global.addEventListener(GEST[i], onFirst, true); } catch (e) { /* 무시 */ }
    }
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'hidden') { onHide(); } else { onShow(); }
      });
      global.addEventListener('pagehide', onHide);
      global.addEventListener('pageshow', onShow);
    }
  })();

})(window);
