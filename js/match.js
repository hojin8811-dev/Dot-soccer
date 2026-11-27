/*! 꼬마일레븐 FC v29 — 진짜 축구 AI · 실시간 경기 엔진 (match.js)
    v16: 전 프레임 Hard Separation(겹침 0) · 박스 타겟 슬롯 분산 · GK 보호 · 수비 복귀
    v17: TV 생중계 카메라(패닝·찬스 줌인) · 골 세레모니·Net Ripple(3초 리플레이는 v27에서 삭제) ·
         Web Audio 경기장 사운드 · 살아있는 관중석 · 캐스터/해설 2인 중계
    v18: GK 드리블 금지(숏패스 빌드업·롱킥 배급) · 수비 3줄 블록(DF–MF–FW) + 1~2인 존 압박 ·
         지속되는 일자 하이 라인 오프사이드 트랩 · 터치라인 교차점 스로인 + 패스 목표 클램프
    v19: 전술 스타일별 공격 패턴 + 탈취 후 5초 전환(Transition) 창 · 원투(월 패스) ·
         AI 감독의 실시간 맞대응(55/70/80분) · 코너·간접 프리킥 세컨볼 경합 ·
         경기 후 FM식 2D 슈팅 xG맵 + 평균 포지션/패스 연결망 계측
    v20: 라이브 터치라인 지시(공격 성향·압박 강도·수비 라인·공격 루트) ·
         포지션/현대 롤/주발이 실제 플레이에 반영(인버티드 윙어 컷인 · 전통 윙어 폭 ·
         DM 드롭 · B2B 늦은 침투 · CF 폴스나인 vs ST 뒷공간)
    v25: 실시간 전술카드 피치 오버레이(트랩 라인·압박 타겟 링·침투 화살표·티키타카 삼각선·
         중거리 조준 아크·포위 링·템포 파동·세트피스 조준) · 카드별 활성 HUD 게이지 ·
         캐릭터 연출(질주 잔상·발차기 스윙/충격파·슬라이딩 잔디/데칼·다이빙 고스트·
         세리머니 색종이·스턴 별·땀방울·에이스 링) · 확실한 킥오프 세리머니
    v29: 약측(반대편) 아이솔레이션 — 공이 한쪽에 몰려도 반대편 윙어·윙백은 터치라인 폭 유지 ·
         측면 압박 시 사이드 전환 롱패스(↔ 사이드 전환!) 판단 ·
         코너킥·공격 진영 프리킥 전용 대형(장신 CB 니어/파포스트 + 후방 커버 2 + 수비벽) ·
         크로스 곡선 궤적·낙하 지점 조준선·헤딩 경합 점프 연출 ·
         터치라인 지시 ↔ 상대 성향 전술 상성 실시간 피드백(M.matchupState) */
(function (global) {
  'use strict';

  var DS = global.DS;
  var U = DS.util;
  var rnd = U.rnd, range = U.range, chance = U.chance, clamp = U.clamp, pick = U.pick;

  var WORLD_W = 100;
  var WORLD_H = 120;
  var MATCH_SECONDS = 168;     /* v15 — ×1 배속에서 168초(2분 48초)에 90분 경기: 패스·침투·세트피스를 지켜보는 호흡 */
  var PER_MIN = MATCH_SECONDS / 90;   /* 경기 1분에 해당하는 시뮬레이션 초 (≈1.87초) */
  var MAX_SUBS = 5;
  var HAND_SIZE = 3;
  var CARD_LIMIT = 6;          /* 경기당 전술 카드 개입 최대 횟수 */

  var M = {
    running: false,
    paused: false,
    speed: 1,
    phase: 'idle',
    clock: 0,
    homeScore: 0,
    awayScore: 0,
    subsLeft: MAX_SUBS
  };

  var canvas = null;
  var ctx = null;
  var W = 390, H = 430, dpr = 1;
  var field = { x: 6, y: 6, w: 378, h: 418 };
  var SPR_H = 28;            /* 피치 선수 스프라이트 높이(px) — v8: v7의 절반 */
  var BALL_G = 150;          /* 공 중력(월드 단위/s^2) */
  var pitchLayer = null;

  /* ═════════ v17 — TV 생중계 연출 상태 ═════════
     v30 — 기본 프레임을 1.035 → 1.15로 당기고(중계뷰), 선수 원은 13% 축소해
     화면상 얼굴 크기는 v29와 같게 두면서 선수 간 간격·피치 공간감을 넓혔다.
     전체뷰(토글)는 줌 1.0으로 전술 전체 배치를 한눈에 본다. */
  var CAM_Z0 = 1.15;                                        /* v30 잔존값 — viewState 호환용 */
  var CAM_Z_FULL = 1.0;
  var CAM_Z_CHANCE = 1.20;
  var cam = { x: W / 2, y: H / 2, z: CAM_Z0 };              /* v31 UI 호환용 (실제 시점은 DS.Q) */
  /* v31 — 쿼터뷰 3D 카메라 (DS.Q). 거리 = 시점에서 시선 목표까지(m) */
  var QV = global.DS.Q;
  var CAM_D_BASE = 128, CAM_D_CHANCE = 110, CAM_D_GOAL = 116, CAM_D_FULL = 205;
  var PLAYER_K = 1.16;                                      /* 치비 전신 스프라이트 크기 배율 */
  var camMode = 'broadcast';                                /* v30 — 'broadcast' | 'full' */
  var slowmo = { t: 0, t0: 0, k: 1 };                       /* v30 — 골 순간 짧은 슬로우 모션 */
  var goalCutinPend = 0, goalCutinWho = null;               /* v30 — 골 임팩트 뒤 GOAL 컷인 지연 */
  var fadeFx = { t: 0, t0: 0.5 };                           /* v30 — 세리머니 → 킥오프 암전 전환 */
  var goalStage = null, goalT = 0;                          /* 'celebrate' 세리머니 동안만 사용 */
  var cel = null;                                           /* 세레모니 (득점자·코너·동료) */
  var netFx = { t: 0, t0: 1.15, side: 'home' };             /* 골망 출렁임 */
  var crowd = { energy: 0, acc: 0, flashes: [], wave: 0 };   /* 관중석 반짝임·깃발·파도 */
  var lastGoalXg = 0, lastGoalAssist = '';
  var cmtQ = [], cmtT = 0;                                  /* 해설 대기열 */

  var players = [];
  var cfg = null;
  var ratings = [];
  var benchState = [];
  var lastT = 0;
  var rafId = 0;
  var acc = 0;
  var simTime = 0;
  var actionTimer = 0;
  var fillerTimer = 0;
  var halftimeDone = false;
  var tactic = 'balanced';

  /* ═════════ v20 ① — 라이브 터치라인 지시 ═════════
     경기 중 감독(사용자)이 터치라인에서 네 가지 지시를 내리고, 그 값이 매 프레임
     teamShape(shapeOf) · 압박 상한/트리거 거리(pressConfig) · 수비 블록 높이(blockOf→lineYOf)
     · 공격 루트(attackTarget/passBall/assignRuns)에 바로 반영된다. */
  var TOUCH_DEF = {
    mentality: {
      key: 'mentality', label: '공격 성향', short: '성향',
      opts: [
        { v: 'defensive', label: '수비적', short: '수비' },
        { v: 'balanced', label: '균형', short: '균형' },
        { v: 'attacking', label: '공격적', short: '공격' },
        { v: 'allout', label: '총공세', short: '총공세' }
      ]
    },
    pressing: {
      key: 'pressing', label: '압박 강도', short: '압박',
      opts: [
        { v: 'low', label: '낮게', short: '낮게' },
        { v: 'normal', label: '보통', short: '보통' },
        { v: 'high', label: '전방 압박', short: '전방' }
      ]
    },
    line: {
      key: 'line', label: '수비 라인', short: '라인',
      opts: [
        { v: 'deep', label: '라인 내리기', short: '내리기' },
        { v: 'standard', label: '라인 유지', short: '유지' },
        { v: 'high', label: '라인 올리기', short: '올리기' }
      ]
    },
    focus: {
      key: 'focus', label: '공격 루트', short: '루트',
      opts: [
        { v: 'balance', label: '양쪽 루트', short: '양쪽' },
        { v: 'left', label: '좌측', short: '좌측' },
        { v: 'center', label: '중앙', short: '중앙' },
        { v: 'right', label: '우측', short: '우측' }
      ]
    }
  };
  /* 성향 → 기존 전술 형태(shape) 토큰. AI 감독 포스처와 같은 어휘를 쓴다. */
  var TOUCH_SHAPE = { defensive: 'defense', balanced: 'balanced', attacking: 'attack', allout: 'allout' };
  var TOUCH_PRESSURE = { low: -15, normal: 0, high: 17 };
  var TOUCH_LINE = { deep: -9, standard: 0, high: 9 };
  var TOUCH_FOCUS_X = { left: 24, center: 50, right: 76 };
  var touch = { mentality: 'balanced', pressing: 'normal', line: 'standard', focus: 'balance' };
  var touchFx = { t: 0, t0: 2.6, label: '', tone: '' };   /* 피치 위 터치라인 콜아웃 */
  var touchCount = 0;
  /* v29 — 전술 상성 피드백 · 세트피스 전용 대형 상태 */
  var matchupEvalT = 0;                                       /* 상성 재판단 타이머(시뮬 초) */
  var matchupFx = { t: 0, t0: 4.4, tag: '', text: '', tone: '', key: '' };
  var spLayout = null;                                        /* 진행 중인 세트피스 대형 */
  var lastSpPass = null;                                      /* 방금 올린 크로스(낙하 지점·타깃) */
  var goalStats = { homeShots: 0, awayShots: 0 };
  var stats = { passes: 0, tackles: 0, saves: 0, interceptions: 0 };
  var spriteCache = {};
  var lastScorerSide = 'home';
  var goals = [];
  var cautions = [];
  var possession = { home: 0.001, away: 0.001 };
  var halfScore = [[0, 0], [0, 0]];
  var formFactor = 1;

  /* ── v15 — 추가시간 · 세트피스 · 오프사이드 계측 ── */
  var addedTime = { first: 0, second: 0 };      /* 45+N · 90+N 의 N */
  var addedDecided = { first: false, second: false };
  var deadTime = 0;                             /* 현재 하프에서 소비된 지연 시간(시뮬 초) */
  var v15 = null;
  function blankV15() {
    return {
      offside: { home: 0, away: 0 },
      setpiece: { throw: 0, goalkick: 0, corner: 0, fk: 0, pk: 0, indirect: 0 },
      reds: 0, cards: 0, added: [0, 0], timeline: []
    };
  }
  function dead(sec) { deadTime += sec; }
  function logEvt(kind, side, x, y) {
    if (!v15) { return; }
    v15.timeline.push({ t: Math.round(minute()), kind: kind, side: side || null, x: Math.round(x || 0), y: Math.round(y || 0) });
    if (v15.timeline.length > 90) { v15.timeline.shift(); }
  }
  var flagShow = { t: 0, y: 0, side: null };    /* 부심 깃발 · 오프사이드 점선 라인 */
  var bannerT = 0;
  var homeXg = 0, awayXg = 0;

  /* ── 모멘텀 · 전술 카드 ── */
  var momentum = 0;
  var hand = [];
  var drawQueue = [];
  var buffs = {};
  var mgrFx = {};          /* 감독 특기 (경기 내내 고정) */
  var homeMetrics = null;  /* 감독 전술 보정이 반영된 우리 팀 포메이션 지표 */
  /* v14 — 감독 전술 철학 계측기 (검증·QA용) */
  var tele = null;
  function blankTele() {
    return {
      pass: { home: { short: 0, long: 0, through: 0, cross: 0, switch: 0 }, away: { short: 0, long: 0, through: 0, cross: 0, switch: 0 } },
      passDist: { home: { sum: 0, n: 0 }, away: { sum: 0, n: 0 } },
      press: { home: 0, away: 0 },           /* 태클 시도(압박 접촉) 횟수 */
      pressHigh: { home: 0, away: 0 },       /* 상대 진영에서 시작한 높은 압박 */
      pressY: { home: { sum: 0, n: 0 }, away: { sum: 0, n: 0 } },   /* 압박이 일어난 평균 높이 */
      swarm: { home: 0, away: 0 },           /* 볼 상실 직후 즉시 압박(카운터프레스) 가동 */
      longwin: { home: 0, away: 0 }         /* 자기 진영 탈취 직후 전방 롱패스 */
    };
  }
  tele = blankTele();
  var cutinHold = 0;
  var cardUses = 0;
  var lastHud = 0;
  var hudDirty = true;

  /* ── 볼 ── */
  var ball = {
    x: 50, y: 60, vx: 0, vy: 0, z: 0, vz: 0, px: 50, py: 60, pz: 0,
    carrier: null, from: null, receiver: null,
    kind: 'idle', flight: 0, dur: 0,
    aim: null, shot: null, trail: [], assist: null,
    lastTouch: null, offside: null, exempt: false
  };

  /* ── 경기 상황(전개 단계 · 세트피스) ── */
  var play = {
    phase: 'kickoff',
    timer: 0.9,
    atkSide: 'home',
    stage: 'build',
    stageT: 0,
    counterSide: null,
    counterT: 0,
    recoverSide: null,
    recoverT: 0,
    markT: 0,
    sitKey: '',
    setpiece: null,
    passLine: null,
    looseT: 0,
    supT: 0,
    runT: 1.5,
    supList: null
  };

  /* ── v18 전술 엔진 상태 ── */
  var simFrame = 0;                                    /* 프레임 일련번호 — 블록 좌표 캐시 키 */
  var blockCache = { frame: -1, home: null, away: null };
  var v18t = {                                         /* v18 계측기 (검증용) */
    gkDecision: 0, gkShort: 0, gkLong: 0, gkClear: 0, gkDribble: 0,
    passOut: 0, passClamp: 0, knockOut: 0,
    throws: [],                                        /* {side, lineX, y, crossX, crossY, edge} */
    spLaunch: [],                                      /* v19b: 세트피스 실제 발사 위치 {type,x,y,ox,oy,d} */
    trapFrames: 0, trapLineY: 0, trapSdSum: 0, trapSdN: 0, trapCaught: 0, trapLive: 0, trapZone: 0,
    pressMax: { home: 0, away: 0 }
  };

  /* ── v19 상태 ──
     ① 전환(Transition) 창 · 원투 · 스타일별 공격 패턴 계측
     ② AI 감독 포스처(away)   ③ 세트피스 공중볼 경합·세컨볼   ④ 슈팅/포지션/패스 계측 */
  var TRANS_SECONDS = 5.0;                             /* 탈취 후 전환 창 길이(초) */
  var STYLE_TRANS = {
    counter: 'vertical', direct: 'vertical', tikitaka: 'triangle',
    gegenpress: 'press', wingplay: 'wide', hybrid3241: 'invert', balanced: 'normal'
  };
  var AI_CHECKS = [55, 70, 80];                        /* AI 감독이 점수를 훑는 경기 분 */
  var trans = { side: null, t: 0, t0: TRANS_SECONDS, kind: null };
  var oneTwo = null;                                   /* 진행 중인 원투(월 패스) */
  var aiPosture = 'balanced';                          /* away 팀 감독의 현재 포스처 */
  var aiCheckIdx = 0;
  var shotLog = [];                                    /* {side,x,y,xg,onTarget,isGoal,min,scorer} */
  var posAcc = {};                                     /* id → {side,name,pos,x,y,n} 평균 위치 */
  var passNet = { home: {}, away: {} };                /* 'fromId|toId' → {from,to,fromId,toId,n} */
  var posT = 0;
  function blankV19() {
    return {
      trans: { home: 0, away: 0 }, transThrough: 0, transRuns: 0,
      wallTries: 0, wallPass: 0, cutback: 0,
      overlap: { home: 0, away: 0 }, invert: { home: 0, away: 0 },
      burst: { home: 0, away: 0 }, press3: 0,
      aiShifts: [],
      contest: 0, header: 0, secondBall: 0, clearance: 0
    };
  }
  var v19t = blankV19();

  /* ── v20 계측기 — 롤·주발·터치라인 지시가 실제 플레이를 바꿨는지 세는 카운터 ── */
  function blankV20() {
    return {
      touch: { changes: 0, callouts: 0, last: null },
      invertedCut: { home: 0, away: 0 }, wideHold: { home: 0, away: 0 },
      dmDrop: { home: 0, away: 0 }, lateBox: { home: 0, away: 0 },
      cfDrop: { home: 0, away: 0 }, stBehind: { home: 0, away: 0 },
      ifbIn: { home: 0, away: 0 },
      shots: { strong: 0, curl: 0, both: 0, weakLong: 0 },
      focusPass: { left: 0, center: 0, right: 0 },
      focusRun: { left: 0, center: 0, right: 0 },
      pressFrames: 0, pressSum: 0, pressMax: 0,
      roleIds: {}
    };
  }
  var v20t = blankV20();

  /* ── v29 계측기 — 약측 폭 유지 · 사이드 전환 · 세트피스 대형 · 전술 상성 ── */
  function blankV29() {
    return {
      switchTries: 0, switchDone: 0, switchFail: 0, switches: [], lastSwitch: null,
      isoFrames: 0, isoFarSum: 0, isoFarMin: 999, isoFarMax: 0,
      sp: { corner: 0, fk: 0, near: 0, far: 0, back: 0, wall: 0, box: 0, last: null },
      matchup: { hits: [], lastKey: null, lastMin: -9, active: null },
      headerContest: 0, headerOnTarget: 0, arcCross: 0, contestLanding: null
    };
  }
  var v29t = blankV29();

  /* ── v21 계측기 — 정체 탈출 · 명확한 찬스 슈팅 · 렌더 보간 ── */
  var ownHalfT = 0;            /* 같은 팀이 자기 진영에서만 공을 돌린 시간(초) */
  var ownHalfSide = null;
  var renderAlpha = 1;         /* acc / stepDt — 60/120fps 서브프레임 보간 계수 */
  function blankV21() {
    return {
      stallWarn: 0, stallBreak: 0, stallLong: 0, forwardPass: 0,
      clearShots: 0, boxShots: 0, chancePass: 0, backPassBlocked: 0,
      frames: 0, steps: 0
    };
  }
  var v21t = blankV21();

  /* 전술 상황 배너 문구 */
  var SIT = {
    kickoff:   { label: '킥오프',       sub: '경기 시작',              tone: 'build' },
    build:     { label: '후방 빌드업',   sub: 'GK → CB → DM',           tone: 'build' },
    mid:       { label: '중원 전개',     sub: '패스로 간격 벌리기',      tone: 'mid' },
    wide:      { label: '측면 돌파 중',  sub: '오버래핑 · 크로스 준비',  tone: 'wide' },
    final:     { label: '슈팅 찬스!',    sub: '박스 안 1:1',            tone: 'hot' },
    counterAtk:{ label: '역습 찬스!',    sub: '빠르게 전진',            tone: 'hot' },
    counterDef:{ label: '역습 위기!',    sub: '수비 라인 즉시 복귀',     tone: 'danger' },
    corner:    { label: '코너킥',        sub: '박스로 크로스',          tone: 'set' },
    fk:        { label: '프리킥',        sub: '세트피스 기회',          tone: 'set' },
    offside:   { label: '오프사이드',     sub: '상대 간접 프리킥',       tone: 'set' },
    throw:     { label: '스로인',        sub: '터치라인에서 던집니다',   tone: 'set' },
    goalkick:  { label: '골킥',          sub: '골키퍼가 차서 재개',      tone: 'build' },
    pk:        { label: '페널티킥',       sub: '키커 vs 골키퍼',         tone: 'hot' },
    red:       { label: '퇴장',          sub: '수적 열세',              tone: 'danger' },
    press:     { label: '전방 압박',     sub: '볼 탈취 시도',           tone: 'press' },
    save:      { label: 'GK 선방',       sub: '슛을 막아냅니다',         tone: 'save' },
    tactic:    { label: '전술 변경',     sub: '상대 감독의 지시',        tone: 'set' },
    goal:      { label: 'GOAL!',        sub: '골망을 흔듭니다',         tone: 'hot' }
  };

  /* ─────────────────────────  좌표 · 기본  ─────────────────────────
     시뮬레이션 좌표: y = 공격축(0 = 상대 골문, WORLD_H = 우리 골문), x = 폭(0 = 왼 터치라인).
     v7 화면은 가로 16:9 피치라서, 공격축을 화면 x(왼→오른쪽), 폭을 화면 y(먼쪽→가까운쪽)로 투영한다.
     → 홈팀은 화면 왼쪽 골대에서 오른쪽 골대로, 원정팀은 오른쪽에서 왼쪽으로 공격한다. */
  var PROJ = DS.Art.PROJ;  /* 먼 쪽 0.85배 ~ 가까운 쪽 1.12배 원근 스케일 포함 */
  var pitchImg = null;
  /* v10 — 몸통 제거, 원형 초상화 토큰 + 파랑/빨강 팀 링
     v14 — 원을 한 단계 더 축소(0.55 → 0.43): 잔디 공간·패스 레인이 넓게 보인다 */
  var TOKEN_R = 0.43;             /* 토큰 원 반지름 / SPR_H (지름 ≈ 0.86 × SPR_H) */
  /* v30 — 중계뷰에서 토큰 원을 13% 축소(0.87). 줌 1.15와 곱해져 화면상 얼굴 크기는
     v29와 같고, 선수 간 간격만 넓어진다. 전체뷰는 v29 크기(1.0). */
  var TOKEN_SCALE_BROADCAST = 0.87;
  var TOKEN_SCALE_FULL = 1.0;
  function tokenScale() { return camMode === 'full' ? TOKEN_SCALE_FULL : TOKEN_SCALE_BROADCAST; }
  var heads = {};                 /* pic 번호 → { img, ready } — 피치 원형 토큰 초상화 */
  var headLeft = 0;               /* 아직 안 끝난 두상 로드 수 — 입장 게이트 */
  var ripples = [];               /* 액션 타격감 — 바깥으로 퍼지는 원형 파동 */
  /* ═════════ v25 — 실시간 전술카드 피치 오버레이 · 캐릭터 연출 · 킥오프 세리머니 ═════════ */
  var CARD_LIST = [];             /* data.js 12종 전술카드 (fx 1:1) */
  var CARD_BY_FX = {};            /* fx → card def */
  var cardAce = {};               /* fx → 그 카드로 지정된 에이스 선수 */
  var cardHitCount = {};          /* QA — 카드별 발동 횟수 */
  var parts = [];                 /* 통합 파티클 (먼지·불꽃·색종이·별·잔상·충격파) */
  var decals = [];                /* 지면 데칼 (슬라이딩 마크) */
  var v25t = {                    /* v25 계측기 */
    spawn: 0, peak: 0, cards: 0, overlays: 0, confetti: 0,
    dive: 0, tackle: 0, save: 0, kickSwing: 0, passWave: 0, aura: 0,
    kickoff: 0, kickoffPass: 0, chain: 0, maxParts: 0
  };
  var pressChain = { n: 0, t: 0 }; /* 압박 트리거 — 연속 압박 보장 횟수 */
  var kick = null;                 /* 킥오프 세리머니 상태 */
  var firstKickSide = 'home';      /* 전반 킥오프 팀 (후반은 반대 팀) */
  var halfNo = 1;
  var shake = { t: 0, t0: 0.3, mag: 0 };   /* 슛·골·선방 순간 카메라 흔들림 */
  var flash = { t: 0, t0: 2.4, side: 'home', score: '0 : 0', name: '' };   /* 골 전광판 */
  var artGateOn = false;          /* 22명 초상화가 준비될 때까지 킥오프를 잠깐 미룬다 */
  var artGateT = 0;

  /* 월드 좌표 → 화면 좌표 (v31 — 3D 쿼터뷰 카메라 투영)
     반환값은 v30과 같은 { x, y, s, v } 형태를 유지한다. s = 기준점 대비 원근 배율. */
  var _scrOut = { x: 0, y: 0, s: 1, v: 0 };
  function scr(wx, wy) {
    var p = QV.project(wx, wy, 0);
    _scrOut.x = p.x; _scrOut.y = p.y; _scrOut.s = p.s;
    _scrOut.v = clamp(wx / WORLD_W, 0, 1);
    return _scrOut;
  }
  function depthPx(z, s) { return QV.zpx(z, s || 1); }

  /* ── 원형 토큰 초상화 (두상 PNG · 얼굴 중심 크롭) ── */
  function loadHead(p) {
    var n = (p && p.player && p.player.pic) ? p.player.pic : 1;
    var rec = heads[n];
    if (rec) { return rec; }
    rec = { img: new global.Image(), ready: false, fx: 0.5 };
    heads[n] = rec;
    headLeft++;
    rec.img.onload = function () {
      rec.ready = Math.max(rec.img.naturalWidth || 0, rec.img.width || 0) > 0;
      rec.fx = headFocusX(rec.img);
      headLeft--;
    };
    rec.img.onerror = function () { rec.ready = false; headLeft--; };
    rec.img.src = 'assets/portraits/head/p' + (n < 10 ? '0' + n : n) + '.png';
    return rec;
  }
  /* 두상 이미지의 '머리' 가로 중심을 알파로 찾는다 — 팔·몸통이 섞인 그림도 얼굴이 원 가운데 오도록.
     캔버스를 못 쓰는 환경(헤드리스 검증)에서는 0.5로 폴백한다. */
  function headFocusX(img) {
    try {
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      if (!iw || !ih) { return 0.5; }
      var c = global.document.createElement('canvas');
      var k = Math.min(1, 96 / iw);
      c.width = Math.max(8, Math.round(iw * k));
      c.height = Math.max(8, Math.round(ih * k));
      var g2 = c.getContext('2d');
      if (!g2) { return 0.5; }
      g2.drawImage(img, 0, 0, c.width, c.height);
      var data = g2.getImageData(0, 0, c.width, c.height).data;
      if (!data || !data.length) { return 0.5; }
      /* 위에서부터 알파가 처음 나타나는 줄 = 머리 꼭대기, 그 아래 머리카락 띠의 가로 무게중심 */
      var y, x, top = -1, sum = 0, wsum = 0, bandEnd;
      for (y = 0; y < c.height; y++) {
        for (x = 0; x < c.width; x++) {
          if (data[(y * c.width + x) * 4 + 3] > 40) { top = y; break; }
        }
        if (top >= 0) { break; }
      }
      if (top < 0) { return 0.5; }
      bandEnd = Math.min(c.height, top + Math.max(3, Math.round(c.height * 0.22)));
      for (y = top; y < bandEnd; y++) {
        for (x = 0; x < c.width; x++) {
          var a = data[(y * c.width + x) * 4 + 3];
          if (a > 40) { sum += x * a; wsum += a; }
        }
      }
      if (wsum <= 0) { return 0.5; }
      return clamp((sum / wsum) / c.width, 0.2, 0.8);
    } catch (e) { return 0.5; }
  }
  /* 액션 타격감 — 토큰 바깥으로 퍼지는 원형 파동 */
  function fxRing(p, color, size) {
    if (!p) { return; }
    ripples.push({ x: p.x, y: p.y, t: 0, t0: 0.52, color: color || '#ffffff', k: size || 1 });
    if (ripples.length > 26) { ripples.shift(); }
  }
  function fxPop(p, dur) {
    if (!p) { return; }
    p.popT = Math.max(p.popT || 0, dur || 0.3);
    p.popT0 = p.popT;
  }
  /* 카메라 흔들림 — 세기와 시간 */
  function kickCam(mag, dur) {
    shake.mag = Math.max(shake.mag, mag);
    shake.t = Math.max(shake.t, dur || 0.24);
    shake.t0 = shake.t;
  }

  /* ───────────── v17 방송 카메라 ─────────────
     공을 따라 부드럽게 패닝하고, 찬스(박스 진입·슈팅·코너·PK·골) 순간에는 골문 쪽으로
     1.15~1.24배 줌인했다가 상황이 끝나면 기본 프레임으로 돌아온다.
     화면 밖으로 잘리지 않도록 초점을 항상 '보이는 사각형' 안으로 클램프한다. */
  function goalMouthPt(side) {
    return scr(50, side === 'home' ? 3.5 : WORLD_H - 3.5);
  }
  function camClampToView() { /* v31 — 클램프는 DS.Q 쪽에서 처리한다 */ }
  /* v30 — 공 추적 카메라. 화면 좌표를 Lerp(프레임당 0.08 ≈ exp(-5.0·dt))로 부드럽게 따라가고,
     찬스(박스 25m 이내·슈팅·세트피스·골)에만 1.20~1.26배로 미세 줌인한다.
     클램프로 화면 밖 빈 공간(검은 여백)은 절대 드러나지 않는다. */
  function ballChanceZoom() {
    var dGoal = Math.min(ball.y, WORLD_H - ball.y);
    if (ball.kind === 'shot' && ball.shot) { return true; }
    if (play.phase === 'goal' || play.phase === 'setpiece') { return true; }
    if (dGoal < 25) { return true; }
    if (play.stage === 'final' || play.counterT > 0) { return true; }
    return false;
  }
  /* v31 — 공 추적 다이내믹 중계 카메라 (3D 쿼터뷰)
     · 공의 월드 좌표를 Lerp 로 부드럽게 따라가고, 진행 방향으로 살짝 리드한다.
     · 박스 진입·슈팅·세트피스·골 순간에는 골문 쪽으로 붙으며 거리를 좁혀(줌인) 찬스를 키운다.
     · 전체뷰는 피치 전체가 들어오도록 거리를 멀리 뺀다. */
  function camTargetY() { return play.phase === 'goal' && cel && cel.scorer ? cel.scorer.y : ball.y; }
  function updateCamera(dt) {
    var lead = clamp(-(ball.vy || 0) * 0.42, -7.5, 7.5);   /* +X(상대 골문) 방향 리드 */
    if (camMode === 'full') {
      QV.focus(50, 60, CAM_D_FULL, dt, 0);
      return;
    }
    var bx = ball.x, by = ball.y, dist = CAM_D_BASE;
    var attackedY = ball.y < WORLD_H / 2 ? 0 : WORLD_H;    /* 지금 공격하는 골문 */
    if (play.phase === 'goal' && cel && cel.scorer) {
      bx = cel.scorer.x * 0.45 + bx * 0.55;
      by = cel.scorer.y * 0.45 + by * 0.55;
      dist = CAM_D_GOAL;
    } else if (ballChanceZoom()) {
      dist = CAM_D_CHANCE;
      by = by * 0.80 + attackedY * 0.20;
      bx = bx * 0.86 + 50 * 0.14;
    }
    if (play.phase === 'setpiece' && play.setpiece && (play.setpiece.type === 'pk' || play.setpiece.type === 'corner')) {
      dist = CAM_D_CHANCE - 4;
    } else if (ball.kind === 'shot' && ball.shot) {
      dist = CAM_D_CHANCE - 2;
    }
    QV.focus(bx, by, dist, dt, lead);
  }
  function resetCamera() {
    var d = camMode === 'full' ? CAM_D_FULL : CAM_D_BASE;
    QV.setMode(camMode);
    QV.snap(camMode === 'full' ? 50 : ball.x, camMode === 'full' ? 60 : ball.y, d);
  }

  /* v27 — 골 세리머니가 끝나면 곧바로 킥오프로 복귀한다.
     (v17의 3초 골 리플레이/하이라이트 오버레이는 사용자 요청으로 완전히 제거했다) */
  function finishCelebration() {
    goalStage = null; cel = null;
    bannerT = 0;
    /* v30 — 세리머니 → 킥오프 사이에 짧은 암전 전환 (갑자기 끊기지 않게) */
    fadeFx = { t: 0.46, t0: 0.46 };
    var el = document.getElementById('m-banner');
    if (el) { el.classList.remove('on'); }
    resetKickoff(lastScorerSide === 'home' ? 'away' : 'home');
    acc = 0; lastT = 0;
  }

  /* ───────────── v17 관중석 (플래시 · 깃발 · 파도) ───────────── */
  function crowdUp(v) { crowd.energy = clamp(crowd.energy + v, 0, 1); }
  function spawnFlash() {
    if (crowd.flashes.length > 44) { return; }
    var top = Math.random() < 0.62;
    crowd.flashes.push({
      x: Math.random() * W,
      y: top ? 2 + Math.random() * Math.max(8, H * 0.115) : H - 2 - Math.random() * Math.max(8, H * 0.115),
      t: 0, t0: 0.30 + Math.random() * 0.34, r: 1.1 + Math.random() * 1.7
    });
  }
  function crowdTick(dt) {
    var floor = (play.stage === 'final' || ball.kind === 'shot' || play.phase === 'setpiece') ? 0.34 : 0;
    crowd.energy = Math.max(0, crowd.energy - dt * 0.32);
    if (crowd.energy < floor) { crowd.energy = Math.min(floor, crowd.energy + dt * 1.9); }
    crowd.wave += dt;
    if (crowd.energy > 0.16) {
      crowd.acc += dt * (2 + crowd.energy * 30);
      while (crowd.acc >= 1) { crowd.acc -= 1; spawnFlash(); }
    }
    var i;
    for (i = crowd.flashes.length - 1; i >= 0; i--) {
      crowd.flashes[i].t += dt;
      if (crowd.flashes[i].t >= crowd.flashes[i].t0) { crowd.flashes.splice(i, 1); }
    }
  }

  /* ═════════ v17 경기장 사운드 (Web Audio 합성) ═════════
     외부 mp3 없이 노이즈·필터·엔벨로프로 만든다. 삑삑거리는 순수 사인 대신
     대역 필터를 건 노이즈와 낮은 몸통음을 섞어 실제 경기장 울림에 가깝게 설계했다.
     모바일 자동재생 정책 때문에 AudioContext는 첫 사용자 터치(킥오프)에서 열린다. */
  var SND = (function () {
    var A = null, master = null, ready = false, muted = false;
    var ambSrc = null, ambGain = null, amb2Src = null;
    var matchOn = false;                     /* v26 — 경기 중에만 관중 앰비언스 */
    /* v26 BGM — 컷인·휘슬·골 순간에 배경음만 잠깐 낮춘다(효과음이 또렷하게) */
    function bgm(fn, a) {
      try { if (global.DS && global.DS.Bgm && global.DS.Bgm[fn]) { global.DS.Bgm[fn](a); } } catch (e) { /* 무시 */ }
    }
    var nbuf = null, lastKick = 0, lastPass = 0, lastWhistle = 0;
    try { muted = !!(global.localStorage && global.localStorage.getItem('dot-soccer-mute') === '1'); } catch (e) { muted = false; }

    function noiseBuf() {
      if (nbuf || !A) { return nbuf; }
      var n = Math.floor(A.sampleRate * 2),
        i, w, last = 0;
      nbuf = A.createBuffer(1, n, A.sampleRate);
      var d = nbuf.getChannelData(0);
      for (i = 0; i < n; i++) {
        w = Math.random() * 2 - 1;
        last = last * 0.86 + w * 0.14;          /* 한 극 저역통과 — 갈색 잡음에 가까운 관중 웅성거림 */
        d[i] = last * 2.4 + w * 0.16;
      }
      return nbuf;
    }
    function init() {
      if (A) { resume(); return A; }
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { return null; }
      try { A = new AC(); } catch (e1) { A = null; return null; }
      master = A.createGain();
      master.gain.value = muted ? 0 : 0.85;
      master.connect(A.destination);
      ready = true;
      resume();
      return A;
    }
    function resume() {
      if (!A) { return; }
      if (A.state === 'suspended' && A.resume) {
        try { var pr = A.resume(); if (pr && pr['catch']) { pr['catch'](function () {}); } } catch (e) { /* 무시 */ }
      }
    }
    function ambientOn() {
      if (!ready || ambSrc) { return; }
      try {
        ambSrc = A.createBufferSource();
        ambSrc.buffer = noiseBuf(); ambSrc.loop = true;
        var lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.6;
        ambGain = A.createGain(); ambGain.gain.value = 0.0;
        ambSrc.connect(lp); lp.connect(ambGain); ambGain.connect(master);
        ambSrc.start(0);
        ambGain.gain.setValueAtTime(0.0, A.currentTime);
        ambGain.gain.linearRampToValueAtTime(0.30, A.currentTime + 2.2);
        /* 아주 느린 숨쉬기 — 관중석이 살아 있게 */
        var lfo = A.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.09;
        var lg = A.createGain(); lg.gain.value = 0.07;
        lfo.connect(lg); lg.connect(ambGain.gain); lfo.start(0);
        amb2Src = A.createBufferSource();
        amb2Src.buffer = noiseBuf(); amb2Src.loop = true;
        var hp = A.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
        var g2 = A.createGain(); g2.gain.value = 0.05;
        amb2Src.connect(hp); hp.connect(g2); g2.connect(master);
        amb2Src.start(0, 0.6);
      } catch (e) { /* 오디오 미지원 */ }
    }
    function ambientOff() {
      try {
        if (ambSrc) { ambSrc.stop(0); ambSrc.disconnect(); ambSrc = null; }
        if (amb2Src) { amb2Src.stop(0); amb2Src.disconnect(); amb2Src = null; }
        if (ambGain) { ambGain.disconnect(); ambGain = null; }
      } catch (e) { /* 무시 */ }
    }
    function g2(dest) { var n = A.createGain(); n.connect(dest || master); return n; }

    /* 주심 휘슬 — 두 사인 + 비브라토 + 노이즈 퍼프 */
    function whistle(kind) {
      if (!ready || muted) { return; }
      var now = A.currentTime;
      if (now - lastWhistle < 0.18) { return; }
      lastWhistle = now;
      bgm('duck', kind === 'long' ? 1700 : 750);
      var blasts = kind === 'long' ? 3 : 1;
      var dur = kind === 'long' ? 0.24 : 0.34;
      for (var n = 0; n < blasts; n++) {
        var t = now + n * (dur + 0.10);
        var out = g2(), bp = A.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 1.1;
        bp.connect(out);
        var o1 = A.createOscillator(), o2 = A.createOscillator();
        o1.type = 'sine'; o1.frequency.value = 2080;
        o2.type = 'triangle'; o2.frequency.value = 2860;
        var lfo = A.createOscillator(), lg = A.createGain();
        lfo.type = 'sine'; lfo.frequency.value = 27; lg.gain.value = 105;
        lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
        var ns = A.createBufferSource(); ns.buffer = noiseBuf();
        var nf = A.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3000; nf.Q.value = 0.8;
        var ng = A.createGain(); ng.gain.value = 0.10;
        ns.connect(nf); nf.connect(ng); ng.connect(out);
        out.gain.setValueAtTime(0.0001, t);
        out.gain.exponentialRampToValueAtTime(0.20, t + 0.02);
        out.gain.setValueAtTime(0.20, t + dur * 0.72);
        out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o1.connect(bp); o2.connect(bp);
        o1.start(t); o2.start(t); lfo.start(t); ns.start(t);
        o1.stop(t + dur + 0.02); o2.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02); ns.stop(t + dur + 0.02);
      }
    }
    /* 공 차기 — 낮은 몸통음 + 필터드 노이즈 (강도별) */
    function kick(strength) {
      if (!ready || muted) { return; }
      var now = A.currentTime;
      var s = clamp(strength === undefined ? 0.6 : strength, 0, 1.2);
      if (now - lastKick < 0.05) { return; }
      lastKick = now;
      var o = A.createOscillator(), g = g2();
      o.type = 'sine';
      o.frequency.setValueAtTime(118 - s * 34, now);
      o.frequency.exponentialRampToValueAtTime(58, now + 0.13);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.34 + s * 0.30, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16 + s * 0.10);
      o.connect(g); o.start(now); o.stop(now + 0.42);
      var ns = A.createBufferSource(); ns.buffer = noiseBuf();
      var nf = A.createBiquadFilter(); nf.type = 'bandpass';
      nf.frequency.value = 1150 + s * 950; nf.Q.value = 0.9;
      var ng = g2();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(0.12 + s * 0.22, now + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
      ns.connect(nf); nf.connect(ng);
      ns.start(now); ns.stop(now + 0.13);
    }
    function pass() {
      if (!ready || muted || !A) { return; }
      var now = A.currentTime;
      if (now - lastPass < 0.10) { return; }
      lastPass = now;
      kick(0.22);
    }
    /* 골포스트·크로스바 팅 */
    function post() {
      if (!ready || muted) { return; }
      var now = A.currentTime, i, fr = [1046, 1568, 2093];
      for (i = 0; i < fr.length; i++) {
        var o = A.createOscillator(), g = g2();
        o.type = 'sine'; o.frequency.value = fr[i];
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.16 / (i + 1), now + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55 - i * 0.12);
        o.connect(g); o.start(now); o.stop(now + 0.6);
      }
    }
    /* 관중 함성 — 대역 필터를 위로 쓸어 올리는 노이즈 */
    function cheer(level, dur) {
      if (!ready || muted) { return; }
      var now = A.currentTime;
      var s = clamp(level === undefined ? 0.6 : level, 0, 1);
      var d = dur || (0.8 + s * 1.4);
      bgm('duck', d * 1000);
      var ns = A.createBufferSource(); ns.buffer = noiseBuf();
      var bp = A.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.setValueAtTime(380 + s * 180, now);
      bp.frequency.exponentialRampToValueAtTime(900 + s * 900, now + d * 0.55);
      bp.Q.value = 0.55;
      var g = g2();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.10 + s * 0.34, now + 0.12 + s * 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d);
      ns.connect(bp); bp.connect(g);
      ns.start(now); ns.stop(now + d + 0.05);
      /* 낮은 웅장한 층 */
      var ns2 = A.createBufferSource(); ns2.buffer = noiseBuf();
      var lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      var g3 = g2(); g3.gain.setValueAtTime(0.0001, now);
      g3.gain.exponentialRampToValueAtTime(0.12 + s * 0.26, now + 0.14);
      g3.gain.exponentialRampToValueAtTime(0.0001, now + d * 0.95);
      ns2.connect(lp); lp.connect(g3);
      ns2.start(now, 0.3); ns2.stop(now + d + 0.05);
    }
    /* 아쉬운 탄식 — 내려가는 노이즈 + 낮은 목소리 */
    function groan() {
      if (!ready || muted) { return; }
      var now = A.currentTime;
      bgm('duck', 1100);
      var ns = A.createBufferSource(); ns.buffer = noiseBuf();
      var lp = A.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(760, now);
      lp.frequency.exponentialRampToValueAtTime(240, now + 0.85);
      var g = g2();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.20, now + 0.10);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
      ns.connect(lp); lp.connect(g);
      ns.start(now); ns.stop(now + 1.0);
      var o = A.createOscillator(), og = g2();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(168, now);
      o.frequency.exponentialRampToValueAtTime(96, now + 0.80);
      var of = A.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 420;
      og.gain.setValueAtTime(0.0001, now);
      og.gain.exponentialRampToValueAtTime(0.055, now + 0.12);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.90);
      o.connect(of); of.connect(og); o.start(now); o.stop(now + 0.95);
    }
    function tackle() { kick(0.34); }
    function setMuted(v) {
      muted = !!v;
      try { global.localStorage.setItem('dot-soccer-mute', muted ? '1' : '0'); } catch (e) { /* 무시 */ }
      if (master) { master.gain.value = muted ? 0 : 0.85; }
      /* v26 — 음소거 해제 시 로비에서 관중 소리가 터지지 않게, 경기 중일 때만 앰비언스를 켠다 */
      if (!muted) { init(); if (matchOn) { ambientOn(); } }
      bgm('refreshMute');
      return muted;
    }
    return {
      init: init, resume: resume, ambientOn: ambientOn, ambientOff: ambientOff,
      whistle: whistle, kick: kick, pass: pass, post: post, cheer: cheer, groan: groan,
      tackle: tackle, setMuted: setMuted,
      matchOn: function (v) { matchOn = !!v; },
      bus: function () { return (ready && A) ? { ctx: A, dest: master } : null; },
      isMuted: function () { return muted; },
      isReady: function () { return ready; }
    };
  })();

  function goalDir(side) { return side === 'home' ? -1 : 1; }        /* 공격 방향 y */
  /* v18 — 화면 좌표 헬퍼. 원정팀 슬롯은 baseX가 미러링되어 있어(원정 'LWF' = 화면 오른쪽)
     포지션 이름으로 화면 x를 지정하던 v17 코드가 원정팀만 반대편으로 꺾였다. */
  function sideX(p, x) { return p.side === 'home' ? x : WORLD_W - x; }
  function isLeftLane(p) { return p.baseX < 50; }
  function ownGoalY(side) { return side === 'home' ? WORLD_H : 0; }
  function attackGoalY(side) { return side === 'home' ? 0 : WORLD_H; }
  function progressOf(side, y) { return side === 'home' ? (WORLD_H - y) / WORLD_H : y / WORLD_H; }
  function short(n) { return n && n.length > 3 ? n.slice(1) : n; }
  /* ── 선수 모션 포즈 ── */
  function setPose(p, name, dur) {
    if (!p) { return; }
    if (p.pose === name && p.poseT > dur * 0.5) { return; }
    p.pose = name;
    p.poseT = dur;
  }
  function poseOf(p) {
    if (isGK(p) && p.diveT > 0.05) { return 'dive'; }
    if (p.poseT > 0 && p.pose) { return p.pose; }
    if (ball.carrier === p) { return p.moving ? 'dribble' : 'idle'; }
    return p.moving ? 'run' : 'idle';
  }
  function d2(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function isGK(p) { return p.pos === 'GK'; }
  function groupOf(p) { return DS.posGroup(p.pos); }
  function isDefGroup(p) { return groupOf(p) === 'DF'; }
  function isMidGroup(p) { return groupOf(p) === 'MF'; }
  function isFwdGroup(p) { return groupOf(p) === 'FW'; }

  /* ─────────────────────────  v20 ② — 포지션 · 현대 롤 · 주발  ─────────────────────────
     data.js의 13개 현대 포지션 · 11종 롤 · 주발(왼발/오른발/양발)을 실제 피치 움직임으로 옮긴다.
     · 인버티드 윙어(주발이 반대 측면)는 하프스페이스로 접어 들어와 강한 발로 슈팅
     · 전통 윙어·윙백은 폭을 지키고 오버래핑 → 크로스
     · 레지스타/볼플레잉 수비수(DM)은 빌드업 때 CB 사이로 내려와 안전한 전진 패스 각
     · B2B·메짤라는 공이 최종 3분의 1에 들어오면 늦게 박스로 쇄도
     · CF(폴스나인)는 라인 사이로 내려와 연결, ST는 CB를 붙잡고 뒷공간을 노린다 */
  function footSideOf(p) {
    var f = p.foot || (p.player && p.player.foot) || '오른발';
    return f === '왼발' ? 'L' : (f === '오른발' ? 'R' : 'B');
  }
  function posSideOf(p) {
    var c = p.pos ? p.pos.charAt(0) : '';
    return c === 'L' ? 'L' : (c === 'R' ? 'R' : '');
  }
  function mroleOf(p) { return (p.player && p.player.role) || ''; }
  function isWingerPos(p) { return p.pos === 'LWF' || p.pos === 'RWF'; }
  function isWingbackPos(p) { return p.pos === 'LWB' || p.pos === 'RWB'; }
  /* 인버티드 윙어 — 롤이 '인버티드'이거나, 주발이 자기 측면의 반대 발인 윙어 */
  function isInverted(p) {
    if (!isWingerPos(p)) { return false; }
    if (mroleOf(p) === 'inverted') { return true; }
    var fs = footSideOf(p), ps = posSideOf(p);
    if (fs === 'B' || !ps) { return false; }
    return fs !== ps;
  }
  function isTraditionalWinger(p) { return isWingerPos(p) && !isInverted(p); }

  function goalkeeper(side) {
    var i;
    for (i = 0; i < players.length; i++) {
      if (players[i].side === side && isGK(players[i]) && !players[i].off) { return players[i]; }
    }
    return null;
  }
  function nearestOpponent(p, maxDist) {
    var best = null, bd = maxDist || 999, i, q, d;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.side === p.side || q.off) { continue; }
      d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; best = q; }
    }
    return { player: best, dist: bd };
  }
  function nearestToBall(side, maxD) {
    var best = null, bd = maxD || 999, i, d;
    for (i = 0; i < players.length; i++) {
      if (players[i].side !== side || players[i].off) { continue; }
      d = Math.hypot(players[i].x - ball.x, players[i].y - ball.y);
      if (d < bd) { bd = d; best = players[i]; }
    }
    return best;
  }
  /* 화면 픽셀 기준 가장 가까운 상대 — 토큰 크기로 재야 '붙어 있다'가 맞는다 */
  function nearestOpponentPx(p, maxPx) {
    var best = null, bd = maxPx || 999, i, q, d;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.side === p.side || q.off) { continue; }
      d = pxDist(q.x, q.y, p.x, p.y);
      if (d < bd) { bd = d; best = q; }
    }
    return { player: best, dist: bd };
  }
  function tacklePx() { return 2 * SPR_H * TOKEN_R * 1.30; }
  function defLineY(side) {
    var sum = 0, n = 0, i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side === side && isDefGroup(p) && !p.off) { sum += p.y; n++; }
    }
    return n ? sum / n : (side === 'home' ? 100 : 20);
  }

  /* ── 전술 형태 (v10) ──
     수비 = 두 줄 수비 블록(DF·MF 간격 9~10, 폭 축소, 라인 하강)
     공격 = 라인 상승 · 풀백/윙백 오버래핑 · 2선 침투 · 침투 러닝 2명 동시 · 높은 압박
     → 같은 포메이션이라도 전술을 바꾸면 피치 위 대형이 눈에 띄게 달라진다. */
  function shapeOf(side) {
    var t = effTactic(side);
    if (t === 'defense') {
      return { name: 'defense', bank: 9.4, bankW: 0.80, width: 0.84, press: -12, runs: 1, runMin: 3.0, runMax: 5.6, fbPush: 2, secondLine: 0 };
    }
    if (t === 'attack') {
      return { name: 'attack', bank: 16.2, bankW: 0.22, width: 1.10, press: 12, runs: 2, runMin: 1.1, runMax: 2.5, fbPush: 16, secondLine: 1 };
    }
    if (t === 'allout') {
      return { name: 'allout', bank: 20.4, bankW: 0.14, width: 1.18, press: 22, runs: 3, runMin: 0.9, runMax: 2.1, fbPush: 24, secondLine: 1.35 };
    }
    return { name: 'balanced', bank: 12.6, bankW: 0.42, width: 1.0, press: 0, runs: 1, runMin: 2.0, runMax: 4.2, fbPush: 8, secondLine: 0.45 };
  }
  /* 두 줄 블록의 기준선 — 수비 라인 바로 앞에 중원 라인을 세운다 */
  function bankYOf(side, group) {
    var sh = shapeOf(side);
    var df = lineYOf(side);
    var dir = goalDir(side);            /* 공격 방향 */
    /* v14 — 감독 전술: 더블 볼란테·역습형은 두 줄 간격을 좁혀 컴팩트 블록 */
    /* v25 ② — 줄 간격을 조금 넓혀 블록이 세 줄로 또렷하게 서고, 볼 주변에 인원이 몰리는 체감을 줄인다 */
    var bank = Math.max(8.2, (sh.bank + (styleOf(side).blockBank - 12.6)) * 1.16);
    if (group === 'MF') { return df + dir * bank; }
    if (group === 'FW') { return df + dir * (bank * 2.18 + (styleOf(side).fwStay || 0)); }
    return df;
  }

  /* ── 팀 형태: 포메이션 지표 + 전술 + 카드가 실제 라인·압박·폭을 바꾼다 ── */
  function formationOf(side) {
    return side === 'home' ? ((cfg && cfg.homeFormation) || '4-2-3-1')
      : ((cfg && cfg.awayFormation) || '4-4-2');
  }
  function metricsOf(side) {
    if (side === 'home' && homeMetrics) { return homeMetrics; }
    var f = DS.FORMATIONS[formationOf(side)];
    return (f && f.metrics) || { press: 70, line: 65, width: 70, tempo: 70 };
  }
  function buildHomeMetrics(key) {
    var f = DS.FORMATIONS[key] || DS.FORMATIONS['4-2-3-1'];
    var m = f.metrics;
    var t = DS.managerTune ? DS.managerTune(mgrFx) : { press: 0, line: 0, width: 0, tempo: 0 };
    homeMetrics = {
      press: clamp(m.press + t.press, 20, 99),
      line: clamp(m.line + t.line, 20, 99),
      width: clamp(m.width + t.width, 20, 99),
      tempo: clamp(m.tempo + t.tempo, 20, 99)
    };
    return homeMetrics;
  }
  /* ── v14 감독 전술 철학: 감독마다 피치 위 움직임이 실제로 달라진다 ── */
  function styleKeyOf(side) {
    return (side === 'home' ? (cfg && cfg.homeTacticStyle) : (cfg && cfg.awayTacticStyle)) || 'balanced';
  }
  function styleOf(side) { return DS.tacticStyle(styleKeyOf(side)); }
  /* v19 ② — 그 팀에 지금 적용되는 전술 버튼.
     홈은 사용자가 누르는 수비/균형/공격, 원정은 AI 감독이 경기 중에 바꾸는 포스처. */
  /* 홈팀은 터치라인 지시(성향)가 곧 전술 형태다. setTactics(수비/균형/공격)도 같은 값을 쓴다. */
  function effTactic(side) {
    return side === 'home' ? (TOUCH_SHAPE[touch.mentality] || 'balanced') : aiPosture;
  }
  function morphOf(side) {
    var f = DS.FORMATIONS[formationOf(side)];
    return (f && f.morph) || null;
  }
  function dfBaseAvg(side) {
    var sum = 0, n = 0, i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side === side && isDefGroup(p) && !p.off) { sum += p.baseY; n++; }
    }
    return n ? sum / n : (side === 'home' ? 100 : 20);
  }
  /* 그 팀 수비 라인의 월드 y — 포메이션 line 지표 · 전술 · 카드에 따라 달라진다
     v25c (M3) — noTrap을 주면 오프사이드 트랩의 +6을 빼고 계산한다(공격 대형 계산용). */
  function lineYOf(side, noTrap) {
    var m = metricsOf(side);
    var stl = styleOf(side);
    var depth = 12 + m.line * 0.44 + stl.line;
    var t = effTactic(side);
    if (t === 'attack') { depth += 10; }
    else if (t === 'allout') { depth += 17; }
    else if (t === 'defense') { depth -= 12; }
    /* v20 ① — 수비 라인 지시(내리기/표준/올리기)는 홈팀 라인·블록 높이를 직접 민다 */
    if (side === 'home') { depth += TOUCH_LINE[touch.line] || 0; }
    if (side === 'home' && buffOf('offside') > 0 && !noTrap) { depth += 6; }
    if (side === 'home' && buffOf('press') > 0) { depth += 5; }
    if (side === 'home' && buffOf('def') > 0) { depth -= 6; }
    if (play.counterT > 0 && play.counterSide !== side) { depth -= 6; }
    if (play.recoverT > 0 && play.recoverSide === side) { depth -= 4; }
    depth = clamp(depth, 5, 62);
    return ownGoalY(side) + (side === 'home' ? -depth : depth);
  }
  function blockShift(side) { return lineYOf(side) - dfBaseAvg(side); }
  function anchorOf(p) {
    var w = isDefGroup(p) ? 1 : (isMidGroup(p) ? 0.86 : 0.72);
    var ax = p.baseX;
    /* v25c (M3) — 오프사이드 트랩은 '수비 라인'을 올리는 카드다.
       최전방(그리고 우리가 공을 가진 순간의 중원)까지 같이 밀면, 상대 수비 라인을
       이미 넘어선 자리에서 패스를 받아 우리 팀 오프사이드가 3~4배로 늘었다. */
    var noTrap = false;
    if (p.side === 'home' && buffOf('offside') > 0) {
      if (!isDefGroup(p) && !isMidGroup(p)) { noTrap = true; }
      else if (isMidGroup(p) && ball.carrier && ball.carrier.side === 'home') { noTrap = true; }
    }
    var ay = p.baseY + (lineYOf(p.side, noTrap) - dfBaseAvg(p.side)) * w;
    /* v14 변칙 포메이션 — 공격 중에는 기본 대형 자체가 변한다 */
    var mo = morphOf(p.side);
    if (mo && ball.carrier && ball.carrier.side === p.side) {
      var dirM = goalDir(p.side);
      if (mo.boxMid > 0 && p.pos === 'DM') {
        ax = 50 + (ax - 50) * (1 - 0.55 * mo.boxMid);
        ay -= dirM * 4.5 * mo.boxMid;
      }
      if (mo.wbUp > 0 && (p.pos === 'LWB' || p.pos === 'RWB')) {
        ay -= dirM * 10 * mo.wbUp;
      }
      if (mo.wingHigh > 0 && (p.pos === 'LWF' || p.pos === 'RWF')) {
        ay -= dirM * 4;
      }
      if (mo.fbIn > 0 && (p.pos === 'LB' || p.pos === 'RB')) {
        ax = 50 + (ax - 50) * (1 - 0.28 * mo.fbIn);
      }
    }
    return { x: ax, y: ay };
  }
  /* 압박 인원 · 반경 — press 지표와 게겐프레싱 카드로 확대 */
  function pressConfig(side) {
    var m = metricsOf(side);
    var stl = styleOf(side);
    var press = m.press + stl.press;
    press += shapeOf(side).press;
    if (side === 'home') {
      if (buffOf('press') > 0) { press += 26; }
      press += mfx('press') * 1.2;
      /* v20 ① — 압박 강도 지시: 트리거 반경과 붙는 인원이 함께 달라진다 */
      press += TOUCH_PRESSURE[touch.pressing] || 0;
    }
    /* v18 ② — 존 디펜스: 공 소유자에게 붙는 인원은 최대 2명(압박 1 + 커버 1).
       v20 — 홈이 '총공세 + 전방 압박'을 직접 지시했을 때만 3명까지 허용한다. */
    var n = press >= 62 ? 2 : 1;
    if (side === 'home' && touch.mentality === 'allout' && touch.pressing === 'high') { n = 3; }
    return { n: Math.min(3, n), radius: 8.2 + press * 0.165, press: press };
  }

  /* ─────────────────────────  포지션 구역 · 생성  ───────────────────────── */
  function zoneFor(pos, by, side) {
    var d = side === 'home' ? -1 : 1;
    var fwd = 8, back = 8, xl = 6, xr = 94;
    if (pos === 'GK') { fwd = 5; back = 2; xl = 38; xr = 62; }
    else if (pos === 'CB') { fwd = 11; back = 8; xl = 12; xr = 88; }
    else if (pos === 'LB') { fwd = 17; back = 9; xl = 2; xr = 46; }
    else if (pos === 'RB') { fwd = 17; back = 9; xl = 54; xr = 98; }
    else if (pos === 'LWB') { fwd = 27; back = 12; xl = 2; xr = 40; }
    else if (pos === 'RWB') { fwd = 27; back = 12; xl = 60; xr = 98; }
    else if (pos === 'DM') { fwd = 15; back = 10; xl = 22; xr = 78; }
    else if (pos === 'CM') { fwd = 19; back = 13; xl = 10; xr = 90; }
    else if (pos === 'AM') { fwd = 21; back = 14; xl = 14; xr = 86; }
    else if (pos === 'LWF') { fwd = 23; back = 10; xl = 2; xr = 42; }
    else if (pos === 'RWF') { fwd = 23; back = 10; xl = 58; xr = 98; }
    else { fwd = 21; back = 11; xl = 24; xr = 76; }
    var yMin = d < 0 ? by - fwd : by - back;
    var yMax = d < 0 ? by + back : by + fwd;
    /* v18 — 존의 좌우 범위도 원정팀은 미러링한다 (원정 풀백이 중앙으로 찌그러지던 버그) */
    if (side === 'away') { var xsw = xl; xl = WORLD_W - xr; xr = WORLD_W - xsw; }
    return {
      yMin: clamp(yMin, 3, WORLD_H - 3), yMax: clamp(yMax, 3, WORLD_H - 3),
      xMin: xl, xMax: xr, fwd: fwd, back: back, dir: d
    };
  }

  /* v16 — 기본 위치(포메이션 슬롯)가 미러링으로 겹치면 두 선수가 영원히 한 점에서 싸운다.
     킥오프 직전에 기본 좌표만 한 번 떼어 놓도로 민다 (경기 중 위치는 그대로 둔다). */
  function relaxBases() {
    var i, j, a, b, dx, dy, rt, sx, sy, dpx, minPx, push, ux, uy, sa, sb, pass;
    for (pass = 0; pass < 6; pass++) {
      for (i = 0; i < players.length; i++) {
        a = players[i];
        for (j = i + 1; j < players.length; j++) {
          b = players[j];
          dx = b.baseX - a.baseX; dy = b.baseY - a.baseY;
          rt = sepRates(clamp((a.baseX + b.baseX) / 2 / WORLD_W, 0, 1));
          sx = -dy * rt.ky; sy = dx * rt.kx;
          dpx = Math.hypot(sx, sy);
          sa = PROJ.s0 + (PROJ.s1 - PROJ.s0) * clamp(a.baseX / WORLD_W, 0, 1);
          sb = PROJ.s0 + (PROJ.s1 - PROJ.s0) * clamp(b.baseX / WORLD_W, 0, 1);
          minPx = 2 * SPR_H * TOKEN_R * (sa + sb) / 2 * SEP_K;
          if (dpx < 0.0001) {
            dx = 0.45 * (i % 2 ? 1 : -1); dy = 0.7 * (j % 2 ? 1 : -1);
            sx = -dy * rt.ky; sy = dx * rt.kx; dpx = Math.hypot(sx, sy);
          }
          if (dpx < minPx) {
            push = (minPx - dpx) * 0.5;
            ux = sx / dpx; uy = sy / dpx;
            a.baseX = clamp(a.baseX - (uy * push) / rt.kx, 3, WORLD_W - 3);
            a.baseY = clamp(a.baseY + (ux * push) / rt.ky, 3, WORLD_H - 3);
            b.baseX = clamp(b.baseX + (uy * push) / rt.kx, 3, WORLD_W - 3);
            b.baseY = clamp(b.baseY - (ux * push) / rt.ky, 3, WORLD_H - 3);
          }
        }
      }
    }
    for (i = 0; i < players.length; i++) {
      players[i].homeX = players[i].baseX;
      players[i].homeY = players[i].baseY;
    }
  }

  function mkPlayer(side, player, kit, role, pos, x, y) {
    var bx = side === 'home' ? x : 100 - x;
    var by = side === 'home' ? y * 1.2 : WORLD_H - y * 1.2;
    return {
      side: side, player: player, kit: kit, role: role, pos: pos,
      baseX: bx, baseY: by, x: bx, y: by, px: bx, py: by, tx: bx, ty: by,
      vx: 0, vy: 0, phase: Math.random() * 4, frame: 0,
      pose: null, poseT: 0, lean: 0, speed: 0,
      facing: side === 'home' ? 1 : -1, diveT: 0, diveDir: 1, stun: 0,
      goals: 0, assists: 0, yellows: 0, name: player.name, off: false,
      moving: false, glow: 0, skillT: 0, bubble: null, throughRun: null,
      popT: 0, popT0: 0.3,
      support: null, runTo: null, runT: 0, supportT: 0,
      mark: null, zone: zoneFor(pos, by, side), homeX: bx, homeY: by,
      boxSlot: null, stam: 100, kind: 'keep',
      foot: (DS.ensureFoot ? DS.ensureFoot(player) : '오른발'),
      mrole: (player && player.role) || ''
    };
  }

  function makeHomePlayers(lineup) {
    var out = [], i;
    for (i = 0; i < lineup.length; i++) {
      var s = lineup[i];
      out.push(mkPlayer('home', s.player, cfg.homeKit, s.role, s.pos, s.x, s.y));
    }
    return out;
  }
  function makeAwayPlayers(list, formationKey) {
    var f = DS.FORMATIONS[formationKey] || DS.FORMATIONS['4-4-2'];
    var slots = f.slots, out = [], i, s;
    for (i = 0; i < list.length; i++) {
      s = slots[i] || { role: 'ST', pos: 'ST', x: 50, y: 40 };
      out.push(mkPlayer('away', list[i], cfg.awayKit, s.role, s.pos, s.x, s.y));
    }
    return out;
  }

  function initRatings() {
    ratings = [];
    var i;
    for (i = 0; i < players.length; i++) {
      if (players[i].side !== 'home') { continue; }
      ratings.push({
        id: players[i].player.id, name: players[i].name, role: players[i].role,
        pos: players[i].pos, goals: 0, assists: 0, rating: 6.0, mvp: false
      });
    }
  }
  function ratingOf(p) {
    var i;
    for (i = 0; i < ratings.length; i++) { if (ratings[i].id === p.player.id) { return ratings[i]; } }
    return null;
  }
  function addRating(p, delta) {
    var r = ratingOf(p);
    if (r) { r.rating = clamp(r.rating + delta, 3.5, 10); }
  }
  function minute() { return Math.min(90, Math.floor(simTime / MATCH_SECONDS * 90)); }

  /* ─────────────────────────  모멘텀 · 카드  ───────────────────────── */
  function charge(v) {
    momentum = clamp(momentum + v, 0, 100);
    hudDirty = true;
  }
  function buffOf(fx) { return buffs[fx] || 0; }
  /* 감독 특기 수치 (없으면 0) */
  function mfx(k) { return mgrFx[k] || 0; }
  function anyAtkBuff() {
    return buffOf('atk') > 0 || buffOf('through') > 0 || buffOf('tiki') > 0 || buffOf('longshot') > 0;
  }

  function setupDeck(deck) {
    hand = [];
    drawQueue = [];
    buffs = {};
    momentum = 0;
    cardUses = 0;
    var list = (deck && deck.length ? deck : DS.DEFAULT_DECK).slice();
    list = U.shuffle(list);
    var i;
    for (i = 0; i < list.length; i++) {
      if (i < HAND_SIZE) { hand.push({ key: list[i], readyAt: 0 }); }
      else { drawQueue.push(list[i]); }
    }
    while (hand.length < HAND_SIZE && drawQueue.length) { hand.push({ key: drawQueue.shift(), readyAt: 0 }); }
  }

  function hudState() {
    var out = {
      momentum: Math.round(momentum), hand: [], buffs: [], uses: cardUses,
      usesLeft: Math.max(0, CARD_LIMIT - cardUses), limit: CARD_LIMIT
    };
    /* v9 — 실시간 미니 스탯 (점유율 · 슈팅 · 지친 선수) */
    var totP = possession.home + possession.away;
    var hPos = Math.round(possession.home / Math.max(0.001, totP) * 100);
    out.minute = minute();
    out.score = [M.homeScore, M.awayScore];
    out.poss = [hPos, 100 - hPos];
    out.shots = [goalStats.homeShots, goalStats.awayShots];
    /* v21 ④ — xG · 유효슈팅 · 라이브 평점 */
    out.xg = [Math.round(homeXg * 10) / 10, Math.round(awayXg * 10) / 10];
    var onT = [0, 0], sj;
    for (sj = 0; sj < shotLog.length; sj++) {
      if (shotLog[sj].onTarget) { onT[shotLog[sj].side === 'home' ? 0 : 1] += 1; }
    }
    out.onTarget = onT;
    var rts = [], ri;
    for (ri = 0; ri < ratings.length; ri++) {
      var rr0 = ratings[ri];
      if (rr0.subbedOut) { continue; }
      rts.push({ name: short(rr0.name), pos: rr0.pos, rating: rr0.rating });
    }
    rts.sort(function (a, b) { return b.rating - a.rating; });
    out.ratings = { top: rts.slice(0, 2), low: rts.slice(-2).reverse() };
    out.tired = [];
    var j, q;
    for (j = 0; j < players.length; j++) {
      q = players[j];
      if (q.side !== 'home' || q.off) { continue; }
      if (q.stam <= 40) {
        out.tired.push({ name: short(q.name), pos: q.pos, stam: Math.round(q.stam) });
      }
    }
    out.tired.sort(function (a, b) { return a.stam - b.stam; });
    /* v21b ③ — 선발 11인 실시간 체력·평점 (높은 화면의 피치 아래 미니 바) */
    out.pitch = [];
    for (j = 0; j < players.length; j++) {
      q = players[j];
      if (q.side !== 'home' || q.off) { continue; }
      var rq = ratingOf(q);
      out.pitch.push({
        name: short(q.name), pos: q.pos, stam: Math.round(q.stam),
        rating: rq ? Math.round(rq.rating * 10) / 10 : 6.0,
        face: DS.Art.headSrc(q.player)
      });
    }
    var i, def;
    for (i = 0; i < hand.length; i++) {
      def = DS.cardOf(hand[i].key);
      if (!def) { continue; }
      var ace = aceFor(def.fx);
      out.hand.push({
        key: def.key, name: def.name, cost: def.cost, tag: def.tag, color: def.color,
        icon: def.icon, ready: hand[i].readyAt <= 0 && momentum >= def.cost && cardUses < CARD_LIMIT,
        cooldown: Math.max(0, Math.ceil(hand[i].readyAt)),
        face: ace ? DS.Art.headSrc(ace.player) : '',
        ace: ace ? ace.name : '',
        desc: def.desc
      });
    }
    for (var k in buffs) {
      if (!buffs.hasOwnProperty(k) || !(buffs[k] > 0)) { continue; }
      var cdef = CARD_BY_FX[k];
      out.buffs.push({
        key: k, left: Math.ceil(buffs[k]),
        name: cdef ? cdef.name : k, tag: cdef ? cdef.tag : '',
        color: cdef ? cdef.color : '#c8f169', icon: cdef ? cdef.icon : 'zap',
        dur: cdef ? cdef.dur : 20,
        pct: cdef ? Math.round(clamp(buffs[k] / cdef.dur, 0, 1) * 100) : 100,
        ace: cardAce[k] ? cardAce[k].name : ''
      });
    }
    out.kick = kick ? { label: kick.label, side: kick.side, t: Math.round(kick.t * 100) / 100, t0: kick.t0 } : null;
    return out;
  }
  function pushHud() {
    hudDirty = false;
    if (cfg && cfg.onHud) { cfg.onHud(hudState()); }
  }

  function aceFor(fx) {
    var best = null, bv = -1, i, p, want, g, score;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== 'home' || isGK(p)) { continue; }
      g = groupOf(p);
      want = (fx === 'atk' || fx === 'setpiece' || fx === 'through' || fx === 'longshot') ? 'FW'
        : (fx === 'press' || fx === 'tempo' || fx === 'build' || fx === 'tiki' || fx === 'roar' || fx === 'offside') ? 'MF'
        : (fx === 'def' || fx === 'trigger') ? 'MF' : null;
      score = DS.ratingOf(p.player) + (want === g ? 24 : 0);
      if (score > bv) { bv = score; best = p; }
    }
    return best;
  }

  /* v26c ② — 컷인은 이제 loop()에서 실제 시간(realDt)으로만 차감되고,
     끝나는 순간 여기서 오버레이를 직접 걷는다. 늦게 도착한 예전 타이머가
     새 컷인을 지우지 않도록 발급 번호(cutinSeq)로 막는다. */
  var cutinSeq = 0;
  function hideCutin() {
    var host = document.getElementById('m-cutin');
    if (!host) { return; }
    host.classList.remove('on');
    host.innerHTML = '';
  }

  function playCutin(def, ace) {
    cutinHold = 1.7;
    var mySeq = ++cutinSeq;
    try { if (DS.Bgm) { DS.Bgm.duck(1900); } } catch (e) { /* 무시 */ }
    var host = document.getElementById('m-cutin');
    if (!host) { return; }
    var img = ace ? DS.Art.headSrc(ace.player) : '';
    var art = DS.tacticArtHTML(def.key, 'cutac');
    host.innerHTML =
      '<div class="cutin" style="--cc:' + def.color + '">' +
      '<div class="cutin-lines"></div>' +
      '<div class="cutin-art">' + art +
      (img ? '<span class="cutin-face"><img src="' + img + '" alt="">' +
        (ace ? '<b>' + ace.name + '</b>' : '') + '</span>' : '') +
      '</div>' +
      '<div class="cutin-body">' +
      '<div class="cutin-tag">LIVE TACTICS · ' + def.tag + '</div>' +
      '<div class="cutin-name">' + def.name + '</div>' +
      '<div class="cutin-en">' + def.en + '</div>' +
      (ace ? '<div class="cutin-ace">' + ace.name + ' 발동</div>' : '') +
      '<div class="cutin-desc">' + def.desc + '</div>' +
      '<div class="cutin-live"><i></i>피치에 즉시 대입 — 오라·전술선이 살아 있습니다</div>' +
      '</div></div>';
    host.classList.add('on');
    global.setTimeout(function () {
      if (mySeq !== cutinSeq) { return; }
      hideCutin();
    }, 2400);
  }

  function goalCutin(scorer) {
    var mySeq = ++cutinSeq;
    var host = document.getElementById('m-cutin');
    if (!host) { return; }
    var meta = DS.picMeta(scorer.player);
    host.innerHTML =
      '<div class="cutin gcutin" style="--cc:' + meta.color + '">' +
      '<div class="cutin-lines"></div>' +
      '<div class="cutin-art">' + DS.Art.portraitTag(scorer.player, '', 'full') + '</div>' +
      '<div class="cutin-body">' +
      '<div class="cutin-tag">GOAL · ' + minute() + "'</div>" +
      '<div class="gword">GOAL!</div>' +
      '<div class="cutin-ace">' + scorer.name + '</div>' +
      '<div class="cutin-desc">' + M.homeScore + ' : ' + M.awayScore + ' · ' + cfg.homeName + '</div>' +
      '</div></div>';
    host.classList.add('on');
    cutinHold = 1.15;
    global.setTimeout(function () {
      if (mySeq !== cutinSeq) { return; }
      hideCutin();
    }, 1600);
  }

  M.playCard = function (key) {
    if (!M.running) { return false; }
    var idx = -1, i;
    for (i = 0; i < hand.length; i++) { if (hand[i].key === key) { idx = i; } }
    if (idx < 0) { return false; }
    var def = DS.cardOf(key);
    if (!def) { return false; }
    if (cardUses >= CARD_LIMIT) { return false; }
    if (hand[idx].readyAt > 0) { return false; }
    if (momentum < def.cost) { return false; }

    momentum = clamp(momentum - def.cost, 0, 100);
    cardUses++;
    applyCard(def);
    hand.splice(idx, 1);
    hand.push({ key: drawQueue.length ? drawQueue.shift() : key, readyAt: 9 });
    drawQueue.push(key);
    hudDirty = true;
    pushHud();
    return true;
  };

  /* v25 검증용 — 모멘텀·개수 제한 없이 카드 효과를 직접 발동한다 (헤드리스 QA · 콘솔 확인용) */
  M.qaCard = function (key) {
    var def = DS.cardOf ? DS.cardOf(key) : null;
    if (!def || !M.running) { return false; }
    applyCard(def);
    hudDirty = true;
    pushHud();
    return true;
  };

  function applyCard(def) {
    var fx = def.fx;
    buffs[fx] = Math.max(buffs[fx] || 0, def.dur);
    var ace = aceFor(fx);
    if (ace) { ace.glow = 2.4; addRating(ace, 0.12); }
    cardAce[fx] = ace;
    cardHitCount[fx] = (cardHitCount[fx] || 0) + 1;
    v25t.cards++;
    playCutin(def, ace);
    cardBurst(def, ace);

    if (fx === 'setpiece') { setPieceCard(); }
    if (fx === 'trigger') { pressTrigger(); pressChain = { n: 2, t: 0.8 }; }
    if (fx === 'roar') { roar(); }
    if (fx === 'offside') { offsideTrap(); }
    if (fx === 'longshot' && ace) { bubble(ace, '🔥 대포알 준비!', '#ffb066'); }
    if (fx === 'tiki' && ace) { bubble(ace, '👟 원투패스!', '#8ff0b6'); }
    if (fx === 'press' && ace) { bubble(ace, '🛡️ 압박!', '#ff9f8a'); }
    if (fx === 'atk' && ace) { bubble(ace, '🏃 하프스페이스!', '#c3a6ff'); }

    if (cfg.onCard) { cfg.onCard(def.key, ace ? ace.name : ''); }
    say('🎴 ' + def.name + ' 발동! ' + def.desc, 'tactic');
    sayExp('지금 피치 위 ' + (ace ? short(ace.name) + ' 주변' : '전체') + '에 ' + def.name + '가 걸렸습니다. 초록 오라와 전술선을 보세요.');
    hudDirty = true;
  }

  /* v25 ① — 카드 발동 순간, 피치 위로 전술이 퍼져 들어오는 연출 */
  function cardBurst(def, ace) {
    var p = ace || (ball.carrier && ball.carrier.side === 'home' ? ball.carrier : null);
    var wx = p ? p.x : 50, wy = p ? p.y : 60;
    var col = def.color;
    spawnPart({ kind: 'wave', x: wx, y: wy, t0: 0.62, size: 9, color: hexA(col, 0.95), a0: 0.8, flat: 0.45 });
    spawnPart({ kind: 'wave', x: wx, y: wy, t0: 0.9, size: 16, color: hexA(col, 0.8), a0: 0.5, flat: 0.45 });
    fxSparks(wx, wy, 9, col, 7);
    if (p) { p.skillT = Math.max(p.skillT || 0, 1.4); }
  }

  /* v25 — 압박 트리거 2연속 압박: 카드 설명대로 두 번은 확실히 붙는다 */
  function firePressChain() {
    var c = ball.carrier, i, p, best = null, bd = 999;
    if ((buffs.trigger || 0) <= 0) { pressChain = { n: 0, t: 0 }; return; }
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== 'home' || p.off || isGK(p)) { continue; }
      var dd = Math.hypot(p.x - ball.x, p.y - ball.y);
      if (dd < bd) { bd = dd; best = p; }
    }
    pressChain.n -= 1;
    pressChain.t = 1.15;
    v25t.chain++;
    if (!best) { return; }
    if (c && c.side === 'away' && bd < 26) {
      c.stun = Math.max(c.stun, 0.6);
      setPose(best, 'tackle', 0.45);
      fxGrass(best, 6);
      fxSlideMark(best, 3.0);
      fxRing(best, '#c8c23a', 0.9);
      fxPop(best, 0.24);
      addRating(best, 0.16);
      addRating(c, -0.05);
      giveBall(best);
      charge(1.3);
      bubble(best, '🛡️ 2차 압박!', '#c8c23a', 1.3);
      say('⚡ 2차 압박! ' + U.josa(short(best.name), '이/가') + ' 다시 공을 빼앗습니다!', 'tackle');
      SND.tackle();
    } else {
      best.skillT = Math.max(best.skillT || 0, 0.8);
      fxRing(best, '#c8c23a', 0.7);
      bubble(best, '🛡️ 압박 유지!', '#c8c23a', 1.1);
    }
    if (pressChain.n <= 0) { pressChain = { n: 0, t: 0 }; }
  }

  function setPieceCard() {
    var atk = play.atkSide || 'home';
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0; ball.trail = [];
    ball.x = 50 + range(-12, 12);
    ball.y = attackGoalY(atk) - goalDir(atk) * 26;
    freeKick(atk);
  }

  function pressTrigger() {
    var i, list = [], best = null, bv = -1;
    for (i = 0; i < players.length; i++) {
      if (players[i].side === 'home' && !isGK(players[i])) {
        var v = players[i].player.stats.def + players[i].player.tough * 3;
        if (v > bv) { bv = v; best = players[i]; }
      }
    }
    for (i = 0; i < players.length; i++) {
      if (players[i].side === 'away' && !isGK(players[i]) && d2(players[i], ball) < 30) {
        players[i].stun = 0.85;
        list.push(players[i]);
      }
    }
    var target = ball.carrier;
    if (target && target.side === 'away' && best) {
      giveBall(best);
      addRating(best, 0.25);
      bubble(best, '🛡️ 압박!', '#ff9f8a');
      charge(3);
    }
    say('⚡ 압박 트리거! 상대 빌드업을 끊어냅니다.', 'tackle');
  }

  function offsideTrap() {
    /* v18 ③ — v17의 'p.y ±5 일회성 밀기'는 다음 프레임 targetPos(defendTarget)에 곧바로
       덮여 1프레임만 유지됐다. 이제 트랩의 지속은 blockOf()의 공통 하이 라인이 만들고
       (buffOf('offside') > 0 인 동안 매 프레임 유지), 이 함수는 발동 연출만 담당한다. */
    var i, p, shown = false;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side === 'home' && !isGK(p) && isDefGroup(p)) {
        setPose(p, 'run', 0.34);
        if (!shown && bubbleUnique(p, '🚩 라인 올린다!', '#9fd8ff', 1.3)) { shown = true; }
      }
    }
  }

  function roar() {
    momentum = clamp(momentum + 12, 0, 100);
    var i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side === 'home') { p.glow = Math.max(p.glow, 1.6); }
      else { p.stun = Math.max(p.stun, 0.3); }
    }
    say('📣 라커룸 일갈! 전 선수가 달아오릅니다. 모멘텀 +12', 'tactic');
    hudDirty = true;
  }

  /* ─────────────────────────  시작 · 종료  ───────────────────────── */
  M.start = function (config) {
    cfg = config;
    canvas = document.getElementById('m-pitch');
    if (!canvas) { return; }
    ctx = canvas.getContext('2d');
    /* v17 — 첫 사용자 터치(킥오프)에서 오디오 문을 연다 (모바일 자동재생 정책) */
    SND.init();
    SND.matchOn(true);
    SND.ambientOn();
    /* v26 — 경기 테마 BGM (로비 테마에서 부드럽게 넘어온다) */
    try { if (DS.Bgm) { DS.Bgm.play('match', 0.4); } } catch (e0) { /* 무시 */ }
    players = makeHomePlayers(cfg.lineup).concat(makeAwayPlayers(cfg.awayPlayers, cfg.awayFormation));
    /* v25 — 피치 팀 링을 유니폼 색으로 (스코어보드와 통일) */
    applyTeamColors();
    /* 2.5등신 일러스트 프리로드 — 피치 위 22명 전원 */
    var pi;
    chibiInit();
    for (pi = 0; pi < players.length; pi++) {
      loadHead(players[pi]);
      loadChibiBody(bodyKeyOf(players[pi], 'run'));
    }
    var preloadKeys = ['h0', 'h1', 'h2', 'a0', 'a1', 'a2'], pki;
    var preloadPoses = ['run_a', 'run_b', 'kick', 'tackle'];
    for (pki = 0; pki < preloadKeys.length; pki++) {
      for (pi = 0; pi < preloadPoses.length; pi++) {
        loadChibiBody(preloadKeys[pki] + '_' + preloadPoses[pi]);
      }
    }
    loadChibiBody('g0_idle'); loadChibiBody('g0_dive');
    loadChibiBody('g1_idle'); loadChibiBody('g1_dive');
    benchState = (cfg.bench || []).map(function (b) {
      return { player: b.player, pos: b.player.pos, rating: DS.ratingOf(b.player), used: false };
    });
    initRatings();
    M.homeScore = 0; M.awayScore = 0; M.clock = 0;
    M.subsLeft = MAX_SUBS;
    M.paused = false;
    M.halftime = false;
    M.speed = 1;                  /* v17 — 새 경기는 항상 ×1로 시작 (이전 경기 배속이 남지 않게) */
    simTime = 0; acc = 0;
    goalStats = { homeShots: 0, awayShots: 0 };
    homeXg = 0; awayXg = 0;
    stats = { passes: 0, tackles: 0, saves: 0, interceptions: 0 };
    goals = []; cautions = [];
    tele = blankTele();
    v15 = blankV15();
    /* v19 상태 초기화 */
    v19t = blankV19();
    shotLog = [];
    posAcc = {};
    passNet = { home: {}, away: {} };
    posT = 0;
    trans = { side: null, t: 0, t0: TRANS_SECONDS, kind: null };
    oneTwo = null;
    aiPosture = 'balanced';
    aiCheckIdx = 0;
    addedTime = { first: 0, second: 0 };
    addedDecided = { first: false, second: false };
    deadTime = 0;
    flagShow = { t: 0, y: 0, side: null };
    bannerT = 0;
    possession = { home: 0.001, away: 0.001 };
    halfScore = [[0, 0], [0, 0]];
    halftimeDone = false;
    tactic = cfg.tactics || 'balanced';
    /* v20 ① — 새 경기는 저장된 전술(S.tactics)에서 출발하고, 나머지 지시는 기본값 */
    touch = {
      mentality: LEGACY_MENT[tactic] || 'balanced',
      pressing: 'normal', line: 'standard', focus: 'balance'
    };
    touchFx = { t: 0, t0: 2.6, label: '', tone: '' };
    v20t = blankV20();
    touchCount = 0;
    /* v29 — 약측 폭·전환 패스·세트피스·전술 상성 계측기 */
    v29t = blankV29();
    matchupEvalT = 0;
    spLayout = null;
    /* v21 — 정체 타이머·보간 계수·계측기 초기화 */
    v21t = blankV21();
    ownHalfT = 0;
    ownHalfSide = null;
    renderAlpha = 1;
    mgrFx = cfg.managerFx || {};
    buildHomeMetrics(cfg.homeFormation);
    formFactor = 0.94 + clamp((cfg.condition || 80) / 900, 0, 0.12);
    spriteCache = {};
    ripples = [];
    /* v25 — 전술 오버레이·파티클·데칼·킥오프 상태 초기화 */
    initCards();
    parts = []; decals = []; cardAce = {}; cardHitCount = {};
    pressChain = { n: 0, t: 0 };
    v25t = {
      spawn: 0, peak: 0, cards: 0, overlays: 0, confetti: 0,
      dive: 0, tackle: 0, save: 0, kickSwing: 0, passWave: 0, aura: 0,
      kickoff: 0, kickoffPass: 0, chain: 0, maxParts: 0
    };
    /* v17 연출 상태 초기화 */
    goalStage = null; goalT = 0; cel = null;
    /* v30 — 슬로모션·골 임팩트·암전 전환 초기화, 카메라는 현재 보기 모드로 */
    slowmo = { t: 0, t0: 0, k: 1 };
    goalCutinPend = 0; goalCutinWho = null;
    fadeFx = { t: 0, t0: 0.5 };
    netFx = { t: 0, t0: 1.15, side: 'home' };
    crowd = { energy: 0, acc: 0, flashes: [], wave: 0 };
    lastGoalXg = 0; lastGoalAssist = '';
    cmtQ = []; cmtT = 0;
    hideCutin();
    setupDeck(cfg.deck);
    cutinHold = 0;
    play = {
      phase: 'kickoff', timer: 1.0, atkSide: 'home',
      stage: 'build', stageT: 0, counterSide: null, counterT: 0,
      recoverSide: null, recoverT: 0, markT: 0, sitKey: '',
      setpiece: null, passLine: null, looseT: 0, supT: 0, runT: 1.5, supList: null,
      burstOn: false
    };
    ball = {
      x: 50, y: 60, vx: 0, vy: 0, z: 0, vz: 0, carrier: null, from: null, receiver: null,
      kind: 'idle', flight: 0, dur: 0, aim: null, shot: null, trail: [], assist: null,
      lastTouch: null, offside: null, exempt: false, contest: null
    };
    updateScoreboard();
    clearCommentary();
    resize();
    if (global.document && document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () { if (M.running) { resize(); } });
    }
    resetCamera();
    relaxBases();
    /* v25 ③ — 경기 진입은 '확실한 킥오프'로 시작한다: 정렬 → 휘슬 → 첫 패스 */
    firstKickSide = Math.random() < 0.5 ? 'home' : 'away';
    halfNo = 1;
    resetKickoff(firstKickSide, {
      label: '1ST HALF KICK-OFF',
      sub: cfg.homeShort + ' vs ' + cfg.awayShort + ' · ' + (firstKickSide === 'home' ? cfg.homeShort : cfg.awayShort) + ' 킥오프',
      dur: 1.1
    });
    /* v21b — 첫 rAF가 첫 물리 스텝보다 먼저 그리면 보간 기준값(px/py)이 없어
       공 좌표가 NaN이 되고 createRadialGradient가 예외를 던졌다. 시작 시점에 기준값을 심는다. */
    var pi0;
    for (pi0 = 0; pi0 < players.length; pi0++) { players[pi0].px = players[pi0].x; players[pi0].py = players[pi0].y; }
    ball.px = ball.x; ball.py = ball.y; ball.pz = ball.z;
    M.running = true;
    M.phase = 'play';
    lastT = 0;
    say('휘슬이 울립니다! ' + cfg.homeName + ' 대 ' + cfg.awayName + ', 경기 시작!', 'big');
    say('피치 위 상황 배너를 보고 전술 카드를 타이밍에 맞춰 쓰세요.', 'normal');
    pushHud();
    /* 선수단 입장 연출 — 2.5등신 일러스트가 준비되면 킥오프 */

    artGateOn = headLeft > 0;      /* v10 — 입장 게이트는 초상화 두상만 기다린다 (전신 프리로드 제거) */
    artGateT = 0;
    if (artGateOn) { M.paused = true; }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  };

  M.setSpeed = function (n) { M.speed = clamp(n, 1, 3); };
  /* v30 — 중계뷰 / 전체뷰 토글. 전체뷰는 줌 1.0으로 피치 전체와 전술 배치를 한눈에. */
  M.setView = function (mode) {
    camMode = mode === 'full' ? 'full' : 'broadcast';
    QV.setMode(camMode);
    QV.snap(camMode === 'full' ? 50 : ball.x, camMode === 'full' ? 60 : ball.y,
      camMode === 'full' ? CAM_D_FULL : CAM_D_BASE);
    if (cfg && cfg.onView) { cfg.onView(M.viewState()); }
    return camMode;
  };
  M.toggleView = function () { return M.setView(camMode === 'full' ? 'broadcast' : 'full'); };
  M.viewState = function () {
    var qs = QV.state();
    return {
      mode: camMode, zoom: Math.round((CAM_D_BASE / Math.max(1, qs.dist)) * 1000) / 1000,
      zoomBase: 1, zoomFull: Math.round((CAM_D_BASE / CAM_D_FULL) * 1000) / 1000,
      camX: Math.round(qs.tx), camY: Math.round(qs.tz), dist: qs.dist,
      tokenScale: tokenScale(), viewW: Math.round(qs.dist), viewH: qs.fov || 0, ppm: qs.ppm
    };
  };
  /* v30 QA — 골 임팩트·슬로모션·침투 화살표 계측 */
  M.v30 = function () {
    var i, p, runs = [];
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off || isGK(p) || ball.carrier === p) { continue; }
      if (p.runT > 0 || (p.throughRun && p.throughRun.t > 0)) {
        var tyv = p.throughRun ? p.throughRun.y : (p.runTo ? p.runTo.y : p.ty);
        runs.push({ name: p.name, side: p.side, runT: Math.round(p.runT * 100) / 100, awayFromBall: p !== ball.carrier,
          fwd: Math.round(((tyv - p.y) * goalDir(p.side)) * 10) / 10, arrow: isFinite(tyv) && (tyv - p.y) * goalDir(p.side) >= 2.2 });
      }
    }
    return {
      view: M.viewState(),
      slowmo: { t: Math.round(slowmo.t * 1000) / 1000, k: slowmo.k, active: slowmo.t > 0 },
      goalImpact: { cutinPend: Math.round(goalCutinPend * 1000) / 1000, shake: Math.round(shake.t * 100)/100, fade: Math.round(fadeFx.t * 100)/100 },
      ball: { z: Math.round(ball.z * 100) / 100, vz: Math.round(ball.vz * 10) / 10, airborne: ball.z > 0.05, netAt: ball.netAt || null },
      runs: runs
    };
  };
  var LEGACY_MENT = { defense: 'defensive', defensive: 'defensive', balanced: 'balanced', attack: 'attacking', attacking: 'attacking', allout: 'allout' };
  M.setTactics = function (t) {
    tactic = t;
    /* v20 ① — 기존 3단 전술 버튼도 터치라인 성향 지시와 같은 상태를 쓴다 */
    var ment = LEGACY_MENT[t];
    if (ment && touch.mentality !== ment) {
      touch.mentality = ment;
      touchCount += 1;
      if (cfg && cfg.onTouch) { cfg.onTouch(M.touchState()); }
    }
    var line = t === 'attack' ? '전술을 공격적으로! 라인을 끌어올립니다!' :
      (t === 'defense' ? '전술을 수비적으로! 라인을 내립니다.' : '균형 전술로 안정을 찾습니다.');
    say(line, 'tactic');
  };
  M.pause = function () {
    M.paused = true;
    /* 컷인이 떠 있는 채로 일시정지하면 오버레이가 메뉴를 덮으므로 함께 걷는다 */
    if (cutinHold > 0) { cutinHold = 0; hideCutin(); }
  };
  M.resume = function (quiet) {
    var wasHalf = !!M.halftime;
    if (M.halftime) { deadTime = 0; }
    M.paused = false;
    M.halftime = false;
    lastT = 0;
    /* v25 ③ — 후반 시작도 '확실한 킥오프': 반대 팀이 센터에서 시작한다 */
    if (wasHalf) {
      halfNo = 2;
      try { if (DS.Bgm) { DS.Bgm.setHalf(false); } } catch (e) { /* 무시 */ }
      var s2 = firstKickSide === 'home' ? 'away' : 'home';
      resetKickoff(s2, {
        label: '2ND HALF KICK-OFF',
        sub: '후반 시작 · ' + teamShort(s2) + ' 킥오프',
        dur: 1.1
      });
      if (!quiet) { say('후반전 시작! 다시 공을 굴립니다.', 'big'); }
      return;
    }
    if (!quiet) { say('후반전 시작! 다시 공을 굴립니다.', 'big'); }
  };
  var autoCards = false;
  var autoT = 5;

  /* 자동 개입 — 모멘텀이 넉넉할 때 손패에서 가장 싼 카드를 알아서 쓴다 */
  function tryAutoCard() {
    if (!M.running || cardUses >= CARD_LIMIT) { return false; }
    if (cutinHold > 0 || play.phase === 'setpiece' || play.phase === 'goal') { return false; }
    var best = null, i, def;
    for (i = 0; i < hand.length; i++) {
      def = DS.cardOf(hand[i].key);
      if (!def || hand[i].readyAt > 0 || momentum < def.cost) { continue; }
      if (!best || def.cost < best.cost) { best = def; }
    }
    if (!best) { return false; }
    return M.playCard(best.key);
  }

  M.setAuto = function (on) {
    autoCards = !!on;
    autoT = 3;
    say(autoCards ? '자동 개입 ON — 상황에 맞춰 전술 카드를 알아서 씁니다.' : '자동 개입 OFF — 직접 카드를 고르세요.', 'tactic');
    return autoCards;
  };
  M.isAuto = function () { return autoCards; };

  M.handState = hudState;
  /* 진단용: 경기 상태 스냅샷 (디버깅 · QA리포트) */
  M.diag = function () {
    var c = ball.carrier;
    return {
      clock: Math.round(M.clock), phase: play.phase, stage: play.stage, kind: ball.kind,
      carrier: c ? c.name : null, carrierSide: c ? c.side : null,
      ballX: Math.round(ball.x * 10) / 10, ballY: Math.round(ball.y * 10) / 10,
      players: players.length,
      home: players.filter(function (p) { return p.side === 'home'; }).length,
      away: players.filter(function (p) { return p.side === 'away'; }).length,
      passes: stats.passes, shots: goalStats.homeShots + goalStats.awayShots,
      counterT: Math.round(play.counterT * 10) / 10, recoverT: Math.round(play.recoverT * 10) / 10,
      setpiece: play.setpiece ? play.setpiece.type : null, timer: Math.round(play.timer * 10) / 10,
      offside: v15 ? { home: v15.offside.home, away: v15.offside.away } : null,
      added: addedTime, clockLabel: clockLabel()
    };
  };
  /* v15 계측: 오프사이드 · 세트피스 · 퇴장 · 추가시간 */
  M.v15 = function () {
    return {
      offside: v15 ? v15.offside : null,
      setpiece: v15 ? v15.setpiece : null,
      reds: v15 ? v15.reds : 0,
      cards: v15 ? v15.cards : 0,
      added: [addedTime.first, addedTime.second],
      clock: clockLabel(),
      sentOff: { home: 11 - players.filter(function (p) { return p.side === 'home'; }).length, away: 11 - players.filter(function (p) { return p.side === 'away'; }).length },
      timeline: v15 ? v15.timeline.slice(-40) : [],
      dbg: v15 ? (v15.dbg || []) : [], chk: v15 ? (v15.chk || 0) : 0, behind: v15 ? (v15.behind || 0) : 0
    };
  };
  M.stop = function () {
    M.running = false;
    cancelAnimationFrame(rafId);
    /* v30 — 골 임팩트·슬로모션·암전 상태를 반드시 닫는다 (다음 경기로 새면 안 됨) */
    goalCutinPend = 0; goalCutinWho = null;
    slowmo = { t: 0, t0: 0, k: 1 };
    fadeFx = { t: 0, t0: 0.5 };
    SND.ambientOff();
    SND.matchOn(false);
    try { if (DS.Bgm) { DS.Bgm.setHalf(false); DS.Bgm.play('lobby', 0.35); } } catch (e) { /* 무시 */ }
  };
  /* v17 — 음소거 토글 (localStorage 저장) */
  M.toggleMute = function () {
    var m = SND.setMuted(!SND.isMuted());
    return m;
  };
  M.isMuted = function () { return SND.isMuted(); };
  M.audioUnlock = function () { SND.init(); SND.resume(); };
  /* v26 — BGM(bgm.js)이 같은 AudioContext·마스터 게인을 빌려 쓴다(중복 컨텍스트 없음) */
  M.audioBus = function () { return SND.bus(); };
  /* v17 QA — 방송 연출 상태 스냅샷 */
  M.broadcast = function () {
    return {
      cam: { x: Math.round(cam.x * 10) / 10, y: Math.round(cam.y * 10) / 10, z: Math.round(cam.z * 1000) / 1000 },
      view: { w: W, h: H },
      goal: { stage: goalStage, t: Math.round(goalT * 100) / 100, cel: cel ? { scorer: cel.scorer.name, corner: cel.corner, joins: cel.joins.length } : null },
      net: Math.round(netFx.t * 100) / 100,
      crowd: { energy: Math.round(crowd.energy * 100) / 100, flashes: crowd.flashes.length },
      sound: { muted: SND.isMuted(), ready: SND.isReady() },
      cmt: { q: cmtQ.length }
    };
  };
  M.stats = function () {
    return {
      passes: stats.passes, tackles: stats.tackles, saves: stats.saves,
      interceptions: stats.interceptions,
      shots: goalStats, cautions: cautions.length, goals: goals.length, minute: minute(),
      momentum: Math.round(momentum), cards: cardUses,
      xg: [Math.round(homeXg * 100) / 100, Math.round(awayXg * 100) / 100],
      shotLog: shotLog.length, aiPosture: aiPosture, secondBalls: v19t.secondBall
    };
  };
  /* v14 검증용: 전술 철학별 실제 플레이 계측값 */
  M.tele = function () {
    return {
      styleHome: styleKeyOf('home'), styleAway: styleKeyOf('away'),
      home: { pass: tele.pass.home, press: tele.press.home, pressHigh: tele.pressHigh.home, swarm: tele.swarm.home, longwin: tele.longwin.home,
        pressProgress: tele.pressY.home.n ? Math.round(tele.pressY.home.sum / tele.pressY.home.n) : 0,
        passDist: tele.passDist.home.n ? Math.round(tele.passDist.home.sum / tele.passDist.home.n * 10) / 10 : 0,
        shots: goalStats.homeShots, tackles: Math.round(stats.tackles), line: Math.round(defLineY('home')), shape: formationOf('home') },
      away: { pass: tele.pass.away, press: tele.press.away, pressHigh: tele.pressHigh.away, swarm: tele.swarm.away, longwin: tele.longwin.away,
        pressProgress: tele.pressY.away.n ? Math.round(tele.pressY.away.sum / tele.pressY.away.n) : 0,
        passDist: tele.passDist.away.n ? Math.round(tele.passDist.away.sum / tele.passDist.away.n * 10) / 10 : 0,
        shots: goalStats.awayShots, line: Math.round(defLineY('away')), shape: formationOf('away') }
    };
  };

  M.subState = function () {
    if (!M.running) { return null; }
    var onPitch = [], bench = [], i;
    for (i = 0; i < players.length; i++) {
      if (players[i].side !== 'home') { continue; }
      onPitch.push({
        id: players[i].player.id, name: players[i].name, role: players[i].role,
        pos: players[i].pos, rating: DS.ratingOf(players[i].player), off: players[i].off
      });
    }
    for (i = 0; i < benchState.length; i++) {
      bench.push({
        id: benchState[i].player.id, name: benchState[i].player.name,
        pos: benchState[i].pos, rating: benchState[i].rating, used: benchState[i].used
      });
    }
    return {
      onPitch: onPitch, bench: bench, subsLeft: M.subsLeft, subsMax: MAX_SUBS,
      minute: minute(), score: M.homeScore + ' : ' + M.awayScore, halftime: M.paused
    };
  };

  /* ── v28 — 수석코치 하프타임 교체 추천서용 스냅샷 ──
     화면(game.js)이 '왜 바꿔야 하는지'를 판단할 수 있도록 전반 실측값을 그대로 넘긴다:
     경기 평점(ratings[]의 누적 평점 — OVR과 다르다) · 체력 · 경고 · 슬롯 적성 · 벤치 OVR. */
  M.adviceState = function () {
    if (!M.running) { return null; }
    var onPitch = [], bench = [], i, q, rq, bw, k, best;
    function bestApt(map) {
      var v = 0;
      for (k in map) {
        if (map.hasOwnProperty(k) && typeof map[k] === 'number' && map[k] > v) { v = map[k]; }
      }
      return v || 1;
    }
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.side !== 'home' || q.off) { continue; }
      rq = ratingOf(q);
      best = bestApt((q.player.apt && typeof q.player.apt === 'object') ? q.player.apt : {});
      onPitch.push({
        id: q.player.id, name: q.name, pos: q.pos, role: q.role,
        number: q.player.number || 0,
        ovr: DS.ratingOf(q.player),
        rating: rq ? Math.round(rq.rating * 10) / 10 : 6.0,
        stam: Math.round(q.stam),
        yellows: q.yellows || 0,
        apt: (q.player.apt && typeof q.player.apt === 'object') ? q.player.apt : {},
        aptSlot: (q.player.apt && typeof q.player.apt[q.pos] === 'number') ? q.player.apt[q.pos] : 5,
        aptBest: best
      });
    }
    for (i = 0; i < benchState.length; i++) {
      bw = benchState[i];
      bench.push({
        id: bw.player.id, name: bw.player.name, pos: bw.pos,
        number: bw.player.number || 0,
        ovr: DS.ratingOf(bw.player),
        apt: (bw.player.apt && typeof bw.player.apt === 'object') ? bw.player.apt : {},
        used: !!bw.used
      });
    }
    return {
      minute: minute(), score: [M.homeScore, M.awayScore],
      subsLeft: M.subsLeft, subsMax: MAX_SUBS,
      onPitch: onPitch, bench: bench, halftime: !!M.halftime
    };
  };

  M.substitute = function (inId, outId) {
    if (!M.running || M.subsLeft <= 0) { return false; }
    var outP = null, inB = null, i;
    for (i = 0; i < players.length; i++) {
      if (players[i].side === 'home' && players[i].player.id === outId) { outP = players[i]; }
    }
    for (i = 0; i < benchState.length; i++) {
      if (benchState[i].player.id === inId && !benchState[i].used) { inB = benchState[i]; }
    }
    if (!outP || !inB) { return false; }
    var newP = mkPlayer('home', inB.player, cfg.homeKit, outP.role, outP.pos, outP.baseX / 1, outP.baseY * 1);
    newP.baseX = outP.baseX; newP.baseY = outP.baseY;
    newP.zone = zoneFor(outP.pos, outP.baseY, 'home');
    newP.x = outP.x; newP.y = outP.y; newP.tx = outP.x; newP.ty = outP.y;
    var idx = players.indexOf(outP);
    players.splice(idx, 1, newP);
    inB.used = true;
    M.subsLeft--;
    for (i = 0; i < ratings.length; i++) {
      if (ratings[i].id === outId) {
        ratings[i].rating = clamp(ratings[i].rating - 0.3, 3.5, 10);
        ratings[i].subbedOut = true;
      }
    }
    ratings.push({
      id: inB.player.id, name: inB.player.name, role: outP.role, pos: outP.pos,
      goals: 0, assists: 0, rating: 6.0, mvp: false
    });
    if (ball.carrier === outP) { ball.carrier = null; ball.kind = 'idle'; ball.x = outP.x; ball.y = outP.y; }
    for (i = 0; i < players.length; i++) {
      if (players[i].mark === outP) { players[i].mark = null; }
    }
    charge(2);
    say('🔁 교체! ' + short(outP.name) + ' 나가고 ' + short(inB.player.name) + ' 투입됩니다. (' + minute() + "')", 'tactic');
    return true;
  };

  /* ─────────────────────────  레이아웃  ───────────────────────── */
  M.resize = resize;
  /* v21b ③ — 폰트·사이드바 높이가 늦게 확정되면 피치가 빈틈이나 오버플로를 남긴다.
     경기장 컬럼의 실제 크기가 바뀔 때마다 한 번 더 맞춘다. */
  var roCol = null, roTimer = 0;
  function watchColumn() {
    if (roCol || !global.ResizeObserver || !canvas) { return; }
    var col = canvas.parentNode && canvas.parentNode.parentNode;
    if (!col) { return; }
    roCol = new global.ResizeObserver(function () {
      if (roTimer) { return; }
      roTimer = global.setTimeout(function () { roTimer = 0; resize(); }, 50);
    });
    roCol.observe(col);
  }
  function resize() {
    if (!canvas) { return; }
    watchColumn();
    /* v21b ③ — 피치는 16:9를 유지하고, 높은 화면에서 남는 아래 공간은
       '선발 11인 체력·평점' 바에 넘긴다 (예전에는 캔버스가 중간 높이에 멈춰
       아래에 큰 빈 배경이 남았다). */
    var wrap = canvas.parentNode;
    var col = wrap.parentNode;
    var colW = Math.max(320, Math.round(wrap.getBoundingClientRect().width));
    var square = document.getElementById('m-squad');
    var wrapH = 0;
    if (col && col.className && String(col.className).indexOf('m-pitch-col') >= 0) {
      var stacked = false;
      try { stacked = global.getComputedStyle(col.parentNode).flexDirection === 'column'; } catch (e) { stacked = false; }
      var colH = Math.max(180, Math.round(col.getBoundingClientRect().height));
      var ratioH = Math.max(180, Math.round(colW * 9 / 16));
      var useStrip = !stacked && !!square && (colH - ratioH >= 118);
      if (square) { square.classList.toggle('off', !useStrip); }
      wrapH = stacked ? ratioH : (useStrip ? ratioH : colH);
      wrap.style.height = wrapH + 'px';
    }
    var rect = wrap.getBoundingClientRect();
    W = Math.max(320, Math.round(rect.width));
    H = Math.max(180, Math.round(rect.height));
    dpr = Math.min(2, global.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx = canvas.getContext('2d');
    if (!ctx) { return; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    /* v31 — 캔버스 전체가 쿼터뷰 경기장. 치비 전신이 화면 높이에 맞는 크기로 보인다. */
    field = { x: 0, y: 0, w: W, h: H };
    SPR_H = Math.round(clamp(H * 0.086, 22, 46));
    QV.setSize(W, H, SPR_H);
    QV.setMode(camMode);
  }

  /* v31 — 스타디움은 DS.Q 가 절차적으로 그린다 (외부 피치 이미지 없음) */
  function loadPitchImage() { /* no-op */ }
  function buildPitchLayer() { /* no-op */ }

  /* ─────────────────────────  중계 · 상황 배너  ───────────────────────── */
  var EXP_GEN = [
    '지금 두 팀 다 라인 간격이 잘 유지되고 있습니다. 서로 물러주지 않아요.',
    '여기서 무리한 패스 한 번이 경기 흐름을 통째로 넘겨줄 수 있습니다.',
    '중원에서 첫 터치가 반박자 늦으면 곧바로 압박이 들어옵니다.',
    '풀백이 올라갈 때 반대쪽 윙어가 안쪽으로 접어주는 게 중요합니다.',
    '세컨드볼을 누가 잡느냐가 이 시간대의 관전 포인트입니다.',
    '체력이 떨어지기 시작하면 패스 길이가 길어집니다. 그때가 위험합니다.',
    '벤치에서 계속 라인을 올리라는 신호가 나오고 있습니다.',
    '골키퍼의 발밑이 좋습니다. 빌드업 첫 패스가 아주 안정적이에요.',
    '수비수들이 몸을 반쯤 돌려 서 있습니다. 배후 공간을 노려볼 만합니다.',
    '템포가 조금 처졌습니다. 한 번 크게 돌려서 숨을 고를 필요가 있습니다.',
    '지금은 소유보다 위치가 중요한 시간입니다. 서두를 필요 없어요.'
  ];
  function say(text, kind, who) {
    var body = document.getElementById('m-comm-body');
    if (!body) { return; }
    var exp = who === 'exp';
    var line = document.createElement('div');
    line.className = 'cmt-line ' + (kind || '') + (exp ? ' exp' : '');
    line.innerHTML = '<span class="cmt-who' + (exp ? ' exp' : '') + '">' + (exp ? '🎧' : '🎙') + '</span>' +
      '<span class="cmt-min">' + minute() + "'</span>" + text;
    body.appendChild(line);
    while (body.children.length > 4) { body.removeChild(body.firstChild); }
    body.scrollTop = body.scrollHeight;
    /* 2인 중계 — 지금 말하는 쪽 라벨을 밝힌다 */
    var lc = document.getElementById('m-tk-cast');
    var le = document.getElementById('m-tk-exp');
    if (lc) { lc.classList.toggle('on', !exp); }
    if (le) { le.classList.toggle('on', exp); }
  }
  /* 해설위원 한마디 — 캐스터 라인 뒤에 박자 를 두고 들어간다 */
  function sayExp(text, kind) {
    if (!text) { return; }
    cmtQ.push({ text: text, kind: kind || 'exp' });
    while (cmtQ.length > 2) { cmtQ.shift(); }
    if (cmtQ.length === 1) { cmtT = 0.95; }
  }
  function clearCommentary() {
    var body = document.getElementById('m-comm-body');
    if (body) { body.innerHTML = ''; }
  }
  function banner(text, sub, cls) {
    var el = document.getElementById('m-banner');
    if (!el) { return; }
    el.className = 'goal-banner on' + (cls ? ' ' + cls : '');
    el.innerHTML = '<div class="gb-text">' + text + '</div>' + (sub ? '<div class="gb-sub">' + sub + '</div>' : '');
    bannerT = 2.6;
  }
  function clearBanner() {
    var el = document.getElementById('m-banner');
    if (el) { el.classList.remove('on'); }
  }
  function updateScoreboard() {
    var a = document.getElementById('m-gf'), b = document.getElementById('m-ga'), c = document.getElementById('m-clock');
    if (a) { a.textContent = M.homeScore; }
    if (b) { b.textContent = M.awayScore; }
    if (c) { c.textContent = clockLabel(); }
  }

  /* v15 — 경기 시계: 45+2' · 90+4' 추가시간까지 표시 */
  function clockLabel() {
    var m = simTime / PER_MIN;
    if (!halftimeDone) {
      if (m >= 45) { return '45+' + clamp(Math.ceil(m - 45), 1, 9) + "'"; }
      var f = Math.floor(m);
      return (f < 10 ? '0' : '') + f + "'";
    }
    if (m >= 90) { return '90+' + clamp(Math.ceil(m - 90), 1, 9) + "'"; }
    var s = Math.floor(m);
    return (s < 10 ? '0' : '') + s + "'";
  }

  function setSit(key, extra, force) {
    var meta = SIT[key] || SIT.build;
    if (!force && play.sitKey === key) { return; }
    play.sitKey = key;
    var el = document.getElementById('m-sit');
    if (!el) { return; }
    var team = '';
    if (key !== 'corner' && key !== 'fk' && key !== 'kickoff' && key !== 'offside' && key !== 'throw' && key !== 'goalkick' && key !== 'pk') {
      team = (play.atkSide === 'home' ? cfg.homeShort : cfg.awayShort) + ' · ';
    }
    el.className = 'sit on tone-' + meta.tone;
    el.innerHTML = '<i></i><b>' + meta.label + '</b><span>' + team + (extra || meta.sub) + '</span>';
    /* v25 — 같은 상황 문구가 20초 넘게 붙어 있지 않게 스스로 닫힌다 */
    play.sitHold = 7.5;
  }

  function tickSit(dt) {
    if (play.sitHold > 0) {
      play.sitHold -= dt;
      if (play.sitHold <= 0) {
        var el = document.getElementById('m-sit');
        if (el) { el.className = 'sit off'; }
        /* sitKey 는 그대로 둔다 — 같은 상황이 계속되면 다시 튀어나오지 않고,
           상황이 바뀌었을 때만 새 문구로 다시 열린다. */
      }
    }
  }

  /* ─────────────────────────  포지셔닝 · AI  ───────────────────────── */
  function stagePush(p, stage) {
    var g = groupOf(p);
    var table = {
      build: { DF: 0, MF: 2, FW: 3 },
      mid: { DF: 4, MF: 6, FW: 8 },
      wide: { DF: 8, MF: 11, FW: 14 },
      final: { DF: 11, MF: 15, FW: 18 }
    };
    var row = table[stage] || table.build;
    var v = g === 'DF' ? row.DF : (g === 'MF' ? row.MF : row.FW);
    var tac = effTactic(p.side);
    if (tac === 'attack') { v += 3; }
    else if (tac === 'allout') { v += 6; }
    else if (tac === 'defense') { v -= 2; }
    return v;
  }
  function lineDrop(p) {
    var g = groupOf(p);
    if (g === 'DF') { return 9; }
    if (g === 'MF') { return 6.5; }
    return 3.5;
  }

  function assignPressers(defSide, pc) {
    var out = [], i, p, d;
    pc = pc || pressConfig(defSide);
    var cand = [], near = null, nd = 999;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== defSide || isGK(p) || p.off) { continue; }
      d = d2(p, ball);
      if (d < nd) { nd = d; near = { p: p, d: d }; }
      if (d <= pc.radius) { cand.push({ p: p, d: d }); }
    }
    cand.sort(function (a, b) { return a.d - b.d; });
    /* 압박 반경 밖이면 아무도 따라붙지 않고, 가장 가까운 1명만 나선다 */
    if (!cand.length && near) { cand.push(near); }
    /* v18 ② — 1~2인 압박 제한: 가장 가까운 압박자 1 + 커버 1, 나머지는 존을 지킨다.
       v20 — 지시(총공세+전방 압박)로 상한을 3까지 올렸을 때는 그만큼 나선다. */
    var maxN = pc.n || 2;
    for (i = 0; i < cand.length && i < maxN; i++) { out.push(cand[i].p); }
    return out;
  }

  function assignMarks(defSide) {
    if (play.markT > 0) { return; }
    play.markT = 0.32;
    var i, p, q, atks = [], defs = [], used = {}, best, bd, d;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      p.mark = null;
      if (p.off || isGK(p)) { continue; }
      if (p.side === defSide) { defs.push(p); } else { atks.push(p); }
    }
    defs.sort(function (a, b) { return b.y - a.y; });
    var isolate = buffOf('def') > 0 && defSide === 'home';
    for (i = 0; i < defs.length; i++) {
      p = defs[i];
      best = null; bd = 26;
      if (isolate && isDefGroup(p)) {
        for (var k = 0; k < atks.length; k++) {
          if (isFwdGroup(atks[k]) && !used[atks[k].player.id]) {
            d = d2(p, atks[k]);
            if (d < bd + 14) { bd = d; best = atks[k]; }
          }
        }
      }
      if (!best) {
        for (var j = 0; j < atks.length; j++) {
          q = atks[j];
          if (used[q.player.id]) { continue; }
          d = Math.hypot(q.x - p.x, (q.y - p.y) * 1.25);
          if (d < bd) { bd = d; best = q; }
        }
      }
      if (best) { p.mark = best; used[best.player.id] = true; }
    }
    void isolate;
  }

  /* 볼 주변 삼각 지원: 볼을 준 선수 주변에 좌·우·앞 3각 패스 옵션을 만든다 (v10) */
  function assignSupport(carrier) {
    var i, p, list = [], d;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== carrier.side || p === carrier || p.off || isGK(p)) { continue; }
      d = Math.hypot(p.x - carrier.x, p.y - carrier.y);
      if (d < 34) { list.push({ p: p, d: d, x: p.x }); }
    }
    list.sort(function (a, b) { return a.d - b.d; });
    var dir = goalDir(carrier.side);
    /* v14 — 감독 전술: 티키타카는 삼각 거리를 좁히고, 직선 롱볼은 넓게 벌린다 */
    var gap = styleOf(carrier.side).supportGap * 1.16;   /* v25 — 지원 삼각을 조금 더 넓게 */
    /* 좌우로 벌린 두 명 + 앞쪽 한 명 — 세 방향이 겹치지 않게 고른다 */
    var wantL = null, wantR = null, wantF = null, j, it;
    for (j = 0; j < list.length; j++) {
      it = list[j];
      if (!wantL && it.x < carrier.x - 4) { wantL = it; }
      else if (!wantR && it.x > carrier.x + 4) { wantR = it; }
      else if (!wantF) { wantF = it; }
      if (wantL && wantR && wantF) { break; }
    }
    var picks = [];
    if (wantL) {
      wantL.p.support = {
        x: clamp(carrier.x - gap * 0.85, 5, 95),
        y: clamp(carrier.y + dir * 4 + (wantL.p.y > carrier.y ? 3 : -3), 5, 115)
      };
      wantL.p.supportT = 0.9;
      picks.push(wantL.p);
    }
    if (wantR) {
      wantR.p.support = {
        x: clamp(carrier.x + gap * 0.85, 5, 95),
        y: clamp(carrier.y - dir * 3, 5, 115)
      };
      wantR.p.supportT = 0.9;
      picks.push(wantR.p);
    }
    if (wantF) {
      wantF.p.support = {
        x: clamp(carrier.x + (wantF.x < 50 ? 3 : -3), 5, 95),
        y: clamp(carrier.y + dir * gap * 1.15, 5, 115)
      };
      wantF.p.supportT = 0.9;
      picks.push(wantF.p);
    }
    play.supList = picks;      /* 피치에 패스 각을 얇게 그린다 */
  }

  /* 오프더볼 침투: 수비 라인 뒤 대각선 공간으로 뛰는 선수를 주기적으로 만든다.
     v10 — 공격 전술이면 두 명이 동시에 침투해 수비 라인을 흔든다. */
  function assignRuns(count) {
    var carrier = ball.carrier, i, p, tries = count || 1, t, best, bv;
    if (!carrier) { return; }
    var sh = shapeOf(carrier.side);
    for (t = 0; t < tries; t++) {
      var defSide = carrier.side === 'home' ? 'away' : 'home';
      var line = defLineY(defSide);
      best = null; bv = -1;
      for (i = 0; i < players.length; i++) {
        p = players[i];
        if (p.side !== carrier.side || p === carrier || p.off || isGK(p)) { continue; }
        if (!isFwdGroup(p) && !isMidGroup(p)) { continue; }
        if (p.runT > 0.2) { continue; }                     /* 이미 뛰는 선수는 제외 */
        var prog = progressOf(p.side, p.y);
        if (prog > 0.80) { continue; }
        if (Math.hypot(p.x - carrier.x, p.y - carrier.y) < 12) { continue; }
        var v = (isFwdGroup(p) ? 20 : 0) + prog * 20 + Math.random() * 10;
        /* v20 ① — 고른 공격 루트 쪽 침투를 우선한다 */
        if (carrier.side === 'home' && touch.focus !== 'balance') {
          var fdist = Math.abs(p.x - TOUCH_FOCUS_X[touch.focus]);
          v += (fdist < 16 ? 14 : (fdist < 30 ? 4 : -6));
        }
        /* v20 ② — 포처(ST)는 뒷공간 침투가 잦고, 폴스나인(CF)은 내려오는 역할이라 덜는다 */
        if (p.pos === 'ST') { v += 8; }
        else if (p.pos === 'CF') { v -= 4; }
        if (v > bv) { bv = v; best = p; }
      }
      if (!best) { return; }
      var dir = goalDir(best.side);
      best.runTo = {
        x: clamp(best.x + (best.baseX < 50 ? 6 : -6) + range(-4, 4), 6, 94),
        y: clamp(line - dir * range(3, sh.name === 'attack' ? 10 : 8), 4, 116)
      };
      best.runT = sh.name === 'attack' ? 1.9 : 1.5;
      /* v20 ① — 지시한 루트로 침투 방향을 당긴다 */
      if (best.side === 'home' && touch.focus !== 'balance') {
        var fxRun = TOUCH_FOCUS_X[touch.focus];
        best.runTo.x = clamp(best.runTo.x * 0.45 + fxRun * 0.55, 6, 94);
        v20t.focusRun[touch.focus] += 1;
      }
      if (t === 0 && chance(0.5)) { bubbleUnique(best, '🏃 침투!', '#c3a6ff', 1.1); }
    }
  }

  function nearestNToBall(side, n) {
    var cand = [], i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== side || p.off || isGK(p)) { continue; }
      cand.push({ p: p, d: d2(p, ball) });
    }
    cand.sort(function (a, b) { return a.d - b.d; });
    var out = [];
    for (i = 0; i < cand.length && i < n; i++) { out.push(cand[i].p); }
    return out;
  }

  function updateTargets(dt) {
    var atk = play.atkSide;
    var def = atk === 'home' ? 'away' : 'home';
    var carrier = ball.carrier;
    var pressers = carrier ? assignPressers(def, pressConfig(def)) : [];
    /* v16 — 박스 슬롯 분산 (프레임당 1회, 공격 팀 전원에게 자리 배정) */
    assignBoxSlots(atk);
    /* v14 게겐프레싱 — 볼을 잃은 직후 3명이 반경과 상관없이 즉시 달려든다
       v19 ① — 게겐프레싱 팀은 전환 창 첫 3초만 '2+1' 즉시 카운터프레스 버스트를 쓴다.
       그 뒤에는 v18의 1~2인 압박 상한으로 돌아와 3줄 블록을 다시 세운다. */
    if (carrier) {
      var stDef = styleOf(def);
      if (stDef.counterPress > 0 && play.recoverT > 0 && play.recoverSide === def) {
        var burst = (stDef.key === 'gegenpress' && trans.side && trans.side !== def && trans.t > (trans.t0 - 3));
        var swarm = nearestNToBall(def, Math.min(burst ? 3 : 2, stDef.counterPress));
        if (swarm.length > 1) {
          pressers = swarm;
          if (!play.swarmed) { play.swarmed = true; tele.swarm[def] += 1; }
          if (burst && !play.burstOn) { play.burstOn = true; v19t.burst[def] += 1; }
        }
      }
    }
    if (carrier) {
      assignMarks(def);
      play.supT -= dt;
      if (play.supT <= 0) { play.supT = 0.4; assignSupport(carrier); }
    } else {
      play.supList = null;
    }
    /* v18 ② 계측: 한 프레임에 공 소유자에게 붙는 수비 인원 (목표 1~2명) */
    if (pressers.length > v18t.pressMax[def]) { v18t.pressMax[def] = pressers.length; }
    /* v20 ① 계측: 홈팀이 공 소유자에게 붙이는 압박 인원 (지시 변경의 효과) */
    if (def === 'home') {
      v20t.pressFrames += 1;
      v20t.pressSum += pressers.length;
      if (pressers.length > v20t.pressMax) { v20t.pressMax = pressers.length; }
    }
    if (pressers.length > 2) { v19t.press3 += 1; }     /* v19: 게겐프레싱 3초 버스트 프레임만 */
    var i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off) { continue; }
      /* v29 ② — 세트피스 대기 동안에는 각자 배정된 전용 대형 좌표를 지킨다.
         (예전엔 sendTo 로 잡은 자리를 이 함수가 바로 덮어써서 대형이 무너졌다) */
      if (play.phase === 'setpiece' && play.setpiece && p.setPos) {
        p.tx = p.setPos.x; p.ty = p.setPos.y; p.kind = 'set';
        continue;
      }
      if (isGK(p)) { gkTarget(p); continue; }
      if (p === carrier) { carrierTarget(p); continue; }
      if (!carrier) {
        if (ball.kind === 'pass' || ball.kind === 'shot') {
          if (p === ball.receiver) {
            p.tx = ball.aim ? ball.aim.x : ball.x;
            p.ty = ball.aim ? ball.aim.y : ball.y;
            continue;
          }
          var chase = nearestToBall(p.side, 10);
          if (chase === p) { p.tx = ball.x; p.ty = ball.y; continue; }
        } else {
          var loose = nearestToBall(p.side, 8);
          if (loose === p) { p.tx = ball.x; p.ty = ball.y; continue; }
        }
      }
      if (p.side === atk) { attackTarget(p); }
      else if (pressers.indexOf(p) >= 0) { chaseTarget(p); }
      else { defendTarget(p); }
    }
    void dt;
  }

  function chaseTarget(p) {
    var lead = 0.12;
    p.tx = clamp(ball.x + ball.vx * lead, 3, 97);
    p.ty = clamp(ball.y + ball.vy * lead, 3, 117);
    p.kind = 'chase';
  }

  /* ────── v16 — 박스 침투 타겟 슬롯 ──────
     공격수들이 모두 같은 점을 향해 달려들어 GK·수비와 한 덩어리가 되던 문제를 없앤다.
     박스에 들어가는 무명 공격수는 니어 포스트 / 페널티 스팟 / 파 포스트 / 아크 정면
     내 자리로 나눠 서고, 공을 몬 1명만 자유롭게 슈팅 각을 잡는다. */
  function assignBoxSlots(atkSide) {
    var i, p, cand = [], yg = attackGoalY(atkSide), dir = goalDir(atkSide);
    var carrier = ball.carrier;
    for (i = 0; i < players.length; i++) { players[i].boxSlot = null; }
    if (!carrier && play.phase !== 'play' && play.phase !== 'setpiece') { return; }
    /* 니어/파 포스트는 공 쪽을 기준으로 — 터치라인 근처에서만 뒤집어 목표가 튀지 않게 */
    if (ball.x < 40) { play.boxLeft = true; }
    else if (ball.x > 60) { play.boxLeft = false; }
    if (play.boxLeft == null) { play.boxLeft = true; }
    var nearX = play.boxLeft ? 40 : 60, farX = 100 - nearX;
    var slots = [
      { name: '니어포스트', x: nearX, d: 16.5 },
      { name: '페널티스팟', x: 50, d: 22.0 },
      { name: '파포스트', x: farX, d: 16.5 },
      { name: '아크정면', x: 50 + (play.boxLeft ? 5 : -5), d: 30.5 }
    ];
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== atkSide || p.off || isGK(p) || p === carrier) { continue; }
      if (!isFwdGroup(p) && !(isMidGroup(p) && (p.pos === 'AM' || p.pos === 'CM'))) { continue; }
      cand.push(p);
    }
    /* 기본 위치(x) 순으로 고정 배정 — 프레임마다 자리가 바뀌지 않는다 */
    cand.sort(function (a, b) {
      if (Math.abs(a.baseX - b.baseX) > 0.01) { return a.baseX - b.baseX; }
      return String(a.name) < String(b.name) ? -1 : 1;
    });
    for (i = 0; i < cand.length && i < slots.length; i++) {
      cand[i].boxSlot = { name: slots[i].name, x: slots[i].x, y: yg - dir * slots[i].d };
    }
  }

  function carrierTarget(p) {
    var dir = goalDir(p.side);
    var gy = attackGoalY(p.side);
    var opp = nearestOpponent(p, 20);
    var avoid = 0;
    if (opp.player && opp.dist < 9) {
      avoid = (p.x >= opp.player.x ? 1 : -1) * (9 - opp.dist) * 0.7;
    }
    if (p.dribbleX != null && p.dribbleT > 0) {
      p.tx = clamp(p.dribbleX, 5, 95);
      p.ty = clamp(p.dribbleY, 4, 116);
      return;
    }
    var tx = p.x + (50 - p.x) * 0.10 + avoid;
    var ty = p.y + dir * 9;
    if (Math.abs(p.y - gy) < 18) { tx = p.x + (54 - p.x) * 0.3 + avoid; }
    /* v20 ② — 인버티드 윙어는 볼을 몰 때도 터치라인 대신 하프스페이스로 접어 들어온다 */
    if (isInverted(p) && Math.abs(p.x - 50) > 24) {
      tx = p.x + (50 - p.x) * 0.30 + avoid * 0.5;
      ty = p.y + dir * 8;
    }
    p.tx = clamp(tx, 6, 94);
    p.ty = clamp(ty, 4, 116);
  }

  function attackTarget(p) {
    var z = p.zone;
    var st = play.stage;
    var m = metricsOf(p.side);
    var sty = styleOf(p.side);
    var a = anchorOf(p);
    var push = stagePush(p, st);
    var g = groupOf(p);
    /* v25 ② — 공 쪽 압축을 더 줄여 22명이 한 구역에 뭉치는 체감을 완화한다 */
    var kx = g === 'DF' ? 0.11 : (g === 'MF' ? 0.12 : 0.09);
    var ky = g === 'DF' ? 0.06 : (g === 'MF' ? 0.08 : 0.09);
    var spread = 1.00 + clamp(m.width + sty.width, 20, 99) / 100 * 0.52;   /* 폭 지표 + 감독 전술 */
    /* 공에서 먼 선수일수록 자기 구역을 지킨다 (전원이 볼로 몰리지 않게) — v25: 거리 감쇠를 더 급하게 */
    var hold = clamp(1 - (Math.hypot(p.x - ball.x, p.y - ball.y) - 14) / 40, 0.08, 1);
    var tx = 50 + (a.x - 50) * spread + (ball.x - 50) * kx * hold;
    var ty = a.y + (ball.y - 60) * ky * hold + z.dir * push;

    /* 반대편 윙어는 폭을 유지해 전환 패스 각을 만든다 */
    var farWing = (a.x < 38 && ball.x > 62) || (a.x > 62 && ball.x < 38);
    if (farWing && !isFwdGroup(p) && st !== 'final') {
      tx = 50 + (a.x - 50) * (spread + 0.16);
    }

    /* 측면: 윙어·윙백은 전 구간에서 터치라인을 넓게 쓴다 */
    if (p.pos === 'LWF') { tx = sideX(p, st === 'build' ? 11 : 3.5); }
    else if (p.pos === 'RWF') { tx = sideX(p, st === 'build' ? 89 : 96.5); }
    else if (p.pos === 'LWB') { tx = sideX(p, st === 'build' ? 9 : 4); }
    else if (p.pos === 'RWB') { tx = sideX(p, st === 'build' ? 91 : 96); }

    /* 윙백 오버래핑: 폭 넓은 백3·백5 포메이션은 터치라인을 타고 박스 옆까지 올라간다 */
    if ((p.pos === 'LWB' || p.pos === 'RWB') && m.width >= 64) {
      tx = sideX(p, p.pos === 'LWB' ? 3 : 97);
      if (st === 'mid' || st === 'wide' || st === 'final') {
        ty = attackGoalY(p.side) - z.dir * (st === 'final' ? 13 : 21);
      }
    }

    /* 최전방: 박스 안으로 파고든다 */
    if (isFwdGroup(p) && st === 'final') {
      ty = attackGoalY(p.side) - z.dir * 13;
      tx = 50 + (a.x - 50) * 0.72;
    }

    /* v10 — 공격 전술: 풀백·윙백이 터치라인을 타고 하프라인을 넘어 오버래핑한다 */
    var sh = shapeOf(p.side);
    if (sh.name === 'attack' && (p.pos === 'LB' || p.pos === 'RB' || p.pos === 'LWB' || p.pos === 'RWB')) {
      var leftSide = isLeftLane(p);
      tx = sideX(p, leftSide ? clamp(3.5 + (1 - progressOf(p.side, ball.y)) * 5, 3, 12) : clamp(96.5 - (1 - progressOf(p.side, ball.y)) * 5, 88, 97));
      if (st === 'mid' || st === 'wide' || st === 'final') {
        ty = Math.min(ty, attackGoalY(p.side) - z.dir * (st === 'final' ? 22 : 34));
      }
    }
    /* v10 — 2선 침투: 공격 전술이면 AM/CM이 박스 앞까지 올라와 슈팅 옵션이 된다 */
    if (sh.name === 'attack' && (p.pos === 'AM' || p.pos === 'CM') && (st === 'wide' || st === 'final') && ball.carrier) {
      var carryProg = progressOf(ball.carrier.side, ball.carrier.y);
      if (carryProg > 0.45) {
        ty -= z.dir * (st === 'final' ? 9 : 5);
        tx += (p.baseX < 50 ? 4 : -4);
      }
    } else if (sh.secondLine > 0 && (p.pos === 'AM' || p.pos === 'CM') && st === 'final') {
      ty -= z.dir * 5 * sh.secondLine;
    }

    /* ── v14 감독 전술 철학: 침투 인원 · 하이 라인 · 폭 성향 ── */
    if (sty.throughBias > 1.6 && (g === 'MF' || isFwdGroup(p)) && st !== 'build') { ty -= z.dir * 2.5; }
    if (sty.crossBias > 1.8 && (p.pos === 'LWF' || p.pos === 'RWF') && st !== 'build') {
      tx = sideX(p, p.pos === 'LWF' ? 2.6 : 97.4);
      if (st === 'wide' || st === 'final') { ty -= z.dir * 4; }
    }

    /* ── v14 변칙 포메이션 morph: 공격 시 대형이 실제로 바뀐다 ── */
    var mo = morphOf(p.side);
    if (mo) {
      if (mo.boxMid > 0 && (p.pos === 'DM' || ((p.pos === 'LB' || p.pos === 'RB') && (mo.fbIn || 0) >= 0.5))) {
        var cx2 = p.baseX < 50 ? 42.5 : 57.5;
        tx = tx * (1 - 0.72 * mo.boxMid) + cx2 * (0.72 * mo.boxMid);
        if (st !== 'build') { ty -= z.dir * 5 * mo.boxMid; }
      }
      if (mo.wbUp > 0 && (p.pos === 'LWB' || p.pos === 'RWB')) {
        if (st === 'mid' || st === 'wide' || st === 'final') {
          tx = sideX(p, p.pos === 'LWB' ? 3.6 : 96.4);
          ty -= z.dir * (st === 'final' ? 18 : 27);
        }
      }
      if (mo.diamond > 0 && (p.pos === 'LWF' || p.pos === 'RWF')) {
        if (st === 'wide' || st === 'final') {
          tx += (p.baseX < 50 ? 11 : -11);
          ty -= z.dir * 6;
        }
      }
      if (mo.fbIn > 0 && (p.pos === 'LB' || p.pos === 'RB') && st !== 'build') {
        tx += (p.baseX < 50 ? 9 : -9) * mo.fbIn;
      }
      if (mo.wingHigh > 0 && (p.pos === 'LWF' || p.pos === 'RWF')) {
        tx = sideX(p, p.pos === 'LWF' ? 3 : 97);
        if (st !== 'build') { ty -= z.dir * 5; }
      }
    }

    /* 하프스페이스 카드: AM/WF 대각선 침투 */
    if (buffOf('atk') > 0 && (p.pos === 'AM' || p.pos === 'LWF' || p.pos === 'RWF') && st !== 'build') {
      ty += z.dir * 8;
      tx += (a.x < 50 ? 8 : -8);
    }
    /* 라인 브레이크: 중원 한 칸 전진 */
    if (buffOf('through') > 0 && g === 'MF') { ty += z.dir * 4; }
    /* 골키퍼 빌드업: 후방 라인도 함께 올라와 짧은 패스 각을 만든다 */
    if (buffOf('build') > 0 && (isGK(p) || isDefGroup(p))) { ty += z.dir * 3; }
    /* 오프사이드 트랩: 수비 라인이 동시에 전진 */
    if (p.side === 'home' && buffOf('offside') > 0 && g === 'DF' && ball.y < 70) { ty += z.dir * 3; }

    /* 삼각 지원: 볼 주변 동료가 패스 각으로 벌어진다 */
    if (p.supportT > 0 && p.support) {
      tx = tx * 0.42 + p.support.x * 0.58;
      ty = ty * 0.42 + p.support.y * 0.58;
    }
    /* 수비 뒷공간 대각선 침투 */
    if (p.runT > 0 && p.runTo) {
      tx = tx * 0.34 + p.runTo.x * 0.66;
      ty = ty * 0.34 + p.runTo.y * 0.66;
    }

    /* ── v15: 공 없는 움직임을 진짜 축구처럼 ── */
    var carrierV = ball.carrier;
    var gyv = attackGoalY(p.side);
    var oLine = offsideLineY(p.side === 'home' ? 'away' : 'home');

    /* ① 빌드업: CB가 좌우로 벌리고, DM이 내려와 삼각 패스 각을 만들고, 윙백이 전진한다 */
    if (st === 'build') {
      if (p.pos === 'CB') {
        tx = p.baseX < 50 ? 24 : 76;
        ty = a.y - z.dir * 1.5;
      } else if (p.pos === 'DM') {
        tx = 50 + (a.x - 50) * 0.7;
        ty = a.y + z.dir * 3.5;
      } else if (p.pos === 'LB' || p.pos === 'RB' || p.pos === 'LWB' || p.pos === 'RWB') {
        ty = a.y - z.dir * 8;
      }
    }

    /* ② 스트라이커: 오프사이드 라인 끝자락을 타며 좌우로 흔들다가 뒷공간으로 침투 */
    if (isFwdGroup(p) && carrierV && (st === 'build' || st === 'mid')) {
      var sLine0 = supportLineY(p.side);
      tx = 50 + (a.x - 50) * 0.75 + Math.sin(simTime * 0.85 + p.baseX * 0.11) * 7;
      ty = sLine0 - z.dir * 2.0;
      if (chance(0.008)) {
        p.runTo = { x: clamp(tx + range(-9, 9), 6, 94), y: clamp(sLine0 - z.dir * range(7, 15), 4, 116) };
        p.runT = 1.6;
        bubbleUnique(p, '🏃 뒷공간!', '#c3a6ff', 1.1);
      }
    }

    /* ②-b v16 — 박스 안 타겟 슬롯: 니어포스트·페널티스팟·파포스트·아크정면으로 분산
       공을 몬 선수가 없어도(크로스·슛이 날아가는 중) 슬롯을 잠그한 자리를 지킨다. */
    if (p.boxSlot) {
      var carryProg2 = progressOf(p.side, ball.y);
      if (carryProg2 > 0.50) {
        var slotW = clamp((carryProg2 - 0.50) / 0.22, 0, 1) * 0.84;
        tx = tx * (1 - slotW) + p.boxSlot.x * slotW;
        ty = ty * (1 - slotW) + p.boxSlot.y * slotW;
      }
    }

    /* ③ 측면 돌파: 같은 쪽 윙백이 바깥으로 오버래핑, 반대편 윙어는 박스 먼 쪽으로 침투 */
    if (carrierV && carrierV.side === p.side && carrierV !== p && (st === 'wide' || st === 'final')) {
      var ballLeft = ball.x < 50;
      var isWB = (p.pos === 'LB' || p.pos === 'LWB' || p.pos === 'RB' || p.pos === 'RWB');
      var wbLeft = isLeftLane(p);
      if (isWB && ballLeft === wbLeft) {
        tx = ballLeft ? 2.6 : 97.4;
        ty = clamp(ball.y + z.dir * 4, 4, 116);
      }
      if ((p.pos === 'LWF' || p.pos === 'RWF') && isLeftLane(p) !== ballLeft) {
        tx = 50 + (ballLeft ? 10 : -10);
        ty = gyv - z.dir * 11;
      }
    }

    /* ⑤ 오프사이드 라인 존중: 공이 라인 뒤에 있는 동안 비소유 공격수는 라인 안쪽에 머문다
       (라인을 넘는 것은 침투 러닝이 걸린 순간에만) */
    if (p !== carrierV && !isDefGroup(p)) {
      var sLine = supportLineY(p.side);
      var ballBeyond = z.dir < 0 ? (ball.y < sLine) : (ball.y > sLine);
      if (!ballBeyond && p.runT <= 0.15) {
        var lim = sLine - z.dir * 1.8;
        if (z.dir < 0) { if (ty < lim) { ty = lim; } }
        else if (ty > lim) { ty = lim; }
      }
    }

    /* ⑤-b v16 — GK 보호: 공을 몬 1명 말고는 상대 골키퍼 코앞에 붙지 않는다 */
    if (p !== carrierV) {
      var ogk = goalkeeper(p.side === 'home' ? 'away' : 'home');
      if (ogk) {
        var guardPx = 1.6 * 2 * SPR_H * TOKEN_R;          /* GK 중심에서 1.6 지름 이상 */
        var gdx = tx - ogk.x, gdy = ty - ogk.y;
        var grt = sepRates(clamp(ogk.x / WORLD_W, 0, 1));
        var gd = Math.hypot(gdy * grt.ky, gdx * grt.kx);
        if (gd < guardPx) {
          if (gd < 0.001) { gdx = 0; gdy = 1; gd = 1; }
          tx = ogk.x + gdx * guardPx / gd;
          ty = ogk.y + gdy * guardPx / gd;
        }
      }
    }

    /* ── v19 ① — 감독 철학별 공격 패턴 ──
       wingplay : 윙어는 터치라인에 붙어 폭을 끝까지 쓰고, 풀백·윙백이 바깥으로 겹쳐 올라간다
       hybrid3241: 빌드업·중원 전개 중 풀백이 DM 옆 중앙으로 인버트(3-2-4-1)되고 윙어는 폭을 지킨다 */
    if (sty.key === 'wingplay') {
      if (p.pos === 'LWF' || p.pos === 'RWF') {
        tx = sideX(p, p.pos === 'LWF' ? 2.2 : 97.8);
        if (st === 'wide' || st === 'final') { ty -= z.dir * 3; }
      } else if ((p.pos === 'LB' || p.pos === 'LWB' || p.pos === 'RB' || p.pos === 'RWB') &&
        carrierV && carrierV.side === p.side && carrierV !== p &&
        (st === 'mid' || st === 'wide' || st === 'final')) {
        tx = sideX(p, (p.pos === 'LB' || p.pos === 'LWB') ? 3.0 : 97.0);
        ty = clamp(ball.y + z.dir * 3, 4, 116);
        v19t.overlap[p.side] += 1;
      }
    } else if (sty.key === 'hybrid3241' && (st === 'build' || (st === 'mid' && progressOf(p.side, ball.y) < 0.55))) {
      if (p.pos === 'LB' || p.pos === 'RB') {
        tx = 50 + (p.baseX < 50 ? -8.5 : 8.5);
        ty = clamp(a.y + z.dir * 2.5, 6, 114);
        v19t.invert[p.side] += 1;
      } else if (p.pos === 'LWF' || p.pos === 'RWF') {
        tx = sideX(p, p.pos === 'LWF' ? 5.5 : 94.5);
      }
    }

    /* ── v20 ② 롤·주발 최종 보정 — 스타일·변칙 포메이션이 덮어쓴 마지막 목표를
       선수 자신의 포지션·현대 롤·주발로 다시 잡는다. (패스·지원·침투 블렌딩 뒤에 적용) ── */
    if (isWingerPos(p) && st !== 'build') {
      if (isInverted(p)) {
        /* 반대 발 윙어: 터치라인 대신 하프스페이스 / 박스 앞으로 접어 들어온다 */
        tx = sideX(p, p.pos === 'LWF' ? (st === 'final' ? 39 : 33) : (st === 'final' ? 61 : 67));
        if (st === 'wide' || st === 'final') { ty = attackGoalY(p.side) - z.dir * (st === 'final' ? 15 : 21); }
        v20t.invertedCut[p.side] += 1;
      } else {
        /* 같은 발 윙어: 폭을 끝까지 지키고 크로스 지점으로 간다 */
        tx = sideX(p, p.pos === 'LWF' ? 3.2 : 96.8);
        v20t.wideHold[p.side] += 1;
      }
    }
    if (p.pos === 'DM' && st === 'build') {
      var deepDM = (mroleOf(p) === 'regista' || mroleOf(p) === 'bpd');
      tx = 50 + (a.x - 50) * (deepDM ? 0.55 : 0.7);
      ty = a.y - z.dir * (deepDM ? 7.5 : 4.5);
      if (deepDM) { v20t.dmDrop[p.side] += 1; }
    }
    if ((p.pos === 'LB' || p.pos === 'RB') && mroleOf(p) === 'ifb' && (st === 'build' || st === 'mid')) {
      tx = 50 + (p.baseX < 50 ? -8 : 8);
      v20t.ifbIn[p.side] += 1;
    }
    if ((p.pos === 'CM' || p.pos === 'AM') && (mroleOf(p) === 'b2b' || mroleOf(p) === 'mezzala') &&
      p !== carrierV && (st === 'final' || (st === 'wide' && progressOf(p.side, ball.y) > 0.62))) {
      tx = 50 + (p.baseX < 50 ? -7.5 : 7.5);
      ty = attackGoalY(p.side) - z.dir * 13.5;
      v20t.lateBox[p.side] += 1;
    }
    if (p.pos === 'CF') {
      if (p !== carrierV && (st === 'build' || st === 'mid')) {
        /* 폴스나인: 라인 사이로 내려와 연결 패스를 받는다 */
        tx = 50 + (a.x - 50) * 0.55;
        ty = a.y - z.dir * 7;
        v20t.cfDrop[p.side] += 1;
      }
    } else if (p.pos === 'ST') {
      if (p !== carrierV && carrierV && (st === 'mid' || st === 'wide')) {
        /* 포처·타겟: CB를 붙잡고 오프사이드 라인 끝자락에서 뒷공간을 노린다 */
        tx = 50 + (a.x - 50) * 0.8;
        ty = supportLineY(p.side) - z.dir * 1.2;
        v20t.stBehind[p.side] += 1;
      }
    }
    /* 공격형 윙백 롤: 터치라인을 타고 볼 높이까지 겹쳐 올라가 크로스 지점을 만든다 */
    if (isWingbackPos(p) && mroleOf(p) === 'wingback' && st !== 'build') {
      tx = sideX(p, p.pos === 'LWB' ? 3.4 : 96.6);
      ty = clamp(ball.y + z.dir * 2, 6, 114);
      v20t.wideHold[p.side] += 1;
    }

    /* ── v29 ① 약측(반대편) 아이솔레이션 ──
       공이 한쪽 측면에 몰렸을 때 반대편 윙어·윙백·풀백이 공 쪽으로 끌려와 22명이
       한 구역에 밀집하면 전환 패스 각이 사라진다. 박스 안 마무리(final)가 아닌
       전개 단계에서는 반대편 넓은 선수가 터치라인 폭을 그대로 지킨다. */
    var ballFlank = ball.x < 34 ? -1 : (ball.x > 66 ? 1 : 0);
    if (ballFlank !== 0 && st !== 'final') {
      var wideRole = (isWingerPos(p) || isWingbackPos(p) || p.pos === 'LB' || p.pos === 'RB');
      if (wideRole && !isInverted(p) && !(p.runT > 0)) {
        var myLeft = isLeftLane(p);
        var farSide = ballFlank < 0 ? !myLeft : myLeft;
        if (farSide) {
          var holdX = myLeft ? 4.8 : 95.2;
          var holdW = st === 'wide' ? 1 : 0.9;
          tx = tx * (1 - holdW) + holdX * holdW;
          if (p.side === 'home' && p._isoFrame !== simFrame) {
            p._isoFrame = simFrame;
            var widNow = Math.abs(p.x - 50);
            v29t.isoFrames += 1;
            v29t.isoFarSum += widNow;
            if (widNow < v29t.isoFarMin) { v29t.isoFarMin = widNow; }
            if (widNow > v29t.isoFarMax) { v29t.isoFarMax = widNow; }
          }
        }
      }
    }

    /* ── v20 ① 공격 루트 지시: 고른 레인으로 목표를 당기고 그쪽에서 한 발 더 전진한다 ── */
    if (p.side === 'home' && touch.focus !== 'balance' && p !== carrierV) {
      var fx0 = TOUCH_FOCUS_X[touch.focus];
      var wF = g === 'DF' ? 0.14 : (g === 'MF' ? 0.36 : 0.52);
      /* 고른 레인에 가까운 선수는 거의 그 자리로, 먼 쪽 선수는 절반만 당긴다 */
      if (Math.abs(tx - fx0) < 26) { wF = Math.min(0.72, wF * 1.5); }
      tx = tx * (1 - wF) + fx0 * wF;
      ty = ty - z.dir * (g === 'DF' ? 0 : (g === 'MF' ? 2.2 : 3.2));
    }

    /* ④ 전술 버튼(수비/군형/공격): 누르면 라인·폭이 눈앞에서 확 달라진다 */
    if (p.side === 'home') {
      var shpV = shapeOf('home').name;
      if (shpV === 'attack') { ty -= z.dir * 4; tx = 50 + (tx - 50) * 1.06; }
      else if (shpV === 'defense') { ty += z.dir * 3; tx = 50 + (tx - 50) * 0.93; }
    }

    p.tx = clamp(tx, z.xMin, z.xMax);
    p.ty = clamp(ty, a.y - z.fwd - 8, a.y + z.back + 8);
    p.ty = clamp(p.ty, 3, WORLD_H - 3);
    /* v16 — 비소유 공격수는 6야드 박스 안으로 빨려 들어가지 않는다 */
    if (p !== carrierV && !isDefGroup(p)) {
      var deepLim2 = attackGoalY(p.side) - z.dir * 9.5;
      if (z.dir < 0) { if (p.ty < deepLim2) { p.ty = deepLim2; } }
      else if (p.ty > deepLim2) { p.ty = deepLim2; }
    }
    p.kind = 'atk';
  }

  /* ─────────────────────────  v18 ② — 수비 3줄 블록(DF–MF–FW) · 존 디펜스  ─────────────────────────
     v17까지 수비수는 '공 좌표'와 '내가 마크하는 상대'만 보고 목표를 잡았다. 그래서 상대가
     자기 진영에서 빌드업할 때도 10명이 공 쪽으로 빨려 들어가 한쪽 터치라인에 뭉쳤다.
     v18은 수비 팀 전체가 같은 세 줄 기준선을 공유하고(blockOf), 좌우로는 자기 구역(lane)을
     지킨다. 공 쪽 이동은 라인당 몇 단위로 제한하고, 깊이는 라인에서 최대 3.5단위만 벗어난다. */
  function blockOf(side) {
    if (blockCache.frame !== simFrame) { blockCache.frame = simFrame; blockCache.home = null; blockCache.away = null; }
    if (blockCache[side]) { return blockCache[side]; }
    var dir = goalDir(side);
    var ownY = ownGoalY(side);
    var atkSide = side === 'home' ? 'away' : 'home';
    var m = metricsOf(side);
    var sty = styleOf(side);
    var sh = shapeOf(side);
    /* 수비 라인 깊이 — 포메이션 line 지표 · 감독 철학 · 전술 버튼 · 카드(lineYOf) 그대로 */
    var depth = Math.abs(lineYOf(side) - ownY);
    /* 공이 우리 골문 쪽으로 깊이 들어올수록 블록 전체가 내려서고, 멀어지면 올라선다 */
    var threat = progressOf(atkSide, ball.y);        /* 1 = 우리 골문 앞 */
    depth = clamp(depth + (0.34 - threat) * 11, 6, 56);
    if (play.counterT > 0 && play.counterSide !== side) { depth -= 4; }      /* 역습 대비 라인 하강 */
    if (play.recoverT > 0 && play.recoverSide === side) { depth -= 3; }     /* 볼을 잃고 되돌아오는 중 */
    /* ③ 오프사이드 트랩 — 카드가 살아 있는 동안 4백을 계속 하이 라인으로 민다 (일회성 push 금지)
       v25c (M3) — 올리는 것은 DF·MF 두 줄까지. 최전방(fwY)은 트랩 전 라인에서 계산해,
       공을 되찾은 뒤 이미 상대 라인을 넘어선 채로 서 있던 문제를 없앤다. */
    var trap = (side === 'home' && buffOf('offside') > 0);
    var preTrapDepth = depth;                                   /* 트랩 전 깊이 */
    if (trap) { depth = clamp(depth + 9, 14, 54); }
    var lineY = ownY + dir * depth;
    /* 공이 우리 진영이면 DF 라인은 '공과 골문 사이'로 (트랩 중에는 일자 하이 라인을 그대로 둔다)
       v20 ① — 다만 지시한 라인 높이만큼은 공보다 앞/뒤로 설 수 있다. 그래야 '올리기/내리기'가
       공 위치에 묻히지 않고 실제 대형을 바꾼다. */
    if (!trap && threat > 0.5) {
      var lineAdj = (side === 'home' ? (TOUCH_LINE[touch.line] || 0) : 0);
      var tacNow = effTactic(side);
      var tacAdj = tacNow === 'allout' ? 6 : (tacNow === 'attack' ? 3 : (tacNow === 'defense' ? -4 : 0));
      var capY = ball.y - dir * 2 - dir * (lineAdj + tacAdj);
      if (dir < 0) { lineY = Math.max(lineY, Math.min(capY, WORLD_H - 5)); }
      else { lineY = Math.min(lineY, Math.max(capY, 5)); }
    }
    lineY = clamp(lineY, 5, WORLD_H - 5);
    var bank = Math.max(8.2, Math.abs(bankYOf(side, 'MF') - lineYOf(side)));      /* DF↔MF 간격 */
    var fwGap = Math.max(bank * 2.18, Math.abs(bankYOf(side, 'FW') - lineYOf(side)));
    var fwLineY = trap ? clamp(ownY + dir * preTrapDepth, 5, WORLD_H - 5) : lineY;
    var widthK = clamp(0.93 + (clamp(m.width + sty.width, 20, 99) - 60) / 100 * 0.30, 0.86, 1.04);
    widthK *= sh.width;                                   /* 수비 전술은 폭을 조금 좁힌다 */
    var b = {
      dir: dir, ownY: ownY, threat: threat,
      dfY: lineY,
      mfY: clamp(lineY + dir * bank, 5, WORLD_H - 5),
      fwY: clamp(fwLineY + dir * fwGap, 5, WORLD_H - 5),
      bank: bank, fwGap: fwGap,
      widthK: clamp(widthK, 0.82, 1.06),
      pull: trap ? 3 : 6,                /* 좌우로 공 쪽에 붙을 수 있는 한계(월드 단위) */
      flat: trap,                        /* 이 줄(DF)은 일자 하이 라인으로 강제 */
      lanes: { DF: null, MF: null, FW: null }
    };
    /* ③ 계측: 트랩이 켜져 있고 '수비 중'인 프레임의 4백 평균 y와 일자성(표준편차) */
    if (trap && !(ball.carrier && ball.carrier.side === side)) {
      var ys = [], k, q2, mny = 0, acc = 0, j;
      for (k = 0; k < players.length; k++) {
        q2 = players[k];
        if (q2.side === side && !q2.off && !isGK(q2) && isDefGroup(q2) && q2.kind === 'def') { ys.push(q2.y); }
      }
      v18t.trapFrames += 1;
      v18t.trapLineY = lineY;
      if (ys.length > 1) {
        for (j = 0; j < ys.length; j++) { mny += ys[j]; }
        mny /= ys.length;
        for (j = 0; j < ys.length; j++) { acc += (ys[j] - mny) * (ys[j] - mny); }
        v18t.trapSdSum += Math.sqrt(acc / ys.length);
        v18t.trapSdN += 1;
      }
    }
    blockCache[side] = b;
    return b;
  }

  /* 같은 라인 안의 좌우 최소 간격 — 라인마다 선수가 한 점에 겹치지 않게 한다.
     유소년 축구처럼 10명이 한쪽에 뭉치는 현상을 막는 두 번째 장치(존 폭 유지). */
  function groupLanes(side, group, b) {
    if (b.lanes[group]) { return b.lanes[group]; }
    var list = [], i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== side || p.off || isGK(p) || groupOf(p) !== group) { continue; }
      list.push(p);
    }
    list.sort(function (x, y) {
      if (Math.abs(x.baseX - y.baseX) > 0.01) { return x.baseX - y.baseX; }
      return String(x.name) < String(y.name) ? -1 : 1;
    });
    var gap = group === 'DF' ? 9.5 : 9.0;
    var lanes = [], k;
    for (i = 0; i < list.length; i++) { lanes.push(clamp(50 + (list[i].baseX - 50) * b.widthK, 6, 94)); }
    for (i = 1; i < lanes.length; i++) {
      if (lanes[i] - lanes[i - 1] < gap) { lanes[i] = lanes[i - 1] + gap; }
    }
    for (i = lanes.length - 2; i >= 0; i--) {
      if (lanes[i + 1] - lanes[i] < gap) { lanes[i] = lanes[i + 1] - gap; }
    }
    /* 라인이 좌우로 넘치면 통째로 중앙으로 당겨 폭을 균등하게 유지 */
    var lo = lanes.length ? lanes[0] : 50, hi = lanes.length ? lanes[lanes.length - 1] : 50;
    if (lo < 5) { for (i = 0; i < lanes.length; i++) { lanes[i] += 5 - lo; } }
    if (hi > 95) { for (i = 0; i < lanes.length; i++) { lanes[i] -= hi - 95; } }
    var map = {};
    for (i = 0; i < list.length; i++) { map[list[i].player.id] = clamp(lanes[i], 4, 96); }
    b.lanes[group] = map;
    return map;
  }

  function defendTarget(p) {
    var z = p.zone;
    var a = anchorOf(p);
    var g = groupOf(p);
    var b = blockOf(p.side);
    var lineY = g === 'DF' ? b.dfY : (g === 'MF' ? b.mfY : b.fwY);
    /* 좌우: 내 구역(lane)을 지키고, 공 쪽으로는 b.pull 만큼만 붙는다 (존 디펜스) */
    var laneMap = groupLanes(p.side, g, b);
    var lane = laneMap[p.player.id] != null ? laneMap[p.player.id] : (50 + (a.x - 50) * b.widthK);
    var laneHold = clamp(1 - (Math.hypot(p.x - ball.x, p.y - ball.y) - 26) / 60, 0.30, 1);
    var pull = clamp((ball.x - 50) * 0.22, -b.pull, b.pull) * laneHold;
    var tx = lane + pull;
    /* 윙어·풀백·윙백은 수비 시에도 터치라인 폭을 지켜 상대 전환 패스를 막는다 */
    if (p.pos === 'LWF' || p.pos === 'LWB' || p.pos === 'LB' || p.pos === 'RWF' || p.pos === 'RWB' || p.pos === 'RB') {
      tx = isLeftLane(p) ? Math.min(tx, 12) : Math.max(tx, 88);
    }
    /* 깊이: 세 줄 기준선 + 아주 작은 공 오프셋 */
    var ballOff = clamp((ball.y - 60) * 0.05, -2.6, 2.6) * (g === 'DF' ? 1 : 0.7);
    var ty = lineY + ballOff;
    /* 맨마킹: 좌우로는 조금만 따라가고(제 구역을 벗어나지 않게), 깊이는 라인에서 3.5단위까지 */
    if (p.mark && !p.mark.off) {
      var mk = p.mark;
      var w = g === 'DF' ? 0.30 : 0.20;
      tx = tx * (1 - w) + mk.x * w;
      tx = clamp(tx, lane - 4, lane + 4);
      ty = lineY + ballOff * 0.4 + clamp((mk.y - lineY) * 0.22, -3.5, 3.5);
    }
    /* ③ 트랩 중 4백은 완전히 같은 y — 일자 하이 라인 */
    if (b.flat && g === 'DF') { ty = b.dfY; }
    /* 3줄 블록: 자기 라인에서 크게 벗어나지 않게 (DF ±5 / MF·FW ±7) */
    var band = g === 'DF' ? 5 : 7;
    ty = clamp(ty, lineY - band, lineY + band);
    p.tx = clamp(tx, z.xMin, z.xMax);
    p.ty = clamp(ty, 3, WORLD_H - 3);
    p.kind = 'def';
  }

  function gkTarget(p) {
    var z = p.zone;
    var gy = ownGoalY(p.side);
    var dir = goalDir(p.side);
    var depth = 6;
    if (ball.kind === 'shot') { depth = 4.2; }
    var tx = clamp(50 + (ball.x - 50) * 0.55, 40, 60);
    var ty = gy - dir * depth;
    p.tx = clamp(tx, z.xMin, z.xMax);
    p.ty = clamp(ty, z.yMin, z.yMax);
    p.kind = 'gk';
  }

  /* ─────────────────────────  이동  ───────────────────────── */
  function movePlayer(p, dt) {
    var spd = 9.2 + (p.player.stats.spd / 99) * 8.2;
    if (isGK(p)) { spd = 10.4 + p.player.stats.spd / 40; }
    if (ball.carrier === p) { spd *= 0.93; }
    /* v16 — 볼을 잃은 팀의 수비 라인은 즉시 자기 골문으로 되돌아간다 */
    if (play.recoverT > 0 && play.recoverSide === p.side && !isGK(p) && (isDefGroup(p) || p.pos === 'DM')) {
      spd *= 1.26;
    }
    if (buffOf('tempo') > 0) { spd *= 1.18; }
    if (buffOf('roar') > 0) { spd *= 1.1; }
    if (p.side === 'home' && mfx('speed') > 0) { spd *= 1 + Math.min(0.12, mfx('speed') * 0.006); }
    if (p.stun > 0) { p.stun -= dt; spd *= 0.32; }
    /* v29 ② — 세트피스 대형으로 빨리 자리를 잡는다(대형이 화면에 읽히게) */
    if (play.phase === 'setpiece' && p.setPos) { spd *= 2.2; }
    var dx = p.tx - p.x, dy = p.ty - p.y;
    var d = Math.hypot(dx, dy);
    if (d > 0.35) {
      var step = Math.min(d, spd * dt);
      p.vx = (dx / d) * spd;
      p.vy = (dy / d) * spd;
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      p.phase += dt * (6.4 + spd * 0.26) * Math.min(1.35, d / 3 + 0.55);
      p.frame = Math.floor(p.phase) % 4;
      if (Math.abs(dx) > 0.4) { p.facing = dx > 0 ? 1 : -1; }
      p.moving = true;
      p.speed = spd;
      /* v25 ② — 전력 질주·드리블 잔상(trail) + 발밑 잔디 먼지 */
      var ti;
      if (p.trail) {
        for (ti = p.trail.length - 1; ti >= 0; ti--) {
          p.trail[ti].t += dt;
          if (p.trail[ti].t > 0.3) { p.trail.splice(ti, 1); }
        }
      }
      if (!isGK(p) && spd > 12.2) {
        p.trailT = (p.trailT || 0) + dt;
        if (p.trailT > 0.05) {
          p.trailT = 0;
          if (!p.trail) { p.trail = []; }
          p.trail.push({ x: p.x, y: p.y, t: 0 });
          if (p.trail.length > 4) { p.trail.shift(); }
        }
      }
      p.dustT = (p.dustT || 0) + dt;
      if (spd > 11.4 && p.dustT > 0.12) { p.dustT = 0; fxDust(p, 1, 0.75); }
    } else {
      p.vx = 0; p.vy = 0; p.moving = false; p.frame = 0; p.speed = 0;
    }
    p.x = clamp(p.x, 2, WORLD_W - 2);
    p.y = clamp(p.y, 2, WORLD_H - 2);

    /* 체력 소모 — 달린 양·지구력·압박 성향으로 결정. GK는 절반 */
    if (!p.off) {
      var toughS = (p.player && p.player.stamina) ? p.player.stamina : 6;
      var drain = (0.60 + (p.moving ? 0.21 : 0)) * (1.22 - toughS * 0.038) * (96 / MATCH_SECONDS);
      if (isGK(p)) { drain *= 0.55; }
      if (p.side === 'home' && buffOf('press') > 0) { drain *= 1.10; }
      p.stam = clamp(p.stam - drain * dt, 3, 100);
    }
  }

  /* 화면 픽셀 → 월드 단위 환산비 (원근 투영 때문에 월드 단위 간격은 화면에서 왜곡된다)
     v = 폭(x) 비율 — 화면 x는 공격축(y), 화면 y는 폭(x)에 대응한다. */
  function sepRates(v) {
    var l = field.x + field.w * (PROJ.farL + (PROJ.nearL - PROJ.farL) * v);
    var r = field.x + field.w * (PROJ.farR + (PROJ.nearR - PROJ.farR) * v);
    return {
      ky: Math.max(0.5, (r - l) / WORLD_H),
      kx: Math.max(0.2, field.h * (PROJ.nearY - PROJ.farY) * (0.52 + 0.96 * v) / WORLD_W)
    };
  }
  /* 두 지점의 '화면 픽셀' 거리 — 토큰 크기와 같은 기준으로 겹침을 잰다 */
  function pxDist(ax, ay, bx, by) {
    var rt = sepRates(clamp((ax + bx) / 2 / WORLD_W, 0, 1));
    return Math.hypot((ay - by) * rt.ky, (ax - bx) * rt.kx);
  }

  /* ─────────────────────────  v16 전 프레임 Hard Separation  ─────────────────────────
     v8~v15는 화면 최소 간격을 토큰 지름의 0.70배로 두고, 공 소유자 쌍은 0.26배까지 풀어 줘서
     GK·공격수·수비수가 한 점에서 한 덩어리로 보였다. v16은 예외 없이 모든 쌍을
     '토큰 지름 × 1.18' 이상 벌리고, 3회 relaxation으로 매 틱 끝에서 강제한다. */
  var SEP_K = 1.30;        /* v25 ② — 최소 중심 거리 = 토큰 지름 × 1.30 (몰려 보이는 체감 완화) */
  var sepMove = 0;         /* 계측: 이번 틱 분리로 밀린 총 거리(월드 단위) */
  function separate() {
    var i, j, a, b, dx, dy, rt, sx, sy, dpx, minPx, push, ux, uy, sa, sb, pass, m;
    sepMove = 0;
    var guardOn = play.phase !== 'setpiece';
    var gkNeed = 1.6 * 2 * SPR_H * TOKEN_R;
    for (pass = 0; pass < 4; pass++) {
      /* v16 — GK 보호 반경(위치 강제): 공을 몬 1명 말고는 상대 GK 코앞에 서지 못한다 */
      if (guardOn) {
        for (j = 0; j < 2; j++) {
          var og = goalkeeper(j === 0 ? 'home' : 'away');
          if (!og) { continue; }
          var grt = sepRates(clamp(og.x / WORLD_W, 0, 1));
          for (i = 0; i < players.length; i++) {
            a = players[i];
            if (a.off || a.side === og.side || isGK(a) || a === ball.carrier) { continue; }
            var gdx = a.x - og.x, gdy = a.y - og.y;
            var gd = Math.hypot(gdy * grt.ky, gdx * grt.kx);
            if (gd < gkNeed) {
              if (gd < 0.01) { gdx = 0; gdy = 1; gd = 1; }
              a.x = clamp(og.x + gdx * gkNeed / gd, 2, WORLD_W - 2);
              a.y = clamp(og.y + gdy * gkNeed / gd, 2, WORLD_H - 2);
            }
          }
        }
      }
      for (i = 0; i < players.length; i++) {
        a = players[i];
        if (a.off) { continue; }
        for (j = i + 1; j < players.length; j++) {
          b = players[j];
          if (b.off) { continue; }
          dx = b.x - a.x; dy = b.y - a.y;
          rt = sepRates(clamp((a.x + b.x) / 2 / WORLD_W, 0, 1));
          sx = -dy * rt.ky;              /* 화면 x 차이(px) */
          sy = dx * rt.kx;               /* 화면 y 차이(px) */
          dpx = Math.hypot(sx, sy);
          sa = PROJ.s0 + (PROJ.s1 - PROJ.s0) * clamp(a.x / WORLD_W, 0, 1);
          sb = PROJ.s0 + (PROJ.s1 - PROJ.s0) * clamp(b.x / WORLD_W, 0, 1);
          minPx = 2 * SPR_H * TOKEN_R * (sa + sb) / 2 * SEP_K;
          if (dpx < 0.0001) {              /* 완전히 같은 점 — 결정적 방향으로 갈라놓는다 */
            dx = 0.4 * (i % 2 ? 1 : -1); dy = 0.4 * (j % 2 ? 1 : -1);
            sx = -dy * rt.ky; sy = dx * rt.kx; dpx = Math.hypot(sx, sy);
          }
          if (dpx < minPx) {
            push = (minPx - dpx) * 0.5;    /* 두 선수가 반씩 나눠 밀린다 */
            ux = sx / dpx; uy = sy / dpx;
            a.x -= (uy * push) / rt.kx;
            a.y += (ux * push) / rt.ky;
            b.x += (uy * push) / rt.kx;
            b.y -= (ux * push) / rt.ky;
            m = clamp((minPx - dpx) / 2 / Math.min(rt.kx, rt.ky) * 0.5, 0, 2);
            sepMove += m;
          }
        }
      }
      for (i = 0; i < players.length; i++) {
        if (players[i].off) { continue; }
        players[i].x = clamp(players[i].x, 2, WORLD_W - 2);
        players[i].y = clamp(players[i].y, 2, WORLD_H - 2);
      }
    }
  }

  /* ─────────────────────────  볼 · 패스 · 슛  ───────────────────────── */
  function bubble(p, text, color, t) {
    if (!p) { return; }
    p.bubble = { text: text, color: color || '#d8ff8a', t: t || 1.5, t0: t || 1.5 };
    p.skillT = Math.max(p.skillT || 0, t || 1.2);
  }

  /* v16 — 같은 문구 말풍선이 여러 명에게 동시에 뜨면 글자가 겹친다. 문구당 한 번에 1명만. */
  function bubbleUnique(p, text, color, t) {
    var i, q;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q !== p && q.bubble && q.bubble.text === text && q.bubble.t > 0.3) { return false; }
    }
    bubble(p, text, color, t);
    return true;
  }

  function giveBall(p) {
    if (!p) { return; }
    /* v15 — 오프사이드 깃발이 올라간 선수가 공에 관여하면 그 자리에서 간접 프리킥 */
    if (ball.offside && !ball.offside.done && ball.offside.player === p && ball.offside.player.side === p.side) {
      awardOffside(p);
      return;
    }
    ball.offside = null;
    ball.lastTouch = p.side;
    ball.contest = null;
    var prev = ball.carrier ? ball.carrier.side : ball.from ? ball.from.side : null;
    if (ball.carrier && ball.carrier !== p) { ball.carrier.stun = Math.max(ball.carrier.stun, 0.15); }
    ball.carrier = p;
    ball.from = null;
    ball.receiver = null;
    ball.kind = 'idle';
    ball.flight = 0;
    ball.dur = 0;
    ball.aim = null;
    ball.shot = null;
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    p.throughRun = null;
    p.dribbleT = 0;
    play.swarmed = false;
    ball.passFlag = false;
    /* v19 ① — 전환 창의 티키타카는 템포를 한 박자 늦춰 삼각 패스 각을 만든다 */
    var tempoHold = (trans.side === p.side && trans.kind === 'triangle') ? 0.24 : 0;
    actionTimer = 0.34 + tempoHold + Math.random() * 0.26;
    play.atkSide = p.side;
    play.looseT = 0;
    if (prev && prev !== p.side) {
      onTurnover(prev, p);
    }
    if (p.side === 'home') { charge(0.4); }
  }

  function counterLongBall(p) {
    var dirF = p.side === 'home' ? 1 : -1;
    var best = null, bv = -1e9, i, q, fwd, open, v;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.side !== p.side || q === p || q.off || isGK(q)) { continue; }
      fwd = (p.y - q.y) * dirF;
      if (fwd < 8) { continue; }
      open = nearestOpponent(q, 26).dist;
      v = fwd * 1.6 + open * 0.85 + (isFwdGroup(q) ? 14 : 0);
      if (v > bv) { bv = v; best = q; }
    }
    if (!best) { return false; }
    bubble(p, '⚡ 탈취 후 롱패스!', '#9fd8ff', 1.3);
    say('⚡ ' + U.josa(short(p.name), '이/가') + ' 탈취 직후 단번에 전방으로 롱패스!', 'normal');
    return kickPass(p, best, 'through');
  }

  function onTurnover(fromSide, toP) {
    var prog = progressOf(toP.side, toP.y);
    play.recoverSide = fromSide;
    play.recoverT = 2.1;    /* v16 — 되돌아오는 시간을 조금 더 준다 (수비 블록 재형성) */
    play.burstOn = false;
    var sty = styleOf(toP.side);
    /* v19 ① — 볼을 뺏은 쪽에 5초 전환(Transition) 창을 연다. 스타일마다 전환 방식이 다르다. */
    trans.side = toP.side;
    trans.t = TRANS_SECONDS;
    trans.t0 = TRANS_SECONDS;
    trans.kind = STYLE_TRANS[styleKeyOf(toP.side)] || 'normal';
    v19t.trans[toP.side] += 1;
    if (prog < 0.5 && sty.longBallAfterWin > 0 && chance(sty.longBallAfterWin)) {
      tele.longwin[toP.side] += 1;
      if (counterLongBall(toP)) { return; }
    }
    if (prog < 0.45) {
      play.counterSide = toP.side;
      play.counterT = 5.5;
      setSit(toP.side === 'home' ? 'counterAtk' : 'counterDef', '', true);
      say(toP.side === 'home'
        ? '⚡ 볼을 끊고 빠른 역습! 상대 수비가 흐트러졌습니다!'
        : '⚠️ 위험합니다! 상대 역습이 시작됩니다 — 수비 라인 복귀!', 'tackle');
    }
    /* v19 ① — 역습·직선 롱볼 팀은 전환 창에서 곧바로 세로 스루패스로 한 번에 찌른다 */
    if (trans.kind === 'vertical' && prog < 0.70 && chance(0.5)) {
      if (transitionThrough(toP)) { return; }
    }
    /* 전환 창에서는 공격수·미드필더가 수비 라인 뒤 공간으로 동시에 달린다 */
    transitionRuns(toP.side, trans.kind);
  }

  /* v19 ① — 전환 창의 세로 스루패스: 공보다 앞서 있고 상대가 비워 둔 공간으로 찌른다 */
  function transitionThrough(p) {
    var dirF = goalDir(p.side);
    var best = null, bv = -1e9, i, q, fwd, open, v;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.side !== p.side || q === p || q.off || isGK(q)) { continue; }
      fwd = (p.y - q.y) * dirF;
      if (fwd < 5) { continue; }
      if (isOffsidePos(q)) { continue; }
      open = nearestOpponent(q, 24).dist;
      v = fwd * 1.6 + open * 1.15 + (isFwdGroup(q) ? 15 : (isMidGroup(q) ? 5 : 0));
      if (v > bv) { bv = v; best = q; }
    }
    if (!best || bv < 34) { return false; }
    bubble(p, '⚡ 전환 스루패스!', '#9fd8ff', 1.2);
    say('⚡ ' + U.josa(short(p.name), '이/가') + ' 탈취 후 망설임 없이 전방으로 — 전환 창입니다!', 'normal');
    v19t.transThrough += 1;
    return kickPass(p, best, 'through');
  }

  /* v19 ① — 전환 창의 동시 침투: 최대 2명이 수비 라인 등짝 공간으로 출발한다 */
  function transitionRuns(side, kind) {
    var want = kind === 'vertical' ? 2 : (kind === 'wide' ? 2 : (kind === 'normal' ? 1 : 1));
    var dir = goalDir(side);
    var line = supportLineY(side);
    var cand = [], i, p, done = 0, prog;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== side || p.off || isGK(p) || isDefGroup(p)) { continue; }
      if (p.runT > 0.25) { continue; }
      prog = progressOf(side, p.y);
      cand.push({ p: p, v: prog * 30 + (isFwdGroup(p) ? 18 : 0) + Math.random() * 6 });
    }
    cand.sort(function (a, b) { return b.v - a.v; });
    for (i = 0; i < cand.length && done < want; i++) {
      p = cand[i].p;
      p.runTo = {
        x: clamp(p.x + (isLeftLane(p) ? -2.5 : 2.5), 5, WORLD_W - 5),
        y: clamp(line - dir * range(1.5, 5), 4, WORLD_H - 4)
      };
      p.runT = 1.9;
      done += 1;
    }
    if (done && chance(0.5)) { v19t.transRuns += 1; }
    if (done && chance(0.4)) { bubbleUnique(cand[0].p, '🏃 전환 침투!', '#9fd8ff', 1.1); }
  }

  /* ───────────────────────  v19 ② — AI 감독의 실시간 맞대응  ───────────────────────
     55 · 70 · 80분에 스코어 차이를 다시 읽고, 점수 상황에 따라 원정 팀의 전술 포스처를
     바꾼다. 포스처는 effTactic()을 통해 라인 높이(blockOf) · 압박 강도(pressConfig) ·
     전진 인원(shapeOf)으로 즉시 반영되므로, 눈 앞에서 상대 대형이 달라진다. */
  function aiPostureTick() {
    if (aiCheckIdx >= AI_CHECKS.length) { return; }
    var mn = minute();
    if (mn < AI_CHECKS[aiCheckIdx]) { return; }
    var mark = AI_CHECKS[aiCheckIdx];
    aiCheckIdx += 1;
    var diff = M.awayScore - M.homeScore;            /* AI(away) 기준 득실 */
    var want = 'balanced';
    if (diff <= -2) { want = 'attack'; }                                    /* 두 골 이상 뒤지면 바로 전진 */
    else if (diff === -1) { want = mark >= 70 ? 'attack' : 'balanced'; }    /* 한 골 뒤짐 — 70분부터 총공세 */
    else if (diff >= 2) { want = mark >= 55 ? 'defense' : 'balanced'; }     /* 두 골 앞서면 잠근다 */
    else if (diff === 1) { want = mark >= 70 ? 'defense' : 'balanced'; }    /* 한 골 리드 — 마지막 20분 수비 */
    if (want === aiPosture) { return; }
    var prev = aiPosture;
    aiPosture = want;
    v19t.aiShifts.push({ min: mn, from: prev, to: want, diff: diff });
    var label = want === 'attack' ? '공격 전환' : (want === 'defense' ? '수비 전환' : '균형 복귀');
    var sub = want === 'attack' ? '라인을 끌어올린다 · 전진 인원 +1'
      : (want === 'defense' ? '3줄 블록을 내린다 · 볼 소유 우선' : '다시 균형으로');
    banner('🔄 상대 감독 전술 변경', teamShort('away') + ' · ' + label);
    bannerT = 2.6;
    setSit('tactic', teamShort('away') + ' ' + label, true);
    say('🔄 상대 벤치가 움직입니다 — ' + teamShort('away') + ' 감독이 ' + label + '을 지시합니다. ' + sub, 'tactic');
    sayExp(want === 'attack'
      ? '상대가 라인을 확 올렸습니다. 등짝 공간이 열렸으니 한 번에 뒤를 찌를 타이밍입니다.'
      : (want === 'defense'
        ? '상대가 내려앉아 블록을 세웁니다. 박스 앞 공간을 어떻게 열어야 할지가 관건입니다.'
        : '상대가 다시 균형을 잡았습니다. 서두를 필요 없습니다.'));
  }

  function kickBall(from, tx, ty, speed, kind, receiver, loft) {
    var dx = tx - ball.x, dy = ty - ball.y;
    var d = Math.max(1.2, Math.hypot(dx, dy));
    if (from) { ball.lastTouch = from.side; }
    if (kind === 'pass') { SND.pass(); }
    else if (kind !== 'shot') { SND.kick(0.5); }
    ball.carrier = null;
    ball.from = from || null;
    ball.receiver = receiver || null;
    ball.kind = kind;
    ball.flight = 0;
    ball.dur = d / speed;
    ball.vx = dx / ball.dur;
    ball.vy = dy / ball.dur;
    ball.aim = { x: tx, y: ty };
    /* v29 — 곡선 궤적 기준점(출발 좌표). bend 가 있으면 updateBall 이 직선 위에
       수직 오프셋을 더해 잔디 위 곡선을 그린다(종점은 aim 그대로). */
    ball.bx0 = ball.x; ball.by0 = ball.y;
    if (!ball.bend) { ball.bend = 0; }
    ball.crossKind = null;
    ball.trail = [{ x: ball.x, y: ball.y, z: 0 }];
    /* 높이: 로프트가 있으면 발을 떠나 포물선을 그린다 (땅볼 패스는 z=0) */
    if (loft) {
      ball.vz = BALL_G * ball.dur * (0.48 + 0.22 * Math.min(1, d / 45));
      ball.z = 0.8;
    } else {
      ball.vz = 0;
      ball.z = 0;
    }
    M.phase = kind === 'shot' ? 'shot' : 'pass';
  }

  /* ─────────────────────────  v15 진짜 축구 규칙: 오프사이드  ─────────────────────────
     패스 출발 순간 ① 상대 진영 ② 공보다 앞 ③ 상대 골키퍼를 뺀 최후방 수비수보다 앞 → 오프사이드.
     부심 깃발·점선 라인을 2초 남기고, 그 선수가 공에 관여하는 순간 휫슬 → 상대 간접 프리킥. */
  function offsideLineY(defSide) {
    var line = null, i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== defSide || p.off || isGK(p)) { continue; }
      if (line === null) { line = p.y; }
      else if (defSide === 'home') { line = Math.max(line, p.y); }
      else { line = Math.min(line, p.y); }
    }
    if (line === null) { line = defSide === 'home' ? WORLD_H : 0; }
    return line;
  }

  /* v16 — 공격수 위치 기준선: 상대 최후방 '두 번째' 선수 (GK 포함).
     GK가 가장 깊으면 그 앞 수비수가 라인이 되므로, 공격수가 GK 코앞까지 빨려 들어가지 않는다. */
  function supportLineY(atkSide) {
    var defSide = atkSide === 'home' ? 'away' : 'home';
    var ys = [], i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== defSide || p.off) { continue; }
      ys.push(p.y);
    }
    if (!ys.length) { return defSide === 'home' ? WORLD_H : 0; }
    ys.sort(function (a, b) { return a - b; });
    if (defSide === 'away') { return ys[Math.min(1, ys.length - 1)]; }   /* away 골문 = y 0 */
    return ys[Math.max(0, ys.length - 2)];                                /* home 골문 = y 120 */
  }

  function isOffsidePos(q) {
    if (!q || q.off) { return false; }
    if (progressOf(q.side, q.y) < 0.5) { return false; }
    var line = offsideLineY(q.side === 'home' ? 'away' : 'home');
    var beyond = q.side === 'home' ? (q.y < line - 0.8) : (q.y > line + 0.8);
    if (!beyond) { return false; }
    return q.side === 'home' ? (q.y < ball.y - 0.4) : (q.y > ball.y + 0.4);
  }

  function offsideCheck(target) {
    if (!target || target.off) { return null; }
    var side = target.side;
    if (progressOf(side, target.y) < 0.5) { return null; }
    var line = offsideLineY(side === 'home' ? 'away' : 'home');
    var beyond = side === 'home' ? (target.y < line - 1.8) : (target.y > line + 1.8);
    if (!beyond) { return null; }
    var ahead = side === 'home' ? (target.y < ball.y - 0.4) : (target.y > ball.y + 0.4);
    if (!ahead) { return null; }
    return { line: line, x: target.x, y: target.y };
  }

  function flagOffside(q, ofs) {
    if (v15) {
      v15.dbg = v15.dbg || [];
      v15.dbg.push([q.pos, Math.round(q.y), Math.round(ofs.line), Math.round(ball.y)]);
      if (v15.dbg.length > 60) { v15.dbg.shift(); }
    }
    ball.offside = { player: q, x: ofs.x, y: ofs.y, line: ofs.line, done: false };
    flagShow = { t: 2.8, y: ofs.line, side: q.side };
    bubble(q, '🚩', '#ffd85a', 1.8);
  }

  function awardOffside(p) {
    var defSide = p.side === 'home' ? 'away' : 'home';
    var line = ball.offside ? ball.offside.line : offsideLineY(defSide);
    if (v15) { v15.offside[p.side] += 1; }
    logEvt('offside', p.side, p.x, p.y);
    flagShow = { t: 2.4, y: line, side: p.side };
    banner('🚩 오프사이드!', teamShort(defSide) + ' 간접 프리킥');
    bannerT = 1.9;
    say('🚩 오프사이드! ' + U.josa(short(p.name), '이/가') + ' 패스 순간 수비 라인보다 앞서 있었습니다 — ' +
      teamShort(defSide) + ' 간접 프리킥.', 'tackle');
    SND.whistle();
    sayExp(pick([
      '라인이 정말 칼같았습니다. 발끝 하나 차이로 오프사이드가 됩니다.',
      '공격수의 스타트 타이밍이 조금 빨랐습니다. 반 박자만 참았어야 했어요.',
      '수비가 라인을 아주 잘 올려 잡았습니다. 훈련이 잘 된 팀입니다.'
    ]));
    ball.offside = null;
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    ball.shot = null;
    ball.x = clamp(p.x, 8, 92);
    ball.y = clamp(p.y, 8, 112);
    freeKick(defSide, ball.x, ball.y, true);
    setSit('offside', short(p.name) + ' 오프사이드', true);
  }

  function isBehindLine(q) {
    var defSide = q.side === 'home' ? 'away' : 'home';
    var line = defLineY(defSide);
    return q.side === 'home' ? q.y < line : q.y > line;
  }

  function passBall(p) {
    var tiki = buffOf('tiki') > 0;
    var through = buffOf('through') > 0;
    var sty = styleOf(p.side);
    /* v29 ① — 측면에서 압박을 받는 볼 소유자는 반대편 넓게 열린 동료를 먼저 본다.
       수비가 공 쪽으로 몰리면 약측은 반드시 비어 있고, 그 한 번의 전환이 가장 값싼 탈압박이다. */
    var oppNear = nearestOpponent(p, 16);
    var pressed = oppNear.dist < 7.4;
    var onFlank = p.x < 32 || p.x > 68;
    var switchUrge = pressed && onFlank && play.stage !== 'build';
    var best = null, bestScore = -1e9, i, q, d, fwd, open, score;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q === p || q.side !== p.side || q.off) { continue; }
      d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 5 || d > (sty.maxPass || 55)) { continue; }
      if (isGK(q)) {
        /* 골키퍼는 최후의 안전 패스만 */
        if (play.stage !== 'build' || d > 26) { continue; }
      }
      fwd = (p.y - q.y) * (p.side === 'home' ? 1 : -1);
      open = nearestOpponent(q, 26).dist;
      if (play.stage === 'build') {
        score = -Math.abs(d - 17) * 0.55 + open * 1.35 - Math.max(0, fwd - 6) * 0.5
          + (isMidGroup(q) ? 7 : 0) + (isDefGroup(q) ? 4 : 0);
      } else if (play.stage === 'mid') {
        score = fwd * 1.35 - d * 0.16 + open * 1.3 - (fwd < -7 ? 12 : 0);
      } else {
        score = fwd * 1.75 - d * 0.10 + open * 1.35 - (fwd < -10 ? 22 : 0);
      }
      if (tiki && d < 18) { score += 9; }
      if (tiki && d > 30) { score -= 6; }
      if (through && isBehindLine(q) && open > 4) { score += 26; }
      if (buffOf('build') > 0 && d < 26) { score += 7; }
      if (p.side === 'away' && buffOf('def') > 0 && isFwdGroup(q)) { score -= 16; }
      if (p.side === 'away' && buffOf('offside') > 0 && isBehindLine(q)) { score -= 12; }
      /* v15 — 이미 오프사이드 위치에 선 동료에게는 패스를 넣지 않는다 (라인을 타는 타이밍)
         v25c (M3) — 달리는 중(runT)이 아닌데 오프사이드 위치면 아예 후보에서 뺀다.
         후방에서 걷어낸 볼이 라인을 넘어선 최전방에 걸려 우리 오프사이드만 늘었다. */
      if (isOffsidePos(q)) {
        /* 후방(자기 진영)에서 넘기는 볼이면 아예 후보에서 빼고, 그 밖에는 큰 감점만 */
        if (!(q.runT > 0.2) && progressOf(p.side, ball.y) < 0.5) { continue; }
        score -= 46;
      }
      /* 감독 조직력 업: 오프더볼 위치 선정 → 전진 옵션을 먼저 본다(작게) */
      if (p.side === 'home' && mfx('org') > 0) {
        score += Math.min(18, Math.max(0, fwd)) * mfx('org') * 0.03;
      }
      if (q.mark && q.mark === p) { score -= 4; }
      /* v29 ① — 측면 압박 탈출: 반대편 넓은 동료에게 주는 비용을 크게 낮춘다 */
      if (switchUrge) {
        var crossD = Math.abs(q.x - p.x);
        if (crossD > 30) { score += 30 + Math.min(12, open * 0.8); }
        else if (crossD > 18) { score += 8; }
        else { score -= 10; }
        if (isGK(q)) { score -= 40; }
        if (Math.abs(q.x - 50) > 30 && open > 8) { score += 8; }   /* 터치라인 폭 유지형 */
      }
      /* 반대편 전환: 볼에서 먼 쪽 윙어·풀백이 비어 있으면 적극적으로 본다 */
      if (Math.abs(q.x - p.x) > 22 && open > 6) { score += 9; }
      /* v14 감독 전술: 짧은 패스 취향 / 직선 롱볼 / 수비 뒤 스루패스 성향 */
      score += sty.shortBias * (d < 18 ? 12 : (d > 30 ? -12 : 0));
      score += sty.longBias * (d > 28 ? 12 : 0);
      if (isBehindLine(q) && open > 4) { score += (sty.throughBias - 1) * 11; }
      /* v19 ① — 전환 창: 세로로 찌르는 팀은 앞선 동료를 먼저 본다 */
      if (trans.side === p.side && trans.kind === 'vertical' && fwd > 0) {
        score += fwd * 0.9 + (isFwdGroup(q) ? 8 : 0);
      }
      /* v20 ② — 드롭형 DM(레지스타·볼플레잉)과 폴스나인은 빌드업의 안전한 전진 패스 각 */
      if (play.stage === 'build' && d < 28 && (mroleOf(q) === 'regista' || mroleOf(q) === 'bpd' || q.pos === 'CF')) {
        score += 7;
      }
      /* v20 ② — 인버티드 윙어를 향한 패스는 안쪽 발 앞 슈팅 각으로 */
      if (isInverted(q) && (play.stage === 'wide' || play.stage === 'final')) { score += 5; }
      /* v20 ① — 공격 루트 지시: 고른 레인의 동료에게 가중치, 반대쪽은 감점 */
      if (p.side === 'home' && touch.focus !== 'balance') {
        var fdel = Math.abs(q.x - TOUCH_FOCUS_X[touch.focus]);
        score += (fdel < 14 ? 11 : (fdel < 28 ? 4 : -4));
      }
      score += Math.random() * 5;
      /* v21 ② — 자기 진영 정체 중에는 무조건 앞으로: 백패스·CB 돌리기를 감점하고 전진 패스에 힘을 준다 */
      if (ownHalfSide === p.side && ownHalfT > 2.4) {
        score += Math.max(0, fwd) * 2.4;
        if (isGK(q)) { score -= 30; }
        if (fwd < 0) { score -= 14; }
      }
      if (score > bestScore) { bestScore = score; best = { q: q, d: d, fwd: fwd, open: open }; }
    }
    if (!best) { return false; }
    var type = 'short';
    /* v29 ① — 압박 받는 측면 볼은 사이드 전환 롱패스가 우선 후보 */
    var switchPick = switchUrge && best && Math.abs(best.q.x - p.x) > 30 && best.open > 7.5;
    if (switchPick) { type = 'switchLong'; }
    else if (play.stage === 'final' && (p.x < 24 || p.x > 76) && best.fwd > -2) { type = 'cross'; }
    else if (through && best.fwd > 5 && best.open > 4) { type = 'through'; }
    else if (Math.abs(best.q.x - p.x) > 20 && chance(0.62)) { type = 'switch'; }
    else if (play.stage === 'mid' && best.fwd > 8 && best.open > 8 && chance(0.45)) { type = 'through'; }
    else if (best.fwd > 5) { type = 'progressive'; }
    /* v14 — 크로스 성향이 낮은 감독(티키타카)은 박스 옆에서 올리지 않고 안으로 접어 연결한다 */
    if (type === 'cross' && !chance(clamp(0.62 * sty.crossBias, 0.12, 0.98))) { type = 'progressive'; }
    /* v14 — 스루패스 성향이 강한 감독(역습·직선)은 중원에서도 뒤공간을 먼저 본다 */
    if (type === 'progressive' && sty.throughBias > 1.2 && best.open > 5 && chance(clamp((sty.throughBias - 1) * 0.5, 0, 0.6))) { type = 'through'; }
    return kickPass(p, best.q, type);
  }

  function kickPass(p, q, type, origin) {
    var dir = goalDir(p.side);
    var tx, ty, speed;
    var err = buffOf('tiki') > 0 ? 1.2 : (buffOf('build') > 0 ? 2.0 : 3.0);
    /* 감독 패스율 업·조직력 업: 패스 오차를 줄인다 */
    if (p.side === 'home') { err *= (1 - clamp(mfx('pass') * 0.05 + mfx('org') * 0.015, 0, 0.55)); }
    if (type === 'through') {
      tx = clamp(q.x + (q.baseX < 50 ? 2 : -2) + range(-err, err), q.zone.xMin, q.zone.xMax);
      ty = clamp(q.y + dir * 11, q.zone.yMin, q.zone.yMax);
      q.throughRun = { x: tx, y: ty, t: 1.8 };
      bubble(p, '⚡ 스루패스!', '#9ff0c4', 1.3);
    } else if (type === 'cross') {
      tx = clamp(50 + (q.baseX - 50) * 0.3 + range(-4, 4), 34, 66);
      ty = attackGoalY(p.side) - dir * 12;
      q.throughRun = { x: tx, y: ty, t: 1.6 };
      bubble(p, '🎯 크로스!', '#ffd98a', 1.3);
      say(U.josa(short(p.name), '이/가') + ' 측면에서 크로스를 올립니다!', 'normal');
    } else if (type === 'cutback') {
      /* v19 ① — 컷백: 터치라인에서 골문 앞으로 낮게 갈라 준다 */
      tx = clamp(50 + (q.baseX - 50) * 0.22 + range(-2, 2), 40, 60);
      ty = attackGoalY(p.side) - dir * 9.5;
      q.throughRun = { x: tx, y: ty, t: 1.2 };
      bubble(p, '↘ 컷백!', '#ffd98a', 1.1);
    } else if (type === 'wall') {
      /* v19 ① — 원투 리턴: 벽을 만들고 돌아 들어온 동료의 발 앞으로 */
      tx = clamp(q.x + q.vx * 0.18, 4, 96);
      ty = clamp(q.y + q.vy * 0.18, 4, 116);
      bubble(p, '↩ 원투 리턴!', '#8ff0b6', 1.0);
    } else if (type === 'longkick') {
      /* v18 ① — GK 롱킥: 전방 미드필더·공격수 머리 위로, 오차를 찍어도 피치 안쪽 */
      tx = clamp(q.x + range(-err * 1.2, err * 1.2), 6, 94);
      ty = clamp(q.y + dir * 5, 6, 114);
      q.throughRun = { x: tx, y: ty, t: 1.4 };
      bubble(p, '🥾 롱킥!', '#ffd98a', 1.2);
    } else if (type === 'switchLong') {
      /* v29 ① — 사이드 전환: 압박을 벗겨 반대편 터치라인 동료에게 크게 넘긴다 */
      tx = clamp(q.x + q.vx * 0.42 + range(-err * 0.7, err * 0.7), 3.5, 96.5);
      ty = clamp(q.y + q.vy * 0.42 + range(-err, err), 4, 116);
      q.throughRun = { x: tx, y: ty, t: 1.5 };
      bubble(p, '↔ 사이드 전환!', '#9fd8ff', 1.5);
      v29t.switchTries += 1;
      v29t.lastSwitch = { min: minute(), from: p.name, to: q.name, side: p.side, done: false, ok: false };
      if (v29t.switches.length < 24) { v29t.switches.push(v29t.lastSwitch); }
      say('↔ 사이드 전환! ' + U.josa(short(p.name), '이/가') + ' 압박을 벗겨 반대편 ' +
        short(q.name) + '에게 크게 돌립니다.', 'tactic');
    } else if (type === 'switch') {
      tx = clamp(q.x + q.vx * 0.4 + range(-err, err), 4, 96);
      ty = clamp(q.y + q.vy * 0.4 + range(-err, err), 4, 116);
      bubble(p, '↔ 전환 패스!', '#9fd8ff', 1.2);
    } else {
      tx = clamp(q.x + q.vx * 0.22 + range(-err, err) * 0.5, 3, 97);
      ty = clamp(q.y + q.vy * 0.22 + range(-err, err) * 0.5, 3, 117);
      if (buffOf('tiki') > 0 && chance(0.5)) { bubble(p, '👟 원투패스!', '#8ff0b6', 1.1); }
    }
    /* v18 ④ — 일반 패스는 오차(err)를 적용한 뒤에도 피치 안쪽 안전 영역으로 클램프한다.
       (터치라인을 넘어가 스로인이 되던 v15~v17의 7% 고의 아웃을 없앴다.
        라인 밖으로 나가는 공은 '빗나간 슛'과 '경합·태클로 튕긴 공'뿐이다) */
    var txRaw = tx, tyRaw = ty;
    tx = clamp(tx, 4, 96);
    ty = clamp(ty, 4, 116);
    if (tx !== txRaw || ty !== tyRaw) { v18t.passClamp += 1; }
    var dist = Math.hypot(tx - p.x, ty - p.y);
    speed = clamp(dist * 2.15, 30, 66) * (buffOf('tiki') > 0 ? 1.12 : 1);
    /* v14 계측: 패스 종류별 카운트 */
    var bucket = type === 'through' ? 'through' : ((type === 'cross' || type === 'cutback') ? 'cross' : (type === 'switch' ? 'switch' : (type === 'longkick' ? 'long' : (dist > 25 ? 'long' : 'short'))));
    if (tele.pass[p.side]) { tele.pass[p.side][bucket] += 1; }
    if (tele.passDist[p.side]) { tele.passDist[p.side].sum += dist; tele.passDist[p.side].n += 1; }
    /* v19 ④ — 패스 연결망(from → to) 카운트: 경기 후 평균 포지션·패스맵에 쓰인다 */
    if (q && q.player && p.player) {
      var pn = passNet[p.side];
      var pkey = p.player.id + '|' + q.player.id;
      if (pn[pkey]) { pn[pkey].n += 1; pn[pkey].from = p.name; pn[pkey].to = q.name; }
      else { pn[pkey] = { from: p.name, to: q.name, fromId: p.player.id, toId: q.player.id, n: 1 }; }
    }
    /* v20 ① 계측: 공이 실제로 어느 레인으로 갔는가 */
    if (p.side === 'home' && q) {
      var laneKey = q.x < 40 ? 'left' : (q.x > 60 ? 'right' : 'center');
      v20t.focusPass[laneKey] += 1;
    }
    /* v15 — 패스 출발 순간 오프사이드 판정 (스로인·골킥·코너 재개 패스는 면제) */
    if (ball.exempt) { ball.exempt = false; }
    else {
      var ofs = offsideCheck(q);
      if (v15) { v15.chk = (v15.chk || 0) + 1; if (ofs) { v15.behind = (v15.behind || 0) + 1; } }
      if (ofs) { flagOffside(q, ofs); }
    }
    /* v19b — 세트피스 재개 패스는 '공이 놓인 자리(origin)'에서 출발한다.
       일반 패스는 지금처럼 패서 발밑에서 시작한다. */
    if (origin && typeof origin.x === 'number' && typeof origin.y === 'number') {
      ball.x = clamp(origin.x, 0, WORLD_W);
      ball.y = clamp(origin.y, 0, WORLD_H);
    } else {
      ball.x = p.x;
      ball.y = p.y + goalDir(p.side) * 0.8;
    }
    kickBall(p, tx, ty, speed, 'pass', q, (type === 'short' || type === 'cutback' || type === 'wall') ? 0 : 1);
    /* v29 ① — 전환 롱패스·크로스는 감기는 곡선 궤적, 스루패스는 침투 보정 */
    if (type === 'switchLong') { ball.bend = range(7, 11); ball.crossKind = 'switch'; }
    else if (type === 'switch') { ball.bend = range(3, 6); ball.crossKind = 'switch'; }
    else if (type === 'cross') { ball.bend = range(4, 7); ball.crossKind = 'cross'; }
    else if (type === 'through') { ball.crossKind = 'through'; }
    setPose(p, type === 'cross' || type === 'through' ? 'kick' : 'pass', 0.28);
    fxRing(p, type === 'through' ? '#9ff0c4' : (type === 'cross' ? '#ffd98a' : '#c8f169'), 0.62);
    fxPassWave(p, tx, ty, type === 'through' ? '#9ff0c4' : (type === 'cross' ? '#ffd98a' : '#c8f169'));
    if (type === 'cross' || type === 'through') { fxKickSwing(p, 1.1, '#fff2c0'); }
    fxPop(p, 0.22);
    ball.assist = p;
    ball.passFlag = true;              /* v18 ④ 계측: 이 공은 '패스'에서 나왔다 */
    stats.passes++;
    if (p.side === 'home') { charge(0.4 + (buffOf('tiki') > 0 ? 0.28 : 0) + (buffOf('build') > 0 ? 0.24 : 0)); }
    play.passLine = {
      x1: p.x, y1: p.y, x2: tx, y2: ty, t: 0.7, t0: 0.7,
      color: type === 'through' ? '#9ff0c4' : (type === 'cross' ? '#ffd98a' : '#c8f169')
    };
    if (chance(0.28)) {
      say(pick([
        U.josa(short(p.name), '이/가') + ' 간결하게 연결합니다.',
        U.josa(short(p.name), '의') + ' 정확한 전진 패스!',
        '패스 한 번에 수비 라인이 흔들립니다!',
        type === 'through' ? '수비 뒷공간으로 날카로운 스루패스!' : '중원에서 볼이 돌아갑니다.'
      ]), 'normal');
    }
    /* v19 ① — 원투(월 패스): 공격 진영에서 미드필더·공격수가 준 패스에, 준 선수가
       앞 공간으로 뛰어 들어가 리턴 패스를 노린다. 리시버가 잡는 순간 되돌려 준다. */
    oneTwo = null;
    if (!isGK(p) && (isMidGroup(p) || isFwdGroup(p)) && progressOf(p.side, p.y) > 0.48 &&
      (type === 'short' || type === 'progressive') && !ball.offside && chance(0.34)) {
      var gapX = clamp(p.x + (q.x - p.x) * 0.22 + (50 - p.x) * 0.08, 5, WORLD_W - 5);
      var gapY = clamp(p.y + goalDir(p.side) * range(6, 11), 5, WORLD_H - 5);
      oneTwo = { passer: p, receiver: q, x: gapX, y: gapY, t: 1.7 };
      p.runTo = { x: gapX, y: gapY };
      p.runT = 1.5;
      v19t.wallTries += 1;
      bubbleUnique(p, '👟 원투!', '#8ff0b6', 1.0);
    }
    return true;
  }

  /* v19 ① — 원투 리턴: 벽 역할을 한 선수가 공간으로 빠져나왔고 마크가 없으면 되돌려 준다 */
  function wallReturn(rv, wt) {
    var p = wt.passer;
    if (!p || p.off || p === rv || ball.carrier !== rv) { return false; }
    if (wt.t <= 0) { return false; }
    if (isOffsidePos(p)) { return false; }
    var opp = nearestOpponent(p, 10);
    if (opp.player && opp.dist < 2.2) { return false; }
    if (Math.hypot(p.x - wt.x, p.y - wt.y) > 13) { return false; }
    if (!chance(0.62)) { return false; }
    v19t.wallPass += 1;
    say('👟 원투 패스! ' + U.josa(short(p.name), '이/가') + ' 벽을 만들고 돌아 들어갑니다!', 'normal');
    return kickPass(rv, p, 'wall');
  }

  function dribble(p) {
    /* v18 ① — GK는 절대 드리블하지 않는다 (안전장치: 다른 경로로 불려도 막힌다) */
    if (isGK(p)) { v18t.gkDribble += 1; return; }
    var dir = goalDir(p.side);
    var opp = nearestOpponent(p, 9);
    var side = opp.player ? (p.x >= opp.player.x ? 1 : -1) : (chance(0.5) ? 1 : -1);
    p.dribbleX = p.x + side * range(3, 8);
    p.dribbleY = p.y + dir * range(6, 12);
    p.dribbleT = 0.55;
    if (chance(0.5)) { bubble(p, '💨 돌파!', '#ffe28a', 1.0); }
    p.kind = 'dribble';
  }

  /* 압박을 받을 때 안전한 백패스/원터치 옵션 */
  function backPass(p) {
    var dir = goalDir(p.side), best = null, bv = -1, i, q, d, back, open, v;
    /* v21 ② — 자기 진영에 오래 묶여 있으면 백패스를 잠근다 (CB·DM·GK 사이 돌리기 방지) */
    var stall = (ownHalfSide === p.side) ? ownHalfT : 0;
    if (stall > 2.6) { v21t.backPassBlocked += 1; return false; }
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q === p || q.side !== p.side || q.off) { continue; }
      d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 6 || d > 24) { continue; }
      back = (q.y - p.y) * dir;                 /* 뒤쪽 = 음수 */
      open = nearestOpponent(q, 22).dist;
      v = open * 1.4 - Math.abs(d - 12) * 0.5 + (back < 0 ? 8 : 0) - back * 0.2;
      /* 정체 중에는 앞쪽 동료만 남긴다 */
      if (stall > 1.6 && back > 0) { continue; }
      if (v > bv) { bv = v; best = q; }
    }
    if (!best || bv < 6) { return false; }
    return kickPass(p, best, 'short');
  }

  /* ─────────────────────────  v18 ① — 골키퍼 배급  ─────────────────────────
     v17까지 GK는 필드 플레이어와 같은 decide()를 타서 패스가 막히면 28% 확률로
     💨 돌파!(dribble)를 시도했다. v18은 GK를 decide() 상단에서 분리해 드리블을 구조적으로 막고,
     ① 좌우로 벌어진 CB·풀백·DM 숏패스 빌드업 ② 압박이 있거나 각이 없으면 전방 MF/FW 롱킥으로만 배급한다. */
  function gkShortTarget(p) {
    var best = null, bv = -1e9, i, q, d, open, v, prog;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q === p || q.side !== p.side || q.off || isGK(q)) { continue; }
      /* 빌드업 대상은 CB · 풀백/윙백 · DM — 최전방 공격수에게는 짧게 주지 않는다 */
      if (!(q.pos === 'CB' || q.pos === 'LB' || q.pos === 'RB' || q.pos === 'LWB' ||
        q.pos === 'RWB' || q.pos === 'DM')) { continue; }
      d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 6 || d > 34) { continue; }
      open = nearestOpponent(q, 26).dist;
      prog = progressOf(p.side, q.y);
      /* 넓게 벌어질수록(좌우 각) · 상대가 멀수록 좋은 각 */
      v = open * 1.4 - Math.abs(d - 19) * 0.5 + Math.min(14, Math.abs(q.x - p.x) * 0.7);
      if (q.pos === 'CB') { v += 4; }
      v -= Math.max(0, 0.34 - prog) * 6;                /* 너무 깊게 내려선 CB는 감점 */
      v += Math.random() * 3;
      if (v > bv) { bv = v; best = q; }
    }
    return best;
  }
  /* v21 ② — 정체 탈출용 전진 타깃: 앞에 있고 마크가 덜 붙은 동료 */
  function forwardTarget(p) {
    var best = null, bv = -1e9, i, q, prog, open, d, ownProg = progressOf(p.side, p.y);
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q === p || q.side !== p.side || q.off || isGK(q)) { continue; }
      d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 7 || d > 46) { continue; }
      prog = progressOf(p.side, q.y);
      if (prog < ownProg + 0.06) { continue; }
      if (isOffsidePos(q)) { continue; }
      open = nearestOpponent(q, 24).dist;
      var v = prog * 50 + open * 1.2 + (isFwdGroup(q) ? 12 : 0) - d * 0.25 + Math.random() * 4;
      if (v > bv) { bv = v; best = q; }
    }
    return best;
  }

  function gkLongTarget(p) {    var best = null, bv = -1e9, i, q, prog, open, v;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q === p || q.side !== p.side || q.off || isGK(q)) { continue; }
      prog = progressOf(p.side, q.y);
      if (prog < 0.30) { continue; }                    /* 전방에 서 있는 선수만 */
      /* v25c (M3) — 골키퍼 롱킥은 오프사이드 위치에 선 선수를 노리지 않는다.
         (후방에서 걷어낸 볼이 라인 밖 최전방에 걸려 우리 오프사이드가 급증했다) */
      if (isOffsidePos(q)) { continue; }
      open = nearestOpponent(q, 26).dist;
      v = prog * 42 + open * 1.1 + (isFwdGroup(q) ? 14 : (isMidGroup(q) ? 6 : 0)) + Math.random() * 4;
      if (v > bv) { bv = v; best = q; }
    }
    return best;
  }
  function gkDistribute(p) {
    var opp = nearestOpponent(p, 30);
    var press = opp.player ? opp.dist : 30;
    var shortT = gkShortTarget(p);
    var longT = gkLongTarget(p);
    /* ① 문전까지 압박이 들어오면 각을 재지 않고 바로 롱킥 */
    if (press < 7 || !shortT) {
      if (longT && kickPass(p, longT, 'longkick')) {
        v18t.gkLong += 1;
        bubble(p, '🥾 롱킥!', '#ffd98a', 1.1);
        return true;
      }
    }
    /* ② 좌우로 벌어진 CB·풀백·DM에게 숏패스 빌드업 */
    if (shortT && kickPass(p, shortT, 'short')) {
      v18t.gkShort += 1;
      bubble(p, '🧤 빌드업', '#bfe8ff', 1.0);
      return true;
    }
    /* ③ 각이 없으면 전방 MF/FW 방향 롱킥 */
    if (longT && kickPass(p, longT, 'longkick')) {
      v18t.gkLong += 1;
      bubble(p, '🥾 롱킥!', '#ffd98a', 1.1);
      return true;
    }
    /* ④ 둘 다 없으면(극히 드묾) 전방으로 안전하게 걷어낸다 */
    var cy = attackGoalY(p.side);
    ball.x = p.x; ball.y = p.y;
    kickBall(p, clamp(p.x + range(-20, 20), 8, 92), cy - goalDir(p.side) * range(30, 55), 58, 'pass', null, 1);
    v18t.gkClear += 1;
    bubble(p, '🥾 걷어낸다!', '#ffd98a', 1.1);
    return true;
  }

  function decide() {
    var p = ball.carrier;
    if (!p) { return; }    /* v18 ① — GK는 이 함수의 나머지 분기를 타지 않는다 (드리블 금지) */
    if (isGK(p)) {
      v18t.gkDecision += 1;
      if (gkDistribute(p)) { actionTimer = 0.42 + Math.random() * 0.22; return; }
      v18t.gkClear += 1;
      actionTimer = 0.5;
      return;
    }
    var dist = Math.abs(p.y - attackGoalY(p.side));
    var opp = nearestOpponent(p, 40);
    var pressure = opp.player ? opp.dist : 40;
    var tac = effTactic(p.side);
    var sty = styleOf(p.side);
    /* v20 ② — 윙어의 롤·주발: 인버티드는 안으로 접어 슛, 전통 윙어는 폭을 지켜 크로스 */
    var invW = isInverted(p);
    var tradW = isTraditionalWinger(p);
    /* v21 ② — 이 팀이 자기 진영에서 공을 돌린 시간 */
    var stallNow = (ownHalfSide === p.side) ? ownHalfT : 0;
    var shootRange = 22 + (tac === 'attack' ? 4 : 0) + (p.side === 'home' && buffOf('longshot') > 0 ? 12 : 0) + (sty.shootBias - 1) * 14;
    if (p.side === 'home' && buffOf('atk') > 0) { shootRange += 2; }
    if (invW) { shootRange += 5; }                       /* 하프스페이스에서 바로 때릴 수 있다 */

    /* 1) 슛 */
    if (dist < shootRange) {
      /* v21 ① — 박스 안·1:1·하프스페이스의 명확한 찬스는 주저 없이 때린다.
         (예전에는 근접 압박(pressure<2.2)이면 0.45배로 깎여 찬스가 패스로 샜다) */
      var inBox = dist < 11.5;
      /* v25c (B1) — 슈팅 빈도 소폭 상향: 박스 안 0.72→0.86, 근거리 0.46→0.56, 중거리 0.24→0.30 */
      var pShot = inBox ? 0.95 : (dist < 18 ? 0.66 : 0.34);
      pShot *= sty.shootBias;
      if (pressure < 2.2 && !inBox && dist > 15) { pShot *= 0.7; }
      if (inBox && pressure > 3) { pShot += 0.10; }        /* 골문 앞에서 마크가 비었을 때 */
      if (p.side === 'home' && (buffOf('atk') > 0 || buffOf('longshot') > 0)) { pShot += 0.12; }
      if (invW && dist < 21) { pShot += 0.10; }           /* 컷인 후 강한 발 슈팅 */
      if (chance(pShot)) {
        if (inBox) { v21t.boxShots += 1; }
        if (inBox || pressure > 3.5) { v21t.clearShots += 1; }
        shoot(p, dist);
        return;
      }
    }
    /* 1.2) v19 ① — 전환 창: 역습·직선 팀은 탈취 직후 한 번 더 세로로 찌른다 */
    if (trans.side === p.side && trans.kind === 'vertical' && progressOf(p.side, p.y) > 0.28 && chance(0.4)) {
      if (transitionThrough(p)) { actionTimer = 0.16; return; }
    }
    /* 1.5) 원터치 — 압박이 강하면 무작정 뺏기지 않고 가까운 동료에게 넘긴다
       v21 ② — 자기 진영 정체 중에는 이 안전 패스도 막는다 */
    if (stallNow < 2.4 && pressure - (sty.shortBias > 0 ? 0.6 : 0) < 3.4 && chance(0.55 + clamp(sty.shortBias * 0.09, 0, 0.25))) {
      if (backPass(p)) { actionTimer = 0.14; return; }
    }

    /* 2) 측면 크로스 · 컷백 — 크로스 성향이 강한 감독은 더 넓고 더 자주 올린다
       v20 ② — 전통 윙어는 더 자주 올리고, 인버티드 윙어는 안으로 접어 연결한다 */
    var xBias = sty.crossBias * (tradW ? 1.3 : (invW ? 0.45 : 1));
    if ((play.stage === 'wide' || play.stage === 'final') && (p.x < 22 + (xBias - 1) * 6 || p.x > 78 - (xBias - 1) * 6) && dist < 34 + Math.max(0, xBias - 1) * 4) {
      var box = bestBoxTarget(p.side);
      /* v19 ① — 측면 오버래핑 팀의 컷백: 터치라인 끝에서 골문 앞으로 낮게 자른다 */
      if (box && sty.key === 'wingplay' && chance(0.45)) {
        if (kickPass(p, box, 'cutback')) { v19t.cutback += 1; return; }
      }
      if (box && dist < 28 + Math.max(0, xBias - 1) * 4 && chance(clamp(0.72 * xBias, 0.18, 0.98))) {
        bubble(p, p.x < 22 ? '→ 컷백!' : '← 컷백!', '#ffd98a', 1.2);
        if (kickPass(p, box, 'cross')) { return; }
      }
      if (passBall(p)) { return; }
    }
    /* 2.5) v21 ② — 정체 탈출: 오래 자기 진영에서만 돌았다면 앞으로 밀어붙인다 */
    if (stallNow > 3.4) {
      var ft = forwardTarget(p);
      if (ft && kickPass(p, ft, 'longkick')) {
        v21t.stallBreak += 1;
        v21t.stallLong += 1;
        v21t.forwardPass += 1;
        bubble(p, '⚡ 전진!', '#ffd98a', 1.0);
        return;
      }
      /* 받을 곳도 없으면 앞으로 직접 돌파한다 */
      p.dribbleX = clamp(p.x + range(-4, 4), 6, WORLD_W - 6);
      p.dribbleY = p.y - goalDir(p.side) * range(9, 14);
      p.dribbleT = 0.55;
      p.kind = 'dribble';
      v21t.stallBreak += 1;
      return;
    }
    /* 3) 패스 */
    if (pressure < 6 || chance(0.72)) {
      if (passBall(p)) { return; }
    }
    /* 4) 드리블 */
    dribble(p);
  }
  /* v19 ④ — 슛 카운트·xG 누적을 한 곳으로 (일반 슛·세트피스 헤더·PK 모두) */
  function countShot(side, xg) {
    if (side === 'home') { goalStats.homeShots++; homeXg += xg; }
    else { goalStats.awayShots++; awayXg += xg; }
  }

  function shoot(p, dist) {
    var gy = attackGoalY(p.side);
    var longshot = dist > 19 || (p.side === 'home' && buffOf('longshot') > 0);
    var acc = 0.50 + p.player.stats.atk / 520 + (p.side === 'home' ? (formFactor - 1) * 0.9 : 0);
    /* v20 ② — 주발: 강발 쪽에서 치면 파워, 반대쪽에서는 감아차기(정확·약간 느림) */
    var fs = footSideOf(p);
    var sideNow = p.x >= 50 ? 'R' : 'L';
    var fit = fs === 'B' ? 'both' : (fs === sideNow ? 'strong' : 'curl');
    if (fit === 'strong') { acc += 0.05; }
    else if (fit === 'curl') { acc += 0.015 - (longshot ? 0.045 : 0); }
    else { acc += 0.025; }
    if (fit === 'curl' && longshot) { v20t.shots.weakLong += 1; }
    if (p.side === 'home' && (buffOf('atk') > 0 || buffOf('longshot') > 0)) { acc += 0.09; }
    if (p.side === 'home') { acc += mfx('shoot') * 0.008 + mfx('atk') * 0.004; }
    acc -= dist * 0.005;
    /* v25c (B1) — 박스 안 결정력: 가까운 슛은 골문으로 향할 확률을 조금 더 준다 */
    if (dist < 11.5) { acc += 0.05; }
    var onTarget = chance(clamp(acc, 0.2, 0.86));
    var xg = clamp(0.62 * Math.exp(-dist / 11) + p.player.stats.atk / 2600, 0.02, 0.52);
    if (dist < 11.5) { xg += 0.075; }
    if (fit === 'strong') { xg += 0.015; }
    else if (fit === 'curl') { xg += 0.005; }
    v20t.shots[fit] += 1;
    if (p.side === 'home' && buffOf('atk') > 0) { xg += 0.05; }
    if (p.side === 'home' && buffOf('longshot') > 0 && dist > 19) { xg += 0.035; }
    if (p.side === 'away' && buffOf('def') > 0) { xg -= 0.045; }
    if (p.side === 'home') { xg += mfx('shoot') * 0.004 + mfx('atk') * 0.002; }
    else { xg -= mfx('def') * 0.005 + mfx('press') * 0.001; }
    if (!onTarget) { xg *= 0.12; }
    var isGoal = chance(clamp(xg, 0.01, 0.66));
    var tx = onTarget ? clamp(50 + range(-8, 8) + (fit === 'curl' ? (fs === 'R' ? 4.5 : -4.5) : 0), 38, 62) : (chance(0.5) ? range(28, 42) : range(58, 72));
    var travel = Math.hypot(tx - p.x, gy - p.y);
    var sdur = clamp(travel / 46, 0.34, 0.95);      /* v15 — 슛 궤적이 눈으로 읽히게 */
    var speed = travel / sdur;

    ball.x = p.x;
    ball.y = p.y;
    kickBall(p, tx, gy, speed, 'shot', null, longshot ? 1 : 0);
    ball.dur = sdur;
    if (longshot) { ball.vz = BALL_G * ball.dur * 0.46; ball.z = 1.0; }
    ball.shot = {
      by: p, xg: xg, onTarget: onTarget, isGoal: isGoal,
      long: longshot, tx: tx, gy: gy, ox: p.x, oy: p.y
    };
    M.phase = 'shot';
    countShot(p.side, xg);
    if (p.side === 'home') { charge(1.8); }
    setPose(p, 'kick', 0.38);
    fxRing(p, longshot ? '#ffb066' : '#ffe28a', 0.95);
    fxKickSwing(p, longshot ? 2.4 : 1.2, longshot ? '#ffb066' : '#fff2c0');
    fxSparks(p.x, p.y, longshot ? 10 : 5, longshot ? '#ffb066' : '#ffe28a', longshot ? 9 : 6);
    fxDust(p, 4, 1.2);
    kickCam(longshot ? 1.4 : 1.0, 0.16);
    fxPop(p, 0.34);
    SND.kick(1);
    SND.cheer(0.30, 0.85);
    crowdUp(0.34);
    bubble(p, longshot ? '🔥 중거리 슛!' : '🎯 슛!', longshot ? '#ffb066' : '#ffe28a', 1.3);
    say(U.josa(short(p.name), '이/가') + ' ' + (longshot ? '중거리에서 대포알을 때립니다!' : '과감하게 슛!') + ' ' +
      pick(['발끝에서 불꽃이 튑니다!', '골문을 향해 낮게 깔아 찹니다!', '수비수 머리 위로 감아 찹니다!', '있는 힘껏 때렸습니다!']), 'shot');
    var gk = goalkeeper(p.side === 'home' ? 'away' : 'home');
    if (gk) { gk.diveT = 0.55; gk.diveDir = (tx - gk.x) >= 0 ? 1 : -1; }
  }

  function resolveShot() {
    var s = ball.shot;
    ball.shot = null;
    if (!s) { ball.kind = 'idle'; return; }
    var p = s.by;
    var defSide = p.side === 'home' ? 'away' : 'home';
    var gk = goalkeeper(defSide);
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    /* v19 ④ — 슈팅 로그: 경기 후 2D xG 맵의 원본 데이터 */
    logShot(p, s);
    if (gk) { gk.diveT = 0.7; gk.diveDir = (s.tx - gk.x) >= 0 ? 1 : -1; }
    if (s.isGoal) {
      lastGoalXg = s.xg;
      goal(p, p.side);
      return;
    }
    if (!s.onTarget) {
      /* v19 ③ — 세트피스 헤더가 빗나가도 박스 안에 공이 살아 있으면 세컨볼 */
      if (s.second && chance(0.5)) { secondBall(s); return; }
      /* v17 — 골대·크로스바를 맞는 순간: '팅!' 소리와 관중 탄식 */
      if (chance(0.32)) {
        say('😱 ' + U.josa(short(p.name), '의') + ' 슛이 골대를 강타합니다! ' + pick([
          '크로스바가 울렸습니다!', '골포스트를 맞고 나옵니다!', '몇 cm 차이였습니다!'
        ]), 'miss');
        bubble(p, '😱 골대!', '#9fe8ff', 1.4);
        SND.post();
        SND.groan();
        kickCam(2.6, 0.34);
        fxRing(p, '#c8f169', 1.2);
        crowdUp(0.3);
        addRating(p, -0.01);
        goalKick(defSide);
        return;
      }
      say('아쉽습니다! ' + U.josa(short(p.name), '의') + ' 슛이 골대를 벗어납니다.', 'miss');
      kickCam(0.7, 0.12);
      SND.groan();
      addRating(p, -0.04);
      sayExp(pick([
        '각도가 없었습니다. 저 위치에서는 골키퍼가 편하게 막을 수밖에 없어요.',
        '조금 힘이 들어갔습니다. 살짝 감아 칠 필요가 있었습니다.',
        '발뿐 아니라 시선까지 골대를 향해야 합니다. 아쉬워요.'
      ]));
      goalKick(defSide);
      return;
    }
    if (gk) { save(gk); } else { stats.saves++; }
    addRating(p, -0.02);
    /* v19 ③ — 세트피스 헤더가 막혔어도 세컨볼이 살아 있으면 후속 슛 기회를 만든다 */
    if (s.second && chance(0.62)) { secondBall(s); return; }
    if (chance(0.3)) { doCorner(p.side); } else { goalKick(defSide); }
  }

  /* v19 ④ — 슈팅 로그 한 줄 (xG 맵 원본) */
  function logShot(p, s) {
    if (!p || !s) { return; }
    shotLog.push({
      side: p.side,
      x: Math.round((s.ox != null ? s.ox : p.x) * 10) / 10,
      y: Math.round((s.oy != null ? s.oy : p.y) * 10) / 10,
      xg: Math.round(s.xg * 1000) / 1000,
      onTarget: !!s.onTarget, isGoal: !!s.isGoal,
      min: minute(), scorer: p.name,
      set: !!s.second
    });
    if (shotLog.length > 48) { shotLog.shift(); }
  }

  /* v19 ③ — 세컨볼: 막힌 공이 박스 안에서 살아 후속 슛·세컨볼 다툼으로 이어진다 */
  function secondBall(s) {
    var side = s && s.by ? s.by.side : play.atkSide;
    var dir = goalDir(side);
    var gy = attackGoalY(side);
    var bx = clamp((s && s.ox != null ? s.ox : ball.x) + range(-9, 9), 22, 78);
    var by = clamp(gy - dir * range(5, 13), 8, 112);
    ball.x = bx; ball.y = by; ball.z = 0; ball.vz = 0; ball.flight = 0;
    ball.carrier = null; ball.from = null; ball.receiver = null; ball.shot = null;
    ball.kind = 'idle'; ball.trail = [];
    ball.vx = range(-10, 10);
    ball.vy = -dir * range(3, 12);              /* 골문 반대(필드) 방향으로 흐르는 세컨볼 */
    play.looseT = 0.55;
    v19t.secondBall += 1;
    kickCam(0.9, 0.14);
    if (s && s.by) { bubble(s.by, '🔁 세컨볼!', '#9fd8ff', 1.3); }
    say('🔁 막힌 공이 박스 안에 살아 있습니다 — 세컨볼! 후속 슛 기회입니다!', 'shot');
  }

  /* ───────────────────────  v19 ③ — 코너·간접 프리킥 세컨볼 전개  ───────────────────────
     v18까지 코너·간접 프리킥은 '확률 한 번'으로 슛/선방/골이 끝났다. v19는 실제로 박스 안
     경합 지점으로 로프트 볼을 띄우고, 도착하는 순간 공중볼 경합을 해소한다.
     · 공격이 이기면 헤더 슛 → 막히면 세컨볼이 박스 안에 살아 있다 (후속 슛)
     · 수비가 이기면 헤더 클리어런스 → 그 공이 그대로 인플레이 세컨볼·역습으로 이어진다 */
  function launchContest(sp, side) {
    var dir = goalDir(side), gy = attackGoalY(side);
    var taker = bestTaker(side, sp.type === 'corner' ? 'ck' : 'fk');
    var target = bestBoxTarget(side);
    var by = taker || target;
    /* v29 ② — 크로스 낙하 지점은 세트피스 대형의 타깃(니어 62% / 파 38%)으로 정해진다.
       대형과 궤적이 따로 놓는 일이 없이, 세워 둔 장신 CB에게 실제로 공이 떨어진다. */
    var nearT = spLayout && spLayout.near ? spLayout.near : null;
    var farT = spLayout && spLayout.far ? spLayout.far : null;
    var aimT = nearT ? (chance(0.62) || !farT ? nearT : farT) : null;
    var tx, ty;
    if (aimT) {
      tx = clamp(aimT.x + range(-2.6, 2.6), 34, 66);
      ty = clamp(aimT.y + range(-1.4, 1.4), 5, WORLD_H - 5);
    } else {
      tx = target ? clamp(target.x * 0.5 + 50 * 0.5 + range(-4, 4), 34, 66) : clamp(50 + range(-7, 7), 36, 64);
      ty = gy - dir * (target ? clamp(Math.abs(target.y - gy), 7, 14.5) : range(8, 13));
      ty = clamp(ty, 5, WORLD_H - 5);
    }
    var xg = 0.13 + (side === 'home' && buffOf('setpiece') > 0 ? 0.05 : 0);
    if (side === 'home') { xg += mfx('jump') * 0.006; }
    else { xg -= mfx('def') * 0.003 + mfx('jump') * 0.003; }
    if (sp.type === 'indirect') { xg -= 0.02; }
    /* v19b 버그 수정 — 공은 세트피스 지점(코너 플래그·파울 지점)에 그대로 두고, 키커를 그 자리로
       스냅한다. 예전엔 ball.x = by.x 로 공이 키커 발밑으로 순간이동해, 2.4초(코너)·1.6초(간접) 안에
       도착하지 못한 키커가 서 있던 미드필드·반대 측면에서 코너킥이 올라갔다. */
    if (by) {
      if (sp.type === 'corner') {
        by.x = ball.x + (ball.x < 50 ? 0.9 : -0.9);      /* 플래그 바로 안쪽 */
        by.y = ball.y + (ball.y < 60 ? 0.9 : -0.9);
      } else {
        by.x = ball.x;
        by.y = ball.y - dir * 0.5;                       /* 파울 지점 바로 뒤 */
      }
      separate();
    }
    markLaunch(sp, ball.x, ball.y);
    ball.carrier = null;
    ball.shot = null;
    var dist = Math.hypot(tx - ball.x, ty - ball.y);
    var dur = clamp(dist / 26, 0.72, 1.35);
    kickBall(by, tx, ty, dist / dur, 'contest', null, 1);
    ball.dur = dur;
    ball.z = 1.0;
    ball.vz = BALL_G * dur * 0.42;                       /* v29 — 화면 안에서 읽히는 크로스 포물선 */
    ball.bend = range(6, 11) * (ball.x < 50 ? 1 : -1);   /* v29 — 감기는 곡선 */
    ball.crossKind = 'contest';
    ball.contest = { side: side, type: sp.type, x: tx, y: ty, xg: xg };
    lastSpPass = { type: sp.type, side: side, ox: ball.bx0, oy: ball.by0, x: tx, y: ty, bend: ball.bend, dur: dur, t: 0, aim: aimT ? { x: aimT.x, y: aimT.y } : null, at: simTime };
    v29t.arcCross += 1;
    v29t.contestLanding = { x: Math.round(tx * 10) / 10, y: Math.round(ty * 10) / 10, aim: aimT ? aimT.name : null, min: minute() };
    M.phase = 'pass';
    if (by) { setPose(by, 'kick', 0.34); }
    bubble(by, sp.type === 'corner' ? '🚩 코너 크로스!' : '🎯 프리킥 크로스!', '#ffd98a', 1.3);
    say(sp.type === 'corner'
      ? '코너킥이 박스 안 경합 지점으로 향합니다 — 헤더 다툼!'
      : '간접 프리킥을 박스로 올립니다 — 공중볼 경합!', 'shot');
    v19t.contest += 1;
    dead(0.4);
  }

  function resolveContest() {
    var ct = ball.contest;
    ball.contest = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0; ball.flight = 0; ball.trail = [];
    if (!ct) { play.phase = 'play'; return; }
    var side = ct.side, defSide = side === 'home' ? 'away' : 'home';
    var gy = attackGoalY(side);
    /* 경합 지점은 항상 피치 안쪽 — v18 아웃오브플레이 불변식 유지 */
    ball.x = clamp(ball.x, 6, WORLD_W - 6);
    ball.y = clamp(ball.y, 4, WORLD_H - 4);
    var atkBest = null, aV = -1e9, defBest = null, dV = -1e9, i, q;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.off || isGK(q)) { continue; }
      var near = 26 - Math.hypot(q.x - ball.x, q.y - ball.y);
      if (q.side === side) {
        var av = near * 1.1 + (q.player.stats.atk || 40) * 0.55 +
          ((q.player.set && q.player.set.jump) ? q.player.set.jump * 1.7 : 0) + (isFwdGroup(q) ? 10 : 0);
        if (q.side === 'home' && buffOf('setpiece') > 0) { av += 8; }
        if (av > aV) { aV = av; atkBest = q; }
      } else {
        var dv = near * 1.1 + (q.player.stats.def || 40) * 0.62 + (isDefGroup(q) ? 8 : 0);
        if (dv > dV) { dV = dv; defBest = q; }
      }
    }
    if (!atkBest || !defBest) {
      var np = nearestToBall(play.atkSide, 999);
      if (np) { giveBall(np); }
      return;
    }
    var aWin = clamp(aV / (aV + Math.abs(dV) + 0.001), 0.24, 0.76);
    /* v29 ② — 헤딩 경합 연출: 공격·수비가 동시에 뛰어오르고 충돌 링이 터진다 */
    v29t.headerContest += 1;
    setPose(atkBest, 'jump', 0.6);
    setPose(defBest, 'jump', 0.6);
    fxRing(atkBest, '#ffe28a', 1.05);
    fxRing(defBest, '#bfe8ff', 1.0);
    bubbleUnique(defBest, '💪 공중볼 경합!', '#bfe8ff', 1.1);
    kickCam(0.7, 0.12);
    SND.kick(0.5);
    if (chance(aWin)) {
      /* 공격 승리 — 헤더 슛 */
      var dist = Math.hypot(atkBest.x - 50, atkBest.y - gy);
      var xg = clamp(0.34 * Math.exp(-dist / 10) + 0.02, 0.04, 0.30) * (ct.type === 'corner' ? 1 : 0.86);
      xg = clamp(xg + ct.xg * 0.35, 0.03, 0.34);
      var onTarget = chance(clamp(0.56 + (atkBest.player.stats.atk - 60) * 0.004, 0.34, 0.80));
      v19t.header += 1;
      if (onTarget) { v29t.headerOnTarget += 1; }
      if (onTarget && ct.type === 'corner') {
        matchupHit('setpiece-ok', '🎯 세트피스 적중!', '코너 대형에서 ' + U.josa(short(atkBest.name), '이/가') + ' 유효슈팅 헤더를 만들어냈습니다');
      }
      countShot(side, xg);
      ball.shot = {
        by: atkBest, xg: xg, onTarget: onTarget,
        isGoal: onTarget && chance(clamp(xg, 0.03, 0.5)),
        long: false, tx: clamp(50 + range(-7, 7), 40, 60), gy: gy,
        ox: atkBest.x, oy: atkBest.y, second: false
      };
      ball.x = clamp(ball.x, 6, WORLD_W - 6);
      ball.y = clamp(ball.y, 4, WORLD_H - 4);
      if (side === 'home') { charge(1.2); } else { charge(0.7); }
      bubble(atkBest, '💥 헤더!', '#ffe28a', 1.2);
      say('💥 ' + U.josa(short(atkBest.name), '이/가') + ' 박스 안에서 헤더로 돌려 놓습니다!', 'shot');
      fxRing(atkBest, '#ffe28a', 0.95);
      kickCam(1.3, 0.16);
      SND.kick(0.9);
      setPose(atkBest, 'kick', 0.34);
      var gk0 = goalkeeper(defSide);
      if (gk0) { gk0.diveT = 0.55; gk0.diveDir = (ball.shot.tx - gk0.x) >= 0 ? 1 : -1; }
      /* 헤더 슛도 세컨볼 후속을 남긴다 */
      ball.shot.second = true;
      resolveShot();
      return;
    }
    /* 수비 승리 — 헤더 클리어런스: 공이 필드로 살아 나가 세컨볼·역습이 된다 */
    var dirD = goalDir(defSide);
    var tx2 = clamp(50 + range(-24, 24), 10, WORLD_W - 10);
    var ty2 = clamp(ball.y + dirD * range(26, 44), 8, WORLD_H - 8);
    var recv = null, rv2 = -1e9;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.side !== defSide || q.off || isGK(q) || q === defBest) { continue; }
      var dd = Math.hypot(q.x - tx2, q.y - ty2);
      if (dd > 17) { continue; }
      var opn = nearestOpponent(q, 18).dist;
      if (opn - dd * 0.4 > rv2) { rv2 = opn - dd * 0.4; recv = q; }
    }
    ball.x = clamp(ball.x, 6, WORLD_W - 6);
    ball.y = clamp(ball.y, 6, WORLD_H - 6);
    kickBall(defBest, tx2, ty2, clamp(Math.hypot(tx2 - ball.x, ty2 - ball.y) / 1.05, 30, 60), 'pass', recv, 1);
    ball.passFlag = false;
    bubble(defBest, '🧱 걷어낸다!', '#bfe8ff', 1.2);
    say('🧱 수비가 공중볼을 걷어냅니다 — 세컨볼 다툼, 곧바로 역습 기회입니다!', 'tackle');
    SND.kick(0.7);
    play.counterSide = defSide;
    play.counterT = 3.4;
    v19t.clearance += 1;
    v19t.secondBall += 1;
  }

  function save(gk) {
    stats.saves++;
    addRating(gk, 0.55);
    if (gk.side === 'home') { charge(2.2); }
    bubble(gk, '🧤 슈퍼 세이브!', '#9fe8ff', 1.6);
    fxRing(gk, '#9fe8ff', 1.15);
    /* v25 ② — 선방 성공: 방패/섬광 링 + 글러브 섬광 */
    fxShieldRing(gk);
    fxKickSwing(gk, 1.4, '#d8f6ff');
    kickCam(2.0, 0.26);
    fxPop(gk, 0.42);
    SND.groan();
    SND.cheer(0.34, 1.0);
    crowdUp(0.42);
    setSit('save', short(gk.name) + ' 선방', true);
    say('🧤 ' + U.josa(short(gk.name), '이/가') + ' 슈퍼 세이브! ' + pick([
      '새끼손가락으로 쳐냅니다!', '몸을 날려 막아냅니다!', '반사 신경이 미쳤습니다!', '골문을 닫아버립니다!'
    ]), 'save');
    sayExp(pick([
      '반사 신경보다 위치 선정이 좋았습니다. 미리 각을 줄여 놓았어요.',
      '손끝 하나로 골을 막았습니다. 저게 클래스입니다.',
      '몸을 던질 준비가 되어 있었습니다. 수비 조직이 도와준 장면이죠.'
    ]));
  }

  function goal(scorer, side) {
    var i;
    var mn = minute();
    var half = mn < 45 ? 0 : 1;
    if (side === 'home') {
      M.homeScore++;
      halfScore[half][0]++;
      addRating(scorer, 1.05);
      charge(14);
    } else {
      M.awayScore++;
      halfScore[half][1]++;
      for (i = 0; i < players.length; i++) {
        if (players[i].side === 'home' && (isGK(players[i]) || isDefGroup(players[i]))) { addRating(players[i], -0.12); }
      }
      charge(8);
    }
    lastScorerSide = side;
    var r = ratingOf(scorer);
    if (r) { r.goals++; }
    var assistName = '';
    var assister = ball.assist && ball.assist !== scorer ? ball.assist : null;
    if (side === 'home' && assister) {
      var ar = ratingOf(assister);
      if (ar) { ar.assists++; ar.rating = clamp(ar.rating + 0.55, 3.5, 10); assistName = assister.name; }
    }
    goals.push({ min: mn, half: half, side: side, name: scorer.name, assist: assistName });
    updateScoreboard();
    var isHome = side === 'home';
    setPose(scorer, 'celebrate', 2.4);
    fxRing(scorer, '#ffe98a', 1.35);
    kickCam(3.6, 0.36);
    flash.t = flash.t0;
    flash.side = side;
    flash.name = short(scorer.name);
    flash.score = M.homeScore + ' : ' + M.awayScore;
    fxPop(scorer, 0.5);
    bubble(scorer, '⚽ 골!', '#ffe98a', 1.8);
    banner('GOAL!', short(scorer.name) + (isHome ? ' · ' + cfg.homeName : ' · ' + cfg.awayName), 'goalnote');
    bannerT = 3.4;
    dead(1.5);
    setSit('goal', short(scorer.name) + ' 득점', true);
    /* ── v17 골 연출: 골망 출렁임 · 관중 폭발 · 사운드 ── */
    netFx = { t: 1.15, t0: 1.15, side: side };
    crowdUp(1);
    for (i = 0; i < 26; i++) { spawnFlash(); }
    SND.cheer(1, 2.6);
    SND.kick(0.85);
    if (isHome) {
      /* v30 — 컷인은 loop()가 goalCutinPend 만료 시 띄운다 (골망·슬로모션을 먼저 보여 준다) */
    }
    say((isHome ? '⚽ GOAL!! ' : '😱 실점... ') + U.josa(short(scorer.name), '이/가') + ' 골망을 흔듭니다! ' + pick([
      '관중석이 들썩입니다!', '완벽한 마무리였습니다!', '골키퍼가 손을 쓸 수 없었습니다!', '중계석도 목이 쉬겠습니다!'
    ]), 'goal');
    say(M.homeScore + ' : ' + M.awayScore + ' — ' + pick(['경기의 흐름이 바뀝니다!', '집중력이 필요합니다!', '아직 경기는 끝나지 않았습니다!']), 'normal');
    sayExp(pick([
      '골키퍼 입장에서는 각을 다 내준 상황입니다. 니어포스트를 먼저 막았어야 했어요.',
      '패스 한 번에 수비 라인이 통째로 무너졌습니다. 전술이 만든 골입니다.',
      '볼을 받기 전에 이미 슈팅 자리를 만들어 뒀습니다. 움직임이 정말 좋았어요.',
      '수비가 볼만 보고 있습니다. 사람을 놓치면 저런 장면이 나옵니다.',
      '이 골로 벤치 분위기가 완전히 달라질 겁니다. 흐름을 잡았어요.'
    ]));
    play.phase = 'goal';
    play.timer = 0;
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.vz = 0;
    /* v30 — 공을 센터서클로 순간이동시키지 않는다. 골라인에 그대로 남겨
       골망이 출렁이는 동안 '어디로 들어갔는지'가 눈에 남는다 (킥오프에서 중앙으로 리셋). */
    ball.z = 0.6;
    ball.netAt = { x: ball.x, y: ball.y };
    /* v30 — 타격감: 0.15초 짧고 강한 화면 흔들림 + 짧은 슬로우 모션.
       GOAL 컷인은 이 임팩트가 끝난 뒤(0.42초)에 띄워 골장면 → 컷인 순서가 자연스럽다. */
    kickCam(4.2, 0.15);
    slowmo = { t: 0.42, t0: 0.42, k: 0.34 };
    goalCutinPend = 0.42;
    goalCutinWho = scorer;
    /* ── v17 세레모니 준비: 득점자가 코너로 달려가고 동료 2~3명이 따라본다 ── */
    var cgy = attackGoalY(side);
    var ccx = scorer.x < 50 ? 6.5 : WORLD_W - 6.5;
    cel = { scorer: scorer, corner: { x: ccx, y: cgy - goalDir(side) * 5.5 }, joins: [], off: [] };
    var near = [], qi, qq;
    for (qi = 0; qi < players.length; qi++) {
      qq = players[qi];
      if (qq === scorer || qq.off || qq.side !== side || isGK(qq)) { continue; }
      near.push({ p: qq, d: d2(qq, scorer) });
    }
    near.sort(function (a, b) { return a.d - b.d; });
    for (qi = 0; qi < near.length && qi < 3; qi++) {
      cel.joins.push(near[qi].p);
      cel.off.push([
        (qi === 0 ? -4.6 : (qi === 1 ? 4.6 : 0)),
        -goalDir(side) * (qi === 2 ? 4.2 : 2.6)
      ]);
    }
    goalStage = 'celebrate';
    goalT = 1.8;
    /* v25 ② — 세리머니 색종이·환호 파동: 득점자와 합류 동료 위로 터진다 */
    fxConfetti(scorer.x, scorer.y, 24);
    spawnPart({ kind: 'wave', x: scorer.x, y: scorer.y, t0: 0.7, size: 16, color: '#ffe98a', a0: 0.8, flat: 0.45 });
    for (i = 0; i < cel.joins.length; i++) { fxConfetti(cel.joins[i].x, cel.joins[i].y, 6); }
    v25t.confetti++;
  }

  /* v17 — 세레모니 목표 좌표 (득점자 코너 · 동료 추종) */
  function applyCelebration() {
    if (!cel) { return; }
    var i, j, sc = cel.scorer;
    if (sc && !sc.off) {
      sc.tx = cel.corner.x; sc.ty = cel.corner.y;
      if (d2(sc, cel.corner) < 9) { setPose(sc, 'celebrate', 1.2); }
    }
    for (i = 0; i < cel.joins.length; i++) {
      j = cel.joins[i];
      if (!j || j.off) { continue; }
      j.tx = cel.corner.x + cel.off[i][0];
      j.ty = cel.corner.y + cel.off[i][1];
      if (d2(j, { x: j.tx, y: j.ty }) < 2.4) { setPose(j, 'celebrate', 0.9); }
    }
  }

  function goalKick(side) {
    /* v15 — 골킥은 실제 위치에서: 골키퍼가 페널티 에어리어에서 차고 수비수가 벌린다 */
    doGoalKick(side);
  }

  /* ─────────────────────────  v18 ④ — 라인 교차점 계산  ─────────────────────────
     공이 라인을 넘은 '정확한 (x, y) 교차점'을 구한다. 위치 갱신 뒤 현재 위치(nx, ny)에서
     속도 벡터 방향으로 경계(x=0/100, y=0/120)까지 연장해 교차점을 구하므로,
     감지 임계(1단위)만큼 늦게 잡혀도 실제 교차점이 정확하다. */
  function crossSpot(px, py, nx, ny) {
    var vx = nx - px, vy = ny - py;
    if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) { return null; }
    var tx = null, ty = null, ex = null, ey = null;
    if (vx < -1e-9) { tx = (0 - nx) / vx; ex = 'x'; }
    else if (vx > 1e-9) { tx = (WORLD_W - nx) / vx; ex = 'x'; }
    if (vy < -1e-9) { ty = (0 - ny) / vy; ey = 'y0'; }
    else if (vy > 1e-9) { ty = (WORLD_H - ny) / vy; ey = 'y120'; }
    if (tx === null && ty === null) { return null; }
    /* 교차점이 너무 과거면 신뢰할 수 없다 */
    if (tx !== null && tx < -8) { tx = null; }
    if (ty !== null && ty < -8) { ty = null; }
    if (tx === null && ty === null) { return null; }
    if (tx !== null && (ty === null || tx <= ty)) {
      return { edge: ex, x: vx < 0 ? 0 : WORLD_W, y: clamp(ny + vy * tx, 0, WORLD_H) };
    }
    return { edge: ey, x: clamp(nx + vx * ty, 0, WORLD_W), y: vy < 0 ? 0 : WORLD_H };
  }

  function throwIn(side) {
    doThrowIn(side || (play.atkSide === 'home' ? 'away' : 'home'));
  }

  /* v15 — 아웃 오브 플레이: 라인과 마지막 터치로 스로인·코너킥·골킥을 가른다 */
  function outOfPlay(edge, spot) {
    var last = ball.lastTouch || (ball.from ? ball.from.side : null) || play.atkSide;
    if (ball.passFlag) {
      v18t.passOut += 1;
      ball.passFlag = false;
      v18t.passOutLog = v18t.passOutLog || [];
      v18t.passOutLog.push({
        x: Math.round(ball.x * 10) / 10, y: Math.round(ball.y * 10) / 10,
        aim: ball.aim ? [Math.round(ball.aim.x * 10) / 10, Math.round(ball.aim.y * 10) / 10] : null,
        from: ball.from ? ball.from.pos + ':' + ball.from.side : null,
        kind: ball.kind, edge: edge
      });
      if (v18t.passOutLog.length > 8) { v18t.passOutLog.shift(); }
    }
    if (edge === 'x') {
      doThrowIn(last === 'home' ? 'away' : 'home', spot);
      return;
    }
    var atk = edge === 'y0' ? 'home' : 'away';          /* y0 = 0 라인의 골문을 공격하는 팀은 홈 */
    var defending = atk === 'home' ? 'away' : 'home';
    /* v18 ④ — 코너도 공이 골라인을 건넌 교차점 x를 그대로 쓴다 (좌/우 코너 결정) */
    if (spot) { ball.x = clamp(spot.x, 1, WORLD_W - 1); ball.y = spot.y; }
    if (last === atk) { doGoalKick(defending); }
    else { doCorner(atk); }
  }

  function settleBall() {
    var best = null, bd = 999, i, d;
    for (i = 0; i < players.length; i++) {
      if (players[i].off) { continue; }
      d = Math.hypot(players[i].x - ball.x, players[i].y - ball.y);
      if (d < bd) { bd = d; best = players[i]; }
    }
    if (best && bd < 9) { giveBall(best); return; }
    /* 아무도 닿지 못한 패스 — 라인 밖이면 실제 재개(스로인·골킥·코너), 안이면 루즈볼 */
    if (ball.x < 1.5 || ball.x > WORLD_W - 1.5 || ball.y < 1.5 || ball.y > WORLD_H - 1.5) {
      var sp = crossSpot(ball.x - ball.vx * 0.02, ball.y - ball.vy * 0.02, ball.x, ball.y);
      var edg = sp ? sp.edge : (ball.x < 1.5 || ball.x > WORLD_W - 1.5 ? 'x' : (ball.y < 1.5 ? 'y0' : 'y120'));
      ball.kind = 'idle'; ball.vx = 0; ball.vy = 0; ball.flight = 0;
      outOfPlay(edg, sp);
      return;
    }
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.flight = 0;
    play.looseT = 1.0;
  }

  function tryTackle(defender, carrier, dt) {
    /* v16 — 분리 최소 간격이 1.18 지름(29px)이 되면서 예전 월드 거리 5.2는 닿지 않는 거리가 됐다.
       화면에서 '어깨를 대는' 거리(1.30 지름)까지 허용하고, 성공 확률은 세트피스가
       마라톤이 되지 않도록 낮춘다. */
    var dpx = pxDist(defender.x, defender.y, carrier.x, carrier.y);
    var dLim = 2 * SPR_H * TOKEN_R * 1.30;
    if (dpx > dLim) { return; }
    if (tele.press[defender.side] !== undefined) {
      /* v14 계측: 같은 수비수가 같은 소유자에게 붙은 '압박 이벤트'만 센다 */
      if (!defender.lastPressT || simTime - defender.lastPressT > 0.7) {
        tele.press[defender.side] += 1;
        if (progressOf(defender.side, ball.y) > 0.45) { tele.pressHigh[defender.side] += 1; }
        if (tele.pressY[defender.side]) {
          tele.pressY[defender.side].sum += progressOf(defender.side, ball.y) * 100;
          tele.pressY[defender.side].n += 1;
        }
        defender.lastPressT = simTime;
      }
    }
    /* 가까울수록 성공 확률이 높다 (화면 거리 기준) */
    var near = clamp(1.18 - (dpx - dLim * 0.75) / (dLim * 0.75) * 0.80, 0.35, 1.18);
    var defSkill = defender.player.stats.def + 8 + (defender.side === 'home' && buffOf('press') > 0 ? 9 : 0);
    if (defender.side === 'home') { defSkill += mfx('def') * 1.2 + mfx('press') * 1.0; }
    var atkSkill = carrier.player.stats.spd * 0.7 + carrier.player.stats.atk * 0.3 + 12;
    var pT = clamp(0.85 * (defSkill / (defSkill + atkSkill)) * dt * 1.9 * near * 0.30, 0, 0.5);
    if (buffOf('press') > 0 && defender.side === 'home') { pT *= 1.45; }
    if (buffOf('tiki') > 0 && carrier.side === 'home') { pT *= 0.75; }
    if (!chance(pT)) { return; }
    doTackle(defender, carrier);
  }

  function doTackle(defender, carrier) {
    var progT = progressOf(carrier.side, carrier.y);
    var boxy = progT > 0.80 && Math.abs(carrier.x - 50) < 26;
    var foulP = clamp(0.20 + (defender.player.tough < 4 ? 0.05 : 0) + (boxy ? 0.06 : 0), 0.05, 0.34);
    if (chance(foulP)) {
      foul(defender, carrier);
      return;
    }
    stats.tackles++;
    addRating(defender, 0.18);
    addRating(carrier, -0.06);
    carrier.stun = 0.4;
    carrier.dribbleT = 0;
    setPose(defender, 'tackle', 0.52);
    fxRing(defender, buffOf('press') > 0 ? '#ff9f8a' : '#ffd98a', 0.78);
    fxPop(defender, 0.26);
    /* v25 ② — 슬라이딩 잔디 뜯김·흙먼지 + 지면에 남는 슬라이딩 마크 */
    fxGrass(defender, 7);
    fxDust(defender, 4, 1.4);
    fxSlideMark(defender, 3.6);
    v25t.tackle++;
    /* v18 ④ — 태클·경합에서 발끝에 맞은 공이 터치라인 밖으로 흘러 스로인이 된다 */
    if (chance(0.30)) {
      bubble(defender, '💥 튕겨 나간다!', '#ffd98a', 1.1);
      knockLoose(defender, carrier);
      if (defender.side === 'home') { charge(1.2); }
      say('💥 ' + U.josa(short(defender.name), '의') + ' 태클에 공이 발끝을 맞고 라인 밖으로 흘러나갑니다!', 'tackle');
      SND.tackle();
      return;
    }
    bubble(defender, buffOf('press') > 0 ? '🛡️ 압박!' : '🦵 태클!', buffOf('press') > 0 ? '#ff9f8a' : '#ffd98a', 1.2);
    giveBall(defender);
    if (defender.side === 'home') { charge(1.7); }
    say('🦵 ' + U.josa(short(defender.name), '의') + ' 태클! ' + pick([
      '깔끔하게 공을 빼앗습니다!', '몸을 던져 길을 막습니다!', '주머니에 손 넣듯 빼앗아 갑니다!'
    ]), 'tackle');
    SND.tackle();
  }

  /* v18 ④ — 태클·경합으로 발끝에 맞은 공을 바깥으로 틀어 버린다.
     공은 직선으로 터치라인을 넘어가고, updateBall의 교차점 계산이 스로인 자리를 정한다. */
  function knockLoose(defender, carrier) {
    var outX = carrier.x < 50 ? -1 : 1;
    if (Math.abs(carrier.x - 50) < 14) { outX = chance(0.5) ? -1 : 1; }
    var ty = clamp(carrier.y + range(-18, 18), 6, 114);
    var tx = outX < 0 ? -12 : WORLD_W + 12;
    v18t.knockOut += 1;
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.x = clamp(carrier.x, 3, WORLD_W - 3);
    ball.y = clamp(carrier.y, 3, WORLD_H - 3);
    kickBall(defender, tx, ty, 52, 'pass', null, 0);
    play.looseT = 0;
    actionTimer = Math.max(actionTimer, 0.3);
  }

  function foul(defender, carrier) {
    var atk = carrier.side;
    var prog = progressOf(atk, carrier.y);
    /* v15 — 페널티 박스 안 반칙이면 PK */
    var inBox = prog > 0.80 && Math.abs(carrier.x - 50) < 26;
    say('🦵 ' + U.josa(short(defender.name), '의') + ' 파울! 휘슬이 울립니다.', 'tackle');
    SND.whistle();
    /* v15 — 다이렉트 레드 · 경고 누적: 위험 지역 반칙일수록 퇴장 확률이 높다 */
    var redP = inBox ? 0.10 : (prog > 0.70 ? 0.07 : 0.03);
    if (chance(redP)) { redCard(defender, inBox ? '박스 안 거친 반칙' : '위험한 반칙'); }
    else if (chance(0.34)) { caution(defender); }
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    ball.x = carrier.x;
    ball.y = carrier.y;
    carrier.stun = 0;
    if (inBox) { doPenalty(atk); return; }
    if (prog > 0.5) { freeKick(atk, carrier.x, carrier.y); }
    else { giveBall(carrier); }
  }

  function caution(p) {
    p.yellows = (p.yellows || 0) + 1;
    if (v15) { v15.cards += 1; }
    if (p.yellows >= 2) {
      cautions.push({
        min: minute(), half: minute() < 45 ? 0 : 1, side: p.side, name: p.name, type: 'red'
      });
      say('🟨🟨 ' + U.josa(short(p.name), '이/가') + ' 경고 누적으로 퇴장! 수적 열세입니다.', 'tackle');
      redCard(p, '경고 누적', true);
    } else {
      cautions.push({
        min: minute(), half: minute() < 45 ? 0 : 1, side: p.side, name: p.name, type: 'yellow'
      });
      say('🟨 ' + U.josa(short(p.name), '에게') + ' 경고 카드가 주어집니다.', 'tackle');
      addRating(p, -0.2);
      dead(0.8);
    }
  }

  /* v15 — 퇴장: 선수를 실제로 피치에서 제거해 10명 대 11명으로 경기가 이어진다 */
  function redCard(p, reason, secondYellow) {
    if (!p || p.off) { return; }
    p.off = true;
    if (v15) { v15.reds += 1; }
    logEvt('red', p.side, p.x, p.y);
    var i = players.indexOf(p);
    if (i >= 0) { players.splice(i, 1); }
    if (ball.carrier === p) { ball.carrier = null; ball.kind = 'idle'; ball.x = p.x; ball.y = p.y; }
    var r = ratingOf(p);
    if (r) { r.rating = clamp(r.rating - 1.4, 3.5, 10); }
    for (i = 0; i < players.length; i++) { if (players[i].mark === p) { players[i].mark = null; } }
    var wasGK = isGK(p);
    if (wasGK) { coverGK(p.side); }
    banner('🟥 퇴장!', short(p.name) + ' · ' + reason);
    bannerT = 2.0;
    setSit('red', short(p.name) + ' 퇴장 · ' + (p.side === 'home' ? '우리 10명' : '상대 10명'), true);
    say('🟥 ' + U.josa(short(p.name), '이/가') + ' 퇴장! ' + reason + ' — ' +
      (p.side === 'home' ? cfg.homeShort : cfg.awayShort) + '가 10명으로 뛰어야 합니다.', 'tackle');
    SND.whistle();
    sayExp(p.side === 'home' ? '우리가 10명입니다. 이제 미드필드 간격을 좁혀야 합니다.' :
      '상대가 10명입니다. 이제 측면을 넓게 쓰면 공간이 나옵니다.');
    if (secondYellow) { say('경고 2장이 쌓였습니다.', 'normal'); }
    dead(1.6);
  }

  /* 골키퍼가 퇴장당하면 수비수 한 명이 장갑을 낀다 */
  function coverGK(side) {
    if (goalkeeper(side)) { return; }
    var best = null, bd = 1e9, i, p, d;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== side || p.off || isGK(p)) { continue; }
      d = Math.abs(p.y - ownGoalY(side));
      if (isDefGroup(p)) { d -= 9; }
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) { return; }
    best.pos = 'GK';
    best.role = 'GK';
    best.zone = zoneFor('GK', best.baseY, side);
    say('🧤 ' + U.josa(short(best.name), '이/가') + ' 골키퍼 장갑을 낍니다!', 'tactic');
  }

  /* ─────────────────────────  세트피스  ───────────────────────── */
  function bestTaker(side, key) {
    var best = null, bv = -1, i, p, v;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== side || p.off || isGK(p)) { continue; }
      v = (p.player.set && p.player.set[key]) || 5;
      if (v > bv) { bv = v; best = p; }
    }
    return best;
  }
  function bestBoxTarget(side) {
    var best = null, bv = -1, onBest = null, onV = -1, i, p, v;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== side || p.off || isGK(p)) { continue; }
      v = p.player.stats.atk + (isFwdGroup(p) ? 20 : 0);
      if (v > bv) { bv = v; best = p; }
      /* v15 — 오프사이드 위치에 서 있지 않은 박스 타깃을 우선한다 (크로스 타이밍) */
      if (!isOffsidePos(p) && v > onV) { onV = v; onBest = p; }
    }
    return onBest || best;
  }

  /* ───────────── v15 세트피스: 실제 규칙 위치에서 재개 ───────────── */
  function teamShort(side) { return side === 'home' ? cfg.homeShort : cfg.awayShort; }

  function sendTo(p, x, y) {
    if (!p) { return; }
    p.setPos = { x: clamp(x, 2, WORLD_W - 2), y: clamp(y, 2, WORLD_H - 2) };
    p.tx = p.setPos.x; p.ty = p.setPos.y;
  }
  function clearSetPos() {
    for (var i = 0; i < players.length; i++) { players[i].setPos = null; }
  }

  function beginSetpiece(type, side, hold) {
    play.phase = 'setpiece';
    play.setpiece = { type: type, side: side, t: hold, ox: ball.x, oy: ball.y };
    play.atkSide = side;
    ball.carrier = null;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
    ball.shot = null;
    ball.from = null;
    ball.receiver = null;
    ball.offside = null;
    ball.exempt = false;
    ball.contest = null;
    actionTimer = hold + 0.2;
    if (v15 && v15.setpiece[type] !== undefined) { v15.setpiece[type] += 1; }
    logEvt('set:' + type, side, ball.x, ball.y);
    dead(hold * 0.45);
  }

  /* v19b 계측 — 세트피스가 실제로 '어디서' 출발했는지 기록한다.
     sp.ox/sp.oy = 세트피스 성립 순간의 공 위치(터치라인 교차점·코너 플래그·파울 지점·골킥 지점),
     x/y = 실제 발사 위치. d = 둘 사이 오차(월드 단위). QA가 이 값으로 발사 위치를 검사한다. */
  function markLaunch(sp, x, y) {
    var ox = (sp && typeof sp.ox === 'number') ? sp.ox : x;
    var oy = (sp && typeof sp.oy === 'number') ? sp.oy : y;
    v18t.spLaunch.push({
      type: sp ? sp.type : null, side: sp ? sp.side : null,
      x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10,
      ox: Math.round(ox * 10) / 10, oy: Math.round(oy * 10) / 10,
      d: Math.round(Math.hypot(x - ox, y - oy) * 100) / 100
    });
    if (v18t.spLaunch.length > 80) { v18t.spLaunch.shift(); }
  }

  /* 스로인 — v18 ④: 공이 터치라인을 넘은 정확한 교차점 (x=0 또는 100, y) 에서 던진다 */
  function doThrowIn(side, spot) {
    var outX = ball.x, outY = ball.y;
    var crossY = spot && typeof spot.y === 'number' ? spot.y : clamp(ball.y, 2.5, WORLD_H - 2.5);
    var crossX = spot && typeof spot.x === 'number' ? spot.x : (outX <= 50 ? 0 : WORLD_W);
    var y = clamp(crossY, 2.5, WORLD_H - 2.5);
    var left = crossX <= 50;
    var dir = goalDir(side);
    clearSetPos();
    ball.x = left ? 1.0 : WORLD_W - 1.0;
    ball.y = y;
    v18t.throws.push({
      side: side, edge: 'x', lineX: left ? 0 : WORLD_W,
      throwY: Math.round(y * 10) / 10, crossY: Math.round(crossY * 10) / 10,
      outX: Math.round(outX * 10) / 10, outY: Math.round(outY * 10) / 10
    });
    if (v18t.throws.length > 40) { v18t.throws.shift(); }
    var taker = nearestNToBall(side, 4)[0] || nearestToBall(side, 999);
    if (taker && isGK(taker)) { taker = nearestNToBall(side, 2)[1] || taker; }
    if (taker) { sendTo(taker, left ? 1.6 : WORLD_W - 1.6, y); }
    /* 주변 동료가 라인 안쪽으로 받으러 온다 */
    var recv = nearestNToBall(side, 3), k = 0, i, p;
    for (i = 0; i < recv.length; i++) {
      p = recv[i];
      if (p === taker || isGK(p)) { continue; }
      k++;
      sendTo(p, left ? clamp(6 + k * 9, 6, 34) : clamp(94 - k * 9, 66, 94), clamp(y + dir * (k === 1 ? 5 : -4), 6, 114));
    }
    beginSetpiece('throw', side, 1.1);
    play.stage = 'mid';
    setSit('throw', teamShort(side) + ' 스로인', true);
    say('🙌 터치라인 밖으로 — ' + teamShort(side) + ' 스로인으로 경기가 재개됩니다.', 'normal');
  }

  /* 골킥 — 골키퍼가 페널티 에어리어에서 차고, 수비수들이 양옆으로 벌린다 */
  function doGoalKick(side) {
    var dir = goalDir(side);
    var gk = goalkeeper(side);
    var spotY = ownGoalY(side) + dir * 6.2;
    clearSetPos();
    ball.x = 50; ball.y = spotY;
    if (gk) { sendTo(gk, 50, spotY); }
    var i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off || p === gk) { continue; }
      if (p.side === side) {
        if (p.pos === 'CB') { sendTo(p, p.baseX < 50 ? 24 : 76, spotY + dir * 5); }
        else if (p.pos === 'LB' || p.pos === 'LWB') { sendTo(p, sideX(p, 8), spotY + dir * 17); }
        else if (p.pos === 'RB' || p.pos === 'RWB') { sendTo(p, sideX(p, 92), spotY + dir * 17); }
        else if (p.pos === 'DM') { sendTo(p, 50 + (p.baseX < 50 ? -7 : 7), spotY + dir * 11); }
      } else if (isFwdGroup(p)) {
        /* 상대 최전방은 하프라인 근처까지 올라와 압박을 준비 */
        sendTo(p, clamp(50 + (p.baseX - 50) * 0.75, 22, 78), spotY + dir * 36);
      }
    }
    beginSetpiece('goalkick', side, 1.7);
    play.stage = 'build';
    setSit('goalkick', teamShort(side) + ' 골킥', true);
    say('🧤 골킥 — ' + teamShort(side) + ' 골키퍼가 페널티 에어리어에서 차서 재개합니다.', 'normal');
  }

  /* v29 ② — 공중볼 우위 점수: 키·피지컬(수비/공격)·제공권 세트 + 포지션 보정 */
  function aerialScore(p) {
    var pl = p.player || {}, stt = pl.stats || {}, sst = pl.set || {};
    return (pl.height || 175) * 0.62 + (stt.def || 40) * 0.5 + (stt.atk || 40) * 0.3 +
      (sst.cap || 5) * 1.7 + (p.pos === 'CB' ? 26 : (isFwdGroup(p) ? 16 : 0));
  }

  /* ───────────────── v29 ② — 세트피스 전용 대형 ─────────────────
     코너·공격 진영 프리킥에서 양 팀이 '무엇을 하려는지'가 화면에서 읽히게 만든다.
       공격 : 제공권 상위 2명(장신 CB)을 니어/파포스트에 세우고, 1명 페널티스팟,
              1명 아크, 1명은 짧은 옵션. 역습 대비로 2명은 후방 커버(하프라인).
       수비 : 니어/파포스트·스팟 1대1 마크 + 골문 앞 존 2명 + 파포스트 커버,
              프리킥은 수비벽 3명까지 명시적으로 배치.
     슬롯 좌표는 크로스 목표·헤딩 경합·오버레이 연출에 그대로 공유된다. */
  function setpieceBox(side, type, opt) {
    var o = opt || {};
    var gy = attackGoalY(side), dir = goalDir(side);
    var atk = side, def = side === 'home' ? 'away' : 'home';
    var nearLeft = ball.x < 50;
    var nearX = nearLeft ? 41.5 : 58.5, farX = nearLeft ? 58.5 : 41.5;
    var i, p;
    var cand = [], ment = [];
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off || isGK(p)) { continue; }
      if (p.side === atk) { if (p !== o.taker) { cand.push(p); } }
      else { ment.push(p); }
    }
    cand.sort(function (a, b) { return aerialScore(b) - aerialScore(a); });
    var nearP = cand[0] || null, farP = cand[1] || null;
    var spotP = cand[2] || null, arcP = cand[3] || null, shortP = cand[4] || null;
    var extras = cand.slice(5);
    var slots = [];
    function put(pl, role, x, y, label, color) {
      if (!pl) { return; }
      x = clamp(x, 3, 97); y = clamp(y, 3, WORLD_H - 3);
      sendTo(pl, x, y);
      slots.push({ id: pl.player.id, name: pl.name, role: role, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
      if (label) { bubbleUnique(pl, label, color || '#ffd98a', 3.0); }
    }
    /* ── 공격 대형 ── */
    var deepFk = type === 'fk';
    /* 박스 깊이(골문→페널티 에어리어 18.8·스팟 12.6 월드 단위)를 최대한 써서
       니어/파포스트·스팟·아크가 세로로도 분리되게 세운다 */
    var nearY = gy - dir * (deepFk ? 10.2 : 9.6), farY = gy - dir * (deepFk ? 13.4 : 12.6);
    var spotY = gy - dir * (deepFk ? 17.4 : 16.2);
    var arcY = gy - dir * 25.0, shortY = gy - dir * 5.6;
    put(nearP, 'near', nearX, nearY, '🎯 니어포스트', '#ffd98a');
    put(farP, 'far', farX, farY, '🎯 파포스트', '#ffb066');
    put(spotP, 'spot', 50, spotY, null);
    put(arcP, 'arc', 50 + (nearLeft ? -6 : 6), arcY, null);
    put(shortP, 'short', nearLeft ? 30 : 70, shortY, null);
    /* 역습 대비 후방 커버 2명 (하프라인 부근) */
    var back1 = extras[0] || null, back2 = extras[1] || null;
    put(back1, 'back', nearLeft ? 34 : 66, gy - dir * 33, '🧱 후방 커버', '#9fd8ff');
    put(back2, 'back', 50, gy - dir * 40, null);
    /* 나머지는 세컨볼 자리(박스 바깥 아크 좌우) */
    var k = 0;
    for (i = 2; i < extras.length; i++) {
      put(extras[i], 'rebound', 50 + (k % 2 ? 13 : -13), gy - dir * (24 + Math.floor(k / 2) * 5), null);
      k += 1;
    }
    /* ── 수비 대형 ── */
    ment.sort(function (a, b) { return Math.abs(a.y - gy) - Math.abs(b.y - gy); });
    var wallList = [];
    if (o.wallSpot) {
      var sortW = ment.slice();
      sortW.sort(function (a, b) { return Math.abs(a.y - o.wallSpot.y) + Math.abs(a.x - o.wallSpot.x) - (Math.abs(b.y - o.wallSpot.y) + Math.abs(b.x - o.wallSpot.x)); });
      for (i = 0; i < sortW.length && i < 3; i++) {
        var off2 = (i - 1) * 5.2;
        put(sortW[i], 'wall', o.wallSpot.x + o.wallSpot.px * off2, o.wallSpot.y + o.wallSpot.py * off2, null);
        wallList.push(sortW[i]);
      }
    }
    /* 수비벽 뒤 나머지로 마크·존 구성 */
    var left = [];
    for (i = 0; i < ment.length; i++) { if (wallList.indexOf(ment[i]) < 0) { left.push(ment[i]); } }
    var nearPos = { x: nearX, y: nearY }, farPos = { x: farX, y: farY }, spotPos = { x: 50, y: spotY }, arcPos = { x: 50 + (nearLeft ? -6 : 6), y: arcY };
    function mark(pl, who, pos) {
      if (!pl || !pos) { return; }
      /* 공격수보다 골문 쪽, 그리고 터치라인 쪽으로 비껴 서 토큰이 겹치지 않게 한다 */
      var mx = pos.x + (pos.x < 50 ? -5.2 : 5.2);
      put(pl, 'mark', clamp(mx, 6, 94), pos.y + dir * 2.6, null);
      pl.mark = who || null;
    }
    var mi = 0;
    mark(left[mi++], nearP, nearPos);
    mark(left[mi++], farP, farPos);
    mark(left[mi++], spotP, spotPos);
    if (!o.wallSpot) { mark(left[mi++], arcP, arcPos); }
    /* 존 수비 2명 — 골문 앞 6야드 박스 */
    if (left[mi]) { put(left[mi++], 'zone', 39.0, gy - dir * 8.2, null); }
    if (left[mi]) { put(left[mi++], 'zone', 61.0, gy - dir * 8.2, null); }
    /* 니어포스트 골키퍼 앞 커버 + 짧은 옵션 견제 + 세컨볼 */
    if (left[mi]) { put(left[mi++], 'postcover', nearX, gy - dir * 3.2, null); }
    if (left[mi] && shortP) { put(left[mi++], 'shortcover', clamp((shortP ? (nearLeft ? 34 : 66) : 50), 6, 94), gy - dir * 5.6, null); }
    for (; mi < left.length; mi++) {
      put(left[mi], 'rebound', 50 + ((mi % 2) ? 15 : -15), gy - dir * (23 + (mi % 3) * 5), null);
    }
    var gkD = goalkeeper(def);
    if (gkD) { sendTo(gkD, nearLeft ? 47.5 : 52.5, gy - dir * 2.6); }
    spLayout = {
      type: type, side: side, nearX: nearX, farX: farX, nearLeft: nearLeft,
      near: nearP ? { x: nearX, y: nearY, name: nearP.name, id: nearP.player.id } : null,
      far: farP ? { x: farX, y: farY, name: farP.name, id: farP.player.id } : null,
      spot: spotP ? { x: 50, y: spotY } : null,
      slots: slots,
      back: slots.filter(function (s2) { return s2.role === 'back'; }).length,
      wall: wallList.length
    };
    v29t.sp.near = nearP ? nearP.name : null;
    v29t.sp.far = farP ? farP.name : null;
    v29t.sp.back = spLayout.back;
    v29t.sp.wall = wallList.length;
    v29t.sp.box = slots.filter(function (s2) { return s2.role === 'near' || s2.role === 'far' || s2.role === 'spot'; }).length;
    v29t.sp.last = { type: type, side: side, near: v29t.sp.near, far: v29t.sp.far, wall: wallList.length, back: spLayout.back, min: minute() };
    void o;
    return spLayout;
  }

  function doCorner(side) {
    var dir = goalDir(side);
    var gy = attackGoalY(side);
    var left = ball.x < 50;
    clearSetPos();
    ball.x = left ? 2.4 : WORLD_W - 2.4;
    ball.y = side === 'home' ? 2.2 : WORLD_H - 2.2;
    var taker = bestTaker(side, 'ck');
    if (taker) { sendTo(taker, left ? 4.6 : 95.4, side === 'home' ? 3.2 : WORLD_H - 3.2); }
    /* v29 ② — 코너 전용 대형: 장신 CB 니어/파포스트 + 후방 커버 2명, 수비는 1대1 + 존 */
    var ly = setpieceBox(side, 'corner', { taker: taker });
    v29t.sp.corner += 1;
    beginSetpiece('corner', side, 2.9);
    play.stage = 'final';
    setSit('corner', teamShort(side) + ' 코너킥', true);
    crowdUp(0.34);
    say('🚩 코너킥! ' + teamShort(side) + ' — 박스 안에 양 팀 선수들이 헤더 경합 대형으로 모집니다.', 'tactic');
    say('📐 ' + teamShort(side) + ' 대형: ' + (ly.near ? short(ly.near.name) + ' 니어포스트' : '니어포스트') +
      (ly.far ? ' · ' + short(ly.far.name) + ' 파포스트' : '') + ' · 후방 커버 ' + ly.back + '명 / ' +
      teamShort(side === 'home' ? 'away' : 'home') + ' 수비벽 없이 박스 1대1 + 존', 'tactic');
    bubbleUnique(taker, '🚩 코너 크로스!', '#ffd98a', 2.0);
    sayExp(pick([
      '코너는 결국 첫 번째 공이 전부입니다. 니어포스트를 누가 먼저 치고 나가느냐죠.',
      '장신 센터백을 니어와 파포스트에 세웠습니다. 이제 키 차이 싸움입니다.',
      '골키퍼가 나올지, 남을지가 이 장면의 핵심입니다.'
    ]));
  }

  function freeKick(side, spotX, spotY, indirect) {
    var dir = goalDir(side);
    var gy = attackGoalY(side);
    if (typeof spotX === 'number') { ball.x = spotX; }
    if (typeof spotY === 'number') { ball.y = spotY; }
    ball.x = clamp(ball.x, 8, 92);
    ball.y = clamp(ball.y, 8, 112);
    clearSetPos();
    var taker = bestTaker(side, indirect ? 'pk' : 'fk');
    if (taker) { sendTo(taker, ball.x + (ball.x < 50 ? 1.5 : -1.5), ball.y - dir * 3.4); }
    /* 수비벽 — 공과 골문 사이에 3명이 벽을 세운다 */
    var dx = 50 - ball.x, dy = gy - ball.y;
    var len = Math.max(1, Math.hypot(dx, dy));
    var wx = ball.x + dx / len * 9.6, wy = ball.y + dy / len * 9.6;
    var px = -dy / len, py = dx / len;
    var wall = [], i, q;
    for (i = 0; i < players.length; i++) {
      q = players[i];
      if (q.side === side || q.off || isGK(q)) { continue; }
      wall.push(q);
    }
    wall.sort(function (a, b) { return Math.abs(a.y - wy) - Math.abs(b.y - wy); });
    /* v29 ② — 공격 진영 프리킥은 코너와 같은 박스 대형 + 명시적 수비벽을 쓴다. */
    var dg = Math.abs(ball.y - gy);
    var attackingThird = !indirect && progressOf(side, ball.y) > 0.58 && dg < 45;
    if (attackingThird) {
      setpieceBox(side, 'fk', { taker: taker, wallSpot: { x: wx, y: wy, px: px, py: py } });
      v29t.sp.fk += 1;
      beginSetpiece('fk', side, 2.7);
      setSit('fk', teamShort(side) + ' 프리킥', true);
      say('🎯 ' + teamShort(side) + ' 프리킥 — 수비벽 ' + (spLayout ? spLayout.wall : 3) + '명, 박스 안에 ' +
        (spLayout && spLayout.near ? short(spLayout.near.name) + ' 니어 · ' : '') +
        (spLayout && spLayout.far ? short(spLayout.far.name) + ' 파포스트 · ' : '') +
        '후방 커버 ' + (spLayout ? spLayout.back : 2) + '명 대형입니다.', 'tactic');
      sayExp('수비벽으로 보이는 쪽과 실제 크로스 낙하지점이 다를 수 있습니다. 첫 공 경합이 전부입니다.');
      return;
    }
    for (i = 0; i < wall.length && i < 3; i++) {
      var off = (i - 1) * 5.4;
      sendTo(wall[i], clamp(wx + px * off, 4, 96), clamp(wy + py * off, 4, 116));
    }
    var gk = goalkeeper(side === 'home' ? 'away' : 'home');
    if (gk) { sendTo(gk, clamp(50 + (ball.x - 50) * 0.18, 42, 58), gy - dir * 1.6); }
    beginSetpiece(indirect ? 'indirect' : 'fk', side, indirect ? 1.6 : 2.1);
    setSit('fk', teamShort(side) + (indirect ? ' 간접 프리킥' : ' 프리킥'), true);
    say('🎯 ' + teamShort(side) + (indirect ? ' 간접 프리킥' : ' 프리킥') + ' — ' +
      (wall.length ? '수비벽 ' + Math.min(3, wall.length) + '명이 섰습니다. ' : '') +
      (!indirect && dg < 30 ? '직접 슛 각도입니다!' : '박스로 크로스를 올릴 수 있습니다.'), 'tactic');
  }

  /* 페널티킥 — 키커 vs 골키퍼 1:1 */
  function doPenalty(side) {
    var dir = goalDir(side);
    var gy = attackGoalY(side);
    clearSetPos();
    ball.x = 50;
    ball.y = gy - dir * 11;
    ball.kind = 'idle';
    ball.vx = 0; ball.vy = 0;
    ball.shot = null;
    var taker = bestTaker(side, 'pk');
    if (taker) { sendTo(taker, 50, ball.y - dir * 3.6); }
    var gk = goalkeeper(side === 'home' ? 'away' : 'home');
    if (gk) { sendTo(gk, 50, gy - dir * 1.3); }
    var i, p, k = 0;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off || p === taker || p === gk) { continue; }
      /* v16 — 줄을 서는 선수들이 같은 좌표에 겹치지 않게 두 줄로 벌린다 */
      var row = k % 2, col = Math.floor(k / 2);
      sendTo(p, clamp(20 + col * 15, 18, 82), gy - dir * (row ? 21 : 26.5));
      k++;
    }
    beginSetpiece('pk', side, 2.9);
    SND.whistle();
    crowdUp(0.5);
    setSit('pk', teamShort(side) + ' 페널티킥', true);
    banner('페널티킥', (taker ? short(taker.name) : '') + (gk ? ' vs ' + short(gk.name) : ''));
    bannerT = 1.6;
    say('⚽ 페널티킥 선언! ' + (taker ? U.josa(short(taker.name), '이/가') : '키커가') + ' 공을 세팅하고 ' +
      (gk ? short(gk.name) : '골키퍼') + ' 골키퍼와 1:1로 맞섭니다.', 'tactic');
    dead(2.0);
  }

  function executeSetpiece(sp) {
    play.phase = 'play';
    play.setpiece = null;
    clearSetPos();
    var side = sp.side;
    var dir = goalDir(side);
    var gy = attackGoalY(side);
    var taker = bestTaker(side, sp.type === 'corner' ? 'ck' : (sp.type === 'pk' ? 'pk' : 'fk'));
    var scorer = bestBoxTarget(side);
    var dist = Math.abs(ball.y - gy);
    var xg, tx, ty, dur, speed, by;

    /* 스로인 · 골킥: 던지거나 차서 동료에게 연결한다 (오프사이드 면제) */
    if (sp.type === 'throw' || sp.type === 'goalkick') {
      var passer = sp.type === 'goalkick' ? (goalkeeper(side) || taker) : taker;
      var target = null, bv = -1e9, i, q, d, open, v;
      for (i = 0; i < players.length; i++) {
        q = players[i];
        if (q.side !== side || q === passer || q.off || isGK(q)) { continue; }
        d = Math.hypot(q.x - ball.x, q.y - ball.y);
        if (d > (sp.type === 'goalkick' ? 46 : 30)) { continue; }
        open = nearestOpponent(q, 22).dist;
        v = open * 1.5 - d * 0.55 + (isMidGroup(q) ? 6 : 0) + (isDefGroup(q) && sp.type === 'goalkick' ? 5 : 0);
        if (v > bv) { bv = v; target = q; }
      }
      /* v19b — 반경 안에 받아 줄 동료가 없으면 '가장 가까운 동료'를 골라 그 선수에게 연결한다.
         (예전엔 giveBall로 공을 아무 데나 있는 선수 발밑으로 옮겨, 스로인·골킥이 엉뚱한
          위치에서 재개되는 두 번째 경로가 있었다) 공은 항상 세트피스 지점에서 출발한다. */
      if (!target) {
        var nd = 1e9;
        for (i = 0; i < players.length; i++) {
          q = players[i];
          if (q.side !== side || q === passer || q.off || isGK(q)) { continue; }
          d = Math.hypot(q.x - ball.x, q.y - ball.y);
          if (d < nd) { nd = d; target = q; }
        }
      }
      if (passer && target) {
        ball.exempt = true;                 /* 스로인·골킥 재개 패스는 오프사이드 없음 */
        /* v19b 버그 수정 — 공은 '세트피스 지점'에서 출발한다.
           예전엔 ball.x = passer.x 로 공을 던지는 선수 발밑으로 순간이동시켰다. 스로인은 1.1초,
           골킥은 1.7초뿐이라 터치라인·골킥 지점에 도착하지 못한 선수가 있으면 공이 피치
           한가운데에서 올라갔다. 이제 공은 그대로 두고 선수를 공 자리로 스냅한다. */
        var sox = ball.x, soy = ball.y;
        if (sp.type === 'throw') {
          passer.x = sox <= 50 ? 1.2 : WORLD_W - 1.2;   /* 터치라인 바로 안쪽 */
          passer.y = soy;
        } else {
          passer.x = sox;                                 /* 골킥: 공 뒤에 선다 */
          passer.y = soy - dir * 0.5;
        }
        separate();
        kickPass(passer, target, 'progressive', { x: sox, y: soy });
        markLaunch(sp, sox, soy);
        bubble(passer, sp.type === 'goalkick' ? '🥾 골킥!' : '🙌 스로인!', '#bfe8ff', 1.2);
        say(sp.type === 'goalkick'
          ? short(passer.name) + '의 골킥이 ' + short(target.name) + '에게 연결됩니다.'
          : U.josa(short(passer.name), '의') + ' 스로인 — ' + U.josa(short(target.name), '이/가') + ' 받습니다.', 'normal');
      } else {
        var fallback = target || nearestToBall(side, 999);
        if (fallback) { giveBall(fallback); }
      }
      return;
    }

    /* 간접 프리킥: v19 ③ — 골문 근처면 박스로 로프트 볼을 올려 경합을 만들고, 멀면 연결한다 */
    if (sp.type === 'indirect') {
      if (dist < 42 && chance(0.62)) { launchContest(sp, side); return; }
      var opt = null, ov = -1e9, j, r, dr, opn, vv;
      for (j = 0; j < players.length; j++) {
        r = players[j];
        if (r.side !== side || r === taker || r.off || isGK(r)) { continue; }
        dr = Math.hypot(r.x - ball.x, r.y - ball.y);
        if (dr < 4 || dr > 32) { continue; }
        opn = nearestOpponent(r, 20).dist;
        vv = opn * 1.6 - dr * 0.4 + (isMidGroup(r) ? 5 : 0);
        if (vv > ov) { ov = vv; opt = r; }
      }
      if (opt && taker) {
        ball.exempt = false;
        /* v19b 버그 수정 — 간접 프리킥도 파울 지점에서 시작한다 (예전엔 공이 키커 발밑으로 텔레포트) */
        var iox = ball.x, ioy = ball.y;
        taker.x = iox; taker.y = ioy - dir * 0.5;
        separate();
        kickPass(taker, opt, 'progressive', { x: iox, y: ioy });
        markLaunch(sp, iox, ioy);
        bubble(taker, '↔ 간접 프리킥', '#bfe8ff', 1.2);
        say('간접 프리킥 — ' + U.josa(short(taker.name), '이/가') + ' ' + short(opt.name) + '에게 내줍니다.', 'normal');
      } else if (opt) { giveBall(opt); }
      return;
    }

    ball.exempt = false;

    if (sp.type === 'corner') {
      /* v19 ③ — 코너는 확률 한 번이 아니라 박스 경합 지점으로 진짜 로프트 볼을 띄운다 */
      launchContest(sp, side);
      return;
    } else if (sp.type === 'pk') {
      tx = clamp(50 + range(-4, 4), 42, 58);
      ty = gy;
      xg = 0.74;
      dur = 0.62;
      by = taker || scorer;
      say('⚽ 키커가 달려들어 찹니다!', 'shot');
    } else {
      var direct = dist < 30;
      xg = direct ? 0.11 + ((taker && taker.player.set.fk) || 5) / 260 : 0.09;
      tx = direct ? clamp(50 + range(-7, 7), 38, 62) : clamp(50 + range(-6, 6), 36, 64);
      ty = direct ? gy : gy - dir * 10;
      dur = direct ? 0.7 : 1.0;
      by = taker || scorer;
      bubble(taker || scorer, direct ? '🔥 직접 슛!' : '🎯 세트피스 크로스!', '#ffb066', 1.3);
      if (side === 'home' && buffOf('setpiece') > 0) { xg += 0.05; }
      say(direct ? '프리킥 — 직접 골문을 노립니다!' : '프리킥 크로스가 박스로 올라갑니다!', 'shot');
    }

    speed = clamp(Math.hypot(tx - ball.x, ty - ball.y) / dur, 16, 140);
    var originX = ball.x, originY = ball.y;
    ball.x = originX; ball.y = originY;
    if (by) { by.x = originX; by.y = originY + dir * 0.6; }
    if (by) { separate(); }      /* v16 — 키커를 공 위치로 순간이동시킨 뒤 인접 선수와 겹치지 않게 */
    markLaunch(sp, originX, originY);
    kickBall(by, tx, ty, speed, 'shot', null, 1);
    ball.dur = dur;
    var onT = 0.55 + (side === 'home' ? mfx('jump') * 0.01 : 0) - (side === 'away' ? mfx('def') * 0.006 : 0);
    if (sp.type === 'pk') { onT = 0.90; }
    ball.shot = {
      by: by, xg: xg, onTarget: chance(clamp(onT, 0.2, 0.94)), isGoal: chance(clamp(xg, 0.02, 0.8)),
      long: dist > 26, tx: tx, gy: gy, ox: originX, oy: originY
    };
    if (sp.type === 'pk') {
      var gkPk = goalkeeper(side === 'home' ? 'away' : 'home');
      if (gkPk) { gkPk.diveT = 0.7; gkPk.diveDir = (tx - gkPk.x) >= 0 ? 1 : -1; }
      if (by) { setPose(by, 'kick', 0.42); }
    }
    countShot(side, xg);
    if (side === 'home') { charge(1.2); }
  }

  /* ─────────────────────────  리셋  ─────────────────────────
     v25 ③ — 킥오프 세리머니: 양 팀이 자기 진영에 정확히 자리 잡고(KICK-OFF 포메이션),
     0.9~1.1초 동안 휘슬·파동 링·배너를 보여 준 뒤, 센터 서클 키커가 실제 첫 패스를
     하며 경기가 출발한다. 멈춰 서서 어중간하게 시작하는 프레임을 없했다. */
  function kickoffPositions(kickSide) {
    var i, p, home;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off) { continue; }
      home = p.side === 'home';
      p.x = clamp(p.baseX, 4, WORLD_W - 4);
      p.y = home ? clamp(p.baseY, 61.2, WORLD_H - 3) : clamp(p.baseY, 3, WORLD_H - 61.2);
      p.tx = p.x; p.ty = p.y;
      p.vx = 0; p.vy = 0; p.moving = false; p.speed = 0; p.frame = 0;
      p.stun = 0; p.diveT = 0; p.bubble = null; p.throughRun = null;
      p.mark = null; p.dribbleT = 0; p.setPos = null; p.pose = null; p.poseT = 0;
      p.popT = 0; p.kind = isGK(p) ? 'gk' : 'keep';
    }
    /* 수비 팀은 센터 서클(반지름 9.15) 밖으로 물러난다 */
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off || p.side === kickSide) { continue; }
      if (p.side === 'home') { p.y = Math.max(p.y, 69.8); }
      else { p.y = Math.min(p.y, 50.2); }
      p.tx = p.x; p.ty = p.y;
    }
    /* 키커 두 명 — 공 바로 뒤와 그 옆. 화면상 자기 골문 쪽이 뒤가 된다. */
    var list = [], dir = goalDir(kickSide);
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off || p.side !== kickSide || isGK(p)) { continue; }
      list.push(p);
    }
    list.sort(function (a, b) {
      var wa = (isFwdGroup(a) ? 2 : (isMidGroup(a) ? 1 : 0));
      var wb = (isFwdGroup(b) ? 2 : (isMidGroup(b) ? 1 : 0));
      if (wb !== wa) { return wb - wa; }
      return Math.hypot(a.x - 50, a.y - 60) - Math.hypot(b.x - 50, b.y - 60);
    });
    var k1 = list[0] || null, k2 = list[1] || null;
    if (k1) {
      k1.x = 50; k1.y = 60 - dir * 0.9;
      k1.tx = k1.x; k1.ty = k1.y;
      k1.facing = 1;
    }
    if (k2) {
      k2.x = 46.5; k2.y = 60 - dir * 3.4;
      k2.tx = k2.x; k2.ty = k2.y;
    }
    return { k1: k1, k2: k2 };
  }

  function kickoffSetup(kickSide, label, sub, dur) {
    var pair = kickoffPositions(kickSide);
    ball.x = 50; ball.y = WORLD_H / 2; ball.vx = 0; ball.vy = 0; ball.z = 0; ball.vz = 0;
    ball.carrier = null; ball.from = null; ball.receiver = null;
    ball.kind = 'idle'; ball.shot = null; ball.trail = [];
    ball.offside = null; ball.exempt = true;
    ball.px = ball.x; ball.py = ball.y; ball.pz = 0;
    play.phase = 'kickoff';
    play.stage = 'build'; play.stageT = 0;
    play.atkSide = kickSide;
    play.counterT = 0; play.recoverT = 0; play.passLine = null; play.setpiece = null;
    kick = {
      side: kickSide, t: 0, t0: dur || 1.0, label: label || 'KICK OFF', sub: sub || '',
      k1: pair.k1, k2: pair.k2, acc: 0, rings: 0
    };
    v25t.kickoff++;
    setSit('kickoff', label + ' · ' + teamShort(kickSide), true);
    banner(label, sub, 'kick');
    bannerT = 1.5;
    SND.whistle(0.9);
    spawnPart({ kind: 'wave', x: 50, y: 60, t0: 0.75, size: 8, color: '#c8f169', a0: 0.8, flat: 0.42 });
    spawnPart({ kind: 'wave', x: 50, y: 60, t0: 0.95, size: 13, color: '#eaffd0', a0: 0.5, flat: 0.42 });
  }

  /* 세리머니 동안 매 프레임 — 링이 퍼지고, 끝나면 실제 첫 패스로 경기를 연다 */
  function kickoffTick(dt) {
    if (!kick) { return; }
    kick.t += dt;
    kick.acc += dt;
    if (kick.acc >= 0.28) {
      kick.acc = 0;
      kick.rings++;
      spawnPart({ kind: 'wave', x: 50, y: 60, t0: 0.7, size: 7, color: '#c8f169', a0: 0.55, flat: 0.42 });
    }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) { bannerT = 0; clearBanner(); } }
    if (kick.t >= kick.t0) { kickoffRelease(); }
  }

  function kickoffRelease() {
    var k = kick, i, p, starter = null, mate = null, bestD = 999, dir;
    if (!k) { return; }
    kick = null;
    play.phase = 'play';
    v25t.kickoffPass++;
    starter = k.k1;
    if (!starter || starter.off) {
      for (i = 0; i < players.length; i++) {
        p = players[i];
        if (p.side === k.side && !p.off && !isGK(p)) { starter = p; break; }
      }
    }
    if (!starter) { return; }
    dir = goalDir(k.side);
    /* 첫 패스 상대 — 자기 골문 쪽(뒤)으로 내주는 짧은 패스. 없으면 옆 동료. */
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p === starter || p.off || p.side !== k.side || isGK(p)) { continue; }
      var back = (p.y - starter.y) * -dir;       /* 뒤쪽일수록 + */
      var dd = Math.hypot(p.x - starter.x, p.y - starter.y) + (back > 0 ? 0 : 6);
      if (dd < bestD) { bestD = dd; mate = p; }
    }
    giveBall(starter);
    ball.exempt = true;
    setPose(starter, 'pass', 0.3);
    fxKickSwing(starter, 0.7, '#eaffd0');
    if (mate) {
      kickPass(starter, mate, 'short');
      say('🎙 ' + U.josa(short(starter.name), '이/가') + ' 킥오프 패스로 경기를 엽니다!', 'big');
    } else {
      bubble(starter, '경기 시작!', '#eaffd0', 1.2);
    }
    SND.whistle();
    play.phase = 'play';
  }

  function resetKickoff(side, opts) {
    opts = opts || {};
    kickoffSetup(side, opts.label || 'KICK OFF', opts.sub || '', opts.dur || 1.0);
    M.phase = 'play';
    goalStage = null;
    cel = null;
    netFx.t = 0;
    resetCamera();
  }

  /* ─────────────────────────  메인 루프  ───────────────────────── */
  function loop(t) {
    if (!M.running) { return; }
    if (!lastT) { lastT = t; }
    var realDt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    if (artGateOn) {
      artGateT += realDt;
      if (headLeft <= 0 || artGateT > 9) {
        artGateOn = false;
        M.paused = false;
        acc = 0;
        say('선수단 입장 완료! 양 팀 22명이 피치에 섰습니다.', 'big');
      }
    }
    if (!M.paused) {
      /* v30 — 골 임팩트(골망 출렁·슬로모션) 뒤에 GOAL 컷인을 띄운다. 실제 시간으로 깎는다. */
      if (goalCutinPend > 0) {
        goalCutinPend -= realDt;
        if (goalCutinPend <= 0) {
          goalCutinPend = 0;
          if (goalCutinWho) { goalCutin(goalCutinWho); goalCutinWho = null; }
        }
      }
      /* v30 — 슬로우 모션은 실시간으로 깍는다(배속과 무관하게 0.42초) */
      if (slowmo.t > 0) { slowmo.t -= realDt; if (slowmo.t < 0) { slowmo.t = 0; } }
      if (cutinHold > 0) {
        /* v26c ② — 기술/골 컷인 정지. 배속(×1/×2/×3)과 무관하게 실제 시간으로만 깎고,
           이 동안 step()은 한 번도 돌지 않아 경기 시계·선수 이동·손패 쿨다운이 모두 멈춘다.
           ×3 배속에서 1.7초 컷인이 0.57초 만에 끝나 뒤에서 경기 시간이 흘러가던 버그 수정. */
        cutinHold -= realDt;
        if (cutinHold <= 0) { cutinHold = 0; hideCutin(); }
        acc = 0;
        renderAlpha = 1;
      } else {
        var dt = realDt * M.speed * (slowmo.t > 0 ? slowmo.k : 1);
        acc += dt;
        var stepDt = 1 / 60, guard = 0;
        while (acc >= stepDt && guard < 14) { step(stepDt); acc -= stepDt; guard++; }
        /* v21 ③ — 다음 스텝까지 남은 시간 비율로 렌더 좌표를 보간한다.
           60Hz 시뮬레이션을 120Hz 화면에 그려도 끊기지 않는다. */
        renderAlpha = clamp(acc / stepDt, 0, 1);
      }
    } else {
      renderAlpha = 1;
    }
    v21t.frames++;
    draw();
    if (M.running) { rafId = requestAnimationFrame(loop); }
  }

  function step(dt) {
    if (M.phase === 'ended') { return; }
    simFrame++;
    v21t.steps++;
    /* v30 — 세리머니 → 킥오프 암전 전환 타이머 (모든 단계에서 실제 시간으로 진행) */
    if (fadeFx.t > 0) { fadeFx.t -= dt; if (fadeFx.t < 0) { fadeFx.t = 0; } }
    /* v21 ③ — 이번 스텝 전 좌표를 남겨 렌더에서 보간한다 */
    var pi;
    for (pi = 0; pi < players.length; pi++) { players[pi].px = players[pi].x; players[pi].py = players[pi].y; }
    ball.px = ball.x; ball.py = ball.y; ball.pz = ball.z;

    /* v25 ③ — 킥오프 세리머니: 이 동안은 경기 시계도 선수도 멈춰 있다.
       휘슬과 함께 키커가 첫 패스를 하면 그때 경기가 열린다. */
    if (kick) {
      kickoffTick(dt);
      updateParts(dt);
      updateDecals(dt);
      crowdTick(dt);
      updateCamera(dt);
      if (hudDirty) { hudDirty = false; pushHud(); }
      return;
    }

    /* v26c ② — 컷인 중에는 step 자체를 진행하지 않는다(차감은 loop()가 realDt로 담당). */
    if (cutinHold > 0) { return; }

    var i;
    for (i = 0; i < hand.length; i++) { if (hand[i].readyAt > 0) { hand[i].readyAt -= dt; hudDirty = true; } }
    for (var k in buffs) {
      if (buffs.hasOwnProperty(k) && buffs[k] > 0) {
        buffs[k] -= dt;
        if (buffs[k] <= 0) { buffs[k] = 0; hudDirty = true; }
      }
    }
    /* v25c (B3) — 모멘텀 수급 완화: 시간당 0.42 → 0.34, 패스당 0.5 → 0.4(약 20%).
       후반에 100/100이 계속 차 있어 카드 선택이 무의미해지던 문제를 줄인다. */
    momentum = clamp(momentum + dt * 0.34, 0, 100);
    if (autoCards) {
      autoT -= dt;
      if (autoT <= 0) { autoT = 8; tryAutoCard(); }
    }
    play.runT -= dt;
    if (play.runT <= 0) {
      var shp = shapeOf(play.atkSide);
      play.runT = shp.runMin + Math.random() * (shp.runMax - shp.runMin);
      assignRuns(shp.runs);
    }
    if (play.counterT > 0) { play.counterT -= dt; }
    if (play.recoverT > 0) { play.recoverT -= dt; }
    if (play.markT > 0) { play.markT -= dt; }
    /* v19 — 전환 창 · 원투 유효시간 */
    if (trans.t > 0) {
      trans.t -= dt;
      if (trans.t <= 0) { trans.side = null; trans.kind = null; trans.t = 0; }
    }
    if (oneTwo) {
      oneTwo.t -= dt;
      if (oneTwo.t <= 0) { oneTwo = null; }
    }
    if (play.passLine) {
      play.passLine.t -= dt;
      if (play.passLine.t <= 0) { play.passLine = null; }
    }
    for (i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += dt;
      if (ripples[i].t >= ripples[i].t0) { ripples.splice(i, 1); }
    }
    /* v25 ② — 파티클·데칼 수명 */
    updateParts(dt);
    updateDecals(dt);
    tickSit(dt);
    /* v25 — 땀방울 (피로 40% 이하) · 스턴 별 */
    for (i = 0; i < players.length; i++) {
      var ps = players[i];
      if (ps.off) { continue; }
      if (ps.stam <= 40) {
        ps.sweatT = (ps.sweatT || 0) + dt;
        if (ps.sweatT > 0.85) {
          ps.sweatT = 0;
          spawnPart({
            kind: 'sweat', x: ps.x + (ps.facing > 0 ? 0.5 : -0.5), y: ps.y, z: 1.4,
            vx: (ps.moving ? ps.vx * 0.03 : 0) + range(-0.5, 0.5), vy: range(-0.7, 0.7), vz: -0.3,
            g: 12, drag: 1.4, t0: 0.5, size: 0.9, color: 'rgba(150,224,255,0.95)', a0: 0.85, front: true
          });
        }
      }
    }
    /* v25 — 압박 트리거의 2연속 압박 (카드 설명대로 두 번은 확실히 붙는다) */
    if (pressChain.n > 0) {
      pressChain.t -= dt;
      if (pressChain.t <= 0) { firePressChain(); }
    }
    if (shake.t > 0) { shake.t -= dt; if (shake.t < 0) { shake.t = 0; } }
    if (flash.t > 0) { flash.t -= dt; if (flash.t < 0) { flash.t = 0; } }
    if (touchFx.t > 0) { touchFx.t -= dt; if (touchFx.t < 0) { touchFx.t = 0; } }
    /* v29 ③ — 전술 상성 재판단(상대 감독 포스처 변경·하프타임 포함) · 피드백 칏 수명 */
    if (matchupFx.t > 0) { matchupFx.t -= dt; if (matchupFx.t < 0) { matchupFx.t = 0; } }
    matchupEvalT -= dt;
    if (matchupEvalT <= 0) { matchupEvalT = 7; try { evalMatchup(false); } catch (eMU2) { /* noop */ } }
    if (netFx.t > 0) { netFx.t -= dt; if (netFx.t < 0) { netFx.t = 0; } }
    if (flagShow.t > 0) { flagShow.t -= dt; if (flagShow.t < 0) { flagShow.t = 0; } }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) { bannerT = 0; clearBanner(); } }
    for (i = 0; i < players.length; i++) {
      var pp = players[i];
      if (pp.popT > 0) { pp.popT -= dt; if (pp.popT < 0) { pp.popT = 0; } }
      if (pp.bubble) { pp.bubble.t -= dt; if (pp.bubble.t <= 0) { pp.bubble = null; } }
      if (pp.skillT > 0) { pp.skillT -= dt; }
      if (pp.glow > 0) { pp.glow -= dt; }
      if (pp.diveT > 0) { pp.diveT -= dt; }
      if (pp.poseT > 0) { pp.poseT -= dt; if (pp.poseT <= 0) { pp.pose = null; } }
      if (pp.dribbleT > 0) { pp.dribbleT -= dt; }
      if (pp.throughRun) { pp.throughRun.t -= dt; if (pp.throughRun.t <= 0) { pp.throughRun = null; } }
      if (pp.supportT > 0) { pp.supportT -= dt; }
      if (pp.runT > 0) { pp.runT -= dt; }
    }

    /* 골 세리머니 (v27 — 리플레이 없이 끝나면 바로 킥오프) */
    if (play.phase === 'goal') {
      play.timer -= dt;
      updateTargets(dt);
      if (goalStage === 'celebrate' && cel) { applyCelebration(); }
      for (i = 0; i < players.length; i++) { movePlayer(players[i], dt); }
      separate();
      crowdTick(dt);
      updateCamera(dt);
      if (goalStage === 'celebrate') {
        goalT -= dt;
        if (goalT <= 0) { finishCelebration(); }
      }
      return;
    }

    /* v17 — 해설(2인 중계) 대기열 */
    if (cmtQ.length) {
      cmtT -= dt;
      if (cmtT <= 0) { cmtT = 1.05; var ce = cmtQ.shift(); say(ce.text, ce.kind, 'exp'); }
    }
    crowdTick(dt);

    simTime += dt;
    M.clock = Math.min(90, simTime / PER_MIN);

    /* v15 — 45분·90분에 그 하프에 쌓인 지연 시간으로 추가시간 결정 (45+1′~5′ · 90+2′~6′) */
    if (!addedDecided.first && simTime >= 45 * PER_MIN) {
      addedDecided.first = true;
      addedTime.first = clamp(Math.round(deadTime / (PER_MIN * 4)), 1, 3);
      if (v15) { v15.added[0] = addedTime.first; }
      say('📋 전반 추가시간 ' + addedTime.first + '분!', 'tactic');
    }
    if (halftimeDone && !addedDecided.second && simTime >= 90 * PER_MIN) {
      addedDecided.second = true;
      addedTime.second = clamp(Math.round(deadTime / (PER_MIN * 4)), 2, 4);
      if (v15) { v15.added[1] = addedTime.second; }
      say('📋 후반 추가시간 ' + addedTime.second + '분!', 'tactic');
    }
    if (Math.floor(simTime * 2) % 2 === 0) { updateScoreboard(); }
    /* v19 ② — AI 감독 포스처 재판단 (55/70/80분) */
    aiPostureTick();
    /* v19 ④ — 평균 포지션 샘플링 (오픈 플레이 0.3초 간격) */
    posT -= dt;
    if (posT <= 0) {
      posT = 0.3;
      if (play.phase === 'play' && ball.carrier) { samplePositions(); }
    }

    if (!halftimeDone && simTime >= (45 + addedTime.first) * PER_MIN) {
      halftimeDone = true;
      M.paused = true;
      M.halftime = true;
      for (var hi = 0; hi < players.length; hi++) {
        players[hi].stam = clamp(players[hi].stam + 11, 3, 100);
      }
      hudDirty = true;
      say('전반 종료! ' + M.homeScore + ' : ' + M.awayScore, 'big');
      say('선수들이 물을 들이킵니다. 하프타임에 교체를 준비하세요.', 'normal');
      SND.whistle('long');
      /* v26 — 하프타임: BGM 톤을 살짝 낮춘다(후반 시작에 원래대로) */
      try { if (DS.Bgm) { DS.Bgm.setHalf(true); } } catch (eH) { /* 무시 */ }
      sayExp('전반 슈팅 ' + (goalStats.homeShots + goalStats.awayShots) + '개, 점유율은 ' +
        Math.round(possession.home / (possession.home + possession.away) * 100) + '대 ' +
        (100 - Math.round(possession.home / (possession.home + possession.away) * 100)) +
        '입니다. 후반에는 ' + (goalStats.homeShots < goalStats.awayShots ? '슈팅 숫자를 끌어올려야 합니다.' : '이 흐름을 유지하면 됩니다.'));
      if (cfg.onHalftime) { cfg.onHalftime(); }
      return;
    }
    if (halftimeDone && simTime >= (90 + addedTime.second) * PER_MIN) { endMatch(); return; }

    /* 오프사이드 트랩 — v18 ③: 일자 하이 라인이 유지되는 동안에는 상대가 라인을 넘는 순간을
       실제로 잡아낸다 (v17은 라인이 1프레임 만에 풀려 이 판정도 거의 걸리지 않았다) */
    if (buffOf('offside') > 0 && ball.carrier && ball.carrier.side === 'away') {
      v18t.trapLive += 1;
      if (progressOf('away', ball.carrier.y) > 0.35) { v18t.trapZone += 1; }
      if (progressOf('away', ball.carrier.y) > 0.35 && chance(dt * 0.9)) {
        var att = ball.carrier;
        bubble(att, '🚩 오프사이드!', '#9fd8ff', 1.6);
        say('🚩 오프사이드 선언! 수비 라인의 트랩이 통했습니다.', 'tackle');
        var fk = goalkeeper('home') || nearestToBall('home');
        ball.carrier = null;
        ball.kind = 'idle';
        ball.vx = 0; ball.vy = 0;
        ball.x = att.x; ball.y = att.y;
        if (fk) { giveBall(fk); }
        setSit('fk', '오프사이드 트랩 성공', true);
        v18t.trapCaught += 1;          /* v18 ③ 계측: 일자 하이 라인이 실제로 잡아낸 횟수 */
        /* v25c (M3) — 트랩이 잡아낸 것도 상대 오프사이드로 집계해 계측·결과가 어긋나지 않게 */
        if (v15) { v15.offside.away += 1; }
        return;
      }
    }

    /* 세트피스 대기 */
    if (play.phase === 'setpiece') {
      var sp = play.setpiece;
      updateTargets(dt);
      for (i = 0; i < players.length; i++) { movePlayer(players[i], dt); }
      separate();
      updateCamera(dt);
      crowdTick(dt);
      if (sp) {
        sp.t -= dt;
        if (sp.t <= 0) { executeSetpiece(sp); }
      } else { play.phase = 'play'; }
      lastHud += dt;
      if (hudDirty || lastHud > 0.5) { lastHud = 0; pushHud(); }
      return;
    }

    if (play.phase === 'kickoff') {
      play.phase = 'play';
    }

    /* 안전장치: 공이 경기장 밖으로 크게 벗어나면 루즈볼로 회수 (공이 무한히 날아가는 정지 방지) */
    if (ball.x < -10 || ball.x > WORLD_W + 10 || ball.y < -10 || ball.y > WORLD_H + 10) {
      ball.x = clamp(ball.x, 6, WORLD_W - 6);
      ball.y = clamp(ball.y, 6, WORLD_H - 6);
      ball.kind = 'idle';
      ball.vx = 0; ball.vy = 0;
      ball.flight = 0;
      ball.shot = null;
      play.looseT = 1.2;
    }

    updateStage(dt);
    updateTargets(dt);
    for (i = 0; i < players.length; i++) { movePlayer(players[i], dt); }
    separate();
    updateBall(dt);
    updateCamera(dt);

    fillerTimer -= dt;
    if (fillerTimer <= 0) {
      fillerTimer = 7 + Math.random() * 6;
      if (ball.carrier && chance(0.55)) {
        say(pick([
          '중원에서 치열한 공방전이 이어집니다.',
          '양 팀 모두 물러서지 않습니다.',
          U.josa(short(ball.carrier.name), '이/가') + ' 공을 지키고 있습니다.',
          '패스 한 번, 패스 한 번 — 호흡이 좋습니다.',
          '벤치에서도 목소리가 커집니다!',
          '관중들이 박자를 맞춥니다. 둥둥둥!'
        ]), 'normal');
      } else if (!ball.carrier && chance(0.4)) {
        say('공이 공중에 뜹니다! 모두 머리를 향해 달려갑니다!', 'normal');
      }
      /* v17 — 캐스터·해설 티키타카: 잠잠한 시간에도 해설위원이 전술을 읽어 준다 */
      if (chance(0.5) && !cmtQ.length) { sayExp(pick(EXP_GEN)); }
    }

    lastHud += dt;
    if (hudDirty || lastHud > 0.5) { lastHud = 0; pushHud(); }
  }

  function updateStage(dt) {
    var c = ball.carrier;
    if (!c) { return; }
    var prog = progressOf(c.side, c.y);
    var sideLane = (c.x < 22 || c.x > 78);
    var st;
    if (prog < 0.34) { st = 'build'; }
    else if (prog < 0.62) { st = 'mid'; }
    else if (sideLane && prog < 0.87) { st = 'wide'; }
    else { st = 'final'; }
    if (st !== play.stage) { play.stage = st; play.stageT = 0; }
    play.stageT += dt;

    /* v21 ② — 자기 진영 정체 타이머: 공을 가진 팀이 우리 진영(진행도 42% 미만)에서만
       돌리면 시간이 쌓인다. 앞으로 나가면 빨리 줄어든다. */
    if (play.phase === 'play' && c) {
      if (prog < 0.42) {
        if (ownHalfSide === c.side) { ownHalfT += dt; }
        else { ownHalfSide = c.side; ownHalfT = dt; }
        if (ownHalfT > 7 && Math.floor(ownHalfT) % 3 === 0) { v21t.stallWarn++; }
      } else {
        ownHalfT = Math.max(0, ownHalfT - dt * 1.8);
        if (ownHalfT <= 0) { ownHalfSide = null; }
      }
    } else if (play.phase !== 'play') {
      ownHalfT = Math.max(0, ownHalfT - dt * 3);
      if (ownHalfT <= 0) { ownHalfSide = null; }
    }

    if (play.phase !== 'play') { return; }
    if (play.counterT > 0) {
      setSit(play.counterSide === 'home' ? 'counterAtk' : 'counterDef');
    } else if (buffOf('press') > 0 && c.side === 'away') {
      setSit('press');
    } else {
      setSit(st);
    }
  }

  function updateBall(dt) {
    var c = ball.carrier, i, q, d;
    if (c) {
      possession[c.side] += dt;
      ball.x = c.x + (50 - c.x) * 0.012;
      ball.y = c.y + goalDir(c.side) * 1.4;
      ball.z = 0; ball.vz = 0;
      ball.flight = 0;
      var near = nearestOpponentPx(c, tacklePx());
      if (near.player) { tryTackle(near.player, c, dt); }
      actionTimer -= dt;
      if (actionTimer <= 0 && ball.carrier === c) {
        actionTimer = 0.36 + Math.random() * 0.22;
        decide();
      }
      return;
    }

    var prevX = ball.x, prevY = ball.y;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.flight += dt;
    /* v29 — 곡선 궤적: 직선 진행 위에 sin 곡선의 수직 오프셋을 더한다 (종점은 aim 유지) */
    if (ball.bend && ball.dur > 0.02 && ball.aim) {
      var bpr = clamp(ball.flight / ball.dur, 0, 1);
      var bax = ball.aim.x - (ball.bx0 == null ? prevX : ball.bx0);
      var bay = ball.aim.y - (ball.by0 == null ? prevY : ball.by0);
      var blen = Math.max(0.001, Math.hypot(bax, bay));
      var boff = Math.sin(bpr * Math.PI) * ball.bend;
      ball.x = (ball.bx0 == null ? prevX : ball.bx0) + bax * bpr + (-bay / blen) * boff;
      ball.y = (ball.by0 == null ? prevY : ball.by0) + bay * bpr + (bax / blen) * boff;
    }
    if (ball.z > 0 || ball.vz > 0) {
      ball.z += ball.vz * dt;
      ball.vz -= BALL_G * dt;
      if (ball.z <= 0) { ball.z = 0; ball.vz = 0; }
    }
    if (ball.trail.length === 0) { ball.trail.push({ x: ball.x, y: ball.y }); }
    else {
      var last = ball.trail[ball.trail.length - 1];
      if (Math.hypot(last.x - ball.x, last.y - ball.y) > 0.8) {
        ball.trail.push({ x: ball.x, y: ball.y, z: ball.z });
        if (ball.trail.length > 22) { ball.trail.shift(); }
      }
    }

    if (ball.kind === 'contest') {
      /* v19 ③ — 박스로 올라간 로프트 볼이 경합 지점에 도착하면 공중볼 승부를 해소한다 */
      if (ball.flight >= ball.dur) { resolveContest(); return; }
    } else if (ball.kind === 'shot') {
      if (ball.flight >= ball.dur) { resolveShot(); return; }
    } else if (ball.kind === 'pass') {
      /* 패스 차단 */
      for (i = 0; i < players.length; i++) {
        q = players[i];
        if (q.off || (ball.from && q.side === ball.from.side) || q === ball.receiver) { continue; }
        d = Math.hypot(q.x - ball.x, q.y - ball.y);
        if (d < 2.5) {
          var pInt = clamp(1.0 * dt * (1 + q.player.stats.def / 110), 0, 0.45);
          if (buffOf('press') > 0 && q.side === 'home') { pInt *= 1.4; }
          if (buffOf('tiki') > 0 && ball.from && ball.from.side === 'home') { pInt *= 0.7; }
          if (q.side === 'home') { pInt *= 1 + mfx('press') * 0.02 + mfx('def') * 0.01; }
          if (ball.from && ball.from.side === 'home') { pInt *= 1 - clamp(mfx('pass') * 0.02, 0, 0.16); }
          if (chance(pInt)) {
            stats.interceptions++;
            if (ball.crossKind === 'switch') { noteSwitchDone(null, false); }
            bubble(q, '🛡️ 차단!', '#9fd8ff', 1.2);
            say(U.josa(short(q.name), '이/가') + ' 패스를 읽고 차단합니다!', 'tackle');
            giveBall(q);
            M.phase = 'play';
            return;
          }
        }
      }
      /* 리시버 트래핑 */
      if (ball.receiver && d2(ball.receiver, ball) < 2.6) {
        var rv = ball.receiver, wt = oneTwo;
        var ckRecv = ball.crossKind;
        oneTwo = null;
        giveBall(rv);
        if (ckRecv === 'switch') { noteSwitchDone(rv, true); }
        else if (ckRecv === 'through') { noteThroughDone(rv); }
        addRating(rv, 0.02);
        M.phase = 'play';
        /* v19 ① — 원투: 벽 역할을 한 선수가 공간으로 빠져나왔으면 곧바로 리턴 패스 */
        if (wt && wt.receiver === rv && ball.carrier === rv) { wallReturn(rv, wt); }
        return;
      }
      /* v18 ④ — 패스는 목표 지점에서 멈춘다.
         v17은 dur+0.25초까지 같은 속도로 더 날아가, 목표가 라인 근처면 최대 16단위를
         넘어가서 그대로 아웃됐다(목표 좌표를 안쪽으로 클램프한 의미가 사라졌음). */
      if (ball.flight >= ball.dur) {
        if (ball.aim) { ball.x = ball.aim.x; ball.y = ball.aim.y; }
        settleBall();
        return;
      }
    }

    if (ball.y < 1 || ball.y > WORLD_H - 1 || ball.x < 1 || ball.x > WORLD_W - 1) {
      if (ball.kind === 'shot' && ball.shot) { resolveShot(); return; }
      /* v18 ④ — 라인을 넘은 정확한 교차점을 먼저 구한다 */
      var cr = crossSpot(prevX, prevY, ball.x, ball.y);
      var ed = cr ? cr.edge : (ball.x < 1 || ball.x > WORLD_W - 1 ? 'x' : (ball.y < 1 ? 'y0' : 'y120'));
      ball.kind = 'idle';
      ball.vx = 0; ball.vy = 0;
      ball.flight = 0;
      outOfPlay(ed, cr);
      return;
    }

    if (!ball.carrier && ball.kind === 'idle') {
      play.looseT += dt;
      if (play.looseT > 1.1) {
        var np = nearestToBall(play.atkSide === 'home' ? 'away' : 'home', 999) ||
                 nearestToBall(play.atkSide, 999);
        if (np) { giveBall(np); }
        play.looseT = 0;
      }
    }
  }

  /* ─────────────────────────  종료  ───────────────────────── */
  function endMatch() {
    M.phase = 'ended';
    M.running = false;
    M.clock = 90;
    updateScoreboard();
    say('경기 종료! 스코어 ' + M.homeScore + ' : ' + M.awayScore, 'big');
    SND.whistle('long');
    SND.cheer(M.homeScore >= M.awayScore ? 0.9 : 0.45, 2.4);
    global.setTimeout(function () { SND.ambientOff(); }, 2600);
    /* v26 — 경기 종료 → 로비 테마로 (휘슬·함성이 먼저 들리게 1.3초 뒤에) */
    SND.matchOn(false);
    try { if (DS.Bgm) { DS.Bgm.play('lobby', 1.35); } } catch (eE) { /* 무시 */ }

    var i;
    var best = null;
    for (i = 0; i < ratings.length; i++) {
      var r = ratings[i];
      r.rating = Math.round(r.rating * 10) / 10;
      if (!r.subbedOut && (!best || r.rating > best.rating)) { best = r; }
    }
    if (best) { best.mvp = true; }

    var totP = possession.home + possession.away;
    var homePoss = Math.round(possession.home / totP * 100);

    var res = {
      homeScore: M.homeScore,
      awayScore: M.awayScore,
      half: halfScore,
      goals: goals,
      cautions: cautions,
      ratings: ratings,
      mvp: best ? { name: best.name } : null,
      mvpRating: best ? best.rating : 6,
      shots: { home: goalStats.homeShots, away: goalStats.awayShots },
      passes: stats.passes,
      tackles: stats.tackles,
      saves: stats.saves,
      possession: [homePoss, 100 - homePoss],
      cards: cardUses,
      momentum: Math.round(momentum),
      xg: [Math.round(homeXg * 10) / 10, Math.round(awayXg * 10) / 10],
      /* v29 — 수석코치 총평용 실측 자료 */
      touch: M.touchState(),
      v29: M.v29(),
      matchup: matchupState(),
      opponent: {
        formation: formationOf('away'), style: styleKeyOf('away'),
        styleName: styleOf('away').name, posture: aiPosture,
        manager: (cfg && cfg.awayManagerName) || ''
      },
      ours: {
        formation: formationOf('home'), style: (cfg && cfg.homeTacticStyle) || 'balanced',
        manager: (cfg && cfg.managerName) || ''
      },
      stamina: (function () {
        var o = [], k2, q2;
        for (k2 = 0; k2 < players.length; k2++) {
          q2 = players[k2];
          if (q2.side !== 'home') { continue; }
          o.push({ name: q2.name, pos: q2.pos, stam: Math.round(q2.stam) });
        }
        return o;
      })(),
      /* v19 ④ — 상세 결과서용 원자료 (슈팅 로그 · 평균 포지션 · 패스 연결망) */
      tele: reportData(),
      v19: v19Summary()
    };
    if (cfg.onEnd) { cfg.onEnd(res); }
  }

  /* ───────────────  그리기 (가로 피치 · 원형 초상화 토큰)  ───────────────
     v10: 피치 위 22명의 몸통을 지우고, 고유 얼굴을 담은 원형 토큰으로 그린다.
     원 바깥 두까운 링이 팀을 나누다 — 홈 = 생생한 파랑, 원정 = 생생한 빨강. */
  /* v25b — 팀 색은 유니폼이 아니라 고정 팔레트다.
     홈(우리 팀) = 선명한 파랑 #2f8dff · 원정 = 선명한 빨강 #ff4b4b.
     v25에서는 유니폼 색으로 링을 칠했는데, 초록·검정·흰색 유니폼 구단을 만나면
     링이 잔디에 묻혀 누가 우리 선수인지 한눈에 안 보였다. 어떤 구단과 붙어도
     늘 같은 두 색으로 갈라 보이게 하고, 스코어보드·점유율 바·결과서 xG맵도
     이 두 색을 그대로 쓴다(DS.Match.teamColors). */
  var HOME_COL = '#2f8dff', AWAY_COL = '#ff4b4b';
  var TEAM_FX_DEF = {
    home: { ring: '#2f8dff', ring2: '#8ec4ff', glow: 'rgba(47,141,255,0.95)', base: 'rgba(8,30,60,0.94)', base2: 'rgba(14,58,110,0.94)', text: '#d9ecff' },
    away: { ring: '#ff4b4b', ring2: '#ff9c9c', glow: 'rgba(255,75,75,0.95)', base: 'rgba(58,10,12,0.94)', base2: 'rgba(104,20,20,0.94)', text: '#ffe2dc' }
  };
  var TEAM_FX = {
    home: { ring: '#2f8dff', ring2: '#8ec4ff', glow: 'rgba(47,141,255,0.95)', base: 'rgba(8,30,60,0.94)', base2: 'rgba(14,58,110,0.94)', text: '#d9ecff' },
    away: { ring: '#ff4b4b', ring2: '#ff9c9c', glow: 'rgba(255,75,75,0.95)', base: 'rgba(58,10,12,0.94)', base2: 'rgba(104,20,20,0.94)', text: '#ffe2dc' }
  };

  function hexRgb(h) {
    var t = String(h || '').replace('#', '');
    if (t.length === 3) { t = t.charAt(0) + t.charAt(0) + t.charAt(1) + t.charAt(1) + t.charAt(2) + t.charAt(2); }
    var n = parseInt(t, 16);
    if (!isFinite(n) || t.length < 6) { return null; }
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbStr(rgb) { return rgb[0] + ',' + rgb[1] + ',' + rgb[2]; }
  function mixRgb(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  function applyTeamColors() {
    var white = [255, 255, 255], dark = [4, 20, 15];
    function paint(side, hex, def) {
      var f = TEAM_FX[side], rgb = hexRgb(hex);
      if (!rgb) {
        f.ring = def.ring; f.ring2 = def.ring2; f.glow = def.glow;
        f.base = def.base; f.base2 = def.base2; f.text = def.text;
        return;
      }
      f.ring = 'rgb(' + rgbStr(rgb) + ')';
      f.ring2 = 'rgb(' + rgbStr(mixRgb(rgb, white, 0.42)) + ')';
      f.glow = 'rgba(' + rgbStr(rgb) + ',0.95)';
      f.base = 'rgba(' + rgbStr(mixRgb(rgb, dark, 0.74)) + ',0.94)';
      f.base2 = 'rgba(' + rgbStr(mixRgb(rgb, dark, 0.56)) + ',0.94)';
      f.text = 'rgb(' + rgbStr(mixRgb(rgb, white, 0.80)) + ')';
    }
    paint('home', HOME_COL, TEAM_FX_DEF.home);
    paint('away', AWAY_COL, TEAM_FX_DEF.away);
  }
  applyTeamColors();
  /* v25b — 피치 밖 UI(스코어보드·점유율 바·결과서 xG맵)도 같은 두 색을 쓴다 */
  M.teamColors = { home: HOME_COL, away: AWAY_COL };

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     v25 ① — 실시간 전술카드 피치 오버레이
     카드가 켜져 있는 동안(buffs[fx] > 0) 그 카드의 전술이 '지금' 피치에서 어떻게
     움직이는지 그린다. 수치는 이미 엔진(buffOf)이 쓰고 있으므로 여기서는 눈으로
     읽히게 만드는 일만 한다. 색은 카드 고유 색(def.color)을 그대로 쓴다.
     ══════════════════════════════════════════════════════════════════════════ */
  var TAU = Math.PI * 2;
  var PART_CAP = 300;

  function initCards() {
    var i, d;
    CARD_LIST = []; CARD_BY_FX = {};
    if (!DS.CARDS) { return; }
    for (i = 0; i < DS.CARDS.length; i++) {
      d = DS.CARDS[i];
      CARD_LIST.push(d); CARD_BY_FX[d.fx] = d;
    }
  }

  function hexA(hex, a) {
    var h = (hex || '#c8f169').replace('#', '');
    if (h.length === 3) { h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2); }
    var n = parseInt(h, 16);
    if (!isFinite(n)) { n = 0xc8f169; }
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* 월드 1단위가 화면에서 몇 px 인지 (피치 중앙 기준 근사) */
  function w2px() {
    var o = scr(50, 60), ax = scr(60, 60), ay = scr(50, 70);
    return { x: Math.hypot(ax.x - o.x, ax.y - o.y) / 10, y: Math.hypot(ay.x - o.x, ay.y - o.y) / 10 };
  }

  function groundRing(wx, wy, rWorld, color, lw, alpha, flat) {
    var g = scr(wx, wy), s = w2px();
    ctx.save();
    ctx.globalAlpha = alpha == null ? 0.85 : alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 1.4;
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, Math.max(1, rWorld * s.x), Math.max(1, rWorld * s.y * (flat == null ? 0.46 : flat)), 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function arrowTo(x1, y1, x2, y2, color, lw, head, dash) {
    var ang = Math.atan2(y2 - y1, x2 - x1);
    var hd = head || 5;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 1.4;
    ctx.lineCap = 'round';
    if (dash) { ctx.setLineDash(dash); }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (dash) { ctx.setLineDash([]); }
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hd * Math.cos(ang - 0.44), y2 - hd * Math.sin(ang - 0.44));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hd * Math.cos(ang + 0.44), y2 - hd * Math.sin(ang + 0.44));
    ctx.stroke();
    ctx.restore();
  }

  /* 카드가 켜진 정도 — 켜질 때 0.22초 페이드인, 꺼지기 전 0.4초 페이드아웃 */
  function cardLife(def) {
    var left = buffs[def.fx] || 0;
    if (left <= 0) { return 0; }
    var elapsed = def.dur - left;
    return Math.min(clamp(elapsed / 0.22, 0, 1), clamp(left / 0.4, 0, 1));
  }

  function activeCardList() {
    var out = [], i, d;
    for (i = 0; i < CARD_LIST.length; i++) {
      d = CARD_LIST[i];
      if ((buffs[d.fx] || 0) > 0) { out.push(d); }
    }
    return out;
  }

  /* 이 선수가 지금 받고 있는 전술 오라 (가장 먼저 켜진 카드 하나) */
  function auraOf(p) {
    if (!p || p.off || !p.side) { return null; }
    var i, d;
    for (i = 0; i < CARD_LIST.length; i++) {
      d = CARD_LIST[i];
      if ((buffs[d.fx] || 0) <= 0) { continue; }
      if (p.side !== 'home') { continue; }
      if (d.fx === 'def' || d.fx === 'offside') {
        if (isDefGroup(p)) { return d; }
        continue;
      }
      if (d.fx === 'press' || d.fx === 'trigger') {
        if (!isGK(p) && (isMidGroup(p) || isFwdGroup(p))) { return d; }
        continue;
      }
      if (d.fx === 'atk' || d.fx === 'through' || d.fx === 'longshot') {
        if (isFwdGroup(p) || isWingerPos(p) || p.pos === 'AM') { return d; }
        continue;
      }
      if (isGK(p)) { continue; }
      return d;
    }
    return null;
  }

  function drawGroundAura(gx, gy, r, def) {
    var col = def.color;
    var t = simTime * 2.4 + (gx + gy) * 0.03;
    ctx.save();
    ctx.globalAlpha = 0.44 + 0.14 * Math.sin(t * 1.7);
    ctx.strokeStyle = hexA(col, 0.95);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 5]);
    ctx.lineDashOffset = -t * 9;
    ctx.beginPath(); ctx.ellipse(gx, gy + 1.2, r * 1.52, r * 0.68, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.14 + 0.06 * Math.sin(t * 1.7);
    ctx.fillStyle = hexA(col, 0.9);
    ctx.beginPath(); ctx.ellipse(gx, gy + 1.2, r * 1.52, r * 0.68, 0, 0, TAU); ctx.fill();
    /* 앞쪽 반원만 밝게 — 오라가 '살아 있다'는 느낌 */
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = hexA(col, 0.85);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(gx, gy + 1.2, r * 1.52, r * 0.68, 0, -0.9 + Math.sin(t) * 0.5, 0.9 + Math.sin(t) * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  /* ─────────────────────────  v25 ② — 파티클  ───────────────────────── */
  function spawnPart(o) {
    if (!o) { return null; }
    if (parts.length >= PART_CAP) { parts.shift(); }
    var q = {
      kind: o.kind || 'dot', x: o.x || 0, y: o.y || 0, z: o.z || 0,
      vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      g: o.g == null ? 30 : o.g, drag: o.drag == null ? 1.9 : o.drag,
      t: 0, t0: o.t0 || 0.5, size: o.size || 1.5, color: o.color || '#ffffff',
      a0: o.a0 == null ? 1 : o.a0, rot: o.rot || 0, vr: o.vr || 0,
      front: !!o.front, ang: o.ang || 0, span: o.span || 0, flat: o.flat
    };
    parts.push(q);
    v25t.spawn++;
    if (!v25t.kinds) { v25t.kinds = {}; }
    v25t.kinds[q.kind] = (v25t.kinds[q.kind] || 0) + 1;
    if (parts.length > v25t.maxParts) { v25t.maxParts = parts.length; }
    return q;
  }

  function updateParts(dt) {
    var i, q;
    for (i = parts.length - 1; i >= 0; i--) {
      q = parts[i];
      q.t += dt;
      if (q.t >= q.t0) { parts.splice(i, 1); continue; }
      if (q.kind === 'wave' || q.kind === 'ring' || q.kind === 'swing' || q.kind === 'passw' || q.kind === 'shield') { continue; }
      q.vz -= q.g * dt;
      q.z += q.vz * dt;
      if (q.z < 0) { q.z = 0; if (q.vz < -1) { q.vz = -q.vz * 0.28; } else { q.vz = 0; } }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      var dk = 1 - Math.min(0.9, q.drag * dt);
      q.vx *= dk; q.vy *= dk;
      q.rot += q.vr * dt;
    }
  }

  function drawParts(front) {
    var i, q, g, y, t, a, k, sz;
    for (i = 0; i < parts.length; i++) {
      q = parts[i];
      if (!!q.front !== !!front) { continue; }
      k = q.kind;
      g = scr(q.x, q.y);
      y = g.y - depthPx(q.z);
      t = clamp(q.t / q.t0, 0, 1);
      a = q.a0 * (1 - t);
      if (a <= 0.01) { continue; }
      sz = q.size;
      ctx.save();
      if (k === 'dot' || k === 'dust') {
        ctx.globalAlpha = a * 0.8;
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.ellipse(g.x, y, sz * (0.7 + t * 1.5), sz * (0.7 + t * 1.5) * 0.62, 0, 0, TAU);
        ctx.fill();
      } else if (k === 'grass') {
        ctx.globalAlpha = a;
        ctx.fillStyle = q.color;
        ctx.translate(g.x, y);
        ctx.rotate(q.rot);
        ctx.fillRect(-sz * 0.9, -sz * 0.24, sz * 1.8, sz * 0.48);
      } else if (k === 'spark') {
        ctx.globalAlpha = a;
        ctx.strokeStyle = q.color;
        ctx.lineWidth = Math.max(0.9, sz * 0.5);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(g.x, y);
        ctx.lineTo(g.x - q.vx * 0.022, y - q.vy * 0.022 + q.vz * 0.012);
        ctx.stroke();
      } else if (k === 'conf') {
        ctx.globalAlpha = a;
        ctx.fillStyle = q.color;
        ctx.translate(g.x, y);
        ctx.rotate(q.rot);
        ctx.fillRect(-sz * 0.9, -sz * 0.45, sz * 1.8, sz * 0.9);
      } else if (k === 'star') {
        ctx.globalAlpha = a;
        ctx.fillStyle = q.color;
        ctx.translate(g.x, y);
        ctx.rotate(q.rot);
        ctx.beginPath();
        ctx.moveTo(0, -sz * 1.7); ctx.lineTo(sz * 0.45, -sz * 0.45); ctx.lineTo(sz * 1.6, 0);
        ctx.lineTo(sz * 0.45, sz * 0.45); ctx.lineTo(0, sz * 1.7); ctx.lineTo(-sz * 0.45, sz * 0.45);
        ctx.lineTo(-sz * 1.6, 0); ctx.lineTo(-sz * 0.45, -sz * 0.45);
        ctx.closePath(); ctx.fill();
      } else if (k === 'sweat') {
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.ellipse(g.x, y, sz * 0.55, sz * 0.95, 0, 0, TAU);
        ctx.fill();
      } else if (k === 'wave' || k === 'shield') {
        ctx.globalAlpha = a;
        ctx.strokeStyle = q.color;
        ctx.lineWidth = Math.max(0.8, 2.4 * (1 - t));
        var rr = sz * (0.35 + t * 1.9);
        ctx.beginPath();
        ctx.ellipse(g.x, g.y, rr, rr * (q.flat == null ? 0.44 : q.flat), 0, 0, TAU);
        ctx.stroke();
      } else if (k === 'ring') {
        ctx.globalAlpha = a;
        ctx.strokeStyle = q.color;
        ctx.lineWidth = Math.max(0.8, 2.6 * (1 - t));
        var rr2 = sz * (0.2 + t * 1.6);
        ctx.beginPath(); ctx.arc(g.x, y, rr2, 0, TAU); ctx.stroke();
      } else if (k === 'swing') {
        ctx.globalAlpha = a * 0.95;
        ctx.strokeStyle = q.color;
        ctx.lineWidth = Math.max(1.1, 3.2 * (1 - t));
        ctx.lineCap = 'round';
        var sp = q.span || 1.5;
        var a0 = q.ang - sp / 2 + sp * clamp(t * 1.6, 0, 1) - sp * 0.5;
        ctx.beginPath();
        ctx.arc(g.x, y, sz * (0.85 + t * 0.55), a0, a0 + sp * 0.85);
        ctx.stroke();
      } else if (k === 'passw') {
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = q.color;
        ctx.lineWidth = Math.max(1, 2.6 * (1 - t));
        var rr3 = sz * (0.18 + t * 1.15);
        ctx.beginPath();
        ctx.ellipse(g.x, g.y, rr3, rr3 * 0.5, 0, q.ang - 0.85, q.ang + 0.85);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* 액션별 파티클 묶음 — 모두 같은 풀을 쓰고, 겹치면 오래된 것부터 버린다 */
  function fxDust(p, n, power) {
    if (!p) { return; }
    var i, sp = power || 1;
    for (i = 0; i < n; i++) {
      spawnPart({
        kind: 'dust', x: p.x + range(-0.7, 0.7), y: p.y + range(-0.7, 0.7), z: 0.1,
        vx: -p.facing * range(1.4, 4.2) * sp + range(-1.2, 1.2),
        vy: range(-2.4, 2.4) * sp, vz: range(0.4, 1.9) * sp,
        g: 9, drag: 2.6, t0: 0.34 + Math.random() * 0.24,
        size: 0.9 + Math.random() * 0.9, color: 'rgba(206,222,182,0.9)', a0: 0.62
      });
    }
  }

  function fxGrass(p, n) {
    if (!p) { return; }
    var i;
    for (i = 0; i < n; i++) {
      spawnPart({
        kind: 'grass', x: p.x + range(-0.6, 0.6), y: p.y + range(-0.6, 0.6), z: 0.2,
        vx: range(-4.5, 4.5), vy: range(-3.2, 3.2), vz: range(1.4, 4.4),
        g: 26, drag: 1.2, t0: 0.48 + Math.random() * 0.4,
        size: 0.8 + Math.random() * 1.0, rot: Math.random() * 6, vr: range(-9, 9),
        color: Math.random() < 0.45 ? '#7fc63d' : '#4e8f2c', a0: 0.95
      });
    }
  }

  function fxSparks(x, y, n, color, spd) {
    var i, s = spd || 7;
    for (i = 0; i < n; i++) {
      var a = Math.random() * TAU;
      spawnPart({
        kind: 'spark', x: x, y: y, z: range(0.2, 1.2),
        vx: Math.cos(a) * range(0.5, s), vy: Math.sin(a) * range(0.5, s), vz: range(0.6, 4.2),
        g: 24, drag: 2.2, t0: 0.24 + Math.random() * 0.22,
        size: 1.2 + Math.random() * 1.2, color: color || '#ffe28a', a0: 1, front: true
      });
    }
  }

  function fxConfetti(x, y, n) {
    var cols = ['#ffe28a', '#8ff0b6', '#78f2ff', '#ff9f8a', '#c3a6ff', '#ffffff', '#c8f169'];
    var i;
    for (i = 0; i < n; i++) {
      spawnPart({
        kind: 'conf', x: x + range(-2.5, 2.5), y: y + range(-1.6, 1.6), z: range(1.5, 4.5),
        vx: range(-5.5, 5.5), vy: range(-4.5, 4.5), vz: range(6, 13),
        g: 30, drag: 0.9, t0: 1.1 + Math.random() * 0.9,
        size: 1.1 + Math.random() * 1.1, rot: Math.random() * 6, vr: range(-8, 8),
        color: cols[(Math.random() * cols.length) | 0], a0: 1, front: true
      });
    }
  }

  /* 발차기 스윙 아크 — 찬 발 쪽으로 호가 그려지고 임팩트 링이 터진다 */
  function fxKickSwing(p, power, color) {
    if (!p) { return; }
    v25t.kickSwing++;
    spawnPart({
      kind: 'swing', x: p.x, y: p.y, z: 0, t0: 0.3, size: 3.2 + (power || 1) * 1.5,
      color: color || '#fff2c0', a0: 0.9, ang: p.side === 'home' ? 0 : Math.PI,
      span: 1.7, front: true
    });
    spawnPart({ kind: 'wave', x: p.x, y: p.y, t0: 0.34, size: 2.2 + (power || 1) * 1.2, color: color || '#ffe28a', a0: 0.55, flat: 0.5 });
  }

  function fxPassWave(p, tx, ty, color) {
    if (!p) { return; }
    v25t.passWave++;
    var a = Math.atan2(scr(tx, ty).y - scr(p.x, p.y).y, scr(tx, ty).x - scr(p.x, p.y).x);
    spawnPart({ kind: 'passw', x: p.x, y: p.y, t0: 0.42, size: 3.0, color: color || '#c8f169', a0: 0.85, ang: a });
  }

  function fxShieldRing(p) {
    if (!p) { return; }
    v25t.save++;
    spawnPart({ kind: 'shield', x: p.x, y: p.y, t0: 0.55, size: 4.4, color: '#9fe8ff', a0: 0.95, flat: 0.55 });
    spawnPart({ kind: 'ring', x: p.x, y: p.y, z: 1.6, t0: 0.4, size: 5.2, color: '#e8fbff', a0: 0.9, front: true });
    fxSparks(p.x, p.y, 5, '#bfeeff', 5);
  }

  /* 슬라이딩 마크 — 지면에 남았다가 서서히 사라진다 */
  function fxSlideMark(p, len) {
    if (!p) { return; }
    decals.push({ x: p.x, y: p.y, ang: p.facing > 0 ? 0.22 : -0.22, life: 0, t0: 3.4, len: len || 3.4 });
    if (decals.length > 14) { decals.shift(); }
  }

  function updateDecals(dt) {
    var i;
    for (i = decals.length - 1; i >= 0; i--) {
      decals[i].life += dt;
      if (decals[i].life >= decals[i].t0) { decals.splice(i, 1); }
    }
  }

  function drawDecals() {
    var i, d, g, t, s = w2px();
    for (i = 0; i < decals.length; i++) {
      d = decals[i];
      g = scr(d.x, d.y);
      t = clamp(d.life / d.t0, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.30 * (1 - t);
      ctx.fillStyle = 'rgba(38,74,30,0.95)';
      ctx.translate(g.x, g.y);
      ctx.rotate(d.ang);
      ctx.beginPath();
      ctx.ellipse(0, 0, d.len * s.x * 0.5, d.len * s.y * 0.14, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.16 * (1 - t);
      ctx.fillStyle = 'rgba(120,90,52,0.9)';
      ctx.beginPath();
      ctx.ellipse(0, s.y * 0.05, d.len * s.x * 0.4, d.len * s.y * 0.09, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ═════════ v30 — 오프더볼 침투 가속 연출 ═════════
     볼 소유자 시야 앞·수비 뒷공간으로 달려 들어가는 선수의 발밑에
     진행 방향 앞쪽으로 흐르는 화살표(첩자 2개)를 1~2초 가볍게 그린다. */
  function drawRunArrows() {
    var i, p, g, dir, len, a, k, head, sx, j;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off || isGK(p) || ball.carrier === p) { continue; }
      var run = p.throughRun;
      var t = p.runT > 0 ? p.runT : (run ? run.t : 0);
      if (!(t > 0)) { continue; }
      /* 전진 침투만 — 공격 방향 앞쪽으로 목표가 잡혀 있어야 한다 */
      var ty = run ? run.y : (p.runTo ? p.runTo.y : p.ty);
      dir = goalDir(p.side);
      if (!isFinite(ty) || (ty - p.y) * dir < 2.2) { continue; }
      g = scr(p.x, p.y);
      var rr = Math.max(5.6, SPR_H * g.s * TOKEN_R) * tokenScale();
      len = clamp(SPR_H * g.s * 0.62, 7, 18);
      k = clamp(t / 0.55, 0, 1);                       /* 끝날 때 부드럽게 사라짐 */
      a = (0.55 + 0.28 * Math.sin(simTime * 7.2 + i)) * k;
      if (a <= 0.04) { continue; }
      sx = dir > 0 ? -1 : 1;   /* 화면 x는 공격축 y와 반대 — 홈은 오른쪽으로 공격 */
      var ac = p.side === 'home' ? '214,255,168' : '255,214,168';
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.scale(1, 0.64);                             /* 지면에 눌린 화살표 */
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(' + ac + ',0.6)';
      ctx.shadowBlur = 5;
      for (j = 0; j < 2; j++) {
        var ph = ((simTime * 1.6 + j * 0.5) % 1);       /* 앞으로 흐르는 위상 */
        /* 토큰 밖에서 시작해 앞으로 흘러가야 보인다 (원 안에 가리지 않게) */
        var ox = sx * (rr * 0.95 + len * (0.15 + ph * 0.85));
        var al = a * (1 - ph * 0.45) * (j === 0 ? 1 : 0.62);
        if (al <= 0.02) { continue; }
        ctx.strokeStyle = 'rgba(' + ac + ',' + al.toFixed(3) + ')';
        ctx.lineWidth = Math.max(2.0, len * 0.24);
        ctx.beginPath();
        ctx.moveTo(ox - sx * len * 0.42, -len * 0.40);
        ctx.lineTo(ox, 0);
        ctx.lineTo(ox - sx * len * 0.42, len * 0.40);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* v25 ③ — 킥오프 센터 서클 마커: 세리머니 동안 센터 스폿이 살아 있음을 보여 준다 */
  function drawKickoffMark() {
    if (!kick) { return; }
    var g = scr(50, 60), s = w2px();
    var k = clamp(kick.t / kick.t0, 0, 1);
    var pulse = 0.5 + 0.5 * Math.sin(kick.t * 11);
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.4 * pulse;
    ctx.strokeStyle = 'rgba(234,255,208,0.95)';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(g.x, g.y, s.x * 9.15, s.y * 9.15 * 0.45, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.55 * (1 - k * 0.4);
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -kick.t * 26;
    ctx.beginPath(); ctx.ellipse(g.x, g.y, s.x * (10 + k * 7), s.y * (10 + k * 7) * 0.45, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    /* 센터 스폿 */
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(234,255,208,0.95)';
    ctx.beginPath(); ctx.ellipse(g.x, g.y, 2.2 + pulse * 1.4, (2.2 + pulse * 1.4) * 0.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ─────────────────────────  전술 오버레이 (카드별)  ───────────────────────── */  function drawCardOverlays() {
    var i, d, a, shown = {};
    for (i = 0; i < CARD_LIST.length; i++) {
      d = CARD_LIST[i];
      a = cardLife(d);
      if (a <= 0.01) { continue; }
      shown[d.fx] = 1;
      v25t.overlays++;
      if (d.fx === 'press' || d.fx === 'trigger') { ovPress(d, a); }
      else if (d.fx === 'offside') { ovOffside(d, a); }
      else if (d.fx === 'atk' || d.fx === 'through') { ovRuns(d, a); }
      else if (d.fx === 'tiki' || d.fx === 'build') { ovTriangle(d, a); }
      else if (d.fx === 'longshot') { ovLongshot(d, a); }
      else if (d.fx === 'def') { ovIsolate(d, a); }
      else if (d.fx === 'tempo' || d.fx === 'roar') { ovWave(d, a); }
      else if (d.fx === 'setpiece') { ovSetpiece(d, a); }
    }
  }

  /* ─────────────────────────  v29 ② 세트피스 대형 오버레이  ─────────────────────────
     세트피스 대기 중에는 키커→낙하지점 점선 궤적과 니어/파포스트 타깃 링을, 크로스가
     날아가는 동안은 실제 곡선 궤적과 낙하 예정 지점 링을 그린다. 전부 월드 좌표
     투영 위에 그려져 카메라 줌·패닝을 그대로 따라간다. */
  function drawSetpieceOverlay() {
    var sp = play.setpiece;
    var live = (play.phase === 'setpiece' && sp) || (ball.kind === 'contest' && lastSpPass);
    if (!live) { return; }
    var t = simTime;
    var pulse = 0.5 + 0.5 * Math.sin(t * 5.2);
    var nearL = spLayout ? spLayout.nearLeft : (ball.x < 50);
    var nearX = spLayout ? spLayout.nearX : (nearL ? 41.5 : 58.5);
    var farX = spLayout ? spLayout.farX : (nearL ? 58.5 : 41.5);
    var dir = sp ? goalDir(sp.side) : (lastSpPass && lastSpPass.side === 'home' ? -1 : 1);
    var gy = sp ? attackGoalY(sp.side) : (lastSpPass && lastSpPass.side === 'home' ? 0 : WORLD_H);
    var s = w2px();
    var bx = ball.x, by = ball.y;
    ctx.save();
    /* 니어/파포스트 타깃 링 */
    if (play.phase === 'setpiece') {
      var nearY2 = gy - dir * 9.6, farY2 = gy - dir * 12.6;
      var posts = [{ x: nearX, y: nearY2, c: '#ffd98a', label: '니어' },
                   { x: farX, y: farY2, c: '#ffb066', label: '파' }];
      var pi, pp, pg;
      for (pi = 0; pi < posts.length; pi++) {
        pp = posts[pi];
        pg = scr(pp.x, pp.y);
        ctx.globalAlpha = 0.30 + pulse * 0.25;
        ctx.strokeStyle = pp.c;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.ellipse(pg.x, pg.y, s.x * 4.2, s.y * 4.2 * 0.45, 0, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      /* 키커 → 낙하지점 점선 궤적(대형과 같은 목적지) */
      var tg = scr(nearX, gy - dir * 9.6);
      var kg = scr(bx, by);
      ctx.globalAlpha = 0.38;
      ctx.strokeStyle = 'rgba(255,236,168,0.95)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -t * 22;
      ctx.beginPath();
      ctx.moveTo(kg.x, kg.y);
      ctx.quadraticCurveTo((kg.x + tg.x) / 2, Math.min(kg.y, tg.y) - field.h * 0.10, tg.x, tg.y);
      ctx.stroke();
      ctx.setLineDash([]);
      /* 수비벽 표시 */
      if (spLayout && spLayout.wall > 0) {
        var wi, wp, wg;
        for (wi = 0; wi < spLayout.slots.length; wi++) {
          wp = spLayout.slots[wi];
          if (wp.role !== 'wall') { continue; }
          wg = scr(wp.x, wp.y);
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = 'rgba(160,214,255,0.9)';
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(wg.x, wg.y - 2, 4.2, 0, TAU); ctx.stroke();
        }
      }
      /* 짧은 옵션·후방 커버 표시 */
      var si, sq, sg;
      for (si = 0; si < (spLayout ? spLayout.slots.length : 0); si++) {
        sq = spLayout.slots[si];
        if (sq.role !== 'back') { continue; }
        sg = scr(sq.x, sq.y);
        ctx.globalAlpha = 0.42;
        ctx.strokeStyle = 'rgba(159,216,255,0.9)';
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.ellipse(sg.x, sg.y, s.x * 3.2, s.y * 3.2 * 0.45, 0, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (lastSpPass) {
      /* 실제 곡선 궤적 + 낙하 예정 지점 */
      var lsp = lastSpPass;
      v29t.drawArc = (v29t.drawArc || 0) + 1;
      var st0 = scr(lsp.ox, lsp.oy);
      var en = scr(lsp.x, lsp.y);
      var ax = en.x - st0.x, ay = en.y - st0.y;
      var ln = Math.max(0.001, Math.hypot(ax, ay));
      var nx = -ay / ln, ny = ax / ln;
      var steps = 18, k2, kk2, prog2, off2, cx2, cy2;
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = '#fff3c4';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = 'rgba(255,232,150,0.9)';
      ctx.shadowBlur = 6;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      for (k2 = 0; k2 <= steps; k2++) {
        prog2 = k2 / steps;
        off2 = Math.sin(prog2 * Math.PI) * lsp.bend;
        var wx2 = lsp.ox + (lsp.x - lsp.ox) * prog2 + (lsp.bend ? (function () { return 0; })() : 0);
        /* 세계 좌표 기준 곡선 → 화면 좌표 */
        var dan = Math.max(0.001, Math.hypot(lsp.x - lsp.ox, lsp.y - lsp.oy));
        var dnx = -(lsp.y - lsp.oy) / dan, dny = (lsp.x - lsp.ox) / dan;
        wx2 = lsp.ox + (lsp.x - lsp.ox) * prog2 + dnx * off2;
        var wy2 = lsp.oy + (lsp.y - lsp.oy) * prog2 + dny * off2;
        var wp2 = scr(wx2, wy2);
        var lift = Math.sin(prog2 * Math.PI) * field.h * 0.06;
        cx2 = wp2.x; cy2 = wp2.y - lift;
        if (k2 === 0) { ctx.moveTo(cx2, cy2); } else { ctx.lineTo(cx2, cy2); }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
      /* 낙하 예정 지점 — 커지는 링 */
      var lg = scr(lsp.x, lsp.y);
      ctx.globalAlpha = 0.75 + pulse * 0.25;
      ctx.strokeStyle = '#ffe28a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(lg.x, lg.y, s.x * (2.2 + pulse * 1.4), s.y * (2.2 + pulse * 1.4) * 0.45, 0, 0, TAU);
      ctx.stroke();
      if (lsp.aim) {
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#ffe28a';
        ctx.font = '900 9.5px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(short(lsp.aim.name || '타깃'), lg.x, lg.y - s.y * 3.2);
      }
    }
    ctx.restore();
    void nearX; void farX; void k2; void kk2;
  }

  /* v29 ② — 세트피스 타깃 라벨: 선수 토큰 위에 그려야 가려지지 않는다 */
  function drawSetpieceLabels() {
    if (play.phase !== 'setpiece' || !spLayout) { return; }
    var gy = attackGoalY(spLayout.side), dir = goalDir(spLayout.side);
    var s = w2px();
    var items = [
      { x: spLayout.nearX, y: gy - dir * (spLayout.type === 'fk' ? 10.2 : 9.6), c: '#ffd98a', label: '니어' },
      { x: spLayout.farX, y: gy - dir * (spLayout.type === 'fk' ? 13.4 : 12.6), c: '#ffb066', label: '파' }
    ];
    var pulse = 0.5 + 0.5 * Math.sin(simTime * 5.2);
    ctx.save();
    var i, it, g, wpx, hpx;
    ctx.font = '900 9.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < items.length; i++) {
      it = items[i];
      g = scr(it.x, it.y);
      var ty = g.y - s.y * 2.9;
      wpx = ctx.measureText(it.label).width + 10;
      hpx = 13;
      ctx.globalAlpha = 0.86 + pulse * 0.12;
      ctx.fillStyle = 'rgba(6,24,18,0.92)';
      roundRect(g.x - wpx / 2, ty - hpx / 2, wpx, hpx, 6);
      ctx.fill();
      ctx.strokeStyle = it.c;
      ctx.lineWidth = 1.1;
      roundRect(g.x - wpx / 2, ty - hpx / 2, wpx, hpx, 6);
      ctx.stroke();
      ctx.fillStyle = it.c;
      ctx.fillText(it.label, g.x, ty + 0.5);
    }
    /* 수비벽 — 벽을 세운 3명에 '벽' 태그 (프리킥에서만) */
    if (spLayout.wall > 0) {
      var wi, wp, wg, wty;
      for (wi = 0; wi < spLayout.slots.length; wi++) {
        wp = spLayout.slots[wi];
        if (wp.role !== 'wall') { continue; }
        wg = scr(wp.x, wp.y);
        wty = wg.y - s.y * 2.7;
        wpx = ctx.measureText('벽').width + 8;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(6,24,34,0.92)';
        roundRect(wg.x - wpx / 2, wty - 6, wpx, 12, 5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(160,214,255,0.95)';
        ctx.lineWidth = 1;
        roundRect(wg.x - wpx / 2, wty - 6, wpx, 12, 5);
        ctx.stroke();
        ctx.fillStyle = '#bfe8ff';
        ctx.fillText('벽', wg.x, wty + 0.5);
      }
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  /* 압박/트리거 — 볼 소유자 타겟 링 + 전방 압박 벡터선 */
  function ovPress(d, a) {
    var c = ball.carrier;
    var tx = c ? c.x : ball.x, ty = c ? c.y : ball.y;
    var g = scr(tx, ty), s = w2px();
    var col = d.color;
    var pulse = 0.5 + 0.5 * Math.sin(simTime * 6.4);
    ctx.save();
    ctx.globalAlpha = a * 0.95;
    ctx.strokeStyle = hexA(col, 0.95);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(g.x, g.y, s.x * (6.4 + pulse * 1.5), s.y * (6.4 + pulse * 1.5) * 0.45, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -simTime * 16;
    ctx.globalAlpha = a * 0.75;
    ctx.beginPath(); ctx.ellipse(g.x, g.y, s.x * 3.4, s.y * 3.4 * 0.45, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    /* 조준선 4방향 틱 */
    ctx.globalAlpha = a * 0.9;
    var k, ang, rr = s.x * 6.4;
    for (k = 0; k < 4; k++) {
      ang = k * Math.PI / 2 + simTime * 0.9;
      ctx.beginPath();
      ctx.moveTo(g.x + Math.cos(ang) * rr * 0.94, g.y + Math.sin(ang) * rr * 0.43);
      ctx.lineTo(g.x + Math.cos(ang) * rr * 1.12, g.y + Math.sin(ang) * rr * 0.51);
      ctx.stroke();
    }
    ctx.restore();

    /* 압박 벡터 — 볼에 가까운 홈 선수 3명 */
    var list = [], i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== 'home' || p.off || isGK(p)) { continue; }
      list.push({ p: p, dd: Math.hypot(p.x - tx, p.y - ty) });
    }
    list.sort(function (u, v) { return u.dd - v.dd; });
    for (i = 0; i < list.length && i < 3; i++) {
      var q = list[i].p, qs = scr(q.x, q.y);
      var mx = qs.x + (g.x - qs.x) * 0.78, my = qs.y + (g.y - qs.y) * 0.78;
      arrowTo(qs.x, qs.y, mx, my, hexA(col, 0.85 * a), 1.7, 5.0, [5, 4]);
      if (d.fx === 'trigger') {
        ctx.save();
        ctx.globalAlpha = a * 0.95;
        ctx.fillStyle = hexA(col, 0.95);
        ctx.beginPath(); ctx.arc(qs.x, qs.y - 1, 3.2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#08160f';
        ctx.font = '900 4.6px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), qs.x, qs.y - 0.8);
        ctx.textAlign = 'left';
        ctx.restore();
      }
    }
    /* 트리거 — 스턴 걸린 상대 머리 위 별 + '2연속 압박' 표식 */
    if (d.fx === 'trigger') {
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = hexA(col, 0.95);
      ctx.font = '900 7px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PRESS ×2', g.x, g.y - s.y * 9.5);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  /* 오프사이드 트랩 — 최종 수비 라인을 가로지르는 점선 + 전진 화살표 */
  function ovOffside(d, a) {
    var col = d.color, b = blockOf('home');
    var wy = clamp(b.dfY, 3, WORLD_H - 3);
    var s = w2px(), i, p, list = [], g0, g1;
    /* 라인 자체는 drawTrapLine이 그린다 — 여기서는 '전진' 지시를 올린다 */
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== 'home' || p.off || isGK(p) || !isDefGroup(p)) { continue; }
      list.push(p);
    }
    for (i = 0; i < list.length; i++) {
      p = list[i];
      g0 = scr(p.x, p.y);
      g1 = scr(p.x, clamp(p.y - 7.5, 2, WORLD_H - 2));
      arrowTo(g0.x, g0.y, g1.x, g1.y, hexA(col, 0.62 * a), 1.35, 4.6, null);
    }
    /* 라인 위에 흐르는 셰브런 — '한꺼번에 올린다' */
    var ly = wy, yy, xx;
    ctx.save();
    ctx.globalAlpha = a * 0.72;
    ctx.strokeStyle = hexA(col, 0.95);
    ctx.lineWidth = 1.3;
    for (i = 0; i < 5; i++) {
      yy = 16 + i * (WORLD_W - 32) / 4;
      var pt = scr(yy, ly);
      var pt2 = scr(yy, clamp(ly - 3.4, 1, WORLD_H - 1));
      arrowTo(pt2.x, pt2.y, pt.x, pt.y, hexA(col, 0.8 * a), 1.2, 4.0, null);
    }
    ctx.restore();
    /* 전진 폭 표시 — 라인과 현재 수비 위치의 갭 */
    var gA = scr(50, ly), gB = scr(50, ly - 7.5);
    ctx.save();
    ctx.globalAlpha = a * 0.4;
    ctx.strokeStyle = hexA(col, 0.9);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(gA.x, gA.y); ctx.lineTo(gB.x, gB.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* 침투/스루패스 — 윙어·공격수의 하프스페이스·뒷공간 침투 화살표 */
  function ovRuns(d, a) {
    var col = d.color, i, p, list = [], g1, g2, inward, depth, s = w2px();
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== 'home' || p.off || isGK(p)) { continue; }
      if (!(isFwdGroup(p) || isWingerPos(p) || p.pos === 'AM')) { continue; }
      list.push(p);
    }
    for (i = 0; i < list.length && i < 3; i++) {
      p = list[i];
      inward = p.x < 50 ? 1 : -1;
      depth = d.fx === 'through' ? 15 : 8.5;
      g1 = scr(p.x, p.y);
      g2 = scr(clamp(p.x + inward * (d.fx === 'through' ? 5.5 : 4.2), 4, 96), clamp(p.y - depth, 3, 117));
      arrowTo(g1.x, g1.y, g2.x, g2.y, hexA(col, 0.88 * a), 1.7, 5.6, d.fx === 'through' ? [6, 4] : null);
      /* 출발 발밑 링 + 도착 지점 표적 */
      ctx.save();
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = hexA(col, 0.9);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(g2.x, g2.y, s.x * 2.6, s.y * 2.6 * 0.45, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(g2.x, g2.y, s.x * 1.3, s.y * 1.3 * 0.45, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (d.fx === 'through') {
      /* 수비 라인 뒤 공간을 가로지르는 점선 */
      var block = blockOf('away');
      var ly = clamp(block.dfY, 4, 116);
      var l1 = scr(0, ly), l2 = scr(WORLD_W, ly);
      ctx.save();
      ctx.globalAlpha = a * 0.34;
      ctx.strokeStyle = hexA(col, 0.9);
      ctx.lineWidth = 1.1;
      ctx.setLineDash([5, 6]);
      ctx.beginPath(); ctx.moveTo(l1.x, l1.y); ctx.lineTo(l2.x, l2.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  /* 티키타카/빌드업 — 볼 소유자와 가까운 동료 사이의 전술 삼각 패스 연결선 */
  function ovTriangle(d, a) {
    var col = d.color, c = ball.carrier, i, p, list = [];
    var cxw, cyw;
    if (c && c.side === 'home') { cxw = c.x; cyw = c.y; }
    else { cxw = ball.x; cyw = ball.y; }
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== 'home' || p.off || isGK(p)) { continue; }
      list.push({ p: p, dd: Math.hypot(p.x - cxw, p.y - cyw) });
    }
    list.sort(function (u, v) { return u.dd - v.dd; });
    var nodes = [{ x: cxw, y: cyw }];
    for (i = 0; i < list.length && nodes.length < 3; i++) { nodes.push({ x: list[i].p.x, y: list[i].p.y }); }
    if (nodes.length < 2) { return; }
    var gs = [], k;
    for (i = 0; i < nodes.length; i++) { gs.push(scr(nodes[i].x, nodes[i].y)); }
    ctx.save();
    ctx.strokeStyle = hexA(col, 0.78 * a);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -simTime * 20;
    ctx.beginPath();
    for (i = 0; i < gs.length; i++) {
      k = (i + 1) % gs.length;
      ctx.moveTo(gs[i].x, gs[i].y);
      ctx.lineTo(gs[k].x, gs[k].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    /* 변을 따라 흐르는 패스 점 — '공이 도는' 느낌 */
    ctx.fillStyle = hexA(col, 0.95);
    for (i = 0; i < gs.length; i++) {
      k = (i + 1) % gs.length;
      var ph = (simTime * 0.55 + i * 0.33) % 1;
      var px = gs[i].x + (gs[k].x - gs[i].x) * ph;
      var py = gs[i].y + (gs[k].y - gs[i].y) * ph;
      ctx.beginPath(); ctx.arc(px, py, 1.9, 0, TAU); ctx.fill();
    }
    /* 꼭짓점 마커 */
    ctx.globalAlpha = a * 0.9;
    for (i = 0; i < gs.length; i++) {
      ctx.beginPath(); ctx.arc(gs[i].x, gs[i].y, 2.6, 0, TAU);
      ctx.fillStyle = hexA(col, 0.9); ctx.fill();
    }
    ctx.restore();
  }

  /* 중거리 슛 — 슈터 앞 슈팅 사거리 아크 + 골문 조준선 */
  function ovLongshot(d, a) {
    var col = d.color, sh = cardAce['longshot'], i, p, best = null, bd = 999;
    if (!sh || sh.off) {
      for (i = 0; i < players.length; i++) {
        p = players[i];
        if (p.side !== 'home' || p.off || isGK(p)) { continue; }
        var dy = Math.abs(p.y - 0);
        if (dy < bd) { bd = dy; best = p; }
      }
      sh = best;
    }
    if (!sh) { return; }
    var gs = scr(sh.x, sh.y), gm = scr(50, 1.5), s = w2px();
    ctx.save();
    ctx.globalAlpha = a * 0.95;
    ctx.strokeStyle = hexA(col, 0.95);
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.ellipse(gs.x, gs.y, s.x * 19, s.y * 19 * 0.5, 0, -1.15, 1.15);
    ctx.stroke();
    ctx.globalAlpha = a * 0.5;
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.ellipse(gs.x, gs.y, s.x * 13, s.y * 13 * 0.5, 0, -1.05, 1.05); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    /* 조준선 + 골문 크로스헤어 */
    arrowTo(gs.x, gs.y, gm.x, gm.y + s.y * 1.6, hexA(col, 0.5 * a), 1.2, 5.4, [3, 5]);
    ctx.save();
    ctx.globalAlpha = a * 0.95;
    ctx.strokeStyle = hexA('#ffe28a', 0.95);
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(gm.x, gm.y + s.y * 1.6, 4.2 + Math.sin(simTime * 5) * 1.1, 0, TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gm.x - 7, gm.y + s.y * 1.6); ctx.lineTo(gm.x + 7, gm.y + s.y * 1.6);
    ctx.moveTo(gm.x, gm.y + s.y * 1.6 - 7); ctx.lineTo(gm.x, gm.y + s.y * 1.6 + 7);
    ctx.stroke();
    ctx.restore();
  }

  /* 원톱 고립 — 상대 최전방 공격수 주변 포위/차단 링 */
  function ovIsolate(d, a) {
    var col = d.color, tgt = null, best = -1, i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== 'away' || p.off || isGK(p)) { continue; }
      var pr = progressOf('away', p.y);
      if (pr > best) { best = pr; tgt = p; }
    }
    if (!tgt) { return; }
    var g = scr(tgt.x, tgt.y), s = w2px(), k, ang;
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    ctx.strokeStyle = hexA(col, 0.95);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(g.x, g.y, s.x * (7.5 + Math.sin(simTime * 4) * 0.7), s.y * (7.5 + Math.sin(simTime * 4) * 0.7) * 0.45, 0, 0, TAU); ctx.stroke();
    /* 4방향 차단 브래킷 */
    for (k = 0; k < 4; k++) {
      ang = k * Math.PI / 2 + Math.PI / 4;
      var bx = g.x + Math.cos(ang) * s.x * 9.2, by = g.y + Math.sin(ang) * s.y * 9.2 * 0.45;
      ctx.beginPath();
      ctx.moveTo(bx - 3.2, by - 3.2); ctx.lineTo(bx + 3.2, by + 3.2);
      ctx.moveTo(bx + 3.2, by - 3.2); ctx.lineTo(bx - 3.2, by + 3.2);
      ctx.stroke();
    }
    ctx.globalAlpha = a * 0.72;
    ctx.fillStyle = hexA(col, 0.9);
    ctx.font = '900 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ISOLATED', g.x, g.y - s.y * 10.5);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  /* 템포/일갈 — 전원 스피드·사기 상승 파동 */
  function ovWave(d, a) {
    var col = d.color, sx = 0, sy = 0, n = 0, i, p;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== 'home' || p.off) { continue; }
      sx += p.x; sy += p.y; n++;
    }
    if (!n) { return; }
    sx /= n; sy /= n;
    var g = scr(sx, sy), s = w2px(), k, ph;
    ctx.save();
    for (k = 0; k < 3; k++) {
      ph = (simTime * 0.55 + k / 3) % 1;
      ctx.globalAlpha = a * 0.55 * (1 - ph);
      ctx.strokeStyle = hexA(col, 0.95);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, s.x * (6 + ph * 30), s.y * (6 + ph * 30) * 0.5, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    /* 각 선수 위로 솟는 상승 화살표 */
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side !== 'home' || p.off) { continue; }
      var gs2 = scr(p.x, p.y);
      var ph2 = (simTime * 1.4 + (i % 4) * 0.25) % 1;
      ctx.save();
      ctx.globalAlpha = a * 0.5 * (1 - ph2);
      ctx.strokeStyle = hexA(col, 0.95);
      ctx.lineWidth = 1.2;
      var ay = gs2.y - 6 - ph2 * 9;
      ctx.beginPath();
      ctx.moveTo(gs2.x - 2.6, ay + 2.4); ctx.lineTo(gs2.x, ay); ctx.lineTo(gs2.x + 2.6, ay + 2.4);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* 세트피스 — 목표 지점 조준 링 */
  function ovSetpiece(d, a) {
    var col = d.color, atk = play.atkSide || 'home';
    var ty = attackGoalY(atk) - goalDir(atk) * 16;
    var g = scr(50, ty), s = w2px(), k, ang;
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    ctx.strokeStyle = hexA(col, 0.95);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(g.x, g.y, s.x * 8.5, s.y * 8.5 * 0.45, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.ellipse(g.x, g.y, s.x * 4.2, s.y * 4.2 * 0.45, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    for (k = 0; k < 6; k++) {
      ang = k * TAU / 6 + simTime * 0.7;
      ctx.beginPath();
      ctx.moveTo(g.x + Math.cos(ang) * s.x * 9.2, g.y + Math.sin(ang) * s.y * 9.2 * 0.45);
      ctx.lineTo(g.x + Math.cos(ang) * s.x * 10.6, g.y + Math.sin(ang) * s.y * 10.6 * 0.45);
      ctx.stroke();
    }
    ctx.restore();
    arrowTo(g.x, g.y, g.x, g.y - s.y * 12, hexA(col, 0.45 * a), 1.2, 5, [4, 4]);
  }

  /* 실제 경기 공 — 일러스트에 그려진 공과 헷갈리지 않게 네온 링·진한 외곽선·그림자 */
  function drawMatchBall(x, y, r, groundY) {
    var hot = ball.kind === 'shot';
    var airborne = ball.z > 0.05;
    var gy = (groundY == null ? y + r * 1.02 : groundY);
    /* 바닥 그림자 — 공중에 뜨면 draw()가 고도 비례 그림자를 따로 그린다(중복 방지) */
    if (!airborne || groundY == null) {
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = '#02110c';
      ctx.beginPath();
      ctx.ellipse(x, gy + r * 0.02, r * 1.08, r * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    /* 네온 발광 링 */
    var glowR = r * (hot ? 3.2 : 2.4);
    var gr = ctx.createRadialGradient(x, y, r * 0.45, x, y, glowR);
    gr.addColorStop(0, hot ? 'rgba(255,246,186,0.95)' : 'rgba(206,255,246,0.80)');
    gr.addColorStop(0.5, hot ? 'rgba(255,196,84,0.38)' : 'rgba(120,242,255,0.30)');
    gr.addColorStop(1, 'rgba(120,242,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2); ctx.fill();
    /* 흰 공 본체 */
    ctx.save();
    ctx.shadowColor = hot ? 'rgba(255,222,126,0.95)' : 'rgba(150,255,242,0.92)';
    ctx.shadowBlur = r * 1.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    /* 선명한 검은 외곽선 */
    ctx.lineWidth = Math.max(1.2, r * 0.22);
    ctx.strokeStyle = '#08120d';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    /* 오각 패널 — 굴러가는 느낌으로 살짝 회전 */
    ctx.fillStyle = '#14211b';
    ctx.beginPath(); ctx.arc(x - r * 0.06, y - r * 0.10, r * 0.32, 0, Math.PI * 2); ctx.fill();
    var k, a2;
    for (k = 0; k < 4; k++) {
      a2 = simTime * 1.7 + k * Math.PI / 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a2) * r * 0.64, y + Math.sin(a2) * r * 0.64, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    /* 하이라이트 */
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.arc(x - r * 0.30, y - r * 0.36, r * 0.20, 0, Math.PI * 2); ctx.fill();
    /* 공 위치 표식 — 일러스트에 그려진 공과 헷갈리지 않게 살짝 떠 있는 표식 */
    if (!hot) {
      var my = y - r * 2.0 - 2 - Math.sin(simTime * 4.2) * 1.2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.58, my - r * 0.62);
      ctx.lineTo(x + r * 0.58, my - r * 0.62);
      ctx.lineTo(x, my);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,18,13,0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /* v10 — 패스 각(삼각 지원): 볼 소유자와 좌·우·앞 지원 선수를 얇은 점선으로 연결한다 */
  function drawSupportWeb() {
    var c = ball.carrier, list = play.supList, i, s, p0, p1, a;
    if (!c || !list || !list.length) { return; }
    var tf = TEAM_FX[c.side];
    p0 = scr(c.x, c.y);
    for (i = 0; i < list.length; i++) {
      s = list[i];
      if (!s || s.off || !(s.supportT > 0)) { continue; }
      p1 = scr(s.x, s.y);
      a = clamp(s.supportT / 0.9, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.16 + a * 0.20;
      ctx.strokeStyle = tf.ring2;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y - 3);
      ctx.lineTo(p1.x, p1.y - 3);
      ctx.stroke();
      ctx.setLineDash([]);
      /* 지원 선수 발밑 작은 표식 */
      ctx.globalAlpha = 0.30 + a * 0.35;
      ctx.beginPath();
      ctx.ellipse(p1.x, p1.y + 1, SPR_H * 0.20, SPR_H * 0.08, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPressZone() {
    if (buffOf('press') <= 0) { return; }
    var pc = pressConfig('home');
    var c = scr(ball.x, ball.y);
    var rx = pc.radius * (field.w / WORLD_W) * 0.62;
    var ry = rx * 0.42;
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = '#ff9f8a';
    ctx.lineWidth = 1.3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* v15 — 부심 깃발 · 오프사이드 점선 라인 (패스 순간 2.8초 표시) */
  function drawOffsideLine() {
    if (flagShow.t <= 0) { return; }
    var a = clamp(flagShow.t / 2.8, 0, 1);
    var y = clamp(flagShow.y, 2, WORLD_H - 2);
    var l = scr(0, y), r = scr(WORLD_W, y);
    ctx.save();
    ctx.globalAlpha = 0.25 + a * 0.6;
    ctx.strokeStyle = '#ffd85a';
    ctx.lineWidth = 1.8;
    if (ctx.setLineDash) { ctx.setLineDash([7, 5]); }
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(r.x, r.y);
    ctx.stroke();
    if (ctx.setLineDash) { ctx.setLineDash([]); }
    ctx.globalAlpha = 0.35 + a * 0.65;
    ctx.fillStyle = 'rgba(8,20,16,0.72)';
    var lx = l.x + (r.x - l.x) * (flagShow.side === 'home' ? 0.08 : 0.92), ly = l.y - 9;
    roundRect(lx - 30, ly - 9, 60, 14, 6); ctx.fill();
    ctx.fillStyle = '#ffd85a';
    ctx.font = '900 8.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚩 오프사이드 라인', lx, ly + 2);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  /* v18 ③ — 오프사이드 트랩이 살아 있는 동안 4백의 일자 하이 라인을 점선으로 표시한다
     (카드가 바뀜에도 라인이 유지되는 것을 눈으로 확인할 수 있게) */
  function drawTrapLine() {
    if (buffOf('offside') <= 0) { return; }
    var b = blockOf('home');
    var y = clamp(b.dfY, 2, WORLD_H - 2);
    var l = scr(0, y), r = scr(WORLD_W, y);
    ctx.save();
    ctx.globalAlpha = 0.40;
    ctx.strokeStyle = '#9fd8ff';
    ctx.lineWidth = 1.6;
    if (ctx.setLineDash) { ctx.setLineDash([9, 6]); }
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(r.x, r.y);
    ctx.stroke();
    if (ctx.setLineDash) { ctx.setLineDash([]); }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#9fd8ff';
    ctx.font = '900 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚩 OFFSIDE TRAP · 일자 하이 라인', l.x + (r.x - l.x) * 0.5, l.y - 5);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function drawPassLine() {    var pl = play.passLine;
    if (!pl || pl.t <= 0) { return; }
    var a = clamp(pl.t / pl.t0, 0, 1);
    var p1 = scr(pl.x1, pl.y1), p2 = scr(pl.x2, pl.y2);
    var x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    var nx = -(y2 - y1), ny = (x2 - x1);
    var len = Math.hypot(nx, ny) || 1;
    /* v10 — 짧은 패스는 거의 직선, 긴 패스만 잔잔한 커브 */
    var bend = Math.min(14, len * 0.085) * clamp((len - 40) / 120, 0, 1);
    mx += nx / len * bend; my += ny / len * bend;
    ctx.save();
    ctx.globalAlpha = 0.45 + a * 0.55;
    var lg = ctx.createLinearGradient(x1, y1, x2, y2);
    lg.addColorStop(0, 'rgba(255,255,255,0.15)');
    lg.addColorStop(0.35, pl.color);
    lg.addColorStop(1, pl.color);
    ctx.strokeStyle = lg;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = pl.color;
    ctx.shadowBlur = 4;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(mx, my, x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    /* 받는 선수 자리 표시 */
    ctx.globalAlpha = 0.5 + a * 0.5;
    ctx.beginPath();
    ctx.arc(x2, y2, 3.4, 0, Math.PI * 2);
    ctx.strokeStyle = pl.color;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    /* 화살촉 */
    ctx.beginPath();
    var ang = Math.atan2(y2 - my, x2 - mx);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 6 * Math.cos(ang - 0.42), y2 - 6 * Math.sin(ang - 0.42));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 6 * Math.cos(ang + 0.42), y2 - 6 * Math.sin(ang + 0.42));
    ctx.stroke();
    ctx.restore();
  }

  /* 슈팅 궤적 — 공 발광 트레일 (v10: 슛은 더 길고 밝게) */
  function drawShotTrail() {
    if (ball.trail.length < 2) { return; }
    var shooting = ball.kind === 'shot';
    var i, t, pt, r;
    var longShot = ball.shot && ball.shot.long;
    for (i = 0; i < ball.trail.length; i++) {
      t = (i + 1) / ball.trail.length;
      pt = scr(ball.trail[i].x, ball.trail[i].y);
      var y = pt.y - depthPx(ball.trail[i].z || 0);
      r = (shooting ? 4.4 : 2.2) + t * (shooting ? 6.0 : 2.4);
      ctx.beginPath();
      var gr = ctx.createRadialGradient(pt.x, y, 0, pt.x, y, r);
      gr.addColorStop(0, shooting
        ? (longShot ? 'rgba(255,240,150,' + (0.86 * t) + ')' : 'rgba(255,214,140,' + (0.80 * t) + ')')
        : 'rgba(200,255,220,' + (0.26 * t) + ')');
      gr.addColorStop(0.55, shooting ? 'rgba(255,150,60,' + (0.34 * t) + ')' : 'rgba(150,255,210,0)');
      gr.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = gr;
      ctx.arc(pt.x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (longShot) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,248,190,0.75)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (i = 1; i < ball.trail.length; i++) {
        var pp = scr(ball.trail[i].x, ball.trail[i].y);
        if (i === 1) { ctx.moveTo(pp.x, pp.y); }
        else { ctx.lineTo(pp.x + (i % 2 ? 2.6 : -2.6), pp.y + (i % 2 ? -2 : 2)); }
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBubble(p, px, py, sprH, extraUp) {
    var b = p.bubble;
    if (!b) { return; }
    var a = clamp(b.t / 0.35, 0, 1);
    var txt = b.text;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '900 ' + (clamp(SPR_H * 0.28, 7, 9)).toFixed(1) + 'px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var tw = ctx.measureText(txt).width;
    var bh = Math.round(clamp(SPR_H * 0.44, 11, 15));
    var bw = tw + bh * 0.9;
    var rise = (1 - clamp(b.t / b.t0, 0, 1)) * 4;
    var below = false;
    var by = py - sprH - 5 - rise - (extraUp || 0);
    if (by < 3) { by = py + 6 + (extraUp || 0); below = true; }
    var bx = px - bw / 2;
    if (bx < 3) { bx = 3; }
    if (bx + bw > W - 3) { bx = W - 3 - bw; }
    ctx.fillStyle = 'rgba(5, 22, 18, 0.92)';
    roundRect(bx, by, bw, bh, 7);
    ctx.fill();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1.2;
    roundRect(bx, by, bw, bh, 7);
    ctx.stroke();
    ctx.beginPath();
    if (below) {
      ctx.moveTo(px - 3.5, by);
      ctx.lineTo(px, by - 4);
      ctx.lineTo(px + 3.5, by);
    } else {
      ctx.moveTo(px - 3.5, by + bh);
      ctx.lineTo(px, by + bh + 4);
      ctx.lineTo(px + 3.5, by + bh);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(5, 22, 18, 0.92)';
    ctx.fill();
    ctx.fillStyle = b.color;
    ctx.fillText(txt, bx + bw / 2, by + bh / 2 + 0.5);
    ctx.restore();
  }

  /* 선수 1명 — 원형 초상화 토큰 (팀 링 · GK 뱃지 · 피로 게이지 · 소유자 펄스 · 액션 탄) */
  /* ═════════ v31 — 치비 전신 스프라이트 ═════════
     몸통(유니폼·팔·다리·축구화)은 4종 동작(run_a/run_b·kick·tackle · GK idle/dive/jump)으로
     실제 상태에 따라 바뀌고, 머리는 그 선수만의 고유 초상화(500장)를 목선에 맞춰 얹는다.
     → 500명 전원이 각자 다른 얼굴로 달리고, 슛·태클·다이빙 포즈로 전환된다. */
  var chibiBody = {};                /* 'home_run_a' → { img, ready } */
  var chibiHead = {};                /* pic → { img, ready, fx } */
  var bodyMeta = null, headMeta = null;
  function chibiInit() {
    var CB = global.DS.CHIBI;
    if (!CB) { return; }
    if (!bodyMeta) {
      bodyMeta = {};
      var k, nm;
      for (k in CB.BODY) {
        if (!CB.BODY.hasOwnProperty(k)) { continue; }
        for (nm in CB.BODY[k]) {
          if (CB.BODY[k].hasOwnProperty(nm)) { bodyMeta[k + '_' + nm] = CB.BODY[k][nm]; }
        }
      }
      headMeta = CB.HEAD;
    }
  }
  function loadChibiBody(key) {
    chibiInit();
    var rec = chibiBody[key];
    if (rec) { return rec; }
    rec = { img: new global.Image(), ready: false };
    chibiBody[key] = rec;
    rec.img.onload = function () { rec.ready = (rec.img.naturalWidth || 0) > 0; };
    rec.img.onerror = function () { rec.ready = false; };
    rec.img.src = 'assets/chibi/' + key + '.png';
    return rec;
  }
  /* 초상화의 머리색으로 고른 치비 타입 (0 갈색 · 1 흑발 · 2 금발/은발) */
  function chibiVariant(p) {
    var CB = global.DS.CHIBI;
    if (CB && CB.HAIR) {
      var pic = (p && p.player && p.player.pic) ? p.player.pic : 0;
      var v = CB.HAIR[pic];
      if (v === 0 || v === 1 || v === 2) { return v; }
    }
    return 0;
  }
  /* 상태 → 스프라이트 키 ('h0_run_a' · 'g1_dive' …) */
  function bodyKeyOf(p, pose) {
    if (isGK(p)) {
      var gset = p.side === 'home' ? 'g0' : 'g1';
      if (pose === 'dive' || pose === 'jump' || pose === 'kick' || pose === 'pass') { return gset + '_dive'; }
      return gset + '_idle';
    }
    var team = p.side === 'home' ? 'h' : 'a';
    var pre = team + chibiVariant(p);
    if (pose === 'kick' || pose === 'pass') { return pre + '_kick'; }
    if (pose === 'tackle') { return pre + '_tackle'; }
    if (pose === 'run' || pose === 'dribble' || pose === 'jump' || pose === 'celebrate') {
      return pre + (Math.floor(p.phase * 1.7) % 2 === 0 ? '_run_a' : '_run_b');
    }
    return pre + '_run_a';
  }

  function drawPlayer(p) {
    var gp = QV.project(p.x, p.y, 0);
    var gx = gp.x, gy = gp.y, gs = gp.s;
    var pose = poseOf(p);
    var gk = isGK(p);
    var isCarrier = ball.carrier === p;
    var t = simTime, PI2 = Math.PI * 2;
    var key = bodyKeyOf(p, pose);
    var bm = (bodyMeta && bodyMeta[key]) || { w: 96, h: 150, neckX: 0.5 };
    var scale = (SPR_H * PLAYER_K * gs) / 150;
    var bw = bm.w * scale, bh = bm.h * scale;
    var tf = TEAM_FX[p.side];

    /* ── 진행 방향 (화면 기준) — 좌우 반전으로 달리는 방향을 맞춘다 ── */
    var dxs = 0;
    if (isFinite(p.px) && isFinite(p.x)) {
      var pg = QV.project(p.px, isFinite(p.py) ? p.py : p.y, 0);
      dxs = gx - pg.x;
    }
    if (pose === 'dive') { p._face = (p.diveDir || 1) > 0 ? 1 : -1; }
    else if (Math.abs(dxs) > 0.45) { p._face = dxs > 0 ? 1 : -1; }
    if (!p._face) { p._face = p.side === 'home' ? 1 : -1; }
    var face = p._face;

    var tilt = 0, slideX = 0, air = 0;
    if (pose === 'dive') {
      var dk = clamp(1 - p.diveT / 0.7, 0, 1);
      tilt = (p.diveDir || 1) * 0.16 * Math.sin(dk * Math.PI);
      slideX = (p.diveDir || 1) * bw * 0.18 * Math.sin(dk * Math.PI);
      air = Math.sin(dk * Math.PI) * 0.5;
    } else if (pose === 'tackle') {
      tilt = face * 0.10;
      slideX = face * bw * 0.12;
    } else if (pose === 'kick' || pose === 'pass') {
      tilt = face * 0.03;
    } else if (pose === 'run' || pose === 'dribble') {
      tilt = face * 0.022;
    } else if (pose === 'celebrate') {
      tilt = Math.sin(t * 7.4) * 0.05;
    }
    var r = bw * 0.30;                      /* 이펙트 기준 반지름(머리 크기 근사) */

    /* ── 전술 오라(발밑) ── */
    var aura = auraOf(p);
    if (aura) { drawGroundAura(gx, gy, bw * 0.52, aura); }

    /* ── 전력 질주 잔상 ── */
    if (p.trail && p.trail.length && !gk) {
      var ti2, tr2, tg2, al2;
      for (ti2 = 0; ti2 < p.trail.length; ti2++) {
        tr2 = p.trail[ti2];
        al2 = (1 - clamp(tr2.t / 0.3, 0, 1)) * 0.15;
        if (al2 <= 0.012) { continue; }
        tg2 = QV.project(tr2.x, tr2.y, 0);
        ctx.save();
        ctx.globalAlpha = al2;
        ctx.fillStyle = tf.ring2;
        ctx.beginPath();
        ctx.ellipse(tg2.x, tg2.y, bw * 0.30 * tg2.s * gs * 0 + bw * 0.30, bh * 0.35, 0, 0, PI2);
        ctx.fill();
        ctx.restore();
      }
    }

    /* ── GK 다이빙 잔상 ── */
    if (pose === 'dive') {
      if (!p._diveSeen) { p._diveSeen = 1; v25t.dive++; }
      var kk, off2, al3;
      var dk0 = clamp(1 - p.diveT / 0.7, 0.15, 1);
      for (kk = 3; kk >= 1; kk--) {
        off2 = -(face) * bw * kk * (0.20 + dk0 * 0.22);
        al3 = (0.20 / kk) * dk0;
        ctx.save();
        ctx.globalAlpha = al3;
        ctx.fillStyle = '#bfeeff';
        ctx.beginPath();
        ctx.ellipse(gx + off2, gy - bh * 0.42, bw * 0.34, bh * 0.40, 0, 0, PI2);
        ctx.fill();
        ctx.restore();
      }
    } else if (p._diveSeen) { p._diveSeen = 0; }

    /* ── 지면 그림자 ── */
    ctx.save();
    ctx.globalAlpha = 0.40 - air * 0.16;
    ctx.fillStyle = '#02110c';
    ctx.beginPath();
    ctx.ellipse(gx + slideX * 0.4, gy + Math.max(1, gs * 1.4), bw * 0.34, Math.max(1.6, bw * 0.115), 0, 0, PI2);
    ctx.fill();
    ctx.restore();

    /* ── 피아 식별 링 (발밑) ── */
    ctx.save();
    var ringCol = p.side === 'home' ? 'rgba(90,175,255,0.95)' : 'rgba(255,96,96,0.95)';
    ctx.beginPath();
    ctx.ellipse(gx, gy, bw * 0.40, bw * 0.155, 0, 0, PI2);
    ctx.strokeStyle = ringCol;
    ctx.lineWidth = Math.max(1.4, bw * 0.035);
    ctx.shadowColor = p.side === 'home' ? 'rgba(70,150,255,0.8)' : 'rgba(255,80,80,0.8)';
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.restore();

    /* ── 스프라이트 본체 ── */
    var body = loadChibiBody(key);
    ctx.save();
    ctx.translate(gx + slideX, gy);
    if (face < 0) { ctx.scale(-1, 1); }
    if (tilt) { ctx.rotate(tilt); }
    if (body.ready) {
      ctx.drawImage(body.img, -bw * 0.5, -bh, bw, bh);
    } else {
      /* 로드 전 폴백 — 팀 컬러 몸통 */
      ctx.fillStyle = p.side === 'home' ? '#2f6fd0' : '#c8402f';
      roundRect(ctx, -bw * 0.28, -bh * 0.82, bw * 0.56, bh * 0.52, bw * 0.10);
      ctx.fill();
      ctx.fillRect(-bw * 0.26, -bh * 0.32, bw * 0.20, bh * 0.32);
      ctx.fillRect(bw * 0.06, -bh * 0.32, bw * 0.20, bh * 0.32);
    }

    ctx.restore();

    /* ── 공 소유자 — 시안/골드 펄스 링 ── */
    if (isCarrier) {
      var pz = 0.5 + 0.5 * Math.sin(t * 6.2);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(gx, gy, bw * (0.52 + 0.05 * pz), bw * (0.20 + 0.02 * pz), 0, 0, PI2);
      ctx.strokeStyle = 'rgba(120,242,255,' + (0.55 + 0.30 * pz) + ')';
      ctx.lineWidth = Math.max(1.2, bw * 0.03);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(gx, gy, bw * (0.60 + 0.07 * pz), bw * (0.235 + 0.028 * pz), 0, 0, PI2);
      ctx.strokeStyle = 'rgba(255,222,126,' + (0.30 + 0.35 * pz) + ')';
      ctx.lineWidth = Math.max(1.2, bw * 0.035);
      ctx.shadowColor = 'rgba(255,214,90,0.9)';
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.restore();
    }

    /* ── 카드·특기 발동 금빛 링 ── */
    if (p.skillT > 0 || p.glow > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(gx, gy, bw * 0.46, bw * 0.18, 0, 0, PI2);
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = -t * 14;
      ctx.strokeStyle = 'rgba(255,232,150,0.9)';
      ctx.lineWidth = 1.3;
      ctx.shadowColor = 'rgba(255,214,90,0.85)';
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.restore();
    }
    /* ── 에이스 링 ── */
    var aceNow = false, afx;
    for (afx in cardAce) {
      if (cardAce.hasOwnProperty(afx) && (buffs[afx] || 0) > 0 && cardAce[afx] === p) { aceNow = true; break; }
    }
    if (aceNow) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,232,150,0.98)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -t * 22;
      ctx.beginPath();
      ctx.ellipse(gx, gy, bw * 0.56, bw * 0.22, 0, 0, PI2);
      ctx.stroke();
      ctx.restore();
    }

    /* ── 스턴 별 ── */
    if (p.stun > 0) {
      var sk, sAng, sxp, syp, ssz, svi, sa;
      for (sk = 0; sk < 3; sk++) {
        sAng = t * 6.2 + sk * (PI2 / 3);
        sxp = gx + Math.cos(sAng) * r * 1.3;
        syp = gy - bh * 1.02 + Math.sin(sAng) * r * 0.34;
        ssz = Math.max(1.4, r * 0.26);
        ctx.save();
        ctx.globalAlpha = 0.62 + 0.3 * Math.sin(t * 9 + sk);
        ctx.fillStyle = '#ffe98a';
        ctx.beginPath();
        for (svi = 0; svi < 4; svi++) {
          sa = svi * Math.PI / 2;
          ctx.lineTo(sxp + Math.cos(sa) * ssz * 1.6, syp + Math.sin(sa) * ssz * 1.6);
          ctx.lineTo(sxp + Math.cos(sa + Math.PI / 4) * ssz * 0.5, syp + Math.sin(sa + Math.PI / 4) * ssz * 0.5);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    /* ── 세리머니 환호 오라 ── */
    if (pose === 'celebrate') {
      ctx.save();
      ctx.globalAlpha = 0.30 + 0.20 * Math.sin(t * 7);
      ctx.strokeStyle = 'rgba(255,233,138,0.95)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(gx, gy + 1.2, bw * (0.62 + 0.10 * Math.sin(t * 5)), bw * (0.62 + 0.10 * Math.sin(t * 5)) * 0.42, 0, 0, PI2);
      ctx.stroke();
      ctx.restore();
    }

    /* ── 체력 경고 (40% 이하) ── */
    if (p.stam <= 40) { drawFatigue(p, gx, gy - bh * 0.46, Math.max(4, r), Math.max(1.4, r * 0.22)); }

    /* ── 이름표 · GK 뱃지 ── */
    if (isCarrier) {
      drawNamePlate(p, gx, gy + Math.max(2.5, gs * 3.0), tf);
    } else if (gk) {
      var gb = clamp(bw * 0.16, 3.2, 4.6);
      var gw = Math.max(11, gb * 3.2);
      ctx.font = '900 ' + gb.toFixed(1) + 'px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(6,20,16,0.82)';
      roundRect(ctx, gx - gw / 2, gy + 2.4, gw, gb * 1.9, gb * 0.7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(246,201,69,0.95)';
      ctx.lineWidth = 0.9;
      roundRect(ctx, gx - gw / 2, gy + 2.4, gw, gb * 1.9, gb * 0.7);
      ctx.stroke();
      ctx.fillStyle = '#ffdf7e';
      ctx.fillText('GK', gx, gy + 2.4 + gb * 0.95 + 0.3);
      ctx.textAlign = 'left';
    }
  }

  /* 공 소유자 이름표 */
  function drawNamePlate(p, cx, y, tf) {
    var lb = clamp(SPR_H * 0.24, 6, 8.4);
    ctx.font = '800 ' + lb.toFixed(1) + 'px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var label = short(p.name);
    var lh = lb + 3.1;
    var tw2 = ctx.measureText(label).width + lh * 0.9;
    ctx.fillStyle = 'rgba(6,26,22,0.82)';
    roundRect(cx - tw2 / 2, y, tw2, lh, lh / 2);
    ctx.fill();
    ctx.strokeStyle = tf.ring2;
    ctx.lineWidth = 0.9;
    roundRect(cx - tw2 / 2, y, tw2, lh, lh / 2);
    ctx.stroke();
    ctx.fillStyle = tf.text;
    ctx.fillText(label, cx, y + lh / 2 + 0.4);
    ctx.textAlign = 'left';
  }

  /* 체력 40% 이하 경고 — 토큰 우상단 점 + 링 바깥 게이지 (노랑 25~40% / 빨강 25% 미만) */
  function drawFatigue(p, cx, cy, r, ringW) {
    var critical = p.stam < 25;
    var col = critical ? '#ff3b30' : '#ffd23b';
    var frac = clamp(p.stam / 40, 0, 1);
    var pulse = critical ? 0.5 + 0.5 * Math.sin(simTime * 9) : 0.94;
    var rr = r + ringW + 1.6;
    ctx.save();
    ctx.globalAlpha = pulse;
    /* 링 바깥을 따라 남은 체력 아크 (정수리 방향에서 시작) */
    ctx.beginPath();
    ctx.arc(cx, cy, rr, -Math.PI * 0.68, -Math.PI * 0.68 + Math.PI * 0.52 * frac);
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1.3, ringW * 0.55);
    ctx.shadowColor = col;
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    /* 우상단 경고 점 */
    var dx = cx + rr * 0.70, dy = cy - rr * 0.70;
    ctx.beginPath();
    ctx.arc(dx, dy, Math.max(1.5, r * 0.18), 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = 'rgba(6,20,16,0.85)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();
  }

  /* 액션 파동 — 토큰 발밑에서 바깥으로 퍼지는 원 (지면 원근으로 납작) */
  function drawRipples() {
    var i, rp, age, sp, rx, ry;
    for (i = 0; i < ripples.length; i++) {
      rp = ripples[i];
      age = clamp(rp.t / rp.t0, 0, 1);
      sp = scr(rp.x, rp.y);
      rx = SPR_H * sp.s * TOKEN_R * rp.k * (0.85 + age * 2.4);
      ry = rx * 0.46;
      ctx.save();
      ctx.globalAlpha = (1 - age) * 0.78;
      ctx.strokeStyle = rp.color;
      ctx.lineWidth = Math.max(0.9, 2.6 * (1 - age));
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* 골 전광판 — 위에서 미끄러져 들어와 잠시 머물고 사라진다 */
  function drawScoreboard() {
    var k = flash.t / flash.t0;                 /* 1 → 0 */
    var inT = clamp((1 - k) / 0.18, 0, 1);      /* 등장 */
    var outT = clamp(k / 0.16, 0, 1);           /* 퇴장 */
    var e = inT * inT * (3 - 2 * inT);
    var a = Math.min(e, outT);
    var w = Math.min(238, W * 0.50), h = 34;
    var x = W / 2 - w / 2;
    var y = -h + (h + 10) * e;
    var home = flash.side === 'home';
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.shadowColor = home ? 'rgba(47,141,255,0.75)' : 'rgba(255,75,75,0.75)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(5,18,14,0.94)';
    roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = home ? '#2f8dff' : '#ff4b4b';
    roundRect(x, y, w, h, 10);
    ctx.stroke();
    /* 왼쪽 골드 바 */
    ctx.fillStyle = '#f6c945';
    roundRect(x + 6, y + 7, 4, h - 14, 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe98a';
    ctx.font = '900 14px system-ui, -apple-system, sans-serif';
    ctx.fillText('GOAL', x + 17, y + h / 2 + 0.5);
    ctx.fillStyle = 'rgba(233,244,221,0.92)';
    ctx.font = '700 10.5px system-ui, -apple-system, sans-serif';
    ctx.fillText(home ? cfg.homeShort : cfg.awayShort, x + 60, y + h / 2 + 0.5);
    /* 오른쪽 스코어 */
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 19px system-ui, -apple-system, sans-serif';
    ctx.fillText(flash.score, x + w - 13, y + h / 2 + 1);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  /* v17 — 골망 출렁임: 공이 그물을 때린 순간 그물이 밀려 들어갔다 돌아온다 */
  function drawNetRipple() {
    if (netFx.t <= 0) { return; }
    var k = 1 - netFx.t / netFx.t0;              /* 0 → 1 */
    var a = (1 - k) * (1 - k);
    if (a <= 0.015) { return; }
    var c = goalMouthPt(netFx.side);
    var dir = netFx.side === 'home' ? 1 : -1;    /* 홈은 화면 오른쪽 골대를 공격 */
    var hw = Math.min(W * 0.06, H * 0.13), hh = hw * 1.55;
    var bulge = Math.sin(k * Math.PI) * hw * 0.42 * dir;
    var i, j;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(244,255,250,0.72)';
    ctx.lineWidth = Math.max(0.8, W / 560);
    for (i = -3; i <= 3; i++) {
      var off = (i / 3) * hw * 0.94;
      var bl = bulge * (1 - Math.abs(i) / 4.2);
      ctx.beginPath();
      ctx.moveTo(off, -hh);
      ctx.quadraticCurveTo(off + bl * 1.7, 0, off, hh);
      ctx.stroke();
    }
    for (j = -2; j <= 2; j++) {
      var yy = (j / 2) * hh;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.94, yy);
      ctx.quadraticCurveTo(bulge * 1.2, yy + bulge * 0.10, hw * 0.94, yy);
      ctx.stroke();
    }
    /* 충격 링 */
    ctx.beginPath();
    ctx.ellipse(0, 0, hw * (0.55 + 1.45 * k), hh * (0.55 + 1.15 * k), 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(214,255,244,' + (0.85 * a) + ')';
    ctx.lineWidth = 2.4 * a + 0.6;
    ctx.stroke();
    var gr = ctx.createRadialGradient(bulge, 0, 1, bulge, 0, hw * 2.1);
    gr.addColorStop(0, 'rgba(255,255,255,' + (0.55 * a) + ')');
    gr.addColorStop(1, 'rgba(180,255,230,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(bulge, 0, hw * 2.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* v17 — 살아있는 관중석: 카메라 플래시 · 응원 깃발 · 사람 파도 (화면 고정) */
  var flashSprite = null;
  function buildFlashSprite() {
    if (flashSprite) { return flashSprite; }
    var S = 48, c = global.document.createElement('canvas');
    c.width = S; c.height = S;
    var g = c.getContext('2d');
    if (!g) { return null; }
    var gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.28, 'rgba(228,248,255,0.72)');
    gr.addColorStop(0.6, 'rgba(180,226,255,0.20)');
    gr.addColorStop(1, 'rgba(160,215,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(2, S / 2); g.lineTo(S - 2, S / 2);
    g.moveTo(S / 2, 2); g.lineTo(S / 2, S - 2);
    g.stroke();
    flashSprite = c;
    return c;
  }
  /* v20 ① — 터치라인 지시 콜아웃: 피치 위에 짧게 뜨는 감독 지시 보드 (화면 고정) */
  function drawTouchCallout() {
    if (touchFx.t <= 0 || !touchFx.label) { return; }
    var k = clamp(touchFx.t / touchFx.t0, 0, 1);
    var w = Math.min(262, W * 0.46), h = 30;
    var x = 9, y = H - h - 13;
    var a = clamp(k / 0.22, 0, 1);
    v20t.calloutDraw = (v20t.calloutDraw || 0) + 1;
    v20t.calloutRect = [Math.round(x), Math.round(y), Math.round(w), Math.round(H), Math.round(a * 100)];
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 2;
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, 'rgba(4,18,14,0.97)');
    g.addColorStop(1, 'rgba(13,44,32,0.95)');
    ctx.fillStyle = g;
    roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(200,241,105,0.92)';
    ctx.lineWidth = 1.4;
    roundRect(x + 0.7, y + 0.7, w - 1.4, h - 1.4, 8);
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,241,105,0.9)';
    roundRect(x + 6, y + 7, 3, h - 14, 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(200,241,105,0.85)';
    ctx.font = '900 7.5px system-ui, sans-serif';
    ctx.fillText('TOUCHLINE', x + 15, y + 9);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 12.5px system-ui, sans-serif';
    ctx.fillText(touchFx.label, x + 15, y + 20.5);
    ctx.restore();
  }

  function drawCrowdFx() {
    var i, f, a, band = Math.max(9, H * 0.115);
    if (crowd.energy > 0.22) {
      var ea = clamp((crowd.energy - 0.2) * 1.7, 0, 0.92);
      ctx.save();
      ctx.globalAlpha = ea;
      var cols = ['#7fe3b0', '#f2d06b', '#5fa8e8', '#ef7f6b', '#c9a6f0'];
      for (i = 0; i < 16; i++) {
        var fx2 = (i + 0.5) / 16 * W + Math.sin(crowd.wave * 1.7 + i * 0.9) * 2.6;
        var top = i % 2 === 0;
        var fy = top ? band * 0.62 : H - band * 0.62;
        var sway = Math.sin(crowd.wave * 3.1 + i * 1.6) * 3.4;
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath();
        ctx.moveTo(fx2, fy - 4.6);
        ctx.lineTo(fx2 + 1.1, fy + 4.2);
        ctx.lineTo(fx2 + sway + 4.4, fy + 1.4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    var spr = crowd.flashes.length ? buildFlashSprite() : null;
    for (i = 0; i < crowd.flashes.length; i++) {
      f = crowd.flashes[i];
      a = 1 - f.t / f.t0;
      if (a <= 0) { continue; }
      var rr = f.r * (1.6 + (1 - a) * 3.4);
      ctx.save();
      ctx.globalAlpha = a * 0.85;
      if (spr) {
        ctx.drawImage(spr, f.x - rr * 2.2, f.y - rr * 2.2, rr * 4.4, rr * 4.4);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.9) + ')';
        ctx.beginPath(); ctx.arc(f.x, f.y, rr * 0.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    /* 사람 파도 — 흔들리는 빛 띠가 관중석을 가로지른다 */
    if (crowd.energy > 0.42) {
      var wk = (crowd.wave * 0.42) % 1;
      var wx = wk * W;
      ctx.save();
      ctx.globalAlpha = clamp((crowd.energy - 0.4) * 1.2, 0, 0.5) * (1 - Math.abs(wk - 0.5) * 1.4);
      var wg = ctx.createLinearGradient(wx - W * 0.09, 0, wx + W * 0.09, 0);
      wg.addColorStop(0, 'rgba(200,241,105,0)');
      wg.addColorStop(0.5, 'rgba(220,255,170,0.85)');
      wg.addColorStop(1, 'rgba(200,241,105,0)');
      ctx.fillStyle = wg;
      ctx.fillRect(wx - W * 0.09, 0, W * 0.18, band);
      ctx.fillRect(wx - W * 0.09, H - band, W * 0.18, band);
      ctx.restore();
    }
  }

  function draw() {
    if (!ctx) { return; }
    ctx.clearRect(0, 0, W, H);

    /* v21 ③ — 서브프레임 보간: 그리기 직전에만 좌표를 보간값으로 바꿓고 끝나면 되돌린다.
       시뮬레이션 상태는 건드리지 않으므로 물리·판정에는 영향이 없다. */
    var lerpK = (renderAlpha >= 0.999 || !(renderAlpha > 0)) ? 1 : renderAlpha;
    var swap = lerpK < 1, si, sp;
    if (swap) {
      for (si = 0; si < players.length; si++) {
        sp = players[si];
        sp._x = sp.x; sp._y = sp.y;
        var spx = isFinite(sp.px) ? sp.px : sp.x;
        var spy = isFinite(sp.py) ? sp.py : sp.y;
        sp.x = spx + (sp.x - spx) * lerpK;
        sp.y = spy + (sp.y - spy) * lerpK;
      }
      ball._x = ball.x; ball._y = ball.y; ball._z = ball.z;
      var bpx = isFinite(ball.px) ? ball.px : ball.x;
      var bpy = isFinite(ball.py) ? ball.py : ball.y;
      var bpz = isFinite(ball.pz) ? ball.pz : ball.z;
      ball.x = bpx + (ball.x - bpx) * lerpK;
      ball.y = bpy + (ball.y - bpy) * lerpK;
      ball.z = bpz + (ball.z - bpz) * lerpK;
    }

    /* 카메라 흔들림 — 슛·골·선방 순간 경기장이 짧게 울린다 */
    var shk = 0;
    if (shake.t > 0) {
      shk = clamp(shake.t / Math.max(0.01, shake.t0), 0, 1);
    }
    ctx.save();
    /* v31 — 카메라 흔들림만 화면 변환으로 남기고, 줌·패닝은 3D 카메라가 담당한다 */
    if (shk > 0) {
      var amp = shake.mag * shk;
      ctx.translate(Math.sin(simTime * 61) * amp, Math.cos(simTime * 47) * amp * 0.7);
    }
    /* 쿼터뷰 스타디움 — 잔디·라인·골대·광고판·관중석 */
    QV.drawStadium(ctx, simTime, { netFx: netFx });

    drawCardOverlays();
    drawKickoffMark();
    drawSetpieceOverlay();          /* v29 ② — 세트피스 대형·크로스 궤적 */
    drawPressZone();
    drawPassLine();
    drawOffsideLine();
    drawTrapLine();
    drawSupportWeb();
    drawDecals();
    drawRunArrows();                /* v30 — 오프더볼 침투 방향 화살표 (발밑) */
    drawParts(false);
    drawRipples();

    /* v31 — 쿼터뷰 원근 순서: 화면에서 먼(위쪽) 선수를 먼저 그린다 */
    var arr = players.slice();
    var ii0;
    for (ii0 = 0; ii0 < arr.length; ii0++) {
      arr[ii0]._sy = QV.project(arr[ii0].x, arr[ii0].y, 0).y;
    }
    arr.sort(function (a, b) { return a._sy - b._sy; });
    var i, p;

    drawShotTrail();

    for (i = 0; i < arr.length; i++) { drawPlayer(arr[i]); }
    /* v29 ② — 세트피스 니어/파포스트 라벨은 토큰 위에 */
    drawSetpieceLabels();
    /* v25 ② — 불꽃·색종이·스턴 별 등 앞 레이어 파티클 */
    drawParts(true);

    /* 말풍선 (겹치면 위로 쌓는다) */
    var placed = [];
    for (i = 0; i < arr.length; i++) {
      p = arr[i];
      if (!p.bubble) { continue; }
      var g = scr(p.x, p.y);
      var up = 0, guard = 0, q;
      for (q = 0; q < placed.length && guard < 4; q++) {
        if (Math.abs(placed[q].x - g.x) < 62 && Math.abs(placed[q].y - g.y) < 26) { up += 16; guard++; }
      }
      placed.push({ x: g.x, y: g.y, up: up });
      drawBubble(p, g.x, g.y, SPR_H * g.s, up);
    }

    /* 볼 — v31: 3D 투영으로 높이(z)를 그대로 반영한다. 지면 그림자는 공 바로 아래에 남는다. */
    var bp3 = QV.project(ball.x, ball.y, ball.z);
    var bpG = QV.project(ball.x, ball.y, 0);
    var bp = { x: bp3.x, y: bp3.y, s: bp3.s };
    var zpx = bpG.y - bp3.y;
    var r = Math.max(4.8, W / 128) * bp3.s * (1 + Math.min(0.3, zpx * 0.004));
    if (ball.z > 0.05 || zpx > 0.6) {
      var shK = clamp(1 - zpx * 0.007, 0.50, 1);          /* 높을수록 작게 */
      var shA = clamp(0.42 - zpx * 0.0022, 0.12, 0.42);   /* 높을수록 옅게 */
      var srx = Math.max(2.2, r * 1.30 * shK), sry = Math.max(1.1, r * 0.55 * shK);
      ctx.save();
      var shg = ctx.createRadialGradient(bpG.x, bpG.y, 0, bpG.x, bpG.y, srx);
      shg.addColorStop(0, 'rgba(4,20,15,' + shA + ')');
      shg.addColorStop(0.62, 'rgba(4,20,15,' + (shA * 0.62) + ')');
      shg.addColorStop(1, 'rgba(4,20,15,0)');
      ctx.fillStyle = shg;
      ctx.beginPath();
      ctx.ellipse(bpG.x, bpG.y, srx, sry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      /* 높은 로빙볼은 그림자 → 공을 잇는 점선으로 높이를 한눈에 읽게 한다 */
      if (zpx > 14) {
        ctx.save();
        ctx.globalAlpha = clamp(0.10 + zpx * 0.0018, 0.10, 0.26);
        ctx.strokeStyle = 'rgba(232,255,240,0.9)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(bpG.x, bpG.y - 2);
        ctx.lineTo(bp3.x, bp3.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
    if (ball.kind === 'shot') {
      var byy = bp3.y - r;
      var gr2 = ctx.createRadialGradient(bp.x, byy, 1, bp.x, byy, r * 3.4);
      gr2.addColorStop(0, 'rgba(255,236,150,0.8)');
      gr2.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = gr2;
      ctx.beginPath(); ctx.arc(bp.x, byy, r * 3.4, 0, Math.PI * 2); ctx.fill();
    }
    drawMatchBall(bp3.x, bp3.y - r * 0.35, r, bpG.y);
    drawNetRipple();
    /* v31 — 우하단 실시간 미니맵 레이더 */
    QV.drawMinimap(ctx, players, ball, {});
    ctx.restore();

    /* v30 — 세리머니 → 킥오프 사이 짧은 암전 전환 (피치 위에서만, HUD는 살아 있음) */
    if (fadeFx.t > 0) {
      var fk2 = 1 - clamp(fadeFx.t / fadeFx.t0, 0, 1);
      ctx.save();
      ctx.fillStyle = 'rgba(3,16,13,' + (Math.sin(fk2 * Math.PI) * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    /* v17 — 관중석 반짝임·깃발 (화면 고정 레이어) */
    drawCrowdFx();

    /* v20 ① — 터치라인 지시 콜아웃 (피치 위 짧은 지시 보드) */
    drawTouchCallout();

    /* 골 전광판 — 짧게 슬라이드 인/아웃 */
    if (flash.t > 0) { drawScoreboard(); }

    if (artGateOn) {
      var headTotal = 0, headOk = 0, kk2;
      for (kk2 in heads) {
        if (heads.hasOwnProperty(kk2)) { headTotal++; if (heads[kk2].ready) { headOk++; } }
      }
      var ready = headOk;
      var total = headTotal || 1;
      var pct = clamp(ready / total, 0, 1);
      ctx.fillStyle = 'rgba(3,16,13,0.82)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0d2a24';
      ctx.fillStyle = '#eaffd0';
      ctx.font = '900 17px system-ui, sans-serif';
      ctx.fillText('선수단 입장 중', W / 2, H / 2 - 16);
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(233,244,221,.72)';
      ctx.fillText('원형 초상화 ' + ready + ' / ' + total + '명 준비', W / 2, H / 2 + 6);
      var bw = Math.min(240, W * 0.46), bh = 6;
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      roundRect(W / 2 - bw / 2, H / 2 + 18, bw, bh, 3); ctx.fill();
      ctx.fillStyle = '#c8f169';
      roundRect(W / 2 - bw / 2, H / 2 + 18, Math.max(2, bw * pct), bh, 3); ctx.fill();
      ctx.textAlign = 'left';
    }
    if (M.halftime && M.running) {
      ctx.fillStyle = 'rgba(4,20,16,0.55)';
      ctx.fillRect(0, H / 2 - 22, W, 44);
      ctx.fillStyle = '#d6ff8a';
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HALF TIME', W / 2, H / 2 + 6);
      ctx.textAlign = 'left';
    }
    if (M.paused && M.running && !M.halftime && !artGateOn) {
      ctx.fillStyle = 'rgba(4,20,16,0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#eaffd0';
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSE', W / 2, H / 2 + 5);
      ctx.textAlign = 'left';
    }
    if (swap) {
      for (si = 0; si < players.length; si++) {
        sp = players[si];
        sp.x = sp._x; sp.y = sp._y;
      }
      ball.x = ball._x; ball.y = ball._y; ball.z = ball._z;
    }
  }

  M.v21 = function () {
    return {
      stall: { t: Math.round(ownHalfT * 100) / 100, side: ownHalfSide, warn: v21t.stallWarn, break: v21t.stallBreak, long: v21t.stallLong, backPassBlocked: v21t.backPassBlocked },
      shots: { clear: v21t.clearShots, box: v21t.boxShots, forwardPass: v21t.forwardPass },
      render: { alpha: Math.round(renderAlpha * 1000) / 1000, frames: v21t.frames, steps: v21t.steps, ratio: v21t.steps ? Math.round(v21t.frames / v21t.steps * 1000) / 1000 : null },
      hud: (function () { var h = hudState(); return { poss: h.poss, xg: h.xg, shots: h.shots, onTarget: h.onTarget, top: h.ratings.top, low: h.ratings.low }; })()
    };
  };

  /* ─────────────────────────  v21 계측  ───────────────────────── */

  /* v16 계측: 프레임 단위 선수 좌표·토큰 반지름 — 겹침·GK 밀집·블록 위치를 실측한다 */
  /* ─────────────────────────  v25 검증용 상태 조회  ─────────────────────────
     활성 전술카드·오버레이·파티클·킥오프 세리머니를 한 번에 돌려준다.
     (브라우저 콘솔 `DS.Match.v25()`) */
  M.v25 = function () {
    var i, list = activeCardList(), out = [], q, aceFx = [];
    for (i = 0; i < list.length; i++) {
      q = list[i];
      out.push({
        key: q.key, fx: q.fx, name: q.name, color: q.color, tag: q.tag,
        left: Math.round((buffs[q.fx] || 0) * 10) / 10, dur: q.dur,
        life: Math.round(cardLife(q) * 100) / 100,
        ace: cardAce[q.fx] ? cardAce[q.fx].name : ''
      });
      if (cardAce[q.fx]) { aceFx.push(q.fx); }
    }
    return {
      cards: v25t.cards, cardHits: cardHitCount, active: out,
      overlayFrames: v25t.overlays, parts: parts.length, maxParts: v25t.maxParts, spawn: v25t.spawn,
      kinds: v25t.kinds || {},
      decals: decals.length, confetti: v25t.confetti, diveFrames: v25t.dive,
      tackles: v25t.tackle, saves: v25t.save, kickSwing: v25t.kickSwing, passWave: v25t.passWave,
      chain: v25t.chain, kickoff: v25t.kickoff, kickoffPass: v25t.kickoffPass,
      kick: kick ? { label: kick.label, side: kick.side, t: Math.round(kick.t * 100) / 100, t0: kick.t0 } : null,
      half: halfNo, aceFx: aceFx,
      team: { home: TEAM_FX.home.ring, away: TEAM_FX.away.ring },
      phase: play.phase, clock: Math.round(M.clock * 10) / 10,
      carrier: ball.carrier ? ball.carrier.name : null
    };
  };

  M.inspect = function () {
    var i, p, out = [];
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off) { continue; }
      var g = scr(p.x, p.y);
      out.push({
        side: p.side, pos: p.pos, name: p.name, gk: isGK(p), carrier: ball.carrier === p,
        x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100,
        tx: Math.round(p.tx * 100) / 100, ty: Math.round(p.ty * 100) / 100,
        sx: Math.round(g.x * 10) / 10, sy: Math.round(g.y * 10) / 10,
        r: Math.round(Math.max(5.6, SPR_H * g.s * TOKEN_R) * tokenScale() * 10) / 10,
        kind: p.kind, moving: !!p.moving,
        bubble: p.bubble ? p.bubble.text : null,
        slot: p.boxSlot ? p.boxSlot.name : null,
        stam: Math.round(p.stam)
      });
    }
    return {
      t: Math.round(simTime * 1000) / 1000, clock: Math.round(M.clock * 10) / 10,
      phase: play.phase, stage: play.stage, atk: play.atkSide,
      ball: { x: Math.round(ball.x * 10) / 10, y: Math.round(ball.y * 10) / 10, carrier: ball.carrier ? ball.carrier.name : null, kind: ball.kind },
      view: { w: W, h: H, sprH: SPR_H, tokenR: TOKEN_R, tokenScale: tokenScale(), camMode: camMode, camZ: Math.round(cam.z * 1000) / 1000, sepK: SEP_K, field: field },
      sepMove: Math.round(sepMove * 1000) / 1000,
      recoverT: Math.round(play.recoverT * 100) / 100, recoverSide: play.recoverSide,
      p: out
    };
  };

  /* ─────────────────────────  v18 검증용 상태 조회  ─────────────────────────
     GK 배급 통계 · 3줄 블록 라인/폭/몰림 · 오프사이드 트랩 일자성 · 스로인 교차점을
     한 번에 돌려준다. (브라우저 콘솔 `DS.Match.v18()`) */
  function qaMean(a) { var s = 0, i; for (i = 0; i < a.length; i++) { s += a[i]; } return a.length ? s / a.length : null; }
  function qaSd(a) {
    if (a.length < 2) { return null; }
    var m = qaMean(a), s = 0, i;
    for (i = 0; i < a.length; i++) { s += (a[i] - m) * (a[i] - m); }
    return Math.sqrt(s / a.length);
  }
  function qaMaxWin(xs, win) {
    if (!xs.length) { return 0; }
    var s = xs.slice().sort(function (a, b) { return a - b; }), best = 0, i, j;
    for (i = 0; i < s.length; i++) {
      j = i;
      while (j < s.length && s[j] - s[i] <= win) { j++; }
      if (j - i > best) { best = j - i; }
    }
    return best;
  }
  M.v18 = function () {
    var sides = ['home', 'away'], out = { block: {}, gk: null, throws: null, trap: null }, si, i, p;
    out.gk = {
      decisions: v18t.gkDecision, short: v18t.gkShort, long: v18t.gkLong,
      clear: v18t.gkClear, dribbleBlocked: v18t.gkDribble
    };
    out.passOut = v18t.passOut;
    try { out.passOutLog = v18t.passOutLog || []; } catch (e) { out.passOutLog = []; }
    out.passClamp = v18t.passClamp;
    out.knockOut = v18t.knockOut;
    out.trap = {
      on: buffOf('offside') > 0, lineY: Math.round(v18t.trapLineY * 10) / 10,
      frames: v18t.trapFrames,
      flatSd: v18t.trapSdN ? Math.round(v18t.trapSdSum / v18t.trapSdN * 100) / 100 : null,
      caught: v18t.trapCaught, liveFrames: v18t.trapLive, zoneFrames: v18t.trapZone
    };
    out.throws = v18t.throws.slice(-6);
    out.spLaunch = v18t.spLaunch.slice(-60);
    for (si = 0; si < 2; si++) {
      var side = sides[si];
      var b = blockOf(side);
      var df = [], mf = [], fw = [], xs = [];
      for (i = 0; i < players.length; i++) {
        p = players[i];
        if (p.side !== side || p.off || isGK(p)) { continue; }
        xs.push(p.x);
        var g = groupOf(p);
        if (g === 'DF') { df.push(p.y); } else if (g === 'MF') { mf.push(p.y); } else { fw.push(p.y); }
      }
      var lo = 999, hi = -999;
      for (i = 0; i < xs.length; i++) { if (xs[i] < lo) { lo = xs[i]; } if (xs[i] > hi) { hi = xs[i]; } }
      out.block[side] = {
        lineDF: Math.round(b.dfY * 10) / 10, lineMF: Math.round(b.mfY * 10) / 10, lineFW: Math.round(b.fwY * 10) / 10,
        bank: Math.round((b.mfY - b.dfY) * 10) / 10, fwGap: Math.round((b.fwY - b.mfY) * 10) / 10,
        flat: !!b.flat,
        rowDF: df.length ? Math.round(qaMean(df) * 10) / 10 : null,
        rowMF: mf.length ? Math.round(qaMean(mf) * 10) / 10 : null,
        rowFW: fw.length ? Math.round(qaMean(fw) * 10) / 10 : null,
        sdDF: df.length ? Math.round(qaSd(df) * 100) / 100 : null,
        width: xs.length ? Math.round((hi - lo) * 10) / 10 : 0,
        maxIn22: qaMaxWin(xs, 22), players: xs.length,
        pressers: pressConfig(side).n
      };
    }
    return out;
  };

  /* ───────────────────────  v19 ④ — 경기 후 FM식 리포트 계측  ───────────────────────
     · 슈팅 로그: shoot/resolveShot·세트피스 헤더가 남기는 {side,x,y,xg,onTarget,isGoal,min,scorer}
     · 평균 포지션: 오픈 플레이에서 0.3초마다 전 선수 좌표를 누적
     · 패스 연결망: kickPass의 from→to 촐을 누적
     M.report()로 한 번에 돌려주고, game.js 상세 결과서가 2D 미니피치로 그린다. */
  function v19Summary() {
    var n = 0, k;
    for (k in posAcc) { if (posAcc.hasOwnProperty(k)) { n += 1; } }
    return {
      transitions: { home: v19t.trans.home, away: v19t.trans.away },
      transThrough: v19t.transThrough, transRuns: v19t.transRuns,
      wallTries: v19t.wallTries, wallPass: v19t.wallPass, cutback: v19t.cutback,
      overlap: { home: v19t.overlap.home, away: v19t.overlap.away },
      invert: { home: v19t.invert.home, away: v19t.invert.away },
      counterPressBurst: { home: v19t.burst.home, away: v19t.burst.away },
      press3Frames: v19t.press3,
      aiPosture: aiPosture, aiShifts: v19t.aiShifts.slice(),
      contest: v19t.contest, headers: v19t.header,
      secondBalls: v19t.secondBall, clearances: v19t.clearance,
      shotsLogged: shotLog.length, avgRows: n
    };
  }

  function samplePositions() {
    var i, p, r;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.off || isGK(p)) { continue; }
      r = posAcc[p.player.id];
      if (!r) { r = posAcc[p.player.id] = { side: p.side, name: p.name, pos: p.pos, x: 0, y: 0, n: 0 }; }
      r.x += p.x; r.y += p.y; r.n += 1;
      r.name = p.name; r.pos = p.pos;
    }
  }

  function reportData() {
    var out = { shots: [], avg: { home: [], away: [] }, net: { home: [], away: [] }, v19: v19Summary() };
    var i, k, r, s, sd, key, rec, fa, ta, arr, byId = {};
    for (i = 0; i < shotLog.length; i++) {
      s = shotLog[i];
      out.shots.push({
        side: s.side, x: s.x, y: s.y, xg: s.xg,
        onTarget: s.onTarget, isGoal: s.isGoal, min: s.min, scorer: s.scorer, set: !!s.set
      });
    }
    for (k in posAcc) {
      if (!posAcc.hasOwnProperty(k)) { continue; }
      r = posAcc[k];
      byId[k] = r;
      if (!r.n) { continue; }
      out.avg[r.side].push({
        id: k, name: r.name, sn: short(r.name), pos: r.pos,
        x: Math.round(r.x / r.n * 10) / 10, y: Math.round(r.y / r.n * 10) / 10, n: r.n
      });
    }
    /* 정렬: 수비→중원→공격, 같은 그룹은 폭(x) 순 — 리포트에서 라인이 흔들리지 않게 */
    var order = { CB: 1, LB: 1, RB: 1, LWB: 1, RWB: 1, DM: 2, CM: 2, AM: 2, LWF: 3, RWF: 3, ST: 4, FW: 4 };
    for (i = 0; i < 2; i++) {
      sd = i === 0 ? 'home' : 'away';
      out.avg[sd].sort(function (a, b) {
        var d = (order[a.pos] || 5) - (order[b.pos] || 5);
        return d !== 0 ? d : a.x - b.x;
      });
      arr = [];
      for (key in passNet[sd]) {
        if (!passNet[sd].hasOwnProperty(key)) { continue; }
        rec = passNet[sd][key];
        fa = byId[rec.fromId];
        ta = byId[rec.toId];
        if (!fa || !ta || !fa.n || !ta.n) { continue; }
        arr.push({
          from: short(rec.from), to: short(rec.to), n: rec.n,
          x1: Math.round(fa.x / fa.n * 10) / 10, y1: Math.round(fa.y / fa.n * 10) / 10,
          x2: Math.round(ta.x / ta.n * 10) / 10, y2: Math.round(ta.y / ta.n * 10) / 10
        });
      }
      arr.sort(function (a, b) { return b.n - a.n; });
      out.net[sd] = arr.slice(0, 10);
    }
    return out;
  }

  /* v19 검증용 상태 조회 (전환·원투·AI 포스처·세트피스 경합 계측) */
  M.v19 = function () { return v19Summary(); };
  /* 상세 결과서용 리포트 (슈팅 로그 · 평균 포지션 · 패스 연결망) */
  M.report = function () { return reportData(); };

  /* 검증용 상태 조회 (포메이션·전술·카드가 실제 좌표에 반영됐는지) */
  M.probe = function () {    var i, p, h = [], a = [];
    for (i = 0; i < players.length; i++) {
      p = players[i];
      var row = {
        pos: p.pos, name: p.name, x: Math.round(p.x), y: Math.round(p.y),
        pic: (p.player && p.player.pic) || null,
        head: (function () { var hrec = heads[(p.player && p.player.pic) || 1]; return hrec && hrec.ready ? 'loaded' : 'pending'; })(),
        tx: Math.round(p.tx), ty: Math.round(p.ty), kind: p.kind,
        pose: poseOf(p), moving: !!p.moving, support: !!(p.supportT > 0), run: !!(p.runT > 0),
        stam: Math.round(p.stam), tokenR: Math.round(SPR_H * scr(p.x, p.y).s * TOKEN_R * tokenScale() * 10) / 10,
        ring: p.side === 'home' ? TEAM_FX.home.ring : TEAM_FX.away.ring, gk: isGK(p),
        carrier: ball.carrier === p, ringColor: (p.side === 'home' ? 'blue' : 'red'),
        bodySprite: false,
        bubble: p.bubble ? p.bubble.text : null,
        screen: (function () {
          var g = scr(p.x, p.y);
          return { x: Math.round(g.x), y: Math.round(g.y), scale: Math.round(g.s * 100) / 100, sprH: Math.round(SPR_H * g.s) };
        })(),
        art: (function () { var rec = heads[(p.player && p.player.pic) || 1]; return rec && rec.ready ? 'loaded' : 'pending'; })()
      };
      if (p.side === 'home') { h.push(row); } else { a.push(row); }
    }
    var pcs = pressConfig('home');
    var ready = 0, kk;
    for (kk in heads) { if (heads.hasOwnProperty(kk) && heads[kk].ready) { ready++; } }
    return {
      clock: minute(), phase: play.phase, stage: play.stage, sit: play.sitKey, paused: M.paused, halftime: M.halftime,
      running: M.running, speed: M.speed,
      /* v29 — 세트피스 대형·전술 상성 QA용 */
      setpiece: play.setpiece ? { type: play.setpiece.type, side: play.setpiece.side, timer: Math.round(play.setpiece.t * 100) / 100 } : null,
      touch: { mentality: touch.mentality, pressing: touch.pressing, line: touch.line, focus: touch.focus },
      view: {
        mode: 'landscape', w: W, h: H, sprH: SPR_H, field: field,
        pitchImage: !!(pitchImg && pitchImg.naturalWidth),
        loadingGate: artGateOn, loadingLeft: headLeft,
        portraitsReady: ready, portraitsTotal: (function () { var n = 0; for (kk in heads) { if (heads.hasOwnProperty(kk)) { n++; } } return n; })(),
        homeAttack: 'left→right', awayAttack: 'right→left'
      },
      ball: { x: Math.round(ball.x), y: Math.round(ball.y), z: Math.round(ball.z * 10) / 10, vz: Math.round(ball.vz), kind: ball.kind, shot: !!ball.shot },
      passLine: play.passLine ? true : false,
      formation: {
        home: formationOf('home'), away: formationOf('away'), tactic: tactic,
        styleHome: styleKeyOf('home'), styleAway: styleKeyOf('away'),
        morphHome: morphOf('home'), morphAway: morphOf('away'),
        lineHome: Math.round(lineYOf('home')), lineAway: Math.round(lineYOf('away')),
        pressHome: Math.round(pcs.press), pressers: pcs.n,
        pressAway: Math.round(pressConfig('away').press), pressersAway: pressConfig('away').n,
        shape: shapeOf('home'),
        bankMf: Math.round(bankYOf('home', 'MF')), bankFw: Math.round(bankYOf('home', 'FW')),
        mfRowY: (function () { var s = 0, n = 0, j; for (j = 0; j < players.length; j++) { if (players[j].side === 'home' && isMidGroup(players[j]) && !players[j].off) { s += players[j].y; n++; } } return n ? Math.round(s / n) : null; })(),
        dfRowY: Math.round(defLineY('home')),
        dfRowYAway: Math.round(defLineY('away')),
        mfRowYAway: (function () { var s = 0, n = 0, j; for (j = 0; j < players.length; j++) { if (players[j].side === 'away' && isMidGroup(players[j]) && !players[j].off) { s += players[j].y; n++; } } return n ? Math.round(s / n) : null; })(),
        widthAway: (function () { var lo = 999, hi = -999, j; for (j = 0; j < players.length; j++) { if (players[j].side === 'away' && !isGK(players[j]) && !players[j].off) { lo = Math.min(lo, players[j].x); hi = Math.max(hi, players[j].x); } } return hi > lo ? Math.round(hi - lo) : 0; })(),
        widthHome: (function () { var lo = 999, hi = -999, j; for (j = 0; j < players.length; j++) { if (players[j].side === 'home' && !isGK(players[j]) && !players[j].off) { lo = Math.min(lo, players[j].x); hi = Math.max(hi, players[j].x); } } return hi > lo ? Math.round(hi - lo) : 0; })()
      },
      support: {
        count: (play.supList || []).length,
        names: (play.supList || []).map(function (s) { return s.name; }),
        carriers: ball.carrier ? ball.carrier.name : null
      },
      fx: {
        ripples: ripples.length, shake: Math.round(shake.t * 100) / 100,
        flash: Math.round(flash.t * 100) / 100, passLine: play.passLine ? 1 : 0
      },
      buffs: (function () { var o = [], k; for (k in buffs) { if (buffs[k] > 0) { o.push(k); } } return o; })(),
      tele: { pass: tele.pass, press: tele.press, swarm: tele.swarm, longwin: tele.longwin },
      home: h, away: a
    };
  };

  /* ─────────────── v20 ① — 라이브 터치라인 지시 API ─────────────── */
  function touchLabel(key, val) {
    var d = TOUCH_DEF[key], i;
    if (!d) { return ''; }
    for (i = 0; i < d.opts.length; i++) { if (d.opts[i].v === val) { return d.opts[i].short; } }
    return val;
  }
  function touchExplain(key, val) {
    if (key === 'mentality') {
      return val === 'defensive' ? '블록을 내리고 안전하게.' : val === 'attacking' ? '라인을 올리고 전진 인원을 늘립니다.'
        : val === 'allout' ? '전원 전진, 마지막 승부수!' : '간격을 지키며 상황을 봅니다.';
    }
    if (key === 'pressing') {
      return val === 'low' ? '압박선을 내리고 지칠 때까지 기다립니다.' : val === 'high' ? '상대 후방 빌드업부터 물어뜯습니다.'
        : '반경과 인원을 평소대로.';
    }
    if (key === 'line') {
      return val === 'deep' ? '수비 라인을 내려 뒷공간을 지웁니다.' : val === 'high' ? '하이 라인으로 압축합니다.'
        : '표준 높이를 유지합니다.';
    }
    return val === 'left' ? '왼쪽 측면으로 수를 모읍니다.' : val === 'right' ? '오른쪽 측면으로 수를 모읍니다.'
      : '중앙 하프스페이스로 찌릅니다.';
  }

  /* ═══════════ v29 — 전술 상성 실시간 피드백 ═══════════
     "내 지시가 상대 성향의 급소를 찔렀는가"를 수치가 아니라 플레이로 알려 준다.
     스카우팅 리포트의 카운터 팁과 같은 어휘를 쓴다(게겐프레싱 → 압박선 내리기 등). */
  var MATCHUP_RULES = {
    gegenpress: [
      { key: 'gp-low', test: function () { return touch.pressing === 'low'; },
        tag: '🎯 전술 적중!', text: '게겐프레싱 상대 — 압박선을 내려 1선 압박에 말려들지 않고 곧바로 전방으로 넘깁니다' },
      { key: 'gp-deep', test: function () { return touch.line === 'deep'; },
        tag: '🚫 봉쇄!', text: '상대 하이 프레스의 등 뒤 공간을 지웠습니다' }
    ],
    tikitaka: [
      { key: 'tk-high', test: function () { return touch.pressing === 'high'; },
        tag: '🎯 전술 적중!', text: '티키타카의 짧은 빌드업을 전방 압박으로 끊습니다 — 중앙 삼각 봉쇄' }
    ],
    counter: [
      { key: 'ct-high', test: function () { return touch.line === 'high'; },
        tag: '🎯 전술 적중!', text: '두 줄 블록 위로 라인을 올려 조르고, 탈취 뒤 역습 대비는 DH 둘로 남겼습니다' }
    ],
    wingplay: [
      { key: 'wp-center', test: function () { return touch.focus === 'center'; },
        tag: '🎯 전술 적중!', text: '측면을 크게 벌린 상대 — 비어 있는 중앙 하프스페이스로 찌릅니다' },
      { key: 'wp-high', test: function () { return touch.pressing === 'high'; },
        tag: '🎯 전술 적중!', text: '겹쳐 오는 풀백의 터치라인을 전방 압박으로 먼저 지웁니다' }
    ],
    hybrid3241: [
      { key: 'hb-high', test: function () { return touch.pressing === 'high'; },
        tag: '🎯 전술 적중!', text: '가변 3-2-4-1이 변형되는 첫 패스 줄을 압박합니다' }
    ],
    direct: [
      { key: 'dc-deep', test: function () { return touch.line === 'deep'; },
        tag: '🎯 전술 적중!', text: '직선 롱볼 — 수비 라인을 내려 뒷공간을 지우고 세컨볼을 먼저 잡습니다' }
    ]
  };

  function matchupState() {
    var oppKey = styleKeyOf('away');
    var list = MATCHUP_RULES[oppKey] || [], i, rule = null;
    for (i = 0; i < list.length; i++) { if (list[i].test()) { rule = list[i]; break; } }
    return {
      oppKey: oppKey, oppName: styleOf('away').name, oppPosture: aiPosture,
      active: rule ? { key: rule.key, tag: rule.tag, text: rule.text } : null,
      hits: v29t.matchup.hits.slice(-8),
      fx: { t: Math.round(matchupFx.t * 100) / 100, tag: matchupFx.tag, text: matchupFx.text, key: matchupFx.key, tone: matchupFx.tone },
      label: rule ? (rule.tag + ' ' + rule.text) : null
    };
  }

  function matchupHit(key, tag, text, tone) {
    var mn = Math.round(simTime / PER_MIN);
    if (v29t.matchup.lastKey === key && mn - v29t.matchup.lastMin < 6) { return; }
    v29t.matchup.lastKey = key;
    v29t.matchup.lastMin = mn;
    v29t.matchup.hits.push({ min: mn, key: key, tag: tag, text: text });
    if (v29t.matchup.hits.length > 24) { v29t.matchup.hits.shift(); }
    matchupFx = { t: matchupFx.t0, t0: 4.4, tag: tag, text: text, tone: tone || 'hit', key: key };
    v29t.matchup.active = { key: key, tag: tag, text: text, min: mn };
    say(tag + ' ' + text, 'tactic');
    if (cfg && cfg.onMatchup) { try { cfg.onMatchup(matchupState()); } catch (eM) { /* noop */ } }
  }

  function evalMatchup(force) {
    var oppKey = styleKeyOf('away');
    var list = MATCHUP_RULES[oppKey] || [], i, rule = null;
    for (i = 0; i < list.length; i++) { if (list[i].test()) { rule = list[i]; break; } }
    if (!rule) { v29t.matchup.lastKey = null; return null; }
    if (!force && v29t.matchup.lastKey === rule.key) { return null; }
    matchupHit(rule.key, rule.tag, rule.text);
    return rule;
  }

  /* v29 ① — 사이드 전환 성공/실패 계측 + 피드백 */
  function noteSwitchDone(rv, ok) {
    var sw = v29t.lastSwitch;
    if (sw && !sw.done) {
      sw.done = true; sw.ok = !!ok;
      if (ok) { v29t.switchDone += 1; } else { v29t.switchFail += 1; }
    }
    if (ok && rv) {
      matchupHit('switch-ok', '⚡ 사이드 전환 적중!',
        U.josa(short(rv.name), '이/가') + ' 반대편 폭에서 공을 잡았습니다 — 압박을 통째로 벗겨냈습니다');
      say('↔ 사이드 전환 성공! ' + U.josa(short(rv.name), '이/가') + ' 반대편에서 공을 잡습니다 — 수비가 흔들립니다.', 'tactic');
    }
  }
  /* v29 ①-b — 뒷공간 스루패스 성공 */
  function noteThroughDone(rv) {
    if (!rv) { return; }
    matchupHit('through-ok', '⚡ 뒷공간 침투 적중!',
      U.josa(short(rv.name), '이/가') + ' 수비 라인 뒤에서 공을 받습니다');
  }

  M.touchDef = TOUCH_DEF;
  M.touchState = function () {
    var sh = shapeOf('home'), pc = pressConfig('home'), b = blockOf('home');
    return {
      mentality: touch.mentality, pressing: touch.pressing, line: touch.line, focus: touch.focus,
      labels: { mentality: touchLabel('mentality', touch.mentality), pressing: touchLabel('pressing', touch.pressing), line: touchLabel('line', touch.line), focus: touchLabel('focus', touch.focus) },
      shape: { name: sh.name, bank: sh.bank, bankW: sh.bankW, width: sh.width, press: sh.press, runs: sh.runs, fbPush: sh.fbPush },
      lineY: Math.round(lineYOf('home') * 10) / 10,
      block: { dfY: Math.round(b.dfY * 10) / 10, mfY: Math.round(b.mfY * 10) / 10, fwY: Math.round(b.fwY * 10) / 10, widthK: Math.round(b.widthK * 100) / 100, pull: b.pull },
      press: { n: pc.n, radius: Math.round(pc.radius * 10) / 10, value: Math.round(pc.press) },
      focusX: touch.focus === 'balance' ? 50 : TOUCH_FOCUS_X[touch.focus],
      changes: v20t.touch.changes, callout: Math.round(touchFx.t * 100) / 100,
      callouts: v20t.touch.callouts,
      draw: v20t.calloutDraw || 0, rect: v20t.calloutRect || null,
      last: v20t.touch.last
    };
  };
  M.setTouch = function (key, val) {
    var d = TOUCH_DEF[key], ok = false, i, p, cap = null;
    if (!d) { return false; }
    for (i = 0; i < d.opts.length; i++) { if (d.opts[i].v === val) { ok = true; } }
    if (!ok || touch[key] === val) { return false; }
    var from = touch[key];
    touch[key] = val;
    touchCount += 1;
    blockCache.frame = -1;                     /* 다음 프레임에 새 대형을 바로 계산 */
    v20t.touch.changes += 1;
    v20t.touch.last = { min: minute(), key: key, from: from, to: val };
    v20t.touch.callouts += 1;
    touchFx = { t: touchFx.t0, t0: 2.6, label: d.label + ' · ' + touchLabel(key, val), tone: key };
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (p.side === 'home' && !isGK(p) && !p.off) { cap = p; break; }
    }
    if (cap) { bubbleUnique(cap, '📋 ' + touchLabel(key, val), '#c8f169', 1.4); fxRing(cap, '#c8f169', 0.7); }
    say('📋 터치라인 지시 — ' + d.label + ' ' + touchLabel(key, val) + '. ' + touchExplain(key, val), 'tactic');
    /* v29 ③ — 지시가 바뀌면 상대 성향과의 상성을 바로 재판단해 피드백을 띄운다 */
    try { evalMatchup(true); } catch (eMU) { /* noop */ }
    if (cfg && cfg.onTouch) { cfg.onTouch(M.touchState()); }
    return true;
  };
  M.matchupState = matchupState;
  M.v29 = function () {
    return {
      switch: {
        tries: v29t.switchTries, done: v29t.switchDone, fail: v29t.switchFail,
        last: v29t.lastSwitch, log: v29t.switches.slice(-6)
      },
      iso: {
        frames: v29t.isoFrames,
        avgFar: v29t.isoFrames ? Math.round(v29t.isoFarSum / v29t.isoFrames * 10) / 10 : null,
        minFar: v29t.isoFarMin === 999 ? null : Math.round(v29t.isoFarMin * 10) / 10,
        maxFar: v29t.isoFarMax ? Math.round(v29t.isoFarMax * 10) / 10 : null
      },
      setpiece: {
        corner: v29t.sp.corner, fk: v29t.sp.fk, wall: v29t.sp.wall, box: v29t.sp.box,
        near: v29t.sp.near, far: v29t.sp.far, back: v29t.sp.back, last: v29t.sp.last,
        layout: spLayout ? { type: spLayout.type, side: spLayout.side, near: spLayout.near, far: spLayout.far, slots: spLayout.slots } : null
      },
      matchup: matchupState(),
      header: { contest: v29t.headerContest, onTarget: v29t.headerOnTarget },
      arcCross: v29t.arcCross, drawArc: v29t.drawArc || 0
    };
  };
  /* v20 계측 (롤·주발·터치라인) */
  M.v20 = function () {
    var i, p, prof = { inverted: 0, traditional: 0, wingers: [] };
    for (i = 0; i < players.length; i++) {
      p = players[i];
      if (!isWingerPos(p)) { continue; }
      if (isInverted(p)) { prof.inverted += 1; } else { prof.traditional += 1; }
      prof.wingers.push({ side: p.side, name: p.name, pos: p.pos, foot: p.foot, role: mroleOf(p), inverted: isInverted(p) });
    }
    return {
      touch: M.touchState(),
      roles: {
        invertedCut: v20t.invertedCut, wideHold: v20t.wideHold, dmDrop: v20t.dmDrop,
        lateBox: v20t.lateBox, cfDrop: v20t.cfDrop, stBehind: v20t.stBehind, ifbIn: v20t.ifbIn
      },
      wingers: prof,
      shots: v20t.shots,
      focusPass: v20t.focusPass, focusRun: v20t.focusRun,
      press: {
        frames: v20t.pressFrames,
        avg: v20t.pressFrames ? Math.round(v20t.pressSum / v20t.pressFrames * 100) / 100 : 0,
        max: v20t.pressMax
      }
    };
  };

  /* v29 QA — 세트피스 대형을 결정적으로 띄워 보는 훅 (검증 하네스 전용) */
  M.debugSetpiece = function (type, side) {
    if (!M.running) { return false; }
    side = side === 'away' ? 'away' : 'home';
    if (type === 'corner') {
      ball.x = side === 'home' ? 24 : 76;
      doCorner(side);
      return true;
    }
    if (type === 'fk') {
      freeKick(side, side === 'home' ? 62 : 38, side === 'home' ? 27 : 93, false);
      return true;
    }
    return false;
  };

  /* v30 QA — 공중볼 그림자·높이 점선을 결정적으로 확인하는 훅 (검증 하네스 전용) */
  M.debugBallAir = function (z) {
    if (!M.running) { return false; }
    ball.z = clamp(z == null ? 26 : z, 0, 80);
    ball.vz = 0;
    return { z: ball.z, px: depthPx(ball.z) };
  };

  DS.Match = M;

})(window);
