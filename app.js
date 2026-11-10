/* ChronoStar X — App Core
   Supabase auth, roles, real-time presence, activity logging, news/info CMS, profile/bio-link page. */

// ---- Supabase config (publishable key is safe to expose client-side; RLS enforces access) ----
const SUPABASE_URL = 'https://ajsqtqxcpnqhjhyphiiw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7bdRFYA7g6mQirAz8mr8Fg_L90CmrSk';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentProfile = null;
let presenceChannel = null;

// Local escape helper — deliberately NOT dependent on tools.js's CU object.
// Keeps auth/profile/admin/news working even if tools.js fails to load.
function esc(s) { const d = document.createElement('div'); d.innerText = s ?? ''; return d.innerHTML; }

// ---- Activity logging ----
async function logActivity(action, meta = {}) {
  if (!currentUser) return;
  try { await sb.from('activity_log').insert({ user_id: currentUser.id, action, meta }); } catch (e) { console.warn('activity log failed', e); }
  const el = document.getElementById('activity-list');
  if (el && document.getElementById('tab-profile').classList.contains('active')) loadActivityList();
}
function actionLabel(action) {
  const labels = { login: 'Masuk ke akun', tool_open: 'Membuka tool', post_add: 'Menambahkan post', post_delete: 'Menghapus post', profile_update: 'Memperbarui profil' };
  return labels[action] || action;
}
// Only http(s) links are allowed — blocks javascript:/data: URLs in bio links and post images.
// The database enforces this too (see schema.sql §6b/6c); this just gives an instant, friendly error.
function isSafeUrl(url) { return /^https?:\/\//i.test((url || '').trim()); }
// Activity rows with a bit of context (which tool, which post) instead of just the bare action name.
function activityDescription(a) {
  const base = actionLabel(a.action);
  const meta = a.meta || {};
  if (a.action === 'tool_open' && meta.title) return `${base}: ${esc(meta.title)}`;
  if (a.action === 'post_add' && meta.title) return `${base} (${meta.type === 'news' ? 'Berita' : 'Info'}): ${esc(meta.title)}`;
  return esc(base);
}

// ---- Auth ----
async function onAuthed(user, opts = {}) {
  currentUser = user;
  await loadProfile();
  if (currentProfile && currentProfile.banned) {
    await sb.auth.signOut();
    currentUser = null; currentProfile = null;
    renderAuthState();
    ChronoStar.showToast('Akun ini telah dinonaktifkan oleh admin.', 'error');
    return;
  }
  setupPresence();
  renderAuthState();
  if (opts.logLogin) logActivity('login', {});
}
async function loadProfile() {
  if (!currentUser) return;
  let { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (error || !data) {
    // No profile row yet — happens for accounts created straight in Supabase (e.g. the first
    // owner account) or any other gap before the signup trigger ran. Self-heal instead of
    // leaving the person stuck on the login screen.
    const fallbackUsername = (currentUser.user_metadata && currentUser.user_metadata.username) || (currentUser.email ? currentUser.email.split('@')[0] : 'user');
    const { data: created, error: createErr } = await sb.from('profiles')
      .upsert({ id: currentUser.id, username: fallbackUsername, role: 'member' }, { onConflict: 'id' })
      .select().single();
    if (!createErr) data = created;
    else console.warn('profile auto-repair failed', createErr);
  }
  currentProfile = data || null;
}

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
    if (!email || !password) { msg.className = 'form-msg error'; msg.innerText = 'Isi email dan password.'; return; }
    btn.disabled = true; msg.className = 'form-msg'; msg.innerText = 'Memproses...';
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) {
      msg.className = 'form-msg error';
      msg.innerText = /email not confirmed/i.test(error.message)
        ? 'Email belum diverifikasi. Cek inbox kamu dan klik link konfirmasi dulu sebelum masuk.'
        : error.message;
      return;
    }
    msg.className = 'form-msg success'; msg.innerText = 'Berhasil masuk!';
    await onAuthed(data.user, { logLogin: true });
    ChronoStar.showToast('Selamat datang kembali!', 'success');
  },
  async register() {
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const msg = document.getElementById('register-msg'), btn = document.getElementById('register-btn');
    if (!username || !email || !password) { msg.className = 'form-msg error'; msg.innerText = 'Lengkapi semua kolom.'; return; }
    if (password.length < 6) { msg.className = 'form-msg error'; msg.innerText = 'Password minimal 6 karakter.'; return; }
    btn.disabled = true; msg.className = 'form-msg'; msg.innerText = 'Membuat akun...';
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username } } });
    btn.disabled = false;
    if (error) { msg.className = 'form-msg error'; msg.innerText = error.message; return; }
    if (data.session) { msg.className = 'form-msg success'; msg.innerText = 'Akun dibuat & masuk!'; await onAuthed(data.user, { logLogin: true }); }
    else { msg.className = 'form-msg success'; msg.innerText = 'Akun dibuat! Cek email kamu untuk konfirmasi sebelum masuk.'; }
  },
  async logout() {
    await sb.auth.signOut();
    if (presenceChannel) { sb.removeChannel(presenceChannel); presenceChannel = null; }
    currentUser = null; currentProfile = null;
    renderAuthState();
    ChronoStar.showToast('Berhasil keluar', 'info');
    switchTabByNav('home');
  }
};

function renderAuthState() {
  const homeStatus = document.getElementById('home-status'), homeUsername = document.getElementById('home-username'), homeAvatar = document.getElementById('home-avatar');
  const navLabel = document.getElementById('nav-profile-label'), authSection = document.getElementById('auth-section'), profileSection = document.getElementById('profile-section');
  if (currentUser && currentProfile) {
    homeStatus.innerHTML = `<span class="online-indicator">● ONLINE</span> &nbsp; <span style="color:var(--text-sub);">${currentProfile.role === 'owner' ? 'OWNER' : 'MEMBER'}</span>`;
    homeUsername.innerText = currentProfile.username || currentUser.email;
    homeAvatar.innerText = (currentProfile.username || currentUser.email || '?')[0].toUpperCase();
    navLabel.innerText = 'Profil';
    authSection.style.display = 'none'; profileSection.style.display = 'block';
    renderProfileSection();
  } else {
    homeStatus.innerHTML = `<span class="offline-indicator">● TAMU</span> &nbsp; <span style="color:var(--text-sub);">belum login</span>`;
    homeUsername.innerText = 'ChronoStar x'; homeAvatar.innerText = 'C';
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

// ---- Profile / bio-link ----
function renderProfileSection() {
  const p = currentProfile;
  document.getElementById('profile-username').innerText = p.username || currentUser.email;
  document.getElementById('profile-bio').innerText = p.bio || 'Belum ada bio.';
  const avatarEl = document.getElementById('profile-avatar');
  avatarEl.innerHTML = p.avatar_url ? `<img src="${esc(p.avatar_url)}">` : esc((p.username || '?')[0].toUpperCase());
  document.getElementById('profile-access').innerText = p.role === 'owner' ? 'Owner / Root Admin' : 'Member';
  document.getElementById('profile-joined').innerText = new Date(p.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  document.getElementById('profile-role-badge').innerHTML = p.role === 'owner' ? `<div class="profile-badge-owner">OWNER & FOUNDER</div>` : `<div class="profile-badge-member">MEMBER</div>`;
  document.getElementById('owner-admin-zone').style.display = p.role === 'owner' ? 'block' : 'none';
  const links = Array.isArray(p.links) ? p.links : [];
  document.getElementById('links-list').innerHTML = links.length
    ? links.map(l => isSafeUrl(l.url)
        ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="link-item">${esc(l.label)} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg></a>`
        : `<div class="link-item" style="opacity:0.5;">${esc(l.label)} <span style="font-size:9px;color:var(--neon-pink);">tautan tidak valid</span></div>`
      ).join('')
    : '<p style="font-size:11px;color:var(--text-sub);text-align:center;">Belum ada link.</p>';
  loadActivityList();
}
async function loadActivityList() {
  if (!currentUser) return;
  const { data, count } = await sb.from('activity_log').select('*', { count: 'exact' }).eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(15);
  const countEl = document.getElementById('profile-activity-count'); if (countEl) countEl.innerText = count || 0;
  const el = document.getElementById('activity-list'); if (!el) return;
  el.innerHTML = (data && data.length) ? data.map(a => `<div class="activity-item"><div class="activity-dot"></div><div><b>${activityDescription(a)}</b><span>${new Date(a.created_at).toLocaleString('id-ID')}</span></div></div>`).join('')
    : '<p style="font-size:11px;color:var(--text-sub);text-align:center;">Belum ada aktivitas.</p>';
}

const ProfileUI = {
  openEdit() {
    ModalUI.openCustom('Edit Profil', '', `
      <div class="form-group"><label>Username</label><input class="form-input" id="edit-username" maxlength="40" value="${esc(currentProfile.username || '')}"></div>
      <div class="form-group"><label>Bio</label><textarea class="form-textarea" id="edit-bio" maxlength="500">${esc(currentProfile.bio || '')}</textarea></div>
      <div class="form-group"><label>URL Avatar (opsional)</label><input class="form-input" id="edit-avatar" value="${esc(currentProfile.avatar_url || '')}" placeholder="https://..."></div>
      <button class="form-btn" onclick="ProfileUI.saveEdit()">Simpan</button>
      <div class="form-msg" id="edit-msg"></div>`);
  },
  async saveEdit() {
    const username = document.getElementById('edit-username').value.trim();
    const bio = document.getElementById('edit-bio').value.trim();
    const avatar_url = document.getElementById('edit-avatar').value.trim();
    const msg = document.getElementById('edit-msg');
    if (username.length > 40) { msg.className = 'form-msg error'; msg.innerText = 'Username maksimal 40 karakter.'; return; }
    if (bio.length > 500) { msg.className = 'form-msg error'; msg.innerText = 'Bio maksimal 500 karakter.'; return; }
    if (avatar_url && !isSafeUrl(avatar_url)) { msg.className = 'form-msg error'; msg.innerText = 'URL avatar harus diawali http:// atau https://'; return; }
    const { error } = await sb.from('profiles').update({ username, bio, avatar_url }).eq('id', currentUser.id);
    if (error) { msg.className = 'form-msg error'; msg.innerText = error.message; return; }
    currentProfile = { ...currentProfile, username, bio, avatar_url };
    renderAuthState(); logActivity('profile_update', {}); ModalUI.close();
    ChronoStar.showToast('Profil diperbarui', 'success');
  },
  addLink() {
    const links = Array.isArray(currentProfile.links) ? currentProfile.links : [];
    if (links.length >= 10) { ChronoStar.showToast('Maksimal 10 bio link.', 'error'); return; }
    ModalUI.openCustom('Tambah Bio Link', '', `
      <div class="form-group"><label>Label</label><input class="form-input" id="link-label" maxlength="40" placeholder="mis: Instagram"></div>
      <div class="form-group"><label>URL</label><input class="form-input" id="link-url" placeholder="https://..."></div>
      <button class="form-btn" onclick="ProfileUI.saveLink()">Tambah</button>
      <div class="form-msg" id="link-msg"></div>`);
  },
  async saveLink() {
    const label = document.getElementById('link-label').value.trim();
    const url = document.getElementById('link-url').value.trim();
    const msg = document.getElementById('link-msg');
    if (!label || !url) { msg.className = 'form-msg error'; msg.innerText = 'Lengkapi label dan URL.'; return; }
    if (!isSafeUrl(url)) { msg.className = 'form-msg error'; msg.innerText = 'URL harus diawali http:// atau https://'; return; }
    const links = Array.isArray(currentProfile.links) ? [...currentProfile.links] : [];
    links.push({ label, url });
    const { error } = await sb.from('profiles').update({ links }).eq('id', currentUser.id);
    if (error) { msg.className = 'form-msg error'; msg.innerText = error.message; return; }
    currentProfile.links = links; renderProfileSection(); ModalUI.close();
  },
  confirmClearActivity() {
    ModalUI.openCustom('Bersihkan Riwayat Aktivitas', '', `
      <p style="font-size:13px;color:var(--text-main);margin-bottom:16px;line-height:1.5;">Ini akan menghapus seluruh riwayat aktivitasmu secara permanen. Tidak bisa dibatalkan.</p>
      <button class="form-btn danger" onclick="ProfileUI.clearActivity()" style="margin-bottom:8px;">Ya, Bersihkan</button>
      <button class="form-btn secondary" onclick="ModalUI.close()">Batal</button>`);
  },
  async clearActivity() {
    const { data, error } = await sb.from('activity_log').delete().eq('user_id', currentUser.id).select();
    ModalUI.close();
    reportDeleteResult(data, error, 'Riwayat aktivitas dibersihkan');
    loadActivityList();
  }
};
// Shared by every "delete/clear" admin & profile action: no error doesn't mean
// something actually happened — under RLS, a delete with no matching policy
// just silently affects zero rows instead of throwing. Checking the returned
// rows (requires .select() chained after .delete()) is the only reliable way
// to tell "cleared" apart from "nothing happened", and the second case is
// almost always schema.sql not having been (re-)run yet.
function reportDeleteResult(data, error, successMessage) {
  if (error) { ChronoStar.showToast('Gagal: ' + error.message, 'error'); return; }
  if (!data || data.length === 0) {
    ChronoStar.showToast('Tidak ada yang terhapus — kemungkinan schema.sql versi terbaru belum dijalankan ulang di Supabase.', 'error');
    return;
  }
  ChronoStar.showToast(successMessage, 'success');
}

// ---- Admin / Owner panel ----
const AdminUI = {
  addPost(type) {
    ModalUI.openCustom(type === 'news' ? 'Tambah Berita' : 'Tambah Informasi', 'Tampil untuk semua pengguna', `
      <div class="form-group"><label>Judul</label><input class="form-input" id="post-title" maxlength="200"></div>
      <div class="form-group"><label>Isi</label><textarea class="form-textarea" id="post-content" maxlength="5000"></textarea></div>
      ${type === 'news' ? '<div class="form-group"><label>URL Gambar (opsional)</label><input class="form-input" id="post-image" placeholder="https://..."></div>' : ''}
      <button class="form-btn" onclick="AdminUI.savePost('${type}')">Publikasikan</button>
      <div class="form-msg" id="post-msg"></div>`);
  },
  async savePost(type) {
    const title = document.getElementById('post-title').value.trim();
    const content = document.getElementById('post-content').value.trim();
    const imageEl = document.getElementById('post-image');
    const image_url = imageEl ? imageEl.value.trim() : null;
    const msg = document.getElementById('post-msg');
    if (!title || !content) { msg.className = 'form-msg error'; msg.innerText = 'Lengkapi judul dan isi.'; return; }
    if (image_url && !isSafeUrl(image_url)) { msg.className = 'form-msg error'; msg.innerText = 'URL gambar harus diawali http:// atau https://'; return; }
    const { error } = await sb.from('posts').insert({ type, title, content, image_url: image_url || null, created_by: currentUser.id });
    if (error) { msg.className = 'form-msg error'; msg.innerText = error.message; return; }
    ModalUI.close(); logActivity('post_add', { type, title });
    ChronoStar.showToast('Berhasil dipublikasikan', 'success');
    if (type === 'news') loadNews(); else loadInfo();
  },
  async deletePost(id, type) {
    const { data, error } = await sb.from('posts').delete().eq('id', id).select();
    reportDeleteResult(data, error, 'Post dihapus');
    if (error || !data || !data.length) return;
    logActivity('post_delete', { id });
    if (type === 'news') loadNews(); else loadInfo();
  },
  async openAllActivity() {
    const { data } = await sb.from('activity_log').select('*, profiles(username)').order('created_at', { ascending: false }).limit(50);
    const html = (data && data.length) ? data.map(a => `<div class="activity-item"><div class="activity-dot"></div><div><b>${esc((a.profiles && a.profiles.username) || 'user')}</b> — ${activityDescription(a)}<span>${new Date(a.created_at).toLocaleString('id-ID')}</span></div></div>`).join('') : '<p style="font-size:11px;color:var(--text-sub);">Belum ada aktivitas.</p>';
    ModalUI.openCustom('Log Aktivitas Semua User', '50 aktivitas terbaru', html);
  },
  async openUserList() {
    const { data } = await sb.from('profiles').select('id, username, role, banned, confirmed_at, created_at').order('created_at', { ascending: false }).limit(100);
    const html = (data && data.length) ? data.map(u => `
      <div class="activity-item" style="cursor:pointer;${u.banned ? 'opacity:0.5;' : ''}" onclick="AdminUI.viewMember('${u.id}')">
        <div class="activity-dot" style="background:${u.role === 'owner' ? 'var(--neon-green)' : (u.banned ? 'var(--neon-pink)' : 'var(--neon-cyan)')}"></div>
        <div><b>${esc(u.username || '(tanpa nama)')}</b>
          <span>${u.role.toUpperCase()} • ${u.confirmed_at ? 'terverifikasi' : 'belum verifikasi'}${u.banned ? ' • dinonaktifkan' : ''} • bergabung ${new Date(u.created_at).toLocaleDateString('id-ID')}</span>
        </div>
      </div>`).join('') : '<p style="font-size:11px;color:var(--text-sub);">Belum ada member.</p>';
    ModalUI.openCustom('Daftar Member', `${data ? data.length : 0} akun terdaftar — ketuk untuk lihat profil`, html);
  },
  async viewMember(userId) {
    const { data: p } = await sb.from('profiles').select('*').eq('id', userId).single();
    if (!p) { ChronoStar.showToast('Member tidak ditemukan', 'error'); return; }
    const { count: activityCount } = await sb.from('activity_log').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    const links = Array.isArray(p.links) ? p.links : [];
    const uname = esc(p.username || 'member');
    const actions = p.role === 'owner'
      ? '<p style="font-size:11px;color:var(--text-sub);text-align:center;">Akun owner tidak bisa dihapus/dinonaktifkan dari sini.</p>'
      : p.banned
        ? `<button class="form-btn" onclick="AdminUI.restoreAccount('${p.id}')">Pulihkan Akun</button>`
        : `<button class="form-btn secondary" onclick="AdminUI.clearUserActivity('${p.id}')" style="margin-bottom:10px;">Bersihkan Aktivitas User Ini</button>
           <button class="form-btn danger" onclick="AdminUI.confirmDeleteAccount('${p.id}')">Hapus Akun</button>`;
    const html = `
      <div style="text-align:center;margin-bottom:16px;">
        <div class="profile-big-avatar" style="margin:0 auto 10px auto;">${p.avatar_url ? `<img src="${esc(p.avatar_url)}">` : esc((p.username || '?')[0].toUpperCase())}</div>
        <div style="font-weight:800;font-size:15px;color:#fff;">${uname}</div>
        ${p.role === 'owner' ? '<div class="profile-badge-owner">OWNER & FOUNDER</div>' : '<div class="profile-badge-member">MEMBER</div>'}
        ${p.banned ? '<div style="margin-top:6px;font-size:10px;color:var(--neon-pink);font-weight:800;">⛔ AKUN DINONAKTIFKAN</div>' : ''}
      </div>
      <p style="font-size:12px;color:var(--text-sub);text-align:center;margin-bottom:16px;">${esc(p.bio || 'Belum ada bio.')}</p>
      <div class="profile-info-grid" style="margin:0 0 16px 0;">
        <div class="profile-info-box"><span>STATUS EMAIL</span><b>${p.confirmed_at ? 'Terverifikasi' : 'Belum verifikasi'}</b></div>
        <div class="profile-info-box"><span>BERGABUNG</span><b>${new Date(p.created_at).toLocaleDateString('id-ID')}</b></div>
        <div class="profile-info-box"><span>TOTAL AKTIVITAS</span><b>${activityCount || 0}</b></div>
        <div class="profile-info-box"><span>BIO LINKS</span><b>${links.length}</b></div>
      </div>
      ${links.length ? `<div style="margin-bottom:16px;">${links.map(l => isSafeUrl(l.url) ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="link-item">${esc(l.label)}</a>` : '').join('')}</div>` : ''}
      ${actions}`;
    ModalUI.openCustom('Profil Member', '', html);
  },
  confirmDeleteAccount(userId) {
    ModalUI.openCustom('Konfirmasi Hapus Akun', '', `
      <p style="font-size:13px;color:var(--text-main);margin-bottom:16px;line-height:1.5;">Yakin ingin menghapus akun ini? Akun tidak akan bisa login lagi dan profilnya (nama, bio, link) akan dikosongkan — riwayat aktivitasnya juga dihapus.<br><br>Bisa dipulihkan lewat tombol "Pulihkan Akun" di profil yang sama.</p>
      <button class="form-btn danger" onclick="AdminUI.deleteAccount('${userId}')" style="margin-bottom:8px;">Ya, Hapus Akun</button>
      <button class="form-btn secondary" onclick="ModalUI.close()">Batal</button>`);
  },
  async deleteAccount(userId) {
    const { data, error } = await sb.from('profiles').update({ banned: true, username: '[akun dihapus]', bio: '', avatar_url: null, links: [] }).eq('id', userId).select();
    if (error) { ChronoStar.showToast('Gagal: ' + error.message, 'error'); return; }
    if (!data || !data.length) { ChronoStar.showToast('Tidak ada perubahan — kemungkinan schema.sql versi terbaru belum dijalankan ulang di Supabase.', 'error'); return; }
    await sb.from('activity_log').delete().eq('user_id', userId);
    logActivity('account_moderation', { target: userId, action: 'delete' });
    ChronoStar.showToast('Akun dihapus', 'success');
    ModalUI.close();
  },
  async restoreAccount(userId) {
    const { data, error } = await sb.from('profiles').update({ banned: false }).eq('id', userId).select();
    if (error) { ChronoStar.showToast('Gagal: ' + error.message, 'error'); return; }
    if (!data || !data.length) { ChronoStar.showToast('Tidak ada perubahan — kemungkinan schema.sql versi terbaru belum dijalankan ulang di Supabase.', 'error'); return; }
    logActivity('account_moderation', { target: userId, action: 'restore' });
    ChronoStar.showToast('Akun dipulihkan', 'success');
    AdminUI.viewMember(userId);
  },
  async clearUserActivity(userId) {
    const { data, error } = await sb.from('activity_log').delete().eq('user_id', userId).select();
    reportDeleteResult(data, error, 'Aktivitas user dibersihkan');
  },
  confirmClearAllActivity() {
    ModalUI.openCustom('Bersihkan Cache Aktivitas', '', `
      <p style="font-size:13px;color:var(--text-main);margin-bottom:16px;line-height:1.5;">Ini akan menghapus SELURUH riwayat aktivitas semua pengguna secara permanen. Tidak bisa dibatalkan.</p>
      <button class="form-btn danger" onclick="AdminUI.clearAllActivity()" style="margin-bottom:8px;">Ya, Hapus Semua</button>
      <button class="form-btn secondary" onclick="ModalUI.close()">Batal</button>`);
  },
  async clearAllActivity() {
    const { data, error } = await sb.from('activity_log').delete().gte('id', 0).select();
    ModalUI.close();
    reportDeleteResult(data, error, 'Cache aktivitas dibersihkan');
  }
};

// ---- News & Info (public read, owner write) ----
async function loadNews() {
  const { data, error } = await sb.from('posts').select('*').eq('type', 'news').order('created_at', { ascending: false }).limit(10);
  const el = document.getElementById('news-list'); if (!el) return;
  if (error || !data || !data.length) { el.innerHTML = `<div class="card" style="text-align:center;color:var(--text-sub);font-size:12px;">Belum ada berita.</div>`; return; }
  el.innerHTML = data.map(n => `
    <div class="news-post" style="margin:0 16px 14px 16px;">
      ${n.image_url ? `<img src="${esc(n.image_url)}" alt="">` : ''}
      <div class="news-post-body">
        <h4>${esc(n.title)}</h4>
        <p>${esc(n.content)}</p>
        <div class="news-post-meta"><span>${new Date(n.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>${currentProfile && currentProfile.role === 'owner' ? `<button class="post-del-btn" onclick="AdminUI.deletePost(${n.id},'news')">Hapus</button>` : ''}</div>
      </div>
    </div>`).join('');
}
async function loadInfo() {
  const { data, error } = await sb.from('posts').select('*').eq('type', 'info').order('created_at', { ascending: false }).limit(20);
  const el = document.getElementById('info-list'); if (!el) return;
  if (error || !data || !data.length) { el.innerHTML = `<p style="font-size:11px;color:var(--text-sub);">Belum ada pengumuman tambahan.</p>`; return; }
  el.innerHTML = data.map(n => `
    <div style="background:#121522;border:1px solid var(--card-border);padding:12px;border-radius:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <b style="font-size:12px;color:var(--text-main);">${esc(n.title)}</b>
        ${currentProfile && currentProfile.role === 'owner' ? `<button class="post-del-btn" onclick="AdminUI.deletePost(${n.id},'info')">Hapus</button>` : ''}
      </div>
      <p style="font-size:11px;color:var(--text-sub);margin:4px 0 0 0;white-space:pre-wrap;">${esc(n.content)}</p>
    </div>`).join('');
}

// ---- Presence (real online-user count) & member count ----
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
  const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true }).eq('banned', false).not('confirmed_at', 'is', null);
  const el = document.getElementById('stat-members'); if (el) el.innerText = count ?? 0;
}

// ---- Generic modal ----
const ModalUI = {
  open(tool) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `<div class="modal-header"><div><h3>${esc(tool.title)}</h3><p>${esc(tool.desc)}</p></div><div class="modal-close" onclick="ModalUI.close()">✕</div></div><div id="modal-tool-root"></div>`;
    document.getElementById('modal-overlay').classList.add('open');
    tool.render(document.getElementById('modal-tool-root'));
    logActivity('tool_open', { tool: tool.id, title: tool.title });
  },
  openCustom(title, sub, html) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `<div class="modal-header"><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="modal-close" onclick="ModalUI.close()">✕</div></div><div>${html}</div>`;
    document.getElementById('modal-overlay').classList.add('open');
  },
  close() {
    if (typeof ToolRuntime !== 'undefined' && ToolRuntime.cleanup) { ToolRuntime.cleanup(); ToolRuntime.cleanup = null; }
    document.getElementById('modal-overlay').classList.remove('open');
    document.getElementById('modal-box').innerHTML = '';
  }
};

// ---- Tool grid, categories, search ----
let activeCategory = 'all';
function renderChips() {
  const row = document.getElementById('chip-row');
  row.innerHTML = CATEGORIES.map(c => `<div class="chip ${c.id === activeCategory ? 'active' : ''}" data-cat="${c.id}">${c.label}</div>`).join('');
  row.querySelectorAll('.chip').forEach(chip => chip.onclick = () => { activeCategory = chip.dataset.cat; renderChips(); renderToolGrid(); });
}
function toolCardHtml(t) {
  return `<div class="tool-card" data-tool="${t.id}">
      <div class="t-icon"><svg viewBox="0 0 24 24">${CAT_ICON[t.cat]}</svg></div>
      <h4>${esc(t.title)}</h4>
      <p>${esc(t.desc)}</p>
    </div>`;
}
function renderToolGrid(query) {
  query = (query ?? document.getElementById('global-search-input').value ?? '').toLowerCase().trim();
  const grid = document.getElementById('tool-grid');
  const matches = (t) => !query || t.title.toLowerCase().includes(query) || t.desc.toLowerCase().includes(query);
  let html = '', shown = 0;

  if (activeCategory === 'all' && !query) {
    // Grouped-by-category view: easier to scan than one long wall of cards.
    CATEGORIES.filter(c => c.id !== 'all').forEach(cat => {
      const items = TOOLS.filter(t => t.cat === cat.id);
      if (!items.length) return;
      shown += items.length;
      html += `<div class="tool-group-title">${cat.label}</div><div class="tool-grid-inner">${items.map(toolCardHtml).join('')}</div>`;
    });
  } else {
    const filtered = TOOLS.filter(t => (activeCategory === 'all' || t.cat === activeCategory) && matches(t));
    shown = filtered.length;
    html = filtered.length ? `<div class="tool-grid-inner">${filtered.map(toolCardHtml).join('')}</div>` : `<div class="tool-empty">Tidak ada tool yang cocok.</div>`;
  }

  grid.innerHTML = html;
  const sub = document.getElementById('tools-subtitle'); if (sub) sub.innerText = `${TOOLS.length} MODUL TERINTEGRASI // ${shown} DITAMPILKAN`;
  grid.querySelectorAll('.tool-card').forEach(card => card.onclick = () => ModalUI.open(TOOLS.find(t => t.id === card.dataset.tool)));
}

// ---- Tabs & drawer ----
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

// ---- Clock / uptime / ping / toast / search (kept from original, generalized) ----
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
    const icon = type === 'error' ? '✕' : (type === 'success' ? '✓' : 'ℹ');
    toast.innerText = `${icon} ${message}`; box.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-10px)'; setTimeout(() => toast.remove(), 300); }, 3000);
  }
  handleSearch(query) { if (query.trim().length > 0) switchTabByNav('tools'); if (typeof TOOLS !== 'undefined') renderToolGrid(query); }
}
const ChronoStar = new ChronoStarEngine();

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  // 1) Restore the session FIRST and on its own — this must never be blocked by
  //    anything below it, or a reload/reopen looks like it "logs you out" even
  //    though Supabase still has a valid session saved in the browser.
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) await onAuthed(session.user);
    else renderAuthState();
  } catch (e) {
    console.error('Session restore failed:', e);
    renderAuthState();
  }
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { currentUser = null; currentProfile = null; renderAuthState(); }
  });

  // 2) News / info / member count — independent of each other and of #3 below.
  try { loadNews(); } catch (e) { console.error('loadNews failed:', e); }
  try { loadInfo(); } catch (e) { console.error('loadInfo failed:', e); }
  try { loadMemberCount(); } catch (e) { console.error('loadMemberCount failed:', e); }

  // 3) Tools tab — needs tools.js. If that file didn't load (wrong path, not
  //    uploaded, 404, etc.) this now shows a clear message instead of a
  //    silent blank tab, and it no longer takes anything above it down with it.
  try {
    if (typeof TOOLS === 'undefined' || typeof CATEGORIES === 'undefined') throw new Error('tools.js tidak termuat');
    const label = document.getElementById('tools-count-label'); if (label) label.innerText = TOOLS.length + '+ fitur cyber security';
    renderChips(); renderToolGrid();
  } catch (e) {
    console.error('Tools module failed:', e);
    const grid = document.getElementById('tool-grid');
    if (grid) grid.innerHTML = `<div class="tool-empty" style="color:var(--neon-pink);line-height:1.6;">⚠️ Modul tools.js gagal dimuat.<br>Cek file <b>tools.js</b> ada di folder yang sama dengan index.html di repo-mu (nama persis, huruf kecil semua), lalu hard-refresh halaman ini.</div>`;
    const sub = document.getElementById('tools-subtitle'); if (sub) sub.innerText = 'GAGAL MEMUAT MODUL';
  }
});
window.addEventListener('beforeunload', () => { if (presenceChannel) sb.removeChannel(presenceChannel); });
/* ChronoStar X — App Core
   Supabase auth, roles, real-time presence, activity logging, news/info CMS, profile/bio-link page. */

// ---- Supabase config (publishable key is safe to expose client-side; RLS enforces access) ----
const SUPABASE_URL = 'https://ajsqtqxcpnqhjhyphiiw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7bdRFYA7g6mQirAz8mr8Fg_L90CmrSk';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentProfile = null;
let presenceChannel = null;

// Local escape helper — deliberately NOT dependent on tools.js's CU object.
// Keeps auth/profile/admin/news working even if tools.js fails to load.
function esc(s) { const d = document.createElement('div'); d.innerText = s ?? ''; return d.innerHTML; }

// ---- Activity logging ----
async function logActivity(action, meta = {}) {
  if (!currentUser) return;
  try { await sb.from('activity_log').insert({ user_id: currentUser.id, action, meta }); } catch (e) { console.warn('activity log failed', e); }
  const el = document.getElementById('activity-list');
  if (el && document.getElementById('tab-profile').classList.contains('active')) loadActivityList();
}
function actionLabel(action) {
  const labels = { login: 'Masuk ke akun', tool_open: 'Membuka tool', post_add: 'Menambahkan post', post_delete: 'Menghapus post', profile_update: 'Memperbarui profil' };
  return labels[action] || action;
}
// Only http(s) links are allowed — blocks javascript:/data: URLs in bio links and post images.
// The database enforces this too (see schema.sql §6b/6c); this just gives an instant, friendly error.
function isSafeUrl(url) { return /^https?:\/\//i.test((url || '').trim()); }
// Activity rows with a bit of context (which tool, which post) instead of just the bare action name.
function activityDescription(a) {
  const base = actionLabel(a.action);
  const meta = a.meta || {};
  if (a.action === 'tool_open' && meta.title) return `${base}: ${esc(meta.title)}`;
  if (a.action === 'post_add' && meta.title) return `${base} (${meta.type === 'news' ? 'Berita' : 'Info'}): ${esc(meta.title)}`;
  return esc(base);
}

// ---- Auth ----
async function onAuthed(user, opts = {}) {
  currentUser = user;
  await loadProfile();
  if (currentProfile && currentProfile.banned) {
    await sb.auth.signOut();
    currentUser = null; currentProfile = null;
    renderAuthState();
    ChronoStar.showToast('Akun ini telah dinonaktifkan oleh admin.', 'error');
    return;
  }
  setupPresence();
  renderAuthState();
  if (opts.logLogin) logActivity('login', {});
}
async function loadProfile() {
  if (!currentUser) return;
  let { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (error || !data) {
    // No profile row yet — happens for accounts created straight in Supabase (e.g. the first
    // owner account) or any other gap before the signup trigger ran. Self-heal instead of
    // leaving the person stuck on the login screen.
    const fallbackUsername = (currentUser.user_metadata && currentUser.user_metadata.username) || (currentUser.email ? currentUser.email.split('@')[0] : 'user');
    const { data: created, error: createErr } = await sb.from('profiles')
      .upsert({ id: currentUser.id, username: fallbackUsername, role: 'member' }, { onConflict: 'id' })
      .select().single();
    if (!createErr) data = created;
    else console.warn('profile auto-repair failed', createErr);
  }
  currentProfile = data || null;
}

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
    if (!email || !password) { msg.className = 'form-msg error'; msg.innerText = 'Isi email dan password.'; return; }
    btn.disabled = true; msg.className = 'form-msg'; msg.innerText = 'Memproses...';
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) {
      msg.className = 'form-msg error';
      msg.innerText = /email not confirmed/i.test(error.message)
        ? 'Email belum diverifikasi. Cek inbox kamu dan klik link konfirmasi dulu sebelum masuk.'
        : error.message;
      return;
    }
    msg.className = 'form-msg success'; msg.innerText = 'Berhasil masuk!';
    await onAuthed(data.user, { logLogin: true });
    ChronoStar.showToast('Selamat datang kembali!', 'success');
  },
  async register() {
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const msg = document.getElementById('register-msg'), btn = document.getElementById('register-btn');
    if (!username || !email || !password) { msg.className = 'form-msg error'; msg.innerText = 'Lengkapi semua kolom.'; return; }
    if (password.length < 6) { msg.className = 'form-msg error'; msg.innerText = 'Password minimal 6 karakter.'; return; }
    btn.disabled = true; msg.className = 'form-msg'; msg.innerText = 'Membuat akun...';
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username } } });
    btn.disabled = false;
    if (error) { msg.className = 'form-msg error'; msg.innerText = error.message; return; }
    if (data.session) { msg.className = 'form-msg success'; msg.innerText = 'Akun dibuat & masuk!'; await onAuthed(data.user, { logLogin: true }); }
    else { msg.className = 'form-msg success'; msg.innerText = 'Akun dibuat! Cek email kamu untuk konfirmasi sebelum masuk.'; }
  },
  async logout() {
    await sb.auth.signOut();
    if (presenceChannel) { sb.removeChannel(presenceChannel); presenceChannel = null; }
    currentUser = null; currentProfile = null;
    renderAuthState();
    ChronoStar.showToast('Berhasil keluar', 'info');
    switchTabByNav('home');
  }
};

function renderAuthState() {
  const homeStatus = document.getElementById('home-status'), homeUsername = document.getElementById('home-username'), homeAvatar = document.getElementById('home-avatar');
  const navLabel = document.getElementById('nav-profile-label'), authSection = document.getElementById('auth-section'), profileSection = document.getElementById('profile-section');
  if (currentUser && currentProfile) {
    homeStatus.innerHTML = `<span class="online-indicator">● ONLINE</span> &nbsp; <span style="color:var(--text-sub);">${currentProfile.role === 'owner' ? 'OWNER' : 'MEMBER'}</span>`;
    homeUsername.innerText = currentProfile.username || currentUser.email;
    homeAvatar.innerText = (currentProfile.username || currentUser.email || '?')[0].toUpperCase();
    navLabel.innerText = 'Profil';
    authSection.style.display = 'none'; profileSection.style.display = 'block';
    renderProfileSection();
  } else {
    homeStatus.innerHTML = `<span class="offline-indicator">● TAMU</span> &nbsp; <span style="color:var(--text-sub);">belum login</span>`;
    homeUsername.innerText = 'ChronoStar x'; homeAvatar.innerText = 'C';
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

// ---- Profile / bio-link ----
function renderProfileSection() {
  const p = currentProfile;
  document.getElementById('profile-username').innerText = p.username || currentUser.email;
  document.getElementById('profile-bio').innerText = p.bio || 'Belum ada bio.';
  const avatarEl = document.getElementById('profile-avatar');
  avatarEl.innerHTML = p.avatar_url ? `<img src="${esc(p.avatar_url)}">` : esc((p.username || '?')[0].toUpperCase());
  document.getElementById('profile-access').innerText = p.role === 'owner' ? 'Owner / Root Admin' : 'Member';
  document.getElementById('profile-joined').innerText = new Date(p.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  document.getElementById('profile-role-badge').innerHTML = p.role === 'owner' ? `<div class="profile-badge-owner">OWNER & FOUNDER</div>` : `<div class="profile-badge-member">MEMBER</div>`;
  document.getElementById('owner-admin-zone').style.display = p.role === 'owner' ? 'block' : 'none';
  const links = Array.isArray(p.links) ? p.links : [];
  document.getElementById('links-list').innerHTML = links.length
    ? links.map(l => isSafeUrl(l.url)
        ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="link-item">${esc(l.label)} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg></a>`
        : `<div class="link-item" style="opacity:0.5;">${esc(l.label)} <span style="font-size:9px;color:var(--neon-pink);">tautan tidak valid</span></div>`
      ).join('')
    : '<p style="font-size:11px;color:var(--text-sub);text-align:center;">Belum ada link.</p>';
  loadActivityList();
}
async function loadActivityList() {
  if (!currentUser) return;
  const { data, count } = await sb.from('activity_log').select('*', { count: 'exact' }).eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(15);
  const countEl = document.getElementById('profile-activity-count'); if (countEl) countEl.innerText = count || 0;
  const el = document.getElementById('activity-list'); if (!el) return;
  el.innerHTML = (data && data.length) ? data.map(a => `<div class="activity-item"><div class="activity-dot"></div><div><b>${activityDescription(a)}</b><span>${new Date(a.created_at).toLocaleString('id-ID')}</span></div></div>`).join('')
    : '<p style="font-size:11px;color:var(--text-sub);text-align:center;">Belum ada aktivitas.</p>';
}

const ProfileUI = {
  openEdit() {
    ModalUI.openCustom('Edit Profil', '', `
      <div class="form-group"><label>Username</label><input class="form-input" id="edit-username" maxlength="40" value="${esc(currentProfile.username || '')}"></div>
      <div class="form-group"><label>Bio</label><textarea class="form-textarea" id="edit-bio" maxlength="500">${esc(currentProfile.bio || '')}</textarea></div>
      <div class="form-group"><label>URL Avatar (opsional)</label><input class="form-input" id="edit-avatar" value="${esc(currentProfile.avatar_url || '')}" placeholder="https://..."></div>
      <button class="form-btn" onclick="ProfileUI.saveEdit()">Simpan</button>
      <div class="form-msg" id="edit-msg"></div>`);
  },
  async saveEdit() {
    const username = document.getElementById('edit-username').value.trim();
    const bio = document.getElementById('edit-bio').value.trim();
    const avatar_url = document.getElementById('edit-avatar').value.trim();
    const msg = document.getElementById('edit-msg');
    if (username.length > 40) { msg.className = 'form-msg error'; msg.innerText = 'Username maksimal 40 karakter.'; return; }
    if (bio.length > 500) { msg.className = 'form-msg error'; msg.innerText = 'Bio maksimal 500 karakter.'; return; }
    if (avatar_url && !isSafeUrl(avatar_url)) { msg.className = 'form-msg error'; msg.innerText = 'URL avatar harus diawali http:// atau https://'; return; }
    const { error } = await sb.from('profiles').update({ username, bio, avatar_url }).eq('id', currentUser.id);
    if (error) { msg.className = 'form-msg error'; msg.innerText = error.message; return; }
    currentProfile = { ...currentProfile, username, bio, avatar_url };
    renderAuthState(); logActivity('profile_update', {}); ModalUI.close();
    ChronoStar.showToast('Profil diperbarui', 'success');
  },
  addLink() {
    const links = Array.isArray(currentProfile.links) ? currentProfile.links : [];
    if (links.length >= 10) { ChronoStar.showToast('Maksimal 10 bio link.', 'error'); return; }
    ModalUI.openCustom('Tambah Bio Link', '', `
      <div class="form-group"><label>Label</label><input class="form-input" id="link-label" maxlength="40" placeholder="mis: Instagram"></div>
      <div class="form-group"><label>URL</label><input class="form-input" id="link-url" placeholder="https://..."></div>
      <button class="form-btn" onclick="ProfileUI.saveLink()">Tambah</button>
      <div class="form-msg" id="link-msg"></div>`);
  },
  async saveLink() {
    const label = document.getElementById('link-label').value.trim();
    const url = document.getElementById('link-url').value.trim();
    const msg = document.getElementById('link-msg');
    if (!label || !url) { msg.className = 'form-msg error'; msg.innerText = 'Lengkapi label dan URL.'; return; }
    if (!isSafeUrl(url)) { msg.className = 'form-msg error'; msg.innerText = 'URL harus diawali http:// atau https://'; return; }
    const links = Array.isArray(currentProfile.links) ? [...currentProfile.links] : [];
    links.push({ label, url });
    const { error } = await sb.from('profiles').update({ links }).eq('id', currentUser.id);
    if (error) { msg.className = 'form-msg error'; msg.innerText = error.message; return; }
    currentProfile.links = links; renderProfileSection(); ModalUI.close();
  },
  confirmClearActivity() {
    ModalUI.openCustom('Bersihkan Riwayat Aktivitas', '', `
      <p style="font-size:13px;color:var(--text-main);margin-bottom:16px;line-height:1.5;">Ini akan menghapus seluruh riwayat aktivitasmu secara permanen. Tidak bisa dibatalkan.</p>
      <button class="form-btn danger" onclick="ProfileUI.clearActivity()" style="margin-bottom:8px;">Ya, Bersihkan</button>
      <button class="form-btn secondary" onclick="ModalUI.close()">Batal</button>`);
  },
  async clearActivity() {
    const { data, error } = await sb.from('activity_log').delete().eq('user_id', currentUser.id).select();
    ModalUI.close();
    reportDeleteResult(data, error, 'Riwayat aktivitas dibersihkan');
    loadActivityList();
  }
};
// Shared by every "delete/clear" admin & profile action: no error doesn't mean
// something actually happened — under RLS, a delete with no matching policy
// just silently affects zero rows instead of throwing. Checking the returned
// rows (requires .select() chained after .delete()) is the only reliable way
// to tell "cleared" apart from "nothing happened", and the second case is
// almost always schema.sql not having been (re-)run yet.
function reportDeleteResult(data, error, successMessage) {
  if (error) { ChronoStar.showToast('Gagal: ' + error.message, 'error'); return; }
  if (!data || data.length === 0) {
    ChronoStar.showToast('Tidak ada yang terhapus — kemungkinan schema.sql versi terbaru belum dijalankan ulang di Supabase.', 'error');
    return;
  }
  ChronoStar.showToast(successMessage, 'success');
}

// ---- Admin / Owner panel ----
const AdminUI = {
  addPost(type) {
    ModalUI.openCustom(type === 'news' ? 'Tambah Berita' : 'Tambah Informasi', 'Tampil untuk semua pengguna', `
      <div class="form-group"><label>Judul</label><input class="form-input" id="post-title" maxlength="200"></div>
      <div class="form-group"><label>Isi</label><textarea class="form-textarea" id="post-content" maxlength="5000"></textarea></div>
      ${type === 'news' ? '<div class="form-group"><label>URL Gambar (opsional)</label><input class="form-input" id="post-image" placeholder="https://..."></div>' : ''}
      <button class="form-btn" onclick="AdminUI.savePost('${type}')">Publikasikan</button>
      <div class="form-msg" id="post-msg"></div>`);
  },
  async savePost(type) {
    const title = document.getElementById('post-title').value.trim();
    const content = document.getElementById('post-content').value.trim();
    const imageEl = document.getElementById('post-image');
    const image_url = imageEl ? imageEl.value.trim() : null;
    const msg = document.getElementById('post-msg');
    if (!title || !content) { msg.className = 'form-msg error'; msg.innerText = 'Lengkapi judul dan isi.'; return; }
    if (image_url && !isSafeUrl(image_url)) { msg.className = 'form-msg error'; msg.innerText = 'URL gambar harus diawali http:// atau https://'; return; }
    const { error } = await sb.from('posts').insert({ type, title, content, image_url: image_url || null, created_by: currentUser.id });
    if (error) { msg.className = 'form-msg error'; msg.innerText = error.message; return; }
    ModalUI.close(); logActivity('post_add', { type, title });
    ChronoStar.showToast('Berhasil dipublikasikan', 'success');
    if (type === 'news') loadNews(); else loadInfo();
  },
  async deletePost(id, type) {
    const { data, error } = await sb.from('posts').delete().eq('id', id).select();
    reportDeleteResult(data, error, 'Post dihapus');
    if (error || !data || !data.length) return;
    logActivity('post_delete', { id });
    if (type === 'news') loadNews(); else loadInfo();
  },
  async openAllActivity() {
    const { data } = await sb.from('activity_log').select('*, profiles(username)').order('created_at', { ascending: false }).limit(50);
    const html = (data && data.length) ? data.map(a => `<div class="activity-item"><div class="activity-dot"></div><div><b>${esc((a.profiles && a.profiles.username) || 'user')}</b> — ${activityDescription(a)}<span>${new Date(a.created_at).toLocaleString('id-ID')}</span></div></div>`).join('') : '<p style="font-size:11px;color:var(--text-sub);">Belum ada aktivitas.</p>';
    ModalUI.openCustom('Log Aktivitas Semua User', '50 aktivitas terbaru', html);
  },
  async openUserList() {
    const { data } = await sb.from('profiles').select('id, username, role, banned, confirmed_at, created_at').order('created_at', { ascending: false }).limit(100);
    const html = (data && data.length) ? data.map(u => `
      <div class="activity-item" style="cursor:pointer;${u.banned ? 'opacity:0.5;' : ''}" onclick="AdminUI.viewMember('${u.id}')">
        <div class="activity-dot" style="background:${u.role === 'owner' ? 'var(--neon-green)' : (u.banned ? 'var(--neon-pink)' : 'var(--neon-cyan)')}"></div>
        <div><b>${esc(u.username || '(tanpa nama)')}</b>
          <span>${u.role.toUpperCase()} • ${u.confirmed_at ? 'terverifikasi' : 'belum verifikasi'}${u.banned ? ' • dinonaktifkan' : ''} • bergabung ${new Date(u.created_at).toLocaleDateString('id-ID')}</span>
        </div>
      </div>`).join('') : '<p style="font-size:11px;color:var(--text-sub);">Belum ada member.</p>';
    ModalUI.openCustom('Daftar Member', `${data ? data.length : 0} akun terdaftar — ketuk untuk lihat profil`, html);
  },
  async viewMember(userId) {
    const { data: p } = await sb.from('profiles').select('*').eq('id', userId).single();
    if (!p) { ChronoStar.showToast('Member tidak ditemukan', 'error'); return; }
    const { count: activityCount } = await sb.from('activity_log').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    const links = Array.isArray(p.links) ? p.links : [];
    const uname = esc(p.username || 'member');
    const actions = p.role === 'owner'
      ? '<p style="font-size:11px;color:var(--text-sub);text-align:center;">Akun owner tidak bisa dihapus/dinonaktifkan dari sini.</p>'
      : p.banned
        ? `<button class="form-btn" onclick="AdminUI.restoreAccount('${p.id}')">Pulihkan Akun</button>`
        : `<button class="form-btn secondary" onclick="AdminUI.clearUserActivity('${p.id}')" style="margin-bottom:10px;">Bersihkan Aktivitas User Ini</button>
           <button class="form-btn danger" onclick="AdminUI.confirmDeleteAccount('${p.id}')">Hapus Akun</button>`;
    const html = `
      <div style="text-align:center;margin-bottom:16px;">
        <div class="profile-big-avatar" style="margin:0 auto 10px auto;">${p.avatar_url ? `<img src="${esc(p.avatar_url)}">` : esc((p.username || '?')[0].toUpperCase())}</div>
        <div style="font-weight:800;font-size:15px;color:#fff;">${uname}</div>
        ${p.role === 'owner' ? '<div class="profile-badge-owner">OWNER & FOUNDER</div>' : '<div class="profile-badge-member">MEMBER</div>'}
        ${p.banned ? '<div style="margin-top:6px;font-size:10px;color:var(--neon-pink);font-weight:800;">⛔ AKUN DINONAKTIFKAN</div>' : ''}
      </div>
      <p style="font-size:12px;color:var(--text-sub);text-align:center;margin-bottom:16px;">${esc(p.bio || 'Belum ada bio.')}</p>
      <div class="profile-info-grid" style="margin:0 0 16px 0;">
        <div class="profile-info-box"><span>STATUS EMAIL</span><b>${p.confirmed_at ? 'Terverifikasi' : 'Belum verifikasi'}</b></div>
        <div class="profile-info-box"><span>BERGABUNG</span><b>${new Date(p.created_at).toLocaleDateString('id-ID')}</b></div>
        <div class="profile-info-box"><span>TOTAL AKTIVITAS</span><b>${activityCount || 0}</b></div>
        <div class="profile-info-box"><span>BIO LINKS</span><b>${links.length}</b></div>
      </div>
      ${links.length ? `<div style="margin-bottom:16px;">${links.map(l => isSafeUrl(l.url) ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="link-item">${esc(l.label)}</a>` : '').join('')}</div>` : ''}
      ${actions}`;
    ModalUI.openCustom('Profil Member', '', html);
  },
  confirmDeleteAccount(userId) {
    ModalUI.openCustom('Konfirmasi Hapus Akun', '', `
      <p style="font-size:13px;color:var(--text-main);margin-bottom:16px;line-height:1.5;">Yakin ingin menghapus akun ini? Akun tidak akan bisa login lagi dan profilnya (nama, bio, link) akan dikosongkan — riwayat aktivitasnya juga dihapus.<br><br>Bisa dipulihkan lewat tombol "Pulihkan Akun" di profil yang sama.</p>
      <button class="form-btn danger" onclick="AdminUI.deleteAccount('${userId}')" style="margin-bottom:8px;">Ya, Hapus Akun</button>
      <button class="form-btn secondary" onclick="ModalUI.close()">Batal</button>`);
  },
  async deleteAccount(userId) {
    const { data, error } = await sb.from('profiles').update({ banned: true, username: '[akun dihapus]', bio: '', avatar_url: null, links: [] }).eq('id', userId).select();
    if (error) { ChronoStar.showToast('Gagal: ' + error.message, 'error'); return; }
    if (!data || !data.length) { ChronoStar.showToast('Tidak ada perubahan — kemungkinan schema.sql versi terbaru belum dijalankan ulang di Supabase.', 'error'); return; }
    await sb.from('activity_log').delete().eq('user_id', userId);
    logActivity('account_moderation', { target: userId, action: 'delete' });
    ChronoStar.showToast('Akun dihapus', 'success');
    ModalUI.close();
  },
  async restoreAccount(userId) {
    const { data, error } = await sb.from('profiles').update({ banned: false }).eq('id', userId).select();
    if (error) { ChronoStar.showToast('Gagal: ' + error.message, 'error'); return; }
    if (!data || !data.length) { ChronoStar.showToast('Tidak ada perubahan — kemungkinan schema.sql versi terbaru belum dijalankan ulang di Supabase.', 'error'); return; }
    logActivity('account_moderation', { target: userId, action: 'restore' });
    ChronoStar.showToast('Akun dipulihkan', 'success');
    AdminUI.viewMember(userId);
  },
  async clearUserActivity(userId) {
    const { data, error } = await sb.from('activity_log').delete().eq('user_id', userId).select();
    reportDeleteResult(data, error, 'Aktivitas user dibersihkan');
  },
  confirmClearAllActivity() {
    ModalUI.openCustom('Bersihkan Cache Aktivitas', '', `
      <p style="font-size:13px;color:var(--text-main);margin-bottom:16px;line-height:1.5;">Ini akan menghapus SELURUH riwayat aktivitas semua pengguna secara permanen. Tidak bisa dibatalkan.</p>
      <button class="form-btn danger" onclick="AdminUI.clearAllActivity()" style="margin-bottom:8px;">Ya, Hapus Semua</button>
      <button class="form-btn secondary" onclick="ModalUI.close()">Batal</button>`);
  },
  async clearAllActivity() {
    const { data, error } = await sb.from('activity_log').delete().gte('id', 0).select();
    ModalUI.close();
    reportDeleteResult(data, error, 'Cache aktivitas dibersihkan');
  }
};

// ---- News & Info (public read, owner write) ----
async function loadNews() {
  const { data, error } = await sb.from('posts').select('*').eq('type', 'news').order('created_at', { ascending: false }).limit(10);
  const el = document.getElementById('news-list'); if (!el) return;
  if (error || !data || !data.length) { el.innerHTML = `<div class="card" style="text-align:center;color:var(--text-sub);font-size:12px;">Belum ada berita.</div>`; return; }
  el.innerHTML = data.map(n => `
    <div class="news-post" style="margin:0 16px 14px 16px;">
      ${n.image_url ? `<img src="${esc(n.image_url)}" alt="">` : ''}
      <div class="news-post-body">
        <h4>${esc(n.title)}</h4>
        <p>${esc(n.content)}</p>
        <div class="news-post-meta"><span>${new Date(n.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>${currentProfile && currentProfile.role === 'owner' ? `<button class="post-del-btn" onclick="AdminUI.deletePost(${n.id},'news')">Hapus</button>` : ''}</div>
      </div>
    </div>`).join('');
}
async function loadInfo() {
  const { data, error } = await sb.from('posts').select('*').eq('type', 'info').order('created_at', { ascending: false }).limit(20);
  const el = document.getElementById('info-list'); if (!el) return;
  if (error || !data || !data.length) { el.innerHTML = `<p style="font-size:11px;color:var(--text-sub);">Belum ada pengumuman tambahan.</p>`; return; }
  el.innerHTML = data.map(n => `
    <div style="background:#121522;border:1px solid var(--card-border);padding:12px;border-radius:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <b style="font-size:12px;color:var(--text-main);">${esc(n.title)}</b>
        ${currentProfile && currentProfile.role === 'owner' ? `<button class="post-del-btn" onclick="AdminUI.deletePost(${n.id},'info')">Hapus</button>` : ''}
      </div>
      <p style="font-size:11px;color:var(--text-sub);margin:4px 0 0 0;white-space:pre-wrap;">${esc(n.content)}</p>
    </div>`).join('');
}

// ---- Presence (real online-user count) & member count ----
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
  const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true }).eq('banned', false).not('confirmed_at', 'is', null);
  const el = document.getElementById('stat-members'); if (el) el.innerText = count ?? 0;
}

// ---- Generic modal ----
const ModalUI = {
  open(tool) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `<div class="modal-header"><div><h3>${esc(tool.title)}</h3><p>${esc(tool.desc)}</p></div><div class="modal-close" onclick="ModalUI.close()">✕</div></div><div id="modal-tool-root"></div>`;
    document.getElementById('modal-overlay').classList.add('open');
    tool.render(document.getElementById('modal-tool-root'));
    logActivity('tool_open', { tool: tool.id, title: tool.title });
  },
  openCustom(title, sub, html) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `<div class="modal-header"><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="modal-close" onclick="ModalUI.close()">✕</div></div><div>${html}</div>`;
    document.getElementById('modal-overlay').classList.add('open');
  },
  close() {
    if (typeof ToolRuntime !== 'undefined' && ToolRuntime.cleanup) { ToolRuntime.cleanup(); ToolRuntime.cleanup = null; }
    document.getElementById('modal-overlay').classList.remove('open');
    document.getElementById('modal-box').innerHTML = '';
  }
};

// ---- Tool grid, categories, search ----
let activeCategory = 'all';
function renderChips() {
  const row = document.getElementById('chip-row');
  row.innerHTML = CATEGORIES.map(c => `<div class="chip ${c.id === activeCategory ? 'active' : ''}" data-cat="${c.id}">${c.label}</div>`).join('');
  row.querySelectorAll('.chip').forEach(chip => chip.onclick = () => { activeCategory = chip.dataset.cat; renderChips(); renderToolGrid(); });
}
function toolCardHtml(t) {
  return `<div class="tool-card" data-tool="${t.id}">
      <div class="t-icon"><svg viewBox="0 0 24 24">${CAT_ICON[t.cat]}</svg></div>
      <h4>${esc(t.title)}</h4>
      <p>${esc(t.desc)}</p>
    </div>`;
}
function renderToolGrid(query) {
  query = (query ?? document.getElementById('global-search-input').value ?? '').toLowerCase().trim();
  const grid = document.getElementById('tool-grid');
  const matches = (t) => !query || t.title.toLowerCase().includes(query) || t.desc.toLowerCase().includes(query);
  let html = '', shown = 0;

  if (activeCategory === 'all' && !query) {
    // Grouped-by-category view: easier to scan than one long wall of cards.
    CATEGORIES.filter(c => c.id !== 'all').forEach(cat => {
      const items = TOOLS.filter(t => t.cat === cat.id);
      if (!items.length) return;
      shown += items.length;
      html += `<div class="tool-group-title">${cat.label}</div><div class="tool-grid-inner">${items.map(toolCardHtml).join('')}</div>`;
    });
  } else {
    const filtered = TOOLS.filter(t => (activeCategory === 'all' || t.cat === activeCategory) && matches(t));
    shown = filtered.length;
    html = filtered.length ? `<div class="tool-grid-inner">${filtered.map(toolCardHtml).join('')}</div>` : `<div class="tool-empty">Tidak ada tool yang cocok.</div>`;
  }

  grid.innerHTML = html;
  const sub = document.getElementById('tools-subtitle'); if (sub) sub.innerText = `${TOOLS.length} MODUL TERINTEGRASI // ${shown} DITAMPILKAN`;
  grid.querySelectorAll('.tool-card').forEach(card => card.onclick = () => ModalUI.open(TOOLS.find(t => t.id === card.dataset.tool)));
}

// ---- Tabs & drawer ----
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

// ---- Clock / uptime / ping / toast / search (kept from original, generalized) ----
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
    const icon = type === 'error' ? '✕' : (type === 'success' ? '✓' : 'ℹ');
    toast.innerText = `${icon} ${message}`; box.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-10px)'; setTimeout(() => toast.remove(), 300); }, 3000);
  }
  handleSearch(query) { if (query.trim().length > 0) switchTabByNav('tools'); if (typeof TOOLS !== 'undefined') renderToolGrid(query); }
}
const ChronoStar = new ChronoStarEngine();

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  // 1) Restore the session FIRST and on its own — this must never be blocked by
  //    anything below it, or a reload/reopen looks like it "logs you out" even
  //    though Supabase still has a valid session saved in the browser.
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) await onAuthed(session.user);
    else renderAuthState();
  } catch (e) {
    console.error('Session restore failed:', e);
    renderAuthState();
  }
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { currentUser = null; currentProfile = null; renderAuthState(); }
  });

  // 2) News / info / member count — independent of each other and of #3 below.
  try { loadNews(); } catch (e) { console.error('loadNews failed:', e); }
  try { loadInfo(); } catch (e) { console.error('loadInfo failed:', e); }
  try { loadMemberCount(); } catch (e) { console.error('loadMemberCount failed:', e); }

  // 3) Tools tab — needs tools.js. If that file didn't load (wrong path, not
  //    uploaded, 404, etc.) this now shows a clear message instead of a
  //    silent blank tab, and it no longer takes anything above it down with it.
  try {
    if (typeof TOOLS === 'undefined' || typeof CATEGORIES === 'undefined') throw new Error('tools.js tidak termuat');
    const label = document.getElementById('tools-count-label'); if (label) label.innerText = TOOLS.length + '+ fitur cyber security';
    renderChips(); renderToolGrid();
  } catch (e) {
    console.error('Tools module failed:', e);
    const grid = document.getElementById('tool-grid');
    if (grid) grid.innerHTML = `<div class="tool-empty" style="color:var(--neon-pink);line-height:1.6;">⚠️ Modul tools.js gagal dimuat.<br>Cek file <b>tools.js</b> ada di folder yang sama dengan index.html di repo-mu (nama persis, huruf kecil semua), lalu hard-refresh halaman ini.</div>`;
    const sub = document.getElementById('tools-subtitle'); if (sub) sub.innerText = 'GAGAL MEMUAT MODUL';
  }
});
window.addEventListener('beforeunload', () => { if (presenceChannel) sb.removeChannel(presenceChannel); });
