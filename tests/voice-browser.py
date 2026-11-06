"""Voice UI integration with a stub SpeechRecognition: no acoustic-accuracy claim."""
import functools,pathlib,threading
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
stub='''window.SpeechRecognition=class {constructor(){window.testSpeech=this;}start(){this.started=true;}stop(){this.onend?.();}abort(){this.onend?.();}};'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(timezone_id='Asia/Seoul');context.add_init_script(stub)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/');page.locator('#voice-date').fill('2026-11-06')
    page.locator('#voice-start').click();assert page.locator('#voice-start').is_disabled()
    page.evaluate("const r=[{transcript:'내일 오후 3시 병원 예약'}];r.isFinal=false;testSpeech.onresult({results:[r]});")
    assert page.locator('.event-card').count()==0
    page.evaluate("const r=[{transcript:'내일 오후 3시 병원 예약'}];r.isFinal=true;testSpeech.onresult({results:[r]});")
    page.locator('#voice-stop').click();assert page.locator('.event-card').count()==1
    assert page.locator('[data-field=start]').input_value()=='2026-11-07T15:00'
    assert 'calendar.google.com/calendar/render' in page.locator('.calendar-open').get_attribute('href');assert '20261107T060000Z' in page.locator('.calendar-open').get_attribute('href')
    page.locator('#voice-create').click();assert page.locator('.event-card').count()==1
    page.locator('#voice-text').fill('내일 25:00 오류');page.locator('#voice-create').click();assert page.locator('.event-card').count()==1
    page.locator('#voice-text').fill('');page.locator('#voice-start').click()
    page.evaluate("const r=[{transcript:'모레 오전 10시 취소할 일정'}];r.isFinal=true;testSpeech.onresult({results:[r]});")
    page.locator('#voice-cancel').click();assert page.locator('.event-card').count()==1
    page.locator('#voice-text').fill('');page.locator('#voice-start').click()
    page.evaluate("testSpeech.onerror({error:'not-allowed'});testSpeech.onend();")
    assert '마이크 권한' in page.locator('#voice-status').inner_text();assert page.locator('#voice-start').is_enabled()
    for width in [320,390,768,1280]:
        page.set_viewport_size({'width':width,'height':850});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
    page.set_viewport_size({'width':390,'height':844});page.locator('#mobile-mic').click();assert '완료' in page.locator('#mobile-mic').inner_text()
    page.evaluate("const r=[{transcript:'내일 오전 11시 모바일 검증'}];r.isFinal=true;testSpeech.onresult({results:[r]});")
    page.locator('#mobile-mic').click();assert page.locator('.event-card').count()==2
    unsupported=browser.new_context();unsupported.add_init_script('window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;')
    fallback=unsupported.new_page();fallback.goto(f'http://127.0.0.1:{server.server_port}/');assert fallback.locator('#voice-start').is_disabled();assert '키보드' in fallback.locator('#voice-status').inner_text()
    fallback.locator('#voice-date').fill('2026-11-06');fallback.locator('#voice-text').fill('내일 오전 10시 키보드 받아쓰기');fallback.locator('#voice-create').click();assert fallback.locator('.event-card').count()==1
    assert not errors,errors
    print('PASS: interim/final speech routing, draft creation, date/time, dedup, cancel, denied mic, unsupported browser fallback, Google link and responsive voice UI')
    browser.close()
server.shutdown()
