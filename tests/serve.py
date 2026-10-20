"""Serve the mock console on http://127.0.0.1:8767 at console-shaped paths.

  python3 tests/serve.py   then open
  http://127.0.0.1:8767/webstore/devconsole/pub/abcdefghijklmnopabcdefghijklmnop/edit
"""
import http.server, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ITEM = r'/webstore/devconsole/[^/]+/[a-p]{32}'
ROUTES = [
    (re.compile(ITEM + r'/edit/?$'), 'tests/mock/listing.html'),
    (re.compile(ITEM + r'/edit/privacy/?$'), 'tests/mock/privacy.html'),
    (re.compile(ITEM + r'/testcredentials/?$'), 'tests/mock/test.html'),
    (re.compile(ITEM + r'/analytics/(installs|impressions|users)/?$'), 'tests/mock/analytics.html'),
    (re.compile(ITEM + r'/ratings/?$'), 'tests/mock/ratings.html'),
    (re.compile(ITEM + r'/support/?$'), 'tests/mock/support.html'),
]

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def translate_path(self, path):
        path = path.split('?')[0]
        for rx, target in ROUTES:
            if rx.match(path):
                return os.path.join(ROOT, target)
        m = re.match(r'/img/([\w.-]+?)=.*$', path)
        if m:  # console image URLs carry a size suffix after "="
            return os.path.join(ROOT, 'tests/mock/img', m.group(1))
        return super().translate_path(path)

    def do_POST(self):
        # Stand-in for the console's background data call (batchexecute).
        if '/batchexecute' not in self.path:
            return self.send_error(404)
        self.rfile.read(int(self.headers.get('Content-Length') or 0))
        body = open(os.path.join(ROOT, 'tests/fixtures/analytics/batchexecute.txt'), 'rb').read()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass

http.server.ThreadingHTTPServer(('127.0.0.1', 8767), Handler).serve_forever()
