const escapeHtml=(value:any)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money=(value:any)=>value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value).toFixed(2):'Unavailable';
export function gatePassPrintHtml(pass:any,logo:string,photo:string){
 const e=escapeHtml;
 const line=(label:string,value:any)=>`<div class="line"><b>${e(label)}:</b> ${e(value||'-')}</div>`;
 const copy=(name:string)=>`<section><header><img class="logo" src="${e(logo)}" alt="Academy logo"/><div class="academy"><h2>Al-Ameen Mission Academy, Memari</h2><p>Memari, Purba Bardhaman - 713146</p><small>Run by: Al-Ameen Mission Trust, Khalatpur, Howrah</small></div>${photo?`<img class="student-photo" src="${e(photo)}" alt="Student photo"/>`:'<div class="student-photo empty"></div>'}</header><div class="copy">${name}</div><h3>Token No: <span>${e(pass.token_no)}</span></h3>${line('Name',pass.student_name)}${line('Registration No',pass.registration_no)}${line('Guardian Name',pass.guardian_name||pass.father_name)}<div class="line"><b>Class:</b> ${e(pass.class_name||'-')} &nbsp; <b>Room:</b> ${e(pass.room_name||'-')}</div>${line('Reason for Leave',pass.reason)}${line('Departure Date',pass.departure_text)}${line('Return Date',pass.expected_return_text)}<div class="line"><b>SDF Balance:</b> Rs. ${money(pass.sdf_balance)} &nbsp; <b>Due:</b> Rs. ${money(pass.sdf_due)}</div><div class="line"><b>Monthly Fees Due:</b> Rs. ${money(pass.monthly_fees_due)}</div><div class="line warning"><b>If Not Return On Specified Day:</b><br/>${e(pass.late_note||'Contact the Academy office immediately.')}</div><footer>${name==='Office Copy'?'<span>Student</span><span>Guardian</span>':''}<span class="officer">Officer In Charge</span></footer></section>`;
 return `<!doctype html><html><head><meta charset="utf-8"><title>Gate Pass ${e(pass.token_no)}</title><style>
 @page{size:A4 landscape;margin:0}
 *{box-sizing:border-box}html,body{width:297mm;height:210mm;margin:0;padding:0;color:#111;font:13px Arial,sans-serif}
 .sheet{width:297mm;height:210mm;padding:5mm;display:grid;grid-template-columns:287mm;grid-template-rows:97mm 6mm 97mm;break-inside:avoid;page-break-inside:avoid}
 section{width:287mm;height:97mm;border:1px solid #222;padding:5mm;position:relative;display:block;min-width:0;overflow:hidden;break-inside:avoid}
 header{display:grid;grid-template-columns:18mm 1fr 19mm;gap:2mm;align-items:center;text-align:center;border-bottom:1px solid #aaa;padding-bottom:1.5mm;min-height:21mm}
 .logo{width:16mm;height:18mm;object-fit:contain;display:block}.student-photo{width:22mm;height:25mm;object-fit:cover;border:1px solid #555;display:block}.empty{border:0}
 h2{font-size:24px;line-height:1.15;margin:0 0 3px}.academy p{font-size:13px;line-height:1.2;margin:0 0 2px}.academy small{font-size:9px;line-height:1.2;display:block}
 .copy{text-align:right;font-weight:bold;font-size:13px;margin:1.5mm 0 1mm}h3{font-size:16px;margin:1mm 0 1.5mm}h3 span{color:#c00}
 .line{display:inline-block;width:50%;vertical-align:top;padding:1.5mm 0;border-bottom:1px solid #ddd;line-height:1.2;font-size:12px;overflow-wrap:anywhere}.warning{display:block;width:100%;background:#fff8df;padding:1.5mm;margin-top:0.5mm}
 footer{position:absolute;left:5mm;right:5mm;bottom:4mm;display:flex;justify-content:space-between;gap:3mm;padding-top:3mm;font-size:12px}footer span{border-top:1px dotted #222;padding-top:1mm}.officer{margin-left:auto}
 .cut{width:287mm;height:6mm;display:flex;align-items:center;justify-content:center;border-top:1px dashed #777;border-bottom:1px dashed #777;font-size:9px;letter-spacing:1px}
 @media screen{body{background:#eee;padding:10px}.sheet{background:#fff;margin:auto}}
 @media print{html,body{width:297mm;height:210mm}.warning{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
 </style></head><body><main class="sheet">${copy('Guardian Copy')}<div class="cut">CUT HERE</div>${copy('Office Copy')}</main></body></html>`;
}
export async function printImageDataUri(url:string){
 if(!url)return '';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(url,{signal:controller.signal});
  if(!response.ok)return url;
  const blob=await response.blob();
  return await new Promise<string>(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>resolve(url);reader.readAsDataURL(blob);});
 }finally{clearTimeout(timer);}
}
export async function waitForPrintImages(doc:Document){
 await Promise.all(Array.from(doc.images).map(image=>new Promise<void>(resolve=>{
  const timer=setTimeout(finish,20000);
  const finish=()=>{clearTimeout(timer);image.onload=null;image.onerror=null;resolve();};
  if(image.complete){finish();return;}
  image.onload=finish;image.onerror=finish;
 })));
 await doc.fonts?.ready;
}
