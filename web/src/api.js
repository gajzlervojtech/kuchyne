async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${url}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Chyba ${res.status}`);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body ?? {}),
  patch: (url, body) => request('PATCH', url, body ?? {}),
  del: (url) => request('DELETE', url),
};

export const DAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek'];
export const DAYS_SHORT = ['PO', 'ÚT', 'ST', 'ČT', 'PÁ'];

export function fmtDate(isoStr) {
  const [, m, d] = isoStr.split('-').map(Number);
  return `${d}. ${m}.`;
}

export function fmtNum(n) {
  if (n == null) return '';
  const r = Math.round(n * 100) / 100;
  return String(r).replace('.', ',');
}

export function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}
