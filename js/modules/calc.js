// modules/calc.js
import { formatNumber } from '../core/format.js';

export function createCalcModule({state, setExpr, setResult, setHint, evaluate, addHistory, savePref, applyModeUI, copyText}){
  function preview(){
    try{
      const v = evaluate(state.expr);
      setResult(v);
      setHint(state.deg ? 'Preview (DEG)' : 'Preview (RAD)');
      return true;
    }catch(e){
      setHint(e.message);
      return false;
    }
  }

  function insertText(txt){
    if (state.lastWasEval && /^[0-9.(]/.test(txt)){
      setExpr('0');
      state.lastWasEval = false;
    }
    let cur = state.expr;
    if (cur === '0' && /^[0-9.]/.test(txt)) cur = '';
    cur += txt;
    setExpr(cur);
    preview();
  }

  function clearAll(){
    setExpr('0');
    setResult(0);
    setHint('Di-reset');
    state.lastWasEval = false;
  }

  function backspace(){
    let cur = state.expr;
    if (state.lastWasEval) state.lastWasEval = false;
    if (cur.length<=1) setExpr('0');
    else setExpr(cur.slice(0,-1));
    preview();
  }

  function equals(){
    try{
      const v = evaluate(state.expr);
      setResult(v);
      setHint('Hasil disimpan ke history');
      addHistory('Calc', state.expr, formatNumber(v));
      state.lastWasEval = true;
    }catch(e){
      setHint('Error: ' + e.message);
    }
  }

  function negate(){
    if (state.expr === '0') return;
    setExpr(`-(${state.expr})`);
    preview();
  }

  function square(){
    setExpr(`(${state.expr})^2`);
    preview();
  }

  function fact(){
    setExpr(`(${state.expr})!`);
    preview();
  }

  function percent(){
    setExpr(`(${state.expr})/100`);
    preview();
  }

  function degRad(){
    state.deg = !state.deg;
    applyModeUI();
    savePref({sci: state.sci, deg: state.deg});
    preview();
  }

  function handleKeyButton(btn){
    const ins = btn.dataset.insert;
    const fn = btn.dataset.fn;
    if (ins != null){
      const map = { pi: 'pi', e: 'e' };
      insertText(map[ins] ?? ins);
      return;
    }
    if (!fn) return;
    if (fn==='clear') return clearAll();
    if (fn==='back') return backspace();
    if (fn==='equals') return equals();
    if (fn==='negate') return negate();
    if (fn==='square') return square();
    if (fn==='fact') return fact();
    if (fn==='percent') return percent();
    if (fn==='degRad') return degRad();
    if (fn==='copy') return copyText(`${state.expr} = ${formatNumber(state.result)}`);
  }

  function handleKeyboard(e){
    // ✅ Jika user sedang mengetik di input (agro/convert), jangan ganggu.
    const t = e.target;
    const tag = (t?.tagName || '').toLowerCase();
    const isEditable =
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      t?.isContentEditable;
  
    // Biarkan Backspace/Delete/Enter normal di field input
    if (isEditable) return;
  
    // Jangan mengganggu shortcut browser (Ctrl/Cmd + sesuatu)
    if (e.ctrlKey || e.metaKey || e.altKey) return;
  
    const k = e.key;
  
    if (k === 'Enter') { e.preventDefault(); equals(); return; }
    if (k === 'Backspace') { e.preventDefault(); backspace(); return; }
    if (k === 'Escape') { e.preventDefault(); clearAll(); return; }
  
    const allowed = '0123456789.+-*/()^';
    if (allowed.includes(k)) { insertText(k); return; }
    if (k === 'x' || k === 'X') { insertText('*'); return; }
  }  

  return { preview, insertText, clearAll, backspace, equals, handleKeyButton, handleKeyboard };
}
