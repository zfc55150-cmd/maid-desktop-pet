'use strict';

const RELEASE_NOTICE_API = 'https://api.github.com/repos/zfc55150-cmd/maid-desktop-pet/releases?per_page=10';
const ALLOWED_URL_PREFIX = 'https://github.com/zfc55150-cmd/maid-desktop-pet/';
const DEFAULT_DOWNLOAD_URL = 'https://github.com/zfc55150-cmd/maid-desktop-pet/releases';
const CHECK_INTERVAL_MS = 86400000;
const NO_ASSET_INTERVAL_MS = 3600000;
const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT = 'maid-desktop-pet-release-notice/1.0';
const FORMAL_TAG = /^v(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})$/;
const GPT_ZIP = /^GPTNiang-v\d+\.\d+\.\d+-electron(?:\.\d+)?-win-x64\.zip$/;

function parseReleaseVersion(tag) {
  if (typeof tag !== 'string') return null;
  const match = /^[vV]?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(tag.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareReleaseVersions(a, b) {
  const left = parseReleaseVersion(a);
  const right = parseReleaseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

function isNewerRelease(localTag, remoteTag) {
  return compareReleaseVersions(localTag, remoteTag) === -1;
}

function newestMatchingRelease(releases, assetKind) {
  let newest = null;
  for (const release of releases) {
    const tag = release?.tag_name;
    if (release?.draft !== false || release?.prerelease !== false || !FORMAL_TAG.test(tag)) continue;
    if (assetKind && (!Array.isArray(release.assets) || !release.assets.some(asset =>
      asset?.state === 'uploaded' && Number.isFinite(asset.size) && asset.size > 0 &&
      (assetKind === 'gpt' ? GPT_ZIP.test(asset.name) :
        assetKind === 'deepseek' && asset.name === `DeepSeekActionPet-${tag}-win-x64.zip`)))) continue;
    if (!newest || isNewerRelease(newest.tag_name, tag)) newest = release;
  }
  return newest;
}

function isAllowedReleaseUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(ALLOWED_URL_PREFIX) || /[\s"'<>\\]/.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com' && parsed.pathname.startsWith('/zfc55150-cmd/maid-desktop-pet/');
  } catch {
    return false;
  }
}

function sanitizeReleaseUrl(url) {
  return isAllowedReleaseUrl(url) ? url : DEFAULT_DOWNLOAD_URL;
}

function getHeader(headers, name) {
  if (!headers) return null;
  const lower = name.toLowerCase();
  if (typeof headers.get === 'function') {
    const val = headers.get(name) ?? headers.get(lower);
    if (val !== undefined && val !== null) return String(val);
  }
  if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === lower && v !== undefined && v !== null) return String(v);
    }
  }
  return null;
}

function computeResetTimeMs(headers, nowMs) {
  const retryAfter = getHeader(headers, 'retry-after');
  if (retryAfter !== null) {
    const seconds = Number(retryAfter.trim());
    if (Number.isFinite(seconds) && seconds > 0) return nowMs + Math.ceil(seconds * 1000);
  }
  const reset = getHeader(headers, 'x-ratelimit-reset');
  if (reset !== null) {
    const raw = Number(reset.trim());
    if (Number.isFinite(raw) && raw > 0) {
      const resetMs = raw < 1e11 ? Math.ceil(raw * 1000) : Math.ceil(raw);
      if (resetMs > nowMs) return resetMs;
    }
  }
  return nowMs + 3600000;
}

const NOTICE_MESSAGES = {
  'zh-CN': {
    later: '稍后',
    checking: '本仓库新版本：正在检查 GitHub Release…',
    available: tag => `本仓库新版本：发现新版本 ${tag}`,
    current: tag => `本仓库新版本：已是最新版本（${tag}）`,
    noAsset: '本仓库新版本：近期发布中未找到本桌宠的下载包',
    rateLimitedDefault: time => `GitHub 访问限流，请于 ${time} 后重试`,
    rateLimitedStatus: msg => `本仓库新版本：${msg}`,
    failedDefault: '网络不可用，无法连接 GitHub Release',
    failedStatus: msg => `本仓库新版本：${msg}`,
    idle: '本仓库新版本：仅检查与提醒，不自动下载或改写程序',
    fetchUnavailable: '当前运行环境不支持网络请求（fetch 不可用）',
    timeout: '连接 GitHub 超时（10秒），请检查网络后重试',
    offline: detail => `网络不可用，无法连接 GitHub（${detail}）`,
    unknownError: '连接失败',
    rateLimitedHttp: (status, time) => `GitHub 访问受限（HTTP ${status || 403}），限流至 ${time}`,
    httpError: status => `GitHub 服务返回异常状态（HTTP ${status || '未知'}）`,
    parseError: 'GitHub Release 响应解析失败',
    invalidLocalTag: '本地发布版本号格式无效',
    bubble: tag => `主人，有新版本 ${tag} 啦，去设置里看看～`
  },
  ja: {
    later: '後ほど',
    checking: '新バージョン：GitHub Release を確認中…',
    available: tag => `新バージョン：${tag} が公開されています`,
    current: tag => `新バージョン：最新バージョンです（${tag}）`,
    noAsset: '新バージョン：最近のリリースにこのペット用のパッケージが見つかりませんでした',
    rateLimitedDefault: time => `GitHub のレート制限に達しました。${time} 以降に再試行してください`,
    rateLimitedStatus: msg => `新バージョン：${msg}`,
    failedDefault: 'ネットワークが利用できないため、GitHub Release に接続できません',
    failedStatus: msg => `新バージョン：${msg}`,
    idle: '新バージョン：確認とお知らせのみ行い、自動ダウンロードや書き換えは行いません',
    fetchUnavailable: '現在の実行環境はネットワークリクエスト（fetch）に対応していません',
    timeout: 'GitHub への接続がタイムアウトしました（10秒）。ネットワークを確認して再試行してください',
    offline: detail => `ネットワークが利用できないため、GitHub に接続できません（${detail}）`,
    unknownError: '接続失敗',
    rateLimitedHttp: (status, time) => `GitHub アクセス制限（HTTP ${status || 403}）。${time} まで待機してください`,
    httpError: status => `GitHub から異常なステータスが返されました（HTTP ${status || '不明'}）`,
    parseError: 'GitHub Release の応答を解析できませんでした',
    invalidLocalTag: 'ローカルのバージョン表記が無効です',
    bubble: tag => `ご主人、新しいバージョン ${tag} が出ていますよ。設定から確認してみてね～`
  }
};
const noticeMsg = (lang = 'zh-CN') => NOTICE_MESSAGES[lang === 'ja' ? 'ja' : 'zh-CN'];

function formatClock(ms, lang = 'zh-CN') {
  const m = noticeMsg(lang);
  if (!Number.isFinite(ms) || ms <= 0) return m.later;
  try {
    return new Date(ms).toLocaleTimeString(lang === 'ja' ? 'ja-JP' : 'zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return m.later;
  }
}

function normalizeReleaseState(raw = {}, localTag = 'v1.0.0') {
  const v = raw && typeof raw === 'object' ? raw : {};
  const validTag = typeof v.latestTag === 'string' && parseReleaseVersion(v.latestTag) ? v.latestTag.trim() : null;
  const phase = ['idle', 'checking', 'current', 'available', 'no-asset', 'rate-limited', 'failed'].includes(v.phase) ? v.phase : 'idle';
  const url = isAllowedReleaseUrl(v.url) ? v.url : (validTag ? DEFAULT_DOWNLOAD_URL : null);
  const checkedAt = Number.isFinite(v.checkedAt) ? v.checkedAt : null;
  const lastNotifiedTag = typeof v.lastNotifiedTag === 'string' && v.lastNotifiedTag.trim() ? v.lastNotifiedTag.trim() : null;
  const retryAfterAt = Number.isFinite(v.retryAfterAt) && v.retryAfterAt > 0 ? v.retryAfterAt : null;
  const errorReason = typeof v.errorReason === 'string' && v.errorReason.trim() ? v.errorReason.trim().slice(0, 160) : null;
  const hasUpdate = Boolean(validTag && isNewerRelease(localTag, validTag));
  return {
    latestTag: validTag,
    url,
    checkedAt,
    phase: hasUpdate && phase === 'current' ? 'available' : phase,
    lastNotifiedTag,
    retryAfterAt,
    errorReason,
    hasUpdate
  };
}

function formatReleaseStatusText(state, localTag = 'v1.0.0', lang = 'zh-CN') {
  const s = normalizeReleaseState(state, localTag);
  const m = noticeMsg(lang);
  switch (s.phase) {
    case 'checking':
      return m.checking;
    case 'available':
      return m.available(s.latestTag);
    case 'current':
      return m.current(s.latestTag || localTag);
    case 'no-asset':
      return m.noAsset;
    case 'rate-limited':
      return m.rateLimitedStatus(s.errorReason || m.rateLimitedDefault(formatClock(s.retryAfterAt, lang)));
    case 'failed':
      return m.failedStatus(s.errorReason || m.failedDefault);
    default:
      return m.idle;
  }
}

function readStore(store) {
  if (!store) return {};
  if (typeof store.value === 'object' && store.value !== null) return store.value;
  return store;
}

function writeStore(store, patch) {
  if (!store) return patch;
  if (typeof store.update === 'function') return store.update(patch);
  Object.assign(store, patch);
  return store;
}

async function checkReleaseNotice({
  store,
  localTag = 'v1.0.0',
  mode = 'automatic',
  force = false,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs = REQUEST_TIMEOUT_MS,
  onNotify = null,
  assetKind = null,
  lang = 'zh-CN'
} = {}) {
  const m = noticeMsg(lang);
  const nowMs = typeof now === 'function' ? now() : Number(now);
  const saved = readStore(store);
  const current = normalizeReleaseState(saved, localTag);

  if (current.retryAfterAt && nowMs < current.retryAfterAt) {
    const reason = current.errorReason || m.rateLimitedDefault(formatClock(current.retryAfterAt, lang));
    const blocked = {
      latestTag: current.latestTag,
      url: current.url,
      checkedAt: current.checkedAt,
      phase: 'rate-limited',
      lastNotifiedTag: current.lastNotifiedTag,
      retryAfterAt: current.retryAfterAt,
      errorReason: reason
    };
    writeStore(store, blocked);
    return { ok: false, skipped: 'rate-limited', notified: false, state: normalizeReleaseState(blocked, localTag) };
  }

  const interval = current.phase === 'no-asset' ? NO_ASSET_INTERVAL_MS : CHECK_INTERVAL_MS;
  if (!force && mode === 'automatic' && saved.releaseListChecked === true &&
      current.checkedAt && nowMs - current.checkedAt < interval) {
    return { ok: true, skipped: 'throttled', notified: false, state: current };
  }

  if (typeof fetchImpl !== 'function') {
    const failed = {
      latestTag: current.latestTag,
      url: current.url,
      checkedAt: nowMs,
      releaseListChecked: true,
      phase: 'failed',
      lastNotifiedTag: current.lastNotifiedTag,
      retryAfterAt: null,
      errorReason: m.fetchUnavailable
    };
    writeStore(store, failed);
    return { ok: false, notified: false, state: normalizeReleaseState(failed, localTag) };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('TIMEOUT')), timeoutMs);
  let response;
  try {
    response = await fetchImpl(RELEASE_NOTICE_API, {
      method: 'GET',
      redirect: 'error',
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': USER_AGENT
      },
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err?.name === 'AbortError' || err?.message === 'TIMEOUT' || String(err?.cause?.code || err?.code || '').includes('TIMEOUT');
    const detail = isTimeout ? m.timeout : m.offline(err?.code || err?.message || m.unknownError);
    const failed = {
      latestTag: current.latestTag,
      url: current.url,
      checkedAt: nowMs,
      releaseListChecked: true,
      phase: 'failed',
      lastNotifiedTag: current.lastNotifiedTag,
      retryAfterAt: null,
      errorReason: detail
    };
    writeStore(store, failed);
    return { ok: false, notified: false, state: normalizeReleaseState(failed, localTag) };
  }
  const status = Number(response?.status ?? (response?.ok ? 200 : 0));
  const remaining = getHeader(response?.headers, 'x-ratelimit-remaining');
  if (status === 403 || status === 429 || (remaining !== null && remaining.trim() === '0')) {
    clearTimeout(timer);
    const retryAfterAt = computeResetTimeMs(response?.headers, nowMs);
    const reason = m.rateLimitedHttp(status, formatClock(retryAfterAt, lang));
    const rateLimited = {
      latestTag: current.latestTag,
      url: current.url,
      checkedAt: nowMs,
      releaseListChecked: true,
      phase: 'rate-limited',
      lastNotifiedTag: current.lastNotifiedTag,
      retryAfterAt,
      errorReason: reason
    };
    writeStore(store, rateLimited);
    return { ok: false, notified: false, state: normalizeReleaseState(rateLimited, localTag) };
  }

  if (status < 200 || status >= 300) {
    clearTimeout(timer);
    const failed = {
      latestTag: current.latestTag,
      url: current.url,
      checkedAt: nowMs,
      releaseListChecked: true,
      phase: 'failed',
      lastNotifiedTag: current.lastNotifiedTag,
      retryAfterAt: null,
      errorReason: m.httpError(status)
    };
    writeStore(store, failed);
    return { ok: false, notified: false, state: normalizeReleaseState(failed, localTag) };
  }

  let payload;
  try {
    if (typeof response.json === 'function') payload = await response.json();
    else if (typeof response.text === 'function') payload = JSON.parse(await response.text());
    else payload = response.body;
    if (!Array.isArray(payload)) throw new Error('INVALID_RELEASE_LIST');
  } catch {
    const failed = {
      latestTag: current.latestTag,
      url: current.url,
      checkedAt: nowMs,
      releaseListChecked: true,
      phase: 'failed',
      lastNotifiedTag: current.lastNotifiedTag,
      retryAfterAt: null,
      errorReason: m.parseError
    };
    writeStore(store, failed);
    return { ok: false, notified: false, state: normalizeReleaseState(failed, localTag) };
  } finally {
    clearTimeout(timer);
  }

  const release = newestMatchingRelease(payload, assetKind);
  if (!release) {
    const noAsset = { latestTag: null, url: null, checkedAt: nowMs, releaseListChecked: true, phase: 'no-asset',
      lastNotifiedTag: current.lastNotifiedTag, retryAfterAt: null, errorReason: null };
    writeStore(store, noAsset);
    return { ok: true, skipped: 'no-matching-release', notified: false,
      state: normalizeReleaseState(noAsset, localTag) };
  }
  const rawTag = release.tag_name;
  const cmp = compareReleaseVersions(localTag, rawTag);
  if (cmp === null) {
    const failed = {
      latestTag: current.latestTag,
      url: current.url,
      checkedAt: nowMs,
      releaseListChecked: true,
      phase: 'failed',
      lastNotifiedTag: current.lastNotifiedTag,
      retryAfterAt: null,
      errorReason: m.invalidLocalTag
    };
    writeStore(store, failed);
    return { ok: false, notified: false, state: normalizeReleaseState(failed, localTag) };
  }

  const safeUrl = sanitizeReleaseUrl(release.html_url);
  if (cmp === -1) {
    const notifiedComparison = compareReleaseVersions(current.lastNotifiedTag, rawTag);
    const shouldNotify = notifiedComparison === null || notifiedComparison === -1;
    const nextNotifiedTag = shouldNotify ? rawTag : current.lastNotifiedTag;
    const nextState = {
      latestTag: rawTag,
      url: safeUrl,
      checkedAt: nowMs,
      releaseListChecked: true,
      phase: 'available',
      lastNotifiedTag: nextNotifiedTag,
      retryAfterAt: null,
      errorReason: null
    };
    writeStore(store, nextState);
    if (shouldNotify && typeof onNotify === 'function') {
      const bubbleText = m.bubble(rawTag);
      onNotify({ latestTag: rawTag, url: safeUrl, text: bubbleText });
    }
    return { ok: true, notified: shouldNotify, state: normalizeReleaseState(nextState, localTag) };
  }

  const currentState = {
    latestTag: rawTag,
    url: safeUrl,
    checkedAt: nowMs,
    releaseListChecked: true,
    phase: 'current',
    lastNotifiedTag: current.lastNotifiedTag,
    retryAfterAt: null,
    errorReason: null
  };
  writeStore(store, currentState);
  return { ok: true, notified: false, state: normalizeReleaseState(currentState, localTag) };
}

module.exports = {
  RELEASE_NOTICE_API,
  ALLOWED_URL_PREFIX,
  DEFAULT_DOWNLOAD_URL,
  CHECK_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
  parseReleaseVersion,
  compareReleaseVersions,
  isNewerRelease,
  isAllowedReleaseUrl,
  sanitizeReleaseUrl,
  normalizeReleaseState,
  formatReleaseStatusText,
  checkReleaseNotice
};
