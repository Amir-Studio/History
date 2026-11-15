(()=>{'use strict';
const $=id=>document.getElementById(id);
const API='https://oolfbjxclhzlbwjmzxxx.supabase.co/functions/v1/market-api';
const assets={USD_IRR_FREE:'دلار آزاد',GOLD_18K_IRR:'طلای ۱۸ عیار',EUR_IRR_FREE:'یورو آزاد',COIN_EMAMI_IRR:'سکه امامی'};
const nf=new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2});
const whole=new Intl.NumberFormat('fa-IR',{maximumFractionDigits:0});
const pct=v=>numeric(v)===null?'—':nf.format(numeric(v))+'٪';
const money=v=>numeric(v)===null?'—':whole.format(numeric(v))+' تومان';
const date=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('fa-IR',{dateStyle:'short',timeStyle:'short'}).format(d)};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={byHorizon:{},filtered:[],asset:'USD_IRR_FREE',horizon:7,backtest:null,meta:null,learning:[],diagnostics:[]};
function set(id,value){const el=$(id);if(el)el.textContent=value}
function numeric(v){
 if(v===null||v===undefined||typeof v==='boolean')return null;
 if(typeof v==='number')return Number.isFinite(v)?v:null;
 let s=String(v).trim();if(!s)return null;
 s=s.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
 s=s.replace(/[\u00a0\u202f\s]/g,'').replace(/[٪%]/g,'').replace(/تومان|ریال|IRR|IRT/gi,'');
 if(/^\(.*\)$/.test(s))s='-'+s.slice(1,-1);
 s=s.replace(/٫/g,'.').replace(/٬/g,'');
 if(s.includes('.')&&s.includes(',')){if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'')}
 else if(s.includes(',')){const parts=s.split(',');if(parts.length>2||/^\d{1,3}(,\d{3})+$/.test(s))s=s.replace(/,/g,'');else s=s.replace(',','.')}
 s=s.replace(/[^0-9eE+\-.]/g,'');
 if(!s||!/[0-9]/.test(s))return null;
 const n=Number(s);return Number.isFinite(n)?n:null;
}
function errorPct(row){const p=numeric(row?.predicted_price),a=numeric(row?.actual_price);return p!==null&&a!==null&&a>0?Math.abs((p-a)/a*100):null}
function directionIsCorrect(row){
 const p=numeric(row?.predicted_price),r=numeric(row?.reference_price),a=numeric(row?.actual_price);
 if(p===null||r===null||a===null||r<=0)return null;
 const predicted=p-r,actual=a-r;
 if(predicted===0||actual===0)return null;
 return Math.sign(predicted)===Math.sign(actual);
}
function evaluated(rows){return rows.filter(x=>x.status==='evaluated'&&numeric(x.actual_price)>0&&numeric(x.predicted_price)!==null)}
function stats(rows){
 const done=evaluated(rows),errors=done.map(errorPct).filter(x=>x!==null);
 const signed=done.map(x=>(numeric(x.predicted_price)-numeric(x.actual_price))/numeric(x.actual_price)*100).filter(Number.isFinite);
 const baselineRows=done.filter(x=>numeric(x.reference_price)!==null&&numeric(x.reference_price)>0);
 const modelOnBaseline=baselineRows.map(errorPct).filter(x=>x!==null);
 const base=baselineRows.map(x=>Math.abs((numeric(x.reference_price)-numeric(x.actual_price))/numeric(x.actual_price)*100)).filter(Number.isFinite);
 const directional=done.map(x=>directionIsCorrect(x)).filter(x=>x!==null);
 const ranged=done.filter(x=>numeric(x.lower_price)!==null&&numeric(x.upper_price)!==null&&numeric(x.lower_price)<=numeric(x.upper_price));
 const covered=ranged.filter(x=>numeric(x.actual_price)>=numeric(x.lower_price)&&numeric(x.actual_price)<=numeric(x.upper_price));
 const widths=ranged.map(x=>numeric(x.reference_price)>0?(numeric(x.upper_price)-numeric(x.lower_price))/numeric(x.reference_price)*100:null).filter(x=>x!==null&&Number.isFinite(x)&&x>=0);
 const sortedErrors=errors.slice().sort((a,b)=>a-b);
 const quantile=q=>sortedErrors.length?sortedErrors[Math.min(sortedErrors.length-1,Math.ceil(q*sortedErrors.length)-1)]:null;
 const median=sortedErrors.length?(sortedErrors.length%2?sortedErrors[(sortedErrors.length-1)/2]:(sortedErrors[sortedErrors.length/2-1]+sortedErrors[sortedErrors.length/2])/2):null;
 const p90=quantile(.9);
 const mae=errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:null;
 const rmse=errors.length?Math.sqrt(errors.reduce((a,b)=>a+b*b,0)/errors.length):null;
 const baseMae=base.length?base.reduce((a,b)=>a+b,0)/base.length:null;
 const pairedModelMae=modelOnBaseline.length?modelOnBaseline.reduce((a,b)=>a+b,0)/modelOnBaseline.length:null;
 return {samples:done.length,mae,rmse,median,p90,baseMae,skill:pairedModelMae!==null&&baseMae>0?(1-pairedModelMae/baseMae)*100:null,
  directional:directional.length?directional.filter(Boolean).length/directional.length*100:null,
  directionalN:directional.length,coverage:ranged.length?covered.length/ranged.length*100:null,rangeN:ranged.length,rangeWidth:widths.length?widths.reduce((a,b)=>a+b,0)/widths.length:null,
  bias:signed.length?signed.reduce((a,b)=>a+b,0)/signed.length:null,
  within2:errors.length?errors.filter(x=>x<=2).length/errors.length*100:null,
  within5:errors.length?errors.filter(x=>x<=5).length/errors.length*100:null};
}
async function get(path){const r=await fetch(API+path,{headers:{accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(25000)});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||'پاسخ سرویس نامعتبر بود ('+r.status+')');return d}
function currentRows(){
 const all=state.byHorizon[String(state.horizon)]||[];
 const days=$('period').value,cut=days==='all'?0:Date.now()-Number(days)*86400000;
 return all.filter(x=>{
  const issued=Date.parse(x.issued_at||'');
  if(cut&&(!Number.isFinite(issued)||issued<cut))return false;
  if($('status').value!=='all'&&x.status!==$('status').value)return false;
  if($('model').value!=='all'&&x.model_version!==$('model').value)return false;
  return true;
 });
}
function modelOptions(){
 const select=$('model'),old=select.value;
 const versions=[...new Set((state.byHorizon[String(state.horizon)]||[]).map(x=>x.model_version).filter(Boolean))];
 select.innerHTML='<option value="all">همهٔ نسخه‌ها</option>'+versions.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
 if(versions.includes(old))select.value=old;
}
function renderStats(rows){
 const s=stats(rows),pending=rows.filter(x=>x.status==='pending').length,invalid=rows.filter(x=>x.status==='invalidated').length;
 set('samples',nf.format(s.samples));set('mae',pct(s.mae));set('rmse',pct(s.rmse));set('medianError',pct(s.median));set('p90Error',pct(s.p90));set('baseMae',pct(s.baseMae));set('rangeWidth',pct(s.rangeWidth));set('within2',pct(s.within2));set('within5',pct(s.within5));set('skill',pct(s.skill));
 set('skillHint',s.skill===null?'برای مقایسه، نمونهٔ معتبر کافی نیست':s.skill>=0?'بهتر از مبنای بدون تغییر':'ضعیف‌تر از مبنای بدون تغییر');
 set('direction',pct(s.directional));set('directionHint','نمونهٔ جهت‌دار: '+nf.format(s.directionalN));
 set('coverage',pct(s.coverage));set('coverageHint','نمونهٔ دارای بازه: '+nf.format(s.rangeN));
 set('bias',pct(s.bias));set('biasHint',s.bias===null?'نیازمند دادهٔ ارزیابی‌شده':s.bias>0?'مدل به‌طور متوسط بالاتر برآورد کرده':s.bias<0?'مدل به‌طور متوسط پایین‌تر برآورد کرده':'بدون سوگیری میانگین قابل‌توجه');
 set('pending',nf.format(pending));
 const total=rows.length, integrity=$('integrity');
 let title='نمونهٔ کافی برای قضاوت وجود ندارد',message='تا وقتی پیش‌بینی‌ها به زمان هدف نرسند و قیمت واقعی ثبت نشود، نمی‌توان دقت زنده را محاسبه کرد.';
 if(s.samples>=30){title='نمونهٔ زنده قابل تحلیل';message='شاخص‌ها از '+nf.format(s.samples)+' پیش‌بینی ارزیابی‌شده محاسبه شده‌اند. برای نتیجه‌گیری پایدار، عملکرد را در دوره‌ها و نسخه‌های مختلف نیز مقایسه کن.';integrity.classList.add('ready')}
 else if(s.samples>0){title='نمونهٔ اولیه؛ نتیجه مقدماتی است';message='فقط '+nf.format(s.samples)+' نمونهٔ ارزیابی‌شده در فیلتر فعلی وجود دارد؛ درصدها هنوز ناپایدارند و نباید به کل عملکرد مدل تعمیم داده شوند.';integrity.classList.remove('ready')}
 else {integrity.classList.remove('ready')}
 if(invalid)message+=' '+nf.format(invalid)+' رکورد باطل‌شده جداگانه نگهداری شده است.';
 if(total===0)message='برای ترکیب فیلترشده رکوردی در دفتر دریافت نشد.';
 set('integrityTitle',title);set('integrityText',message);
 return s;
}
function svgChart(rows){
 const el=$('priceChart'),data=rows.filter(x=>numeric(x.predicted_price)!==null&&x.target_at).slice().sort((a,b)=>Date.parse(a.target_at)-Date.parse(b.target_at));
 if(!data.length){el.innerHTML='<div class="empty">برای این فیلتر، پیش‌بینی ثبت‌شده‌ای وجود ندارد.</div>';return}
 const W=1000,H=340,L=88,R=24,T=22,B=52,PW=W-L-R,PH=H-T-B;
 const vals=data.flatMap(x=>[numeric(x.predicted_price),numeric(x.actual_price),numeric(x.lower_price),numeric(x.upper_price)]).filter(x=>x!==null);
 let lo=Math.min(...vals),hi=Math.max(...vals);if(!(hi>lo)){lo*=.99;hi*=1.01}
 const pad=(hi-lo)*.12;lo-=pad;hi+=pad;
 const x=i=>L+(data.length<2?PW/2:i/(data.length-1)*PW),y=v=>T+(hi-v)/(hi-lo)*PH;
 const grid=Array.from({length:5},(_,i)=>{const v=hi-(hi-lo)*i/4,yy=T+PH*i/4;return '<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" stroke="rgba(190,180,160,.14)"/><text x="'+(L-12)+'" y="'+(yy+4)+'" text-anchor="end" fill="#8d887f" font-size="11">'+esc(whole.format(v))+'</text>'}).join('');
 const line=(key)=>{const segments=[];let current=[];data.forEach((r,i)=>{const v=numeric(r[key]);if(v===null){if(current.length)segments.push(current);current=[]}else current.push({x:x(i),y:y(v)})});if(current.length)segments.push(current);return segments.filter(s=>s.length>1).map(points=>'<polyline fill="none" stroke="'+(key==='actual_price'?'#9ebc9c':'#e4cc9e')+'" stroke-width="'+(key==='actual_price'?3:2.4)+'" stroke-linecap="round" stroke-linejoin="round" points="'+points.map(p=>p.x+','+p.y).join(' ')+'"/>').join('')};
 const rangePts=data.map((r,i)=>({x:x(i),lo:numeric(r.lower_price),hi:numeric(r.upper_price)})).filter(p=>p.lo!==null&&p.hi!==null);
 const rangeSegments=[];let activeRange=[];data.forEach((r,i)=>{const a=numeric(r.lower_price),b=numeric(r.upper_price);if(a===null||b===null||a>b){if(activeRange.length)rangeSegments.push(activeRange);activeRange=[]}else activeRange.push({x:x(i),lo:a,hi:b})});if(activeRange.length)rangeSegments.push(activeRange);
 const band=rangeSegments.filter(s=>s.length>1).map(seg=>'<polygon fill="rgba(198,166,107,.13)" stroke="none" points="'+seg.map(p=>p.x+','+y(p.hi)).join(' ')+' '+seg.slice().reverse().map(p=>p.x+','+y(p.lo)).join(' ')+'"/>').join('');
 const predicted=data.map((r,i)=>'<circle cx="'+x(i)+'" cy="'+y(numeric(r.predicted_price))+'" r="3.1" fill="#e4cc9e"><title>پیش‌بینی: '+esc(money(r.predicted_price))+' · '+esc(date(r.target_at))+'</title></circle>').join('');
 const actual=data.map((r,i)=>numeric(r.actual_price)!==null?'<circle cx="'+x(i)+'" cy="'+y(numeric(r.actual_price))+'" r="4" fill="#9ebc9c"><title>واقعی: '+esc(money(r.actual_price))+' · خطا: '+esc(pct(errorPct(r)))+'</title></circle>':'').join('');
 const step=Math.max(1,Math.ceil(data.length/6));
 const labels=data.map((r,i)=>i%step===0?'<text x="'+x(i)+'" y="'+(H-18)+'" text-anchor="middle" fill="#8d887f" font-size="10">'+esc(new Intl.DateTimeFormat('fa-IR',{month:'short',day:'numeric'}).format(new Date(r.target_at)))+'</text>':'').join('');
 el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="مقایسه قیمت پیش‌بینی‌شده و واقعی">'+grid+band+line('predicted_price')+line('actual_price')+predicted+actual+labels+'</svg>';
 const done=evaluated(data).length;
 set('priceChartNote','تعداد نقاط پیش‌بینی: '+nf.format(data.length)+' · دارای قیمت واقعی: '+nf.format(done)+' · نوار سایه‌دار فقط در رکوردهایی رسم می‌شود که بازهٔ پایین و بالا ثبت شده باشد.');
}
function renderHistogram(rows){
 const el=$('errorHistogram'),errors=evaluated(rows).map(errorPct).filter(x=>x!==null);
 if(!errors.length){el.innerHTML='<div class="empty">هنوز نمونهٔ سررسیدشده‌ای برای محاسبهٔ توزیع خطا وجود ندارد.</div>';return}
 const bins=[{label:'۰–۱٪',n:0,ok:true},{label:'۱–۲٪',n:0,ok:true},{label:'۲–۵٪',n:0,ok:false},{label:'۵–۱۰٪',n:0,ok:false},{label:'۱۰٪+',n:0,ok:false}];
 errors.forEach(e=>{const i=e<=1?0:e<=2?1:e<=5?2:e<=10?3:4;bins[i].n++});
 const max=Math.max(1,...bins.map(b=>b.n));
 el.innerHTML='<div class="histogram">'+bins.map(b=>'<div class="hist-bin"><b>'+nf.format(b.n)+'</b><i style="height:'+Math.max(2,b.n/max*108)+'px;opacity:'+(b.ok?'.95':'.62')+'"></i><small>'+b.label+'</small></div>').join('')+'</div>';
}
function renderTrend(rows){
 const el=$('errorTrend'),data=evaluated(rows).filter(x=>errorPct(x)!==null).sort((a,b)=>Date.parse(a.actual_at||a.target_at)-Date.parse(b.actual_at||b.target_at));
 if(data.length<2){el.innerHTML='<div class="empty">برای نمایش روند، دست‌کم دو پیش‌بینی ارزیابی‌شده لازم است.</div>';return}
 const groups=[];const size=Math.max(2,Math.ceil(data.length/10));
 for(let i=0;i<data.length;i+=size){const part=data.slice(i,i+size),avg=part.reduce((s,x)=>s+errorPct(x),0)/part.length;groups.push({avg,date:part[part.length-1].actual_at||part[part.length-1].target_at,n:part.length})}
 const W=560,H=190,L=48,R=12,T=15,B=36,PW=W-L-R,PH=H-T-B,max=Math.max(2,...groups.map(x=>x.avg))*1.15;
 const pts=groups.map((g,i)=>({x:L+(groups.length===1?PW/2:i/(groups.length-1)*PW),y:T+(max-g.avg)/max*PH,g}));
 const grid=[0,1,2,3].map(i=>{const v=max*i/3,yy=T+PH-i/3*PH;return '<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" stroke="rgba(190,180,160,.13)"/><text x="'+(L-8)+'" y="'+(yy+4)+'" text-anchor="end" fill="#8d887f" font-size="9">'+nf.format(v)+'٪</text>'}).join('');
 el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="روند میانگین خطای پیش‌بینی‌ها">'+grid+'<polyline points="'+pts.map(p=>p.x+','+p.y).join(' ')+'" fill="none" stroke="#e4cc9e" stroke-width="2.5" stroke-linejoin="round"/>'+pts.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="3.5" fill="#c6a66b"><title>میانگین خطا '+esc(pct(p.g.avg))+' · '+p.g.n+' نمونه</title></circle>').join('')+'<text x="'+L+'" y="'+(H-8)+'" fill="#8d887f" font-size="9">قدیمی‌تر</text><text x="'+(W-R)+'" y="'+(H-8)+'" text-anchor="end" fill="#8d887f" font-size="9">جدیدتر</text></svg>';
}
function statusLabel(s){return s==='evaluated'?'ارزیابی‌شده':s==='pending'?'در انتظار':s==='invalidated'?'باطل‌شده':s||'نامشخص'}
function renderLedger(rows){
 const body=$('ledgerRows'),mobile=$('mobileLedger');
 set('ledgerCount',nf.format(rows.length)+' رکورد');
 if(!rows.length){body.innerHTML='<tr><td colspan="13" class="empty">برای این فیلتر رکوردی وجود ندارد.</td></tr>';mobile.innerHTML='<div class="empty">رکوردی وجود ندارد.</div>';return}
 body.innerHTML=rows.map(x=>{
  const done=x.status==='evaluated',err=errorPct(x),status=x.status||'';
  const technical=esc(JSON.stringify({quote_source:x.quote_source||null,quote_observed_at:x.quote_observed_at||null,lower_price:x.lower_price??null,upper_price:x.upper_price??null,model_weights:x.model_weights||{},validation:x.validation||{}},null,2));
  return '<tr><td>'+esc(date(x.issued_at))+'</td><td>'+esc(date(x.target_at))+'</td><td>'+esc(x.model_version||'—')+'</td><td>'+esc(x.quote_source||'—')+'</td><td>'+esc(date(x.quote_observed_at))+'</td><td>'+esc(money(x.reference_price))+'</td><td>'+esc(money(x.predicted_price))+'</td><td>'+esc(money(x.lower_price))+' تا '+esc(money(x.upper_price))+'</td><td>'+esc(done?money(x.actual_price):'—')+'</td><td class="'+(done?(err<=2?'good':err>5?'bad':''):'')+'">'+(done?esc(pct(err)):'—')+'</td><td>'+esc(directionIsCorrect(x)===null?(x.direction||'—'):(directionIsCorrect(x)?'درست':'نادرست'))+'</td><td><span class="status '+esc(status)+'">'+esc(statusLabel(status))+'</span></td><td><details class="record-details"><summary>مشاهدهٔ JSON</summary><pre>'+technical+'</pre></details></td></tr>';
 }).join('');
 mobile.innerHTML=rows.map(x=>{
  const done=x.status==='evaluated',err=errorPct(x),status=x.status||'';
  const technical=esc(JSON.stringify({quote_source:x.quote_source||null,quote_observed_at:x.quote_observed_at||null,lower_price:x.lower_price??null,upper_price:x.upper_price??null,model_weights:x.model_weights||{},validation:x.validation||{}},null,2));
  return '<article class="mobile-record"><div class="mobile-record-head"><span>ثبت: '+esc(date(x.issued_at))+'</span><span class="status '+esc(status)+'">'+esc(statusLabel(status))+'</span></div><div class="mobile-record-grid"><div><span>زمان هدف</span><b>'+esc(date(x.target_at))+'</b></div><div><span>نسخهٔ مدل</span><b>'+esc(x.model_version||'—')+'</b></div><div><span>منبع قیمت</span><b>'+esc(x.quote_source||'—')+'</b></div><div><span>زمان مشاهدهٔ مرجع</span><b>'+esc(date(x.quote_observed_at))+'</b></div><div><span>قیمت مرجع</span><b>'+esc(money(x.reference_price))+'</b></div><div><span>پیش‌بینی</span><b>'+esc(money(x.predicted_price))+'</b></div><div><span>بازهٔ ثبت‌شده</span><b>'+esc(money(x.lower_price))+' تا '+esc(money(x.upper_price))+'</b></div><div><span>قیمت واقعی</span><b>'+esc(done?money(x.actual_price):'—')+'</b></div><div><span>خطای مطلق</span><b class="'+(done?(err<=2?'good':err>5?'bad':''):'')+'">'+(done?esc(pct(err)):'—')+'</b></div></div><details class="record-details"><summary>جزئیات فنی و وزن مدل‌ها</summary><pre>'+technical+'</pre></details></article>';
 }).join('');
 const meta=state.meta||{};set('ledgerFoot','نمایش '+nf.format(rows.length)+' رکورد از حداکثر '+nf.format(meta.limit||500)+' رکورد آخر این دارایی و افق. '+(meta.truncated?'احتمال وجود سوابق قدیمی‌تر خارج از این صفحه وجود دارد.':'داده‌های دریافتی در سقف درخواست کامل‌اند.')+' زمان همگام‌سازی: '+date(meta.generated_at));
}
function renderHorizons(){
 const tbody=$('horizonTable'),mobile=$('mobileHorizons'),items=[1,3,7].map(h=>({h,s:stats(state.byHorizon[String(h)]||[])}));
 tbody.innerHTML=items.map(x=>'<tr><td>'+nf.format(x.h)+' روز</td><td>'+nf.format(x.s.samples)+'</td><td>'+esc(pct(x.s.mae))+'</td><td>'+esc(pct(x.s.rmse))+'</td><td>'+esc(pct(x.s.directional))+'</td><td>'+esc(pct(x.s.coverage))+'</td><td>'+esc(pct(x.s.skill))+'</td></tr>').join('');
 mobile.innerHTML=items.map(x=>'<article class="mobile-horizon"><div><span>افق زمانی</span><b>'+nf.format(x.h)+' روز</b></div><div><span>نمونه</span><b>'+nf.format(x.s.samples)+'</b></div><div><span>MAE</span><b>'+esc(pct(x.s.mae))+'</b></div><div><span>RMSE</span><b>'+esc(pct(x.s.rmse))+'</b></div><div><span>درستی جهت</span><b>'+esc(pct(x.s.directional))+'</b></div><div><span>مهارت مبنا</span><b>'+esc(pct(x.s.skill))+'</b></div></article>').join('');
}
function renderBacktest(data){
 const b=data?.walk_forward_backtest||null;state.backtest=b;
 if(!b){['btSamples','btMae','btNaive','btSkill'].forEach(id=>set(id,'—'));set('backtestNote','آزمون تاریخی در این نوبت در دسترس نبود؛ کارنامهٔ زنده همچنان مستقل و قابل مشاهده است.');return}
 set('btSamples',nf.format(b.samples||0));set('btMae',pct(b.mae_pct));set('btNaive',pct(b.naive_mae_pct));set('btSkill',pct(b.skill_vs_no_change_pct));
 set('backtestNote','نسخهٔ آزمون: '+(data.model_version||'—')+' · تعداد نمونه و روش ارزیابی متعلق به بک‌تست است و با دفتر پیش‌بینی زنده جمع نشده است.');
}
function exportCsv(){
 const rows=state.filtered;if(!rows.length){set('scopeText','برای خروجی، ابتدا رکوردی در فیلتر فعلی انتخاب کن.');return}
 const cols=[['issued_at','زمان صدور'],['target_at','زمان هدف'],['asset','دارایی'],['horizon_days','افق روز'],['model_version','نسخه مدل'],['quote_source','منبع قیمت'],['quote_observed_at','زمان مشاهده قیمت مرجع'],['reference_price','قیمت مرجع'],['predicted_price','قیمت پیش‌بینی'],['actual_price','قیمت واقعی'],['lower_price','حد پایین'],['upper_price','حد بالا'],['absolute_error_pct','خطای مطلق محاسبه‌شده درصد'],['direction','جهت پیش‌بینی'],['direction_correct','جهت درست'],['status','وضعیت'],['model_weights','وزن مدل‌ها'],['validation','جزئیات ارزیابی']];
 const numericColumns=new Set(['horizon_days','reference_price','predicted_price','actual_price','lower_price','upper_price','absolute_error_pct']);
 const quote=v=>'"'+String(v&&typeof v==='object'?JSON.stringify(v):(v??'')).replace(/"/g,'""')+'"';
 const csvCell=(key,row)=>{if(!numericColumns.has(key))return quote(row[key]??'');const value=key==='absolute_error_pct'?errorPct(row):numeric(row[key]);return value===null?'':String(value)};
 const csv='\uFEFF'+[cols.map(x=>quote(x[1])).join(','),...rows.map(r=>cols.map(c=>csvCell(c[0],r)).join(','))].join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='dollar-forecast-audit-'+state.asset+'-'+state.horizon+'d.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function renderNumericQuality(rows){
 const valid=rows.filter(x=>numeric(x.reference_price)>0&&numeric(x.predicted_price)>0&&numeric(x.lower_price)!==null&&numeric(x.upper_price)!==null&&numeric(x.lower_price)<=numeric(x.upper_price)).length;
 const actual=rows.filter(x=>x.status==='evaluated'&&numeric(x.actual_price)>0).length;
 set('qualityValid',nf.format(valid));set('qualityInvalid',nf.format(rows.length-valid));set('qualityActual',nf.format(actual));
}
function renderNumberConverter(){
 const input=$('rawNumber'),raw=input.value.trim(),n=numeric(raw),out=$('normalizedNumber'),local=$('localizedNumber'),copy=$('copyNumber');
 if(n===null){out.textContent='—';local.textContent='نمایش محلی: —';copy.disabled=true;set('numberFeedback',raw?'قالب عددی قابل تشخیص نیست؛ ورودی را بررسی کن.':'ورودی خالی به‌عنوان عدد پذیرفته نمی‌شود.');return}
 out.textContent=String(n);local.textContent='نمایش محلی: '+nf.format(n);copy.disabled=false;set('numberFeedback','عدد با موفقیت استاندارد شد؛ جداکننده‌ها و ارقام محلی تفسیر شدند.');
}
function parserSelfTest(){
 const tests=[numeric(null)===null,numeric('')===null,numeric('۱۲٬۳۴۵')===12345,numeric('١٢٣٫٤٥')===123.45,numeric('1,234.56')===1234.56,numeric('1.234,56')===1234.56,numeric('12,5')===12.5];
 return tests.every(Boolean);
}
function renderAll(){
 const rows=currentRows();state.filtered=rows;
 renderStats(rows);renderNumericQuality(rows);svgChart(rows);renderHistogram(rows);renderTrend(rows);renderLedger(rows);renderHorizons();
 renderVersionComparison(rows);
 set('scopeText','دارایی: '+assets[state.asset]+' · افق: '+nf.format(state.horizon)+' روز · بازه: '+$('period').selectedOptions[0].text+' · فیلتر وضعیت و نسخه روی دفتر همین افق اعمال شده‌اند.');
}
function renderLearning(data){
 const cycles=Array.isArray(data?.cycles)?data.cycles:[];
 state.learning=cycles;
 const latest=cycles[0]||null, metrics=latest?.asset_metrics||{};
 const entries=Object.entries(metrics);
 const warnings=entries.filter(([,m])=>m?.performance_drift===true).length;
 set('learningCycles',nf.format(cycles.length));
 set('learningSamples',nf.format(Number(latest?.evaluated_count)||0));
 set('learningWarnings',nf.format(warnings));
 set('learningLast',latest?.cycle_at?date(latest.cycle_at):'هنوز ثبت نشده');
 set('learningStatus',cycles.length?'چرخهٔ یادگیری فعال':'آماده؛ منتظر خطای واقعی');
 const rows=$('learningRows');
 if(!entries.length){
  rows.innerHTML='<tr><td colspan="7" class="empty">هنوز پیش‌بینی سررسیدشده‌ای برای یادگیری ثبت نشده است. چرخهٔ زمان‌بندی‌شده فعال است؛ اولین خطای واقعی پس از رسیدن پیش‌بینی به موعد، اینجا ثبت می‌شود.</td></tr>';
  set('learningNote','بررسی زمان‌بندی‌شده هر ۱۵ دقیقه انجام می‌شود. تا پیش از رسیدن موعد پیش‌بینی، هیچ خطایی جعل یا حدس زده نمی‌شود. وزن‌های مدل نیز فقط با آزمون walk-forward و داده‌های بالغ‌شده بازآموزی می‌شوند.');
  return;
 }
 rows.innerHTML=entries.map(([key,m])=>{
  const [asset,horizon]=key.split(':');
  const stateLabel=m.performance_drift?'هشدار افت کیفیت':(Number(m.samples)>=30&&Number(m.skill_vs_no_change_pct)>=2?'عملکرد بهتر از مبنا':'سیگنال جهت‌دار محدود');
  const cls=m.performance_drift?'warn':(Number(m.samples)>=30&&Number(m.skill_vs_no_change_pct)>=2?'good':'muted');
  return '<tr><td>'+esc(assets[asset]||asset)+' · '+nf.format(Number(horizon))+' روز</td><td>'+nf.format(m.samples||0)+'</td><td>'+pct(m.mae_pct)+'</td><td>'+pct(m.no_change_mae_pct)+'</td><td>'+pct(m.skill_vs_no_change_pct)+'</td><td>'+(m.directional_accuracy_pct===null?'—':pct(m.directional_accuracy_pct))+'</td><td><span class="learning-state '+cls+'">'+stateLabel+'</span></td></tr>';
 }).join('');
 set('learningNote','آخرین چرخه: '+date(latest.cycle_at)+' · نسخهٔ موتور: '+(latest.model_version||'—')+' · هشدارها فقط افت عملکرد اخیر را نشان می‌دهند و به‌تنهایی مجوز تغییر خودکار مدل نیستند.');
}
async function loadLearning(){
 try{const data=await get('/forecast/learning');renderLearning(data)}
 catch(e){set('learningStatus','گزارش در دسترس نیست');set('learningRows','');$('learningRows').innerHTML='<tr><td colspan="7" class="empty error">'+esc(e.message)+'</td></tr>'}
}
function renderVersionComparison(rows){
 const groups=new Map();
 for(const row of rows){const key=row.model_version||"نسخه نامشخص";if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
 const entries=[...groups.entries()].map(([version,list])=>({version,list,s:stats(list)})).sort((a,b)=>Date.parse(a.list[0]?.issued_at||0)-Date.parse(b.list[0]?.issued_at||0));
 const body=$('versionRows');
 if(!entries.length){body.innerHTML='<tr><td colspan="7" class="empty">رکوردی برای مقایسهٔ نسخه‌ها وجود ندارد.</td></tr>';set('versionNote','با دریافت پیش‌بینی‌های ارزیابی‌شده، مقایسه به‌صورت خودکار تکمیل می‌شود.');return}
 body.innerHTML=entries.map(x=>{
  const dates=x.list.map(r=>Date.parse(r.issued_at||'')).filter(Number.isFinite);
  const range=dates.length?date(Math.min(...dates))+' تا '+date(Math.max(...dates)):'—';
  return '<tr><td><code>'+esc(x.version)+'</code></td><td>'+nf.format(x.s.samples)+'</td><td>'+esc(pct(x.s.mae))+'</td><td>'+esc(pct(x.s.baseMae))+'</td><td>'+esc(pct(x.s.skill))+'</td><td>'+esc(pct(x.s.directional))+'</td><td>'+esc(range)+'</td></tr>';
 }).join('');
 set('versionNote','نسخه‌های حاضر در فیلتر: '+nf.format(entries.length)+' · این جدول مقایسهٔ گروهی است، نه آزمایش علّی کنترل‌شده.');
}
function renderDiagnostics(data){
 const rows=Array.isArray(data?.diagnostics)?data.diagnostics:[];state.diagnostics=rows;
 set('diagnosticStatus',rows.length?nf.format(rows.length)+' گزارش':'هنوز گزارشی ثبت نشده');
 const body=$('diagnosticRows');
 if(!rows.length){
  body.innerHTML='<tr><td colspan="7" class="empty">برای این دارایی، هنوز گزارش تشخیصی ذخیره نشده است.</td></tr>';
  set('diagnosticNote','گزارش‌ها در اولین چرخه‌ای ثبت می‌شوند که پیش‌بینی جدید واقعاً ارزیابی شود. پیش‌بینی‌های قدیمی با شواهد ناقص بازسازی نمی‌شوند.');return;
 }
 body.innerHTML=rows.map(x=>{
  const m=x.error_metrics||{},candidates=Array.isArray(x.root_cause_candidates)?x.root_cause_candidates:[];
  const labels=candidates.slice(0,3).map(c=>c.code||'نشانه نامشخص').join('، ')||'شواهد کافی ثبت نشده';
  const improvement=numeric(m.improvement_vs_no_change_pct);
  return '<tr><td>'+esc(date(x.diagnosed_at))+'</td><td>'+esc(assets[x.asset]||x.asset)+' · '+nf.format(Number(x.horizon_days))+' روز</td><td><code>'+esc(x.model_version||'—')+'</code></td><td>'+esc(pct(m.absolute_error_pct))+'</td><td>'+esc(pct(m.no_change_error_pct))+'</td><td class="'+(improvement!==null&&improvement>=0?'good':'bad')+'">'+esc(pct(improvement))+'</td><td>'+esc(labels)+'</td></tr>';
 }).join('');
 set('diagnosticNote',nf.format(rows.length)+' گزارش از جدول تشخیص خطا دریافت شد. نشانه‌های اولیه با اطمینان پایین هستند و علت قطعی محسوب نمی‌شوند.');
}
async function loadDiagnostics(){
 try{
  const responses=await Promise.all([1,3,7].map(h=>get('/forecast/diagnostics?asset='+encodeURIComponent(state.asset)+'&horizon_days='+h+'&limit=100')));
  const diagnostics=responses.flatMap(x=>Array.isArray(x.diagnostics)?x.diagnostics:[]).sort((a,b)=>Date.parse(b.diagnosed_at||0)-Date.parse(a.diagnosed_at||0));
  renderDiagnostics({diagnostics});
 }catch(e){
  set('diagnosticStatus','دریافت ناموفق');$('diagnosticRows').innerHTML='<tr><td colspan="7" class="empty error">'+esc(e.message)+'</td></tr>';
  set('diagnosticNote','گزارش تشخیصی در دسترس نیست؛ کارنامهٔ اصلی پیش‌بینی‌ها مستقل باقی می‌ماند.');
 }
}
async function loadBacktest(){
 try{const perf=await get('/forecast/performance?asset='+encodeURIComponent(state.asset)+'&horizon_days='+state.horizon);renderBacktest(perf)}
 catch(e){renderBacktest(null);set('backtestNote','دادهٔ بک‌تست دریافت نشد: '+e.message+' · این خطا بر محاسبهٔ کارنامهٔ زنده اثر ندارد.')}
}
async function load(){
 const btn=$('refresh');btn.disabled=true;btn.textContent='در حال دریافت…';set('updated','در حال همگام‌سازی دفتر ثبت…');
 state.asset=$('asset').value;state.horizon=Number($('horizon').value);
 try{
  const qs=[1,3,7].map(h=>get('/forecast/history?asset='+encodeURIComponent(state.asset)+'&horizon_days='+h+'&limit=500'));
  const all=await Promise.all(qs);
  [1,3,7].forEach((h,i)=>{state.byHorizon[String(h)]=Array.isArray(all[i].forecasts)?all[i].forecasts:[];if(h===state.horizon)state.meta=all[i].ledger_meta||{}});
  modelOptions();renderAll();
  set('updated','آخرین همگام‌سازی: '+date(new Date().toISOString())+' · '+nf.format(state.byHorizon[String(state.horizon)].length)+' رکورد · موتور فعال: '+(state.meta.active_model_version||'—'));
  await Promise.all([loadBacktest(),loadLearning(),loadDiagnostics()]);
 }catch(e){
  state.byHorizon={};state.meta=null;state.filtered=[];
  set('updated','اتصال ناموفق');set('scopeText','دریافت دفتر ثبت ناموفق بود: '+e.message);
  $('ledgerRows').innerHTML='<tr><td colspan="13" class="empty error">'+esc(e.message)+'</td></tr>';$('mobileLedger').innerHTML='<div class="empty error">'+esc(e.message)+'</div>';
  ['samples','mae','rmse','medianError','p90Error','baseMae','rangeWidth','within2','within5','skill','direction','coverage','bias','pending','qualityValid','qualityInvalid','qualityActual'].forEach(id=>set(id,'—'));
  $('priceChart').innerHTML='<div class="empty error">دادهٔ نمودار دریافت نشد.</div>';$('errorHistogram').innerHTML='<div class="empty error">داده دریافت نشد.</div>';$('errorTrend').innerHTML='<div class="empty error">داده دریافت نشد.</div>';
  $('ledgerCount').textContent='—';$('ledgerFoot').textContent='دفتر ثبت در دسترس نیست.';$('horizonTable').innerHTML='<tr><td colspan="7" class="empty error">داده دریافت نشد.</td></tr>';$('mobileHorizons').innerHTML='';renderBacktest(null);
  $('integrity').classList.remove('ready');set('integrityTitle','اتصال ناموفق');set('integrityText','تا زمان برقراری ارتباط، هیچ شاخص قدیمی به‌عنوان نتیجهٔ تازه نمایش داده نمی‌شود.');
 }finally{btn.disabled=false;btn.innerHTML='به‌روزرسانی داده <span>↻</span>'}
}
$('rawNumber').addEventListener('input',renderNumberConverter);
$('copyNumber').addEventListener('click',async()=>{const n=numeric($('rawNumber').value);if(n===null)return;try{await navigator.clipboard.writeText(String(n));set('numberFeedback','عدد استاندارد کپی شد.')}catch(e){set('numberFeedback','کپی خودکار در این مرورگر در دسترس نیست؛ عدد استاندارد را انتخاب و کپی کن.')}});
set('parserStatus',parserSelfTest()?'مبدل عددی: آزمون داخلی موفق':'مبدل عددی: خطای آزمون');
$('refresh').addEventListener('click',load);$('asset').addEventListener('change',load);$('horizon').addEventListener('change',()=>{state.horizon=Number($('horizon').value);modelOptions();renderAll();loadBacktest()});
['period','status','model'].forEach(id=>$(id).addEventListener('change',renderAll));
$('export').addEventListener('click',exportCsv);
load();
})();