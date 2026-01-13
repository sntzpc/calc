// core/exporter.js
import { dateStamp, csvEscape } from './utils.js';
import { loadHistory } from './storage.js';

function downloadBlob(filename, blob){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
}

export function historyToRows(){
  const arr = loadHistory();
  return arr.map((it, i) => ({
    No: arr.length - i,
    Timestamp: new Date(it.ts).toISOString(),
    Waktu: new Date(it.ts).toLocaleString('id-ID'),
    Modul: it.module || 'Calc',
    Ekspresi: it.expr,
    Hasil: it.result,
  }));
}

export function canUseXLSX(){
  return typeof window.XLSX !== 'undefined';
}

export function exportCSV(){
  const rows = historyToRows();
  if (!rows.length) return false;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')].concat(
    rows.map(r => headers.map(h => csvEscape(String(r[h] ?? ''))).join(','))
  );
  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8'});
  downloadBlob(`history_kalkulator_${dateStamp()}.csv`, blob);
  return true;
}

export function exportJSON(){
  const rows = historyToRows();
  if (!rows.length) return false;
  const blob = new Blob([JSON.stringify(rows, null, 2)], {type:'application/json;charset=utf-8'});
  downloadBlob(`history_kalkulator_${dateStamp()}.json`, blob);
  return true;
}

export function exportXLSX(){
  const rows = historyToRows();
  if (!rows.length) return false;
  if (!canUseXLSX()) return false;

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'History');
  const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
  const blob = new Blob([wbout], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  downloadBlob(`history_kalkulator_${dateStamp()}.xlsx`, blob);
  return true;
}

export async function shareJSON(){
  const rows = historyToRows();
  if (!rows.length) return false;
  if (!navigator.share) return false;

  const blob = new Blob([JSON.stringify(rows, null, 2)], {type:'application/json'});
  const file = new File([blob], `history_kalkulator_${dateStamp()}.json`, {type:'application/json'});
  try{
    await navigator.share({ title:'History Kalkulator', text:'Export history kalkulator', files:[file] });
    return true;
  }catch(e){
    return false;
  }
}
