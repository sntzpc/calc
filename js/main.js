// js/main.js (entry)
import { $ } from './core/dom.js';
import { registerSW, setupInstallButton } from './core/pwa.js';
import { loadPref, savePref, addHistory, resetAll, loadAgroPref } from './core/storage.js';
import * as exporter from './core/exporter.js';
import { createMathEngine } from './core/math_engine.js';
import { createPanelUI } from './ui/panel.js';
import { createCalcModule } from './modules/calc.js';
import { createAgroModule } from './modules/agro.js';
import { createConvertModule } from './modules/convert.js';
import { formatNumber } from './core/format.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const elExpr   = $('#expr');
  const elRes    = $('#result');
  const elHint   = $('#hint');
  const elStatus = $('#status');

  const panel = $('#panel');
  const panelTitle = $('#panel-title');
  const historyList = $('#history-list');

  const exportBox = $('#export-box');
  const exportNote = $('#export-note');
  const agroBox = $('#agro-box');
  const convertBox = $('#convert-box');

  const btnMode = $('#btn-mode');
  const sciPad = $('#sci-pad');

  const btnAgro = $('#btn-agro');
  const btnConvert = $('#btn-convert');
  const btnHistory = $('#btn-history');
  const btnExport = $('#btn-export');
  const btnReset = $('#btn-reset');
  const btnClosePanel = $('#btn-close-panel');

  const btnInstall = $('#btn-install');

  const expCSV  = $('#exp-csv');
  const expJSON = $('#exp-json');
  const expXLSX = $('#exp-xlsx');
  const expShare= $('#exp-share');

  // State
  const state = {
    expr: '0',
    result: 0,
    sci: false,
    deg: true,
    lastWasEval: false,
  };

  // helpers
  const setStatus = (t)=>{ elStatus.textContent = t; };
  const setHint = (t)=>{ elHint.textContent = t; };
  const setExpr = (t)=>{ state.expr = t; elExpr.textContent = t; };
  const setResult = (v)=>{ state.result = v; elRes.textContent = formatNumber(v); };

  async function copyText(text){
    try{
      await navigator.clipboard.writeText(text);
      setHint('Tersalin ke clipboard');
    }catch(e){
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setHint('Tersalin (fallback)');
    }
  }

  function applyModeUI(){
    if (state.sci){
      sciPad.classList.remove('hidden');
      btnMode.textContent = 'Standard';
    } else {
      sciPad.classList.add('hidden');
      btnMode.textContent = 'Scientific';
    }
    const degBtn = sciPad.querySelector('[data-fn="degRad"]');
    if (degBtn) degBtn.textContent = state.deg ? 'DEG' : 'RAD';
  }

  // Load preferences
  const pref = loadPref();
  if (typeof pref.sci === 'boolean') state.sci = pref.sci;
  if (typeof pref.deg === 'boolean') state.deg = pref.deg;
  applyModeUI();

  // Math engine (reads state.deg)
  const engine = createMathEngine(()=>state.deg);

  function tryEvalToResult(expr){
    try{
      const v = engine.evaluate(expr);
      setResult(v);
      setHint('Diambil dari history');
      return true;
    }catch(e){
      return false;
    }
  }

  // Panel UI
  const panelUI = createPanelUI({
    panel, panelTitle, historyList,
    setHint, setExpr,
    tryEvalToResult,
    copyText,
  });

  // Modules
  const calc = createCalcModule({
    state, setExpr, setResult, setHint,
    evaluate: engine.evaluate,
    addHistory,
    savePref: (p)=>savePref(p),
    applyModeUI,
    copyText
  });

  const agro = createAgroModule({
    root: agroBox,
    setHint,
    renderHistory: panelUI.renderHistory
  });

   // Convert module
  const convert = createConvertModule({
    root: convertBox,
    setHint,
    renderHistory: panelUI.renderHistory
  });
  
  // ensure convert.mount once (hindari dobel listener karena mount render ulang)
  convert.mount(convertBox);
  
  // Init base UI
  setExpr('0'); setResult(0); setHint('Siap');
  panelUI.renderHistory();

  // PWA
  setupInstallButton(btnInstall);
  await registerSW(setStatus);

  // Net status
  const updateNet = () => setStatus(navigator.onLine ? 'Online (cache bisa diperbarui)' : 'Offline (jalan dari cache)');
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  updateNet();

  // Buttons: mode
  btnMode.addEventListener('click', () => {
    state.sci = !state.sci;
    applyModeUI();
    savePref({sci: state.sci, deg: state.deg});
  });

  // Panel open/close
  function openPanel(mode){
    panelUI.open();

    // reset state overlay agronomi
    document.body.classList.remove('agro-full');
    document.body.classList.remove('convert-full');

    exportBox.classList.add('hidden');
    agroBox.classList.add('hidden');
    convertBox.classList.add('hidden');

    if (mode==='history'){
      panelUI.setTitle('History');
      panelUI.renderHistory();

    } else if (mode==='export'){
      panelUI.setTitle('Export');
      panelUI.renderHistory();

      agroBox.classList.add('hidden');
      exportBox.classList.remove('hidden');

      // update export state
      const rows = exporter.historyToRows();
      const canShare = !!navigator.share;
      expShare.classList.toggle('hidden', !canShare);

      const hasXlsx = exporter.canUseXLSX();
      exportNote.textContent = hasXlsx ? 'XLSX siap digunakan.' :
        'XLSX belum siap (SheetJS belum termuat). Pastikan pernah membuka aplikasi saat online minimal sekali agar library tercache.';
      expXLSX.disabled = !hasXlsx || rows.length===0;
      expCSV.disabled = rows.length===0;
      expJSON.disabled = rows.length===0;
      expShare.disabled = rows.length===0;

    } else if (mode==='agro'){
      panelUI.setTitle('Agronomi');

      // ✅ FULLSCREEN agronomi: tutup kalkulator utama & bikin panel full screen
      document.body.classList.add('agro-full');

      // ✅ tampilkan hanya agronomi
      exportBox.classList.add('hidden');
      convertBox.classList.add('hidden');
      agroBox.classList.remove('hidden');

      // ✅ init/recalc agronomi
      agro.init();

      // ✅ pastikan mulai dari atas + bisa scroll
      agroBox.scrollTop = 0;
    } else if (mode==='convert'){
      panelUI.setTitle('Konversi');

      document.body.classList.add('convert-full');
      document.body.classList.remove('agro-full');

      exportBox.classList.add('hidden');
      agroBox.classList.add('hidden');
      convertBox.classList.remove('hidden');

      // render UI konversi (sekali saja)
      convert.mount(convertBox);

      // optional: mulai dari atas
      convertBox.scrollTop = 0;
    }
  }

  // ensure agro.init once
  let agroInitDone = false;
  const _agroInit = agro.init;
  agro.init = () => {
    if (agroInitDone) { agro.syncInputsFromPref(); agro.recalc(); return; }
    agroInitDone = true;
    _agroInit();
  };

  btnHistory.addEventListener('click', ()=>openPanel('history'));
  btnExport.addEventListener('click', ()=>openPanel('export'));
  btnAgro.addEventListener('click', ()=>openPanel('agro'));
  btnConvert.addEventListener('click', ()=>openPanel('convert'));
  btnClosePanel.addEventListener('click', () => { panelUI.close();
    document.body.classList.remove('agro-full');
    document.body.classList.remove('convert-full');
  });

  // Reset all
  btnReset.addEventListener('click', () => {
    resetAll();
    try{ convert.reset(); }catch(e){}
    setExpr('0'); setResult(0); setHint('Reset selesai: history + semua default dikembalikan.');
    panelUI.renderHistory();
    if (agroInitDone){
      agro.syncInputsFromPref();
      agro.recalc();
    }
  });

  // Export actions
  expCSV.addEventListener('click', ()=>exporter.exportCSV() || setHint('History kosong'));
  expJSON.addEventListener('click', ()=>exporter.exportJSON() || setHint('History kosong'));
  expXLSX.addEventListener('click', ()=>{
    const ok = exporter.exportXLSX();
    if (!ok){
      if (!exporter.canUseXLSX()) setHint('SheetJS belum termuat. Buka sekali saat online agar tercache.');
      else setHint('History kosong');
    }
  });
  expShare.addEventListener('click', async ()=>{
    const ok = await exporter.shareJSON();
    if (!ok) setHint('Share tidak tersedia / dibatalkan / history kosong');
  });

  // Global click for calc keys
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    // Only handle buttons that belong to calculator keypads (have data-*)
    if (btn.dataset.insert != null || btn.dataset.fn != null){
      // avoid catching agri tabs/buttons etc that also are buttons but no data-*
      calc.handleKeyButton(btn);
    }
  });

  window.addEventListener('keydown', calc.handleKeyboard);
});
