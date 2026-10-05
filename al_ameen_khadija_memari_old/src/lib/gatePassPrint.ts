const escapeHtml=(value:any)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money=(value:any)=>value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value).toFixed(2):'Unavailable';
export function gatePassPrintHtml(pass:any,logo:string,photo:string){
 const e=escapeHtml;
 const value=(label:string,data:any)=>`<div><b>${e(label)}:</b> ${e(data||'-')}</div>`;
 const copy=(name:string)=>`<section><header><img class="logo" src="${e(logo)}" alt="Academy logo"/><div class="academy"><h2>Al-Ameen Mission Academy, Memari</h2><p>Memari, Purba Bardhaman - 713146</p><small>Run By: Al-Ameen Mission Trust, Khalatpur, Howrah</small></div>${photo?`<img class="student-photo" src="${e(photo)}" alt="Student photo"/>`:'<div class="student-photo empty"></div>'}</header><div class="copy">${name}</div><h3>Token No: <span>${e(pass.token_no)}</span></h3><div class="details"><div>${value('Name',pass.student_name)}${value('Guardian',pass.guardian_name||pass.father_name)}${value('Reason For Leave',pass.reason)}${value('Departure',pass.departure_text)}</div><div>${value('Reg',pass.registration_no)}${value('Class',pass.class_name||'-')}${value('Arrival',pass.expected_return_text||'-')}<div><b>SDF Balance:</b> Rs. ${money(pass.sdf_balance)}</div><div><b>Monthly Fees Due:</b> Rs. ${money(pass.monthly_fees_due)}</div></div></div><div class="warning"><b>If Not Come On Specified Day:</b> ${e(pass.late_note||'Have to be Paid as Fine Rs-300 Per Day')}</div><footer>${name==='Office Copy'?'<span>Student</span><span>Guardian</span>':''}<span class="officer">Officer In Charge</span></footer></section>`;
 return `<!doctype html><html><head><meta charset="utf-8"><title>Gate Pass ${e(pass.token_no)}</title><style>
 @page{size:A4 landscape;margin:0}
 *{box-sizing:border-box}html,body{width:297mm;height:210mm;margin:0;padding:0;color:#111;font:13px Arial,sans-serif}
 .sheet{width:297mm;height:210mm;padding:8mm 0 0 12mm;display:grid;grid-template-columns:180mm;grid-template-rows:88mm 7mm 88mm;break-inside:avoid;page-break-inside:avoid}
 section{width:180mm;height:88mm;border:1px solid #222;padding:4mm;position:relative;overflow:hidden;break-inside:avoid}
 header{display:grid;grid-template-columns:22mm 1fr 22mm;gap:3mm;align-items:center;text-align:center;border-bottom:1px solid #777;padding-bottom:2mm;min-height:24mm}
 .logo{width:20mm;height:22mm;object-fit:contain;display:block}.student-photo{width:20mm;height:22mm;object-fit:cover;border:1px solid #555;display:block}.empty{border:0}
 h2{font-size:16px;line-height:1.1;margin:0}.academy p{font-size:10px;line-height:1.15;margin:1mm 0}.academy small{font-size:7px;line-height:1.1;display:block}
 .copy{text-align:right;font-weight:bold;font-size:8px;margin:1mm 0}h3{font-size:12px;margin:1mm 0}h3 span{color:#c00}
 .details{display:grid;grid-template-columns:1fr 1fr;gap:3mm;font-size:10px;line-height:1.55}.warning{font-size:10px;margin-top:1mm;line-height:1.3}
 footer{position:absolute;left:4mm;right:4mm;bottom:3mm;display:flex;justify-content:space-between;font-size:10px;font-weight:bold}footer span{border-top:1px dotted #222;padding-top:1mm}.officer{margin-left:auto}
 .cut{width:180mm;height:7mm;display:flex;align-items:center;justify-content:center;border-top:1px dashed #777;border-bottom:1px dashed #777;font-size:8px;letter-spacing:1px}
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
