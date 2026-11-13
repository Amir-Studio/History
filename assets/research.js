(() => {
  const form=document.getElementById('researchForm');
  const queryInput=document.getElementById('researchQuery');
  const timeRange=document.getElementById('timeRange');
  const status=document.getElementById('researchStatus');
  const button=document.getElementById('searchButton');
  const results=document.getElementById('results');
  const menu=document.getElementById('menuBtn');
  const nav=document.querySelector('.desktop-nav');
  const faDigits=n=>new Intl.NumberFormat('fa-IR').format(n);
  const countryNames={US:'آمریکا',GB:'بریتانیا',FR:'فرانسه',DE:'آلمان',CH:'سوئیس',QA:'قطر',AE:'امارات',TR:'ترکیه',IR:'ایران',IL:'اسرائیل',RU:'روسیه',CN:'چین',IN:'هند',JP:'ژاپن',CA:'کانادا',AU:'استرالیا',NL:'هلند',BE:'بلژیک',SE:'سوئد',NO:'نروژ',IT:'ایتالیا',ES:'اسپانیا',UA:'اوکراین',SA:'عربستان'};
  const safeUrl=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}};
  const setStatus=text=>{status.textContent=text};
  function card(item){
    const article=document.createElement('article');article.className='source-card';
    const link=document.createElement('a');const href=safeUrl(item.url);
    if(href){link.href=href;link.target='_blank';link.rel='noopener noreferrer'}else link.removeAttribute('href');
    link.textContent=item.title||'بدون عنوان';
    const meta=document.createElement('div');meta.className='source-meta';
    [item.domain,item.country?countryNames[item.country]||item.country:null,item.date].filter(Boolean).forEach(value=>{const span=document.createElement('span');span.textContent=value;meta.append(span)});
    article.append(link,meta);
    if(item.note){const p=document.createElement('p');p.textContent=item.note;article.append(p)}
    return article;
  }
  function fill(id,items,empty){
    const root=document.getElementById(id);root.replaceChildren();
    if(!items.length){const p=document.createElement('p');p.className='source-empty';p.textContent=empty;root.append(p);return}
    items.forEach(item=>root.append(card(item)));
  }
  function gdeltDate(value){
    if(!value)return '';
    const m=String(value).match(/^(\d{4})(\d{2})(\d{2})T/);
    if(!m)return '';
    return new Date(Date.UTC(+m[1],+m[2]-1,+m[3])).toLocaleDateString('fa-IR');
  }
  async function searchGdelt(query,range){
    const url=new URL('https://api.gdeltproject.org/api/v2/doc/doc');
    url.search=new URLSearchParams({query,mode:'ArtList',format:'json',maxrecords:'50',sort:'HybridRel',timespan:range});
    const r=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{accept:'application/json'}});
    if(!r.ok)throw Error('GDELT HTTP '+r.status);
    const data=await r.json();
    return (data.articles||[]).map(x=>({title:x.title,url:x.url,domain:x.domain,country:x.sourcecountry,date:gdeltDate(x.seendate),note:x.language?'زبان منبع: '+x.language:''}));
  }
  async function searchCrossref(query){
    const url=new URL('https://api.crossref.org/works');
    url.search=new URLSearchParams({query,rows:'12',select:'DOI,title,publisher,published,author,URL,type'});
    const r=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{accept:'application/json'}});
    if(!r.ok)throw Error('Crossref HTTP '+r.status);
    const data=await r.json();
    return (data.message?.items||[]).map(x=>({title:Array.isArray(x.title)?x.title[0]:'',url:x.URL||(x.DOI?'https://doi.org/'+x.DOI:''),domain:x.publisher||'Crossref',date:x.published?.['date-parts']?.[0]?.join('-')||'',note:[x.type,(x.author||[]).slice(0,3).map(a=>[a.given,a.family].filter(Boolean).join(' ')).join('، ')].filter(Boolean).join(' · ')})).filter(x=>x.title&&x.url);
  }
  async function searchWikidata(query){
    const url=new URL('https://www.wikidata.org/w/api.php');
    url.search=new URLSearchParams({action:'wbsearchentities',search:query,language:'fa',uselang:'fa',format:'json',limit:'10',origin:'*'});
    const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{accept:'application/json'}});
    if(!r.ok)throw Error('Wikidata HTTP '+r.status);
    const data=await r.json();
    return (data.search||[]).map(x=>({title:x.label||x.id,url:x.concepturi||'https://www.wikidata.org/wiki/'+x.id,domain:'Wikidata · '+x.id,note:x.description||'مدخل داده‌ای؛ برای تأیید ادعاها به منابع پیوندشده مراجعه کن.'}));
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const query=queryInput.value.trim();if(!query)return;
    button.disabled=true;button.textContent='در حال جست‌وجو…';results.hidden=true;
    setStatus('در حال بررسی هم‌زمان پایگاه خبر، پژوهش علمی و دادهٔ مرجع…');
    const range=timeRange.value;
    const settled=await Promise.allSettled([searchGdelt(query,range),searchCrossref(query),searchWikidata(query)]);
    const [news,papers,wiki]=settled.map(x=>x.status==='fulfilled'?x.value:[]);
    const errors=settled.map((x,i)=>x.status==='rejected'?['رسانه‌ها','مقالات علمی','داده مرجع'][i]+': '+String(x.reason?.message||x.reason):null).filter(Boolean);
    fill('newsResults',news,'نتیجه‌ای از پایگاه خبری دریافت نشد.');
    fill('paperResults',papers,'مقالهٔ علمی مرتبط پیدا نشد.');
    fill('wikiResults',wiki,'مدخل مرتبطی پیدا نشد.');
    document.getElementById('newsCount').textContent=faDigits(news.length);
    document.getElementById('paperCount').textContent=faDigits(papers.length);
    document.getElementById('wikiCount').textContent=faDigits(wiki.length);
    const domains=new Set(news.map(x=>x.domain).filter(Boolean));
    const countries=new Set(news.map(x=>x.country).filter(Boolean));
    document.getElementById('resultCounts').textContent=faDigits(news.length+papers.length+wiki.length)+' نتیجه · '+faDigits(domains.size)+' دامنهٔ خبری · '+faDigits(countries.size)+' کشور';
    const note=document.getElementById('coverageNote');
    note.textContent='این نتایج فقط نقشهٔ پوشش موضوع را نشان می‌دهند. '+(countries.size?'در نتایج خبری، منابعی از '+faDigits(countries.size)+' کشور ثبت شده‌اند. ':'کشور منبع برای نتایج خبری مشخص نشده است. ')+'تعداد منابع مستقل پس از بررسی مالکیت و بازنشر باید جداگانه تعیین شود؛ این صفحه هیچ رسانه‌ای را صرفاً بر اساس کشورش بی‌طرف اعلام نمی‌کند.'+(errors.length?' خطای دسترسی: '+errors.join(' | '):'');
    results.hidden=false;
    setStatus(errors.length?'جست‌وجو کامل شد، اما بخشی از پایگاه‌ها پاسخ ندادند.':'جست‌وجو کامل شد؛ نتایج را با معیارهای روش‌شناسی پایین صفحه بررسی کن.');
    button.disabled=false;button.innerHTML='جست‌وجو <span>↗</span>';
  });
  if(menu&&nav)menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});
})();