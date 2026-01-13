// core/dom.js
export const $ = (sel, root=document) => root.querySelector(sel);
export const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

export function on(el, event, handler, opts){
  el?.addEventListener(event, handler, opts);
}

export function closest(el, sel){
  return el?.closest?.(sel) || null;
}
