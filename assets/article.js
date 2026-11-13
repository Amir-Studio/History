(() => {
 const root=document.getElementById('articleRoot');
 const id=new URLSearchParams(location.search).get('id');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const categories={iran:'تاریخ معاصر ایران',economy:'اقتصاد و پول',people:'شخصیت‌ها',world:'تاریخ جهان'};
 async function load(){
  if(!id||!/^[a-z0-9-]+$/.test(id))throw new Error('not-found');
  const res=await fetch('data/articles/'+encodeURIComponent(id)+'.json',{cache:'no-cache'});
  if(!res.ok)throw new Error('not-found');
  const a=await res.json();
  document.title=a.title+' | History';
  document.querySelector('meta[name="description"]').content=a.summary;
  const sections=(a.sections||[]).map((s,i)=>'<section id="section-'+i+'"><h2>'+esc(s.heading)+'</h2>'+(s.paragraphs||[]).map(p=>'<p>'+esc(p)+'</p>').join('')+(s.points?.length?'<ul>'+s.points.map(p=>'<li>'+esc(p)+'</li>').join('')+'</ul>':'')+(s.timeline?.length?'<div class="timeline">'+s.timeline.map(t=>'<div class="timeline-item"><b>'+esc(t.date)+'</b><p>'+esc(t.text)+'</p></div>').join('')+'</div>':'')+'</section>').join('');
  const sources=(a.sources||[]).map(s=>'<div class="source-item"><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title)+' ↗</a><p>'+esc(s.publisher||'')+(s.note?' · '+esc(s.note):'')+'</p></div>').join('');
  root.innerHTML='<section class="article-hero"><div class="crumb"><a href="./">History</a> / '+esc(categories[a.category]||'پرونده')+'</div><span class="section-kicker">RESEARCH DOSSIER / '+esc(a.id)+'</span><h1>'+esc(a.title)+'</h1><p class="summary">'+esc(a.summary)+'</p><div class="article-meta"><span>وضعیت: '+esc(a.statusLabel||'در حال پژوهش')+'</span><span>آخرین بازبینی: '+esc(a.lastVerified||'در انتظار تکمیل')+'</span><span>زبان: فارسی</span></div></section><div class="article-layout"><article class="article-main">'+(a.notice?'<div class="status-note">'+esc(a.notice)+'</div>':'')+sections+'<section id="sources"><h2>منابع و مراجع</h2><p>منابع زیر برای شروع بررسی انتخاب شده‌اند. ارجاع دقیق هر گزاره باید در نسخهٔ نهایی به همان بخش متصل شود.</p><div class="source-list">'+(sources||'<div class="status-note">فهرست منابع این پرونده هنوز در حال گردآوری است.</div>')+'</div></section><div class="article-footer">شناسهٔ پایدار: '+esc(a.id)+' · وضعیت انتشار: '+esc(a.status||'draft')+'</div></article><aside class="article-aside"><h3>در این پرونده</h3>'+(a.sections||[]).map((s,i)=>'<a href="#section-'+i+'">'+esc(s.heading)+'</a>').join('')+'<a href="#sources">منابع و مراجع</a></aside></div>';
 }
 load().catch(()=>{root.innerHTML='<div class="not-found"><h1>این پرونده پیدا نشد.</h1><p>ممکن است شناسه نادرست باشد یا پرونده هنوز منتشر نشده باشد.</p><a href="./">بازگشت به آرشیو ↗</a></div>';});
})();