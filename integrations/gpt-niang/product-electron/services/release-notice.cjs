'use strict';

const RELEASE_NOTICE_API = 'https://api.github.com/repos/zfc55150-cmd/maid-desktop-pet/releases/latest';
const ALLOWED_URL_PREFIX = 'https://github.com/zfc55150-cmd/maid-desktop-pet/';
const DEFAULT_DOWNLOAD_URL = 'https://github.com/zfc55150-cmd/maid-desktop-pet/releases';
const CHECK_INTERVAL_MS = 86400000;
const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT = 'maid-desktop-pet-release-notice/1.0';

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

function formatClock(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '稍后';
  try {
    return new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '稍后';
  }
}

function normalizeReleaseState(raw = {}, localTag = 'v1.0.0') {
  const v = raw && typeof raw === 'object' ? raw : {};
  const validTag = typeof v.latestTag === 'string' && parseReleaseVersion(v.latestTag) ? v.latestTag.trim() : null;
  const phase = ['idle', 'checking', 'current', 'available', 'rate-limited', 'failed'].includes(v.phase) ? v.phase : 'idle';
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

function formatReleaseStatusText(state, localTag = 'v1.0.0') {
  const s = normalizeReleaseState(state, localTag);
  switch (s.phase) {
    case 'checking':
      return '本仓库新版本：正在检查 GitHub Release…';
    case 'available':
      return `本仓库新版本：发现新版本 ${s.latestTag}`;
    case 'current':
      return `本仓库新版本：已是最新版本（${s.latestTag || localTag}）`;
    case 'rate-limited':
      return `本仓库新版本：${s.errorReason || `GitHub 访问限流，请于 ${formatClock(s.retryAfterAt)} 后重试`}`;
    case 'failed':
      return `本仓库新版本：${s.errorReason || '网络不可用，无法连接 GitHub Release'}`;
    default:
      return '本仓库新版本：仅检查与提醒，不自动下载或改写程序';
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
  assetKind = null
} = {}) {
  const nowMs = typeof now === 'function' ? now() : Number(now);
  const current = normalizeReleaseState(readStore(store), localTag);

  if (current.retryAfterAt && nowMs < current.retryAfterAt) {
    const reason = current.errorReason || `GitHub 访问限流，请于 ${formatClock(current.retryAfterAt)} 后重试`;
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

  if (!force && mode === 'automatic' && current.checkedAt && nowMs - current.checkedAt < CHECK_INTERVAL_MS) {
    return { ok: true, skipped: 'throttled', notified: false, state: current };
  }

  if (typeof fetchImpl !== 'function') {
    const failed = {
      latestTag: current.latestTag,
      url: current.url,
      checkedAt: nowMs,
      phase: 'failed',
      lastNotifiedTag: current.lastNotifiedTag,
      retryAfterAt: null,
      errorReason: '当前运行环境不支持网络请求（fetch 不可用）'
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
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': USER_AGENT
      },
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err?.name === 'AbortError' || err?.message === 'TIMEOUT' || String(err?.cause?.code || err?.code || '').includes('TIMEOUT');
    const detail = isTimeout ? '连接 GitHub 超时（10秒），请检查网络后重试' : `网络不可用，无法连接 GitHub（${err?.code || err?.message || '连接失败'}）`;
    const failed = {
      latestTag: current.latestTag,
      url: current.url,
      checkedAt: nowMs,
      phase: 'failed',
      lastNotifiedTag: current.lastNotifiedTag,
      retryAfterAt: null,
      errorReason: detail
    };
    writeStore(store, failed);
    return { ok: false, notified: false, state: normalizeReleaseState(failed, localTag) };
  }
  clearTimeout(timer);

  const status = Number(response?.status ?? (response?.ok ? 200 : 0));
  const remaining = getHeader(response?.headers, 'x-ratelimit-remaining');
  if (status === 403 || status === 429 || (remaining !== null && remaining.trim() === '0')) {
    const retryAfterAt = computeResetTimeMs(response?.headers, nowMs);
    const reason = `GitHub 访问受限（HTTP ${status || 403}），限流至 ${formatClock(retryAfterAt)}`;
    const rateLimited = {
      latestTag: current.latestTag,
      url: current.url,
      checkedAt: nowMs,
      phase: 'rate-limited',
      lastNotifiedTag: current.lastNotifiedTag,
      retryAfterAt,
      errorReason: reason
    };
    writeStore(store, rateLimited);
    return { ok: false, notified: false, state: normalizeReleaseState(rateLimited, localTag) };
  }

  if (status < 200 || status >= 300) {
    const failed = {
      latestTag: current.latestTag,
      url: current.url,
      checkedAt: nowMs,
      phase: 'failed',
      lastNotifiedTag: current.lastNotifiedTag,
      retryAfterAt: null,
      errorReason: `GitHub 服务返回异常状态（HTTP ${status || '未知'}）`
    };
    writeStore(store, failed);
    return { ok: false, notified: false, state: normalizeReleaseState(failed, localTag) };
  }

  let payload;
  try {
    if (typeof response.json === 'function') payload = await response.json();
    else if (typeof response.text === 'function') payload = JSON.parse(await response.text());
    else payload = response.body;
  } catch {
    const failed = {
      latestTag: current.latestTag,
      url: current.url,
      checkedAt: nowMs,
      phase: 'failed',
      lastNotifiedTag: current.lastNotifiedTag,
      retryAfterAt: null,
      errorReason: 'GitHub Release 响应解析失败'
    };
    writeStore(store, failed);
    return { ok: false, notified: false, state: normalizeReleaseState(failed, localTag) };
  }

  const rawTag = typeof payload?.tag_name === 'string' ? payload.tag_name.trim() : '';
  const cmp = compareReleaseVersions(localTag, rawTag);
  if (cmp === null) {
    const failed = {
      latestTag: current.latestTag,
      url: current.url,
      checkedAt: nowMs,
      phase: 'failed',
      lastNotifiedTag: current.lastNotifiedTag,
      retryAfterAt: null,
      errorReason: `远端版本号格式无效（${rawTag || '空'}）`
    };
    writeStore(store, failed);
    return { ok: false, notified: false, state: normalizeReleaseState(failed, localTag) };
  }

  if (assetKind === 'gpt' && (payload?.draft === true || payload?.prerelease === true ||
      !Array.isArray(payload?.assets) || !payload.assets.some(asset =>
        asset?.state === 'uploaded' && Number.isFinite(asset.size) && asset.size > 0 &&
        /^GPTNiang-v\d+\.\d+\.\d+-electron(?:\.\d+)?-win-x64\.zip$/.test(asset.name || '')))) {
    const noAsset = { latestTag: localTag, url: null, checkedAt: nowMs, phase: 'current',
      lastNotifiedTag: current.lastNotifiedTag, retryAfterAt: null, errorReason: null };
    writeStore(store, noAsset);
    return { ok: true, skipped: 'no-gpt-asset', notified: false,
      state: normalizeReleaseState(noAsset, localTag) };
  }

  const safeUrl = sanitizeReleaseUrl(payload?.html_url);
  if (cmp === -1) {
    const shouldNotify = rawTag !== current.lastNotifiedTag;
    const nextNotifiedTag = shouldNotify ? rawTag : current.lastNotifiedTag;
    const nextState = {
      latestTag: rawTag,
      url: safeUrl,
      checkedAt: nowMs,
      phase: 'available',
      lastNotifiedTag: nextNotifiedTag,
      retryAfterAt: null,
      errorReason: null
    };
    writeStore(store, nextState);
    if (shouldNotify && typeof onNotify === 'function') {
      const bubbleText = `主人，有新版本 ${rawTag} 啦，去设置里看看～`;
      onNotify({ latestTag: rawTag, url: safeUrl, text: bubbleText });
    }
    return { ok: true, notified: shouldNotify, state: normalizeReleaseState(nextState, localTag) };
  }

  const currentState = {
    latestTag: rawTag,
    url: safeUrl,
    checkedAt: nowMs,
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
