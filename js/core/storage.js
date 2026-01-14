// core/storage.js
import { deepMerge } from './utils.js';

export const KEYS = {
  HISTORY: 'kalkulator_history_v2',
  PREF: 'kalkulator_pref_v1',
  AGRO: 'kalkulator_agro_pref_v1',
};

// ✅ UPDATE: tambah default SEMPROT
export const AGRO_DEFAULT = {
  kec: { sph: 136, sisip: 10, afkir: 30 },
  tak: { sph: 136, luas: 100, bjr: 10, capTon: 7, rit: 2 },
  tenaga: { tipe: 'datar', luasDiv: 500, cad: 15 },
  jarak: { sph: 136 },

  // ✅ NEW: Kalibrasi Semprot
  semprot: {
    F: 0.6,     // L/menit
    v: 30,      // m/menit
    a: 1.2,     // m
    sf: 25,     // %
    dose: 1.5,  // L/Ha (blanket)
    kep: 12,    // L
    sph: 136    // pokok/ha
  }
};

export function loadPref(){
  try{ return JSON.parse(localStorage.getItem(KEYS.PREF) || '{}'); }catch(e){ return {}; }
}
export function savePref(pref){
  localStorage.setItem(KEYS.PREF, JSON.stringify(pref || {}));
}

// ✅ UPDATE: loadAgroPref dibuat lebih “kebal” untuk data lama/korup
export function loadAgroPref(){
  try{
    const curRaw = JSON.parse(localStorage.getItem(KEYS.AGRO) || '{}');

    // pastikan object plain, bukan null/array/string
    const cur = (curRaw && typeof curRaw === 'object' && !Array.isArray(curRaw)) ? curRaw : {};

    // deepMerge: default + nilai user (user override)
    return deepMerge(structuredClone(AGRO_DEFAULT), cur);
  }catch(e){
    return structuredClone(AGRO_DEFAULT);
  }
}

export function saveAgroPref(pref){
  localStorage.setItem(KEYS.AGRO, JSON.stringify(pref || {}));
}

export function loadHistory(){
  try{ return JSON.parse(localStorage.getItem(KEYS.HISTORY) || '[]'); }catch(e){ return []; }
}
export function saveHistory(arr){
  localStorage.setItem(KEYS.HISTORY, JSON.stringify(arr || []));
}
export function addHistory(moduleName, expr, result){
  const arr = loadHistory();
  arr.unshift({
    ts: Date.now(),
    module: moduleName,
    expr,
    result: String(result),
  });
  if (arr.length > 800) arr.length = 800;
  saveHistory(arr);
  return arr;
}

export function resetAll(){
  localStorage.removeItem(KEYS.HISTORY);
  localStorage.removeItem(KEYS.PREF);
  localStorage.removeItem(KEYS.AGRO);
}
