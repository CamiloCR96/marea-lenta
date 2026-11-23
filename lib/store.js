'use strict';

// Almacén de datos del sitio.
// Con DATABASE_URL usa Postgres (lo que corre en Render).
// Sin DATABASE_URL guarda archivos en ./data, útil para trabajar en el computador.

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_MENSAJES = 500;
const nuevoId = () => crypto.randomBytes(9).toString('hex');

/* ------------------------------ Postgres ------------------------------ */

function usarSSL(url) {
  try {
    const { hostname, searchParams } = new URL(url);
    if (searchParams.get('sslmode') === 'disable') return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
    // Los nombres internos de Render no llevan punto y no necesitan SSL.
    return hostname.includes('.') ? { rejectUnauthorized: false } : false;
  } catch {
    return false;
  }
}

async function crearPostgres(url) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, ssl: usarSSL(url), max: 5 });
  pool.on('error', (e) => console.error('[db] error de conexión:', e.message));

  await pool.query(`
    create table if not exists ml_contenido (
      clave text primary key,
      valor jsonb not null,
      actualizado timestamptz not null default now()
    );
    create table if not exists ml_medios (
      id text primary key,
      mime text not null,
      datos bytea not null,
      creado timestamptz not null default now()
    );
    create table if not exists ml_mensajes (
      id bigserial primary key,
      nombre text not null,
      correo text not null,
      prenda text not null default '',
      mensaje text not null,
      creado timestamptz not null default now()
    );
  `);

  return {
    tipo: 'postgres',
    async leerContenido() {
      const r = await pool.query("select valor from ml_contenido where clave = 'sitio'");
      return r.rows[0]?.valor ?? null;
    },
    async guardarContenido(contenido) {
      await pool.query(
        `insert into ml_contenido (clave, valor) values ('sitio', $1::jsonb)
         on conflict (clave) do update set valor = excluded.valor, actualizado = now()`,
        [JSON.stringify(contenido)]
      );
    },
    async borrarContenido() {
      await pool.query("delete from ml_contenido where clave = 'sitio'");
    },
    async guardarMedio(datos, mime) {
      const id = nuevoId();
      await pool.query('insert into ml_medios (id, mime, datos) values ($1, $2, $3)', [id, mime, datos]);
      return id;
    },
    async leerMedio(id) {
      const r = await pool.query('select mime, datos from ml_medios where id = $1', [id]);
      return r.rows[0] ? { mime: r.rows[0].mime, datos: r.rows[0].datos } : null;
    },
    async agregarMensaje(m) {
      await pool.query(
        'insert into ml_mensajes (nombre, correo, prenda, mensaje) values ($1, $2, $3, $4)',
        [m.nombre, m.correo, m.prenda, m.mensaje]
      );
      await pool.query(
        `delete from ml_mensajes where id in (
           select id from ml_mensajes order by creado desc offset $1
         )`,
        [MAX_MENSAJES]
      );
    },
    async listarMensajes() {
      const r = await pool.query(
        'select id, nombre, correo, prenda, mensaje, creado from ml_mensajes order by creado desc'
      );
      return r.rows.map((f) => ({ ...f, id: String(f.id) }));
    },
    async borrarMensaje(id) {
      if (!/^\d+$/.test(String(id))) return;
      await pool.query('delete from ml_mensajes where id = $1', [id]);
    },
  };
}

/* ------------------------------ Archivos ------------------------------ */

async function crearArchivos(dir) {
  const rutaContenido = path.join(dir, 'contenido.json');
  const rutaMensajes = path.join(dir, 'mensajes.json');
  const dirMedios = path.join(dir, 'medios');
  await fs.mkdir(dirMedios, { recursive: true });

  const leerJSON = async (ruta, porDefecto) => {
    try {
      return JSON.parse(await fs.readFile(ruta, 'utf8'));
    } catch {
      return porDefecto;
    }
  };
  const escribirJSON = async (ruta, valor) => {
    const tmp = `${ruta}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(valor, null, 2));
    await fs.rename(tmp, ruta);
  };

  return {
    tipo: 'archivos',
    leerContenido: () => leerJSON(rutaContenido, null),
    guardarContenido: (contenido) => escribirJSON(rutaContenido, contenido),
    borrarContenido: () => fs.rm(rutaContenido, { force: true }),
    async guardarMedio(datos, mime) {
      const id = nuevoId();
      await fs.writeFile(path.join(dirMedios, id), datos);
      await fs.writeFile(path.join(dirMedios, `${id}.mime`), mime);
      return id;
    },
    async leerMedio(id) {
      try {
        const [datos, mime] = await Promise.all([
          fs.readFile(path.join(dirMedios, id)),
          fs.readFile(path.join(dirMedios, `${id}.mime`), 'utf8'),
        ]);
        return { datos, mime };
      } catch {
        return null;
      }
    },
    async agregarMensaje(m) {
      const lista = await leerJSON(rutaMensajes, []);
      lista.unshift({ id: nuevoId(), ...m, creado: new Date().toISOString() });
      await escribirJSON(rutaMensajes, lista.slice(0, MAX_MENSAJES));
    },
    listarMensajes: () => leerJSON(rutaMensajes, []),
    async borrarMensaje(id) {
      const lista = await leerJSON(rutaMensajes, []);
      await escribirJSON(rutaMensajes, lista.filter((m) => m.id !== id));
    },
  };
}

async function crearAlmacen({ databaseUrl, dir }) {
  return databaseUrl ? crearPostgres(databaseUrl) : crearArchivos(dir);
}

module.exports = { crearAlmacen };
