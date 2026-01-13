// modules/agro.js
import { AGRO_DEFAULT, loadAgroPref, saveAgroPref, addHistory } from '../core/storage.js';
import { toNum, roundNearest5 } from '../core/utils.js';
import { fmtDec, fmtInt, fmtSmartPct, fmtKg, fmtTon } from '../core/format.js';

// ✅ Default losses (disimpan di Agro Pref)
const LOSSES_DEFAULT = {
  // mode: 'brond' atau 'tbs'
  mode: 'brond',

  // input utama (jumlah kehilangan + satuan)
  qty: 1, // default "1" (brondolan / janjang tergantung mode)
  unit: 'per_pokok_panen', // per_pokok_panen | per_rotasi | per_ha

  // parameter umum
  rotPerMonth: 4,
  sph: 136,
  akpRatio: 3,
  divHa: 500,
  priceCpo: 15000,
  priceKer: 7000,

  // brondolan defaults
  brondG: 15,
  oerBr: 45,
  kerBr: 8,

  // tbs/janjang defaults
  bjrKg: 10,
  oerTbs: 25,
  kerTbs: 6,
  tbsKgPerRot: 0 // optional override kg/rotasi
};

const fmtRp = (n)=>{
  if (!isFinite(n)) return '-';
  return n.toLocaleString('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 });
};
const fmtNum = (n, d=2)=>{
  if (!isFinite(n)) return '-';
  return n.toLocaleString('id-ID', { maximumFractionDigits:d });
};

export function createAgroModule({root, setHint, renderHistory}){
  const $ = (s) => root.querySelector(s);
    // ✅ safe helpers (hindari error kalau elemen belum ada)
    const elById = (id) => root.querySelector('#' + id) || document.getElementById(id);

    const setVal = (id, v) => {
      const el = elById(id);
      if (!el) return false;
      el.value = v;
      return true;
    };

      // ✅ angka aman: "" dianggap kosong -> pakai fallback (bukan 0)
  function numOr(val, fallback){
    if (val == null) return fallback;
    const s = String(val).trim();
    if (s === '') return fallback;
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }
  
    const getVal = (id) => {
      const el = elById(id);
      return el ? el.value : null;
    };
  
    const setText = (id, t) => {
      const el = elById(id);
      if (!el) return false;
      el.textContent = t;
      return true;
    };  

    function ensureLossesPref(pref){
      // base merge dulu
      const merged = { ...structuredClone(LOSSES_DEFAULT), ...(pref.losses || {}) };
    
      // helper: kalau nilai tidak valid (<=0 / NaN), pakai default
      const fixPos = (key) => {
        const v = Number(merged[key]);
        if (!Number.isFinite(v) || v <= 0) merged[key] = LOSSES_DEFAULT[key];
      };
    
      const fixPct = (key) => {
        const v = Number(merged[key]);
        // persen: valid 0..100, tapi untuk default biasanya >0.
        if (!Number.isFinite(v) || v < 0 || v > 100) merged[key] = LOSSES_DEFAULT[key];
        // kalau 0 karena “ketimpa”, kita pulihkan ke default
        if (v === 0) merged[key] = LOSSES_DEFAULT[key];
      };
    
      // ===== field penting yang TIDAK boleh 0 =====
      fixPos('rotPerMonth');
      fixPos('sph');
      fixPos('akpRatio');
      fixPos('divHa');
      fixPos('priceCpo');
      fixPos('priceKer');
    
      // mode & unit wajib valid
      if (!['brond','tbs'].includes(merged.mode)) merged.mode = LOSSES_DEFAULT.mode;
      if (!['per_pokok_panen','per_rotasi','per_ha'].includes(merged.unit)) merged.unit = LOSSES_DEFAULT.unit;
    
      // qty boleh 0, tapi kalau kosong/NaN → default
      {
        const q = Number(merged.qty);
        if (!Number.isFinite(q) || q < 0) merged.qty = LOSSES_DEFAULT.qty;
      }
    
      // ===== brondolan defaults =====
      fixPos('brondG');
      fixPct('oerBr');
      fixPct('kerBr');
    
      // ===== tbs defaults =====
      fixPos('bjrKg');
      fixPct('oerTbs');
      fixPct('kerTbs');
    
      // tbsKgPerRot boleh 0 (optional override), tapi kalau NaN/negatif → 0
      {
        const k = Number(merged.tbsKgPerRot);
        if (!Number.isFinite(k) || k < 0) merged.tbsKgPerRot = 0;
      }
    
      // simpan balik ke pref + localStorage
      pref.losses = merged;
      saveAgroPref(pref);
      return pref.losses;
    }    
  
    function updateLossesModeUI(){
      const mode = getVal('l_mode') || 'brond';
  
      // label qty berubah sesuai mode
      const qtyLabel = elById('l_qty_label');
      if (qtyLabel){
        qtyLabel.textContent = (mode === 'brond') ? 'Jumlah Brondolan Hilang' : 'Jumlah Janjang Hilang';
      }
  
      // show/hide section
      const secBr = elById('l_sec_brond');
      const secTbs = elById('l_sec_tbs');
      if (secBr) secBr.classList.toggle('hidden', mode !== 'brond');
      if (secTbs) secTbs.classList.toggle('hidden', mode !== 'tbs');
  
      // output label berubah
      const lossLabel = elById('l_loss_label');
      if (lossLabel){
        lossLabel.textContent = (mode === 'brond') ? 'Loss Brondolan (kg/bulan)' : 'Loss TBS (kg/bulan)';
      }
    }  

    function syncInputsFromPref(){
      const pref = loadAgroPref();
  
      // existing agro inputs
      setVal('k_sph', pref.kec.sph);
      setVal('k_sisip', pref.kec.sisip);
      setVal('k_afkir', pref.kec.afkir);
  
      setVal('t_sph', pref.tak.sph);
      setVal('t_luas', pref.tak.luas);
      setVal('t_bjr', pref.tak.bjr);
      setVal('tr_cap', pref.tak.capTon);
      setVal('tr_rit', pref.tak.rit);
  
      setVal('p_tipe', pref.tenaga.tipe);
      setVal('p_luas', pref.tenaga.luasDiv);
      setVal('p_cad',  pref.tenaga.cad);
  
      setVal('j_sph', pref.jarak.sph);
  
      // losses pref ensure + sync
      const L = ensureLossesPref(pref);
  
      setVal('l_mode', L.mode);
      setVal('l_qty', L.qty);
      setVal('l_unit', L.unit);
  
      setVal('l_rot', L.rotPerMonth);
      setVal('l_div_ha', L.divHa);
      setVal('l_sph', L.sph);
      setVal('l_akp_ratio', L.akpRatio);
      setVal('l_h_cpo', L.priceCpo);
      setVal('l_h_ker', L.priceKer);
  
      // brond defaults
      setVal('l_brond_g', L.brondG);
      setVal('l_oer_br', L.oerBr);
      setVal('l_ker_br', L.kerBr);
  
      // tbs defaults
      setVal('l_bjr', L.bjrKg);
      setVal('l_oer_tbs', L.oerTbs);
      setVal('l_ker_tbs', L.kerTbs);
      setVal('l_tbs_kg_rot', L.tbsKgPerRot);
  
      updateLossesModeUI();
    }  

  function savePrefFromInputs(){
    const pref = loadAgroPref();
    pref.kec.sph   = toNum($('#k_sph').value, pref.kec.sph);
    pref.kec.sisip = toNum($('#k_sisip').value, pref.kec.sisip);
    pref.kec.afkir = toNum($('#k_afkir').value, pref.kec.afkir);

    pref.tak.sph    = toNum($('#t_sph').value, pref.tak.sph);
    pref.tak.luas   = toNum($('#t_luas').value, pref.tak.luas);
    pref.tak.bjr    = toNum($('#t_bjr').value, pref.tak.bjr);
    pref.tak.capTon = toNum($('#tr_cap').value, pref.tak.capTon);
    pref.tak.rit    = toNum($('#tr_rit').value, pref.tak.rit);

    pref.tenaga.tipe    = $('#p_tipe').value || pref.tenaga.tipe;
    pref.tenaga.luasDiv = toNum($('#p_luas').value, pref.tenaga.luasDiv);
    pref.tenaga.cad     = toNum($('#p_cad').value, pref.tenaga.cad);

    pref.jarak.sph = toNum($('#j_sph').value, pref.jarak.sph);

    // ===== Losses (mode-based, "" tidak jadi 0) =====
    pref.losses = { ...structuredClone(LOSSES_DEFAULT), ...(pref.losses||{}) };

    pref.losses.mode = getVal('l_mode') || pref.losses.mode || 'brond';
    pref.losses.qty  = numOr(getVal('l_qty'), pref.losses.qty);
    pref.losses.unit = getVal('l_unit') || pref.losses.unit || 'per_pokok_panen';
    
    pref.losses.rotPerMonth = numOr(getVal('l_rot'), pref.losses.rotPerMonth);
    pref.losses.divHa       = numOr(getVal('l_div_ha'), pref.losses.divHa);
    pref.losses.sph         = numOr(getVal('l_sph'), pref.losses.sph);
    pref.losses.akpRatio    = numOr(getVal('l_akp_ratio'), pref.losses.akpRatio);
    
    pref.losses.priceCpo    = numOr(getVal('l_h_cpo'), pref.losses.priceCpo);
    pref.losses.priceKer    = numOr(getVal('l_h_ker'), pref.losses.priceKer);
    
    // brond defaults
    pref.losses.brondG      = numOr(getVal('l_brond_g'), pref.losses.brondG);
    pref.losses.oerBr       = numOr(getVal('l_oer_br'), pref.losses.oerBr);
    pref.losses.kerBr       = numOr(getVal('l_ker_br'), pref.losses.kerBr);
    
    // tbs defaults
    pref.losses.bjrKg       = numOr(getVal('l_bjr'), pref.losses.bjrKg);
    pref.losses.oerTbs      = numOr(getVal('l_oer_tbs'), pref.losses.oerTbs);
    pref.losses.kerTbs      = numOr(getVal('l_ker_tbs'), pref.losses.kerTbs);
    pref.losses.tbsKgPerRot = numOr(getVal('l_tbs_kg_rot'), pref.losses.tbsKgPerRot);
    
    saveAgroPref(pref);    
    return pref;
  }

  // --- calculations ---
  function calcKecambah(pref){
    const sph = Number(pref.kec.sph);
    const sisip = Number(pref.kec.sisip)/100;
    const afkir = Number(pref.kec.afkir)/100;
    if (!(sph>0) || afkir<0 || afkir>=1) return {raw:NaN, rounded:NaN};
    const raw = (sph * (1 + sisip)) / (1 - afkir);
    const rounded = roundNearest5(raw);
    return {raw, rounded};
  }

  function calcAKP(){
    const pokok = Number($('#a_pokok')?.value || 0);
    const janjang = Number($('#a_janjang')?.value || 0);
    if (!(pokok>0) || !(janjang>=0)) return {pokok,janjang, akpPct:NaN, akpText:'-', ratioText:'-'};
    if (janjang===0) return {pokok,janjang, akpPct:0, akpText:'0%', ratioText:'1 : ∞'};
    const akpPct = (janjang/pokok)*100;
    const ratio = pokok/janjang;
    return {pokok,janjang, akpPct, akpText: fmtSmartPct(akpPct), ratioText: `1 : ${fmtDec(ratio,1)}`};
  }

  function calcTaksasi(pref, akpPct){
    const sph = Number(pref.tak.sph);
    const luas = Number(pref.tak.luas);
    const bjr = Number(pref.tak.bjr);
    if (!(sph>0) || !(luas>0) || !(bjr>0) || !isFinite(akpPct)) return {kg:NaN, ton:NaN};
    const kg = (akpPct/100) * sph * luas * bjr;
    return {kg, ton: kg/1000};
  }

  function calcTruk(pref, takTon){
    const cap = Number(pref.tak.capTon);
    const rit = Number(pref.tak.rit);
    if (!(cap>0) || !(rit>0) || !isFinite(takTon)) return {needNum:NaN, need:'-'};
    const needNum = takTon / cap / rit;
    return {needNum, need: Math.ceil(needNum)};
  }

  function calcTenaga(pref){
    const tipe = pref.tenaga.tipe;
    const luas = Number(pref.tenaga.luasDiv);
    const cadPct = Number(pref.tenaga.cad)/100;
    const standar = (tipe==='bukit') ? 2.65 : 3.33;
    if (!(luas>0) || cadPct<0) return {baseNum:NaN, reserveNum:NaN, totalNum:NaN, base:'-', reserve:'-', total:'-'};
    const baseNum = luas/6/standar;
    const base = Math.round(baseNum);
    const reserveNum = base * cadPct;
    const reserve = Math.round(reserveNum);
    const total = base + reserve;
    return {baseNum, reserveNum, totalNum: total, base, reserve, total};
  }

  function calcJarak(pref){
    const sph = Number(pref.jarak.sph);
    if (!(sph>0)) return {pokok:NaN, baris:NaN};
    const areaPer = 10000 / sph;
    const s = Math.sqrt(areaPer / 0.866);
    return {pokok: s, baris: 0.866*s};
  }

  function calcLosses(pref){
    const L = { ...structuredClone(LOSSES_DEFAULT), ...(pref.losses||{}) };

    const mode = L.mode || 'brond';
    const qty  = Number(L.qty);
    const unit = L.unit || 'per_pokok_panen';

    const rot = Number(L.rotPerMonth);
    const sph = Number(L.sph);
    const akpRatio = Number(L.akpRatio);
    const divHa = Number(L.divHa);

    const priceCpo = Number(L.priceCpo);
    const priceKer = Number(L.priceKer);

    if (!(divHa>0) || !(sph>0) || !(akpRatio>0) || !(rot>0) || !(qty>=0)) return { ok:false };

    const totalPokok = divHa * sph;

    // Estimasi janjang panen / rotasi (anggap 1 pokok panen ~ 1 janjang)
    const estJjgRot = totalPokok / akpRatio;
    const estJjgMon = estJjgRot * rot;

    // helper: hitung jumlah kehilangan per rotasi (basis unit)
    const qtyToPerRot = (q)=>{
      if (!(q>0)) return 0;
      if (unit === 'per_rotasi') return q;
      if (unit === 'per_ha') return divHa * q;
      // per_pokok_panen
      return estJjgRot * q;
    };

    if (mode === 'brond'){
      const brondG = Number(L.brondG);
      const oerBr = Number(L.oerBr)/100;
      const kerBr = Number(L.kerBr)/100;
      if (!(brondG>=0)) return { ok:false };

      const brCountRot = qtyToPerRot(qty);
      const brCountMon = brCountRot * rot;

      const brKgMon = (brCountMon * brondG) / 1000;

      const cpoKgMon = brKgMon * oerBr;
      const kerKgMon = brKgMon * kerBr;

      const rpMon = (cpoKgMon * priceCpo) + (kerKgMon * priceKer);
      const rpYear = rpMon * 12;

      return {
        ok:true,
        mode,
        estJjgRot, estJjgMon,
        lossKgMon: brKgMon,
        rpMon, rpYear,
        rpBreak: `CPO ${fmtNum(cpoKgMon,2)} kg/bln + Kernel ${fmtNum(kerKgMon,2)} kg/bln`
      };
    }

    // mode === 'tbs'
    const bjrKg = Number(L.bjrKg);
    const oerTbs = Number(L.oerTbs)/100;
    const kerTbs = Number(L.kerTbs)/100;
    if (!(bjrKg>0)) return { ok:false };

    // jjg hilang per rotasi berdasar unit
    const jjgLostRot = qtyToPerRot(qty);

    // kg override optional
    const kgOverride = Number(L.tbsKgPerRot);
    const tbsKgRot = (kgOverride > 0) ? kgOverride : (jjgLostRot * bjrKg);

    const cpoKgRot = tbsKgRot * oerTbs;
    const kerKgRot = tbsKgRot * kerTbs;

    const cpoKgMon = cpoKgRot * rot;
    const kerKgMon = kerKgRot * rot;

    const rpMon = (cpoKgMon * priceCpo) + (kerKgMon * priceKer);
    const rpYear = rpMon * 12;

    return {
      ok:true,
      mode,
      estJjgRot, estJjgMon,
      lossKgMon: tbsKgRot * rot,
      rpMon, rpYear,
      rpBreak: `TBS ${fmtNum(tbsKgRot,2)} kg/rot × ${rot} rot | CPO ${fmtNum(cpoKgMon,2)} kg/bln + Kernel ${fmtNum(kerKgMon,2)} kg/bln`
    };
  }

  function recalc(){
    const pref = savePrefFromInputs();
    const k = calcKecambah(pref);
    $('#k_raw').textContent = isFinite(k.raw) ? fmtDec(k.raw,2) : '-';
    $('#k_round').textContent = isFinite(k.rounded) ? fmtInt(k.rounded) : '-';

    const a = calcAKP();
    $('#a_pct').textContent = a.akpText ?? '-';
    $('#a_ratio').textContent = a.ratioText ?? '-';

    const t = calcTaksasi(pref, a.akpPct);
    $('#t_kg').textContent = isFinite(t.kg) ? fmtKg(t.kg) : '-';
    $('#t_ton').textContent = isFinite(t.ton) ? fmtTon(t.ton) : '-';

    const tr = calcTruk(pref, t.ton);
    $('#tr_need').textContent = isFinite(tr.needNum) ? `${tr.need} unit` : '-';

    const p = calcTenaga(pref);
    $('#p_base').textContent = isFinite(p.baseNum) ? `${p.base} orang` : '-';
    $('#p_res').textContent = isFinite(p.reserveNum) ? `${p.reserve} orang` : '-';
    $('#p_total').textContent = isFinite(p.totalNum) ? `${p.total} orang` : '-';

    const j = calcJarak(pref);
    $('#j_pokok').textContent = isFinite(j.pokok) ? `${j.pokok.toFixed(1)} m` : '-';
    $('#j_baris').textContent = isFinite(j.baris) ? `${j.baris.toFixed(2)} m` : '-';

    // Losses output
    if (!pref.losses) {
        pref.losses = structuredClone(LOSSES_DEFAULT);
        saveAgroPref(pref);
     }
     const L = calcLosses(pref);

     setText('l_est_jjg_rot', L.ok ? `${fmtNum(L.estJjgRot,0)} jjg` : '-');
     setText('l_est_jjg_mon', L.ok ? `${fmtNum(L.estJjgMon,0)} jjg` : '-');
 
     setText('l_loss_qty', L.ok ? `${fmtNum(L.lossKgMon,2)} kg` : '-');
 
     setText('l_rp_mon',  L.ok ? fmtRp(L.rpMon) : '-');
     setText('l_rp_year', L.ok ? fmtRp(L.rpYear) : '-');
     setText('l_rp_break', L.ok ? (L.rpBreak || '-') : '-');
 
     // jaga UI sesuai mode
     updateLossesModeUI(); 
  }

  function init(){
    // tab switching (✅ aman bila pane belum ada)
    root.querySelectorAll('.agtab').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        root.querySelectorAll('.agtab').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.dataset.agtab;
        root.querySelectorAll('.agpane').forEach(p=>p.classList.add('hidden'));

        const pane = root.querySelector('#agpane-' + tab);
        if (!pane){
          // Jangan crash — beri info supaya mudah cek ID/HTML
          setHint?.(`Pane "agpane-${tab}" tidak ditemukan. Cek index.html (id section)`);
          return;
        }

        pane.classList.remove('hidden');
        recalc();
      });
    });

    // bind inputs that persist
    const idsPersist = [
      'k_sph','k_sisip','k_afkir',
      't_sph','t_luas','t_bjr','tr_cap','tr_rit',
      'p_tipe','p_luas','p_cad',
      'j_sph',
    
      // ✅ losses
      'l_div_ha','l_sph','l_akp_ratio','l_bjr','l_brond_g','l_brond_per_jjg',
      'l_oer_tbs','l_ker_tbs','l_oer_br','l_ker_br',
      'l_h_cpo','l_h_ker','l_rot',
      'l_tbs_jjg_rot','l_tbs_kg_rot',
      'l_mode','l_qty','l_unit',
      'l_rot','l_div_ha','l_sph','l_akp_ratio','l_h_cpo','l_h_ker',
      'l_brond_g','l_oer_br','l_ker_br',
      'l_bjr','l_oer_tbs','l_ker_tbs','l_tbs_kg_rot',
    ];    
    idsPersist.forEach(id=>{
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', recalc);
      el.addEventListener('change', recalc);
    });

    elById('l_mode')?.addEventListener('change', ()=>{
      updateLossesModeUI();
      recalc();
    });

    // AKP daily inputs
    ['a_pokok','a_janjang'].forEach(id=>{
      const el=document.getElementById(id);
      if(!el) return;
      el.addEventListener('input', recalc);
      el.addEventListener('change', recalc);
    });

    // buttons
    $('#k_save_hist').addEventListener('click', ()=>{
      const pref = loadAgroPref();
      const out = calcKecambah(pref);
      if (!isFinite(out.rounded)) return setHint('Input kecambah belum valid');
      const expr = `Kecambah: SPH ${pref.kec.sph}, Sisip ${pref.kec.sisip}%, Afkir ${pref.kec.afkir}%`;
      const res = `${fmtInt(out.rounded)} (raw ${fmtDec(out.raw,2)})`;
      addHistory('Agronomi', expr, res);
      renderHistory?.();
      setHint('Kecambah disimpan ke history');
    });

    $('#k_reset_defaults').addEventListener('click', ()=>{
      const pref = loadAgroPref();
      pref.kec = structuredClone(AGRO_DEFAULT.kec);
      saveAgroPref(pref);
      syncInputsFromPref();
      recalc();
      setHint('Default kecambah di-reset');
    });

    $('#a_save_hist').addEventListener('click', ()=>{
      const pref = loadAgroPref();
      const akp = calcAKP();
      const tak = calcTaksasi(pref, akp.akpPct);
      const tr = calcTruk(pref, tak.ton);
      if (!isFinite(akp.akpPct) || !isFinite(tak.kg)) return setHint('Input AKP/Taksasi belum valid');

      const expr = `AKP: Janjang ${akp.janjang} / Pokok ${akp.pokok} = ${akp.akpText} (${akp.ratioText}) | Taksasi: SPH ${pref.tak.sph}, Luas ${pref.tak.luas}ha, BJR ${pref.tak.bjr}kg | Truk: Cap ${pref.tak.capTon}t, Rit ${pref.tak.rit}`;
      const res  = `Taksasi ${fmtKg(tak.kg)} / ${fmtTon(tak.ton)} | Truk ${tr.need} unit`;
      addHistory('Agronomi', expr, res);
      renderHistory?.();
      setHint('AKP+Taksasi disimpan ke history');
    });

    $('#a_reset_defaults').addEventListener('click', ()=>{
      const pref = loadAgroPref();
      pref.tak = structuredClone(AGRO_DEFAULT.tak);
      saveAgroPref(pref);
      syncInputsFromPref();
      recalc();
      setHint('Default AKP/Taksasi/Truk di-reset');
    });

    $('#p_save_hist').addEventListener('click', ()=>{
      const pref = loadAgroPref();
      const out = calcTenaga(pref);
      if (!isFinite(out.totalNum)) return setHint('Input tenaga panen belum valid');
      const expr = `Tenaga Panen: Tipe ${pref.tenaga.tipe}, Luas ${pref.tenaga.luasDiv}ha, Cad ${pref.tenaga.cad}%`;
      const res = `Panen ${out.base} + Cad ${out.reserve} = Total ${out.total}`;
      addHistory('Agronomi', expr, res);
      renderHistory?.();
      setHint('Tenaga panen disimpan ke history');
    });

    $('#p_reset_defaults').addEventListener('click', ()=>{
      const pref = loadAgroPref();
      pref.tenaga = structuredClone(AGRO_DEFAULT.tenaga);
      saveAgroPref(pref);
      syncInputsFromPref();
      recalc();
      setHint('Default tenaga di-reset');
    });

    $('#j_save_hist').addEventListener('click', ()=>{
      const pref = loadAgroPref();
      const out = calcJarak(pref);
      if (!isFinite(out.pokok) || !isFinite(out.baris)) return setHint('Input jarak tanam belum valid');
      const expr = `Jarak Tanam: SPH ${pref.jarak.sph}`;
      const res = `Pokok ${out.pokok.toFixed(1)} m | Baris ${out.baris.toFixed(2)} m`;
      addHistory('Agronomi', expr, res);
      renderHistory?.();
      setHint('Jarak tanam disimpan ke history');
    });

        // ✅ Losses: save to history
        $('#l_save_hist')?.addEventListener('click', ()=>{
          const pref = loadAgroPref();
          if (!pref.losses) pref.losses = structuredClone(LOSSES_DEFAULT);
    
          const L = calcLosses(pref);
          if (!L.ok) return setHint('Input losses belum valid');
    
          const expr = `Losses Divisi ${pref.losses.divHa}ha | SPH ${pref.losses.sph} | AKP 1:${pref.losses.akpRatio} | Rot ${pref.losses.rotPerMonth}/bln | Brond/jjg ${pref.losses.brondPerJjg} | TBS hilang rot (kg=${pref.losses.tbsLostKgPerRot}, jjg=${pref.losses.tbsLostJjgPerRot})`;
          const res  = `Bulan ${fmtRp(L.rpMon)} | Tahun ${fmtRp(L.rpYear)} | (TBS/bln ${fmtRp(L.rpTbsMon)}; Br/bln ${fmtRp(L.rpBrMon)})`;
    
          addHistory('Agronomi', expr, res);
          renderHistory?.();
          setHint('Losses disimpan ke history');
        });
    
        // ✅ Losses: reset default
        elById('l_reset_defaults')?.addEventListener('click', ()=>{
          const pref = loadAgroPref();
          pref.losses = structuredClone(LOSSES_DEFAULT);
          saveAgroPref(pref);
          syncInputsFromPref();
          recalc();
          setHint?.('Default losses di-reset');
        });     

    syncInputsFromPref();
    recalc();
  }

  return { init, syncInputsFromPref, recalc };
}
