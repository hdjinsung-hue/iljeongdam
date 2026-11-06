"""Validate install metadata and offline manual voice-text drafting. Google login stays online-only."""
import functools,pathlib,threading
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(timezone_id='Asia/Seoul');context.add_init_script('window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;')
    page=context.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/');page.evaluate('navigator.serviceWorker.ready')
    manifest=page.evaluate("fetch('./manifest.webmanifest').then(r=>r.json())");assert manifest['display']=='standalone';assert len(manifest['icons'])==2
    page.reload();page.wait_for_function('!!navigator.serviceWorker.controller')
    context.set_offline(True);page.reload(wait_until='domcontentloaded');page.locator('#voice-date').fill('2026-11-06');page.locator('#voice-text').fill('내일 오후 3시 오프라인 초안');page.locator('#voice-create').click()
    assert page.locator('.event-card').count()==1
    keys=page.evaluate('caches.keys()');assert any(k.startswith('iljeongdam-shell-') for k in keys)
    urls=page.evaluate("caches.open('iljeongdam-shell-v4-0').then(c=>c.keys()).then(keys=>keys.map(r=>r.url))")
    assert all('googleapis.com' not in url and 'accounts.google.com' not in url for url in urls)
    print('PASS: manifest, service worker activation, offline manual draft and no Google responses cached')
    browser.close()
server.shutdown()
