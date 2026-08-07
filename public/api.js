window.Api = {
  async list() { return (await fetch('/api/jars')).json(); },
  async create(data) {
    const r = await fetch('/api/jars', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'create failed');
    return r.json();
  },
  async update(id, data) {
    const r = await fetch(`/api/jars/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'update failed');
    return r.json();
  },
  async remove(id) {
    const r = await fetch(`/api/jars/${id}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 204) throw new Error('delete failed');
    return null;
  },
};
