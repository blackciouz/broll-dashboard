/* B-Roll Dashboard — SPA vanilla */
'use strict';
const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');
const $toast = document.getElementById('toast-root');
let TOKEN = sessionStorage.getItem('dash_token') || '';

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtSize = (n) => n == null ? '—' : n >= 1e9 ? (n / 1e9).toFixed(2) + ' Go' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' Mo' : Math.round(n / 1024) + ' Ko';
const fmtDur = (s) => s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const VIDEO_EXT = ['mp4', 'webm', 'mov'];
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const ext = (n) => (n.split('.').pop() || '').toLowerCase();
const isVideo = (n) => VIDEO_EXT.includes(ext(n));
const isImg = (n) => IMG_EXT.includes(ext(n));

function toast(msg, err) {
  const d = document.createElement('div');
  d.className = 'toast' + (err ? ' err' : '');
  d.textContent = msg;
  $toast.appendChild(d);
  setTimeout(() => d.remove(), 4200);
}
async function api(method, path, body, raw) {
  const headers = { 'X-Dash-Session': TOKEN };
  if (body !== undefined && !(body instanceof File) && !(body instanceof Blob)) headers['Content-Type'] = 'application/json';
  const r = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : (body instanceof File || body instanceof Blob || typeof body === 'string' ? body : JSON.stringify(body)) });
  if (r.status === 401 && path !== '/login') { logout(); throw new Error('session expirée'); }
  if (raw) return r;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'erreur ' + r.status);
  return data;
}
function logout() { TOKEN = ''; sessionStorage.removeItem('dash_token'); location.hash = '#/login'; route(); }

const ICONS = {
  film: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5"/></svg>',
  box: '<svg class="i" viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  search: '<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  gauge: '<svg class="i" viewBox="0 0 24 24"><path d="M12 21a9 9 0 1 1 9-9"/><path d="M12 12l5-3"/></svg>',
  key: '<svg class="i" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M11 12L21 3M17 7l3 3"/></svg>',
  play: '<svg class="i" viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>',
  dl: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  trash: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>',
  back: '<svg class="i" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  fwd: '<svg class="i" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  up: '<svg class="i" viewBox="0 0 24 24"><path d="M12 21V9M7 13l5-5 5 5M4 3h16"/></svg>',
  link: '<svg class="i" viewBox="0 0 24 24"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/></svg>',
};

// ---------- login ----------
function viewLogin() {
  $app.innerHTML = `<div class="login-wrap"><div class="login-card">
    <h1>B-Roll Dashboard</h1>
    <p class="muted small">Accès protégé — entre la clé du dashboard.</p>
    <input id="login-key" type="password" placeholder="Clé d'accès" autofocus style="width:100%">
    <div class="errline" id="login-err"></div>
    <button class="primary" id="login-btn" style="width:100%">Se connecter</button>
  </div></div>`;
  const go = async () => {
    try {
      const r = await fetch('/api/login', { method: 'POST', body: JSON.stringify({ key: document.getElementById('login-key').value }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'refusé');
      TOKEN = d.token;
      sessionStorage.setItem('dash_token', TOKEN);
      location.hash = '#/';
      route();
    } catch (e) { document.getElementById('login-err').textContent = e.message; }
  };
  document.getElementById('login-btn').onclick = go;
  document.getElementById('login-key').onkeydown = (e) => e.key === 'Enter' && go();
}

// ---------- topbar ----------
function topbar(active) {
  return `<div class="topbar">
    <span class="logo">${ICONS.film} B-Roll</span>
    <nav>
      <a data-r="#/" class="${active === 'banks' ? 'active' : ''}">${ICONS.box} Banques</a>
      <a data-r="#/search" class="${active === 'search' ? 'active' : ''}">${ICONS.search} Recherche</a>
      <a data-r="#/stats" class="${active === 'stats' ? 'active' : ''}">${ICONS.gauge} Stats</a>
      <a data-r="#/admin" class="${active === 'admin' ? 'active' : ''}">${ICONS.key} Clés</a>
    </nav>
    <button id="logout">Déconnexion</button>
  </div>`;
}
function bindTopbar() {
  $app.querySelectorAll('[data-r]').forEach((a) => a.onclick = () => location.hash = a.dataset.r);
  document.getElementById('logout').onclick = logout;
}

// ---------- banques ----------
async function viewBanks() {
  $app.innerHTML = topbar('banks') + `<div class="wrap">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <h1>Banques</h1>
      <button class="primary" id="new-bank">+ Nouvelle banque</button>
    </div>
    <div class="toolbar"><input id="f-q" placeholder="Filtrer par nom / description…" style="flex:1;max-width:420px">
      <select id="f-keep"><option value="">keep : tous</option><option value="1">permanentes</option><option value="0">temporaires</option></select></div>
    <div class="card-grid" id="grid"></div>
    <div class="empty" id="empty" style="display:none">Aucune banque.</div>
  </div>`;
  bindTopbar();
  const banks = (await api('GET', '/v1/banks')).banques;
  const draw = () => {
    const q = document.getElementById('f-q').value.toLowerCase();
    const kp = document.getElementById('f-keep').value;
    const list = banks.filter((b) => (!q || (b.name + ' ' + b.desc).toLowerCase().includes(q)) && (kp === '' || String(b.keep ? 1 : 0) === kp));
    document.getElementById('grid').innerHTML = list.map((b) => {
      const isLib = b.name.startsWith('lib-');
      const exp = b.expires_at ? new Date(b.expires_at) : null;
      const expSoon = exp && exp - Date.now() < 30 * 864e5;
      return `<div class="bank-card" data-b="${esc(b.name)}">
        <div class="name">${ICONS.box} ${esc(b.name)} ${isLib ? '<span class="badge lib">bibliothèque</span>' : (b.keep ? '<span class="badge keep">keep</span>' : (expSoon ? `<span class="badge expiring">expire ${exp.toLocaleDateString('fr-FR')}</span>` : '<span class="badge">temporaire</span>'))}</div>
        <div class="muted small" style="margin-top:6px">${esc(b.desc || '(sans description)')}</div>
        <div class="kv"><span class="v">mise à jour</span><span>${fmtDate(b.updated_at)}</span></div>
        <div class="kv"><span class="v">expiration</span><span>${b.expires_at ? fmtDate(b.expires_at) : 'jamais'}</span></div>
      </div>`;
    }).join('') || '';
    document.getElementById('empty').style.display = list.length ? 'none' : '';
    $app.querySelectorAll('[data-b]').forEach((c) => c.onclick = () => location.hash = '#/bank/' + c.dataset.b);
  };
  document.getElementById('f-q').oninput = draw;
  document.getElementById('f-keep').onchange = draw;
  draw();
  document.getElementById('new-bank').onclick = () => modalNewBank();
}

function modalNewBank() {
  $modal.innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:460px">
    <h2>Nouvelle banque</h2>
    <p class="small muted">Nom : a-z, 0-9, tirets. La description est obligatoire.</p>
    <input id="nb-name" placeholder="nom (ex. itg-borneo-261107)" style="width:100%">
    <input id="nb-desc" placeholder="description (niche — sujet — sources)" style="width:100%;margin-top:8px">
    <label class="small" style="display:block;margin-top:8px"><input type="checkbox" id="nb-keep"> keep (jamais purgée)</label>
    <div class="errline" id="nb-err"></div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="primary" id="nb-ok">Créer</button><button id="nb-cancel">Annuler</button></div>
  </div></div>`;
  document.getElementById('nb-cancel').onclick = () => $modal.innerHTML = '';
  document.getElementById('nb-ok').onclick = async () => {
    try {
      await api('POST', '/v1/banks', { name: document.getElementById('nb-name').value.trim().toLowerCase(), desc: document.getElementById('nb-desc').value.trim(), keep: document.getElementById('nb-keep').checked });
      $modal.innerHTML = '';
      toast('Banque créée');
      route();
    } catch (e) { document.getElementById('nb-err').textContent = e.message; }
  };
}

// ---------- vue banque ----------
let state = { sel: new Set(), files: [], bank: null, filters: {} };

async function viewBank(name, tab) {
  tab = tab || 'files';
  const bank = await api('GET', '/v1/banks/' + name);
  state = { sel: new Set(), files: bank.fichiers || [], bank, filters: state.filters || {} };
  const isLib = name.startsWith('lib-');
  $app.innerHTML = topbar('banks') + `<div class="wrap">
    <a class="muted small" data-back style="cursor:pointer">${ICONS.back} Toutes les banques</a>
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <h1 style="margin:8px 0">${esc(name)} ${isLib ? '<span class="badge lib">bibliothèque</span>' : (bank.keep ? '<span class="badge keep">keep</span>' : '')}</h1>
      <div class="row-actions">
        <button id="b-keep">${bank.keep ? 'Rendre temporaire' : 'Marquer keep'}</button>
        <button id="b-upload">${ICONS.up} Uploader</button>
        <button class="danger" id="b-delete">Supprimer la banque</button>
      </div>
    </div>
    <div class="muted small">${esc(bank.desc || '')}</div>
    <div class="kv" style="max-width:520px"><span class="v">${bank.nb_fichiers} fichiers · ${fmtSize(bank.taille_octets)} · ${bank.nb_livrables} livrables · mise à jour ${fmtDate(bank.updated_at)} · expire ${bank.expires_at ? fmtDate(bank.expires_at) : 'jamais'}</span></div>
    <div class="tabs"><a data-t="files" class="${tab === 'files' ? 'active' : ''}">Fichiers (${bank.nb_fichiers})</a><a data-t="deliverables" class="${tab === 'deliverables' ? 'active' : ''}">Livrables (${bank.nb_livrables})</a></div>
    <div id="tab-content"></div>
  </div>`;
  bindTopbar();
  $app.querySelector('[data-back]').onclick = () => location.hash = '#/';
  $app.querySelectorAll('[data-t]').forEach((a) => a.onclick = () => { location.hash = `#/bank/${name}${a.dataset.t === 'deliverables' ? '/deliverables' : ''}`; });
  document.getElementById('b-keep').onclick = async () => { await api('PATCH', '/v1/banks/' + name, { keep: !bank.keep }); toast('Mis à jour'); route(); };
  document.getElementById('b-delete').onclick = async () => {
    if (!confirm(`Supprimer TOUTE la banque "${name}" ? (définitif)`)) return;
    try { await api('DELETE', '/v1/banks/' + name); toast('Banque supprimée'); location.hash = '#/'; }
    catch (e) { toast(e.message, true); }
  };
  document.getElementById('b-upload').onclick = () => modalUpload(name);
  if (tab === 'deliverables') viewDeliverables(name); else viewFiles(name);
}

function viewFiles(name) {
  const c = document.getElementById('tab-content');
  const files = state.files;
  const media = files.filter((f) => isVideo(f.nom) || isImg(f.nom));
  const others = files.filter((f) => !isVideo(f.nom) && !isImg(f.nom));
  c.innerHTML = `
    <div class="toolbar">
      <input id="fl-q" placeholder="Filtrer (nom, desc)…" style="flex:1;max-width:320px">
      <select id="fl-chap"><option value="">chapitre : tous</option>${[...new Set(media.map((f) => f.chapitre).filter(Boolean))].map((ch) => `<option>${esc(ch)}</option>`).join('')}</select>
      <select id="fl-kind"><option value="">type : tous</option><option value="video">vidéos</option><option value="img">images</option></select>
      <select id="fl-sort"><option value="nom">tri : nom</option><option value="mv">tri : mouvement</option><option value="date">tri : date</option></select>
      <button id="sel-all">Tout sélectionner</button>
      <button id="sel-none">Désélectionner</button>
    </div>
    <div class="grid" id="grid"></div>
    ${others.length ? `<h2 style="margin-top:22px">Autres fichiers</h2><table><tbody>${others.map((f) => `<tr><td>${esc(f.nom)}</td><td class="muted">${fmtSize(f.taille_octets)}</td><td>${f.desc ? esc(f.desc) : ''}</td><td><a href="/api/v1/banks/${name}/files/${esc(f.nom)}/raw?session=${TOKEN}" target="_blank">ouvrir</a></td></tr>`).join('')}</tbody></table>` : ''}
    <div class="batchbar" id="batchbar" style="display:none"></div>`;
  const draw = () => {
    const q = (document.getElementById('fl-q').value || '').toLowerCase();
    const chap = document.getElementById('fl-chap').value;
    const kind = document.getElementById('fl-kind').value;
    const sort = document.getElementById('fl-sort').value;
    let list = media.filter((f) =>
      (!q || (f.nom + ' ' + (f.desc || '')).toLowerCase().includes(q)) &&
      (!chap || f.chapitre === chap) &&
      (!kind || (kind === 'video' ? isVideo(f.nom) : isImg(f.nom))));
    if (sort === 'mv') list = [...list].sort((a, b) => (b.mv || 0) - (a.mv || 0));
    else if (sort === 'date') list = [...list].sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
    document.getElementById('grid').innerHTML = list.map((f) => {
      const thumbNom = 'thumb_' + f.nom.replace(/\.[^.]+$/, '') + '.jpg';
      const hasThumb = files.some((x) => x.nom === thumbNom);
      const src = hasThumb ? `/api/v1/banks/${name}/files/${thumbNom}/raw?session=${TOKEN}` : null;
      return `<div class="tile ${state.sel.has(f.nom) ? 'selected' : ''}" data-n="${esc(f.nom)}">
        <input type="checkbox" class="sel" ${state.sel.has(f.nom) ? 'checked' : ''}>
        ${src ? `<img loading="lazy" src="${src}" onerror="this.outerHTML='<div class=\\'ph\\'>${ICONS.film}</div>'">` : `<div class="ph">${ICONS.film}</div>`}
        ${f.dur_s ? `<span class="dur">${fmtDur(f.dur_s)}</span>` : ''}
        <div class="lbl" title="${esc(f.desc)}">${esc(f.desc || f.nom)}</div>
      </div>`;
    }).join('');
    bindTiles(name, list);
    drawBatch();
  };
  const bindTiles = (bankName, list) => {
    c.querySelectorAll('.tile').forEach((t) => {
      const nom = t.dataset.n;
      t.querySelector('.sel').onclick = (e) => { e.stopPropagation(); toggleSel(nom); };
      t.onclick = (e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) { toggleSel(nom); } else openPlayer(bankName, list, nom); };
    });
  };
  const toggleSel = (nom) => { state.sel.has(nom) ? state.sel.delete(nom) : state.sel.add(nom); syncSelection(); };
  const syncSelection = () => {
    c.querySelectorAll('.tile').forEach((t) => t.classList.toggle('selected', state.sel.has(t.dataset.n)));
    c.querySelectorAll('.tile .sel').forEach((cb) => cb.checked = state.sel.has(cb.closest('.tile').dataset.n));
    drawBatch();
  };
  const drawBatch = () => {
    const bar = document.getElementById('batchbar');
    const n = state.sel.size;
    bar.style.display = n ? 'flex' : 'none';
    if (!n) return;
    bar.innerHTML = `<strong>${n} sélectionné(s)</strong>
      <button id="ba-zip">${ICONS.dl} Zip</button>
      <button id="ba-keep">Marquer keep</button>
      <button id="ba-unkeep">Retirer keep</button>
      <button class="danger" id="ba-del">${ICONS.trash} Supprimer</button>
      <span class="muted small">Ctrl/Shift+clic : sélection multiple</span>`;
    bar.querySelector('#ba-zip').onclick = () => { location.href = `/api/zip?bank=${name}&files=${[...state.sel].join(',')}&session=${TOKEN}`; };
    bar.querySelector('#ba-keep').onclick = () => batchKeep(name, true);
    bar.querySelector('#ba-unkeep').onclick = () => batchKeep(name, false);
    bar.querySelector('#ba-del').onclick = () => batchDelete(name);
  };
  async function batchKeep(bank, keep) {
    for (const nom of state.sel) { try { await api('PATCH', `/v1/banks/${bank}/files/${nom}`, { keep }); } catch (e) { toast(nom + ' : ' + e.message, true); } }
    toast('Keep mis à jour'); route();
  }
  async function batchDelete(bank) {
    if (!confirm(`Supprimer ${state.sel.size} fichier(s) ? (définitif)`)) return;
    let ok = 0;
    for (const nom of state.sel) { try { await api('DELETE', `/v1/banks/${bank}/files/${nom}`); ok++; } catch (e) { toast(nom + ' : ' + e.message, true); } }
    toast(ok + ' fichier(s) supprimé(s)');
    state.sel.clear();
    route();
  }
  ['fl-q', 'fl-chap', 'fl-kind', 'fl-sort'].forEach((id) => { const el = document.getElementById(id); el.oninput = draw; el.onchange = draw; });
  document.getElementById('sel-all').onclick = () => { media.forEach((f) => state.sel.add(f.nom)); syncSelection(); };
  document.getElementById('sel-none').onclick = () => { state.sel.clear(); syncSelection(); };
  draw();
}

function viewDeliverables(name) {
  const c = document.getElementById('tab-content');
  const d = api('GET', `/v1/banks/${name}/deliverables`).then((r) => {
    const list = r.livrables || [];
    c.innerHTML = list.length ? `<table><thead><tr><th>Nom</th><th>Taille</th><th>SHA-256</th><th>Créé</th><th>Keep</th><th>Actions</th></tr></thead><tbody>
      ${list.map((f) => `<tr><td>${esc(f.nom)}</td><td>${fmtSize(f.taille_octets)}</td><td class="muted small">${esc((f.sha256 || '').slice(0, 12))}…</td><td>${fmtDate(f.created_at)}</td><td>${f.keep ? 'oui' : 'non'}</td>
      <td class="row-actions"><a href="/api/v1/banks/${name}/deliverables/${esc(f.nom)}/raw?session=${TOKEN}" target="_blank">télécharger</a>
      <button data-share="${esc(f.nom)}">${ICONS.link} Lien</button><button class="danger" data-del="${esc(f.nom)}">${ICONS.trash}</button></td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">Aucun livrable.</div>`;
    c.querySelectorAll('[data-share]').forEach((b) => b.onclick = async () => {
      const nom = b.dataset.share;
      const days = parseInt(prompt('Durée du lien public (jours, 1–90) :', '7') || '7', 10);
      try {
        const r2 = await api('POST', `/v1/banks/${name}/deliverables/${nom}/share`, { days });
        const url = location.origin + r2.url;
        navigator.clipboard.writeText(url).catch(() => {});
        toast('Lien public copié :\n' + url);
      } catch (e) { toast(e.message, true); }
    });
    c.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!confirm('Supprimer ce livrable ?')) return;
      await api('DELETE', `/v1/banks/${name}/deliverables/${b.dataset.del}`);
      toast('Supprimé'); route();
    });
  }).catch((e) => c.innerHTML = `<div class="empty">${esc(e.message)}</div>`);
}

// ---------- upload ----------
function modalUpload(bank) {
  $modal.innerHTML = `<div class="modal-bg"><div class="modal" style="max-width:560px">
    <h2>Uploader dans « ${esc(bank)} »</h2>
    <div class="dropzone" id="dz">Glisse des fichiers ici, ou clique pour choisir<br><span class="small">&gt; 100 Mo : upload par morceaux automatique</span></div>
    <input type="file" id="fi" multiple style="display:none">
    <div id="upl-list" style="margin-top:10px"></div>
    <div style="margin-top:14px;text-align:right"><button id="upl-close">Fermer</button></div>
  </div></div>`;
  const dz = document.getElementById('dz'), fi = document.getElementById('fi');
  dz.onclick = () => fi.click();
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); handleFiles(bank, e.dataTransfer.files); };
  fi.onchange = () => handleFiles(bank, fi.files);
  document.getElementById('upl-close').onclick = () => { $modal.innerHTML = ''; route(); };
}
async function handleFiles(bank, fileList) {
  const list = document.getElementById('upl-list');
  for (const f of fileList) {
    const row = document.createElement('div');
    row.className = 'upl-row';
    row.innerHTML = `<span>${esc(f.name)} (${fmtSize(f.size)})</span><span class="muted" data-st>en file…</span><div class="upl-bar" style="flex-basis:100%"><div></div></div>`;
    list.appendChild(row);
    const bar = row.querySelector('.upl-bar > div');
    const stEl = row.querySelector('[data-st]');
    try {
      if (f.size <= 100 * 1024 * 1024) {
        const q = `keep=false`;
        stEl.textContent = 'envoi…';
        await fetch(`/api/v1/banks/${bank}/files/${encodeURIComponent(f.name)}?${q}`, {
          method: 'PUT', headers: { 'X-Dash-Session': TOKEN, 'Content-Type': 'application/octet-stream' }, body: f,
        }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || r.status); });
        bar.style.width = '100%'; stEl.textContent = 'terminé';
      } else {
        const CHUNK = 8 * 1024 * 1024;
        stEl.textContent = 'empreinte…';
        const sha = await sha256File(f, (done, tot) => { bar.style.width = (done / tot * 50) + '%'; });
        stEl.textContent = 'init…';
        const init = await api('POST', '/v1/uploads', { bank, name: f.name, size: f.size, sha256: sha, target: 'file' });
        const uid = init.upload_id;
        let sent = new Set((await api('GET', `/v1/uploads/${uid}`)).received);
        for (let n = 0; n < init.chunk_count; n++) {
          if (sent.has(n)) continue;
          const blob = f.slice(n * CHUNK, (n + 1) * CHUNK);
          let tries = 0;
          while (true) {
            try {
              const r = await fetch(`/api/v1/uploads/${uid}/${n}`, { method: 'PUT', headers: { 'X-Dash-Session': TOKEN, 'Content-Type': 'application/octet-stream' }, body: blob });
              if (!r.ok) throw new Error('morceau ' + n);
              break;
            } catch (e) { if (++tries > 5) throw e; await new Promise((res) => setTimeout(res, 2000 * tries)); }
          }
          bar.style.width = (50 + (n + 1) / init.chunk_count * 50) + '%';
        }
        stEl.textContent = 'assemblage…';
        await api('POST', `/v1/uploads/${uid}/complete`, {});
        bar.style.width = '100%'; stEl.textContent = 'terminé';
      }
    } catch (e) { stEl.textContent = 'ERREUR : ' + e.message; stEl.style.color = 'var(--danger)'; }
  }
  toast('Uploads terminés');
}
// SHA-256 streaming en JS pur (évite de charger 1,5 Go en mémoire)
const K256 = (() => { const kk = [], primes = []; for (let i = 2; primes.length < 64; i++) { let ok = true; for (const p of primes) { if (p * p > i) break; if (i % p === 0) { ok = false; break; } } if (ok) primes.push(i); } for (const p of primes) { const r = Math.cbrt(p); kk.push(Math.floor((r - Math.floor(r)) * 4294967296)); } return new Uint32Array(kk); })();
async function sha256File(file, onProgress) {
  const rr = (v, n) => (v >>> n) | (v << (32 - n));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  let bitLen = file.size * 8;
  const block = new Uint8Array(64);
  const processBlock = () => {
    for (let i = 0; i < 16; i++) w[i] = (block[i * 4] << 24) | (block[i * 4 + 1] << 16) | (block[i * 4 + 2] << 8) | block[i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h2] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h2 + S1 + ch + K256[i] + w[i]) | 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h2 = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h2) | 0;
  };
  let read = 0;
  while (read < file.size) {
    const buf = await file.slice(read, read + 4 * 1024 * 1024).arrayBuffer();
    const arr = new Uint8Array(buf);
    for (let i = 0; i < arr.length; i++) {
      block[read % 64] = arr[i];
      read++;
      if (read % 64 === 0) processBlock();
      if (read % (4 * 1024 * 1024) === 0) { onProgress && onProgress(read, file.size); await new Promise((r) => setTimeout(r)); }
    }
  }
  // padding
  // padding (ne PAS effacer les données du dernier bloc partiel)
  const padPos = read % 64;
  block[padPos] = 0x80;
  for (let i = padPos + 1; i < 64; i++) block[i] = 0;
  if (padPos >= 56) { processBlock(); block.fill(0); }
  // longueur en bits (64 bits, sans overflow JS)
  const low = bitLen % 4294967296, high = Math.floor(bitLen / 4294967296);
  block[56] = Math.floor(high / 16777216) % 256; block[57] = Math.floor(high / 65536) % 256; block[58] = Math.floor(high / 256) % 256; block[59] = high % 256;
  block[60] = Math.floor(low / 16777216) % 256; block[61] = Math.floor(low / 65536) % 256; block[62] = Math.floor(low / 256) % 256; block[63] = low % 256;
  processBlock();
  onProgress && onProgress(file.size, file.size);
  return [...H].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

// ---------- lecteur ----------
function openPlayer(bank, list, nom) {
  const idx = list.findIndex((f) => f.nom === nom);
  const f = list[idx];
  const raw = `/api/v1/banks/${bank}/files/${encodeURIComponent(nom)}/raw?session=${TOKEN}`;
  $modal.innerHTML = `<div class="modal-bg"><div class="modal"><div class="player">
    <div>
      ${isVideo(nom) ? `<video src="${raw}" controls autoplay muted></video>` : `<img src="${raw}" style="width:100%;border-radius:8px">`}
      <div class="player-nav">
        <button id="p-prev" ${idx === 0 ? 'disabled' : ''}>${ICONS.back} Précédent</button>
        <button id="p-next">Suivant ${ICONS.fwd}</button>
        <span class="muted small">${idx + 1} / ${list.length}</span>
        <span style="flex:1"></span>
        <a href="${raw}" target="_blank"><button>${ICONS.dl} Télécharger</button></a>
      </div>
    </div>
    <div class="attr">
      <h2 style="margin-top:0">${esc(nom)}</h2>
      <div><span class="k">Description</span>${esc(f.desc || '—')}</div>
      <div><span class="k">Durée</span>${f.dur_s ? fmtDur(f.dur_s) + ` (${f.dur_s} s)` : '—'}</div>
      <div><span class="k">Chapitre</span>${esc(f.chapitre || '—')}</div>
      <div><span class="k">Mouvement</span>${f.mv != null ? f.mv + ' / 100' : '—'}</div>
      <div><span class="k">Source t0→t1</span>${esc(f.t0 || '—')} → ${esc(f.t1 || '—')}</div>
      <div><span class="k">Taille</span>${fmtSize(f.taille_octets)}</div>
      <div><span class="k">Keep</span>${f.keep ? 'oui' : 'non'} · expire ${f.expires_at ? fmtDate(f.expires_at) : 'jamais'}</div>
      <div><span class="k">Uploadé</span>${fmtDate(f.uploaded_at)}</div>
      <div><span class="k">SHA-256</span><span class="small muted">${esc((f.sha256 || '—').slice(0, 24))}…</span></div>
      ${f.meta ? `<div><span class="k">Meta</span><span class="small muted">${esc(JSON.stringify(f.meta))}</span></div>` : ''}
      <div style="display:flex;gap:6px;margin-top:10px">
        <button id="p-keep">${f.keep ? 'Retirer keep' : 'Marquer keep'}</button>
        <button class="danger" id="p-del">${ICONS.trash} Supprimer</button>
      </div>
    </div>
  </div><div style="margin-top:10px;text-align:right"><button id="p-close">Fermer</button></div></div></div>`;
  const close = () => { $modal.innerHTML = ''; };
  document.getElementById('p-close').onclick = close;
  $modal.querySelector('.modal-bg').onclick = (e) => { if (e.target.classList.contains('modal-bg')) close(); };
  const go = (d) => { const ni = idx + d; if (ni >= 0 && ni < list.length) openPlayer(bank, list, list[ni].nom); };
  document.getElementById('p-prev').onclick = () => go(-1);
  document.getElementById('p-next').onclick = () => go(1);
  const key = (e) => {
    if (!$modal.innerHTML) return window.removeEventListener('keydown', key);
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'Escape') { close(); window.removeEventListener('keydown', key); }
  };
  window.addEventListener('keydown', key);
  document.getElementById('p-keep').onclick = async () => { await api('PATCH', `/v1/banks/${bank}/files/${nom}`, { keep: !f.keep }); toast('Mis à jour'); f.keep = !f.keep; openPlayer(bank, list, nom); };
  document.getElementById('p-del').onclick = async () => {
    if (!confirm(`Supprimer ${nom} ?`)) return;
    await api('DELETE', `/v1/banks/${bank}/files/${nom}`);
    toast('Supprimé'); close(); route();
  };
}

// ---------- recherche ----------
async function viewSearch() {
  $app.innerHTML = topbar('search') + `<div class="wrap">
    <h1>Recherche transversale</h1>
    <div class="toolbar">
      <input id="s-q" placeholder="Texte (desc, tags, nom)…" style="flex:1;max-width:360px">
      <input id="s-prefix" placeholder="préfixe banque (ex. lib-)" style="max-width:180px">
      <input id="s-kind" placeholder="kind (meta)" style="max-width:140px">
      <input id="s-tag" placeholder="tag" style="max-width:140px">
      <button class="primary" id="s-go">Chercher</button>
    </div>
    <div id="s-res"></div>
  </div>`;
  bindTopbar();
  document.getElementById('s-go').onclick = doSearch;
  document.getElementById('s-q').onkeydown = (e) => e.key === 'Enter' && doSearch();
  async function doSearch() {
    const q = new URLSearchParams();
    const v = (id) => document.getElementById(id).value.trim();
    if (v('s-q')) q.set('q', v('s-q'));
    if (v('s-prefix')) q.set('bank_prefix', v('s-prefix'));
    if (v('s-kind')) q.set('kind', v('s-kind'));
    if (v('s-tag')) q.set('tag', v('s-tag'));
    q.set('limit', '100');
    const r = await api('GET', '/v1/search?' + q.toString());
    const byBank = {};
    for (const it of r.resultats) (byBank[it.banque] = byBank[it.banque] || []).push(it);
    document.getElementById('s-res').innerHTML = r.total
      ? Object.entries(byBank).map(([b, items]) => `<h2 style="margin-top:18px">${esc(b)} <span class="badge">${items.length}</span></h2>
        <table><tbody>${items.map((it) => `<tr style="cursor:pointer" data-b="${esc(b)}" data-n="${esc(it.fichier)}"><td>${esc(it.fichier)}</td><td>${esc(it.desc || '')}</td><td class="muted">${fmtSize(it.taille_octets)}</td></tr>`).join('')}</tbody></table>`).join('')
      : '<div class="empty">Aucun résultat.</div>';
    $app.querySelectorAll('[data-n]').forEach((tr) => tr.onclick = async () => {
      const b = tr.dataset.b, n = tr.dataset.n;
      const bank = await api('GET', '/v1/banks/' + b);
      openPlayer(b, bank.fichiers.filter((f) => isVideo(f.nom) || isImg(f.nom)), n);
    });
  }
}

// ---------- stats ----------
async function viewStats() {
  $app.innerHTML = topbar('stats') + `<div class="wrap"><h1>Statistiques</h1><div id="s-body" class="muted">chargement…</div></div>`;
  bindTopbar();
  const u = await api('GET', '/v1/usage');
  const maxB = Math.max(...u.banques.map((b) => b.taille_octets), 1);
  document.getElementById('s-body').innerHTML = `
    <div class="card-grid" style="max-width:640px;margin-bottom:20px">
      <div class="bank-card"><div class="kv"><span>Banques</span><b>${u.total_banques}</b></div></div>
      <div class="bank-card"><div class="kv"><span>Fichiers</span><b>${u.total_fichiers}</b></div></div>
      <div class="bank-card"><div class="kv"><span>Total</span><b>${fmtSize(u.total_octets)}</b></div></div>
      <div class="bank-card"><div class="kv"><span>Quota / banque</span><b>${fmtSize(u.quota_par_banque_octets)}</b></div></div>
    </div>
    <table><thead><tr><th>Banque</th><th>Fichiers</th><th>Taille</th><th></th><th>Expiration</th></tr></thead><tbody>
    ${u.banques.sort((a, b) => b.taille_octets - a.taille_octets).map((b) => `<tr>
      <td><a style="cursor:pointer" data-b="${esc(b.name)}">${esc(b.name)}</a></td>
      <td>${b.nb_fichiers}</td><td>${fmtSize(b.taille_octets)}</td>
      <td style="width:220px"><div class="statbar"><div style="width:${Math.round(b.taille_octets / maxB * 100)}%"></div></div></td>
      <td class="muted">${b.expires_at ? fmtDate(b.expires_at) : 'jamais'}</td></tr>`).join('')}
    </tbody></table>`;
  $app.querySelectorAll('[data-b]').forEach((a) => a.onclick = () => location.hash = '#/bank/' + a.dataset.b);
}

// ---------- clés (admin) ----------
async function viewAdmin() {
  $app.innerHTML = topbar('admin') + `<div class="wrap"><h1>Clés API</h1>
    <div class="toolbar">
      <select id="k-role"><option>read</option><option>produce</option><option>deliver</option><option>admin</option></select>
      <input id="k-label" placeholder="libellé (ex. agent rushs)" style="max-width:280px">
      <button class="primary" id="k-create">Créer une clé</button>
    </div>
    <div class="errline" id="k-err"></div>
    <div id="k-new"></div>
    <div id="k-list">chargement…</div>
  </div>`;
  bindTopbar();
  const load = async () => {
    const r = await api('GET', '/v1/keys');
    document.getElementById('k-list').innerHTML = `<table><thead><tr><th>ID</th><th>Rôle</th><th>Libellé</th><th>Créée</th><th>État</th><th></th></tr></thead><tbody>
      ${r.cles.map((k) => `<tr><td class="muted small">${esc(k.id)}</td><td><span class="badge ${k.role === 'admin' ? 'keep' : ''}">${esc(k.role)}</span></td><td>${esc(k.label || '—')}</td><td class="muted small">${fmtDate(k.created_at)}</td><td>${k.revoked ? '<span class="badge expiring">révoquée</span>' : '<span class="badge keep">active</span>'}</td>
      <td>${k.revoked || k.legacy ? '' : `<button class="danger" data-rev="${esc(k.id)}">Révoquer</button>`}</td></tr>`).join('')}</tbody></table>`;
    $app.querySelectorAll('[data-rev]').forEach((b) => b.onclick = async () => {
      if (!confirm('Révoquer cette clé ? (définitif)')) return;
      await api('DELETE', '/v1/keys/' + b.dataset.rev);
      toast('Clé révoquée'); load();
    });
  };
  load();
  document.getElementById('k-create').onclick = async () => {
    try {
      const k = await api('POST', '/v1/keys', { role: document.getElementById('k-role').value, label: document.getElementById('k-label').value });
      document.getElementById('k-new').innerHTML = `<div class="bank-card" style="margin-top:10px"><strong>Clé créée — copie-la maintenant, elle ne sera plus affichée :</strong><br><code style="user-select:all;word-break:break-all">${esc(k.key)}</code></div>`;
      load();
    } catch (e) { document.getElementById('k-err').textContent = e.message; }
  };
}

// ---------- router ----------
async function route() {
  const h = location.hash || '#/';
  if (!TOKEN && h !== '#/login') { location.hash = '#/login'; return; }
  try {
    if (h === '#/login') return viewLogin();
    const m = h.match(/^#\/bank\/([a-z0-9-]+)(\/deliverables)?$/);
    if (m) return await viewBank(m[1], m[2] ? 'deliverables' : 'files');
    if (h === '#/search') return await viewSearch();
    if (h === '#/stats') return await viewStats();
    if (h === '#/admin') return await viewAdmin();
    return await viewBanks();
  } catch (e) {
    if (String(e.message).includes('session')) return;
    $app.innerHTML = topbar('') + `<div class="wrap"><div class="empty">${esc(e.message)} — <a style="cursor:pointer" onclick="location.reload()">recharger</a></div></div>`;
  }
}
window.addEventListener('hashchange', route);
route();
