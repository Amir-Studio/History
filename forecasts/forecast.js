(()=>{'use strict';
const $=id=>document.getElementById(id);
const API='https://oolfbjxclhzlbwjmzxxx.supabase.co/functions/v1/market-api';
const assets={USD_IRR_FREE:'دلار آزاد',GOLD_18K_IRR:'طلای ۱۸ عیار',EUR_IRR_FREE:'یورو آزاد',COIN_EMAMI_IRR:'سکه امامی'};
const nf=new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2});
const money=new Intl.NumberFormat('fa-IR',{maximumFractionDigits:0});
const pct=v=>v==null?'—':nf.format(Number(v))+'٪';
const price=v=>v==null?'—':money.format(Number(v))+' تومان';
const date=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('fa-IR',{dateStyle:'short',timeStyle:'short'}).format(d)};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function set(id,value){const el=$(id);if(el)el.textContent=value}
function showError(msg){$('ledger').innerHTML='<tr><td colspan="7" class="empty error">'+esc(msg)+'</td></tr>';$('mobileLedger').innerHTML='<div class="empty error">'+esc(msg)+'</div>'}
function renderChart(rows){
 const el=$('errorChart'),evaluated=rows.filter(x=>x.status==='evaluated'&&Number.isFinite(Number(x.absolute_error_pct)));
 if(!evaluated.length){el.innerHTML='<p class="empty">هنوز پیش‌بینی سررسیدشده‌ای برای این انتخاب ارزیابی نشده است. با گذشت زمان، ستون‌های خطا اینجا ظاهر می‌شوند.</p>';return}
 const data=evaluated.slice(0,24).reverse(),max=Math.max(5,...data.map(x=>Number(x.absolute_error_pct)));
 el.innerHTML=data.map((x,i)=>{const e=Math.max(0,Number(x.absolute_error_pct)),h=Math.max(2,e/max*112);return '<div class="bar-wrap" title="خطا: '+esc(pct(e))+'"><span class="bar-label">'+esc(nf.format(e))+'٪</span><div class="bar '+(e>5?'bad':'')+'" style="height:'+h+'px"></div><span class="bar-label">'+esc(nf.format(i+1))+'</span></div>'}).join('');
}
function renderLedger(rows){
 const body=$('ledger'),mobile=$('mobileLedger');
 if(!rows.length){body.innerHTML='<tr><td colspan="7" class="empty">هنوز رکوردی برای این دارایی و افق زمانی ثبت نشده است.</td></tr>';mobile.innerHTML='<div class="empty">هنوز رکوردی ثبت نشده است.</div>';return}
 body.innerHTML=rows.map(x=>{const done=x.status==='evaluated',err=Number(x.absolute_error_pct);return '<tr><td>'+esc(date(x.issued_at))+'</td><td>'+esc(date(x.target_at))+'</td><td>'+esc(price(x.reference_price))+'</td><td>'+esc(price(x.predicted_price))+'</td><td>'+esc(done?price(x.actual_price):'در انتظار سررسید')+'</td><td class="'+(done?(err<=2?'good':err>5?'bad':''):'')+'">'+(done?esc(pct(err)):'—')+'</td><td><span class="status '+(done?'evaluated':'pending')+'">'+(done?'ارزیابی‌شده':'در انتظار')+'</span></td></tr>'}).join('');
 mobile.innerHTML=rows.map(x=>{const done=x.status==='evaluated',err=Number(x.absolute_error_pct);return '<article class="mobile-record"><div class="mobile-record-head"><span>ثبت: '+esc(date(x.issued_at))+'</span><span class="status '+(done?'evaluated':'pending')+'">'+(done?'ارزیابی‌شده':'در انتظار')+'</span></div><div class="mobile-record-grid"><div><span>زمان هدف</span><b>'+esc(date(x.target_at))+'</b></div><div><span>قیمت مبنا</span><b>'+esc(price(x.reference_price))+'</b></div><div><span>پیش‌بینی</span><b>'+esc(price(x.predicted_price))+'</b></div><div><span>قیمت واقعی</span><b>'+esc(done?price(x.actual_price):'در انتظار')+'</b></div><div><span>خطای مطلق</span><b class="'+(done?(err<=2?'good':err>5?'bad':''):'')+'">'+(done?esc(pct(err)):'—')+'</b></div></div></article>'}).join('');
}
async function get(path){const r=await fetch(API+path,{headers:{accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(25000)});const d=await r.json();if(!r.ok)throw new Error(d.error||'پاسخ سرویس نامعتبر بود ('+r.status+')');return d}
async function load(){
 const btn=$('refresh'),asset=$('asset').value,horizon=$('horizon').value;
 btn.disabled=true;btn.textContent='در حال دریافت…';set('updated','در حال همگام‌سازی با دفتر ثبت پیش‌بینی‌ها…');
 try{
  const q='?asset='+encodeURIComponent(asset)+'&horizon_days='+encodeURIComponent(horizon);
  const [history,performance]=await Promise.all([get('/forecast/history'+q),get('/forecast/performance'+q)]);
  const rows=Array.isArray(history.forecasts)?history.forecasts:[];
  const live=performance.live_ledger||{};
  set('samples',nf.format(live.samples||0));set('mae',live.mean_absolute_error_pct==null?'—':pct(live.mean_absolute_error_pct));
  set('within2',live.within_2pct_pct==null?'—':pct(live.within_2pct_pct));set('within5',live.within_5pct_pct==null?'—':pct(live.within_5pct_pct));
  set('direction',live.directional_accuracy_pct==null?'—':pct(live.directional_accuracy_pct));set('directionCount','نمونهٔ جهت‌دار: '+nf.format(live.directional_samples||0));
  set('ledgerCount',nf.format(rows.length)+' رکورد · '+assets[asset]+' · '+horizon+' روزه');
  renderLedger(rows);renderChart(rows);
  const bt=performance.walk_forward_backtest||{};
  set('btSamples',nf.format(bt.samples||0));set('btMae',bt.mae_pct==null?'—':pct(bt.mae_pct));set('btNaive',bt.naive_mae_pct==null?'—':pct(bt.naive_mae_pct));set('btSkill',bt.skill_vs_no_change_pct==null?'—':pct(bt.skill_vs_no_change_pct));
  set('updated','آخرین دریافت: '+date(new Date().toISOString())+' · دفتر زنده: '+nf.format(rows.length)+' رکورد');
 }catch(e){showError('دریافت داده‌ها ناموفق بود: '+(e.message||'خطای اتصال')+'؛ ممکن است سرویس یا پایگاه داده موقتاً در دسترس نباشد.');set('updated','اتصال ناموفق بود');set('samples','—');set('mae','—');set('within2','—');set('within5','—');set('direction','—');}
 finally{btn.disabled=false;btn.innerHTML='به‌روزرسانی <span>↻</span>'}
}
$('refresh').addEventListener('click',load);$('asset').addEventListener('change',load);$('horizon').addEventListener('change',load);load();
})();