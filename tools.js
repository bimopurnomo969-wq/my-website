/* ChronoStar X — Tools Registry
   All tools here are defensive / educational / utility in nature.
   Nothing here targets a third party's account, device or server without consent. */

const ToolRuntime = { cleanup: null };

const CU = {
  async sha(text, algo) {
    const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  },
  async hmac(text, key, algo) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: algo }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  },
  async deriveKey(password, salt) {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async aesEncrypt(plain, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(password, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
    const combined = new Uint8Array(salt.length + iv.length + ct.byteLength);
    combined.set(salt, 0); combined.set(iv, salt.length); combined.set(new Uint8Array(ct), salt.length + iv.length);
    return btoa(String.fromCharCode(...combined));
  },
  async aesDecrypt(b64, password) {
    const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const salt = combined.slice(0, 16), iv = combined.slice(16, 28), ct = combined.slice(28);
    const key = await this.deriveKey(password, salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  },
  esc(s) { const d = document.createElement('div'); d.innerText = s ?? ''; return d.innerHTML; },
  copy(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      if (btn) { const old = btn.innerText; btn.innerText = 'Tersalin!'; setTimeout(() => btn.innerText = old, 1200); }
    });
  },
  randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
};

function scorePassword(pw) {
  if (!pw) return { score: 0, label: '-', color: '#555' };
  let score = 0;
  const sets = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/];
  const variety = sets.filter(r => r.test(pw)).length;
  score += Math.min(pw.length * 4, 40);
  score += variety * 12;
  if (/^(.)\1+$/.test(pw)) score = 5;
  if (/^(12345|qwerty|password|abc123|111111)/i.test(pw)) score = Math.min(score, 15);
  score = Math.max(0, Math.min(100, score));
  let label, color;
  if (score < 30) { label = 'Sangat Lemah'; color = '#ff0055'; }
  else if (score < 50) { label = 'Lemah'; color = '#ff8800'; }
  else if (score < 70) { label = 'Sedang'; color = '#ffb800'; }
  else if (score < 90) { label = 'Kuat'; color = '#00ff66'; }
  else { label = 'Sangat Kuat'; color = '#00f3ff'; }
  return { score, label, color };
}

function diffLines(a, b) {
  const la = a.split('\n'), lb = b.split('\n');
  const n = la.length, m = lb.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = la[i] === lb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, out = [];
  while (i < n && j < m) {
    if (la[i] === lb[j]) { out.push(['same', la[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(['del', la[i]]); i++; }
    else { out.push(['add', lb[j]]); j++; }
  }
  while (i < n) { out.push(['del', la[i]]); i++; }
  while (j < m) { out.push(['add', lb[j]]); j++; }
  return out;
}

function mdToHtml(md) {
  if (!md) return '';
  let h = CU.esc(md);
  h = h.replace(/^### (.*)$/gm, '<h3>$1</h3>')
       .replace(/^## (.*)$/gm, '<h2>$1</h2>')
       .replace(/^# (.*)$/gm, '<h1>$1</h1>')
       .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
       .replace(/\*(.*?)\*/g, '<i>$1</i>')
       .replace(/`(.*?)`/g, '<code>$1</code>')
       .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--neon-cyan)">$1</a>')
       .replace(/^- (.*)$/gm, '<li>$1</li>')
       .replace(/\n/g, '<br>');
  return h;
}

const MORSE_MAP = { A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..','0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.' };
const MORSE_REV = Object.fromEntries(Object.entries(MORSE_MAP).map(([k, v]) => [v, k]));

const CAT_ICON = {
  security: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>',
  websec: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="21" y2="14"/><line x1="14" y1="21" x2="21" y2="21"/><line x1="17" y1="14" x2="17" y2="21"/>',
  encode: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  dev: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  network: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  extra: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  game: '<rect x="2" y="7" width="20" height="11" rx="5.5"/><line x1="6.5" y1="12.5" x2="9.5" y2="12.5"/><line x1="8" y1="11" x2="8" y2="14"/><circle cx="15.5" cy="11" r="1"/><circle cx="18" cy="13.5" r="1"/>'
};

const CATEGORIES = [
  { id: 'all', label: 'Semua' },
  { id: 'security', label: 'Keamanan' },
  { id: 'websec', label: 'Analisis Web' },
  { id: 'qr', label: 'QR Code' },
  { id: 'encode', label: 'Enkoding' },
  { id: 'dev', label: 'Dev Tools' },
  { id: 'network', label: 'Jaringan' },
  { id: 'game', label: 'Game' },
  { id: 'extra', label: 'Ekstra' }
];

const TOOLS = [
// ===== SECURITY & ENCRYPTION =====
{ id:'password-strength', cat:'security', title:'Analisis Kekuatan Password', desc:'Cek seberapa kuat passwordmu secara real-time',
  render(root){
    root.innerHTML = `<input type="text" id="pw-input" class="tool-input" placeholder="Ketik password untuk dicek..." autocomplete="off"><div class="strength-bar"><div class="strength-bar-fill" id="pw-fill" style="width:0%;background:#555;"></div></div><div class="tool-result" id="pw-result">Mulai mengetik...</div>`;
    const input = root.querySelector('#pw-input'), fill = root.querySelector('#pw-fill'), res = root.querySelector('#pw-result');
    input.oninput = () => { const s = scorePassword(input.value); fill.style.width = s.score+'%'; fill.style.background = s.color;
      res.innerHTML = `Kekuatan: <b style="color:${s.color}">${s.label}</b> (${s.score}/100)<br>Panjang: ${input.value.length} karakter`; };
  }},
{ id:'password-generator', cat:'security', title:'Generator Password Aman', desc:'Buat password acak dengan kriteria custom',
  render(root){
    root.innerHTML = `<div class="form-group"><label>Panjang: <span id="pwlen-label">16</span></label><input type="range" id="pwlen" min="8" max="64" value="16" style="width:100%;"></div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;font-size:11px;color:var(--text-sub);">
        <label><input type="checkbox" id="pw-upper" checked> Huruf Besar</label>
        <label><input type="checkbox" id="pw-lower" checked> Huruf Kecil</label>
        <label><input type="checkbox" id="pw-num" checked> Angka</label>
        <label><input type="checkbox" id="pw-sym" checked> Simbol</label>
      </div>
      <button class="tool-btn" id="pwgen-btn" style="width:100%;">Generate Password</button>
      <div class="tool-result" id="pwgen-result" style="font-family:monospace;font-size:14px;text-align:center;">-</div>
      <div class="copy-row"><button class="tool-btn ghost" id="pwgen-copy" style="width:100%;">Salin</button></div>`;
    const lenEl = root.querySelector('#pwlen'), lenLabel = root.querySelector('#pwlen-label');
    lenEl.oninput = () => lenLabel.innerText = lenEl.value;
    const gen = () => {
      const sets = [];
      if (root.querySelector('#pw-upper').checked) sets.push('ABCDEFGHJKLMNPQRSTUVWXYZ');
      if (root.querySelector('#pw-lower').checked) sets.push('abcdefghijkmnpqrstuvwxyz');
      if (root.querySelector('#pw-num').checked) sets.push('23456789');
      if (root.querySelector('#pw-sym').checked) sets.push('!@#$%^&*()-_=+?');
      if (!sets.length) { root.querySelector('#pwgen-result').innerText = 'Pilih minimal satu jenis karakter.'; return; }
      const all = sets.join(''); const len = parseInt(lenEl.value);
      const arr = crypto.getRandomValues(new Uint32Array(len));
      let out = ''; for (let i=0;i<len;i++) out += all[arr[i] % all.length];
      root.querySelector('#pwgen-result').innerText = out;
    };
    root.querySelector('#pwgen-btn').onclick = gen;
    root.querySelector('#pwgen-copy').onclick = (e) => CU.copy(root.querySelector('#pwgen-result').innerText, e.target);
    gen();
  }},
{ id:'breach-checker', cat:'security', title:'Cek Kebocoran Password', desc:'Cek apakah password pernah bocor (HIBP k-anonymity)',
  render(root){
    root.innerHTML = `<input type="password" id="breach-input" class="tool-input" placeholder="Masukkan password untuk dicek..."><button class="tool-btn" id="breach-btn" style="width:100%;">Cek Kebocoran</button><div class="tool-result" id="breach-result"></div><p class="tool-note">Memakai k-anonymity API Have I Been Pwned: hanya 5 karakter awal hash SHA-1 yang dikirim, password asli tidak pernah meninggalkan browser.</p>`;
    root.querySelector('#breach-btn').onclick = async () => {
      const pw = root.querySelector('#breach-input').value; const res = root.querySelector('#breach-result');
      if (!pw) { res.innerText = 'Masukkan password dulu.'; return; }
      res.innerText = 'Memeriksa...';
      try {
        const hash = (await CU.sha(pw, 'SHA-1')).toUpperCase();
        const prefix = hash.slice(0,5), suffix = hash.slice(5);
        const r = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
        const text = await r.text();
        const line = text.split('\n').find(l => l.startsWith(suffix));
        if (line) { const count = parseInt(line.split(':')[1]); res.innerHTML = `🚨 Password ini muncul di <b>${count.toLocaleString('id-ID')}</b> kebocoran data. Jangan gunakan!`; }
        else res.innerHTML = `✅ Tidak ditemukan pada database kebocoran yang diketahui.`;
      } catch(e) { res.innerText = 'Gagal menghubungi API, coba lagi.'; }
    };
  }},
{ id:'aes-encrypt', cat:'security', title:'Enkripsi/Dekripsi Teks (AES-256)', desc:'Amankan catatan dengan password, AES-GCM asli',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="ae-text" placeholder="Teks..."></textarea><input class="tool-input" id="ae-pass" type="password" placeholder="Password"><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="ae-enc" style="flex:1;">Enkripsi</button><button class="tool-btn ghost" id="ae-dec" style="flex:1;">Dekripsi</button></div><textarea class="tool-input" id="ae-out" placeholder="Hasil..."></textarea>`;
    root.querySelector('#ae-enc').onclick = async () => {
      const t = root.querySelector('#ae-text').value, p = root.querySelector('#ae-pass').value;
      if (!t || !p) { root.querySelector('#ae-out').value = 'Isi teks dan password dulu.'; return; }
      root.querySelector('#ae-out').value = await CU.aesEncrypt(t, p);
    };
    root.querySelector('#ae-dec').onclick = async () => {
      const t = root.querySelector('#ae-text').value, p = root.querySelector('#ae-pass').value;
      try { root.querySelector('#ae-out').value = await CU.aesDecrypt(t, p); }
      catch(e) { root.querySelector('#ae-out').value = 'Gagal dekripsi: password salah atau teks bukan hasil enkripsi tool ini.'; }
    };
  }},
{ id:'hash-generator', cat:'security', title:'Generator Hash', desc:'SHA-1 / SHA-256 / SHA-384 / SHA-512 instan',
  render(root){
    const algos = ['SHA-1','SHA-256','SHA-384','SHA-512'];
    root.innerHTML = `<textarea id="hash-input" class="tool-input" placeholder="Masukkan teks..."></textarea><div id="hash-out"></div><p class="tool-note">MD5 tidak disediakan karena sudah lama dianggap tidak aman secara kriptografis.</p>`;
    const out = root.querySelector('#hash-out');
    out.innerHTML = algos.map(a=>`<div style="margin-bottom:10px;"><label style="font-size:10px;color:var(--text-sub);">${a}</label><div class="tool-result" id="h-${a}" style="margin-top:4px;font-size:11px;">-</div></div>`).join('');
    root.querySelector('#hash-input').oninput = async (e) => { const v = e.target.value; for (const a of algos) root.querySelector(`#h-${a}`).innerText = v ? await CU.sha(v,a) : '-'; };
  }},
{ id:'hmac-generator', cat:'security', title:'Generator HMAC', desc:'Buat tanda tangan pesan dengan secret key',
  render(root){
    root.innerHTML = `<input class="tool-input" id="hmac-key" placeholder="Secret key..."><textarea class="tool-input" id="hmac-msg" placeholder="Pesan..."></textarea><select class="tool-input" id="hmac-algo"><option value="SHA-256">HMAC-SHA256</option><option value="SHA-1">HMAC-SHA1</option><option value="SHA-512">HMAC-SHA512</option></select><button class="tool-btn" id="hmac-btn" style="width:100%;">Generate HMAC</button><div class="tool-result" id="hmac-result">-</div>`;
    root.querySelector('#hmac-btn').onclick = async () => {
      const key = root.querySelector('#hmac-key').value, msg = root.querySelector('#hmac-msg').value, algo = root.querySelector('#hmac-algo').value;
      if (!key || !msg) { root.querySelector('#hmac-result').innerText = 'Isi key dan pesan dulu.'; return; }
      root.querySelector('#hmac-result').innerText = await CU.hmac(msg, key, algo);
    };
  }},
{ id:'file-hash', cat:'security', title:'Cek Hash File', desc:'Verifikasi integritas file (SHA-256), 100% lokal',
  render(root){
    root.innerHTML = `<input type="file" id="fh-input" class="tool-input"><div class="tool-result" id="fh-result">Pilih file untuk menghitung SHA-256. File tidak diunggah ke mana pun.</div>`;
    root.querySelector('#fh-input').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const res = root.querySelector('#fh-result'); res.innerText = 'Menghitung...';
      const buf = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest('SHA-256', buf);
      const hex = [...new Uint8Array(hashBuf)].map(b=>b.toString(16).padStart(2,'0')).join('');
      res.innerHTML = `<b>${CU.esc(file.name)}</b> (${(file.size/1024).toFixed(1)} KB)<br>SHA-256:<br>${hex}`;
    };
  }},
{ id:'jwt-decoder', cat:'security', title:'Dekoder JWT', desc:'Lihat isi header & payload token JWT',
  render(root){
    root.innerHTML = `<textarea id="jwt-input" class="tool-input" placeholder="Tempel token JWT..."></textarea><div class="tool-result" id="jwt-result" style="font-family:monospace;font-size:11px;">-</div><p class="tool-note">Hanya mendekode (base64url), tidak memverifikasi tanda tangan.</p>`;
    root.querySelector('#jwt-input').oninput = (e) => {
      const parts = e.target.value.trim().split('.'); const res = root.querySelector('#jwt-result');
      if (parts.length < 2) { res.innerText = 'Format JWT tidak valid.'; return; }
      try {
        const dec = (s) => JSON.stringify(JSON.parse(decodeURIComponent(atob(s.replace(/-/g,'+').replace(/_/g,'/')).split('').map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''))), null, 2);
        res.innerText = `HEADER:\n${dec(parts[0])}\n\nPAYLOAD:\n${dec(parts[1])}`;
      } catch(e){ res.innerText = 'Gagal mendekode token.'; }
    };
  }},

// ===== WEB SECURITY ANALYSIS (defensive / pattern-based, not attack tools) =====
{ id:'sqli-scanner', cat:'websec', title:'Pemindai Pola SQL Injection', desc:'Validasi input untuk pola injeksi SQL (edukasi)',
  render(root){
    root.innerHTML = `<textarea id="sqli-input" class="tool-input" placeholder="Tempel input/teks yang ingin diperiksa..."></textarea><button class="tool-btn" id="sqli-btn" style="width:100%;">Periksa</button><div class="tool-result" id="sqli-result"></div><p class="tool-note">Alat ini memeriksa pola teks secara statis untuk validasi input pada formulirmu sendiri — bukan alat untuk menyerang sistem pihak lain.</p>`;
    root.querySelector('#sqli-btn').onclick = () => {
      const v = root.querySelector('#sqli-input').value;
      const patterns = [
        [/(\bor\b|\band\b)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i, "Pola tautologi (OR 1=1)"],
        [/union\s+select/i, "UNION SELECT"],
        [/;?\s*drop\s+table/i, "DROP TABLE"],
        [/--|\#|\/\*/, "Komentar SQL (--, #, /*) yang bisa memotong query"],
        [/'\s*or\s*'/i, "Pola string OR injection"],
        [/\bexec(\s|\()/i, "Pemanggilan EXEC"],
        [/information_schema/i, "Akses information_schema"],
        [/sleep\s*\(/i, "Time-based blind injection (SLEEP)"]
      ];
      const found = patterns.filter(p=>p[0].test(v)).map(p=>p[1]);
      root.querySelector('#sqli-result').innerHTML = found.length ? `⚠️ Ditemukan ${found.length} pola mencurigakan:<br>` + found.map(f=>'• '+f).join('<br>') : (v ? '✅ Tidak ditemukan pola SQL injection umum.' : 'Masukkan teks untuk diperiksa.');
    };
  }},
{ id:'xss-detector', cat:'websec', title:'Pendeteksi Pola XSS', desc:'Validasi input untuk pola serangan XSS (edukasi)',
  render(root){
    root.innerHTML = `<textarea id="xss-input" class="tool-input" placeholder="Tempel input/teks yang ingin diperiksa..."></textarea><button class="tool-btn" id="xss-btn" style="width:100%;">Periksa</button><div class="tool-result" id="xss-result"></div><p class="tool-note">Alat edukasi untuk validasi input sebelum ditampilkan di halaman web milikmu.</p>`;
    root.querySelector('#xss-btn').onclick = () => {
      const v = root.querySelector('#xss-input').value;
      const patterns = [
        [/<script[\s>]/i, "Tag <script>"], [/on\w+\s*=/i, "Event handler inline (onerror=, onload=, dst)"],
        [/javascript:/i, "Skema javascript: pada href/src"], [/<iframe/i, "Tag <iframe>"],
        [/document\.cookie/i, "Akses document.cookie"], [/<img[^>]+onerror/i, "Payload <img onerror>"],
        [/eval\s*\(/i, "Pemanggilan eval()"], [/<svg[^>]+onload/i, "Payload <svg onload>"]
      ];
      const found = patterns.filter(p=>p[0].test(v)).map(p=>p[1]);
      root.querySelector('#xss-result').innerHTML = found.length ? `⚠️ Ditemukan ${found.length} pola mencurigakan:<br>` + found.map(f=>'• '+f).join('<br>') : (v ? '✅ Tidak ditemukan pola XSS umum.' : 'Masukkan teks untuk diperiksa.');
    };
  }},
{ id:'url-analyzer', cat:'websec', title:'Analisis Keamanan URL', desc:'Deteksi ciri-ciri link phishing/mencurigakan',
  render(root){
    root.innerHTML = `<input id="url-an-input" class="tool-input" placeholder="Tempel URL di sini..."><button class="tool-btn" id="url-an-btn" style="width:100%;">Analisis</button><div class="tool-result" id="url-an-result"></div>`;
    root.querySelector('#url-an-btn').onclick = () => {
      const raw = root.querySelector('#url-an-input').value.trim(); const out = root.querySelector('#url-an-result');
      if (!raw) { out.innerText = 'Masukkan URL dulu.'; return; }
      let u; try { u = new URL(/^https?:\/\//.test(raw) ? raw : 'http://'+raw); } catch(e){ out.innerText = 'Format URL tidak valid.'; return; }
      const flags = [];
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) flags.push('⚠️ Host berupa alamat IP langsung, bukan domain.');
      if (u.hostname.split('.').length > 3) flags.push('⚠️ Subdomain berlapis-lapis, pola umum phishing.');
      if (u.username || u.password) flags.push('⚠️ Mengandung kredensial @ pada URL, teknik penyamaran umum.');
      if (/xn--/.test(u.hostname)) flags.push('⚠️ Domain punycode (bisa menyamarkan karakter mirip huruf lain).');
      if (u.protocol !== 'https:') flags.push('⚠️ Tidak memakai HTTPS, data tidak terenkripsi.');
      if (/-{2,}/.test(u.hostname) || u.hostname.length > 40) flags.push('⚠️ Nama domain tidak biasa / sangat panjang.');
      out.innerHTML = flags.length ? flags.map(f=>`<div style="margin-bottom:6px;">${f}</div>`).join('') : '✅ Tidak ditemukan pola mencurigakan umum. Tetap waspada, ini bukan jaminan 100% aman.';
    };
  }},
{ id:'site-reachability', cat:'websec', title:'Cek Status Website', desc:'Cek apakah sebuah domain merespons (best-effort)',
  render(root){
    root.innerHTML = `<div class="tool-row"><input id="site-url" class="tool-input" placeholder="contoh.com"><button class="tool-btn" id="site-check-btn">Cek</button></div><div class="tool-result" id="site-result">Masukkan domain lalu tekan Cek.</div><p class="tool-note">Metode best-effort (no-cors): mendeteksi apakah domain merespons di jaringanmu, bukan status HTTP pasti.</p>`;
    root.querySelector('#site-check-btn').onclick = async () => {
      let url = root.querySelector('#site-url').value.trim(); if (!url) return;
      if (!/^https?:\/\//.test(url)) url = 'https://' + url;
      const res = root.querySelector('#site-result'); res.innerText = 'Mengecek...';
      const start = performance.now();
      try { await fetch(url, { mode:'no-cors', cache:'no-store' }); res.innerText = `✅ ${url} merespons (${Math.round(performance.now()-start)}ms)`; }
      catch(e) { res.innerText = `❌ ${url} tidak dapat dijangkau dari browser ini.`; }
    };
  }},

// ===== QR & CODES =====
{ id:'qr-generator', cat:'qr', title:'Generator QR Code', desc:'Ubah teks, URL, atau data jadi QR Code',
  render(root){
    root.innerHTML = `<input class="tool-input" id="qr-text" placeholder="Teks, URL, atau data lain..."><div id="qr-box" style="margin:14px 0;display:flex;justify-content:center;background:#fff;border-radius:12px;padding:16px;min-height:60px;"></div><button class="tool-btn ghost" id="qr-dl" style="width:100%;">Unduh PNG</button>`;
    const box = root.querySelector('#qr-box');
    root.querySelector('#qr-text').oninput = (e) => { box.innerHTML=''; if (e.target.value) new QRCode(box, {text: e.target.value, width:200, height:200, correctLevel: QRCode.CorrectLevel.M}); };
    root.querySelector('#qr-dl').onclick = () => {
      const img = box.querySelector('img') || box.querySelector('canvas'); if (!img) return;
      const link = document.createElement('a'); link.download = 'qrcode.png';
      link.href = img.tagName === 'CANVAS' ? img.toDataURL() : img.src; link.click();
    };
  }},
{ id:'qr-scanner', cat:'qr', title:'Scanner QR Code', desc:'Pindai QR Code langsung lewat kamera',
  render(root){
    root.innerHTML = `<video id="qr-video" style="width:100%;border-radius:12px;background:#000;" playsinline muted></video><div class="tool-result" id="qr-scan-result">Mengaktifkan kamera...</div>`;
    const video = root.querySelector('#qr-video'), resEl = root.querySelector('#qr-scan-result');
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    let raf, stream, lastCode = '';
    navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } }).then(s => {
      stream = s; video.srcObject = s; video.play(); resEl.innerText = 'Arahkan kamera ke QR code...';
      const tick = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          ctx.drawImage(video,0,0,canvas.width,canvas.height);
          const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
          const code = jsQR(imgData.data, imgData.width, imgData.height);
          if (code && code.data !== lastCode) { lastCode = code.data; resEl.innerHTML = `✅ Terdeteksi:<br><b>${CU.esc(code.data)}</b>`; }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }).catch(e => resEl.innerText = 'Kamera tidak dapat diakses: ' + e.message);
    ToolRuntime.cleanup = () => { if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(t=>t.stop()); };
  }},

// ===== ENCODING & CONVERSION =====
{ id:'base64', cat:'encode', title:'Base64 Encode/Decode', desc:'Konversi teks ke/dari Base64',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="b64-in" placeholder="Teks asli..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="b64-enc" style="flex:1;">Encode →</button><button class="tool-btn ghost" id="b64-dec" style="flex:1;">← Decode</button></div><textarea class="tool-input" id="b64-out" placeholder="Hasil..."></textarea>`;
    root.querySelector('#b64-enc').onclick = () => { try { root.querySelector('#b64-out').value = btoa(unescape(encodeURIComponent(root.querySelector('#b64-in').value))); } catch(e){ root.querySelector('#b64-out').value='Error'; } };
    root.querySelector('#b64-dec').onclick = () => { try { root.querySelector('#b64-out').value = decodeURIComponent(escape(atob(root.querySelector('#b64-in').value))); } catch(e){ root.querySelector('#b64-out').value='Input bukan Base64 valid'; } };
  }},
{ id:'url-encode', cat:'encode', title:'URL Encode/Decode', desc:'Konversi teks untuk parameter URL',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="ue-in" placeholder="Teks/URL..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="ue-enc" style="flex:1;">Encode →</button><button class="tool-btn ghost" id="ue-dec" style="flex:1;">← Decode</button></div><textarea class="tool-input" id="ue-out"></textarea>`;
    root.querySelector('#ue-enc').onclick = () => root.querySelector('#ue-out').value = encodeURIComponent(root.querySelector('#ue-in').value);
    root.querySelector('#ue-dec').onclick = () => { try { root.querySelector('#ue-out').value = decodeURIComponent(root.querySelector('#ue-in').value); } catch(e){ root.querySelector('#ue-out').value='Format tidak valid'; } };
  }},
{ id:'html-entity', cat:'encode', title:'HTML Entity Encode/Decode', desc:'Amankan teks untuk ditampilkan di HTML',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="he-in" placeholder="Teks/HTML..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="he-enc" style="flex:1;">Encode →</button><button class="tool-btn ghost" id="he-dec" style="flex:1;">← Decode</button></div><textarea class="tool-input" id="he-out"></textarea>`;
    root.querySelector('#he-enc').onclick = () => root.querySelector('#he-out').value = CU.esc(root.querySelector('#he-in').value);
    root.querySelector('#he-dec').onclick = () => { const d=document.createElement('textarea'); d.innerHTML=root.querySelector('#he-in').value; root.querySelector('#he-out').value = d.value; };
  }},
{ id:'text-binary', cat:'encode', title:'Teks ⇄ Biner', desc:'Konversi teks ke kode biner dan sebaliknya',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="tb-in" placeholder="Teks atau biner..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="tb-enc" style="flex:1;">Teks → Biner</button><button class="tool-btn ghost" id="tb-dec" style="flex:1;">Biner → Teks</button></div><textarea class="tool-input" id="tb-out"></textarea>`;
    root.querySelector('#tb-enc').onclick = () => root.querySelector('#tb-out').value = [...root.querySelector('#tb-in').value].map(c=>c.charCodeAt(0).toString(2).padStart(8,'0')).join(' ');
    root.querySelector('#tb-dec').onclick = () => { try { root.querySelector('#tb-out').value = root.querySelector('#tb-in').value.trim().split(/\s+/).map(b=>String.fromCharCode(parseInt(b,2))).join(''); } catch(e){ root.querySelector('#tb-out').value='Format biner tidak valid'; } };
  }},
{ id:'text-hex', cat:'encode', title:'Teks ⇄ Hex', desc:'Konversi teks ke heksadesimal dan sebaliknya',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="th-in" placeholder="Teks atau hex..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="th-enc" style="flex:1;">Teks → Hex</button><button class="tool-btn ghost" id="th-dec" style="flex:1;">Hex → Teks</button></div><textarea class="tool-input" id="th-out"></textarea>`;
    root.querySelector('#th-enc').onclick = () => root.querySelector('#th-out').value = [...root.querySelector('#th-in').value].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(' ');
    root.querySelector('#th-dec').onclick = () => { try { root.querySelector('#th-out').value = root.querySelector('#th-in').value.trim().split(/\s+/).map(h=>String.fromCharCode(parseInt(h,16))).join(''); } catch(e){ root.querySelector('#th-out').value='Format hex tidak valid'; } };
  }},
{ id:'text-morse', cat:'encode', title:'Teks ⇄ Kode Morse', desc:'Konversi teks ke kode morse dan sebaliknya',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="tm2-in" placeholder="Teks atau .-- / morse..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="tm2-enc" style="flex:1;">Teks → Morse</button><button class="tool-btn ghost" id="tm2-dec" style="flex:1;">Morse → Teks</button></div><textarea class="tool-input" id="tm2-out"></textarea>`;
    root.querySelector('#tm2-enc').onclick = () => root.querySelector('#tm2-out').value = root.querySelector('#tm2-in').value.toUpperCase().split(' ').map(w=>[...w].map(c=>MORSE_MAP[c]||'').join(' ')).join(' / ');
    root.querySelector('#tm2-dec').onclick = () => root.querySelector('#tm2-out').value = root.querySelector('#tm2-in').value.split(' / ').map(w=>w.trim().split(' ').map(c=>MORSE_REV[c]||'').join('')).join(' ');
  }},
{ id:'case-converter', cat:'encode', title:'Case Converter', desc:'UPPER, lower, Title, camel, snake, kebab',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="cc-in" placeholder="Teks..."></textarea><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;"><button class="tool-btn ghost" data-m="upper">UPPERCASE</button><button class="tool-btn ghost" data-m="lower">lowercase</button><button class="tool-btn ghost" data-m="title">Title Case</button><button class="tool-btn ghost" data-m="camel">camelCase</button><button class="tool-btn ghost" data-m="snake">snake_case</button><button class="tool-btn ghost" data-m="kebab">kebab-case</button></div><textarea class="tool-input" id="cc-out"></textarea>`;
    const words = (s) => s.trim().split(/[\s_\-]+/).filter(Boolean);
    const conv = { upper:s=>s.toUpperCase(), lower:s=>s.toLowerCase(), title:s=>words(s).map(w=>w[0].toUpperCase()+w.slice(1).toLowerCase()).join(' '),
      camel:s=>{const w=words(s); return w.map((x,i)=>i===0?x.toLowerCase():x[0].toUpperCase()+x.slice(1).toLowerCase()).join('');},
      snake:s=>words(s).map(w=>w.toLowerCase()).join('_'), kebab:s=>words(s).map(w=>w.toLowerCase()).join('-') };
    root.querySelectorAll('[data-m]').forEach(btn => btn.onclick = () => root.querySelector('#cc-out').value = conv[btn.dataset.m](root.querySelector('#cc-in').value));
  }},
{ id:'csv-json', cat:'encode', title:'CSV ⇄ JSON', desc:'Konversi data tabel antara CSV dan JSON',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="cj-in" placeholder="CSV atau JSON..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="cj-enc" style="flex:1;">CSV → JSON</button><button class="tool-btn ghost" id="cj-dec" style="flex:1;">JSON → CSV</button></div><textarea class="tool-input" id="cj-out"></textarea>`;
    root.querySelector('#cj-enc').onclick = () => { try { const lines = root.querySelector('#cj-in').value.trim().split('\n').map(l=>l.split(',')); const headers = lines[0]; const rows = lines.slice(1).map(l => Object.fromEntries(headers.map((h,i)=>[h.trim(), (l[i]||'').trim()]))); root.querySelector('#cj-out').value = JSON.stringify(rows, null, 2); } catch(e){ root.querySelector('#cj-out').value='CSV tidak valid'; } };
    root.querySelector('#cj-dec').onclick = () => { try { const arr = JSON.parse(root.querySelector('#cj-in').value); if (!Array.isArray(arr) || !arr.length) throw 0; const headers = Object.keys(arr[0]); const csv = [headers.join(',')].concat(arr.map(o=>headers.map(h=>o[h]).join(','))).join('\n'); root.querySelector('#cj-out').value = csv; } catch(e){ root.querySelector('#cj-out').value='JSON tidak valid (harus array of objects)'; } };
  }},

// ===== DEV TOOLS =====
{ id:'json-formatter', cat:'dev', title:'JSON Formatter & Validator', desc:'Rapikan, validasi, atau minify JSON',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="jf-in" placeholder='{"key":"value"}'></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="jf-fmt" style="flex:1;">Format</button><button class="tool-btn ghost" id="jf-min" style="flex:1;">Minify</button></div><textarea class="tool-input" id="jf-out" style="font-family:monospace;"></textarea>`;
    root.querySelector('#jf-fmt').onclick = () => { try { root.querySelector('#jf-out').value = JSON.stringify(JSON.parse(root.querySelector('#jf-in').value), null, 2); } catch(e){ root.querySelector('#jf-out').value='JSON tidak valid: '+e.message; } };
    root.querySelector('#jf-min').onclick = () => { try { root.querySelector('#jf-out').value = JSON.stringify(JSON.parse(root.querySelector('#jf-in').value)); } catch(e){ root.querySelector('#jf-out').value='JSON tidak valid: '+e.message; } };
  }},
{ id:'regex-tester', cat:'dev', title:'Regex Tester', desc:'Uji pola regex langsung terhadap teks',
  render(root){
    root.innerHTML = `<div class="tool-row" style="margin-bottom:10px;"><input class="tool-input" id="rx-pat" placeholder="pattern, mis: \\d+"><input class="tool-input" id="rx-flags" placeholder="flags" style="max-width:70px;" value="g"></div><textarea class="tool-input" id="rx-text" placeholder="Teks untuk diuji..."></textarea><div class="tool-result" id="rx-result">-</div>`;
    const run = () => {
      const pat = root.querySelector('#rx-pat').value, flags = root.querySelector('#rx-flags').value, text = root.querySelector('#rx-text').value;
      const res = root.querySelector('#rx-result'); if (!pat) { res.innerText='Masukkan pattern.'; return; }
      try { const g = flags.includes('g') ? flags : flags+'g'; const matches = [...text.matchAll(new RegExp(pat, g))];
        res.innerHTML = matches.length ? `${matches.length} match ditemukan:<br>` + matches.slice(0,30).map(m=>`• "${CU.esc(m[0])}" @${m.index}`).join('<br>') : 'Tidak ada match.';
      } catch(e){ res.innerText = 'Regex tidak valid: '+e.message; }
    };
    root.querySelector('#rx-pat').oninput = run; root.querySelector('#rx-flags').oninput = run; root.querySelector('#rx-text').oninput = run;
  }},
{ id:'text-diff', cat:'dev', title:'Text Diff Checker', desc:'Bandingkan dua teks, lihat baris yang berubah',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="d-a" placeholder="Teks A (asli)..." style="min-height:60px;"></textarea><textarea class="tool-input" id="d-b" placeholder="Teks B (baru)..." style="min-height:60px;"></textarea><button class="tool-btn" id="d-run" style="width:100%;">Bandingkan</button><div class="tool-result" id="d-out" style="font-family:monospace;font-size:11px;"></div>`;
    root.querySelector('#d-run').onclick = () => {
      const diffs = diffLines(root.querySelector('#d-a').value, root.querySelector('#d-b').value);
      root.querySelector('#d-out').innerHTML = diffs.map(([type,line]) => { const color = type==='add'?'var(--neon-green)':type==='del'?'var(--neon-pink)':'var(--text-sub)'; const prefix = type==='add'?'+ ':type==='del'?'- ':'  '; return `<div style="color:${color};">${prefix}${CU.esc(line)}</div>`; }).join('');
    };
  }},
{ id:'uuid-generator', cat:'dev', title:'UUID Generator', desc:'Buat UUID v4 acak, banyak sekaligus',
  render(root){
    root.innerHTML = `<div class="tool-row" style="margin-bottom:10px;"><input class="tool-input" id="uu-count" type="number" value="5" min="1" max="50"><button class="tool-btn" id="uu-btn">Generate</button></div><textarea class="tool-input" id="uu-out" style="font-family:monospace;min-height:140px;"></textarea>`;
    const gen = () => { const n = Math.min(50, Math.max(1, parseInt(root.querySelector('#uu-count').value)||1)); root.querySelector('#uu-out').value = Array.from({length:n}, ()=>crypto.randomUUID()).join('\n'); };
    root.querySelector('#uu-btn').onclick = gen; gen();
  }},
{ id:'timestamp-converter', cat:'dev', title:'Timestamp Converter', desc:'Konversi Unix timestamp ↔ tanggal',
  render(root){
    root.innerHTML = `<label style="font-size:10px;color:var(--text-sub);">Unix Timestamp</label><input class="tool-input" id="ts-unix" placeholder="mis: 1700000000"><label style="font-size:10px;color:var(--text-sub);">atau Tanggal</label><input class="tool-input" id="ts-date" type="datetime-local"><button class="tool-btn" id="ts-now" style="width:100%;margin-bottom:10px;">Gunakan Waktu Sekarang</button><div class="tool-result" id="ts-out">-</div>`;
    const show = (d) => root.querySelector('#ts-out').innerHTML = `Unix: ${Math.floor(d.getTime()/1000)}<br>ISO: ${d.toISOString()}<br>Lokal: ${d.toLocaleString('id-ID')}`;
    root.querySelector('#ts-unix').oninput = (e) => { if (e.target.value) show(new Date(parseInt(e.target.value)*1000)); };
    root.querySelector('#ts-date').oninput = (e) => { if (e.target.value) show(new Date(e.target.value)); };
    root.querySelector('#ts-now').onclick = () => show(new Date());
  }},
{ id:'lorem-ipsum', cat:'dev', title:'Lorem Ipsum Generator', desc:'Buat teks placeholder untuk desain/konten',
  render(root){
    const words = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(' ');
    root.innerHTML = `<div class="tool-row" style="margin-bottom:10px;"><input class="tool-input" id="li-count" type="number" value="3" min="1" max="20"><button class="tool-btn" id="li-btn">Generate</button></div><textarea class="tool-input" id="li-out" style="min-height:160px;"></textarea>`;
    const gen = () => { const n = Math.min(20, Math.max(1, parseInt(root.querySelector('#li-count').value)||1)); const paras = [];
      for (let p=0;p<n;p++){ let s=[]; const len = 40+Math.floor(Math.random()*30); for (let i=0;i<len;i++) s.push(words[Math.floor(Math.random()*words.length)]); let str = s.join(' '); str = str[0].toUpperCase()+str.slice(1)+'.'; paras.push(str); }
      root.querySelector('#li-out').value = paras.join('\n\n'); };
    root.querySelector('#li-btn').onclick = gen; gen();
  }},
{ id:'markdown-preview', cat:'dev', title:'Markdown Previewer', desc:'Tulis Markdown, lihat hasil render-nya',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="md-in" placeholder="# Judul&#10;**tebal** _miring_&#10;- item list" style="min-height:120px;"></textarea><div class="tool-result" id="md-out" style="min-height:80px;"></div>`;
    root.querySelector('#md-in').oninput = (e) => root.querySelector('#md-out').innerHTML = mdToHtml(e.target.value) || '<span style="color:#555">Preview muncul di sini...</span>';
  }},
{ id:'word-counter', cat:'dev', title:'Word/Character Counter', desc:'Hitung kata, karakter, dan kalimat',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="wc-in" placeholder="Ketik atau tempel teks..." style="min-height:140px;"></textarea><div class="tool-result" id="wc-out">Kata: 0 • Karakter: 0 • Kalimat: 0</div>`;
    root.querySelector('#wc-in').oninput = (e) => { const t = e.target.value; const words = t.trim()?t.trim().split(/\s+/).length:0; const chars = t.length; const sentences = (t.match(/[.!?]+/g)||[]).length; root.querySelector('#wc-out').innerText = `Kata: ${words} • Karakter: ${chars} • Kalimat: ${sentences}`; };
  }},

// ===== NETWORK & PRIVACY =====
{ id:'my-connection', cat:'network', title:'Info Koneksi Saya', desc:'Lihat apa yang bisa website lihat tentang koneksimu',
  render(root){
    root.innerHTML = `<div class="tool-result" id="mc-out">Mengambil info...</div><p class="tool-note">Menampilkan info koneksimu sendiri — bukan untuk melacak orang lain.</p>`;
    (async () => { const out = root.querySelector('#mc-out'); let ipInfo = 'Gagal memuat IP publik.';
      try { const r = await fetch('https://api.ipify.org?format=json'); const j = await r.json(); ipInfo = `IP Publik: ${j.ip}`; } catch(e){}
      out.innerHTML = `${ipInfo}<br>Browser: ${CU.esc(navigator.userAgent)}<br>Bahasa: ${navigator.language}<br>Platform: ${navigator.platform||'-'}<br>Resolusi Layar: ${screen.width}x${screen.height}<br>Online: ${navigator.onLine?'Ya':'Tidak'}`;
    })();
  }},
{ id:'latency-monitor', cat:'network', title:'Monitor Latency Jaringan', desc:'Ukur kecepatan respons ke server populer',
  render(root){
    root.innerHTML = `<div class="tool-result" id="lm-out">Mengukur...</div><button class="tool-btn ghost" id="lm-refresh" style="width:100%;margin-top:10px;">Ukur Ulang</button>`;
    const targets = [['Cloudflare','https://cloudflare.com/favicon.ico'],['Google','https://www.google.com/favicon.ico']];
    const run = async () => { const out = root.querySelector('#lm-out'); out.innerHTML = 'Mengukur...'; const results = [];
      for (const [name,url] of targets) { const start = performance.now(); try { await fetch(url+'?t='+Date.now(), {mode:'no-cors',cache:'no-store'}); results.push(`${name}: ${Math.round(performance.now()-start)}ms`); } catch(e){ results.push(`${name}: timeout`); } }
      out.innerHTML = results.join('<br>'); };
    root.querySelector('#lm-refresh').onclick = run; run();
  }},
{ id:'temp-mail', cat:'network', title:'Email Sementara', desc:'Dapatkan alamat email sekali pakai untuk testing',
  render(root){
    root.innerHTML = `<div class="tool-result" id="tm-addr">Membuat alamat...</div><button class="tool-btn ghost" id="tm-refresh" style="width:100%;margin:10px 0;">Cek Inbox</button><div id="tm-inbox"></div><p class="tool-note">Layanan pihak ketiga (1secmail) untuk testing/privasi — jangan gunakan untuk akun penting.</p>`;
    let mailbox = '';
    (async () => { try { const r = await fetch('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1'); const [addr] = await r.json(); mailbox = addr; root.querySelector('#tm-addr').innerHTML = `📧 <b>${addr}</b>`; } catch(e){ root.querySelector('#tm-addr').innerText = 'Layanan tidak tersedia saat ini.'; } })();
    root.querySelector('#tm-refresh').onclick = async () => { if (!mailbox) return; const [login,domain] = mailbox.split('@'); const inboxEl = root.querySelector('#tm-inbox'); inboxEl.innerHTML = 'Memuat...';
      try { const r = await fetch(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`); const msgs = await r.json(); inboxEl.innerHTML = msgs.length ? msgs.map(m=>`<div class="tool-result">Dari: ${CU.esc(m.from)}<br>Subjek: ${CU.esc(m.subject)}</div>`).join('') : '<p style="font-size:11px;color:var(--text-sub);">Inbox kosong.</p>'; } catch(e){ inboxEl.innerHTML = 'Gagal memuat inbox.'; } };
  }},

// ===== EXTRA =====
{ id:'classic-cipher', cat:'extra', title:'Cipher Klasik', desc:'Caesar, ROT13, dan Vigenère cipher',
  render(root){
    root.innerHTML = `<select class="tool-input" id="cc2-type"><option value="caesar">Caesar Cipher</option><option value="rot13">ROT13</option><option value="vigenere">Vigenère Cipher</option></select><input class="tool-input" id="cc2-key" placeholder="Shift (angka) atau kata kunci"><textarea class="tool-input" id="cc2-in" placeholder="Teks..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="cc2-enc" style="flex:1;">Enkripsi</button><button class="tool-btn ghost" id="cc2-dec" style="flex:1;">Dekripsi</button></div><textarea class="tool-input" id="cc2-out"></textarea>`;
    const caesar = (s, shift) => s.replace(/[a-zA-Z]/g, c => { const base = c<'a'?65:97; return String.fromCharCode((c.charCodeAt(0)-base+shift+26)%26+base); });
    const vigenere = (s, key, decrypt) => { let ki=0; return s.replace(/[a-zA-Z]/g, c => { const base = c<'a'?65:97; const k = key[ki%key.length].toLowerCase().charCodeAt(0)-97; ki++; const shift = decrypt?-k:k; return String.fromCharCode((c.charCodeAt(0)-base+shift+26)%26+base); }); };
    const run = (decrypt) => { const type = root.querySelector('#cc2-type').value, key = root.querySelector('#cc2-key').value, text = root.querySelector('#cc2-in').value; let out = '';
      if (type==='rot13') out = caesar(text, decrypt?-13:13);
      else if (type==='caesar') out = caesar(text, (decrypt?-1:1) * (parseInt(key)||3));
      else if (type==='vigenere') out = key ? vigenere(text, key, decrypt) : 'Masukkan kata kunci.';
      root.querySelector('#cc2-out').value = out; };
    root.querySelector('#cc2-enc').onclick = () => run(false); root.querySelector('#cc2-dec').onclick = () => run(true);
  }},
{ id:'random-generator', cat:'extra', title:'Generator Angka Acak', desc:'Angka acak aman dalam rentang tertentu',
  render(root){
    root.innerHTML = `<div class="tool-row" style="margin-bottom:10px;"><input class="tool-input" id="rg-min" type="number" value="1" placeholder="Min"><input class="tool-input" id="rg-max" type="number" value="100" placeholder="Max"></div><button class="tool-btn" id="rg-btn" style="width:100%;">Generate Angka Acak</button><div class="tool-result" id="rg-out" style="text-align:center;font-size:22px;font-weight:800;">-</div>`;
    root.querySelector('#rg-btn').onclick = () => { const min = parseInt(root.querySelector('#rg-min').value)||0, max = parseInt(root.querySelector('#rg-max').value)||100; root.querySelector('#rg-out').innerText = CU.randInt(Math.min(min,max), Math.max(min,max)); };
  }},
{ id:'color-converter', cat:'extra', title:'Konverter Warna', desc:'HEX ⇄ RGB ⇄ HSL dengan color picker',
  render(root){
    root.innerHTML = `<input class="tool-input" id="col-pick" type="color" value="#00f3ff" style="height:48px;padding:4px;"><div class="tool-result" id="col-out">-</div>`;
    const update = (hex) => { const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
      const max=Math.max(r,g,b)/255, min=Math.min(r,g,b)/255; const l=(max+min)/2; let h=0,s=0; const d=max-min;
      if (d) { s = d/(1-Math.abs(2*l-1)); const rr=r/255,gg=g/255,bb=b/255; if (max===rr) h=((gg-bb)/d)%6; else if (max===gg) h=(bb-rr)/d+2; else h=(rr-gg)/d+4; h*=60; if (h<0) h+=360; }
      root.querySelector('#col-out').innerHTML = `HEX: ${hex.toUpperCase()}<br>RGB: rgb(${r}, ${g}, ${b})<br>HSL: hsl(${Math.round(h)}, ${Math.round(s*100)}%, ${Math.round(l*100)}%)`; };
    root.querySelector('#col-pick').oninput = (e) => update(e.target.value); update('#00f3ff');
  }},

// ===== GAMES =====
{ id:'reaction-test', cat:'game', title:'Tes Kecepatan Reaksi', desc:'Klik secepat mungkin saat kotak berubah hijau',
  render(root){
    root.innerHTML = `<div id="rt-box" style="height:160px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;background:var(--card-bg-2);border:1px solid var(--card-border);cursor:pointer;text-align:center;padding:16px;user-select:none;">Tekan untuk mulai</div><div class="tool-result" id="rt-result" style="text-align:center;">Rekor terbaik: -</div>`;
    const box = root.querySelector('#rt-box'), resultEl = root.querySelector('#rt-result');
    let state = 'idle', startTime = 0, timeoutId = null, best = Infinity;
    const setBox = (bg, text, color) => { box.style.background = bg; box.innerText = text; box.style.color = color || ''; };
    box.onclick = () => {
      if (state === 'idle') {
        state = 'waiting'; setBox('#ff0055', 'Tunggu warna hijau...', '#fff');
        timeoutId = setTimeout(() => { state = 'ready'; startTime = performance.now(); setBox('#00ff66', 'KLIK SEKARANG!', '#000'); }, 1500 + Math.random()*2500);
      } else if (state === 'waiting') {
        clearTimeout(timeoutId); state = 'idle'; setBox('var(--card-bg-2)', 'Terlalu cepat! Tekan untuk coba lagi', '');
      } else if (state === 'ready') {
        const rt = Math.round(performance.now() - startTime);
        if (rt < best) best = rt;
        state = 'idle'; setBox('var(--card-bg-2)', 'Tekan untuk mulai lagi', '');
        resultEl.innerHTML = `Waktu reaksi: <b style="color:var(--neon-cyan)">${rt}ms</b><br>Rekor terbaik: <b style="color:var(--neon-green)">${best}ms</b>`;
      }
    };
    ToolRuntime.cleanup = () => { if (timeoutId) clearTimeout(timeoutId); };
  }},
{ id:'typing-test', cat:'game', title:'Tes Kecepatan Mengetik', desc:'Ukur kecepatan (WPM) dan akurasi mengetikmu',
  render(root){
    const sentences = [
      'keamanan siber dimulai dari password yang kuat dan kebiasaan digital yang baik',
      'jangan pernah membagikan kode otp kepada siapa pun termasuk yang mengaku admin',
      'selalu perbarui perangkat lunak untuk menutup celah keamanan yang diketahui',
      'enkripsi mengubah data menjadi kode yang hanya bisa dibaca dengan kunci yang tepat',
      'waspada terhadap tautan mencurigakan yang dikirim lewat pesan atau email'
    ];
    const renderGame = () => {
      const target = sentences[Math.floor(Math.random()*sentences.length)];
      root.innerHTML = `<div class="tool-result" style="font-size:13px;line-height:1.6;">${CU.esc(target)}</div><textarea class="tool-input" id="tt-input" placeholder="Mulai ketik di sini untuk memulai..." style="margin-top:10px;min-height:80px;" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea><div class="tool-result" id="tt-result">Waktu: 0.0s • WPM: 0 • Akurasi: 100%</div><button class="tool-btn ghost" id="tt-restart" style="width:100%;margin-top:8px;">Acak Ulang</button>`;
      const input = root.querySelector('#tt-input'), resultEl = root.querySelector('#tt-result');
      let startTime = null, finished = false;
      input.oninput = () => {
        if (finished) return;
        if (!startTime) startTime = performance.now();
        const typed = input.value;
        let correct = 0; for (let i=0;i<typed.length;i++) if (typed[i] === target[i]) correct++;
        const accuracy = typed.length ? Math.round((correct/typed.length)*100) : 100;
        const elapsed = (performance.now() - startTime)/1000;
        const wpm = elapsed>0.1 ? Math.round((typed.trim().split(/\s+/).length / elapsed) * 60) : 0;
        resultEl.innerHTML = `Waktu: ${elapsed.toFixed(1)}s • WPM: ${wpm} • Akurasi: ${accuracy}%`;
        if (typed === target) { finished = true; resultEl.innerHTML += ' <b style="color:var(--neon-green);">✅ Selesai!</b>'; input.disabled = true; }
      };
      root.querySelector('#tt-restart').onclick = renderGame;
    };
    renderGame();
  }},
{ id:'cipher-breaker', cat:'game', title:'Pecahkan Sandi', desc:'Tebak kata asli di balik sandi Caesar, uji insting cyber-mu',
  render(root){
    const words = ['FIREWALL','ENKRIPSI','PASSWORD','JARINGAN','PROTOKOL','KEAMANAN','SERVER','PHISHING','MALWARE','BACKDOOR','GATEWAY','TROJAN','ANTIVIRUS','KRIPTOGRAFI'];
    let score = 0, word = '';
    const next = () => {
      word = words[Math.floor(Math.random()*words.length)];
      const shift = 1 + Math.floor(Math.random()*12);
      root.querySelector('#cb-encoded').innerText = [...word].map(c => String.fromCharCode((c.charCodeAt(0)-65+shift)%26+65)).join('');
      root.querySelector('#cb-shift').innerText = shift;
      root.querySelector('#cb-guess').value = ''; root.querySelector('#cb-guess').focus();
      root.querySelector('#cb-msg').innerText = ''; root.querySelector('#cb-msg').className = 'form-msg';
    };
    root.innerHTML = `<div style="text-align:center;margin-bottom:10px;">Skor: <b id="cb-score" style="color:var(--neon-green);">0</b></div>
      <div class="tool-result" style="text-align:center;font-size:20px;font-weight:800;letter-spacing:2px;" id="cb-encoded">-</div>
      <p style="font-size:11px;color:var(--text-sub);text-align:center;margin:8px 0;">Digeser <b id="cb-shift">0</b> huruf (Caesar cipher). Tebak kata aslinya:</p>
      <input class="tool-input" id="cb-guess" placeholder="Jawabanmu..." autocomplete="off" style="text-transform:uppercase;">
      <button class="tool-btn" id="cb-submit" style="width:100%;">Jawab</button>
      <div class="form-msg" id="cb-msg"></div>`;
    root.querySelector('#cb-submit').onclick = () => {
      const guess = root.querySelector('#cb-guess').value.trim().toUpperCase(), msg = root.querySelector('#cb-msg');
      if (guess === word) { score++; root.querySelector('#cb-score').innerText = score; msg.className='form-msg success'; msg.innerText='Benar! Soal berikutnya...'; setTimeout(next, 900); }
      else { msg.className='form-msg error'; msg.innerText=`Kurang tepat. Jawaban: ${word}`; setTimeout(next, 1400); }
    };
    root.querySelector('#cb-guess').onkeydown = (e) => { if (e.key==='Enter') root.querySelector('#cb-submit').click(); };
    next();
  }}
];
/* ChronoStar X — Tools Registry
   All tools here are defensive / educational / utility in nature.
   Nothing here targets a third party's account, device or server without consent. */

const ToolRuntime = { cleanup: null };

const CU = {
  async sha(text, algo) {
    const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  },
  async hmac(text, key, algo) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: algo }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  },
  async deriveKey(password, salt) {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async aesEncrypt(plain, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(password, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
    const combined = new Uint8Array(salt.length + iv.length + ct.byteLength);
    combined.set(salt, 0); combined.set(iv, salt.length); combined.set(new Uint8Array(ct), salt.length + iv.length);
    return btoa(String.fromCharCode(...combined));
  },
  async aesDecrypt(b64, password) {
    const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const salt = combined.slice(0, 16), iv = combined.slice(16, 28), ct = combined.slice(28);
    const key = await this.deriveKey(password, salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  },
  esc(s) { const d = document.createElement('div'); d.innerText = s ?? ''; return d.innerHTML; },
  copy(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      if (btn) { const old = btn.innerText; btn.innerText = 'Tersalin!'; setTimeout(() => btn.innerText = old, 1200); }
    });
  },
  randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
};

function scorePassword(pw) {
  if (!pw) return { score: 0, label: '-', color: '#555' };
  let score = 0;
  const sets = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/];
  const variety = sets.filter(r => r.test(pw)).length;
  score += Math.min(pw.length * 4, 40);
  score += variety * 12;
  if (/^(.)\1+$/.test(pw)) score = 5;
  if (/^(12345|qwerty|password|abc123|111111)/i.test(pw)) score = Math.min(score, 15);
  score = Math.max(0, Math.min(100, score));
  let label, color;
  if (score < 30) { label = 'Sangat Lemah'; color = '#ff0055'; }
  else if (score < 50) { label = 'Lemah'; color = '#ff8800'; }
  else if (score < 70) { label = 'Sedang'; color = '#ffb800'; }
  else if (score < 90) { label = 'Kuat'; color = '#00ff66'; }
  else { label = 'Sangat Kuat'; color = '#00f3ff'; }
  return { score, label, color };
}

function diffLines(a, b) {
  const la = a.split('\n'), lb = b.split('\n');
  const n = la.length, m = lb.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = la[i] === lb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, out = [];
  while (i < n && j < m) {
    if (la[i] === lb[j]) { out.push(['same', la[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(['del', la[i]]); i++; }
    else { out.push(['add', lb[j]]); j++; }
  }
  while (i < n) { out.push(['del', la[i]]); i++; }
  while (j < m) { out.push(['add', lb[j]]); j++; }
  return out;
}

function mdToHtml(md) {
  if (!md) return '';
  let h = CU.esc(md);
  h = h.replace(/^### (.*)$/gm, '<h3>$1</h3>')
       .replace(/^## (.*)$/gm, '<h2>$1</h2>')
       .replace(/^# (.*)$/gm, '<h1>$1</h1>')
       .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
       .replace(/\*(.*?)\*/g, '<i>$1</i>')
       .replace(/`(.*?)`/g, '<code>$1</code>')
       .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--neon-cyan)">$1</a>')
       .replace(/^- (.*)$/gm, '<li>$1</li>')
       .replace(/\n/g, '<br>');
  return h;
}

const MORSE_MAP = { A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..','0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.' };
const MORSE_REV = Object.fromEntries(Object.entries(MORSE_MAP).map(([k, v]) => [v, k]));

const CAT_ICON = {
  security: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>',
  websec: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="21" y2="14"/><line x1="14" y1="21" x2="21" y2="21"/><line x1="17" y1="14" x2="17" y2="21"/>',
  encode: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  dev: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  network: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  extra: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  game: '<rect x="2" y="7" width="20" height="11" rx="5.5"/><line x1="6.5" y1="12.5" x2="9.5" y2="12.5"/><line x1="8" y1="11" x2="8" y2="14"/><circle cx="15.5" cy="11" r="1"/><circle cx="18" cy="13.5" r="1"/>'
};

const CATEGORIES = [
  { id: 'all', label: 'Semua' },
  { id: 'security', label: 'Keamanan' },
  { id: 'websec', label: 'Analisis Web' },
  { id: 'qr', label: 'QR Code' },
  { id: 'encode', label: 'Enkoding' },
  { id: 'dev', label: 'Dev Tools' },
  { id: 'network', label: 'Jaringan' },
  { id: 'game', label: 'Game' },
  { id: 'extra', label: 'Ekstra' }
];

const TOOLS = [
// ===== SECURITY & ENCRYPTION =====
{ id:'password-strength', cat:'security', title:'Analisis Kekuatan Password', desc:'Cek seberapa kuat passwordmu secara real-time',
  render(root){
    root.innerHTML = `<input type="text" id="pw-input" class="tool-input" placeholder="Ketik password untuk dicek..." autocomplete="off"><div class="strength-bar"><div class="strength-bar-fill" id="pw-fill" style="width:0%;background:#555;"></div></div><div class="tool-result" id="pw-result">Mulai mengetik...</div>`;
    const input = root.querySelector('#pw-input'), fill = root.querySelector('#pw-fill'), res = root.querySelector('#pw-result');
    input.oninput = () => { const s = scorePassword(input.value); fill.style.width = s.score+'%'; fill.style.background = s.color;
      res.innerHTML = `Kekuatan: <b style="color:${s.color}">${s.label}</b> (${s.score}/100)<br>Panjang: ${input.value.length} karakter`; };
  }},
{ id:'password-generator', cat:'security', title:'Generator Password Aman', desc:'Buat password acak dengan kriteria custom',
  render(root){
    root.innerHTML = `<div class="form-group"><label>Panjang: <span id="pwlen-label">16</span></label><input type="range" id="pwlen" min="8" max="64" value="16" style="width:100%;"></div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;font-size:11px;color:var(--text-sub);">
        <label><input type="checkbox" id="pw-upper" checked> Huruf Besar</label>
        <label><input type="checkbox" id="pw-lower" checked> Huruf Kecil</label>
        <label><input type="checkbox" id="pw-num" checked> Angka</label>
        <label><input type="checkbox" id="pw-sym" checked> Simbol</label>
      </div>
      <button class="tool-btn" id="pwgen-btn" style="width:100%;">Generate Password</button>
      <div class="tool-result" id="pwgen-result" style="font-family:monospace;font-size:14px;text-align:center;">-</div>
      <div class="copy-row"><button class="tool-btn ghost" id="pwgen-copy" style="width:100%;">Salin</button></div>`;
    const lenEl = root.querySelector('#pwlen'), lenLabel = root.querySelector('#pwlen-label');
    lenEl.oninput = () => lenLabel.innerText = lenEl.value;
    const gen = () => {
      const sets = [];
      if (root.querySelector('#pw-upper').checked) sets.push('ABCDEFGHJKLMNPQRSTUVWXYZ');
      if (root.querySelector('#pw-lower').checked) sets.push('abcdefghijkmnpqrstuvwxyz');
      if (root.querySelector('#pw-num').checked) sets.push('23456789');
      if (root.querySelector('#pw-sym').checked) sets.push('!@#$%^&*()-_=+?');
      if (!sets.length) { root.querySelector('#pwgen-result').innerText = 'Pilih minimal satu jenis karakter.'; return; }
      const all = sets.join(''); const len = parseInt(lenEl.value);
      const arr = crypto.getRandomValues(new Uint32Array(len));
      let out = ''; for (let i=0;i<len;i++) out += all[arr[i] % all.length];
      root.querySelector('#pwgen-result').innerText = out;
    };
    root.querySelector('#pwgen-btn').onclick = gen;
    root.querySelector('#pwgen-copy').onclick = (e) => CU.copy(root.querySelector('#pwgen-result').innerText, e.target);
    gen();
  }},
{ id:'breach-checker', cat:'security', title:'Cek Kebocoran Password', desc:'Cek apakah password pernah bocor (HIBP k-anonymity)',
  render(root){
    root.innerHTML = `<input type="password" id="breach-input" class="tool-input" placeholder="Masukkan password untuk dicek..."><button class="tool-btn" id="breach-btn" style="width:100%;">Cek Kebocoran</button><div class="tool-result" id="breach-result"></div><p class="tool-note">Memakai k-anonymity API Have I Been Pwned: hanya 5 karakter awal hash SHA-1 yang dikirim, password asli tidak pernah meninggalkan browser.</p>`;
    root.querySelector('#breach-btn').onclick = async () => {
      const pw = root.querySelector('#breach-input').value; const res = root.querySelector('#breach-result');
      if (!pw) { res.innerText = 'Masukkan password dulu.'; return; }
      res.innerText = 'Memeriksa...';
      try {
        const hash = (await CU.sha(pw, 'SHA-1')).toUpperCase();
        const prefix = hash.slice(0,5), suffix = hash.slice(5);
        const r = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
        const text = await r.text();
        const line = text.split('\n').find(l => l.startsWith(suffix));
        if (line) { const count = parseInt(line.split(':')[1]); res.innerHTML = `🚨 Password ini muncul di <b>${count.toLocaleString('id-ID')}</b> kebocoran data. Jangan gunakan!`; }
        else res.innerHTML = `✅ Tidak ditemukan pada database kebocoran yang diketahui.`;
      } catch(e) { res.innerText = 'Gagal menghubungi API, coba lagi.'; }
    };
  }},
{ id:'aes-encrypt', cat:'security', title:'Enkripsi/Dekripsi Teks (AES-256)', desc:'Amankan catatan dengan password, AES-GCM asli',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="ae-text" placeholder="Teks..."></textarea><input class="tool-input" id="ae-pass" type="password" placeholder="Password"><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="ae-enc" style="flex:1;">Enkripsi</button><button class="tool-btn ghost" id="ae-dec" style="flex:1;">Dekripsi</button></div><textarea class="tool-input" id="ae-out" placeholder="Hasil..."></textarea>`;
    root.querySelector('#ae-enc').onclick = async () => {
      const t = root.querySelector('#ae-text').value, p = root.querySelector('#ae-pass').value;
      if (!t || !p) { root.querySelector('#ae-out').value = 'Isi teks dan password dulu.'; return; }
      root.querySelector('#ae-out').value = await CU.aesEncrypt(t, p);
    };
    root.querySelector('#ae-dec').onclick = async () => {
      const t = root.querySelector('#ae-text').value, p = root.querySelector('#ae-pass').value;
      try { root.querySelector('#ae-out').value = await CU.aesDecrypt(t, p); }
      catch(e) { root.querySelector('#ae-out').value = 'Gagal dekripsi: password salah atau teks bukan hasil enkripsi tool ini.'; }
    };
  }},
{ id:'hash-generator', cat:'security', title:'Generator Hash', desc:'SHA-1 / SHA-256 / SHA-384 / SHA-512 instan',
  render(root){
    const algos = ['SHA-1','SHA-256','SHA-384','SHA-512'];
    root.innerHTML = `<textarea id="hash-input" class="tool-input" placeholder="Masukkan teks..."></textarea><div id="hash-out"></div><p class="tool-note">MD5 tidak disediakan karena sudah lama dianggap tidak aman secara kriptografis.</p>`;
    const out = root.querySelector('#hash-out');
    out.innerHTML = algos.map(a=>`<div style="margin-bottom:10px;"><label style="font-size:10px;color:var(--text-sub);">${a}</label><div class="tool-result" id="h-${a}" style="margin-top:4px;font-size:11px;">-</div></div>`).join('');
    root.querySelector('#hash-input').oninput = async (e) => { const v = e.target.value; for (const a of algos) root.querySelector(`#h-${a}`).innerText = v ? await CU.sha(v,a) : '-'; };
  }},
{ id:'hmac-generator', cat:'security', title:'Generator HMAC', desc:'Buat tanda tangan pesan dengan secret key',
  render(root){
    root.innerHTML = `<input class="tool-input" id="hmac-key" placeholder="Secret key..."><textarea class="tool-input" id="hmac-msg" placeholder="Pesan..."></textarea><select class="tool-input" id="hmac-algo"><option value="SHA-256">HMAC-SHA256</option><option value="SHA-1">HMAC-SHA1</option><option value="SHA-512">HMAC-SHA512</option></select><button class="tool-btn" id="hmac-btn" style="width:100%;">Generate HMAC</button><div class="tool-result" id="hmac-result">-</div>`;
    root.querySelector('#hmac-btn').onclick = async () => {
      const key = root.querySelector('#hmac-key').value, msg = root.querySelector('#hmac-msg').value, algo = root.querySelector('#hmac-algo').value;
      if (!key || !msg) { root.querySelector('#hmac-result').innerText = 'Isi key dan pesan dulu.'; return; }
      root.querySelector('#hmac-result').innerText = await CU.hmac(msg, key, algo);
    };
  }},
{ id:'file-hash', cat:'security', title:'Cek Hash File', desc:'Verifikasi integritas file (SHA-256), 100% lokal',
  render(root){
    root.innerHTML = `<input type="file" id="fh-input" class="tool-input"><div class="tool-result" id="fh-result">Pilih file untuk menghitung SHA-256. File tidak diunggah ke mana pun.</div>`;
    root.querySelector('#fh-input').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const res = root.querySelector('#fh-result'); res.innerText = 'Menghitung...';
      const buf = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest('SHA-256', buf);
      const hex = [...new Uint8Array(hashBuf)].map(b=>b.toString(16).padStart(2,'0')).join('');
      res.innerHTML = `<b>${CU.esc(file.name)}</b> (${(file.size/1024).toFixed(1)} KB)<br>SHA-256:<br>${hex}`;
    };
  }},
{ id:'jwt-decoder', cat:'security', title:'Dekoder JWT', desc:'Lihat isi header & payload token JWT',
  render(root){
    root.innerHTML = `<textarea id="jwt-input" class="tool-input" placeholder="Tempel token JWT..."></textarea><div class="tool-result" id="jwt-result" style="font-family:monospace;font-size:11px;">-</div><p class="tool-note">Hanya mendekode (base64url), tidak memverifikasi tanda tangan.</p>`;
    root.querySelector('#jwt-input').oninput = (e) => {
      const parts = e.target.value.trim().split('.'); const res = root.querySelector('#jwt-result');
      if (parts.length < 2) { res.innerText = 'Format JWT tidak valid.'; return; }
      try {
        const dec = (s) => JSON.stringify(JSON.parse(decodeURIComponent(atob(s.replace(/-/g,'+').replace(/_/g,'/')).split('').map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''))), null, 2);
        res.innerText = `HEADER:\n${dec(parts[0])}\n\nPAYLOAD:\n${dec(parts[1])}`;
      } catch(e){ res.innerText = 'Gagal mendekode token.'; }
    };
  }},

// ===== WEB SECURITY ANALYSIS (defensive / pattern-based, not attack tools) =====
{ id:'sqli-scanner', cat:'websec', title:'Pemindai Pola SQL Injection', desc:'Validasi input untuk pola injeksi SQL (edukasi)',
  render(root){
    root.innerHTML = `<textarea id="sqli-input" class="tool-input" placeholder="Tempel input/teks yang ingin diperiksa..."></textarea><button class="tool-btn" id="sqli-btn" style="width:100%;">Periksa</button><div class="tool-result" id="sqli-result"></div><p class="tool-note">Alat ini memeriksa pola teks secara statis untuk validasi input pada formulirmu sendiri — bukan alat untuk menyerang sistem pihak lain.</p>`;
    root.querySelector('#sqli-btn').onclick = () => {
      const v = root.querySelector('#sqli-input').value;
      const patterns = [
        [/(\bor\b|\band\b)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i, "Pola tautologi (OR 1=1)"],
        [/union\s+select/i, "UNION SELECT"],
        [/;?\s*drop\s+table/i, "DROP TABLE"],
        [/--|\#|\/\*/, "Komentar SQL (--, #, /*) yang bisa memotong query"],
        [/'\s*or\s*'/i, "Pola string OR injection"],
        [/\bexec(\s|\()/i, "Pemanggilan EXEC"],
        [/information_schema/i, "Akses information_schema"],
        [/sleep\s*\(/i, "Time-based blind injection (SLEEP)"]
      ];
      const found = patterns.filter(p=>p[0].test(v)).map(p=>p[1]);
      root.querySelector('#sqli-result').innerHTML = found.length ? `⚠️ Ditemukan ${found.length} pola mencurigakan:<br>` + found.map(f=>'• '+f).join('<br>') : (v ? '✅ Tidak ditemukan pola SQL injection umum.' : 'Masukkan teks untuk diperiksa.');
    };
  }},
{ id:'xss-detector', cat:'websec', title:'Pendeteksi Pola XSS', desc:'Validasi input untuk pola serangan XSS (edukasi)',
  render(root){
    root.innerHTML = `<textarea id="xss-input" class="tool-input" placeholder="Tempel input/teks yang ingin diperiksa..."></textarea><button class="tool-btn" id="xss-btn" style="width:100%;">Periksa</button><div class="tool-result" id="xss-result"></div><p class="tool-note">Alat edukasi untuk validasi input sebelum ditampilkan di halaman web milikmu.</p>`;
    root.querySelector('#xss-btn').onclick = () => {
      const v = root.querySelector('#xss-input').value;
      const patterns = [
        [/<script[\s>]/i, "Tag <script>"], [/on\w+\s*=/i, "Event handler inline (onerror=, onload=, dst)"],
        [/javascript:/i, "Skema javascript: pada href/src"], [/<iframe/i, "Tag <iframe>"],
        [/document\.cookie/i, "Akses document.cookie"], [/<img[^>]+onerror/i, "Payload <img onerror>"],
        [/eval\s*\(/i, "Pemanggilan eval()"], [/<svg[^>]+onload/i, "Payload <svg onload>"]
      ];
      const found = patterns.filter(p=>p[0].test(v)).map(p=>p[1]);
      root.querySelector('#xss-result').innerHTML = found.length ? `⚠️ Ditemukan ${found.length} pola mencurigakan:<br>` + found.map(f=>'• '+f).join('<br>') : (v ? '✅ Tidak ditemukan pola XSS umum.' : 'Masukkan teks untuk diperiksa.');
    };
  }},
{ id:'url-analyzer', cat:'websec', title:'Analisis Keamanan URL', desc:'Deteksi ciri-ciri link phishing/mencurigakan',
  render(root){
    root.innerHTML = `<input id="url-an-input" class="tool-input" placeholder="Tempel URL di sini..."><button class="tool-btn" id="url-an-btn" style="width:100%;">Analisis</button><div class="tool-result" id="url-an-result"></div>`;
    root.querySelector('#url-an-btn').onclick = () => {
      const raw = root.querySelector('#url-an-input').value.trim(); const out = root.querySelector('#url-an-result');
      if (!raw) { out.innerText = 'Masukkan URL dulu.'; return; }
      let u; try { u = new URL(/^https?:\/\//.test(raw) ? raw : 'http://'+raw); } catch(e){ out.innerText = 'Format URL tidak valid.'; return; }
      const flags = [];
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) flags.push('⚠️ Host berupa alamat IP langsung, bukan domain.');
      if (u.hostname.split('.').length > 3) flags.push('⚠️ Subdomain berlapis-lapis, pola umum phishing.');
      if (u.username || u.password) flags.push('⚠️ Mengandung kredensial @ pada URL, teknik penyamaran umum.');
      if (/xn--/.test(u.hostname)) flags.push('⚠️ Domain punycode (bisa menyamarkan karakter mirip huruf lain).');
      if (u.protocol !== 'https:') flags.push('⚠️ Tidak memakai HTTPS, data tidak terenkripsi.');
      if (/-{2,}/.test(u.hostname) || u.hostname.length > 40) flags.push('⚠️ Nama domain tidak biasa / sangat panjang.');
      out.innerHTML = flags.length ? flags.map(f=>`<div style="margin-bottom:6px;">${f}</div>`).join('') : '✅ Tidak ditemukan pola mencurigakan umum. Tetap waspada, ini bukan jaminan 100% aman.';
    };
  }},
{ id:'site-reachability', cat:'websec', title:'Cek Status Website', desc:'Cek apakah sebuah domain merespons (best-effort)',
  render(root){
    root.innerHTML = `<div class="tool-row"><input id="site-url" class="tool-input" placeholder="contoh.com"><button class="tool-btn" id="site-check-btn">Cek</button></div><div class="tool-result" id="site-result">Masukkan domain lalu tekan Cek.</div><p class="tool-note">Metode best-effort (no-cors): mendeteksi apakah domain merespons di jaringanmu, bukan status HTTP pasti.</p>`;
    root.querySelector('#site-check-btn').onclick = async () => {
      let url = root.querySelector('#site-url').value.trim(); if (!url) return;
      if (!/^https?:\/\//.test(url)) url = 'https://' + url;
      const res = root.querySelector('#site-result'); res.innerText = 'Mengecek...';
      const start = performance.now();
      try { await fetch(url, { mode:'no-cors', cache:'no-store' }); res.innerText = `✅ ${url} merespons (${Math.round(performance.now()-start)}ms)`; }
      catch(e) { res.innerText = `❌ ${url} tidak dapat dijangkau dari browser ini.`; }
    };
  }},

// ===== QR & CODES =====
{ id:'qr-generator', cat:'qr', title:'Generator QR Code', desc:'Ubah teks, URL, atau data jadi QR Code',
  render(root){
    root.innerHTML = `<input class="tool-input" id="qr-text" placeholder="Teks, URL, atau data lain..."><div id="qr-box" style="margin:14px 0;display:flex;justify-content:center;background:#fff;border-radius:12px;padding:16px;min-height:60px;"></div><button class="tool-btn ghost" id="qr-dl" style="width:100%;">Unduh PNG</button>`;
    const box = root.querySelector('#qr-box');
    root.querySelector('#qr-text').oninput = (e) => { box.innerHTML=''; if (e.target.value) new QRCode(box, {text: e.target.value, width:200, height:200, correctLevel: QRCode.CorrectLevel.M}); };
    root.querySelector('#qr-dl').onclick = () => {
      const img = box.querySelector('img') || box.querySelector('canvas'); if (!img) return;
      const link = document.createElement('a'); link.download = 'qrcode.png';
      link.href = img.tagName === 'CANVAS' ? img.toDataURL() : img.src; link.click();
    };
  }},
{ id:'qr-scanner', cat:'qr', title:'Scanner QR Code', desc:'Pindai QR Code langsung lewat kamera',
  render(root){
    root.innerHTML = `<video id="qr-video" style="width:100%;border-radius:12px;background:#000;" playsinline muted></video><div class="tool-result" id="qr-scan-result">Mengaktifkan kamera...</div>`;
    const video = root.querySelector('#qr-video'), resEl = root.querySelector('#qr-scan-result');
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    let raf, stream, lastCode = '';
    navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } }).then(s => {
      stream = s; video.srcObject = s; video.play(); resEl.innerText = 'Arahkan kamera ke QR code...';
      const tick = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          ctx.drawImage(video,0,0,canvas.width,canvas.height);
          const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
          const code = jsQR(imgData.data, imgData.width, imgData.height);
          if (code && code.data !== lastCode) { lastCode = code.data; resEl.innerHTML = `✅ Terdeteksi:<br><b>${CU.esc(code.data)}</b>`; }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }).catch(e => resEl.innerText = 'Kamera tidak dapat diakses: ' + e.message);
    ToolRuntime.cleanup = () => { if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(t=>t.stop()); };
  }},

// ===== ENCODING & CONVERSION =====
{ id:'base64', cat:'encode', title:'Base64 Encode/Decode', desc:'Konversi teks ke/dari Base64',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="b64-in" placeholder="Teks asli..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="b64-enc" style="flex:1;">Encode →</button><button class="tool-btn ghost" id="b64-dec" style="flex:1;">← Decode</button></div><textarea class="tool-input" id="b64-out" placeholder="Hasil..."></textarea>`;
    root.querySelector('#b64-enc').onclick = () => { try { root.querySelector('#b64-out').value = btoa(unescape(encodeURIComponent(root.querySelector('#b64-in').value))); } catch(e){ root.querySelector('#b64-out').value='Error'; } };
    root.querySelector('#b64-dec').onclick = () => { try { root.querySelector('#b64-out').value = decodeURIComponent(escape(atob(root.querySelector('#b64-in').value))); } catch(e){ root.querySelector('#b64-out').value='Input bukan Base64 valid'; } };
  }},
{ id:'url-encode', cat:'encode', title:'URL Encode/Decode', desc:'Konversi teks untuk parameter URL',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="ue-in" placeholder="Teks/URL..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="ue-enc" style="flex:1;">Encode →</button><button class="tool-btn ghost" id="ue-dec" style="flex:1;">← Decode</button></div><textarea class="tool-input" id="ue-out"></textarea>`;
    root.querySelector('#ue-enc').onclick = () => root.querySelector('#ue-out').value = encodeURIComponent(root.querySelector('#ue-in').value);
    root.querySelector('#ue-dec').onclick = () => { try { root.querySelector('#ue-out').value = decodeURIComponent(root.querySelector('#ue-in').value); } catch(e){ root.querySelector('#ue-out').value='Format tidak valid'; } };
  }},
{ id:'html-entity', cat:'encode', title:'HTML Entity Encode/Decode', desc:'Amankan teks untuk ditampilkan di HTML',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="he-in" placeholder="Teks/HTML..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="he-enc" style="flex:1;">Encode →</button><button class="tool-btn ghost" id="he-dec" style="flex:1;">← Decode</button></div><textarea class="tool-input" id="he-out"></textarea>`;
    root.querySelector('#he-enc').onclick = () => root.querySelector('#he-out').value = CU.esc(root.querySelector('#he-in').value);
    root.querySelector('#he-dec').onclick = () => { const d=document.createElement('textarea'); d.innerHTML=root.querySelector('#he-in').value; root.querySelector('#he-out').value = d.value; };
  }},
{ id:'text-binary', cat:'encode', title:'Teks ⇄ Biner', desc:'Konversi teks ke kode biner dan sebaliknya',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="tb-in" placeholder="Teks atau biner..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="tb-enc" style="flex:1;">Teks → Biner</button><button class="tool-btn ghost" id="tb-dec" style="flex:1;">Biner → Teks</button></div><textarea class="tool-input" id="tb-out"></textarea>`;
    root.querySelector('#tb-enc').onclick = () => root.querySelector('#tb-out').value = [...root.querySelector('#tb-in').value].map(c=>c.charCodeAt(0).toString(2).padStart(8,'0')).join(' ');
    root.querySelector('#tb-dec').onclick = () => { try { root.querySelector('#tb-out').value = root.querySelector('#tb-in').value.trim().split(/\s+/).map(b=>String.fromCharCode(parseInt(b,2))).join(''); } catch(e){ root.querySelector('#tb-out').value='Format biner tidak valid'; } };
  }},
{ id:'text-hex', cat:'encode', title:'Teks ⇄ Hex', desc:'Konversi teks ke heksadesimal dan sebaliknya',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="th-in" placeholder="Teks atau hex..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="th-enc" style="flex:1;">Teks → Hex</button><button class="tool-btn ghost" id="th-dec" style="flex:1;">Hex → Teks</button></div><textarea class="tool-input" id="th-out"></textarea>`;
    root.querySelector('#th-enc').onclick = () => root.querySelector('#th-out').value = [...root.querySelector('#th-in').value].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(' ');
    root.querySelector('#th-dec').onclick = () => { try { root.querySelector('#th-out').value = root.querySelector('#th-in').value.trim().split(/\s+/).map(h=>String.fromCharCode(parseInt(h,16))).join(''); } catch(e){ root.querySelector('#th-out').value='Format hex tidak valid'; } };
  }},
{ id:'text-morse', cat:'encode', title:'Teks ⇄ Kode Morse', desc:'Konversi teks ke kode morse dan sebaliknya',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="tm2-in" placeholder="Teks atau .-- / morse..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="tm2-enc" style="flex:1;">Teks → Morse</button><button class="tool-btn ghost" id="tm2-dec" style="flex:1;">Morse → Teks</button></div><textarea class="tool-input" id="tm2-out"></textarea>`;
    root.querySelector('#tm2-enc').onclick = () => root.querySelector('#tm2-out').value = root.querySelector('#tm2-in').value.toUpperCase().split(' ').map(w=>[...w].map(c=>MORSE_MAP[c]||'').join(' ')).join(' / ');
    root.querySelector('#tm2-dec').onclick = () => root.querySelector('#tm2-out').value = root.querySelector('#tm2-in').value.split(' / ').map(w=>w.trim().split(' ').map(c=>MORSE_REV[c]||'').join('')).join(' ');
  }},
{ id:'case-converter', cat:'encode', title:'Case Converter', desc:'UPPER, lower, Title, camel, snake, kebab',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="cc-in" placeholder="Teks..."></textarea><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;"><button class="tool-btn ghost" data-m="upper">UPPERCASE</button><button class="tool-btn ghost" data-m="lower">lowercase</button><button class="tool-btn ghost" data-m="title">Title Case</button><button class="tool-btn ghost" data-m="camel">camelCase</button><button class="tool-btn ghost" data-m="snake">snake_case</button><button class="tool-btn ghost" data-m="kebab">kebab-case</button></div><textarea class="tool-input" id="cc-out"></textarea>`;
    const words = (s) => s.trim().split(/[\s_\-]+/).filter(Boolean);
    const conv = { upper:s=>s.toUpperCase(), lower:s=>s.toLowerCase(), title:s=>words(s).map(w=>w[0].toUpperCase()+w.slice(1).toLowerCase()).join(' '),
      camel:s=>{const w=words(s); return w.map((x,i)=>i===0?x.toLowerCase():x[0].toUpperCase()+x.slice(1).toLowerCase()).join('');},
      snake:s=>words(s).map(w=>w.toLowerCase()).join('_'), kebab:s=>words(s).map(w=>w.toLowerCase()).join('-') };
    root.querySelectorAll('[data-m]').forEach(btn => btn.onclick = () => root.querySelector('#cc-out').value = conv[btn.dataset.m](root.querySelector('#cc-in').value));
  }},
{ id:'csv-json', cat:'encode', title:'CSV ⇄ JSON', desc:'Konversi data tabel antara CSV dan JSON',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="cj-in" placeholder="CSV atau JSON..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="cj-enc" style="flex:1;">CSV → JSON</button><button class="tool-btn ghost" id="cj-dec" style="flex:1;">JSON → CSV</button></div><textarea class="tool-input" id="cj-out"></textarea>`;
    root.querySelector('#cj-enc').onclick = () => { try { const lines = root.querySelector('#cj-in').value.trim().split('\n').map(l=>l.split(',')); const headers = lines[0]; const rows = lines.slice(1).map(l => Object.fromEntries(headers.map((h,i)=>[h.trim(), (l[i]||'').trim()]))); root.querySelector('#cj-out').value = JSON.stringify(rows, null, 2); } catch(e){ root.querySelector('#cj-out').value='CSV tidak valid'; } };
    root.querySelector('#cj-dec').onclick = () => { try { const arr = JSON.parse(root.querySelector('#cj-in').value); if (!Array.isArray(arr) || !arr.length) throw 0; const headers = Object.keys(arr[0]); const csv = [headers.join(',')].concat(arr.map(o=>headers.map(h=>o[h]).join(','))).join('\n'); root.querySelector('#cj-out').value = csv; } catch(e){ root.querySelector('#cj-out').value='JSON tidak valid (harus array of objects)'; } };
  }},

// ===== DEV TOOLS =====
{ id:'json-formatter', cat:'dev', title:'JSON Formatter & Validator', desc:'Rapikan, validasi, atau minify JSON',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="jf-in" placeholder='{"key":"value"}'></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="jf-fmt" style="flex:1;">Format</button><button class="tool-btn ghost" id="jf-min" style="flex:1;">Minify</button></div><textarea class="tool-input" id="jf-out" style="font-family:monospace;"></textarea>`;
    root.querySelector('#jf-fmt').onclick = () => { try { root.querySelector('#jf-out').value = JSON.stringify(JSON.parse(root.querySelector('#jf-in').value), null, 2); } catch(e){ root.querySelector('#jf-out').value='JSON tidak valid: '+e.message; } };
    root.querySelector('#jf-min').onclick = () => { try { root.querySelector('#jf-out').value = JSON.stringify(JSON.parse(root.querySelector('#jf-in').value)); } catch(e){ root.querySelector('#jf-out').value='JSON tidak valid: '+e.message; } };
  }},
{ id:'regex-tester', cat:'dev', title:'Regex Tester', desc:'Uji pola regex langsung terhadap teks',
  render(root){
    root.innerHTML = `<div class="tool-row" style="margin-bottom:10px;"><input class="tool-input" id="rx-pat" placeholder="pattern, mis: \\d+"><input class="tool-input" id="rx-flags" placeholder="flags" style="max-width:70px;" value="g"></div><textarea class="tool-input" id="rx-text" placeholder="Teks untuk diuji..."></textarea><div class="tool-result" id="rx-result">-</div>`;
    const run = () => {
      const pat = root.querySelector('#rx-pat').value, flags = root.querySelector('#rx-flags').value, text = root.querySelector('#rx-text').value;
      const res = root.querySelector('#rx-result'); if (!pat) { res.innerText='Masukkan pattern.'; return; }
      try { const g = flags.includes('g') ? flags : flags+'g'; const matches = [...text.matchAll(new RegExp(pat, g))];
        res.innerHTML = matches.length ? `${matches.length} match ditemukan:<br>` + matches.slice(0,30).map(m=>`• "${CU.esc(m[0])}" @${m.index}`).join('<br>') : 'Tidak ada match.';
      } catch(e){ res.innerText = 'Regex tidak valid: '+e.message; }
    };
    root.querySelector('#rx-pat').oninput = run; root.querySelector('#rx-flags').oninput = run; root.querySelector('#rx-text').oninput = run;
  }},
{ id:'text-diff', cat:'dev', title:'Text Diff Checker', desc:'Bandingkan dua teks, lihat baris yang berubah',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="d-a" placeholder="Teks A (asli)..." style="min-height:60px;"></textarea><textarea class="tool-input" id="d-b" placeholder="Teks B (baru)..." style="min-height:60px;"></textarea><button class="tool-btn" id="d-run" style="width:100%;">Bandingkan</button><div class="tool-result" id="d-out" style="font-family:monospace;font-size:11px;"></div>`;
    root.querySelector('#d-run').onclick = () => {
      const diffs = diffLines(root.querySelector('#d-a').value, root.querySelector('#d-b').value);
      root.querySelector('#d-out').innerHTML = diffs.map(([type,line]) => { const color = type==='add'?'var(--neon-green)':type==='del'?'var(--neon-pink)':'var(--text-sub)'; const prefix = type==='add'?'+ ':type==='del'?'- ':'  '; return `<div style="color:${color};">${prefix}${CU.esc(line)}</div>`; }).join('');
    };
  }},
{ id:'uuid-generator', cat:'dev', title:'UUID Generator', desc:'Buat UUID v4 acak, banyak sekaligus',
  render(root){
    root.innerHTML = `<div class="tool-row" style="margin-bottom:10px;"><input class="tool-input" id="uu-count" type="number" value="5" min="1" max="50"><button class="tool-btn" id="uu-btn">Generate</button></div><textarea class="tool-input" id="uu-out" style="font-family:monospace;min-height:140px;"></textarea>`;
    const gen = () => { const n = Math.min(50, Math.max(1, parseInt(root.querySelector('#uu-count').value)||1)); root.querySelector('#uu-out').value = Array.from({length:n}, ()=>crypto.randomUUID()).join('\n'); };
    root.querySelector('#uu-btn').onclick = gen; gen();
  }},
{ id:'timestamp-converter', cat:'dev', title:'Timestamp Converter', desc:'Konversi Unix timestamp ↔ tanggal',
  render(root){
    root.innerHTML = `<label style="font-size:10px;color:var(--text-sub);">Unix Timestamp</label><input class="tool-input" id="ts-unix" placeholder="mis: 1700000000"><label style="font-size:10px;color:var(--text-sub);">atau Tanggal</label><input class="tool-input" id="ts-date" type="datetime-local"><button class="tool-btn" id="ts-now" style="width:100%;margin-bottom:10px;">Gunakan Waktu Sekarang</button><div class="tool-result" id="ts-out">-</div>`;
    const show = (d) => root.querySelector('#ts-out').innerHTML = `Unix: ${Math.floor(d.getTime()/1000)}<br>ISO: ${d.toISOString()}<br>Lokal: ${d.toLocaleString('id-ID')}`;
    root.querySelector('#ts-unix').oninput = (e) => { if (e.target.value) show(new Date(parseInt(e.target.value)*1000)); };
    root.querySelector('#ts-date').oninput = (e) => { if (e.target.value) show(new Date(e.target.value)); };
    root.querySelector('#ts-now').onclick = () => show(new Date());
  }},
{ id:'lorem-ipsum', cat:'dev', title:'Lorem Ipsum Generator', desc:'Buat teks placeholder untuk desain/konten',
  render(root){
    const words = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(' ');
    root.innerHTML = `<div class="tool-row" style="margin-bottom:10px;"><input class="tool-input" id="li-count" type="number" value="3" min="1" max="20"><button class="tool-btn" id="li-btn">Generate</button></div><textarea class="tool-input" id="li-out" style="min-height:160px;"></textarea>`;
    const gen = () => { const n = Math.min(20, Math.max(1, parseInt(root.querySelector('#li-count').value)||1)); const paras = [];
      for (let p=0;p<n;p++){ let s=[]; const len = 40+Math.floor(Math.random()*30); for (let i=0;i<len;i++) s.push(words[Math.floor(Math.random()*words.length)]); let str = s.join(' '); str = str[0].toUpperCase()+str.slice(1)+'.'; paras.push(str); }
      root.querySelector('#li-out').value = paras.join('\n\n'); };
    root.querySelector('#li-btn').onclick = gen; gen();
  }},
{ id:'markdown-preview', cat:'dev', title:'Markdown Previewer', desc:'Tulis Markdown, lihat hasil render-nya',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="md-in" placeholder="# Judul&#10;**tebal** _miring_&#10;- item list" style="min-height:120px;"></textarea><div class="tool-result" id="md-out" style="min-height:80px;"></div>`;
    root.querySelector('#md-in').oninput = (e) => root.querySelector('#md-out').innerHTML = mdToHtml(e.target.value) || '<span style="color:#555">Preview muncul di sini...</span>';
  }},
{ id:'word-counter', cat:'dev', title:'Word/Character Counter', desc:'Hitung kata, karakter, dan kalimat',
  render(root){
    root.innerHTML = `<textarea class="tool-input" id="wc-in" placeholder="Ketik atau tempel teks..." style="min-height:140px;"></textarea><div class="tool-result" id="wc-out">Kata: 0 • Karakter: 0 • Kalimat: 0</div>`;
    root.querySelector('#wc-in').oninput = (e) => { const t = e.target.value; const words = t.trim()?t.trim().split(/\s+/).length:0; const chars = t.length; const sentences = (t.match(/[.!?]+/g)||[]).length; root.querySelector('#wc-out').innerText = `Kata: ${words} • Karakter: ${chars} • Kalimat: ${sentences}`; };
  }},

// ===== NETWORK & PRIVACY =====
{ id:'my-connection', cat:'network', title:'Info Koneksi Saya', desc:'Lihat apa yang bisa website lihat tentang koneksimu',
  render(root){
    root.innerHTML = `<div class="tool-result" id="mc-out">Mengambil info...</div><p class="tool-note">Menampilkan info koneksimu sendiri — bukan untuk melacak orang lain.</p>`;
    (async () => { const out = root.querySelector('#mc-out'); let ipInfo = 'Gagal memuat IP publik.';
      try { const r = await fetch('https://api.ipify.org?format=json'); const j = await r.json(); ipInfo = `IP Publik: ${j.ip}`; } catch(e){}
      out.innerHTML = `${ipInfo}<br>Browser: ${CU.esc(navigator.userAgent)}<br>Bahasa: ${navigator.language}<br>Platform: ${navigator.platform||'-'}<br>Resolusi Layar: ${screen.width}x${screen.height}<br>Online: ${navigator.onLine?'Ya':'Tidak'}`;
    })();
  }},
{ id:'latency-monitor', cat:'network', title:'Monitor Latency Jaringan', desc:'Ukur kecepatan respons ke server populer',
  render(root){
    root.innerHTML = `<div class="tool-result" id="lm-out">Mengukur...</div><button class="tool-btn ghost" id="lm-refresh" style="width:100%;margin-top:10px;">Ukur Ulang</button>`;
    const targets = [['Cloudflare','https://cloudflare.com/favicon.ico'],['Google','https://www.google.com/favicon.ico']];
    const run = async () => { const out = root.querySelector('#lm-out'); out.innerHTML = 'Mengukur...'; const results = [];
      for (const [name,url] of targets) { const start = performance.now(); try { await fetch(url+'?t='+Date.now(), {mode:'no-cors',cache:'no-store'}); results.push(`${name}: ${Math.round(performance.now()-start)}ms`); } catch(e){ results.push(`${name}: timeout`); } }
      out.innerHTML = results.join('<br>'); };
    root.querySelector('#lm-refresh').onclick = run; run();
  }},
{ id:'temp-mail', cat:'network', title:'Email Sementara', desc:'Dapatkan alamat email sekali pakai untuk testing',
  render(root){
    root.innerHTML = `<div class="tool-result" id="tm-addr">Membuat alamat...</div><button class="tool-btn ghost" id="tm-refresh" style="width:100%;margin:10px 0;">Cek Inbox</button><div id="tm-inbox"></div><p class="tool-note">Layanan pihak ketiga (1secmail) untuk testing/privasi — jangan gunakan untuk akun penting.</p>`;
    let mailbox = '';
    (async () => { try { const r = await fetch('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1'); const [addr] = await r.json(); mailbox = addr; root.querySelector('#tm-addr').innerHTML = `📧 <b>${addr}</b>`; } catch(e){ root.querySelector('#tm-addr').innerText = 'Layanan tidak tersedia saat ini.'; } })();
    root.querySelector('#tm-refresh').onclick = async () => { if (!mailbox) return; const [login,domain] = mailbox.split('@'); const inboxEl = root.querySelector('#tm-inbox'); inboxEl.innerHTML = 'Memuat...';
      try { const r = await fetch(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`); const msgs = await r.json(); inboxEl.innerHTML = msgs.length ? msgs.map(m=>`<div class="tool-result">Dari: ${CU.esc(m.from)}<br>Subjek: ${CU.esc(m.subject)}</div>`).join('') : '<p style="font-size:11px;color:var(--text-sub);">Inbox kosong.</p>'; } catch(e){ inboxEl.innerHTML = 'Gagal memuat inbox.'; } };
  }},

// ===== EXTRA =====
{ id:'classic-cipher', cat:'extra', title:'Cipher Klasik', desc:'Caesar, ROT13, dan Vigenère cipher',
  render(root){
    root.innerHTML = `<select class="tool-input" id="cc2-type"><option value="caesar">Caesar Cipher</option><option value="rot13">ROT13</option><option value="vigenere">Vigenère Cipher</option></select><input class="tool-input" id="cc2-key" placeholder="Shift (angka) atau kata kunci"><textarea class="tool-input" id="cc2-in" placeholder="Teks..."></textarea><div style="display:flex;gap:8px;margin-bottom:10px;"><button class="tool-btn" id="cc2-enc" style="flex:1;">Enkripsi</button><button class="tool-btn ghost" id="cc2-dec" style="flex:1;">Dekripsi</button></div><textarea class="tool-input" id="cc2-out"></textarea>`;
    const caesar = (s, shift) => s.replace(/[a-zA-Z]/g, c => { const base = c<'a'?65:97; return String.fromCharCode((c.charCodeAt(0)-base+shift+26)%26+base); });
    const vigenere = (s, key, decrypt) => { let ki=0; return s.replace(/[a-zA-Z]/g, c => { const base = c<'a'?65:97; const k = key[ki%key.length].toLowerCase().charCodeAt(0)-97; ki++; const shift = decrypt?-k:k; return String.fromCharCode((c.charCodeAt(0)-base+shift+26)%26+base); }); };
    const run = (decrypt) => { const type = root.querySelector('#cc2-type').value, key = root.querySelector('#cc2-key').value, text = root.querySelector('#cc2-in').value; let out = '';
      if (type==='rot13') out = caesar(text, decrypt?-13:13);
      else if (type==='caesar') out = caesar(text, (decrypt?-1:1) * (parseInt(key)||3));
      else if (type==='vigenere') out = key ? vigenere(text, key, decrypt) : 'Masukkan kata kunci.';
      root.querySelector('#cc2-out').value = out; };
    root.querySelector('#cc2-enc').onclick = () => run(false); root.querySelector('#cc2-dec').onclick = () => run(true);
  }},
{ id:'random-generator', cat:'extra', title:'Generator Angka Acak', desc:'Angka acak aman dalam rentang tertentu',
  render(root){
    root.innerHTML = `<div class="tool-row" style="margin-bottom:10px;"><input class="tool-input" id="rg-min" type="number" value="1" placeholder="Min"><input class="tool-input" id="rg-max" type="number" value="100" placeholder="Max"></div><button class="tool-btn" id="rg-btn" style="width:100%;">Generate Angka Acak</button><div class="tool-result" id="rg-out" style="text-align:center;font-size:22px;font-weight:800;">-</div>`;
    root.querySelector('#rg-btn').onclick = () => { const min = parseInt(root.querySelector('#rg-min').value)||0, max = parseInt(root.querySelector('#rg-max').value)||100; root.querySelector('#rg-out').innerText = CU.randInt(Math.min(min,max), Math.max(min,max)); };
  }},
{ id:'color-converter', cat:'extra', title:'Konverter Warna', desc:'HEX ⇄ RGB ⇄ HSL dengan color picker',
  render(root){
    root.innerHTML = `<input class="tool-input" id="col-pick" type="color" value="#00f3ff" style="height:48px;padding:4px;"><div class="tool-result" id="col-out">-</div>`;
    const update = (hex) => { const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
      const max=Math.max(r,g,b)/255, min=Math.min(r,g,b)/255; const l=(max+min)/2; let h=0,s=0; const d=max-min;
      if (d) { s = d/(1-Math.abs(2*l-1)); const rr=r/255,gg=g/255,bb=b/255; if (max===rr) h=((gg-bb)/d)%6; else if (max===gg) h=(bb-rr)/d+2; else h=(rr-gg)/d+4; h*=60; if (h<0) h+=360; }
      root.querySelector('#col-out').innerHTML = `HEX: ${hex.toUpperCase()}<br>RGB: rgb(${r}, ${g}, ${b})<br>HSL: hsl(${Math.round(h)}, ${Math.round(s*100)}%, ${Math.round(l*100)}%)`; };
    root.querySelector('#col-pick').oninput = (e) => update(e.target.value); update('#00f3ff');
  }},

// ===== GAMES =====
{ id:'reaction-test', cat:'game', title:'Tes Kecepatan Reaksi', desc:'Klik secepat mungkin saat kotak berubah hijau',
  render(root){
    root.innerHTML = `<div id="rt-box" style="height:160px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;background:var(--card-bg-2);border:1px solid var(--card-border);cursor:pointer;text-align:center;padding:16px;user-select:none;">Tekan untuk mulai</div><div class="tool-result" id="rt-result" style="text-align:center;">Rekor terbaik: -</div>`;
    const box = root.querySelector('#rt-box'), resultEl = root.querySelector('#rt-result');
    let state = 'idle', startTime = 0, timeoutId = null, best = Infinity;
    const setBox = (bg, text, color) => { box.style.background = bg; box.innerText = text; box.style.color = color || ''; };
    box.onclick = () => {
      if (state === 'idle') {
        state = 'waiting'; setBox('#ff0055', 'Tunggu warna hijau...', '#fff');
        timeoutId = setTimeout(() => { state = 'ready'; startTime = performance.now(); setBox('#00ff66', 'KLIK SEKARANG!', '#000'); }, 1500 + Math.random()*2500);
      } else if (state === 'waiting') {
        clearTimeout(timeoutId); state = 'idle'; setBox('var(--card-bg-2)', 'Terlalu cepat! Tekan untuk coba lagi', '');
      } else if (state === 'ready') {
        const rt = Math.round(performance.now() - startTime);
        if (rt < best) best = rt;
        state = 'idle'; setBox('var(--card-bg-2)', 'Tekan untuk mulai lagi', '');
        resultEl.innerHTML = `Waktu reaksi: <b style="color:var(--neon-cyan)">${rt}ms</b><br>Rekor terbaik: <b style="color:var(--neon-green)">${best}ms</b>`;
      }
    };
    ToolRuntime.cleanup = () => { if (timeoutId) clearTimeout(timeoutId); };
  }},
{ id:'typing-test', cat:'game', title:'Tes Kecepatan Mengetik', desc:'Ukur kecepatan (WPM) dan akurasi mengetikmu',
  render(root){
    const sentences = [
      'keamanan siber dimulai dari password yang kuat dan kebiasaan digital yang baik',
      'jangan pernah membagikan kode otp kepada siapa pun termasuk yang mengaku admin',
      'selalu perbarui perangkat lunak untuk menutup celah keamanan yang diketahui',
      'enkripsi mengubah data menjadi kode yang hanya bisa dibaca dengan kunci yang tepat',
      'waspada terhadap tautan mencurigakan yang dikirim lewat pesan atau email'
    ];
    const renderGame = () => {
      const target = sentences[Math.floor(Math.random()*sentences.length)];
      root.innerHTML = `<div class="tool-result" style="font-size:13px;line-height:1.6;">${CU.esc(target)}</div><textarea class="tool-input" id="tt-input" placeholder="Mulai ketik di sini untuk memulai..." style="margin-top:10px;min-height:80px;" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea><div class="tool-result" id="tt-result">Waktu: 0.0s • WPM: 0 • Akurasi: 100%</div><button class="tool-btn ghost" id="tt-restart" style="width:100%;margin-top:8px;">Acak Ulang</button>`;
      const input = root.querySelector('#tt-input'), resultEl = root.querySelector('#tt-result');
      let startTime = null, finished = false;
      input.oninput = () => {
        if (finished) return;
        if (!startTime) startTime = performance.now();
        const typed = input.value;
        let correct = 0; for (let i=0;i<typed.length;i++) if (typed[i] === target[i]) correct++;
        const accuracy = typed.length ? Math.round((correct/typed.length)*100) : 100;
        const elapsed = (performance.now() - startTime)/1000;
        const wpm = elapsed>0.1 ? Math.round((typed.trim().split(/\s+/).length / elapsed) * 60) : 0;
        resultEl.innerHTML = `Waktu: ${elapsed.toFixed(1)}s • WPM: ${wpm} • Akurasi: ${accuracy}%`;
        if (typed === target) { finished = true; resultEl.innerHTML += ' <b style="color:var(--neon-green);">✅ Selesai!</b>'; input.disabled = true; }
      };
      root.querySelector('#tt-restart').onclick = renderGame;
    };
    renderGame();
  }},
{ id:'cipher-breaker', cat:'game', title:'Pecahkan Sandi', desc:'Tebak kata asli di balik sandi Caesar, uji insting cyber-mu',
  render(root){
    const words = ['FIREWALL','ENKRIPSI','PASSWORD','JARINGAN','PROTOKOL','KEAMANAN','SERVER','PHISHING','MALWARE','BACKDOOR','GATEWAY','TROJAN','ANTIVIRUS','KRIPTOGRAFI'];
    let score = 0, word = '';
    const next = () => {
      word = words[Math.floor(Math.random()*words.length)];
      const shift = 1 + Math.floor(Math.random()*12);
      root.querySelector('#cb-encoded').innerText = [...word].map(c => String.fromCharCode((c.charCodeAt(0)-65+shift)%26+65)).join('');
      root.querySelector('#cb-shift').innerText = shift;
      root.querySelector('#cb-guess').value = ''; root.querySelector('#cb-guess').focus();
      root.querySelector('#cb-msg').innerText = ''; root.querySelector('#cb-msg').className = 'form-msg';
    };
    root.innerHTML = `<div style="text-align:center;margin-bottom:10px;">Skor: <b id="cb-score" style="color:var(--neon-green);">0</b></div>
      <div class="tool-result" style="text-align:center;font-size:20px;font-weight:800;letter-spacing:2px;" id="cb-encoded">-</div>
      <p style="font-size:11px;color:var(--text-sub);text-align:center;margin:8px 0;">Digeser <b id="cb-shift">0</b> huruf (Caesar cipher). Tebak kata aslinya:</p>
      <input class="tool-input" id="cb-guess" placeholder="Jawabanmu..." autocomplete="off" style="text-transform:uppercase;">
      <button class="tool-btn" id="cb-submit" style="width:100%;">Jawab</button>
      <div class="form-msg" id="cb-msg"></div>`;
    root.querySelector('#cb-submit').onclick = () => {
      const guess = root.querySelector('#cb-guess').value.trim().toUpperCase(), msg = root.querySelector('#cb-msg');
      if (guess === word) { score++; root.querySelector('#cb-score').innerText = score; msg.className='form-msg success'; msg.innerText='Benar! Soal berikutnya...'; setTimeout(next, 900); }
      else { msg.className='form-msg error'; msg.innerText=`Kurang tepat. Jawaban: ${word}`; setTimeout(next, 1400); }
    };
    root.querySelector('#cb-guess').onkeydown = (e) => { if (e.key==='Enter') root.querySelector('#cb-submit').click(); };
    next();
  }}
];
