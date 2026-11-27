/*! 꼬마일레븐 FC v34 — Three.js 3D 입체 구장 · 3D 치비 선수 22명 엔진 (render3d.js)
    · 완전 수평 TV 중계 각도(yaw=0): 좌우 사선 틀어짐 없이 정면에서 30° 내려다보는 중계 카메라
    · 투톤 잔디 줄무늬 · 흰색 라인 · 입체 골대+그물 · 코너 깃발 · 광고판 · 계단식 관중석 · 3D 관중
    · 기하 도형(구·원기둥·상자)만으로 조립한 2.3등신 치비 선수 22명(관절 애니메이션)
    · 흑백 오각형 3D 축구공(이동 방향으로 실제 회전) + 높이에 따라 커지는 접지 그림자
    · 22명 실제 경기 시뮬레이션(땅볼 패스·전진 드리블·크로스·슛·세이브·슬라이딩 태클)
    ※ 기존 v33 2D 엔진(index.html · match.js · game.js)은 건드리지 않는 독립 모듈. */
(function (global) {
  'use strict';
  var THREE = global.THREE;
  if (!THREE) { console.error('[render3d] THREE 없음'); return; }

  var R = {}; global.Render3D = R;

  /* ── 치수 (m) ───────────────────────────────────────────── */
  var FW = 68, FL = 105, HW = FW / 2, HL = FL / 2;   /* 피치 폭·길이 */
  var GOAL_W = 7.32, GOAL_H = 2.44, GOAL_D = 1.9;
  var BALL_R = 0.16;
  var GRAV = 19.6;

  /* ── 수학 유틸 ──────────────────────────────────────────── */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, t) { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); }
  function angLerp(a, b, t) { var d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + d * t; }
  function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

  /* ── 단위 지오메트리 (모든 파츠는 이걸 스케일해서 조립) ── */
  var GEO = {
    sph: new THREE.SphereGeometry(1, 12, 9),
    sphLo: new THREE.SphereGeometry(1, 8, 6),
    cyl: new THREE.CylinderGeometry(0.82, 1, 1, 12),
    torso: new THREE.CylinderGeometry(0.88, 1, 1, 16),
    box: new THREE.BoxGeometry(1, 1, 1)
  };

  var _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

  /* 파츠 목록(색·위치·회전·크기)을 하나의 BufferGeometry로 병합한다.
     [geo, color, x,y,z, rx,ry,rz, sx,sy,sz] */
  function mergeParts(list) {
    var bufs = [], total = 0, i, k;
    for (i = 0; i < list.length; i++) {
      var it = list[i];
      var g = it[0].index ? it[0].toNonIndexed() : it[0].clone();
      _e.set(it[5] || 0, it[6] || 0, it[7] || 0);
      _q.setFromEuler(_e);
      _p.set(it[2] || 0, it[3] || 0, it[4] || 0);
      _s.set(it[8] == null ? 1 : it[8], it[9] == null ? 1 : it[9], it[10] == null ? 1 : it[10]);
      _m4.compose(_p, _q, _s);
      g.applyMatrix4(_m4);
      var n = g.attributes.position.count;
      var c = new THREE.Color(it[1] == null ? 0xffffff : it[1]);
      var ca = new Float32Array(n * 3);
      for (k = 0; k < n; k++) { ca[k * 3] = c.r; ca[k * 3 + 1] = c.g; ca[k * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      bufs.push(g);
      total += n;
    }
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    var off = 0;
    for (i = 0; i < bufs.length; i++) {
      var a = bufs[i].attributes.position.array, b = bufs[i].attributes.normal.array, cc = bufs[i].attributes.color.array;
      pos.set(a, off * 3); nor.set(b, off * 3); col.set(cc, off * 3);
      off += bufs[i].attributes.position.count;
      bufs[i].dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
  R.mergeParts = mergeParts;

  /* ── 캔버스 텍스처 ─────────────────────────────────────── */
  function canvasTex(w, h, draw, opts) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    draw(g, w, h);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (opts && opts.repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(opts.repeat[0], opts.repeat[1]);
    }
    t.needsUpdate = true;
    return t;
  }

  /* 잔디: 16줄 투톤 + 흰색 규격 라인 (20px/m) */
  function makePitchTexture() {
    var PX = 20, W = FL * PX, H = FW * PX;
    return canvasTex(W, H, function (g) {
      var bands = 16, bw = W / bands, i;
      for (i = 0; i < bands; i++) {
        g.fillStyle = (i % 2) ? '#2c7a37' : '#389144';
        g.fillRect(Math.floor(i * bw), 0, Math.ceil(bw) + 1, H);
      }
      /* 잔디 결(미세 명암) */
      for (i = 0; i < 5200; i++) {
        var gx = (i * 9277.3) % W, gy = (i * 4231.7) % H;
        g.fillStyle = 'rgba(255,255,255,' + (0.012 + ((i % 7) * 0.003)).toFixed(3) + ')';
        g.fillRect(gx, gy, 2, 1);
      }
      var X = function (mx) { return (mx + HL) * PX; };
      var Y = function (mz) { return (mz + HW) * PX; };
      g.strokeStyle = 'rgba(255,255,255,0.93)';
      g.lineWidth = 0.13 * PX;
      g.lineJoin = 'miter';

      /* 터치라인·골라인 */
      g.strokeRect(X(-HL + 0.3), Y(-HW + 0.3), (FL - 0.6) * PX, (FW - 0.6) * PX);
      /* 하프라인 */
      g.beginPath(); g.moveTo(X(0), Y(-HW + 0.3)); g.lineTo(X(0), Y(HW - 0.3)); g.stroke();
      /* 센터서클 + 센터스팟 */
      g.beginPath(); g.arc(X(0), Y(0), 9.15 * PX, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(X(0), Y(0), 0.22 * PX, 0, Math.PI * 2); g.fill();

      for (var s = -1; s <= 1; s += 2) {
        var gl = s * HL, spot = s * (HL - 11);
        /* 페널티박스 */
        g.strokeRect(Math.min(X(gl), X(gl - s * 16.5)), Y(-20.16), 16.5 * PX, 40.32 * PX);
        /* 골에어리어 */
        g.strokeRect(Math.min(X(gl), X(gl - s * 5.5)), Y(-9.16), 5.5 * PX, 18.32 * PX);
        /* 페널티 스팟 */
        g.beginPath(); g.arc(X(spot), Y(0), 0.2 * PX, 0, Math.PI * 2); g.fill();
        /* 페널티 아크 (박스 바깥쪽만) */
        var a0 = s > 0 ? 2.214 : -0.927, a1 = s > 0 ? 4.069 : 0.927;
        g.beginPath(); g.arc(X(spot), Y(0), 9.15 * PX, a0, a1); g.stroke();
      }
      /* 코너 아크 */
      var corners = [[-HL, -HW, 0, Math.PI / 2], [HL, -HW, Math.PI / 2, Math.PI], [HL, HW, Math.PI, Math.PI * 1.5], [-HL, HW, Math.PI * 1.5, Math.PI * 2]];
      for (i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(X(corners[i][0] + (i === 0 || i === 3 ? 0.3 : -0.3) * 0), Y(corners[i][1]), 1.0 * PX, corners[i][2], corners[i][3]);
        g.stroke();
      }
    });
  }

  /* 축구공: 흰 바탕 + 검은 오각형 무늬 */
  function makeBallTexture() {
    return canvasTex(512, 256, function (g, W, H) {
      g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, W, H);
      /* 옅은 회색 음영 */
      var grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, 'rgba(160,166,175,0.35)');
      grd.addColorStop(0.45, 'rgba(255,255,255,0)');
      grd.addColorStop(1, 'rgba(120,126,138,0.42)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      function penta(cx, cy, r, rot) {
        g.beginPath();
        for (var k = 0; k < 5; k++) {
          var a = rot + k * Math.PI * 2 / 5 - Math.PI / 2;
          var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
          if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath(); g.fill();
      }
      g.fillStyle = '#14161a';
      /* 가로 6 × 세로 3 배열 + 엇갈림 */
      var cols = 6, rows = 3;
      for (var ry = 0; ry < rows; ry++) {
        for (var cx = 0; cx < cols; cx++) {
          var px = (cx + (ry % 2 ? 0.5 : 0)) * (W / cols) + 4;
          var py = (ry + 0.5) * (H / rows);
          penta(px, py, 26, ry * 0.7 + cx * 0.3);
        }
      }
      /* 이음선 */
      g.strokeStyle = 'rgba(90,95,105,0.35)'; g.lineWidth = 2;
      for (var i = 0; i < 6; i++) {
        g.beginPath(); g.moveTo(i * W / 6, 0); g.lineTo(i * W / 6 + 20, H); g.stroke();
      }
    });
  }

  /* 골망 */
  function makeNetTexture() {
    return canvasTex(128, 128, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2;
      for (var i = 0; i <= 8; i++) {
        g.beginPath(); g.moveTo(i * W / 8, 0); g.lineTo(i * W / 8, H); g.stroke();
        g.beginPath(); g.moveTo(0, i * H / 8); g.lineTo(W, i * H / 8); g.stroke();
      }
    });
  }

  /* 터치라인 광고판 */
  function makeAdTexture() {
    return canvasTex(1024, 128, function (g, W, H) {
      var panels = [['#0f2a4a', '#7fd0ff', 'CHERRY FC'], ['#8a1420', '#ffd9a0', '꼬마일레븐'], ['#0d3d2e', '#9cf7c4', 'DOT SOCCER'], ['#1c1c26', '#ffcf5a', '가경 스포츠'], ['#2a0f45', '#e6c6ff', 'KOMA ELEVEN']];
      var n = panels.length, pw = W / n;
      for (var i = 0; i < n; i++) {
        g.fillStyle = panels[i][0]; g.fillRect(i * pw, 0, pw, H);
        g.fillStyle = panels[i][1];
        g.font = 'bold 46px system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(panels[i][2], i * pw + pw / 2, H * 0.54);
        g.fillStyle = 'rgba(255,255,255,0.10)';
        g.fillRect(i * pw + 6, 8, pw - 12, 6);
      }
    }, { repeat: [6, 1] });
  }

  /* 접지 그림자(부드러운 원형) */
  function makeBlobTexture() {
    return canvasTex(128, 128, function (g, W, H) {
      var grd = g.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W / 2);
      grd.addColorStop(0, 'rgba(0,0,0,0.55)');
      grd.addColorStop(0.55, 'rgba(0,0,0,0.28)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    });
  }

  /* ── 구장 ─────────────────────────────────────────────── */
  function buildStadium(scene) {
    var st = new THREE.Group();
    st.name = 'stadium';

    /* 피치 */
    var pitchTex = makePitchTexture();
    var pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(FL, FW),
      new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.96, metalness: 0 })
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    pitch.name = 'pitch';
    st.add(pitch);

    /* 피치 밖 잔디 */
    var outer = new THREE.Mesh(
      new THREE.PlaneGeometry(210, 150),
      new THREE.MeshStandardMaterial({ color: 0x1d4a26, roughness: 1 })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.03;
    outer.receiveShadow = true;
    st.add(outer);

    /* 입체 골대 2기 */
    function makeGoal(sx) {
      var g = new THREE.Group();
      var postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.1 });
      var postGeo = new THREE.CylinderGeometry(0.075, 0.075, GOAL_H, 12);
      [-1, 1].forEach(function (sz) {
        var p = new THREE.Mesh(postGeo, postMat);
        p.position.set(sx * HL, GOAL_H / 2, sz * GOAL_W / 2);
        p.castShadow = true;
        g.add(p);
        /* 골대 뒤 기둥 */
        var bp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, GOAL_H * 0.62, 8), postMat);
        bp.position.set(sx * (HL + GOAL_D), GOAL_H * 0.31, sz * GOAL_W / 2);
        g.add(bp);
      });
      var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, GOAL_W, 12), postMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(sx * HL, GOAL_H, 0);
      bar.castShadow = true;
      g.add(bar);
      var backBar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, GOAL_W, 8), postMat);
      backBar.rotation.x = Math.PI / 2;
      backBar.position.set(sx * (HL + GOAL_D), GOAL_H * 0.62, 0);
      g.add(backBar);

      /* 그물: 뒤판·천장·옆판 */
      var netTex = makeNetTexture();
      var netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
      var back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, GOAL_H * 0.62), netMat);
      back.position.set(sx * (HL + GOAL_D), GOAL_H * 0.31, 0);
      back.rotation.y = Math.PI / 2;
      g.add(back);
      var backTop = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, GOAL_D * 1.02), netMat);
      backTop.position.set(sx * (HL + GOAL_D / 2), GOAL_H * 0.87, 0);
      backTop.rotation.set(-Math.PI / 2 - 0.35, 0, 0);
      g.add(backTop);
      [-1, 1].forEach(function (sz) {
        var side = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_D, GOAL_H * 0.8), netMat);
        side.position.set(sx * (HL + GOAL_D / 2), GOAL_H * 0.4, sz * GOAL_W / 2);
        side.rotation.y = 0;
        g.add(side);
      });
      return g;
    }
    st.add(makeGoal(1));
    st.add(makeGoal(-1));

    /* 코너 깃발 */
    var flagPole = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    var flagMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.7, side: THREE.DoubleSide });
    [[-HL, -HW], [HL, -HW], [HL, HW], [-HL, HW]].forEach(function (c) {
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.55, 6), flagPole);
      pole.position.set(c[0], 0.77, c[1]);
      st.add(pole);
      var flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), flagMat);
      flag.position.set(c[0] + (c[0] > 0 ? -0.26 : 0.26), 1.38, c[1]);
      flag.rotation.y = c[0] > 0 ? Math.PI / 2 : -Math.PI / 2;
      st.add(flag);
    });

    /* 터치라인 광고판 (양쪽 + 골 뒤) */
    var adTex = makeAdTexture();
    var adMat = new THREE.MeshStandardMaterial({ map: adTex, roughness: 0.5, metalness: 0.2, emissive: 0x2a2a33, emissiveIntensity: 0.35 });
    [-1, 1].forEach(function (sz) {
      var ad = new THREE.Mesh(new THREE.BoxGeometry(112, 0.95, 0.22), adMat);
      ad.position.set(0, 0.475, sz * (HW + 1.8));
      ad.castShadow = false; ad.receiveShadow = true;
      st.add(ad);
    });
    [-1, 1].forEach(function (sx) {
      var ad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.95, 62), adMat);
      ad.position.set(sx * (HL + 3.4), 0.475, 0);
      st.add(ad);
    });

    /* 계단식 관중석 + 입체 3D 관중 */
    var standParts = [], rows = 8, rd = 1.9, rh = 0.92;
    [-1, 1].forEach(function (sz) {
      for (var r = 0; r < rows; r++) {
        standParts.push([GEO.box, r % 2 ? 0x3c424f : 0x474e5d, 0, r * rh + rh / 2, sz * (HW + 5.4 + r * rd), 0, 0, 0, 118, rh, rd * 0.97]);
      }
      standParts.push([GEO.box, 0x232832, 0, rows * rh + 2.6, sz * (HW + 5.4 + rows * rd + 0.9), 0, 0, 0, 118, rows * rh + 5.2, 1.6]);
    });
    [-1, 1].forEach(function (sx) {
      for (var r = 0; r < 6; r++) {
        standParts.push([GEO.box, r % 2 ? 0x3a404c : 0x454c5a, sx * (HL + 6.5 + r * rd), r * rh + rh / 2, 0, 0, 0, 0, rd * 0.97, rh, 58]);
      }
      standParts.push([GEO.box, 0x232832, sx * (HL + 6.5 + 6 * rd + 0.9), 6 * rh + 2.2, 0, 0, 0, 0, 1.6, 6 * rh + 4.4, 58]);
    });
    var stands = new THREE.Mesh(mergeParts(standParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    stands.receiveShadow = true;
    st.add(stands);

    /* 관중 (인스턴스) */
    var bodyGeo = mergeParts([[GEO.box, 0xffffff, 0, 0.22, 0, 0, 0, 0, 0.34, 0.44, 0.24], [GEO.box, 0xffffff, 0, 0.02, 0, 0, 0, 0, 0.3, 0.1, 0.22]]);
    var headGeo = mergeParts([[GEO.sphLo, 0xffffff, 0, 0, 0, 0, 0, 0, 0.115, 0.12, 0.115]]);
    var seatPalette = [0x9c3535, 0xb9b9bb, 0x3b5aa0, 0xa8894a, 0x35353d, 0x2f6b52, 0x8c6136, 0x5c4470, 0x7a2f3a, 0x4a5a6b];
    var seatList = [];
    [-1, 1].forEach(function (sz) {
      for (var r = 0; r < rows; r++) {
        for (var x = -55; x <= 55; x += 1.75) {
          if (Math.abs(x) > 54) continue;
          if (((x * 13 + r * 7 + (sz > 0 ? 3 : 0)) % 11) === 0) continue;   /* 빈자리 */
          seatList.push([x + ((r % 2) ? 0.5 : 0), r * rh + rh + 0.02, sz * (HW + 5.4 + r * rd + 0.1)]);
        }
      }
    });
    [-1, 1].forEach(function (sx) {
      for (var r = 0; r < 6; r++) {
        for (var z = -28; z <= 28; z += 1.5) {
          if (((z * 17 + r * 5) % 9) === 0) continue;
          seatList.push([sx * (HL + 6.5 + r * rd + 0.1), r * rh + rh + 0.02, z]);
        }
      }
    });
    var bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), seatList.length);
    var heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), seatList.length);
    var skinTones = [0xf1c9a5, 0xe0b08a, 0xc98c62, 0xa86b46, 0xf6d7bb];
    var mat4 = new THREE.Matrix4(), col = new THREE.Color();
    for (var si = 0; si < seatList.length; si++) {
      var s = seatList[si];
      var sc = 0.8 + ((si * 37) % 23) / 100;
      mat4.makeRotationY(((si * 71) % 360) * Math.PI / 180 + (s[1] > 0 ? 0 : 0));
      mat4.scale(new THREE.Vector3(sc, sc, sc));
      mat4.setPosition(s[0], s[1], s[2]);
      bodies.setMatrixAt(si, mat4);
      heads.setMatrixAt(si, mat4);
      col.setHex(seatPalette[si % seatPalette.length]);
      bodies.setColorAt(si, col);
      col.setHex(skinTones[(si * 7) % skinTones.length]);
      heads.setColorAt(si, col);
    }
    bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    bodies.frustumCulled = false; heads.frustumCulled = false;
    st.add(bodies); st.add(heads);

    /* 조명탑 4기 (야간 경기 분위기) */
    var poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b0, roughness: 0.5, metalness: 0.6 });
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      var px = c[0] * (HL + 9), pz = c[1] * (HW + 24);
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 30, 8), poleMat);
      pole.position.set(px, 15, pz);
      st.add(pole);
      var head = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 0.7), poleMat);
      head.position.set(px, 30.5, pz);
      head.lookAt(0, 0, 0);
      st.add(head);
      for (var lx = -2; lx <= 2; lx++) {
        for (var ly = -1; ly <= 1; ly++) {
          var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampMat);
          lamp.position.set(px + lx * 1.25, 30.5 + ly * 1.05, pz + (pz > 0 ? -0.45 : 0.45));
          st.add(lamp);
        }
      }
    });

    scene.add(st);
    return st;
  }

  /* ── 공 ───────────────────────────────────────────────── */
  function buildBall(scene, blobTex) {
    var ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 28, 20),
      new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.38, metalness: 0.04 })
    );
    ball.castShadow = true;
    scene.add(ball);

    var shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.85 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    shadow.renderOrder = 1;
    scene.add(shadow);

    return { mesh: ball, shadow: shadow };
  }

  R.GEO = GEO;
  R.buildStadium = buildStadium;
  R.buildBall = buildBall;
  R.makeBlobTexture = makeBlobTexture;
  R.util = { clamp: clamp, lerp: lerp, smoothstep: smoothstep, easeOut: easeOut, angLerp: angLerp, dist2: dist2 };
  R.consts = { FW: FW, FL: FL, HW: HW, HL: HL, GOAL_W: GOAL_W, GOAL_H: GOAL_H, BALL_R: BALL_R, GRAV: GRAV };

  /* ══════════════════════════════════════════════════════════
     3D 치비 선수 리그 (기하 도형 조립 · 관절 애니메이션)
     ══════════════════════════════════════════════════════════ */
  GEO.hairCap = new THREE.SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.53);
  GEO.cone = new THREE.ConeGeometry(1, 1, 7);
  GEO.torus = new THREE.TorusGeometry(1, 0.08, 6, 12, Math.PI);
  GEO.cylFlat = new THREE.CylinderGeometry(1, 1, 1, 10);

  var CHIBI_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02 });

  var HAIRS = [0x1b1b21, 0x5a3a22, 0xd9b45a, 0xc9ced8, 0x7d2f1e, 0x2a2f45];
  var SKINS = [0xf3cba7, 0xe6b389, 0xd39a6c, 0xb57a4f, 0xf7d9bd];

  function numberTexture(n) {
    return canvasTex(96, 96, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.94)';
      g.font = 'bold 62px system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6;
      g.strokeText(String(n), W / 2, H / 2 + 2);
      g.fillText(String(n), W / 2, H / 2 + 2);
    });
  }

  /* 머리(얼굴·머리카락 포함) 하나의 지오메트리 */
  function headGeometry(o) {
    var HR = o.headR, k = HR / 0.265;
    var skin = o.skin, hair = o.hair;
    var P = [];
    P.push([GEO.sph, skin, 0, 0, 0, 0, 0, 0, HR, HR * 0.99, HR * 0.97]);
    /* 귀 */
    P.push([GEO.sph, skin, -HR * 0.98, -0.01 * k, 0, 0, 0, 0, 0.045 * k, 0.06 * k, 0.035 * k]);
    P.push([GEO.sph, skin, HR * 0.98, -0.01 * k, 0, 0, 0, 0, 0.045 * k, 0.06 * k, 0.035 * k]);

    /* ── 머리카락 ── */
    var hs = o.hairStyle;
    if (hs !== 4) {
      P.push([GEO.hairCap, hair, 0, 0.012 * k, -0.006 * k, 0, 0, 0, HR * 1.055, HR * 1.035, HR * 1.045]);
    }
    if (hs === 0) {           /* 숏컷 */
      P.push([GEO.box, hair, 0, HR * 0.78, HR * 0.36, 0.25, 0, 0, HR * 1.5, 0.07 * k, HR * 0.55]);
    } else if (hs === 1) {    /* 앞머리 뱅 */
      P.push([GEO.box, hair, 0, HR * 0.66, HR * 0.58, -0.16, 0, 0, HR * 1.62, 0.13 * k, HR * 0.42]);
      P.push([GEO.box, hair, -HR * 0.52, HR * 0.5, HR * 0.62, -0.1, 0.2, 0.22, HR * 0.5, 0.19 * k, HR * 0.3]);
      P.push([GEO.box, hair, HR * 0.52, HR * 0.5, HR * 0.62, -0.1, -0.2, -0.22, HR * 0.5, 0.19 * k, HR * 0.3]);
    } else if (hs === 2) {    /* 스파이크 */
      var spikes = [[0, 1.02, 0.0, 0.28], [-0.5, 0.86, 0.15, 0.22], [0.5, 0.86, 0.15, 0.22], [-0.3, 0.9, -0.42, 0.22], [0.3, 0.9, -0.42, 0.22], [0, 0.85, 0.5, 0.2]];
      for (var i = 0; i < spikes.length; i++) {
        var sp = spikes[i];
        P.push([GEO.cone, hair, sp[0] * HR, sp[1] * HR, sp[2] * HR, 0.35 * (sp[2] < 0 ? -1 : 1), 0, sp[0] * 0.9, sp[3] * HR * 0.55, sp[3] * HR * 1.15, sp[3] * HR * 0.55]);
      }
    } else if (hs === 3) {    /* 포마드 */
      P.push([GEO.box, hair, 0, HR * 0.85, HR * 0.3, 0.18, 0, 0, HR * 1.42, 0.15 * k, HR * 0.7]);
      P.push([GEO.box, hair, 0, HR * 0.62, HR * 0.66, -0.3, 0, 0, HR * 1.3, 0.1 * k, HR * 0.3]);
    } else {                  /* 장발 + 묶음 */
      P.push([GEO.hairCap, hair, 0, 0.012 * k, -0.006 * k, 0, 0, 0, HR * 1.055, HR * 1.035, HR * 1.045]);
      P.push([GEO.box, hair, 0, -HR * 0.32, -HR * 0.62, 0.1, 0, 0, HR * 1.7, HR * 1.2, HR * 0.35]);
      P.push([GEO.sph, hair, 0, -HR * 0.3, -HR * 0.95, 0, 0, 0, 0.13 * k, 0.15 * k, 0.1 * k]);
    }
    /* 옆머리 */
    P.push([GEO.box, hair, -HR * 0.9, HR * 0.28, -0.02 * k, 0, 0, 0.12, 0.07 * k, HR * 0.5, HR * 0.55]);
    P.push([GEO.box, hair, HR * 0.9, HR * 0.28, -0.02 * k, 0, 0, -0.12, 0.07 * k, HR * 0.5, HR * 0.55]);

    /* ── 눈 ── */
    var es = o.eyeStyle, ex = 0.088 * k, ey = 0.012 * k, ez = 0.222 * k;
    var eyeCol = 0x151821;
    var browCol = new THREE.Color(hair).multiplyScalar(0.85).getHex();
    if (es === 0 || es === 2) {          /* 큰 왕눈 */
      var sx = es === 2 ? 1.15 : 1.0;
      P.push([GEO.sph, eyeCol, -ex, ey, ez, 0, 0, 0, 0.048 * k * sx, 0.062 * k, 0.032 * k]);
      P.push([GEO.sph, eyeCol, ex, ey, ez, 0, 0, 0, 0.048 * k * sx, 0.062 * k, 0.032 * k]);
      P.push([GEO.sph, 0xffffff, -ex + 0.014 * k, ey + 0.024 * k, ez + 0.02 * k, 0, 0, 0, 0.016 * k, 0.018 * k, 0.012 * k]);
      P.push([GEO.sph, 0xffffff, ex - 0.014 * k, ey + 0.024 * k, ez + 0.02 * k, 0, 0, 0, 0.016 * k, 0.018 * k, 0.012 * k]);
    } else if (es === 1) {               /* 흰자 + 눈동자 */
      P.push([GEO.sph, 0xffffff, -ex, ey, ez, 0, 0, 0, 0.052 * k, 0.058 * k, 0.03 * k]);
      P.push([GEO.sph, 0xffffff, ex, ey, ez, 0, 0, 0, 0.052 * k, 0.058 * k, 0.03 * k]);
      P.push([GEO.sph, eyeCol, -ex + 0.004, ey - 0.002, ez + 0.016 * k, 0, 0, 0, 0.026 * k, 0.032 * k, 0.02 * k]);
      P.push([GEO.sph, eyeCol, ex - 0.004, ey - 0.002, ez + 0.016 * k, 0, 0, 0, 0.026 * k, 0.032 * k, 0.02 * k]);
    } else if (es === 3) {               /* 실눈 */
      P.push([GEO.box, eyeCol, -ex, ey, ez + 0.01 * k, 0, 0, 0, 0.085 * k, 0.022 * k, 0.02 * k]);
      P.push([GEO.box, eyeCol, ex, ey, ez + 0.01 * k, 0, 0, 0, 0.085 * k, 0.022 * k, 0.02 * k]);
    } else {                             /* 웃는 눈 ^ ^ */
      P.push([GEO.torus, eyeCol, -ex, ey - 0.008 * k, ez, 0, 0, Math.PI, 0.045 * k, 0.045 * k, 0.045 * k]);
      P.push([GEO.torus, eyeCol, ex, ey - 0.008 * k, ez, 0, 0, Math.PI, 0.045 * k, 0.045 * k, 0.045 * k]);
    }
    /* 눈썹 */
    P.push([GEO.box, browCol, -ex, ey + 0.072 * k, ez - 0.004 * k, 0, 0, 0.12, 0.07 * k, 0.014 * k, 0.02 * k]);
    P.push([GEO.box, browCol, ex, ey + 0.072 * k, ez - 0.004 * k, 0, 0, -0.12, 0.07 * k, 0.014 * k, 0.02 * k]);
    /* 코 */
    P.push([GEO.sph, new THREE.Color(skin).multiplyScalar(0.9).getHex(), 0, -0.028 * k, 0.248 * k, 0, 0, 0, 0.016 * k, 0.014 * k, 0.014 * k]);
    /* 입 */
    var ms = o.mouthStyle;
    if (ms === 0) {
      P.push([GEO.torus, 0x8f3a3a, 0, -0.078 * k, 0.236 * k, 0, 0, Math.PI, 0.038 * k, 0.032 * k, 0.032 * k]);
    } else if (ms === 1) {
      P.push([GEO.sph, 0x6f2730, 0, -0.086 * k, 0.238 * k, 0, 0, 0, 0.03 * k, 0.034 * k, 0.018 * k]);
    } else if (ms === 2) {
      P.push([GEO.box, 0x8f3a3a, 0, -0.082 * k, 0.24 * k, 0, 0, 0, 0.05 * k, 0.012 * k, 0.014 * k]);
    } else {
      P.push([GEO.torus, 0x8f3a3a, 0, -0.07 * k, 0.238 * k, 0, 0, 0, 0.032 * k, 0.026 * k, 0.026 * k]);
    }
    /* 볼터치 */
    P.push([GEO.sph, 0xe88a7a, -0.15 * k, -0.055 * k, 0.195 * k, 0, 0, 0, 0.035 * k, 0.022 * k, 0.01 * k]);
    P.push([GEO.sph, 0xe88a7a, 0.15 * k, -0.055 * k, 0.195 * k, 0, 0, 0, 0.035 * k, 0.022 * k, 0.01 * k]);
    return mergeParts(P);
  }

  /* 한 선수 리그 */
  function makePlayer(o) {
    var kit = o.kit;
    var HR = o.headR || 0.265;
    var root = new THREE.Group();
    /* 접지 그림자(발밑) — 실시간 그림자 위에 얹어 한층 더 땅에 붙어 보이게 */
    if (o.blobTex) {
      var blob = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.74),
        new THREE.MeshBasicMaterial({ map: o.blobTex, transparent: true, opacity: 0.42, depthWrite: false }));
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.012;
      blob.renderOrder = 1;
      root.add(blob);
    }
    var bob = new THREE.Group();
    root.add(bob);

    var hipY = 0.455;
    var hips = new THREE.Group();
    hips.position.y = hipY;
    bob.add(hips);
    var upper = new THREE.Group();          /* 상체(몸통·머리·팔) — 앞으로 숙이는 리그 */
    hips.add(upper);

    /* 몸통: 유니폼 + 반바지 + 칼라 + 어깨 + 가슴 줄 */
    var torsoParts = [
      [GEO.torso, kit.shirt, 0, 0.175, 0, 0, 0, 0, 0.196, 0.35, 0.163],
      [GEO.sph, kit.shirt, -0.155, 0.318, 0, 0, 0, 0, 0.075, 0.062, 0.075],
      [GEO.sph, kit.shirt, 0.155, 0.318, 0, 0, 0, 0, 0.075, 0.062, 0.075],
      [GEO.cyl, kit.collar, 0, 0.345, 0, 0, 0, 0, 0.105, 0.05, 0.088],
      [GEO.torso, kit.shorts, 0, 0.005, 0, 0, 0, 0, 0.205, 0.17, 0.172],
      [GEO.box, kit.trim, 0, 0.19, 0.152, 0, 0, 0, 0.055, 0.3, 0.02],
      [GEO.box, kit.trim, 0, 0.19, -0.152, 0, 0, 0, 0.055, 0.3, 0.02],
      [GEO.box, kit.trim, 0, 0.33, 0.14, 0, 0, 0, 0.35, 0.035, 0.02]
    ];
    var torso = new THREE.Mesh(mergeParts(torsoParts), CHIBI_MAT);
    torso.castShadow = true;
    upper.add(torso);

    /* 등번호 */
    var numTex = numberTexture(o.number);
    var num = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshBasicMaterial({ map: numTex, transparent: true, depthWrite: false }));
    num.position.set(0, 0.185, -0.168);
    num.rotation.y = Math.PI;
    upper.add(num);

    /* 머리 */
    var head = new THREE.Group();
    head.position.set(0, 0.335 + HR * 0.86, 0);
    upper.add(head);
    var headMesh = new THREE.Mesh(headGeometry({
      headR: HR, skin: o.skin, hair: o.hair, hairStyle: o.hairStyle,
      eyeStyle: o.eyeStyle, mouthStyle: o.mouthStyle
    }), CHIBI_MAT);
    headMesh.castShadow = true;
    head.add(headMesh);

    /* 팔 */
    function makeArm(side) {
      var sh = new THREE.Group();
      sh.position.set(side * 0.185, 0.30, 0);
      upper.add(sh);
      var upperArm = new THREE.Mesh(mergeParts([
        [GEO.cyl, kit.sleeve, 0, -0.045, 0, 0, 0, 0, 0.072, 0.12, 0.072],
        [GEO.cyl, kit.skinArm || o.skin, 0, -0.125, 0, 0, 0, 0, 0.05, 0.14, 0.05]
      ]), CHIBI_MAT);
      upperArm.castShadow = true;
      sh.add(upperArm);
      var el = new THREE.Group();
      el.position.y = -0.185;
      sh.add(el);
      var fore = new THREE.Mesh(mergeParts([
        [GEO.cyl, kit.skinArm || o.skin, 0, -0.075, 0, 0, 0, 0, 0.045, 0.155, 0.045],
        [GEO.sph, kit.glove || o.skin, 0, -0.165, 0, 0, 0, 0, 0.058, 0.062, 0.055]
      ]), CHIBI_MAT);
      fore.castShadow = true;
      el.add(fore);
      return { sh: sh, el: el, side: side };
    }
    var armL = makeArm(-1), armR = makeArm(1);

    /* 다리 */
    function makeLeg(side) {
      var hp = new THREE.Group();
      hp.position.set(side * 0.095, 0, 0);
      hips.add(hp);
      var thigh = new THREE.Mesh(mergeParts([
        [GEO.cyl, o.skin, 0, -0.105, 0, 0, 0, 0, 0.082, 0.225, 0.082]
      ]), CHIBI_MAT);
      thigh.castShadow = true;
      hp.add(thigh);
      var kn = new THREE.Group();
      kn.position.y = -0.215;
      hp.add(kn);
      var shin = new THREE.Mesh(mergeParts([
        [GEO.cyl, kit.sock, 0, -0.085, 0, 0, 0, 0, 0.07, 0.185, 0.07],
        [GEO.sph, kit.boot, 0, -0.195, 0.035, 0, 0, 0, 0.062, 0.045, 0.115]
      ]), CHIBI_MAT);
      shin.castShadow = true;
      kn.add(shin);
      return { hip: hp, knee: kn, side: side };
    }
    var legL = makeLeg(-1), legR = makeLeg(1);

    root.scale.setScalar(o.scale || 1);

    return {
      root: root, bob: bob, hips: hips, upper: upper, head: head, headMesh: headMesh,
      armL: armL, armR: armR, legL: legL, legR: legR, torso: torso,
      phase: o.phase || 0, kickT: -1, kickLeg: 1, idleT: Math.random() * 6.28,
      scale: o.scale || 1
    };
  }

  R.makePlayer = makePlayer;
  R.HAIRS = HAIRS;
  R.SKINS = SKINS;
  R.CHIBI_MAT = CHIBI_MAT;
  /* ══════════════════════════════════════════════════════════
     데모 경기 — 22명 포메이션 유지 · 패스/드리블/크로스/슛/세이브/태클
     ══════════════════════════════════════════════════════════ */
  var SHAPE = [
    { role: 'GK', x: -49.5, z: 0 },
    { role: 'DF', x: -33, z: -23 },
    { role: 'DF', x: -36, z: -7 },
    { role: 'DF', x: -36, z: 7 },
    { role: 'DF', x: -33, z: 23 },
    { role: 'MF', x: -20, z: -3 },
    { role: 'MF', x: -15, z: 11 },
    { role: 'FW', x: -2, z: -21 },
    { role: 'MF', x: 2, z: 0 },
    { role: 'FW', x: -2, z: 21 },
    { role: 'FW', x: 17, z: 0 }
  ];
  var NAMES_H = ['한지우', '민태호', '서준', '강도현', '윤재', '배성호', '임찬', '오세훈', '김율', '조민혁', '박건우'];
  var NAMES_A = ['카이', '류헌', '도진', 'E. 하트', '무라', '진우', 'L. 베가', '소마', '타케', 'N. 리', '야스'];

  function kitOf(team, isGK) {
    if (team === 0) {
      return isGK
        ? { shirt: 0xf2c400, shorts: 0x1b1e26, sock: 0xf2c400, boot: 0x16181d, trim: 0x1b1e26, collar: 0x1b1e26, sleeve: 0xf2c400, glove: 0xf4f4f4, skinArm: 0xf2c400 }
        : { shirt: 0xd6392f, shorts: 0xf4f4f4, sock: 0xd6392f, boot: 0x16181d, trim: 0xf4f4f4, collar: 0xf4f4f4, sleeve: 0xd6392f, glove: null, skinArm: null };
    }
    return isGK
      ? { shirt: 0xffd83a, shorts: 0x121a30, sock: 0xffd83a, boot: 0x16181d, trim: 0x121a30, collar: 0x121a30, sleeve: 0xffd83a, glove: 0xf4f4f4, skinArm: 0xffd83a }
      : { shirt: 0x2a5ad6, shorts: 0x121a30, sock: 0x2a5ad6, boot: 0x16181d, trim: 0xf0d24a, collar: 0xf0d24a, sleeve: 0x2a5ad6, glove: null, skinArm: null };
  }

  R.create = function (canvas, opts) {
    opts = opts || {};
    var U = R.util, C = R.consts;
    var HLx = HL, HWx = HW;

    /* ── 렌더러 · 씬 ── */
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x2c3a52, 170, 430);

    /* 하늘 그라데이션 */
    var skyTex = canvasTex(4, 256, function (g, w, h) {
      var grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#0c1428');
      grd.addColorStop(0.45, '#1d3050');
      grd.addColorStop(0.78, '#5c6f8c');
      grd.addColorStop(1, '#c98d64');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    var sky = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
    scene.add(sky);

    var camera = new THREE.PerspectiveCamera(38, 2.16, 0.5, 900);

    var hemi = new THREE.HemisphereLight(0xa9c8ff, 0x2b4426, 0.5);
    scene.add(hemi);
    var amb = new THREE.AmbientLight(0xffffff, 0.12);
    scene.add(amb);
    var sun = new THREE.DirectionalLight(0xffeed2, 2.7);
    sun.position.set(46, 74, 44);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1536;
    sun.shadow.mapSize.height = 1536;
    sun.shadow.camera.left = -56; sun.shadow.camera.right = 56;
    sun.shadow.camera.top = 46; sun.shadow.camera.bottom = -46;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 230;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);
    var fill = new THREE.DirectionalLight(0x9fc0ff, 0.55);
    fill.position.set(-50, 46, 60);
    scene.add(fill);

    var stadium = buildStadium(scene);
    var blobTex = makeBlobTexture();
    var ballObj = buildBall(scene, blobTex);
    var ball = ballObj.mesh, ballShadow = ballObj.shadow;

    /* ── 선수 22명 ── */
    var players = [];
    var teamDefs = [
      { sign: 1, kit: 0, names: NAMES_H },
      { sign: -1, kit: 1, names: NAMES_A }
    ];
    var numSeq = [[1, 2, 5, 4, 3, 6, 8, 11, 10, 7, 9], [1, 2, 5, 4, 3, 6, 8, 11, 10, 7, 9]];
    for (var t = 0; t < 2; t++) {
      for (var i = 0; i < 11; i++) {
        var sh = SHAPE[i];
        var isGK = sh.role === 'GK';
        var kit = kitOf(t, isGK);
        var sgn = teamDefs[t].sign;
        var idx = players.length;
        var seed = idx * 3.77;
        var p = {
          idx: idx, team: t, role: sh.role, number: numSeq[t][i],
          name: teamDefs[t].names[i],
          base: { x: sh.x * sgn, z: sh.z },
          x: sh.x * sgn, z: sh.z, vx: 0, vz: 0, speed: 0, dir: sgn > 0 ? Math.PI / 2 : -Math.PI / 2,
          maxSpeed: isGK ? 4.4 : (sh.role === 'FW' ? 7.1 : sh.role === 'DF' ? 6.4 : 6.7),
          think: Math.random() * 0.3, tackleCd: 1 + Math.random(), kickCd: 0,
          anim: 'idle', animT: 0, animDur: 0, animSide: 1, phase: Math.random() * 6.28,
          kickLeg: 0, diveDone: false, reaction: 0
        };
        p.rig = R.makePlayer({
          kit: { shirt: kit.shirt, shorts: kit.shorts, sock: kit.sock, boot: kit.boot, trim: kit.trim, collar: kit.collar, sleeve: kit.sleeve, glove: kit.glove, skinArm: kit.skinArm || R.SKINS[(idx * 5) % R.SKINS.length] },
          skin: R.SKINS[(idx * 3 + 1) % R.SKINS.length],
          hair: R.HAIRS[(idx * 7 + 2) % R.HAIRS.length],
          hairStyle: idx % 5,
          eyeStyle: (idx * 3) % 5,
          mouthStyle: (idx * 2) % 4,
          headR: 0.246 + (idx % 5) * 0.012,
          number: p.number,
          blobTex: blobTex,
          scale: 0.95 + ((idx * 13) % 9) * 0.013,
          phase: p.phase
        });
        p.rig.root.position.set(p.x, 0, p.z);
        p.rig.root.rotation.y = p.dir;
        scene.add(p.rig.root);
        players.push(p);
      }
    }

    /* ── 먼지 파티클 (슬라이딩 태클) ── */
    var dust = [];
    var dustTex = canvasTex(64, 64, function (g, W, H) {
      var grd = g.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, W / 2);
      grd.addColorStop(0, 'rgba(215,225,190,0.85)');
      grd.addColorStop(1, 'rgba(190,205,160,0)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    });
    for (var di = 0; di < 26; di++) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0 }));
      m.visible = false;
      scene.add(m);
      dust.push({ mesh: m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1 });
    }
    var dustCursor = 0;
    function spawnDust(x, z, n, power) {
      for (var k = 0; k < n; k++) {
        var d = dust[dustCursor % dust.length]; dustCursor++;
        d.life = 0; d.max = 0.55 + Math.random() * 0.35;
        d.size = 0.5 + Math.random() * 0.8;
        d.mesh.position.set(x + (Math.random() - 0.5) * 0.5, 0.18 + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.5);
        d.mesh.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
        d.vx = (Math.random() - 0.5) * 2.4 * power;
        d.vz = (Math.random() - 0.5) * 2.4 * power;
        d.vy = 0.7 + Math.random() * 1.1;
        d.mesh.visible = true;
        d.mesh.material.opacity = 0.75;
        d.mesh.scale.setScalar(d.size);
      }
    }
    function updateDust(dt) {
      for (var k = 0; k < dust.length; k++) {
        var d = dust[k];
        if (!d.mesh.visible) continue;
        d.life += dt;
        var u = d.life / d.max;
        if (u >= 1) { d.mesh.visible = false; continue; }
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.z += d.vz * dt;
        d.mesh.position.y += d.vy * dt;
        d.vy -= 2.4 * dt;
        d.vx *= 1 - 1.6 * dt; d.vz *= 1 - 1.6 * dt;
        d.mesh.scale.setScalar(d.size * (1 + u * 1.9));
        d.mesh.material.opacity = 0.7 * (1 - u);
      }
    }

    /* ── 경기 상태 ── */
    var S = {
      ball: { x: 0, z: 0, y: BALL_R, vx: 0, vz: 0, vy: 0, owner: -1, last: -1, lastT: 0, speed: 0 },
      mode: 'kickoff', modeT: 0.2, clock: 0, score: [0, 0], flash: 0, lastEvent: '', eventT: 0,
      kickoffTeam: 0, view: 'broadcast', paused: false
    };
    var _bq = new THREE.Quaternion(), _baxis = new THREE.Vector3(), _bup = new THREE.Vector3(0, 1, 0), _bvel = new THREE.Vector3();

    function ev(msg) { S.lastEvent = msg; S.eventT = 2.2; if (opts.onEvent) opts.onEvent(msg); }

    function resetPositions(kickoffTeam) {
      for (var i = 0; i < players.length; i++) {
        var p = players[i];
        p.vx = p.vz = 0; p.speed = 0;
        p.x = p.base.x; p.z = p.base.z;
        p.dir = p.team === 0 ? Math.PI / 2 : -Math.PI / 2;
        p.anim = 'idle'; p.animT = 0;
        p.root = p.rig.root;
        p.tackleCd = 1.2; p.kickCd = 0.6; p.diveDone = false; p.reaction = 0;
        p.rig.root.position.set(p.x, 0, p.z);
        p.rig.root.rotation.y = p.dir;
        p.rig.bob.rotation.z = 0; p.rig.bob.position.y = 0;
      }
      S.ball.x = 0; S.ball.z = 0; S.ball.y = BALL_R;
      S.ball.vx = S.ball.vz = S.ball.vy = 0; S.ball.owner = -1; S.ball.last = -1;
      /* 킥오프: 중앙 미드필더가 공을 잡고 시작 */
      var starter = null, best = 1e9;
      for (var k = 0; k < players.length; k++) {
        var q = players[k];
        if (q.team !== kickoffTeam || q.role === 'GK') continue;
        var d = Math.abs(q.base.x) + Math.abs(q.base.z) * 0.4;
        if (d < best) { best = d; starter = q; }
      }
      if (starter) {
        starter.x = -2 * (kickoffTeam === 0 ? 1 : -1); starter.z = 1.5;
        starter.rig.root.position.set(starter.x, 0, starter.z);
        S.ball.owner = starter.idx;
        S.ball.x = starter.x; S.ball.z = starter.z + 0.35;
      }
      S.kickoffTeam = kickoffTeam;
    }

    function setAnim(p, name, dur) {
      p.anim = name; p.animT = 0; p.animDur = dur || 0;
    }

    function nearestOpp(p) {
      var best = null, bd = 1e9;
      for (var i = 0; i < players.length; i++) {
        var q = players[i];
        if (q.team === p.team) continue;
        var d = U.dist2(p.x, p.z, q.x, q.z);
        if (d < bd) { bd = d; best = q; }
      }
      return best;
    }
    function nearestTeammateToBall(team, exclude) {
      var best = null, bd = 1e9;
      for (var i = 0; i < players.length; i++) {
        var q = players[i];
        if (q.team !== team || q.role === 'GK' || q === exclude) continue;
        var d = U.dist2(S.ball.x, S.ball.z, q.x, q.z);
        if (d < bd) { bd = d; best = q; }
      }
      return best;
    }

    function ballSpeedVec() {
      var o = S.ball;
      if (o.owner >= 0) {
        var p = players[o.owner];
        return { x: Math.sin(p.dir) * Math.max(p.speed, 1.4), z: Math.cos(p.dir) * Math.max(p.speed, 1.4) };
      }
      return { x: o.vx, z: o.vz };
    }

    /* 패스 */
    function doPass(p, mate, loft) {
      var o = S.ball;
      var lead = 0.26;
      var tx = mate.x + mate.vx * lead, tz = mate.z + mate.vz * lead;
      var dx = tx - o.x, dz = tz - o.z;
      var d = Math.max(1.5, Math.sqrt(dx * dx + dz * dz));
      var spd = U.clamp(d * 1.45, 10, loft ? 19 : 26);
      o.owner = -1; o.last = p.idx; o.lastT = 0;
      o.vx = dx / d * spd; o.vz = dz / d * spd;
      if (loft) {
        var tt = d / spd;
        o.vy = (1.4 - o.y) / tt + 0.5 * GRAV * tt;
      } else {
        o.vy = 0; o.y = BALL_R;
      }
      p.kickCd = 0.45;
      p.kickLeg = (p.dir > 0) ? 1 : 0;
      setAnim(p, 'kick', 0.3);
      ev(p.name + ' 패스 → ' + mate.name);
    }

    function bestPass(p) {
      var o = S.ball, sign = p.team === 0 ? 1 : -1, best = null, bs = -1e9;
      for (var i = 0; i < players.length; i++) {
        var m = players[i];
        if (m.team !== p.team || m === p) continue;
        if (m.role === 'GK') continue;
        var d = U.dist2(p.x, p.z, m.x, m.z);
        if (d < 3 || d > 42) continue;
        var ahead = sign * (m.x - p.x);
        var opp = nearestOpp(m);
        var open = opp ? U.dist2(m.x, m.z, opp.x, opp.z) : 20;
        var score = ahead * 0.75 + open * 1.5 - d * 0.22;
        if (score > bs) { bs = score; best = m; }
      }
      return best;
    }

    function doCross(p) {
      var o = S.ball, sign = p.team === 0 ? 1 : -1;
      var target = null, bestD = 1e9;
      for (var i = 0; i < players.length; i++) {
        var m = players[i];
        if (m.team !== p.team || m === p) continue;
        if (sign * m.x < HL - 24) continue;
        var d = U.dist2(p.x, p.z, m.x, m.z);
        if (d < bestD) { bestD = d; target = m; }
      }
      if (!target) { var b = bestPass(p); if (b) doPass(p, b, false); return; }
      var dx = target.x - o.x, dz = target.z - o.z;
      var d = Math.max(6, Math.sqrt(dx * dx + dz * dz));
      var spd = 18;
      var tt = d / spd;
      o.owner = -1; o.last = p.idx; o.lastT = 0;
      o.vx = dx / d * spd; o.vz = dz / d * spd;
      o.vy = (1.35 - o.y) / tt + 0.5 * GRAV * tt;
      p.kickLeg = 1;
      setAnim(p, 'kick', 0.32);
      ev(p.name + ' 크로스!');
    }

    function doShoot(p) {
      var o = S.ball, sign = p.team === 0 ? 1 : -1;
      var goalX = sign * HL;
      var aimZ = (Math.random() - 0.5) * (GOAL_W - 1.2);
      var aimY = 0.25 + Math.random() * 1.75;
      var dx = goalX - o.x, dz = aimZ - o.z;
      var d = Math.max(4, Math.sqrt(dx * dx + dz * dz));
      var spd = 25 + Math.random() * 7;
      var tt = d / spd;
      o.owner = -1; o.last = p.idx; o.lastT = 0;
      o.vx = dx / d * spd; o.vz = dz / d * spd;
      o.vy = (aimY - o.y) / tt + 0.5 * GRAV * tt;
      p.kickLeg = 1;
      setAnim(p, 'kick', 0.34);
      ev(p.name + ' 슛!');
    }

    /* 태클 */
    function doTackle(p, target) {
      p.tackleCd = 2.6;
      setAnim(p, 'slide', 0.66);
      p.animSide = Math.sign(target.z - p.z) || 1;
      var dx = target.x - p.x, dz = target.z - p.z, d = Math.max(0.6, Math.sqrt(dx * dx + dz * dz));
      p.vx = dx / d * 8.4; p.vz = dz / d * 8.4;
      p.dir = Math.atan2(dx, dz);
      spawnDust(p.x, p.z, 5, 1.1);
      ev(p.name + ' 슬라이딩 태클!');
    }

    /* ── 선수 AI ── */
    function moveToward(p, tx, tz, dt, accel) {
      var dx = tx - p.x, dz = tz - p.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var cap = p.maxSpeed * (p.dribbling ? 0.88 : 1);
      var want = Math.min(cap, d * 3.4);
      var ux = d > 0.001 ? dx / d : 0, uz = d > 0.001 ? dz / d : 0;
      var k = 1 - Math.exp(-(accel || 7) * dt);
      p.vx += (ux * want - p.vx) * k;
      p.vz += (uz * want - p.vz) * k;
    }

    function updatePlayer(p, dt) {
      var o = S.ball;
      var sign = p.team === 0 ? 1 : -1;
      var ownGoalX = -sign * HL;
      var oppGoalX = sign * HL;
      var hasBall = (o.owner === p.idx);
      p.dribbling = hasBall;
      var teamHasBall = (o.owner >= 0 && players[o.owner].team === p.team);
      var presser = null;

      if (p.kickCd > 0) p.kickCd -= dt;
      if (p.tackleCd > 0) p.tackleCd -= dt;

      /* 슬라이딩 중 */
      if (p.anim === 'slide') {
        p.animT += dt;
        var u = p.animT / p.animDur;
        p.vx *= 1 - 2.6 * dt; p.vz *= 1 - 2.6 * dt;
        /* 태클 성공 판정 */
        if (o.owner >= 0 && o.owner !== p.idx && u < 0.85) {
          var tgt = players[o.owner];
          if (tgt.team !== p.team && U.dist2(p.x, p.z, o.x, o.z) < 1.35) {
            var dirv = p.animSide;
            o.owner = -1; o.last = p.idx; o.lastT = 0;
            o.vx = p.vx * 0.55 + (Math.random() - 0.5) * 5;
            o.vz = p.vz * 0.55 + (Math.random() - 0.5) * 7;
            o.vy = 1.6;
            o.y = BALL_R + 0.05;
            setAnim(tgt, 'recover', 0.3);
            spawnDust(o.x, o.z, 3, 0.8);
            ev(p.name + ' 태클 성공!');
          }
        }
        if (u >= 1) { setAnim(p, 'recover', 0.34); }
      } else if (p.anim === 'kick') {
        p.animT += dt;
        if (p.animT >= p.animDur) setAnim(p, 'idle', 0);
        var kickDrag = 1 - 3.4 * dt;
        p.vx *= Math.max(0, kickDrag); p.vz *= Math.max(0, kickDrag);
      } else if (p.anim === 'dive') {
        p.animT += dt;
        if (p.animT >= p.animDur) { setAnim(p, 'recover', 0.5); p.diveDone = false; }
        p.vx *= 1 - 4 * dt; p.vz *= 1 - 4 * dt;
      } else if (p.anim === 'recover') {
        p.animT += dt;
        if (p.animT >= p.animDur) setAnim(p, 'idle', 0);
        p.vx *= 1 - 5 * dt; p.vz *= 1 - 5 * dt;
      } else if (p.anim === 'celebrate') {
        p.vx *= 1 - 4 * dt; p.vz *= 1 - 4 * dt;
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.root.position.set(p.x, 0, p.z);
        return;
      } else {
        /* ── 정상 이동 ── */
        var tx, tz;
        if (p.role === 'GK') {
          var gx = ownGoalX + sign * 1.8;
          var gz = U.clamp(o.z * 0.55, -3.4, 3.4);
          if (Math.abs(o.x - ownGoalX) < 20 && Math.abs(o.z) < 24) {
            gx = ownGoalX + sign * (1.2 + Math.max(0, 6 - Math.abs(o.x - ownGoalX)) * 0.35);
            gz = U.clamp(o.z * 0.62, -4.2, 4.2);
          }
          moveToward(p, gx, gz, dt, 6);
          /* GK 다이빙 세이브 */
          var incoming = ((sign > 0 && o.vx < -8) || (sign < 0 && o.vx > 8));
          if (incoming && !p.diveDone && Math.abs(o.x - ownGoalX) < 18) {
            var tGoal = (ownGoalX - o.x) / o.vx;
            if (tGoal > 0 && tGoal < 0.95) {
              var predZ = o.z + o.vz * tGoal;
              p.diveDone = true;
              p.animSide = Math.sign(predZ - p.z) || 1;
              setAnim(p, 'dive', 0.78);
              p.vz = (predZ - p.z) * 2.4;
              p.vx = sign * 2.2;
              /* 세이브 판정 */
              if (Math.abs(predZ - p.z) < 2.3 && Math.random() < 0.72) {
                S.ball.vx *= -0.42;
                S.ball.vz = (Math.random() - 0.5) * 9;
                S.ball.vy = 4.2;
                S.ball.owner = -1;
                ev(p.name + ' 슈퍼 세이브!!');
                spawnDust(p.x, p.z, 4, 0.9);
              }
            }
          }
        } else if (hasBall) {
          /* 드리블: 상대 골문으로 */
          var pushZ = 0;
          var near = nearestOpp(p);
          if (near && U.dist2(p.x, p.z, near.x, near.z) < 4.2) {
            pushZ = Math.sign(p.z - near.z || 1) * 3.2;
          }
          tx = oppGoalX - sign * 4;
          tz = U.clamp(p.z + pushZ, -26, 26);
          moveToward(p, tx, tz, dt, 7);
          /* 결정 */
          p.think -= dt;
          if (p.think <= 0) {
            p.think = 0.3;
            var dGoal = U.dist2(p.x, p.z, oppGoalX, 0);
            var press = near ? U.dist2(p.x, p.z, near.x, near.z) : 99;
            if (dGoal < 27 && press > 1.0 && Math.abs(p.z) < 24) { doShoot(p); return; }
            if (Math.abs(p.z) > 15 && sign * p.x > 10 && (press < 2.6 || Math.random() < 0.18)) { doCross(p); return; }
            if (press < 2.3) {
              var m = bestPass(p);
              if (m) { doPass(p, m, false); return; }
              /* 압박 탈출 롱패스 */
              doShoot(p); return;
            }
            if (press > 3.4 && Math.random() < 0.35) {
              var m2 = bestPass(p);
              if (m2) { doPass(p, m2, false); return; }
            }
          }
        } else if (teamHasBall) {
          /* 공격 가담: 포메이션 + 전진 */
          tx = p.base.x + U.clamp(o.x * 0.55, -16, 18);
          tz = p.base.z + U.clamp(o.z * 0.22, -5, 5);
          if (p.role === 'FW') tx += sign * 4;
          moveToward(p, tx, tz, dt, 6);
          /* 오프더볼 침투 */
          if (p.role === 'FW' && Math.random() < 0.4 * dt) moveToward(p, oppGoalX - sign * 12, U.clamp(p.base.z * 0.8, -18, 18), dt, 6);
        } else {
          /* 수비: 가장 가까운 2명 압박 */
          var bestP = null, bd = 1e9, second = null, bd2 = 1e9;
          for (var i2 = 0; i2 < players.length; i2++) {
            var q2 = players[i2];
            if (q2.team !== p.team || q2.role === 'GK') continue;
            var d2 = U.dist2(o.x, o.z, q2.x, q2.z);
            if (d2 < bd) { bd2 = bd; second = bestP; bd = d2; bestP = q2; }
            else if (d2 < bd2) { bd2 = d2; second = q2; }
          }
          var isPresser = (p === bestP || p === second);
          if (isPresser) {
            /* 공 소유 상대에게 붙는다 */
            var carrier = o.owner >= 0 ? players[o.owner] : null;
            if (carrier) {
              tx = carrier.x - (sign * 0.9); tz = carrier.z;
            } else {
              tx = o.x; tz = o.z;
            }
            moveToward(p, tx, tz, dt, 7);
            /* 태클 시도 */
            if (carrier && p.tackleCd <= 0 && (p.anim === 'idle' || p.anim === 'run')) {
              var dd = U.dist2(p.x, p.z, o.x, o.z);
              if (dd < 2.15 && Math.random() < 1.3 * dt) doTackle(p, o);
            }
          } else {
            var mark = null, md = 1e9;
            for (var j = 0; j < players.length; j++) {
              var op = players[j];
              if (op.team === p.team || op.role === 'GK') continue;
              var dz2 = Math.abs(op.z - p.base.z);
              if (dz2 > 12) continue;
              var d3 = U.dist2(p.x, p.z, op.x, op.z);
              if (d3 < md) { md = d3; mark = op; }
            }
            if (mark && sign * (mark.x - p.x) < 2) {
              tx = mark.x - sign * 1.6; tz = mark.z;
            } else {
              tx = p.base.x + U.clamp(o.x * 0.5, -20, 12);
              tz = p.base.z + U.clamp(o.z * 0.18, -4, 4);
            }
            moveToward(p, tx, tz, dt, 6);
          }
        }
      }

      /* 이동 적분(모든 상태 공통) */
      p.x += p.vx * dt; p.z += p.vz * dt;

      /* 위치 제한 */
      p.x = U.clamp(p.x, -HL + 0.8, HL - 0.8);
      p.z = U.clamp(p.z, -HW + 0.8, HW - 0.8);
      p.speed =Math.sqrt(p.vx * p.vx + p.vz * p.vz);
      if (p.speed > 0.5 && p.anim !== 'slide' && p.anim !== 'dive') {
        var want = Math.atan2(p.vx, p.vz);
        p.dir = U.angLerp(p.dir, want, Math.min(1, dt * 9));
      } else if (hasBall || p.anim === 'kick') {
        /* 공을 다룰 때는 골문 방향 */
        var face = Math.atan2((p.team === 0 ? 1 : -1), 0);
        p.dir = U.angLerp(p.dir, face, Math.min(1, dt * 6));
      }
      p.root.position.set(p.x, 0, p.z);
      p.root.rotation.y = p.dir;
    }

    /* ── 공 물리 ── */
    function updateBall(dt) {
      var o = S.ball;
      o.lastT += dt;
      if (o.owner >= 0) {
        var p = players[o.owner];
        var fx = Math.sin(p.dir), fz = Math.cos(p.dir);
        var dribble = 0.52;
        var tx = p.x + fx * dribble, tz = p.z + fz * dribble;
        o.x += (tx - o.x) * Math.min(1, dt * 14);
        o.z += (tz - o.z) * Math.min(1, dt * 14);
        o.y = BALL_R;
        o.vx = p.vx; o.vz = p.vz; o.vy = 0;
      } else {
        o.x += o.vx * dt; o.z += o.vz * dt;
        o.y += o.vy * dt;
        o.vy -= GRAV * dt;
        if (o.y <= BALL_R) {
          o.y = BALL_R;
          if (o.vy < -1.6) { o.vy = -o.vy * 0.52; o.vx *= 0.92; o.vz *= 0.92; }
          else {
            o.vy = 0;
            var f = Math.exp(-1.55 * dt);
            o.vx *= f; o.vz *= f;
          }
        } else {
          o.vx *= 1 - 0.06 * dt;
          o.vz *= 1 - 0.06 * dt;
        }
        /* 소유권 획득 */
        for (var i = 0; i < players.length; i++) {
          var q = players[i];
          if (q === players[o.last] && o.lastT < 0.32) continue;
          if (q.anim === 'slide' || q.anim === 'dive') continue;
          var d = Math.sqrt((q.x - o.x) * (q.x - o.x) + (q.z - o.z) * (q.z - o.z));
          var reach = q.role === 'GK' ? 1.25 : 0.92;
          if (d < reach && o.y < 1.75) {
            var sp = Math.sqrt(o.vx * o.vx + o.vz * o.vz);
            if (sp > 17 && q.role !== 'GK') continue;
            o.owner = q.idx; o.last = q.idx;
            o.vx = o.vz = o.vy = 0;
            q.think = 0.12;
            break;
          }
        }
        /* 골 판정 */
        for (var gt = 0; gt < 2; gt++) {
          var gsign = gt === 0 ? 1 : -1;
          if (o.x * gsign > HL - 0.08 && Math.abs(o.z) < GOAL_W / 2 && o.y < GOAL_H) {
            scoreGoal(gt);
            return;
          }
        }
        /* 아웃 판정 */
        if (Math.abs(o.z) > HW + 1.1 || Math.abs(o.x) > HL + 1.2) {
          var nx = U.clamp(o.x, -HL + 3, HL - 3), nz = U.clamp(o.z, -HW + 2, HW - 2);
          o.x = nx; o.z = nz; o.y = BALL_R;
          o.vx = o.vz = o.vy = 0;
          var near = null, nd = 1e9;
          for (var k2 = 0; k2 < players.length; k2++) {
            var pl = players[k2];
            var dd = U.dist2(pl.x, pl.z, o.x, o.z);
            if (dd < nd) { nd = dd; near = pl; }
          }
          if (near) { o.owner = near.idx; o.last = near.idx; }
          ev('아웃 — 경기 재개');
        }
      }
      ball.position.set(o.x, o.y, o.z);
      /* 공 회전 */
      var v = ballSpeedVec();
      var sp = Math.sqrt(v.x * v.x + v.z * v.z);
      if (sp > 0.05) {
        _bvel.set(v.x, 0, v.z).normalize();
        _baxis.crossVectors(_bup, _bvel).normalize();
        _bq.setFromAxisAngle(_baxis, sp * dt / BALL_R);
        ball.quaternion.premultiply(_bq);
      }
      /* 접지 그림자 */
      var h = Math.max(0, o.y - BALL_R);
      ballShadow.position.set(o.x, 0.014, o.z);
      var sc = 0.52 + h * 0.22;
      ballShadow.scale.set(sc, sc, 1);
      ballShadow.material.opacity = U.clamp(0.9 - h * 0.16, 0.18, 0.9);
    }

    function scoreGoal(teamIdx) {
      if (S.mode !== 'play') return;
      S.score[teamIdx]++;
      S.mode = 'celebrate'; S.modeT = 0; S.flash = 1;
      ev('GOAL! ' + (teamIdx === 0 ? '꼬마일레븐 FC' : '청주 유나이티드'));
      if (opts.onGoal) opts.onGoal(teamIdx, S.score[teamIdx]);
      for (var i = 0; i < players.length; i++) {
        var p = players[i];
        if (p.team === teamIdx) setAnim(p, 'celebrate', 1.6);
        else setAnim(p, 'idle', 0);
      }
      S.kickoffTeam = 1 - teamIdx;
    }

    /* ── 애니메이션 ── */
    function applyPose(p, dt, t) {
      var rig = p.rig;
      var target = {
        hipL: 0, hipR: 0, kneeL: 0.08, kneeR: 0.08,
        armL: 0, armR: 0, armLZ: 0.14, armRZ: -0.14,
        elbL: -0.18, elbR: -0.18, lean: 0, roll: 0, bobY: 0,
        headX: 0, headY: 0, rate: 12
      };
      var spdN = U.clamp(p.speed / 6.6, 0, 1.35);
      if (p.anim === 'run' || (p.anim === 'idle' && p.speed > 0.7)) {
        p.anim = 'run';
        p.phase += dt * (5.6 + p.speed * 1.25);
        var s = Math.sin(p.phase);
        target.hipL = -s * 0.92 * spdN;
        target.hipR = s * 0.92 * spdN;
        target.kneeL = (0.12 + Math.max(0, s) * 0.95) * U.clamp(spdN, 0.5, 1.3);
        target.kneeR = (0.12 + Math.max(0, -s) * 0.95) * U.clamp(spdN, 0.5, 1.3);
        target.armL = s * 0.78 * spdN;
        target.armR = -s * 0.78 * spdN;
        target.elbL = -0.55 - 0.45 * spdN;
        target.elbR = -0.55 - 0.45 * spdN;
        target.lean = 0.11 * spdN;
        target.bobY = Math.abs(Math.sin(p.phase)) * 0.05 * spdN;
        target.armLZ = 0.2; target.armRZ = -0.2;
        target.rate = 24;
      } else if (p.anim === 'idle' || p.anim === 'recover') {
        var br = Math.sin(t * 1.7 + p.rig.idleT);
        target.kneeL = 0.1; target.kneeR = 0.1;
        target.armL = br * 0.04; target.armR = -br * 0.04;
        target.armLZ = 0.17 + br * 0.02; target.armRZ = -0.17 - br * 0.02;
        target.lean = 0.03;
        target.bobY = br * 0.008;
        target.headX = Math.sin(t * 0.9 + p.rig.idleT) * 0.03;
        target.rate = 8;
      } else if (p.anim === 'kick') {
        var u = U.clamp(p.animT / p.animDur, 0, 1);
        var leg = p.kickLeg;
        var back = U.smoothstep(0, 0.32, u) * (1 - U.smoothstep(0.32, 0.62, u));
        var fwd = U.smoothstep(0.3, 0.62, u) * (1 - U.smoothstep(0.72, 1, u));
        var hip = 0.75 * back - 1.15 * fwd;
        var knee = 1.25 * back + 0.06;
        if (leg === 1) { target.hipR = hip; target.kneeR = knee; target.hipL = -0.12; }
        else { target.hipL = hip; target.kneeL = knee; target.hipR = -0.12; }
        target.lean = 0.16 * fwd + 0.05;
        target.armL = -0.6 * fwd; target.armR = 0.7 * back;
        target.armLZ = 0.5; target.armRZ = -0.5;
        target.bobY = 0.03 * back;
        target.rate = 30;
      } else if (p.anim === 'slide') {
        var u2 = U.clamp(p.animT / p.animDur, 0, 1);
        var drop = U.smoothstep(0, 0.22, u2) * (1 - U.smoothstep(0.82, 1, u2));
        target.roll = p.animSide * 1.22 * drop;
        target.bobY = -0.2 * drop;
        target.hipL = -0.95 - 0.25 * drop; target.hipR = -0.35;
        target.kneeL = 0.12; target.kneeR = 1.1;
        target.armL = -1.5 * drop; target.armR = 0.6 * drop;
        target.armLZ = 0.9 * drop; target.armRZ = -0.5 * drop;
        target.lean = 0.18 * drop;
        target.headX = -0.25 * drop;
        target.rate = 20;
      } else if (p.anim === 'dive') {
        var u3 = U.clamp(p.animT / p.animDur, 0, 1);
        var dd = U.smoothstep(0, 0.3, u3) * (1 - U.smoothstep(0.75, 1, u3));
        target.roll = p.animSide * 1.3 * dd;
        target.bobY = -0.22 * dd;
        target.armL = -2.5 * dd; target.armR = -2.5 * dd;
        target.armLZ = 0.55 * dd; target.armRZ = -0.55 * dd;
        target.elbL = -0.1; target.elbR = -0.1;
        target.hipL = -0.5 * dd; target.hipR = -0.15;
        target.kneeL = 0.5 * dd; target.kneeR = 0.3 * dd;
        target.lean = 0.1;
        target.rate = 22;
      } else if (p.anim === 'celebrate') {
        var jt = t * 7.5 + p.idx;
        target.armL = -2.7; target.armR = -2.7;
        target.armLZ = -0.25; target.armRZ = 0.25;
        target.elbL = -0.2; target.elbR = -0.2;
        target.bobY = Math.abs(Math.sin(jt)) * 0.22;
        target.headX = -0.18;
        target.lean = -0.1;
        target.rate = 16;
      }
      var k = 1 - Math.exp(-(target.rate) * dt);
      var pose = rig.pose || (rig.pose = {});
      for (var key in target) {
        if (key === 'rate') continue;
        if (pose[key] == null) pose[key] = target[key];
        pose[key] += (target[key] - pose[key]) * k;
      }
      rig.legL.hip.rotation.x = pose.hipL;
      rig.legR.hip.rotation.x = pose.hipR;
      rig.legL.knee.rotation.x = pose.kneeL;
      rig.legR.knee.rotation.x = pose.kneeR;
      rig.armL.sh.rotation.x = pose.armL;
      rig.armR.sh.rotation.x = pose.armR;
      rig.armL.sh.rotation.z = pose.armLZ;
      rig.armR.sh.rotation.z = pose.armRZ;
      rig.armL.el.rotation.x = pose.elbL;
      rig.armR.el.rotation.x = pose.elbR;
      rig.upper.rotation.x = pose.lean;
      rig.bob.rotation.z = pose.roll;
      rig.bob.position.y = pose.bobY;
      rig.head.rotation.x = pose.headX;
      rig.head.rotation.y = pose.headY;
    }

    /* ── 카메라 (완전 수평 · yaw = 0) ── */
    var CAM = {
      mode: 'broadcast',
      tx: 0, ty: 1.7, tz: 3.2, dist: 46, pitch: 0.545,
      cx: 0, cy: 36, cz: 64, ready: false
    };
    function updateCamera(dt) {
      var want = { tx: 0, ty: 1.6, tz: 2.4, dist: 46, pitch: 0.545 };
      var o = S.ball;
      if (CAM.mode === 'full') {
        want.tx = 0; want.tz = 0; want.ty = 0.5; want.dist = 132; want.pitch = 0.95;
      } else if (CAM.mode === 'closeup') {
        want.tx = o.x; want.tz = o.z + 0.8; want.ty = 0.95; want.dist = 16; want.pitch = 0.34;
      } else {
        var inThird = U.smoothstep(HL - 34, HL - 8, Math.abs(o.x));
        want.tx = U.clamp(o.x * 0.92, -30, 30);
        want.tz = U.clamp(o.z * 0.35, -5, 5) + 3.2;
        want.ty = 1.7;
        want.dist = 47 - 11 * inThird;
        want.pitch = 0.545;
      }
      var k = 1 - Math.exp(-(CAM.ready ? 3.2 : 60) * dt);
      CAM.tx += (want.tx - CAM.tx) * k;
      CAM.ty += (want.ty - CAM.ty) * k;
      CAM.tz += (want.tz - CAM.tz) * k;
      CAM.dist += (want.dist - CAM.dist) * k;
      CAM.pitch += (want.pitch - CAM.pitch) * k;
      var cp = Math.cos(CAM.pitch), sp = Math.sin(CAM.pitch);
      camera.position.set(CAM.tx, CAM.ty + CAM.dist * sp, CAM.tz + CAM.dist * cp);
      camera.lookAt(CAM.tx, CAM.ty, CAM.tz);       /* up=(0,1,0) → 좌우 기울기 0 */
      CAM.ready = true;
      /* 공 그림자·조명 추종 */
      sun.position.set(CAM.tx + 46, 74, 44);
      sun.target.position.set(CAM.tx * 0.6, 0, 0);
      sun.target.updateMatrixWorld();
    }

    /* ── 리사이즈 ── */
    function resize() {
      var w = canvas.clientWidth || global.innerWidth;
      var h = canvas.clientHeight || global.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      var vfov = h > w ? 54 : 36;
      camera.fov = vfov;
      camera.updateProjectionMatrix();
    }
    if (global.ResizeObserver) {
      var ro = new ResizeObserver(resize);
      ro.observe(canvas);
    }
    global.addEventListener('resize', resize);
    resize();
    camera.position.set(0, 1.7 + 46 * Math.sin(0.545), 3.2 + 46 * Math.cos(0.545));
    camera.lookAt(0, 1.7, 3.2);

    /* ── 메인 루프 ── */
    var running = false, lastT = 0, raf = 0;
    var fpsAcc = 0, fpsFrames = 0, fps = 60, hudT = 0, lowCount = 0, quality = 1;

    function step(dt, now) {
      var o = S.ball;
      S.flash = Math.max(0, S.flash - dt * 1.4);
      if (S.eventT > 0) S.eventT -= dt;

      if (S.mode === 'play') {
        S.clock += dt * 0.42;
        for (var i = 0; i < players.length; i++) updatePlayer(players[i], dt);
        updateBall(dt);
      } else if (S.mode === 'celebrate') {
        S.modeT += dt;
        for (var j = 0; j < players.length; j++) {
          var p = players[j];
          if (p.anim === 'celebrate') { p.rig.root.position.set(p.x + Math.sin(now * 2 + j) * 0.2, 0, p.z); }
        }
        updateBall(dt);
        if (S.modeT > 1.9) { S.mode = 'kickoff'; S.modeT = 0; resetPositions(S.kickoffTeam); }
      } else if (S.mode === 'kickoff') {
        S.modeT += dt;
        for (var k = 0; k < players.length; k++) {
          var q = players[k];
          if (q.anim === 'run') { /* 대형 복귀 */ }
          updatePlayer(q, dt);
        }
        updateBall(dt);
        if (S.modeT > 0.85) {
          S.mode = 'play';
          var st = o.owner >= 0 ? players[o.owner] : null;
          if (st) { var mate = bestPass(st); if (mate) doPass(st, mate, false); }
        }
      }

      /* 포즈 */
      for (var n = 0; n < players.length; n++) applyPose(players[n], dt, now);
      updateDust(dt);

      updateCamera(dt);
      if (S.flash > 0 && opts.onFlash) opts.onFlash(S.flash);
    }

    function loop(ts) {
      if (!running) return;
      raf = global.requestAnimationFrame(loop);
      var t = ts / 1000;
      var dt = Math.min(0.05, t - lastT || 0.016);
      lastT = t;
      fpsAcc += dt; fpsFrames++;
      if (fpsAcc >= 0.5) {
        fps = fpsFrames / fpsAcc;
        fpsAcc = 0; fpsFrames = 0;
        if (fps < 46 && quality > 0.6) {
          lowCount++;
          if (lowCount >= 3) {
            quality = 0.6; lowCount = 0;
            renderer.setPixelRatio(1);
            sun.shadow.mapSize.width = sun.shadow.mapSize.height = 1024;
            if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
          }
        }
      }
      if (!S.paused) step(dt, t);
      renderer.render(scene, camera);

      hudT += dt;
      if (hudT > 0.2 && opts.onHud) {
        hudT = 0;
        opts.onHud({
          fps: Math.round(fps), score: S.score, clock: S.clock, mode: S.mode,
          event: S.eventT > 0 ? S.lastEvent : '', view: CAM.mode, flash: S.flash
        });
      }
    }

    var api = {
      start: function () { if (running) return; running = true; lastT = performance.now() / 1000; raf = global.requestAnimationFrame(loop); },
      stop: function () { running = false; if (raf) global.cancelAnimationFrame(raf); },
      setView: function (m) { CAM.mode = m; S.view = m; },
      getView: function () { return CAM.mode; },
      togglePause: function () { S.paused = !S.paused; return S.paused; },
      stats: function () {
        return {
          fps: Math.round(fps), mode: S.mode, view: CAM.mode, score: S.score.slice(),
          clock: S.clock, players: players.length, meshes: countMeshes(scene),
          triangles: renderer.info.render.triangles, calls: renderer.info.render.calls,
          quality: quality
        };
      },
      players: players, scene: scene, camera: camera, renderer: renderer, state: S,
      _step: step, _applyPose: applyPose,
      setMode: function (m) { S.mode = m; }
    };

    function countMeshes(root) {
      var n = 0;
      root.traverse(function (o) { if (o.isMesh) n++; });
      return n;
    }

    resetPositions(0);
    return api;
  };
})(window);
