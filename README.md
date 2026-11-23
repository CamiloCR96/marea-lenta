# Marea Lenta

Sitio web de una marca de ropa, hecho para la actividad de la unidad 3 (desarrollo de un producto o servicio). Tiene un modo edición tipo CMS: se entra con contraseña y se cambian textos, fotos, prendas y noticias directamente sobre la página.

## Qué incluye

| Requisito de la actividad | Dónde está |
|---|---|
| Quiénes somos | `/quienes-somos`: historia, misión, visión, valores y equipo |
| Producto o servicio | `/producto`: colección con filtros y una ficha por prenda |
| Imágenes y características del producto | Ficha de cada prenda: ilustración o foto, colores, tallas, características y cuidado |
| Video del producto | Sección de video en el inicio y en `/producto` (enlace de YouTube o Vimeo) |
| Noticias | `/noticias`: listado y una página por noticia |
| Contacto | `/contacto`: datos de contacto y formulario que guarda los mensajes |

Extras: cambio de color de la prenda en vivo, transiciones entre páginas, proceso de desarrollo del producto en seis pasos, bandeja de mensajes y cinco estilos visuales completos que se cambian desde el modo edición.

## Modo edición

1. Abre `/editar` (o el enlace "Modo edición" al final de la página).
2. Escribe la contraseña del equipo.
3. Haz clic sobre cualquier texto y escribe. Los bloques con borde punteado son editables.
4. Pasa el cursor sobre una tarjeta o un elemento de lista para subirlo, bajarlo, duplicarlo o borrarlo.
5. Usa los botones "Subir foto" para reemplazar ilustraciones por fotos reales.
6. Pulsa **Guardar cambios** en la barra de abajo (o `Ctrl+S`). Hasta que no guardas, el público no ve nada.

La barra también tiene **Vista previa**, **Estilo** y **Mensajes** (lo que llega por el formulario de contacto).

### Cambiar el estilo del sitio

El botón **Estilo** abre un panel con cinco diseños. Cada uno cambia tipografía, colores y formas en todas las páginas a la vez:

| Estilo | Carácter |
|---|---|
| Atelier | Editorial y sereno. Serif fina, papel cálido y azul añil. Es el que viene por defecto. |
| Boutique | Alta moda. Didona en mayúsculas, blanco roto y bronce. |
| Calle | Urbano y directo. Titulares condensados, bordes gruesos y naranja. |
| Noche | Oscuro. Grotesca apretada sobre negro con verde lima. |
| Caribe | Cálido y artesanal. Serif suave, crema y terracota. |

Debajo se pueden ajustar tres colores (fondo, texto y acento). El panel avisa si el texto deja de leerse bien sobre el fondo elegido. El cambio se ve al instante y se publica al guardar.

Para añadir un estilo nuevo o retocar uno, edita `public/estilos.json`.

## Trabajar en el computador

```bash
npm install
cp .env.example .env   # y escribe la contraseña en EDIT_PASSWORD
npm start
```

Abre http://localhost:3000. Sin `DATABASE_URL`, el contenido se guarda en la carpeta `data/`.

## Publicar en Render

El archivo `render.yaml` crea el servicio web y la base de datos Postgres.

1. Sube este repositorio a GitHub.
2. En Render: **New > Blueprint** y elige el repositorio.
3. Cuando pida `EDIT_PASSWORD`, escribe la contraseña del modo edición.
4. Pulsa **Apply** y espera a que termine el despliegue.

### Límites del plan gratuito

- El sitio se duerme tras 15 minutos sin visitas. La primera visita después tarda cerca de un minuto en responder.
- El servidor no conserva archivos entre reinicios. Por eso el contenido, las fotos y los mensajes se guardan en Postgres.
- La base de datos gratuita de Render caduca 30 días después de crearla. Si el sitio debe durar más, crea una base en otro proveedor de Postgres y pon su dirección en la variable `DATABASE_URL` del servicio.

## Variables de entorno

| Variable | Para qué sirve |
|---|---|
| `EDIT_PASSWORD` | Contraseña del modo edición. Sin ella, el modo edición queda desactivado. |
| `SESSION_SECRET` | Clave para firmar la sesión. Render la genera sola. |
| `DATABASE_URL` | Conexión a Postgres. Render la conecta sola desde el plano. |

## Estructura

```
server.js            servidor, sesión, API y página
lib/store.js         guardado en Postgres o en archivos
content/default.json contenido original del sitio
public/              página, hoja de estilos y código del navegador
public/estilos.json  los cinco estilos visuales (fuentes, colores y formas)
render.yaml          plano de despliegue en Render
```
