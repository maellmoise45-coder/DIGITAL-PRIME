const API = {
  async request(url, opts = {}) {
    const res = await fetch(url, { credentials: 'same-origin', ...opts });
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    if (!isJson) {
      if (!res.ok) throw new Error('Erreur serveur (' + res.status + ')');
      return { ok: true };
    }
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || 'Erreur');
    return data;
  },
  get(url) { return this.request(url); },
  post(url, body) {
    return this.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  },
  postForm(url, formData) { return this.request(url, { method: 'POST', body: formData }); }
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmtDate(s) {
  if (!s) return '';
  const d = new Date((s || '').replace(' ', 'T') + 'Z');
  return isNaN(d) ? s : d.toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' });
}
function fmtSize(n) {
  n = Number(n||0); if (!n) return '';
  const u = ['o','Ko','Mo','Go']; let i=0; while(n>=1024 && i<u.length-1){n/=1024;i++;}
  return (i? n.toFixed(1):n)+' '+u[i];
}
function initials(name){ return String(name||'?').trim().slice(0,2).toUpperCase() || '?'; }
function setAccent(color){ if(color) document.documentElement.style.setProperty('--accent', color); }
function avatar(name, color, lg){ return `<span class="avatar ${lg?'lg':''}" style="background:${esc(color||'#64748b')}">${esc(initials(name))}</span>`; }
