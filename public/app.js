const el = (id) => document.getElementById(id);

function hide(id) {
  el(id)?.classList.add('hidden');
}

function showText(id, msg) {
  const element = el(id);
  if (!element) return;
  element.textContent = msg;
  element.classList.remove('hidden');
}

function setBadge(id, text, variant) {
  const badge = el(id);
  if (!badge) return;

  const v = String(variant || '');
  const isSuccess = v.includes('success') || v === 'success';
  const isWarning = v.includes('warning') || v.includes('amber') || v === 'warning';
  const isDanger = v.includes('danger') || v.includes('error') || v.includes('rose') || v === 'error';
  const isPrimary = v.includes('primary') || v === 'primary';

  let klass = 'bg-slate-100 text-slate-700';
  if (isPrimary) klass = 'bg-slate-900 text-white';
  if (isSuccess) klass = 'bg-emerald-100 text-emerald-800';
  if (isWarning) klass = 'bg-amber-100 text-amber-900';
  if (isDanger) klass = 'bg-rose-100 text-rose-900';

  badge.textContent = text;
  badge.className = `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${klass}`;
}

async function apiGet(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error || `${path}: ${res.status}`;
    const err = new Error(msg);
    err.details = json;
    throw err;
  }
  return json;
}

let groups = [];
let keywords = [];
let saving = false;
let dirty = false;
let pendingSourceIds = new Set();

function setSaveState(state) {
  if (state === 'saving') return setBadge('saveState', 'зберігаю…', 'primary');
  if (state === 'dirty') return setBadge('saveState', 'є зміни', 'warning');
  if (state === 'ok') return setBadge('saveState', 'збережено', 'success');
  if (state === 'error') return setBadge('saveState', 'помилка', 'error');
  return setBadge('saveState', '—', '');
}

function setDirty(nextDirty) {
  dirty = !!nextDirty;

  const notice = el('unsavedNotice');
  if (notice) notice.classList.toggle('hidden', !dirty);

  const btnSave = el('btnSave');
  if (btnSave) btnSave.disabled = !dirty || saving;

  if (!saving) setSaveState(dirty ? 'dirty' : 'ok');
}

function markDirty() {
  setDirty(true);
}

function normalizeKeyword(s) {
  return (s || '').trim();
}

function renderKeywords() {
  const list = el('keywordsList');
  if (!list) return;
  list.innerHTML = '';

  if (!keywords.length) {
    const empty = document.createElement('div');
    empty.className = 'px-3 py-2 text-sm text-slate-500';
    empty.textContent = 'Немає ключових слів.';
    list.appendChild(empty);
    return;
  }

  keywords.forEach((kw, idx) => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between gap-3 px-3 py-2';

    const text = document.createElement('div');
    text.className = 'min-w-0 flex-1 truncate text-sm text-slate-900';
    text.textContent = kw;

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className =
      'inline-flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100';
    btnDel.innerHTML = '<i class="fa-solid fa-trash"></i><span>Видалити</span>';

    btnDel.addEventListener('click', () => {
      keywords = keywords.filter((_, i) => i !== idx);
      renderKeywords();
      markDirty();
    });

    item.appendChild(text);
    item.appendChild(btnDel);
    list.appendChild(item);
  });
}

function currentSelectedSourceIds() {
  return new Set(
    Array.from(document.querySelectorAll('input[data-source-id]'))
      .filter((i) => i.checked)
      .map((i) => i.getAttribute('data-source-id'))
  );
}

function renderSources(forcedSelectedIds = null) {
  const filter = (el('sourcesFilter')?.value || '').trim().toLowerCase();
  const selected = forcedSelectedIds ? new Set(forcedSelectedIds) : currentSelectedSourceIds();

  const box = el('sourcesList');
  if (!box) return;
  box.innerHTML = '';

  const visible = groups.filter((g) => g.name.toLowerCase().includes(filter));
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'px-2 py-1 text-sm text-slate-500';
    empty.textContent = 'Немає груп (або фільтр не співпав).';
    box.appendChild(empty);
    return;
  }

  for (const g of visible) {
    const id = `src_${g.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const row = document.createElement('label');
    row.className = 'flex cursor-pointer items-start gap-3 rounded-md px-2 py-1 hover:bg-slate-50';
    row.setAttribute('for', id);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.className = 'mt-1 h-4 w-4 rounded border-slate-300 text-slate-900';
    input.setAttribute('data-source-id', g.id);
    input.checked = selected.has(g.id);
    input.addEventListener('change', () => markDirty());

    const name = document.createElement('div');
    name.className = 'min-w-0 flex-1 text-sm text-slate-900';
    name.textContent = g.name;

    row.appendChild(input);
    row.appendChild(name);
    box.appendChild(row);
  }
}

function fillGroupsIntoTargetSelect() {
  const sel = el('targetSelect');
  if (!sel) return;

  const currentId = el('targetId')?.value || sel.value;
  const currentName = el('targetName')?.value || '';
  const currentNameNorm = currentName.toLowerCase();

  sel.innerHTML = '<option value="">(спочатку отримайте список груп)</option>';
  for (const g of groups) {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    sel.appendChild(opt);
  }

  const byId = currentId && groups.find((g) => g.id === currentId);
  const byName = !byId && currentName ? groups.find((g) => (g.name || '').toLowerCase() === currentNameNorm) : null;

  if (byId) {
    sel.value = byId.id;
    el('targetId').value = byId.id;
    el('targetName').value = byId.name;
  } else if (byName) {
    sel.value = byName.id;
    el('targetId').value = byName.id;
    el('targetName').value = byName.name;
  } else {
    sel.value = '';
    el('targetId').value = '';
    el('targetName').value = '';
  }
}

function fillForm(cfg) {
  el('webBind').value = cfg.web?.bind ?? '127.0.0.1';
  el('webPort').value = cfg.web?.port ?? 3000;

  el('allowOwn').checked = !!cfg.whatsapp?.allowOwn;
  el('debug').checked = !!cfg.whatsapp?.debug;
  el('headless').checked = !!cfg.whatsapp?.headless;
  el('puppeteerExecutablePath').value = cfg.whatsapp?.puppeteerExecutablePath ?? '';

  el('targetId').value = cfg.whatsapp?.target?.id ?? '';
  el('targetName').value = cfg.whatsapp?.target?.name ?? '';

  pendingSourceIds = new Set((cfg.whatsapp?.sources || []).map((s) => s.id).filter(Boolean));

  keywords = (cfg.whatsapp?.keywords || []).map(normalizeKeyword).filter(Boolean);
  renderKeywords();

  if (groups.length) {
    const targetId = el('targetId').value.trim();
    const targetName = el('targetName').value.trim();
    if (targetId || targetName) fillGroupsIntoTargetSelect();
    renderSources(pendingSourceIds);
  }
}

function readForm() {
  const selectedIds = Array.from(document.querySelectorAll('input[data-source-id]'))
    .filter((i) => i.checked)
    .map((i) => i.getAttribute('data-source-id'));

  const sources = selectedIds
    .map((id) => groups.find((g) => g.id === id))
    .filter(Boolean)
    .map((g) => ({ id: g.id, name: g.name }));

  return {
    web: {
      bind: el('webBind').value.trim(),
      port: Number(el('webPort').value),
    },
    whatsapp: {
      allowOwn: el('allowOwn').checked,
      debug: el('debug').checked,
      headless: el('headless').checked,
      puppeteerExecutablePath: el('puppeteerExecutablePath').value.trim(),
      target: {
        id: el('targetSelect').value.trim() || el('targetId').value.trim(),
        name: el('targetSelect').selectedOptions?.[0]?.textContent?.trim() || el('targetName').value.trim(),
      },
      sources,
      keywords,
    },
  };
}

async function refreshStatus() {
  hide('statusError');
  hide('statusWarn');
  try {
    const status = await apiGet('/api/status');
    setBadge('badgeReady', status.ready ? 'READY' : 'NOT READY', status.ready ? 'success' : '');

    if (status.warnings && status.warnings.length) showText('statusWarn', status.warnings.join('\n'));
    if (status.lastError) showText('statusError', status.lastError);
  } catch (e) {
    showText('statusError', e.message || String(e));
  }
}

async function refreshConfig() {
  try {
    const cfg = await apiGet('/api/config');
    fillForm(cfg);
    setDirty(false);
  } catch {
    // ignore
  }
}

async function loadGroups(silent = false) {
  hide('saveErr');
  try {
    const data = await apiGet('/api/groups');
    groups = data.groups || [];
    fillGroupsIntoTargetSelect();
    renderSources(pendingSourceIds);
  } catch (e) {
    if (!silent) showText('saveErr', e.message || String(e));
  }
}

async function saveNow() {
  if (saving) return;
  saving = true;
  setDirty(dirty);
  setSaveState('saving');
  hide('saveErr');
  try {
    const body = readForm();
    const res = await apiPost('/api/config', body);
    setDirty(false);
    pendingSourceIds = new Set((body.whatsapp?.sources || []).map((s) => s.id).filter(Boolean));
    if (res?.warnings?.length) showText('statusWarn', res.warnings.join('\n'));
    await refreshStatus();
  } catch (e) {
    setSaveState('error');
    const details = e.details?.details?.join?.('\n') || e.details?.details || '';
    showText('saveErr', `${e.message}${details ? `\n${details}` : ''}`);
  } finally {
    saving = false;
    setDirty(dirty);
  }
}

function wireFormHandlers() {
  const onAny = () => markDirty();

  el('webBind').addEventListener('input', onAny);
  el('webPort').addEventListener('input', onAny);

  el('targetSelect').addEventListener('change', () => {
    const opt = el('targetSelect').selectedOptions?.[0];
    const val = opt?.value || '';
    el('targetId').value = val;
    el('targetName').value = val ? opt.textContent : '';
    onAny();
  });

  el('allowOwn').addEventListener('change', onAny);
  el('debug').addEventListener('change', onAny);
  el('headless').addEventListener('change', onAny);
  el('puppeteerExecutablePath').addEventListener('input', onAny);

  el('sourcesFilter').addEventListener('input', () => renderSources());
  el('btnSourcesAll').addEventListener('click', () => {
    for (const input of document.querySelectorAll('input[data-source-id]')) input.checked = true;
    onAny();
  });
  el('btnSourcesNone').addEventListener('click', () => {
    for (const input of document.querySelectorAll('input[data-source-id]')) input.checked = false;
    onAny();
  });

  el('btnKeywordAdd').addEventListener('click', () => {
    const next = normalizeKeyword(el('keywordNew').value);
    if (!next) return;
    keywords = Array.from(new Set([...keywords, next]));
    el('keywordNew').value = '';
    renderKeywords();
    onAny();
  });

  el('keywordNew').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('btnKeywordAdd').click();
  });
}

el('btnSave').addEventListener('click', () => saveNow().catch(() => {}));

el('btnRefresh').addEventListener('click', async () => {
  await refreshStatus();

  if (!dirty) {
    await refreshConfig();
    return;
  }

  const ok = window.confirm('Є незбережені зміни. Оновлення конфігурації може їх перезаписати. Продовжити?');
  if (ok) await refreshConfig();
});

el('btnLoadGroups').addEventListener('click', async () => {
  await loadGroups(false);
});

wireFormHandlers();
setDirty(false);

refreshStatus().catch(() => {});
refreshConfig()
  .catch(() => {})
  .finally(() => loadGroups(true).catch(() => {}));

window.addEventListener('beforeunload', (e) => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = '';
});
