# Informe de pulido de interfaz — Aurora Music Player

**Fecha:** 19 de octubre de 2026
**Base:** `ff73b21` (merge del PR #6, biblioteca simplificada)
**Rama:** `arena/4c26cbd7-aurora-music-player`
**Alcance elegido:** los 12 puntos de la auditoría de diseño (6 fallos + 6 de pulido), no solo los críticos.
**Resultado:** 12/12 implementados + rediseño de botones de listas + corrección de los solapes de las capturas + filas de canciones v2 + Letras v2 + Reproductor v2 · **143/143 pruebas automatizadas en verde** · `.xdc` válido para Delta Chat.

---

## 1. Resumen

| Métrica | Antes (ff73b21) | Ahora |
|---|---|---|
| Puntos de diseño corregidos | 0/12 | **12/12** |
| Pruebas de esta ronda | — | **143** (102 pulido + 27 smoke + 14 axe) |
| Violaciones axe (10 pantallas) | — | **0** |
| Contraste de acentos (peor extremo del degradado) | **1.64:1** | **4.75:1** |
| Objetivo táctil mínimo en controles citados | 28 px | **40 px** (fab 36 px) |
| `font-size` en px | 22 declaraciones + tokens | **0** |
| Paquete `.xdc` | 28 archivos · 302.1 KB | **28 archivos · 325.5 KB** |

**Paquete final:** `aurora-music-player.xdc`
**SHA-256:** `1607f88fe7b42871f94a6caba7c6c63491e1de1a376203891e3ceff1c156eba0`
**Validación:** `python3 build-xdc.py --check` → «OK el .xdc es válido para Delta Chat / webxdc».

---

## 2. Las 12 correcciones

### Fallos (1–6)

| # | Hallazgo | Solución aplicada | Dónde | Evidencia |
|---|---|---|---|---|
| 1 | Ajustes inalcanzable sin pista cargada: solo se llegaba por «Más opciones» del reproductor, y sin pista no se abre esa vista. | Engranaje visible en la cabecera de Inicio (`#btnHomeSettings`). Se conserva el acceso existente por «Más opciones». | `index.html`, `js/events.js` | Bloque A de `ui-polish.js`: clic real sobre el engranaje abre `#sheetSettings` con 0 pistas. |
| 2 | Las vistas ocultas seguían en el orden de tabulación y en el árbol de accesibilidad (solo `opacity:0` + `pointer-events:none`). | `showView()` pone `inert` y `aria-hidden="true"` a las vistas inactivas; el CSS añade `visibility:hidden` (con retardo para no cortar el fundido). Si el foco estaba dentro de la vista que se oculta, se mueve a la navegación. | `js/ui.js`, `styles.css` | Bloque B: estados en Inicio/Reproductor/Letras y modo ancho; axe sin `aria-hidden-focus`. |
| 3 | Texto e iconos blancos sobre degradados de acento con 1.64–3.56:1. | Nuevos pares `fill`/`fill2` (y `fillLight`/`fillLight2`) que cumplen AA en los 5 acentos. Los degradados con texto blanco usan `--accent-fill-2` en vez del tono brillante `--accent-2`. Corazón «me gusta» pasa a `--accent` en tema claro. `--text-4` sube a 3:1 para iconos/bordes. | `js/settings.js`, `styles.css` | Bloque C: cálculo WCAG de los 5 acentos × 3 temas; tabla en §3. |
| 4 | Biblioteca vacía sin acción para importar: solo había un texto y «Borrar todo». | Estado vacío con icono, titular, explicación y CTA «Cargar música» que abre el selector. Se ocultan contador/acciones/orden/«Borrar todo» cuando no hay pistas. | `js/playlist-ui.js` | Bloque D: existencia del CTA, apertura real del selector y ocultado del resto. |
| 5 | El icono de la pestaña Biblioteca era `#i-grip` (asa de arrastre). | Nuevo símbolo `#i-library` (libros en estante) usado por la nav. | `index.html` | Bloque A: `use[href="#i-library"]`. |
| 6 | Cinco `aria-label` fijos en español sin `data-i18n-aria`. | Claves nuevas × 8 idiomas: `back_btn`, `exit_fs`, `move`, `remove` (además de `view_player` y las etiquetas regionales). Los textos dinámicos de listas/cola usan `t()`. | `index.html`, `data.js`, `js/playlist-ui.js`, `js/playlist-edit.js` | Bloque A: claves completas en 8 idiomas y cambio real a inglés. |

### Pulido (7–12)

| # | Hallazgo | Solución aplicada | Dónde | Evidencia |
|---|---|---|---|---|
| 7 | Faltaban «Reproducir todo» y «Aleatorio» en la sección de canciones. | Fila propia bajo la cabecera con dos acciones. «Reproducir todo» usa el orden visible (`sortedTracks()`); «Aleatorio» activa el shuffle real de la cola (`_applyShuffle`), no solo el icono. | `index.html`, `js/playlist-ui.js`, `js/events.js` | Bloque F: cola esperada, `shuffle=true`, `aria-pressed`, y reordenación efectiva. |
| 8 | El menú de pista no permitía marcar favorito sin abrir el reproductor. | Fila `#ctxToggleFavorite` con estado `aria-pressed`, icono corazón sólido/vacío y sincronización al abrir el menú. `toggleFavoriteFor(trackId)` funciona con cualquier pista. | `index.html`, `js/nav.js`, `js/audio.js`, `js/events.js` | Bloque E: marcar, reabrir, desmarcar. |
| 9 | Estados vacíos incoherentes (texto plano en Favoritos/cola/búsqueda). | Componente único `emptyStateHtml()` (icono, titular, explicación y CTA opcional), usado en Biblioteca, Favoritos, listas, cola, historial y editor de listas. Variante `compact` para listas dentro de sheets. | `js/ui.js`, `js/stats-ui.js`, `js/playlist-ui.js`, `js/playlist-edit.js`, `styles.css` | Bloque G: misma estructura en Biblioteca/Favoritos y variante compacta en cola/historial. |
| 10 | No existía el tema «Sistema». | Cuarta opción en la rejilla. Se guarda la preferencia `system`; `applyTheme()` resuelve claro/oscuro con `prefers-color-scheme` y escucha cambios en vivo. `data-theme` refleja la paleta aplicada y `data-theme-pref` la preferencia. | `js/settings.js`, `index.html`, `styles.css` | Bloque H: cambio de esquema del sistema repinta sin recargar; un tema fijo deja de seguir al sistema. |
| 11 | `aurora-wide` no adaptaba el carril de listas ni las filas de canciones. | En escritorio el carril pasa a rejilla (`auto-fill`), el cuerpo de la Biblioteca se limita a 1040 px centrados, los filtros hacen wrap y las filas no se estiran. | `styles.css` | Bloque I: reglas y navegación real con `aurora-wide`. |
| 12 | Objetivos táctiles de 28–36 px, tipografía en px, contadores «0» redundantes y acciones destructivas sin deshacer. | `.lt-btn` 40, `.icon-btn-sm` 40, `.row-action` 40, `.pl-play-fab` 36, `.text-btn` y `.drag-handle` 40. Tokens y tamaños en `rem` (incluido el tamaño LRC, guardado en px equivalentes y aplicado en rem). Contadores ocultos a 0. Borrado de pista, de lista y «vaciar lista» con toast «Deshacer» (8 s). | `styles.css`, `js/lyrics.js`, `js/library.js`, `js/playlist-ui.js`, `js/playlist-edit.js`, `js/ui.js` | Bloque J: tamaños, ausencia de px, contadores y los tres flujos de deshacer (incluido el vencimiento del plazo). |

---

## 3. Contraste medido (WCAG 2.x)

### 3.1 Texto/icono blanco sobre el degradado de acento

Se comprueba **cada extremo** del degradado, no solo el color base. AA exige 4.5:1 para texto normal y 3:1 para iconos.

| Acento | `fill` / blanco | `fill2` / blanco |
|---|---:|---:|
| Aurora | 6.23 | 7.87 |
| Océano | 6.07 | 7.03 |
| Musgo | 6.59 | 7.80 |
| Ámbar | **4.75** | 6.61 |
| Cereza | 5.64 | 7.85 |

### 3.2 Tema claro (texto oscuro sobre `#F4F1EA`)

| Acento | `fillLight` / fondo | `fillLight2` / fondo |
|---|---:|---:|
| Aurora | 6.49 | 8.36 |
| Océano | 6.23 | 7.13 |
| Musgo | 6.91 | 8.22 |
| Ámbar | **5.45** | 7.00 |
| Cereza | 6.54 | 7.72 |

### 3.3 Acento como texto sobre fondo oscuro `#050509`

Aurora 6.22 · Océano 7.31 · Musgo 6.06 · Ámbar 8.20 · Cereza 4.82 (todos ≥ 4.5).

### 3.4 `--text-4`

Se usa para iconos, bordes de casillas y chevrons (no para texto principal). Se elevó de 2.53/2.45/3.06 a **3.1+** en oscuro/AMOLED y se mantiene por encima de 3 en claro. Los placeholders de texto usan `--text-3`.

---

## 4. Decisiones ante ambigüedad

1. **«Deshacer» con borrado diferido (8 s).** Para que el audio siga disponible, el borrado de una pista no revoca su `objectURL` ni toca IndexedDB hasta que vence el plazo (o se borra otra pista). Si se cierra la app, `pagehide` confirma los borrados pendientes para que no reaparezcan al reabrir. El borrado por lote y «borrar todo» son definitivos y mantienen su confirmación: mezclar N deshaceres parciales sería más peligroso que útil.
2. **Nuevo par de variables `--accent-fill` / `--accent-fill-2`.** No se oscureció `--accent-2` porque ese tono se usa como color de texto decorativo y en portadas; cambiarlo habría roto la identidad visual. Los degradados con texto blanco apuntan ahora al par seguro.
3. **«Aleatorio» de la sección de canciones** activa el modo aleatorio global de la cola (igual que el botón del reproductor), en lugar de reproducir una sola vez en orden aleatorio. Así el icono de shuffle y el comportamiento coinciden.
4. **Tema «Sistema»** guarda la preferencia, no la paleta resuelta: si el usuario cambia el tema del teléfono, la app se adapta sin recargar. `data-theme` sigue siendo `dark`/`light`/`amoled` para que el CSS existente funcione.
5. **Estados vacíos**: se reutiliza el lenguaje visual de la bienvenida de Inicio, pero en variante compacta dentro de listas para no empujar el contenido fuera de la pantalla.
6. **Tamaño de letra LRC**: el ajuste guardado se conserva en «px equivalentes» (12–32) por compatibilidad, pero se aplica en `rem`; con el tamaño de fuente por defecto el resultado es idéntico y ahora escala con la preferencia del sistema.
7. **Escritorio ancho**: en lugar de reconstruir la Biblioteca en dos columnas, se convierte el carril en rejilla y se acota el ancho de lectura. Mantiene una sola jerarquía y evita duplicar lógica de scroll.

---

## 5. Pruebas

### 5.1 Composición (93)

| Suite | Pruebas | Qué demuestra |
|---|---:|---|
| `verificacion/ui-polish.js` | **65** | Los 12 hallazgos y el rediseño de botones de listas: comportamiento real en jsdom + comprobaciones del CSS y contraste calculado. |
| `verificacion/smoke.js` | **27** | Arranque, biblioteca, reproducción, cola, búsqueda, favoritos, listas, letras, estadísticas, idioma y temas. |
| `verificacion/a11y.js` | **14** | axe-core en 10 pantallas (Inicio, Reproductor, Biblioteca, Ajustes, Temas, Favoritos, Buscar, menú de pista, Letras, editor de lista) + diálogos y nav. **0 violaciones**. |

### 5.2 Ejecución

```bash
cd verificacion
npm install          # jsdom, fake-indexeddb, axe-core
npm test             # las tres suites
# o por separado:
npm run polish
npm run smoke
npm run a11y
```

El arnés arranca el `index.html` real y evalúa los mismos scripts que la app (sin bundler), con IndexedDB falso, canvas y audio simulados. `AURORA_ROOT` permite apuntar a otro checkout.

### 5.3 Limitación conocida del entorno

jsdom **no aplica `styles.css`**; por eso `color-contrast` de axe se desactiva y el contraste se verifica matemáticamente en el bloque C de `ui-polish.js` (fórmula WCAG con luminancia relativa). La estructura, el foco, los `aria-*` y el comportamiento sí se prueban en el DOM real. No hay Chromium en el sandbox, así que no se hicieron capturas visuales; se recomienda una pasada manual en un dispositivo antes de publicar.

---

## 6. Archivos modificados

```
data.js              13 +   (claves i18n × 8 idiomas)
index.html           90 +/− (engranaje, icono, acciones, tema, favorito, botones de lista)
styles.css          546 +/− (contraste, rem, táctil, wide, estados vacíos, toast, botones de lista)
js/audio.js          18 +/− (favorito por pista)
js/events.js         18 +   (cableado nuevo)
js/init.js            5 +   (confirmar borrados al cerrar)
js/library.js       109 +/− (deshacer borrado de pista)
js/lyrics.js         11 +/− (tamaño LRC en rem)
js/nav.js            14 +/− (favorito en el menú)
js/playlist-edit.js  36 +/− (deshacer vaciado + i18n + estado del hero)
js/playlist-ui.js   152 +/− (acciones, estados vacíos, deshacer, i18n, acciones de fila)
js/settings.js       85 +/− (tema Sistema, paletas AA y --accent-text-2)
js/stats-ui.js       29 +/− (favoritos vacío)
js/ui.js             76 +/− (inert, emptyStateHtml, toast con acción)
verificacion/        nuevas suites (no entran en el .xdc)
docs/INFORME-PULIDO-UI.md  este informe
```

`build-xdc.py` solo empaqueta `APP_ENTRIES`; `verificacion/` y `docs/` quedan fuera del paquete.

---

## 7. Empaquetado y validación

```bash
python3 build-xdc.py
python3 build-xdc.py --check
```

Salida final:

```
OK  aurora-music-player.xdc · 28 archivos · 325.5 KB
    sha256: 1607f88fe7b42871f94a6caba7c6c63491e1de1a376203891e3ceff1c156eba0
    nombre: Aurora Music Player
    código: https://github.com/nelsondev2/Aurora-Music-Player
    icono: icon.png (90.5 KB)
    archivos: 28 · comprimido: 325.5 KB · sin comprimir: 942.0 KB
OK  el .xdc es válido para Delta Chat / webxdc
```


---

## 8. Revisión posterior: botones de las listas de reproducción

**Petición:** «los botones dentro de las listas de reproducción son toscos y horribles».

### 8.1 Qué había

- **Editor de lista:** seis tarjetas del mismo tamaño (2×3), cada una con una ficha de icono de 34 px y texto de 12 px. Dos eran rojas permanentes y la de «Reproducir» usaba el degradado brillante `--accent → --accent-2` con texto blanco: **1.64–2.41:1 en el extremo claro**, el mismo fallo de contraste corregido antes en otros botones.
- **«Tus listas»:** cada fila llevaba un disco blanco de 36 px sobre una miniatura de 58 px (tapaba la portada) más un botón de borrado siempre visible.
- **Filas de pistas dentro de una lista:** asa de arrastre + menú + quitar, los tres con el mismo peso visual, sin jerarquía.

### 8.2 Qué se hizo

| Zona | Antes | Ahora |
|---|---|---|
| Editor · acción principal | Tarjeta con degradado brillante y texto | **Círculo de 52 px** junto a la portada, con `--accent-fill` (blanco ≥ 4.5:1) y anillo fino cuando esa lista está sonando. |
| Editor · acciones secundarias | 6 tarjetas 2×3 con fichas de icono | **Pastillas ligeras** de 40 px (icono 16 px + etiqueta 13 px), fondo `surface`, borde sutil; hover/foco con realce. |
| Editor · destructivas | Dos bloques rojos permanentes | Texto y icono en `--danger`; solo se tiñen al pulsar/pasar. «Borrar todo» pasa a **«Vaciar»** para no confundirse con «Eliminar lista». |
| «Tus listas» · play | Disco blanco sobre la miniatura | **Botón circular en columna propia** (40 px), tinte de acento; la portada queda limpia. |
| «Tus listas» · borrado | Siempre visible | En ratón aparece al pasar por la fila o al enfocar (`focus-within`); en táctil sigue visible. |
| Tarjetas de la biblioteca | Disco blanco de 36 px | Disco de acento de 40 px con icono blanco, sombra suave y realce al pasar. |
| Filas del editor | Tres controles con el mismo peso | Iconos de 16 px en `--text-3`, visibles al pasar/enfocar con ratón; 40 px de área táctil. |
| Escritorio ancho | Editor pegado al borde | Cuerpo limitado a 760 px centrados. |

### 8.3 Fallos de contraste residuales corregidos de paso

Al revisar los botones aparecieron cuatro usos del degradado brillante con contenido blanco que seguían por debajo de AA:

| Selector | Problema | Corrección |
|---|---|---|
| `.icon-add` («+» de la barra) | Icono blanco hasta 2.41:1 | `--accent-fill` → `--accent-fill-2` |
| `.sleep-opt.active` | Texto blanco hasta 2.41:1 | Relleno seguro + `--accent-on-fill` |
| `.home-welcome-perks .ico` | Icono blanco hasta 2.41:1 | Relleno seguro |
| `.stat-value` / `.home-welcome-brand` | Degradado de texto que en tema claro caía a 2.14:1 | Nueva variable **`--accent-text-2`**, resuelta por tema (brillante en oscuro, oscura en claro) |

`--accent-text-2` se calcula en `applyTheme()`: `accent2` en oscuro/AMOLED y `fillLight2` en claro. Las pruebas verifican ambos extremos con la fórmula WCAG en los 5 acentos y los 2 temas.

### 8.4 Pruebas añadidas (13)

- Estructura: tarjetas con fab, filas sin fab y con columna de acciones.
- Comportamiento: el play de fila reproduce sin abrir el editor; el hero reproduce y marca el anillo; «Subir canciones» sigue abriendo el selector.
- CSS: relleno AA del hero, pastillas de 40 px, ausencia de `.pl-action-ico`/`.pl-action-play`, disco de acento, revelado por hover/foco.
- Contraste: `--accent-text-2` y los cuatro selectores residuales.
- axe: el **editor de lista** entra como décima pantalla auditada (0 violaciones).

**Total tras esta sección: 106/106** (65 pulido + 27 smoke + 14 axe).

---

## 9. Corrección de las capturas (2026-10-19): vacíos solapados y «Nueva» sin funcionar

**Reporte:** tres capturas en ArcaneChat (Biblioteca con 1 canción, Buscar y Biblioteca vacía) con iconos/títulos flotando sobre el contenido, y el botón de crear listas sin responder.

### 9.1 Causa raíz (única para casi todo)

En `styles.css` existían **dos** reglas para el mismo selector `.empty-state`:

1. ~línea 1236: en flujo (`position: relative`, pensada para estados vacíos dentro de listas).
2. ~línea 2004: `position: absolute; inset: 0; z-index: 10` (pensada **solo** para `#emptyState`, la pantalla vacía del reproductor).

La segunda ganaba en la cascada para **todos** los `.empty-state`. Así, cada estado vacío dentro de un `<li>` (listas de Biblioteca, canciones, historial de Buscar, Favoritos, cola) se convertía en una capa a pantalla completa anclada al `.sheet-panel`:

- **Captura 1 (Biblioteca, 1 canción):** el vacío «Sin listas todavía» del carril tapaba la fila MONOLOG, los chips de orden y parte de «Aleatorio».
- **Captura 2 (Buscar):** el vacío del historial flotaba sobre los filtros, con el placeholder del input como titular gigante.
- **Captura 3 (Biblioteca vacía):** los vacíos de listas y de canciones, ambos absolutos, se imprimían uno sobre otro («Tu biblioteca está vacía» + «Sin listas todavía» + botón entre medias).
- **«Nueva» no funcionaba:** la lógica siempre fue correcta (verificado por DOM: abre, guarda y pinta la lista), pero la capa invisible del estado vacío cubría todo el panel e interceptaba los toques antes de que llegaran al botón.

### 9.2 Corrección

| Archivo | Cambio |
|---|---|
| `styles.css` | La regla absoluta pasa a `#emptyState` (solo el reproductor). Refuerzo en el bloque de pulido: los `.empty-state` hijos de `.track-list`, `.queue-list`, `.playlist-list` y `.playlist-rail` quedan `position: relative; inset: auto; z-index: auto; width: 100%`. El vacío del carril se hace breve (icono 44 px, `padding: 20px 16px`, `flex: 1 0 100%`) para no empujar las canciones fuera de vista. |
| `js/stats-ui.js` + `data.js` | El vacío de Buscar ya no reutiliza `search_placeholder` como titular: nuevas claves `search_empty_title` / `search_empty_hint` en los 8 idiomas («Sin búsquedas recientes» + explicación). |

No se tocó la lógica de crear listas: no tenía ningún fallo. Al retirar la capa que bloqueaba los toques, tanto «+ Nueva» de Biblioteca como «Nueva» de «Tus listas» (y el CTA del propio vacío) vuelven a funcionar.

### 9.3 Pruebas añadidas (9, bloque M de `verificacion/ui-polish.js`)

- CSS: ningún `.empty-state` sin acotar es absoluto; solo `#emptyState` lo es; los vacíos de listas van en flujo y el del carril es breve.
- DOM: Biblioteca vacía muestra cada vacío en su sección; Buscar no duplica el placeholder; con 1 canción y 0 listas la fila se ve y el vacío queda en su carril.
- Comportamiento: «+ Nueva» abre el creador, guardar crea la lista (aparece en el carril y en «Tus listas») y el vacío desaparece; «Nueva» de «Tus listas» también abre.

**Total tras esta sección: 115/115** (74 pulido + 27 smoke + 14 axe), ejecutadas también contra el `.xdc` extraído.

---

## 10. Filas de canciones v2, icono de Vaciar y Favoritos (capturas 2026-10-19)

**Petición:** pulir la lista de canciones en la cola, en las listas y en «Todas las canciones»; el icono de vaciar lista es horrible; eliminar el botón de ir a Biblioteca en Favoritos.

### 10.1 Diagnóstico de las filas

Las tres pantallas ya compartían el patrón `.track-row`/`.queue-item`, pero con medidas pensadas para escritorio: asa de arrastre de mínimo 40 px, portada de 48 px (sobre un canvas de 44, reescalado), dos acciones de 40 px y huecos de 12 px. En una fila útil de ~320 px, lo fijo sumaba ~274 px en el editor de lista: el título quedaba en ~46 px («Us…», «Aspi…»). Además, las pistas sin metadatos mostraban «0:00», como si duraran cero segundos.

### 10.2 Qué se hizo

| Zona | Cambio |
|---|---|
| Patrón de fila (Cola, listas, Todas las canciones, Buscar, Favoritos, historial) | Huecos de 9 px, padding 7 px, alto mínimo 60 px (las listas virtuales siguen con `rowHeight: 64`), radio 14 px, portada **44×44** (tamaño real del canvas), texto en columna con línea 1.3/1.35, duración pequeña alineada a la derecha con números tabulares. |
| Asa de arrastre | Columna fina de **20 px** (40 de alto), icono de 13 px y opacidad 0.55: sigue reordenando, ya no roba el título. |
| Acciones de fila (menú, quitar, quitar de la cola) | **36 px** visuales, icono 16–17 px. Decisión documentada: se baja de 40 a 36 px a cambio de ~70 px más para el texto; la fila (≥60 px) sigue siendo el objetivo principal y cada botón conserva su `aria-label`. |
| Duración desconocida | Nuevo `App.fmtRowDuration(t)`: con duración 0/ausente la celda queda vacía. Usado en Biblioteca, Cola, editor de lista e historial. El reproductor sigue mostrando el total con `fmtTime`. |
| Icono de Vaciar | Eliminada la escoba (`#i-broom`, ilegible a 13–16 px). Nuevo `#i-clear-list`: tres líneas con una ×, en trazo. Aplicado en Vaciar cola, Vaciar lista y «Liberar espacio». |
| «Vaciar» de la cola | De barra a todo ancho a pastilla discreta `fit-content` alineada a la derecha. |
| Favoritos vacío | Sin botón «Biblioteca» (`#btnFavGoLibrary` eliminado): Favoritos y Biblioteca ya son pestañas vecinas en la barra inferior. Queda icono, titular y explicación. En pantallas ≤360 px la portada baja a 40 px y las acciones a 34 px antes que seguir recortando el título. |

Con las nuevas medidas, el texto útil en el editor de lista pasa de ~46 px a ~120 px en un móvil de 360 px.

### 10.3 Pruebas añadidas (6, bloque N de `verificacion/ui-polish.js`)

- CSS: fila unificada (44/9/60), asa de 20 px, acciones de 36 px y «Vaciar» de la cola como pastilla.
- Icono: existe `#i-clear-list`, lo usan los 3 botones y no queda `#i-broom`.
- DOM: con una pista de 3:24 y otra sin duración, ninguna de las tres listas pinta «0:00»; las tres comparten portada/texto/duración y conservan asa, menú y quitar donde toca.
- Favoritos: el vacío no contiene ningún botón.

**Total tras esta sección: 121/121** (80 pulido + 27 smoke + 14 axe), ejecutadas también contra el `.xdc` extraído.

---

## 11. Letras v2 (captura 2026-10-19)

**Petición:** «aquí hay bastante que pulir también en la interfaz», sobre la vista de letra sincronizada.

### 11.1 Diagnóstico de la captura

1. **Cabecera duplicada:** arriba «Yoake no uta — jo0ji» y justo debajo, otra vez título y artista junto a la portada.
2. **Barra de herramientas rota:** 11 controles sueltos (A−, A+, Desfase, repetir, restablecer, pantalla completa, cargar, editar, compartir) que en 360 px saltaban a dos filas y dejaban iconos huérfanos flotando.
3. **La velocidad apretaba la mini-cabecera:** `− 1.0× +` compartía fila con portada y título.
4. **Controles sobre el texto:** anterior/pausa/siguiente flotaban en absoluto sobre la última línea visible, que quedaba atrapada bajo la pausa.
5. **Silencios como versos:** cada línea vacía se pintaba con una ♪ a tamaño completo, con el hueco de un verso (en la captura, tres notas enormes separando frases).
6. **Lectura fatigosa:** huecos de 16 px entre líneas, líneas lejanas al 55% de opacidad sobre un degradado morado al 60%: casi ilegibles.

### 11.2 Qué se hizo

| Zona | Cambio |
|---|---|
| Cabecera | Solo queda la etiqueta «Letra sincronizada». Se elimina `#lyricsTrackName` y su asignación en `renderCurrentTrack()`: la identidad vive una sola vez, en la mini-cabecera. |
| Herramientas | Una **sola fila desplazable** con 5 grupos en pastilla: tamaño de letra, desfase, velocidad, repetir/restablecer y acciones (pantalla completa, cargar, editar, compartir). Todos los botones conservan su `id` y su comportamiento. |
| Velocidad | Se muda de la mini-cabecera a la barra, con los demás ajustes. La mini-cabecera queda en portada 44 px + título/artista, con un filete inferior. |
| Controles | De flotantes a **barra atracada** en la columna (`position: relative`, fondo `--blur-bg` esmerilado y borde superior). La letra hace scroll por su carril y nunca queda bajo la pausa. El play usa el degradado seguro `--accent-fill → --accent-fill-2`. |
| Progreso | La barra estrena una línea fina de progreso con tiempos (actual/total), alimentada por el mismo `updateProgress()` del reproductor (`#lyricsProgressFill`, `#lyricsTimeCurrent`, `#lyricsTimeTotal`). |
| Líneas | Hueco de 11 px, ancho máximo 620 px, línea activa con fondo de acento al 12% y crecimiento del 12% (antes 18%, que hacía saltar el texto). Lejanas al 70–85% (antes 55%). Fondo degradado al 42% (antes 60%). |
| Silencios | `.lrc-line.empty` al 58% del tamaño, opacidad 0.35 y sin altura de verso; si es el silencio activo sube al 72% en color de acento, sin fondo. |

### 11.3 Pruebas añadidas (8, bloque O de `verificacion/ui-polish.js`)

- CSS: fila sin saltos con grupos, controles atracados (no absolutos), silencios discretos y lejanas legibles.
- DOM: no existe la línea duplicada de cabecera; la velocidad está en la barra y sube/baja (1.0× → 1.1× → 1.0×); los 10 ajustes/acciones siguen presentes y agrupados en 5 pastillas.
- Render: una LRC con silencio intermedio lo pinta como interludio `♪` con clase `empty`.
- Progreso: con el audio a 50 s de 200, la barra marca 25%, `0:50` y `3:20`.

**Total tras esta sección: 129/129** (88 pulido + 27 smoke + 14 axe), ejecutadas también contra el `.xdc` extraído.

---

## 12. Regresión de gestos: la barra de Letras cambiaba de canción

**Reporte:** «Al desplazar el menú ahora de un lado a otro se pasa de una canción a otra».

**Causa:** la barra de herramientas de Letras pasó a ser desplazable en horizontal (sección 11), pero el gesto global de `wireGestures()` —deslizar en la vista de Letras para ir a la siguiente/anterior— solo excluía hojas, navegación y la portada. El arrastre sobre la barra burbujeaba hasta `#deviceScreen` con `dx > 60` y disparaba `next()`/`prev()`. El mismo hueco permitía cerrar la vista arrastrando la barra hacia abajo.

**Corrección (`js/events.js`):** el gesto se clasifica al nacer. En `touchstart` se marca `swipeFromUi` si el toque empieza en `.lyrics-toolbar`, `.lyrics-top-bar`, `.lyrics-mini`, `.lyrics-controls`, el indicador de bucle o cualquier control interactivo (`button`, `input`, `textarea`, `select`, `a`, `[role="slider"]`); en `touchend` esos gestos se descartan tanto para el cambio de canción como para el cierre vertical. Marcarlo al inicio importa: el dedo puede terminar sobre otro elemento. Deslizar sobre la letra misma sigue cambiando de canción y cerrando la vista, como antes.

**Pruebas (4, bloque P):** se simulan arrastres táctiles reales sobre la barra, sobre un botón de la barra, sobre el play y sobre el área de la letra. Sin la corrección, las 4 fallan; con ella, la barra no cambia de canción ni cierra, y el gesto sobre la letra conserva su comportamiento.

**Total tras esta sección: 133/133** (92 pulido + 27 smoke + 14 axe), también contra el `.xdc` extraído.

---

## 13. Acciones de la lista en una sola línea

**Petición:** aplicar a los botones de dentro de la lista (subir, renombrar, compartir, vaciar y eliminar) lo mismo que a la barra de Letras: una sola línea.

**Cambio (`styles.css`, acotado a `#sheetEditPlaylist .edit-pl-actions`):** la fila deja de envolverse (`flex-wrap: nowrap`) y pasa a desplazarse en horizontal sin barra visible, con las pastillas sin encoger (`flex: 0 0 auto`) para que ninguna etiqueta se parta ni se recorte. Un fundido en el borde derecho avisa de que hay más acciones fuera de pantalla. El acotado importa: Favoritos reutiliza `.edit-pl-actions` para su «Reproducir Todo» y conserva su comportamiento. Las cinco acciones mantienen orden, texto, iconos y el contraste de las destructivas.

**Pruebas (3, bloque Q):** la regla acotada no envuelve y desplaza, la genérica sigue intacta para Favoritos; las cinco acciones están en la fila en el orden pedido con su texto; y «Subir» y «Renombrar» siguen funcionando dentro de la fila. Se corrigió además una búsqueda sin anclar en el bloque L que cazaba la nueva regla acotada en vez de la base.

**Total tras esta sección: 136/136** (95 pulido + 27 smoke + 14 axe), también contra el `.xdc` extraído.

---

## 14. Sin cierre de Letras al deslizar hacia abajo

**Petición:** eliminar en la vista de Letras lo de desplazar hacia abajo para cerrar.

**Cambio (`js/events.js`):** se elimina la rama de swipe vertical de `wireGestures()`: deslizar hacia abajo ya no vuelve al reproductor desde ninguna zona de la vista. Era fácil dispararla sin querer al hacer scroll por la letra. Para salir quedan el botón de volver de la cabecera (`#btnBackFromLyrics`) y, en pantalla completa, el de salir (`#btnLrcExitFs`). El swipe horizontal sobre la letra para cambiar de canción no se toca, ni la protección de la barra de herramientas de la sección 12.

**Pruebas (bloque P actualizado, 5):** deslizar hacia abajo sobre la barra y sobre la letra mantiene la vista abierta y no cambia de canción; el botón de volver sí cierra.

**Total tras esta sección: 137/137** (96 pulido + 27 smoke + 14 axe), también contra el `.xdc` extraído.

---

## 15. Reproductor v2

**Petición:** tras la crítica de la captura del reproductor («¿Qué te parece la interfaz?» → «Adelante»), se aplican los seis puntos acordados.

| Punto | Cambio |
|---|---|
| Cabecera sin duplicar | `#nowPlayingContext` ya no repite el título (que va en grande bajo la portada): muestra «Reproduciendo desde · <contexto>» con `getPlayContextLabel()`, o «Tu biblioteca» si no hay contexto. El título completo queda en el tooltip. |
| «+» sobrio | `#btnBack` pierde la clase `icon-add` (el disco de acento de 40 px que competía con la portada y se confundía con un «volver»): queda un botón de superficie. Inicio conserva su disco, donde cargar música sí es la acción principal. |
| Álbum que aporta | En `renderCurrentTrack()` el álbum se oculta si coincide con el título o con el artista (comparación normalizada), el caso del sencillo de la captura. |
| Progreso preciso | El área de toque pasa a 22 px con la línea visible de 4 px centrada (`::before`), el tirador se insinúa siempre (13 px, acento con borde blanco) y crece al arrastrar, y el relleno usa el acento uniforme en vez del degradado de portada que viraba a rosa. El buffer y el rango A–B se centran igual. |
| Transporte reequilibrado | Grupo centrado (`justify-content: center`, huecos fluidos), aleatorio/repetir a 44 px en `--text-2` con punto de acento cuando están activos, anterior/siguiente a 48 px y play a 68 px con sombra más suave. |
| Secundaria con etiquetas | Letras, Cola, Volumen y Visualizador ganan etiqueta `.sec-label` traducida (`data-i18n` con la misma clave que su `aria-label`); A–B ya se lee en su distintivo. En pantallas bajas la portada cede a 30dvh antes que los controles. |

**Pruebas (6, bloque R):** CSS de progreso/transporte/etiquetas; la cabecera pinta «Reproduciendo desde · Mi música» y no el título; el álbum igual al título se oculta y uno distinto se muestra; el «+» del reproductor no es disco y el de Inicio sí; y las cuatro etiquetas existen con su clave i18n.

**Total actual: 143/143** (102 pulido + 27 smoke + 14 axe), también contra el `.xdc` extraído con `AURORA_ROOT=/tmp/xdc-player-v2 npm test`.

---

## 16. Organización del repositorio

**Petición:** eliminar todos los archivos de prueba y ubicar cada tecnología en su carpeta. **Decisiones documentadas:** la suite `verificacion/` se elimina por completo del repo (se confirmó en verde, 143/143, justo antes de borrarla y se conserva solo esta constancia); la librería vendorizada `jsmediatags.min.js` se queda en `assets/js/` por ser código de terceros ya dentro de una carpeta `js` — todo el JavaScript **propio** vive en `js/`; y los informes de `docs/` no se reescriben porque son el registro histórico de cada fase.

| Antes | Después |
|---|---|
| `styles.css` (raíz) | `css/styles.css` |
| `data.js`, `storage.js`, `uploader.js`, `webxdc.js` (raíz) | `js/` junto a los demás módulos |
| `verificacion/` (9 archivos + dependencias) | eliminada |

Referencias actualizadas: `index.html` (`css/styles.css`, `js/webxdc.js`, `js/data.js`, `js/storage.js`, `js/uploader.js`), `build-xdc.py` (empaqueta por directorios `css/` y `js/` y valida el stub en `js/webxdc.js`) y la tabla de contenido del `README.md`. Al revisar `index.html` se eliminó además un fragmento duplicado tras el `</html>` (83 bytes que volvían a cargar `js/main.js`).

**Comprobación sin suite permanente:** sintaxis de los 19 JS con `node --check`; arranque real con un arnés externo temporal (copia fuera del repo) cargando los 20 scripts desde sus rutas nuevas — `App` viva, 0 errores — tanto en el repo como en el `.xdc` extraído; y validación del paquete con `build-xdc.py --check` (28 archivos, mismo tamaño e inventario que antes, sin ningún archivo de prueba dentro).

---

## 17. Tres retoques del reproductor (captura del usuario)

**Petición:** el A-B «descuadra» con los otros secundarios; la etiqueta del visualizador sale «Visualizad…»; y arriba se lee «REPRODUCIENDO AHORA / Reproduciendo desde · Musica», redundante.

| Punto | Causa y cambio |
|---|---|
| A-B descuadrado | Era el único secundario sin etiqueta y con distintivo de 34×30 frente a cajas de icono de 36×36: quedaba centrado a otra altura y sin texto debajo. Ahora el distintivo es 36×36 (radio 12, como los `.ico`) y lleva `.sec-label` con la clave nueva `ab_label` («Bucle» en es; junto al distintivo se lee «Bucle A-B»). Los estados `A→`/`A⇄B` y `aria-pressed` no cambian. |
| «Visualizad…» | La `.sec-label` forzaba mayúsculas: «VISUALIZADOR» en caja alta no cabe en su columna (≈61 px a 360 px). Sin `text-transform` y con `letter-spacing: 0` la palabra en caja mixta ocupa ~20 % menos y entra entera; el resto de etiquetas no se resiente. |
| Cabecera redundante | Fuera la línea «REPRODUCIENDO AHORA» del reproductor (la de Letras, «LETRA SINCRONIZADA», queda). El contexto pasa a una sola frase: `playing_from` + nombre, con la traducción española ajustada a «Reproduciendo de» — «Reproduciendo de Música», «de Favoritos»… La misma frase se usa en el subtítulo de la Cola. Sin contexto sigue «Tu biblioteca». |

**Comprobación** (arnés jsdom externo, fuera del repo): cabecera con lista/álbum → «Reproduciendo de Música», con Favoritos → «Reproduciendo de Favoritos», sin contexto → «Tu biblioteca», en inglés → «Playing from Música»; A-B recorre `A-B → A→ → A⇄B → A-B` con sus clases y su etiqueta pasa a «Loop»/«ループ» al cambiar de idioma; 0 errores de arranque en el repo y en el `.xdc` extraído. Paquete: 28 archivos · 325.5 KB · sha256 `1607f88fe7b42871f94a6caba7c6c63491e1de1a376203891e3ceff1c156eba0`.

---

## 18. Play/pausa y pantalla completa «muertos»: listeners duplicados

**Síntoma (captura del usuario):** el botón play/pausa del reproductor no responde y el de pantalla completa del menú de Letras tampoco. **Causa raíz:** ambos son botones tipo *interruptor* (toggle). Si el arranque se dispara dos veces en el mismo contexto — el cliente WebXDC puede re-evaluar `main.js` o reemitir `DOMContentLoaded` — `wireEvents()` registraba cada listener dos veces: un solo toque pausaba y reanudaba a la vez (y la pantalla completa entraba y salía en el mismo clic), así que «no pasaba nada». Los botones no-toggle (siguiente, abrir hojas…) disimulaban el duplicado. **Reproducido en jsdom** forzando un doble `init()`: cada clic llamaba dos veces a `togglePlay`/`toggleLyricsFullscreen`; con un solo arranque, una.

**Corrección (tres capas, comentarios en el código):**
1. `App.init()` se ejecuta una sola vez (`_initStarted`): un segundo arranque devuelve al instante.
2. `wireEvents()` y `wireGestures()` salen si ya están cableados (`_wired.events` / `_wired.gestures`).
3. `bootAurora()` en `main.js` se protege con `window.__auroraBooted` ante una re-evaluación del script.

**Comprobación** (arnés jsdom externo): con doble arranque simulado, 1 clic = 1 llamada; pausar deja `isPlaying:false` y reanudar lo restablece; pantalla completa entra con un clic (`lyrics-fullscreen`) y sale con el botón ×; arranque normal sin cambios; 0 errores en repo y `.xdc` extraído. Paquete: 28 archivos · 325.5 KB · sha256 `1607f88fe7b42871f94a6caba7c6c63491e1de1a376203891e3ceff1c156eba0`.

---

## 19. Bienvenida de Inicio pulida

**Petición:** opinión de la pantalla de inicio en estado vacío (7,5/10) → «Adelante» con los cinco puntos.

| Punto | Cambio |
|---|---|
| Tercio inferior vacío | `.home-welcome` centra el bloque en vertical (`justify-content: center`) y la aurora se extiende a toda la pantalla (`inset: -10% -40%`, opacidad 0.85): el degradado ya no muere a mitad. |
| Sin Ajustes sin música | La cabecera de Inicio se oculta en este estado y con ella su engranaje. La bienvenida lleva el suyo (`#btnHomeWelcomeSettings`, arriba a la derecha) que abre la misma hoja de Ajustes. |
| Perks que parecían botones | Cada ventaja lleva descripción de una línea (`home_perk_*_desc`, 8 idiomas): «Con tus archivos .lrc, línea a línea», «Crea listas y marca favoritos», «Todo queda en tu teléfono». Filas más compactas (padding 8px). |
| Chips incompletos | Se añade **OPUS**: MP3 · FLAC · M4A · WAV · OGG · OPUS, lo que la app reproduce de verdad. |
| Triple marca | Fuera el wordmark «AURORA» bajo el icono (y su CSS, incluida la regla de tema claro): icono + titular, con más aire sobre el `h2`. |

**Comprobación** (arnés jsdom externo): bienvenida sin wordmark, 6 chips, tres perks con título+descripción, el engranaje abre `sheetSettings`, traducción EN aplicada («With your .lrc files, line by line»), 0 errores en repo y en el `.xdc` extraído. Paquete: 28 archivos · 325.5 KB · sha256 `1607f88fe7b42871f94a6caba7c6c63491e1de1a376203891e3ceff1c156eba0`.

---

## 20. Inicio con música: hero que aporta, fuera el «Pro», densidad y «Ver todo»

**Petición:** opinión de Inicio ya con música (8/10) → «Adelante» con los cuatro puntos.

| Punto | Cambio |
|---|---|
| Hero duplicaba al mini | La tarjeta «Continuar escuchando» muestra, si hay posición de reproducción (>5 s y no casi al final), la línea «Retomar en X» (`home_resume_at`, 8 idiomas) en color de acento: ahora aporta el dato que el mini-reproductor no enseña. |
| «AURORA · REPRODUCTOR PRO» | `app_title` pasa a ser solo «Aurora» en los 8 idiomas: no hay versión Pro ni otra que no lo sea. |
| Densidad | Tarjetas de carril de 132 → 116 px: caben tres secciones de un vistazo. Y la pista cargada se marca en su tarjeta con un ecualizador de tres barras sobre la portada (animado solo si suena, quieto con `prefers-reduced-motion`) y el título en acento. |
| Sin salida a la lista completa | Cada sección lleva «Ver todo» (`see_all`, 8 idiomas) que abre la Biblioteca, cableado en `_bindHomeRails` vía `data-see-all`. |

**Comprobación** (arnés jsdom externo): kicker «Aurora»; hero con posición «Retomar en 1:24» y sin posición sin inventar la línea; solo la tarjeta actual lleva `.eq-badge.playing`; «Ver todo» abre la hoja Biblioteca; 0 errores en repo y en el `.xdc` extraído.
Paquete: 28 archivos · 325.5 KB.

## 21. «Reproduciendo desde», no «de»

Ajuste de redacción pedido por el usuario: la frase de contexto vuelve a ser «Reproduciendo desde <lista/contexto>» (clave `playing_from`, es). Se aplica igual en la cabecera del reproductor y en el subtítulo de la Cola. Verificado con el arnés externo: ambas dicen «Reproduciendo desde Música», 0 errores.

---

## 22. Pulido de Biblioteca

**Petición:** «Pasamos ahora a pulir la biblioteca» → opinión (7,5/10) → sí a los seis puntos.

| Punto | Cambio |
|---|---|
| Subtítulo con eco | `makeTrackRow` oculta el álbum del subtítulo cuando coincide con el título o con el artista (la misma regla del reproductor): «BALALAIKA / 9Lana», no «9Lana · BALALAIKA». Lo heredan Biblioteca, listas, Buscar, Favoritos y el menú de pista. |
| «Seleccionar» cortado | El botón de selección por lote sale de la fila con scroll horizontal: nueva `.lib-sort-wrap` con chips desplazables a la izquierda y el botón fijo a la derecha. |
| Duraciones a saltos | `fmtRowDuration` devuelve un «—» tenue (`.row-duration-na`) cuando la duración es desconocida: la columna mantiene el ritmo sin inventar cifras. |
| Fila actual poco visible | Título en color de acento (`.track-row.current`/`.queue-item.current`) y el ecualizador de tres barras sobre la miniatura, animado solo si suena — el mismo distintivo de Inicio. El editor de listas conserva su icono propio. |
| Acciones que se pierden al bajar | Cabecera de «Todas las canciones» + acciones + ordenación en `.lib-songs-sticky` (`position: sticky`, fondo del panel): reproducir todo y reordenar siempre a mano. |
| Última fila bajo el mini | `#sheetLibrary .sheet-body` gana `padding-bottom: 104px`: el final de la lista siempre queda por encima del mini-reproductor. |

**Comprobación** (arnés jsdom externo): cinco filas de prueba — eco eliminado (álbum=título y álbum=artista ocultos, álbum distinto visible), duraciones `3:10/—/—/2:49/1:40`, fila actual con `.eq-badge.playing` y las demás sin marca, «Seleccionar» fuera del scroll y dentro de `.lib-sort-wrap`, bloque sticky presente con la lista fuera de él; 0 errores en repo y en el `.xdc` extraído. Paquete: 28 archivos · 325.5 KB · sha256 `1607f88fe7b42871f94a6caba7c6c63491e1de1a376203891e3ceff1c156eba0`.

## 23. Textos neutros de plataforma

«Carga canciones del teléfono» dejaba fuera a quien usa la app en Delta Chat de escritorio. Las dos únicas claves que nombraban el teléfono pasan a «tu dispositivo» en los 8 idiomas: el lead de la bienvenida (`home_welcome_lead`) y la descripción de la ventaja local (`home_perk_offline_desc`; el japonés ya decía «端末»). Sin cambios de lógica. Verificado con el arnés externo en ES y EN, 0 errores.

---

## 24. Listas .m3u: importación (la exportación ya existía)

**Petición:** «Listas .m3u». Al revisar, la exportación ya estaba («Compartir lista» genera un `.m3u8` estándar desde el editor); lo que no existía era importar. **Implementado:**

- **Parser** (`parseM3U`, en `js/playlist-edit.js` junto al exportador): `#EXTM3U`, `#PLAYLIST:nombre`, `#EXTINF:dur,Artista - Título`, rutas con esquema `file://`, codificación `%XX`, saltos CRLF y BOM. También M3U simple (solo rutas).
- **Emparejado** (`matchM3UEntries`) por nombre de archivo (sin la carpeta de origen), por «Artista - Título» y por título si es único. Duplicadas dentro del propio archivo, una sola vez. Si nada coincide no se crea una lista vacía y se avisa con honestidad; el toast resume «X de Y canciones encontradas».
- **Dos entradas**: botón «Importar .m3u» junto a «Nueva» en Listas de reproducción de la Biblioteca, y el selector general «Cargar música» acepta `.m3u/.m3u8` y los convierte en listas. Si el nombre ya existe, la importada se llama «nombre (2)».
- 5 claves nuevas en 8 idiomas (`m3u_import_btn`, `imported_playlist_name`, `toast_m3u_imported/none/empty`).

**Comprobación** (arnés jsdom externo): formato Aurora (ruta Windows `C:\…` y URI con `%20`) importa 2/3; M3U simple con rutas relativas y duplicadas importa 2; rescate por título funciona; sin coincidencias no crea lista; nombre repetido → «(2)»; e ida y vuelta real exportar→importar conservando nombre y orden. 0 errores en repo y `.xdc` extraído.

---

## 25. Auditoría general final

Auditoría completa sobre `5c1cb60` (con el arnés jsdom externo, fuera del repo):

| Bloque | Resultado |
|---|---|
| Sintaxis | 19/19 JS con `node --check`; `build-xdc.py` compila |
| Estructura | Sin IDs duplicados (318), sin JS propio fuera de `js/`, sin CSS fuera de `css/`, referencias locales todas presentes |
| i18n | 394 claves × 8 idiomas, ninguna incompleta; ninguna clave usada sin definir |
| Offline/seguridad | Ninguna carga remota en el código de la app; sin `eval`/`document.write`/`onclick` inline; 0 TODO/FIXME propios |
| Funcional | **26/26**: arranque único y doble (regresión de botones), play/pausa, pantalla completa de Letras, cabecera «Reproduciendo desde», ciclo A-B, Biblioteca (eco/duración/marca/sticky), M3U ida y vuelta, Bienvenida (chips/Ajustes/dispositivo), Inicio (Retomar/marca/Ver todo) e i18n EN |
| Paquete | 28 archivos, sin rastros de pruebas, sha256 reproducible y `--check` OK |
| Accesibilidad | **Hallazgo corregido aquí**: 5 botones de la toolbar de Letras solo tenían icono (4 con `title`, 1 sin nada). Todos con `aria-label` traducible (`data-i18n-aria`), incluido «Quitar loop». Botones sin nombre accesible: 179 → **0 sin nombre** |

**Observaciones que quedan como están (decisión, no fallo):** no hay suite de pruebas dentro del repo (se retiró a petición del usuario; la verificación es externa por fase); la sincronización entre dispositivos está aparcada a petición del usuario; `js/data.js` y `css/styles.css` son grandes pero estables. La verificación visual en dispositivo real sigue siendo la del usuario mediante capturas.

---

## 26. Correcciones tras las capturas (cierre único, placeholder, mini-player)

Las capturas del usuario eran de un paquete anterior (de ahí el eco de Favoritos y el «Select» cortado, ya corregidos en la §23). Los detalles vigentes que se corrigieron:

- **Placeholder de Buscar cortado**: el texto venía truncado en el propio diccionario («Canción, artista o ál…» en los 8 idiomas). Ahora completo: «Canción, artista o álbum» y equivalentes, sin puntos suspensivos.
- **Doble cierre en las cabeceras**: casi todas las hojas tenían a la vez una «×» a la izquierda y un botón de texto «Cerrar»/«Listo» a la derecha que hacían lo mismo; Biblioteca solo tenía la ×. Se eliminan los 16 botones de texto duplicados y se sustituyen por el espaciador de centrado, dejando la × como cierre único (con `aria-label` traducido). Se conservan las acciones reales de la derecha («Nueva» en Listas, «Guardar» en editores, «Reproducir Todo» en Explorar). La clave `done_btn` queda retirada del diccionario al quedarse sin uso.
- **Mini-player sobre las filas**: las hojas-pestaña terminan en `--chrome-offset`, calculado con `--mini-h: 56px`, pero el mini ocupa 56 px de alto + 6 px de margen inferior: el borde de la hoja quedaba 6 px por debajo del borde superior del mini y este tapaba esa franja de la lista. `--mini-h` pasa a 62 px con `has-mini` y la hoja termina justo sobre el mini.

**Comprobación** (arnés jsdom externo): regresión específica 15/15 (ninguna cabecera con botón de texto de cierre, 22 cabeceras con exactamente una ×, acciones conservadas, la × cierra Favoritos y Ajustes, placeholder completo aplicado en ES/EN, diccionario sin `done_btn`) y auditoría funcional general 26/26 sin regresiones; i18n 393 claves × 8 idiomas sin huecos. Repetido sobre el `.xdc` extraído: 15/15, `build-xdc.py --check` OK.

---

## 27. Copia de seguridad completa (v2): ajustes y sesión portables

**Petición:** qué faltaría para el 10 sin realtime → se empieza por la copia de seguridad. Al revisar, ya existía una copia de metadatos (listas, favoritos, estadísticas, historial, con fusión aditiva y reenlace de audio); lo que la hacía «incompleta» era que no guardaba ajustes ni dónde ibas, y que el reenlace entre dispositivos exigía nombre **y tamaño** idénticos.

**Implementado** (en `js/library.js`, junto al exportador/importador existentes):

- **Formato v2** (`version: 2`, con `appVersion` y `exportedAt`; nombre de archivo con fecha `aurora-backup-AAAA-MM-DD.json`). Los backups v1 siguen importando.
- **Ajustes** (`_backupSettings`/`_applyBackupSettings`): tema, acento, idioma, volumen, gapless/normalizar/crossfade/marqueo/vinilo, preservar tono, velocidad, tamaño de letra, modo de visualizador, EQ (ganancias personalizadas o preset) y orden de la biblioteca. Al importar se aplica **en silencio** (sin toasts de los setters) y todo pasa por listas blancas: tema/idioma/modo inventados se rechazan, volumen y ganancias ±12 dB se limitan, crossfade solo acepta 0/3/6/12.
- **Sesión portable** (`_backupSession`): pista actual y cola identificadas por nombre+tamaño de archivo y la posición en segundos. Al importar se traduce a los id locales, se guarda como sesión a restaurar y, si no está sonando nada, se aplica al momento con el propio `restoreSession()`: mismo tema, misma cola, mismo segundo, en el otro dispositivo.
- **Reenlace por nombre**: si el tamaño difiere (otro ripeo de la misma canción) y el nombre de archivo es único en la biblioteca, la pista se reenlaza igual en vez de crear una fantasma sin audio. Aplica a listas, favoritos, estadísticas, historial y sesión.
- El texto de ayuda en Ajustes (8 idiomas) ahora dice la verdad: «Listas, favoritos, ajustes y dónde ibas escuchando. No incluye los archivos de audio.» El flujo entre dispositivos es manual: exportar → enviar el `.json` por el propio chat → importar. Sin servidores, sin realtime, sin gasto continuo de datos.

**Comprobación** (arnés jsdom externo): regresión específica 26/26 —exportación con todos los campos, importación en un «dispositivo B» con otros id y *otros tamaños* (0 pistas fantasma, lista y favoritos reenlazados a los id locales, tema/acento/volumen/crossfade/EQ aplicados, sesión traducida conservando los 42 s), compatibilidad v1 y backup manipulado rechazado por las listas blancas— con 0 errores; auditoría funcional general 26/26 e i18n 393×8 sin huecos. Repetido sobre el `.xdc` extraído: 26/26, `--check` OK.

---

## 28. Reordenar la cola arrastrando (rehacer bien lo que ya había)

**Petición:** reordenar la cola arrastrando. Al revisar, ya existía un asa de arrastre en la cola y en el editor de listas, pero con carencias: el asa medía 20 px de ancho (difícil de agarrar con el dedo), el arrastre no se reflejaba en la cola original con el aleatorio activo (al desactivarlo se perdía el orden nuevo), no guardaba la sesión al soltar, en listas virtualizadas (>80) no había forma de llevar una pista lejos (sin autoscroll, y el repintado podía eliminar la fila a mitad de gesto), y convivía con un «modo reordenar» por pulsación larga que no habilitaba nada (solo pintaba la fila y mostraba un toast).

**Implementado** (reescritura de `wireDragHandle` en `js/playlist-ui.js`, compartido por la cola y el editor de listas):

- **Pointer Events** con captura del puntero: un solo camino para dedo y ratón, sin los listeners duplicados de ratón en ventana del código anterior. `touch-action: none` en el asa para que el navegador no robe el gesto como scroll.
- **Asa de 34×40 px** (objetivo táctil real), icono tenue como hasta ahora.
- **Destino calculado por hueco de inserción** y marcado con una sola línea de acento; la fila sigue al dedo con compensación del autoscroll para no despegarse cuando la lista se desplaza bajo ella.
- **Autoscroll** cerca de los bordes (56 px): se puede cruzar una cola larga entera. En listas virtualizadas la fila arrastrada se marca (`dragIdx`) para que `_paintVirtual` no la elimine del DOM al repintar.
- **Al soltar**: se ajusta `queueIdx` para que la pista que suena nunca se pierda, la misma mudanza se refleja en `_originalQueue` si el aleatorio está activo, y se guarda la sesión al momento. En el editor, el mismo gesto reordena la lista y la persiste (con su límite `maxIndex` propio).
- **Retirado** el modo por pulsación larga y su clave `toast_reorder_mode` (8 idiomas): el arrastre funciona directamente, sin modos.

**Comprobación** (arnés jsdom externo): 11/11 en cola y editor (orden resultante, `queueIdx` siguiendo a la que suena al mover otra y al moverla a ella, cancelación sin efecto, espejo en `_originalQueue`, sesión guardada) y 7/7 con cola virtualizada de 100 pistas (ventana pintada, la fila arrastrada sobrevive al repintado, `dragIdx` limpio al soltar). Auditoría general 26/26, backup 26/26, i18n 392×8. Repetido sobre el `.xdc` extraído: 11/11 y 7/7, `--check` OK.

---

## 29. Portada personalizada por canción

**Petición:** poder poner una imagen propia a una canción (cuando la de los metadatos falta o está mal).

**Implementado:**

- **Entrada**: menú de pista (⋯ o pulsación larga) → «Cambiar portada»; si la pista ya tiene una personalizada aparece además «Restablecer portada». Icono `i-image` nuevo en el sprite.
- **Procesado** (`setCustomCover`, en `js/playlist-ui.js`): se valida que sea imagen (tipo MIME o extensión) y ≤ 15 MB; se generan dos miniaturas JPEG de 96 y 256 px con recorte cuadrado centrado reutilizando `resizeDataUrl` del importador, y se guardan en `track.customCover` (persisten con la pista en IndexedDB). La portada original nunca se toca: quitar la personalizada la devuelve tal cual.
- **Prioridad en todos los resolvedores**: `coverSrcForRow` (filas), `_renderArtwork` (reproductor y Media Session), `_playlistTrackArtSrc` (mosaicos de listas) y `_coverForSession` consultan primero `customCover`, así ni un re-etiquetado posterior puede pisarla. Al cambiarla se invalida la caché de artwork y los mosaicos de las listas que contienen la pista, y se repintan biblioteca, listas, cola, favoritos, inicio, mini-player y reproductor si es la que suena.
- **Viaja en la copia de seguridad**: el backup la incluye por pista; al importar, una pista restaurada nace con ella y una pista ya existente la adopta solo si no tiene ya una personalizada local. Las miniaturas se validan como cualquier imagen externa (`_safeImageDataUrl`: SVG rechazado).
- 5 claves nuevas × 8 idiomas (`ctx_change_cover`, `ctx_remove_cover`, `toast_cover_updated/removed/error`).

**Comprobación** (arnés jsdom externo, con el redimensionado sustituido por uno determinista): 21/21 —puesta y quitada de portada, prioridad en los cuatro resolvedores, persistencia en IndexedDB, original intacta debajo, menú que muestra/oculta «Restablecer» según el caso, rechazo de un archivo de audio como imagen, y el viaje completo en el backup (adopción sin pisar la local, pista nueva con portada, SVG rechazado)— con 0 errores. Sin regresiones: auditoría 26/26, backup 26/26, cola 11/11, cierres 15/15, i18n 397×8. Repetido sobre el `.xdc` extraído: 21/21, `--check` OK.

---

## 30. Letras .lrc automáticas al importar

**Petición:** que al cargar música, un `.lrc` con el mismo nombre que una canción se le asocie solo, sin abrir la vista de Letras pista a pista.

**Implementado** (en `js/library.js`, dentro de `handleFileInput`, que ya aceptaba `.lrc` en el selector pero los mandaba al importador de audio, donde se perdían):

- Los `.lrc` se separan al inicio, como ya pasaba con los `.m3u`: nunca llegan al importador de pistas.
- **`_attachLrcFiles`**: empareja por nombre base sin extensión ni mayúsculas («Tema.lrc» ↔ «Tema.mp3», también «TEMA.LRC» ↔ «tema.mp3»). Busca primero entre lo recién importado (incluidas las pistas reenlazadas de un backup) y después en toda la biblioteca, así que también funciona soltar **solo los .lrc** de una carpeta ya importada, o reimportar la música acompañada de sus letras.
- **Política**: nunca pisa una letra que la pista ya tenga (la de los metadatos o una cargada/editada a mano manda; para sustituirla está el botón de la vista de Letras). Archivos vacíos o ilegibles se saltan sin romper la importación. La letra se guarda en `track.lrc` (mismo formato de líneas que usa el botón manual), se invalida su caché y se persiste.
- **Avisos**: el toast de la importación añade «· X letra(s) enlazada(s)»; soltando solo letras sin coincidencia se avisa con honestidad («Ninguna letra coincidió con tus canciones»). 2 claves nuevas × 8 idiomas.

**Comprobación** (arnés jsdom externo; el importador de audio se simula y `Blob.text()` de jsdom se sustituye por FileReader, como en un navegador real): 15/15 —audio+letra en la misma importación, letra que `parseLrc` lee con tiempos, persistencia en IndexedDB, letra previa que no se pisa, solo-.lrc sobre la biblioteca, sin coincidencia, .lrc vacío inofensivo, mayúsculas en nombre y extensión, y reimportación sin duplicados ni pérdida de la letra— con 0 errores. Sin regresiones: auditoría 26/26, backup 26/26, portada 21/21, cola 11/11, i18n 399×8. Repetido sobre el `.xdc` extraído: 15/15, `--check` OK.

---

## 31. Estrés con 5.000 canciones y persistencia reforzada

**Petición:** el bloque de «dispositivo real»: preparar la app para bibliotecas grandes y dejar lista la confirmación final en el móvil.

**Medición antes de tocar nada** (arnés jsdom con 5.000 pistas, 20 listas de 250 y cola completa; jsdom es más lento que un WebView real, valen las comparaciones relativas):

| Superficie | Antes | Después | Causa |
|---|---|---|---|
| Favoritos (500) | ~320 ms, 500 filas DOM | **~7 ms, 9 filas** | Era la única lista larga sin virtualizar; ahora usa `fillVirtualList` como la cola |
| Cola (5.000) | ~104 ms | **~7 ms** | La limpieza de ids usaba `tracks.some()` por id (cuadrático): ahora el índice `trackMap()` |
| Listas (20×250) | ~212 ms | **~47 ms** | `getPlaylistCover` resolvía cada id con `find()`: ahora `getTrackById` |
| Importar backup (5.000) | ~110 ms | **~25 ms** | Listas/favoritos/historial filtran contra un `Set` de ids construido una vez |
| Buscar | ~58 ms | ~48 ms | Caché de textos normalizados por pista (`_searchClean`, WeakMap): ya no se normalizan 5.000 títulos por tecla; se recalcula sola si se editan las etiquetas |

Sin cambios de comportamiento: mismos resultados y mismos contextos de reproducción (favoritos sigue reproduciendo la lista entera al pulsar una pista).

**Persistencia**: ya se pedía almacenamiento persistente al arrancar y Ajustes muestra uso/cuota con 🔒 si está concedido. Refuerzo: tras cada importación de música se vuelve a pedir, porque algunos navegadores solo lo conceden tras interacción real con la app.

**Comprobación**: estrés repetido sobre el repo y el `.xdc` extraído (0 errores); regresión de búsqueda 5/5 (tokens cruzados título+artista, filtros, invalidación de la caché al editar); batería completa sin regresiones (auditoría 26/26, backup 26/26, portada 21/21, letras 15/15, cola 11/11, cierres 15/15, i18n 399×8).

**Pendiente (solo puede hacerlo el usuario, en su dispositivo)**: instalar este `.xdc` en Delta Chat, importar una carpeta grande y comprobar que la biblioteca se desplaza sin tirones, que al reabrir la app todo sigue ahí (sesión y biblioteca), y que en Ajustes → Almacenamiento aparece el uso con el 🔒 si el sistema concedió la persistencia. Si algo va lento ahí, la superficie concreta ya tiene su medición de referencia en esta sección.

## 32. Triaje del informe de QA externo (2026-10-20)

Informe recibido favorable («Apto para uso general», 0 errores de consola del
revisor) con deuda concentrada en accesibilidad. Cada hallazgo se verificó
contra el código antes de tocar nada; resultado:

**Confirmados y corregidos**

- **A1 — Ghost de bienvenida invisible en tema claro.** Cierto: la regla
  `:not(.primary-btn)…` de contorno/borde/sombra del tema claro (especificidad
  mayor) ganaba al `.primary-btn.ghost`. Ahora la regla es
  `:root[data-theme="light"] .primary-btn:not(.ghost)`: el ghost conserva su
  aspecto en claro y en oscuro.
- **A2 — Doble salto de ±5 s con las flechas sobre el slider.** Cierto: el
  handler global de `keydown` no excluía `[role="slider"]`, así que el slider
  hacía su salto nativo y además el global sumaba los 5 s. Añadida la guardia
  `e.target.closest('[role="slider"]')`. Verificado: un solo salto.
- **A3 — Velocidad solo editable desde Letras.** Cierto. Nuevo stepper
  −/velocidad/+ en Ajustes → Reproducción (clave `settings_speed`), sincronizado
  en ambos sentidos con el de Letras y con botones deshabilitados en 0,5×/2,0×.
- **A4 — Aria sin localizar.** Cierto en dos sitios: el engranaje de la
  bienvenida llevaba «Abrir Ajustes» fijo (ahora `t('settings_title')`) y las
  bandas del ecualizador se etiquetaban al construirlas, sin refrescar al
  cambiar de idioma (ahora `applyLang()` las re-etiqueta: «Banda 1»↔«Band 1»).
- **A5 — Icono de canciones gigantesco portada.** Cierto: `.pl-cover-icon`
  intentaba 28 % con `inset` pero `width/height:auto` lo dejaba sin tamaño
  efectivo. Ahora centrado explícito al 38 % del cuadrado.
- **M1 — Singular de «pistas».** Cierto. Nueva clave `track_count_one` (×8) y
  helper `fmtTracksCount(n)`: «1 pista» / «1 track». Usado en la tarjeta de
  Inicio, el subtítulo de Explorar, los metadatos de listas y los resultados.
- **M2 — Dos secciones con el mismo título.** Cierto. Nuevas claves
  `theme_section` y `accent_section` (×8): «Tema» y «Color de acento» ya no
  comparten `themes_title`.
- **M3 — Etiquetas laterales en mayúsculas duras.** La causa no era el
  `uppercase` de `.sec-label` (no lo tenía): lo heredaba de `.sec-btn`
  (`text-transform: uppercase` en el botón contenedor). Eliminado allí; los
  acentos («Álbumes», «MÁS ESCUCHADAS») ya no heredan esa transformación.
- **M4 — Asa de arrastre pequeña.** Amplada de 34×40 a 40×44 px.
- **M5 — Buscador sin nombre accesible.** `#searchInput` tiene ahora
  `aria-label` localizado («Buscar», `data-i18n-aria="search_title"`).

**Tratado con aviso (sin modal)**

- **A6 — La copia no avisa de que falta el audio.** No se añadió el modal
  previo que sugería el informe (evita fricción en un flujo que ya tiene su
  pantalla), pero el aviso Visible en Ajustes (`settings_export_hint`, ×8) y su
  fallback en el HTML dicen ahora expresamente que las canciones **no viajan**
  en la copia y que habrá que importarlas también en el otro dispositivo.

**Sin acción**

- **I1 — Service Worker / funcionamiento sin conexión.** La app es una WebXDC:
  Delta Chat sirve los archivos localmente dentro del paquete; no hay red que
  cachear ni manifiesto que instalar. Se queda fuera de alcance salvo petición
  expresa.

**Hallazgo extra durante la regresión (no estaba en el informe)**

- `drawCover()` leía `track.cover.dataURL` sin proteger. Las pistas
  restauradas de una copia traen `coverIsImage` pero no el campo `cover` (el
  backup no lo exporta): al abrir el reproductor con una de ellas sonando, la
  vista reventaba con un TypeError. Ahora se usa la miniatura disponible y, si
  no hay imagen dibujable, se cae al gradiente generado.

Verificación: nueva regresión específica del informe **21/21** (CSS de
A1/A5/M3/M4 inspeccionado, un solo salto con el slider enfocado, stepper de
Ajustes sincronizado con límites, aria de bienvenida y EQ en ES/EN, M2 y M1,
0 errores), regresión general reconstruida **9/9** (doble arranque, búsqueda
con singular, arrastre de cola, copia v2, letra .lrc automática y portada con
repaint usando la pista en curso), diccionario **403 claves ×8 sin huecos**.
Todo repetido sobre el `.xdc` extraído: idéntico resultado.

**Pendiente del usuario**: probar en su dispositivo (Delta Android/Desktop/iOS):
velocidad desde Ajustes sin abrir Letras, slider sin doble salto, tema claro en
la bienvenida, arrastrar la cola y el 🔒 de persistencia en sesiones largas.

## 33. Loop AAA por dimensiones (alcance: personal y local)

Decisión de producto que gobierna esta evaluación: Aurora es un reproductor
**personal y local** dentro del chat — biblioteca desde el dispositivo, sin
sincronización en tiempo real ni cola compartida (descartada expresamente por
consumo de datos). La dimensión 5 de la rúbrica queda por tanto como **N/A
justificado**: no hay updates que enviar, con lo que el riesgo de spam al chat
es cero por construcción; `sendToChat` solo actúa cuando el usuario comparte
algo a mano.

### Iteración 1 — metadatos, sesión y corruptos

Evaluación inicial severa (auditoría de código): UX 8 · Audio 8 · Archivos 7 ·
Cola local 8 · Sync N/A · Persistencia 7 · Rendimiento/tamaño 8 · Robustez 7 ·
Integración 8 · Originalidad 9.

Top 3 gaps y correcciones:

1. **La duración real nunca se pedía.** `probeDuration()` existía sin un solo
   llamador: toda canción importada nacía con `duration: 0` y la biblioteca
   mostraba 0:00 hasta reproducirla. Ahora se sondea en paralelo con las
   etiquetas (timeout de 4 s, un archivo corrupto devuelve 0 y no retiene la
   importación).
2. **La restauración de sesión era frágil en tres puntos.** (a) Deduplicaba
   la cola, aunque una cola puede contener la misma canción dos veces de
   forma legítima: al reabrir cambiaba lo que iba a sonar; ahora solo se
   filtran ids inexistentes. (b) Con duplicados, `queueIdx` se recalculaba a
   la primera copia; ahora se respeta el índice guardado si apunta a la pista
   actual. (c) Asignaba `currentTrack.src` a ciegas: una pista restaurada de
   una copia (sin blob) convertía el `<audio>` a la URL literal «undefined»;
   ahora la URL se resuelve con `getTrackUrl()` y, si no hay audio enlazado,
   el elemento queda limpio. Además, `saveSession()` escribe un **espejo
   síncrono en localStorage**: al cerrar la WebView, la escritura asíncrona
   en IndexedDB puede no completarse, y al restaurar gana la foto con mayor
   `ts`. Las colas se guardan como copia, no como referencia viva.
3. **Tres archivos corruptos seguidos paraban la música** aunque la cuarta
   canción fuera válida, con un toast por archivo. Nueva política única
   (`_handleDecodeFailure()`, compartida por el evento `error` y por el
   rechazo de `play()`): se recorre la cola una vez antes de rendirse, se
   avisa solo al primer fallo y al abandonar, y el contador se reinicia en
   cuanto algo suena. El evento `error` sin fuente (vaciar el elemento al
   borrar la pista actual) ya no cuenta como corrupción ni salta canciones.

Tras la iteración: Audio 9 · Cola local 9 · Persistencia 9 · Robustez 9.

### Iteración 2 — Vorbis Comment (FLAC/OGG/Opus)

El único gap que quedaba por debajo de 9 era Archivos (7): jsmediatags cubre
ID3/MP4, pero FLAC, OGG y Opus guardan sus metadatos como **Vorbis Comment**
y esas canciones quedaban con el nombre del archivo por título.

Se añadió un lector propio sin dependencias (`readVorbisTags`): bloques de
metadatos FLAC (tipo 4 = comentario, tipo 6 = portada) y reconstrucción de
paquetes Ogg uniendo segmentos de página (cabeceras `\x03vorbis` y
`OpusTags`), con lectura limitada al primer MB y lectura binaria vía
FileReader (compatible con WebViews sin `Blob.arrayBuffer()`). Rellena
título, artista, álbum y portada solo donde falten, sin pisar un ID3 válido.

Tras la iteración: Archivos 9.

### Evaluación final del loop (auditoría de código)

| Dimensión | Nota | Nota |
|---|---|---|
| 1 UX/UI en sandbox móvil | 9 | Áreas seguras, 100dvh, objetivos ≥44 px, listas virtualizadas |
| 2 Motor de audio web | 9 | Buffering Visible, gapless/crossfade, política de corruptos de una pasada |
| 3 Gestión de archivos | 9 | ID3/MP4 + Vorbis, duración sondeada, duplicados O(1), .lrc y M3U |
| 4 Cola/playlists (local) | 9 | Duplicados legítimos preservados también tras reabrir |
| 5 Sincronización de playback | N/A | Fuera de alcance por decisión expresa; cero updates |
| 6 Persistencia local | 9 | IndexedDB + espejo síncrono, restauración sin URLs inválidas |
| 7 Rendimiento y tamaño | 9 | 339 KB el .xdc; estrés con 5.000 pistas ya optimizado |
| 8 Robustez | 9 | Corruptos, sin-fuente, cierre inesperado, cuota y reenlace |
| 9 Integración con el chat | 9 | Sin spam posible; compartir solo a petición del usuario |
| 10 Originalidad | 9 | Letras sincronizadas, EQ, copia portable, portadas, stats |

Verificación: regresión nueva **12/12** (FLAC y OGG sintéticos con metadatos
Vorbis y duración, sesión con duplicados y posición exacta, pista sin audio
sin «undefined», tres corruptos seguidos llegando a la canción válida, un
solo aviso, error sin fuente inocuo, 0 errores), diccionario **403×8** y todo
repetido sobre el `.xdc` extraído (339,2 KB, sha256 `1668fc92…`).

**Límite honesto**: las notas son de auditoría de código y banco jsdom. La
prueba en el dispositivo real del usuario (Delta Android/Desktop/iOS:
importar FLAC/OGG reales, cerrar la app a mitad de canción y reabrir,
encadenar archivos corruptos) sigue pendiente y es la única vía de subir a
10; ningún 10 se declara sin ella.

## 34. El resaltado de la navegación se quedaba en «Inicio» (reporte con capturas)

**Síntoma** (capturas del usuario en Delta Android): estando en Favoritos,
Buscar o Biblioteca, la pestaña resaltada abajo seguía siendo «Inicio».

**Causa raíz**: `goNav()` marcaba la pestaña nueva **antes** de cerrar las
anteriores. Al cerrar la pestaña previa, `closeSheet()` ejecutaba su regla
«si no queda ninguna pestaña abierta, vuelve a Inicio» y borraba el
resaltado recién puesto; la pestaña nueva se abría después sin volver a
marcar. Desde Inicio (sin pestaña abierta) sí funcionaba, por eso el fallo
solo aparecía al saltar **entre** pestañas — exactamente lo capturado.

**Corrección**:
- `goNav()` aplica `setNavActive(nav)` al final, tras cerrar y abrir.
- `openSheet()` refuerza el invariante: abrir Biblioteca/Buscar/Favoritos
  activa su botón, lo abra el camino que lo abra.
- De paso, `setNavActive()` ahora también pone `aria-current="page"`:
  el lector de pantalla anuncia la pestaña actual igual que el ojo la ve.
- El comportamiento querido se conserva: cerrar una pestaña con la X
  devuelve el resaltado a Inicio (cubierto por la regresión).

Verificación: regresión específica escrita antes de corregir (5 ok / 4 fail,
fallando justo los saltos entre pestañas) y **9/9** tras la corrección;
regresión AAA 12/12 e i18n 403×8, todo repetido sobre el `.xdc` extraído
(339,6 KB, sha256 `79ba0c22…`).

## 35. Dentro de la lista: mismo contenido, menos ruido (petición del usuario)

El usuario aceptó la interfaz en general pero los botones de dentro de
las listas «aún no le convencían». Preguntado, acotó: **el conjunto
entero** (cabecera, fila de acciones y controles por pista) y la
dirección **discreta**: conservar todo, bajando el volumen visual.

Cambios, solo de pintura y acotados al editor de lista
(`#sheetEditPlaylist` / `#editPlaylistTracks`), sin tocar
funcionalidad ni otras pantallas que reutilizan las clases:

- La portada y el botón hero de reproducir pierden la mitad de su
  sombra; el anillo de «esta lista está sonando» se mantiene.
- Las pastillas de acción (Subir, Renombrar, Compartir, Vaciar,
  Eliminar) pasan a fondo transparente, texto e icono en gris
  `--text-3` y peso 500: ya no compiten con el botón de reproducir.
- **Sin rojo permanente**: Vaciar, Eliminar y el ✕ de cada pista son
  neutros en reposo, al pasar el ratón y al tocarlos. El rojo queda
  donde protege de verdad, en el diálogo de confirmación, que no ha
  cambiado.
- Los controles por pista (asa, ⋯, ✕) quedan en voz baja: icono de
  15 px, sin fondos teñidos; el asa conserva sus 40×44 táctiles.

Verificación: como es solo CSS, lo que se comprueba es la cascada
(especificidad con `#sheetEditPlaylist` por encima de las reglas
anteriores, incluidos los `:hover` genéricos que teñían de rojo) y que
nada funcional se rompió: navegación 9/9, AAA 12/12 e i18n 403×8 en
repo y en el `.xdc` extraído (340,1 KB, sha256 `baad97f5…`). El juicio
visual final es del usuario en su dispositivo.

## 36. Barra de Letras uniforme (petición del usuario)

El usuario pidió para los botones de Letras el mismo tratamiento que
convenció en las listas: el problema aquí no era el peso sino la
**uniformidad**. Medido en el CSS, dentro de una sola barra convivían
botones de 36 px (tamaño de letra, bucle, acciones), de 30 px (desfase
y velocidad), el −/+ del desfase dibujado como texto y el de velocidad
como icono SVG, y los valores «0.0s» y «1.0×» con dos tipografías y
anchos distintos.

Corrección (CSS al final de `styles.css`, acotado a `.lyrics-toolbar`,
más un cambio de HTML):

- Una sola caja: todos los botones de la barra miden 36 px de alto
  (34 px en pantallas de ≤360 px), con el mismo radio de pastilla.
- El grupo de desfase adopta el mismo relleno (3 px) y separación que
  los demás grupos; su etiqueta conserva aire a la izquierda.
- El −/+ del desfase pasa de carácter de texto a icono SVG
  (`#i-minus`/`#i-plus`), idéntico al de velocidad.
- Los valores entre − y + (`0.0s`, `1.0×`) comparten fuente, peso,
  ancho mínimo de 40 px y números tabulares: ninguno «salta» al
  cambiar.
- Sin cambios de comportamiento: A−/A+ siguen siendo texto a dos
  tamaños (es su significado), el bucle activo sigue en acento y los
  botones deshabilitados en los extremos de velocidad, igual.

Verificación: regresión específica **9/9** (iconos presentes, regla
de altura única, velocidad/desfase/A+ funcionales, 0 errores),
navegación 9/9, AAA 12/12 e i18n 403×8, todo repetido sobre el
`.xdc` extraído (340,5 KB, sha256 `9a465075…`). El juicio visual,
como en la §35, es del usuario en su dispositivo.

## 37. «Reproducir Todo» de Favoritos, en la misma familia (petición del usuario)

El botón de Favoritos era el último rincón con la pintura antigua:
una banda a todo ancho con el degradado y el resplandor del
`.primary-btn` genérico (0 10px 30px al 35 %), mientras el resto de
la app ya iba plano y sereno (hero de listas, pastillas discretas,
barra de Letras uniforme).

Pasada, en la misma línea de las §35–36:

- Clase propia `.fav-play-all`: relleno **plano** `--accent-fill` (sin
  degradado), sombra suave (0 6px 16px al 22 %, como el hero),
  radio de pastilla, 48 px de alto táctil. Sigue siendo claramente LA
  acción principal de la pestaña, pero ya no grita más que la música.
- **Se oculta cuando no hay favoritos**: antes quedaba sobre el
  estado vacío invitando a reproducir una lista inexistente.
- **Anillo `is-playing`** cuando Favoritos es la lista que suena, el
  mismo lenguaje que el botón hero de las listas.
- El `.primary-btn` con degradado no desaparece: queda para altas y
  diálogos de confirmación, donde ese peso sí ayuda.

Verificación: regresión específica **9/9** (clase y pintura plana,
oculto sin favoritos, visible con ellos, anillo al sonar y no en
pausa, clic que reproduce con 0 errores), Letras 9/9, navegación 9/9,
AAA 12/12 e i18n 403×8, repetido sobre el `.xdc` extraído (341,0 KB,
sha256 `d52996b5…`).

## 38. Vuelve «Mi Música» automática + contexto real desde Buscar (petición del usuario)

Dos peticiones del usuario en un mismo mensaje:

**1. «Mi Música» como lista automática.** Las canciones que se
agregan sin haber creado una lista iban solo a Todas las canciones.
El usuario revierte expresamente la retirada anterior de esta lista:
ahora existe de nuevo como lista automática de la casa (id fijo
`mi-musica`, primera entre las listas):

- Al arrancar, si hay biblioteca y no existe, se crea con todas las
  pistas (no se guarda la procedencia histórica de cada una).
- Al importar sin lista destino, las canciones nuevas (y las
  duplicadas/re-enlazadas en esa misma importación) entran en ella.
  Importar desde la pantalla de una lista solo alimenta esa lista.
- Como cualquier lista, solo agrupa: quitar una canción de «Mi
  Música» no la borra de la biblioteca, y la lista se puede borrar;
  al hacerlo queda la marca `aurora_mimusica_removed` para que el
  arranque no la resucite — solo vuelve cuando se agregue otra
  canción fuera de una lista. Deshacer el borrado retira la marca.
- La copia de seguridad la sigue ignorando como lista: el arranque
  la reconstruye con la biblioteca restaurada.

**2. «Reproduciendo desde…» mentía desde Buscar.** Todas las
canciones elegidas en Buscar salían con contexto «Todas las
canciones» aunque vivieran en una lista (y la cola era la biblioteca
entera). Nuevo `searchPlayContextFor()`: manda la lista de la
canción — primero las listas del usuario, después «Mi Música» y
solo si no está en ninguna, Todas las canciones —. No es cosmético:
la cola pasa a ser esa lista, así que siguiente/anterior y la
etiqueta cuentan lo mismo.

Verificación: regresión específica **15/15** (creación al arrancar
y primera posición, importación suelta dentro, importación a lista
fuera, borrado respetado y reconstrucción, las tres prioridades de
contexto y el extremo a extremo buscar→reproducir con cola y
etiqueta «desde Rock», 0 errores), Favoritos 9/9, Letras 9/9,
navegación 9/9, AAA 12/12 e i18n 403×8, repetido sobre el `.xdc`
extraído (342,3 KB, sha256 `b721dd93…`).

## 39. Barrida de pequeños detalles (petición del usuario)

El usuario pidió buscar «otros pequeños detalles como los arreglados
hasta ahora». Barrida por ejes (contextos que mienten, pintura fuera
de familia, textos sin traducir, contadores, objetivos táctiles) con
estos hallazgos reales — todo lo demás salió limpio: 78 aria-labels
con su clave i18n (salvo el nombre de la app), ningún literal en
español fuera del diccionario, ningún plural sin singular y la
duración desconocida ya pintaba «—», no «0:00»:

1. **El «Todas las canciones» forzado tenía tres focos más** tras el
   de Buscar (§38): «Reproducir ahora» y «Reproducir a continuación»
   del menú de pista, las tarjetas de canción de Inicio y las filas
   del Historial. El resolvedor se generaliza a
   `trackPlayContextFor()` (queda alias del nombre viejo) y los tres
   focos lo usan: manda la lista de la canción en cualquier puerta.
2. **Anillos «está sonando» desactualizados**: el hero de la lista
   abierta y el «Reproducir Todo» de Favoritos se pintan al
   renderizar; pausar desde el mini-reproductor con la hoja abierta
   los dejaba encendidos. `updatePlayUI()` los re-sincroniza en cada
   play/pausa.
3. **Etiqueta con el nombre del día del play**: «Reproduciendo
   desde…» usaba el nombre guardado en el contexto; renombrar la
   lista que suena no se reflejaba. Ahora se resuelve por id al
   pintar.
4. **Botón de quitar el bucle de Letras a 24×24 px**, por debajo de
   todo lo demás: sube a 32×32.

Verificación: regresión específica **6/6** (menú de pista hacia su
lista, anillo que se enciende y se apaga sin re-render, etiqueta tras
renombrar, regla CSS del bucle, 0 errores) y la batería completa en
verde (Mi Música 15/15, Favoritos 9/9, Letras 9/9, navegación 9/9,
AAA 12/12, i18n 403×8), repetida la específica sobre el `.xdc`
extraído (343,1 KB, sha256 `7dcccd72…`).

## 40. El fondo difuminado vive solo en la zona superior (petición y consulta del usuario)

El usuario pidió que el fondo difuminado del reproductor ocupara
«desde la parte superior hasta antes de la barra de progreso», y
pidió opinión sobre si era buena idea o era mejor no hacer nada.

**Opinión dada**: buena idea con dos condiciones — que el límite sea
una disolución y no una pared (la barra de progreso no cae al mismo
píxel en todas las pantallas, porque la sección de la portada
flexiona con el alto) y que título/artista queden sobre la parte ya
disuelta para no perder legibilidad. El ambiente actual cubría la
vista entera y se disolvía al 95 %, ensuciando de color la zona de
controles sin aportar nada allí.

**Hecho** (solo CSS, acotado a `#viewPlayer`; Letras conserva el
suyo): el contenedor `.bg-blur` pasa de ocupar toda la vista al
60 % superior, y su velo disuelve a `--bg-0` al 97 %, de modo que el
ambiente muere justo al llegar a la barra de progreso y la zona de
controles queda sobre el fondo limpio de siempre. Sin JS, sin DOM y
sin tocar el rendimiento (el mismo blur de antes, en menos área).

Se descartó por ahora la variante «portada real difuminada como
imagen de fondo»: es el siguiente escalón visual posible, pero mete
imagen tras el título (legibilidad) y coste de repintado; la rampa
de colores de la portada ya da el mismo ambiente sin esos riesgos.
Si el usuario la quiere, se hace como opción aparte.

Verificación: como es solo CSS, la batería funcional es la red de
regresiones habitual (detalles 6/6, Mi Música 15/15, navegación 9/9,
AAA 12/12, i18n 403×8) en repo y detalles 6/6 sobre el `.xdc`
extraído (343,5 KB, sha256 `f439cbd9…`). El juicio visual final es
del usuario en su dispositivo.

## 41. Segunda barrida con lupa (todas las áreas)

Auditoría por referencias cruzadas (iconos, i18n, IDs, etiquetas) más
lectura de código. **Cinco imperfecciones reales**, todas corregidas:

### 41.1 «Reproduciendo desde Iniciar radio»
La etiqueta de contexto reutilizaba la clave del botón de menú
`ctx_start_radio` («Iniciar radio», verbo): el reproductor anunciaba
«Reproduciendo desde Iniciar radio». Nueva clave sustantiva
`radio_label` («Radio» y equivalentes en los 8 idiomas; diccionario
404 claves × 8).

### 41.2 `fmtTime` desbordaba los minutos a partir de una hora
Una pista de 90 minutos mostraba «90:00». Ahora `h:mm:ss` desde los
3600 segundos; por debajo, `m:ss` intacto. Afecta a los tiempos del
reproductor y a las filas (`fmtRowDuration`).

### 41.3 Estadísticas reproducía sin contexto
El clic en «Canciones más escuchadas» llamaba a `playTrack(tid)` sin
contexto: la cola pasaba a ser toda la biblioteca conservando la
etiqueta del contexto anterior. Ahora usa `trackPlayContextFor()`
(§39): la canción suena desde su lista.

### 41.4 Contraste de `.lt-btn.emphasis`
Blanco sobre `--accent` (≈3,9:1). Pasa al par de relleno seguro
`--accent-fill`/`--accent-on-fill` (≥4,5:1 garantizado), el mismo de
la barra de Letras y del botón de Favoritos.

### 41.5 Dos símbolos de icono muertos
`i-backward` e `i-font` definidos en el sprite y jamás usados,
retirados. Verificado antes de tocar: `i-volume-xmark` NO era muerto
(se invoca dinámicamente por nombre en `_updateVolumeIcon()`) y se
conserva.

**Verificado limpio en esta pasada** (sin cambios): referencias de
iconos (ninguna usada-sin-definir), claves i18n invocadas sin definir
(solo falsos positivos de `createElement`), IDs (sin duplicados;
todos los buscados existen en HTML o se crean dinámicamente),
hojas (las 23 con cierre), Escape global, progreso con
`aria-valuenow`/`valuetext`, textos de error sin literales en español
fuera de i18n, singular/plural de conteos, duración 0 como «—».

**Verificación**: regresión específica 10/10 (radio, fmtTime,
estadísticas, emphasis, integridad de iconos, 0 errores); batería
completa en verde (detalles 6/6, mimusica 15/15, fav 9/9, letras 9/9,
nav 9/9, AAA 12/12, i18n 404×8); `.xdc` reconstruido y revalidado
sobre la copia extraída.

## Cierre de la sesión §41

| Check | Resultado |
|---|---|
| Etiqueta «Reproduciendo desde Radio» + fmtTime h:mm:ss + estadísticas con contexto + contraste emphasis + sprite sin muertos | ✅ |
| Batería completa (mimusica 15/15, AAA 12/12, nav 9/9, letras 9/9, fav 9/9, detalles 6/6, i18n 404×8) | ✅ |
| `.xdc` válido (343,8 KB, sha256 `a6ca85fe…`) + regresiones sobre extraído | ✅ |

## 42. Selector de archivos integrado de Delta Chat (`webxdc.importFiles`)

La única funcionalidad webxdc desaprovechada que encaja con el
criterio vigente (sin red, gasto cero): en Delta Chat nativo, escoger
archivos con el selector del propio Delta en vez de salir al
explorador del sistema.

**Diseño** — un ayudante central, `pickFilesWebxdc(filter)` en
`js/library.js`, con contrato estricto:

- Devuelve un **array** (aunque vacío): el selector nativo se usó.
  Vacío = el usuario canceló, y **no** se abre el `<input>` detrás
  (sería lanzarle un segundo selector tras cancelar).
- Devuelve **null**: la API no existe (navegador, stub, Delta antiguo
  sin `importFiles`) o lanzó un error → el llamador sigue con su
  `<input type="file">` de siempre, intacto.

**Conectado en los cinco selectores de la app**:

| Selector | Filtro nativo |
|---|---|
| Música (`openFilePicker`, sin modo carpeta) | extensiones de audio + `.lrc/.txt/.m3u/.m3u8`, múltiple |
| Importar lista (botón M3U) | `.m3u/.m3u8`, único |
| Copia de seguridad (`importLibrary`) | `.json`, único |
| Letra externa (`loadExternalLrc`) | `.lrc/.txt`, único |
| Portada personalizada (`pickCustomCover`) | imágenes, único |

El modo carpeta sigue con su `<input webkitdirectory>` (importFiles
no tiene equivalente; en Delta nativo ese modo ya se degradaba a
multiselección de archivos, que ahora pasa por el selector
integrado). Dos cuerpos de procesado que vivían dentro de handlers
de `change` se extrajeron sin cambiar su lógica para compartirlos
entre ambos caminos: `_importLibraryFromFile()` y
`_applyExternalLrc()`.

**Sin cambios** en el stub de navegador (`js/webxdc.js`): allí
`_isStub` hace que `pickFilesWebxdc` devuelva null y todo sigue como
antes. Sin tocar red ni datos: cero megas, como se decidió.

**Verificación**: regresión específica 16/16 (contrato del ayudante:
stub→null, nativo→archivos+filtro, error→null, cancelación→[];
importación de música de principio a fin sin crear `<input>`;
cancelación sin efectos; copia, letra, portada y botón M3U por el
camino nativo; respaldo creando el `<input>`; 0 errores). Batería
completa en verde (lupa 10/10, detalles 6/6, mimusica 15/15,
fav/letras/nav 9/9, AAA 12/12, i18n 404×8) y regresión repetida sobre
el `.xdc` extraído. El juicio final del selector real (Delta
Android/Desktop) es del usuario en su dispositivo.

## Cierre de la sesión §42

| Check | Resultado |
|---|---|
| `pickFilesWebxdc` + 5 selectores con camino nativo y respaldo | ✅ |
| Regresión importFiles 16/16 + batería completa | ✅ |
| `.xdc` válido (344,8 KB, sha256 `4bce7b82…`) + regresiones sobre extraído | ✅ |

## 43. Visualizador: ondas fluidas y espectro con peso

El visualizador funcionaba, pero con cuatro debilidades medibles.
Todo el trabajo está en `js/audio.js` (+8 px de alto en CSS).

### Funcional

1. **`fftSize` 256 → 2048** (1024 bins). La onda ya no se dibuja con
   128 muestras en zigzag, y el espectro tiene resolución para
   bandas de verdad. Buffer temporal propio (`_visTimeData`, fftSize
   muestras); antes la onda reusaba el buffer de frecuencias, de la
   mitad de largo.
2. **Bandas logarítmicas 35 Hz–16 kHz** (`_visLogBands`, cacheadas
   por barras/bins/sampleRate): la energía musical vive abajo y el
   muestreo lineal anterior dejaba los graves pegados al techo y
   los agudos muertos. Nivel por banda = máximo del rango con
   gamma 0,78 (levanta pasajes flojos sin saturar).
3. **Suavizado ataque/caída por tiempo real** (`_visStepBars`,
   coeficientes desde el dt entre frames, no por frame): ataque en
   ~42 ms, caída en ~175 ms. El parpadeo nervioso pasa a ser un
   espectro con inercia. El bucle ahora pasa el dt al dibujante.
4. **Marcas de pico** que aguantan y caen a 0,42/segundo, dibujadas
   en una sola pasada con un solo `fillStyle`.
5. **Nº de barras adaptable al ancho** (24–56 según el ancho CSS
   del canvas): ni columnas enanas ni láminas de 1 px.

### Visual

6. **Onda fluida de verdad** (`_visWavePoints` + trazo nuevo): se
   diezma el dominio temporal quedándose con la muestra de mayor
   amplitud de cada tramo (~64–140 puntos según ancho), se suaviza
   entre frames y se dibuja con curvas cuadráticas por puntos
   medios, en tres capas: halo ancho al 15 %, relleno suave hasta
   la línea central y trazo principal con extremos redondeados.
7. **Colores de la portada que suena**: los gradientes (onda y
   barras) nacen de `cover.from/cover.to` — la paleta dinámica que
   `renderCurrentTrack` ya calculaba «para el fondo y
   visualizador» sin que el visualizador la usara jamás. Sin paleta,
   el violeta/rosa clásico de respaldo. Cache de gradientes por
   modo + tamaño + paleta (sin recrear por frame, como antes).
8. La sección sube de 54 a 62 px (radio 14) para que barras y
   picos respiren; el coste lo absorbe el área flexible de la
   portada.

**Rendimiento**: se conserva todo lo que ya lo protegía (30 fps,
pausa fuera de pantalla con IntersectionObserver + `document.hidden`,
DPR ≤ 2, gradientes cacheados) y no se asigna memoria por frame
salvo los arrays cacheados que se reutilizan.

**Verificación**: regresión específica 19/19 — paleta y respaldo,
`_hexA`, bandas log crecientes y en rango, gamma en graves,
ataque ≈ mitad en 33 ms y caída más lenta, pico que aguanta y
acaba cayendo, diezmado de onda por máxima amplitud, dibujo
completo de ambos modos con un ctx registrador (rellenos, picos,
≥2 trazos, curvas, caché de gradientes), fftSize y CSS en el código,
0 errores. Batería completa en verde (importFiles 16/16, lupa
10/10, detalles 6/6, mimusica 15/15, fav/letras/nav 9/9, AAA 12/12,
i18n 404×8) y regresión repetida sobre el `.xdc` extraído. El
juicio visual final (fluidez percibida en hardware real) es del
usuario en su dispositivo.

## Cierre de la sesión §43

| Check | Resultado |
|---|---|
| FFT 2048 + bandas log + ataque/caída + picos + onda fluida + paleta de portada | ✅ |
| Regresión visualizador 19/19 + batería completa | ✅ |
| `.xdc` válido (347,5 KB, sha256 `84ff7774…`) + regresiones sobre extraído | ✅ |

## 44. Botones de «Todas las canciones»: la fórmula serena

Captura del usuario: la cabecera de la sección mezclaba cuatro
cajas distintas — «Reproducir Todo» como píldora de acento
desproporcionada, «Aleatorio» con borde, chips de orden a 36 px y
«Seleccionar» con borde discontinuo, más «Borrar todo» en rojo
permanente. Se les aplica la misma fórmula de la barra de Letras
(§36), el «Reproducir Todo» de Favoritos (§37) y los botones de
lista (§35), con un solo bloque CSS acotado a
`#sheetLibrary .lib-songs-sticky` (las clases base `.text-btn`,
`.lib-sort` y `.lib-batch-btn` se usan en más sitios y no se tocan):

- **Una caja de 40 px para todo el grupo** (Reproducir Todo,
  Aleatorio, chips de orden y Seleccionar): misma altura, mismo
  radio de píldora, misma fuente y peso; iconos a 16 px.
- **Un solo protagonista plano** en `--accent-fill`: «Reproducir
  Todo» y el chip de orden activo (y «Seleccionar» en su activo,
  con regla propia dentro del ámbito para que la genérica no lo
  tape por especificidad).
- **El resto, discreto**: superficie + borde sólido + texto, como
  el «Aleatorio» que ya estaba bien encaminado.
- **Adiós al borde discontinuo** de «Seleccionar» (no era familia
  de ningún otro control) y **«Borrar todo» pierde el rojo
  permanente**: queda como utilidad discreta; el rojo aparece al
  pulsar y en la confirmación, que ya existía.

Solo presentación: ningún handler, clase funcional ni texto
cambia (la regresión de abajo pulsa los cinco botones reales).

**Verificación**: regresión específica 10/10 (las cinco reglas CSS
de la fórmula + Reproducir Todo/Aleatorio/Borrar todo vivos, chip
de orden que mueve el activo, «Seleccionar» que entra y sale del
modo con `aria-pressed`, 0 errores). Batería completa en verde
(visualizador 19/19, importFiles 16/16, lupa 10/10, detalles 6/6,
mimusica 15/15, fav/letras/nav 9/9, AAA 12/12, i18n 404×8) y
regresión repetida sobre el `.xdc` extraído. El juicio visual
final es del usuario en su dispositivo.

## Cierre de la sesión §44

| Check | Resultado |
|---|---|
| Cabecera de «Todas las canciones» con la fórmula serena (caja única 40 px, un acento, sin discontinuos ni rojo permanente) | ✅ |
| Regresión cabecera 10/10 + batería completa | ✅ |
| `.xdc` válido (348,2 KB, sha256 `9cc4a4ec…`) + regresiones sobre extraído | ✅ |

## 45. Fuera el botón «Seleccionar» de «Todas las canciones»

Petición del usuario: el botón solo estorba. Se elimina **el
botón**, no la función: la selección múltiple conserva su otra
entrada natural — **pulsación larga sobre cualquier canción**
(0,52 s, ya existía en `wireTrackLongPress`) — que entra en el
modo, marca esa canción y muestra la barra de lote con todas sus
acciones (editar etiquetas, añadir a lista, eliminar, seleccionar
todo, cancelar).

**Limpieza completa de referencias** (nada de botón fantasma):

- `index.html`: botón fuera; el comentario de la cabecera fija
  ahora dice cómo se entra en el modo.
- `js/events.js`: binding del botón fuera.
- `js/nav.js`: `updateBatchUI()` ya no sincroniza clase ni
  `aria-pressed` de un elemento inexistente.
- `js/data.js`: clave huérfana `batch_select` fuera (diccionario:
  403 claves × 8, sin huecos).
- `css/styles.css`: clase `.lib-batch-btn` eliminada entera (base,
  regla de la fila de ordenación y las menciones en el bloque §44,
  que queda vigente para los botones que sí quedan: caja de 40 px,
  «Borrar todo» discreto).

**Hallazgo al hacer hueco**: el «Cancelar selección» de la barra
de lote llevaba un `data-close-sheet="sheetLibrary"` heredado, así
que cancelar la selección **cerraba la biblioteca entera**. Sin el
botón de la cabecera, ese botón pasa a ser la única salida visible
del modo: se le quita el atributo y ahora hace solo lo que su
etiqueta promete (verificado por regresión).

Los chips de orden ganan el ancho que ocupaba el botón; la fila
ahora respira a todo lo ancho.

**Verificación**: regresión específica 18/18 (cero referencias al
botón en HTML/CSS/JS/i18n; fórmula §44 intacta en lo que queda;
pulsación larga real con `mousedown` + 720 ms que entra en el modo
y selecciona la pista; barra visible con contador; «Cancelar
selección» que sale y limpia sin cerrar; Reproducir Todo/Aleatorio
y chips vivos; 0 errores). La regresión §44 queda superada por
esta (sus dos asertos del botón ya no aplican). Batería completa
en verde (visualizador 19/19, importFiles 16/16, lupa 10/10,
detalles 6/6, mimusica 15/15, fav/letras/nav 9/9, AAA 12/12, i18n
403×8) y regresión repetida sobre el `.xdc` extraído.

## Cierre de la sesión §45

| Check | Resultado |
|---|---|
| Botón «Seleccionar» eliminado sin referencias colgantes; lote por pulsación larga intacto | ✅ |
| «Cancelar selección» ya no cierra la biblioteca | ✅ |
| Regresión sinselect 18/18 + batería completa | ✅ |
| `.xdc` válido (347,9 KB, sha256 `098ebeed…`) + regresiones sobre extraído | ✅ |

## 46. «Mi Música» ya no se siembra con las canciones de otras listas

**Fallo reportado por el usuario**: al agregar una canción fuera de
una lista, si «Mi Música» no existía, nacía con **todas las
canciones de las demás listas** en lugar de solo con la agregada.
Causa exacta: `_ensureMiMusica()` recibía los ids de la
importación (`extraIds`) pero, en la rama de creación, los ignoraba
y sembraba con `this.tracks.map(t => t.id)` — en ese momento las
nuevas ya están en la biblioteca, así que entraba todo (§38).

**Corrección** (`js/init.js`):

1. **Crear desde una importación** (`_ensureMiMusica`): la lista
   nace SOLO con los ids de esa importación (deduplicados). Sin
   ids — importación sin frutos — no se materializa una lista
   vacía: devuelve `null`.
2. **Siembra al arrancar** (`migrateMiMusica`): el espejo del mismo
   error. Sin procedencia histórica guardada, «agregada fuera de
   una lista» solo puede reconstruirse como «canción que no vive
   en ninguna otra lista»: la siembra pasa a ser las canciones
   sueltas de la biblioteca, excluidas las que ya están en alguna
   lista del usuario. Si no hay sueltas, no nace vacía en el
   arranque; aparecerá con la primera importación suelta.
   Decisión documentada en el comentario del modelo: una canción
   que entró suelta y luego se organizó en una lista no puede
   distinguirse sin guardar procedencia; la regla observable es
   «en ninguna lista ⇒ suelta».
3. El comentario de la restauración de copia (`js/library.js`)
   quedó alineado («se reconstruye con las canciones restauradas
   que no quedaron en ninguna lista»).

**Lo que no se toca**: una «Mi Música» ya existente con la siembra
antigua no se poda automáticamente — podarla expulsaría también
canciones que entraron sueltas de verdad y después se organizaron
en una lista, indistinguibles sin procedencia. Quien la tenga
llena de todo puede borrarla: a partir de ahí, la próxima
canción suelta la recrea limpia (las demás siguen en «Todas las
canciones»; la lista solo agrupa, no se pierde música).

**Verificación**: regresión de «Mi Música» ampliada a 21/21 —
incluye el escenario reportado tal cual (lista del usuario con
canciones + importar fuera de lista ⇒ «Mi Música» nace con
exactamente la nueva), siembra de arranque solo con sueltas, no
nace vacía si todo está en listas, e importación sin frutos que
no crea nada; los 15 asertos anteriores compatibles siguen en
verde. Batería completa en verde (sinselect 18/18, visualizador
19/19, importFiles 16/16, lupa 10/10, detalles 6/6, fav/letras/nav
9/9, AAA 12/12, i18n 403×8) y regresión repetida sobre el `.xdc`
extraído.

## Cierre de la sesión §46

| Check | Resultado |
|---|---|
| «Mi Música» nace solo con la importación que la crea; arranque solo con sueltas | ✅ |
| Regresión mimusica 21/21 + batería completa | ✅ |
| `.xdc` válido (348,1 KB, sha256 `46471bf2…`) + regresiones sobre extraído | ✅ |

## 47. La Biblioteca es solo listas: fuera «Todas las canciones»

Petición del usuario: eliminar completamente la sección «Todas las
canciones» y dejar solo las playlists. La sección era la raíz de
varias piezas; quitarla «completamente» es quitar también lo que
solo vivía en ella, y así se ha hecho:

**Desaparece**:
- La sección entera del marcado (cabecera fija, «Reproducir Todo»,
  «Aleatorio», chips de ordenación y la lista virtual de canciones)
  y su botón «Borrar todo» de cabecera.
- `renderLibrary()` y sus 20 llamadas (la lista queda solo con
  `renderLibrarySections()` → `renderPlaylists()`), `playLibraryTracks()`,
  `sortedTracks()`, `setLibrarySort()` y el estado `_librarySort`,
  que además deja de viajar en la copia de seguridad (las copias
  viejas que lo traigan lo ignoran sin romper).
- **La selección/edición por lotes entera** (§45 ya había perdido
  su botón; su casa eran estas filas): barra de lote, hoja de
  edición por lote, las 9 funciones `toggleBatchMode`/
  `toggleTrackSelection`/`selectAllTracks`/`clearTrackSelection`/
  `updateBatchUI`/`openBatchEditModal`/`saveBatchEditTags`/
  `batchDeleteTracks`/`batchAddToPlaylist`, sus 8 bindings, las
  casillas en las filas (`makeTrackRow` ya no pinta checkbox ni
  clases de lote), el estado `_batchMode`/`_selectedTrackIds` y la
  rama de lote del selector de listas (la adición de una pista,
  intacta).
- CSS huérfano: `.lib-song-actions`, `.lib-sort*`, `.lib-songs-sticky`,
  `.batch-bar`, `.batch-act`, `.row-batch-check`, `.batch-checkbox`,
  `.track-row.selected/.batch-mode`, `.lib-empty-cta`, el bloque
  §44 entero (solo hablaba de esos botones) y las menciones en las
  listas de selectores compartidas y en el modo ancho.
- 19 claves i18n huérfanas (diccionario: **384 × 8**, sin huecos):
  la sección, las 4 de ordenación y toda la familia `batch_*` +
  `select_track`.

**Decisiones documentadas**:
- La pulsación larga sobre una fila ya no entra en el modo lote:
  abre el menú de la canción, que era su otro significado y el
  único coherente sin lista de biblioteca.
- **«Borrar toda la biblioteca» NO se elimina**: tenía una segunda
  puerta viva en el menú de Ajustes (`menuDeleteLibrary`), así que
  `deleteAllTracks()` se queda; solo muere su botón de la sección.
- Las canciones sin lista siguen alcanzables por Buscar, Inicio
  (recientes/top) y «Mi Música»; la re-vinculación vive en Ajustes
  y no dependía de la sección. Las regresiones `check-sinselect` y
  `check-libbtns` probaban la UI eliminada: jubiladas y sustituidas
  por `check-sololistas`.

**Verificación**: regresión específica 15/15 (marcado y CSS sin la
sección ni el lote; funciones ausentes y `deleteAllTracks`
presente; tarjetas pintadas; «Mi Música» solo con sueltas; filas
sin casilla que reproducen desde su lista; pulsación larga real
que abre el menú sin modo lote; importación suelta intacta;
borrar-todo cancelado que no toca nada; 0 errores). Batería
completa en verde (mimusica 21/21, visualizador 19/19, importFiles
16/16, lupa 10/10, detalles 6/6, fav/letras/nav 9/9, AAA 12/12,
i18n 384×8) y regresión repetida sobre el `.xdc` extraído (el
paquete adelgaza ~6 KB: 342,2 KB).

## Cierre de la sesión §47

| Check | Resultado |
|---|---|
| Sección «Todas las canciones» + lote + ordenación eliminados sin restos | ✅ |
| Biblioteca solo con listas; pulsación larga = menú de la canción | ✅ |
| Regresión sololistas 15/15 + batería completa | ✅ |
| `.xdc` válido (342,2 KB, sha256 `9a5ffe62…`) + regresiones sobre extraído | ✅ |

## 48. Botones del diálogo de confirmación: la misma caja serena

Captura del usuario (borrar «Mi Música»): «Cancelar» y «Delete»
como dos losas de media pantalla. Causa: ambos heredan el
`.primary-btn` global — ~52 px de alto, degradado y resplandor de
30 px pensado para botones de formulario — y el destructivo suma
una sombra roja de neón.

**Corrección** (solo CSS, en las reglas ya acotadas del propio
diálogo `.confirm-actions`; el botón primario de formularios, los
«Guardar» de las hojas, no se toca): la caja serena de siempre —
**44 px, forma de píldora, plana, sin sombras**, peso 600. Cancelar
queda en superficie con borde; confirmar en `--accent-fill`; y el
destructivo en rojo pelado `var(--danger)` sin resplandor (el
`:active` oscuro se conserva). Como la caja quedó plana, el
diálogo entero (icono, mensaje, acciones) recupera proporción.

**Verificación**: regresión específica 10/10 (las tres reglas CSS
de la caja + comportamiento real del diálogo: destructivo con
icono y clase `danger`, cancelar resuelve `false`, no destructivo
sin icono, aceptar resuelve `true`, aviso de un solo botón con
`hideCancel` que oculta y luego restaura el cancelar, 0 errores).
Batería completa en verde (sololistas 15/15, mimusica 21/21,
visualizador 19/19, importFiles 16/16, lupa 10/10, detalles 6/6,
fav/letras/nav 9/9, AAA 12/12, i18n 384×8) y regresión repetida
sobre el `.xdc` extraído.

## Cierre de la sesión §48

| Check | Resultado |
|---|---|
| Diálogo de confirmación con caja serena de 44 px (sin losas ni resplandor) | ✅ |
| Regresión confirm 10/10 + batería completa | ✅ |
| `.xdc` válido (342,5 KB, sha256 `65177baa…`) + regresiones sobre extraído | ✅ |

## 49. «Seguir escuchando» ya no ofrece la canción que está sonando

Reporte del usuario: en Inicio, la tarjeta «Seguir escuchando»
mostraba la canción incluso mientras se estaba reproduciendo —
no hay nada que «seguir» escuchando de lo que ya suena (la tarjeta
duplicaba al mini-reproductor sin aportar ni el «Retomar en…»).

**Corrección** (`js/nav.js`, `js/player-ui.js`, `css/styles.css`):

- La tarjeta nace con el atributo `hidden` cuando algo está
  sonando, y con `data-track` de la pista que muestra.
- `updatePlayUI()` — el punto único por el que pasa cada cambio de
  play/pausa — la conmuta sin repintar Inicio: suena → oculta,
  pausa → visible como «retomar». Nada de rebuilds ni parpadeos.
- Si la pista cambió con Inicio montado (avance automático), el
  `data-track` ya no coincide y ahí sí se repinta Inicio, para que
  al pausar no reaparezca la canción anterior.
- `.home-hero[hidden] { display: none }`: el `display:flex` de la
  tarjeta ganaba al `[hidden]` del navegador y la habría dejado
  visible pese al atributo.

Las otras secciones de Inicio no cambian: en «Añadidas
recientemente» y «Más escuchadas» la pista actual sigue saliendo
con su distintivo de ecualizador, que es lo correcto en una lista.

**Verificación**: regresión específica 8/8 (pausado visible,
sonando oculta vía `updatePlayUI`, pausa la devuelve, render en
reproducción que nace oculta, cambio de pista que se repinta a la
nueva, sin pista no hay tarjeta, regla CSS, 0 errores). Batería
completa en verde (sololistas 15/15, confirm 10/10, mimusica
21/21, visualizador 19/19, importFiles 16/16, lupa 10/10, detalles
6/6, fav/letras/nav 9/9, AAA 12/12, i18n 384×8) y regresión
repetida sobre el `.xdc` extraído.

## Cierre de la sesión §49

| Check | Resultado |
|---|---|
| «Seguir escuchando» oculto mientras suena y de vuelta al pausar | ✅ |
| Regresión hero 8/8 + batería completa | ✅ |
| `.xdc` válido (342,8 KB, sha256 `533982a9…`) + regresiones sobre extraído | ✅ |

## 50. Importar mucho, rápido: una decodificación por portada

Petición del usuario: optimizar la carga de un volumen grande de
canciones. Medido el pipeline (`processFiles` → `processOne` →
persistencia), los dos costes grandes por canción no eran la red
ni IndexedDB (una sola transacción por lote ya existía), sino el
trabajo repetido con las portadas:

1. **Tres decodificaciones por canción con portada**: la imagen
   incrustada se decodificaba entera para la copia de 600 px, OTRA
   vez para la de 256 y OTRA para la de 96 (`limitArtwork` +
   `resizeDataUrl` ×2, cada uno con su `Image` y su JPEG).
2. **Y por cada canción del álbum, lo mismo**: un disco de 12 temas
   trae la misma portada incrustada 12 veces → 36 decodificaciones
   de la misma imagen.
3. **Pool fijo de 3 trabajadores** aunque el hardware dé más.

**Optimizaciones** (`js/uploader.js`, sin cambiar formatos ni
calidades de salida):

- `_produceArtwork()`: de UNA decodificación (`_loadImage`, con
  tiempo límite de 8 s para que un WebView colgado no retenga la
  importación) salen las tres copias con los tamaños y calidades
  de siempre (600 JPEG 0.85, 256/96 cuadradas JPEG 0.72) y los
  mismos respaldos ante error.
- **Caché de portadas por lote** (`_artworkForPicture` +
  `_artworkKey`, huella = longitud + muestra de 512 bytes): la
  portada repetida se produce una sola vez por importación, y los
  trabajadores comparten hasta la promesa en curso (nada de
  decodificar lo mismo en paralelo). `limitArtwork`/`resizeDataUrl`
  se quedan para sus otros llamantes (portada personalizada).
- **Pool de 3–6 trabajadores** según `navigator.hardwareConcurrency`.
- **FLAC sin sondeo**: el bloque STREAMINFO ya trae frecuencia y
  nº de muestras; el lector Vorbis propio ahora devuelve también
  la duración exacta y `processOne` la usa sin crear el `<audio>`
  de sondeo (que sigue para MP3/M4A/OGG, con su timeout de 4 s:
  la duración al importar es una función querida, §33, y no se
  sacrifica por velocidad).

**Verificación**: regresión específica 14/14 (huella estable y
discriminante; las tres copias de una decodificación y sus
respaldos; álbum simulado: 2 canciones = 1 producción; processOne
completo; STREAMINFO sintético = 185 s exactos sin tocar el
sondeo; pool con concurrencia real ≥3, resultados en orden y
9×15 ms simulados muy por debajo del tiempo en serie; 0 errores).
Batería completa en verde (sololistas 15/15, hero 8/8, confirm
10/10, mimusica 21/21, visualizador 19/19, importFiles 16/16, lupa
10/10, detalles 6/6, fav/letras/nav 9/9, AAA 12/12, i18n 384×8) y
regresión repetida sobre el `.xdc` extraído. La ganancia percibida
depende del dispositivo y del tamaño de las portadas; la
estructural es la descrita (de ~3N decodificaciones a N, y a 1
por álbum en la práctica).

## Cierre de la sesión §50

| Check | Resultado |
|---|---|
| 1 decodificación por portada distinta + pool 3–6 + FLAC sin sondeo | ✅ |
| Regresión importperf 14/14 + batería completa | ✅ |
| `.xdc` válido (344,5 KB, sha256 `303c7477…`) + regresiones sobre extraído | ✅ |

---

## 51. Fuera importar .m3u/biblioteca, dentro copia de seguridad en Opciones y «Compartir lista» reparado

**Encargo:** (1) eliminar la importación de listas `.m3u` y la de biblioteca tal como existían; (2) crear en su lugar un sistema de copia de seguridad —exportar los datos hacia el chat e importarlos en otra versión/dispositivo— ubicado en el menú de opciones; (3) arreglar «Compartir lista» dentro de las listas, que no funcionaba correctamente.

### Por qué «Compartir lista» no funcionaba (la raíz)

No era el botón ni la lista: era `exportFile()`.

- Enviaba el texto como `file: { name, plainText }`. La forma que Delta Chat acepta de forma fiable hoy es `file: { name, blob }`; un cliente actual puede rechazar o ignorar el `plainText`.
- Peor: ese rechazo se tragaba dentro de la propia función (devolvía `false` y seguía), y **todos los llamantes enseñaban el toast de éxito sin mirar el resultado**. El usuario veía «Lista compartida» mientras en el chat no llegaba nada — de ahí el «no funciona correctamente»: no fallaba ruidosamente, mentía en silencio.

### Arreglo

- `exportFile()` envía siempre el archivo como **Blob** (el texto se envuelve con su MIME; un Blob de audio pasa tal cual) y devuelve `true` solo si `sendToChat` resolvió —o si en navegador la descarga se disparó—.
- Los cuatro llamantes miran ese booleano y avisan con honestidad: `exportPlaylist` («Compartir lista»), `exportLibrary` (la nueva copia), `shareTrack` (canción y respaldo de texto) y `exportCurrentLyrics` (letra). Éxito → toast de éxito; rechazo → toast de error en rojo. Se acabó el «compartido» falso.
- El stub webxdc de navegador ya prefería `blob`: compatible sin tocarlo.

### Sistema de copia de seguridad (menú Opciones)

- Nuevas filas en `#sheetMore` («Opciones»): **Exportar copia de seguridad**, **Importar copia de seguridad** y una pista breve, con iconos `i-file-export`/`i-file-import`. Cierran la hoja antes de actuar, como hace «Compartir canción en chat».
- Reutiliza los motores ya probados (`exportLibrary`/`importLibrary`, backup **v2** `aurora-backup-AAAA-MM-DD.json`): listas, favoritos, ajustes y punto de escucha; el audio no viaja —en el otro dispositivo se importan las canciones y se enlazan solas por título/artista/nombre de archivo—.
- Fuera de Ajustes las filas sueltas «Exportar biblioteca»/«Importar biblioteca» con su nota. `menuRelinkAudio` se queda (re-enlaza audio; no es la importación eliminada).
- La etiqueta del diálogo de bienvenida («restaurar») pasa a la clave nueva `backup_import`.
- La exportación de una lista como `.m3u8` (Compartir lista) **se conserva**: es formato para otros reproductores; el camino Aurora→Aurora es la copia JSON.

### Importación M3U eliminada por completo

- Fuera el botón `#btnImportM3u` de la cabecera de Biblioteca y su binding.
- Fuera `parseM3U`, `matchM3UEntries`, `importM3U`, `importM3UFile` de `playlist-edit.js` y la rama que desviaba `.m3u` en `handleFileInput`.
- El selector de archivos ya no admite `.m3u/.m3u8` (`queue.js`); un `.m3u` que llegue por otra vía se descarta como hasta ahora se descartaba cualquier no-audio.
- I18n podado (`m3u_import_btn`, `toast_m3u_imported`, `toast_m3u_none`, `toast_m3u_empty`, `imported_playlist_name`, `settings_export`, `settings_import`, `settings_export_hint`) y añadido (`backup_export`, `backup_import`, `backup_hint`): **379 claves × 8 idiomas, sin huecos**.

### Verificación

- Nuevo `check-backup.js`: **22/22** — estructura (copia en Opciones, nada en Ajustes, sin botón M3U), superficie eliminada (`importM3UFile`/`parseM3U`/`matchM3UEntries` ya no existen), raíz reparada (payload **Blob**, `false` honesto ante rechazo de Delta), toasts de compartir según el resultado real, la copia sale al chat como `aurora-backup-AAAA-MM-DD.json`, y el ciclo completo exportar→importar en «otro dispositivo» devuelve la lista.
- Checks veteranos actualizados a la nueva realidad: `sololistas` 15/15 e `importfiles` 15/15 verifican ahora también la ausencia del M3U. Resto de la batería en verde: hero 8, confirm 10, mimusica 21, visualizer 19, lupa 10, detalles 6, fav-btn 9, letras-btn 9, nav 9, aaa 12, importperf 14.
- `.xdc` reconstruido y válido: 28 archivos, 342,5 KB.


---

## 52. En Inicio, con la música en pausa, no se muestra el mini reproductor

**Encargo:** si la música está en pausa, el mini reproductor no debe aparecer en Inicio.

### Motivación

En Inicio, en pausa, el mini reproductor duplicaba al hero «Retomar en…» (§49): dos controles para lo mismo en la misma pantalla. En pausa, la pantalla de Inicio queda limpia y el hero es quien retoma; mientras suena, el mini sigue ofreciendo pausa/siguiente sin bajar a Now Playing.

### Implementación

- `updateChrome()` (nav.js) calcula si Inicio está «en primer plano»: `viewHome` activa **y** ninguna pestaña (Biblioteca, Buscar o Favoritos, que son hojas sobre Inicio) abierta encima. Solo en ese caso el mini depende de `isPlaying`:
  `showMini = … && !(onHome && !this.isPlaying)`.
  Fuera de Inicio el comportamiento no cambia: en Biblioteca/Buscar/Favoritos el mini sigue visible también en pausa, y se mantienen las reglas previas (nunca en Now Playing ni en Letras, nunca con un modal abierto, nunca sin pista actual ni en modo ancho).
- Los cambios de play/pausa no pasan por `updateChrome()`, solo por `updatePlayUI()`: pausar con el mini visible lo dejaba «congelado» en pantalla. Al final de `updatePlayUI()` (player-ui.js) se refresca ahora el chrome, de modo que pausar oculta el mini al instante y reanudar lo devuelve, sin navegar. Esto cubre también la pausa/reanudación desde Now Playing o desde el propio mini antes de que se oculte.

### Verificación

- Nuevo `check-minipausa.js`: **13/13** — Inicio en pausa sin mini; Inicio sonando con mini; pausar/reanudar sin navegar oculta/devuelve el mini al momento; Biblioteca en pausa conserva el mini (§52 es solo Inicio); volver a Inicio en pausa lo oculta; sin pista nunca hay mini; Now Playing sigue sin mini; el hero §49 y el mini se relevan (pausa: hero visible y mini oculto; sonando: al revés); con un modal abierto no hay mini y al cerrarlo vuelve. Cero errores de consola.
- Nota de infraestructura: `/tmp` se había perdido entre sesiones; el arnés (jsdom + fake-indexeddb) se reconstruyó con stubs de canvas/viewport de teléfono. La batería histórica completa quedó verde en §51 sobre este mismo HEAD base.
- `.xdc` reconstruido y válido para Delta Chat.

---

## 53. Nada de lo que envía al chat funcionaba: el `webxdc.js` propio tapaba la API de Delta

**Reporte:** ningún envío al chat funciona — compartir lista, compartir canción, exportar la copia de seguridad, exportar letra… todos «hacen algo» (incluso enseñaban el toast de éxito) pero al chat no llega nada.

### Causa raíz (confirmada contra la especificación oficial)

La spec webxdc (`webxdc/webxdc_docs`, `src/spec/README.md`) dice dos cosas:

1. «Para activar la API webxdc hay que referenciar `webxdc.js`»: `<script src="webxdc.js"></script>` — la sirve el mensajero para esa ruta exacta.
2. «**`webxdc.js` must not be added to your `.xdc` file as they are provided by the messenger.**»

Aurora hacía exactamente lo contrario desde la reorganización del repositorio (commit `6546dac`, «JS en `js/`»): `index.html` cargaba `js/webxdc.js`, un stub propio pensado para navegador. Delta **no reemplaza** ese archivo (solo sirve el suyo para la ruta `webxdc.js`), así que dentro de Delta se ejecutaba el stub: su `sendToChat` «envía» descargando con un `<a download>`, que en el WebView de Delta no hace nada; la promesa se resuelve y la app creía haber compartido. Por eso el §51 (payload Blob + toasts honestos) no podía arreglarlo: el problema no era el formato del mensaje, era que **el mensajero nunca llegaba a verlo**. La misma causa dejaba `importFiles` sin API nativa (caía siempre al respaldo `<input>`).

### Arreglo (según la spec)

- `index.html`: la referencia pasa a la ruta exacta `<script src="webxdc.js"></script>`, como primer script. Delta inyecta ahí su API real (`sendToChat`, `importFiles`, `sendUpdate`…).
- Eliminado `js/webxdc.js` del repo: ningún `webxdc.js` viaja ya en el paquete. En navegador la referencia simplemente no resuelve y los respaldos toman el relevo: `exportFile` descarga el archivo (su propio fallback), `pickFilesWebxdc` devuelve `null` → selector `<input>`. Todas las comprobaciones `window.webxdc` de la app ya toleraban su ausencia.
- `exportFile()`: simplificado el manejo de errores — sin stub propio, un rechazo de `sendToChat` es «no enviado» y se avisa, como dicta la spec («In case of errors… the promise will be rejected»).
- `build-xdc.py` hace cumplir la regla para siempre: la referencia `webxdc.js` queda exenta del control de «referenciado pero no está en el paquete» (la sirve el mensajero) y **el build falla si cualquier archivo llamado `webxdc.js` intenta viajar en el .xdc**. README actualizado en la misma dirección.

### Verificación

- Nuevo `check-chat.js`: **14/14** — forma del paquete (referencia exacta y primer script; sin `webxdc.js` en raíz ni en `js/`); simulando al mensajero (API nativa inyectada antes de cargar la app): la app no la sobrescribe, compartir lista / copia de seguridad / canción llegan a `sendToChat` con su Blob, e importar la copia usa `importFiles` nativo y la aplica; en modo navegador, sin API, descargan los respaldos y `pickFilesWebxdc` devuelve `null`. Cero errores en ambos modos.
- §52 sigue en verde (13/13) con el arnés ya sin stub, y el empaquetador demuestra el guardián: con un `js/webxdc.js` infiltrado el build falla con el motivo; sin él, OK.
- `.xdc` reconstruido: **27 archivos, 342,0 KB**, sin ningún `webxdc.js`; sha256 `cbf966d34a39092869173164d46a2c9b2c43f521d55e3fbb14128e155e00722c`.
- Lo que no puede probarse aquí: el diálogo real de Delta al enviar (depende del mensajero en el dispositivo). Al probarlo: compartir una lista debe abrir el selector de chat de Delta y dejar el `.m3u8` como borrador/mensaje en el chat elegido.

---

## 54. Importar la copia en una versión nueva: la restauración sale del callejón del Reproductor

**Pregunta del usuario:** «¿Cómo importar un backup en una versión nueva si la opción está solo en el menú opciones del reproductor?».

### El problema (tenía razón)

«Opciones» (`sheetMore`) solo se abría desde el ⋮ del Reproductor y desde Letras — ambos exigen una canción abierta. En una versión recién instalada (biblioteca vacía, sin pista) ese camino no existe: para restaurar la copia que trae tus listas había que cargar música primero. Era el mismo callejón que ya se corrigió una vez para Ajustes (de ahí el engranaje en la cabecera de Inicio), reabierto para la copia al moverla a Opciones en §51. La copia sigue viviendo en Opciones; lo que cambia es que ahora se llega a ella siempre.

### Arreglo

- **Restauración en la bienvenida**: la pantalla de instalación nueva (biblioteca vacía) gana, bajo el botón «Cargar música», la acción secundaria «Importar copia de seguridad» (`backup_import`, icono `i-file-import`, piel discreta `.text-btn`). Abre el selector del mensajero y aplica la copia al momento. El orden natural queda: instalar la versión nueva → importar la copia → cargar la música (las canciones quedan pendientes y se enlazan solas; el aviso «N pistas sin audio» de Ajustes guía ese segundo paso).
- **Puerta permanente a Opciones desde Inicio**: nuevo botón ⋮ (`#btnHomeMore`) en la cabecera de Inicio, junto al engranaje de Ajustes, que abre `sheetMore` sin depender de que haya una pista cargada. (En la bienvenida la propia cabecera se oculta, por eso hacían falta las dos piezas.)

### Verificación

- Nuevo `check-restaurar.js`: **9/9** — biblioteca vacía al arrancar; la bienvenida ofrece importar copia (y conserva «Cargar música» y Ajustes); la copia se importa desde la bienvenida sin tocar el Reproductor (la lista queda aplicada); el ⋮ de Inicio abre «Opciones» con exportar/importar dentro. Cero errores.
- Sin regresiones: `check-chat.js` 14/14, `check-minipausa.js` 13/13.
- `.xdc` reconstruido y válido para Delta Chat.

---

## 55. Tras importar un backup: «Pista sin audio» era un callejón sin salida

**Reporte (con captura):** tras importar una copia, la canción aparece en el Reproductor como una más —portada, duración— y solo al pulsar ▶ salta «Pista sin audio: vuelve a importarla para escucharla».

### Diagnóstico

Tres capas del mismo problema:

1. **La cura era demasiado estricta.** Al reimportar el audio, una pista restaurada solo se enlazaba si el archivo casaba por **nombre + tamaño exactos**. La misma canción con otro tamaño (otro ripeo, descargada de nuevo, otro origen) no casaba nunca: entraba como pista nueva y la restaurada quedaba fantasma «sin audio» para siempre, dentro de las listas de la copia — que es justo lo que se tocaba.
2. **El aviso no ofrecía salida.** El toast decía qué hacer («vuelve a importarla») pero no dejaba hacerlo desde ahí: había que adivinar que el camino era «+» genérico o la fila de Ajustes.
3. **Sin señal previa.** La fila de la lista abierta no marcaba la pista (las demás filas sí, vía `makeTrackRow`) y Now Playing la presentaba como normal hasta pulsar play.

### Arreglo

- **Curación tolerante** (`handleFileInput`): si la clave nombre+tamaño no casa, se busca una pista pendiente que case por **nombre de archivo** —o por **título+artista** si el archivo fue renombrado—, siempre de forma **única** entre las pendientes; si hay dos candidatas, no se adivina. La cura se extrajo a `_cureRelinkedTrack()` y actualiza el tamaño guardado al del archivo real para que las claves futuras cuadren.
- **Tocar una pendiente la vincula** (`promptRelinkTrack`, interceptado en `playTrack` — la restauración de sesión no pasa por ahí): diálogo ««X» todavía no tiene audio en este dispositivo… Elige su archivo» → selector de un solo audio (el integrado de Delta o `<input>`) → el archivo elegido cura esa pista sin exigir coincidencias de nombre → se reproduce con el contexto original. Cancelar no toca nada. El avance automático de la cola conserva el comportamiento anterior (aviso y salto, sin diálogos en cadena).
- **Señal antes de pulsar play**: la fila de la lista abierta lleva ya la clase `is-pending` y la insignia «Sin audio» como el resto de filas, y el Reproductor muestra bajo el álbum una píldora accionable «Sin audio — toca para vincular el archivo» (visible solo si la pista actual está pendiente) que lanza el mismo flujo de vinculación.
- I18n: nuevas `relink_prompt`, `relink_choose_file`, `relink_cta` → **382 claves × 8 idiomas, sin huecos**.

### Verificación

- Nuevo `check-vincular.js`: **16/16** — cura por nombre con otro tamaño y por título+artista con nombre cambiado; ambigüedad no adivina; la cura deja URL y tamaño real; tocar una pendiente con «cancelar» no procesa nada y con «aceptar» vincula el archivo elegido (aunque su nombre no coincida) y lo reproduce; el aviso de Now Playing aparece solo en pendientes y se apaga al curar; la fila de la lista lleva la insignia; y de punta a punta: reimportar el audio con otro tamaño cura la pista del backup sin crear duplicado y la lista sigue apuntando a ella. Cero errores.
- `check-chat.js` (§53, recreado tras perderse `/tmp`) en verde: 12/12.
- `.xdc` reconstruido y válido para Delta Chat: 27 archivos, 345,0 KB.

---

## 56. Al cargar el backup, ¿no puede enlazar las canciones automáticamente? Casi: un solo gesto

**Pregunta del usuario:** «¿Y no puede al cargar el backup simplemente enlazar las canciones automáticamente?».

### La respuesta honesta

Automático del todo, sin tocar nada, no puede: la copia es un JSON sin audio (así puede viajar por un chat) y el sandbox webxdc **no permite explorar el dispositivo** buscando archivos — una app solo ve los archivos que el usuario le entrega en un selector. Sin ese gesto no hay origen de audio posible. Lo que sí puede, y es lo que se ha hecho: **encadenar el selector en el mismo momento de importar la copia**, para que el «automático» cueste exactamente una elección de archivos.

### Arreglo

Tras aplicar una copia, si quedan pistas sin audio, además del aviso de siempre aparece un diálogo: «La copia trae X canciones que todavía no tienen audio en este dispositivo. Elige ahora tus archivos de música y se enlazarán automáticamente con tus listas y favoritos; lo que no se encuentre quedará marcado como «Sin audio».» — botones **Cargar música** / **Ahora no**.

- Si acepta: se abre el selector (el integrado de Delta o el del navegador) y la importación normal hace el resto: cura cada pendiente que case por nombre de archivo o por título+artista (§55), avisa «X pistas vinculadas» y lo que no case queda con su insignia y su diálogo de vinculación individual.
- Si dice «Ahora no»: no se abre nada más; quedan las vías del §55 (fila de Ajustes «N pistas sin audio», insignias, tocar la pista).
- El camino inverso ya era automático: quien carga primero la música y luego importa la copia nunca ve pendientes, porque `_importLibraryData` reutiliza las pistas que ya tienen audio.

I18n: nuevas `relink_after_import_prompt` y `not_now` → **384 claves × 8 idiomas, sin huecos**.

### Verificación

- Nuevo `check-autolink.js`: **10/10** — de punta a punta con la API del mensajero simulada: importar copia (2 canciones con tamaños «de otro ripeo») → se ofrece cargar la música indicando el número → al aceptar se abre el selector y **las dos quedan enlazadas solas**, sin duplicados fantasma y con la lista restaurada apuntando a pistas con audio; con «Ahora no» no se abre ningún selector y las canciones quedan pendientes y marcadas. Cero errores. (Dos asertos se afinaron al depurar: el conteo de diálogos filtra por el botón «Cargar música» para no contar el consejo de navegación de la app, y el segundo escenario parte de memoria limpia porque la IndexedDB falsa es singleton del proceso de test.)
- Sin regresiones: `check-vincular.js` (§55) 16/16, `check-chat.js` (§53) 12/12.
- `.xdc` reconstruido y válido para Delta Chat.

---

## 57. Eliminado por completo el sistema de copia de seguridad (importar/exportar backup)

**Orden del usuario:** «No me convence lo de importar y exportar backup así que eliminalo completo».

### Alcance de la retirada

Se elimina el sistema entero (§27, §51, §54, §56) y también su descendencia, que sin copias ya no puede ocurrir nunca (las pistas «sin audio» solo nacían de una restauración):

- **Copia**: filas «Exportar/Importar copia de seguridad» y su pista en Opciones; botón «Importar copia de seguridad» de la bienvenida; `exportLibrary`, `importLibrary`, `_importLibraryFromFile`, `_importLibraryData` y los ayudantes `_backupSettings`, `_backupSession`, `_applyBackupSettings`; el diálogo de «carga tu música y se enlaza» tras restaurar; el aviso de «biblioteca desaparecida» de `init.js`, cuya única acción era importar una copia.
- **Vinculación (§55)**: `promptRelinkTrack`, `_findRelinkCandidate`, `_cureRelinkedTrack`, `_pickRelinkFile`, `pendingRelinkCount`, `updateRelinkUI` y todas sus llamadas; la curación tolerante de `handleFileInput` vuelve a la deduplicación simple por nombre+tamaño; fuera la fila «N pistas sin audio» de Ajustes, las insignias «Sin audio» en las filas y la píldora de Now Playing (HTML, CSS y bindings incluidos).
- **I18n**: podadas `backup_export`, `backup_import`, `backup_hint`, `relink_badge`, `relink_done`, `relink_pending`, `relink_prompt`, `relink_choose_file`, `relink_cta`, `relink_after_import_prompt`, `not_now`, `toast_exported`, `toast_imported_meta` y `library_missing_text` → **370 claves × 8 idiomas, sin huecos**. Sin menciones a «backup» en código ni en el README (su consejo pasa a ser el real: cada copia del `.xdc` guarda su propia biblioteca; hay que usar siempre la misma).

### Lo que NO se toca (no era la copia)

- **Compartir** lista (`.m3u8`), canción y letra por el chat (`exportFile`/`sendToChat`, §53): es otra función y sigue intacta.
- **Importar música** y su deduplicación; «Mi Música», listas, favoritos, Ajustes, la puerta ⋮ a Opciones desde Inicio y la defensa genérica de reproducción: si una pista no tuviera fuente utilizable, se avisa y se salta a la siguiente.

### Verificación

- Nuevo `check-nobackup.js`: **17/17** — ausencia total en el DOM y en la API (`exportLibrary`, `importLibrary`, `_importLibraryData`, `promptRelinkTrack` ya no existen; sin filas de copia ni de vinculación; bienvenida sin restaurar), Opciones se abre desde Inicio con Historial y Ajustes, compartir lista y canción llegan a `sendToChat`, e importar música añade y no duplica al reimportar. Cero errores.
- `check-chat.js` (§53) actualizado a la nueva realidad: 10/10. Retirados los checks que probaban la copia (`check-vincular`, `check-autolink`, `check-restaurar`).
- `.xdc` reconstruido y válido: 27 archivos, **331,7 KB** (14 KB menos de maquinaria retirada), sintaxis global verificada archivo a archivo.

---

## 58. Valoración por estrellas (y solo eso)

**Elección del usuario** de la lista de funcionalidades propuestas: implementar únicamente las estrellas (ni cola arrastrable, ni listas inteligentes, ni modo coche).

### Qué se ha hecho

- **Modelo**: `track.rating` guarda 1..5 (ausente/0 = sin valorar). Vive en el registro de la pista, así que `persistTrack()` lo guarda en IndexedDB sin infraestructura nueva. Es independiente del favorito (corazón): una canción puede ser favorita sin nota y al revés.
- **Dónde se valora**:
  - En el **menú de la canción**, bajo la cabecera: fila «Valoración» con 5 estrellas (icono nuevo `i-star`, doradas al encenderse).
  - En el **Reproductor**, bajo el álbum: la misma fila en compacto, sobre la pista que suena.
  - **Tocar la estrella ya puesta quita la nota** (patrón habitual); los valores se acotan siempre a 0..5.
- **Dónde se ve**: además de los dos widgets, las filas de canción muestran la insignia dorada (`★★★★`) junto al artista cuando hay nota; se actualiza en sitio al valorar, sin re-renderizar la lista.
- I18n: nueva `rating_label` → **371 claves × 8 idiomas, sin huecos**. Los botones llevan `role="radio"` dentro de `role="radiogroup"` con `aria-checked` sincronizado.

### Verificación

- Nuevo `check-estrellas.js`: **16/16** — modelo (sin nota por defecto, acotar a 5, quitar al repetir), persistencia real en IndexedDB (el registro guardado lleva `rating`), el menú refleja y responde (2 encendidas → tocar la 5ª pone 5), el Reproductor refleja la pista actual y valora desde ahí, la insignia de la fila nace con la nota y se actualiza/oculta sin re-renderizar, y favoritos quedan intactos. Cero errores.
- Sin regresiones: `check-nobackup.js` (§57) 17/17, `check-chat.js` (§53) 10/10.
- `.xdc` reconstruido y válido para Delta Chat: 27 archivos, 333,1 KB.

---

## 59. Estrellas también en la lista abierta y en la cola; nombres que ya no se estrangulan

**Encargo:** las estrellas deben visualizarse en las listas y en las colas de reproducción, y en esas dos vistas hay que revisar por qué los nombres salen recortados.

### Diagnóstico del recorte

El título de fila es de una sola línea con ellipsis en toda la app, pero en estas dos vistas la columna de texto es **la más estrecha de Aurora**: en la lista abierta conviven asa de arrastre + portada (48 px) + duración + botón ⋯ + botón × —unos 262 px fijos entre márgenes, huecos y controles en una pantalla de ~390— y al nombre le quedan ~130 px (unas 15 letras). En la cola (asa + portada + duración + ×) quedan ~230 px. Por eso ahí casi todo título medio se corta con «…» mientras que en Biblioteca/Buscar (sin asa ni botón de quitar) respira mejor. (Descartado un sospechoso: los botones «invisibles» de la lista solo se ocultan con ratón — `@media (hover: hover)` — en el teléfono se ven y su ancho es legítimo.)

### Arreglo

- **Estrellas en ambas plantillas**: la fila de la lista abierta y la fila de la cola llevan el mismo hueco `.row-rating` que ya tenían las demás filas; la cola gana además `data-track-id` para poder sincronizarse.
- **`_syncRatingUI` ampliado**: actualiza en sitio las insignias de las tres familias de filas (`data-track`, `data-track-id` en lista y `data-track-id` en cola) al valorar desde el menú o desde el Reproductor, sin re-renderizar.
- **Nombres que respiran**: solo en la lista abierta y en la cola, el título pasa a **dos líneas** (`line-clamp: 2`, con su ellipsis en la segunda si aún así no cabe) y el `gap` de la fila baja de 12 a 8 px, recuperando ancho útil. El resto de filas de la app conserva su línea única.

### Verificación

- Nuevo `check-listas-colas.js`: **11/11** — la lista enseña las 4 estrellas de la pista valorada y oculta el hueco en la que no tiene nota; valorar enciende la fila en sitio; la cola muestra y actualiza la nota (incluido apagarla al quitarla); el CSS contiene las reglas de dos líneas y gap 8 para ambas listas; las demás filas conservan su insignia. Cero errores. (Dos asertos de CSS fallaron primero por doble escape en las regex del propio test, no de la app.)
- Los widgets de valorar (menú y Reproductor, §58) no se han tocado.
- `.xdc` reconstruido y válido para Delta Chat.

## 60. «Más valoradas»: la lista inteligente de estrellas (§58 rematado)

«Vamos ahora con lo de las más valoradas.» Dicho y hecho: las notas de
las estrellas dejan de ser solo un adorno y forman **la lista de las
mejores canciones**, siempre al día porque se calcula al momento (no
es una lista guardada que haya que mantener: es la vista de tus
canciones ordenada por nota).

### Qué es y cómo ordena

`getTopRatedTracks()` (js/playlist-ui.js): recoge las canciones con
alguna estrella y ordena por **nota (mayor primero) → reproducciones
(más oídas primero) → título (A–Z)**. A igual nota, tus más escuchadas
van delante. Las sin nota no aparecen.

### Dónde se encuentra

- **Inicio**: nuevo raíl «Más valoradas» tras «Lo más reproducido»
  (solo si hay alguna nota). La tarjeta lleva las estrellas en el
  subtítulo (`★★★★★ · artista`), y «Ver todo» abre la hoja (antes
  todos los raíles mandaban a Biblioteca; el raíl de valoradas declara
  su propio destino). Tocar una tarjeta suena **dentro** del contexto
  valoradas (la cola es la lista), no con el contexto de su lista.
- **Biblioteca**: la tarjeta inteligente encabeza la rejilla de listas
  («Más valoradas», con su portada y conteo). **No** aparece en «Tus
  listas» a propósito: allí no sería una lista real a la que añadir
  canciones. Su ▶ reproduce directamente; el cuerpo abre la hoja.
- **La hoja** (`#sheetRated`, espejo de Favoritos): contador,
  «Reproducir Todo» discreto con su marca de «está sonando» y filas
  con la insignia de estrellas. Vacía (sin notas) enseña el estado
  vacío con instrucciones.

### Reproducción con contexto propio

- `playRated()` construye la cola en el orden de la lista dentro del
  contexto nuevo **`rated`**: el reproductor dice «Reproduciendo
  desde Más valoradas», el ▶/⏸ conmutan, y la sesión recuerda de
  dónde venías (añadido a los contextos restaurables).
- Tocar una fila entra con la lista entera como cola.
- Esto tiene en cuenta lo valorado al instante: valorar una canción
  con la hoja abierta la **actualiza sola** (la canción entra, sale o
  se mueve sin tener que cerrar). La cola ya sonando no se toca:
  cambiar la nota de una canción no expulsa a la que suena.

### Archivos e i18n

index.html (hoja nueva), js/playlist-ui.js (`getTopRatedTracks`,
`playRated`, etiqueta de contexto, tarjeta inteligente en Biblioteca),
js/stats-ui.js (`renderRated`), js/nav.js (raíl de Inicio con
subtítulo de estrellas y destino propio en `goNav`, refresco de la
hoja al valorar), js/audio.js (cola por contexto `rated`), js/events.js
(boton «Reproducir Todo»), js/player-ui.js (marca «está sonando» del
botón), js/settings.js (contexto restaurable), js/data.js (2 claves
nuevas × 8 idiomas: **373 × 8 sin huecos**).

### Verificación

- **Check §60** `/tmp/check-valoradas.js`: **21/21** (el arnés hubo
  que recrearlo una vez más tras perderse `/tmp`; el pintor de
  contexto de canvas ahora usa un proxy encadenable para no romper
  los pintores de portadas). Cubierto: sin notas no hay ni raíl, ni
  tarjeta, ni filas; el orden exacto (5★ muy oída > 5★ > 3★); el
  subtítulo con estrellas; «Ver todo» abriendo la hoja; contador y
  primera fila; tarjeta en Biblioteca sí y en «Tus listas» no;
  `playRated` con cola ordenada y contexto `rated`; la frase
  «Reproduciendo desde Más valoradas»; tocar una fila respetando la
  cola; valorar/quitar con la hoja abierta actualizándola; 0 errores.
- `node --check` en todos los JS; **build .xdc válido**: 27 archivos,
  335,6 KB comprimidos (966,0 KB sin comprimir).

## 61. Pasada de publicación: fachada ordenada y lista de pruebas en dispositivo real

El mantenedor preguntó si el reproductor está listo para el público.
Verificado el repo (rama al día, licencia MIT, manifest correcto,
versiones coherentes 1.2.0 en README, «Acerca de» y `js/state.js`), el
veredicto fue: **sí para beta pública, aún no para «1.0 terminado»**,
porque lo verificado es simulación jsdom + validador del paquete, no
un cliente Delta Chat real. Esta sección hace la parte que sí toca al
código/documentación y deja escrita la parte que solo puede hacerse
en un teléfono.

### Pasada de publicación (hecha en esta sección)

- **README** con sección «Qué hace» fiel al estado actual (importar
  con metadatos/portadas, LRC, listas + Favoritos + «Mi Música» +
  «Más valoradas», estrellas, cola/aleatorio/contexto, gapless y
  crossfade, ecualizador, visualizador, temporizador, estadísticas,
  compartir por `sendToChat`, 8 idiomas) y cifras rehechas (§60: 27
  archivos, ~336 KB; de paso ya se había corregido en `66d64d3`).
- **«Limitaciones conocidas»** en el README, dichas en voz alta:
  biblioteca por instancia (sin sincronización ni copia integrada,
  decisión §57), música detenida al cerrar la app (límite WebXDC),
  cuota de almacenamiento del dispositivo, sin selector de carpetas
  en Delta, traducciones del proyecto.
- **«Reportar un problema»**: enlace a los *issues* de GitHub con qué
  incluir (versión de «Acerca de», dispositivo y versión de Delta
  Chat, pasos).
- **CHANGELOG.md** nuevo: 1.2.0 como primera versión pública, con su
  contenido y sus limitaciones sin adornos.
- **Etiqueta `v1.2.0`** sobre esta misma entrega (git tag), para que
  «la 1.2.0» sea un commit concreto y no una frase del README.

### Pendiente deliberado (no incluido)

- **Capturas de pantalla**: imposibles de fabricar aquí sin un
  navegador real; saldrán de la pasada en dispositivo (abajo).
- **Meter las regresiones en el repo**: decisión del mantenedor
  aplazada; los checks siguen fuera (`/tmp`) y el paquete no los
  contiene.

### Lista de pruebas en dispositivo real (pendiente del mantenedor)

En un Delta Chat de verdad, con la misma copia del `.xdc` siempre:

1. Enviar el `.xdc` a «Mensajes guardados» y abrirlo: arranca sin
   pantalla en blanco.
2. Importar 10–20 canciones mezclando MP3/FLAC/OGG/M4A: título,
   artista, portadas cuando existan y **duraciones reales** (nada de
   0:00).
3. Reimportar una canción ya presente: no se duplica.
4. Reproducir: suenan play/pausa desde mini y reproductor; el mini se
   comporta; bloquear el móvil y anotar qué hace la música
   (documentar el comportamiento real del cliente).
5. Aleatorio y repetir (todo/una): el orden cambia y los bucles
   cierran bien; saltos con crossfade/gapless sin golpes.
6. Letras: abrir **solo** con su botón, la sincronía avanza,
   deslizar sobre la letra no cambia de canción y arrastrar desde su
   barra tampoco; salir con el botón de volver.
7. Listas: crear, añadir desde una canción, editar y compartir la
   lista al chat: llega el `.m3u8`.
8. Favoritos y estrellas: valorar desde menú, reproductor y filas;
   abrir «Más valoradas» y comprobar el orden (nota → reproducciones).
9. Ajustes: cambiar idioma y tema/acento; temporizador de apagado:
   la música se para al cumplirse.
10. Cerrar la app y reabrirla **desde el mismo chat**: biblioteca,
    listas, notas y sesión (canción y «Reproduciendo desde…») siguen.
11. Compartir una canción al chat: llega el audio (esto prueba el
    `sendToChat` real, la causa raíz del §53).
12. Control negativo: reenviar el `.xdc` a otro chat: instancia
    vacía (esperado; es el aviso n.º 1 del anuncio).
13. Estrés amable: biblioteca de 100+ canciones; desplazamiento y
    arranque siguen fluidos.

Con 1–13 en verde (o con fallos convertidos en secciones nuevas de
este informe), la etiqueta `v1.2.0` pasa de «publicable» a «publicada
con confianza», y las capturas de esta pasada alimentan el README.

### Verificación

- Sin cambios de código de la app: `python3 build-xdc.py` → **.xdc
  válido, 27 archivos, 335,6 KB** (mismos bytes de app que §60).

## 62. Pruebas en dispositivo real: 1.2.0 publicable con confianza

El mantenedor ejecutó en su Delta Chat la lista de 13 pruebas del
§61 (arranque desde «Mensajes guardados», importación mixta con
duraciones reales, reimportación sin duplicar, reproducción y mini,
aleatorio/repetir y saltos, letras abiertas solo con su botón,
listas y su `.m3u8` compartido, favoritos y «Más valoradas» en
orden, ajustes e idioma, cierre y reapertura con la sesión intacta,
`sendToChat` real de una canción, control negativo de la segunda
copia, y biblioteca grande con desplazamiento fluido) y confirma
que **todo funciona**.

Consecuencias:

- Se cumple el criterio fijado en §61: la etiqueta **`v1.2.0` pasa
  de «publicada» a «publicable con confianza»**. El veredicto de la
  sesión anterior («beta sí, 1.0 todavía no») queda superado por la
  única evidencia que aquí no se podía fabricar: el cliente real.
- El CHANGELOG deja de decir «aún sin prueba en dispositivos»: la
  nota pasa a reflejar esta pasada en verde.
- No se ha tocado código de la app: el paquete es byte a byte el de
  §60/§61 (27 archivos, 335,6 KB; se reconstruye para confirmar).

Pendiente, sin cambios respecto a §61:

- Capturas de pantalla para el README (salen del dispositivo del
  mantenedor cuando quiera adjuntarlas).
- Decisión aplazada: si las regresiones automáticas entran en el
  repo (p. ej. `tools/`, fuera del `.xdc`) ahora que el proyecto se
  enseña en público.

## 63. Inicio: portadas completas sin recorte y raíl de valoradas que no miente

Primera captura real sobre `main` (ya fusionada y con release
`v1.2.0` publicada): en Inicio, (1) la portada de Usseewa salía
ampliada con los bordes comidos —se notaba a la izquierda— y (2) el
subtítulo de «Más valoradas» enseñaba ★★★ de una canción valorada
con 5. Medido sobre la propia captura con análisis de píxeles, ambos
eran fallos distintos:

- **La nota vieja**: el raíl se construye al pintar Inicio y *nada lo
  actualizaba al valorar* (filas, reproductor, hoja y cola sí se
  refrescan desde §58–60; el raíl era la superficie olvidada).
  Enseñaba la nota de cuando se pintó Inicio.
- **El recorte**: `drawRowCover` pinta «cover» (rellenar recortando)
  y, para colmo, las miniaturas ya nacen cuadradas y recortadas al
  importar (`thumb()`: «recorte centrado»): de la obra original solo
  sobrevive el aspecto en `track.cover`.

### Arreglos

- **`_fitRect(iw, ih, W, H, modo)`** (js/playlist-ui.js): la
  geometría de encaje, separada del pintado para poder verificarla
  sin navegador (`cover` recorta; `contain` enseña la imagen
  entera). Las filas y el reproductor usan `cover` con la misma
  geometría extraída (sin cambio de comportamiento).
- **Modo `{ fit: 'ambient' }`** en `drawRowCover`, solo para las
  tarjetas grandes de Inicio: pinta del **original** (no de la
  miniatura recortada) en `contain` —la obra completa— sobre fondo
  de la misma imagen ampliada, difuminada (`ctx.filter` si el motor
  lo soporta) y oscurecida. Las miniaturas de filas, el mini y el
  reproductor mantienen `cover`: a 48 px, las bandas se comerían la
  portada. Decisión documentada; si el mantenedor lo quiere también
  en el reproductor, es un parámetro más.
- **`_refreshRatedRail()`** (js/nav.js): al valorar, la sección de
  «Más valoradas» se reconstruye en sitio y se re-enlazan solo sus
  tarjetas (sin repintar Inicio ni perder el desplazamiento); si no
  existía y ya hay valoradas, aparece; si se quita la última nota,
  desaparece. Enlazado de Inicio extraído a `_bindSeeAll(scope)` y
  `_bindHomeCards(scope)` para poder re-enlazar un ámbito suelto.
- **Estrellas intocables**: el subtítulo separa
  `.sub-stars` (doradas `#FFB84D`, `flex: 0 0 auto`, nunca se
  recortan) de `.sub-artist` (`min-width: 0` + ellipsis: quien se
  acorta es el nombre del artista).

### Verificación

- **Check §63** `/tmp/check-inicio.js` (arnés recreado otra vez tras
  perderse `/tmp`): **15/15** — geometría cover/contain/cuadrada;
  el escenario de la captura (3★ → valorar 5 → el raíl enseña ★★★★★
  sin repintar Inicio); quitar la última nota hace desaparecer el
  raíl; valorar una nueva lo crea; reordenar notas reordena el
  raíl; tarjeta refrescada: 1 toque = 1 reproducción (sin dobles
  enlaces); garantías CSS de las estrellas; el modo ambiente no
  lanza con ni sin imagen; 0 errores.
- `node --check` total; **build .xdc válido**: 27 archivos,
  337,0 KB comprimidos (970,3 KB sin comprimir).

Trabajo sobre la rama nueva `arena/9d3a6f0b-aurora-music-player`
(desde el merge `d0ca61d`): sin fusionar a `main` sin permiso.

## 64. Las estrellas mandan en el orden: fuera la lista «Más valoradas»

Idea del mantenedor, sustituyendo §60: en lugar de una lista aparte
con las mejor valoradas, **la cola y las listas se ordenan por las
estrellas**. Decisiones suyas (preguntadas antes de tocar): orden
**automático siempre**; en **todas** las listas (Favoritos incluida)
con las **sin nota al final**; empate = **el orden de la lista**; y
de «Más valoradas» **solo queda el raíl de Inicio como escaparate**.
De paso, a petición suya, se **eliminaron el GitHub Release v1.2.0 y
su etiqueta** (verificado: sin releases y sin tag en el remoto):
seguimos puliendo la 1.2.0 antes de lanzar.

### El orden (js/playlist-ui.js)

`sortByRating(tracks)`: nota descendente sobre una copia; las sin
nota (0) caen al final por sí solas; el sort de JS es estable, así
que el empate conserva el orden traído. `playlistTracksSorted(pl)`
lo aplica a una lista. **El orden guardado nunca se reescribe**: es
el desempate invisible. Aplicado en:

- **La vista**: el detalle de la lista (`renderEditPlaylist`) y
  Favoritos (`renderFavorites`) se muestran ordenados.
- **La cola**: `playPlaylist`, `playFavorites` y las ramas
  `playlist`/`favorites` de `playTrack` construyen la cola ordenada.
- **El avance**: `next()` reconstruía la cola de la lista en su
  orden *guardado* al avanzar — habría deshecho el orden a la
  segunda canción—; ahora reconstruye con `playlistTracksSorted`
  (cazado por la regresión: la cola nacía ordenada y a los 400 ms
  volvía al orden de la lista).

Consecuencias de diseño, documentadas: el **asa de arrastre** del
detalle desaparece (con la nota mandando, arrastrar no podría
prometer nada: la fila volvería a su sitio) junto con
`reorderPlaylistTracks`; el orden manual queda como desempate
guardado. Álbumes, artistas y «todas» conservan su orden natural:
son obras con orden propio, y la ordenación es de *listas*. Valorar
no reordena la cola que está sonando (no se eligió esa opción): el
nuevo orden se ve al abrir la lista y manda en la próxima cola.

### Lo que desaparece de §60

Hoja `#sheetRated` (index.html), `renderRated` (stats-ui),
`playRated` y la tarjeta «__rated» de Biblioteca (playlist-ui, con el
render restaurado a su forma previa), contexto `rated` (playTrack,
etiqueta, `allowedCtx` de sesión, anillo del botón en player-ui y su
enlace en events), rama `rated` de `goNav`, y la clave i18n
`rated_empty` (**372 × 8 sin huecos**; `rated_title` se queda:
titula el escaparate). El escaparate de Inicio pierde el «Ver todo»
(no lleva a ninguna lista) y sus tarjetas suenan con el contexto de
la lista de cada canción, como el resto de Inicio (§38); su refresco
al valorar (§63) se conserva.

### Verificación

- **Check §64** `/tmp/check-orden.js`: **20/20** — orden exacto con
  empates por lista y sin-nota al final (con reproducciones
  desordenadas a propósito: NO desempatan); lo guardado intacto;
  detalle y Favoritos ordenados y sin asa; colas de lista, de fila y
  de Favoritos ordenadas; el panel de cola enseña ese orden; todo lo
  eliminado ausente del DOM y de la API; el escaparate sigue, sin
  «Ver todo», y suena con contexto de lista; valorar reordena la
  próxima vista sin tocar lo guardado; 0 errores.
- **Sin regresión §63**: 15/15 (el escaparate se comporta igual).
- `node --check` total; **build .xdc válido**: 27 archivos,
  335,8 KB comprimidos (963,7 KB sin comprimir; el paquete adelgaza
  al salir la hoja).

Sigue en la rama `arena/9d3a6f0b…`: ni merge ni release hasta que la
1.2.0 se dé por buena.

## 65. Inicio: Ajustes dentro de Opciones, como en el reproductor

Petición del mantenedor: en el reproductor, Ajustes vive dentro del
menú ⋮, pero en Inicio la rueda era un botón separado en la cabecera
— dos criterios para la misma cosa.

La rueda suelta (`#btnHomeSettings`) se añadió en su día con buena
razón: entonces a Ajustes solo se llegaba desde «Más opciones» del
reproductor, inalcanzable en una instalación nueva sin pista cargada.
Pero desde §54 Inicio tiene su propio ⋮ abriendo **`sheetMore`** —el
mismo menú del reproductor—, y dentro ya vive «Ajustes»
(`#menuSettings` → `sheetSettings`). El acceso separado quedó
duplicado: misma hoja, mismo destino, dos puertas.

- **Fuera** el botón `#btnHomeSettings` de la cabecera de Inicio y su
  enlace en `js/events.js` (sin más referencias en el repo: ni CSS
  propio tenía). La cabecera queda con ⋮ y con el **+** de añadir
  música, como pidió el mantenedor.
- **Ajustes sigue a un toque** en instalación nueva: el ⋮ de Inicio
  existe desde el minuto 0, sin pista cargada —la preocupación
  original que motivó la rueda sigue cubierta, ahora por el menú—.
  El comentario histórico de la cabecera se reescribe contando esto.

### Verificación

- **Check §65** `/tmp/check-ajustes.js`: **9/9** — la rueda ya no
  está; ⋮ y + permanecen; «Ajustes» vive en `sheetMore`; sin pista
  cargada, ⋮ → Ajustes abre `sheetSettings` cerrando Opciones; el
  ⋮ del reproductor abre el mismo menú; 0 errores.
- `node --check` total; **build .xdc válido**: 27 archivos,
  335,8 KB comprimidos (963,4 KB sin comprimir).

## 66. Colores de acento: paleta renovada (y un sexto acento)

«Los colores de acento se podrían mejorar.» Diagnóstico de la
paleta vieja: Aurora salvaba el conjunto, pero Océano nacía de un
petróleo turbio (`#1A6A88`), Musgo de un verde pantano
(`#2A6B48→#A8C86A`) y Ámbar de un marrón (`#C45C18`); cada degradado
pesaba distinto y las muestras se veían apagadas. La disciplina de
la casa (comentario en `js/settings.js`) no se toca: rellenos con
texto blanco AA y acentos legibles como texto en oscuro y en claro.

### La paleta nueva

Los extremos «from» ganan luz y tono claro, y los seis comparten
familia de luminosidad para que la app pese igual con cualquiera:

| Acento | Antes | Ahora |
|---|---|---|
| Aurora | `#6E5CFF→#FF7AB6` | `#745CFF→#FF6FA5` (violeta→rosa, más cálido) |
| Océano | `#1A6A88→#3EC8B8` | `#1F7AE0→#23C8B2` (azul claro→turquesa) |
| Musgo | `#2A6B48→#A8C86A` | `#1E9E62→#9BD147` (esmeralda→lima fresco) |
| Ámbar | `#C45C18→#E8B84A` | `#E8710A→#F5B81F` (naranja vivo→oro) |
| Cereza | `#A61B3A→#E85A7A` | `#E01A44→#FF6B81` (carmesí→rosa) |
| **Fucsia** (nuevo) | — | `#C22BD6→#FF5CA8` (magenta: el hueco de la rueda) |

- Verificados con calculador WCAG antes de escribirlos en el
  código: **los 6 cumplen ≥4,5:1** en las ocho combinaciones que la
  app usa (accent/accent2 sobre `#050509`; fill/fill2 sobre blanco;
  fillLight/fillLight2 sobre `#F4F1EA` y sobre blanco) — la mayoría
  entre 5,4:1 y 9,8:1.
- Las claves guardadas no cambian (`aurora/ocean/moss/amber/cherry`
  + alias heredados): quien tuviera Océano sigue en Océano, solo que
  más bonito. Fucsia suma su clave i18n (**373 × 8 sin huecos**).
- El `:root` de `css/styles.css` (Aurora por defecto antes de que
  corra JS) y los degradados de las muestras se sincronizan con la
  paleta; la parrilla pasa a **3×2** (círculos grandes) y el nombre
  de cada muestra lleva **pastilla oscura** detrás: antes solo
  llevaba sombra y sobre los extremos luminosos (ámbar, musgo) casi
  no se leía — ese contraste era ~1,8:1 ya en la paleta vieja.

### Verificación

- **Check §66** `/tmp/check-colores.js`: **13/13** — 6 acentos con
  sus 8 campos; WCAG recalculado desde los datos vivos de la app
  (≥4,5:1 ×8 combinaciones ×6 acentos); los `from` turbios fuera;
  `setAccent` aplica variables y persiste los seis; alias heredados
  migran; la hoja ofrece las 6 muestras y tocar Fucsia lo activa;
  `:root` CSS = Aurora nuevo; cada muestra CSS usa el from→to de su
  acento; parrilla 3×2 y pastilla presentes; 0 errores.
- `node --check` total; **build .xdc válido**: 27 archivos,
  336,4 KB comprimidos (964,7 KB sin comprimir).
- Chuleta visual antes/ahora generada en `/home/user/paleta-66.png`
  (fuera del repo, como material de revisión).

## 67. Estadísticas honestas: solo cuenta la escucha completa

Petición del mantenedor: en las estadísticas de reproducción solo
contarán las canciones que se reproduzcan **completas**. Hasta hoy,
`trackPlayStarted()` sumaba al *empezar* a sonar: abrir una canción
y saltarla a los tres segundos ya contaba como reproducción (y
alimentaba «Más escuchadas» y los tops de la pantalla de
estadísticas).

### Cómo se cuenta ahora

- `trackPlayStarted()` ya no suma: solo abre el «pase» de conteo de
  la escucha en curso (y sigue llevando el tiempo escuchado).
- **`trackPlayCompleted()`** (js/settings.js) es el único sitio que
  suma, con triple candado:
  1. **Una por pase**: `_playCounted` (lo reinicia cada arranque,
     también el entrante gapless) impide dobles conteos entre vías.
  2. **Solo avances de verdad**: lo llaman `next(true)` —fin natural
     o fundido— y el salto gapless al cambiar de pista. Un `next()`
     manual nunca cuenta la saliente; un archivo que falla llega con
     `isPlaying=false` desde `_handleDecodeFailure` y tampoco. Con
     «repetir una», cada vuelta completa suma la suya.
  3. **Se ha oído entera**: `_heardWholeTrack()` une los intervalos
     realmente reproducidos (`audio.played`, inmune a pausas y
     búsquedas) y exige todo menos los últimos 2 s. **Buscar hasta
     el final a mano no cuenta** como escucha completa; reescuchar
     tras buscar atrás sí suma la unión. Sin duración conocida vale
     la llegada al final.
- El salto gapless cuenta la saliente antes de cambiar (~80 ms
  antes del corte) y la entrante estrena pase y base de segundos
  (ese `play()` directo no pasaba por `trackPlayStarted()`: también
  quedaba cojo el cómputo de tiempo en ese camino).
- Alcance: esto es el **contador** (`stats.plays` y todo lo que
  deriva: «Más escuchadas», tops, totales). El **historial** sigue
  apuntando lo abierto (es un registro de actividad, como el del
  navegador) y el **tiempo escuchado** sigue siendo tiempo real: no
  son «canciones contadas».

### Verificación

- **Check §67** `/tmp/check-completas.js`: **15/15** — al empezar no
  suma; completa suma 1 y no duplica; a medias no suma; saltar al
  final no suma; con solapes suma la unión; `next()` manual no
  cuenta; `next(true)` cuenta y avanza; fallo de reproducción no
  cuenta (con asentamiento previo: el arnés sufría promesas
  rezagadas de la IDB falsa, no era la app); repetir-una suma por
  vuelta (con `src` en el `<audio>`, como una pista real: sin él,
  `togglePlay` se desviaba por la guarda de arranque); gapless
  cuenta la saliente y la entrante suma al terminar; 0 errores.
- `node --check` total; **build .xdc válido**: 27 archivos,
  337,5 KB comprimidos (967,6 KB sin comprimir).

## 68. Fuera «Añadir a una lista» de los menús; barras del visualizador fluidas

Dos peticiones del mantenedor en una sección.

### «Añadir a una lista» ya no está en los menús

Con las listas ordenándose solas por estrellas (§64), el atajo
perdió su razón de ser en los menús: se elimina de los dos sitios
donde vivía —el menú de canción (`#ctxAddPlaylist`) y «Más
opciones» (`#menuAddToPlaylist`)—. Añadir canciones a una lista se
sigue haciendo **desde la propia lista** («Añadir canciones»,
`openAddTracksSheet` + la primitiva por lote
`_addTrackIdToPlaylist`, que se queda). Y se limpia la maquinaria
que solo servía a esos atajos: el modo «elegir lista para añadir»
(`_selectPlaylistForAdd`/`_trackToAddId`, su rama en el clic de
«Tus listas» y su reset al cerrar), las APIs `addTrackToPlaylist` y
`addCurrentTrackToPlaylist` (esta última ya no tenía llamantes), el
resto en la lista de ítems contextuales de `player-ui.js`, y dos
claves i18n (`menu_add_to_playlist`, `toast_already_in_playlist`):
**371 × 8 sin huecos**. Tocar una lista en «Tus listas» vuelve a
hacer una sola cosa: abrirla.

### Las barras no iban fluidas

El espectro tenía tres frenos apilados: el bucle capaba el dibujo
a **~30 fps** («bastan en móvil», decía el comentario: frente a la
pantalla se notaba a saltos), el analizador suavizaba a **0.8** —
con el suavizado propio de las barras encima, el conjunto respondía
perezoso— y el ataque/caída (τ 42/175 ms) era más bien flotante.

- Tope del bucle: **~60 fps** (el guardado de batería por
  visibilidad, IntersectionObserver, se mantiene).
- `smoothingTimeConstant`: **0,8 → 0,68** (menos inercia del FFT;
  el carácter lo sigue poniendo `_visStepBars`).
- Ataque/caída: τ **42→34 ms** y **175→160 ms**: suben con el golpe
  y caen con peso, sin teletransporte (verificado por dinámica).

### Verificación

- **Check §68** `/tmp/check-menu-viz.js`: **13/13** — las dos filas
  fuera y el resto del menú intacto; APIs muertas ausentes y estado
  fantasma eliminado; la primitiva por lote añade de verdad; el
  selector «Añadir canciones» abre; tocar una lista la abre para
  editarla; el bucle ya no capa a 30 fps y el analizador está a
  0,68; dinámica de barras medida (ataque entre 0,2 y 0,55 en un
  frame de 16 ms, subida monótona, caída suave con el pico nunca
  por debajo); 0 errores.
- `node --check` total; **build .xdc válido**: 27 archivos,
  336,7 KB comprimidos (963,4 KB sin comprimir).

## §69. Pasada visual completa: hasta lo más mínimo

«Dale una pasada a todo lo visual y detecta hasta lo más mínimo»:
auditoría estática automatizada (sprite de iconos e i18n vinculados
en HTML/JS, variables CSS usadas sin definir, IDs duplicados,
objetivos táctiles, cabida de las etiquetas de navegación en los 8
idiomas) más lectura crítica de las 5.069 líneas de CSS pantalla a
pantalla. Sin defectos duros (ningún icono o clave ausente, ninguna
variable indefinida, ningún ID duplicado: con el arnés no se renderiza
en navegador, así que la cobertura es de código, declarada como tal).
Pero la lupa encontró:

### Portadas blandas en pantallas densas (lo principal)

Varios canvas tenían el bitmap por debajo de lo que su caja CSS
exige a DPR 2 — se veían *casi* nítidos, que es peor que borrosos:

| Canvas | Caja CSS | Antes | Ahora |
|---|---|---|---|
| Filas (biblioteca, listas, cola, editar, estadísticas) | 48 px | 44 | **96** |
| Tarjetas de Inicio | ~116 px | 120 | **240** |
| Mini-reproductor | 48 px | 80 | **120** |
| Menú de canción | ~48 px | 64 | **112** |
| Portada del reproductor | hasta 360 px | 600 | **720** |

`drawRowCover` pinta en función de `canvas.width`, así que basta
subir el atributo; de propina, la fuente ahora es la miniatura
grande (256) en vez de la pequeña, porque el umbral de 160 ya se
supera. No se tocó el fondo ambiental (borroso a propósito).

### Legibilidad y tacto

- **Pestaña inactiva de la barra inferior**: en oscuro estaba a
  `--text-4` (blanco 30 %, ~2:1) — ahora `--text-3` (48 %). El tema
  claro ya definía su propio valor y no se toca.
- **Agarre de la barra de progreso**: la pista mide 3 px de alto;
  `.progress-track::before` amplía la zona táctil a ~25 px sin
  mover el layout (el cálculo de posición usa la X).
- `.menu-row` declaraba `color` dos veces: muerta la primera.

### Higiene

- Fuera el CSS huérfano del antiguo panel de tests (`.tests-*`,
  `.ts-*` y sus dos retoques del tema claro) y un comentario que
  aún hablaba del sistema eliminado en §57.
- Fuera dos símbolos del sprite sin ningún uso — comprobado literal
  y dinámicamente: `i-file-export` e `i-grip`. **ojo**: `i-volume-
  xmark` parecía muerto y no lo está (lo compone el indicador de
  volumen con `setIco`): se conserva.
- *Sin tocar, a propósito*: los objetivos de 40 px generalizados
  (por encima del mínimo WCAG y coherentes en la app), los inputs a
  15 px (el zoom al enfocar es de Safari web, no del webview del
  mensajero) y las etiquetas de navegación, que caben en los 8
  idiomas incluso en francés («Bibliothèque»).

### Verificación

- **Check §69** `/tmp/check-vista69.js`: **19/19** — estático
  (ninguna plantilla queda a 44/40, bitmaps nuevos en plantillas e
  `index.html`, nav legible, agarre presente, sin CSS de tests, el
  sprite exacto) y runtime (arranque sin errores recreando el
  arnés, filas renderizadas con canvas de 96, tarjetas de Inicio de
  240, buscar en la barra sin errores).
- Batería de auditoría re-ejecutada tras los cambios, `node --check`
  total y **build .xdc válido**: 27 archivos.

## §70. Respuesta a la auditoría externa con navegador (14 puntos)

Un agente con Chromium real auditó la app (375/768/1280/1440 px) y
documentó 14 falencias. Cada una se contrastó con el código antes de
tocar nada; la auditoría midió la build anterior a §69, así que tres
puntos ya venían parcialmente hechos. Veredicto y arreglo:

| # | Punto | Veredicto |
|---|---|---|
| 1 | KPI de estadísticas «3 IR AL ARTISTA» | **Real.** Usaba la clave del menú; nueva clave `stats_artists` ×8 idiomas. |
| 2 | «Enviado a Delta Chat» tras descargar | **Real.** `exportFile` ahora devuelve `'chat' \| 'download' \| false` y cada llamante avisa con el toast que toca (nuevo `toast_downloaded` ×8). |
| 3 | «Ir al artista/álbum» activos sin metadatos | **Real** en «Más opciones» (el menú de canción ya los ocultaba): ahora se ocultan igual cuando el artista/álbum es un marcador. |
| 4 | Sin focus-trap en las hojas | **Real.** Trampa de Tab/Shift+Tab sobre la hoja superior de la pila, instalada una sola vez. Al escribirla apareció un bug propio: el selector `[href]` también casa los `<use>` del sprite SVG; se limita a `a[href]`/`area[href]` (también en el foco inicial de `openSheet`). |
| 5 | Objetivos táctiles <44 px | **Real.** Estrellas de valorar a 44×44 (glifo igual), «Ver todo» a 40 px de alto y agarre de la barra de progreso de ~22 a ~31 px. |
| 6 | Etiquetas del nav a 9 px | **Real.** A 10 px (`--fs-2xs`); la más larga («Bibliothèque») sigue cabiendo. |
| 7 | Contraste de `--text-3` en oscuro | **Real.** 0,48 daba 4,32:1 calculado sobre tarjeta+superficie (la auditoría midió ~4,3:1); a **0,58** el peor caso sube a **5,57:1** y el mejor a 6,85:1 (cálculo WCAG en el check). |
| 8 | Contenido estirado en escritorio | **Real.** En `aurora-wide`, cabecera y cuerpo de las hojas a pantalla completa se limitan a una columna de lectura de 680 px centrada. |
| 9 | Toast «Letras reiniciadas» espontáneo | **No reproducido en código:** el único camino es el botón de reinicio; ningún cambio de pista lo llama. Sí era cierto que avisaba *aunque no hubiera nada que reiniciar*, pareciendo espontáneo: ahora solo avisa si algo cambió (desfase, tamaño, velocidad, bucle o pantalla completa). |
| 10 | Tirador de hoja en escritorio | **Real.** `.sheet-handle` se oculta en `aurora-wide`. |
| 11 | Visualizador vacío en pausa | **Real.** `stopVisualizer` pintaba un rectángulo limpio; ahora pinta el reposo: la misma retícula de barras en altura mínima con la paleta atenuada. |
| 12 | Chip «En vivo» cortado sin aviso | **Real.** Difuminado de 28 px en el borde derecho de `.eq-presets` (mask) que anuncia el scroll. |
| 13 | Inicial «<» en portadas generadas | **Real.** Nuevo `coverInitial()`: primera letra o número Unicode del título (o «♪»); aplicado en los tres pintores de portadas con letra. |
| 14 | Dos «+» con funciones distintas | **No se sostiene:** ambos botones (cabecera de Inicio y del reproductor) llaman a `openFilePicker()` — la misma acción con el mismo icono, que es consistencia, no ambigüedad. Sin cambios. |

### Verificación

- **Check §70** `/tmp/check-vista70.js`: **40/40** — i18n **373×8**
  sin huecos; tri-estado de exportación ejecutado (sin webxdc →
  descarga y toast «Descargado», con webxdc → chat, rechazo →
  error); filas fantasma ocultas y restauradas; Tab y Shift+Tab
  atrapados dentro de la hoja; reinicio silencioso sin cambios y
  con aviso si los hay; reposo del visualizador pintado; iniciales
  saneadas («<img» → I, «!!!Hola» → H, «Éxitos» → É); contraste
  calculado superficie a superficie; y arranque sin errores.
- `node --check` total y **build .xdc válido**: 27 archivos.

## §71. Portadas de Inicio con mala calidad: era el DPR, no el archivo

«Las portadas que salen en inicio salen con mala calidad». En §69
dimensioné los lienzos y las miniaturas para pantallas de DPR 2,
pero los teléfonos actuales son DPR 2,5–3: la tarjeta de Inicio
ocupa 116 px CSS (≈348 píxeles reales a DPR 3) y entre el lienzo de
240 y la miniatura guardada a 256 px, el navegador estiraba la
imagen. Blando por aritmética, no por el original (que se conserva
a 600 px).

- **Generación nueva (DPR 3)**: miniatura de fila 96 → **144**,
  miniatura grande 256 → **384**, portada personalizada igual y
  collage de lista 256 → **384** (hash de caché versionado `v384|`
  para que los collages viejos se rehagan solos).
- **Lienzos**: tarjetas de Inicio 240 → **384** (1:1 con la fuente),
  filas 96 → **144**, héroe 160 → **216**, explorar 160 → **240**,
  mini y menú de canción → **144**. La portada del reproductor no se
  toca: pinta del original de 600 px y su límite es ese almacenado,
  no el lienzo.
- **Bibliotecas ya importadas**: `ensureCoverThumbs` ya no se
  conforma con que existan miniaturas — decodifica el ancho real de
  la grande una vez por sesión y, si es de la generación 256, la
  rehace a 384 desde el original y repinta el lienzo que la pidió
  (`drawRowCover` lo dispara en superficies ≥160 px). Sin migración
  masiva ni coste al arrancar: cada portada se actualiza la primera
  vez que se enseña en grande.

### Verificación

- **Check §71** `/tmp/check-vista71.js`: **18/18** — estático (sin
  generación a 96/256 en ningún sitio, lienzos nuevos en plantillas
  e `index.html`, collage y hash nuevos) y runtime (arranque limpio;
  una pista heredada se regenera a [144, 384] una sola vez; una al
  día no se toca; una sin miniaturas las crea; la tarjeta de Inicio
  se renderiza con lienzo de 384).
- `node --check` total y **build .xdc válido**: 27 archivos.

Nota práctica: las portadas ya importadas se irán afinando solas a
medida que aparezcan en Inicio/listas (primera vista en grande de
cada una); no hay que reimportar nada.

## §72. El reproductor bajo la lupa: cinco detalles

«¿Crees que hallas algo mejorable en el reproductor? Cualquier
detalle cuenta». Auditoría exclusiva de la vista de reproducción
(marcado, `player-ui.js`, gestos, CSS). La pantalla estaba muy
trabajada (gestos sobre la portada, buffer, A-B, marquesinas con
reduced-motion), pero quedaban cinco cosas:

1. **El progreso avanzaba a escalones.** `timeupdate` llega a
   ~4 Hz: el relleno saltaba cada ~250 ms. Transición lineal de
   0,3 s en `.progress-fill` — solo sonando (`:has(#coverArt.playing)`)
   y nunca arrastrando, para que en pausa el salto al buscar siga
   siendo inmediato.
2. **La duración total era texto muerto.** Ahora se toca (o Enter/
   Espacio, es `role=button`) y alterna duración ⇄ tiempo restante
   (`-2:05`), con persistencia en `localStorage`. El refresco vive
   en `updateProgress()` y al cargar metadatos ya no espera al
   primer `timeupdate`. Nueva clave `time_toggle_remaining` ×8
   (374 claves en total).
3. **El botón «Letras» no decía si hay letra.** Un punto de acento
   (`#btnLyrics.has-lrc`) cuando la pista trae LRC; se sincroniza al
   cambiar de pista y al cargar/guardar una letra. La vista se abre
   igual sin letra: desde ahí se carga el `.lrc`.
4. **«Repetir» no distinguía modo para lectores de pantalla.**
   `aria-pressed` era igual en «todo» y «una»: el `aria-label` ahora
   lleva el modo (`Repetir: una`…) con las claves que ya usaba el toast.
5. **La portada se guardaba a 600 px para un lienzo de 720.** El
   reproductor estirara su superficie protagonista un 20%. El tope
   de almacenamiento sube a **800 px** (`limitArtwork` y
   `_produceArtwork`): solo beneficia a importaciones futuras — el
   original incrustado no se conserva tras importar, así que la
   biblioteca actual queda como está (decisión documentada, coste
   de IndexedDB asumido).

**Considerado y descartado, con motivo**: línea «A continuación: …»
bajo los controles (la cola ya lo cubre y la pantalla vertical va
justa), renombrar el id `btnBack` (es el «+», pero es higiene
invisible que toca tres archivos), y buscar en pausa sin refresco
(falso: `seekTo()` ya llama a `updateProgress()`).

### Verificación

- **Check §72** `/tmp/check-vista72.js`: **18/18** — i18n **374×8**;
  estático (transición y sus dos cortes, punto de letra, tope 800
  sin restos del 600) y runtime (arranque limpio; `aria-label` de
  repetir cambia por modo; el punto aparece solo con LRC; tocar la
  duración alterna `3:20` → `-2:05`, persiste y vuelve).
- `node --check` total y **build .xdc válido**: 27 archivos.

## §73. Letras sin letra: la pantalla se calla

«Haz lo mismo con el menú de letras: no me gusta como se ve cuando
no hay letras». La tarjeta de vacío ya existía y estaba centrada;
lo que ensuciaba era todo lo demás: la barra de herramientas al
completo (tamaño, desfase, velocidad, bucle, restablecer…: 8 de 11
controles no hacen nada sin letra) seguía armada sobre el vacío,
duplicando las dos acciones que la tarjeta ya ofrece en grande.

- **Modo limpio**: `_setLyricsEmpty()` marca la vista con
  `lrc-is-empty` y la barra de herramientas se oculta entera. Sus
  únicas acciones útiles sin letra («Cargar .lrc», «Pegar o editar»)
  son los botones grandes de la tarjeta. La barra vuelve sola en
  cuanto hay letra que ajustar. De paso muere la clase `.emphasis`
  que las destacaba (ya no hace falta destacar lo que no se ve).
- **Variante «nada sonando»**: abrir Letras sin pista enseñaba la
  misma tarjeta con dos botones que no tienen dónde aplicarse. Con
  `lrc-no-track`, el título pasa a ser «Sin reproducción», la pista
  «Carga una pista para empezar» y las acciones se esconden.
- **La baldosa del icono respira con la canción**: usa la paleta de
  la portada (`--cover-from/--cover-to`, como el fondo de la vista)
  en vez del acento fijo, y crece un poco (72 px, glifo de 28).
  Tarjeta algo más ancha (280 → 304 px).
- Nota de la revisión: no había ningún `}` suelto en el CSS (lo
  pareció por una salida de terminal concatenada; el balance de
  llaves se verifica ahora en el check).

### Verificación

- **Check §73** `/tmp/check-vista73.js`: **16/16** — estático
  (llaves balanceadas, reglas nuevas, sin `.emphasis` muerta, ids
  del vacío) y runtime (arranque limpio; sin pista: vacío con modo
  limpio y título adaptado; sin letra: acciones y mensaje de letra;
  con letra: el vacío se esconde y la barra vuelve).
- `node --check` total y **build .xdc válido**: 27 archivos.

## §74. La línea resaltada, al centro

«La letras resaltadas se muestren más al centro». La línea activa
no iba al centro: en modo normal se aparcaba al **25 %** de la
altura (`offsetUp = clientHeight * -0.25`) y solo en pantalla
completa iba centrada — la misma canción cambiaba de encuadre al
alternar modos. Ahora el centro de la línea activa vive en el
centro del área visible en ambos, con la fracción aislada en
`_lrcScrollTarget(el, sc)` (0,5 = centro) por si algún día se
quiere otro encuadre. El relleno simétrico de 50vh ya permitía
centrar también la primera y la última línea.

### Verificación

- **Check §74** `/tmp/check-vista74.js`: **8/8** — sin restos del
  desplazamiento al 25 %; la fórmula probada con dos geometrías
  (el centro de la línea cae exactamente en el centro del área);
  letra sincronizada renderizada sin errores.
- `node --check` total y **build .xdc válido**: 27 archivos.

## §75. El fondo del reproductor sigue a la portada (de verdad)

El usuario lo pidió y al auditar apareció el matiz: el fondo ya
era dinámico (degradado difuminado sobre `--cover-from/--cover-to`),
pero solo las portadas *generadas* traían paleta propia. Con
portada de imagen — la mayoría — nadie extraía los colores y el
fondo era siempre el acento del tema: una carátula verde botella
sonaba sobre violeta-rosa.

- **Extractor con barandillas** (`_paletteFromPixels`, puro y
  comprobable): muestrea la miniatura grande a 48×48, agrupa por
  tono ponderando saturación y luz media (ignora casi blancos y
  casi negros), elige dominante y segundo tono a ≥35°, y normaliza
  en HSL: saturación entre 0,42 y 0,85, luminosidad encerrada en
  banda oscura (0,30–0,46 / 0,38–0,55). Portada acromática o lavada
  (saturación <0,18): se tiñe hacia el acento en vez de pintar gris.
  Sin color aprovechable (gris/blanco/negro puros): `null` y manda
  el acento — el «fondo por defecto si no hay portada» de siempre,
  que también vuelve al no quedar pista cargada.
- **Perezoso y persistido**: al sonar una pista con imagen sin
  paleta, `_ensureCoverPalette` la calcula una vez, la guarda con
  la pista y, si es la que suena, el fondo se actualiza solo. La
  guarda «en curso» vive en un Set de sesión: en el objeto pista
  una persistencia coincidente la habría dejado encendida en la
  base de datos para siempre. Cambiar o quitar la portada
  personalizada invalida la paleta.
- **Una sola fuente**: fondo, resplandor y fondo de Letras ya iban
  por las variables; el visualizador, que con imagen caía a un
  violeta fijo que no era ni la portada ni el acento, ahora bebe
  de `coverPaletteFor()` como todos.
- **Por tema**: la paleta se guarda cruda (banda oscura) y se
  adapta al aplicarla — en claro se apastela (45 % hacia blanco),
  en amoled se oscurece (35 % hacia negro) — y `applyTheme()` la
  reaplica al cambiar de tema.

### Verificación

- **Check §75** `/tmp/check-vista75.js`: **22/22** — la función
  pura con píxeles sintéticos (azul → `#1c4bce` en banda; rojo/verde
  → dos tonos separados; gris, blanco y negro → `null`), las tres
  prioridades (diseñada > extraída > acento), la adaptación por
  tema medida en las variables, y la extracción completa simulada
  (lienzo falso) con fondo actualizado y sin repeticiones.
- `node --check` total y **build .xdc válido**: 27 archivos.

Nota práctica: las portadas ya importadas adoptan su paleta la
primera vez que suenan tras actualizar; no hay que reimportar.

## §76. Pausar al retirar los audífonos (best-effort en webxdc)

Pregunta del usuario: ¿se puede, aun siendo un webxdc aislado? El
aviso nativo (Android `ACTION_AUDIO_BECOMING_NOISY`) no llega a la
web; lo único disponible es `devicechange` de `mediaDevices`,
presente en los Chromium que envuelven a Aurora (WebView de Delta
Android, Electron de escritorio).

- **Regla conservadora**: se mantiene una foto de las salidas de
  audio conocidas y solo se pausa si, sonando música, la
  enumeración demuestra que **desapareció** una salida conocida
  (`gone.length > 0 && now.length < before.length`) → `togglePlay(false)`
  + toast (`toast_unplug_paused` ×8). Conectar no pausa; en pausa
  no actúa; si el WebView enumera IDs vacíos (inútil), no se
  adivina y no se pausa.
- **Interruptor** en Ajustes («Pausar al retirar los audífonos»,
  activado por defecto), persistido en el mismo bloque
  `aurora_playback` que el resto de ajustes de reproducción.
- **Límites declarados al usuario antes de implementar**: puede
  escaparse un blip de ms (el evento llega tras el cambio físico
  de ruta), en iOS WKWebView probablemente quede inerte (pero iOS
  ya pausa solo al cambiar de ruta) y solo la prueba con audífonos
  reales confirma si el WebView de su Delta dispara el evento.

### Verificación

- **Check §76** `/tmp/check-vista76.js`: **15/15** — i18n **376×8**;
  runtime con `mediaDevices` simulado (foto inicial; sin cambios no
  pausa; conectar no pausa; retirar sonando pausa una vez y avisa;
  en pausa no actúa; con el ajuste apagado no pausa; IDs vacíos no
  inventan) y arranque sin errores en un entorno sin `mediaDevices`.
- `node --check` total y **build .xdc válido**: 27 archivos.

## §77. La pausa al retirar los audífonos no funcionaba: plan B

El usuario probó §76 en su dispositivo: nada. Era el riesgo nº 1
declarado — su WebView enumera un único «default» que no cambia al
desenchufar, así que la «retirada demostrable» nunca se demostraba
y la regla conservadora se quedaba esperando para siempre.

Regla nueva, por orden (manejador único `_handleAudioDeviceEvent(source)`):

1. **Retirada demostrable** (la foto distingue dispositivos y
   desaparece una salida): pausa. Conectar nunca pausa. Como antes.
2. **Foto inútil pero el sistema avisó**: un solo «default» inmóvil,
   IDs vacíos o enumeración fallida + evento `devicechange` →
   pausa. Si el sistema se molestó en avisar sonando música, algo
   cambió en la ruta de audio (el precio aceptado: conectar unos
   Bluetooth en ese WebView también pausaría; el toast lo explica
   y el ajuste puede apagarlo).
3. **Sondeo cada 4 s** para WebViews que enumeran bien pero no
   disparan el evento (solo pausa por la vía 1; sin aviso no se
   adivina), y foto fresca al empezar a sonar para comparar contra
   lo que había al darle al play.

### Verificación

- **Check §77** `/tmp/check-vista77.js`: **16/16** — el caso real
  del usuario reproducido y ya pausando («default» inmóvil +
  evento), conectar sin pausar con enumeración útil, sondeo sin
  falsas pausas, sondeo con retirada demostrable pausando, ajuste
  apagado y en pausa sin actuar, arranque limpio sin mediaDevices.
- `node --check` total y **build .xdc válido**: 27 archivos.

Pendiente honesto: si ni el evento ni una enumeración útil existen
en su WebView, no hay señal web que explotar y esto tampoco
saltará; la prueba del usuario manda.

## §78. Veredicto: en el teléfono del usuario no se puede

Segunda prueba en el dispositivo real, con el plan B de §77:
tampoco. Conclusión técnica, sin paliativos: su WebView no entrega
a la página **ninguna** de las señales que la web puede usar — ni
el evento `devicechange`, ni una enumeración de salidas que cambie
al desenchufar (o directamente `mediaDevices` no está expuesto en
ese contexto). Sin señal no hay implementación posible desde
dentro del webxdc: el aviso que usan los reproductores nativos
(`ACTION_AUDIO_BECOMING_NOISY`) lo recibe la app contenedora, no
la página, y Delta Chat no lo reenvía.

Decisión: el motor se queda (coste cero, inerte donde no hay
soporte, y funcional donde la plataforma sí expone dispositivos,
como Chromium de escritorio, vía «retirada demostrable»), el
interruptor de Ajustes se queda (permite apagarlo donde sí
funcione), y la documentación deja de prometerlo como universal:
el CHANGELOG y este informe dicen ahora exactamente dónde sí y
dónde no. Si el usuario prefiere que desaparezca también el
interruptor por no hacer nada en su teléfono, es un commit de un
minuto.

## §79. Regresión: fuera la pausa al retirar los audífonos

Por orden del usuario, se elimina TODO lo de §§76–78: el motor de
vigilancia (`_snapshotAudioOutputs`, `_handleAudioDeviceEvent`,
`_initHeadphoneWatch`, el sondeo y la foto al reproducir), el
interruptor de Ajustes y su persistencia, el campo de estado y las
dos claves i18n (`settings_pause_unplug`, `toast_unplug_paused`:
el catálogo vuelve a **374×8**). También sale su línea del
CHANGELOG: la 1.2.0 aún no está lanzada y no debe anunciar lo que
no lleva. El veredicto de §78 queda en este informe como memoria
de por qué no está: sin señal del WebView no hay pausa posible
desde la web; si algún día Delta expone algo, se reharía desde
aquí, no desde el código retirado.

### Verificación

- **Check §79** `/tmp/check-vista79.js`: **11/11** — cero restos
  (`unplug|devicechange|_audioOutputs|…` sin coincidencias en JS ni
  HTML), i18n de vuelta a 374×8 sin huecos, arranque limpio, la
  fila vecina (vinilo) y el guardado de ajustes intactos, y
  play/pausa funcionando tras la retirada.
- `node --check` total y **build .xdc válido**: 27 archivos.

## §80. Auditoría general: poda verificada de código muerto

Nueva auditoría completa (estática + runtime) sobre lo acumulado
§§63–79. Batería: sintaxis de todo el JS, catálogo i18n (claves ×8
y referencias vivas por todas las vías: `t('…')`, `data-i18n*`
incluido `-ph`, `addTitle('…')` y familias dinámicas
`theme_`/`accent_`), iconos definidos/usados con escaneo exacto
`#i-…`, variables CSS, IDs duplicados y referencias, restos de
funciones eliminadas (§§51–57, §68, §76–79) y regresión runtime
consolidada de los grandes flujos.

### Hallazgos reales, corregidos en la misma pasada

- **37 claves i18n muertas fuera** (374 → **337×8**, sin huecos y
  con 0 referencias rotas): restos de funciones retiradas
  (almacenamiento, Letras, búsqueda…) que solo quedaban definidas.
  Cada candidata se verificó una a una por palabra exacta en JS,
  HTML y CSS, descartando usos dinámicos antes de podar. La poda se
  hizo por conteo de llaves, no por regex de líneas: el catálogo
  conserva cierres `}\n,` de podas antiguas que tragaban claves
  vecinas (dos intentos por regex abortaron por aserción sin tocar
  el archivo; a la tercera, con conteo de llaves, limpio).
- **11 clases CSS sin uso real eliminadas** de `css/styles.css`
  (`icon-btn-large`, `lt-sep`, `exit-left`, `cover-overlay`,
  `library-playlists`, `delete-track`, `unfav-track`,
  `eq-manual-actions`, `add-to-pl`, `home-empty`,
  `artist-avatar`), preservando los selectores vivos compartidos
  (`.playlist-list`, `.sec-btn.liked svg`, `.remove-from-pl:hover`).
  Balance de llaves tras la poda: 957/957.
- **1 enlace JS muerto fuera** en `js/events.js`: el binding
  guardado de `#menuRelinkAudio`, elemento que ya no existe en
  `index.html`. `#menuFreeStorage` sí existe y su binding queda.

### Falsos positivos descartados (no «corregidos»)

Escaneo exacto: todos los `#i-…` usados están definidos y los
cuatro «sin uso» de la primera pasada (`i-check`,
`i-chevron-right`, `i-grip-vertical`, `i-lock`) sí se usan. Las
claves «quizá sin uso» restantes viven por `data-i18n-ph`
(`optional`, `my_new_playlist`, `search_placeholder`), por
`addTitle()` en estadísticas (`search_section_*`) o por familias
dinámicas. Los IDs «ausentes» nacen de plantillas JS o son el
fallback `btnSleep` → `menuSleep`; los «TODO» eran «TODOS»; los
objetivos <40 px son glifos `.ico`, no botones; `offerFreeStorage`
está definido (`js/settings.js`).

### Verificación

- **Check §80** `/tmp/check-audit80.js`: **21/21** — arranque,
  orden por estrellas (§64) sin tocar el guardado, Inicio a 384
  (§71), estadísticas solo de escuchas completas (§67), seis
  acentos (§66), restante/duración (§72), Letras sin letra y con
  letra (§73), línea centrada (§74), paleta de portada (§75),
  trampa de foco (§70) y play/pausa, sin errores.
- Batería estática `/tmp/audit80.js` limpia tras la poda;
  `node --check js/*.js` OK.
- **Build .xdc válido**: 27 archivos.

§§76–79 no reaparecen: cero restos de la pausa al retirar los
audífonos. La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

## §81. Lo que le faltaba a un reproductor «normal» + renombre roto

Tras la auditoría §80 el usuario pidió implementar todo lo viable
de la lista de carencias comparada con otros reproductores, menos
lo descartado por orden suya (copia de seguridad §57, importar
`.m3u` §51, sincronización) y lo imposible en WebXDC (streaming,
segundo plano al cerrar, pausa al quitar auriculares §§76–79). Y
arreglar el renombre de listas. Dos «carencias» resultaron no
serlo al verificar: la cola ya se reordenaba arrastrando
(`wireDragHandle`) y el tiempo total de escucha ya estaba en
Estadísticas; de esos puntos solo se implementó lo que faltaba.

### El fallo: renombrar sin confirmar

`startRenamePlaylist()` reemplazaba el `<h4 id="editPlaylistName">`
por un `<input>` **sin id**: al confirmar, `renderEditPlaylist()`
ya no encontraba el título, la vista se quedaba con el campo de
texto para siempre y no había botón de confirmar. Ahora el campo
nace dentro de `.edit-pl-rename` con botones ✓/✗ visibles; Enter
confirma, Escape cancela, el blur confirma, y al terminar se
restaura el `<h4>` con su id (renombrar dos veces seguidas
funciona; antes la segunda era imposible).

### Ordenación manual (§81.2)

`sortTracksBy(tracks, mode)` en `js/playlist-ui.js`: estrellas
(§64, sigue siendo la predeterminada), título, artista, álbum,
orden guardado, recientes y duración. `playlistTracksSorted(pl)`
la aplica según `pl.sort`, así que listas y colas suenan como se
ven; el orden guardado no se reescribe. Selector en la hoja de
editar lista (persiste vía `persistPlaylist`, que ahora guarda
`sort` y `smart`) y otro en la vista álbum/artista/género
(`browseTracksSorted()`, también para «Reproducir Todo»).

### Catálogo Álbumes / Artistas / Géneros (§81.3)

Pestañas en Biblioteca sobre la vista de listas de siempre (§47:
no vuelve «Todas las canciones»; es un índice nuevo pedido
expresamente). `getAlbums()`/`getArtists()` ya existían;
`getGenres()` es nuevo porque el importador **pedía género y año
a jsmediatags y los tiraba**: ahora se guardan en la pista (ID3 y
Vorbis `GENRE`/`DATE`), el re-etiquetado automático los recupera
para bibliotecas antiguas, el álbum muestra su año y cada tarjeta
abre la vista `openBrowse()` existente (tipo `genre` incluido).

### Listas inteligentes (§81.4)

`pl.smart = {kind, genre?}` con reglas: 4+ estrellas, un género,
nunca reproducidas, añadidas en 30 días, olvidadas (+90 días sin
escucha completa) y más reproducidas (50). `smartPlaylistTracks()`
se recalcula en cada lectura: la lista se rellena sola.
`playlistTracksSorted`, conteo, duración, portada y exportación
usan las pistas efectivas; en la hoja de edición no se puede
añadir/quitar/vaciar a mano (la regla manda) y llevan insignia
«Inteligente». Se crean desde la hoja de crear lista (Normal /
Inteligente + regla).

### Cola: guardar como lista (§81.5)

Botón en la hoja de cola que reutiliza la hoja de crear con la
bandera `_queueSaveMode` (puesta DESPUÉS de abrirla:
`openCreatePlaylistSheet()` resetea las banderas al empezar). La
lista nace con `sort='added'` para sonar en el orden exacto de la
cola. Reordenar la cola ya existía; no se ha tocado.

### Editor LRC: sincronizar tocando (§81.6)

El editor de letra existía (pegar/editar a mano); faltaba marcar
tiempos al ritmo. Panel nuevo en la misma hoja: escribes las
líneas sin tiempos, reproduces y tocas «Marcar línea»; las marcas
(monótonas, con deshacer) se escriben como `[mm:ss.xx]` en el
editor y se guardan con el Guardar de siempre. Terminar antes de
tiempo conserva el resto de líneas sin marcar.

### Estadísticas: saltadas y olvidadas (§81.7)

`stats.skips` nuevo: `_registerSkip()` cuenta un salto por pase
cuando el usuario abandona a mitad (next/prev manual o elige otra
pista), con mínimo oído (5 s o 10 %) y sin contar escuchas
completas (§67) ni finales buscados a mano. Al completar una
escucha se guarda `track.lastPlayedAt`; Estadísticas gana las
secciones «Más saltadas» y «Olvidadas» (con «hace X días»). El
tiempo total de escucha ya existía como tarjeta.

### Fundido al pausar/reanudar (§81.8)

Sin fundido cruzado activo, pausar baja la ganancia a 0 en 250 ms
antes de `pause()` (un `play()` intermedio lo invalida por token)
y reanudar sube de 0 a la ganancia normal en 300 ms, sobre el
`gainNode` existente. Sin grafo Web Audio, comportamiento de
siempre.

### Duplicados (§81.9)

«Buscar duplicados» en Biblioteca: grupos por título+artista
normalizados (la importación ya evitaba el mismo archivo; esto
caza la misma canción por otro archivo). Se conserva la más
antigua —la que suele tener estrellas y listas— y las copias se
borran una a una con el borrado con deshacer de siempre.

### i18n y verificación

44 claves nuevas ×8 (381×8, 0 huecos, 0 referencias rotas por
`t()` ni `data-i18n*`). `persistPlaylist` guarda `sort`/`smart`.

- **Check §81** `/tmp/check-vista81.js`: **41/41** — renombre
  (confirmar, cancelar, dos veces), ordenes, las 6 reglas
  inteligentes, crear inteligente desde la hoja, catálogo
  (pestañas, tarjetas, abrir álbum), guardar cola en orden,
  tap-sync completo hasta guardar la letra, salto único por pase,
  `lastPlayedAt`, secciones de stats y duplicados.
- Regresión §80 `/tmp/check-audit80.js`: **21/21** (el orden por
  estrellas de §64 intacto como predeterminado).
- Batería estática limpia; `node --check js/*.js` OK; llaves CSS
  990/990.
- **Build .xdc válido**: 27 archivos.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

## §82. Quitar una canción de la cola la resucitaba al siguiente paso

**El fallo (reportado por el usuario):** reproducías una lista,
quitabas una canción de la cola con su ✗, y al pasar a la
siguiente canción la lista completa volvía a estar en la cola.

**Causa:** en `next()` vivía desde §64 una «reconstrucción» que
comparaba la cola con la lista ordenada y, si diferían en
longitud u orden, sustituía la cola entera por la lista. Nacida
para que la cola heredara el orden por estrellas, tenía el
efecto de deshacer cualquier edición de la cola: la baja de una
canción, el reorden por arrastre y el «vaciar siguientes» se
perdían en el primer cambio de pista.

**El arreglo — la cola manda:** al construir una cola desde una
lista (`playTrack` con contexto, `playPlaylist`) se guarda una
foto de la lista en `_plSyncIds`. En cada `next()` (manual o
automático, sin shuffle), `_syncQueueWithPlaylist()` sincroniza
contra esa foto en vez de reconstruir:

- **Altas de la lista** (en la lista ahora, ni en la foto ni en
  la cola): entran **al final** de la cola.
- **Bajas de la lista** (en la foto, ya no en la lista): salen de
  la cola, salvo la que está sonando, que termina y sale en la
  siguiente sincronización.
- Lo quitado **de la cola a mano sigue en la foto**: no es un
  alta y no vuelve. El orden de la cola no se toca nunca: el
  reorden por arrastre y §81 (altas al final) sobreviven.
- Sin foto (sesión restaurada): la primera sincronización adopta
  la lista como foto sin tocar la cola guardada.

Con shuffle sigue mandando `_originalQueue`, que ya respetaba
las bajas (§ cola). Contextos que no son lista (Favoritos,
álbum/artista/género, radio) dejan `_plSyncIds` en `null`.

### Verificación

- **Check §82** `/tmp/check-vista82.js`: **17/17** — el gesto
  exacto del usuario (✗ en la fila y «siguiente», manual y
  automático), reorden manual que sobrevive, vaciar sin
  restaurar, bajas/altas de la lista aplicadas, y sesión
  restaurada sin foto.
- Regresiones: §81 **41/41** y §80 **21/21**; `node --check`
  total OK.
- **Build .xdc válido**: 27 archivos.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

## §83. Auditoría profunda de la cola por más valoradas

El usuario reportó tres cosas en la misma zona: la reordenación
de la cola por más valoradas «tiene serios problemas», el menú
«Más opciones» de cada canción debía estar también en la cola, y
«Reproducir siguiente» no funcionaba (y debía llamarse
«Reproducir después de la canción actual»). Auditoría con sonda
empírica (`/tmp/probe83.js`) antes de tocar nada; lo sano se
documenta como tal y lo roto se arregla.

### Lo que estaba bien (verificado, sin tocar)

- La cola nace ordenada por estrellas al reproducir una lista
  (§64), con el desempate del orden guardado; el avance gapless
  calcula la siguiente en el momento del corte, así que una
  inserción previa se respeta; activar/desactivar el aleatorio
  ancla la actual y restaura sin perderla; elegir «siguiente»
  sin nada sonando reproduce la elegida.

### Fallo 1: «Reproducir siguiente» duplicaba

`playNext()` insertaba tras la actual sin quitar la aparición
que la canción ya tenía en la cola — el caso típico, porque se
elige desde la misma lista que suena. La canción sonaba dos
veces: el «no funciona». Ahora **mueve**: quita sus demás
apariciones (salvo la que suena, si es ella), entra tras la
actual y el mismo movimiento se refleja en `_originalQueue`
con aleatorio. Y se llama **«Reproducir después de la canción
actual»** en los 8 idiomas.

### Fallo 2: la cola por valoradas no seguía las notas

Valorar reordenaba la lista (vista) al instante pero la cola
jamás: divergían hasta volver a reproducir la lista. Y las
altas nuevas entraban al final de la cola aunque fueran de 5★
(§82). Arreglo: `resortUpcomingQueue()` reordena **solo lo que
queda por sonar** (la actual y lo ya sonado no se tocan; sort
estable: a igualdad manda el puesto que ya traía cada pista, así
el arrastre manual sobrevive entre iguales). Se llama al
valorar (si lo que suena manda por estrellas o es Favoritos),
cuando la sincronización de §82 trae altas (entran por nota) y
al cambiar el criterio de orden de la lista que está sonando.
Con aleatorio no se toca nada.

### Fallo 3: la cola no tenía menú de canción

Cada fila de la cola lleva ahora el botón ⋯ (y pulsación larga)
que abre el mismo `openTrackMenu` de las listas — con su
«Reproducir después de la actual» ya capaz de mover la pista
dentro de la propia cola.

### Fallo 4 (de la auditoría): el gapless no sincronizaba

El avance sin pausa de §67 (`gaplessNext`) no pasaba por la
sincronización con la lista de §82: una baja de la lista se
colaba si el cambio de pista era gapless. Ahora sincroniza
igual que `next()` (idempotente si `next()` ya lo hizo).

### Verificación

- **Check §83** `/tmp/check-vista83.js`: **22/22** — menú en la
  cola y su apertura, mover sin duplicar (desde la cola, desde
  una lista y con aleatorio, en cola y en `_originalQueue`),
  valorar/quitar nota reordenando lo que queda sin mover la
  actual, alta 5★ entrando por nota, cambio de criterio en vivo
  y sincronización gapless.
- Regresiones: §82 **17/17**, §81 **41/41**, §80 **21/21**;
  `node --check` total OK; llaves CSS 991/991.
- **Build .xdc válido**: 27 archivos.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

## §84. Con el visualizador activo, la portada se veía muy pequeña

**El problema (reportado por el usuario):** al activar el
visualizador, la portada encogía. Causa de layout, no de dibujo:
la columna del reproductor tiene una sola pieza flexible, la
sección de la portada (`flex: 1 1 0; min-height: 0`), y el
visualizador vivía en el flujo entre el progreso y los
controles con sus 62 px + margen. Todo lo demás (barra
superior, info, progreso, controles) es fijo, así que esos
~64 px salían íntegros de la portada en cuanto se encendía el
visualizador — y en pantallas bajas, donde ya mandan los topes
`30dvh`/`36dvh`, el tijeretazo se notaba el doble.

**El arreglo:** el visualizador sale del flujo y pasa a vivir
**superpuesto sobre la parte baja de la propia portada**
(dentro de `#coverArt`, bajo la pista de «tocar para
reproducir»): franja de 62 px a todo el ancho de la carátula,
con un degradado oscuro al pie para que las barras y la onda
—colores de la propia portada desde §75— se lean sobre
cualquier imagen. `pointer-events: none` para que los gestos
de la portada (tocar, arrastrar para volumen) funcionen igual
encima de la franja. Resultado: el tamaño de la portada es
**idéntico con y sin visualizador** en cualquier pantalla, y
la regla de tamaño de la portada no se ha tocado. El canvas ya
se ajustaba a su tamaño CSS (`_fitVisualizerCanvas`), así que
el motor de dibujo no cambia; mostrar/ocultar sigue siendo el
mismo `display` de siempre.

### Verificación

- **Check §84** `/tmp/check-vista84.js`: **15/15** — la capa
  vive dentro de `#coverArt`, posición absoluta sin presencia
  en el flujo, regla de tamaño de la portada intacta, ciclo
  bars→wave→off→bars mostrando/ocultando, y arranque/parada
  del dibujo sin errores.
- Regresiones: §83 **22/22**, §82 **17/17**, §81 **41/41**,
  §80 **21/21**; `node --check` total OK; llaves CSS 991/991.
- **Build .xdc válido**: 27 archivos.

Nota honesta: jsdom no hace layout, así que la igualdad de
tamaño se verifica por construcción (la capa ya no consume
alto de la columna) y no por píxeles; el arreglo se confirma
visual en el dispositivo, como el resto de la UI.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

---

## 85. Carga rápida de bibliotecas grandes (auditoría §85)

Auditoría pedida: «auditar carga de grandes volúmenes de
canciones y cómo hacer que carguen rápido». La importación ya
escalaba bien —pool de 3–6 trabajadores en `processFiles`,
portada compartida por álbum, deduplicación O(1) por `Map` y
guardado en una sola transacción (`persistTracksBatch`)—; los
cuellos reales estaban en el **arranque** y en una **doble
lectura** de los archivos más grandes:

1. **Retag de arranque desbocado (el grave).** La puerta de
   `js/init.js` consideraba «incompleta» a toda pista sin letra
   (`!t.lrc`); como casi ninguna canción trae letra, en **cada**
   arranque `retagExistingTracks` releía **toda** la biblioteca
   secuencialmente y, al «mejorar» la portada, reescribía **cada
   registro de IndexedDB con su blob** una y otra vez.
2. **Un `objectURL` por canción** al arrancar, aunque
   `getTrackUrl` ya crea y cachea la URL bajo demanda.
3. **FLAC/OGG/Opus leídos dos veces:** `jsmediatags` leía el
   archivo entero aun cuando el lector Vorbis propio ya había
   sacado los tags del primer MB — y los FLAC son justo los
   archivos más pesados.

### Correcciones

- **Retag selectivo con marca.** Nuevo `_trackNeedsRetag(t)`:
  sin archivo no se toca; sin marca `_tagsChecked`, sin portada
  imagen o con artista placeholder sí; **sin letra nunca** es
  motivo. El arranque llama a `retagExistingTracks({silent,
  onlyIncomplete: true})` y el releído usa un pool de 3 en vez
  de secuencial; la pista queda marcada `_tagsChecked` y la
  marca se persiste aunque nada más cambie, para que el
  siguiente arranque la salte. La portada solo se reemplaza si
  el dataURL difiere: **ningún registro se reescribe sin cambio
  real**. El «Releer etiquetas» manual del menú sigue siendo
  completo, como hasta ahora.
- **Arranque perezoso.** `js/init.js` ya no crea `src` por
  pista: la URL nace en `getTrackUrl` al reproducir, compartir
  o pre-cargar la siguiente, y queda cacheada.
- **Vorbis completo = sin `jsmediatags`.** Si el lector propio
  trae título, `processOne` se salta `readTags` (el archivo
  entero) y la pista nace con `_tagsChecked`.
- **Fallo real destapado por el check:** el lector Vorbis no
  copiaba `genre`/`date` del comentario (venían de
  `jsmediatags`) y el mapeo `date → year` solo existía en la
  rama con tags. Con el salto, FLAC/OGG habrían perdido género
  y año: el lector ahora los extrae y el año se normaliza en
  ambos caminos.

### Verificación

- **Check §85** `/tmp/check-vista85.js`: **21/21** — predicado
  de retag, solo la incompleta se relee y queda marcada,
  segundo arranque con cero relecturas, manual completo sin
  reescrituras inútiles, FLAC sin llamar a `jsmediatags` con
  título/género/año intactos, lector Vorbis real sobre un
  comentario construido a mano, MP3 por `jsmediatags`, URL
  perezosa y pool con orden conservado.
- Regresiones: §84 **15/15**, §83 **22/22**, §82 **17/17**,
  §81 **41/41**, §80 **21/21**.

Nota de alcance: el sondeo de duración por archivo en MP3 se
mantiene (es la única fuente fiable) y `jsmediatags` sigue
siendo el camino de MP3/M4A/WAV; no se ha tocado el motor de
importación, que ya era correcto.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

---

## 86. Letras: sin mini reproductor en vacío, sin gesto y con foco en la línea que suena

Petición del usuario, con opinión pedida antes de implementar
y cuatro decisiones cerradas por él (ocultar mini-cabecera y
controles sin letra; eliminar el gesto; difuminado fuerte;
aclarar al desplazar a mano):

1. **Sin letra, fuera el «mini reproductor».** La vista de
   Letras sin letra ya ocultaba la barra de herramientas (§73),
   pero quedaba un reproductor en miniatura: mini-cabecera
   (portada + título/artista), tarjeta de vacío y controles
   inferiores con progreso y anterior/play/siguiente. Con la
   clase `.lrc-is-empty` ahora también se ocultan
   `.lyrics-mini` y `.lyrics-controls`: solo quedan la barra
   superior y la tarjeta con «Cargar .lrc / Pegar o editar»,
   que es la única acción útil en esa pantalla. Con letra,
   mini-cabecera y controles se mantienen: son la identidad de
   la canción y el transporte dentro de la vista.
2. **Gesto horizontal para cambiar de canción: eliminado.**
   Solo vivía en la vista de Letras (`wireGestures` exigía que
   estuviera activa) y causaba saltos de pista accidentales al
   desplazar la letra en diagonal. `wireGestures` queda sin
   listener de deslizamiento; quedan los botones, el toque en
   una línea para saltar a ese instante y el scroll nativo.
   Esto **revierte una decisión anterior del usuario**
   («deslizar sobre la letra sí cambia de canción») por orden
   expresa suya en esta sección. Fuera de alcance —y NO
   tocado—: el deslizamiento horizontal sobre la portada del
   reproductor, que sigue cambiando de canción.
3. **Foco en la línea que suena.** Nueva clase `.lrc-focus`
   sobre `#lyricsScroll` (helper `_setLrcFocus`): con letra
   sincronizada y primera línea ya activa, la línea actual se
   lee nítida, la vecina (±1, `.near`) queda a opacidad 0,55
   con blur 0,7 px como contexto, la segunda (`.near-2`) a 0,3
   con blur 1,3 px, y el resto a opacidad 0,18 con blur 2 px:
   casi ilegible, como se pidió. Radio de desenfoque pequeño
   a propósito (blur grande sobre ~100 líneas saldría caro en
   el WebView) apoyado en la opacidad. Salvaguardas: sin
   sincronía (`_setLrcFocus(false)` en la salida temprana) y
   antes de la primera línea —intro— no hay difuminado; al
   pasar a una canción sin letra el foco se apaga
   (`_setLyricsEmpty`). Mientras el usuario desplaza la letra
   a mano, `.lrc-focus.user-scrolling` aclara todas las
   líneas (opacidad 0,85, sin blur) para poder buscar un
   verso; al retomar el auto-scroll vuelve el foco. La
   transición de `.lrc-line` incluye ahora `filter .25s`.

### Verificación

- **Check §86** `/tmp/check-vista86.js`: **28/28** — CSS de
  vacío (mini-cabecera y controles ocultos, regla §73 intacta),
  gesto fuera de `events.js`, graduación del difuminado en el
  CSS y comportamiento: foco encendido con línea activa y
  clases near/near-2/base correctas, apagado en la intro,
  jamás presente sin sincronía y apagado al pasar a una
  canción sin letra.
- Regresiones: §85 **21/21**, §84 **15/15**, §83 **22/22**,
  §82 **17/17**, §81 **41/41**, §80 **21/21**; `node --check`
  OK y llaves CSS equilibradas.

Nota honesta: jsdom no aplica el CSS ni hace layout, así que
el difuminado se verifica por las reglas y por las clases que
el JS pone/quita; el efecto visual se confirma en el
dispositivo, como el resto de la UI.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

---

## 87. Fallos graves al reabrir: «no se puede reproducir» en cadena (y la lista fantasma)

Dos fallos reportados tras cerrar y reabrir la miniapp: (1) el
reproductor saltaba de canción en canción avisando de que no se
podía reproducir ninguna, y (2) al quitar una canción de la cola
«se creó una lista con esa canción». Ambos considerables; el
primero, regresión directa de §85.

### Fallo 1 — la URL guardada estaba muerta (regresión §85)

Cadena confirmada en código y reproducida con sonda
(`/tmp/probe87.js`): `processOne` devuelve la pista con
`src: URL.createObjectURL(file)` y `persistTrack` /
`persistTracksBatch` guardaban ese objeto tal cual en
IndexedDB. Un objectURL muere con su sesión: al reabrir, cada
registro traía un `blob:` cadáver. Antes de §85 el arranque
recreaba las URLs de todas las pistas y eso enmascaraba la
contaminación; §85 dejó de crearlas (bien) pero `getTrackUrl`
seguía confiando en el `src` persistido: devolvía la URL
muerta, el `<audio>` disparaba el error de decodificación y la
política de saltos recorría la cola entera avisando «no se
puede reproducir» canción tras canción — exactamente lo
reportado.

Corrección en tres capas, para que no vuelva por ningún camino:

- **`getTrackUrl` ya no confía en ningún `blob:` que no haya
  acuñado esta sesión**: si la pista trae un `src` blob: ajeno,
  se revoca/descarta y la URL se crea siempre desde `_file` /
  `fileBlob`. Solo se respeta un `src` no-blob (http(s)). Sin
  blob y con URL muerta devuelve `null`, sin inventar.
- **No se vuelve a escribir**: `persistTrack` (init.js) y
  `persistTracksBatch` (library.js) eliminan `src` del registro
  a guardar.
- **Saneamiento de bibliotecas ya contaminadas**: al cargar
  (`loadAllFromStorage`) se elimina todo `src` blob: de los
  registros leídos; a partir de ahí los registros se reescriben
  limpios en cuanto algo los persiste. Ningún usuario tiene que
  reimportar su biblioteca.

### Fallo 2 — quitar de la cola es inocente; la lista era «Mi Música»

Forense con sonda de clic real: pulsar el × de una fila de la
cola quita la canción y **no toca `this.playlists` ni llama a
`persistPlaylist` una sola vez**; «Vaciar» tampoco. El único
creador automático de listas de la app es «Mi Música»: al
arrancar, si no existía, se sembraba con **todas** las canciones
que no estuvieran en ninguna lista. Si una canción queda fuera
de cualquier lista (al vaciar o borrar la suya, por ejemplo),
al siguiente arranque nacía «Mi Música» con ella y se vivía
como «la app creó una lista sola al quitar una canción».

Ajuste (§87, sin tocar la función pedida en §46): la siembra
en frío al arrancar **solo ocurre si no hay ninguna otra
lista** (biblioteca nueva o migrada: todo es suelto por
definición). Con listas del usuario, «Mi Música» ya no aparece
por sorpresa: nace en contexto cuando se importa sin lista
destino (`_ensureMiMusica`, intacto, solo con lo importado) y
la marca `aurora_mimusica_removed` sigue impidiendo que
resucite si se borró a propósito. Decisión documentada ante la
ambigüedad: se prefiere que una lista visible la cree una
acción del usuario en contexto, no el arranque.

### Verificación

- **Check §87** `/tmp/check-vista87.js`: **17/17** — URL
  muerta jamás devuelta (nueva acuñada y cacheada), sin blob
  → `null`, http(s) respetado, `persistTrack` y
  `persistTracksBatch` sin `src` en el registro, reapertura
  con registros contaminados: `src` saneado y el `<audio>`
  recibe URL viva; clic real en el × de la cola con las
  listas intactas y cero escrituras; «Mi Música»: siembra sin
  listas, no-siembra con listas, nacimiento por importación
  solo con lo importado y no-resurrección tras borrado.
- Regresiones: §86 **28/28**, §85 **21/21**, §84 **15/15**,
  §83 **22/22**, §82 **17/17**, §81 **41/41**, §80 **21/21**.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

---

## 88. Duplicados: qué copia se conserva lo elige el usuario

Petición: «en duplicado el usuario elija manualmente qué copia
dejar». Hasta §87 la hoja de duplicados protegía siempre la
copia más antigua (la «original»: suele tener estrellas, listas
y reproducciones) y solo dejaba borrar las demás una a una: era
imposible quedarse con una copia mejor llegada después (p. ej.
un FLAC en lugar del MP3 viejo).

### Cambios

- **`findDuplicateGroups()`** ahora expone la `key` del grupo
  (título+artista normalizados); su `keep` queda como **valor
  por defecto** (la más antigua), sin cambiar su contrato (§81).
- **`renderDuplicates()`** resuelve la copia conservada con la
  elección del usuario (`this._dupKeepSel`, un `Map` por clave
  de grupo que sobrevive a los repintados de la hoja; si la
  elegida ya no está en el grupo, se vuelve al defecto):
  - La conservada lleva la insignia y **no tiene papelera**:
    está protegida.
  - Cada otra copia ofrece **«Conservar esta»** — la insignia
    y la protección se mueven a esa copia — además de su
    papelera individual de siempre (borrable con «Deshacer»).
  - La fila enseña ahora también el **tamaño** del archivo
    (nombre · duración · tamaño): es el dato que permite
    decidir por calidad.
  - Nuevo botón por grupo **«Borrar las demás (n)»**: pide
    confirmación (`duplicates_confirm`, peligro) y borra el
    resto en lote con `{undo:false}`, conservando la elegida.
- **i18n**: la insignia `duplicates_keep` ya no dice
  «Original» (la conservada puede no serlo) y se añaden
  `duplicates_keep_this`, `duplicates_delete_others` y
  `duplicates_confirm` en los **8 idiomas** (paridad verificada
  por el check: 384 claves × 8).
- CSS: `.dup-row.is-keep` con fondo de acento suave,
  `.dup-keep-btn` discreto con borde de acento y
  `.dup-del-others` templado en peligro, ambos ≥32 px táctiles.

El detector de la importación (mismo nombre+tamaño) no se toca:
ahí no hay «copias» entre las que elegir, es el mismo archivo.

### Verificación

- **Check §88** `/tmp/check-vista88.js`: **21/21** — grupo de
  3 con defecto en la antigua (§81 intacto), insignia y
  protecciones correctas, tamaño visible, «Conservar esta»
  mueve la protección y persiste al repintar, cancelar el
  lote no borra nada, «Borrar las demás» deja solo la elegida,
  papelera individual operativa y paridad i18n 8 idiomas.
- Regresiones: §87 **17/17**, §86 **28/28**, §85 **21/21**,
  §84 **15/15**, §83 **22/22**, §82 **17/17**, §81 **41/41**,
  §80 **21/21**.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

---

## 89. Biblioteca: la barra de pestañas queda fija al desplazar

Petición: en Biblioteca, la barra con Listas / Álbumes /
Artistas / Géneros debe quedar fija y no moverse al desplazar
hacia abajo. La barra vivía dentro de `.sheet-body` (la única
región que se desplaza en la hoja), así que se iba con el
contenido en cuanto había suficientes listas o tarjetas.

### Cambio

- `index.html`: `.lib-tabs` sale del cuerpo desplazable y pasa
  a ser hija directa de `.sheet-panel`, entre la cabecera y el
  cuerpo — el mismo patrón que ya mantiene fija la cabecera.
  El panel es columna flexible y el cuerpo sigue siendo el
  único que se desplaza (`flex: 1; overflow-y: auto`).
- `css/styles.css`: `#sheetLibrary .lib-tabs` como franja fija:
  `flex-shrink: 0`, sin margen, con el relleno lateral del
  cuerpo (20 px) para que las pestañas no salten de sitio, el
  filete inferior de las cabeceras y el fondo del panel
  (`var(--bg-2)`), para que se lea como segunda cabecera y no
  como un parche pegado.

Sin cambios de JS: el cableado de pestañas trabaja por clases
(`.lib-tab[data-libtab]`) y las secciones siguen dentro del
cuerpo, que es lo que se desplaza.

### Verificación

- **Check §89** `/tmp/check-vista89.js`: **15/15** — la barra
  ya no está en el cuerpo desplazable, es hija del panel y va
  antes que el cuerpo; las cuatro secciones sí permanecen en
  el cuerpo; la regla CSS fija existe con `flex-shrink: 0` y
  filete; y el comportamiento no cambia: clics en Álbumes,
  Géneros y Listas activan la pestaña, marcan la activa y
  pintan el catálogo (2 álbumes).
- Regresiones: §88 **21/21**, §87 **17/17**, §86 **28/28**,
  §85 **21/21**, §84 **15/15**, §83 **22/22**, §82 **17/17**,
  §81 **41/41**, §80 **21/21**; llaves CSS equilibradas.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

---

## 90. Visualizador: solo la onda (las barras tapaban el cover)

Petición: «en el visualizador solo deja las ondas, las barras
tapan mucho el cover». El modo barras se retira por completo;
el visualizador queda con un único modo, la onda fluida que ya
vivía sobre la parte baja de la portada (§84).

### Cambios (`js/audio.js`, `js/data.js`)

- **Modos**: el ciclo del botón pasa de barras→onda→apagado a
  **onda ↔ apagado**. Por defecto (sin preferencia guardada)
  ahora arranca en onda; con «reduced-motion» sigue arrancando
  apagado.
- **Migración**: un `aurora_visualizer_mode` guardado como
  `bars` se convierte a `wave` al iniciar y se re-persiste;
  `setVisualizerMode('bars')` también normaliza a onda, por si
  quedara cualquier llamador heredado.
- **Código retirado**: la rama de dibujo de barras de
  `drawVisualizerFrame` (la onda queda en línea, sin if/else),
  los helpers exclusivos `_visLogBands`, `_visBarTargets` y
  `_visStepBars`, los resets de su degradado en
  `_fitVisualizerCanvas` y la clave i18n `visualizer_bars`
  (8 idiomas; paridad verificada, 383 claves × 8). Los
  comentarios que citaban las barras se actualizaron.
- **Reposo también en onda**: `_drawVisualizerIdle` pintaba en
  pausa una fila de 48 barras bajas; ahora pinta una línea
  senoidal quieta con los colores de la portada.

Sin cambios de CSS ni HTML: la capa sobre la portada (§84) y
el botón son los mismos; la onda tapa menos porque es trazo y
relleno translúcido, no columnas opacas.

### Verificación

- **Check §90** `/tmp/check-vista90.js`: **19/19** — migración
  `bars`→`wave` con re-persistencia, defecto en onda, `off`
  respetado, ciclo onda↔apagado mostrando/ocultando la capa,
  normalización de `setVisualizerMode('bars')`, helpers y rama
  de frecuencias fuera del código, reposo senoidal, i18n sin
  la clave muerta y con paridad, y dibujo sin analizador sin
  errores.
- **Check §84 actualizado a 14/14**: su segmento de ciclo
  afirmaba el contrato retirado (bars→wave→off→bars); se
  reescribió al contrato §90 (onda↔apagado y «bars» heredado
  migra a onda). El resto de afirmaciones §84 (estructura de
  la capa sobre la portada) no cambian. Queda una afirmación
  menos que las 15 originales porque el ciclo de 3 modos ya
  no existe.
- Regresiones: §89 **15/15**, §88 **21/21**, §87 **17/17**,
  §86 **28/28**, §85 **21/21**, §83 **22/22**, §82 **17/17**,
  §81 **41/41**, §80 **21/21**.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

---

## 91. El «icono horrible» de los estados vacíos, domado

El usuario señaló con captura el icono de «Sin búsquedas
recientes» en Buscar: un mosaico morado sólido de 72 px con
sombra dura, glifo blanco y un halo borroso morado detrás —
pesaba más que el propio mensaje. Ese mosaico es `.empty-icon`,
el componente compartido por TODOS los estados vacíos
(bienvenida, cola, listas, duplicados, buscar…), así que el
arreglo es global, no un parche en una pantalla.

### Cambios (solo `css/styles.css`)

- **`.empty-icon`**: de degradado sólido de acento
  (`--accent-fill`) a **cristal tintado**: lavado de acento al
  20 %/7 % sobre `--surface` con `color-mix` (con repliegue a
  `--surface` si el WebView no lo soporta), filete de 1 px
  teñido, glifo en `--accent` (ya no blanco sobre morado),
  68 px y sombra neutra suave en lugar de la sombra de acento
  `0 16px 36px`. La dirección discreta del resto de la
  interfaz.
- **Halo** `.empty-state::before`: opacidad 0,38 → 0,15 y
  180 → 160 px: un respiro, no una nube morada.
- **`.lrc-empty-icon`** (el gemelo en Letras «sin letra»):
  mismo trato de cristal, pero el lavado lleva un susurro de
  los colores de la portada que suena (`--cover-from/--cover-to`,
  §75) y el glifo pasa de blanco a acento.
- **Sin tocar**: el degradado sólido se queda donde es acción
  — botón play, botones primarios —: ahí manda; en un estado
  vacío, sobra.

Sin cambios de HTML ni JS: el marcado (`emptyStateHtml`) y los
glifos (el reloj de historial en Buscar) son los mismos.

### Verificación

- **Check §91** `/tmp/check-vista91.js`: **17/17** — mosaico
  sin degradado sólido, cristal con `color-mix`, filete, glifo
  en acento, halo domado, gemelo de Letras tintado con la
  portada, play intacto, y los estados vacíos (Buscar sin
  recientes, Duplicados vacío) pintándose igual que antes.
  (Dos fallos iniciales fueron del propio check: hay varias
  reglas con el mismo selector y hay que afirmar sobre la
  cascada completa, no sobre la primera.)
- Regresiones: §90 **19/19**, §89 **15/15**, §88 **21/21**,
  §87 **17/17**, §86 **28/28**, §85 **21/21**, §84 **14/14**,
  §83 **22/22**, §82 **17/17**, §81 **41/41**, §80 **21/21**.

Nota honesta: jsdom no pinta CSS, así que el resultado visual
se confirma en el dispositivo, como el resto de la UI.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

## 92. Más pequeños detalles que dañaban la app (y dos que solo lo parecían)

Tras §91 el usuario pidió buscar más detalles pequeños del mismo
tipo. Auditoría dirigida: iconos usados frente a definidos
(53 referencias, todas definidas — sin iconos invisibles),
sombras y degradados, textos bajo la escala tipográfica, objetivos
táctiles, cabeceras de hoja y atributos ARIA. Los degradados
sólidos de play y botones primarios son acción deliberada y no se
tocan; los desenfoques ambientales (resplandor de portada, fondo
difuminado) son diseño, no defecto.

### Arreglos reales

- **Insignias a 10 px, fuera de la escala**: las estrellas de las
  filas (`.row-rating`), la insignia «Inteligente» (`.smart-badge`)
  y «Se conserva» de duplicados (`.dup-keep`) pasan a
  `var(--fs-micro)` (11 px), la talla menor del sistema. No queda
  ningún `font-size: 10px` en el CSS.
- **Títulos de hoja sin elipsis**: `.sheet-header h3` podía
  desbordar con un nombre de lista largo y empujaba el botón de
  cerrar; ahora queda en una línea con elipsis (`nowrap` +
  `overflow: hidden` + `text-overflow: ellipsis` + `min-width: 0`,
  imprescindible en un hijo flex).
- **Pestañas de Biblioteca mudas para lectores de pantalla**: el
  contenedor ya era `role="tablist"`, pero los botones no eran
  `role="tab"` ni anunciaban su estado. Añadidos `role="tab"` y
  `aria-selected` inicial en `index.html`, y `setLibTab()`
  (`js/nav.js`) sincroniza `aria-selected` con la clase `active`
  en cada cambio.

### Saneos: valores muertos que parecían botones diminutos

La primera pasada de la auditoría «vio» botones de 28–30 px en la
barra de Letras y un asa de arrastre de 28 px. La cascada completa
demostró que el render ya era correcto: el bloque final de la
barra impone 36 px (34 px en pantallas ≤360) y el bloque táctil
del asa impone 40×44. Eran **valores muertos engañosos** en reglas
intermedias — la misma trampa que sesgó el primer check de §91.
Se alinean a 32 px para que ningún valor suelto parezca (ni
vuelva a ser) un botón bajo el suelo táctil, y se retira la regla
muerta `.empty-icon .ico {32px}`: la de 28 px de §91 mandaba por
orden de cascada y la temprana solo invitaba a «corregirla».

### Verificación

- **Check §92** `/tmp/check-vista92.js`: **17/17** — insignias en
  escala, elipsis, pestañas con rol y estado sincronizado vía
  clics reales, bloque final de Letras intacto (36/32 px), asa en
  40×44, regla muerta fuera, y las pestañas fijas de §89 en su
  sitio. (Dos rondas de corrección fueron del propio check:
  aserciones sobre reglas intermedias en vez de la cascada final,
  e IDs de botones supuestos en lugar de los reales.)
- Regresiones: §91 **17/17**, §90 **19/19**, §89 **15/15**,
  §88 **21/21**, §87 **17/17**, §86 **28/28**, §85 **21/21**,
  §84 **14/14**, §83 **22/22**, §82 **17/17**, §81 **41/41**,
  §80 **21/21** (`/tmp/check-audit80.js`).

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

## 93. Auditoría de código muerto: todos los cadáveres fuera

El usuario pidió una auditoría de código muerto y eliminar
«todos los cadáveres». Batería estática propia (`/tmp/audit93*.js`)
por categorías — claves i18n, clases y variables CSS, selectores
`#id`, iconos, IDs, funciones/métodos, locales y archivos —, con la
regla de las §80/§92: cada candidato se verifica a mano por todas
sus vías de uso dinámico antes de podar.

### Cadáveres extirpados

- **El clúster del selector de pistas** (el cadáver grande): el
  modo «añadir a lista existente» de la hoja de crear quedó
  inalcanzable en la §81 (las pistas se añaden desde la vista de
  edición), pero sobrevivía entero: `openAddTracksSheet()`, el
  campo `_addingToPlaylistId` con sus resets en tres archivos,
  la rama «añadir» del botón Guardar, `renderPickTracks()` (se
  seguía llamando al arrancar para pintar filas invisibles), el
  DOM `#pickTracksSection`, las CSS `.pick-row`/`.pick-tracks-*`/
  `.in-pl-*`/`.row-check` (su única creadora era el selector) y
  8 claves i18n que solo ese modo usaba. La creación sigue
  naciendo vacía y el toast «creada con pistas», inalcanzable,
  también se fue.
- **2 claves i18n ya muertas**: `playlist_title` y
  `stats_never_played`. Total: 383 → **373 claves × 8 idiomas**,
  sin huecos y con cero referencias colgadas.
- **6 variables CSS sin un solo consumo**: `--accent-3`,
  `--success`, `--warning`, `--gap`, `--radius-xs`, `--radius`
  (quedan 56, todas usadas; la familia `--radius-sm/-cover/-pill`
  sigue viva).
- **3 métodos sin llamadores**: `findDuplicateTrack()` (la
  deduplicación viva es el índice `_dupKey` O(1) de importar),
  `_addTrackIdToPlaylist()` (su comentario decía «la usan el
  flujo individual y el lote»: mentía) y el alias histórico
  `searchPlayContextFor()`.
- **2 variables locales muertas** en el parser ID3
  (`js/uploader.js`): `unsync` y `frameFlags` se calculaban y
  nadie las leía.
- **2 archivos**: `assets/icons.svg` (el sprite vive inline en
  `index.html`; el .svg viajaba **dentro del .xdc instalado**
  sin que nada lo cargue) y `docs/AUDITORIA.md` (informe del
  árbol de la 1.1.1, ya retirado; el informe vivo es este).

### Sospechosos absueltos (no tocar)

- **`i-volume-xmark`**: parece sin uso, pero `audio.js` lo pide
  por nombre construido (`#i-' + name`). Vivo.
- **29 clases CSS** que el escaneo «preciso» marcó: todas se
  aplican vía `className`/`classList` en JS (verificadas una a
  una). **0 IDs muertos**, 0 selectores `#id` huérfanos (los
  «huérfanos» eran colores hex `#dc2626`…), y `.gitignore` no es
  un cadáver, es configuración.
- La primera versión de la batería mintió dos veces (corpus de
  variables sin el propio CSS; extracción i18n con la estructura
  al revés): se corrigió la batería, no la app.

### Verificación

- **Check §93** `/tmp/check-vista93.js`: **28/28** — los métodos
  y el estado ya no existen en el objeto App, el selector no está
  en el DOM, 373×8 sin referencias colgadas, iconos íntegros, y
  los flujos vivos tras la cirugía: crear lista (nace vacía),
  guardar cola como lista, editar lista, `_dupKey`. (Tres fallos
  iniciales fueron del check: comentarios de documentación con
  ejemplos `t('key')` y la cola montada con objetos en vez de
  IDs.)
- Re-auditoría tras la poda: 0 candidatas i18n, 0 variables,
  0 funciones huérfanas.
- Regresiones: §92 **17/17**, §91 **17/17**, §90 **19/19**,
  §89 **15/15**, §88 **21/21**, §87 **17/17**, §86 **28/28**,
  §85 **21/21**, §84 **14/14**, §83 **22/22**, §82 **17/17**,
  §81 **41/41**, §80 **21/21**.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

## 94. Informe de bugs externo sobre la 1.2.0: verificado punto a punto

Llegó un «Resumen de Bugs — Aurora Music Player v1.2.0» externo. Siguiendo
la regla de la casa, **ninguna afirmación se dio por buena**: cada punto se
contrastó con el código de `814e383` antes de tocar nada. El informe es una
foto anterior: cita como deuda viva cosas ya cerradas en §§92-93
(`openAddTracksSheet`, `findDuplicateTrack`, `assets/icons.svg`, las «3
claves i18n», `--gap`) y sus números de línea no coinciden con el árbol
actual. Resultado del contraste: 33 correcciones reales aplicadas, 1 falso
positivo confirmado por la especificación y los «documentados sin corregir»
fuera de alcance (límites de plataforma). Detalle por grupos, con la clave
del informe:

- **Interacción (C1–C5):** Espacio ya no secuestra botones/enlaces/
  `[role=button]`/`select` enfocados (solo actúa con el foco libre); Escape
  cierra la **cima de la pila** de hojas (`_sheetStack`), no la última del
  DOM; el parser LRC ya no crea entradas con texto en blanco ni rompe con
  sellos múltiples; el contador de escucha tiene techo de reloj de pared
  (ver A5) para que un `pagehide` tras horas no regale minutos fantasma
  (C5/S3 compartían raíz).
- **Audio (A1–A5):** un archivo corrupto provoca **un** salto, no dos
  (candado `_decodeSkipTimer` antes de contar); la ventana del gapless
  deja 0.35 s reales de margen; `loadTrackPaused` limpia A-B y restaura
  las preferencias de letra (A3) y **retira el `src`** cuando la pista no
  tiene fuente, sin arrastrar el audio anterior (A4); las bases del
  contador de escucha se reasientan en `seekTo`/`seekToTime` (A5) y el
  flush vive en `js/settings.js`.
- **Eventos (E3–E5):** las teclas sobre los botones del mini-player ya no
  abren el reproductor por accidente; un volumen guardado de 0 se restaura
  como 0 (`>= 0`); `chkPreservePitch` tiene un solo listener `change`.
- **Letras (Y2–Y6):** las líneas sin sello (créditos) se anclan a la
  temporizada anterior en vez de amontonarse en t=0; los sellos se
  escriben sin `[00:60.00]` (las centésimas redondean el total, no el
  resto); el parser acepta `[h:mm:ss.xx]` y coma decimal; la
  sincronización RAF se duerme a 250 ms con la pestaña oculta y se
  despierta al volver; el arranque de la RAF es único.
- **Reproductor/interfaz (U1, P1–P3):** cancelar el temporizador de sueño
  ya no pausa la música (el fade comprueba su propio candado); cada
  lienzo de portada lleva sello (`_coverToken`) que invalida las cargas
  tardías; el buffer nunca enseña ∞ ni `NaN%`; la insignia de repetición
  es decorativa para el lector de pantalla.
- **Ajustes/datos (S2–S5, I1–I4):** las estadísticas se validan siempre
  tras cargar (ya no solo al importar); el crossfade se acota a [0,12] s;
  `text3` del tema oscuro sube a 0.58 (y el tema que lo bajaba, a la par);
  las listas avisan si IndexedDB se queda sin cuota; se registra el tiempo
  escuchado antes de salvar la sesión en `pagehide`; los borrados de
  IndexedDB ya no tragan errores en silencio; y **ningún** camino de
  persistencia guarda campos transitorios (`_lrcCache`, `_lrcCacheKey`,
  `_thumbsHiRes`…) — conservando `_tagsChecked`, como manda §85.
- **Biblioteca (L1–L9):** borrar una pista (confirmado o sin deshacer)
  purga sus estadísticas y su historial; deshacer la devuelve a la cola
  **en su posición** (y al orden original); editar una pista a mano la
  marca `_userEdited` y el re-etiquetado ya no la pisa; el retag converge
  (`!_tagsChecked`); `persistPlaylist` solo corre si la lista contenía la
  pista; el historial se refresca al borrar/deshacer, usa `trackMap()` y
  escapa su texto vacío; el toast «Procesando X archivos» sustituye la X.
- **Cola/stats (Q1, Q2, R1, D1):** las filas de la cola resuelven pistas
  con un solo `trackMap()`; la rama vacía desvincula la lista virtual;
  `playNext` acota también por arriba la posición calculada; «hace X días»
  nunca es negativo.
- **Tema/accesibilidad (T1–T6, H1–H3):** `--radius-md: 16px` deja de ser
  un hueco silencioso; los cinco blancos-sobre-acento usan
  `--accent-fill`; `.empty-hint` pasa a `--text-3`; los sliders tienen
  foco visible; los `textarea` son seleccionables; los **cuatro**
  degradados con el rosa cableado (el informe contaba dos; el grep tras
  la corrección halló otros dos) usan variables de acento; el indicador
  de buffer anuncia con `role="status"`, el editor LRC tiene nombre
  accesible y cinco lienzos puramente decorativos llevan `aria-hidden`
  (el del visualizador ya lo tenía).

**Falso positivo, no tocado:** `sendToChat({file, text})` es correcto
según la especificación webxdc (API de GitHub, `src/spec/sendToChat.md`).

**Nota de verificación:** el reinicio del entorno borró `/tmp` entero
(arnés y checks §§80–93 incluidos). Se reconstruyó el arnés
(jsdom 24 + fake-indexeddb 6, con tapón de canvas) y se escribió el check
§94 desde cero; las regresiones antiguas no pudieron re-ejecutarse tal
cual y se sustituyeron por un humo consolidado de los invariantes
durables documentados — sin afirmar como re-ejecutados los conteos
17/17…21/21 históricos.

### Verificación

- **Check §94** `/tmp/check-vista94.js`: **58/58** — runtime real para
  C1/C2/E3 (teclado y pila de hojas con DOM adverso), C3/Y2/Y4 (parser),
  Y3 (sellos), C5 (techo de pared), A1 (doble aviso = un salto),
  A3/A4 (higiene de `loadTrackPaused`), S2, L1/L2/L3/L4/L5 (borrar,
  deshacer en posición, purga, marcas), y aserciones de fuente/CSS/HTML
  para el resto (A2/A5/U1/P1/P2/P3/E4/E5/S4/S5/I1/I2/I4/L7/Q2/R1/D1,
  T1–T6, H1–H3), más i18n 373×8 sin colgadas y §92/§93 vivos.
  Cuatro fallos iniciales fueron del propio check (aritmética 1:00:02,
  `cover: null` imposible en pistas reales, el tapón de canvas del
  arnés, y contar como listener la sincronización de UI del checkbox).
- **Humo de regresión** `/tmp/check-regresion.js`: **20/20** —
  invariantes §§79–93 que siguen en pie (sin `#togglePauseUnplug`,
  `_tagsChecked` persistido, dedupe `_dupKey`, cola de IDs solo-onda,
  `--fs-micro`, `webxdc.js` referenciado y no empaquetado, sin sistema
  de backup de §57, sin objectURL persistidos).

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.


## 95. Tocar la portada: pantalla completa con visualizador

Petición expresa: que tocar la portada **no pause** la canción, sino que
la ponga a pantalla completa con el visualizador, y que tocarla de nuevo
vuelva al reproductor. La pausa queda donde siempre debió estar: en el
botón de play (y en Espacio con el foco libre).

### Cómo queda

- **Nuevo modo inmersivo** `cover-fullscreen` (clase en `#viewPlayer`,
  métodos `toggleCoverFullscreen`/`setCoverFullscreen` en
  `js/player-ui.js`, estado `_coverFs` en `js/state.js`, no persistido:
  es un estado de vista). Solo se oculta la interfaz que rodea a la
  portada (barra superior, título, progreso, volumen, controles) y la
  barra inferior de navegación; la portada crece a `min(94vw, 82dvh,
  640px)` y el visualizador pasa del 62 px fijo a un 20 % de su altura.
  Ni el lienzo ni la onda se mueven del DOM: cero repintados, cero
  saltos. En modo ancho (escritorio) la portada inmersiva también
  crece (override con la especificidad necesaria).
- **El visualizador acompaña siempre**: aunque el ajuste guardado sea
  «apagado», dentro del modo la onda se ve (`startVisualizer`,
  `updateVisualizerUI` y el bucle RAF respetan `_coverFs` sin tocar la
  preferencia; al salir, manda otra vez el ajuste). Al entrar en pausa
  se pinta la onda en reposo al nuevo tamaño; al entrar se pide wake
  lock, como en Letras a pantalla completa.
- **Salidas**: tocar la portada otra vez, Escape (con prioridad para
  las hojas abiertas: primero cierran ellas) o cambiar de vista
  (`showView` abandona el modo; al volver al reproductor no resucita).
- **Lo que no cambia** (verificado): deslizar sobre la portada sigue
  cambiando de canción y su clic residual no abre el modo; arrastrar
  en vertical sigue siendo volumen; la pulsación larga, favorito; el
  botón de play sigue pausando. El cambio de pista dentro del modo lo
  mantiene (la portada nueva entra ya en grande).
- **Accesibilidad**: la portada anunciaba «Pausar/Reproducir» y ya no
  hace eso — ahora su nombre es «Ver portada a pantalla completa» /
  «Salir de la portada a pantalla completa» (2 claves nuevas ×8
  idiomas, 375 en total) y `aria-pressed` refleja el modo, no la
  reproducción. La pista visual sobre la portada deja el ▶ engañoso
  y muestra ampliar (⤢) o salir (✕) según el estado.

### Verificación

- **Check §95** `/tmp/check-vista95.js`: **17/17** — tocar no pausa y
  entra; tocar sale; `btnPlay` intacto; Enter entra; Escape respeta
  hojas y luego sale; `showView` abandona; visualizador forzado con
  el ajuste en «off» y restaurado al salir; deslizar = siguiente sin
  abrir el modo; i18n 375×8 sin colgadas.
- Regresiones: §94 **58/58** (con el conteo i18n actualizado a 375)
  y humo consolidado **20/20**.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

## 96. La insignia del modo inmersivo ya no tapa la portada

Petición expresa: los iconos de entrar/salir del modo inmersivo (§95)
interferían la visibilidad de la portada. Y era cierto por partida
triple: la pista visual era un velo sobre **toda** la portada
(`inset: 0` con fondo oscuro y un icono de 42 px en el centro), y en
táctil el `:hover` se quedaba pegado tras el toque, dejando el velo
puesto justo en el modo en que la carátula debería lucir.

### Cómo queda

- `.cover-play-hint` pasa de velo completo a **insignia esquinera**:
  34 px en la esquina superior derecha (lejos del visualizador, que
  vive al pie), fondo propio semitransparente con desenfoque, icono
  de 16 px. La imagen queda siempre limpia; la insignia solo aparece
  al pasar el cursor, al pulsar o dentro del modo al tocar, y sigue
  sin interceptar toques (`pointer-events: none`), oculta al ajustar
  volumen o mientras carga, como antes.
- No cambia nada más: entrar/salir sigue a un toque sobre la
  portada, con Escape o cambiando de vista, y los gestos de siempre
  (deslizar, volumen, pulsación larga) intactos.

### Verificación

- **Check §96** `/tmp/check-vista96.js`: **8/8** — cero velo
  (`inset: 0` fuera), insignia de 34 px en su esquina, icono de
  16 px, no intercepta toques, oculta por defecto/volumen/carga, y
  el modo entra y sale igual.
- **Check §95 recreado** (el reinicio del entorno volvió a borrar
  `/tmp` entero; arnés y check reescritos): **17/17**. Humo de
  regresión §§80–95: **20/20**. El check §94 no se recreó en esta
  ronda (cambio limitado a una regla CSS que §94 no ejercita); no
  se afirma re-ejecutado.

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

## 97. Cinco ideas de la lluvia, implementadas (3, 4, 6, 10, 17 + extra)

De la lluvia de ideas de la sesión anterior, el usuario eligió por
números: **3, 4, 6, 10, 17**, con un añadido propio («al abrir lista
salga donde está la canción que suena») y la nota de que la **9 ya
estaba implementada** — verificado en el código antes de tocar nada:
tocar un verso con timestamp ya saltaba a ese instante
(`js/lyrics.js`, «Tap en una línea con timestamp → saltar a ese
punto (#11)»); queda cubierta por una aserción para que no
desaparezca en silencio.

- **3 · Título que respira.** En el modo inmersivo, título y
  artista flotan sobre la parte baja de la portada
  (`#coverFsMeta`, sobre la onda, decorativo) y se desvanecen a
  los 3,6 s (`_pokeCoverFsMeta`). Reaparecen al entrar, al
  cambiar de canción y con el gesto de volumen. Nunca compiten
  con la portada: texto con sombra, sin velo (lección §96).
- **4 · Onda con memoria.** `_visWavePoints` suavizaba con un
  único tau de 55 ms: en cada silencio y al arrancar cada
  canción la onda «despertaba» de cero. Ahora el ataque sigue
  rápido (55 ms) pero la relajación es lenta (260 ms), y los
  puntos nunca se reinician al cambiar de pista: la onda respira
  entre frases y entre canciones.
- **6 · Cuenta atrás del sleep sin abrir la hoja.** `#sleepStatus`
  ya contaba dentro de la hoja de Sleep, invisible desde fuera;
  ahora la fila «Sleep» del menú Más enseña el tiempo restante
  (`#sleepMenuValue`, `m:ss`, o «Fin de la canción») actualizado
  por el mismo `updateSleepStatus()` que ya corría cada segundo.
- **10 · Cabecera de la cola.** Fila fija (`position: sticky`)
  sobre la lista: «A continuación · N · duración» de lo que
  queda tras la actual (1 clave nueva ×8, 376 en total). En la
  última canción se esconde — no hay «a continuación» que contar.
- **Extra · La lista se abre donde suena.** `openEditPlaylist`
  ya marcaba la fila actual (`.current` + icono); ahora, solo al
  abrir y tras la animación de la hoja, se desplaza hasta ella
  (`scrollIntoView`, bloque centrado). Los re-pintados posteriores
  no secuestran la posición de quien mira otra parte.
- **17 · Portada siguiente preparada.** Al pintar la pista,
  `_preloadNextCover()` decodifica en silencio la imagen de la
  siguiente de la cola («todo» incluida la vuelta); `drawCover`
  la reutiliza si es la misma fuente y pinta al momento, sin
  pasar por el fondo gris de carga. Con gradientes generados no
  hay nada que preparar y la llamada es inocua.

### Verificación

- **Check §97** `/tmp/check-vista97.js`: **19/19** — el título
  flotante entra/cambia/se esconde; la onda sube en el acto y
  tras 200 ms de silencio conserva >25 % del pico (y cae, no se
  congela); la fila Sleep enseña `14:2x`, «Fin de la canción» y
  se limpia; la cabecera dice «A continuación · 2 · 5m 0s» y se
  esconde en la última; abrir la lista desplaza hasta `q2`; la
  precarga deja la siguiente lista sin re-decodificar; la 9
  sigue en su sitio; i18n 376×8 sin colgadas. (Un fallo inicial
  fue del check: esperar `14:30` cuando el segundo ya había
  corrido a `14:29`.)
- Regresiones: **§95 17/17**, **§96 8/8**, humo §§80–96 **20/20**
  (arnés y checks recreados una vez más: el entorno volvió a
  borrar `/tmp` entero entre sesiones; el check §94 no se recreó
  en esta ronda y no se afirma re-ejecutado).

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

## 98. Tres órdenes expresas: iconos fuera, la cola abre donde suena, resumen fuera

- **Iconos del modo inmersivo, eliminados por completo.** Tras el
  velo de §95 y la insignia esquinera de §96, el usuario decide
  que sobre la portada no debe haber ningún icono de entrar/salir:
  quien lo descubra, lo descubre tocando. Fuera `#coverPlayHint`
  del HTML y las diez reglas CSS que lo pintaban (z-index y los
  «ocultar al cargar/volumen» incluidos); quedan notas históricas
  en su lugar. El modo sigue entrando y saliendo a un toque, con
  Escape o cambiando de vista; el título que respira (§97-3) no
  es un icono y se queda. Con esto §96 queda revertida por orden
  expresa y la portada, limpia de verdad.
- **La cola también se abre donde suena.** La §97 llevó el
  desplazamiento a las listas; faltaba la cola del reproductor.
  Nuevo `scrollQueueToCurrent()`: con lista corta centra la fila
  `.current`; con lista virtual (>80) primero lleva el scroll a
  la ventana de la fila (64 px × posición, dos de margen) y pide
  el repintado, y al frame siguiente la centra ya creada. Se
  llama solo al abrir la hoja (`btnQueue`, tras la animación);
  re-pintar la cola por otros motivos no mueve la vista.
- **El «A continuación · N · duración», eliminado por completo.**
  La idea 10 de la §97 no ha cuajado: fuera el HTML
  (`#queueSummary`), el bloque que lo calculaba en
  `renderQueue`, la regla `.queue-summary` y la clave i18n
  (376 → 375 ×8). La cabecera de la cola vuelve a ser solo el
  contexto «Reproduciendo desde X». (El desplazamiento a la
  canción actual, que llegó con la misma tanda, sí se queda y
  se extiende a la cola: eran cosas distintas.)

### Verificación

- **Check §98** `/tmp/check-vista98.js`: **14/14** — sin
  `#coverPlayHint` ni una sola regla `.cover-play-hint`; el modo
  entra/sale a un toque sin iconos; sin `#queueSummary` ni
  referencias en JS/CSS; abrir la cola desplaza hasta `q3`, y
  con 100 pistas el scroll virtual va a los 3072 px de la fila
  50; la onda con memoria y la cuenta atrás del sleep (§97)
  siguen vivas; i18n 375×8 sin colgadas.
- Humo de regresión §§80–98: **21/21** (arnés y checks recreados:
  `/tmp` volvió a aparecer vacío al abrir la sesión; los checks
  §95–§97 no se recrearon en esta ronda y no se afirman
  re-ejecutados — sus supervivientes están cubiertos en §98).

La 1.2.0 sigue en pulido, sin etiquetar ni publicar.

## 100. Auditoría aplicada: la gran poda (sin estrellas y sin release)

Tras la auditoría completa (3 vistas, 23 hojas, 99 botones), el
usuario ordenó aplicar **todos** los cambios mencionados, con dos
condiciones: el sistema de valoración con estrellas **no se toca**
y **no hay release nuevo** hasta nueva orden. Saldo:
**−738/+218 líneas** en 13 archivos.

### Retirado («esto sobra»)
- **Hoja de Volumen zombi**: ningún código la abría desde hacía
  tiempo; fuera hoja, slider y sus referencias en `setVolume`.
  El volumen vive en el gesto de la portada y el slider compacto.
- **El bucle A-B del reproductor**: había dos bucles (A-B y el de
  sección en Letras); queda el de Letras. Fuera botón, rango en la
  barra, métodos, ejecución en `updateProgress` y estado.
- **«Sincronizar tocando» y el karaoke por palabras** de Letras:
  panel, 5 métodos y el troceo `<mm:ss>` por palabra. La letra se
  sigue pudiendo pegar con sellos, y los LRC mejorados se pintan
  limpios (`stripKaraokeTags` se queda como limpieza de texto).
- **Modo vinilo** (disco decorativo): DOM, CSS, ajuste y método.
- **«Iniciar radio»** del menú de pista y `startRadio` (solapaba
  con aleatorio y listas inteligentes).
- **Compartir estadísticas** (botón y método; la hoja se queda).
- **La ayuda de atajos se oculta sin teclado**: en puntero grueso
  la fila de Ajustes ni se muestra; en escritorio sigue igual.
- 21 claves i18n huérfanas de todo lo anterior (363 ×8 al final).

### Simplificado («esto se puede mejorar»)
- **Transición única Corte / Sin pausa / Fundido** en Ajustes:
  un solo selector gobierna gapless y crossfade (la duración solo
  se ve en Fundido; elegirla implica Fundido). Los ajustes
  heredados se derivan sin pérdida (gapless suelto y/o fundido
  con duración → su modo) y se guarda la clave nueva `transition`.
- **Letras jerarquizada**: lo diario (tamaño, pantalla completa,
  cargar/editar/compartir) visible; lo fino (desfase, velocidad,
  bucle, restablecer) plegado tras «Ajustes de letra».
- **Menú ⋯ depurado**: fuera «Ir al artista/álbum» y «Compartir
  pista» (viven en el menú de pista, con su contexto); el ⋯ queda
  para sistema y biblioteca.
- **«Mantenimiento» honesto** en Ajustes: Releer metadatos,
  Liberar espacio y Borrar biblioteca, cada una con una línea que
  dice qué hace y qué destruye (3 claves nuevas ×8).
- **La velocidad, en un solo sitio**: Letras. Fuera el stepper de
  Ajustes.
- **`btnBack` → `btnLoadMusic`**: el botón superior del
  reproductor se llama como lo que hace (cargar música).

### Verificación
- **Check §100** `/tmp/check-vista100.js`: **26/26** — métodos y
  DOM retirados ausentes; transición en sus tres modos + la
  duración que implica Fundido + herencia de ajustes viejos; el
  ajuste fino nace plegado y se despliega; la letra se pinta sin
  `.lrc-word`; «Mantenimiento» con sus tres avisos; `btnLoadMusic`
  abre el selector; **las estrellas siguen intactas**; i18n
  363×8 sin colgadas.
- Humo de regresión: **20/20** (arranque, cola/listas, verso que
  salta, inmersivo, precarga, transición…).
- **Sin release**: el publicado sigue siendo v1.2.0 (§99); esto
  queda en la rama hasta nueva orden.

La 1.2.0 publicada no cambia; el trabajo vive en la rama.

## 101. Los dos trabajos de fondo (y el blindaje, descartado)

De la lista de «funcionalidades realmente necesarias» solo
quedaron tres candidatos, y el usuario decidió: el **blindaje
de datos, no tocar** (se mantiene la reversión de §57: sin copia
de seguridad de ningún tipo, reafirmado expresamente). Los dos
trabajos de fondo, hechos.

### (2) «Reducir movimiento» llega al lienzo
El CSS ya obedecía (bloque global de `prefers-reduced-motion`),
pero el visualizador era un lienzo animado por código y se le
escapaba: quien pedía calma seguía viendo la onda bailar a 60
fps — y en el modo inmersivo ni siquiera podía apagarla (§95 la
fuerza). Ahora:
- `_prefersReducedMotion()` consulta el ajuste **en vivo** (sin
  cachear: el sistema puede cambiar con la app abierta).
- Al arrancar el visualizador con calma activa, no hay bucle:
  se pinta una vez la onda quieta de reposo y se sale. Cubre
  también el modo inmersivo.
- El bucle se autocomprueba en cada pasada y se detiene solo si
  la calma llega a mitad de canción (por si un WebView no
  emite el evento `change`; si lo emite, un oyente registrado
  en `initVisualizer` para/detiene al instante).
- La flotación de la portada (`.cover-art.playing`) se apaga
  del todo bajo `prefers-reduced-motion` en CSS: el bloque
  global solo acortaba duraciones, y una animación infinita
  acortada sigue «viva».

### (3) Bibliotecas grandes: el detalle de lista, virtualizado
Medido con una biblioteca sintética de 3.000 pistas: la cola,
Favoritos y la búsqueda ya usaban la lista virtual (>80), pero
el **detalle/edición de lista pintaba las 3.000 filas** — cada
una con su canvas, sus listeners y su portada — en cada
apertura y en cada re-pintado. Era el único agujero.
- `renderEditPlaylist` construye la fila con una fábrica
  (`makeEditRow`) y pinta con `fillVirtualList` (umbral 80,
  filas de 64 px, la misma máquina probada en la cola). La
  fila conserva TODO: tocar reproduce en contexto, menú ⋯,
  pulsación larga, quitar de la lista y portada.
- Abrir donde suena (§97) sobrevive a la virtualización con el
  patrón de la cola (§98): scroll a la ventana de la fila,
  repintado y centrado.
- `clearPlaylist` y el estado vacío sueltan el estado virtual
  (`unbindVirtualList`) antes de vaciar, para que ningún
  listener de scroll repinte filas sobre lo nuevo.
- En jsdom la lista de 3.000 pasa de 3.000 filas a **9 nodos**
  en el DOM (espaciador de 192.000 px incluido); la apertura
  tarda 62 ms en el arnés. Los tiempos de jsdom no son los
  del teléfono (no hay layout real), pero el DOM acotado es
  exactamente lo que alivia al dispositivo.

### Hallazgos de la verificación (fallos menores, corregidos)
- **Portada nula que rompía filas**: la guarda `(typeof
  track.cover === 'object' && track.cover.from)` explota con
  `cover === null` (porque `typeof null === 'object'`), y el
  cargador crea metadatos con `cover: null`. La misma guarda
  frágil vivía en tres sitios (`playlist-ui`, `player-ui`,
  `ui`); los tres ahora comprueban `track.cover && …`.
  (`settings.js` tenía la forma segura y no se tocó.)
- **Bloque muerto de §100**: la visibilidad de «Ir al
  artista/álbum» del menú ⋯ seguía calculándose en
  `player-ui.js` contra elementos ya retirados. Fuera.

### Verificación
- **Check §101** `/tmp/check-vista101.js`: **13/13** — calma
  en arranque, en bucle y a mitad de canción; lista de 3.000
  virtualizada con su espaciador; lista de 50 intacta; vacío
  tras virtual limpio; cola de 3.000 acotada; catálogo sin
  errores; §100 en pie.
- Humo de regresión: **20/20**. Sintaxis global OK. i18n:
  363 claves ×8, 0 colgadas.
- **Sin release**: la publicada sigue siendo v1.2.0 (§99).

## 102. Internacionalización: Prioridad 1 + chino tradicional

Ante la pregunta «¿qué idiomas habría que agregar?», el análisis
señaló un hueco evidente (Alemán: Delta Chat es un proyecto
alemán) y un orden por valor/coste. El usuario aprobó la
**Prioridad 1 «más el chino»**. Matiz importante: el chino ya
existía (`zh`, simplificado); lo que no había era **chino
tradicional** (Taiwán/Hong Kong/Macao), que caía en simplificado
al detectar el idioma. Se interpreta «más el chino» como esa
variante; si era otra cosa, se corrige.

### Lo añadido: 6 idiomas, 363 claves cada uno (2.178 textos)
- **de** Alemán, **uk** Ucraniano, **pl** Polaco, **tr** Turco,
  **id** Indonesio: traducción completa del diccionario,
  preservando el marcador de sustitución `X`, los símbolos
  (♥, ▶) y las comillas de los textos originales.
- **zh-TW** 繁體中文: generado desde el simplificado con
  OpenCC (`s2tw`, conversión mecánica fiable) y conectado en
  `_detectSystemLang`: `zh-TW`, `zh-HK`, `zh-MO` y las
  etiquetas `Hant` ya no caen en simplificado. `zh-CN` sigue
  en simplificado.

### Detalles de implementación
- `SUPPORTED_LANGS` pasa de 8 a 14; el selector de idioma y
  la detección automática son genéricos y no necesitaron más
  cambios (salvo el desvío zh-TW). Nadie asumía códigos de
  dos letras (comprobado por búsqueda).
- El diccionario tiene dos formatos conviviendo (341
  entradas multilínea y 22 de una línea); la fusión trató
  ambos sin reescribir el formato de nadie.
- Honestidad: de/uk/pl/tr/id son traducción automática (la
  del asistente) y el zh-TW, conversión automática. Antes de
  publicar convendría que un nativo eche un vistazo a cada
  idioma; el Español sigue siendo la referencia y el recurso
  ante cualquier clave ausente.

### Verificación
- **Check §102** `/tmp/check-vista102.js`: **9/9** — 14
  idiomas listados; 363×14 sin huecos; `t()` sirve los seis
  (muestra: «Ajustes» → Einstellungen/Налаштування/
  Ustawienia/Ayarlar/Pengaturan/設置); zh y zh-TW difieren
  donde la escritura cambia; el selector pinta 14 opciones;
  la detección resuelve zh-TW/zh-HK→tradicional, zh-CN→
  simplificado, de/uk/id→su idioma; marcador X idéntico en
  las 5.082 cadenas; §100/§101 en pie.
- Humo de regresión: **20/20**.
- **Sin release**: la publicada sigue siendo v1.2.0 (§99).

14 idiomas no cambian la 1.2.0 pública; viven en la rama.

## 103. Micro-pulido: la caché de pistas mira también la identidad

El índice `id → pista` (`trackMap()`, en `state.js`) se
reconstruía perezosamente solo cuando cambiaba el **número**
de pistas. Los mutadores reales invalidan a mano (cargar,
añadir, borrar, deshacer, vaciar: comprobados uno a uno) y
push/splice cambian la cuenta, así que hoy ningún flujo
fallaba. Pero el agujero existía: **reasignar el array con
el mismo número de pistas distintas** habría dejado el mapa
apuntando a pistas que ya no están — la carga inicial hace
precisamente `this.tracks = stored.map(...)`, protegida solo
porque invalida justo después.

### El cambio (una condición, cero comportamiento visible)
- `trackMap()` reconstruye también si `this._trackMapRef !==
  this.tracks`: la identidad del array forma parte de la
  clave de la caché, junto al tamaño.
- `invalidateTrackIndex()` limpia también la referencia.
- Sin cambios, el mapa se reutiliza tal cual: sigue siendo
  perezoso y gratis en el camino caliente.

### Verificación
- **Check §103** `/tmp/check-vista103.js`: **8/8** — el
  escenario del fallo (reasignar 2 pistas por otras 2) ya
  reconstruye; sin cambios se reutiliza la instancia;
  push/splice en el sitio se detectan; la invalidación
  manual sigue forzando reconstrucción.
- Humo de regresión: **20/20**.
- **Sin release**: la publicada sigue siendo v1.2.0 (§99).

En la rama quedan §§100–103 sin publicar; la app pública
no cambia.

## 104. Segunda auditoría aplicada: muertos, duplicados y nicho

Auditoría completa pedida por el usuario (332 métodos, 301
ids, 22 hojas, 363 claves) y aplicada con sus decisiones:
fuera lo muerto, Favoritos con una sola casa, fuera las
listas inteligentes, fuera el Historial («Buscar duplicados»
se queda expresamente), fuera «más saltadas» y «olvidadas»
de Estadísticas. Dormir no se tocó.

### Muerto retirado
- **La hoja de Listas era zombi**: ningún `openSheet` la ha
  abierto jamás en todo el historial; la navegación vive en
  Biblioteca. Y `renderPlaylists()` pintaba **las dos**
  superficies en cada render — trabajo doble para nadie.
  Fuera la hoja, su contador y la rama de filas; la rejilla
  de Biblioteca es la única casa.
- `savePlaylists()` (compat), `AuroraStorage.close()` y
  `limitArtwork()` (jamás llamada; su trabajo se hace en
  línea donde hace falta).
- 18 atributos `id` que nadie referencia (los elementos
  viven; se cablean por clase o `data-*`) y el icono
  `i-tower-broadcast`, huérfano desde §100.

### Duplicado resuelto
- **Favoritos, una sola casa**: su vista. La lista heredada
  con id «favoritos» desaparece de Listas y del
  almacenamiento al cargar (`_settlePlaylists`); los
  corazones (el conjunto de favoritos) no se tocan.

### Nicho retirado, con migración
- **Listas inteligentes**: fuera la UI de creación por
  regla, la insignia, el aviso de edición y el motor. Las
  listas ya creadas **se materializan** al cargar: la regla
  se convierte en sus canciones de hoy (`_legacySmartTracks`,
  el antiguo motor reducido a la migración) y quedan listas
  normales para siempre.
- **Historial**: hoja, botón del menú, registro
  (`_playHistory`), carga y reinicio fuera. «Buscar
  duplicados» se queda por decisión expresa.
- **Estadísticas** conserva reproducciones, tiempo, top
  canciones y top artistas.

### i18n y CSS
- 30 claves huérfanas fuera (inteligentes ×13, historial
  ×6, conteos de la hoja zombi y restos de §100): el
  diccionario baja a **333 claves × 14 idiomas**, sin
  huérfanas ni colgadas. `cover_exit_fullscreen` se queda:
  se usa con clave dinámica (verificado a mano; el escáner
  la daba por muerta y era falso positivo, como
  `toast_cover_*`).
- CSS: restos de la hoja de Volumen (`.volume-row`,
  `.volume-value`), `.smart-badge` y los `.pl-type-*`.

### Verificación
- **Check §104** `/tmp/check-vista104.js`: **13/13** —
  incluye la migración real de una inteligente heredada
  (regla de estrellas → sus canciones, sin `smart`) y la
  expulsión de la lista fantasma de Favoritos.
- Humo de regresión: **20/20**; check §101: **13/13**.
- **Sin release**: la publicada sigue siendo v1.2.0 (§99).

En la rama quedan §§100–104 sin publicar.

## 105. Endurecimiento de la migración de §104

La normalización de listas heredadas (`_settlePlaylists`)
corre al arrancar sobre datos de versiones anteriores, que
no controlamos, y corría **sin red de seguridad**: un dato
raro podría haber interrumpido la carga. Ahora cada lista
se trata aislada:

- La conversión de una lista inteligente se calcula **antes**
  de tocarla: si la regla heredada falla, la lista queda
  exactamente como venía y se sigue con las demás.
- Si el guardado en disco falla, tampoco se propaga: la
  sesión queda normalizada en memoria y el disco se
  reintentará al próximo arranque.
- Una red exterior envuelve todo: normalizar es opcional;
  cargar la biblioteca, no.

Decisión ante la ambigüedad: ante el fallo, la lista rara
**se conserva intacta** en vez de vaciarse o borrarse —
ningún dato del usuario se pierde por un problema de
conversión.

### Verificación
- **Check §105** `/tmp/check-vista105.js`: **8/8** — fuerza
  el lanzamiento de la conversión de una lista y del
  guardado de otras, más basura estructural; nada se
  propaga y el resto se normaliza igual.
- §104 sigue **13/13**; humo de regresión **20/20**.
- **Sin release**: la publicada sigue siendo v1.2.0 (§99).

En la rama quedan §§100–105 sin publicar.

## 107. El usuario borra el release: vuelven A-B y las opciones de Letras

El usuario **eliminó el release 1.2.5** (y su tag) tras
probarlo, por dos ausencias de la poda de §100 que sí usa:
el bucle A-B del reproductor y el menú de Letras con
todas las opciones a la vista. Ambas se restauran aquí;
el resto de §§100–105 queda como estaba. **Sin release**
nuevo hasta nueva luz verde expresa.

### Bucle A-B del reproductor (recuperado, no reinventado)
El código se rescató **literal del tag v1.2.0** (la última
versión sin la poda), no se reescribió:
- Estado `abRepeat {active, a, b}` (state.js), lógica
  `toggleABRepeat`/`clearABRepeat`/`updateABRepeatUI`
  (audio.js: fijar A → fijar B → activo → limpiar, con sus
  avisos y el distintivo `A-B`/`A→`/`A⇄B`), imposición en
  `updateProgress` (player-ui.js: al llegar a B, vuelta a A).
- Botón `#btnABRepeat` en la fila secundaria y marcador
  `#progressAbRange` en la barra, con su CSS (`.ab-btn`,
  `.ab-badge`, `.progress-ab-range` + override de la barra
  centrada; §100 había dejado hasta los comentarios).
- Higiene de v1.2.0: `clearABRepeat()` en los dos caminos
  de cambio de pista — canción nueva, bucle fuera.
- i18n: las 5 claves (`ab_repeat`, `ab_label`, `ab_set_a`,
  `ab_active`, `ab_cleared`) vuelven con sus textos
  originales en los 8 idiomas de entonces; de/uk/pl/tr/
  id/zh-TW se traducen ahora (pendientes de revisión
  nativa, como §102). Su comentario, huérfano sobre
  `settings_preserves_pitch` desde §100, vuelve a casa.

### Letras: todas las opciones, una detrás de otra
Fuera el plegado de §100: `#lrcFineTools` ya no nace
`hidden`, desaparece el botón `#btnLrcTools` (y su wiring
y la regla CSS `[hidden]`), y desfase, velocidad, bucle
de sección y restablecer quedan siempre visibles tras la
barra. La clave `lrc_tools` queda huérfana y sale del
diccionario. El bucle de sección de Letras (lrcLoop) no
se toca: convive con el A-B, cada uno con su rango.

El diccionario pasa de 333 a **337 claves × 14 idiomas**
(+5 A-B, −1 `lrc_tools`), sin huecos.

### Verificación
- **Check §107** `/tmp/check-vista107.js`: **14/14** —
  ciclo A-B completo con reloj falso (fijar A en 30,
  B en 90, imponer el salto a 120 ≥ B, limpiar), panel
  de Letras visible con sus 6 controles, diccionario
  337×14 sin huecos y estrellas intactas.
- Humo de regresión (recreado; `/tmp` se reinició con la
  sesión y arnés y checks se reconstruyeron): **11/11** —
  incluidas las podas §§100/104 que siguen fuera, Buscar
  duplicados vivo y la migración §§104–105 sana. Un fallo
  inicial del humo era del propio humo (nombre real:
  `startSleep`, no `setSleepTimer`); la app estaba bien.
- **Release 1.2.5: eliminado por el usuario** (release y
  tag). El código sigue en `main`; publicar de nuevo
  requiere su luz verde.

## 108. Poda de comentarios y README público limpio

A petición del usuario: fuera de los comentarios del
código todo lo que solo interesa al proceso de desarrollo
(la crónica: referencias «§», peticiones del usuario,
genealogías de versiones, notas de verificación) y el
README sin información interna.

### Qué se quitó y qué se queda (criterio documentado)
- **Fuera**: tokens «§NN» y rangos, «a petición del
  usuario» y familia, «restaurado/tal cual era en vX»,
  comentarios que solo narraban la historia del cambio.
- **Se queda**: el porqué técnico no obvio (trampas de
  API, invariantes, «sin esta guarda pasa esto otro»),
  reescrito en neutro cuando venía mezclado con crónica.
- 378 comentarios reescritos y 2 bloques borrados en
  19 archivos; retoques manuales en la crónica
  superviviente (A-B y Letras, de §107).

### Seguridad de la poda (nada funcional se tocó)
- Procesador consciente de cadenas (tokeniza
  código/cadena/comentario): **ninguna cadena literal
  cambió** en ningún archivo — verificado comparando el
  multiconjunto de literales contra HEAD. (El único
  «diferente», un `"status"` en index.html, era prosa
  dentro de un comentario HTML.)
- `node --check` en todo `js/`, llaves CSS 978/978,
  divs 202/202, `build-xdc.py` compila.
- Un susto real durante la poda: el colapso de líneas
  en blanco pegó un `continue` a una línea de
  build-xdc.py; detectado revisando el diff y revertido.
  El diff del empaquetador queda en un solo comentario.
- Comportamiento: check §107 **14/14** y humo de
  regresión **11/11** tras la poda.

### README
Reescrito para público: sin información de desarrollo
y con los hechos al día — versión 1.2.0 (la única
publicada; la constante de la app ya decía 1.2.0),
14 idiomas, bucle A-B dentro, y fuera lo que ya no
existe (listas inteligentes, historial, sincronía por
toques, «saltadas/olvidadas»). Tamaño del paquete
corregido a lo medido: 26 archivos, ~383 KB. La tabla
de contenido ya no cita documentos internos (un
`docs/AUDITORIA.md` que ni existía); el informe se
conserva en el repo pero el README no lo publicita.

### CHANGELOG
Las secciones publicadas no se tocan (son historial).
En «Sin publicar» y la cabecera se retiran las
referencias «§», crípticas sin el diario interno.

- **Sin release**: la única publicada sigue siendo
  la v1.2.0.

## 109. «Esto no quedó bien»: la barra de Letras, desperdigada

Captura real del usuario (Ado — «Usseewa», letra no
sincronizada): la barra de herramientas de Letras se veía
con el desfase solo en una línea, tamaño y velocidad en
otra, el bucle centrado debajo y las **acciones cortadas
en el borde derecho**. «Esto no quedó bien».

### Causa
Al desplegar el ajuste fino (§107), `#lrcFineTools`
quedó como caja `display:flex; flex-wrap:wrap;
flex-basis:100%` **dentro** de `.lyrics-toolbar`, que es
una fila `nowrap` desplazable. Como pieza de esa fila,
el contenedor reclamaba el 100% del ancho y su propio
wrap repartía los grupos en líneas de fila completa:
exactamente la foto.

### Arreglo (solo CSS)
`.lyrics-fine { display: contents; }`: el contenedor no
genera caja y el grupo de desfase, la velocidad y el
bucle son piezas directas de la fila, **una detrás de
otra** como en el diseño previo (tamaño, desfase,
velocidad, bucle, acciones), alcanzables deslizando.
De paso se repara un comentario roto que la poda de
§108 había dejado junto a la regla («(revierte el
plegado de,)»).

### Verificación
- **Check §109** `/tmp/check-vista109.js`: **9/9** —
  regla `display:contents` única y sin flex-basis/wrap,
  barra en fila desplazable, orden DOM de las 9 piezas,
  A-B y estrellas intactos. jsdom no aplica CSS: el
  layout se verifica por regla y orden; la prueba
  visual final es la del dispositivo.
- §107 **14/14**; humo de regresión **11/11**.
- **Sin release**: la única publicada sigue siendo
  la v1.2.0.
