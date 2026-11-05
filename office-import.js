import {normalizeTable} from './document-layout.js';

const loaded=new Map();
function loadScript(name,globalName) {
  if(globalThis[globalName])return Promise.resolve(globalThis[globalName]);
  if(!loaded.has(name))loaded.set(name,new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=new URL(`./vendor/${name}`,import.meta.url).href;
    script.onload=()=>globalThis[globalName]?resolve(globalThis[globalName]):reject(Error('문서 처리 기능을 초기화하지 못했습니다.'));
    script.onerror=()=>{loaded.delete(name);script.remove();reject(Error('문서 처리 파일을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'));};document.head.append(script);
  }));
  return loaded.get(name);
}
function inspectArchive(buffer) {
  // Bound the declared expanded OOXML data before handing ZIPs to the document libraries.
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);let entries=0,size=0;
  if(bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('올바른 문서가 아니거나 암호로 보호된 문서입니다. 암호 없이 XLSX·DOCX로 다시 저장해 주세요.');
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
    if(view.getUint32(i,true)!==0x06054b50)continue;
    const count=view.getUint16(i+10,true),offset=view.getUint32(i+16,true);
    if(count===65535||offset===0xffffffff)throw Error('이 문서는 너무 큽니다. 필요한 시트·페이지만 별도 파일로 저장해 주세요.');
    let pos=offset;
    for(let n=0;n<count;n++){
      if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)throw Error('문서 압축 구조가 손상되었습니다.');
      if(view.getUint16(pos+8,true)&1)throw Error('암호가 걸린 문서는 지원하지 않습니다.');
      entries++;size+=view.getUint32(pos+24,true);if(entries>5000||size>100*1024*1024)throw Error('압축을 푼 문서가 너무 큽니다. 파일을 나눠 주세요.');
      pos+=46+view.getUint16(pos+28,true)+view.getUint16(pos+30,true)+view.getUint16(pos+32,true);
    }
    return;
  }
  throw Error('문서 압축 구조를 읽지 못했습니다. XLSX·DOCX 파일을 다시 저장해 주세요.');
}
function cellText(cell) {
  let value=cell.value;
  if(cell.isMerged&&cell.master.address!==cell.address)return '';
  if(value instanceof Date) {
    // ExcelJS represents serial dates in UTC. Preserve the spreadsheet's wall date/time.
    const iso=value.toISOString();if(iso.slice(0,10)==='1899-12-30'||iso.slice(0,10)==='1899-12-31')return iso.slice(11,16);return /[hs]/i.test(cell.numFmt||'')?iso.slice(0,10)+' '+iso.slice(11,16):iso.slice(0,10);
  }
  if(value&&typeof value==='object') {
    if('formula'in value||'sharedFormula'in value){value=value.result;if(value===undefined)return '';}
    else if(value.richText)return value.richText.map(r=>r.text).join('');
    else if(value.text!==undefined)return String(value.text);
    else if(value.error)return '';
  }
  if(typeof value==='number'&&value>=0&&value<1&&/[hs]/i.test(cell.numFmt||'')){
    const minutes=Math.round(value*1440)%1440;return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
  }
  return value==null?'':String(value);
}
export async function readExcel(file,options={}) {
  const data=await file.arrayBuffer();inspectArchive(data);
  const ExcelJS=await loadScript('exceljs.min.js','ExcelJS');const book=new ExcelJS.Workbook();
  try{await book.xlsx.load(data);}catch{throw Error('Excel 파일을 읽지 못했습니다. 암호 없이 .xlsx 형식으로 다시 저장해 주세요.');}
  if(book.worksheets.length>30)throw Error('시트는 최대 30개까지 읽을 수 있습니다. 필요한 시트만 별도 저장해 주세요.');
  const results=[];
  for(const sheet of book.worksheets){
    if(sheet.state==='veryHidden'||sheet.state==='hidden')continue;
    if(sheet.rowCount>10000||sheet.columnCount>100)throw Error(`${sheet.name}: 시트 범위가 너무 큽니다. 10,000행·100열 이내로 줄여 주세요.`);
    const rows=[];sheet.eachRow({includeEmpty:true},row=>{const cells=[];for(let c=1;c<=sheet.columnCount;c++)cells.push(cellText(row.getCell(c)));rows.push(cells);});
    if(rows.some(r=>r.some(Boolean)))results.push({...normalizeTable(rows,options),name:sheet.name});
  }
  return results;
}
export async function readWord(file,options={}) {
  const arrayBuffer=await file.arrayBuffer();inspectArchive(arrayBuffer);
  const mammoth=await loadScript('mammoth.browser.min.js','mammoth');let output;
  try{output=await mammoth.convertToHtml({arrayBuffer},{externalFileAccess:false,includeEmbeddedStyleMap:false,includeDefaultStyleMap:true,convertImage:mammoth.images.imgElement(async()=>({src:''}))});}
  catch{throw Error('Word 파일을 읽지 못했습니다. 암호 없이 .docx 형식으로 다시 저장해 주세요.');}
  // Parse inert HTML only. Never mount document-generated HTML, links or images into the page.
  const doc=new DOMParser().parseFromString(output.value,'text/html');
  for(const br of doc.querySelectorAll('br'))br.replaceWith(doc.createTextNode('\n'));
  const results=[];let paragraphs=[];
  const flush=()=>{if(paragraphs.length){results.push({text:paragraphs.join('\n'),raw:paragraphs.join('\n'),warnings:[],calendar:false});paragraphs=[];}};
  for(const node of doc.body.children){
    if(node.tagName==='TABLE'){
      flush();const rows=[...node.rows].map(row=>{const cells=[];for(const cell of row.cells){cells.push([...cell.querySelectorAll('p')].map(p=>p.textContent).join('\n')||cell.textContent);for(let n=1;n<cell.colSpan;n++)cells.push('');}return cells;});
      // Month headings often occur immediately before the table.
      const context=[...doc.body.children].slice(0,[...doc.body.children].indexOf(node)).filter(n=>n.tagName!=='TABLE').map(n=>n.textContent).join('\n');
      const inferred=options.month||undefined;
      const normalized=normalizeTable([[context],...rows],{...options,month:inferred});results.push(normalized);
    }else if(node.textContent.trim())paragraphs.push(node.textContent.trim());
  }
  flush();
  if(doc.querySelector('img'))results.push({text:'',raw:'',warnings:['Word 안의 그림은 글자로 읽지 않았습니다. 그림을 사진 파일로 저장해 따로 넣어 주세요.'],calendar:false});
  return results;
}
