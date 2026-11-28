# 인수인계 — 《꼬마일레븐 FC》 (`Dot-soccer`)

> 기준 **v37 (`?v=37&b=36`) — 도트·치비 제거, 원형 초상화 복원** · 2026-11-28
> 라이브 **`https://hojin8811-dev.github.io/Dot-soccer/?v=37&b=36`**
> 기능 커밋 **`abe6489`** — `feat(v37): 도트·치비·쿼터뷰 제거, v30 원형 초상화 토큰 복원 (v33 버그·공 물리·밸런스 + v35 양 사이드 AI 100% 유지) (b=36)`
> 문서 갱신 커밋: `47551e3`(인수인계서 전면 갱신) · `3aecb8e`(라이브 90분·fps·오프사이드 검증 기록과 스샷). 그 뒤 최신 커밋은 `git log -1 --oneline`으로 확인하세요. 버전별 상세 이력은 `README.md`(맨 위가 최신 v37), 화면 캡처는 `preview/v37/`에 있습니다.

---

## 1. 한눈에

| 항목 | 내용 |
| --- | --- |
| 무엇 | **꼬마일레븐 FC** — **100% 오리지널** 가상 선수·감독으로 즐기는 현대 전술 축구 구단 경영 RPG. 유저는 **전술 카드·교체·터치라인 지시로 개입**한다. |
| 이번 버전의 한 줄 | **"캐릭터만 지우고 어제 원 초상화로"** — 사용자가 요청한 대로 v31~v36b의 **도트/치비/쿼터뷰 캐릭터를 전부 걷어내고**, v30의 **원형 초상화 토큰 + 2D 중계 구장**으로 되돌렸다. 전술·AI·버그 수정은 하나도 건드리지 않았다. |
| 화면 | 하단 5탭 — 공식전(리그) / S매치 / 마이팀 / 클럽 / 이적시장. **844×390 가로** 기준 설계(844×360 지원), **완전 가로 전용** — 세로(폭 900 이하)에서는 전체 화면 회전 안내(`#rotate`)가 뜨고 가로로 돌리면 즉시 걷힌다. |
| 기술 | **정적 HTML/CSS/JS만**(빌드 없음). Canvas 2D, 60Hz 시뮬레이션 + 서브프레임 보간. 선수는 **500장 초상화의 두상 크롭을 원형으로 클립해 그리는 토큰**(이미지 파일 `assets/portraits/head/pNNN.png`). |
| 저장소·배포 | `https://github.com/hojin8811-dev/Dot-soccer` · 브랜치 `main` = GitHub Pages 루트. push하면 자동 반영, CI 없음 (저장소 이름·URL은 옛 이름 `Dot-soccer` 그대로 — 링크·세이브 보호) |
| 라이브 | `https://hojin8811-dev.github.io/Dot-soccer/?v=37&b=36` |
| 규모 | 선수 초상 **500종 + 두상 500장** · 감독 50명 · 1·2부 리그(2부 20팀 38라운드) · 유소년 아카데미 + 2군 리그 · 비동기 PvP(구단 코드 `?vs=`) · 전술 카드 12종 · **1군 정원 18명(선발 11+벤치 7)** |

---

## 2. v37 구조 — 지운 것 / 되돌린 것 / 그대로 살린 것

### 2-1. 제거 (도트·치비·쿼터뷰 계열만)

| 삭제 파일 | 내용 |
| --- | --- |
| `js/pixel_player.js` | v35~v36b의 36×36 코드 도트 및 스프라이트 아틀라스(`DS.PIXEL`) 렌더러 |
| `js/quarter.js` | v32~v36b의 쿼터뷰 3D 카메라(`DS.Q`) + 관중석 9단×132명 |
| `assets/sprites/` | `players_home.png`·`players_away.png`·`gk_ref.png`·`atlas.json` (스프라이트 아틀라스 431KB) |
| `scripts/sprite_extract.py` | 스프라이트 시트 누끼·아틀라스 추출 파이프라인 |
| `index.html`·`sw.js` | 위 두 JS의 `<script>` 태그와 프리캐시 목록 제거 |

> **`assets/portraits/`(원본 500장)와 `assets/portraits/head/`(두상 500장)는 절대 삭제 금지.** 이번에도 그대로 보존했다(원본 78MB · 두상 24MB).

### 2-2. 복원 — `v30`(`66b4e40`)의 렌더 스택 그대로

- `js/match.js`를 **v30 판본(8,526줄)으로 되돌린 뒤**, v33·v35의 **시뮬레이션 diff만 이식**했다(아래 2-4). 렌더 관련 hunk는 v30 것을 유지.
- **원형 초상화 토큰** — `drawPlayer()`가 팀 색 원판 위에 그 선수 고유 두상을 원형 클립으로 얹고, 팀 링(홈 파랑 #2f8dff / 원정 빨강 #ff4b4b)·GK 금색 링·공 소유자 펄스 링·액션 탄·스턴 별·세리머니 오라를 그린다. 두상의 얼굴 중심은 알파로 자동 크롭(`headFocusX`).
- **2D 사다리꼴 원근 구장** — `scr(wx, wy)` + `PROJ`/`field` 기반. 배경은 `assets/stadium-pitch.png`.
- **v30 확정 카메라** — 공 추적 방송 카메라, 기본 **1.15×(CAM_Z0)**, 찬스(박스 25m·슛·세트피스) **1.19~1.26×** 줌인, 화면 밖 여백이 드러나지 않게 클램프. 전체뷰(`?view=full`) 토글 유지.
- **선수 원 13% 축소(방법 A)** — `TOKEN_SCALE_BROADCAST = 0.87`, 전체뷰 `1.0`. 줌 1.15와 곱해져 화면상 얼굴 크기는 v29와 같고 선수 간 간격만 넓다.
- **골 연출** — 골망 출렁임 체류(`drawNetRipple`)·**짧은 슬로우 모션**(`slowmo`)·골 임팩트·암전 전환 유지.
- **가로 전용 회전 안내** — `#rotate` 오버레이(390×844에서 `display:flex/opacity:1` 확인).
- **팀 색 정합** — HUD(`css/style.css` `--team-home/--team-away`)와 xG맵 폴백을 다시 **홈 파랑 · 원정 빨강**으로 되돌렸다(v36의 홈 빨강과 어긋나지 않게 한 세트).
- 포지셔닝·패스 라인·약측 격리·세트피스 대형·침투 화살표·압박 존 등 v25~v30 오버레이 전부 그대로.

### 2-3. 그대로 살린 전술·로직 (핵심)

- **v33 (`3f57c00`) 전부**
  - **전력차 밸런스**: 선발 11명 평균 OVR 차 `powerGap` → `duelK()`(경합·탈취), `cardK()`(카드·감독 보정 무게), `qualityK()`(슛·헤더·FK xG 상대 수준).
  - **오프사이드 버그**: 반칙 팀이 공에서 9.4 이상 물러남(`retreatFromBall`), 간접 프리킥 키커를 `pk` 대신 **프리킥 능력치**로 선정하고 `sp.taker`로 고정.
  - **공 물리**: 땅볼 패스는 **직선·등감속**(휘지 않음), 띄운 공만 포물선 + **1~2회 바운드**(`ball.bounces`), 루즈볼 잔디 마찰, 드리블 리듬(발앞 톡톡), 잔상 z 저장.
  - **잠재력 상한 / 1군 18명**: `js/data.js`의 `potOf()`·`rawRating()`·`growAttr()`·`atPotCap()` (v33 이후 data.js 변경 없음 — HEAD 그대로).
- **v35 (`5f1aa3b`) 양 사이드 전개 AI**
  - `centerCrowd()`·`wideOutlet()` — 중앙 밀집 시 폭으로 벌리는 대각·횡 전환 패스(`decide()` 1.8단계).
  - 측면 크로스·컷백 조건 확대(`deepWide`, `deepFlank`, `cutF`), 전환 패스 문턱 완화.
  - 계측 `M.v35()`(레인 분포·윙 폭·전환/크로스/컷백/측면 진입) 유지.

### 2-4. 이식 방식 (다음 사람이 같은 일을 할 때)

1. `git show 66b4e40:js/match.js`로 **v30 판본을 베이스**로 삼는다.
2. `git diff 3f57c00^ 3f57c00 -- js/match.js`(v33), `git diff 3f57c00 5f1aa3b -- js/match.js`(v35)를 `git apply --reject`로 얹고, **렌더 hunk만 버린다**:
   - v33: `drawShotTrail`(QV 사용 판본) → v30의 `scr+depthPx` 판본 유지. `gait deadzone`도 렌더 사유라 제외(v30엔 `gaitV` 자체가 없음).
   - v35: `PX`/`CAM_D`/`chibiInit`/`drawPlayer`/주심·감독/픽셀 공 렌더/`updateReferee`·`drawReferee` hunk 제외. 남은 `QV.project` 참조는 0건이어야 한다.
3. `js/data.js`·`js/game.js`·`js/pvp.js`·`js/bgm.js`는 HEAD 그대로 쓴다(v33 이후 실질 변경 없음 — game.js는 팀 색 폴백 1줄만 되돌림).
4. `index.html`에서 `quarter.js`·`pixel_player.js` 태그 제거, 캐시 버스터 `?v=37&b=36`, `sw.js` 캐시명 `dot-soccer-v37-20261128`.

---

## 3. 실제로 확인한 값 (2026-11-28, 로컬 `python3 -m http.server` + Playwright Chromium 844×390)

| 항목 | 결과 |
| --- | --- |
| 공식전 90분 완주 (844×390) | **완주** — 최종 `clock 90`, `phase ended`, 스코어 1:0, 선수 22명 |
| 공식전 90분 완주 (844×360) | **완주** — 0:0 |
| fps | **60.5** (844×390) · **59.8** (844×360) |
| 콘솔/페이지 오류 | `window.__DS_ERRS` **0** · pageerror 0 · HTTP 4xx/5xx **0** |
| 초상화 토큰 | 피치 22명 **`portraitsReady 22 / portraitsTotal 22`**, 원본 500장 + 두상 500장 파일 존재 |
| 세로 회전 안내 (390×844) | `#rotate` `display:flex` / `opacity:1` |
| 터보 1경기(그리기 생략, `M.qaTurbo(true)`) | 90분 **58.4초**, 오프사이드 **3:2**, v35 레인 **L25.2 / C48.2 / R26.6%**, 전환 패스 **53**, 대각 **42**, 크로스 **3**, 컷백 **2**, 측면 진입 **15** — 사이드 AI·오프사이드 수정이 실제로 돌아간다 |
| **라이브 90분 완주** (844×390, `?v=37&b=36`) | **완주** — `clock 90`·`phase ended`, 0:0, **fps 59.8**, `__DS_ERRS` 0, 콘솔/404 0, 토큰 **22/22** (`preview/v37/v37-live-result.png`) |
| 라이브 자산 | `js/match.js?v=37&b=36` **200**(410,218B) · `js/quarter.js`·`js/pixel_player.js` **404**(삭제 확인) · 두상 `p01/p250/p500` **200** |
| 중계/전체뷰 (viewState 실측) | 중계 `zoom 1.17(목표 1.15~1.22)`·`tokenScale 0.87` → 전체뷰 `zoom 1`·`tokenScale 1` 토글 정상 |
| 오프사이드 재현 (`M.debugOffside('home')`) | `type indirect`·키커 `고태양`(away)·공격팀 최소 이탈 17.9 — 반칙팀이 공에서 물러난 뒤 간접 프리킥(`preview/v37/v37-offside.png`) |
| 결과서 | xG·점유율·MVP·평점 정상 표시(`preview/v37/v37-result-844x390.png`) |

검증 스크립트: `python3 scripts/v37_full.py [출력폴더] [all|844x390|844x360|390x844]` (포트 8127 로컬 서버를 스스로 띄웠다 내린다)

검증 스크립트(라이브): `python3 scripts/v37_live.py [출력폴더]` — 배포 반영을 폴링한 뒤 라이브에서 90분 완주·fps·오류·스샷을 남긴다.

스크린샷: `preview/v37/v37-match.png`(라이브 경기) · `v37-closeup.png`(토큰 클로즈업) · `v37-fullview.png`(전체뷰) · `v37-offside.png`(오프사이드 간접 FK) · `v37-half-844x390.png` · `v37-result-844x390.png` · `v37-live-result.png` · `v37-rotate-390x844.png` · `v37-after-844x390.png`

---

## 4. 다음 작업 대기 목록 (2단계)

> 캐릭터를 되돌렸으니 이제 **경영·육성 화면**을 채우는 단계. 새 화면은 **시안 먼저 → 컨펌 → 구현** 순서(사용자 지시).

1. **선수 상세창 (클럽 · 마이팀 · 이적시장)**
   - 500장 초상화를 크게 + 능력치 3종(스피드/공격/수비) + 세트 특기 + **잠재력 게이지**(`rawRating()` vs `potOf()` — v33 상한이 눈에 보이게)
   - 성장 이력(레벨·EXP)과 `atPotCap()` 도달 표시, 이적시장에서는 비교 카드
2. **라커룸 성향 효과**
   - 선수 성향 태그(승부욕·조직력·자유분방 등)가 경기 AI(패스 성향·압박)와 팀 분위기(연승/연패)에 반영되게. 현재는 감독 특기·전술 카드만 반영.
3. **추가 전술**
   - 기존 전술 카드 12종(`DS.CARDS`, `js/data.js` 744행) 위에 **커스텀 지시**(라인 높이·압박 강도·측면 비중 슬라이더) 추가. `match.js`의 `decide()`·`passBall()`·`press` 계수가 이미 훅을 갖고 있다.
4. **초보자 튜토리얼**
   - 첫 공식전 3분 코치마크(패스 방향·전술 카드·교체·배속). `#m-overlay`/`#modal` 재사용.
5. **추후 커리어리그 — `js/pvp.js` 확장**
   - 현재는 구단 코드(`?vs=`) 비동기 PvP. 이를 시즌 커리어(리그 일정·이적·성장 이월)로 확장하는 계획. `pvp.js`는 경기 밖에서 `DS.Match`를 호출해 결과만 받는 구조라 화면 작업과 분리 가능.

---

## 5. 주요 파일 맵

| 경로 | 역할 | 크기(줄/바이트) |
| --- | --- | --- |
| `index.html` | 셸 — 5탭·회전 안내·스크립트 로드(`?v=37&b=36`). **`quarter.js`·`pixel_player.js` 태그 없음** | 4.4KB |
| `js/match.js` | **경기 엔진 전체** — 시뮬레이션(AI·패스·슛·세트피스·오프사이드) + v30 렌더(원형 토큰·구장·카메라·골 연출) + HUD·전술 오버레이 + QA 훅(`M.probe`·`M.v33`·`M.v35`·`M.qaTurbo`) | 8,881줄 / 410KB |
| `js/data.js` | 선수 500명·감독 50명·리그·전술 카드 12종(`DS.CARDS`)·초상화 아트(`DS.Art`)·**잠재력 상한(`potOf`/`rawRating`/`growAttr`/`atPotCap`)**·1군 18명 | 3,916줄 / 207KB |
| `js/game.js` | 화면·라우팅 — 홈/공식전/S매치/마이팀/클럽/이적시장, 결과서·xG맵·세이브 | 5,314줄 / 284KB |
| `js/tactics.js` | **없음** — 전술 정의는 `js/data.js`(`DS.CARDS`) + `js/match.js`(`CARD_LIST`·`decide()`·`passBall()`·`buffOf`)에 있다 |
| `js/pvp.js` | 비동기 PvP(구단 코드 `?vs=`) — 커리어리그 확장 대상 | 31KB |
| `js/bgm.js` | 테마 BGM·효과음 | 31KB |
| `assets/portraits/pNNN.png` | 선수 초상화 **500장**(카드·결과서) | 78MB |
| `assets/portraits/head/pNNN.png` | **피치 원형 토큰용 두상 500장** (v37의 얼굴) | 24MB |
| `assets/stadium-pitch.png` | 경기장 배경(잔디·관중석·광고판) | 288KB |
| `assets/managers/`, `assets/tactics/` | 감독 초상·전술 카드 아이콘 | 11MB / 8KB |
| `css/style.css` | HUD·모달·회전 안내. 팀 색 `--team-home #2f8dff` / `--team-away #ff4b4b` | — |
| `sw.js` | 서비스워커 — 캐시 `dot-soccer-v37-20261128`, 네트워크 우선 | — |
| `scripts/v37_full.py` | v37 검증 하네스(로컬 90분 완주·fps·오류·스샷) | — |
| `preview/v37/` | v37 검증 스크린샷 | — |

---

## 6. 손대지 말 것 / 주의

- **`assets/portraits/`·`assets/portraits/head/` 삭제 금지** — 500명 얼굴이 전부 여기에 있다.
- **`js/data.js`의 `potOf/rawRating/growAttr`** — v33 잠재력 상한. `ratingOf()`는 `min(rawRating, pot)`이어야 한다(표시 OVR이 상한을 넘으면 성장이 무한해진다).
- **`js/match.js`에 `DS.Q`/`DS.PIXEL`/`DS.CHIBI` 참조를 다시 넣지 말 것** — v37에는 그 모듈이 없다(참조하면 즉시 ReferenceError).
- 세이브 키·구단 코드·저장소 이름(`Dot-soccer`)은 바꾸지 않는다(기존 유저 링크·세이브 보호).
