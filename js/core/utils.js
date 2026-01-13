// core/utils.js
export function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

export function dateStamp(){
  const d = new Date();
  const pad = (n)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function csvEscape(s){
  const need = /[,"\n]/.test(s);
  const escaped = String(s).replace(/"/g,'""');
  return need ? `"${escaped}"` : escaped;
}

export function toNum(v, fallback){
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function roundNearest5(n){
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n / 5) * 5;
}

export function deepMerge(base, patch){
  if (!patch || typeof patch !== 'object') return base;
  for (const k of Object.keys(patch)){
    if (patch[k] && typeof patch[k]==='object' && !Array.isArray(patch[k])){
      base[k] = deepMerge(base[k] ?? {}, patch[k]);
    } else {
      base[k] = patch[k];
    }
  }
  return base;
}
