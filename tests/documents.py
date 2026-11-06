"""Integration: real XLSX/DOCX tables, calendar image/PDF and recoverable import errors."""
import base64, datetime, functools, pathlib, tempfile, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from openpyxl import Workbook
from docx import Document
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
    tmp=pathlib.Path(tmp)
    book=Workbook();sheet=book.active;sheet.append(['날짜','제목','시작','종료','장소'])
    sheet.append([datetime.datetime(2026,11,12),'원본 Excel 회의',datetime.time(10,0),datetime.time(11,0),'서울'])
    sheet.append([datetime.datetime(2026,11,13),'Excel 검진','14:00','15:00',''])
    book.save(tmp/'list.xlsx')
    book=Workbook();sheet=book.active;sheet.append(['일시','일정명']);sheet.append([datetime.datetime(2026,11,18,9,30),'Excel 일시 회의']);sheet.append([datetime.datetime(2026,11,19,15,0),'Excel 일시 검진']);book.save(tmp/'datetime.xlsx')
    week=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    book=Workbook();sheet=book.active;sheet.append(['2026년 11월']);sheet.append(week)
    sheet.append(['1\n10:00 Excel 달력 회의','2\n14:00 Excel 달력 검진','3','4','5','6','7']);book.save(tmp/'calendar.xlsx')
    doc=Document();doc.add_paragraph('2026-11-16 10:00~11:00 Word 본문 회의')
    table=doc.add_table(rows=1,cols=4)
    for c,t in zip(table.rows[0].cells,['날짜','제목','시작','종료']):c.text=t
    for c,t in zip(table.add_row().cells,['2026-11-17','Word 표 검진','14:00','15:00']):c.text=t
    doc.save(tmp/'list.docx')
    doc=Document();doc.add_paragraph('2026년 11월');table=doc.add_table(rows=1,cols=7)
    for c,t in zip(table.rows[0].cells,week):c.text=t
    for c,t in zip(table.add_row().cells,['1\n10:00 Word 달력 회의','2\n14:00 Word 달력 검진','3','4','5','6','7']):c.text=t
    doc.save(tmp/'calendar.docx')
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(timezone_id='Asia/Seoul')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/')
    page.locator('.file-tools>summary').click()
    def upload(name,expected):
        page.locator('#source-text').fill('');page.locator('#files').set_input_files(str(tmp/name));page.wait_for_function("!document.querySelector('#files').disabled",timeout=180000)
        text=page.locator('#source-text').input_value();assert all(s in text for s in expected),(name,text,page.locator('#file-list').inner_text())
        before=page.locator('.event-card').count();page.locator('#parse').click();assert page.locator('.event-card').count()>=before+2,(name,text,page.locator('#status').inner_text())
        print('PASS:',name,flush=True)
    upload('list.xlsx',['2026-11-12','10:00~11:00','원본 Excel 회의'])
    upload('datetime.xlsx',['2026-11-18 09:30','Excel 일시 회의'])
    upload('calendar.xlsx',['2026-11-01','2026-11-02','Excel 달력'])
    upload('list.docx',['2026-11-16','2026-11-17','Word 표 검진'])
    upload('calendar.docx',['2026-11-01','Word 달력'])
    # Full calendar: detect weekday columns and align event text to day numbers.
    doc=browser.new_page(viewport={'width':1400,'height':650})
    cells=''.join(f'<div class="cell"><b>{n}</b><p>{"10:00 팀회의" if n==1 else "14:00 검진" if n==2 else ""}</p></div>' for n in range(1,15))
    html='<style>*{box-sizing:border-box}body{margin:0;font:28px sans-serif;background:white}h1{font-size:38px;padding:8px 20px}.grid{display:grid;grid-template-columns:repeat(7,200px)}.head{padding:15px 10px;font-size:25px;text-align:center}.cell{height:190px;padding:16px;border:1px solid #bbb}p{font-size:22px;margin-top:30px}</style><h1>2026년 11월</h1><div class="grid">'+''.join('<div class="head">'+d+'</div>' for d in week)+cells+'</div>'
    doc.set_content(html);doc.screenshot(path=str(tmp/'calendar.png'),full_page=True)
    doc.pdf(path=str(tmp/'calendar.pdf'),width='1400px',height='850px')
    # A scanned calendar page with a selectable PDF heading exercises partial-scan fallback.
    image=base64.b64encode((tmp/'calendar.png').read_bytes()).decode()
    doc.set_content('<p>2026년 11월 scanned calendar attachment</p><img style="width:100%" src="data:image/png;base64,'+image+'">')
    doc.pdf(path=str(tmp/'scanned-calendar.pdf'),width='1400px',height='850px');doc.close()
    page.locator('#calendar-month').fill('2026-11')
    # Clear previous duplicate titles when comparing photo and PDF calendar imports.
    page.on('dialog',lambda d:d.accept())
    for name in ['calendar.png','calendar.pdf','scanned-calendar.pdf']:
        page.locator('#clear').click();upload(name,['2026-11-01','2026-11-02'])
        starts=page.locator('[data-field=start]').evaluate_all('(els)=>els.map(e=>e.value)')
        assert '2026-11-01T10:00' in starts and '2026-11-02T14:00' in starts,(name,starts)
    # Missing month is recoverable via retained file + explicit month, not an invented date.
    book=Workbook();sheet=book.active;sheet.append(week);sheet.append(['1\n10:00 재인식 회의','2\n14:00 재인식 검진','3','4','5','6','7']);book.save(tmp/'no-month.xlsx')
    page.locator('#calendar-month').fill('');page.locator('#files').set_input_files(str(tmp/'no-month.xlsx'));page.wait_for_function("!document.querySelector('#files').disabled")
    assert '연월이 필요' in page.locator('#status').inner_text()
    page.locator('#calendar-month').fill('2026-11');page.locator('#retry').click();page.wait_for_function("!document.querySelector('#files').disabled")
    assert '2026-11-01 10:00 재인식 회의' in page.locator('#source-text').input_value()
    # Corrupted Office and unsupported legacy formats return actionable errors.
    for name in ['broken.xlsx','broken.docx','old.xls','old.doc']:
        page.locator('#files').set_input_files({'name':name,'mimeType':'application/octet-stream','buffer':b'bad'})
        page.wait_for_function("!document.querySelector('#files').disabled")
        assert '다시 저장' in page.locator('#file-list').inner_text(),name
    for width in [320,375,390,768,1280]:
        page.set_viewport_size({'width':width,'height':850});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
    assert not errors,errors
    print('PASS: retained-file retry, corrupt/legacy input, no fabricated month, responsive settings',flush=True)
    browser.close()
server.shutdown()
