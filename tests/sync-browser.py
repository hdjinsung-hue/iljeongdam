"""Google API/GIS doubles test UI + two-device flow. Does not verify real login."""
import functools,json,pathlib,threading
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'
clientid='123456-testclient.apps.googleusercontent.com'
init='''window.google={accounts:{oauth2:{initTokenClient:opts=>({requestAccessToken:()=>opts.callback({access_token:'fake-token',expires_in:3600})})}}};'''
db={};counter=[0]
def api(route):
    request=route.request
    if '/userinfo' in request.url:
        route.fulfill(json={'sub':'account-a','email':'owner@example.test','email_verified':True});return
    key=request.url.split('/events/',1)[1].split('?')[0] if '/events/' in request.url else None
    method=request.method
    if method=='GET':route.fulfill(json=db.get(key,{}) if key else {'items':list(db.values())});return
    if method=='POST':
        value=request.post_data_json
        if value['id'] in db:route.fulfill(status=409,json={});return
        counter[0]+=1;value['etag']=str(counter[0]);db[value['id']]=value;route.fulfill(json=value);return
    if key not in db:route.fulfill(status=404,json={});return
    if request.headers.get('if-match')!=db[key]['etag']:route.fulfill(status=412,json={});return
    if method=='DELETE':del db[key];route.fulfill(status=204,body='');return
    counter[0]+=1;db[key].update(request.post_data_json);db[key]['etag']=str(counter[0]);route.fulfill(json=db[key])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    contexts=[]
    for width in [1280,390]:
        context=browser.new_context(viewport={'width':width,'height':850},timezone_id='Asia/Seoul')
        
        if width==1280:context.add_init_script(init)
        else:context.route('https://accounts.google.com/gsi/client',lambda route:route.fulfill(body=init,content_type='application/javascript'))
        context.route('https://www.googleapis.com/**',api);contexts.append(context)
    web,phone=[c.new_page() for c in contexts]
    errors=[]
    for page in [web,phone]:
        page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url)
        assert page.locator('#google-connect').is_disabled()
        page.locator('.google-settings summary').click();page.locator('#google-client-id').fill(clientid);page.locator('#google-config-save').click();page.locator('#google-connect').wait_for();page.wait_for_function("!document.querySelector('#google-connect').disabled");page.locator('#google-connect').click()
        page.wait_for_function("!document.querySelector('#google-save').disabled")
        assert 'owner@example.test' in page.locator('#sync-account').inner_text()
    web.locator('#voice-date').fill('2026-11-06');web.locator('#voice-text').fill('내일 오후 3시 연동 검증 회의');web.locator('#voice-create').click();web.locator('#google-save').click()
    web.wait_for_function("!document.querySelector('#google-save').disabled")
    assert len(db)==1
    phone.locator('#google-pull').click();phone.wait_for_function("!document.querySelector('#google-pull').disabled")
    assert phone.locator('[data-field=title]').input_value()=='연동 검증 회의'
    phone.locator('[data-field=title]').fill('휴대폰에서 수정');phone.locator('#select-all').check();phone.locator('#google-save').click();phone.wait_for_function("!document.querySelector('#google-save').disabled")
    web.locator('#google-pull').click();web.wait_for_function("!document.querySelector('#google-pull').disabled")
    assert web.locator('[data-field=title]').input_value()=='휴대폰에서 수정'
    # Token never persists in localStorage.
    assert 'fake-token' not in web.evaluate('JSON.stringify(localStorage)')
    phone.on('dialog',lambda d:d.accept());phone.locator('.delete-event').click();phone.wait_for_function("document.querySelectorAll('.event-card').length===0")
    assert not db
    web.locator('#google-pull').click();web.wait_for_function("!document.querySelector('#google-pull').disabled");assert web.locator('.event-card').count()==0
    web.locator('#google-disconnect').click();assert web.locator('#google-save').is_disabled()
    for width in [320,375,390,768,1280]:
        phone.set_viewport_size({'width':width,'height':850});assert phone.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
    assert phone.locator('#mobile-mic').is_visible() is False  # last viewport is desktop
    phone.set_viewport_size({'width':390,'height':844});assert phone.locator('#mobile-mic').is_visible()
    assert not errors,errors
    print('PASS: unconfigured state, GIS callback routing, web->phone save/pull, phone->web edit, delete, token not persisted, disconnect and mobile layout')
    browser.close()
server.shutdown()
