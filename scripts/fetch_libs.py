import gzip, io, os, sys, tarfile, urllib.request, re

BASE = 'https://deb.debian.org/debian'
DEST = os.path.expanduser('~/.libs-chromium')
WANT = {
    'libnspr4': 'libnspr4.so',
    'libnss3': 'libnss3.so',
    'libasound2t64': 'libasound.so.2',
    'libatk1.0-0t64': 'libatk-1.0.so.0',
    'libatk-bridge2.0-0t64': 'libatk-bridge-2.0.so.0',
    'libatspi2.0-0t64': 'libatspi.so.0',
    'libdbus-1-3': 'libdbus-1.so.3',
    'libxcomposite1': 'libXcomposite.so.1',
    'libxdamage1': 'libXdamage.so.1',
    'libxfixes3': 'libXfixes.so.3',
    'libxrandr2': 'libXrandr.so.2',
    'libxkbcommon0': 'libxkbcommon.so.0',
}

def fetch(url):
    print('GET', url)
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()

def load_packages():
    for comp in ('main',):
        url = f'{BASE}/dists/trixie/{comp}/binary-amd64/Packages.gz'
        data = fetch(url)
        text = gzip.decompress(data).decode('utf-8', 'replace')
        return text

def parse(text):
    out = {}
    for block in text.split('\n\n'):
        if not block.strip():
            continue
        d = {}
        for line in block.split('\n'):
            if line.startswith(' ') or ':' not in line:
                continue
            k, v = line.split(':', 1)
            d[k.strip()] = v.strip()
        if 'Package' in d:
            out[d['Package']] = d
    return out

def extract(deb_path, target):
    data = open(deb_path, 'rb').read()
    if not data.startswith(b'!<arch>\n'):
        raise ValueError('not ar')
    off = 8
    while off < len(data):
        hdr = data[off:off + 60]
        if len(hdr) < 60:
            break
        name = hdr[0:16].decode().strip()
        size = int(hdr[48:58].decode().strip())
        body = data[off + 60: off + 60 + size]
        if name.startswith('data.tar'):
            stream = io.BytesIO(body)
            if name.endswith('.xz'):
                import lzma
                stream = io.BytesIO(lzma.decompress(body))
            elif name.endswith('.gz'):
                stream = io.BytesIO(gzip.decompress(body))
            elif name.endswith('.zst'):
                try:
                    import zstandard
                    stream = io.BytesIO(zstandard.ZstdDecompressor().decompress(body, max_output_size=200 * 1024 * 1024))
                except ImportError:
                    raise RuntimeError('zstd 필요: ' + name)
            with tarfile.open(fileobj=stream) as tf:
                for m in tf.getmembers():
                    if not m.isfile():
                        continue
                    if '/lib/' not in m.name and '/lib/' not in ('/' + m.name):
                        continue
                    base = os.path.basename(m.name)
                    if not (base.endswith('.so') or '.so.' in base):
                        continue
                    dst = os.path.join(target, base)
                    with open(dst, 'wb') as f:
                        f.write(tf.extractfile(m).read())
                    print('  ->', base)
        off += 60 + size + (size % 2)

def main():
    os.makedirs(DEST, exist_ok=True)
    pkgs = parse(load_packages())
    for name in WANT:
        d = pkgs.get(name)
        if not d:
            print('MISSING PACKAGE', name)
            continue
        have = os.path.join(DEST, WANT[name])
        if os.path.exists(have):
            print('already', have)
            continue
        url = BASE + '/' + d['Filename']
        tmp = f'/tmp/{name}.deb'
        open(tmp, 'wb').write(fetch(url))
        extract(tmp, DEST)

main()
