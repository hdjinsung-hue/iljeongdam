"""Actual Korean image + scanned PDF + text PDF integration checks."""
import base64, functools, pathlib, tempfile, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    doc=b.new_page(viewport={'width':1500,'height':500})
    doc.set_content('<style>body{margin:0;padding:50px;font:40px sans-serif}</style><p>2026-11-12 10:00~11:00 팀 주간회의</p><p>2026-11-13 14:00 건강검진</p>')
    image=pathlib.Path(tmp)/'schedule.png';doc.screenshot(path=str(image))
    doc.pdf(path=str(pathlib.Path(tmp)/'text.pdf'))
    doc.set_content('<img style="width:100%" src="data:image/png;base64,'+base64.b64encode(image.read_bytes()).decode()+'">')
    doc.pdf(path=str(pathlib.Path(tmp)/'scan.pdf'));doc.close()
    page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/')
    page.locator('.file-tools>summary').click()
    for name in ['schedule.png','scan.pdf','text.pdf']:
        page.locator('#source-text').fill('');page.locator('#files').set_input_files(str(pathlib.Path(tmp)/name))
        page.wait_for_function("!document.querySelector('#files').disabled",timeout=180000)
        text=page.locator('#source-text').input_value()
        assert '2026' in text and '회의' in text,(name,text,page.locator('#file-list').inner_text())
        page.locator('#parse').click();assert page.locator('.event-card').count()>=2
        print('PASS:',name,flush=True)
    # Cancellation during worker initialization must not corrupt the next import.
    page.locator('#files').set_input_files(str(image));page.locator('#cancel').click()
    page.wait_for_function("!document.querySelector('#files').disabled")
    page.locator('#files').set_input_files(str(pathlib.Path(tmp)/'text.pdf'))
    page.wait_for_function("!document.querySelector('#files').disabled",timeout=30000)
    assert '문자를 읽지' not in page.locator('#status').inner_text()
    assert not errors,errors
    print('PASS: cancellation and subsequent import',flush=True)
    b.close()
server.shutdown()
