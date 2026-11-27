#!/usr/bin/env python3
"""꼬마일레븐 FC v32 — 치비 전신 일러스트에서 머리 파츠를 분리한다.

assets/chibi/<type>_<pose>.png (150px 정규화 전신) 의 머리 영역만 잘라
assets/chibi/heads/<type>.png 로 저장하고, JS 메타데이터(HEAD)를 만든다.

· 턱·목까지 포함해 자르고, 어깨/장갑이 섞이는 GK는 아래쪽을 좁은 띠로 마스크한다.
· bbox(알파) 로 머리 중심 x · 높이를 재서 chibi.js 의 HEAD 메타에 넣는다.
"""
from PIL import Image
import numpy as np, json, os, sys

SRC = os.path.join(os.path.dirname(__file__), '..', 'assets', 'chibi')
OUT = os.path.join(SRC, 'heads')

# type: (source pose, cut row)
SPEC = {
    'h0': ('h0_run_a', 80),
    'h1': ('h1_run_a', 78),
    'h2': ('h2_run_a', 80),
    'a0': ('a0_run_a', 78),
    'a1': ('a1_run_a', 80),
    'a2': ('a2_run_a', 80),
    'g0': ('g0_idle', 78),
    'g1': ('g1_idle', 78),
}
# 턱 아래(어깨·팔·장갑이 섞이는 구간)는 머리 폭 안으로 좁힌다
MASK_FROM = 56
MASK_W0 = 40
MASK_W1 = 15


def build():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for t, (pose, cut) in SPEC.items():
        im = Image.open(os.path.join(SRC, pose + '.png')).convert('RGBA')
        head = im.crop((0, 0, im.size[0], cut))
        a = np.array(head).astype(np.float32)
        al = a[:, :, 3]
        ys, xs = np.where(al > 8)
        cx = int(round((xs.min() + xs.max()) / 2)) if len(xs) else a.shape[1] // 2
        for y in range(MASK_FROM, a.shape[0]):
            k = (y - MASK_FROM) / max(1, (a.shape[0] - 1 - MASK_FROM))
            half = MASK_W0 + (MASK_W1 - MASK_W0) * k
            row = a[y, :, 3]
            x0 = np.arange(row.shape[0])
            d = np.abs(x0 - cx)
            fade = np.clip((half + 1.5 - d) / 1.5, 0, 1)
            a[y, :, 3] = row * fade
        a = np.clip(a, 0, 255).astype(np.uint8)
        head = Image.fromarray(a)
        # 알파 bbox 기준 머리 중심/높이 — 렌더러가 목선에 맞춰 얹는다
        al = a[:, :, 3] > 40
        ys, xs = np.where(al)
        x0, x1 = int(xs.min()), int(xs.max())
        y0, y1 = int(ys.min()), int(ys.max())
        # 중심은 '목' — 아래 4줄 알파 무게중심 (머리카락 비대칭에 흔들리지 않는다)
        neck = a[max(0, y1 - 3):y1 + 1, :, 3].astype(np.float64)
        wsum = neck.sum()
        cx = float((neck.sum(axis=0) * np.arange(neck.shape[1])).sum() / wsum) if wsum > 0 else (x0 + x1) / 2
        head.save(os.path.join(OUT, t + '.png'), optimize=True)
        meta[t] = {
            'w': head.size[0], 'h': head.size[1],
            'cx': round(cx, 1),           # 머리 중심 x (px)
            'hw': x1 - x0 + 1, 'hh': y1 - y0 + 1,
            'top': y0, 'bottom': y1 + 1,
        }
        print(t, meta[t])
    print(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    build()
