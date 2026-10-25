# Changelog

Historial de versiones **publicadas** de Aurora Music Player.

## Sin publicar

_(nada por ahora)_

## 1.2.5 — Más ligera, en 14 idiomas

- Limpieza de cara al público: los comentarios del código
  ya no cuentan la crónica interna del desarrollo y el
  README solo trae lo que interesa a quien usa o desarrolla
  la app, incluida la nota que aclara que es un proyecto
  generado por IA.
- Restauraciones a petición del usuario: vuelve el **bucle A-B del reproductor**
  tal cual era en la 1.2.0 (botón en la fila de controles,
  rango marcado en la barra, se limpia al cambiar de
  canción) y el **menú de Letras muestra otra vez todas
  sus opciones una detrás de otra** — desfase, velocidad,
  bucle de sección y restablecer siempre visibles, sin
  botón de despliegue.
- Barra de herramientas de Letras en su sitio: todas las
  opciones vuelven a ir **en una sola fila, una detrás de
  otra** (tamaño, desfase, velocidad, bucle, acciones),
  sin grupos desperdigados ni acciones cortadas.
- Gran poda tras una auditoría completa (§100): fuera la hoja
  de Volumen (nadie la abría), el bucle A-B del reproductor
  (queda el de Letras), «sincronizar tocando» y el karaoke por
  palabras, el modo vinilo, «Iniciar radio» y compartir
  estadísticas. La transición entre canciones es ahora un solo
  control (Corte / Sin pausa / Fundido), el ajuste fino de
  Letras se pliega tras un botón, el menú ⋯ ya no mezcla
  contexto de la canción, y «Mantenimiento» explica qué hace
  y qué destruye cada opción. La valoración con estrellas
  no se ha tocado.
- Trabajos de fondo (§101): el ajuste del sistema «reducir
  movimiento» ahora también calma el visualizador y la
  portada flotante (antes el lienzo seguía animándose), y
  las listas con miles de canciones ya no se pintan enteras
  al abrirlas — el detalle de lista usa la misma lista
  virtual que la cola — sin perder el abrir donde suena.
  De paso, un arreglo menor: una pista sin portada ya no
  puede romper el pintado de las filas. El blindaje de
  datos se evaluó y se descartó expresamente: sin copia de
  seguridad, como estaba.
- Internacionalización (§102): seis idiomas nuevos con el
  diccionario completo (363 textos cada uno) — Alemán,
  Ucraniano, Polaco, Turco e Indonesio, más chino
  tradicional (el simplificado ya estaba), que además ya
  se detecta solo en teléfonos de Taiwán/Hong Kong. La app
  pasa de 8 a 14 idiomas. Las traducciones nuevas son
  automáticas: convendría una revisión nativa antes de
  publicarlas.
- Micro-pulido interno (§103, sin cambio visible): el
  índice que localiza canciones por identificador ahora
  también detecta si la lista entera fue sustituida por
  otra con el mismo número de canciones, para no mirar
  nunca un mapa anticuado.
- Segunda auditoría aplicada (§104): desaparece la hoja
  de Listas que nadie podía abrir (las listas viven en
  Biblioteca y ya no se pintan dos veces), Favoritos
  tiene una sola casa (su vista), se acaban las listas
  inteligentes — las ya creadas se convierten en listas
  normales con las canciones que su regla elegía — y el
  Historial como pantalla propia («Buscar duplicados»
  se queda). Estadísticas conserva lo esencial y el
  diccionario baja a 333 textos por idioma.
- Blindaje interno (§105, sin cambio visible): la
  conversión de listas heredadas al arrancar ahora trata
  cada lista por separado — si alguna diera un problema,
  queda intacta y el resto de la biblioteca carga igual.

## 1.2.0 — Primera versión pública

Primera versión compartida fuera del desarrollo. Incluye, ya
verificado función a función:

- Importación de MP3, M4A, FLAC, WAV, OGG y Opus con metadatos,
  portadas, duración real y deduplicación al reimportar.
- Carga rápida con bibliotecas grandes (§85): el arranque ya no
  relee ni reescribe la biblioteca entera — solo se re-revisan las
  canciones incompletas y quedan marcadas —, las direcciones de
  cada canción se crean al reproducirlas y los FLAC/OGG/Opus ya
  no se leen dos veces al importar.
- Biblioteca con listas editables, Favoritos y «Mi Música»
  automática. Las listas y la cola se ordenan automáticamente por
  estrellas (mejor nota primero, sin nota al final), y el escaparate
  «Más valoradas» de Inicio enseña las mejores notas.
- Valoración de 1 a 5 estrellas en el menú de canción, el reproductor
  y las filas, con insignia visible en las listas y la cola.
- Reproductor con cola, aleatorio, repetir, contexto «Reproduciendo
  desde…», gapless/crossfade, ecualizador, visualizador y temporizador
  de apagado.
- Letras sincronizadas LRC (archivo o incrustadas).
- Limpieza interna (§93): auditoría de código muerto — fuera el
  selector de pistas de la hoja de crear (inalcanzable desde
  que las pistas se añaden en la vista de edición), 10 textos
  sin uso en los 8 idiomas, 6 variables de estilo huérfanas y
  un archivo de iconos que viajaba en la app sin cargarse.
  La app pesa un poco menos y hace exactamente lo mismo.
- Ajustes a petición (§98): la portada a pantalla completa
  ya no lleva iconos de entrar/salir (se descubre tocando);
  la cola de reproducción se abre, como las listas, en la
  canción que está sonando; y desaparece la cabecera
  «A continuación · N» de la cola.
- Cinco detalles que se notan (§97): en la portada a pantalla
  completa, el título flota unos segundos y se desvanece; la
  onda del visualizador ya no «despierta» de cero en cada
  canción; la fila Sleep del menú muestra la cuenta atrás;
  al abrir una lista, la vista va directa a la canción que
  suena; y la portada siguiente se prepara en silencio para
  que cambiar de canción no parpadee.
- Tocar la portada ya no pausa (§95): la abre a pantalla
  completa con el visualizador, y tocarla de nuevo vuelve al
  reproductor (también se sale con Escape o cambiando de
  vista). La pausa se queda en el botón de play. Deslizar
  sobre la portada sigue cambiando de canción y la pulsación
  larga sigue marcando favorito. Los iconos de entrar/salir
  son ahora una insignia pequeña en la esquina, sin velar la
  carátula (§96).
- Ronda de correcciones (§94) tras un informe de bugs externo,
  verificado punto a punto: Espacio ya no secuestra los botones
  enfocados y Escape cierra la ventana que abriste la última;
  un archivo corrupto salta una vez, no dos; cancelar el
  temporizador de sueño ya no pausa la música; las líneas de
  crédito de las letras ya no saltan al principio y se aceptan
  sellos con horas y coma decimal; al borrar una pista el
  historial y las estadísticas quedan limpios, y deshacer la
  devuelve a la cola en el mismo sitio; editar una canción a
  mano ya no lo deshace el re-etiquetado automático.
- Micro-detalles (§92): las insignias (estrellas, «Inteligente»,
  «Se conserva») dejan los 10 px y entran en la escala
  tipográfica; los títulos largos de las hojas se recortan con
  elipsis en vez de empujar el botón de cerrar; y las pestañas
  de Biblioteca (Listas/Álbumes/Artistas/Géneros) ya anuncian
  su estado a los lectores de pantalla.
- Estados vacíos (§91): el icono deja de ser un mosaico morado
  sólido con halo — ahora es un cristal suave tintado con el
  color de acento (y con los colores de la portada en Letras),
  a juego con el resto de la interfaz.
- Visualizador (§90): solo queda la onda fluida sobre la
  portada; el modo de barras de espectro desaparece (tapaba
  demasiado el cover). El botón alterna onda/apagado y quien
  tuviera «barras» guardado pasa a onda automáticamente.
- Biblioteca (§89): la barra de pestañas (Listas, Álbumes,
  Artistas, Géneros) queda fija bajo la cabecera al desplazar
  la lista, sin perderse nunca de vista.
- Duplicados a tu elección (§88): en «Canciones duplicadas» ya
  no manda siempre la copia más antigua — marcas «Conservar
  esta» en la copia que prefieras (cada fila enseña nombre,
  duración y tamaño para decidir por calidad) y puedes borrar
  las demás una a una o todas de una vez.
- Corrección grave (§87): al cerrar y reabrir la app, el
  reproductor ya no salta de canción en canción diciendo que no
  se puede reproducir — las direcciones temporales de cada
  archivo ya no se guardan y se recrean al momento de sonar —,
  y «Mi Música» ya no aparece de sorpresa al arrancar cuando ya
  tienes tus listas: nace al importar canciones sin lista.
- Letras con foco (§86): en la vista de letras solo se lee con
  claridad la línea que está sonando y el resto queda difuminado
  (al desplazar a mano la letra se aclara para buscar un verso);
  sin letra la vista ya no muestra mini reproductor — solo la
  tarjeta para cargar la letra — y el gesto de deslizar para
  cambiar de canción dentro de Letras desaparece.
- Estadísticas (recientes, más reproducidas, historial; solo cuentan las canciones escuchadas enteras) y compartir
  canciones, listas `.m3u8` y letras por `sendToChat`.
- Interfaz en 8 idiomas, temas y colores de acento.
- Pasada visual (§69): portadas renderizadas a la resolución real de
  pantalla (filas ×2, tarjetas y héroe incluidos), pestañas inferiores
  legibles también en oscuro y agarre táctil de la barra de progreso
  ampliado.
- Arreglo (§84): con el visualizador activo la portada ya
  no encoge. El visualizador se dibuja ahora sobre la
  parte baja de la propia carátula y no le quita espacio:
  la portada se ve igual de grande con él encendido o
  apagado.
- Auditoría de la cola por valoradas (§83): «Reproducir
  siguiente» ahora se llama «Reproducir después de la
  canción actual» y MUEVE la canción en vez de duplicarla
  (antes sonaba dos veces); valorar canciones reordena al
  momento lo que queda por sonar; las canciones nuevas de
  la lista entran en la cola por su nota, no al final; el
  avance sin pausa también respeta los cambios de la
  lista; y cada canción de la cola tiene por fin su menú
  «Más opciones» (⋯).
- Arreglo (§82): quitar una canción de la cola ya no la trae
  de vuelta al pasar a la siguiente. La cola manda: solo
  entran las canciones nuevas de la lista (al final) y
  salen las que se borren de la lista.
- Lo que le faltaba a un reproductor normal (§81): ordenación
  manual de listas (título, artista, álbum, duración…, además
  del orden por estrellas), catálogo navegable de Álbumes,
  Artistas y Géneros en Biblioteca, listas inteligentes que
  se rellenan solas (4+ estrellas, un género, nunca
  reproducidas, olvidadas…), guardar la cola como lista,
  sincronizar la letra tocando al ritmo de la canción,
  estadísticas de canciones saltadas y olvidadas, buscador
  de duplicados y fundido suave al pausar/reanudar. Y el
  renombre de listas ahora se puede confirmar (✓/✗, Enter
  o Escape), como debe ser.
- Auditoría general (§80): poda verificada de código muerto
  (37 claves de idioma sin uso en los 8 idiomas, 11 clases CSS
  y 1 enlace JS), con regresión completa de las funciones
  recientes en verde. Sin cambios visibles.
- Fondo del reproductor según la portada (§75): los colores se
  extraen de la carátula (con normalización para no ensuciar ni
  romper el contraste) y tiñen fondo, resplandor y visualizador;
  sin portada o sin color aprovechable, el fondo de acento de
  siempre. Adaptado a tema claro y AMOLED.
- Letras (§74): la línea resaltada va ahora centrada en pantalla
  también en modo normal (antes quedaba alta, al 25 %).
- Letras sin letra (§73): la vista entra en modo limpio (la barra de
  herramientas inútil se oculta y manda la tarjeta de acciones), con
  variante propia cuando no hay ninguna pista cargada.
- Reproductor (§72): barra de progreso con avance continuo, duración
  total que alterna a tiempo restante al tocarla, botón de Letras que
  anuncia si la canción trae letra, nombre accesible del modo de
  repetición y portadas guardadas a 800 px para el lienzo de 720.
- Portadas de Inicio nítidas en pantallas de alta densidad (§71):
  miniaturas y lienzos dimensionados para DPR 3 (384/144 px), con
  actualización automática de las miniaturas guardadas por versiones
  anteriores la primera vez que cada portada se ve en grande.
- Respuesta a auditoría externa con navegador (§70): etiqueta de
  artistas en estadísticas, toast honesto al compartir (enviado vs.
  descargado), foco de teclado contenido en las hojas, objetivos
  táctiles y contraste reforzados, contenido de escritorio acotado y
  visualizador con estado de reposo en pausa.

### Limitaciones de esta versión

- Cada copia del `.xdc` guarda su propia biblioteca: sin
  sincronización entre copias/dispositivos ni copia de seguridad
  integrada. Usa siempre la misma copia.
- La reproducción se detiene al cerrar la app (límite de la
  plataforma WebXDC, sin segundo plano tras cerrar la ventana).
- Verificada en un Delta Chat real por el mantenedor (lista de
  pruebas del INFORME §61, puntos 1–13, todos en verde; §62): se
  publica como versión funcional completa; los fallos se recogen en
  los *issues* de GitHub.
