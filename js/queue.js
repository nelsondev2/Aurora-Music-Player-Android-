/* =====================================================================
 *  js/queue.js — Aurora Music Player
 *  File picker · cola inteligente (#4)
 *
 *  Parte del refactor (C) de app.js: mismo código, módulos por funcionalidad.
 *  Este archivo se carga tras js/state.js y completa el objeto App con
 *  Object.assign (los scripts son clásicos por compatibilidad webxdc).
 * ===================================================================== */

'use strict';

Object.assign(App, {
    /* ============================================================
     *  File picker (input file oculto)
     *  - Se crea UNA sola vez y se reutiliza
     *  - multiple=true para permitir varios archivos
     *  - Soporta selección de carpeta (webkitdirectory)
     *  - Se resetea el value ANTES de click() para que el mismo
     *    archivo pueda seleccionarse otra vez, y DESPUÉS de procesar
     *    para que la próxima apertura empiece limpia.
     * ============================================================ */
    /* Abre el selector de archivos del sistema.
     *   useDirectory    — true para activar el modo "carpeta completa"
     *   targetPlaylistId — ID de playlist a la que añadir las pistas subidas.
     *                      Si es null/undefined, las pistas van solo a la
     *                      biblioteca (no hay lista predefinida).
     * Creamos un input NUEVO cada vez para evitar problemas de reutilización
     * y asegurar que el click() se ejecute dentro del gesto de usuario. */
    /* ¿Soporta este entorno la selección de carpetas (webkitdirectory)?
     * En Android (WebView/Chrome) y en el webxdc nativo de Delta Chat el
     * selector de carpetas no funciona: se oculta la opción y se usa
     * multiselección de archivos. */
    supportsFolderPicker() {
      try {
        const probe = document.createElement('input');
        if (!('webkitdirectory' in probe)) return false;
        const ua = navigator.userAgent || '';
        if (/Android/i.test(ua)) return false;
        if (window.webxdc && !window.webxdc._isStub) return false;
        return true;
      } catch (e) {
        return false;
      }
    },

    async openFilePicker(useDirectory, targetPlaylistId) {
      if (useDirectory && !this.supportsFolderPicker()) useDirectory = false;

      // En Delta Chat nativo manda su selector integrado
      // (webxdc.importFiles,). El modo carpeta no existe allí y ya
      // viene degradado a archivos por supportsFolderPicker(). Si el
      // usuario cancela, devuelve []: no se reintenta con el <input>.
      if (!useDirectory) {
        const U0 = window.AuroraUploader;
        const exts = ((U0 && typeof U0.ACCEPTED === 'string')
          ? U0.ACCEPTED : '.mp3,.m4a,.flac,.wav,.ogg,.webm,.opus')
          .split(',').map(x => x.trim()).filter(x => x.charAt(0) === '.');
        exts.push('.lrc', '.txt');
        const nativeFiles = await this.pickFilesWebxdc({ extensions: exts, multiple: true });
        if (nativeFiles) {
          if (nativeFiles.length > 0) {
            await this.handleFileInput(nativeFiles, false, targetPlaylistId || null);
          }
          return;
        }
      }
      const UPLOADER = window.AuroraUploader;
      const acceptedTypes = (UPLOADER && typeof UPLOADER.ACCEPTED === 'string')
        ? UPLOADER.ACCEPTED
        : '.mp3,.m4a,.flac,.wav,.ogg,.webm,.opus,audio/*';

      // Crear input SIEMPRE nuevo para evitar problemas de reutilización
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.style.display = 'none';

      if (useDirectory) {
        // Modo carpeta: NO usar accept (interfiere en algunos navegadores)
        // y añadir todos los atributos de directorio conocidos.
        input.setAttribute('webkitdirectory', '');
        input.setAttribute('directory', '');
        input.setAttribute('mozdirectory', '');
        input.setAttribute('nwdirectory', '');
      } else {
        // Audio y letras sueltas (.lrc se enlaza con su canción).
        input.accept = acceptedTypes + ',.lrc,.txt';
      }

      document.body.appendChild(input);

      // Cancelar el diálogo no dispara `change` en la mayoría de navegadores:
      // el input quedaba en el DOM para siempre. Se retira al recuperar el
      // foco, con el evento `cancel` (navegadores nuevos) y con un timeout
      // de seguridad.
      let settled = false;
      let safetyTimer = null;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        // Sin esto, cada apertura dejaba un timer de 5 minutos vivo
        // (batería en móvil y procesos colgados en pruebas).
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
        try { input.remove(); } catch (er) {}
      };
      input.addEventListener('cancel', cleanup);
      window.addEventListener('focus', () => {
        setTimeout(() => { if (!settled && (!input.files || input.files.length === 0)) cleanup(); }, 400);
      }, { once: true });
      safetyTimer = setTimeout(cleanup, 5 * 60 * 1000);

      input.addEventListener('change', async (e) => {
        settled = true;
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
        const files = e.target.files;
        if (files && files.length > 0) {
          const arr = Array.from(files);
          const destId = targetPlaylistId || null;
          // Filtrar solo archivos de audio + .lrc/.txt si venimos de carpeta
          // (webkitdirectory devuelve TODOS los archivos de la carpeta)
          const filtered = useDirectory
            ? arr.filter(f => {
                const name = f.name.toLowerCase();
                return f.type.startsWith('audio/') ||
                       /\.(mp3|m4a|flac|wav|ogg|webm|opus|lrc|txt)$/i.test(name);
              })
            : arr;
          if (filtered.length > 0) {
            await this.handleFileInput(filtered, useDirectory, destId);
          } else if (useDirectory) {
            this.toast(this.t('toast_load_failed'));
          }
        }
        // Limpiar el input del DOM tras usarlo (ya no hace falta retenerlo)
        try { input.remove(); } catch (er) {}
      });

      // click() dentro del gesto de usuario
      input.click();
    },

    /* ============================================================
     *  Cola inteligente (#4)
     * ============================================================ */

    /* Añadir pista al final de la cola */
    addToQueue(trackId) {
      this.queue.push(trackId);
      if (this.shuffle && this._originalQueue) this._originalQueue.push(trackId);
      this.renderQueue();
      this.preloadNextTrack();
      this.toast(this.t('toast_added_to_queue'));
    },

    /* «Reproducir después de la canción actual» (antes «Reproducir
 * siguiente»): la pista suena justo al terminar la actual.
 *antes insertaba sin más, y si la canción YA estaba en la
 * cola (el caso típico: la eliges desde la misma lista que está
 * sonando) quedaba DUPLICADA y sonaba dos veces — el «no
 * funciona» que reportó el usuario. Ahora se MUEVE: se quitan
 * sus demás apariciones (salvo la que está sonando, si es ella)
 * y entra tras la actual. Con aleatorio, el mismo movimiento se
 * refleja en la cola original. */
    playNext(trackId) {
      if (!this.queue.length && this.currentTrack) this.queue = [this.currentTrack.id];
      if (!this.queue.length) return;
      const curId = this.currentTrack && this.currentTrack.id;
      // Posición REAL de la actual (queueIdx puede apuntar a otra
      // copia si hay duplicados heredados de «Añadir a la cola»).
      let curPos = (curId && this.queue[this.queueIdx] === curId)
        ? this.queueIdx
        : (curId ? this.queue.indexOf(curId) : this.queueIdx);
      if (curPos < 0 || curPos == null) curPos = Math.min(this.queueIdx || 0, this.queue.length - 1);
      //  y techo también — un queueIdx heredado mayor que la
      // cola dejaba «la actual» fuera de rango al insertar.
      if (curPos > this.queue.length - 1) curPos = this.queue.length - 1;
      for (let i = this.queue.length - 1; i >= 0; i--) {
        if (i !== curPos && this.queue[i] === trackId) {
          this.queue.splice(i, 1);
          if (i < curPos) curPos--;
        }
      }
      this.queueIdx = curPos;
      const insertAt = Math.min(this.queue.length, curPos + 1);
      this.queue.splice(insertAt, 0, trackId);
      if (this.shuffle && this._originalQueue && curId) {
        const oq = this._originalQueue;
        for (let i = oq.length - 1; i >= 0; i--) {
          if (oq[i] === trackId && i !== oq.indexOf(curId)) oq.splice(i, 1);
        }
        const oCur = oq.indexOf(curId);
        oq.splice(Math.min(oq.length, (oCur >= 0 ? oCur : oq.length - 1) + 1), 0, trackId);
      }
      if (typeof this.saveSession === 'function') this.saveSession();
      this.renderQueue();
      this.preloadNextTrack();
      this.toast(this.t('toast_play_next'));
    },

    /*  startRadio retirado (solapaba con aleatorio y
 * listas inteligentes; vivía escondido en el menú de pista). */

    /*  «Guardar cola como lista». Reutiliza la hoja de crear
 * lista (nombre + descripción) con la bandera _queueSaveMode: al
 * guardar, la lista nace con las pistas de la cola en su orden
 * exacto (pl.sort='added' para que el orden por estrellas de
 * no lo reescriba). */
    openSaveQueueSheet() {
      if (!this.queue || this.queue.length === 0) {
        this.toast(this.t('queue_empty'));
        return;
      }
      // La bandera va DESPUÉS de abrir la hoja: openCreatePlaylistSheet
      // la resetea al empezar (cada apertura nace en modo normal).
      this.openCreatePlaylistSheet();
      this._queueSaveMode = true;
      const titleEl = document.getElementById('createPlaylistTitle');
      if (titleEl) titleEl.textContent = this.t('save_queue_btn');
      const btn = document.getElementById('btnSavePlaylist');
      if (btn) btn.textContent = this.t('save_queue_btn');
      const nameInput = document.getElementById('playlistName');
      if (nameInput && !nameInput.value) {
        const label = (typeof this.getPlayContextLabel === 'function' && this.getPlayContextLabel()) || '';
        nameInput.value = label || this.t('queue_title');
      }
    },
});
