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
  galleryGrid.innerHTML = items.map((item, cardIndex) => {
    const media = (item.media && item.media.length) ? item.media : [{ path: item.image_path, type: item.media_type }];
    const slides = media.map((m, i) => m.type === 'video'
      ? `<video class="gallery-slide${i === 0 ? ' active' : ''}" src="${m.path}" muted loop playsinline preload="metadata" data-index="${i}"></video>`
      : `<img class="gallery-slide${i === 0 ? ' active' : ''}" src="${m.path}" alt="${escapeHtml(item.title)}" loading="lazy" data-index="${i}">`
    ).join('');
    const hasMultiple = media.length > 1;
    const arrows = hasMultiple ? `
        <button type="button" class="gallery-nav gallery-nav-prev" aria-label="წინა">‹</button>
        <button type="button" class="gallery-nav gallery-nav-next" aria-label="შემდეგი">›</button>
        <div class="gallery-dots">${media.map((_, i) => `<span class="gallery-dot${i === 0 ? ' active' : ''}" data-index="${i}"></span>`).join('')}</div>
    ` : '';
    return `
    <div class="gallery-card" data-card="${cardIndex}" data-current="0">
      <div class="gallery-slides">${slides}</div>
      ${arrows}
      <div class="gallery-caption">
        <span>${CATEGORY_LABELS[item.category] || item.category}</span>
        <h4>${escapeHtml(item.title)}</h4>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
      </div>
    </div>
  `;
  }).join('');

  // play the active video on hover, pause when leaving
  galleryGrid.querySelectorAll('.gallery-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      const activeVideo = card.querySelector('.gallery-slide.active video, video.gallery-slide.active');
      if (activeVideo) activeVideo.play().catch(() => {});
    });
    card.addEventListener('mouseleave', () => {
      card.querySelectorAll('video.gallery-slide').forEach(v => v.pause());
    });
  });
}

function showSlide(card, index) {
  const slides = card.querySelectorAll('.gallery-slide');
  const dots = card.querySelectorAll('.gallery-dot');
  slides.forEach(s => {
    const isActive = Number(s.dataset.index) === index;
    s.classList.toggle('active', isActive);
    if (s.tagName === 'VIDEO') { isActive ? s.play().catch(() => {}) : s.pause(); }
  });
  dots.forEach(d => d.classList.toggle('active', Number(d.dataset.index) === index));
  card.dataset.current = index;
}

galleryGrid.addEventListener('click', (e) => {
  const card = e.target.closest('.gallery-card');
  if (!card) return;
  const slideCount = card.querySelectorAll('.gallery-slide').length;
  const current = Number(card.dataset.current || 0);

  if (e.target.closest('.gallery-nav-next')) {
    showSlide(card, (current + 1) % slideCount);
  } else if (e.target.closest('.gallery-nav-prev')) {
    showSlide(card, (current - 1 + slideCount) % slideCount);
  } else if (e.target.closest('.gallery-dot')) {
    showSlide(card, Number(e.target.closest('.gallery-dot').dataset.index));
  }
});

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
