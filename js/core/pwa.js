// core/pwa.js
export async function registerSW(setStatus){
  if (!('serviceWorker' in navigator)) return;
  try{
    await navigator.serviceWorker.register('./sw.js');
    setStatus?.('Service Worker aktif. Offline-ready setelah cache lengkap.');
  }catch(e){
    setStatus?.('Gagal register SW: ' + (e?.message || e));
  }
}

export function setupInstallButton(btnInstall){
  const state = { defer: null };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.defer = e;
    btnInstall?.classList?.remove('hidden');
  });

  btnInstall?.addEventListener('click', async () => {
    try{
      if (!state.defer) return;
      state.defer.prompt();
      await state.defer.userChoice;
      state.defer = null;
      btnInstall.classList.add('hidden');
    }catch(e){}
  });
}
