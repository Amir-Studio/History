(() => {
  const list = document.getElementById('vocabList');
  const statusLine = document.getElementById('vocabStatus');
  const count = document.getElementById('vocabCount');
  const form = document.getElementById('vocabSearch');
  const input = document.getElementById('vocabQuery');
  const filters = document.getElementById('vocabFilters');
  const labels = {unknown:'بلد نیستم', learning_pending:'در حال یادگیری', learned:'یادگرفته‌شده', dismissed:'کنارگذاشته‌شده'};
  let items = [];
  let active = 'all';
  let query = '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = value => { try { const u = new URL(String(value), location.href); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const render = () => {
    const q = query.trim().toLocaleLowerCase();
    const filtered = items.filter(item => {
      const statusMatch = active === 'all' || item.status === active;
      const contexts = (item.contexts || []).flatMap(c => [c.text,c.source_title]).join(' ');
      const haystack = [item.term,item.normalized_term,item.language,item.part_of_speech,item.candidate_meaning,item.verified_meaning,...(item.domain || []),contexts].join(' ').toLocaleLowerCase();
      return statusMatch && (!q || haystack.includes(q));
    });
    count.textContent = items.length + ' واژه';
    statusLine.textContent = filtered.length + ' مورد نمایش داده می‌شود';
    list.innerHTML = filtered.length ? filtered.map(item => {
      const context = (item.contexts || []).at(-1) || {};
      const meaning = item.verified_meaning || item.candidate_meaning || '';
      const meaningLabel = item.verified_meaning ? 'معنی تأییدشده' : meaning ? 'معنی پیشنهادی؛ تأییدنشده' : '';
      const source = safeUrl(context.source_url);
      return `<article class="vocab-card">
        <div class="vocab-card-top"><div><h3 class="vocab-term">${esc(item.term)}</h3><div class="vocab-meta"><span>${esc(item.language)}</span><span>${Number(item.occurrences || 1)} بار مشاهده</span><span>آخرین مشاهده: ${esc((item.last_seen_at || '').slice(0,10) || 'نامشخص')}</span></div></div><span class="vocab-status">${esc(labels[item.status] || item.status || 'نامشخص')}</span></div>
        ${context.text ? `<blockquote class="vocab-context">${esc(context.text)}</blockquote>` : ''}
        ${meaning ? `<p class="vocab-meaning"><strong>${esc(meaningLabel)}:</strong> ${esc(meaning)}</p>` : ''}
        ${source ? `<a class="vocab-source" href="${esc(source)}" target="_blank" rel="noopener noreferrer">${esc(context.source_title || 'مشاهدهٔ منبع')} ↗</a>` : ''}
        ${(item.domain || []).length ? `<div class="vocab-meta">حوزه: ${esc(item.domain.join('، '))}</div>` : ''}
      </article>`;
    }).join('') : '<div class="vocab-empty">موردی با این جست‌وجو پیدا نشد.</div>';
  };
  async function init() {
    try {
      const response = await fetch('data/vocabulary/index.json', {cache:'no-store'});
      if (!response.ok) throw new Error('Vocabulary index unavailable');
      const data = await response.json();
      items = Array.isArray(data.items) ? data.items : [];
      render();
    } catch (error) {
      count.textContent = 'در دسترس نیست';
      statusLine.textContent = 'دفتر واژگان بارگذاری نشد؛ بعداً دوباره تلاش کن.';
      list.innerHTML = '<div class="vocab-empty">دادهٔ واژگان فعلاً در دسترس نیست.</div>';
      console.error(error);
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); query = input.value; render(); });
  input.addEventListener('input', () => { query = input.value; render(); });
  filters.addEventListener('click', event => {
    const button = event.target.closest('[data-status]');
    if (!button) return;
    active = button.dataset.status;
    filters.querySelectorAll('[data-status]').forEach(el => el.classList.toggle('active', el === button));
    render();
  });
  const menu = document.getElementById('menuBtn');
  const nav = document.querySelector('.desktop-nav');
  menu?.addEventListener('click', () => { const open = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); });
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => nav.classList.remove('open')));
  init();
})();
