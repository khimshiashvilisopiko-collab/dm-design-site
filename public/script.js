// ---- mobile nav ----
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');
navToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});
mainNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  mainNav.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
}));

// ---- category label lookup ----
const CATEGORY_LABELS = {
  kitchen: 'სამზარეულო',
  bathroom: 'აბაზანა',
  living: 'მისაღები',
  custom: 'ინდივიდუალური'
};

// ---- gallery: fetch from backend, render, filter ----
const galleryGrid = document.getElementById('galleryGrid');
const galleryFilters = document.getElementById('galleryFilters');
let allItems = [];

async function loadCatalog() {
  try {
    const res = await fetch('/api/catalog');
    allItems = await res.json();
    renderGallery('all');
  } catch (err) {
    galleryGrid.innerHTML = '<p class="gallery-loading">კატალოგის ჩატვირთვა ვერ მოხერხდა.</p>';
  }
}

function renderGallery(filter) {
  const items = filter === 'all' ? allItems : allItems.filter(i => i.category === filter);
  if (!items.length) {
    galleryGrid.innerHTML = '<p class="gallery-loading">ამ კატეგორიაში ჯერ არაფერია დამატებული.</p>';
    return;
  }
  galleryGrid.innerHTML = items.map(item => {
    const media = item.media_type === 'video'
      ? `<video src="${item.image_path}" muted loop playsinline preload="metadata" onmouseover="this.play()" onmouseout="this.pause()"></video>`
      : `<img src="${item.image_path}" alt="${escapeHtml(item.title)}" loading="lazy">`;
    return `
    <div class="gallery-card">
      ${media}
      <div class="gallery-caption">
        <span>${CATEGORY_LABELS[item.category] || item.category}</span>
        <h4>${escapeHtml(item.title)}</h4>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
      </div>
    </div>
  `;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

galleryFilters.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  galleryFilters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGallery(btn.dataset.filter);
});

// service cards also jump to filtered gallery
document.querySelectorAll('.service-card').forEach(card => {
  card.addEventListener('click', () => {
    const filter = card.dataset.filter;
    const targetBtn = galleryFilters.querySelector(`[data-filter="${filter}"]`);
    if (targetBtn) {
      galleryFilters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      targetBtn.classList.add('active');
      renderGallery(filter);
    }
    document.getElementById('gallery').scrollIntoView({ behavior: 'smooth' });
  });
});

loadCatalog();

// ---- inquiry form ----
const inquiryForm = document.getElementById('inquiryForm');
const formStatus = document.getElementById('formStatus');

inquiryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formStatus.textContent = '';
  formStatus.className = 'form-status';

  const data = Object.fromEntries(new FormData(inquiryForm).entries());
  const submitBtn = inquiryForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'შეცდომა');

    formStatus.textContent = 'გმადლობთ! თქვენი მოთხოვნა მიღებულია — მალე დაგიკავშირდებით.';
    formStatus.classList.add('success');
    inquiryForm.reset();
  } catch (err) {
    formStatus.textContent = err.message || 'დაფიქსირდა შეცდომა, სცადეთ თავიდან.';
    formStatus.classList.add('error');
  } finally {
    submitBtn.disabled = false;
  }
});

// ---- header shadow on scroll ----
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  header.style.boxShadow = window.scrollY > 20 ? '0 8px 24px rgba(0,0,0,0.25)' : 'none';
});
