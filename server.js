'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const { crearAlmacen } = require('./lib/store');

// En el computador las variables salen de un archivo .env (que no se sube a GitHub).
// En Render se configuran en el panel del servicio.
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  /* sin archivo .env: se usan las variables del entorno */
}

const PUERTO = process.env.PORT || 3000;
const EN_PRODUCCION = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
const CLAVE_EDICION = process.env.EDIT_PASSWORD || '';
const SECRETO = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DURACION_SESION = 1000 * 60 * 60 * 12; // 12 horas
const COOKIE = 'ml_sesion';
const MIMES_IMAGEN = ['image/webp', 'image/jpeg', 'image/png'];

const CONTENIDO_BASE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'content', 'default.json'), 'utf8')
);
const RUTA_PLANTILLA = path.join(__dirname, 'public', 'index.html');

// Estilos visuales que se pueden elegir desde el modo edición.
const ESTILOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'estilos.json'), 'utf8'));
const ESTILO_BASE = 'atelier';
const ES_HEX = /^#[0-9a-f]{6}$/i;

function luminancia(hex) {
  const n = parseInt(hex.slice(1), 16);
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
function temaDe(contenido) {
  const tema = contenido.theme || {};
  const id = ESTILOS[tema.preset] ? tema.preset : ESTILO_BASE;
  const tokens = { ...ESTILOS[id].tokens };
  const propios = tema.colores || {};
  for (const clave of ['fondo', 'texto', 'acento']) {
    if (ES_HEX.test(propios[clave] || '')) tokens[clave] = propios[clave];
  }
  if (ES_HEX.test(propios.acento || '') || ES_HEX.test(propios.fondo || '')) {
    // Un acento elegido a mano se usa como color de texto solo si se lee sobre el fondo.
    tokens['sobre-acento'] = contraste(tokens.acento, '#ffffff') >= contraste(tokens.acento, '#111111') ? '#ffffff' : '#111111';
    tokens['acento-texto'] = contraste(tokens.acento, tokens.fondo) >= 4.5 ? tokens.acento : tokens.texto;
  }
  return { id, fuentes: ESTILOS[id].fuentes, tokens };
}

/* ------------------------------ Sesión ------------------------------ */

const firmar = (texto) => crypto.createHmac('sha256', SECRETO).update(texto).digest('base64url');

function crearToken() {
  const vence = String(Date.now() + DURACION_SESION);
  return `${vence}.${firmar(vence)}`;
}

function tokenValido(token) {
  if (typeof token !== 'string') return false;
  const [vence, firma] = token.split('.');
  if (!vence || !firma || !/^\d+$/.test(vence)) return false;
  const esperada = Buffer.from(firmar(vence));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length) return false;
  return crypto.timingSafeEqual(esperada, recibida) && Number(vence) > Date.now();
}

function leerCookie(req, nombre) {
  const cabecera = req.headers.cookie || '';
  for (const parte of cabecera.split(';')) {
    const i = parte.indexOf('=');
    if (i > -1 && parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

const estaAutenticado = (req) => tokenValido(leerCookie(req, COOKIE));

function claveCorrecta(intento) {
  if (!CLAVE_EDICION || typeof intento !== 'string') return false;
  const a = crypto.createHash('sha256').update(intento).digest();
  const b = crypto.createHash('sha256').update(CLAVE_EDICION).digest();
  return crypto.timingSafeEqual(a, b);
}

function ponerCookie(res, valor, maxAgeMs) {
  const partes = [
    `${COOKIE}=${encodeURIComponent(valor)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (EN_PRODUCCION) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

/* ------------------------- Límite de intentos ------------------------- */

function limitador({ maximo, ventanaMs }) {
  const registro = new Map();
  setInterval(() => {
    const ahora = Date.now();
    for (const [ip, r] of registro) if (r.reinicia < ahora) registro.delete(ip);
  }, ventanaMs).unref();
  return (req, res, next) => {
    const ahora = Date.now();
    const ip = req.ip || 'desconocida';
    let r = registro.get(ip);
    if (!r || r.reinicia < ahora) {
      r = { cuenta: 0, reinicia: ahora + ventanaMs };
      registro.set(ip, r);
    }
    r.cuenta += 1;
    if (r.cuenta > maximo) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos y prueba de nuevo.' });
    }
    next();
  };
}

/* ------------------------------ Utilidades ------------------------------ */

const escaparHTML = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const recortar = (valor, max) => (typeof valor === 'string' ? valor.trim().slice(0, max) : '');

function contenidoValido(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  if (!c.brand || typeof c.brand !== 'object') return false;
  if (!Array.isArray(c.products) || !Array.isArray(c.news)) return false;
  return true;
}

/* ------------------------------ Aplicación ------------------------------ */

async function iniciar() {
  const almacen = await crearAlmacen({
    databaseUrl: process.env.DATABASE_URL,
    dir: path.join(__dirname, 'data'),
  });

  let cache = null;
  async function leerContenido() {
    if (!cache) {
      const guardado = await almacen.leerContenido();
      // Si el contenido guardado es de una versión anterior, las secciones que falten salen del original.
      cache = guardado ? { ...CONTENIDO_BASE, ...guardado } : CONTENIDO_BASE;
    }
    return cache;
  }

  let plantilla = null;
  const leerPlantilla = () => {
    if (!plantilla || !EN_PRODUCCION) plantilla = fs.readFileSync(RUTA_PLANTILLA, 'utf8');
    return plantilla;
  };

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        'font-src https://fonts.gstatic.com',
        "img-src 'self' data: blob: https:",
        'media-src https:',
        'frame-src https://www.youtube-nocookie.com https://player.vimeo.com',
        "connect-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );
    next();
  });

  // Las peticiones que cambian datos deben venir del propio sitio.
  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origen = req.headers.origin;
    if (origen) {
      try {
        if (new URL(origen).host !== req.headers.host) return res.status(403).json({ error: 'Origen no permitido.' });
      } catch {
        return res.status(403).json({ error: 'Origen no permitido.' });
      }
    }
    next();
  });

  const json = express.json({ limit: '1mb' });
  const exigirSesion = (req, res, next) =>
    estaAutenticado(req) ? next() : res.status(401).json({ error: 'Tu sesión de edición terminó. Vuelve a entrar.' });

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  /* ---------- sesión ---------- */

  app.post('/api/login', limitador({ maximo: 8, ventanaMs: 10 * 60 * 1000 }), json, (req, res) => {
    if (!CLAVE_EDICION) {
      return res.status(503).json({ error: 'El modo edición no está configurado. Falta la variable EDIT_PASSWORD.' });
    }
    if (!claveCorrecta(req.body?.password)) {
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }
    ponerCookie(res, crearToken(), DURACION_SESION);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    ponerCookie(res, '', 0);
    res.json({ ok: true });
  });

  /* ---------- contenido ---------- */

  app.get('/api/content', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ content: await leerContenido(), authed: estaAutenticado(req) });
  });

  app.put('/api/content', exigirSesion, json, async (req, res) => {
    const contenido = req.body?.content;
    if (!contenidoValido(contenido)) return res.status(400).json({ error: 'El contenido enviado no es válido.' });
    await almacen.guardarContenido(contenido);
    cache = contenido;
    res.json({ ok: true });
  });

  app.post('/api/content/reset', exigirSesion, async (req, res) => {
    await almacen.borrarContenido();
    cache = null;
    res.json({ ok: true, content: await leerContenido() });
  });

  /* ---------- imágenes ---------- */

  app.post(
    '/api/media',
    exigirSesion,
    express.raw({ type: MIMES_IMAGEN, limit: '5mb' }),
    async (req, res) => {
      const mime = (req.headers['content-type'] || '').split(';')[0].trim();
      if (!MIMES_IMAGEN.includes(mime) || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Solo se aceptan imágenes JPG, PNG o WebP de máximo 5 MB.' });
      }
      const id = await almacen.guardarMedio(req.body, mime);
      res.json({ url: `/media/${id}` });
    }
  );

  app.get('/media/:id', async (req, res) => {
    if (!/^[a-f0-9]{10,40}$/.test(req.params.id)) return res.status(404).end();
    const medio = await almacen.leerMedio(req.params.id);
    if (!medio || !MIMES_IMAGEN.includes(medio.mime)) return res.status(404).end();
    res.setHeader('Content-Type', medio.mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.end(medio.datos);
  });

  /* ---------- mensajes de contacto ---------- */

  app.post('/api/messages', limitador({ maximo: 6, ventanaMs: 10 * 60 * 1000 }), json, async (req, res) => {
    const cuerpo = req.body || {};
    // Campo trampa: las personas no lo ven, los robots lo llenan.
    if (cuerpo.sitio) return res.json({ ok: true });
    const mensaje = {
      nombre: recortar(cuerpo.nombre, 120),
      correo: recortar(cuerpo.correo, 160),
      prenda: recortar(cuerpo.prenda, 160),
      mensaje: recortar(cuerpo.mensaje, 3000),
    };
    if (!mensaje.nombre || !mensaje.mensaje || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mensaje.correo)) {
      return res.status(400).json({ error: 'Revisa tu nombre, tu correo y el mensaje.' });
    }
    await almacen.agregarMensaje(mensaje);
    res.json({ ok: true });
  });

  app.get('/api/messages', exigirSesion, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ messages: await almacen.listarMensajes() });
  });

  app.delete('/api/messages/:id', exigirSesion, async (req, res) => {
    await almacen.borrarMensaje(req.params.id);
    res.json({ ok: true });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'No existe.' }));

  /* ---------- archivos y página ---------- */

  app.use(
    express.static(path.join(__dirname, 'public'), {
      index: false,
      maxAge: EN_PRODUCCION ? '1h' : 0,
    })
  );

  // Cualquier otra ruta devuelve la página con el contenido ya incluido,
  // así el sitio aparece sin esperar una segunda petición.
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (path.extname(req.path)) return res.status(404).type('text').send('No encontrado');
    const contenido = await leerContenido();
    const datos = JSON.stringify({
      content: contenido,
      authed: estaAutenticado(req),
      configurado: Boolean(CLAVE_EDICION),
      estilos: ESTILOS,
      estiloBase: ESTILO_BASE,
    }).replace(/</g, '\\u003c');
    const tema = temaDe(contenido);
    const variables = Object.entries(tema.tokens)
      .map(([clave, valor]) => `--${clave}:${String(valor).replace(/[<>{};]/g, '')}`)
      .join(';');
    const titulo = `${contenido.brand?.name || 'Marea Lenta'} · ${contenido.brand?.tagline || ''}`;
    const html = leerPlantilla()
      .replace('<!--DATOS-->', () => `<script id="datos" type="application/json">${datos}</script>`)
      .replace('<!--FUENTES-->', () => `<link id="fuentes" rel="stylesheet" href="${escaparHTML(tema.fuentes)}">`)
      .replace('<!--TEMA-->', () => `<style id="tema">:root{${variables}}</style>`)
      .replace(/%ESTILO%/g, () => escaparHTML(tema.id))
      .replace(/%COLOR_FONDO%/g, () => escaparHTML(tema.tokens.fondo))
      .replace(/%TITULO%/g, () => escaparHTML(titulo))
      .replace(/%DESCRIPCION%/g, () => escaparHTML(contenido.home?.lead || ''));
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(html);
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'El archivo o el contenido es demasiado grande.' });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'No se pudo leer lo que enviaste.' });
    }
    console.error('[error]', err);
    res.status(500).json({ error: 'Algo falló en el servidor. Intenta de nuevo.' });
  });

  app.listen(PUERTO, () => {
    console.log(`Marea Lenta en http://localhost:${PUERTO} (datos en ${almacen.tipo})`);
    if (!CLAVE_EDICION) console.warn('Aviso: falta EDIT_PASSWORD, el modo edición está desactivado.');
  });
}

iniciar().catch((e) => {
  console.error('No se pudo iniciar el servidor:', e);
  process.exit(1);
});
