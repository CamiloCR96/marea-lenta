import { garmentSVG, GARMENT_TYPES, PATTERNS } from './garments.js';

/* =====================================================================
   Estado
   ===================================================================== */

const $app = document.getElementById('app');
const $cabecera = document.getElementById('cabecera');
const $pie = document.getElementById('pie');
const $edicion = document.getElementById('edicion');
const $avisos = document.getElementById('avisos');
const $anunciador = document.getElementById('anunciador');
const $anunciadorTitulo = document.getElementById('anunciador-titulo');

const HAY_POPOVER = Object.hasOwn(HTMLElement.prototype, 'popover');

const state = {
  content: null, // lo publicado
  draft: null, // lo que se está editando
  estilos: {}, // estilos visuales disponibles
  estiloBase: 'atelier',
  authed: false,
  configurado: true,
  editing: false,
  dirty: false,
  panel: null, // 'mensajes' | 'estilo' | null
  mensajes: null,
  filtro: 'Todo',
  color: {}, // color elegido por prenda
  talla: {},
  ruta: null, // última ruta pintada, para saber de dónde viene una transición
};

const COLORES_EDITABLES = [
  { clave: 'fondo', nombre: 'Fondo' },
  { clave: 'texto', nombre: 'Texto' },
  { clave: 'acento', nombre: 'Acento' },
];

/** Contenido que se muestra: el borrador si hay sesión, lo publicado si no. */
const C = () => (state.authed && state.draft ? state.draft : state.content);

/* =====================================================================
   Utilidades
   ===================================================================== */

const clonar = (o) => JSON.parse(JSON.stringify(o));
const leer = (obj, ruta) => ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function escribir(obj, ruta, valor) {
  const claves = ruta.split('.');
  const ultima = claves.pop();
  const destino = claves.reduce((o, k) => (o[k] ??= {}), obj);
  destino[ultima] = valor;
}
const idNuevo = (prefijo) => `${prefijo}-${Math.random().toString(36).slice(2, 8)}`;
const esHex = (v) => /^#[0-9a-f]{6}$/i.test(v || '');
const hex = (v, def) => (esHex(v) ? v : def);
const urlSegura = (v) => (typeof v === 'string' && /^https:\/\//.test(v.trim()) ? v.trim() : '');

/** Una imagen válida es una subida al sitio (con su tamaño al final) o una dirección https. */
function partesImagen(v) {
  if (typeof v !== 'string') return null;
  const local = v.match(/^(\/media\/[a-f0-9]+)(?:#(\d+)x(\d+))?$/);
  if (local) return { src: local[1], ancho: local[2], alto: local[3] };
  return /^https:\/\//.test(v) ? { src: v } : null;
}

function h(tag, attrs, ...hijos) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo == null || hijo === false) continue;
    el.append(hijo.nodeType ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

/* Iconos de trazo (familia lucide), dibujados en línea para heredar el color del texto. */
const ICONOS = {
  'flecha-der': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'flecha-izq': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'flecha-arriba': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  'flecha-abajo': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  cerrar: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  mas: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  copiar: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  papelera: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  reproducir: '<polygon points="6 3 20 12 6 21 6 3"/>',
  alerta: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
};
function icono(nombre) {
  const caja = h('span', { class: 'icono', 'aria-hidden': 'true' });
  caja.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">${ICONOS[nombre] || ''}</svg>`;
  return caja;
}

function fecha(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso || '';
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

async function api(url, { method = 'GET', body, blob } = {}) {
  const opciones = { method, headers: {}, credentials: 'same-origin' };
  if (blob) {
    opciones.body = blob;
    opciones.headers['Content-Type'] = blob.type;
  } else if (body !== undefined) {
    opciones.body = JSON.stringify(body);
    opciones.headers['Content-Type'] = 'application/json';
  }
  const r = await fetch(url, opciones);
  let datos = null;
  try {
    datos = await r.json();
  } catch {
    /* respuesta sin cuerpo */
  }
  if (!r.ok) {
    const error = new Error(datos?.error || 'No se pudo completar la acción.');
    error.status = r.status;
    throw error;
  }
  return datos;
}

/** Lee un texto a quien usa lector de pantalla. */
function anunciar(texto) {
  if (typeof document.ariaNotify === 'function') {
    document.ariaNotify(texto);
    return;
  }
  // Sin ariaNotify(): región viva que ya está en la página desde la carga.
  $anunciador.textContent = '';
  $anunciadorTitulo.hidden = false;
  setTimeout(() => {
    $anunciador.textContent = texto;
  }, 80);
}

/**
 * Aviso flotante. Los de error se quedan hasta que alguien los cierra;
 * los demás se van solos, salvo que el foco esté dentro.
 */
function aviso(texto, tipo = 'ok') {
  const focoPrevio = document.activeElement;
  const cerrarBtn = h('button', { type: 'button', class: 'aviso__cerrar', 'aria-label': 'Cerrar aviso' }, icono('cerrar'));
  const el = h('div', { class: `aviso aviso--${tipo}` }, tipo === 'error' && icono('alerta'), h('p', null, texto), cerrarBtn);
  let reloj = null;

  const cerrar = (manual) => {
    clearTimeout(reloj);
    const teniaFoco = el.contains(document.activeElement);
    const vecino = el.nextElementSibling || el.previousElementSibling;
    el.remove();
    if (!$avisos.children.length && HAY_POPOVER && $avisos.matches(':popover-open')) $avisos.hidePopover();
    if (manual && teniaFoco) {
      const destino = vecino?.querySelector('.aviso__cerrar') || (focoPrevio?.isConnected ? focoPrevio : $app);
      destino.focus();
    }
  };
  cerrarBtn.addEventListener('click', () => cerrar(true));

  $avisos.append(el);
  if (HAY_POPOVER && !$avisos.matches(':popover-open')) $avisos.showPopover();
  anunciar(texto);

  if (tipo !== 'error') {
    const programar = () => {
      reloj = setTimeout(() => (el.contains(document.activeElement) ? programar() : cerrar(false)), 5000);
    };
    programar();
  }
}

/** Botón que pide una segunda pulsación antes de hacer algo que no se deshace. */
function dosPasos(boton, textoConfirmar, accion) {
  const original = [...boton.childNodes];
  let temporizador = null;
  const restaurar = () => {
    delete boton.dataset.armado;
    boton.replaceChildren(...original);
  };
  boton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (boton.dataset.armado) {
      clearTimeout(temporizador);
      restaurar();
      accion();
      return;
    }
    boton.dataset.armado = '1';
    boton.textContent = typeof textoConfirmar === 'function' ? textoConfirmar() : textoConfirmar;
    temporizador = setTimeout(restaurar, 3500);
  });
  return boton;
}

/* ---------- color y contraste ---------- */

function luminancia(color) {
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Estilo elegido más los colores que el equipo haya cambiado a mano. */
function temaActual() {
  const tema = C()?.theme || {};
  const id = state.estilos[tema.preset] ? tema.preset : state.estiloBase;
  const base = state.estilos[id];
  const tokens = { ...base.tokens };
  const propios = tema.colores || {};
  for (const { clave } of COLORES_EDITABLES) if (esHex(propios[clave])) tokens[clave] = propios[clave];
  if (esHex(propios.acento) || esHex(propios.fondo)) {
    // Un acento elegido a mano se usa como color de texto solo si se lee sobre el fondo.
    tokens['sobre-acento'] = contraste(tokens.acento, '#ffffff') >= contraste(tokens.acento, '#111111') ? '#ffffff' : '#111111';
    tokens['acento-texto'] = contraste(tokens.acento, tokens.fondo) >= 4.5 ? tokens.acento : tokens.texto;
  }
  return { id, base, tokens };
}

function aplicarTema() {
  if (!state.estilos[state.estiloBase]) return;
  const { id, base, tokens } = temaActual();
  const raiz = document.documentElement;
  raiz.dataset.estilo = id;
  for (const [clave, valor] of Object.entries(tokens)) raiz.style.setProperty(`--${clave}`, valor);
  const fuentes = document.getElementById('fuentes');
  if (fuentes && fuentes.getAttribute('href') !== base.fuentes) fuentes.setAttribute('href', base.fuentes);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.fondo);
}

/* =====================================================================
   Piezas del modo edición
   ===================================================================== */

function marcarCambio() {
  state.dirty = true;
  actualizarBarra();
}

/** Cambio que altera la estructura (listas, fotos): hay que volver a pintar. */
function cambioEstructural() {
  marcarCambio();
  pintar({ mantenerScroll: true });
}

/**
 * Texto ligado a una ruta del contenido.
 * En modo edición se puede escribir directamente sobre él.
 */
function T(ruta, tag = 'span', { cls = '', multi = false, vacio = 'Escribe aquí' } = {}) {
  const valor = leer(C(), ruta) ?? '';
  const el = h(tag, { class: cls || null });

  if (!state.editing) {
    if (multi) {
      for (const parrafo of String(valor).split(/\n{2,}/)) {
        if (!parrafo.trim()) continue;
        const p = h('p');
        parrafo.split('\n').forEach((linea, i) => {
          if (i) p.append(h('br'));
          p.append(linea);
        });
        el.append(p);
      }
    } else {
      el.textContent = valor;
    }
    return el;
  }

  el.textContent = valor;
  el.classList.add('editable');
  if (multi) el.classList.add('editable--multi');
  el.dataset.vacio = vacio;
  el.spellcheck = true;
  try {
    el.contentEditable = 'plaintext-only';
  } catch {
    el.contentEditable = 'true';
  }
  el.addEventListener('input', () => {
    const texto = multi ? el.innerText.replace(/\n{3,}/g, '\n\n').trimEnd() : el.textContent.replace(/\s*\n\s*/g, ' ');
    escribir(state.draft, ruta, texto);
    marcarCambio();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !multi) {
      e.preventDefault();
      el.blur();
    }
  });
  el.addEventListener('paste', (e) => {
    e.preventDefault();
    const texto = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, multi ? texto : texto.replace(/\s*\n\s*/g, ' '));
  });
  return el;
}

/** Controles de un elemento de lista: subir, bajar, duplicar y borrar. */
function herramientas(ruta, i, { duplicar = true, alBorrar = null } = {}) {
  if (!state.editing) return null;
  const lista = leer(state.draft, ruta);
  const mover = (d) => {
    const j = i + d;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    cambioEstructural();
  };
  const boton = (nombreIcono, titulo, accion) =>
    h('button', { type: 'button', class: 'herr__btn', title: titulo, 'aria-label': titulo, onclick: (e) => { e.preventDefault(); e.stopPropagation(); accion(); } }, icono(nombreIcono));

  const borrar = h('button', { type: 'button', class: 'herr__btn herr__btn--borrar', title: 'Borrar', 'aria-label': 'Borrar' }, icono('papelera'));
  dosPasos(borrar, '¿Borrar?', () => {
    lista.splice(i, 1);
    if (alBorrar) alBorrar();
    else cambioEstructural();
  });

  return h(
    'div',
    { class: 'herr', contenteditable: 'false' },
    i > 0 && boton('flecha-arriba', 'Subir', () => mover(-1)),
    i < lista.length - 1 && boton('flecha-abajo', 'Bajar', () => mover(1)),
    duplicar &&
      boton('copiar', 'Duplicar', () => {
        const copia = clonar(lista[i]);
        if (copia && typeof copia === 'object' && 'id' in copia) copia.id = idNuevo(String(copia.id).split('-')[0] || 'item');
        lista.splice(i + 1, 0, copia);
        cambioEstructural();
      }),
    borrar
  );
}

function agregar(ruta, fabrica, etiqueta, { alInicio = false, despues = null } = {}) {
  if (!state.editing) return null;
  return h(
    'button',
    {
      type: 'button',
      class: 'agregar',
      onclick: () => {
        let lista = leer(state.draft, ruta);
        if (!Array.isArray(lista)) {
          lista = [];
          escribir(state.draft, ruta, lista);
        }
        const nuevo = fabrica();
        if (alInicio) lista.unshift(nuevo);
        else lista.push(nuevo);
        if (despues) despues(nuevo);
        else cambioEstructural();
      },
    },
    icono('mas'),
    etiqueta
  );
}

/* ---------- imágenes ---------- */

function elegirArchivo() {
  return new Promise((resolver) => {
    const entrada = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true });
    entrada.addEventListener('change', () => {
      resolver(entrada.files[0] || null);
      entrada.remove();
    });
    document.body.append(entrada);
    entrada.click();
  });
}

/** Reduce la foto antes de subirla para que el sitio cargue rápido. */
async function comprimir(archivo, lado = 1600) {
  const mapa = await createImageBitmap(archivo);
  const escala = Math.min(1, lado / Math.max(mapa.width, mapa.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(mapa.width * escala);
  lienzo.height = Math.round(mapa.height * escala);
  lienzo.getContext('2d').drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
  const aBlob = (tipo, calidad) => new Promise((ok) => lienzo.toBlob(ok, tipo, calidad));
  let blob = await aBlob('image/webp', 0.86);
  if (!blob || blob.type !== 'image/webp') blob = await aBlob('image/jpeg', 0.88);
  return { blob, ancho: lienzo.width, alto: lienzo.height };
}

async function subirFoto(ruta) {
  const archivo = await elegirArchivo();
  if (!archivo) return;
  try {
    aviso('Subiendo la foto.', 'info');
    const { blob, ancho, alto } = await comprimir(archivo);
    const { url } = await api('/api/media', { method: 'POST', blob });
    // El tamaño viaja con la dirección para que la página reserve el espacio antes de cargarla.
    escribir(state.draft, ruta, `${url}#${ancho}x${alto}`);
    cambioEstructural();
    aviso('Foto lista. Recuerda guardar los cambios.');
  } catch (e) {
    aviso(e.message || 'No se pudo subir la foto.', 'error');
  }
}

function imagen(valor, alt, { perezosa = true } = {}) {
  const partes = partesImagen(valor);
  if (!partes) return null;
  return h('img', { src: partes.src, alt, width: partes.ancho, height: partes.alto, loading: perezosa ? 'lazy' : null, decoding: 'async' });
}

/** Marco de imagen ligado a una ruta. Si no hay foto, muestra el respaldo. */
function foto(ruta, { alt = '', cls = '', respaldo = null, perezosa = true } = {}) {
  const img = imagen(leer(C(), ruta), alt, { perezosa });
  const caja = h('div', { class: `foto ${cls}` });
  if (img) caja.append(img);
  else if (respaldo) caja.append(respaldo);
  if (state.editing) {
    caja.append(
      h(
        'div',
        { class: 'foto__acciones', contenteditable: 'false' },
        h('button', { type: 'button', class: 'chip-accion', onclick: (e) => { e.preventDefault(); e.stopPropagation(); subirFoto(ruta); } }, img ? 'Cambiar foto' : 'Subir foto'),
        img && h('button', { type: 'button', class: 'chip-accion', onclick: (e) => { e.preventDefault(); e.stopPropagation(); escribir(state.draft, ruta, ''); cambioEstructural(); } }, 'Quitar')
      )
    );
  }
  return caja;
}

/* ---------- campos de formulario del modo edición ---------- */

const campo = (etiqueta, control, ayuda) =>
  h('label', { class: 'campo' }, h('span', { class: 'campo__etq' }, etiqueta), control, ayuda && h('span', { class: 'campo__ayuda' }, ayuda));

function entrada(ruta, { tipo = 'text', repintar = false, marcador = '' } = {}) {
  const el = h('input', { type: tipo, class: 'entrada', value: leer(state.draft, ruta) ?? '', placeholder: marcador });
  el.addEventListener(repintar ? 'change' : 'input', () => {
    escribir(state.draft, ruta, el.value);
    if (repintar) cambioEstructural();
    else marcarCambio();
  });
  return el;
}

/** Grupo de botones para elegir una opción entre pocas. */
function opciones(ruta, lista, etiqueta) {
  const actual = leer(state.draft, ruta);
  return h(
    'div',
    { class: 'campo' },
    h('span', { class: 'campo__etq' }, etiqueta),
    h(
      'div',
      { class: 'opciones', role: 'group', 'aria-label': etiqueta },
      lista.map((o) => h('button', { type: 'button', class: 'opcion', 'aria-pressed': String(o.id === actual), onclick: () => { escribir(state.draft, ruta, o.id); cambioEstructural(); } }, o.label))
    )
  );
}

function casilla(ruta, etiqueta) {
  const el = h('input', { type: 'checkbox', checked: Boolean(leer(state.draft, ruta)) });
  el.addEventListener('change', () => {
    escribir(state.draft, ruta, el.checked);
    cambioEstructural();
  });
  return h('label', { class: 'casilla' }, el, h('span', null, etiqueta));
}

/* ---------- campos de formulario públicos con validación ---------- */

function campoForm(id, etiqueta, control, error) {
  control.id = id;
  if (error) {
    control.dataset.error = `${id}-error`;
    control.setAttribute('aria-invalid', 'false');
  }
  return h('div', { class: 'form__campo' }, h('label', { for: id }, etiqueta), control, error && h('div', { id: `${id}-error`, class: 'form__error' }, icono('alerta'), h('span', null, error)));
}

// El estado visual (:user-invalid) y el de accesibilidad (aria-invalid) deben cambiar a la vez.
(() => {
  const marcados = new WeakSet();
  const anunciados = new WeakSet();
  let reloj = null;
  let campoAnunciado = null;

  const enlazarError = (el, visible) => {
    const idError = el.dataset.error;
    const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== idError);
    if (visible) ids.push(idError);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
  };

  const anunciarError = (el) => {
    const error = document.getElementById(el.dataset.error);
    if (!error) return;
    const etiqueta = el.labels?.[0] ? `${el.labels[0].textContent.trim()}: ` : '';
    clearTimeout(reloj);
    $anunciador.textContent = '';
    campoAnunciado = el;
    // Espera a que el lector termine de anunciar el campo que recibe el foco.
    reloj = setTimeout(() => {
      $anunciador.textContent = `${etiqueta}Error: ${error.textContent.trim()}`;
    }, 500);
  };

  const sincronizar = (el, conAnuncio = false) => {
    if (!el.matches?.('input[data-error], textarea[data-error]')) return;
    if (el.matches(':user-invalid')) {
      if (conAnuncio && !anunciados.has(el)) {
        anunciarError(el);
        anunciados.add(el);
      }
      el.setAttribute('aria-invalid', 'true');
      enlazarError(el, true);
      marcados.add(el);
    } else if (marcados.has(el) || el.getAttribute('aria-invalid') !== 'true') {
      el.setAttribute('aria-invalid', 'false');
      enlazarError(el, false);
      marcados.delete(el);
      anunciados.delete(el);
      if (campoAnunciado === el) {
        clearTimeout(reloj);
        $anunciador.textContent = '';
      }
    }
  };

  document.addEventListener('blur', (e) => sincronizar(e.target, true), true);
  document.addEventListener('input', (e) => sincronizar(e.target));
  document.addEventListener('change', (e) => sincronizar(e.target, true), true);
  // Un envío fallido marca todos los campos; el foco en el primero ya anuncia su error.
  document.addEventListener(
    'invalid',
    (e) => {
      anunciados.add(e.target);
      sincronizar(e.target);
    },
    true
  );
})();

/* =====================================================================
   Piezas visuales
   ===================================================================== */

const TELA_BASE = '#cdbf9f';
const colorDe = (p, i = state.color[p.id] ?? 0) => hex(p.colors?.[i]?.hex ?? p.colors?.[0]?.hex, TELA_BASE);

/** Ilustración técnica de la prenda, o su foto si ya subieron una. */
function prenda(p, { color = colorDe(p), perezosa = true } = {}) {
  const caja = h('div', { class: 'prenda', role: 'img', 'aria-label': p.name || 'Prenda', style: { '--tela': color } });
  const img = imagen(p.image, '', { perezosa });
  if (img) {
    caja.classList.add('prenda--foto');
    caja.append(img);
  } else {
    caja.innerHTML = garmentSVG(p.garment, p.pattern);
  }
  return caja;
}

function muestras(p, alElegir) {
  const colores = (p.colors || []).filter((c) => c && esHex(c.hex));
  if (colores.length < 2) return null;
  const actual = state.color[p.id] ?? 0;
  return h(
    'div',
    { class: 'muestras', role: 'group', 'aria-label': 'Colores disponibles' },
    colores.map((c, i) =>
      h('button', {
        type: 'button',
        class: 'muestra',
        title: c.name,
        'aria-label': `Color ${c.name}`,
        'aria-pressed': String(i === actual),
        style: { '--c': c.hex },
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          state.color[p.id] = i;
          e.currentTarget.parentElement.querySelectorAll('.muestra').forEach((m, j) => m.setAttribute('aria-pressed', String(j === i)));
          alElegir(c.hex, c, i);
        },
      })
    )
  );
}

const cabSeccion = (rutaTitulo, rutaBajada) => h('header', { class: 'sec__cab' }, T(rutaTitulo, 'h2', { cls: 'titulo titulo--lg' }), rutaBajada && T(rutaBajada, 'p', { cls: 'bajada' }));

const enlaceFlecha = (href, texto) => h('a', { href, class: 'enlace' }, h('span', null, texto), icono('flecha-der'));

/** Bloque que es enlace para el público y pieza editable en modo edición. */
function envoltura(href, cls, ...hijos) {
  if (state.editing) {
    return h('article', { class: `${cls} item` }, ...hijos, h('a', { href, class: 'abrir' }, 'Abrir', icono('flecha-der')));
  }
  return h('a', { href, class: cls }, ...hijos);
}

function tarjetaPrenda(p, i, { variante = '' } = {}) {
  const base = `products.${i}`;
  const escenario = h('div', { class: 'tarjeta__escenario escenario', style: { '--tela': colorDe(p) } }, prenda(p));
  const cambiarColor = (color) => {
    escenario.style.setProperty('--tela', color);
    escenario.querySelector('.prenda').style.setProperty('--tela', color);
  };
  return envoltura(
    `/producto/${encodeURIComponent(p.id)}`,
    `tarjeta${variante ? ` tarjeta--${variante}` : ''} revela`,
    herramientas('products', i),
    escenario,
    h(
      'div',
      { class: 'tarjeta__info' },
      T(`${base}.category`, 'p', { cls: 'etq' }),
      T(`${base}.name`, 'h3', { cls: 'tarjeta__nombre' }),
      T(`${base}.short`, 'p', { cls: 'tarjeta__corta' }),
      h('div', { class: 'tarjeta__pie' }, T(`${base}.price`, 'span', { cls: 'precio' }), muestras(p, cambiarColor))
    )
  );
}

/** Respaldo cuando una noticia no tiene foto: su etiqueta, en grande. */
const arteNoticia = (n) => h('div', { class: 'arte', 'aria-hidden': 'true' }, h('span', null, (n.tag || 'Taller').trim()));

const metaNoticia = (n, base) => h('p', { class: 'meta' }, T(`${base}.tag`, 'span', { cls: 'meta__tag' }), h('time', { datetime: n.date }, fecha(n.date)));

function noticiaLider(n, i) {
  const base = `news.${i}`;
  // Sin foto, la noticia líder se sostiene con el titular: una caja vacía no dice nada.
  const conMedia = Boolean(partesImagen(n.image)) || state.editing;
  return envoltura(
    `/noticias/${encodeURIComponent(n.id)}`,
    `nota-lider${conMedia ? '' : ' nota-lider--texto'} revela`,
    herramientas('news', i),
    conMedia && foto(`${base}.image`, { alt: '', cls: 'nota-lider__media', respaldo: arteNoticia(n) }),
    h('div', { class: 'nota-lider__texto' }, metaNoticia(n, base), T(`${base}.title`, 'h3', { cls: 'titulo titulo--md' }), T(`${base}.excerpt`, 'p', { cls: 'bajada' }), !state.editing && h('span', { class: 'enlace' }, h('span', null, 'Leer la nota'), icono('flecha-der')))
  );
}

function noticiaFila(n, i) {
  const base = `news.${i}`;
  return h('li', null, envoltura(`/noticias/${encodeURIComponent(n.id)}`, 'nota-fila', herramientas('news', i), metaNoticia(n, base), h('div', { class: 'nota-fila__texto' }, T(`${base}.title`, 'h3', { cls: 'nota-fila__titulo' }), T(`${base}.excerpt`, 'p', { cls: 'nota-fila__resumen' }))));
}

/* ---------- video ---------- */

// Videos que viven en el propio sitio (carpeta public/video).
const VIDEOS_SITIO = [
  { id: '/video/del-boceto-a-la-prenda.mp4', label: 'Del boceto a la prenda' },
  { id: '/video/nace-una-prenda.mp4', label: 'Solo el boceto' },
  { id: '/video/la-coleccion-puesta.mp4', label: 'Solo la colección puesta' },
];

function analizarVideo(url) {
  // Un video guardado en el propio sitio (carpeta public/video), con su portada al lado.
  const local = typeof url === 'string' && url.trim().match(/^\/video\/[\w-]+\.(mp4|webm)$/i);
  if (local) return { tipo: 'archivo', src: local[0], portada: local[0].replace(/\.(mp4|webm)$/i, '.jpg') };
  const limpia = urlSegura(url);
  if (!limpia) return null;
  let u;
  try {
    u = new URL(limpia);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const idValido = (id) => (/^[\w-]{6,20}$/.test(id || '') ? id : null);
  if (host === 'youtu.be') {
    const id = idValido(u.pathname.split('/')[1]);
    return id ? { tipo: 'youtube', id } : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const partes = u.pathname.split('/').filter(Boolean);
    const id = idValido(u.searchParams.get('v') || (['shorts', 'embed', 'live'].includes(partes[0]) ? partes[1] : ''));
    return id ? { tipo: 'youtube', id } : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = u.pathname.split('/').filter(Boolean).find((x) => /^\d{5,12}$/.test(x));
    return id ? { tipo: 'vimeo', id } : null;
  }
  if (/\.(mp4|webm)$/i.test(u.pathname)) return { tipo: 'archivo', src: limpia };
  return null;
}

function seccionVideo() {
  const c = C();
  const v = analizarVideo(c.video?.url);
  let marco;
  if (v?.tipo === 'youtube') {
    marco = h('iframe', { src: `https://www.youtube-nocookie.com/embed/${v.id}?rel=0`, title: c.video.title || 'Video', loading: 'lazy', allow: 'accelerometer; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true });
  } else if (v?.tipo === 'vimeo') {
    marco = h('iframe', { src: `https://player.vimeo.com/video/${v.id}`, title: c.video.title || 'Video', loading: 'lazy', allow: 'fullscreen; picture-in-picture', allowfullscreen: true });
  } else if (v?.tipo === 'archivo') {
    marco = h('video', { src: v.src, poster: v.portada, controls: true, playsinline: true, preload: 'metadata', width: '1280', height: '720', 'aria-label': c.video.title || 'Video' });
  } else {
    marco = h('div', { class: 'video__vacio' }, icono('reproducir'), h('p', null, state.editing ? 'Aún no hay video. Pega el enlace en el campo de al lado.' : 'Nuestro video llega muy pronto.'));
  }
  return h(
    'section',
    { class: 'sec', id: 'video' },
    h(
      'div',
      { class: 'cont video' },
      h('div', { class: `video__marco${v ? '' : ' video__marco--vacio'} revela` }, marco),
      h(
        'div',
        { class: 'video__texto' },
        T('video.kicker', 'p', { cls: 'kicker' }),
        T('video.title', 'h2', { cls: 'titulo titulo--md' }),
        T('video.text', 'p', { cls: 'bajada' }),
        state.editing &&
          h(
            'div',
            { class: 'ajustes' },
            opciones('video.url', VIDEOS_SITIO, 'Videos del sitio'),
            campo('O un enlace de YouTube o Vimeo', entrada('video.url', { repintar: true, marcador: 'https://www.youtube.com/watch?v=...' }), 'Pega el enlace y pulsa Enter: el reproductor cambia al instante. Si el enlace no es válido, el video no aparece.')
          )
      )
    )
  );
}

/* =====================================================================
   Páginas
   ===================================================================== */

/** Franja con las frases cortas que resumen la marca. */
function banda() {
  const items = C().brand?.ticker || [];
  if (!state.editing && !items.length) return null;
  return h(
    'section',
    { class: 'banda', 'aria-label': 'Lo que nos define' },
    h(
      'ul',
      { class: 'cont banda__lista' },
      items.map((texto, i) => h('li', { class: 'banda__item item' }, state.editing ? T(`brand.ticker.${i}`, 'span') : texto, herramientas('brand.ticker', i, { duplicar: false }))),
      state.editing && h('li', { class: 'banda__item' }, agregar('brand.ticker', () => 'Nueva frase', 'Frase'))
    )
  );
}

function cierre() {
  return h(
    'section',
    { class: 'cierre' },
    h('div', { class: 'cont cierre__fila' }, h('div', { class: 'cierre__texto' }, T('home.closingTitle', 'h2', { cls: 'titulo titulo--lg' }), T('home.closingText', 'p', { cls: 'bajada' })), h('a', { href: '/contacto', class: 'btn btn--primario btn--grande' }, 'Escríbenos', icono('flecha-der')))
  );
}

function inicio() {
  const c = C();
  const todas = c.products.map((p, i) => ({ p, i }));
  const destacadas = todas.filter((x) => x.p.featured);
  const lista = (destacadas.length ? destacadas : todas).slice(0, 3);
  const lider = lista[0];
  const noticias = c.news.map((n, i) => ({ n, i })).slice(0, 4);

  return [
    h(
      'section',
      { class: 'hero' },
      h(
        'div',
        { class: 'cont hero__rejilla' },
        h(
          'div',
          { class: 'hero__texto' },
          T('home.kicker', 'p', { cls: 'kicker' }),
          h('h1', { class: 'titulo titulo--xl' }, T('home.title', 'span'), ' ', T('home.titleAccent', 'em')),
          T('home.lead', 'p', { cls: 'bajada bajada--grande' }),
          h('div', { class: 'acciones' }, h('a', { href: '/producto', class: 'btn btn--primario btn--grande' }, T('home.cta', 'span'), icono('flecha-der')), h('a', { href: '/quienes-somos', class: 'enlace' }, T('home.cta2', 'span')))
        ),
        lider &&
          h(
            'figure',
            { class: 'hero__media' },
            h('a', { href: `/producto/${encodeURIComponent(lider.p.id)}`, class: 'hero__escenario escenario', style: { '--tela': colorDe(lider.p) }, 'aria-label': `Ver ${lider.p.name}` }, prenda(lider.p, { perezosa: false })),
            h('figcaption', { class: 'hero__pie' }, h('span', null, lider.p.name), h('span', { class: 'precio' }, lider.p.price))
          )
      )
    ),
    banda(),
    h(
      'section',
      { class: 'sec' },
      h(
        'div',
        { class: 'cont' },
        cabSeccion('home.featuredTitle', 'home.featuredLead'),
        h('div', { class: 'bento' }, lista.map(({ p, i }, n) => tarjetaPrenda(p, i, { variante: n === 0 ? 'lider' : 'fila' }))),
        h('p', { class: 'sec__mas' }, enlaceFlecha('/producto', `Ver las ${c.products.length} prendas de la colección`))
      )
    ),
    h(
      'section',
      { class: 'sec sec--alt' },
      h(
        'div',
        { class: 'cont manifiesto' },
        T('home.manifesto', 'p', { cls: 'manifiesto__frase' }),
        h(
          'div',
          { class: 'manifiesto__cifras' },
          h('dl', { class: 'indice' }, (c.home.stats || []).map((_, i) => h('div', { class: 'indice__fila cifra item' }, herramientas('home.stats', i), T(`home.stats.${i}.value`, 'dt', { cls: 'cifra__valor' }), T(`home.stats.${i}.label`, 'dd')))),
          agregar('home.stats', () => ({ value: '0', label: 'Nuevo dato' }), 'Dato')
        )
      )
    ),
    seccionVideo(),
    h(
      'section',
      { class: 'sec sec--alt' },
      h(
        'div',
        { class: 'cont' },
        cabSeccion('home.newsTitle', 'home.newsLead'),
        h('div', { class: 'notas' }, noticias[0] && noticiaLider(noticias[0].n, noticias[0].i), h('ul', { class: 'lista-notas' }, noticias.slice(1).map(({ n, i }) => noticiaFila(n, i)))),
        h('p', { class: 'sec__mas' }, enlaceFlecha('/noticias', 'Todas las noticias'))
      )
    ),
    cierre(),
  ];
}

function cabPagina(etiqueta, rutaTitulo, rutaBajada) {
  return h('section', { class: 'portada' }, h('div', { class: 'cont' }, h('p', { class: 'kicker' }, etiqueta), T(rutaTitulo, 'h1', { cls: 'titulo titulo--xl' }), T(rutaBajada, 'p', { cls: 'bajada bajada--grande' })));
}

/** Tendedero con prendas de la colección, usado cuando no hay foto del taller. */
function tendedero() {
  const prendas = C().products.slice(0, 4);
  return h(
    'div',
    { class: 'tendedero', 'aria-hidden': 'true' },
    h('div', { class: 'tendedero__cuerda' }),
    prendas.map((p, i) => h('div', { class: 'tendedero__pieza', style: { '--giro': `${[-4, 3, -2, 4][i % 4]}deg`, '--baja': `${[0.5, 1.5, 1.25, 0.5][i % 4]}rem` } }, h('span', { class: 'tendedero__gancho' }), prenda(p, { color: colorDe(p, 0) })))
  );
}

function quienes() {
  const a = C().about;
  return [
    cabPagina('Quiénes somos', 'about.title', 'about.lead'),
    h(
      'section',
      { class: 'sec sec--pegada' },
      h(
        'div',
        { class: 'cont historia' },
        foto('about.image', { alt: 'El taller', cls: 'historia__media revela', respaldo: tendedero(), perezosa: false }),
        h('div', { class: 'historia__texto' }, T('about.storyTitle', 'h2', { cls: 'titulo titulo--md' }), T('about.story', 'div', { cls: 'prosa', multi: true }))
      )
    ),
    h(
      'section',
      { class: 'sec sec--alt' },
      h(
        'div',
        { class: 'cont' },
        h('dl', { class: 'indice proposito' }, h('div', { class: 'indice__fila' }, h('dt', { class: 'etq' }, 'Misión'), T('about.mission', 'dd', { cls: 'proposito__texto' })), h('div', { class: 'indice__fila' }, h('dt', { class: 'etq' }, 'Visión'), T('about.vision', 'dd', { cls: 'proposito__texto' })))
      )
    ),
    h(
      'section',
      { class: 'sec' },
      h(
        'div',
        { class: 'cont' },
        cabSeccion('about.valuesTitle'),
        h('div', { class: 'valores' }, (a.values || []).map((_, i) => h('article', { class: 'valor item revela' }, herramientas('about.values', i), T(`about.values.${i}.title`, 'h3', { cls: 'valor__titulo' }), T(`about.values.${i}.text`, 'p')))),
        agregar('about.values', () => ({ title: 'Nuevo valor', text: 'Cuenta en una frase por qué importa.' }), 'Valor')
      )
    ),
    h(
      'section',
      { class: 'sec sec--alt' },
      h(
        'div',
        { class: 'cont' },
        cabSeccion('about.teamTitle', 'about.teamLead'),
        h(
          'ul',
          { class: 'equipo' },
          (a.team || []).map((m, i) =>
            h(
              'li',
              { class: 'persona item' },
              herramientas('about.team', i),
              foto(`about.team.${i}.image`, { alt: m.name, cls: 'persona__foto', respaldo: h('div', { class: 'persona__inicial', 'aria-hidden': 'true' }, (m.name || '?').trim().charAt(0).toUpperCase()) }),
              h('div', { class: 'persona__texto' }, T(`about.team.${i}.name`, 'h3', { cls: 'persona__nombre' }), T(`about.team.${i}.role`, 'p', { cls: 'etq' })),
              T(`about.team.${i}.bio`, 'p', { cls: 'persona__bio' })
            )
          )
        ),
        agregar('about.team', () => ({ name: 'Nombre', role: 'Cargo', bio: 'Qué hace en el taller.', image: '' }), 'Persona')
      )
    ),
    cierre(),
  ];
}

const prendaNueva = () => ({
  id: idNuevo('prenda'),
  name: 'Prenda nueva',
  category: 'Camisas',
  price: '$0',
  featured: false,
  garment: 'camiseta',
  pattern: 'liso',
  image: '',
  short: 'Descripción corta de la prenda.',
  description: 'Cuenta aquí cómo es la prenda, para quién está pensada y cómo la desarrollaron.',
  colors: [
    { name: 'Arena', hex: '#d9c39a' },
    { name: 'Añil', hex: '#2438c9' },
  ],
  sizes: 'S, M, L',
  features: [
    { title: 'Tela', text: 'De qué está hecha.' },
    { title: 'Corte', text: 'Cómo queda puesta.' },
  ],
  care: 'Cómo se cuida.',
});

function coleccion() {
  const c = C();
  const categorias = ['Todo', ...new Set(c.products.map((p) => (p.category || '').trim()).filter(Boolean))];
  if (!categorias.includes(state.filtro)) state.filtro = 'Todo';
  const visibles = c.products.map((p, i) => ({ p, i })).filter(({ p }) => state.filtro === 'Todo' || (p.category || '').trim() === state.filtro);

  return [
    cabPagina('Producto', 'productPage.title', 'productPage.lead'),
    h(
      'section',
      { class: 'sec sec--pegada' },
      h(
        'div',
        { class: 'cont' },
        h('div', { class: 'opciones filtros', role: 'group', 'aria-label': 'Filtrar por categoría' }, categorias.map((cat) => h('button', { type: 'button', class: 'opcion', 'aria-pressed': String(cat === state.filtro), onclick: () => { state.filtro = cat; pintar({ mantenerScroll: true }); } }, cat))),
        h('div', { class: 'catalogo' }, visibles.map(({ p, i }) => tarjetaPrenda(p, i))),
        agregar('products', prendaNueva, 'Añadir prenda', { despues: (nueva) => { marcarCambio(); navegar(`/producto/${nueva.id}`); } })
      )
    ),
    h(
      'section',
      { class: 'sec sec--alt' },
      h(
        'div',
        { class: 'cont' },
        cabSeccion('productPage.processTitle', 'productPage.processLead'),
        h('ol', { class: 'indice pasos' }, (c.productPage.process || []).map((_, i) => h('li', { class: 'indice__fila paso item' }, herramientas('productPage.process', i), h('span', { class: 'paso__num', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')), T(`productPage.process.${i}.title`, 'h3', { cls: 'paso__titulo' }), T(`productPage.process.${i}.text`, 'p')))),
        agregar('productPage.process', () => ({ title: 'Nuevo paso', text: 'Qué pasa en esta etapa.' }), 'Paso')
      )
    ),
    seccionVideo(),
    cierre(),
  ];
}

function ajustesPrenda(p, i) {
  const base = `products.${i}`;
  return h(
    'div',
    { class: 'ajustes' },
    h('p', { class: 'ajustes__titulo' }, 'Ajustes de la prenda. Solo se ven en modo edición.'),
    opciones(`${base}.garment`, GARMENT_TYPES, 'Ilustración'),
    opciones(`${base}.pattern`, PATTERNS, 'Estampado'),
    campo('Tallas, separadas por comas', entrada(`${base}.sizes`, { repintar: true })),
    casilla(`${base}.featured`, 'Mostrar en la página de inicio'),
    h('p', { class: 'campo__etq' }, 'Colores'),
    h(
      'div',
      { class: 'ajustes__colores' },
      (p.colors || []).map((col, j) => {
        const selectorColor = h('input', { type: 'color', value: hex(col.hex, TELA_BASE), 'aria-label': 'Color' });
        selectorColor.addEventListener('change', () => {
          escribir(state.draft, `${base}.colors.${j}.hex`, selectorColor.value);
          cambioEstructural();
        });
        return h('div', { class: 'color-fila item' }, selectorColor, entrada(`${base}.colors.${j}.name`, { repintar: true, marcador: 'Nombre del color' }), herramientas(`${base}.colors`, j, { duplicar: false }));
      }),
      agregar(`${base}.colors`, () => ({ name: 'Color nuevo', hex: '#2438c9' }), 'Color')
    ),
    h('p', { class: 'campo__ayuda' }, 'Si subes una foto real de la prenda, reemplaza a la ilustración. Usa los botones que aparecen sobre la imagen.')
  );
}

function fichaPrenda(id) {
  const c = C();
  const i = c.products.findIndex((p) => p.id === id);
  if (i < 0) return noEncontrada('Esa prenda ya no está en la colección.', '/producto', 'Ver la colección');
  const p = c.products[i];
  const base = `products.${i}`;
  const tallas = String(p.sizes || '').split(',').map((t) => t.trim()).filter(Boolean);
  const colorActual = () => p.colors?.[state.color[p.id] ?? 0];

  const nombreColor = h('span', { class: 'ficha__valor' }, colorActual()?.name || '');
  const escenario = h('div', { class: 'ficha__escenario escenario', style: { '--tela': colorDe(p) } }, foto(`${base}.image`, { alt: p.name, cls: 'ficha__foto', respaldo: prenda(p, { perezosa: false }), perezosa: false }));

  const enlacePedido = h('a', { class: 'btn btn--primario btn--grande', href: '/contacto' }, 'Quiero esta prenda', icono('flecha-der'));
  const actualizarPedido = () => {
    const detalle = [colorActual()?.name, state.talla[p.id] && `talla ${state.talla[p.id]}`].filter(Boolean).join(', ');
    enlacePedido.href = `/contacto?prenda=${encodeURIComponent(detalle ? `${p.name} (${detalle})` : p.name)}`;
  };
  actualizarPedido();

  const otras = c.products.map((x, j) => ({ p: x, i: j })).filter((x) => x.i !== i).slice(0, 3);

  return [
    h(
      'section',
      { class: 'ficha' },
      h(
        'div',
        { class: 'cont ficha__rejilla' },
        h('div', { class: 'ficha__lado' }, escenario),
        h(
          'div',
          { class: 'ficha__info' },
          h('a', { href: '/producto', class: 'volver' }, icono('flecha-izq'), 'La colección'),
          T(`${base}.category`, 'p', { cls: 'kicker' }),
          T(`${base}.name`, 'h1', { cls: 'titulo titulo--lg' }),
          T(`${base}.price`, 'p', { cls: 'precio precio--grande' }),
          T(`${base}.description`, 'div', { cls: 'prosa', multi: true }),
          (p.colors || []).length > 0 &&
            h(
              'div',
              { class: 'ficha__bloque' },
              h('p', { class: 'etq' }, 'Color ', nombreColor),
              muestras(p, (color, col) => {
                escenario.style.setProperty('--tela', color);
                escenario.querySelector('.prenda')?.style.setProperty('--tela', color);
                nombreColor.textContent = col.name;
                actualizarPedido();
              })
            ),
          tallas.length > 0 &&
            h(
              'div',
              { class: 'ficha__bloque' },
              h('p', { class: 'etq' }, 'Talla'),
              h(
                'div',
                { class: 'opciones', role: 'group', 'aria-label': 'Tallas' },
                tallas.map((t) =>
                  h('button', {
                    type: 'button',
                    class: 'opcion opcion--talla',
                    'aria-pressed': String(state.talla[p.id] === t),
                    onclick: (e) => {
                      state.talla[p.id] = t;
                      e.currentTarget.parentElement.querySelectorAll('.opcion').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
                      actualizarPedido();
                    },
                  }, t)
                )
              )
            ),
          h('div', { class: 'acciones' }, enlacePedido),
          state.editing && ajustesPrenda(p, i),
          h(
            'section',
            { class: 'rasgos' },
            h('h2', { class: 'etq' }, 'Características'),
            h('dl', { class: 'indice' }, (p.features || []).map((_, j) => h('div', { class: 'indice__fila item' }, herramientas(`${base}.features`, j, { duplicar: false }), T(`${base}.features.${j}.title`, 'dt', { cls: 'rasgo__nombre' }), T(`${base}.features.${j}.text`, 'dd')))),
            agregar(`${base}.features`, () => ({ title: 'Característica', text: 'Descríbela aquí.' }), 'Característica'),
            h('div', { class: 'cuidado' }, h('p', { class: 'etq' }, 'Cuidado'), T(`${base}.care`, 'p'))
          ),
          state.editing &&
            dosPasos(h('button', { type: 'button', class: 'peligro' }, 'Borrar esta prenda'), '¿Seguro? Pulsa otra vez para borrarla', () => {
              state.draft.products.splice(i, 1);
              marcarCambio();
              navegar('/producto');
            })
        )
      )
    ),
    otras.length > 0 && h('section', { class: 'sec sec--alt' }, h('div', { class: 'cont' }, h('header', { class: 'sec__cab' }, h('h2', { class: 'titulo titulo--md' }, 'También del taller')), h('div', { class: 'catalogo' }, otras.map(({ p: x, i: j }) => tarjetaPrenda(x, j))))),
  ];
}

const hoyISO = () => new Date().toISOString().slice(0, 10);
const noticiaNueva = () => ({ id: idNuevo('nota'), title: 'Título de la noticia', date: hoyISO(), tag: 'Novedad', image: '', excerpt: 'Resumen de una o dos líneas.', body: 'Escribe aquí la noticia completa.\n\nDeja una línea en blanco para separar párrafos.' });

function noticias() {
  const lista = C().news.map((n, i) => ({ n, i }));
  return [
    cabPagina('Noticias', 'newsPage.title', 'newsPage.lead'),
    h(
      'section',
      { class: 'sec sec--pegada' },
      h(
        'div',
        { class: 'cont' },
        agregar('news', noticiaNueva, 'Escribir noticia', { alInicio: true, despues: (nueva) => { marcarCambio(); navegar(`/noticias/${nueva.id}`); } }),
        lista.length === 0 && h('p', { class: 'vacio' }, 'Todavía no hay noticias publicadas.'),
        h('div', { class: 'notas notas--pagina' }, lista[0] && noticiaLider(lista[0].n, lista[0].i), h('ul', { class: 'lista-notas' }, lista.slice(1).map(({ n, i }) => noticiaFila(n, i))))
      )
    ),
    cierre(),
  ];
}

function fichaNoticia(id) {
  const c = C();
  const i = c.news.findIndex((n) => n.id === id);
  if (i < 0) return noEncontrada('Esa noticia ya no está publicada.', '/noticias', 'Ver las noticias');
  const n = c.news[i];
  const base = `news.${i}`;
  const otras = c.news.map((x, j) => ({ n: x, i: j })).filter((x) => x.i !== i).slice(0, 3);
  const tieneFoto = Boolean(partesImagen(n.image));
  return [
    h(
      'article',
      { class: 'articulo' },
      h(
        'div',
        { class: 'cont cont--estrecho' },
        h('a', { href: '/noticias', class: 'volver' }, icono('flecha-izq'), 'Todas las noticias'),
        metaNoticia(n, base),
        T(`${base}.title`, 'h1', { cls: 'titulo titulo--lg' }),
        T(`${base}.excerpt`, 'p', { cls: 'bajada bajada--grande' }),
        state.editing && h('div', { class: 'ajustes' }, campo('Fecha de publicación', entrada(`${base}.date`, { tipo: 'date', repintar: true })))
      ),
      (tieneFoto || state.editing) && h('div', { class: 'cont' }, foto(`${base}.image`, { alt: '', cls: 'articulo__foto', respaldo: arteNoticia(n), perezosa: false })),
      h(
        'div',
        { class: 'cont cont--estrecho' },
        T(`${base}.body`, 'div', { cls: 'prosa', multi: true }),
        state.editing &&
          dosPasos(h('button', { type: 'button', class: 'peligro' }, 'Borrar esta noticia'), '¿Seguro? Pulsa otra vez para borrarla', () => {
            state.draft.news.splice(i, 1);
            marcarCambio();
            navegar('/noticias');
          })
      )
    ),
    otras.length > 0 && h('section', { class: 'sec sec--alt' }, h('div', { class: 'cont' }, h('header', { class: 'sec__cab' }, h('h2', { class: 'titulo titulo--md' }, 'Sigue leyendo')), h('ul', { class: 'lista-notas' }, otras.map(({ n: x, i: j }) => noticiaFila(x, j))))),
  ];
}

function enlacesContacto() {
  const k = C().contact || {};
  const digitos = String(k.whatsapp || '').replace(/\D/g, '');
  const usuario = String(k.instagram || '').trim().replace(/^@/, '');
  const instagram = urlSegura(k.instagram) || (usuario && /^[\w.]+$/.test(usuario) ? `https://www.instagram.com/${usuario}/` : '');
  return {
    whatsapp: digitos.length >= 8 ? `https://wa.me/${digitos}` : '',
    correo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(k.email || '').trim()) ? `mailto:${String(k.email).trim()}` : '',
    instagram,
  };
}

function contacto() {
  const k = C().contact || {};
  const enlaces = enlacesContacto();
  const prendaPedida = new URLSearchParams(location.search).get('prenda') || '';

  const dato = (etiqueta, ruta, href, marcador) => {
    const valor = String(k[ruta.split('.')[1]] || '').trim();
    if (!valor && !state.editing) return null;
    const texto = T(ruta, 'span', { vacio: marcador });
    return h('div', { class: 'indice__fila' }, h('dt', { class: 'etq' }, etiqueta), h('dd', { class: 'dato' }, href && !state.editing ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, texto) : texto));
  };

  const estado = h('p', { class: 'form__estado', role: 'status' });
  const boton = h('button', { type: 'submit', class: 'btn btn--primario btn--grande' }, 'Enviar mensaje');
  const formulario = h(
    'form',
    { class: 'form' },
    campoForm('c-nombre', 'Tu nombre', h('input', { name: 'nombre', type: 'text', required: true, maxlength: '120', autocomplete: 'name' }), 'Escribe tu nombre.'),
    campoForm('c-correo', 'Tu correo', h('input', { name: 'correo', type: 'email', required: true, maxlength: '160', autocomplete: 'email', pattern: '[^\\s@]+@[^\\s@]+\\.[^\\s@]+' }), 'Escribe un correo con el formato tu@ejemplo.com.'),
    campoForm('c-prenda', 'Prenda que te interesa (opcional)', h('input', { name: 'prenda', type: 'text', maxlength: '160', value: prendaPedida })),
    campoForm('c-mensaje', 'Mensaje', h('textarea', { name: 'mensaje', rows: '5', required: true, maxlength: '3000' }), 'Escribe tu mensaje.'),
    h('div', { class: 'form__trampa', 'aria-hidden': 'true' }, h('label', { for: 'c-sitio' }, 'No llenes este campo'), h('input', { id: 'c-sitio', name: 'sitio', type: 'text', tabindex: '-1', autocomplete: 'off' })),
    boton,
    estado
  );
  // La validación la hace el navegador: este código solo corre con el formulario completo.
  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(formulario));
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = 'Enviando';
    estado.textContent = '';
    try {
      await api('/api/messages', { method: 'POST', body: datos });
      const gracias = h('div', { class: 'form__gracias', tabindex: '-1' }, icono('check'), h('h3', { class: 'titulo titulo--md' }, 'Mensaje recibido'), h('p', null, 'Gracias por escribir. Te respondemos muy pronto.'));
      formulario.replaceWith(gracias);
      gracias.focus();
    } catch (error) {
      estado.textContent = error.message;
      estado.className = 'form__estado form__estado--error';
      boton.disabled = false;
      boton.removeAttribute('aria-busy');
      boton.textContent = 'Enviar mensaje';
    }
  });

  return [
    cabPagina('Contacto', 'contact.title', 'contact.lead'),
    h(
      'section',
      { class: 'sec sec--pegada' },
      h(
        'div',
        { class: 'cont contacto' },
        h(
          'div',
          { class: 'contacto__datos' },
          h(
            'dl',
            { class: 'indice' },
            dato('WhatsApp', 'contact.whatsapp', enlaces.whatsapp, 'Número con indicativo, por ejemplo +57 300 123 4567'),
            dato('Correo', 'contact.email', enlaces.correo, 'correo@ejemplo.com'),
            dato('Instagram', 'contact.instagram', enlaces.instagram, '@usuario'),
            dato('Dónde estamos', 'contact.address', '', 'Dirección o ciudad'),
            dato('Horario', 'contact.hours', '', 'Horario de atención')
          ),
          enlaces.whatsapp && !state.editing && h('a', { class: 'btn', href: `${enlaces.whatsapp}?text=${encodeURIComponent(`Hola, vi ${C().brand.name} y quiero saber más${prendaPedida ? ` sobre ${prendaPedida}` : ''}.`)}`, target: '_blank', rel: 'noopener noreferrer' }, 'Escribir por WhatsApp'),
          state.editing && h('p', { class: 'campo__ayuda' }, 'Los datos que dejes vacíos no se muestran al público.')
        ),
        h('div', { class: 'contacto__form' }, T('contact.formTitle', 'h2', { cls: 'titulo titulo--md' }), formulario)
      )
    ),
  ];
}

function entrar() {
  if (state.authed) {
    return [h('section', { class: 'acceso' }, h('div', { class: 'cont cont--estrecho acceso__caja' }, h('h1', { class: 'titulo titulo--lg' }, 'Ya estás en modo edición'), h('p', { class: 'bajada' }, 'Usa la barra de abajo para guardar, ver la vista previa o salir.'), h('a', { href: '/', class: 'btn btn--primario' }, 'Ir al inicio')))];
  }
  const error = h('p', { class: 'form__estado form__estado--error', role: 'alert' });
  const clave = h('input', { type: 'password', name: 'password', required: true, autocomplete: 'current-password' });
  const boton = h('button', { type: 'submit', class: 'btn btn--primario btn--grande' }, 'Entrar');
  const formulario = h('form', { class: 'form' }, campoForm('e-clave', 'Contraseña', clave, 'Escribe la contraseña.'), boton, error);
  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    boton.disabled = true;
    error.textContent = '';
    try {
      await api('/api/login', { method: 'POST', body: { password: clave.value } });
      state.authed = true;
      state.editing = true;
      state.draft = clonar(state.content);
      navegar('/');
      cargarMensajes();
    } catch (err) {
      error.textContent = err.message;
      boton.disabled = false;
      clave.select();
    }
  });
  setTimeout(() => clave.focus(), 50);
  return [
    h(
      'section',
      { class: 'acceso' },
      h(
        'div',
        { class: 'cont cont--estrecho acceso__caja' },
        h('p', { class: 'kicker' }, 'Solo para el equipo'),
        h('h1', { class: 'titulo titulo--lg' }, 'Modo edición'),
        h('p', { class: 'bajada' }, 'Entra para cambiar textos, fotos, prendas, noticias y el estilo del sitio.'),
        state.configurado ? formulario : h('p', { class: 'form__estado form__estado--error' }, 'El modo edición no está configurado: falta la variable EDIT_PASSWORD en el servidor.')
      )
    ),
  ];
}

function noEncontrada(texto = 'Esta página no existe o cambió de lugar.', href = '/', etiqueta = 'Volver al inicio') {
  return [h('section', { class: 'acceso' }, h('div', { class: 'cont cont--estrecho acceso__caja' }, h('p', { class: 'kicker' }, 'Error 404'), h('h1', { class: 'titulo titulo--lg' }, 'Se nos soltó un hilo'), h('p', { class: 'bajada' }, texto), h('a', { href, class: 'btn btn--primario' }, etiqueta)))];
}

/* =====================================================================
   Cabecera y pie
   ===================================================================== */

const NAV = [
  { href: '/quienes-somos', texto: 'Quiénes somos' },
  { href: '/producto', texto: 'Producto' },
  { href: '/noticias', texto: 'Noticias' },
  { href: '/contacto', texto: 'Contacto' },
];

function pintarCabecera() {
  const actual = location.pathname;
  const activo = (href) => actual === href || actual.startsWith(`${href}/`);
  const menu = h(
    'ul',
    { id: 'menu-sitio', class: 'menu-sitio', popover: 'auto' },
    NAV.map((n) => h('li', null, h('a', { href: n.href, class: 'nav__enlace', 'aria-current': activo(n.href) ? 'page' : null }, n.texto)))
  );
  const botonMenu = h('button', { type: 'button', class: 'menu-btn', popovertarget: 'menu-sitio', popovertargetaction: 'toggle', 'aria-controls': 'menu-sitio' }, icono('menu'), h('span', null, 'Menú'));
  if (!HAY_POPOVER) {
    // Navegadores sin popover: el botón abre y cierra la lista a mano.
    botonMenu.setAttribute('aria-expanded', 'false');
    botonMenu.addEventListener('click', () => {
      botonMenu.setAttribute('aria-expanded', String(menu.classList.toggle('menu-sitio--abierto')));
    });
  }
  $cabecera.classList.toggle('sin-popover', !HAY_POPOVER);
  $cabecera.replaceChildren(h('div', { class: 'cont cabecera__fila' }, h('a', { href: '/', class: 'marca', 'aria-label': 'Inicio' }, T('brand.name', 'span', { cls: 'marca__nombre' })), h('nav', { class: 'nav', 'aria-label': 'Principal' }, botonMenu, menu)));
  medirNav(true);
}

// Sin punto de quiebre fijo: el menú se pliega solo cuando los enlaces no caben en la fila.
let anchoCabecera = 0;
function medirNav(forzar = false) {
  const fila = $cabecera.querySelector('.cabecera__fila');
  const menu = $cabecera.querySelector('.menu-sitio');
  if (!fila || !menu) return;
  const ancho = $cabecera.clientWidth;
  const eraAncha = $cabecera.classList.contains('is-wide');
  // Plegada, solo vale la pena medir de nuevo si la cabecera creció.
  if (!forzar && !eraAncha && ancho <= anchoCabecera) {
    anchoCabecera = ancho;
    return;
  }
  anchoCabecera = ancho;
  const estabaAbierto = HAY_POPOVER && menu.hasAttribute('popover') && menu.matches(':popover-open');
  $cabecera.classList.add('is-wide', 'is-measuring');
  menu.removeAttribute('popover');
  const cabe = fila.scrollWidth <= fila.clientWidth;
  $cabecera.classList.toggle('is-wide', cabe);
  if (!cabe) {
    menu.setAttribute('popover', 'auto');
    if (estabaAbierto) menu.showPopover();
  }
  requestAnimationFrame(() => $cabecera.classList.remove('is-measuring'));
}
new ResizeObserver(() => medirNav()).observe($cabecera);
document.fonts?.ready.then(() => medirNav(true));
document.fonts?.addEventListener?.('loadingdone', () => medirNav(true));

function pintarPie() {
  const c = C();
  const enlaces = enlacesContacto();
  $pie.replaceChildren(
    h(
      'div',
      { class: 'cont pie__rejilla' },
      h('div', { class: 'pie__marca' }, h('p', { class: 'pie__nombre' }, c.brand.name), T('brand.tagline', 'p', { cls: 'pie__lema' })),
      h('nav', { class: 'pie__col', 'aria-label': 'Secciones' }, h('a', { href: '/' }, 'Inicio'), NAV.map((n) => h('a', { href: n.href }, n.texto))),
      h(
        'div',
        { class: 'pie__col' },
        enlaces.instagram && h('a', { href: enlaces.instagram, target: '_blank', rel: 'noopener noreferrer' }, 'Instagram'),
        enlaces.whatsapp && h('a', { href: enlaces.whatsapp, target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp'),
        enlaces.correo && h('a', { href: enlaces.correo }, 'Correo'),
        !state.authed && h('a', { href: '/editar' }, 'Modo edición')
      ),
      T('footer.note', 'p', { cls: 'pie__nota' })
    )
  );
}

/* =====================================================================
   Barra y paneles del modo edición
   ===================================================================== */

const ui = { guardar: null, descartar: null };

function actualizarBarra() {
  if (ui.guardar) {
    ui.guardar.disabled = !state.dirty;
    ui.guardar.textContent = state.dirty ? 'Guardar cambios' : 'Todo guardado';
  }
  if (ui.descartar) ui.descartar.hidden = !state.dirty;
}

async function guardar() {
  if (!state.dirty || !state.authed) return;
  ui.guardar.disabled = true;
  ui.guardar.setAttribute('aria-busy', 'true');
  ui.guardar.textContent = 'Guardando';
  try {
    await api('/api/content', { method: 'PUT', body: { content: state.draft } });
    state.content = clonar(state.draft);
    state.dirty = false;
    aviso('Cambios publicados.');
  } catch (e) {
    aviso(e.status === 401 ? 'Tu sesión terminó. Abre /editar en otra pestaña, entra de nuevo y guarda aquí.' : e.message, 'error');
  }
  ui.guardar.removeAttribute('aria-busy');
  actualizarBarra();
}

async function cargarMensajes() {
  if (!state.authed) return;
  try {
    state.mensajes = (await api('/api/messages')).messages;
    pintarEdicion();
  } catch {
    /* se reintenta al abrir el panel */
  }
}

const cabPanel = (titulo) => h('header', { class: 'panel__cab' }, h('h2', { class: 'titulo titulo--sm' }, titulo), h('button', { type: 'button', class: 'panel__cerrar', 'aria-label': 'Cerrar', onclick: () => { state.panel = null; pintarEdicion(); } }, icono('cerrar')));

function panelMensajes() {
  const lista = state.mensajes;
  return h(
    'aside',
    { class: 'panel', 'aria-label': 'Mensajes recibidos' },
    cabPanel('Mensajes recibidos'),
    !lista && h('p', { class: 'panel__nota' }, 'Cargando mensajes.'),
    lista && lista.length === 0 && h('p', { class: 'panel__nota' }, 'Todavía no ha escrito nadie desde el formulario de contacto.'),
    lista &&
      lista.map((m) => {
        const borrar = dosPasos(h('button', { type: 'button', class: 'chip-accion' }, 'Borrar'), '¿Borrar?', async () => {
          try {
            await api(`/api/messages/${encodeURIComponent(m.id)}`, { method: 'DELETE' });
            state.mensajes = state.mensajes.filter((x) => x.id !== m.id);
            pintarEdicion();
          } catch (e) {
            aviso(e.message, 'error');
          }
        });
        return h(
          'article',
          { class: 'mensaje' },
          h('div', { class: 'mensaje__cab' }, h('strong', null, m.nombre), h('time', null, new Date(m.creado).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }))),
          h('a', { href: `mailto:${m.correo}`, class: 'mensaje__correo' }, m.correo),
          m.prenda && h('p', { class: 'etq' }, `Prenda: ${m.prenda}`),
          h('p', { class: 'mensaje__texto' }, m.mensaje),
          borrar
        );
      })
  );
}

/** Panel para elegir el estilo del sitio y ajustar sus tres colores. */
function panelEstilo() {
  state.draft.theme ??= {};
  state.draft.theme.colores ??= {};
  const tema = state.draft.theme;
  const { id: actual, tokens } = temaActual();

  const lectura = h('p', { class: 'panel__nota', role: 'status' });
  const medir = () => {
    const t = temaActual().tokens;
    const texto = contraste(t.texto, t.fondo);
    const partes = [`Texto sobre fondo: ${texto.toFixed(1)} a 1.`];
    if (texto < 4.5) partes.push('Cuesta leerlo. Elige colores con más diferencia.');
    if (t['acento-texto'] !== t.acento) partes.push('El acento no se lee como texto sobre este fondo, así que se usa solo en botones y marcas.');
    lectura.textContent = partes.join(' ');
    lectura.classList.toggle('panel__nota--alerta', texto < 4.5);
  };
  medir();

  return h(
    'aside',
    { class: 'panel', 'aria-label': 'Estilo del sitio' },
    cabPanel('Estilo del sitio'),
    h('p', { class: 'panel__nota' }, 'Cada estilo cambia tipografía, colores y formas en todas las páginas. Se ve al instante y se publica al guardar.'),
    h(
      'div',
      { class: 'estilos', role: 'group', 'aria-label': 'Estilos disponibles' },
      Object.entries(state.estilos).map(([id, e]) =>
        h(
          'button',
          {
            type: 'button',
            class: 'estilo-op',
            'aria-pressed': String(id === actual),
            style: { '--m-fondo': e.tokens.fondo, '--m-texto': e.tokens.texto, '--m-acento': e.tokens.acento, '--m-fuente': e.tokens['f-titulo'] },
            onclick: () => {
              tema.preset = id;
              tema.colores = {};
              aplicarTema();
              marcarCambio();
              pintarEdicion();
              document.fonts?.ready.then(() => medirNav(true));
            },
          },
          h('span', { class: 'estilo-op__muestra', 'aria-hidden': 'true' }, 'Aa'),
          h('span', { class: 'estilo-op__texto' }, h('strong', null, e.nombre), h('span', null, e.descripcion))
        )
      )
    ),
    h('p', { class: 'campo__etq' }, 'Ajustar colores'),
    COLORES_EDITABLES.map(({ clave, nombre }) => {
      const el = h('input', { type: 'color', value: tokens[clave] });
      el.addEventListener('input', () => {
        tema.colores[clave] = el.value;
        aplicarTema();
        marcarCambio();
        medir();
      });
      return h('label', { class: 'color-fila' }, el, h('span', null, nombre));
    }),
    lectura,
    h('button', { type: 'button', class: 'chip-accion', onclick: () => { tema.colores = {}; aplicarTema(); marcarCambio(); pintarEdicion(); } }, 'Volver a los colores del estilo'),
    h('hr'),
    h('p', { class: 'panel__nota' }, 'Si algo salió mal, puedes devolver todo el sitio a como venía de fábrica. Se pierden los textos y las prendas que hayan cambiado.'),
    dosPasos(h('button', { type: 'button', class: 'peligro' }, 'Restaurar el contenido original'), '¿Seguro? Pulsa otra vez', async () => {
      try {
        const { content } = await api('/api/content/reset', { method: 'POST' });
        state.content = content;
        state.draft = clonar(content);
        state.dirty = false;
        state.panel = null;
        aviso('Contenido restaurado.');
        pintar();
      } catch (e) {
        aviso(e.message, 'error');
      }
    })
  );
}

function pintarEdicion() {
  $edicion.replaceChildren();
  ui.guardar = ui.descartar = null;
  if (!state.authed) return;

  ui.guardar = h('button', { type: 'button', class: 'barra__btn barra__btn--principal', onclick: guardar }, 'Guardar cambios');
  ui.descartar = dosPasos(h('button', { type: 'button', class: 'barra__btn' }, 'Descartar'), '¿Descartar?', () => {
    state.draft = clonar(state.content);
    state.dirty = false;
    aviso('Cambios descartados.', 'info');
    pintar({ mantenerScroll: true });
  });
  const alternarPanel = (nombre) => () => {
    state.panel = state.panel === nombre ? null : nombre;
    if (nombre === 'mensajes' && state.panel) cargarMensajes();
    pintarEdicion();
  };
  const salir = dosPasos(h('button', { type: 'button', class: 'barra__btn' }, 'Salir'), () => (state.dirty ? '¿Salir sin guardar?' : '¿Salir?'), async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch {
      /* se cierra igual en el navegador */
    }
    Object.assign(state, { authed: false, editing: false, draft: null, dirty: false, panel: null, mensajes: null });
    aviso('Saliste del modo edición.', 'info');
    pintar();
  });
  const cuenta = state.mensajes?.length;

  $edicion.append(
    state.panel === 'mensajes' && panelMensajes(),
    state.panel === 'estilo' && panelEstilo(),
    h(
      'div',
      { class: 'barra', role: 'toolbar', 'aria-label': 'Modo edición' },
      h('span', { class: `barra__estado${state.editing ? '' : ' barra__estado--vista'}` }, state.editing ? 'Editando' : 'Vista previa'),
      ui.guardar,
      ui.descartar,
      h('button', { type: 'button', class: 'barra__btn', onclick: () => { state.editing = !state.editing; pintar({ mantenerScroll: true }); } }, state.editing ? 'Vista previa' : 'Seguir editando'),
      h('button', { type: 'button', class: 'barra__btn', 'aria-pressed': String(state.panel === 'estilo'), onclick: alternarPanel('estilo') }, 'Estilo'),
      h('button', { type: 'button', class: 'barra__btn', 'aria-pressed': String(state.panel === 'mensajes'), onclick: alternarPanel('mensajes') }, cuenta ? `Mensajes (${cuenta})` : 'Mensajes'),
      salir
    )
  );
  actualizarBarra();
}

/* =====================================================================
   Enrutador
   ===================================================================== */

function resolver() {
  const partes = location.pathname.split('/').filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  const marca = C().brand.name;
  const [a, b] = partes;
  if (partes.length === 0) return { titulo: `${marca} · ${C().brand.tagline}`, nodos: inicio() };
  if (a === 'quienes-somos' && !b) return { titulo: `Quiénes somos · ${marca}`, nodos: quienes() };
  if (a === 'producto' && !b) return { titulo: `Producto · ${marca}`, nodos: coleccion() };
  if (a === 'producto' && partes.length === 2) return { titulo: `${C().products.find((p) => p.id === b)?.name || 'Prenda'} · ${marca}`, nodos: fichaPrenda(b) };
  if (a === 'noticias' && !b) return { titulo: `Noticias · ${marca}`, nodos: noticias() };
  if (a === 'noticias' && partes.length === 2) return { titulo: `${C().news.find((n) => n.id === b)?.title || 'Noticia'} · ${marca}`, nodos: fichaNoticia(b) };
  if (a === 'contacto' && !b) return { titulo: `Contacto · ${marca}`, nodos: contacto() };
  if (a === 'editar' && !b) return { titulo: `Modo edición · ${marca}`, nodos: entrar() };
  return { titulo: `No encontrada · ${marca}`, nodos: noEncontrada() };
}

function pintar({ mantenerScroll = false } = {}) {
  const y = window.scrollY;
  aplicarTema();
  document.body.classList.toggle('editando', state.editing);
  document.body.classList.toggle('con-barra', state.authed);
  pintarCabecera();
  const vista = resolver();
  document.title = vista.titulo;
  // Donde hay View Transitions la entrada la anima el navegador; la clase es el respaldo.
  const entra = !mantenerScroll && !document.startViewTransition;
  $app.replaceChildren(h('div', { class: `pagina${entra ? ' pagina--entra' : ''}` }, vista.nodos));
  pintarPie();
  pintarEdicion();
  state.ruta = location.pathname;
  window.scrollTo(0, mantenerScroll ? y : 0);
}

const NOMBRE_COMPARTIDO = 'prenda-activa';
const nombrar = (el) => {
  el.style.viewTransitionName = NOMBRE_COMPARTIDO;
  el.dataset.vt = '1';
};
const limpiarNombres = () => {
  document.querySelectorAll('[data-vt]').forEach((el) => {
    el.style.viewTransitionName = '';
    delete el.dataset.vt;
  });
};

/**
 * Cambia de vista. Si el navegador soporta View Transitions, la prenda elegida
 * viaja de la tarjeta a la ficha (y de vuelta) en lugar de aparecer de golpe.
 */
function cambiarVista(tarjeta = null) {
  const anterior = state.ruta || '';
  const enfocar = () => $app.focus({ preventScroll: true });
  if (!document.startViewTransition) {
    pintar();
    enfocar();
    return;
  }
  // Si quedó un nombre de una transición que aún no termina, se quita antes de empezar otra.
  limpiarNombres();
  if (tarjeta) {
    // Solo un elemento puede llevar el nombre compartido en cada estado.
    const ficha = $app.querySelector('.ficha__escenario');
    if (ficha) ficha.style.viewTransitionName = 'none';
    nombrar(tarjeta);
  }
  const transicion = document.startViewTransition(() => {
    pintar();
    const idPrevio = anterior.match(/^\/producto\/([^/]+)$/)?.[1];
    if (idPrevio && !$app.querySelector('.ficha__escenario')) {
      const enlace = [...$app.querySelectorAll('a.tarjeta')].find((a) => a.getAttribute('href') === `/producto/${idPrevio}`);
      const destino = enlace?.querySelector('.tarjeta__escenario');
      if (destino) nombrar(destino);
    }
  });
  transicion.finished.finally(() => {
    limpiarNombres();
    enfocar();
  });
}

function navegar(destino, { tarjeta = null } = {}) {
  if (destino !== location.pathname + location.search) history.pushState(null, '', destino);
  cambiarVista(tarjeta);
}

document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href]');
  if (!a) return;
  if (state.editing && e.target.closest('[contenteditable], .herr, .foto__acciones, .ajustes')) {
    e.preventDefault();
    return;
  }
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target === '_blank' || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/media/')) return;
  e.preventDefault();
  const escenario = a.matches('a.tarjeta') ? a.querySelector('.tarjeta__escenario') : a.matches('a.hero__escenario') ? a : null;
  navegar(url.pathname + url.search, { tarjeta: escenario });
});

window.addEventListener('popstate', () => cambiarVista());

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && state.authed) {
    e.preventDefault();
    guardar();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) e.preventDefault();
});

/* =====================================================================
   Arranque
   ===================================================================== */

function arrancar() {
  let datos = null;
  try {
    datos = JSON.parse(document.getElementById('datos')?.textContent || 'null');
  } catch {
    datos = null;
  }
  if (!datos?.content || !datos?.estilos) {
    $app.replaceChildren(h('p', { class: 'cargando' }, 'No pudimos cargar el sitio. Recarga la página en unos segundos.'));
    return;
  }
  state.content = datos.content;
  state.estilos = datos.estilos;
  state.estiloBase = datos.estiloBase || 'atelier';
  state.authed = Boolean(datos.authed);
  state.configurado = datos.configurado !== false;
  if (state.authed) {
    state.draft = clonar(state.content);
    state.editing = true;
    cargarMensajes();
  }
  pintar({ mantenerScroll: true });
}

arrancar();
