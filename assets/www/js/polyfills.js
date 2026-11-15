/* =====================================================================
 *  js/polyfills.js — Aurora Music Player
 *
 *  Lo primero que se carga, y a propósito escrito en ES5: si el WebView
 *  del teléfono es antiguo (o el de fábrica, que en algunos equipos se
 *  queda congelado años), la app usa funciones que ese motor no tiene.
 *
 *  Aquí se rellenan las que faltan. No convierte un WebView de 2015 en
 *  uno moderno —el código de la app usa `async`/`await`, que exige
 *  Chrome 55—, pero sí cubre los huecos de los WebView intermedios, que
 *  son los que dan fallos raros: «includes» ausente rompía listas,
 *  `closest` ausente rompía los clics de las filas, etc.
 *
 *  Solo se define lo que NO existe: en un WebView moderno este archivo no
 *  toca nada.
 * ===================================================================== */

(function () {
  'use strict';

  /* Array.prototype.includes (Chrome 47) — se usa a diario. */
  if (!Array.prototype.includes) {
    Array.prototype.includes = function (buscado, desde) {
      if (this == null) throw new TypeError('Array.prototype.includes: this es nulo');
      var lista = Object(this);
      var largo = lista.length >>> 0;
      if (largo === 0) return false;
      var i = parseInt(desde, 10) || 0;
      if (i < 0) i = Math.max(largo + i, 0);
      for (; i < largo; i++) {
        var v = lista[i];
        // SameValueZero: NaN es igual a NaN (indexOf no lo cumple).
        if (v === buscado || (v !== v && buscado !== buscado)) return true;
      }
      return false;
    };
  }

  /* String.prototype.includes (Chrome 41) */
  if (!String.prototype.includes) {
    String.prototype.includes = function (buscado, desde) {
      return String(this).indexOf(String(buscado), desde || 0) !== -1;
    };
  }

  /* Object.assign (Chrome 45) — la app monta casi todo así. */
  if (!Object.assign) {
    Object.assign = function (destino) {
      if (destino == null) throw new TypeError('Object.assign: destino nulo');
      var salida = Object(destino);
      for (var a = 1; a < arguments.length; a++) {
        var fuente = arguments[a];
        if (fuente == null) continue;
        for (var clave in fuente) {
          if (Object.prototype.hasOwnProperty.call(fuente, clave)) salida[clave] = fuente[clave];
        }
      }
      return salida;
    };
  }

  /* Object.entries (Chrome 54) */
  if (!Object.entries) {
    Object.entries = function (obj) {
      var pares = [];
      for (var clave in Object(obj)) {
        if (Object.prototype.hasOwnProperty.call(obj, clave)) pares.push([clave, obj[clave]]);
      }
      return pares;
    };
  }

  /* Array.from (Chrome 45) — FileList y NodeList a arrays. */
  if (!Array.from) {
    Array.from = function (iterable, mapa, esto) {
      if (iterable == null) throw new TypeError('Array.from: iterable nulo');
      var salida = [];
      var largo = iterable.length >>> 0;
      for (var i = 0; i < largo; i++) {
        salida.push(mapa ? mapa.call(esto, iterable[i], i) : iterable[i]);
      }
      return salida;
    };
  }

  /* Array.prototype.find / findIndex (Chrome 45) */
  if (!Array.prototype.find) {
    Array.prototype.find = function (fn, esto) {
      for (var i = 0; i < this.length; i++) {
        if (fn.call(esto, this[i], i, this)) return this[i];
      }
      return undefined;
    };
  }
  if (!Array.prototype.findIndex) {
    Array.prototype.findIndex = function (fn, esto) {
      for (var i = 0; i < this.length; i++) {
        if (fn.call(esto, this[i], i, this)) return i;
      }
      return -1;
    };
  }

  /* Array.prototype.fill (Chrome 45) */
  if (!Array.prototype.fill) {
    Array.prototype.fill = function (valor, desde, hasta) {
      var largo = this.length >>> 0;
      var i = parseInt(desde, 10) || 0;
      if (i < 0) i = Math.max(largo + i, 0);
      var fin = hasta === undefined ? largo : parseInt(hasta, 10) || 0;
      if (fin < 0) fin = largo + fin;
      for (; i < Math.min(fin, largo); i++) this[i] = valor;
      return this;
    };
  }

  /* NodeList / HTMLCollection .forEach (Chrome 51) — usado al pintar. */
  var colecciones = [];
  if (typeof NodeList !== 'undefined') colecciones.push(NodeList.prototype);
  if (typeof HTMLCollection !== 'undefined') colecciones.push(HTMLCollection.prototype);
  for (var c = 0; c < colecciones.length; c++) {
    if (colecciones[c] && !colecciones[c].forEach) {
      colecciones[c].forEach = Array.prototype.forEach;
    }
  }

  /* Element.matches / closest (Chrome 41) — los clics de fila lo usan. */
  if (typeof Element !== 'undefined') {
    var proto = Element.prototype;
    if (!proto.matches) {
      proto.matches = proto.msMatchesSelector || proto.webkitMatchesSelector ||
        function (sel) {
          var nodos = (this.document || this.ownerDocument).querySelectorAll(sel);
          for (var i = 0; i < nodos.length; i++) {
            if (nodos[i] === this) return true;
          }
          return false;
        };
    }
    if (!proto.closest) {
      proto.closest = function (sel) {
        var nodo = this;
        while (nodo && nodo.nodeType === 1) {
          if (nodo.matches(sel)) return nodo;
          nodo = nodo.parentElement || nodo.parentNode;
        }
        return null;
      };
    }
  }

  /* String.padStart / padEnd (Chrome 57) — los tiempos 0:05. */
  if (!String.prototype.padStart) {
    String.prototype.padStart = function (largo, relleno) {
      var s = String(this);
      var r = relleno === undefined ? ' ' : String(relleno);
      var falta = largo - s.length;
      if (falta <= 0 || r.length === 0) return s;
      var extra = '';
      while (extra.length < falta) extra = extra + r;
      return extra.slice(0, falta) + s;
    };
  }
  if (!String.prototype.padEnd) {
    String.prototype.padEnd = function (largo, relleno) {
      var s = String(this);
      var r = relleno === undefined ? ' ' : String(relleno);
      var falta = largo - s.length;
      if (falta <= 0 || r.length === 0) return s;
      var extra = '';
      while (extra.length < falta) extra = extra + r;
      return s + extra.slice(0, falta);
    };
  }

  /* String.prototype.trimStart / trimEnd (Chrome 66) */
  if (!String.prototype.trimStart) {
    String.prototype.trimStart = function () { return String(this).replace(/^\s+/, ''); };
  }
  if (!String.prototype.trimEnd) {
    String.prototype.trimEnd = function () { return String(this).replace(/\s+$/, ''); };
  }

  /* String.prototype.endsWith (Chrome 41) — nombres de archivo. */
  if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (sufijo, largo) {
      var s = String(this);
      var fin = largo === undefined ? s.length : Math.min(Number(largo) || 0, s.length);
      return s.slice(fin - String(sufijo).length, fin) === String(sufijo);
    };
  }
  if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (prefijo, desde) {
      var s = String(this);
      var i = desde || 0;
      return s.slice(i, i + String(prefijo).length) === String(prefijo);
    };
  }

  /* Promise.prototype.finally (Chrome 63) — cadenas de importación. */
  if (typeof Promise !== 'undefined' && Promise.prototype && !Promise.prototype['finally']) {
    Promise.prototype['finally'] = function (fn) {
      var P = this.constructor;
      return this.then(
        function (v) { return P.resolve(fn()).then(function () { return v; }); },
        function (e) { return P.resolve(fn()).then(function () { throw e; }); }
      );
    };
  }

  /* Number.isFinite / isNaN (Chrome 19, pero por si acaso) */
  if (!Number.isFinite) {
    Number.isFinite = function (n) { return typeof n === 'number' && isFinite(n); };
  }
  if (!Number.isNaN) {
    Number.isNaN = function (n) { return typeof n === 'number' && n !== n; };
  }
})();
