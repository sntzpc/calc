// core/format.js
export function formatNumber(n){
  if (!isFinite(n)) return String(n);
  const s = String(n);
  if (s.includes('e') || s.includes('E')) return s;
  const rounded = Math.round((n + Number.EPSILON) * 1e12) / 1e12;
  return String(rounded);
}

export function fmtInt(n){
  if (!isFinite(n)) return '-';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function fmtDec(n, d=2){
  if (!isFinite(n)) return '-';
  const v = Math.round((n + Number.EPSILON) * (10**d)) / (10**d);
  return v.toLocaleString('id-ID', {minimumFractionDigits:d, maximumFractionDigits:d});
}

export function fmtSmartPct(n){
  if (!isFinite(n)) return '-';
  const v1 = Math.round((n + Number.EPSILON) * 10) / 10;
  const isInt = Math.abs(v1 - Math.round(v1)) < 1e-9;
  return isInt ? `${Math.round(v1)}%` : `${v1.toLocaleString('id-ID', {maximumFractionDigits:1})}%`;
}

export function fmtKg(n){
  if (!isFinite(n)) return '-';
  return `${fmtInt(n)} kg`;
}

export function fmtTon(n){
  if (!isFinite(n)) return '-';
  return `${fmtDec(n, 2)} ton`;
}
