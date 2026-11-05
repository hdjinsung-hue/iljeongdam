"""Run from the repository root: python3 tests/browser.py"""
import functools, threading, tempfile, pathlib
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root.parent)))
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/{root.name}/'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(accept_downloads=True,timezone_id='Asia/Seoul')
    page=context.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url);page.locator('#sample').click();page.locator('#parse').click()
    assert page.locator('.event-card').count()==3
    page.locator('#parse').click();assert page.locator('.event-card').count()==3
    title=page.locator('[data-field=title]').first;title.fill('');assert page.locator('#export').is_disabled();title.fill('수정한 회의')
    with page.expect_download() as download: page.locator('#export').click()
    output=pathlib.Path(download.value.path()).read_text();assert 'BEGIN:VCALENDAR' in output and '수정한 회의' in output
    assert output.count('BEGIN:VEVENT')==3
    page.reload();assert page.locator('.event-card').count()==3;assert page.locator('[data-field=title]').first.input_value()=='수정한 회의'
    page.locator('#select-all').uncheck();assert page.locator('#export').is_disabled()
    page.locator('#select-all').check();page.locator('.delete-event').last.click();assert page.locator('.event-card').count()==2
    page.locator('#add').click();title=page.locator('[data-field=title]').last;title.fill('새 일정')
    page.locator('[data-field=allDay]').last.check();assert page.locator('[data-field=start]').last.get_attribute('type')=='date'
    page.locator('[data-field=allDay]').last.uncheck()
    page.locator('[data-field=end]').last.fill('2020-01-01T09:00');assert page.locator('#export').is_disabled()
    page.locator('.delete-event').last.click()
    with tempfile.TemporaryDirectory() as tmp:
        csv=pathlib.Path(tmp)/'schedule.csv';csv.write_text('날짜,시작,종료,제목,장소\n2027-01-02,10:00,11:00,CSV 회의,서울',encoding='utf-8')
        page.locator('#files').set_input_files(str(csv));page.wait_for_function("!document.querySelector('#files').disabled")
        assert page.locator('.event-card').count()==3
        page.locator('#files').set_input_files({'name':'import.ics','mimeType':'text/calendar','buffer':output.encode()});page.wait_for_function("!document.querySelector('#files').disabled")
        assert page.locator('.event-card').count()==4
        page.locator('#files').set_input_files({'name':'wrong.exe','mimeType':'application/octet-stream','buffer':b'bad'});page.wait_for_function("!document.querySelector('#files').disabled")
        assert '지원하지 않는' in page.locator('#file-list').inner_text()
        page.locator('#files').set_input_files({'name':'empty.txt','mimeType':'text/plain','buffer':b''});page.wait_for_function("!document.querySelector('#files').disabled")
        assert '빈 파일' in page.locator('#file-list').inner_text()
    page.locator('#source-text').fill('2026-02-30 오류\n2026-11-12 25:00 오류');page.locator('#parse').click();assert '0개 일정을' in page.locator('#status').inner_text()
    page.locator('#source-text').fill('2026-11-15 <img src=x onerror=alert(1)>');page.locator('#parse').click();assert page.locator('#events img').count()==0
    page.screenshot(path='/tmp/schedule-desktop.png',full_page=True)
    for width in [320,375,390,768,1280]:
        page.set_viewport_size({'width':width,'height':850})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'overflow {width}'
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path='/tmp/schedule-mobile.png',full_page=True)
    page.on('dialog',lambda dialog:dialog.accept());page.locator('#clear').click();assert page.locator('.event-card').count()==0
    assert not errors,errors
    print('PASS: import, edits, invalid input, selection, deletion, persistence, ICS export/import, safe text and 5 viewport widths')
    context.close();browser.close()
server.shutdown()
