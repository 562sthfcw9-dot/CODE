/* ============================================================
   TRAPICO — API helper for all pages
   ============================================================ */

'use strict';

const APP_BASE = /\/(CITIZEN|DISPATCH|FIELD)\//i.test(window.location.pathname) ? '..' : '.';
let ACTIVE_API_BASE = null;

function buildApiCandidates() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const candidates = [
        `${APP_BASE}/api`,
        '/api',
        '/CODE/api',
        '/Trapico/CODE/api',
    ];

    if (parts.length >= 1) {
        candidates.push(`/${parts[0]}/api`);
    }
    if (parts.length >= 2) {
        candidates.push(`/${parts[0]}/${parts[1]}/api`);
    }

    return [...new Set(candidates.map(s => String(s).replace(/\/+$/, '')))];
}

const API_BASE_CANDIDATES = buildApiCandidates();

function appHref(path) {
    const normalized = String(path || '').replace(/^\/+/, '');
    return new URL(`${APP_BASE}/${normalized}`, window.location.href).href;
}

function buildQuery(params) {
    return Object.entries(params)
        .filter(([_, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value)))
        .join('&');
}

async function apiFetch(endpoint, data = null, method = 'GET') {
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const options = {
        method: normalizedMethod,
        credentials: 'include',
    };

    if (normalizedMethod !== 'GET') {
        if (data instanceof FormData) {
            options.body = data;
        } else {
            options.headers = {'Content-Type': 'application/json'};
            options.body = JSON.stringify(data || {});
        }
    }

    const baseOrder = ACTIVE_API_BASE
        ? [ACTIVE_API_BASE, ...API_BASE_CANDIDATES.filter(b => b !== ACTIVE_API_BASE)]
        : API_BASE_CANDIDATES;

    let lastError = null;
    for (const base of baseOrder) {
        const url = `${base}/${endpoint}`;
        const finalUrl = normalizedMethod === 'GET' && data && typeof data === 'object' && Object.keys(data).length > 0
            ? `${url}?${buildQuery(data)}`
            : url;

        try {
            const result = await rawFetch(finalUrl, options);
            ACTIVE_API_BASE = base;
            return result;
        } catch (error) {
            lastError = error;
            if (error?.code === 'INVALID_PATH') {
                continue;
            }
            throw error;
        }
    }

    if (lastError) throw lastError;
    throw new Error('Unable to locate a valid API path.');
}

function apiPathError(message) {
    const err = new Error(message);
    err.code = 'INVALID_PATH';
    return err;
}

async function rawFetch(url, options) {
    const res = await fetch(url, options);
    const text = await res.text();
    const normalizedText = typeof text === 'string' ? text.replace(/^\uFEFF/, '') : text;
    let json;
    try {
        json = normalizedText ? JSON.parse(normalizedText) : null;
    } catch (error) {
        const looksLikeHtml = /^\s*</.test(normalizedText || '');
        if (res.status === 404 || looksLikeHtml) {
            throw apiPathError('Invalid server response (likely wrong URL path). Open the app via localhost and check that api/register.php exists under your project folder.');
        }
        throw new Error(`Invalid server response (HTTP ${res.status})`);
    }

    if (!json || typeof json !== 'object') {
        throw new Error(`Invalid server response (HTTP ${res.status})`);
    }

    if (!res.ok || json.success === false) {
        throw new Error(json.error || 'Server returned an error');
    }
    return json;
}

async function getCurrentUser() {
    try {
        const resp = await apiFetch('user.php', {action: 'profile'});
        return resp.user;
    } catch (error) {
        return null;
    }
}

async function requireLoginRedirect() {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = appHref('index.html');
        return null;
    }
    return user;
}

function safeText(value) {
    return String(value || '').replace(/[<>&"']/g, function (c) {
        return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":"&#39;"}[c];
    });
}

function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString();
}

function isAuthPage() {
    return /(?:^|\/)(?:citizen|dispatch|field)?-?(?:login|signup)\.html$/i.test(window.location.pathname)
        || /(?:^|\/)signup\.html$/i.test(window.location.pathname);
}

function showHealthMessage(el, message, isError) {
    el.textContent = message;
    el.style.display = 'block';
    el.style.color = isError ? '#aa2222' : '#0f5132';
    el.style.background = isError ? '#fff1f1' : '#eaf7ef';
    el.style.border = isError ? '1px solid rgba(170, 34, 34, 0.35)' : '1px solid rgba(15, 81, 50, 0.25)';
}

function addApiHealthCheckUI() {
    if (!isAuthPage()) return;

    const wrap = document.createElement('div');
    wrap.style.position = 'fixed';
    wrap.style.right = '16px';
    wrap.style.bottom = '16px';
    wrap.style.zIndex = '9999';
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '8px';
    wrap.style.width = 'min(360px, calc(100vw - 24px))';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'API HEALTH CHECK';
    btn.style.height = '38px';
    btn.style.border = '0';
    btn.style.borderRadius = '8px';
    btn.style.background = '#111111';
    btn.style.color = '#ffffff';
    btn.style.cursor = 'pointer';
    btn.style.fontFamily = 'monospace';
    btn.style.fontSize = '11px';
    btn.style.fontWeight = '700';
    btn.style.letterSpacing = '0.08em';

    const msg = document.createElement('div');
    msg.style.display = 'none';
    msg.style.borderRadius = '8px';
    msg.style.padding = '10px 12px';
    msg.style.fontSize = '12px';
    msg.style.lineHeight = '1.4';
    msg.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)';
    msg.textContent = '';

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'CHECKING...';
        showHealthMessage(msg, `Checking ${API_BASE_CANDIDATES.join(' , ')}/register.php`, false);

        try {
            let okBase = null;
            let lastStatus = 0;
            let lastPreview = 'empty response';

            for (const base of API_BASE_CANDIDATES) {
                const res = await fetch(`${base}/register.php`, {
                    method: 'GET',
                    credentials: 'include',
                });
                const raw = await res.text();
                let parsed = null;
                try {
                    parsed = raw ? JSON.parse(raw) : null;
                } catch (error) {
                    parsed = null;
                }

                if (parsed && typeof parsed === 'object') {
                    okBase = base;
                    ACTIVE_API_BASE = base;
                    break;
                }

                lastStatus = res.status;
                lastPreview = raw ? raw.slice(0, 120).replace(/\s+/g, ' ') : 'empty response';
            }

            if (okBase) {
                showHealthMessage(msg, `API reachable at ${okBase}/register.php. JSON response received.`, false);
            } else {
                showHealthMessage(msg, `API not returning JSON on known paths (last HTTP ${lastStatus}). First bytes: ${lastPreview}`, true);
            }
        } catch (error) {
            showHealthMessage(msg, `Request failed while checking API paths. ${error?.message || 'Network or URL issue.'}`, true);
        } finally {
            btn.disabled = false;
            btn.textContent = 'API HEALTH CHECK';
        }
    });

    wrap.appendChild(btn);
    wrap.appendChild(msg);
    document.body.appendChild(wrap);
}

document.addEventListener('DOMContentLoaded', () => {
    addApiHealthCheckUI();
});
