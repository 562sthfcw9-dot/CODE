/* ============================================================
   TRAPICO — API helper for all pages
   ============================================================ */

'use strict';

const APP_BASE = /\/(CITIZEN|DISPATCH|FIELD)\//i.test(window.location.pathname) ? '..' : '.';
const API_BASE = `${APP_BASE}/api`;

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
    const url = `${API_BASE}/${endpoint}`;
    const options = {
        method,
        credentials: 'include',
    };

    if (method === 'GET') {
        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            const qs = buildQuery(data);
            return rawFetch(`${url}?${qs}`, options);
        }
        return rawFetch(url, options);
    }

    if (data instanceof FormData) {
        options.body = data;
    } else {
        options.headers = {'Content-Type': 'application/json'};
        options.body = JSON.stringify(data || {});
    }

    return rawFetch(url, options);
}

async function rawFetch(url, options) {
    const res = await fetch(url, options);
    const text = await res.text();
    let json;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (error) {
        const looksLikeHtml = /^\s*</.test(text);
        if (res.status === 404 || looksLikeHtml) {
            throw new Error('Invalid server response (likely wrong URL path). Open the app via localhost and check that api/register.php exists under your project folder.');
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
        showHealthMessage(msg, `Checking ${API_BASE}/register.php`, false);

        try {
            const res = await fetch(`${API_BASE}/register.php`, {
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
                showHealthMessage(msg, `API reachable at ${API_BASE}/register.php. JSON response received.`, false);
            } else {
                const preview = raw ? raw.slice(0, 120).replace(/\s+/g, ' ') : 'empty response';
                showHealthMessage(msg, `API not returning JSON at ${API_BASE}/register.php (HTTP ${res.status}). First bytes: ${preview}`, true);
            }
        } catch (error) {
            showHealthMessage(msg, `Request failed for ${API_BASE}/register.php. ${error?.message || 'Network or URL issue.'}`, true);
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
