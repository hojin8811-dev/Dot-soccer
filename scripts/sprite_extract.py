#!/usr/bin/env python3
"""v36b — 4프레임 달리기 시트 3장 + 기존 4×4 시트 4장 → 게임 아틀라스.

· 달리기(run0~run3)는 새 시트 3장(각 4행×4열)에서 뽑는다.
  포니테일(A r1)·머리띠(A r3)는 4열이 돌아섬/만세라 run3 = run1(핑퐁).
· 킥·태클·뒷모습·앞모습·세리머니는 v36과 같은 기존 4장에서 그대로 뽑는다.
· 순백 배경을 외곽 flood-fill로 투명화 (내부 흰 반바지·양말·눈 흰자는 보존)
· 캐릭터와 붙지 않은 부속물(킥 옆 축구공·모션선)을 연결 요소 분리로 제거
· 발밑에 구워진 회색 접지 그림자를 색 조건으로 제거(우리 그림자를 따로 그린다)
· 캐릭터별 기준 배율(달리기 프레임 높이)로 정규화 → 머리 중심 x · 발바닥 바닥선 고정 앵커
· 원정(로열 블루) = **덩어리 단위 키트 판정**:
    빨강 성분의 중앙 색조 ≤4° · 평균 채도 ≥0.80 · 평균 밝기 ≥0.30 인 덩어리만 유니폼으로 보고
    그 덩어리 전체의 색조만 220°로 옮긴다.
    → 입 안쪽(혀·볼: 색조 6~9°)·주황/갈색 머리카락(색조 6~9°)·피부 홍조는 채도·색조에서 걸러져
      파란이 절대 묻지 않는다. (v36의 얼굴 마스크 방식은 얼굴 검출이 틀리면 뚫렸다)

출력: assets/sprites/players_home.png · players_away.png · gk_ref.png
      assets/sprites/atlas.json   preview/v36-raw/*_3x.png (검수용)
"""
import json
import os

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATT = '/workspace/attachments/2026-11-28'

# ── 새 달리기 시트 3장 (4행 × 4열, run0~run3) ────────────────────────────────
RUN_SHEETS = [
    '1000014216-279aff851e0a4c27aac82d83cbdc251d.jpg',   # A: 갈색 스파이키·금발 포니·안경·머리띠
    '1000014217-5b5cd708aabc4b68b06c3b67d8928a15.jpg',   # B: 은발·선글라스·아프로·네이비 장발
    '1000014218-3029b72c74e3400393ced0173ca6b962.jpg',   # C: 모호크·주근깨 적발·금발 커튼·파스텔블루
]
# ── 기존 시트 4장 (킥 c2 · 개성 c3) ─────────────────────────────────────────
OLD_SHEETS = [
    '1000014204-206e3e511f044f34a810b59da939dc1b.jpg',
    '1000014205-c5cc4f465a4d4141bf678f339f3b15f0.jpg',
    '1000014206-8db069e89678466fb2013d3a2e35475a.jpg',
    '1000014207-f8caf749f77f441c8a6c1be2eabccd02.jpg',
]

OUT_DIR = os.path.join(ROOT, 'assets', 'sprites')
DBG_DIR = os.path.join(ROOT, 'preview', 'v36-raw')

WHITE_T = 236
MIN_COMP = 40

CW, CH = 284, 252
FEET_Y = 246
CX = CW // 2
TARGET_H = 232
OUT_SCALE = 0.36          # v36b — 화면상 선수 ~40px에 맞춘 0.72배 축소(0.5 → 0.36)

# 필드 선수 12종
#   key, 달리기시트, 달리기행, 옛시트, 옛행, 개성프레임, 핑퐁(run3=run1)
PLAYERS = [
    ('spiky_brown',      0, 0, 0, 0, 'tackle',    False),
    ('ponytail_blonde',  0, 1, 0, 1, 'up',        True),
    ('glasses_black',    0, 2, 0, 2, 'down',      False),
    ('headband_brown',   0, 3, 0, 3, 'celebrate', True),
    ('spiky_silver',     1, 0, 1, 0, 'up',        False),
    ('sunglasses_black', 1, 1, 1, 1, 'down',      False),
    ('afro_dark',        1, 2, 2, 0, 'tackle',    False),
    ('navy_long',        1, 3, 2, 1, 'up',        False),
    ('mohawk_brown',     2, 0, 2, 2, 'down',      False),
    ('ginger_freckles',  2, 1, 2, 3, 'celebrate', False),
    ('blond_curtain',    2, 2, 3, 0, 'up',        False),
    ('blue_spiky',       2, 3, 3, 1, 'down',      False),
]
# GK 2종 · 주심 · 감독 (기존 시트 그대로, 4열)
GK_ROWS = [
    ('gk_green',  1, 2, ['idle', 'run1', 'dive']),
    ('gk_yellow', 3, 2, ['idle', 'run1', 'dive']),
    ('ref',       1, 3, ['idle', 'run1', 'run2', 'whistle']),
    ('coach',     3, 3, ['idle', 'point', 'shout', 'cheer']),
]
N_PLAYER = len(PLAYERS)


def cut_cell(img, r, c, ncol=4):
    h, w = img.shape[:2]
    ch, cw = h / 4.0, w / float(ncol)
    y0, y1 = int(round(r * ch)), int(round((r + 1) * ch))
    x0, x1 = int(round(c * cw)), int(round((c + 1) * cw))
    cell = img[y0:y1, x0:x1]
    rgb = cell[:, :, :3]
    H, W = rgb.shape[:2]

    mn = rgb.min(axis=2)
    light = (mn >= WHITE_T).astype(np.uint8)
    ff = light.copy()
    mask = np.zeros((H + 2, W + 2), np.uint8)
    for x in range(W):
        if ff[0, x] == 1:
            cv2.floodFill(ff, mask, (int(x), 0), 2)
        if ff[H - 1, x] == 1:
            cv2.floodFill(ff, mask, (int(x), H - 1), 2)
    for y in range(H):
        if ff[y, 0] == 1:
            cv2.floodFill(ff, mask, (0, int(y)), 2)
        if ff[y, W - 1] == 1:
            cv2.floodFill(ff, mask, (W - 1, int(y)), 2)
    alpha = np.where(ff == 2, 0, 255).astype(np.uint8)

    for _ in range(2):
        edge = cv2.dilate((alpha == 0).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        alpha[edge & (mn >= WHITE_T - 26)] = 0

    n, lab, stats, _ = cv2.connectedComponentsWithStats((alpha > 0).astype(np.uint8), 8)
    if n <= 1:
        return rgb, alpha, []
    order = sorted([(stats[i, 4], i) for i in range(1, n)], reverse=True)
    keep = order[0][1]
    dropped = [{'area': int(a), 'bbox': [int(stats[i, 0]), int(stats[i, 1]), int(stats[i, 2]), int(stats[i, 3])]}
               for a, i in order[1:] if a >= MIN_COMP]
    alpha[lab != keep] = 0
    return rgb, alpha, dropped


def strip_ground_shadow(rgb, alpha):
    H, W = alpha.shape
    ys, xs = np.where(alpha > 0)
    if len(ys) == 0:
        return alpha
    top, bot = ys.min(), ys.max()
    hh = bot - top + 1
    mx = rgb.max(axis=2).astype(np.float32)
    mnv = rgb.min(axis=2).astype(np.float32)
    sat = (mx - mnv) / np.maximum(mx, 1.0)
    v = mx / 255.0
    band = np.zeros((H, W), bool)
    band[int(top + hh * 0.78):bot + 1, :] = True
    grey = band & (sat < 0.10) & (v > 0.45) & (v < 0.96) & (alpha > 0)
    n, lab, st, _ = cv2.connectedComponentsWithStats(grey.astype(np.uint8), 8)
    for i in range(1, n):
        a, x, y, w, h = int(st[i, 4]), int(st[i, 0]), int(st[i, 1]), int(st[i, 2]), int(st[i, 3])
        if a >= 150 and w >= 1.9 * max(1, h) and (y + h) >= bot - int(hh * 0.09):
            alpha[lab == i] = 0
    return alpha


def refinalize(rgb, alpha):
    """그림자·부속물을 지운 뒤 새로 열린 흰 배경(다리 사이 등)을 다시 투명화."""
    H, W = alpha.shape
    mn = rgb.min(axis=2)
    free = ((alpha == 0) | (mn >= WHITE_T - 8)).astype(np.uint8)
    ff = free.copy()
    mask = np.zeros((H + 2, W + 2), np.uint8)
    for x in range(W):
        for y in (0, H - 1):
            if ff[y, x] == 1:
                cv2.floodFill(ff, mask, (int(x), int(y)), 2)
    for y in range(H):
        for x in (0, W - 1):
            if ff[y, x] == 1:
                cv2.floodFill(ff, mask, (int(x), int(y)), 2)
    out = alpha.copy()
    out[(ff == 2) & (alpha > 0) & (mn >= WHITE_T - 8)] = 0
    return out


def crop(rgb, alpha):
    ys, xs = np.where(alpha > 0)
    return rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1], alpha[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def head_cx(alpha):
    h, w = alpha.shape
    band = alpha[:max(8, int(h * 0.34))] > 0
    ys, xs = np.where(band)
    return float(np.median(xs)) if len(xs) else w / 2.0


H_BLUE = 110.0            # OpenCV H — 110 = 220° 로열블루


def skin_solid(rgb, alpha):
    """피부 덩어리 + 그 안에 둘러싸인 구멍(입 안쪽).

    입은 피부에 완전히 둘러싸여 있어 '피부분 + 채워진 구멍'에 들어간다.
    반면 유니폼·머리카락·머리띠는 외곽선→투명 배경으로 이어져 구멍이 되지 않는다.
    (v36의 '가장 큰 살색 덩어리' 방식은 팔·금발 머리카락이 얼굴로 잡혀 입이 뚫렸다)
    """
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    h = hsv[:, :, 0].astype(np.int32)
    s = hsv[:, :, 1] / 255.0
    v = hsv[:, :, 2] / 255.0
    sk = ((h >= 3) & (h <= 30) & (s >= 0.10) & (s <= 0.75) & (v > 0.42) & (alpha > 0)).astype(np.uint8)
    H, W = sk.shape
    ff = (sk == 0).astype(np.uint8)
    mask = np.zeros((H + 2, W + 2), np.uint8)
    for x in range(W):
        for y in (0, H - 1):
            if ff[y, x] == 1:
                cv2.floodFill(ff, mask, (int(x), int(y)), 2)
    for y in range(H):
        for x in (0, W - 1):
            if ff[y, x] == 1:
                cv2.floodFill(ff, mask, (int(x), int(y)), 2)
    holes = ((ff != 2) & (sk == 0) & (alpha > 0)).astype(np.uint8)
    holes = cv2.dilate(holes, np.ones((3, 3), np.uint8), iterations=1)
    solid = ((sk > 0) | (holes > 0)).astype(np.uint8)
    return cv2.dilate(solid, np.ones((3, 3), np.uint8), iterations=1) > 0


def recolor_away(rgb, alpha):
    """키트(진홍)만 로열블루로. 입 안쪽·볼·머리카락에는 절대 칠하지 않는다.

    v36은 '얼굴 피부 마스크'로 막았는데, 얼굴 검출이 틀리면(팔·금발이 가장 큰 살색
    덩어리) 혀와 주황 머리카락이 뚫렸다. v36b는 세 겹으로 막아 자세와 무관하게 동작한다:
      ① 색: 색조 ≤4.5°(또는 ≥176°) · 채도 ≥0.72 · 밝기 ≥0.30
         → 주황·갈색 머리카락(색조 6~14°)·볼홍조는 대부분 탈락
      ② 위치: 피부에 둘러싸인 곳(입 안쪽·혀) 제외 — `skin_solid()`
      ③ 형태: 5×5 여닫기(opening) + 120px 미만 잡음 제거 → 머리카락 경계에 붙은
         가는 붉은 결(주황 머리 v36b 실측 1,000~1,400px)과 JPEG 잔점이 사라지고,
         큰 덩어리(유니폼·머리띠·축구화)만 남는다. 마지막에 1px 되살려 테두리를 덮는다.
    런닝 4프레임·킥·태클·뒷모습·앞모습·세리머니 모두 같은 규칙으로 처리된다.
    """
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    h = hsv[:, :, 0].astype(np.int32)
    s = hsv[:, :, 1] / 255.0
    v = hsv[:, :, 2] / 255.0
    kit = (((h <= 4.5) | (h >= 176)) & (s >= 0.72) & (v >= 0.30) & (alpha > 0))
    solid = skin_solid(rgb, alpha)
    m = (kit & ~solid).astype(np.uint8)
    op = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(op, 8)
    big = np.zeros_like(op)
    picked = []
    for i in range(1, n):
        a = int(st[i, 4])
        picked.append({'area': a, 'y': round(int(st[i, 1]) / max(1.0, alpha.shape[0]), 2)})
        if a >= 120:
            big |= (lab == i).astype(np.uint8)
    reg = cv2.dilate(big, np.ones((3, 3), np.uint8), iterations=1) > 0
    keep = (m > 0) & reg
    # 작은 조각(소매 테두리·축구화 빨간 장식·엠블럼 주변) 되살리기 —
    # 아래쪽(무게중심 0.45H 이상)의 붉은 조각만. 머리카락은 위에 있어 해당 없다.
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(m, 8)
    for i in range(1, n2):
        ar = int(st2[i, 4])
        cy = (st2[i, 1] + st2[i, 3] / 2.0) / max(1.0, alpha.shape[0])
        if ar >= 40 and cy >= 0.45:
            keep |= (lab2 == i)
    if not keep.any():
        return rgb, picked
    out = hsv.copy()
    out[:, :, 0][keep] = H_BLUE
    ss = out[:, :, 1]
    ss[keep] = np.clip(ss[keep] * 0.86 + 42, 120, 248)
    vv = out[:, :, 2]
    vv[keep] = np.clip(vv[keep] * 1.06 + 6, 0, 255)
    picked.append({'blue': int(keep.sum()), 'raw': int(m.sum())})
    return cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_HSV2RGB), picked


def build():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(DBG_DIR, exist_ok=True)
    run_imgs = [np.array(Image.open(os.path.join(ATT, s)).convert('RGB')) for s in RUN_SHEETS]
    old_imgs = [np.array(Image.open(os.path.join(ATT, s)).convert('RGB')) for s in OLD_SHEETS]

    planes = {}          # (key, frame) → (rgb, alpha) 정규화 후
    meta = {}
    order = []

    def cell_of(img, r, c, ncol=4):
        rgb, alpha, dropped = cut_cell(img, r, c, ncol)
        alpha = strip_ground_shadow(rgb, alpha)
        alpha = refinalize(rgb, alpha)
        rgb, alpha = crop(rgb, alpha)
        return rgb, alpha, dropped

    # ── 필드 선수 12종 ────────────────────────────────────────────────
    for key, rs, rr, os_, orow, extra, ping in PLAYERS:
        runs = [cell_of(run_imgs[rs], rr, c) for c in range(4)]
        if ping:
            runs[3] = runs[1]                      # 4열이 못 쓰는 행은 핑퐁
        old_k = cell_of(old_imgs[os_], orow, 2)     # kick
        old_x = cell_of(old_imgs[os_], orow, 3)     # 개성(tackle/up/down/celebrate)
        old_run = cell_of(old_imgs[os_], orow, 0)   # 옛 기준 배율용 달리기

        h_run = float(runs[1][1].shape[0])
        h_old = float(old_run[1].shape[0])
        k_run = TARGET_H / h_run
        k_old = TARGET_H / h_old
        frames = [('run0', runs[0], k_run), ('run1', runs[1], k_run),
                  ('run2', runs[2], k_run), ('run3', runs[3], k_run),
                  ('kick', old_k, k_old), (extra, old_x, k_old)]
        meta[key] = {'kRun': round(k_run, 4), 'kOld': round(k_old, 4), 'frames': {}}
        order.append((key, [f[0] for f in frames]))
        for ci, (nm, cell, k) in enumerate(frames):
            rgb, alpha = cell[0], cell[1]
            hh, ww = alpha.shape
            nw, nh = max(1, int(round(ww * k))), max(1, int(round(hh * k)))
            r2 = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA)
            a2 = cv2.resize(alpha, (nw, nh), interpolation=cv2.INTER_AREA)
            a2[a2 < 12] = 0
            hx = head_cx(alpha) * k
            if nm in ('tackle', 'dive'):
                hx = ww * k / 2.0
            meta[key]['frames'][nm] = {'col': ci, 'w': nw, 'h': nh, 'hx': round(hx, 1)}
            planes[(key, nm)] = (r2, a2)
            if ci < 6:
                print('%-16s %-9s %4dx%-4d k=%.3f' % (key, nm, nw, nh, k))

    # ── GK 2종 · 주심 · 감독 (기존 4열 시트) ──────────────────────────
    gk_order = []
    for key, os_, orow, names in GK_ROWS:
        raw = [cell_of(old_imgs[os_], orow, c) for c in range(4)]
        k = TARGET_H / float(raw[1 if names[1] == 'run1' else 0][1].shape[0])
        meta[key] = {'kRun': round(k, 4), 'kOld': round(k, 4), 'frames': {}}
        gk_order.append((key, names))
        for ci, (nm, (rgb, alpha, _drop)) in enumerate(zip(names, raw)):
            hh, ww = alpha.shape
            nw, nh = max(1, int(round(ww * k))), max(1, int(round(hh * k)))
            r2 = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA)
            a2 = cv2.resize(alpha, (nw, nh), interpolation=cv2.INTER_AREA)
            a2[a2 < 12] = 0
            hx = head_cx(alpha) * k
            if nm == 'dive':
                hx = ww * k / 2.0
            meta[key]['frames'][nm] = {'col': ci, 'w': nw, 'h': nh, 'hx': round(hx, 1)}
            planes[(key, nm)] = (r2, a2)
            print('%-16s %-9s %4dx%-4d k=%.3f' % (key, nm, nw, nh, k))

    def place(rgb, alpha, hx):
        cv = np.zeros((CH, CW, 4), np.uint8)
        h, w = alpha.shape
        x = int(round(CX - hx))
        y = FEET_Y - h
        x = max(0, min(CW - w, x)) if w <= CW else 0
        y = max(0, min(CH - h, y)) if h <= CH else 0
        cv[y:y + h, x:x + w, :3] = rgb[:CH - y, :CW - x]
        cv[y:y + h, x:x + w, 3] = alpha[:CH - y, :CW - x]
        return cv

    report = {}

    def sheet_of(rows, away=False):
        ncol = max(len(f) for _, f in rows)
        arr = np.zeros((CH * len(rows), CW * ncol, 4), np.uint8)
        for ri, (key, names) in enumerate(rows):
            for nm in names:
                rgb2, a2 = planes[(key, nm)]
                if away and key in [p[0] for p in PLAYERS]:
                    rgb2, picked = recolor_away(rgb2, a2)
                    report.setdefault(key, {})[nm] = picked
                f = meta[key]['frames'][nm]
                arr[ri * CH:(ri + 1) * CH, f['col'] * CW:(f['col'] + 1) * CW] = place(rgb2, a2, f['hx'])
        return arr

    def save(arr, name):
        im = Image.fromarray(arr, 'RGBA')
        im = im.resize((int(round(im.width * OUT_SCALE)), int(round(im.height * OUT_SCALE))), Image.LANCZOS)
        im = im.quantize(colors=255, method=Image.FASTOCTREE)
        im.save(os.path.join(OUT_DIR, name), optimize=True)
        kb = os.path.getsize(os.path.join(OUT_DIR, name)) / 1024.0
        print('saved', name, im.size, '%.0fKB' % kb)
        rgba = im.convert('RGBA')
        bg = Image.new('RGBA', (rgba.width * 3, rgba.height * 3), (46, 120, 66, 255))
        bg.alpha_composite(rgba.resize((rgba.width * 3, rgba.height * 3), Image.NEAREST))
        bg.save(os.path.join(DBG_DIR, name.replace('.png', '_3x.png')))

    save(sheet_of(order, False), 'players_home.png')
    save(sheet_of(order, True), 'players_away.png')
    save(sheet_of(gk_order, False), 'gk_ref.png')

    json.dump({'cell': [round(CW * OUT_SCALE), round(CH * OUT_SCALE)],
               'feetY': round(FEET_Y * OUT_SCALE), 'cx': round(CX * OUT_SCALE),
               'cols': 6, 'colsGk': 4,
               'chars': [p[0] for p in PLAYERS], 'gk': [g[0] for g in GK_ROWS],
               'w': round(CW * OUT_SCALE), 'h': round(CH * OUT_SCALE),
               'frames': meta}, open(os.path.join(OUT_DIR, 'atlas.json'), 'w'), indent=1)
    print('frames meta written')
    # 원정 판정 로그 — 키트로 칠한 픽셀 수 / 안 칠한 빨강 픽셀 수
    for k in report:
        line = []
        for nm, picked in report[k].items():
            qa = [p for p in picked if 'blue' in p]
            line.append('%s:%s' % (nm, qa[0] if qa else '-'))
        print('away %-16s %s' % (k, '  '.join(line)))


if __name__ == '__main__':
    build()
