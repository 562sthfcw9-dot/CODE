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
    let json;
    try {
        json = await res.json();
    } catch (error) {
        throw new Error('Invalid server response');
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
