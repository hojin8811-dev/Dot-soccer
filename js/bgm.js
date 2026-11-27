/*! 꼬마일레븐 FC v27 — BGM (Web Audio 합성 · 외부 음원 0)
    ─ 오디오 엔진: 마스터 컴프레서(DynamicsCompressor) + 핑퐁 딜레이 · 짧은 스테레오 리버브 샌드 버스
      → 음압이 균형 잡히고 평평한 전자음 대신 공간감 있는 사운드트랙이 된다.
    ─ 드럼: 킥(피치 스윕 + 클릭/바디) · 스네어(필터드 노이즈 + 톤 바디) · 하이햇(고역 노이즈 엔벨로프)
    ─ 로비 테마: F장조 100BPM **16마디 A-B**(1~8 A · 9~16 브리지/변주)
      로우패스 엔벨로프가 걸린 FM 일렉트릭 피아노 + 따뜻한 패드 + 워킹 베이스 + 맑은 플럭 멜로디
    ─ 경기 테마: A단조 132BPM **16마디 A-B**, 드라이빙 신스 베이스 + 리듬 기타/플럭 아르페지오
      + 옥타브 스타디움 리드. 하프타임엔 필터를 부드럽게 내리고 편성을 가볍게 한다.
    ─ AudioContext는 경기 사운드(match.js SND)가 만든 것을 그대로 빌려 쓴다(중복 생성·누수 없음).
      음소거(dot-soccer-mute)는 SND 마스터 게인 하나로 함께 꺼진다.
    ─ 첫 사용자 제스처에서 resume, 탭 비활성/백그라운드에서 자동 일시정지 → 복귀 시 재개.
    ─ 효과음(휘슬·골·카드 컷인) 순간에는 볼륨을 잠깐 덕킹한다. */
(function (global) {
  'use strict';

  var DS = global.DS = global.DS || {};

  /* 테마별 기본 음량 — 경기 사운드(SFX)보다 한 단계 아래로 박혀 들리기 */
  var BASE = { lobby: 0.60, match: 0.62 };
  var BPM = { lobby: 100, match: 132 };
  var LEN = 256;                 /* 16분음표 × 16 × 16마디 = 루프 한 바퀴 */

  var A = null, dest = null;     /* 빌려 쓴 AudioContext · 마스터 게인(음소거 담당) */
  var busIn = null, comp = null, tone = null, duckN = null, bgN = null;
  var sendD = null, sendR = null, dL = null, dR = null;
  var an = null;                 /* QA용 미터 */
  var nb = null, ir = null;      /* 노이즈 버퍼 · 리버브 임펄스 */
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
  /* 'A4 C5 - E5' → [69, 72, 0, 76] (0 = 쉼표) */
  function seq(s) {
    var p = s.split(' '), out = [], i;
    for (i = 0; i < p.length; i++) { out.push(!p[i] || p[i] === '-' ? 0 : nn(p[i])); }
    return out;
  }

  /* ═════════════════ 악보 ═════════════════ */
  /* 로비 — F장조 16마디: A(1~8) F△7 Dm7 B♭△7 C7 F△7 Am7 Gm7 C7
     B(9~16) B♭△7 Am7 Gm7 C7 F△7 Dm7 Gm7 C7 (브리지 + 변주) */
  var LOB = [
    { c: chord(['F3', 'A3', 'C4', 'E4']), w: ['F2', 'A2', 'C3', 'A2'], m: seq('A4 C5 F5 - E5 C5 A4 -') },
    { c: chord(['D3', 'F3', 'A3', 'C4']), w: ['D2', 'A2', 'F2', 'A2'], m: seq('D5 F5 A5 - G5 F5 D5 -') },
    { c: chord(['Bb2', 'D3', 'F3', 'A3']), w: ['Bb1', 'F2', 'D2', 'F2'], m: seq('F5 Bb5 D6 - C6 Bb5 F5 -') },
    { c: chord(['C3', 'E3', 'G3', 'Bb3']), w: ['C2', 'G2', 'E2', 'G2'], m: seq('E5 G5 Bb5 - C6 - G5 E5') },
    { c: chord(['E3', 'A3', 'C4', 'F4']), w: ['F2', 'A2', 'C3', 'A2'], m: seq('F5 A5 C6 - F6 C6 A5 -') },
    { c: chord(['A2', 'C3', 'E3', 'G3']), w: ['A1', 'E2', 'C3', 'E2'], m: seq('E5 A5 C6 - B5 A5 E5 -') },
    { c: chord(['G2', 'Bb2', 'D3', 'F3']), w: ['G1', 'D2', 'Bb1', 'D2'], m: seq('D5 G5 Bb5 - A5 G5 D5 -') },
    { c: chord(['Bb2', 'D3', 'E3', 'G3']), w: ['C2', 'G2', 'E2', 'Bb1'], m: seq('C5 E5 G5 Bb5 C6 - G5 -') },
    { c: chord(['D3', 'F3', 'A3', 'C4']), w: ['Bb1', 'F2', 'D2', 'F2'], m: seq('D5 F5 Bb5 - A5 F5 D5 -') },
    { c: chord(['C3', 'E3', 'G3', 'A3']), w: ['A1', 'E2', 'C3', 'E2'], m: seq('C5 E5 A5 - G5 E5 C5 -') },
    { c: chord(['Bb2', 'D3', 'F3', 'G3']), w: ['G1', 'D2', 'Bb1', 'G1'], m: seq('Bb4 D5 G5 - F5 D5 Bb4 -') },
    { c: chord(['C3', 'E3', 'G3', 'Bb3']), w: ['C2', 'E2', 'G2', 'Bb2'], m: seq('C5 E5 G5 - C6 - G5 E5') },
    { c: chord(['F3', 'A3', 'C4', 'E4']), w: ['F2', 'A2', 'C3', 'A2'], m: seq('A5 C6 F6 - E6 C6 A5 -') },
    { c: chord(['A3', 'C4', 'D4', 'F4']), w: ['D2', 'A2', 'F2', 'A2'], m: seq('D6 A5 F5 - A5 D5 F5 -') },
    { c: chord(['G3', 'Bb3', 'D4', 'F4']), w: ['G1', 'D2', 'Bb1', 'D2'], m: seq('Bb5 G5 D5 - G5 Bb5 D6 -') },
    { c: chord(['Bb3', 'C4', 'E4', 'G4']), w: ['C2', 'G2', 'Bb2', 'C3'], m: seq('C6 Bb5 G5 E5 C5 - - -') }
  ];

  /* 경기 — A단조 16마디: A(1~8) Am Am F G Am C F G
     B(9~16) Dm Am F G Am F G E (긴장 → Am 복귀) */
  var MAT = [
    { r: 33, c: chord(['A3', 'C4', 'E4']), l: seq('A4 C5') },           /* Am */
    { r: 33, c: chord(['A3', 'C4', 'E4']), l: seq('A4 -') },
    { r: 29, c: chord(['F3', 'A3', 'C4']), l: seq('F4 A4') },           /* F  */
    { r: 31, c: chord(['G3', 'B3', 'D4']), l: seq('G4 B4') },           /* G  */
    { r: 33, c: chord(['A3', 'C4', 'E4']), l: seq('A4 E5') },
    { r: 36, c: chord(['C4', 'E4', 'G4']), l: seq('E5 C5') },           /* C  */
    { r: 29, c: chord(['F3', 'A3', 'C4']), l: seq('F4 A4') },
    { r: 31, c: chord(['G3', 'B3', 'D4']), l: seq('G4 D5') },
    { r: 38, c: chord(['D3', 'F3', 'A3']), l: seq('D5 F5') },           /* Dm */
    { r: 33, c: chord(['A3', 'C4', 'E4']), l: seq('E5 C5') },
    { r: 29, c: chord(['F3', 'A3', 'C4']), l: seq('A4 C5') },
    { r: 31, c: chord(['G3', 'B3', 'D4']), l: seq('B4 D5') },
    { r: 33, c: chord(['A3', 'C4', 'E4']), l: seq('A4 E5') },
    { r: 29, c: chord(['F3', 'A3', 'C4']), l: seq('F4 A4') },
    { r: 31, c: chord(['G3', 'B3', 'D4']), l: seq('G4 B4') },
    { r: 40, c: chord(['E3', 'G#3', 'B3']), l: seq('E5 -') }            /* E7 → Am */
  ];
  var MAT_BS = [0, 0, 12, 0, 7, 0, 12, 10];       /* 8분음표 8개 — 루트·옥타브·5도 드라이빙 */
  var MAT_ARP = [0, 1, 2, 3, 4, 5, 4, 3, 0, 2, 4, 5, 3, 1, 2, 4];

  /* ═════════════════ 그래프 ═════════════════ */
  function makeNoise() {
    var n = Math.floor(A.sampleRate * 1.2), i, buf = A.createBuffer(1, n, A.sampleRate), d = buf.getChannelData(0);
    for (i = 0; i < n; i++) { d[i] = Math.random() * 2 - 1; }
    return buf;
  }
  /* 짧은 스테레오 리버브 — 지수 감쇠 노이즈 임펄스(외부 IR 없음) */
  function makeIR() {
    var sr = A.sampleRate, len = Math.floor(sr * 1.05), ch, i;
    var buf = A.createBuffer(2, len, sr);
    for (ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch), pre = Math.floor(sr * 0.014);
      for (i = 0; i < len; i++) {
        if (i < pre) { d[i] = 0; continue; }
        var t = (i - pre) / (len - pre);
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.7) * (ch ? 0.9 : 1);
      }
    }
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
    ir = makeIR();
    return true;
  }
  function panner(v) {
    if (!A || !A.createStereoPanner) { return null; }
    var p = A.createStereoPanner();
    p.pan.value = v;
    return p;
  }
  function stepDur() {
    var sd = 60 / (BPM[want] || 110) / 4;
    if (half) { sd *= 0.94; }             /* 하프타임은 아주 살짝 늘어져 긴장을 푼다 */
    return sd;
  }

  /* 테마가 바뀔 때마다 출력 체인을 새로 만든다 — 이전 테마의 잔향(패드 꼬리)이
     새 테마 위에 겹쳐 들리지 않고, 끊긴 노드는 그대로 GC된다. */
  function chain() {
    busIn = A.createGain();
    busIn.gain.value = 0.92;

    /* 마스터 컴프레서 — 음압 균형(작은 소리는 살리고 큰 소리는 눌러 클리핑 방지) */
    comp = A.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 3.6;
    comp.attack.value = 0.006;
    comp.release.value = 0.24;

    tone = A.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 5200; tone.Q.value = 0.5;
    duckN = A.createGain(); duckN.gain.value = 1;
    bgN = A.createGain(); bgN.gain.value = 0.0001;

    busIn.connect(comp); comp.connect(tone); tone.connect(duckN); duckN.connect(bgN); bgN.connect(dest);

    /* ── 딜레이 샌드(핑퐁) — 좌우로 번지는 짧은 잔향 ── */
    sendD = A.createGain(); sendD.gain.value = 0.30;
    dL = A.createDelay(1.5); dR = A.createDelay(1.5);
    var dt = 60 / (BPM[want] || 110) * 0.75;
    dL.delayTime.value = dt; dR.delayTime.value = dt;
    var dhp = A.createBiquadFilter(); dhp.type = 'highpass'; dhp.frequency.value = 340;
    var dlp = A.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3400;
    var fb = A.createGain(); fb.gain.value = 0.30;
    var dWet = A.createGain(); dWet.gain.value = 0.42;
    var pL = panner(-0.78), pR = panner(0.78);
    sendD.connect(dhp); dhp.connect(dL);
    if (pL) { dL.connect(pL); pL.connect(dWet); } else { dL.connect(dWet); }
    dL.connect(dR);
    if (pR) { dR.connect(pR); pR.connect(dWet); } else { dR.connect(dWet); }
    dR.connect(fb); fb.connect(dlp); dlp.connect(dL);
    dWet.connect(busIn);

    /* ── 리버브 샌드(짧은 스테레오 감쇠) ── */
    sendR = A.createGain(); sendR.gain.value = 0.40;
    var rlp = A.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 4300;
    var cv = A.createConvolver(); cv.buffer = ir;
    var rWet = A.createGain(); rWet.gain.value = 0.40;
    sendR.connect(rlp); rlp.connect(cv); cv.connect(rWet); rWet.connect(busIn);

    an = null;
  }
  function level() {
    var base = BASE[want] || 0.2;
    if (want === 'match' && half) { base *= 0.82; }
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

  /* ═════════════════ 악기 ═════════════════ */
  /* 따뜻한 패드 — 살짝 디튠한 톱니 두 겹을 로우패스로 감고 좌우로 벌린다 */
  function pad(freqs, when, dur, gain) {
    var lp = A.createBiquadFilter(), i;
    lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(620, when);
    lp.frequency.linearRampToValueAtTime(1650, when + Math.min(0.9, dur * 0.45));
    lp.frequency.linearRampToValueAtTime(760, when + dur);
    lp.connect(busIn);
    if (sendR) { lp.connect(sendR); }
    for (i = 0; i < freqs.length; i++) {
      var o = A.createOscillator(), o2 = A.createOscillator(), g = A.createGain(), g2 = A.createGain();
      var pan = panner(freqs.length > 1 ? -0.55 + i * (1.1 / (freqs.length - 1)) : 0);
      o.type = 'sawtooth'; o.frequency.value = freqs[i]; o.detune.value = -5;
      o2.type = 'sawtooth'; o2.frequency.value = freqs[i]; o2.detune.value = 7;
      g2.gain.value = 0.55;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.42);
      g.gain.setValueAtTime(gain, when + dur * 0.62);
      g.gain.linearRampToValueAtTime(0.0001, when + dur);
      o.connect(g); o2.connect(g2); g2.connect(g);
      if (pan) { g.connect(pan); pan.connect(lp); } else { g.connect(lp); }
      o.start(when); o.stop(when + dur + 0.06);
      o2.start(when); o2.stop(when + dur + 0.06);
    }
  }

  /* 일렉트릭 피아노 — FM(모듈레이터가 빨리 잦아들며 벨 같은 어택) + 로우패스 엔벨로프 */
  function epiano(freqs, when, dur, gain) {
    var lp = A.createBiquadFilter(), i;
    lp.type = 'lowpass'; lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(3000, when);
    lp.frequency.exponentialRampToValueAtTime(820, when + Math.min(0.85, dur * 0.6));
    lp.connect(busIn);
    if (sendD) { lp.connect(sendD); }
    for (i = 0; i < freqs.length; i++) {
      var f = freqs[i], o = A.createOscillator(), mod = A.createOscillator(), mg = A.createGain(), g = A.createGain();
      o.type = 'sine'; o.frequency.value = f;
      mod.type = 'sine'; mod.frequency.value = f * 2;
      mg.gain.setValueAtTime(f * 1.15, when);
      mg.gain.exponentialRampToValueAtTime(f * 0.05, when + 0.42);
      mod.connect(mg); mg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.014);
      g.gain.exponentialRampToValueAtTime(gain * 0.42, when + 0.28);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g); g.connect(lp);
      o.start(when); o.stop(when + dur + 0.05);
      mod.start(when); mod.stop(when + dur + 0.05);
    }
  }

  /* 맑은 플럭 — 삼각파 + 옥타브 사각파 살짝, 필터가 빠르게 닫힌다 */
  function pluck(freq, when, dur, gain) {
    var o = A.createOscillator(), o2 = A.createOscillator(), g = A.createGain(), g2 = A.createGain();
    var lp = A.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = freq;
    o2.type = 'square'; o2.frequency.value = freq * 2; g2.gain.value = 0.20;
    lp.type = 'lowpass'; lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(Math.min(9000, freq * 8), when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(700, freq * 2.1), when + Math.max(0.09, dur * 0.7));
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(busIn);
    if (sendD) { lp.connect(sendD); }
    o.start(when); o.stop(when + dur + 0.02);
    o2.start(when); o2.stop(when + dur + 0.02);
  }

  /* 워킹 업라이트 베이스 — 둥근 삼각파 + 서브, 몸통만 남기는 로우패스 */
  function bass(freq, when, dur, gain) {
    var o = A.createOscillator(), o2 = A.createOscillator(), g = A.createGain(), g2 = A.createGain();
    var lp = A.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = freq;
    o2.type = 'sine'; o2.frequency.value = freq * 0.5; g2.gain.value = 0.45;
    lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.022);
    g.gain.exponentialRampToValueAtTime(gain * 0.36, when + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(busIn);
    o.start(when); o.stop(when + dur + 0.02);
    o2.start(when); o2.stop(when + dur + 0.02);
  }

  /* 드라이빙 신스 베이스 — 톱니+사각 디튠, 공격적인 필터 엔벨로프 */
  function bassSyn(freq, when, dur, gain) {
    var o = A.createOscillator(), o2 = A.createOscillator(), g = A.createGain(), g2 = A.createGain();
    var lp = A.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = freq;
    o2.type = 'square'; o2.frequency.value = freq; o2.detune.value = -8; g2.gain.value = 0.30;
    lp.type = 'lowpass'; lp.Q.value = 5.2;
    lp.frequency.setValueAtTime(1450, when);
    lp.frequency.exponentialRampToValueAtTime(240, when + Math.max(0.11, dur));
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.007);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(busIn);
    o.start(when); o.stop(when + dur + 0.02);
    o2.start(when); o2.stop(when + dur + 0.02);
  }

  /* 옥타브 스타디움 리드 — 톱니 두 겹(좌우) + 옥타브 위 한 겹(가운데) */
  function lead(freq, when, dur, gain) {
    var lp = A.createBiquadFilter(), g = A.createGain(), i;
    lp.type = 'lowpass'; lp.Q.value = 1.1;
    lp.frequency.setValueAtTime(4400, when);
    lp.frequency.linearRampToValueAtTime(2000, when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.055);
    g.gain.setValueAtTime(gain * 0.88, when + dur * 0.55);
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    g.connect(lp); lp.connect(busIn);
    if (sendD) { lp.connect(sendD); }
    if (sendR) { lp.connect(sendR); }
    var spec = [[freq, -0.55, 1], [freq, 0.55, 1], [freq * 2, 0, 0.42]];
    for (i = 0; i < spec.length; i++) {
      var o = A.createOscillator(), vg = A.createGain(), pan = panner(spec[i][1]);
      o.type = 'sawtooth'; o.frequency.value = spec[i][0];
      o.detune.value = i === 0 ? -7 : (i === 1 ? 7 : 0);
      vg.gain.value = spec[i][2];
      o.connect(vg);
      if (pan) { vg.connect(pan); pan.connect(g); } else { vg.connect(g); }
      o.start(when); o.stop(when + dur + 0.05);
    }
  }

  /* 리듬 기타 — 오프비트 짧은 스탭, 밴드패스로 톡 쏘는 질감 */
  function guitar(freqs, when, gain) {
    var bp = A.createBiquadFilter(), i;
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.85;
    bp.connect(busIn);
    for (i = 0; i < freqs.length; i++) {
      var o = A.createOscillator(), g = A.createGain();
      o.type = 'sawtooth'; o.frequency.value = freqs[i];
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(gain / freqs.length, when + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
      o.connect(g); g.connect(bp);
      o.start(when); o.stop(when + 0.14);
    }
  }

  /* ── 드럼 ── */
  function kick(when, gain) {
    var o = A.createOscillator(), g = A.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(152, when);
    o.frequency.exponentialRampToValueAtTime(44, when + 0.105);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.005);
    g.gain.exponentialRampToValueAtTime(gain * 0.34, when + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.30);
    o.connect(g); g.connect(busIn);
    o.start(when); o.stop(when + 0.33);
    /* 클릭(비터) — 어택을 살린다 */
    var s = A.createBufferSource(), hp = A.createBiquadFilter(), cg = A.createGain();
    s.buffer = nb; hp.type = 'highpass'; hp.frequency.value = 1900;
    cg.gain.setValueAtTime(gain * 0.32, when);
    cg.gain.exponentialRampToValueAtTime(0.0001, when + 0.022);
    s.connect(hp); hp.connect(cg); cg.connect(busIn);
    s.start(when, Math.random() * 0.3); s.stop(when + 0.03);
  }
  function snare(when, gain) {
    var s = A.createBufferSource(), bp = A.createBiquadFilter(), hp = A.createBiquadFilter(), g = A.createGain();
    s.buffer = nb;
    hp.type = 'highpass'; hp.frequency.value = 700;
    bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    s.connect(hp); hp.connect(bp); bp.connect(g); g.connect(busIn);
    if (sendR) { g.connect(sendR); }
    s.start(when, Math.random() * 0.4); s.stop(when + 0.18);
    var o = A.createOscillator(), og = A.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(212, when);
    o.frequency.exponentialRampToValueAtTime(148, when + 0.07);
    og.gain.setValueAtTime(0.0001, when);
    og.gain.exponentialRampToValueAtTime(gain * 0.72, when + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 0.10);
    o.connect(og); og.connect(busIn);
    o.start(when); o.stop(when + 0.12);
  }
  function hat(when, gain) {
    var s = A.createBufferSource(), hp = A.createBiquadFilter(), g = A.createGain();
    s.buffer = nb;
    hp.type = 'highpass'; hp.frequency.value = 8200; hp.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.055);
    s.connect(hp); hp.connect(g); g.connect(busIn);
    s.start(when, Math.random() * 0.5); s.stop(when + 0.07);
  }
  function openHat(when, gain) {
    var s = A.createBufferSource(), hp = A.createBiquadFilter(), g = A.createGain();
    s.buffer = nb;
    hp.type = 'highpass'; hp.frequency.value = 7200; hp.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.17);
    s.connect(hp); hp.connect(g); g.connect(busIn);
    s.start(when, Math.random() * 0.5); s.stop(when + 0.19);
  }

  /* ═════════════════ 한 스텝(16분음표) ═════════════════ */
  function stepLobby(when, bar, i, sd) {
    var L = LOB[bar % 16];
    /* 드럼 — 가볍게 굴러가는 4/4 */
    if (i === 0) { kick(when, 0.30); }
    if (i === 8) { kick(when, 0.15); }
    if (bar % 2 === 1 && (i === 4 || i === 12)) { snare(when, 0.052); }
    if (i % 2 === 0) { hat(when, i % 4 === 0 ? 0.028 : 0.017); }
    if (i === 14 && bar % 8 === 7) { openHat(when, 0.05); }
    /* 화음 — 마디마다 패드 1회 + 일렉피아노 (3박에 한 번 더 톡) */
    if (i === 0) {
      pad(L.c, when, sd * 16.2, 0.030);
      epiano(L.c, when, sd * 14.5, 0.040);
    }
    if (i === 8) { epiano(L.c, when, sd * 6.6, 0.026); }
    /* 워킹 베이스 — 4분음표 */
    if (i % 4 === 0) {
      bass(mtof(nn(L.w[i / 4])), when, sd * 3.3, 0.27);
    }
    /* 맑은 플럭 멜로디 — 8분음표 */
    if (i % 2 === 0) {
      var m = L.m[i / 2];
      if (m) { pluck(mtof(m), when, sd * 3.4, 0.072); }
    }
    /* A→B 넘어가는 마디 끝 필 */
    if (i === 13 && bar === 7) { snare(when, 0.040); }
    if (i === 15 && bar === 7) { snare(when, 0.055); }
    /* B 섹션은 살짝 더 밝게 — 멜로디 옥타브를 겹친다 */
    if (bar >= 8 && i % 4 === 0 && L.m[i / 4]) { pluck(mtof(L.m[i / 4] + 12), when, sd * 2.2, 0.022); }
  }

  function stepMatch(when, bar, i, sd) {
    var L = MAT[bar % 16], c = L.c, k, ai, n2;
    /* 드럼 — 하프타임엔 성기고 부드럽게 */
    if (!half) {
      if (i === 0 || i === 6 || i === 10) { kick(when, 0.34); }
      if (i === 8) { kick(when, 0.24); }
      if (i === 4 || i === 12) { snare(when, 0.115); }
      if (i % 2 === 0) { hat(when, i % 4 === 0 ? 0.036 : 0.019); }
      if (i === 14 && bar % 2 === 1) { openHat(when, 0.045); }
    } else {
      if (i === 0) { kick(when, 0.26); }
      if (i === 12) { snare(when, 0.06); }
      if (i % 4 === 0) { hat(when, 0.014); }
    }
    /* 패드 — 마디마다 한 번, 하프타임엔 더 낮게 */
    if (i === 0) { pad(c, when, sd * 16.2, half ? 0.021 : 0.028); }
    /* 드라이빙 신스 베이스 — 8분음표 */
    if (i % 2 === 0) {
      bassSyn(mtof(L.r + MAT_BS[i / 2]), when, sd * 1.7, 0.22);
    }
    /* 플럭 아르페지오 — 16분(하프타임엔 8분으로 성기게) */
    if (!half || i % 2 === 0) {
      ai = MAT_ARP[i];
      n2 = c[ai % c.length] + (ai >= c.length ? 12 : 0) + 12;
      pluck(mtof(n2), when, sd * 1.35, i % 4 === 0 ? 0.070 : 0.042);
    }
    /* 옥타브 스타디움 리드 — 마디 머리 + 3박 */
    if (i === 0 || i === 8) {
      var ln = L.l[i === 0 ? 0 : 1];
      if (ln) { lead(mtof(ln), when, sd * (i === 0 ? 7.6 : 6.2), 0.080); }
    }
    /* 리듬 기타 — 오프비트 스탭 */
    if (!half && (i === 2 || i === 6 || i === 10 || i === 14)) {
      var gf = [];
      for (k = 0; k < c.length; k++) { gf.push(mtof(c[k] + 12)); }
      guitar(gf, when, 0.05);
    }
  }

  function tick() {
    if (!playing || !A || hidden) { return; }
    var horizon = A.currentTime + 0.18, sd = stepDur(), guard = 0;
    while (nextT < horizon && guard++ < 20) {
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
  /* 하프타임 — 부드러운 필터 다운(고역을 걷어내고 조금 낮춘다) */
  function setHalf(v) {
    var h = !!v;
    if (h === half) { return; }
    half = h;
    if (!A || !tone) { return; }
    var now = A.currentTime;
    try {
      tone.frequency.cancelScheduledValues(now);
      tone.frequency.setValueAtTime(tone.frequency.value, now);
      tone.frequency.linearRampToValueAtTime(half ? 980 : 5200, now + 0.60);
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
      step: step, notes: notes, unlocked: unlocked, hidden: hidden,
      bars: 16, comp: comp ? Math.round(comp.reduction * 10) / 10 : 0
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
