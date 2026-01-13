// js/modules/convert.js
import { addHistory } from '../core/storage.js';
import { toNum } from '../core/utils.js';
import { fmtInt } from '../core/format.js';

const LS_CONVERT = 'kalkulator_convert_pref_v1';

/* =========================================================
   ✅ Database kandungan hara (% -> fraksi)
   Catatan:
   - P & K pada NPK umumnya ditulis sebagai P2O5 & K2O.
     Tetapi di kebun sering dipakai "P" dan "K" secara praktis.
     Di kalkulator ini kita pakai sesuai input user: P & K (langsung %).
   ========================================================= */
const NUTS = ['N', 'P', 'K', 'Mg', 'Ca'];

const FERT_SINGLE = {
  // Nitrogen
  UREA:     { name:'Urea',     N:0.46 },
  ZA:       { name:'ZA',       N:0.24 },
  DAP_N:    { name:'DAP (N)',  N:0.18 }, // DAP punya N 18%

  // Fosfat
  TSP:      { name:'TSP',      P:0.46 },
  SP36:     { name:'SP36',     P:0.36 },
  RP:       { name:'RP',       P:0.28 },
  DAP_P:    { name:'DAP (P)',  P:0.46 }, // DAP punya P 46%

  // Kalium
  MOP:      { name:'MOP',      K:0.60 },
  ZK:       { name:'ZK',       K:0.50 },

  // Magnesium
  KIES:     { name:'Kieserite', Mg:0.27 },
  DOLO_MG:  { name:'Dolomite (Mg)', Mg:0.12 },

  // Kalsium
  DOLO_CA:  { name:'Dolomite (Ca)', Ca:0.22 },
  KAPTAN:   { name:'Kaptan',    Ca:0.55 },
};

// Dolomite sebenarnya punya Mg & Ca sekaligus.
// Agar bisa dihitung “gabungan” dengan benar, kita buat spec dolomite khusus:
const FERT_SPECIAL = {
  DOLO: { name:'Dolomite', Mg:0.12, Ca:0.22 }
};

// Preset NPK majemuk (bisa ditambah)
const FERT_NPK_PRESET = {
  NPK15156_4: { name:'NPK 15.15.6.4', N:0.15, P:0.15, K:0.06, Mg:0.04 },
  NPK121217_2:{ name:'NPK 12.12.17.2', N:0.12, P:0.12, K:0.17, Mg:0.02 },
};

const DEFAULT_PREF = {
  tab: 'length',
  length: { from: 'm', to: 'km' },
  mass:   { from: 'kg', to: 'g' },
  volume: { from: 'l', to: 'ml' },
  area:   { from: 'ha', to: 'm2' },
  temp:   { from: 'c', to: 'f' },

  // ✅ Fertilizer advanced prefs
  fert: {
    mode: 'nutrient_swap',   // 'nutrient_swap'
    doseKgPerPokok: 1,       // input utama kg/pokok
    basis: 'N',              // hara acuan (default N)

    // Source/Target type: single / npk preset / custom npk
    srcType: 'single',       // 'single' | 'npk_preset' | 'npk_custom'
    srcId: 'UREA',           // single id or preset key
    srcNPK: { N:15, P:15, K:6, Mg:4 }, // custom %

    dstType: 'single',
    dstId: 'ZA',
    dstNPK: { N:12, P:12, K:17, Mg:2 },

    // Top-up fertilizer choice for deficits
    topN: 'UREA',
    topP: 'TSP',
    topK: 'MOP',
    topMg: 'KIES',
    topCa: 'KAPTAN',

    // gunakan dolomite gabungan jika dipilih
    useDolomiteCombo: true
  },

  fx: { base: 'IDR', quote: 'USD', rate: 0.000065 }
};

function safeJSONParse(s, fallback){
  try { return JSON.parse(s); } catch { return fallback; }
}
function loadPref(){
  const cur = safeJSONParse(localStorage.getItem(LS_CONVERT) || '{}', {});
  return {
    ...DEFAULT_PREF,
    ...cur,
    length: { ...DEFAULT_PREF.length, ...(cur.length||{}) },
    mass:   { ...DEFAULT_PREF.mass, ...(cur.mass||{}) },
    volume: { ...DEFAULT_PREF.volume, ...(cur.volume||{}) },
    area:   { ...DEFAULT_PREF.area, ...(cur.area||{}) },
    temp:   { ...DEFAULT_PREF.temp, ...(cur.temp||{}) },
    fert:   { ...DEFAULT_PREF.fert, ...(cur.fert||{}) },
    fx:     { ...DEFAULT_PREF.fx, ...(cur.fx||{}) },
  };
}
function savePref(p){
  localStorage.setItem(LS_CONVERT, JSON.stringify(p));
}

// --- maps basic ---
const LENGTH = { mm:0.001, cm:0.01, m:1, km:1000 };
const MASS   = { g:0.001, kg:1, ton:1000 };
const VOLUME = { ml:0.001, l:1, m3:1000 };
const AREA   = { m2:1, ha:10000 };

function convertLinear(value, from, to, map){
  const a = map[from], b = map[to];
  if (!isFinite(value) || !a || !b) return NaN;
  return (value * a) / b;
}
function convertTemperature(value, from, to){
  if (!isFinite(value)) return NaN;
  const f = String(from).toLowerCase();
  const t = String(to).toLowerCase();

  let c;
  if (f === 'c') c = value;
  else if (f === 'f') c = (value - 32) * 5/9;
  else if (f === 'k') c = value - 273.15;
  else return NaN;

  if (t === 'c') return c;
  if (t === 'f') return (c * 9/5) + 32;
  if (t === 'k') return c + 273.15;
  return NaN;
}
function convertFX(value, base, quote, rate, direction){
  if (!isFinite(value) || !(rate > 0)) return NaN;
  if (direction === 'base_to_quote') return value * rate;
  if (direction === 'quote_to_base') return value / rate;
  return NaN;
}

function optionHTML(opts, selected){
  return Object.entries(opts).map(([val, label]) => {
    const sel = val === selected ? 'selected' : '';
    return `<option value="${val}" ${sel}>${label}</option>`;
  }).join('');
}

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function clampPct(n){
  n = Number(n);
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/* =========================================================
   ✅ Fert helpers
   ========================================================= */
function specFromSingle(id){
  if (id === 'DOLO') return { ...FERT_SPECIAL.DOLO };
  const it = FERT_SINGLE[id];
  if (!it) return null;
  return { ...it };
}

function specFromPresetNPK(key){
  const it = FERT_NPK_PRESET[key];
  if (!it) return null;
  return { ...it };
}

function specFromCustomNPK(obj){
  // obj in percent
  const N = clampPct(obj?.N);
  const P = clampPct(obj?.P);
  const K = clampPct(obj?.K);
  const Mg = clampPct(obj?.Mg);
  const Ca = clampPct(obj?.Ca);
  const spec = { name: `NPK Custom ${N}.${P}.${K}.${Mg}` };
  if (N) spec.N = N/100;
  if (P) spec.P = P/100;
  if (K) spec.K = K/100;
  if (Mg) spec.Mg = Mg/100;
  if (Ca) spec.Ca = Ca/100;
  return spec;
}

function getSpec(type, id, custom){
  if (type === 'single') return specFromSingle(id);
  if (type === 'npk_preset') return specFromPresetNPK(id);
  if (type === 'npk_custom') return specFromCustomNPK(custom);
  return null;
}

function nutrientAmountKg(doseKg, spec){
  const out = {};
  for (const n of NUTS){
    out[n] = (spec?.[n] ? doseKg * spec[n] : 0);
  }
  return out;
}

function fmtKgSmart(x){
  if (!isFinite(x)) return '-';
  const isInt = Math.abs(x - Math.round(x)) < 1e-9;
  return isInt ? `${fmtInt(x)} kg` : `${x.toLocaleString('id-ID', {maximumFractionDigits:4})} kg`;
}

function fmtNutrKg(x){
  if (!isFinite(x)) return '-';
  return `${x.toLocaleString('id-ID', {maximumFractionDigits:4})} kg`;
}

/* =========================================================
   ✅ Convert Module (mount once)
   ========================================================= */
export function createConvertModule({ root, setHint, renderHistory }){
  const pref = loadPref();

  let mounted = false;
  let containerRef = null;

  let $c = null;
  let btns = [];
  let elValue = null, elFrom = null, elTo = null, elOut = null, elExtra = null;
  let btnSwap = null, btnSave = null, btnReset = null;

  function persist(){ savePref(pref); }

  function setActiveTabUI(){
    btns.forEach(b => b.classList.toggle('active', b.dataset.ctab === pref.tab));
  }

  function setupSelectors(){
    const tab = pref.tab;
    elExtra.innerHTML = '';

    // --- basic tabs (unchanged)
    if (tab === 'length'){
      elFrom.innerHTML = optionHTML({mm:'mm',cm:'cm',m:'m',km:'km'}, pref.length.from);
      elTo.innerHTML   = optionHTML({mm:'mm',cm:'cm',m:'m',km:'km'}, pref.length.to);

    } else if (tab === 'mass'){
      elFrom.innerHTML = optionHTML({g:'g',kg:'kg',ton:'ton'}, pref.mass.from);
      elTo.innerHTML   = optionHTML({g:'g',kg:'kg',ton:'ton'}, pref.mass.to);

    } else if (tab === 'volume'){
      elFrom.innerHTML = optionHTML({ml:'mL',l:'L',m3:'m³'}, pref.volume.from);
      elTo.innerHTML   = optionHTML({ml:'mL',l:'L',m3:'m³'}, pref.volume.to);

    } else if (tab === 'area'){
      elFrom.innerHTML = optionHTML({m2:'m²',ha:'ha'}, pref.area.from);
      elTo.innerHTML   = optionHTML({m2:'m²',ha:'ha'}, pref.area.to);

    } else if (tab === 'temp'){
      elFrom.innerHTML = optionHTML({c:'°C',f:'°F',k:'K'}, pref.temp.from);
      elTo.innerHTML   = optionHTML({c:'°C',f:'°F',k:'K'}, pref.temp.to);

    } else if (tab === 'fert'){
      // ✅ Fert advanced UI: hide from/to dropdown meaning, but keep layout
      elFrom.innerHTML = `<option value="fert">Pupuk A</option>`;
      elTo.innerHTML   = `<option value="fert">Pupuk B</option>`;

      // gunakan elValue sebagai DOSIS A (kg/pokok)
      elValue.value = (pref.fert.doseKgPerPokok ?? 1);

      const singleOpts = Object.entries(FERT_SINGLE)
        .map(([k,v]) => `<option value="${k}" ${pref.fert.srcId===k?'selected':''}>${escapeHtml(v.name)}</option>`)
        .join('');

      const singleOptsDst = Object.entries(FERT_SINGLE)
        .map(([k,v]) => `<option value="${k}" ${pref.fert.dstId===k?'selected':''}>${escapeHtml(v.name)}</option>`)
        .join('');

      const npkPresetOpts = Object.entries(FERT_NPK_PRESET)
        .map(([k,v]) => `<option value="${k}" ${pref.fert.srcId===k?'selected':''}>${escapeHtml(v.name)}</option>`)
        .join('');

      const npkPresetOptsDst = Object.entries(FERT_NPK_PRESET)
        .map(([k,v]) => `<option value="${k}" ${pref.fert.dstId===k?'selected':''}>${escapeHtml(v.name)}</option>`)
        .join('');

      // top-up choices (sederhana + dolomite)
      const topN = optionHTML({UREA:'Urea (46% N)', ZA:'ZA (24% N)', DAP_N:'DAP (18% N)'}, pref.fert.topN);
      const topP = optionHTML({TSP:'TSP (46% P)', SP36:'SP36 (36% P)', RP:'RP (28% P)', DAP_P:'DAP (46% P)'}, pref.fert.topP);
      const topK = optionHTML({MOP:'MOP (60% K)', ZK:'ZK (50% K)'}, pref.fert.topK);
      const topMg= optionHTML({KIES:'Kieserite (27% Mg)', DOLO:'Dolomite (12% Mg + 22% Ca)'}, pref.fert.topMg === 'DOLO' ? 'DOLO' : pref.fert.topMg);
      const topCa= optionHTML({KAPTAN:'Kaptan (55% Ca)', DOLO:'Dolomite (12% Mg + 22% Ca)'}, pref.fert.topCa === 'DOLO' ? 'DOLO' : pref.fert.topCa);

      elExtra.innerHTML = `
        <div class="agcard" style="margin-top:10px">
          <div class="agtitle">Konversi Pupuk Berdasarkan Kandungan</div>
          <div class="agdesc">
            Input: <b>Dosis Pupuk A (kg/pokok)</b> di kolom "Nilai".<br/>
            Pilih Pupuk A & Pupuk B. Tentukan <b>Hara Acuan</b> (default N).<br/>
            Hasil: dosis pupuk B setara hara acuan + rekomendasi <b>tambahan pupuk tunggal</b> untuk menutup kekurangan hara lainnya.
          </div>

          <div class="aggrid cgrid-2">
            <label class="agfield">
              <span>Tipe Pupuk A</span>
              <select id="f_src_type">
                <option value="single" ${pref.fert.srcType==='single'?'selected':''}>Tunggal</option>
                <option value="npk_preset" ${pref.fert.srcType==='npk_preset'?'selected':''}>NPK Preset</option>
                <option value="npk_custom" ${pref.fert.srcType==='npk_custom'?'selected':''}>NPK Custom</option>
              </select>
            </label>

            <label class="agfield">
              <span>Tipe Pupuk B</span>
              <select id="f_dst_type">
                <option value="single" ${pref.fert.dstType==='single'?'selected':''}>Tunggal</option>
                <option value="npk_preset" ${pref.fert.dstType==='npk_preset'?'selected':''}>NPK Preset</option>
                <option value="npk_custom" ${pref.fert.dstType==='npk_custom'?'selected':''}>NPK Custom</option>
              </select>
            </label>
          </div>

          <div class="aggrid cgrid-2" style="margin-top:10px">
            <label class="agfield">
              <span>Pupuk A</span>
              <select id="f_src_id" class="${pref.fert.srcType==='single'?'':'hidden'}">
                ${singleOpts}
              </select>
              <select id="f_src_npk_preset" class="${pref.fert.srcType==='npk_preset'?'':'hidden'}">
                ${npkPresetOpts}
              </select>
              <div id="f_src_custom" class="${pref.fert.srcType==='npk_custom'?'':'hidden'}">
                <div class="aggrid cgrid-3">
                  <label class="agfield"><span>N%</span><input id="f_srcN" type="number" inputmode="decimal" step="0.1" value="${pref.fert.srcNPK?.N ?? 15}"></label>
                  <label class="agfield"><span>P%</span><input id="f_srcP" type="number" inputmode="decimal" step="0.1" value="${pref.fert.srcNPK?.P ?? 15}"></label>
                  <label class="agfield"><span>K%</span><input id="f_srcK" type="number" inputmode="decimal" step="0.1" value="${pref.fert.srcNPK?.K ?? 6}"></label>
                  <label class="agfield"><span>Mg%</span><input id="f_srcMg" type="number" inputmode="decimal" step="0.1" value="${pref.fert.srcNPK?.Mg ?? 4}"></label>
                  <label class="agfield"><span>Ca%</span><input id="f_srcCa" type="number" inputmode="decimal" step="0.1" value="${pref.fert.srcNPK?.Ca ?? 0}"></label>
                </div>
              </div>
            </label>

            <label class="agfield">
              <span>Pupuk B</span>
              <select id="f_dst_id" class="${pref.fert.dstType==='single'?'':'hidden'}">
                ${singleOptsDst}
              </select>
              <select id="f_dst_npk_preset" class="${pref.fert.dstType==='npk_preset'?'':'hidden'}">
                ${npkPresetOptsDst}
              </select>
              <div id="f_dst_custom" class="${pref.fert.dstType==='npk_custom'?'':'hidden'}">
                <div class="aggrid cgrid-3">
                  <label class="agfield"><span>N%</span><input id="f_dstN" type="number" inputmode="decimal" step="0.1" value="${pref.fert.dstNPK?.N ?? 12}"></label>
                  <label class="agfield"><span>P%</span><input id="f_dstP" type="number" inputmode="decimal" step="0.1" value="${pref.fert.dstNPK?.P ?? 12}"></label>
                  <label class="agfield"><span>K%</span><input id="f_dstK" type="number" inputmode="decimal" step="0.1" value="${pref.fert.dstNPK?.K ?? 17}"></label>
                  <label class="agfield"><span>Mg%</span><input id="f_dstMg" type="number" inputmode="decimal" step="0.1" value="${pref.fert.dstNPK?.Mg ?? 2}"></label>
                  <label class="agfield"><span>Ca%</span><input id="f_dstCa" type="number" inputmode="decimal" step="0.1" value="${pref.fert.dstNPK?.Ca ?? 0}"></label>
                </div>
              </div>
            </label>
          </div>

          <div class="aggrid cgrid-2" style="margin-top:10px">
            <label class="agfield">
              <span>Hara Acuan</span>
              <select id="f_basis">
                ${optionHTML({N:'N',P:'P',K:'K',Mg:'Mg',Ca:'Ca'}, pref.fert.basis || 'N')}
              </select>
            </label>

            <label class="agfield">
              <span>Mode</span>
              <select id="f_mode">
                <option value="nutrient_swap" selected>Konversi Kandungan (A → B)</option>
              </select>
            </label>
          </div>

          <div class="agtitle" style="margin-top:12px">Tambahan Pupuk Tunggal (untuk menutup kekurangan)</div>
          <div class="aggrid cgrid-2" style="margin-top:8px">
            <label class="agfield"><span>Tambah N</span><select id="f_topN">${topN}</select></label>
            <label class="agfield"><span>Tambah P</span><select id="f_topP">${topP}</select></label>
            <label class="agfield"><span>Tambah K</span><select id="f_topK">${topK}</select></label>
            <label class="agfield"><span>Tambah Mg</span><select id="f_topMg">${topMg}</select></label>
            <label class="agfield"><span>Tambah Ca</span><select id="f_topCa">${topCa}</select></label>

            <label class="agfield">
              <span>Dolomite gabungan (Mg+Ca)</span>
              <select id="f_dolo_combo">
                <option value="1" ${pref.fert.useDolomiteCombo ? 'selected':''}>Ya (pakai max untuk Mg/Ca)</option>
                <option value="0" ${!pref.fert.useDolomiteCombo ? 'selected':''}>Tidak</option>
              </select>
            </label>
          </div>

          <div id="f_result" class="agout" style="margin-top:12px">
            <div class="agout-row"><div>Ringkasan</div><div class="agout-val">-</div></div>
          </div>
        </div>
      `;

      // bind inputs (rebuild-safe)
      const srcTypeEl = $c('#f_src_type');
      const dstTypeEl = $c('#f_dst_type');
      const basisEl   = $c('#f_basis');

      const syncTypeVisibility = () => {
        const st = srcTypeEl.value;
        const dt = dstTypeEl.value;

        $c('#f_src_id').classList.toggle('hidden', st !== 'single');
        $c('#f_src_npk_preset').classList.toggle('hidden', st !== 'npk_preset');
        $c('#f_src_custom').classList.toggle('hidden', st !== 'npk_custom');

        $c('#f_dst_id').classList.toggle('hidden', dt !== 'single');
        $c('#f_dst_npk_preset').classList.toggle('hidden', dt !== 'npk_preset');
        $c('#f_dst_custom').classList.toggle('hidden', dt !== 'npk_custom');
      };

      srcTypeEl.addEventListener('change', () => {
        pref.fert.srcType = srcTypeEl.value;
        persist();
        syncTypeVisibility();
        recalc();
      });

      dstTypeEl.addEventListener('change', () => {
        pref.fert.dstType = dstTypeEl.value;
        persist();
        syncTypeVisibility();
        recalc();
      });

      basisEl.addEventListener('change', () => {
        pref.fert.basis = basisEl.value;
        persist();
        recalc();
      });

      // A selections
      $c('#f_src_id').addEventListener('change', (e)=>{ pref.fert.srcId = e.target.value; persist(); recalc(); });
      $c('#f_src_npk_preset').addEventListener('change', (e)=>{ pref.fert.srcId = e.target.value; persist(); recalc(); });

      // B selections
      $c('#f_dst_id').addEventListener('change', (e)=>{ pref.fert.dstId = e.target.value; persist(); recalc(); });
      $c('#f_dst_npk_preset').addEventListener('change', (e)=>{ pref.fert.dstId = e.target.value; persist(); recalc(); });

      // Custom NPK A/B
      const bindNpk = (prefix, targetObjKey) => {
        const n = $c(`#${prefix}N`), p = $c(`#${prefix}P`), k = $c(`#${prefix}K`), mg = $c(`#${prefix}Mg`), ca = $c(`#${prefix}Ca`);
        const apply = () => {
          pref.fert[targetObjKey] = {
            N: clampPct(n.value), P: clampPct(p.value), K: clampPct(k.value), Mg: clampPct(mg.value), Ca: clampPct(ca.value)
          };
          persist(); recalc();
        };
        [n,p,k,mg,ca].forEach(el => el.addEventListener('input', apply));
      };
      if ($c('#f_src_custom')) bindNpk('f_src', 'srcNPK');
      if ($c('#f_dst_custom')) bindNpk('f_dst', 'dstNPK');

      // Top-up
      const bindTop = (id, key) => {
        const el = $c(id);
        el.addEventListener('change', ()=>{ pref.fert[key] = el.value; persist(); recalc(); });
      };
      bindTop('#f_topN','topN');
      bindTop('#f_topP','topP');
      bindTop('#f_topK','topK');
      bindTop('#f_topMg','topMg');
      bindTop('#f_topCa','topCa');

      const doloComboEl = $c('#f_dolo_combo');
      doloComboEl.addEventListener('change', ()=>{
        pref.fert.useDolomiteCombo = doloComboEl.value === '1';
        persist(); recalc();
      });

      syncTypeVisibility();

    } else if (tab === 'fx'){
      elFrom.innerHTML = optionHTML({base:'Base', quote:'Quote'}, 'base');
      elTo.innerHTML   = optionHTML({quote:'Quote', base:'Base'}, 'quote');

      elExtra.innerHTML = `
        <div class="aggrid cgrid-3" style="margin-top:10px">
          <label class="agfield">
            <span>Base</span>
            <input id="fx_base" type="text" value="${escapeHtml(pref.fx.base || 'IDR')}" />
          </label>
          <label class="agfield">
            <span>Quote</span>
            <input id="fx_quote" type="text" value="${escapeHtml(pref.fx.quote || 'USD')}" />
          </label>
          <label class="agfield">
            <span>Rate (1 Base = ? Quote)</span>
            <input id="fx_rate" type="number" inputmode="decimal" step="0.0000001" value="${pref.fx.rate ?? 1}" />
          </label>
        </div>
        <div class="agdesc" style="margin-top:8px">
          Contoh: Base=IDR, Quote=USD, Rate=0,000065 → 1 IDR = 0,000065 USD.
        </div>
      `;

      const b = $c('#fx_base');
      const q = $c('#fx_quote');
      const r = $c('#fx_rate');

      const onFx = () => {
        pref.fx.base  = (b.value || 'IDR').trim().toUpperCase();
        pref.fx.quote = (q.value || 'USD').trim().toUpperCase();
        pref.fx.rate  = toNum(r.value, pref.fx.rate);
        persist(); recalc();
      };

      b.addEventListener('input', onFx);
      q.addEventListener('input', onFx);
      r.addEventListener('input', onFx);
    }
  }

  function recalcFertAdvanced(){
    const doseA = toNum(elValue.value, 0);
    pref.fert.doseKgPerPokok = doseA;

    const basis = pref.fert.basis || 'N';

    const specA = getSpec(pref.fert.srcType, pref.fert.srcId, pref.fert.srcNPK);
    const specB = getSpec(pref.fert.dstType, pref.fert.dstId, pref.fert.dstNPK);

    const resBox = $c('#f_result');
    if (!specA || !specB || !(doseA > 0)){
      resBox.innerHTML = `<div class="agout-row"><div>Ringkasan</div><div class="agout-val">Input belum valid</div></div>`;
      return { ok:false, label:'', outText:'' };
    }

    const aBasisFrac = specA[basis] || 0;
    const bBasisFrac = specB[basis] || 0;
    if (!(aBasisFrac > 0) || !(bBasisFrac > 0)){
      resBox.innerHTML = `<div class="agout-row"><div>Ringkasan</div><div class="agout-val">Hara acuan ${basis} tidak tersedia di pupuk A/B</div></div>`;
      return { ok:false, label:'', outText:'' };
    }

    // Nutrient amounts from A
    const nutA = nutrientAmountKg(doseA, specA);
    // Dose B based on basis
    const doseB = nutA[basis] / bBasisFrac;
    const nutB = nutrientAmountKg(doseB, specB);

    // deficits/surplus compared to A
    const def = {};
    const sur = {};
    for (const n of NUTS){
      def[n] = Math.max(0, nutA[n] - nutB[n]);
      sur[n] = Math.max(0, nutB[n] - nutA[n]);
    }

    // Top-up calc
    const topChoice = {
      N: pref.fert.topN,
      P: pref.fert.topP,
      K: pref.fert.topK,
      Mg: pref.fert.topMg,
      Ca: pref.fert.topCa
    };

    let topDose = { N:0, P:0, K:0, Mg:0, Ca:0 };
    let doloDose = 0;

    // Dolomite combo logic (Mg+Ca)
    const useDoloCombo = !!pref.fert.useDolomiteCombo;
    const mgIsDolo = topChoice.Mg === 'DOLO';
    const caIsDolo = topChoice.Ca === 'DOLO';

    if (useDoloCombo && mgIsDolo && caIsDolo){
      const needMg = def.Mg;
      const needCa = def.Ca;
      const d1 = needMg > 0 ? (needMg / FERT_SPECIAL.DOLO.Mg) : 0;
      const d2 = needCa > 0 ? (needCa / FERT_SPECIAL.DOLO.Ca) : 0;
      doloDose = Math.max(d1, d2);
      // hitung suplai dolomite
      const doloNut = nutrientAmountKg(doloDose, FERT_SPECIAL.DOLO);
      // setelah dolomite, sisa deficit mg/ca
      def.Mg = Math.max(0, def.Mg - doloNut.Mg);
      def.Ca = Math.max(0, def.Ca - doloNut.Ca);
      // simpan dosis dolomite sebagai top-up gabungan
    }

    const calcTop = (nut, choiceId) => {
      if (!(nut > 0)) return 0;
      if (choiceId === 'DOLO') {
        // jika salah satu saja dolomite, pakai rasio nut yg dipilih (Mg atau Ca)
        // akan dihitung di cabang bawah (Mg/Ca)
        return 0;
      }
      const sp = specFromSingle(choiceId);
      if (!sp) return 0;
      const frac = sp.N || sp.P || sp.K || sp.Mg || sp.Ca;
      if (!(frac > 0)) return 0;
      return nut / frac;
    };

    // N/P/K topup
    topDose.N = calcTop(def.N, topChoice.N);
    topDose.P = calcTop(def.P, topChoice.P);
    topDose.K = calcTop(def.K, topChoice.K);

    // Mg/Ca topup (if dolomite not combined or only one selected)
    if (topChoice.Mg === 'DOLO' && def.Mg > 0){
      // butuh Mg dengan dolomite
      const d = def.Mg / FERT_SPECIAL.DOLO.Mg;
      doloDose = Math.max(doloDose, d);
      // update defMg (anggap dolomite ini dipakai)
      const doloNut = nutrientAmountKg(d, FERT_SPECIAL.DOLO);
      def.Mg = Math.max(0, def.Mg - doloNut.Mg);
      def.Ca = Math.max(0, def.Ca - doloNut.Ca);
    } else {
      topDose.Mg = calcTop(def.Mg, topChoice.Mg);
    }

    if (topChoice.Ca === 'DOLO' && def.Ca > 0){
      const d = def.Ca / FERT_SPECIAL.DOLO.Ca;
      doloDose = Math.max(doloDose, d);
      const doloNut = nutrientAmountKg(d, FERT_SPECIAL.DOLO);
      def.Mg = Math.max(0, def.Mg - doloNut.Mg);
      def.Ca = Math.max(0, def.Ca - doloNut.Ca);
    } else {
      topDose.Ca = calcTop(def.Ca, topChoice.Ca);
    }

    // Build result HTML
    const rows = NUTS.map(n => `
      <div class="agout-row">
        <div>${n}</div>
        <div class="agout-val">${fmtNutrKg(nutA[n])} → ${fmtNutrKg(nutB[n])} (def ${fmtNutrKg(Math.max(0, nutA[n]-nutB[n]))})</div>
      </div>
    `).join('');

    const topLines = [];
    if (doloDose > 0) topLines.push(`• Dolomite: <b>${fmtKgSmart(doloDose)}</b>`);
    if (topDose.N > 0) topLines.push(`• ${FERT_SINGLE[topChoice.N]?.name || topChoice.N}: <b>${fmtKgSmart(topDose.N)}</b>`);
    if (topDose.P > 0) topLines.push(`• ${FERT_SINGLE[topChoice.P]?.name || topChoice.P}: <b>${fmtKgSmart(topDose.P)}</b>`);
    if (topDose.K > 0) topLines.push(`• ${FERT_SINGLE[topChoice.K]?.name || topChoice.K}: <b>${fmtKgSmart(topDose.K)}</b>`);
    if (topDose.Mg > 0) topLines.push(`• ${FERT_SINGLE[topChoice.Mg]?.name || topChoice.Mg}: <b>${fmtKgSmart(topDose.Mg)}</b>`);
    if (topDose.Ca > 0) topLines.push(`• ${FERT_SINGLE[topChoice.Ca]?.name || topChoice.Ca}: <b>${fmtKgSmart(topDose.Ca)}</b>`);

    const topHtml = topLines.length
      ? `<div class="agdesc" style="margin-top:8px">${topLines.join('<br/>')}</div>`
      : `<div class="agdesc" style="margin-top:8px">Tidak ada tambahan pupuk tunggal (defisit 0 untuk semua hara non-acuan).</div>`;

    resBox.innerHTML = `
      <div class="agout-row">
        <div>Konversi</div>
        <div class="agout-val big">${fmtKgSmart(doseA)} → ${fmtKgSmart(doseB)}</div>
      </div>
      <div class="agout-row">
        <div>Hara acuan</div>
        <div class="agout-val">${basis}</div>
      </div>
      ${rows}
      <div class="agout-row">
        <div>Tambahan</div>
        <div class="agout-val">lihat di bawah</div>
      </div>
      ${topHtml}
    `;

    // label + output string for history
    const nameA = specA.name || 'Pupuk A';
    const nameB = specB.name || 'Pupuk B';
    const label = `Pupuk: ${nameA} ${doseA} kg/pokok → ${nameB} (basis ${basis})`;
    const outText = `Dosis B=${doseB.toFixed(4)} kg/pokok; TopUp: ${topLines.length? topLines.join(' | '): 'tidak ada'}`;

    return { ok:true, label, outText, doseB };
  }

  function recalc(){
    const tab = pref.tab;
    const v = toNum(elValue.value, 0);
    let out = NaN;
    let label = '';

    if (tab === 'length'){
      pref.length.from = elFrom.value;
      pref.length.to   = elTo.value;
      persist();
      out = convertLinear(v, pref.length.from, pref.length.to, LENGTH);
      label = `${v} ${pref.length.from} → ${pref.length.to}`;

    } else if (tab === 'mass'){
      pref.mass.from = elFrom.value;
      pref.mass.to   = elTo.value;
      persist();
      out = convertLinear(v, pref.mass.from, pref.mass.to, MASS);
      label = `${v} ${pref.mass.from} → ${pref.mass.to}`;

    } else if (tab === 'volume'){
      pref.volume.from = elFrom.value;
      pref.volume.to   = elTo.value;
      persist();
      out = convertLinear(v, pref.volume.from, pref.volume.to, VOLUME);
      label = `${v} ${pref.volume.from} → ${pref.volume.to}`;

    } else if (tab === 'area'){
      pref.area.from = elFrom.value;
      pref.area.to   = elTo.value;
      persist();
      out = convertLinear(v, pref.area.from, pref.area.to, AREA);
      label = `${v} ${pref.area.from} → ${pref.area.to}`;

    } else if (tab === 'temp'){
      pref.temp.from = elFrom.value;
      pref.temp.to   = elTo.value;
      persist();
      out = convertTemperature(v, pref.temp.from, pref.temp.to);
      label = `${v} ${String(pref.temp.from).toUpperCase()} → ${String(pref.temp.to).toUpperCase()}`;

    } else if (tab === 'fert'){
      // ✅ advanced fertilizer conversion
      persist();
      const rr = recalcFertAdvanced();
      // output utama di elOut: tampilkan dosis B saja (ringkas)
      if (rr.ok){
        elOut.textContent = rr.doseB ? `${rr.doseB.toLocaleString('id-ID',{maximumFractionDigits:4})} kg` : '-';
        label = rr.label;
        containerRef.dataset.lastConvLabel = label;
        containerRef.dataset.lastConvOut = rr.outText;
      } else {
        elOut.textContent = '-';
        setHint?.('Input pupuk belum valid');
        containerRef.dataset.lastConvLabel = 'Konversi Pupuk';
        containerRef.dataset.lastConvOut = '';
      }
      return; // stop, sudah setHint di fungsi

    } else if (tab === 'fx'){
      const base  = (pref.fx.base || 'IDR').trim().toUpperCase();
      const quote = (pref.fx.quote || 'USD').trim().toUpperCase();
      const rate  = toNum(pref.fx.rate, 1);

      const direction = (elFrom.value === 'base' && elTo.value === 'quote') ? 'base_to_quote' : 'quote_to_base';
      out = convertFX(v, base, quote, rate, direction);
      label = direction === 'base_to_quote'
        ? `${v} ${base} → ${quote} (rate ${rate})`
        : `${v} ${quote} → ${base} (rate ${rate})`;
    }

    if (!isFinite(out)){
      elOut.textContent = '-';
      setHint?.('Input belum valid');
    } else {
      const isInt = Math.abs(out - Math.round(out)) < 1e-9;
      elOut.textContent = isInt
        ? `${fmtInt(out)}`
        : `${out.toLocaleString('id-ID', { maximumFractionDigits: 6 })}`;
      setHint?.('Siap');
    }

    containerRef.dataset.lastConvLabel = label;
    containerRef.dataset.lastConvOut = isFinite(out) ? String(out) : '';
  }

  function swap(){
    const tab = pref.tab;

    if (tab === 'fx'){
      const from = elFrom.value;
      elFrom.value = elTo.value;
      elTo.value = from;
      recalc();
      return;
    }

    // fertiliser swap: tukar pupuk A/B (type+id+npk) + basis tetap
    if (tab === 'fert'){
      const tmpType = pref.fert.srcType; pref.fert.srcType = pref.fert.dstType; pref.fert.dstType = tmpType;
      const tmpId = pref.fert.srcId; pref.fert.srcId = pref.fert.dstId; pref.fert.dstId = tmpId;
      const tmpN = pref.fert.srcNPK; pref.fert.srcNPK = pref.fert.dstNPK; pref.fert.dstNPK = tmpN;
      persist();
      setupSelectors();
      recalc();
      return;
    }

    const a = elFrom.value;
    elFrom.value = elTo.value;
    elTo.value = a;

    persist();
    recalc();
  }

  function saveHistoryRow(){
    const label = containerRef.dataset.lastConvLabel || 'Konversi';
    const out = containerRef.dataset.lastConvOut || '';
    if (!out) return setHint?.('Belum ada hasil untuk disimpan');

    addHistory('Konversi', label, out);
    renderHistory?.();
    setHint?.('Konversi disimpan ke history');
  }

  function resetDefaults(){
    const fresh = JSON.parse(JSON.stringify(DEFAULT_PREF));
    Object.keys(pref).forEach(k => delete pref[k]);
    Object.assign(pref, fresh);
    persist();
    syncUIFromPref();
    setHint?.('Default konversi di-reset');
  }

  function syncUIFromPref(){
    setActiveTabUI();
    setupSelectors();
    if (!elValue.value) elValue.value = 0;
    recalc();
  }

  function mount(container){
    if (!container) return;
    containerRef = container;
    $c = (s) => containerRef.querySelector(s);

    if (mounted){
      syncUIFromPref();
      return;
    }

    containerRef.innerHTML = `
      <div class="agcard">
        <div class="agtitle">Konversi</div>
        <div class="agdesc">
          Konversi offline (tanpa internet). Kurs mata uang memakai <b>rate manual</b> yang bisa Anda simpan.
        </div>

        <div class="agro-tabs" style="margin-bottom:10px">
          <button class="agtab" data-ctab="length">Panjang</button>
          <button class="agtab" data-ctab="mass">Berat</button>
          <button class="agtab" data-ctab="volume">Volume</button>
          <button class="agtab" data-ctab="area">Luas</button>
          <button class="agtab" data-ctab="temp">Suhu</button>
          <button class="agtab" data-ctab="fert">Pupuk</button>
          <button class="agtab" data-ctab="fx">Mata Uang</button>
        </div>

        <div class="aggrid cgrid-3">
          <label class="agfield">
            <span>Nilai</span>
            <input id="c_value" type="number" inputmode="decimal" step="0.0001" value="0"/>
          </label>

          <label class="agfield">
            <span>Dari</span>
            <select id="c_from"></select>
          </label>

          <label class="agfield">
            <span>Ke</span>
            <select id="c_to"></select>
          </label>
        </div>

        <div id="c_extra" style="margin-top:10px"></div>

        <div class="agout" style="margin-top:12px">
          <div class="agout-row">
            <div>Hasil</div>
            <div id="c_out" class="agout-val big">-</div>
          </div>
        </div>

        <div class="agactions">
          <button class="pill" id="c_swap" type="button">Tukar</button>
          <button class="pill" id="c_save" type="button">Simpan ke History</button>
          <button class="pill ghost" id="c_reset" type="button">Reset Default Konversi</button>
        </div>
      </div>
    `;

    btns = Array.from(containerRef.querySelectorAll('[data-ctab]'));
    elValue = $c('#c_value');
    elFrom  = $c('#c_from');
    elTo    = $c('#c_to');
    elOut   = $c('#c_out');
    elExtra = $c('#c_extra');
    btnSwap = $c('#c_swap');
    btnSave = $c('#c_save');
    btnReset= $c('#c_reset');

    btns.forEach(b => {
      b.addEventListener('click', () => {
        pref.tab = b.dataset.ctab;
        persist();
        syncUIFromPref();
      });
    });

    // nilai + dropdown perubahan
    elValue.addEventListener('input', () => { if (pref.tab==='fert') pref.fert.doseKgPerPokok = toNum(elValue.value,1); persist(); recalc(); });
    elFrom.addEventListener('change', recalc);
    elTo.addEventListener('change', recalc);

    btnSwap.addEventListener('click', swap);
    btnSave.addEventListener('click', saveHistoryRow);
    btnReset.addEventListener('click', resetDefaults);

    mounted = true;
    syncUIFromPref();
  }

  return {
    mount,
    reset: () => { localStorage.removeItem(LS_CONVERT); },
    loadPref: () => loadPref(),
  };
}
