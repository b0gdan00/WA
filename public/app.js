const el = (id) => document.getElementById(id);

function hide(id) {
  el(id).classList.add('d-none');
}

function showText(id, msg) {
  const e = el(id);
  e.textContent = msg;
  e.classList.remove('d-none');
}

function setBadge(id, text, klass) {
  const b = el(id);
  b.textContent = text;
  b.className = `badge ${klass}`;
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
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
    const e = new Error(msg);
    e.details = json;
    throw e;
  }
  return json;
}

let groups = [];
let keywords = [];
let saving = false;
let dirty = false;

function setSaveState(state) {
  if (state === 'saving') return setBadge('saveState', 'збереження…', 'text-bg-primary');
  if (state === 'dirty') return setBadge('saveState', 'є зміни', 'text-bg-warning');
  if (state === 'ok') return setBadge('saveState', 'збережено', 'text-bg-success');
  if (state === 'error') return setBadge('saveState', 'помилка', 'text-bg-danger');
  return setBadge('saveState', '…', 'text-bg-secondary');
}

function normalizeKeyword(s) {
  return (s || '').trim();
}

function renderKeywords() {
  const list = el('keywordsList');
  list.innerHTML = '';

  if (!keywords.length) {
    const empty = document.createElement('div');
    empty.className = 'list-group-item text-secondary';
    empty.textContent = 'Немає ключових слів.';
    list.appendChild(empty);
    return;
  }

  keywords.forEach((kw, idx) => {
    const item = document.createElement('div');
    item.className = 'list-group-item';

    const row = document.createElement('div');
    row.className = 'keyword-item';

    const text = document.createElement('div');
    text.className = 'keyword-text';
    text.textContent = kw;

    const actions = document.createElement('div');
    actions.className = 'btn-group btn-group-sm';

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'btn btn-outline-danger';
    btnDel.textContent = 'Видалити';

    actions.appendChild(btnDel);
    row.appendChild(text);
    row.appendChild(actions);
    item.appendChild(row);

    btnDel.addEventListener('click', () => {
      keywords = keywords.filter((_, i) => i !== idx);
      renderKeywords();
      markDirtyAndAutosave();
    });

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

function renderSources() {
  const filter = (el('sourcesFilter').value || '').trim().toLowerCase();
  const selected = currentSelectedSourceIds();

  const box = el('sourcesList');
  box.innerHTML = '';

  const visible = groups.filter((g) => g.name.toLowerCase().includes(filter));
  if (visible.length === 0) {
    box.innerHTML = '<div class="text-secondary small">Немає груп (або нічого не знайдено).</div>';
    return;
  }

  for (const g of visible) {
    const id = `src_${g.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const row = document.createElement('div');
    row.className = 'form-check';
    row.innerHTML = `
      <input class="form-check-input" type="checkbox" id="${id}" data-source-id="${g.id}">
      <label class="form-check-label" for="${id}">${g.name}</label>
    `;
    const input = row.querySelector('input');
    input.checked = selected.has(g.id);
    input.addEventListener('change', () => markDirtyAndAutosave());
    box.appendChild(row);
  }
}

function fillGroupsIntoTargetSelect() {
  const sel = el('targetSelect');
  const currentId = el('targetId').value || sel.value;
  const currentName = el('targetName').value;
  const currentNameNorm = (currentName || '').toLowerCase();
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

  keywords = (cfg.whatsapp?.keywords || []).map(normalizeKeyword).filter(Boolean);
  renderKeywords();

  if (groups.length) {
    const targetId = el('targetId').value.trim();
    const targetName = el('targetName').value.trim();
    if (targetId || targetName) fillGroupsIntoTargetSelect();
    const selectedIds = new Set((cfg.whatsapp?.sources || []).map((s) => s.id).filter(Boolean));
    for (const input of document.querySelectorAll('input[data-source-id]')) {
      input.checked = selectedIds.has(input.getAttribute('data-source-id'));
    }
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
        name:
          el('targetSelect').selectedOptions?.[0]?.textContent?.trim() ||
          el('targetName').value.trim(),
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
    setBadge('badgeReady', status.ready ? 'READY' : 'NOT READY', status.ready ? 'text-bg-success' : 'text-bg-secondary');

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
    renderSources();
    await refreshConfig();
  } catch (e) {
    if (!silent) showText('saveErr', e.message || String(e));
  }
}

async function saveNow() {
  if (saving) return;
  saving = true;
  setSaveState('saving');
  hide('saveErr');
  try {
    const body = readForm();
    const res = await apiPost('/api/config', body);
    dirty = false;
    setSaveState('ok');
    if (res?.warnings?.length) showText('statusWarn', res.warnings.join('\n'));
    await refreshStatus();
  } catch (e) {
    setSaveState('error');
    const details = e.details?.details?.join?.('\n') || e.details?.details || '';
    showText('saveErr', `${e.message}${details ? `\n${details}` : ''}`);
  } finally {
    saving = false;
  }
}

const saveDebounced = debounce(() => {
  if (!dirty) return;
  saveNow().catch(() => {});
}, 500);

function markDirtyAndAutosave() {
  dirty = true;
  setSaveState('dirty');
  saveDebounced();
}

function wireAutosave() {
  const onAny = () => markDirtyAndAutosave();
  initTooltips();

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
    markDirtyAndAutosave();
  });

  el('keywordNew').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('btnKeywordAdd').click();
  });
}

el('btnRefresh').addEventListener('click', async () => {
  await refreshStatus();
  await refreshConfig();
});
el('btnLoadGroups').addEventListener('click', () => loadGroups(false));

wireAutosave();
setSaveState('ok');

setInterval(() => {
  refreshStatus().catch(() => {});
}, 5000);

refreshStatus().catch(() => {});
refreshConfig().catch(() => {});
loadGroups(true).catch(() => {});

function initTooltips() {
  if (!window.bootstrap?.Tooltip) return;
  document.querySelectorAll('.help-hint').forEach((el) => {
    if (el.dataset.bsToggle === 'tooltip') return;
    el.dataset.bsToggle = 'tooltip';
    el.dataset.bsPlacement = 'top';
    bootstrap.Tooltip.getOrCreateInstance(el, {
      trigger: 'hover focus',
      title: el.getAttribute('title') || '',
    });
  });
}
