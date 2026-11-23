// Ilustraciones de prendas dibujadas en SVG.
// El color de la tela llega por la variable CSS --tela del contenedor,
// por eso una misma ilustración sirve para todos los colores de una prenda.

let contador = 0;

export const GARMENT_TYPES = [
  { id: 'camisa', label: 'Camisa' },
  { id: 'camiseta', label: 'Camiseta' },
  { id: 'pantalon', label: 'Pantalón' },
  { id: 'vestido', label: 'Vestido' },
  { id: 'chaqueta', label: 'Sobrecamisa o chaqueta' },
  { id: 'tote', label: 'Bolso tote' },
];

export const PATTERNS = [
  { id: 'liso', label: 'Liso' },
  { id: 'rayas', label: 'Rayas' },
  { id: 'puntos', label: 'Puntos' },
  { id: 'cuadros', label: 'Cuadros' },
  { id: 'olas', label: 'Olas' },
];

const botones = (x, ys, r = 5) =>
  ys.map((y) => `<circle class="g-boton" cx="${x}" cy="${y}" r="${r}"/>`).join('');

const FORMAS = {
  camiseta: {
    cuerpo:
      'M150 70 L95 92 L40 150 L78 196 L112 168 L112 410 Q200 426 288 410 L288 168 L322 196 L360 150 L305 92 L250 70 Q200 112 150 70 Z',
    detalle: `
      <path class="g-sombra" d="M112 168 L112 410 Q128 414 146 416 L136 196 Z"/>
      <path class="g-sombra" d="M288 168 L288 410 Q272 414 262 415 L270 200 Z"/>
      <path class="g-sombra g-sombra--fuerte" d="M150 70 Q200 112 250 70 L258 74 Q200 132 142 74 Z"/>
      <path class="g-linea" d="M142 74 Q200 132 258 74"/>
      <path class="g-punteado" d="M49 142 L87 188"/>
      <path class="g-punteado" d="M351 142 L313 188"/>
      <path class="g-punteado" d="M114 394 Q200 410 286 394"/>`,
  },
  camisa: {
    cuerpo:
      'M150 62 L92 86 L36 150 L80 200 L112 172 L112 420 L288 420 L288 172 L320 200 L364 150 L308 86 L250 62 L200 100 Z',
    detalle: `
      <path class="g-sombra" d="M112 172 L112 420 L146 420 L136 198 Z"/>
      <path class="g-sombra" d="M288 172 L288 420 L262 420 L268 200 Z"/>
      <path class="g-sombra g-sombra--fuerte" d="M150 62 Q200 82 250 62 L200 100 Z"/>
      <path class="g-linea" d="M200 100 L200 420"/>
      <path class="g-linea g-linea--fina" d="M188 116 L188 420"/>
      ${botones(194, [150, 205, 260, 315, 372])}
      <path class="g-luz g-contorno" d="M150 62 L200 100 L170 136 L134 78 Z"/>
      <path class="g-luz g-contorno" d="M250 62 L200 100 L230 136 L266 78 Z"/>
      <path class="g-linea" d="M228 184 h46 v40 q-23 14 -46 0 Z"/>
      <path class="g-punteado" d="M45 142 L89 192"/>
      <path class="g-punteado" d="M355 142 L311 192"/>
      <path class="g-punteado" d="M114 404 L286 404"/>`,
  },
  pantalon: {
    cuerpo: 'M118 52 L282 52 L300 432 L214 432 L200 176 L186 432 L100 432 Z',
    detalle: `
      <path class="g-sombra" d="M200 176 L214 432 L238 432 Z"/>
      <path class="g-sombra" d="M200 176 L186 432 L166 432 Z"/>
      <path class="g-sombra g-contorno" d="M118 52 L282 52 L283 82 L117 82 Z"/>
      <rect class="g-tela g-contorno" x="138" y="46" width="9" height="42" rx="2"/>
      <rect class="g-tela g-contorno" x="253" y="46" width="9" height="42" rx="2"/>
      <circle class="g-boton" cx="200" cy="67" r="5.5"/>
      <path class="g-linea" d="M200 82 L200 150 Q200 166 186 168"/>
      <path class="g-linea" d="M130 82 Q138 126 111 138"/>
      <path class="g-linea" d="M270 82 Q262 126 289 138"/>
      <path class="g-linea g-linea--fina" d="M152 100 L143 428"/>
      <path class="g-linea g-linea--fina" d="M248 100 L257 428"/>
      <path class="g-punteado" d="M102 416 L186 416"/>
      <path class="g-punteado" d="M214 416 L298 416"/>`,
  },
  vestido: {
    cuerpo:
      'M156 48 L172 48 Q200 100 228 48 L244 48 L264 150 Q252 188 260 222 L334 430 Q200 464 66 430 L140 222 Q148 188 136 150 Z',
    detalle: `
      <path class="g-sombra" d="M260 222 L334 430 Q306 440 282 445 L236 234 Z"/>
      <path class="g-sombra" d="M140 222 L66 430 Q88 437 104 441 L160 232 Z"/>
      <path class="g-linea" d="M140 222 Q200 242 260 222"/>
      <path class="g-linea g-linea--fina" d="M172 234 L132 441"/>
      <path class="g-linea g-linea--fina" d="M200 238 L200 453"/>
      <path class="g-linea g-linea--fina" d="M228 234 L268 441"/>
      <path class="g-punteado" d="M172 60 Q200 112 228 60"/>
      <path class="g-punteado" d="M76 418 Q200 451 324 418"/>`,
  },
  chaqueta: {
    cuerpo:
      'M150 60 L90 84 L46 132 L30 384 L86 392 L104 196 L110 426 L290 426 L296 196 L314 392 L370 384 L354 132 L310 84 L250 60 L200 96 Z',
    detalle: `
      <path class="g-sombra" d="M104 196 L110 426 L140 426 L128 210 Z"/>
      <path class="g-sombra" d="M296 196 L290 426 L264 426 L274 212 Z"/>
      <path class="g-sombra" d="M46 132 L30 384 L52 387 L72 150 Z"/>
      <path class="g-sombra" d="M354 132 L370 384 L348 387 L330 150 Z"/>
      <path class="g-sombra g-sombra--fuerte" d="M150 60 Q200 80 250 60 L200 96 Z"/>
      <path class="g-linea" d="M200 96 L200 426"/>
      ${botones(193, [150, 215, 280, 345, 402], 5.5)}
      <path class="g-luz g-contorno" d="M150 60 L200 96 L172 134 L132 78 Z"/>
      <path class="g-luz g-contorno" d="M250 60 L200 96 L228 134 L268 78 Z"/>
      <path class="g-linea" d="M124 180 h52 v62 h-52 Z"/>
      <path class="g-luz g-contorno" d="M124 180 h52 v15 l-26 10 l-26 -10 Z"/>
      <path class="g-linea" d="M224 180 h52 v62 h-52 Z"/>
      <path class="g-luz g-contorno" d="M224 180 h52 v15 l-26 10 l-26 -10 Z"/>
      <path class="g-linea" d="M32 358 L88 366"/>
      <path class="g-linea" d="M368 358 L312 366"/>
      <path class="g-linea g-linea--fina" d="M104 196 L112 150"/>
      <path class="g-linea g-linea--fina" d="M296 196 L288 150"/>
      <path class="g-punteado" d="M112 410 L288 410"/>`,
  },
  tote: {
    cuerpo: 'M88 190 L312 190 L330 440 L70 440 Z',
    antes: `
      <path class="g-tela g-contorno" d="M128 196 Q128 46 200 46 Q272 46 272 196 L254 196 Q254 66 200 66 Q146 66 146 196 Z"/>
      <path class="g-sombra" d="M128 196 Q128 46 200 46 Q272 46 272 196 L254 196 Q254 66 200 66 Q146 66 146 196 Z"/>`,
    detalle: `
      <path class="g-sombra" d="M312 190 L330 440 L292 440 L284 190 Z"/>
      <path class="g-punteado" d="M90 212 L310 212"/>
      <rect class="g-luz g-contorno" x="166" y="286" width="68" height="62" rx="8"/>
      <path class="g-linea" d="M178 318 q7 -12 14 0 t14 0 t14 0"/>
      <path class="g-punteado" d="M74 424 L326 424"/>`,
  },
};

function estampado(id, tipo) {
  const blanco = 'rgba(255,255,255,.36)';
  const cuerpos = {
    rayas: `<pattern id="${id}" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="9" height="24" fill="${blanco}"/></pattern>`,
    puntos: `<pattern id="${id}" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="3.6" fill="${blanco}"/><circle cx="23" cy="23" r="3.6" fill="${blanco}"/></pattern>`,
    cuadros: `<pattern id="${id}" width="34" height="34" patternUnits="userSpaceOnUse"><rect width="34" height="8" fill="${blanco}"/><rect width="8" height="34" fill="${blanco}"/></pattern>`,
    olas: `<pattern id="${id}" width="44" height="22" patternUnits="userSpaceOnUse"><path d="M0 11 q11 -12 22 0 t22 0" fill="none" stroke="${blanco}" stroke-width="4" stroke-linecap="round"/></pattern>`,
  };
  return cuerpos[tipo] || '';
}

/**
 * Devuelve el SVG de una prenda como texto.
 * Todo el contenido es fijo (no incluye texto escrito por el usuario).
 */
export function garmentSVG(tipo = 'camiseta', patron = 'liso') {
  const forma = FORMAS[tipo] || FORMAS.camiseta;
  const id = `est-${++contador}`;
  const defs = estampado(id, patron);
  return `
<svg class="g" viewBox="0 0 400 480" aria-hidden="true" focusable="false">
  ${defs ? `<defs>${defs}</defs>` : ''}
  <ellipse class="g-piso" cx="200" cy="458" rx="128" ry="9"/>
  ${forma.antes || ''}
  <path class="g-tela g-contorno" d="${forma.cuerpo}"/>
  ${defs ? `<path d="${forma.cuerpo}" fill="url(#${id})"/>` : ''}
  ${forma.detalle}
</svg>`;
}
