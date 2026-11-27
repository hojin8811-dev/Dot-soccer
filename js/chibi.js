/*! 꼬마일레븐 FC v32 — 치비 관절 리그 (chibi.js)
    build: scripts/chibi_head_build.py — assets/chibi/heads/*.png

    v31까지는 정지 전신 PNG 4장(run_a/run_b/kick/tackle)을 갈아 끼워 "그림이 떠다니는" 느낌이었다.
    v32는 머리·몸통·양팔·양다리를 분리해 **매 프레임 관절을 돌려** 그린다.

    · 머리  : 기존 치비 일러스트에서 분리한 8종(heads/h0~h2·a0~a2·g0~g1)을 목선에 얹는다.
    · 몸통·팔·다리 : 둥근 캡슐(라운드 캡)로 그려 어깨·고관절·무릎이 찢어지지 않는다.
      유니폼(홈 파랑/골드 · 원정 빨강/검정 · GK 노랑/초록·노랑/검정)과 스킨톤을 타입별로 유지.
    · 자세    : 달리기(이동 속도 → 위상) · 대기 호흡 · 슛/패스 킥 스윙 · 슬라이딩 태클
                · GK 다이빙 · 점프(헤딩) · 세리브레이션 · 스턴.

    좌표계: 1단위 = v31 스프라이트 150px 기준 1px. 발바닥 y=0, 위가 음수. +x = 바라보는 방향.
*/
(function (g) {
  'use strict';
  g.DS = g.DS || {};
  var CB = g.DS.CHIBI = g.DS.CHIBI || {};

  /* ── 머리 파츠 메타 (scripts/chibi_head_build.py 산출) ── */
  CB.HEAD = {
    h0: { w: 92, h: 80, cx: 50.6 },
    h1: { w: 88, h: 78, cx: 45.4 },
    h2: { w: 95, h: 80, cx: 49.7 },
    a0: { w: 107, h: 78, cx: 60.3 },
    a1: { w: 92, h: 80, cx: 49.5 },
    a2: { w: 91, h: 80, cx: 46.9 },
    g0: { w: 137, h: 78, cx: 68.0 },
    g1: { w: 141, h: 78, cx: 70.0 }
  };
  /* 초상화 머리색 → 치비 타입 (0 갈색 · 1 흑발 · 2 금발/은발) */
  CB.HAIR = {"1":0,"2":1,"3":2,"4":0,"5":0,"6":1,"7":2,"8":1,"9":2,"10":1,"11":2,"12":2,"13":0,"14":2,"15":0,"16":1,"17":2,"18":0,"19":0,"20":1,"21":2,"22":0,"23":1,"24":2,"25":1,"26":0,"27":0,"28":1,"29":2,"30":0,"31":2,"32":2,"33":1,"34":0,"35":0,"36":0,"37":1,"38":1,"39":0,"40":1,"41":0,"42":1,"43":2,"44":2,"45":1,"46":0,"47":1,"48":0,"49":0,"50":0,"51":2,"52":1,"53":1,"54":0,"55":1,"56":1,"57":0,"58":2,"59":2,"60":0,"61":1,"62":2,"63":0,"64":0,"65":0,"66":1,"67":2,"68":2,"69":2,"70":2,"71":1,"72":2,"73":0,"74":0,"75":1,"76":0,"77":1,"78":2,"79":1,"80":1,"81":2,"82":0,"83":0,"84":2,"85":0,"86":0,"87":2,"88":0,"89":2,"90":2,"91":0,"92":2,"93":1,"94":1,"95":1,"96":1,"97":1,"98":1,"99":1,"100":1,"101":1,"102":1,"103":1,"104":1,"105":0,"106":1,"107":1,"108":0,"109":1,"110":1,"111":0,"112":1,"113":0,"114":1,"115":1,"116":0,"117":1,"118":0,"119":1,"120":0,"121":1,"122":0,"123":1,"124":0,"125":0,"126":1,"127":0,"128":1,"129":2,"130":1,"131":2,"132":2,"133":1,"134":0,"135":0,"136":1,"137":1,"138":1,"139":0,"140":1,"141":1,"142":1,"143":2,"144":1,"145":1,"146":1,"147":2,"148":1,"149":1,"150":0,"151":1,"152":2,"153":1,"154":1,"155":0,"156":1,"157":0,"158":0,"159":1,"160":0,"161":0,"162":0,"163":0,"164":1,"165":0,"166":2,"167":0,"168":1,"169":1,"170":1,"171":2,"172":0,"173":1,"174":2,"175":0,"176":1,"177":1,"178":2,"179":1,"180":0,"181":1,"182":0,"183":0,"184":2,"185":1,"186":0,"187":1,"188":2,"189":1,"190":0,"191":2,"192":0,"193":1,"194":0,"195":1,"196":0,"197":0,"198":2,"199":1,"200":1,"201":0,"202":0,"203":1,"204":1,"205":0,"206":0,"207":1,"208":2,"209":0,"210":1,"211":0,"212":1,"213":2,"214":0,"215":1,"216":1,"217":0,"218":1,"219":2,"220":0,"221":2,"222":0,"223":1,"224":1,"225":0,"226":2,"227":0,"228":0,"229":2,"230":1,"231":0,"232":2,"233":0,"234":1,"235":2,"236":1,"237":1,"238":2,"239":1,"240":2,"241":1,"242":1,"243":1,"244":1,"245":1,"246":0,"247":1,"248":1,"249":2,"250":1,"251":1,"252":1,"253":1,"254":1,"255":0,"256":1,"257":1,"258":1,"259":1,"260":0,"261":1,"262":1,"263":1,"264":1,"265":1,"266":1,"267":1,"268":1,"269":0,"270":1,"271":1,"272":0,"273":1,"274":1,"275":1,"276":1,"277":1,"278":1,"279":1,"280":1,"281":1,"282":1,"283":1,"284":1,"285":1,"286":1,"287":1,"288":1,"289":1,"290":1,"291":1,"292":1,"293":1,"294":1,"295":0,"296":2,"297":0,"298":1,"299":1,"300":1,"301":1,"302":2,"303":0,"304":1,"305":1,"306":0,"307":2,"308":0,"309":0,"310":1,"311":1,"312":0,"313":2,"314":1,"315":0,"316":1,"317":0,"318":1,"319":0,"320":1,"321":1,"322":2,"323":0,"324":1,"325":1,"326":1,"327":1,"328":0,"329":1,"330":1,"331":1,"332":2,"333":0,"334":0,"335":0,"336":2,"337":1,"338":0,"339":0,"340":0,"341":1,"342":1,"343":1,"344":1,"345":0,"346":1,"347":1,"348":0,"349":0,"350":2,"351":1,"352":0,"353":0,"354":1,"355":0,"356":0,"357":0,"358":1,"359":0,"360":0,"361":1,"362":0,"363":2,"364":0,"365":1,"366":0,"367":1,"368":1,"369":0,"370":0,"371":2,"372":0,"373":0,"374":0,"375":1,"376":0,"377":1,"378":0,"379":1,"380":0,"381":0,"382":1,"383":1,"384":2,"385":1,"386":2,"387":1,"388":0,"389":2,"390":0,"391":0,"392":1,"393":0,"394":0,"395":1,"396":0,"397":1,"398":0,"399":2,"400":0,"401":1,"402":0,"403":0,"404":1,"405":0,"406":1,"407":0,"408":0,"409":0,"410":1,"411":0,"412":0,"413":1,"414":1,"415":2,"416":0,"417":2,"418":1,"419":1,"420":0,"421":0,"422":1,"423":0,"424":0,"425":1,"426":0,"427":0,"428":0,"429":1,"430":0,"431":1,"432":0,"433":0,"434":1,"435":2,"436":0,"437":0,"438":1,"439":1,"440":0,"441":1,"442":0,"443":0,"444":1,"445":0,"446":1,"447":0,"448":0,"449":2,"450":0,"451":0,"452":1,"453":1,"454":1,"455":2,"456":0,"457":0,"458":0,"459":1,"460":0,"461":0,"462":1,"463":0,"464":2,"465":0,"466":0,"467":0,"468":1,"469":0,"470":2,"471":1,"472":1,"473":1,"474":1,"475":0,"476":0,"477":1,"478":0,"479":1,"480":2,"481":1,"482":1,"483":0,"484":0,"485":0,"486":0,"487":0,"488":1,"489":1,"490":1,"491":2,"492":2,"493":0,"494":0,"495":1,"496":0,"497":0,"498":0,"499":0,"500":0};

  /* ── 유니폼/스킨 팔레트 (v31 일러스트에서 뽑은 값) ── */
  var TYPES = {
    h0: { kit: '#1e46ac', kitD: '#142c78', trim: '#e9b04a', shorts: '#1a3c96', shortsD: '#12296a', sock: '#20499f', sockTrim: '#e9b04a', boot: '#c9922f', bootD: '#8c5f18', skin: '#f8cda4', skinD: '#dfa877' },
    h1: { kit: '#1e46ac', kitD: '#142c78', trim: '#e9b04a', shorts: '#1a3c96', shortsD: '#12296a', sock: '#20499f', sockTrim: '#e9b04a', boot: '#c9922f', bootD: '#8c5f18', skin: '#d99a62', skinD: '#b97a46' },
    h2: { kit: '#1e46ac', kitD: '#142c78', trim: '#e9b04a', shorts: '#1a3c96', shortsD: '#12296a', sock: '#20499f', sockTrim: '#e9b04a', boot: '#c9922f', bootD: '#8c5f18', skin: '#f9d6b0', skinD: '#e0b184' },
    a0: { kit: '#bf141d', kitD: '#8c0d13', trim: '#e8e6e0', shorts: '#17181a', shortsD: '#0c0d0e', sock: '#bf141d', sockTrim: '#17181a', boot: '#141416', bootD: '#080809', skin: '#c98a55', skinD: '#a76c3c' },
    a1: { kit: '#bf141d', kitD: '#8c0d13', trim: '#e8e6e0', shorts: '#17181a', shortsD: '#0c0d0e', sock: '#bf141d', sockTrim: '#17181a', boot: '#141416', bootD: '#080809', skin: '#8d5a35', skinD: '#6f4224' },
    a2: { kit: '#bf141d', kitD: '#8c0d13', trim: '#e8e6e0', shorts: '#17181a', shortsD: '#0c0d0e', sock: '#bf141d', sockTrim: '#17181a', boot: '#141416', bootD: '#080809', skin: '#fadcbb', skinD: '#e2b790' },
    g0: { kit: '#f7d410', kitD: '#d3ad06', trim: '#177832', shorts: '#1a8038', shortsD: '#10602a', sock: '#f7d410', sockTrim: '#177832', boot: '#1a8038', bootD: '#0e5424', skin: '#f7c99c', skinD: '#dfa473', glove: '#2f9a48' },
    g1: { kit: '#f7d410', kitD: '#d3ad06', trim: '#141414', shorts: '#141414', shortsD: '#0a0a0a', sock: '#f7d410', sockTrim: '#141414', boot: '#141416', bootD: '#080809', skin: '#ce8a4f', skinD: '#b0703a', glove: '#141416' }
  };
  CB.TYPES = TYPES;

  /* ── 머리 이미지 로더 ── */
  var headCache = {};
  var HEAD_BASE = 'assets/chibi/heads/';
  function loadHead(type) {
    var rec = headCache[type];
    if (rec) { return rec; }
    rec = { img: new g.Image(), ready: false };
    headCache[type] = rec;
    rec.img.onload = function () { rec.ready = (rec.img.naturalWidth || rec.img.width || 0) > 0; };
    rec.img.onerror = function () { rec.ready = false; };
    rec.img.src = HEAD_BASE + type + '.png';
    return rec;
  }

  /* ── 기하 ── */
  var EDGE = 'rgba(10,13,20,0.92)';
  var TAU = Math.PI * 2;
  var HIP_Y = -45, SH_Y = -66, NECK_Y = -67;
  var THIGH = 21, SHIN = 15, UARM = 12.5, FARM = 10.5;
  var BODY_H = 141;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dir(a) { return { x: Math.sin(a), y: Math.cos(a) }; }
  function add(p, d, l) { return { x: p.x + d.x * l, y: p.y + d.y * l }; }
  function rot(p, a) { var c = Math.cos(a), s = Math.sin(a); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; }
  function shade(hex, k) {
    var h = hex.replace('#', '');
    if (h.charAt(0) === 'r') { return hex; }
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    var r = parseInt(h.slice(0, 2), 16), gg = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    var m = k == null ? 0.84 : k;
    return 'rgb(' + Math.round(r * m) + ',' + Math.round(gg * m) + ',' + Math.round(b * (m + 0.04)) + ')';
  }

  /* 둥근 캡 폴리라인 — 관절이 끊기지 않는 기본 도형 */
  function bone(ctx, pts, w, fill, edgeW) {
    var i;
    if (edgeW) {
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = w + edgeW * 2;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (i = 1; i < pts.length; i++) { ctx.lineTo(pts[i].x, pts[i].y); }
      ctx.stroke();
    }
    if (fill) {
      ctx.strokeStyle = fill;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (i = 1; i < pts.length; i++) { ctx.lineTo(pts[i].x, pts[i].y); }
      ctx.stroke();
    }
  }
  /* 납작한 띠 — 둥근 캡이 원판처럼 보이지 않게 */
  function band(ctx, p1, p2, halfW, fill) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y;
    var l = Math.hypot(dx, dy) || 1;
    var nx = -dy / l * halfW, ny = dx / l * halfW;
    ctx.beginPath();
    ctx.moveTo(p1.x + nx, p1.y + ny);
    ctx.lineTo(p2.x + nx, p2.y + ny);
    ctx.lineTo(p2.x - nx, p2.y - ny);
    ctx.lineTo(p1.x - nx, p1.y - ny);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function ball(ctx, x, y, r, fill, edgeW) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (edgeW) { ctx.strokeStyle = EDGE; ctx.lineWidth = edgeW; ctx.stroke(); }
  }

  /* ───────────────── 자세 계산 ─────────────────
     반환: 관절 좌표. 모든 각도는 '수직 아래 = 0, 앞(+x) = 양수' rad. */
  function rig(s) {
    var type = s.type || 'h0';
    var pose = s.pose || 'idle';
    var u = clamp(s.u == null ? 0 : s.u, 0, 1);
    var sn = clamp(s.speedN || 0, 0, 1);
    var gait = s.gait || 0;
    var t = s.t || 0;

    var hipY = HIP_Y, lean = 0.05 + 0.18 * sn, headPitch = 0, bob = 0, bodyRot = 0;
    var thN, thF, flexN, flexF, armNa, armFa, elbN, elbF, footN = 0, footF = 0;
    var headTilt = 0;

    /* 기본 달리기/걷기 — 위상(gait)에 따른 역위상 스윙 */
    var amp = 0.22 + 0.50 * sn;
    var sw = Math.sin(gait);
    thN = amp * sw;
    thF = -amp * sw;
    var kAmp = 0.24 + 0.66 * sn;
    flexN = 0.10 + kAmp * (0.5 - 0.5 * Math.cos(gait - 0.7));
    flexF = 0.10 + kAmp * (0.5 - 0.5 * Math.cos(gait + Math.PI - 0.7));
    var aAmp = 0.22 + 0.46 * sn;
    armNa = 0.08 - aAmp * sw;
    armFa = 0.08 + aAmp * sw;
    elbN = 0.45 + 0.55 * sn;
    elbF = 0.45 + 0.55 * sn;
    /* v32b — 발을 딛는 순간(위상 kπ)에 몸이 꿀렁 내려앉는 2배 위상 바운스.
       기본 코사인에 4배 위상 항을 더해 디딤-반동 리듬을 살짝 눌러 준다. */
    bob = (1.0 + 5.0 * sn) * (Math.cos(2 * gait) - 0.16 * Math.cos(4 * gait));
    headPitch = -lean * 0.5 - (0.015 + 0.045 * sn) * Math.cos(2 * gait);

    if (pose === 'idle' || pose === 'dribble') {
      var br = Math.sin(t * 2.05);
      bob = -0.4 + 0.45 * br;
      lean = pose === 'dribble' ? 0.13 : 0.05;
      thN = 0.07; thF = -0.06; flexN = 0.10 + 0.03 * br; flexF = 0.08;
      armNa = 0.05 + 0.03 * br; armFa = -0.03 - 0.03 * br;
      elbN = 0.38; elbF = 0.34;
      headPitch = -0.02 + 0.02 * br;
      headTilt = 0.015 * Math.sin(t * 1.1);
    } else if (pose === 'kick' || pose === 'pass') {
      var kp = pose === 'pass' ? 0.60 : 1;
      var w1 = clamp(u / 0.30, 0, 1);
      var w2 = clamp((u - 0.30) / 0.24, 0, 1);
      var w3 = clamp((u - 0.54) / 0.46, 0, 1);
      var backA = -0.80 * kp, hitA = 1.00 * kp, endA = 0.40 * kp;
      thN = w1 < 1 ? lerp(0.06, backA, w1) : (w2 < 1 ? lerp(backA, hitA, w2) : lerp(hitA, endA, w3));
      flexN = w1 < 1 ? lerp(0.12, 1.30 * kp, w1) : (w2 < 1 ? lerp(1.30 * kp, 0.04, w2) : lerp(0.04, 0.42, w3));
      thF = -0.10 - 0.16 * Math.sin(u * Math.PI);
      flexF = 0.14 + 0.28 * Math.sin(u * Math.PI);
      lean = 0.02 + 0.20 * kp * Math.sin(clamp((u - 0.16) / 0.5, 0, 1) * Math.PI);
      armNa = 0.50 - 0.80 * kp * Math.sin(u * Math.PI);
      armFa = -0.28 + 0.50 * kp * Math.sin(u * Math.PI);
      elbN = 0.70; elbF = 0.90;
      bob = -0.5 * Math.sin(u * Math.PI);
      headPitch = -0.03;
      footN = 0.30 * Math.sin(u * Math.PI);
    } else if (pose === 'tackle') {
      var e = clamp(u / 0.22, 0, 1);
      var sl = clamp((u - 0.10) / 0.32, 0, 1);
      var up = clamp((u - 0.74) / 0.26, 0, 1);
      hipY = HIP_Y + 23 * sl * (1 - up) - 3 * e * (1 - sl);
      lean = lerp(0.22, -0.60, sl) * (1 - up);
      thN = lerp(0.15, 1.40, sl) - 0.85 * up;
      flexN = lerp(0.35, 0.05, sl) + 0.85 * up;
      thF = lerp(-0.10, 0.40, sl) - 0.45 * up;
      flexF = lerp(0.30, 1.70, sl) - 1.15 * up;
      armNa = lerp(0.30, -1.10, sl) + 0.85 * up;
      armFa = lerp(-0.20, -0.52, sl) + 0.45 * up;
      elbN = lerp(0.45, 0.15, sl); elbF = lerp(0.45, 0.85, sl);
      bob = 0;
      headPitch = lerp(0.04, -0.15, sl);
      footN = 0.35;
    } else if (pose === 'dive') {
      var dv = Math.sin(clamp(u, 0, 1) * Math.PI * 0.9);
      bodyRot = 1.12 * dv;
      hipY = HIP_Y + 14 * dv;
      thN = -0.12 - 0.42 * dv; thF = -0.02 - 0.70 * dv;
      flexN = 0.32 - 0.22 * dv; flexF = 0.70 - 0.40 * dv;
      armNa = -1.40 * dv - 0.18; armFa = -1.20 * dv - 0.10;
      elbN = 0.10; elbF = 0.15;
      lean = 0.05; headPitch = 0.08 * dv;
      bob = 0;
    } else if (pose === 'jump') {
      var jv = Math.sin(clamp(u, 0, 1) * Math.PI);
      thN = 0.42 * jv + 0.06; thF = 0.28 * jv - 0.05;
      flexN = 0.14 + 1.10 * jv; flexF = 0.12 + 0.80 * jv;
      armNa = 0.08 - 2.30 * jv; armFa = 0.08 - 2.00 * jv;
      elbN = 0.30; elbF = 0.42;
      lean = 0.05 - 0.14 * jv;
      headPitch = -0.09 * jv;
      bob = 0;
    } else if (pose === 'celebrate') {
      var cv = Math.sin(t * 7.2);
      thN = 0.12 + 0.10 * cv; thF = -0.10 - 0.10 * cv;
      flexN = 0.26 + 0.16 * Math.sin(t * 7.2 + 1);
      flexF = 0.20;
      armNa = -2.30 - 0.20 * cv; armFa = -2.10 + 0.20 * cv;
      elbN = 0.28; elbF = 0.34;
      bob = -1.4 - 1.2 * Math.abs(Math.sin(t * 6.4));
      lean = -0.06;
      headPitch = -0.12;
      headTilt = 0.07 * cv;
    } else if (pose === 'stun') {
      var sv = Math.sin(t * 9);
      lean = 0.09 + 0.09 * sv;
      headTilt = 0.09 * sv;
      thN = 0.10; thF = -0.12; flexN = 0.20; flexF = 0.18;
      armNa = 0.24 + 0.1 * sv; armFa = -0.20; elbN = 0.55; elbF = 0.45;
    }

    /* ── 관절 좌표 ── */
    /* v32b — 달릴 때는 상체를 살짝 내려 발바닥이 잔디에 닿게 한다(그림자가 떠 보이지 않도록) */
    if (pose === 'run') { hipY += 2.6 + 2.0 * sn; }
    else if (pose === 'idle' || pose === 'dribble') { hipY += 1.2; }
    var hip = { x: 0, y: hipY };
    var shN = add(hip, rot({ x: 15.2, y: SH_Y - HIP_Y + 1 }, lean), 1);
    var shF = add(hip, rot({ x: -13.2, y: SH_Y - HIP_Y + 1 }, lean), 1);
    var neck = add(hip, rot({ x: 0.4, y: NECK_Y - HIP_Y }, lean), 1);
    var hipN = add(hip, rot({ x: 4.6, y: 0 }, lean), 1);
    var hipF = add(hip, rot({ x: -4.6, y: 0 }, lean), 1);

    function leg(hj, th, flex, footRot) {
      var kn = add(hj, dir(th), THIGH);
      var an = add(kn, dir(th - flex), SHIN);
      return { kn: kn, an: an, th: th, flex: flex, foot: th - flex + (footRot || 0) };
    }
    var lgN = leg(hipN, thN, flexN, footN);
    var lgF = leg(hipF, thF, flexF, footF);

    function arm(sh, a, elb) {
      var el = add(sh, dir(a), UARM);
      var wr = add(el, dir(a + elb), FARM);
      return { el: el, wr: wr, a: a, elb: elb };
    }
    var amN = arm(shN, armNa, elbN);
    var amF = arm(shF, armFa, elbF);

    return {
      T: TYPES[type] || TYPES.h0, pose: pose, u: u, hip: hip, hipY: hipY,
      shN: shN, shF: shF, neck: neck, lgN: lgN, lgF: lgF, amN: amN, amF: amF,
      lean: lean, headPitch: headPitch, headTilt: headTilt, bodyRot: bodyRot, bob: bob
    };
  }

  /* ───────────────── 그리기 ───────────────── */
  /* 접지 그림자 — 방사형 그라데이션을 한 번만 만들어 두고 스케일해서 쓴다(매 프레임 생성 비용 제거)
     v32b — 중심은 진하고(0.58~0.65) 가장자리는 빨리 사라지게: 발바닥 바로 아래에 딱 붙는 그림자 */
  var shadowSpr = null;
  function shadowSprite() {
    if (shadowSpr) { return shadowSpr; }
    var c = g.document.createElement('canvas');
    c.width = 64; c.height = 64;
    var x = c.getContext('2d');
    var gd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gd.addColorStop(0, 'rgba(2,13,9,1)');
    gd.addColorStop(0.42, 'rgba(2,13,9,0.88)');
    gd.addColorStop(0.68, 'rgba(2,13,9,0.44)');
    gd.addColorStop(0.88, 'rgba(2,13,9,0.12)');
    gd.addColorStop(1, 'rgba(2,13,9,0)');
    x.fillStyle = gd;
    x.beginPath(); x.arc(32, 32, 32, 0, TAU); x.fill();
    shadowSpr = c;
    return c;
  }

  /* 몸통(유니폼·반바지·깃·소매 캡)은 정적 도형이라 타입별로 한 번만 그려 캐시한다 */
  var torsoCache = {};
  var TORSO_S = 4;                    /* 캐시 해상도 배율 */
  var TORSO_X0 = -18, TORSO_X1 = 18, TORSO_Y0 = -26, TORSO_Y1 = 17;
  function torsoSprite(type) {
    var c = torsoCache[type];
    if (c) { return c; }
    var wpx = Math.ceil((TORSO_X1 - TORSO_X0) * TORSO_S), hpx = Math.ceil((TORSO_Y1 - TORSO_Y0) * TORSO_S);
    c = g.document.createElement('canvas');
    c.width = wpx; c.height = hpx;
    var x = c.getContext('2d');
    x.lineJoin = 'round'; x.lineCap = 'round';
    x.translate(-TORSO_X0 * TORSO_S, -TORSO_Y0 * TORSO_S);
    x.scale(TORSO_S, TORSO_S);
    paintTorso(x, TYPES[type] || TYPES.h0);
    torsoCache[type] = c;
    return c;
  }

  function drawTorso(ctx, R, type) {
    var spr = torsoSprite(type);
    ctx.save();
    ctx.translate(R.hip.x, R.hip.y + R.bob);
    ctx.rotate(R.lean);
    ctx.drawImage(spr, TORSO_X0, TORSO_Y0, (TORSO_X1 - TORSO_X0), (TORSO_Y1 - TORSO_Y0));
    ctx.restore();
  }

  function paintTorso(ctx, T) {
    var top = SH_Y - HIP_Y;                    /* 어깨 높이(음수) */
    /* 반바지 */
    ctx.beginPath();
    ctx.moveTo(-13.4, 1.5);
    ctx.lineTo(-13.8, 8.5);
    ctx.quadraticCurveTo(-12.6, 12.0, -7.2, 12.6);
    ctx.quadraticCurveTo(-2.0, 12.8, -0.6, 9.4);
    ctx.quadraticCurveTo(0.6, 12.8, 7.2, 12.6);
    ctx.quadraticCurveTo(12.6, 12.0, 13.8, 8.5);
    ctx.lineTo(13.4, 1.5);
    ctx.closePath();
    ctx.fillStyle = T.shorts;
    ctx.fill();
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 2.1;
    ctx.stroke();
    /* 유니폼 몸통 — 허리에서 어깨로 살짝 퍼지는 사다리꼴 */
    ctx.beginPath();
    ctx.moveTo(-12.6, 2.6);
    ctx.quadraticCurveTo(-15.4, top * 0.55, -15.0, top + 2.6);
    ctx.quadraticCurveTo(-14.4, top - 0.4, -9.0, top - 1.4);
    ctx.lineTo(9.0, top - 1.4);
    ctx.quadraticCurveTo(14.4, top - 0.4, 15.0, top + 2.6);
    ctx.quadraticCurveTo(15.4, top * 0.55, 12.6, 2.6);
    ctx.quadraticCurveTo(0, 5.6, -12.6, 2.6);
    ctx.closePath();
    ctx.fillStyle = T.kit;
    ctx.fill();
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 2.1;
    ctx.stroke();
    /* 옆 트림 라인 + 등쪽 그늘 + 깃 */
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = T.trim;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(11.4, top - 0.6);
    ctx.quadraticCurveTo(13.6, top * 0.45, 11.2, 3.4);
    ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#000';
    ctx.fillRect(-14, top - 2, 7, 24);
    ctx.restore();
    /* 깃 — 목 아래 V */
    ctx.beginPath();
    ctx.moveTo(-3.6, top - 0.6);
    ctx.lineTo(0, top + 2.2);
    ctx.lineTo(3.6, top - 0.6);
    ctx.closePath();
    ctx.fillStyle = T.trim;
    ctx.fill();
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    /* 반바지 밑단 트림 */
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = T.trim;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-13.2, 3.4);
    ctx.lineTo(13.2, 3.4);
    ctx.stroke();
    ctx.globalAlpha = 1;
    /* 어깨 소매 캡 */
    ball(ctx, 14.4, top + 3.0, 5.2, T.kit, 1.6);
    ball(ctx, -12.6, top + 2.8, 4.9, shade(T.kit, 0.80), 1.6);
  }

  function drawLeg(ctx, R, lg, far) {
    var T = R.T;
    var hipPt = { x: lg.kn.x - Math.sin(lg.th) * THIGH, y: lg.kn.y - Math.cos(lg.th) * THIGH + R.bob };
    var kn = { x: lg.kn.x, y: lg.kn.y + R.bob };
    var an = { x: lg.an.x, y: lg.an.y + R.bob };
    var skin = far ? shade(T.skin) : T.skin;
    var sock = far ? shade(T.sock) : T.sock;
    var boot = far ? T.bootD : T.boot;
    var edge = far ? 1.2 : 1.9;
    /* 허벅지(스킨) — 반바지 밑단부터 무릎까지 (위쪽은 반바지가 덮는다) */
    var td0 = dir(lg.th);
    var thStart = add(hipPt, td0, 5.4);
    bone(ctx, [thStart, kn, an], 12.4, skin, edge);
    /* 스타킹 — 무릎부터 발목까지 */
    bone(ctx, [kn, an], 10.8, sock, 0);
    var sd = dir(lg.th - lg.flex);
    band(ctx, add(kn, sd, 0.8), add(kn, sd, 3.4), 5.4, far ? shade(T.sockTrim) : T.sockTrim);
    /* 반바지 밑단 — 허벅지 위쪽을 덮는다 */
    var td = dir(lg.th);
    band(ctx, add(hipPt, dir(lg.th), -0.5), add(hipPt, td, 7.4), 6.5, far ? T.shortsD : T.shorts);
    /* 축구화 — 발목에서 앞으로 뻗은 납작한 신발 */
    ctx.save();
    ctx.translate(an.x, an.y);
    ctx.rotate(clamp(lg.foot * 0.42, -0.5, 0.5) + 0.06);
    ctx.beginPath();
    ctx.moveTo(-5.2, -3.8);
    ctx.lineTo(4.8, -4.0);
    ctx.quadraticCurveTo(9.4, -3.2, 9.8, 0.4);
    ctx.quadraticCurveTo(9.8, 3.6, 5.0, 3.8);
    ctx.lineTo(-5.0, 3.8);
    ctx.quadraticCurveTo(-6.0, 0, -5.2, -3.8);
    ctx.closePath();
    ctx.fillStyle = boot;
    ctx.fill();
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = edge;
    ctx.stroke();
    /* 밑창 */
    ctx.beginPath();
    ctx.moveTo(-4.4, 2.4);
    ctx.lineTo(7.6, 2.4);
    ctx.strokeStyle = far ? '#0c0c0e' : T.bootD;
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.restore();
  }

  function drawArm(ctx, R, am, far) {
    var T = R.T;
    var sh = far ? R.shF : R.shN;
    var shPt = { x: sh.x, y: sh.y + R.bob };
    var el = { x: am.el.x, y: am.el.y + R.bob };
    var wr = { x: am.wr.x, y: am.wr.y + R.bob };
    var skin = far ? shade(T.skin) : T.skin;
    var kit = far ? T.kitD : T.kit;
    var edge = far ? 1.2 : 1.9;
    bone(ctx, [shPt, el, wr], 8.8, skin, edge);
    var d = dir(am.a);
    bone(ctx, [shPt, add(shPt, d, UARM * 0.54)], 9.2, kit, 0);
    /* 소매 끝 트림 — 둥근 캡이 원판처럼 보이지 않게 납작한 띠로 */
    var p1 = add(shPt, d, UARM * 0.46), p2 = add(shPt, d, UARM * 0.54);
    var nx = -d.y, ny = d.x;
    ctx.beginPath();
    ctx.moveTo(p1.x + nx * 4.6, p1.y + ny * 4.6);
    ctx.lineTo(p2.x + nx * 4.6, p2.y + ny * 4.6);
    ctx.lineTo(p2.x - nx * 4.6, p2.y - ny * 4.6);
    ctx.lineTo(p1.x - nx * 4.6, p1.y - ny * 4.6);
    ctx.closePath();
    ctx.fillStyle = far ? shade(T.trim) : T.trim;
    ctx.fill();
    if (T.glove) { ball(ctx, wr.x, wr.y, 4.2, T.glove, 1.7); }
    else { ball(ctx, wr.x, wr.y, 3.5, skin, 1.7); }
  }

  function drawHead(ctx, s, R) {
    var type = s.type || 'h0';
    var meta = CB.HEAD[type] || CB.HEAD.h0;
    var rec = loadHead(type);
    ctx.save();
    ctx.translate(R.neck.x, R.neck.y + R.bob);
    ctx.rotate((R.headPitch || 0) + (R.headTilt || 0) + (R.lean || 0) * 0.5);
    if (rec.ready) {
      ctx.drawImage(rec.img, -meta.cx, -meta.h, meta.w, meta.h);
    } else {
      ctx.beginPath();
      ctx.ellipse(0, -34, 23, 31, 0, 0, TAU);
      ctx.fillStyle = (TYPES[type] || TYPES.h0).skin;
      ctx.fill();
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ── 공개 API ──
     spec: { type, x, y, scale(px/단위), face(1|-1), pose, u, gait, speedN, t } */
  function draw(ctx, s) {
    var R = rig(s);
    var sc = s.scale || 0.26;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale((s.face || 1) * sc, sc);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (R.bodyRot) {
      ctx.translate(0, R.hip.y);
      ctx.rotate(R.bodyRot);
      ctx.translate(0, -R.hip.y);
    }
    drawArm(ctx, R, R.amF, true);
    drawLeg(ctx, R, R.lgF, true);
    drawTorso(ctx, R, s.type || 'h0');
    drawLeg(ctx, R, R.lgN, false);
    drawArm(ctx, R, R.amN, false);
    drawHead(ctx, s, R);
    ctx.restore();
  }

  CB.RIG = {
    draw: draw,
    rig: rig,
    BODY_H: BODY_H,
    TYPES: TYPES,
    loadHead: loadHead,
    setHeadBase: function (p) { HEAD_BASE = p; },
    shadow: function (ctx, x, y, w, h, air) {
      /* 발밑 접지 그림자 — 공중으로 뜰수록 작아지고 옅어진다 (v32b: 지면 중심 alpha ≈0.62) */
      var a0 = air || 0;
      var k = clamp(1 - a0 * 0.42, 0.56, 1);
      var a = clamp(0.66 - a0 * 0.38, 0.14, 0.66);
      var spr = shadowSprite();
      ctx.save();
      ctx.globalAlpha = a;
      ctx.drawImage(spr, x - w * k, y - h * k, w * 2 * k, h * 2 * k);
      ctx.restore();
    }
  };
})(window);
