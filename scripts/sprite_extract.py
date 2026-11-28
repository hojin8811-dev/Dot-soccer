#!/usr/bin/env python3
"""v36 — 고퀄 스프라이트 시트 4장(각 4x4) 정밀 추출 → 게임 아틀라스.

· 순백 배경을 외곽 flood-fill로 투명화 (내부 흰 반바지·양말·눈 흰자는 보존)
· 캐릭터와 붙어 있지 않은 부속물(킥 옆 축구공·모션선, GK 다이빙 공)을
  연결 요소 분리로 제거하고, GK 캐칭의 손 안 공은 원판 마스크로 제거
· 발밑에 구워진 회색 접지 그림자를 색 조건으로 제거(우리 그림자를 따로 그린다)
· 캐릭터별 기준 배율(달리기 프레임 높이)로 정규화 → 머리 중심 x ·발바닥 바닥선 고정 앵커
· 원정(로열 블루) = 상의·양말·머리띠의 빨강 덩어리만 Hue shift (입술·볼홍조 제외)

출력: assets/sprites/players_home.png · players_away.png · gk_ref.png
      assets/sprites/atlas.json   preview/v36-raw/*.png (검수용)
"""
import json
import os

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATT = '/workspace/attachments/2026-11-28'
SHEETS = [
    '1000014204-206e3e511f044f34a810b59da939dc1b.jpg',   # 1: 갈색 스파이키·금발 포니·안경·빨간 머리띠
    '1000014205-c5cc4f465a4d4141bf678f339f3b15f0.jpg',   # 2: 은발·선글라스 / 초록 GK / 주심
    '1000014206-8db069e89678466fb2013d3a2e35475a.jpg',   # 3: 아프로 흑피부·네이비 장발·모호크·주근깨
    '1000014207-f8caf749f77f441c8a6c1be2eabccd02.jpg',   # 4: 금발 커튼·파스텔 스파이키 / 노랑 GK / 감독
]

OUT_DIR = os.path.join(ROOT, 'assets', 'sprites')
DBG_DIR = os.path.join(ROOT, 'preview', 'v36-raw')

WHITE_T = 236
MIN_COMP = 40

CW, CH = 284, 252
FEET_Y = 246
CX = CW // 2
TARGET_H = 232
OUT_SCALE = 0.5

# key, sheet, row, [프레임 이름 4개], (캐칭 공 원판: (cx,cy,r) 또는 None)
CHARS = [
    ('spiky_brown',      0, 0, ['run1', 'run2', 'kick', 'tackle'], None),
    ('ponytail_blonde',  0, 1, ['run1', 'run2', 'kick', 'up'], None),
    ('glasses_black',    0, 2, ['run1', 'run2', 'kick', 'down'], None),
    ('headband_brown',   0, 3, ['run1', 'run2', 'kick', 'celebrate'], None),
    ('spiky_silver',     1, 0, ['run1', 'run2', 'kick', 'up'], None),
    ('sunglasses_black', 1, 1, ['run1', 'run2', 'kick', 'down'], None),
    ('afro_dark',        2, 0, ['run1', 'run2', 'kick', 'tackle'], None),
    ('navy_long',        2, 1, ['run1', 'run2', 'kick', 'up'], None),
    ('mohawk_brown',     2, 2, ['run1', 'run2', 'kick', 'down'], None),
    ('ginger_freckles',  2, 3, ['run1', 'run2', 'kick', 'celebrate'], None),
    ('blond_curtain',    3, 0, ['run1', 'run2', 'kick', 'up'], None),
    ('blue_spiky',       3, 1, ['run1', 'run2', 'kick', 'down'], None),
    # GK 캐칭 4번째 칸은 손에 축구공이 그려져 있어 쓰지 않는다(게임 공과 이중).
    ('gk_green',         1, 2, ['idle', 'run1', 'dive'], None),
    ('gk_yellow',        3, 2, ['idle', 'run1', 'dive'], None),
    ('ref',              1, 3, ['idle', 'run1', 'run2', 'whistle'], None),
    ('coach',            3, 3, ['idle', 'point', 'shout', 'cheer'], None)
]
N_PLAYER = 12


def cut_cell(img, r, c):
    h, w = img.shape[:2]
    ch, cw = h / 4.0, w / 4.0
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


def remove_disk(alpha, cx, cy, r):
    yy, xx = np.mgrid[0:alpha.shape[0], 0:alpha.shape[1]]
    alpha[np.hypot(xx - cx, yy - cy) <= r] = 0
    return alpha


def crop(rgb, alpha):
    ys, xs = np.where(alpha > 0)
    return rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1], alpha[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def head_cx(alpha):
    h, w = alpha.shape
    band = alpha[:max(8, int(h * 0.34))] > 0
    ys, xs = np.where(band)
    return float(np.median(xs)) if len(xs) else w / 2.0


H_BLUE = 110.0


def recolor_away(rgb, alpha):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1] / 255.0, hsv[:, :, 2] / 255.0
    red = (((h <= 9) | (h >= 168)) & (s >= 0.42) & (v >= 0.14) & (alpha > 0)).astype(np.uint8)
    # 얼굴(피부) 마스크 — 얼굴 위 볼홍조·입술은 유니폼이 아니므로 건너뛴다
    skin = ((h >= 2) & (h <= 30) & (s >= 0.08) & (s <= 0.72) & (v > 0.40) & (alpha > 0)).astype(np.uint8)
    ns, ls, ss, _ = cv2.connectedComponentsWithStats(skin, 8)
    faced = np.zeros(alpha.shape, np.uint8)
    face_bot = 0
    if ns > 1:
        fid = 1 + int(np.argmax(ss[1:, 4]))
        faced = cv2.dilate((ls == fid).astype(np.uint8), np.ones((3, 3), np.uint8), iterations=3)
        face_bot = int(ss[fid, 1] + ss[fid, 3])
    n, lab, st, _ = cv2.connectedComponentsWithStats(red, 8)
    areas = [int(st[i, 4]) for i in range(1, n)] or [0]
    amax = max(areas)
    sel = np.zeros(alpha.shape, bool)
    for i in range(1, n):
        a = int(st[i, 4])
        y0, h0 = int(st[i, 1]), int(st[i, 3])
        if a < max(120, amax * 0.045):
            continue                       # 작은 점(반짝임·노이즈)
        m = (lab == i)
        if (m & (faced > 0)).sum() / float(a) > 0.5:
            continue                       # 얼굴 안의 빨강 = 볼홍조·입술
        # 턱선 아래까지 이어지는 덩어리(상의·양말)만 유니폼. 머리카락·머리띠는 그대로.
        if (y0 + h0) >= face_bot - 2:
            sel[m] = True
    hsv[:, :, 0][sel] = H_BLUE
    ss = hsv[:, :, 1]
    ss[sel] = np.clip(ss[sel] * 0.86 + 42, 120, 248)
    vv = hsv[:, :, 2]
    vv[sel] = np.clip(vv[sel] * 1.06 + 6, 0, 255)
    hsv[:, :, 1] = ss
    hsv[:, :, 2] = vv
    return cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2RGB)


def build():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(DBG_DIR, exist_ok=True)
    imgs = [np.array(Image.open(os.path.join(ATT, s)).convert('RGB')) for s in SHEETS]

    meta, planes, order = {}, {}, []
    for key, si, r, names, ball in CHARS:
        frames = []
        for c, nm in enumerate(names):
            rgb, alpha, dropped = cut_cell(imgs[si], r, c)
            if ball and nm == 'catch':
                alpha = remove_disk(alpha, ball[0], ball[1], ball[2])
                n, lab, st, _ = cv2.connectedComponentsWithStats((alpha > 0).astype(np.uint8), 8)
                order2 = sorted([(st[i, 4], i) for i in range(1, n)], reverse=True)
                if order2:
                    alpha[lab != order2[0][1]] = 0
            alpha = strip_ground_shadow(rgb, alpha)
            alpha = refinalize(rgb, alpha)
            rgb, alpha = crop(rgb, alpha)
            frames.append((nm, rgb, alpha))
            print('%-17s %-9s %4dx%-4d dropped=%s' % (key, nm, rgb.shape[1], rgb.shape[0],
                                                      [(d['area'], d['bbox']) for d in dropped]))
        order.append((key, frames))
        runh = None
        for nm, rgb, alpha in frames:
            if nm == 'run1':
                ys, xs = np.where(alpha > 0)
                runh = int(ys.max() - ys.min() + 1)
        runh = runh or frames[0][2].shape[0]
        k = TARGET_H / float(runh)
        meta[key] = {'k': round(k, 4), 'frames': {}}
        for nm, rgb, alpha in frames:
            hh, ww = alpha.shape
            nw, nh = max(1, int(round(ww * k))), max(1, int(round(hh * k)))
            r2 = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA)
            a2 = cv2.resize(alpha, (nw, nh), interpolation=cv2.INTER_AREA)
            hx = head_cx(alpha) * k
            if nm in ('tackle', 'dive'):
                hx = ww * k / 2.0
            meta[key]['frames'][nm] = {'w': nw, 'h': nh, 'hx': round(hx, 1)}
            planes[(key, nm)] = (r2, a2)

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

    def sheet_of(keys, away=False):
        frames_of = {k: [f[0] for f in fr] for k, fr in order}
        arr = np.zeros((CH * len(keys), CW * 4, 4), np.uint8)
        for ri, key in enumerate(keys):
            for ci, nm in enumerate(frames_of[key]):
                rgb2, a2 = planes[(key, nm)]
                if away and key in [c[0] for c in CHARS[:N_PLAYER]]:
                    rgb2 = recolor_away(rgb2, a2)
                arr[ri * CH:(ri + 1) * CH, ci * CW:(ci + 1) * CW] = place(rgb2, a2, meta[key]['frames'][nm]['hx'])
        return arr

    def save(arr, name):
        im = Image.fromarray(arr, 'RGBA')
        im = im.resize((int(round(im.width * OUT_SCALE)), int(round(im.height * OUT_SCALE))), Image.LANCZOS)
        # 팔레트 255색으로 줄여 PNG를 1/4 크기로(모바일 첫 로딩) — 알파 그라데이션은 유지된다
        im = im.quantize(colors=255, method=Image.FASTOCTREE)
        im.save(os.path.join(OUT_DIR, name), optimize=True)
        print('saved', name, im.size)
        rgba = im.convert('RGBA')
        bg = Image.new('RGBA', (rgba.width * 3, rgba.height * 3), (46, 120, 66, 255))
        bg.alpha_composite(rgba.resize((rgba.width * 3, rgba.height * 3), Image.NEAREST))
        bg.save(os.path.join(DBG_DIR, name.replace('.png', '_3x.png')))

    players = [c[0] for c in CHARS[:N_PLAYER]]
    save(sheet_of(players, False), 'players_home.png')
    save(sheet_of(players, True), 'players_away.png')
    save(sheet_of(['gk_green', 'gk_yellow', 'ref', 'coach']), 'gk_ref.png')

    json.dump({'cell': [round(CW * OUT_SCALE), round(CH * OUT_SCALE)],
               'feetY': round(FEET_Y * OUT_SCALE), 'cx': round(CX * OUT_SCALE),
               'cols': 4, 'chars': players, 'gk': ['gk_green', 'gk_yellow', 'ref', 'coach'],
               'w': round(CW * OUT_SCALE), 'h': round(CH * OUT_SCALE),
               'frames': meta}, open(os.path.join(OUT_DIR, 'atlas.json'), 'w'), indent=1)
    print('frames meta written')


if __name__ == '__main__':
    build()
