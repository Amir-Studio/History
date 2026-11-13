(() => {
 const list=document.getElementById('archiveList'),status=document.getElementById('archiveStatus'),count=document.getElementById('archiveCount'),form=document.getElementById('archiveSearch'),query=document.getElementById('archiveQuery'),detail=document.getElementById('newsDetail');
 const fa=n=>new Intl.NumberFormat('fa-IR').format(n);
 const safeUrl=v=>{try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}};
 let items=[];
 function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
 function linkCard(item){
  const article=node('article','source-card');const a=node('a','',item.headline||'بدون عنوان');const href=safeUrl(item.json_url);
  if(href){a.href=href}else{a.href='news.html?id='+encodeURIComponent(item.id)}
  article.append(a);const meta=node('div','source-meta');
  [item.category,item.status,item.published_at?new Date(item.published_at).toLocaleDateString('fa-IR'):null].filter(Boolean).forEach(x=>meta.append(node('span','',x)));
  article.append(meta);if(item.source_url){const p=node('p','','منبع اولیه: '+item.source_url);article.append(p)}return article;
 }
 function render(){
  const q=query.value.trim().toLocaleLowerCase('fa');const filtered=items.filter(x=>[x.headline,x.category,x.status,x.id].join(' ').toLocaleLowerCase('fa').includes(q));
  list.replaceChildren();if(!filtered.length){list.append(node('p','source-empty','رکوردی با این عبارت پیدا نشد.'))}else filtered.forEach(x=>list.append(linkCard(x)));
  count.textContent=fa(filtered.length)+' رکورد';status.textContent=filtered.length?'رکوردها بر اساس فهرست عمومی نمایش داده می‌شوند.':'هنوز رکوردی در آرشیو ثبت نشده است.';
 }
 function sectionCard(root,title,body,url){
  const article=node('article','source-card');article.append(node('b','',title));if(body)article.append(node('p','',body));
  if(url){const href=safeUrl(url);if(href){const a=node('a','','بازکردن منبع ↗');a.href=href;a.target='_blank';a.rel='noopener noreferrer';article.append(a)}}root.append(article);
 }
 async function showDetail(id){
  const item=items.find(x=>x.id===id);if(!item)return;
  const url=safeUrl(item.json_url)||('data/news/'+encodeURIComponent(id)+'.json');const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('رکورد قابل دریافت نیست');const data=await r.json();
  document.getElementById('detailTitle').textContent=data.headline||item.headline;document.getElementById('detailStatus').textContent=data.status||'نامشخص';document.getElementById('detailSummary').textContent=data.summary||'خلاصه‌ای ثبت نشده است.';
  const claims=document.getElementById('detailClaims'),sources=document.getElementById('detailSources'),dis=document.getElementById('detailDisagreements');claims.replaceChildren();sources.replaceChildren();dis.replaceChildren();
  (data.claims||[]).forEach((c,i)=>sectionCard(claims,'ادعا '+fa(i+1)+' · '+(c.evidence_grade||'نامشخص'),(c.claim||'')+(c.note?' — '+c.note:''),c.supporting_sources?.[0]));
  (data.sources||[]).forEach(s=>sectionCard(sources,s.publisher||s.title,[s.country,s.source_type,s.ownership_or_mandate_note].filter(Boolean).join(' · '),s.url));
  (data.disagreements||[]).forEach(d=>sectionCard(dis,d.issue||'اختلاف روایت', [d.version_a,d.version_b,d.what_is_known,d.what_remains_uncertain].filter(Boolean).join(' | ')));
  (data.limitations||[]).forEach(x=>sectionCard(dis,'محدودیت پژوهش',String(x)));
  document.getElementById('detailMeta').textContent='انتشار: '+(data.published_at||'نامشخص')+' · دریافت: '+(data.collected_at||'نامشخص')+' · امتیاز اهمیت آرشیوی: '+(data.significance_score??'ثبت نشده')+' (این امتیاز احتمال صحت نیست).';
  detail.hidden=false;detail.scrollIntoView({behavior:'smooth',block:'start'});
 }
 async function init(){
  try{const r=await fetch('data/news/index.json',{cache:'no-store'});if(!r.ok)throw Error('index HTTP '+r.status);const data=await r.json();items=Array.isArray(data.items)?data.items:[];render();
   const id=new URLSearchParams(location.search).get('id');if(id)await showDetail(id);
  }catch(e){status.textContent='فهرست آرشیو در دسترس نیست: '+String(e.message||e);count.textContent='خطا'}
 }
 form.addEventListener('submit',e=>{e.preventDefault();render()});query.addEventListener('input',render);
 const menu=document.getElementById('menuBtn'),nav=document.querySelector('.desktop-nav');if(menu&&nav)menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});
 init();
})();