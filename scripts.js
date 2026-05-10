// ════════════════════════════════════════════════
// CONFIG — change API_BASE to point at your server
// ════════════════════════════════════════════════
const API_BASE = 'http://localhost:3000';
const OFFLINE_QUEUE_KEY = 'barkid_offline_queue';
const PUBLIC_BASE_URL = window.location.origin; // used for dynamic QR links

// ════════════════════════════════════════════════
// SERVICE WORKER
// ════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('BarkID PWA: Service Worker active'))
      .catch(err => console.warn('PWA: SW registration failed', err));
  });
}

// ════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════
let currentDogId    = null;
let currentDogData  = null;   // last loaded profile from backend
let currentQRMode   = 'static';
let selectedDonateAmount = 10;
let lastRegisteredId = null;
let currentGPS      = null;
let allDogs         = [];     // cached list for filtering

// ════════════════════════════════════════════════
// ONLINE / OFFLINE
// ════════════════════════════════════════════════
function updateNetworkUI() {
  const pill = document.getElementById('sync-pill');
  if (navigator.onLine) {
    pill.textContent = 'Online';
    pill.className = 'sync-pill show';
    flushOfflineQueue();
  } else {
    pill.textContent = 'Offline';
    pill.className = 'sync-pill offline show';
  }
}
window.addEventListener('online',  updateNetworkUI);
window.addEventListener('offline', updateNetworkUI);
updateNetworkUI();

// ════════════════════════════════════════════════
// GPS
// ════════════════════════════════════════════════
function getGPS() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => { currentGPS = { lat: pos.coords.latitude, lon: pos.coords.longitude }; resolve(currentGPS); },
      ()  => resolve(null),
      { timeout: 6000 }
    );
  });
}

// ════════════════════════════════════════════════
// OFFLINE QUEUE
// ════════════════════════════════════════════════
function getOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); }
  catch { return []; }
}
function saveOfflineQueue(q) { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)); }
function enqueueOffline(payload) { const q = getOfflineQueue(); q.push(payload); saveOfflineQueue(q); }
async function flushOfflineQueue() {
  const q = getOfflineQueue();
  if (!q.length) return;
  const remaining = [];
  for (const payload of q) {
    try {
      const res = await fetch(`${API_BASE}/api/log-activity`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!res.ok) remaining.push(payload);
    } catch { remaining.push(payload); }
  }
  saveOfflineQueue(remaining);
  if (q.length > remaining.length) showToast(`Synced ${q.length - remaining.length} offline log(s)`, 'success');
}

// ════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  const tab = document.getElementById('tab-' + name);
  if (tab) tab.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'home')      loadDogGrid();
  if (name === 'caretaker') loadCaretakerGrid();
  if (name === 'register')  resetRegisterForm();
}

// ════════════════════════════════════════════════
// STATS
// ════════════════════════════════════════════════
function updateStats(dogs) {
  document.getElementById('stat-dogs').textContent       = dogs.length;
  document.getElementById('stat-vaccinated').textContent = dogs.filter(d => d.vaccination_bit_mask & 1).length; // bit 0 = rabies
  document.getElementById('stat-missing').textContent    = dogs.filter(d => d.is_missing).length;
  document.getElementById('stat-sterilized').textContent = dogs.filter(d => (d.sterilization_status || '').toLowerCase() === 'yes').length;
}

// ════════════════════════════════════════════════
// DOG GRID
// ════════════════════════════════════════════════
async function loadDogGrid() {
  const grid = document.getElementById('dog-grid');
  grid.innerHTML = '<div class="loading-state" style="grid-column:1/-1;"><div class="spinner"></div><p>Loading dogs…</p></div>';
  try {
    const res = await fetch(`${API_BASE}/api/dogs`);
    if (!res.ok) throw new Error('Server error');
    allDogs = await res.json();
    updateStats(allDogs);
    renderDogGrid(allDogs);
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="icon">⚠️</div><h3>Could not load dogs</h3><p>${err.message}. Is the backend running?</p></div>`;
  }
}

function renderDogGrid(dogs) {
  const grid = document.getElementById('dog-grid');
  if (!dogs.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="icon">🔍</div><h3>No dogs found</h3><p>Register the first dog to get started.</p></div>';
    return;
  }
  grid.innerHTML = dogs.map(d => dogCardHTML(d, false)).join('');
}

function dogCardHTML(d, isCaretaker) {
  const vaxOk = !!(d.vaccination_bit_mask & 1); // rabies bit
  const sterilized = (d.sterilization_status || '').toLowerCase() === 'yes';
  const imgHtml = d.photo_url
    ? `<img src="${d.photo_url}" alt="${d.name}" style="width:100%;height:100%;object-fit:cover;">`
    : '🐕';
  const extra = isCaretaker
    ? `<div style="margin-top:10px;display:flex;gap:6px;">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();viewQR('${d.id}')">QR Tag</button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();toggleMissing('${d.id}','${d.is_missing}')">${d.is_missing ? 'Mark Found' : 'Report Missing'}</button>
       </div>`
    : '';
  return `
    <div class="dog-card" onclick="openDogProfile('${d.id}')">
      <div class="dog-card-img">${imgHtml}</div>
      <div class="dog-card-body">
        <div class="dog-card-name">${d.name} <span style="font-size:0.8rem;font-weight:400;color:var(--muted)">#${d.id.substring(0,8)}</span></div>
        <div class="dog-card-meta">${d.age_group || '—'} · ${d.sex || '—'} · ${d.species || 'Dog'}</div>
        <div class="badge-row">
          ${d.is_missing ? '<span class="badge badge-red">🚨 Missing</span>' : '<span class="badge badge-green">● Active</span>'}
          ${vaxOk ? '<span class="badge badge-green">✓ Rabies</span>' : '<span class="badge badge-red">✗ Rabies</span>'}
          ${sterilized ? '<span class="badge badge-blue">✂ Sterilized</span>' : ''}
          <span class="badge badge-gray">${d.status || 'Street'}</span>
        </div>
        ${extra}
      </div>
    </div>`;
}

function filterDogs() {
  const q = document.getElementById('dog-search').value.toLowerCase();
  const filtered = allDogs.filter(d =>
    !q || d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)
  );
  renderDogGrid(filtered);
}

async function loadCaretakerGrid() {
  const grid = document.getElementById('caretaker-dog-grid');
  grid.innerHTML = '<div class="loading-state" style="grid-column:1/-1;"><div class="spinner"></div><p>Loading…</p></div>';
  try {
    const res = await fetch(`${API_BASE}/api/dogs`);
    if (!res.ok) throw new Error('Server error');
    const dogs = await res.json();
    if (!dogs.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="icon">🐾</div><h3>No dogs registered yet</h3><p>Register your first dog to get started.</p></div>';
      return;
    }
    grid.innerHTML = dogs.map(d => dogCardHTML(d, true)).join('');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="icon">⚠️</div><h3>Could not load</h3><p>${err.message}</p></div>`;
  }
}

// ════════════════════════════════════════════════
// DOG PROFILE — URL params first, then backend
// ════════════════════════════════════════════════

/**
 * Parse all recognised dog fields from a URLSearchParams object.
 * Returns a partial dog object (only fields that are actually present).
 */
function dogFromParams(params) {
  const raw = {
    id:                   params.get('id'),
    name:                 params.get('name'),
    photo_url:            params.get('photo_url'),
    sex:                  params.get('sex'),
    species:              params.get('species'),
    age_group:            params.get('age_group'),
    sterilization_status: params.get('sterilization_status'),
    vaccination_bit_mask: params.get('vaccination_bit_mask'),
    status:               params.get('status'),
    is_missing:           params.get('is_missing'),
  };
  // Drop keys that weren't in the URL at all
  const dog = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== null) {
      // Coerce known numeric / boolean fields
      if (k === 'vaccination_bit_mask') dog[k] = parseInt(v, 10) || 0;
      else if (k === 'is_missing')      dog[k] = v === 'true' || v === '1';
      else                              dog[k] = v;
    }
  }
  return dog;
}

/** Switch to the profile view, hide tabs, hide loading indicator. */
function activateProfileView() {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-profile').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  ['story','health','activity','qr'].forEach(t => {
    document.getElementById('ptab-'+t).style.display = 'none';
  });
  document.querySelectorAll('.profile-tab').forEach(b => b.classList.remove('active'));
  document.querySelector('.profile-tab').classList.add('active');
}

/**
 * Show a small inline "refreshing from server…" pill inside the profile hero
 * so the user knows fresh data is on the way.
 */
function showRefreshPill() {
  let pill = document.getElementById('refresh-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'refresh-pill';
    pill.style.cssText =
      'display:inline-flex;align-items:center;gap:6px;margin-top:10px;' +
      'background:rgba(255,255,255,0.12);border-radius:99px;padding:4px 14px;' +
      'font-size:0.75rem;color:rgba(255,255,255,0.7);';
    pill.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;animation:spin .7s linear infinite;display:inline-block;"></span> Refreshing from server…';
    document.getElementById('profile-id').insertAdjacentElement('afterend', pill);
  }
  pill.style.display = 'inline-flex';
}

function hideRefreshPill() {
  const pill = document.getElementById('refresh-pill');
  if (pill) pill.style.display = 'none';
}

/**
 * Main entry point. Accepts either:
 *   openDogProfile('dog_xxx')           — id only, full backend load
 *   openDogProfile('dog_xxx', params)   — id + URLSearchParams for instant render
 */
async function openDogProfile(id, urlParams) {
  currentDogId = id;
  activateProfileView();
  getGPS(); // kick off GPS in background

  const hasUrlData = urlParams && urlParams.get('name');

  if (hasUrlData) {
    // ── PHASE 1: render immediately from URL params ──────────────────────────
    document.getElementById('profile-loading').style.display = 'none';
    switchProfileTab('story', document.querySelector('.profile-tab'));

    const urlDog = dogFromParams(urlParams);
    renderProfile(urlDog);
    // Show placeholder states for data not in URL
    document.getElementById('profile-vax-grid').innerHTML =
      '<p style="color:var(--muted);font-size:0.85rem;grid-column:1/-1;">Loading detailed vaccine records…</p>';
    document.getElementById('treatments-list').innerHTML =
      '<div class="empty-state" style="padding:16px;"><div class="spinner" style="width:24px;height:24px;margin-bottom:8px;"></div><p>Loading…</p></div>';
    document.getElementById('caretakers-list').innerHTML =
      '<div class="empty-state" style="padding:16px;"><div class="spinner" style="width:24px;height:24px;margin-bottom:8px;"></div><p>Loading…</p></div>';
    document.getElementById('activity-feed').innerHTML =
      '<div class="empty-state"><div class="spinner" style="width:24px;height:24px;margin:0 auto 8px;"></div><p>Loading activity…</p></div>';

    showRefreshPill();

    // ── PHASE 2: fetch fresh data from backend in background ─────────────────
    try {
      const gps    = currentGPS;
      const locStr = gps ? `?lat=${gps.lat}&lon=${gps.lon}` : '';

      const [profile, vaccinations, treatments, caretakers, activities] = await Promise.all([
        fetch(`${API_BASE}/api/dog/${id}${locStr}`).then(r => r.ok ? r.json() : null),
        fetch(`${API_BASE}/api/dog/${id}/vaccines`).then(r => r.ok ? r.json() : []),
        fetch(`${API_BASE}/api/dog/${id}/treatments`).then(r => r.ok ? r.json() : []),
        fetch(`${API_BASE}/api/dog/${id}/caretakers`).then(r => r.ok ? r.json() : []),
        fetch(`${API_BASE}/api/dog/${id}/activities`).then(r => r.ok ? r.json() : { total_logs: 0, activities: [] }),
      ]);

      hideRefreshPill();

      if (profile) {
        // Merge: URL params fill any gaps the backend leaves (e.g. future fields)
        const merged = { ...urlDog, ...profile };
        currentDogData = { profile: merged, vaccinations, treatments, caretakers, activities };
        renderProfile(merged);
      }
      renderVaccinations(vaccinations);
      renderTreatments(treatments);
      renderCaretakers(caretakers);
      renderActivities(activities);
      showToast('Profile refreshed ✓', 'success');

    } catch {
      hideRefreshPill();
      // Non-fatal — URL data is already showing; let the user know
      showToast('Could not reach server — showing cached data', 'offline');
      // Restore empty states for secondary panels
      document.getElementById('treatments-list').innerHTML =
        '<div class="empty-state" style="padding:16px;">No treatment records found.</div>';
      document.getElementById('caretakers-list').innerHTML =
        '<div class="empty-state" style="padding:16px;">No caretakers linked.</div>';
    }

  } else {
    // ── NO URL DATA: classic full backend load with loading spinner ───────────
    document.getElementById('profile-loading').style.display = 'block';

    try {
      const gps    = currentGPS;
      const locStr = gps ? `?lat=${gps.lat}&lon=${gps.lon}` : '';

      const [profile, vaccinations, treatments, caretakers, activities] = await Promise.all([
        fetch(`${API_BASE}/api/dog/${id}${locStr}`).then(r => r.ok ? r.json() : null),
        fetch(`${API_BASE}/api/dog/${id}/vaccines`).then(r => r.ok ? r.json() : []),
        fetch(`${API_BASE}/api/dog/${id}/treatments`).then(r => r.ok ? r.json() : []),
        fetch(`${API_BASE}/api/dog/${id}/caretakers`).then(r => r.ok ? r.json() : []),
        fetch(`${API_BASE}/api/dog/${id}/activities`).then(r => r.ok ? r.json() : { total_logs: 0, activities: [] }),
      ]);

      if (!profile) throw new Error('Dog not found');
      currentDogData = { profile, vaccinations, treatments, caretakers, activities };

      renderProfile(profile);
      renderVaccinations(vaccinations);
      renderTreatments(treatments);
      renderCaretakers(caretakers);
      renderActivities(activities);

      document.getElementById('profile-loading').style.display = 'none';
      switchProfileTab('story', document.querySelector('.profile-tab'));

    } catch (err) {
      document.getElementById('profile-loading').innerHTML =
        `<p style="color:var(--rust)">⚠️ Could not load profile.<br><small>${err.message}</small></p>`;
    }
  }
}

function renderProfile(dog) {
  // Avatar
  const avatar = document.getElementById('profile-avatar');
  if (dog.photo_url) {
    avatar.innerHTML = `<img src="${dog.photo_url}" alt="${dog.name}">`;
  } else {
    avatar.textContent = '🐕';
  }

  document.getElementById('profile-name').textContent = dog.name || 'Unknown Dog';
  document.getElementById('profile-id').textContent = `ID: ${dog.id} · ${dog.status || 'Street'}`;
  document.getElementById('donate-name').textContent = dog.name || 'this dog';

  // Status badges
  const vaxOk = !!(dog.vaccination_bit_mask & 1);
  const sterilized = (dog.sterilization_status || '').toLowerCase() === 'yes';
  document.getElementById('profile-status-bar').innerHTML = `
    ${dog.is_missing ? '<span class="badge badge-red">🚨 Missing</span>' : '<span class="badge badge-green">● Active</span>'}
    ${vaxOk ? '<span class="badge badge-green">✓ Rabies Vax</span>' : '<span class="badge badge-red">✗ Rabies Unvaccinated</span>'}
    ${sterilized ? '<span class="badge badge-blue">✂ Sterilized</span>' : ''}
    <span class="badge badge-gray">${dog.status || 'Street'}</span>
  `;

  // Missing alert
  const missingBox = document.getElementById('missing-alert-box');
  if (dog.is_missing) {
    missingBox.style.display = 'flex';
    document.getElementById('missing-alert-text').textContent = 'Caretaker has been notified. Your GPS location has been logged.';
  } else {
    missingBox.style.display = 'none';
  }

  // Story tab fields
  document.getElementById('profile-story').textContent = `${dog.name} is a ${dog.sex || 'dog'} ${dog.species || 'dog'} — ${dog.age_group || 'age unknown'}. Sterilization: ${dog.sterilization_status || 'Unknown'}.`;
  document.getElementById('profile-location').textContent = '—'; // not in backend schema
  document.getElementById('profile-caretaker').textContent = '(see Health tab)';

  // Basic info table
  document.getElementById('profile-basic-table').innerHTML = `
    <tr><td>Sex</td><td>${dog.sex || '—'}</td></tr>
    <tr><td>Age Group</td><td>${dog.age_group || '—'}</td></tr>
    <tr><td>Species</td><td>${dog.species || '—'}</td></tr>
    <tr><td>Status</td><td>${dog.status || '—'}</td></tr>
    <tr><td>Sterilized</td><td>${sterilized ? '✅ Yes' : (dog.sterilization_status || '❓ Unknown')}</td></tr>
  `;

  // QR tab
  generateProfileQR(dog);
}

function renderVaccinations(records) {
  const today = new Date();
  const grid = document.getElementById('profile-vax-grid');
  if (!records.length) {
    // Fall back to bitmask decode if no detailed records
    grid.innerHTML = '<p style="color:var(--muted);font-size:0.88rem;grid-column:1/-1;">No detailed vaccine records. Check bitmask on profile.</p>';
    return;
  }
  grid.innerHTML = records.map(r => {
    const expired = r.date_expires && new Date(r.date_expires) < today;
    return `<div class="vax-item">
      <span class="vax-icon">${expired ? '⚠️' : '💉'}</span>
      <div>
        <div class="vax-label">${r.vaccine_type}</div>
        <div class="vax-status" style="color:${expired ? 'var(--rust)' : '#1a7a45'};">
          ${expired ? '⚠ Expired' : '✓ Valid'}${r.date_expires ? ' · exp ' + r.date_expires : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderTreatments(records) {
  const el = document.getElementById('treatments-list');
  if (!records.length) return;
  el.innerHTML = records.map(r => `
    <div class="record-item">
      <div class="record-label">${r.treatment_type || 'Treatment'}</div>
      <div class="record-sub">${r.details || ''}${r.skin_condition ? ' · Skin: ' + r.skin_condition : ''}${r.visible_injuries ? ' · Injury: ' + r.visible_injuries : ''}</div>
      ${r.date ? `<div class="record-date">📅 ${r.date}</div>` : ''}
    </div>
  `).join('');
}

function renderCaretakers(records) {
  const el = document.getElementById('caretakers-list');
  if (!records.length) return;
  el.innerHTML = records.map(r => `
    <div class="record-item">
      <div class="record-label">👤 ${r.name || 'Anonymous'} <span style="font-weight:400;color:var(--muted)">(${r.role || 'Volunteer'})</span></div>
      ${r.contact_info ? `<div class="record-sub">📞 ${r.contact_info}</div>` : ''}
    </div>
  `).join('');
}

function renderActivities(data) {
  const el = document.getElementById('activity-feed');
  document.getElementById('activity-count').textContent = `${data.total_logs} scans`;

  if (!data.activities || !data.activities.length) return;

  // Heartbeat: last activity > 180 days ago
  const newest = new Date(data.activities[0].timestamp);
  const daysSince = (Date.now() - newest) / 86400000;
  if (daysSince > 180) document.getElementById('heartbeat-warn').classList.add('show');

  // Liveness score
  const score = Math.max(0, Math.min(100, 100 - (daysSince / 180) * 100));
  const fill = document.getElementById('liveness-fill');
  fill.style.width = score + '%';
  fill.style.background = score > 60 ? 'var(--sage)' : score > 30 ? 'var(--amber)' : 'var(--rust)';
  document.getElementById('liveness-label').textContent =
    score > 60 ? `Active — last scanned ${Math.round(daysSince)}d ago`
    : score > 0 ? `⚠ Status may be outdated — ${Math.round(daysSince)}d since last scan`
    : '🔴 Status Unknown — not scanned in 6+ months';
  document.getElementById('profile-last-scan').textContent =
    newest.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const recent = data.activities.slice(0, 10);
  el.innerHTML = recent.map(a => {
    const type = (a.event_type || '').toLowerCase();
    let dotClass = 'view';
    if (type.includes('fed')) dotClass = 'fed';
    else if (type.includes('sighted') || type.includes('seen')) dotClass = 'sighted';
    const ts = a.timestamp ? new Date(a.timestamp).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
    const loc = a.gps_location && a.gps_location !== 'Unknown' ? ` · 📍 ${a.gps_location}` : '';
    return `<div class="activity-item">
      <div class="activity-dot ${dotClass}"></div>
      <div class="activity-content">
        <div class="activity-type">${a.event_type || 'Log'}</div>
        <div class="activity-meta">${ts}${loc}</div>
        ${a.notes ? `<div class="activity-notes">${a.notes}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function switchProfileTab(name, btn) {
  ['story','health','activity','qr'].forEach(t => {
    document.getElementById('ptab-'+t).style.display = 'none';
  });
  document.querySelectorAll('.profile-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('ptab-'+name).style.display = 'block';
  document.querySelectorAll('.profile-tab').forEach(b => {
    if (b.textContent.toLowerCase().trim().startsWith(name.substring(0,4))) b.classList.add('active');
  });
}

// ════════════════════════════════════════════════
// INTERACTION LOGGING → backend
// ════════════════════════════════════════════════
async function logInteraction(type) {
  if (!currentDogId) return;
  const gps = currentGPS || await getGPS();
  const payload = {
    dog_id: currentDogId,
    event_type: type,
    lat: gps?.lat,
    lon: gps?.lon,
    status_observed: type === 'Injured' ? 'Injured' : 'Healthy',
    notes: `Interaction logged via BarkID: ${type}`,
    contributor_id: 'Anonymous'
  };

  if (navigator.onLine) {
    try {
      const res = await fetch(`${API_BASE}/api/log-activity`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('Interaction logged — thank you! 🐾', 'success');
        // Refresh activity feed
        const actRes = await fetch(`${API_BASE}/api/dog/${currentDogId}/activities`);
        if (actRes.ok) renderActivities(await actRes.json());
      } else throw new Error('Server error');
    } catch {
      enqueueOffline(payload);
      showToast('Saved offline — will sync when connected', 'offline');
    }
  } else {
    enqueueOffline(payload);
    showToast('Saved offline — will sync when connected', 'offline');
  }
}

// ════════════════════════════════════════════════
// REPORT MISSING → backend
// ════════════════════════════════════════════════
async function reportMissing() {
  if (!currentDogId) return;
  try {
    const res = await fetch(`${API_BASE}/api/dog/${currentDogId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_missing: 1 })
    });
    if (res.ok) {
      document.getElementById('missing-alert-box').style.display = 'flex';
      showToast('Missing report filed. Caretaker notified.', 'warning');
    } else throw new Error();
  } catch { showToast('Could not file report — try again', 'error'); }
}

async function toggleMissing(id, currentlyMissing) {
  const isMissing = currentlyMissing === 'true' || currentlyMissing === true;
  try {
    const res = await fetch(`${API_BASE}/api/dog/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_missing: isMissing ? 0 : 1 })
    });
    if (res.ok) {
      showToast(isMissing ? '✅ Marked as Found!' : '🚨 Marked as Missing!', isMissing ? 'success' : 'warning');
      loadCaretakerGrid();
    } else throw new Error();
  } catch { showToast('Update failed', 'error'); }
}

// ════════════════════════════════════════════════
// SCAN MODAL → look up by dog id in backend
// ════════════════════════════════════════════════
function openScanModal() {
  document.getElementById('scan-input').value = '';
  openModal('scan-modal');
}

async function scanDog() {
  const query = document.getElementById('scan-input').value.trim();
  if (!query) { showToast('Enter a Dog ID', 'warning'); return; }
  // Try to match against loaded dogs first
  const match = allDogs.find(d =>
    d.id === query || d.id.toLowerCase().includes(query.toLowerCase()) || d.name.toLowerCase() === query.toLowerCase()
  );
  if (match) {
    closeModal('scan-modal');
    openDogProfile(match.id);
  } else {
    // Try direct fetch from backend
    try {
      const res = await fetch(`${API_BASE}/api/dog/${query}`);
      if (res.ok) {
        closeModal('scan-modal');
        openDogProfile(query);
      } else showToast('No dog found with that ID', 'error');
    } catch { showToast('Could not connect to backend', 'error'); }
  }
}

// ════════════════════════════════════════════════
// REGISTER DOG → POST /api/register + caretaker
// ════════════════════════════════════════════════
function setQRMode(mode) {
  currentQRMode = mode;
  document.getElementById('qr-mode-static').classList.toggle('active', mode === 'static');
  document.getElementById('qr-mode-dynamic').classList.toggle('active', mode === 'dynamic');
  document.getElementById('qr-mode-desc-static').style.display = mode === 'static' ? 'block' : 'none';
  document.getElementById('qr-mode-desc-dynamic').style.display = mode === 'dynamic' ? 'block' : 'none';
}

function computeVaxMask() {
  let mask = 0;
  document.querySelectorAll('.vax-cb').forEach(cb => {
    if (cb.checked) mask |= (1 << parseInt(cb.dataset.bit));
  });
  return mask;
}

// Keep the mask input and checkboxes in sync
document.querySelectorAll('.vax-cb').forEach(cb => {
  cb.addEventListener('change', () => {
    document.getElementById('reg-vax-mask').value = computeVaxMask();
  });
});

function resetRegisterForm() {
  ['reg-name','reg-species','reg-photo','reg-caretaker-name','reg-caretaker-contact']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('reg-species').value = 'Dog';
  document.getElementById('reg-vax-mask').value = '0';
  document.querySelectorAll('.vax-cb').forEach(cb => cb.checked = false);
  currentQRMode = 'static';
  setQRMode('static');
  document.getElementById('reg-submit-btn').disabled = false;
  document.getElementById('reg-submit-btn').textContent = 'Generate QR & Register 🐾';
}

async function registerDog() {
  const name = document.getElementById('reg-name').value.trim();
  if (!name) { showToast('Please enter the dog\'s name', 'warning'); return; }

  const btn = document.getElementById('reg-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Registering…';

  const vaxMask = computeVaxMask() || parseInt(document.getElementById('reg-vax-mask').value) || 0;
  const status  = document.getElementById('reg-status').value;

  const payload = {
    name,
    photo_url:            document.getElementById('reg-photo').value.trim() || null,
    sex:                  document.getElementById('reg-sex').value,
    species:              document.getElementById('reg-species').value.trim() || 'Dog',
    age_group:            document.getElementById('reg-age').value,
    sterilization_status: document.getElementById('reg-sterilized').value,
    vaccination_bit_mask: vaxMask,
    status,
    is_missing:           status === 'Missing' ? 1 : 0
  };

  try {
    const res = await fetch(`${API_BASE}/api/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Registration failed'); }
    const { id: dogId } = await res.json();
    lastRegisteredId = dogId;

    // Save caretaker if provided
    const caretakerName = document.getElementById('reg-caretaker-name').value.trim();
    if (caretakerName) {
      await fetch(`${API_BASE}/api/dog/${dogId}/caretakers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: caretakerName,
          contact_info: document.getElementById('reg-caretaker-contact').value.trim() || null,
          role: document.getElementById('reg-caretaker-role').value
        })
      }).catch(() => {}); // non-fatal
    }

    // Build dog object for QR generation (using backend response data)
    const qrDog = { id: dogId, name, vaccination_bit_mask: vaxMask, sterilization_status: payload.sterilization_status };
    showQRModal(qrDog);
    showToast(`${name} registered successfully! 🐾`, 'success');
    btn.textContent = '✅ Registered!';

  } catch (err) {
    showToast(`Registration failed: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Generate QR & Register 🐾';
  }
}

function showQRModal(dog) {
  const container = document.getElementById('modal-qr-display');
  container.innerHTML = '';
  const content = buildQRContent(dog);
  new QRCode(container, {
    text: content, width: 160, height: 160,
    colorDark: '#1a1008', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
  document.getElementById('modal-qr-name').textContent = dog.name + ' #' + dog.id.substring(0,8);
  document.getElementById('modal-qr-id').textContent = dog.id;
  const badge = document.getElementById('modal-qr-mode');
  badge.textContent = currentQRMode === 'static' ? '🔌 Static QR' : '🌐 Dynamic QR';
  badge.style.background = currentQRMode === 'static' ? '#e8f8f0' : '#e8f4fb';
  badge.style.color = currentQRMode === 'static' ? '#1a7a45' : '#1a5c8a';
  openModal('qr-modal');
}

function viewNewDog() {
  closeModal('qr-modal');
  if (lastRegisteredId) openDogProfile(lastRegisteredId);
}

// ════════════════════════════════════════════════
// QR GENERATION
// ════════════════════════════════════════════════
function buildQRContent(dog) {
  if (currentQRMode === 'static') {
    const payload = {
      id:  dog.id,
      n:   dog.name,
      v:   dog.vaccination_bit_mask || 0,
      st:  (dog.sterilization_status || '').toLowerCase() === 'yes' ? 1 : 0,
    };
    return 'BARKID:' + btoa(JSON.stringify(payload));
  } else {
    return `${PUBLIC_BASE_URL}/index.html?id=${dog.id}`;
  }
}

function generateProfileQR(dog) {
  const container = document.getElementById('profile-qr-display');
  container.innerHTML = '';
  const content = buildQRContent(dog);
  new QRCode(container, {
    text: content, width: 180, height: 180,
    colorDark: '#1a1008', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
  document.getElementById('profile-qr-name').textContent = dog.name + ' #' + dog.id.substring(0,8);
  document.getElementById('profile-qr-id').textContent = dog.id;
  const badge = document.getElementById('profile-qr-mode-badge');
  const isDynamic = (dog.status || '').toLowerCase() !== 'static';
  badge.textContent = '🌐 Dynamic — Live Profile';
  badge.style.background = '#e8f4fb';
  badge.style.color = '#1a5c8a';
}

function downloadQR() {
  const canvas = document.querySelector('#ptab-qr canvas');
  if (!canvas) { showToast('QR not ready yet', 'error'); return; }
  const link = document.createElement('a');
  link.download = `BarkID_${currentDogId}.png`;
  link.href = canvas.toDataURL();
  link.click();
  showToast('QR downloaded!', 'success');
}

function downloadQRFromModal() {
  const canvas = document.querySelector('#modal-qr-display canvas');
  if (!canvas) { showToast('QR not ready', 'error'); return; }
  const link = document.createElement('a');
  link.download = `BarkID_${lastRegisteredId}.png`;
  link.href = canvas.toDataURL();
  link.click();
}

function viewQR(id) {
  openDogProfile(id).then(() => {
    setTimeout(() => switchProfileTab('qr', null), 200);
  });
}

// ════════════════════════════════════════════════
// INVENTORY MODE
// ════════════════════════════════════════════════
function openInventoryModal() {
  document.getElementById('inventory-output').innerHTML = '';
  openModal('inventory-modal');
}

function generateInventory() {
  const count = Math.min(parseInt(document.getElementById('inventory-count').value) || 10, 50);
  const out = document.getElementById('inventory-output');
  out.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const blank = 'BLANK-' + Math.random().toString(36).substring(2,10).toUpperCase();
    const div = document.createElement('div');
    div.style.cssText = 'text-align:center;padding:8px;background:#fff;border:1px solid var(--border);border-radius:8px;cursor:pointer;';
    div.innerHTML = `<div id="inv-${i}" style="width:60px;height:60px;margin:0 auto;"></div><div style="font-size:0.6rem;margin-top:4px;font-weight:700;">${blank.substring(6,12)}</div>`;
    out.appendChild(div);
    new QRCode(document.getElementById('inv-' + i), {
      text: `BARKID:BLANK:${blank}`, width: 60, height: 60,
      colorDark: '#1a1008', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H
    });
  }
  showToast(`${count} blank tags generated`, 'success');
}

// ════════════════════════════════════════════════
// DONATE (simulated)
// ════════════════════════════════════════════════
function selectDonate(amt, btn) {
  selectedDonateAmount = amt;
  document.querySelectorAll('.donate-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}
function handleDonate() {
  showToast(`❤️ ₹${selectedDonateAmount} donation simulated! Thank you!`, 'success');
}

// ════════════════════════════════════════════════
// CSV EXPORT
// ════════════════════════════════════════════════
async function exportCSV() {
  try {
    const res = await fetch(`${API_BASE}/api/dogs`);
    const dogs = await res.json();
    const headers = ['ID','Name','Sex','Age Group','Species','Status','Sterilized','Vax Bitmask','Missing'];
    const rows = dogs.map(d => [d.id, d.name, d.sex, d.age_group, d.species, d.status, d.sterilization_status, d.vaccination_bit_mask, d.is_missing]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = 'BarkID_Export.csv';
    link.click();
    showToast('CSV exported', 'success');
  } catch { showToast('Export failed', 'error'); }
}

// ════════════════════════════════════════════════
// MODAL HELPERS
// ════════════════════════════════════════════════
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
});

// ════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════
let toastTimer;
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.className = '', 3200);
}

// ════════════════════════════════════════════════
// DEEP LINK: support ?id=dog_xxx&name=…&… in URL
// ════════════════════════════════════════════════
(async function init() {
  const params     = new URLSearchParams(window.location.search);
  const deepLinkId = params.get('id');

  if (deepLinkId) {
    // Open profile immediately — URL params render first, backend refreshes after
    openDogProfile(deepLinkId, params);
    // Load the grid silently in the background so Home tab works if user navigates back
    loadDogGrid();
  } else {
    // Normal home-page load
    await loadDogGrid();
  }
})();