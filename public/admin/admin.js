const CATEGORY_LABELS = { kitchen: 'სამზარეულო', bathroom: 'აბაზანა', living: 'მისაღები', custom: 'ინდივიდუალური' };
const STATUS_LABELS = { new: 'ახალი', contacted: 'დაკავშირებული', in_progress: 'პროცესში', closed: 'დახურული' };

const loginScreen = document.getElementById('loginScreen');
const adminApp = document.getElementById('adminApp');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

// ---- auth check ----
async function checkAuth() {
  const res = await fetch('/api/admin/me');
  const data = await res.json();
  if (data.loggedIn) {
    showApp(data.username);
  } else {
    loginScreen.hidden = false;
    adminApp.hidden = true;
  }
}

function showApp(username) {
  loginScreen.hidden = true;
  adminApp.hidden = false;
  document.getElementById('loggedInUser').textContent = username;
  loadCatalogTable();
  loadInquiriesTable();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showApp(data.username);
  } catch (err) {
    loginError.textContent = err.message || 'შესვლა ვერ მოხერხდა';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  location.reload();
});

// ---- nav switching ----
document.querySelectorAll('.side-link').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.side-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.hidden = true);
    document.getElementById('view-' + link.dataset.view).hidden = false;
  });
});

// ---- catalog table ----
async function loadCatalogTable() {
  const res = await fetch('/api/admin/catalog');
  const items = await res.json();
  const tbody = document.getElementById('catalogTableBody');
  if (!items.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">კატალოგში ჯერ არაფერია დამატებული</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr data-id="${item.id}">
      <td>${item.media_type === 'video'
        ? `<video class="thumb" src="${item.image_path}" muted></video>`
        : `<img class="thumb" src="${item.image_path}" alt="">`}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${CATEGORY_LABELS[item.category] || item.category}</td>
      <td>${item.sort_order}</td>
      <td>${item.featured ? '✓' : '—'}</td>
      <td class="row-actions">
        <button class="edit-btn">რედაქტირება</button>
        <button class="danger delete-btn">წაშლა</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr').dataset.id;
      const item = items.find(i => String(i.id) === id);
      openItemModal(item);
    });
  });
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').dataset.id;
      if (!confirm('დარწმუნებული ხართ, რომ გსურთ წაშლა?')) return;
      await fetch('/api/admin/catalog/' + id, { method: 'DELETE' });
      loadCatalogTable();
    });
  });
}

// ---- inquiries table ----
async function loadInquiriesTable() {
  const res = await fetch('/api/admin/inquiries');
  const items = await res.json();
  const tbody = document.getElementById('inquiriesTableBody');
  const newCount = items.filter(i => i.status === 'new').length;
  document.getElementById('inquiryBadge').textContent = newCount || '';

  if (!items.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">მოთხოვნები ჯერ არ არის</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr data-id="${item.id}">
      <td>${formatDate(item.created_at)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td><a href="tel:${item.phone}">${escapeHtml(item.phone)}</a></td>
      <td>${item.email ? `<a href="mailto:${item.email}">${escapeHtml(item.email)}</a>` : '—'}</td>
      <td>${CATEGORY_LABELS[item.category] || '—'}</td>
      <td class="msg-cell">${escapeHtml(item.message) || '—'}</td>
      <td>
        <select class="status-select">
          ${Object.entries(STATUS_LABELS).map(([val, label]) =>
            `<option value="${val}" ${item.status === val ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </td>
      <td class="row-actions"><button class="danger delete-inquiry-btn">წაშლა</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      const id = e.target.closest('tr').dataset.id;
      await fetch('/api/admin/inquiries/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: e.target.value })
      });
      loadInquiriesTable();
    });
  });
  tbody.querySelectorAll('.delete-inquiry-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').dataset.id;
      if (!confirm('დარწმუნებული ხართ, რომ გსურთ წაშლა?')) return;
      await fetch('/api/admin/inquiries/' + id, { method: 'DELETE' });
      loadInquiriesTable();
    });
  });
}

function formatDate(iso) {
  const d = new Date(iso + 'Z');
  return d.toLocaleDateString('ka-GE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('ka-GE', { hour: '2-digit', minute: '2-digit' });
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ---- item modal (create/edit) ----
const itemModal = document.getElementById('itemModal');
const itemForm = document.getElementById('itemForm');
const modalTitle = document.getElementById('modalTitle');
const imagePreview = document.getElementById('imagePreview');
const videoPreview = document.getElementById('videoPreview');
const imageRequiredNote = document.getElementById('imageRequiredNote');

function isVideoFile(name) {
  return /\.(mp4|webm|mov)$/i.test(name || '');
}

document.getElementById('newItemBtn').addEventListener('click', () => openItemModal(null));
document.getElementById('cancelModalBtn').addEventListener('click', closeItemModal);

function openItemModal(item) {
  itemForm.reset();
  document.getElementById('itemFormMsg').textContent = '';
  imagePreview.hidden = true;
  videoPreview.hidden = true;
  if (item) {
    modalTitle.textContent = 'ნამუშევრის რედაქტირება';
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemTitle').value = item.title;
    document.getElementById('itemCategory').value = item.category;
    document.getElementById('itemDescription').value = item.description || '';
    document.getElementById('itemSort').value = item.sort_order;
    document.getElementById('itemFeatured').checked = !!item.featured;
    if (item.media_type === 'video') {
      videoPreview.src = item.image_path;
      videoPreview.hidden = false;
    } else {
      imagePreview.src = item.image_path;
      imagePreview.hidden = false;
    }
    imageRequiredNote.style.display = 'none';
  } else {
    modalTitle.textContent = 'ახალი ნამუშევარი';
    document.getElementById('itemId').value = '';
    imageRequiredNote.style.display = 'inline';
  }
  itemModal.hidden = false;
}
function closeItemModal() { itemModal.hidden = true; }

document.getElementById('itemImage').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  if (isVideoFile(file.name)) {
    imagePreview.hidden = true;
    videoPreview.src = url;
    videoPreview.hidden = false;
  } else {
    videoPreview.hidden = true;
    imagePreview.src = url;
    imagePreview.hidden = false;
  }
});

itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('itemFormMsg');
  msg.textContent = '';
  const id = document.getElementById('itemId').value;
  const formData = new FormData(itemForm);
  // checkbox doesn't include value when unchecked; FormData already handles "on" when checked, remove key otherwise
  if (!document.getElementById('itemFeatured').checked) formData.delete('featured');

  try {
    const url = id ? '/api/admin/catalog/' + id : '/api/admin/catalog';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    closeItemModal();
    loadCatalogTable();
  } catch (err) {
    msg.textContent = err.message || 'შენახვა ვერ მოხერხდა';
    msg.className = 'form-msg error';
  }
});

// ---- password change ----
document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('passwordMsg');
  msg.textContent = '';
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  try {
    const res = await fetch('/api/admin/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    msg.textContent = 'პაროლი განახლდა';
    msg.className = 'form-msg success';
    e.target.reset();
  } catch (err) {
    msg.textContent = err.message || 'შეცდომა';
    msg.className = 'form-msg error';
  }
});

checkAuth();
