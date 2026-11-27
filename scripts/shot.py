import sys, os, asyncio
from playwright.async_api import async_playwright

LIBS = os.path.expanduser('~/.libs-chromium')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    a = sys.argv[1:]
    url, out = a[0], a[1]
    W = int(a[2]) if len(a) > 2 else 1200
    H = int(a[3]) if len(a) > 3 else 900
    full = len(a) > 4 and a[4] == 'full'
    dpr = float(a[5]) if len(a) > 5 else 1
    wait = int(a[6]) if len(a) > 6 else 800
    jsfile = None; setup = ''
    for extra in a[7:]:
        if extra.startswith('jsf='):
            jsfile = os.path.join(ROOT, extra[4:])
        elif extra.startswith('setup='):
            setup = extra[6:]
    env = dict(os.environ)
    env['LD_LIBRARY_PATH'] = LIBS + ':' + env.get('LD_LIBRARY_PATH', '')
    async with async_playwright() as p:
        b = await p.chromium.launch(env=env, args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=dpr)
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        pg.on('requestfailed', lambda r: logs.append(f'REQFAIL: {r.url} {r.failure}'))
        def on_resp(r):
            if r.status >= 400:
                logs.append(f'HTTP {r.status}: {r.url}')
        pg.on('response', on_resp)
        await pg.goto(url, wait_until='networkidle')
        await pg.wait_for_timeout(wait)
        if setup:
            print('SETUP:', await pg.evaluate(setup))
        if jsfile:
            js = open(jsfile).read()
            res = await pg.evaluate(js)
            print(res)
            await pg.wait_for_timeout(300)
        if out != 'none':
            clip = os.environ.get('CLIP')
            if clip:
                x, y, w, h = [int(v) for v in clip.split(',')]
                await pg.screenshot(path=out, clip={'x': x, 'y': y, 'width': w, 'height': h})
            else:
                await pg.screenshot(path=out, full_page=full)
        for l in logs:
            print(l)
        await b.close()

asyncio.run(main())
