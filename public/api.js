// Builds an Error from a non-ok Response. The response body is not
// guaranteed to be JSON (e.g. the server crashed before the error
// middleware ran, or a proxy/timeout returned an HTML/plain-text page),
// so r.json() is attempted but never allowed to itself throw — fall back
// to statusText, then the raw status code.
async function apiError(r, fallback) {
  let message = r.statusText || fallback;
  try {
    const body = await r.json();
    if (body && body.error) message = body.error;
  } catch {
    // body wasn't JSON; keep the statusText/fallback message
  }
  const err = new Error(message || `HTTP ${r.status}`);
  err.status = r.status;
  return err;
}

window.Api = {
  async list() {
    const r = await fetch('/api/jars');
    if (!r.ok) throw await apiError(r, 'list failed');
    return r.json();
  },
  async create(data) {
    const r = await fetch('/api/jars', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!r.ok) throw await apiError(r, 'create failed');
    return r.json();
  },
  async update(id, data) {
    const r = await fetch(`/api/jars/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!r.ok) throw await apiError(r, 'update failed');
    return r.json();
  },
  async remove(id) {
    const r = await fetch(`/api/jars/${id}`, { method: 'DELETE' });
    if (!r.ok) throw await apiError(r, 'delete failed');
    return null;
  },
};
