# 인수인계 — 《꼬마일레븐 FC》 (`Dot-soccer`)

> 기준 **v38 (`?v=38&b=37`) — 2단계 4대 기능: 선수 상세창 · 라커룸 성향 · 커스텀 전술 · 초보자 코치마크** · 2026-11-28
> 라이브 **`https://hojin8811-dev.github.io/Dot-soccer/?v=38&b=37`**
> 기능 커밋 — **`0213129`** `feat(v38): 2단계 4대 기능 구현 (선수 상세창·라커룸 성향·커스텀 전술·초보자 튜토리얼) (b=37)`
> 곁들인 수정 — **`7ab0197`** 홈·원정 초상화 중복 시 원정 얼굴 재배정(피치 두상 22/22) · **`89796bb`** 라이브 검증 기록·스샷
> 버전별 상세 이력은 `README.md`(맨 위가 최신 v38), 화면 캡처는 `preview/v38/`에 있습니다.

---

## 1. 한눈에

| 항목 | 내용 |
| --- | --- |
| 무엇 | **꼬마일레븐 FC** — **100% 오리지널** 가상 선수·감독으로 즐기는 현대 전술 축구 구단 경영 RPG. 유저는 **전술 카드·교체·터치라인 지시·커스텀 전술**로 개입한다. |
| 이번 버전의 한 줄 | **"경영·육성 화면을 채우는 2단계"** — 500명 얼굴을 크게 보는 **선수 상세창**을 어디서든 열리게 하고, 장식이던 **라커룸 성향을 경기 AI·훈련·분위기의 실제 계수**로 꽂았다. **커스텀 전술 지시**와 **첫 공식전 4단계 코치마크** 추가. v37 렌더·v33 버그 수정·v35 사이드 AI는 그대로(계수만 가산). |
| 화면 | 하단 5탭 — 공식전(리그) / S매치 / 마이팀 / 클럽 / 이적시장. **844×390 가로** 기준 설계(844×360 지원), **완전 가로 전용** — 세로(폭 900 이하)에서는 전체 화면 회전 안내(`#rotate`). |
| 기술 | **정적 HTML/CSS/JS만**(빌드 없음). Canvas 2D, 60Hz 시뮬레이션 + 서브프레임 보간. 선수는 **500장 초상화의 두상 크롭을 원형으로 클립해 그리는 토큰**(`assets/portraits/head/pNNN.png`). |
| 저장소·배포 | `https://github.com/hojin8811-dev/Dot-soccer` · 브랜치 `main` = GitHub Pages 루트. push하면 자동 반영, CI 없음 |
| 라이브 | `https://hojin8811-dev.github.io/Dot-soccer/?v=38&b=37` |
| 규모 | 선수 초상 **500종 + 두상 500장** · 감독 50명 · 1·2부 리그(2부 20팀 38라운드) · 유소년 아카데미 + 2군 리그 · 비동기 PvP(구단 코드 `?vs=`) · 전술 카드 12종 · **1군 정원 18명(선발 11+벤치 7)** |

---

## 2. v38에서 추가된 4가지 (구조)

### 2-1. 선수 상세창 — `js/game.js` `playerModal(p, opts)`

- **어디서든**: 마이팀 피치 토큰(`data-act="starter"`, 선택 없음일 때) · 벤치 카드 ⓘ(`.pinfo`, `data-act="player"`) · **클럽 1군 선수단 명부**(`rosterHTML()`, 18명) · 클럽 롤 목록(`.role-row/.rw-row`) · 유소년 카드 ⓘ · **이적시장 매물 카드**(`.mkt.pclick`, `data-cmp="1"`).
- **구성**: `pd-hero.v38` 큰 초상화(136×156, 원본 400px 로드) → `potGaugeHTML()` (OVR=`rawRating` vs 잠재=`potOf`, **`atPotCap` 이면 "잠재력 한계 도달" 배지**) → `stat3HTML()` (**스피드/공격/수비 = `p.stats.spd/atk/def`**, 아래에 기본기 s/t/p) → `aptMap()` → `setSkillHTML()` (개성 `trait`·세트피스 PK/FK/코너킥/캡틴·특훈 콤보) → `growthHTML()` (Lv·경기 EXP 바·누적 EXP·**누적 성장 `p.dev`**·통산 출전/골/도움·훈련 배율) → 롤·성향 효과 → **이적시장이면 `compareCardHTML()`** → 스토리 → 이름/등번호/롤 진화.
- **비교 카드**: `bestAtPosition(pos)` 가 **내 선발의 동포지션 최고**(없으면 같은 그룹 → 스쿼드)를 골라 OVR·잠재·스피드·공격·수비·나이 델타(초록/빨강)와 주전/백업을 보여 준다.
- **성장 이력 저장**: `DS.growAttr()` 가 `p.dev` 를, `DS.addExp()` 가 `p.expTotal` 을 누적한다(옛 세이브는 로드 시 0 보정).

### 2-2. 라커룸 성향 — `js/data.js` `DS.LOCK_FX` · `js/match.js`

- 성향 키는 v24부터 있던 **`fight`(승부욕) · `crea`(창의) · `dev`(헌신) · `calm`(냉정)** — 세이브 호환 유지.
- `DS.LOCK_FX[key] = { shoot, through, cross, press, tackle, stamina, err, dribble, train, label, trainLabel }` **한 표를 data·match·game 이 같이 읽는다**.
- match.js 반영 지점:
  - `decide()` 슈팅 확률 `pShot *= 1 + lockVal(p,'shoot') + synOf(side,'fight')`
  - `passBall()` 창의 캐리어 스루패스/전환 가산, 냉정 동료 빌드업 가산, `kickPass()` 패스 오차 `err *= (1-lockVal(p,'err'))`, 크로스 확률 ×(1+`cross`)
  - `pressConfig()` 압박 `+ 헌신 인원×1.4 + 시너지×100`
  - 태클 `defSkill += tackle×30 + 시너지×40`, 캐리어 `pT *= 1 - dribble×0.5`
  - 체력 `drain *= 1 - stamina - 시너지×0.6`
- **시너지** `synOf(side,key)`: 같은 성향 3명↑ **0.03**, 5명↑ **0.06**(양 팀 모두 적용 — AI 팀도 성향을 가진다).
- **훈련** `DS.trainMultOf(p)`: 헌신 ×1.25 · 승부욕 ×1.12 · 냉정 ×1.08 · 창의 ×1.06 + 개성(성실 ×1.10 / 기복 ×0.94 / 투혼 ×1.04). `doTrain()` 은 배율의 소수부를 **추가 성장 확률**로 굴리고 토스트에 `성향 보정 ×1.25` 를 찍는다. 유소년 코칭 EXP도 같은 배율.
- **팀 분위기** `DS.teamMood(morale, form)` — 사기 + 최근 5경기(`S.form`, `W/D/L`) 연승·연패 → `{score,label,color,desc,mult}`. `mult`(0.94~1.06)은 `cfg.formMult`로 match 의 `formFactor`에 들어가 **슛 정확도**를 민다. 표시: 마이팀 aside · 클럽 카드 · **하프타임 교체창 `.sub-mood`**.

### 2-3. 커스텀 전술 지시 — `S.ctac = {line, press, wide}` (0~100, 50=표준)

- UI: 마이팀 aside **`.sq-ctac`** — 3행 × **5단계 세그먼트**(`data-act="ctac" data-k data-v`). 값은 `save()`에 저장, 경기 중 변경 시 `DS.Match.setCustomTactics()` 로 즉시 반영.
- 엔진(match.js): `ctacLine()` = (line−50)/50×**7** → `lineYOf`, `ctacPress()` = /50×**9** → `pressConfig`, `ctacWing()` = −1~+1 → `passBall` 측면 가중·`wideOutlet` 값·`decide()` 1.8단계 확률(+0.14×wing).
- 기본 흐름 보존: v35 `centerCrowd/wideOutlet` 로직은 그대로 두고 **가산 계수만** 준다.
- 옛 세이브: 로드 시 `ctac` 없으면 `{50,50,50}` 보정.

### 2-3b. 곁들여 고친 것 — 홈·원정 얼굴 중복 (`M.start` `dedupeFaces`)

- 두 팀 스쿼드는 따로 생성되므로 500장 풀에서 홈·원정 얼굴이 겹치면 피치 토큰 두상 캐시가 21/22로 줄고 쌍둥이가 섰다.
- `M.start` 에서 players 를 만든 직후, **원정 선수 얼굴만** `DS.nextFreePic(all, pos)` 로 다시 골라 22명이 22얼굴이 되게 한다(유저 선수 얼굴 불변). `M.v38().counts.faceDupes` 로 몇 명 바꿨는지 확인 가능.

### 2-4. 첫 공식전 코치마크 — `js/game.js` `TUT_STEPS` / `tutOpen()` / `tutMaybeStart()`

- `startMatch()` 끝에서 `tutMaybeStart(kind)` — **`kind==='league'` 이고 `S.tut.done` 이 false일 때만** 1.3초 뒤 `DS.Match.pause()` 후 `#m-overlay` 에 `.tut` 레이어를 그린다.
- 4단계: ① `#m-pitch` 흐름·지시 ② `#m-hand` 전술 카드 ③ `.m-acts [data-act=subs]` 교체 ④ `#m-speeds` 배속. **다음/이전/건너뛰기** + 점 표시.
- 스포트라이트는 `.tut-hole` 의 거대 `box-shadow` 로 만들고, 카드는 대상 사각형 기준으로 위/아래(대상이 화면 62%보다 크면 안쪽 아래)에 놓는다.
- 완료·스킵 모두 `S.tut.done = true` 저장 → **재진입 반복 없음**(검증: 2번째 경기 `open:false`). 마이팀 **[조작 가이드]**(`data-act="tutreplay"`)로 다시 보기.
- 경기 화면을 떠나면(`setTab`) 오버레이를 정리한다.

---

## 3. 실제로 확인한 값 (2026-11-28, 로컬 `python3 -m http.server` + Playwright Chromium 844×390)

| 항목 | 결과 |
| --- | --- |
| 공식전 90분 완주 (844×390) | **완주** — `clock 90`, `DS.Match.phase ended`, `running false`, 결과서 표시 |
| 공식전 90분 완주 (844×360) | **완주** — `phase ended`, 선수 22명, 결과서 표시 |
| 터보 1경기 소요 (qaTurbo + ×3) | **57.7초** |
| fps | **60.1 ~ 60.4** (844×390) · **59.8** (844×360) |
| 콘솔/페이지 오류 | `window.__DS_ERRS` **0** · pageerror **0** · HTTP 4xx/5xx **0** · 콘솔 error **0** |
| 초상화 토큰 | 피치 22명 **`portraitsReady 22 / portraitsTotal 22`** — **5회 연속 22/22**(중복 얼굴 정리 `faceDupes` 0~1명) |
| 상세창 초상화 | `assets/portraits/pNNN.png` **naturalWidth 400** 로드, 404 0 |
| 세로 회전 안내 (390×844) | `#rotate` `display:flex` / `opacity:1` |
| 커스텀 전술 엔진 반영 | 라인100→`lineY.home 66.7` / 라인0→**80.7** · 압박100→`press.home 99.8` / 0→**81.8** · `line_changed/press_changed/lineY_changed` 모두 true |
| 코치마크 | 열림·`paused true` → 4단계 → 완료 시 `tut.done true`·오버레이 닫힘·`paused false`·**2번째 경기 `open:false`** |
| 팀 분위기 | 사기74+3연패 뒤 2연승 → `상승세 80`, 결정력 **×1.024**, formFactor 1.072 |
| 옛 v37 세이브 로드 | `ctac {50,50,50}` · `tut.done true` · `form []` · `dev/expTotal` 보정 · 오류 0 |
| 오프사이드 재현 (`M.debugOffside('home')`) | `type indirect` (v33 수정 유지) |
| v35 사이드 AI 계측 | 레인 **L23.8 / C52.5 / R23.7%** · 전환 패스 24 · 대각 35 · 크로스 3:1 · 컷백 1 · 측면 진입 3:2 |
| 밸런스 샘플 3경기 | **5골 · 0:0 0회** (2:1, 1:1, 0:1) |
| **라이브 90분 완주** (`?v=38&b=37`, 844×390) | **완주** — `clock 90`·`matchPhase ended`·`running false`, **fps 60.1**, 토큰 **22/22**, `__DS_ERRS` 0·콘솔 0·404 0 (`preview/v38/v38-live-result.png`) |
| 라이브 코치마크 | 새 세이브 첫 공식전에서 열림·`paused true` → 4단계 넘겨 `tut.done true` |
| 라이브 상세창 · 비교 카드 | 초상화 `naturalWidth 400` · 잠재 게이지 표시 · 이적시장 비교 **6행** (`v38-live-detail.png` · `v38-live-market.png`) |
| 라이브 자산 | `js/match.js?v=38&b=37`·`game.js`·`data.js`·`css/style.css` **200** · `assets/portraits/p01.png`·`p250.png`·`portraits/head/p500.png` **200** · 배포 반영 폴링 10.6초 |

검증 스크립트:
- `python3 scripts/v38_regress.py [출력폴더] [all|844x390|844x360|390x844]` — **v37 정식 하네스(`v37_full.py`)를 v38용으로 확장**. 새 세이브에서 `S.tut.done=true`(복귀 유저)로 세팅한 뒤 844×390·844×360 90분 완주와 390×844 회전을 확인한다.
- `python3 scripts/v38_full.py [출력폴더] [all|844x390|rotate|oldsave]` — 코치마크·전술 계수·90분 완주·회전·옛 세이브
- `python3 scripts/v38_smoke.py [출력폴더]` — 상세창(마이팀·클럽·이적시장 비교)·전술 저장·분위기 카드
- `python3 scripts/v38_balance.py` — 3경기 밸런스 샘플
- `python3 scripts/v38_visual.py [출력폴더]` — aside·상세 하단·비교 카드 캡처
- (환경 메모) 이 워크스페이스는 `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/pw-browsers` + `LD_LIBRARY_PATH=/workspace/.cache/syslibs/usr/lib/x86_64-linux-gnu` 가 필요하다. 로컬 체크아웃은 sparse 라 `icons/` 가 없어 아이콘 404가 찍힌다(라이브에는 있음).

스크린샷: `preview/v38/` — `v38-live-match.png` · `v38-live-tutorial.png` · `v38-live-result.png` · `v38-live-detail.png` · `v38-live-market.png` · `v38-player-detail-844x390.png` · `v38-market-compare2-844x390.png` · `v38-squad-aside-844x390.png` · `v38-tutorial-1/2/4-844x390.png` · `v38-result-844x390.png` · `v38-rotate-390x844.png` · `v38-club-detail-844x390.png` · `v38-squad-844x390.png` · `v38-oldsave-844x390.png`

---

## 4. 다음 작업 대기 목록

1. **폰 실기 피드백** — 390×844 마이팀 조작감, 상세창 스크롤 길이(현재 시트 본문 1,142px), 코치마크 카드 위치.
2. **커스텀 전술 프리셋** — 지금은 3축 5단계뿐. 감독 철학·포메이션별 추천 프리셋 저장(예: 하이프레스/로우블록)을 붙이면 UX가 좋아진다.
3. **성향 세부화** — 현재 4종 고정. 성향별 경기 후 변화(연패 시 승부욕 하락 등)나 라커룸 이벤트는 아직 없다.
4. **0:0 비율·득점 밸런스** — 이번 샘플은 3경기 5골. 표본을 늘려 0:0 비율(목표 10~14%)을 재확인.
5. **커리어리그 — `js/pvp.js` 확장** (v24부터 이월된 항목).
6. 열려 있는 작은 선택(사용자 미답): v24 자금 여유·잠재 상한 초과 성장 제한, v26c 최고 등급 표기(`레전드`/`전설`).

---

## 5. 주요 파일 맵

| 경로 | 역할 | 크기(줄) |
| --- | --- | --- |
| `index.html` | 셸 — 5탭·회전 안내·스크립트 로드(`?v=38&b=37`) | 80 |
| `js/match.js` | **경기 엔진 전체** — 시뮬레이션 + v30 렌더 + HUD + QA 훅(`M.probe`·`M.v33`·`M.v35`·**`M.v38`**·`M.qaTurbo`·`M.setCustomTactics`) | ~8,990 |
| `js/data.js` | 선수 500·감독 50·리그·전술 카드 12·초상화 `DS.Art`·잠재력 상한·**`DS.LOCK_FX`/`trainMultOf`/`teamMood`/`potPct`** | ~3,990 |
| `js/game.js` | 화면·라우팅 — **`playerModal`(상세창)** · **`ctacHTML`** · **`moodHTML`/`rosterHTML`** · **`TUT_STEPS`/`tutOpen`** · 결과서·세이브 | ~5,700 |
| `js/pvp.js` · `js/bgm.js` | 비동기 PvP / 테마 BGM | 687 / 675 |
| `assets/portraits/pNNN.png` | 선수 초상화 **500장**(카드·상세창) | 78MB |
| `assets/portraits/head/pNNN.png` | 피치 원형 토큰용 두상 **500장** | 24MB |
| `css/style.css` | HUD·모달·회전 안내 + **v38 상세/전술/분위기/코치마크 블록** | ~2,560 |
| `sw.js` | 서비스워커 — 캐시 **`dot-soccer-v38-20261128`**, 네트워크 우선 | 44 |
| `scripts/v38_*.py` | v38 검증 하네스 4종 | — |
| `preview/v38/` | v38 스크린샷 | — |

---

## 6. 손대지 말 것 / 주의

- **`assets/portraits/`·`assets/portraits/head/` 삭제 금지** — 500명 얼굴이 전부 여기에 있다.
- **`js/data.js`의 `potOf/rawRating/growAttr`** — v33 잠재력 상한. `ratingOf()`는 `min(rawRating, pot)`이어야 한다. `growAttr` 의 **`p.dev` 누적**은 상세창 성장 이력의 근거이므로 지우지 말 것.
- **`js/match.js`에 `DS.Q`/`DS.PIXEL`/`DS.CHIBI` 참조를 다시 넣지 말 것** — v37에서 삭제된 모듈이다(참조하면 즉시 ReferenceError).
- **세이브 키(`dot-soccer-v3-save`)·구단 코드(`?vs=`)·저장소 이름(`Dot-soccer`)** 은 바꾸지 않는다. 새 필드(`ctac`/`tut`/`form`/`dev`/`expTotal`)는 **로드 시 기본값 보정**을 반드시 함께 넣는다.
- **v35 사이드 AI**(`centerCrowd`·`wideOutlet`·컷백/크로스)는 v38 커스텀 전술의 **가산 계수 위에서** 돌아간다. `ctacWing()` 을 곱셈으로 바꾸면 기본 흐름이 죽는다.
- 버전을 올릴 때 `?v=` 를 `index.html`·`manifest.webmanifest`·`sw.js`·`README.md` 에 맞추고 `sw.js` 캐시 이름도 함께 올린다.
