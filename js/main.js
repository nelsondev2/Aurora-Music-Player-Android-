/* =====================================================================
 *  js/main.js — Aurora Music Player
 *  Bootstrap: arranque de la app
 *
 *  Cargar SIEMPRE el último.
 * ===================================================================== */

'use strict';

function bootAurora() {
  // Si main.js se evalúa dos veces en el mismo contexto (hay clientes
  // WebXDC que reinjectan los scripts), sin esta guarda el arranque se
  // lanzaba dos veces. init() también se autoprotege, por si acaso.
  if (window.__auroraBooted) return;
  window.__auroraBooted = true;
  // Si el script se inyecta cuando el documento ya cargó (tests, snippets,
  // carga diferida), DOMContentLoaded nunca llegaría y la app quedaría en
  // blanco. Se comprueba readyState.
  Promise.resolve(App.init()).catch((err) => {
    console.error('[Aurora] Error de inicialización:', err);
    try { App.toast(App.t('toast_load_error')); } catch (e) {}
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootAurora);
} else {
  bootAurora();
}

// Reanudar audio context al volver a la app (iOS)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && App.audioCtx && App.audioCtx.state === 'suspended' && App.isPlaying) {
    App.audioCtx.resume().catch(() => {});
  }
});
