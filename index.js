require('dotenv').config();

const path = require('path');
const express = require('express');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const { loadConfig, saveConfig, normalizeConfig, validateConfig, getConfigWarnings, CONFIG_PATH } = require('./config');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

let config = loadConfig();

let runtime = {
  ready: false,
  lastError: null,
  lastQr: null,
  lastQrAt: null,
  lastQrDataUrl: null,
  cachedTargetId: null,
  cachedTargetName: null,
  sourceIdSet: new Set(),
  sourceNameSet: new Set(),
  kwLower: [],
};

const norm = (s) => (s || '').trim().toLowerCase();

function applyRuntimeConfig(cfg) {
  config = cfg;
  runtime.sourceIdSet = new Set((cfg.whatsapp.sources || []).map((s) => s.id).filter(Boolean));
  runtime.sourceNameSet = new Set((cfg.whatsapp.sources || []).map((s) => norm(s.name)).filter(Boolean));
  runtime.kwLower = (cfg.whatsapp.keywords || []).map((k) => norm(k)).filter(Boolean);
  runtime.cachedTargetId = cfg.whatsapp.target?.id ? cfg.whatsapp.target.id : null;
  runtime.cachedTargetName = cfg.whatsapp.target?.name ? cfg.whatsapp.target.name : null;
}

applyRuntimeConfig(config);

function containsKeyword(text) {
  const t = (text || '').toLowerCase();
  return runtime.kwLower.some((k) => t.includes(k));
}

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'wa-forwarder' }),
  puppeteer: {
    headless: !!config.whatsapp.headless,
    executablePath: config.whatsapp.puppeteerExecutablePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

async function updateQr(qr) {
  runtime.lastQr = qr;
  runtime.lastQrAt = Date.now();
  runtime.lastQrDataUrl = null;
  try {
    runtime.lastQrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 6 });
  } catch {
    runtime.lastQrDataUrl = null;
  }
}

client.on('qr', async (qr) => {
  console.log('QR отримано. Відскануй у WhatsApp на телефоні.');
  qrcodeTerminal.generate(qr, { small: true });
  await updateQr(qr);
});

client.on('ready', async () => {
  runtime.ready = true;
  console.log('✅ WhatsApp client ready');
});

client.on('auth_failure', (msg) => {
  runtime.lastError = `auth_failure: ${msg || ''}`.trim();
  console.error('[ERR]', runtime.lastError);
});

client.on('disconnected', (reason) => {
  runtime.ready = false;
  runtime.lastError = `disconnected: ${reason || ''}`.trim();
  console.error('[ERR]', runtime.lastError);
});

process.on('unhandledRejection', (err) => {
  runtime.lastError = err?.stack || String(err);
  console.error('[UNHANDLED]', runtime.lastError);
});

process.on('uncaughtException', (err) => {
  runtime.lastError = err?.stack || String(err);
  console.error('[UNCAUGHT]', runtime.lastError);
});

async function resolveTargetId() {
  if (runtime.cachedTargetId) return runtime.cachedTargetId;
  const name = config.whatsapp.target?.name || '';
  if (!name) return null;

  const chats = await client.getChats();
  const target = chats.find((c) => c.isGroup && norm(c.name) === norm(name));
  if (!target) return null;
  runtime.cachedTargetId = target.id?._serialized || null;
  runtime.cachedTargetName = target.name || name;
  return runtime.cachedTargetId;
}

async function handleMessage(msg) {
  try {
    if (!config.whatsapp.allowOwn && msg.fromMe) return;

    const chat = await msg.getChat();
    if (!chat.isGroup) return;

    const chatId = chat.id?._serialized || '';
    const chatNameNorm = norm(chat.name);
    const isSource =
      (chatId && runtime.sourceIdSet.has(chatId)) || (chatNameNorm && runtime.sourceNameSet.has(chatNameNorm));
    if (!isSource) {
      if (config.whatsapp.debug) console.log(`[DBG] Ignore "${chat.name}" (not in sources)`);
      return;
    }

    const text = msg.body || '';
    if (!containsKeyword(text)) {
      if (config.whatsapp.debug) console.log(`[DBG] No keyword match from "${chat.name}": ${text.slice(0, 120)}`);
      return;
    }

    const targetId = await resolveTargetId();
    if (!targetId) {
      if (config.whatsapp.debug) console.log('[DBG] Target not resolved yet');
      return;
    }

    const prefix = `[${chat.name}] `;
    await client.sendMessage(targetId, `${prefix}${text}`);

    console.log(`✅ Sent to "${runtime.cachedTargetName || config.whatsapp.target?.name || 'target'}" from "${chat.name}"`);
  } catch (e) {
    runtime.lastError = e?.stack || String(e);
    console.error('Error handling message:', e);
  }
}

client.on('message', handleMessage);
client.on('message_create', handleMessage);

app.get('/api/status', (_req, res) => {
  const sources = (config.whatsapp.sources || []).map((s) => s.name || s.id).filter(Boolean);
  res.json({
    ready: runtime.ready,
    lastError: runtime.lastError,
    warnings: getConfigWarnings(config),
    target: config.whatsapp.target?.name || config.whatsapp.target?.id || '',
    sources: sources.slice(0, 5).join(', ') + (sources.length > 5 ? ` (+${sources.length - 5})` : ''),
    configPath: CONFIG_PATH,
  });
});

app.get('/api/qr', (_req, res) => {
  res.json({
    ready: runtime.ready,
    lastError: runtime.lastError,
    hasQr: !!runtime.lastQrDataUrl,
    dataUrl: runtime.lastQrDataUrl,
    at: runtime.lastQrAt,
  });
});

app.get('/api/config', (_req, res) => {
  res.json(config);
});

app.post('/api/config', (req, res) => {
  try {
    const before = config;
    const incoming = normalizeConfig(req.body || {});
    const errors = validateConfig(incoming);
    if (errors.length) return res.status(400).json({ error: 'Invalid config', details: errors });

    const saved = saveConfig(incoming);
    applyRuntimeConfig(saved);

    const needsRestart =
      before.whatsapp.puppeteerExecutablePath !== saved.whatsapp.puppeteerExecutablePath ||
      !!before.whatsapp.headless !== !!saved.whatsapp.headless;

    if (saved.whatsapp.target?.id) runtime.cachedTargetId = saved.whatsapp.target.id;
    else runtime.cachedTargetId = null;
    runtime.cachedTargetName = saved.whatsapp.target?.name || null;

    res.json({
      ok: true,
      needsRestart,
      warnings: getConfigWarnings(saved),
      message: needsRestart
        ? 'Збережено. Для зміни браузера/Headless потрібен перезапуск бота.'
        : 'Збережено. Зміни застосовані.',
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Failed to save', details: e?.errors || null });
  }
});

app.get('/api/groups', async (_req, res) => {
  try {
    if (!runtime.ready) return res.status(409).json({ error: 'WhatsApp client not ready yet' });
    const chats = await client.getChats();
    const groups = chats
      .filter((c) => c.isGroup)
      .map((c) => ({ id: c.id?._serialized || '', name: c.name || '' }))
      .filter((g) => g.id && g.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    res.json({ groups });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Failed to fetch groups' });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(config.web.port, config.web.bind, () => {
  console.log(`🌐 Web UI: http://${config.web.bind}:${config.web.port}`);
});

client.initialize();
