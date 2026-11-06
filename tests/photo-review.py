"""UI regression for manual perspective/calendar review; uses a generated fixture, not user data."""
import functools,pathlib,tempfile,threading
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory() as tmp,sync_playwright() as p:
    image=Image.new('RGB',(1400,900),'white');draw=ImageDraw.Draw(image);font=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',28)
    for x in range(0,1400,200):draw.line((x,0,x,899),fill='#888',width=2)
    for y in range(0,900,180):draw.line((0,y,1399,y),fill='#888',width=2)
    for n in range(1,31):draw.text((((n-1)%7)*200+8,((n-1)//7)*180+5),str(n),font=font,fill='black')
    draw.text((1010,420),'검증회의\n10:20',font=font,fill='black')
    path=pathlib.Path(tmp)/'calendar.png';image.save(path)
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/');page.locator('.file-tools>summary').click();page.locator('#photo-assist summary').click();page.locator('#photo-input').set_input_files(str(path));page.locator('#photo-canvas').wait_for(state='visible')
    canvas=page.locator('#photo-canvas');box=canvas.bounding_box()
    for x,y in [(3,3),(box['width']-3,3),(box['width']-3,box['height']-3),(3,box['height']-3)]:canvas.click(position={'x':x,'y':y})
    page.locator('#photo-build').click();assert '연월' in page.locator('#photo-status').inner_text();assert page.locator('.photo-cell').count()==0
    page.locator('#photo-month').fill('2026-11');page.locator('#photo-month').dispatch_event('change');page.locator('#photo-build').click();assert page.locator('.photo-cell').count()==30
    assert page.locator('.photo-cell input[type=checkbox]:checked').count()==0
    page.locator('#photo-add').click();assert page.locator('.event-card').count()==0
    page.locator('#photo-read').click();page.wait_for_function("!document.querySelector('#photo-read').disabled",timeout=180000)
    assert page.locator('.photo-cell input[type=checkbox]:checked').count()==0
    card=page.locator('.photo-cell').nth(19);card.locator('input[type=text]').fill('검증회의');card.locator('input[type=time]').fill('10:20');card.locator('input[type=checkbox]').check();page.locator('#photo-add').click()
    assert page.locator('.event-card').count()==1;assert page.locator('[data-field=start]').input_value()=='2026-11-20T10:20'
    # An empty title is never silently imported, even if the checkbox is checked.
    blank=page.locator('.photo-cell').first;blank.locator('input[type=text]').fill('');blank.locator('input[type=checkbox]').check();page.locator('#photo-add').click();assert page.locator('.event-card').count()==1;assert '제목' in page.locator('#photo-status').inner_text()
    for width in [320,390,768,1280]:
        page.set_viewport_size({'width':width,'height':850});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
    assert not errors,errors
    print('PASS: month required, perspective corners, 30 dated crops, OCR suggestions unchecked, confirmed-only import, invalid title and responsive review',flush=True)
    browser.close()
server.shutdown()
