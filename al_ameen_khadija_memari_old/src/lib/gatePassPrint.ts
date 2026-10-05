const escapeHtml=(value:any)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money=(value:any)=>value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value).toFixed(2):'Unavailable';
export function gatePassPrintHtml(pass:any,logo:string,photo:string){
 const e=escapeHtml;
 const line=(label:string,value:any)=>`<div class="line"><b>${e(label)}:</b> ${e(value||'-')}</div>`;
 const copy=(name:string)=>`<section><header><img class="logo" src="${e(logo)}" alt="Academy logo"/><div class="academy"><h2>Al-Ameen Mission Academy, Memari</h2><p>Memari, Purba Bardhaman - 713146</p><small>Run by: Al-Ameen Mission Trust, Khalatpur, Howrah</small></div>${photo?`<img class="student-photo" src="${e(photo)}" alt="Student photo"/>`:'<div class="student-photo empty"></div>'}</header><div class="copy">${name}</div><h3>Token No: <span>${e(pass.token_no)}</span></h3>${line('Name',pass.student_name)}${line('Registration No',pass.registration_no)}${line('Guardian Name',pass.guardian_name||pass.father_name)}<div class="line"><b>Class:</b> ${e(pass.class_name||'-')} &nbsp; <b>Room:</b> ${e(pass.room_name||'-')}</div><div class="line full"><b>Reason for Leave:</b> ${e(pass.reason||'-')}</div>${line('Departure Date',pass.departure_text)}${line('Return Date',pass.expected_return_text)}<div class="line"><b>SDF Balance:</b> Rs. ${money(pass.sdf_balance)} &nbsp; <b>Due:</b> Rs. ${money(pass.sdf_due)}</div><div class="line"><b>Monthly Fees Due:</b> Rs. ${money(pass.monthly_fees_due)}</div><footer class="${name==='Office Copy'?'office-footer':'guardian-footer'}">${name==='Office Copy'?'<span>Student</span><span>Guardian</span>':''}<span class="officer">Officer In Charge</span></footer></section>`;
 return `<!doctype html><html><head><meta charset="utf-8"><title>Gate Pass ${e(pass.token_no)}</title><style>
 @page{size:A4 landscape;margin:0}
 *{box-sizing:border-box}html,body{width:297mm;height:210mm;margin:0;padding:0;color:#111;font:15px Arial,sans-serif}
 .sheet{width:297mm;min-height:210mm;height:auto;padding:25mm 5mm 5mm;display:grid;grid-template-columns:203.5mm;grid-template-rows:127.8mm 10mm 127.8mm;break-inside:avoid;page-break-inside:avoid}
 section{width:203.5mm;height:127.8mm;border:1px solid #222;border-right:2px solid #222!important;box-shadow:inset -1px 0 0 #222;padding:5mm;position:relative;display:block;min-width:0;overflow:hidden;break-inside:avoid}
 header{display:grid;grid-template-columns:18mm 1fr 22mm;gap:2mm;align-items:center;text-align:center;border-bottom:1px solid #aaa;padding:0 27mm 1mm 0;min-height:25mm;position:relative}
 .logo{width:16mm;height:18mm;object-fit:contain;display:block}.student-photo{width:22mm;height:25mm;object-fit:cover;border:1px solid #555;display:block;position:absolute;right:5mm;top:0;z-index:2}.empty{border:0}
 h2{font-size:26px;line-height:1.1;margin:0 0 2px}.academy p{font-size:15px;line-height:1.15;margin:0 0 2px}.academy small{font-size:11px;line-height:1.1;display:block}
 .copy{text-align:right;font-weight:bold;font-size:15px;margin:1mm 0}h3{font-size:19px;margin:1mm 0}h3 span{color:#c00}
 .line{display:inline-block;width:50%;vertical-align:top;padding:2mm 0;border-bottom:1px solid #ddd;line-height:1.25;font-size:18px;overflow-wrap:anywhere}.line.full{display:block;width:100%}
 footer{position:absolute;left:5mm;right:5mm;bottom:4mm;padding-top:4mm;font-size:18px}footer span{border-top:1px dotted #222;padding-top:1mm}.office-footer{display:grid;grid-template-columns:1fr 1fr 1fr}.office-footer span:nth-child(2){text-align:center}.office-footer .officer{text-align:right}.guardian-footer{display:flex}.guardian-footer .officer{margin-left:auto}
 .cut{width:203.5mm;height:10mm;display:flex;align-items:center;justify-content:center;border-top:1px dashed #777;border-bottom:1px dashed #777;font-size:11px;letter-spacing:1px}
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
  const finish=()=>{clearTimeout(timer);image.onload=null;image.onerror=null;resolve();};
  const timer=setTimeout(finish,20000);
  if(image.complete){finish();return;}
  image.onload=finish;image.onerror=finish;
 })));
 await doc.fonts?.ready;
}
