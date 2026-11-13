(() => {
  const grid = document.getElementById('articleGrid');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const searchHint = document.getElementById('searchHint');
  const emptyState = document.getElementById('emptyState');
  const filters = document.getElementById('filters');
  const menuBtn = document.getElementById('menuBtn');
  const nav = document.querySelector('.desktop-nav');
  let records = [];
  let activeFilter = 'all';
  let query = '';

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const categoryNames = {people:'شخصیت‌ها',iran:'ایران',economy:'اقتصاد',world:'جهان'};
  function render() {
    const q = query.trim().toLocaleLowerCase('fa');
    const list = records.filter(item => {
      const categoryMatch = activeFilter === 'all' || item.category === activeFilter;
      const haystack = [item.title,item.description,item.category,...(item.tags || [])].join(' ').toLocaleLowerCase('fa');
      return categoryMatch && (!q || haystack.includes(q));
    });
    grid.innerHTML = list.map((item, i) => `
      <a class="article-card" href="${escapeHTML(item.html_url || item.url || ('articles/' + encodeURIComponent(item.id) + '/'))}">
        <div class="article-top"><span class="article-index">${String(i+1).padStart(2,'0')}</span><span class="article-tag">${escapeHTML(categoryNames[item.category] || 'پرونده')}</span></div>
        <div class="article-body"><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.description)}</p><div class="article-foot"><span>${escapeHTML(item.status || 'در حال توسعه')}</span><b>↗</b></div></div>
      </a>`).join('');
    emptyState.hidden = list.length !== 0;
    grid.hidden = list.length === 0;
    searchHint.textContent = q ? `${list.length} نتیجه پیدا شد` : 'جست‌وجو در عنوان‌ها، توضیحات و برچسب‌های آرشیو';
  }
  async function init() {
    try {
      const response = await fetch('data/index.json', {cache:'no-cache'});
      if (!response.ok) throw new Error('Archive index unavailable');
      const data = await response.json();
      records = Array.isArray(data.items) ? data.items : [];
      render();
    } catch (error) {
      grid.innerHTML = '<div class="loading">آرشیو در دسترس نیست؛ لطفاً کمی بعد دوباره تلاش کن.</div>';
      console.error(error);
    }
  }
  searchForm.addEventListener('submit', event => { event.preventDefault(); query = searchInput.value; render(); document.getElementById('featured').scrollIntoView({behavior:'smooth'}); });
  searchInput.addEventListener('input', () => { query = searchInput.value; render(); });
  filters.addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    activeFilter = button.dataset.filter;
    filters.querySelectorAll('.filter').forEach(el => el.classList.toggle('active', el === button));
    render();
  });
  document.querySelectorAll('[data-category]').forEach(link => link.addEventListener('click', () => {
    activeFilter = link.dataset.category;
    filters.querySelectorAll('.filter').forEach(el => el.classList.toggle('active', el.dataset.filter === activeFilter));
    render();
  }));
  menuBtn.addEventListener('click', () => nav.classList.toggle('open'));
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => nav.classList.remove('open')));
  document.getElementById('langToggle').addEventListener('click', () => {
    const button = document.getElementById('langToggle');
    button.textContent = button.textContent === 'EN' ? 'FA' : 'EN';
    button.title = 'نسخهٔ انگلیسی به‌زودی اضافه می‌شود';
  });
  init();
})();