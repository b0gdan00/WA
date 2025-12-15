const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = Object.freeze({
  web: {
    bind: '127.0.0.1',
    port: 3000,
  },
  whatsapp: {
    mode: 'copy', // copy | forward
    allowOwn: false,
    debug: false,
    keywords: [],
    target: { id: '', name: '' },
    sources: [], // [{id,name}]
    puppeteerExecutablePath: '',
    headless: false,
  },
});

function parseBool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  const s = String(v).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return def;
}

function splitList(v) {
  if (!v) return [];
  return String(v)
    .split(/[\n|]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fromEnv() {
  return {
    web: {
      bind: (process.env.WEB_BIND || DEFAULT_CONFIG.web.bind).trim(),
      port: Number(process.env.WEB_PORT || DEFAULT_CONFIG.web.port) || DEFAULT_CONFIG.web.port,
    },
    whatsapp: {
      mode: (process.env.MODE || DEFAULT_CONFIG.whatsapp.mode).trim().toLowerCase(),
      allowOwn: parseBool(process.env.ALLOW_OWN, DEFAULT_CONFIG.whatsapp.allowOwn),
      debug: parseBool(process.env.DEBUG, DEFAULT_CONFIG.whatsapp.debug),
      keywords: splitList(process.env.KEYWORDS),
      target: { id: '', name: (process.env.TARGET_CHAT || '').trim() },
      sources: splitList(process.env.SOURCE_CHATS).map((name) => ({ id: '', name })),
      puppeteerExecutablePath: (process.env.PUPPETEER_EXECUTABLE_PATH || '').trim(),
      headless: parseBool(process.env.HEADLESS, DEFAULT_CONFIG.whatsapp.headless),
    },
  };
}

function deepMerge(base, override) {
  if (Array.isArray(base)) return Array.isArray(override) ? override : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    if (override && typeof override === 'object') {
      for (const [k, v] of Object.entries(override)) {
        if (k in base) out[k] = deepMerge(base[k], v);
        else out[k] = v;
      }
    }
    return out;
  }
  return override === undefined ? base : override;
}

function normalizeConfig(input) {
  const cfg = deepMerge(DEFAULT_CONFIG, input || {});
  cfg.web = cfg.web || {};
  cfg.whatsapp = cfg.whatsapp || {};

  cfg.web.bind = String(cfg.web.bind || DEFAULT_CONFIG.web.bind).trim() || DEFAULT_CONFIG.web.bind;
  cfg.web.port = Number(cfg.web.port || DEFAULT_CONFIG.web.port) || DEFAULT_CONFIG.web.port;

  cfg.whatsapp.mode = String(cfg.whatsapp.mode || DEFAULT_CONFIG.whatsapp.mode).trim().toLowerCase();
  cfg.whatsapp.allowOwn = !!cfg.whatsapp.allowOwn;
  cfg.whatsapp.debug = !!cfg.whatsapp.debug;
  cfg.whatsapp.headless = !!cfg.whatsapp.headless;
  cfg.whatsapp.puppeteerExecutablePath = String(cfg.whatsapp.puppeteerExecutablePath || '').trim();

  cfg.whatsapp.keywords = (cfg.whatsapp.keywords || [])
    .map((k) => String(k).trim())
    .filter(Boolean);

  cfg.whatsapp.target = cfg.whatsapp.target || { id: '', name: '' };
  cfg.whatsapp.target.id = String(cfg.whatsapp.target.id || '').trim();
  cfg.whatsapp.target.name = String(cfg.whatsapp.target.name || '').trim();

  cfg.whatsapp.sources = (cfg.whatsapp.sources || [])
    .map((s) => ({
      id: String(s?.id || '').trim(),
      name: String(s?.name || '').trim(),
    }))
    .filter((s) => s.id || s.name);

  return cfg;
}

function validateConfig(cfg) {
  const errors = [];
  if (cfg.web.port < 1 || cfg.web.port > 65535) errors.push('web.port must be 1..65535');
  if (cfg.whatsapp.mode !== 'copy' && cfg.whatsapp.mode !== 'forward') {
    errors.push('whatsapp.mode must be "copy" or "forward"');
  }
  return errors;
}

function getConfigWarnings(cfg) {
  const warnings = [];
  if (!cfg.whatsapp.target?.id && !cfg.whatsapp.target?.name) warnings.push('Не задано цільову групу (target).');
  if (!Array.isArray(cfg.whatsapp.sources) || cfg.whatsapp.sources.length === 0) warnings.push('Не вибрано групи-джерела (sources).');
  if (!Array.isArray(cfg.whatsapp.keywords) || cfg.whatsapp.keywords.length === 0) warnings.push('Не задано ключові слова.');
  return warnings;
}

function loadConfig() {
  const env = fromEnv();
  let disk = null;
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      disk = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
      disk = null;
    }
  }

  const merged = deepMerge(env, disk || {});

  const diskKeywords = disk?.whatsapp?.keywords;
  const diskSources = disk?.whatsapp?.sources;
  const diskTarget = disk?.whatsapp?.target;

  if (Array.isArray(diskKeywords) && diskKeywords.length === 0 && env.whatsapp.keywords.length) {
    merged.whatsapp.keywords = env.whatsapp.keywords;
  }
  if (Array.isArray(diskSources) && diskSources.length === 0 && env.whatsapp.sources.length) {
    merged.whatsapp.sources = env.whatsapp.sources;
  }
  if (diskTarget && !diskTarget.id && !diskTarget.name && (env.whatsapp.target.id || env.whatsapp.target.name)) {
    merged.whatsapp.target = env.whatsapp.target;
  }

  const cfg = normalizeConfig(merged);

  if (!fs.existsSync(CONFIG_PATH)) {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
    } catch {
      // ignore
    }
  }

  return cfg;
}

function saveConfig(cfg) {
  const normalized = normalizeConfig(cfg);
  const errors = validateConfig(normalized);
  if (errors.length) {
    const e = new Error('Invalid config');
    e.errors = errors;
    throw e;
  }
  const tmp = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
  return normalized;
}

module.exports = {
  CONFIG_PATH,
  DEFAULT_CONFIG,
  loadConfig,
  normalizeConfig,
  validateConfig,
  getConfigWarnings,
  saveConfig,
  splitList,
};
