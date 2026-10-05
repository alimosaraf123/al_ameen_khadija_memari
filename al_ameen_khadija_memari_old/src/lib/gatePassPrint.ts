const escapeHtml=(value:any)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money=(value:any)=>value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value).toFixed(2):'Unavailable';
export function gatePassPrintHtml(pass:any,logo:string,photo:string){
 const e=escapeHtml;
 const line=(label:string,value:any)=>`<div class="line"><b>${e(label)}:</b> ${e(value||'-')}</div>`;
 const copy=(name:string)=>`<section><header><img class="logo" src="${e(logo)}" alt="Academy logo"/><div class="academy"><h2>Al-Ameen Mission Academy, Memari</h2><p>Memari, Purba Bardhaman - 713146</p><small>Run by: Al-Ameen Mission Trust, Khalatpur, Howrah</small></div>${photo?`<img class="student-photo" src="${e(photo)}" alt="Student photo"/>`:'<div class="student-photo empty"></div>'}</header><div class="copy">${name}</div><h3>Token No: <span>${e(pass.token_no)}</span></h3>${line('Name',pass.student_name)}${line('Registration No',pass.registration_no)}${line('Guardian Name',pass.guardian_name||pass.father_name)}<div class="line"><b>Class:</b> ${e(pass.class_name||'-')} &nbsp; <b>Room:</b> ${e(pass.room_name||'-')}</div>${line('Reason for Leave',pass.reason)}${line('Departure Date',pass.departure_text)}${line('Return Date',pass.expected_return_text)}<div class="line"><b>SDF Balance:</b> Rs. ${money(pass.sdf_balance)} &nbsp; <b>Due:</b> Rs. ${money(pass.sdf_due)}</div><div class="line"><b>Monthly Fees Due:</b> Rs. ${money(pass.monthly_fees_due)}</div><div class="line warning"><b>If Not Return On Specified Day:</b><br/>${e(pass.late_note||'Contact the Academy office immediately.')}</div><footer>${name==='Office Copy'?'<span>Student</span><span>Guardian</span>':''}<span class="officer">Officer In Charge</span></footer></section>`;
 return `<!doctype html><html><head><meta charset="utf-8"><title>Gate Pass ${e(pass.token_no)}</title><style>
 @page{size:21cm 14cm;margin:0}
 *{box-sizing:border-box}html,body{width:21cm;height:14cm;margin:0;padding:0;color:#111;font:10px Arial,sans-serif}
 .sheet{width:14cm;height:21cm;padding:0.35cm;display:grid;transform:rotate(90deg);transform-origin:center center;grid-template-columns:13.3cm;grid-template-rows:9.8cm 0.3cm 9.8cm;break-inside:avoid;page-break-inside:avoid}
 section{width:13.3cm;height:9.8cm;border:1px solid #222;padding:4mm;position:relative;display:flex;flex-direction:column;min-width:0;break-inside:avoid}
 header{display:grid;grid-template-columns:18mm 1fr 19mm;gap:2mm;align-items:center;text-align:center;border-bottom:1px solid #aaa;padding-bottom:3mm;min-height:42mm}
 .logo{width:18mm;height:20mm;object-fit:contain}.student-photo{width:19mm;height:24mm;object-fit:cover;border:1px solid #aaa}.empty{border:0}
 h2{font-size:27px;line-height:1.2;margin:0 0 8px}.academy p{font-size:16px;line-height:1.3;margin:0 0 4px}.academy small{font-size:13px;line-height:1.3;display:block}
 .copy{text-align:right;font-weight:bold;font-size:18px;margin:5mm 0 2mm}h3{font-size:24px;margin:2mm 0 5mm}h3 span{color:#c00}
 .line{padding:4.5mm 0;border-bottom:1px solid #ddd;line-height:1.35;overflow-wrap:anywhere}.warning{background:#fff8df;padding:2.5mm;margin-top:1mm}
 footer{display:flex;justify-content:space-between;gap:3mm;margin-top:auto;padding-top:15mm;font-size:18px}footer span{border-top:1px dotted #222;padding-top:2mm}.officer{margin-left:auto}
 .cut{width:13.3cm;height:0.3cm;display:flex;align-items:center;justify-content:center;border-top:1px dashed #777;border-bottom:1px dashed #777;font-size:8px;letter-spacing:1px}
 @media screen{body{background:#eee;padding:10px}.sheet{background:#fff;margin:auto}}
 @media print{html,body{width:21cm;height:14cm}.warning{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
 </style></head><body><main class="sheet">${copy('Guardian Copy')}<div class="cut">CUT HERE</div>${copy('Office Copy')}</main></body></html>`;
}
export async function printImageDataUri(url:string){
 if(!url)return '';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(url,{signal:controller.signal});
  if(!response.ok)throw new Error('Photo or logo could not be loaded. Please try again.');
  const blob=await response.blob();
  return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Unable to prepare the print image.'));reader.readAsDataURL(blob);});
 }finally{clearTimeout(timer);}
}
export async function waitForPrintImages(doc:Document){
 await Promise.all(Array.from(doc.images).map(image=>new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>finish(new Error('Print images did not finish loading.')),20000);
  const finish=(error?:Error)=>{clearTimeout(timer);image.onload=null;image.onerror=null;if(error)reject(error);else resolve();};
  if(image.complete){finish(image.naturalWidth>0?undefined:new Error('A print image could not be loaded.'));return;}
  image.onload=()=>finish();image.onerror=()=>finish(new Error('A print image could not be loaded.'));
 })));
 await doc.fonts?.ready;
}
