'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const HELPER_DIR_URL = pathToFileURL(__dirname).href.replace(/\/+$/, '').toLowerCase();

function parseByteRange(rangeHeader, fileSize) {
  const size = Number(fileSize);
  if (!Number.isFinite(size) || size < 0) {
    return { kind: 'unsatisfiable', size: 0 };
  }
  if (rangeHeader == null || String(rangeHeader).trim() === '') {
    return { kind: 'full', start: 0, end: Math.max(0, size - 1), size };
  }
  const raw = String(rangeHeader).trim();
  const match = /^bytes=(\d*)-(\d*)$/i.exec(raw);
  if (!match) {
    return { kind: 'unsatisfiable', size };
  }
  const [, startText, endText] = match;
  if (!startText && !endText) {
    return { kind: 'unsatisfiable', size };
  }
  if (size === 0) {
    return { kind: 'unsatisfiable', size: 0 };
  }

  let start;
  let end;
  if (!startText) {
    const suffixLen = Number(endText);
    if (!Number.isInteger(suffixLen) || suffixLen <= 0) {
      return { kind: 'unsatisfiable', size };
    }
    start = Math.max(0, size - suffixLen);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
      return { kind: 'unsatisfiable', size };
    }
    end = Math.min(end, size - 1);
  }

  return {
    kind: 'partial',
    start,
    end,
    length: end - start + 1,
    size,
    contentRange: `bytes ${start}-${end}/${size}`,
  };
}

function readOrigin(request) {
  if (!request || !request.headers) return '';
  if (typeof request.headers.get === 'function') {
    return String(request.headers.get('origin') || '').trim();
  }
  return String(request.headers.origin || request.headers.Origin || '').trim();
}

function isAllowedOrigin(origin) {
  if (!origin || origin === 'null') return true;
  const raw = String(origin).trim();
  const lower = raw.toLowerCase();
  if (lower.startsWith('dsh-pet-bridge://')) return true;
  if (lower === 'file://' || lower === 'file:///') return true;
  if (lower.startsWith('file://')) {
    return lower.startsWith(HELPER_DIR_URL + '/') || lower === HELPER_DIR_URL;
  }
  return false;
}

function corsHeaders(request, contentType) {
  const origin = readOrigin(request);
  const headers = { vary: 'Origin' };
  if (contentType) {
    headers['content-type'] = contentType;
  }
  if (!origin || origin === 'null') {
    headers['access-control-allow-origin'] = 'null';
  } else if (isAllowedOrigin(origin)) {
    headers['access-control-allow-origin'] = origin;
  }
  return headers;
}

module.exports = {
  parseByteRange,
  corsHeaders,
  isAllowedOrigin,
  readOrigin,
};
