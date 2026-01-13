// ui/panel.js
import { escapeHtml } from '../core/utils.js';
import { loadHistory, saveHistory } from '../core/storage.js';

export function createPanelUI({panel, panelTitle, historyList, setHint, setExpr, tryEvalToResult, copyText}){
  function renderHistory(){
    const arr = loadHistory();
    if (!arr.length){
      historyList.innerHTML = `<div class="h-item"><div class="h-expr">Belum ada history.</div><div class="h-top">Coba hitung sesuatu 🙂</div></div>`;
      return;
    }

    historyList.innerHTML = arr.map((it, idx) => {
      const dt = new Date(it.ts);
      const ts = dt.toLocaleString('id-ID');
      const safeExpr = escapeHtml(it.expr);
      const safeRes  = escapeHtml(it.result);
      const safeMod  = escapeHtml(it.module || 'Calc');
      return `
        <div class="h-item" data-idx="${idx}">
          <div class="h-top">
            <div>${ts}</div>
            <div>${safeMod}</div>
          </div>
          <div class="h-expr">${safeExpr}</div>
          <div class="h-res">${safeRes}</div>
          <div class="h-actions">
            <button class="h-btn" data-act="use">Pakai</button>
            <button class="h-btn" data-act="copy">Copy</button>
            <button class="h-btn" data-act="del">Hapus</button>
          </div>
        </div>
      `;
    }).join('');

    historyList.querySelectorAll('.h-item').forEach(card => {
      card.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const idx = Number(card.dataset.idx);
        const act = btn.dataset.act;
        const arr2 = loadHistory();
        const item = arr2[idx];
        if (!item) return;

        if (act === 'use'){
          setExpr(item.expr);
          const ok = tryEvalToResult(item.expr);
          if (!ok) setHint('History agronomi/teks (tidak dievaluasi)');
        } else if (act === 'copy'){
          copyText(`[${item.module}] ${item.expr} = ${item.result}`);
        } else if (act === 'del'){
          arr2.splice(idx, 1);
          saveHistory(arr2);
          renderHistory();
        }
      });
    });
  }

  function open(){
    panel.classList.remove('hidden');
  }
  function close(){
    panel.classList.add('hidden');
  }
  function setTitle(t){ panelTitle.textContent = t; }

  return { renderHistory, open, close, setTitle };
}
