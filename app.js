/* ChronoStar X — App Core (Enhanced & Customized) */

const SUPABASE_URL = 'https://ajsqtqxcpnqhjhyphiiw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7bdRFYA7g6mQirAz8mr8Fg_L90CmrSk';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentProfile = null;
let presenceChannel = null;

// ---- Activity logging with enhanced metadata ----
async function logActivity(action, meta = {}) {
  if (!currentUser) return;
  try { 
    await sb.from('activity_log').insert({ 
      user_id: currentUser.id, 
      action, 
      meta: { ...meta, timestamp: new Date().toISOString(), ua: navigator.userAgent.substring(0, 50) } 
    }); 
  } catch (e) { console.warn('Gagal mencatat aktivitas', e); }
  const el = document.getElementById('activity-list');
  if (el && document.getElementById('tab-profile').classList.contains('active')) loadActivityList();
}

function actionLabel(action) {
  const labels = { 
    login: 'Masuk ke sistem', 
    tool_open: 'Membuka modul tool', 
    post_add: 'Menambahkan publikasi', 
    post_delete: 'Menghapus publikasi', 
    profile_update: 'Memperbarui data profil',
    export_data: 'Mengekspor riwayat'
  };
  return labels[action] || action;
}

// ---- Auth Manager with Auto-Refresh & Feedback ----
const AuthUI = {
  switch(which) {
    document.getElementById('tab-btn-login').classList.toggle('active', which === 'login');
    document.getElementById('tab-btn-register').classList.toggle('active', which === 'register');
    document.getElementById('login-form').style.display = which === 'login' ? 'block' : 'none';
    document.getElementById('register-form').style.display = which === 'register' ? 'block' : 'none';
  },
  async login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const msg = document.getElementById('login-msg'), btn = document.getElementById('login-btn');
    if (!email || !password) { msg.className = 'form-msg error'; msg.innerText = 'Email dan password wajib diisi.'; return; }
    btn.disabled = true; msg.className = 'form-msg'; msg.innerText = 'Autentikasi neural...';
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) { msg.className = 'form-msg error'; msg.innerText = error.message; return; }
    msg.className = 'form-msg success'; msg.innerText = 'Akses diterima!';
    await onAuthed(data.user, { logLogin: true });
    ChronoStar.showToast('Selamat datang kembali di ChronoStar X!', 'success');
  },
  async register() {
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const msg = document.getElementById('register-msg'), btn = document.getElementById('register-btn');
    if (!username || !email || !password) { msg.className = 'form-msg error'; msg.innerText = 'Semua kolom wajib diisi.'; return; }
    if (password.length < 6) { msg.className = 'form-msg error'; msg.innerText = 'Password minimal 6 karakter.'; return; }
    btn.disabled = true; msg.className = 'form-msg'; msg.innerText = 'Mendaftarkan identitas...';
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username } } });
    btn.disabled = false;
    if (error) { msg.className = 'form-msg error'; msg.innerText = error.message; return; }
    if (data.session) { 
      msg.className = 'form-msg success'; msg.innerText = 'Akun aktif!'; 
      await onAuthed(data.user, { logLogin: true }); 
    } else { 
      msg.className = 'form-msg success'; msg.innerText = 'Registrasi berhasil! Cek email untuk konfirmasi.'; 
    }
  },
  async logout() {
    await sb.auth.signOut();
    if (presenceChannel) { sb.removeChannel(presenceChannel); presenceChannel = null; }
    currentUser = null; currentProfile = null;
    renderAuthState();
    ChronoStar.showToast('Sesi terputus. Keluar.', 'info');
    switchTabByNav('home');
  }
};

async function onAuthed(user, opts = {}) {
  currentUser = user;
  await loadProfile();
  setupPresence();
  renderAuthState();
  if (opts.logLogin) logActivity('login', {});
}

async function loadProfile() {
  if (!currentUser) return;
  const { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (!error) currentProfile = data;
}

function renderAuthState() {
  const homeStatus = document.getElementById('home-status'), homeUsername = document.getElementById('home-username'), homeAvatar = document.getElementById('home-avatar');
  const navLabel = document.getElementById('nav-profile-label'), authSection = document.getElementById('auth-section'), profileSection = document.getElementById('profile-section');
  if (currentUser && currentProfile) {
    homeStatus.innerHTML = `<span class="online-indicator">● ONLINE</span> &nbsp; <span style="color:var(--text-sub);">${currentProfile.role === 'owner' ? 'ROOT ADMIN' : 'MEMBER'}</span>`;
    homeUsername.innerText = currentProfile.username || currentUser.email;
    homeAvatar.innerText = (currentProfile.username || currentUser.email || '?')[0].toUpperCase();
    navLabel.innerText = 'Profil';
    authSection.style.display = 'none'; profileSection.style.display = 'block';
    renderProfileSection();
  } else {
    homeStatus.innerHTML = `<span class="offline-indicator">● TAMU</span> &nbsp; <span style="color:var(--text-sub);">sesi tamu</span>`;
    homeUsername.innerText = 'ChronoStar X'; homeAvatar.innerText = 'C';
    navLabel.innerText = 'Login';
    authSection.style.display = 'block'; profileSection.style.display = 'none';
  }
  renderOwnerButtons();
  loadNews(); loadInfo();
}

function renderOwnerButtons() {
  const isOwner = currentProfile && currentProfile.role === 'owner';
  document.getElementById('news-add-wrap').innerHTML = isOwner ? `<span class="add-btn" onclick="AdminUI.addPost('news')">+ TAMBAH</span>` : '';
  document.getElementById('info-add-wrap').innerHTML = isOwner ? `<span class="add-btn" onclick="AdminUI.addPost('info')">+ TAMBAH</span>` : '';
}

// ---- Profile & Bio Management with Quick Export ----
function renderProfileSection() {
  const p = currentProfile;
  document.getElementById('profile-username').innerText = p.username || currentUser.email;
  document.getElementById('profile-bio').innerText = p.bio || 'Belum ada bio siber yang diatur.';
  const avatarEl = document.getElementById('profile-avatar');
  avatarEl.innerHTML = p.avatar_url ? `<img src="${CU.esc(p.avatar_url)}">` : (p.username || '?')[0].toUpperCase();
  document.getElementById('profile-access').innerText = p.role === 'owner' ? 'Root Admin (Owner)' : 'Member Terverifikasi';
  document.getElementById('profile-joined').innerText = new Date(p.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  document.getElementById('profile-role-badge').innerHTML = p.role === 'owner' ? `<div class="profile-badge-owner">SYSTEM FOUNDER</div>` : `<div class="profile-badge-member">ACTIVE MEMBER</div>`;
  document.getElementById('owner-admin-zone').style.display = p.role === 'owner' ? 'block' : 'none';
  
  const links = Array.isArray(p.links) ? p.links : [];
  document.getElementById('links-list').innerHTML = links.length
    ? links.map(l => `<a href="${CU.esc(l.url)}" target="_blank" rel="noopener" class="link-item">${CU.esc(l.label)} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg></a>`).join('')
    : '<p style="font-size:11px;color:var(--text-sub);text-align:center;">Belum ada tautan ditambahkan.</p>';
  loadActivityList();
}

async function loadActivityList() {
  if (!currentUser) return;
  const { data, count } = await sb.from('activity_log').select('*', { count: 'exact' }).eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(15);
  const countEl = document.getElementById('profile-activity-count'); if (countEl) countEl.innerText = count || 0;
  const el = document.getElementById('activity-list'); if (!el) return;
  el.innerHTML = (data && data.length) ? data.map(a => `<div class="activity-item"><div class="activity-dot"></div><div><b>${CU.esc(actionLabel(a.action))}</b><span>${new Date(a.created_at).toLocaleString('id-ID')}</span></div></div>`).join('')
    : '<p style="font-size:11px;color:var(--text-sub);text-align:center;">Belum ada aktivitas tercatat.</p>';
}

const ProfileUI = {
  openEdit() {
    ModalUI.openCustom('Edit Profil', 'Perbarui identitas neural kamu', `
      <div class="form-group"><label>Username</label><input class="form-input" id="edit-username" value="${CU.esc(currentProfile.username || '')}"></div>
      <div class="form-group"><label>Bio</label><textarea class="form-textarea" id="edit-bio">${CU.esc(currentProfile.bio || '')}</textarea></div>
      <div class="form-group"><label>URL Avatar</label><input class="form-input" id="edit-avatar" value="${CU.esc(currentProfile.avatar_url || '')}" placeholder="https://..."></div>
      <button class="form-btn" onclick="ProfileUI.saveEdit()">Simpan Perubahan</button>
      <div class="form-msg" id="edit-msg"></div>`);
  },
  async saveEdit() {
    const username = document.getElementById('edit-username').value.trim();
    const bio = document.getElementById('edit-bio').value.trim();
    const avatar_url = document.getElementById('edit-avatar').value.trim();
    const { error } = await sb.from('profiles').update({ username, bio, avatar_url }).eq('id', currentUser.id);
    const msg = document.getElementById('edit-msg');
    if (error) { msg.className = 'form-msg error'; msg.innerText = error.message; return; }
    currentProfile = { ...currentProfile, username, bio, avatar_url };
    renderAuthState(); logActivity('profile_update', {}); ModalUI.close();
    ChronoStar.showToast('Profil berhasil diperbarui', 'success');
  },
  addLink() {
    ModalUI.openCustom('Tambah Bio Link', 'Sematkan tautan eksternal', `
      <div class="form-group"><label>Label Tautan</label><input class="form-input" id="link-label" placeholder="mis: GitHub / Telegram"></div>
      <div class="form-group"><label>URL Tujuan</label><input class="form-input" id="link-url" placeholder="https://..."></div>
      <button class="form-btn" onclick="ProfileUI.saveLink()">Tambah Tautan</button>
      <div class="form-msg" id="link-msg"></div>`);
  },
  async saveLink() {
    const label = document.getElementById('link-label').value.trim();
    const url = document.getElementById('link-url').value.trim();
    const msg = document.getElementById('link-msg');
    if (!label || !url) { msg.className = 'form-msg error'; msg.innerText = 'Lengkapi label dan URL.'; return; }
    const links = Array.isArray(currentProfile.links) ? [...currentProfile.links] : [];
    links.push({ label, url });
    const { error } = await sb.from('profiles').update({ links }).eq('id', currentUser.id);
    if (error) { msg.className = 'form-msg error'; msg.innerText = error.message; return; }
    currentProfile.links = links; renderProfileSection(); ModalUI.close();
    ChronoStar.showToast('Tautan berhasil ditambahkan', 'success');
  }
};

// ---- Admin / Owner Panel Extensions ----
const AdminUI = {
  addPost(type) {
    ModalUI.openCustom(type === 'news' ? 'Tambah Berita Sistem' : 'Tambah Informasi Resmi', 'Broadcast untuk seluruh warga jaringan', `
      <div class="form-group"><label>Judul</label><input class="form-input" id="post-title"></div>
      <div class="form-group"><label>Konten</label><textarea class="form-textarea" id="post-content"></textarea></div>
      ${type === 'news' ? '<div class="form-group"><label>URL Gambar Banner (Opsional)</label><input class="form-input" id="post-image" placeholder="https://..."></div>' : ''}
      <button class="form-btn" onclick="AdminUI.savePost('${type}')">Broadcast Publikasi</button>
      <div class="form-msg" id="post-msg"></div>`);
  },
  async savePost(type) {
    const title = document.getElementById('post-title').value.trim();
    const content = document.getElementById('post-content').value.trim();
    const imageEl = document.getElementById('post-image');
    const image_url = imageEl ? imageEl.value.trim() : null;
    const msg = document.getElementById('post-msg');
    if (!title || !content) { msg.className = 'form-msg error'; msg.innerText = 'Judul dan konten wajib diisi.'; return; }
    const { error } = await sb.from('posts').insert({ type, title, content, image_url: image_url || null, created_by: currentUser.id });
    if (error) { msg.className = 'form-msg error'; msg.innerText = error.message; return; }
    ModalUI.close(); logActivity('post_add', { type, title });
    ChronoStar.showToast('Publikasi berhasil disiarkan', 'success');
    if (type === 'news') loadNews(); else loadInfo();
  },
  async deletePost(id, type) {
    const { error } = await sb.from('posts').delete().eq('id', id);
    if (error) { ChronoStar.showToast('Gagal menghapus publikasi', 'error'); return; }
    logActivity('post_delete', { id });
    ChronoStar.showToast('Publikasi dihapus dari sistem', 'info');
    if (type === 'news') loadNews(); else loadInfo();
  },
  async openAllActivity() {
    const { data } = await sb.from('activity_log').select('*, profiles(username)').order('created_at', { ascending: false }).limit(50);
    const html = (data && data.length) ? data.map(a => `<div class="activity-item"><div class="activity-dot"></div><div><b>${CU.esc((a.profiles && a.profiles.username) || 'user')}</b> — ${CU.esc(actionLabel(a.action))}<span>${new Date(a.created_at).toLocaleString('id-ID')}</span></div></div>`).join('') : '<p style="font-size:11px;color:var(--text-sub);">Belum ada log tercatat.</p>';
    ModalUI.openCustom('Log Aktivitas Global', '50 aktivitas mutakhir di jaringan', html);
  },
  async openUserList() {
    const { data } = await sb.from('profiles').select('username, role, created_at').order('created_at', { ascending: false }).limit(100);
    const html = (data && data.length) ? data.map(u => `<div class="activity-item"><div class="activity-dot" style="background:${u.role === 'owner' ? 'var(--neon-green)' : 'var(--neon-cyan)'}"></div><div><b>${CU.esc(u.username || 'Tanpa Nama')}</b><span>${u.role.toUpperCase()} • Gabung ${new Date(u.created_at).toLocaleDateString('id-ID')}</span></div></div>`).join('') : '<p style="font-size:11px;color:var(--text-sub);">Belum ada member terdaftar.</p>';
    ModalUI.openCustom('Direktori Member', `${data ? data.length : 0} akun terdaftar di database`, html);
  }
};

// ---- CMS Content Loaders ----
async function loadNews() {
  const { data, error } = await sb.from('posts').select('*').eq('type', 'news').order('created_at', { ascending: false }).limit(10);
  const el = document.getElementById('news-list'); if (!el) return;
  if (error || !data || !data.length) { el.innerHTML = `<div class="card" style="text-align:center;color:var(--text-sub);font-size:12px;">Belum ada berita aktif.</div>`; return; }
  el.innerHTML = data.map(n => `
    <div class="news-post" style="margin:0 16px 14px 16px;">
      ${n.image_url ? `<img src="${CU.esc(n.image_url)}" alt="">` : ''}
      <div class="news-post-body">
        <h4>${CU.esc(n.title)}</h4>
        <p>${CU.esc(n.content)}</p>
        <div class="news-post-meta"><span>${new Date(n.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>${currentProfile && currentProfile.role === 'owner' ? `<button class="post-del-btn" onclick="AdminUI.deletePost(${n.id},'news')">Hapus</button>` : ''}</div>
      </div>
    </div>`).join('');
}

async function loadInfo() {
  const { data, error } = await sb.from('posts').select('*').eq('type', 'info').order('created_at', { ascending: false }).limit(20);
  const el = document.getElementById('info-list'); if (!el) return;
  if (error || !data || !data.length) { el.innerHTML = `<p style="font-size:11px;color:var(--text-sub);">Belum ada instruksi protokol tambahan.</p>`; return; }
  el.innerHTML = data.map(n => `
    <div style="background:#121522;border:1px solid var(--card-border);padding:12px;border-radius:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <b style="font-size:12px;color:var(--text-main);">${CU.esc(n.title)}</b>
        ${currentProfile && currentProfile.role === 'owner' ? `<button class="post-del-btn" onclick="AdminUI.deletePost(${n.id},'info')">Hapus</button>` : ''}
      </div>
      <p style="font-size:11px;color:var(--text-sub);margin:4px 0 0 0;white-space:pre-wrap;">${CU.esc(n.content)}</p>
    </div>`).join('');
}

// ---- Realtime Presence & Stats ----
function setupPresence() {
  if (!currentUser || !currentProfile) return;
  if (presenceChannel) sb.removeChannel(presenceChannel);
  presenceChannel = sb.channel('online-users', { config: { presence: { key: currentUser.id } } });
  presenceChannel.on('presence', { event: 'sync' }, () => {
    const state = presenceChannel.presenceState();
    const el = document.getElementById('stat-online'); if (el) el.innerText = Object.keys(state).length;
  }).subscribe(async (status) => {
    if (status === 'SUBSCRIBED') await presenceChannel.track({ username: currentProfile.username, online_at: new Date().toISOString() });
  });
}

async function loadMemberCount() {
  const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true });
  const el = document.getElementById('stat-members'); if (el) el.innerText = count ?? 0;
}

// ---- Modal, Navigation & UI Engine ----
const ModalUI = {
  open(tool) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `<div class="modal-header"><div><h3>${CU.esc(tool.title)}</h3><p>${CU.esc(tool.desc)}</p></div><div class="modal-close" onclick="ModalUI.close()">✕</div></div><div id="modal-tool-root"></div>`;
    document.getElementById('modal-overlay').classList.add('open');
    tool.render(document.getElementById('modal-tool-root'));
    logActivity('tool_open', { tool: tool.id, title: tool.title });
  },
  openCustom(title, sub, html) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `<div class="modal-header"><div><h3>${CU.esc(title)}</h3>${sub ? `<p>${CU.esc(sub)}</p>` : ''}</div><div class="modal-close" onclick="ModalUI.close()">✕</div></div><div>${html}</div>`;
    document.getElementById('modal-overlay').classList.add('open');
  },
  close() {
    if (ToolRuntime.cleanup) { ToolRuntime.cleanup(); ToolRuntime.cleanup = null; }
    document.getElementById('modal-overlay').classList.remove('open');
    document.getElementById('modal-box').innerHTML = '';
  }
};

let activeCategory = 'all';
function renderChips() {
  const row = document.getElementById('chip-row');
  row.innerHTML = CATEGORIES.map(c => `<div class="chip ${c.id === activeCategory ? 'active' : ''}" data-cat="${c.id}">${c.label}</div>`).join('');
  row.querySelectorAll('.chip').forEach(chip => chip.onclick = () => { activeCategory = chip.dataset.cat; renderChips(); renderToolGrid(); });
}

function renderToolGrid(query) {
  query = (query ?? document.getElementById('global-search-input').value ?? '').toLowerCase().trim();
  const grid = document.getElementById('tool-grid');
  const filtered = TOOLS.filter(t => (activeCategory === 'all' || t.cat === activeCategory) && (!query || t.title.toLowerCase().includes(query) || t.desc.toLowerCase().includes(query)));
  const sub = document.getElementById('tools-subtitle'); if (sub) sub.innerText = `${TOOLS.length} MODUL UTAMA // ${filtered.length} AKTIF`;
  grid.innerHTML = filtered.length ? filtered.map(t => `
    <div class="tool-card" data-tool="${t.id}">
      <div class="t-icon"><svg viewBox="0 0 24 24">${CAT_ICON[t.cat]}</svg></div>
      <h4>${CU.esc(t.title)}</h4>
      <p>${CU.esc(t.desc)}</p>
    </div>`).join('') : `<div class="tool-empty">Modul siber tidak ditemukan.</div>`;
  grid.querySelectorAll('.tool-card').forEach(card => card.onclick = () => ModalUI.open(TOOLS.find(t => t.id === card.dataset.tool)));
}

function switchTab(tabName, element) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const target = document.getElementById('tab-' + tabName); if (target) target.classList.add('active');
  if (element) element.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchTabByNav(tabName) {
  const map = { home: 0, whatsapp: 1, info: 2, tools: 3, profile: 4 };
  switchTab(tabName, document.querySelectorAll('.nav-item')[map[tabName] || 0]);
}

function toggleDrawer() {
  const drawer = document.getElementById('drawer-menu'), overlay = document.getElementById('drawer-overlay');
  if (drawer.classList.contains('open')) { drawer.classList.remove('open'); overlay.style.display = 'none'; }
  else { drawer.classList.add('open'); overlay.style.display = 'block'; }
}

class ChronoStarEngine {
  constructor() { this.startTime = Date.now(); this.init(); }
  init() { this.startLiveClock(); this.startUptimeTracker(); this.initRealPingMonitor(); }
  startLiveClock() {
    setInterval(() => {
      const now = new Date(), pad = n => String(n).padStart(2, '0');
      const el = document.getElementById('live-date-clock');
      if (el) el.innerText = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }, 1000);
  }
  startUptimeTracker() {
    setInterval(() => {
      const ms = Date.now() - this.startTime;
      const s = Math.floor((ms / 1000) % 60), m = Math.floor((ms / 60000) % 60), h = Math.floor((ms / 3600000) % 24), d = Math.floor(ms / 86400000);
      const el = document.getElementById('uptime-counter'); if (el) el.innerText = `${d}d ${h}h ${m}m ${s}s`;
    }, 1000);
  }
  async checkPing() {
    const el = document.getElementById('ping-counter'); if (!el) return;
    if (!navigator.onLine) { el.innerText = 'OFFLINE'; el.style.color = '#ff0055'; return; }
    const start = performance.now();
    try {
      await fetch('https://www.google.com/favicon.ico?t=' + Date.now(), { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
      const d = Math.round(performance.now() - start); el.innerText = d + 'ms'; el.style.color = d > 200 ? '#ff0055' : 'var(--text-main)';
    } catch (e) { el.innerText = 'OFFLINE'; el.style.color = '#ff0055'; }
  }
  initRealPingMonitor() { setInterval(() => this.checkPing(), 5000); this.checkPing(); }
  showToast(message, type = 'info') {
    let box = document.getElementById('cyber-toast-box');
    if (!box) { box = document.createElement('div'); box.id = 'cyber-toast-box'; Object.assign(box.style, { position: 'fixed', top: '20px', right: '16px', left: '16px', zIndex: '99999', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }); document.body.appendChild(box); }
    const toast = document.createElement('div');
    const color = type === 'error' ? '#ff0055' : (type === 'success' ? '#00ff66' : '#ffffff');
    Object.assign(toast.style, { background: '#0b0d14', border: `1px solid ${color}`, color: '#fff', padding: '12px 18px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', boxShadow: '0 0 10px rgba(255,255,255,0.1)', transition: 'all 0.3s ease', opacity: '0', transform: 'translateY(-10px)', maxWidth: '280px' });
    toast.innerText = `[SYS] ${message}`; box.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-10px)'; setTimeout(() => toast.remove(), 300); }, 3000);
  }
  handleSearch(query) { if (query.trim().length > 0) switchTabByNav('tools'); renderToolGrid(query); }
}

const ChronoStar = new ChronoStarEngine();

document.addEventListener('DOMContentLoaded', async () => {
  const label = document.getElementById('tools-count-label'); if (label) label.innerText = TOOLS.length + '+ fitur cyber security';
  renderChips(); renderToolGrid();
  loadNews(); loadInfo(); loadMemberCount();

  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user) await onAuthed(session.user);
  else renderAuthState();

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { currentUser = null; currentProfile = null; renderAuthState(); }
  });
});

window.addEventListener('beforeunload', () => { if (presenceChannel) sb.removeChannel(presenceChannel); });
