# Precios y Promociones · Rena Ware Perú

El portal de precios del equipo: Lista General, Tienda en Línea, los especiales
del período, **Repuestos** y **Servicios**, más el buscador maestro y el
simulador de puntos. Cada producto muestra el precio al cliente y el del asesor,
las cuotas, el puntaje, la ganancia de la venta y la del equipo, y se comparte
como cotización o como video por WhatsApp.

Publicado en **https://renaware-peru.nelson1614.workers.dev** (Worker de
Cloudflare con archivos estáticos). Cada push a `main` publica solo.

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| `index.html` | Todo el portal: una sola página, React desde CDN, sin compilar. |
| `promociones/` | Fotos por código: especiales (`382000.webp`), repuestos (`30104.webp`), servicios (`sv-*.webp`) y los equipos de cada sección de Repuestos (`eq-*.webp`). La web pública también toma de aquí las de repuestos y especiales. |
| `_redirects` | Manda `/admin` al mismo `index.html` para que abra el panel. |
| `_headers` | Que ningún buscador indexe el portal. |
| `.assetsignore` | Lo que no se publica: `sql/`, `pruebas/`, este archivo, la configuración. |
| `wrangler.jsonc` | Configuración del Worker: el sitio es la raíz del repo. |
| `sql/` | Cada cambio hecho en la base para este módulo, en orden. `*_PENDIENTE_*` aún no se corre. |
| `pruebas/` | Prueba de comportamiento en Chromium real, sin internet. |

## De dónde salen los datos

Todo lo que cambia seguido vive en Supabase (`kiexpdaaoegbtesqmaff`), no en este
repo. El portal solo **lee** catálogos; lo que se cambia pasa por funciones que
validan la sesión.

- **Listas y productos**: `v_listas_vigentes` y `productos`. En Repuestos,
  `productos.grupo`, `subgrupo` y `nombre_catalogo` ordenan la lista como el
  catálogo en PDF; `nombre` y `categoria` son de la lista oficial y no se tocan
  (los usan Reparaciones y la web pública).
- **Servicios**: `cot_servicios` (soldadura, limpieza, pulido, cocina), con
  precio al cliente y precio de asesor. No es una lista de `listas_precios` a
  propósito: la web, el formulario de registro y el test del Nivel 0 usan toda
  lista vigente.
- **Grupos**: `cot_grupos` trae la nota de cada grupo, la familia que junta
  varios grupos en un mismo filtro («Filtros de agua») y los productos de otra
  lista que también se muestran ahí (los cartuchos de la Lista General dentro de
  su equipo). Una lista con grupos en esta tabla se muestra como catálogo:
  secciones, filas con el precio a la vista y ficha corta, sin cuotas ni puntos.
  «Pulido · Tradicional» y «Pulido · Zylstra» son variantes de la sección
  «Pulido»: una fila por pieza con un precio por variante.
  `cot_grupos.equipo` es la foto del equipo de la sección (`[{foto, w, h,
  nombre}]`): una va al costado del título; dos o tres (modelos o
  generaciones), en fila bajo el título con su nombre. `cot_grupos.fotos` es
  otra cosa: los modelos que atiende un servicio (las cuatro cocinas), y ahí las
  filas van sin foto propia.
- **Fotos, videos, puntaje extra, premios, mensajes**: fila `rena-ware` de
  `site_config`, que se edita desde el panel de administración.
- **Asesores**: la base del equipo. Se entra con el DNI (desde el 12/11/2026): la persona tiene que estar activa en la base del equipo con su DNI (el celular no hace falta). La pestaña dice a quién le falta el DNI y permite invitar, con DNI, a alguien que no está en el equipo.

- **Uso**: `eventos` (con `registrar_evento`). Tipos: `sesion_inicio` (entró
  con su DNI), `visita` (volvió con la sesión guardada; trae equipo, sistema,
  navegador, pantalla y zona), `sesion_fin`, `latido` (uno por minuto con la
  página a la vista: son los minutos de uso), `ver_lista`, `ver_producto`,
  `buscar` (texto y cuántos resultados), `cotizacion` (vía compartir o copiar,
  y el resultado), `video` (resultado, peso, cuánto demoró y de dónde salió),
  `ver_video`, `simulador`, `comparador`, `tutorial` y `error` (errores de la
  página en el equipo de la asesora). Se ve en **Admin → Actividad**
  (`admin_actividad`): totales, una tarjeta por persona, por día, equipos,
  productos más abiertos, búsquedas, fallas al compartir y últimos movimientos.

## Sesión

Quien entró con su DNI se queda dentro: el equipo guarda la sesión
(`rw_sesion_v1`) y lo último que se supo de la persona (`rw_sesion_datos_v1`),
pasa de inmediato y la sesión se confirma por detrás. Solo se vuelve a pedir el
DNI si la base dice que la sesión ya no vale o si la persona cierra sesión; una
falla de la red no saca a nadie (se reintenta sola). Safari en iPhone puede
borrar lo guardado tras varios días sin abrir el portal: eso no se controla
desde la página.

## Inicial y crédito

La inicial abre en el 10 % del precio de cliente y no se recalcula al pasar a
Autocompra: en autocompra la inicial es, y como mínimo, el 10 % del precio de
cliente (no del precio de autocompra). Se
cambia tocando el monto y se confirma con **OK** (o Intro); lo que se pone en
Contado vale en Crédito y al revés, hasta el tope que deja el saldo mínimo por
financiar, y vuelve al 10 % al cerrar la ficha. Las reglas
vienen de `reglas_credito` (saldo mínimo a financiar, cuota mínima, inicial
mínima): hay crédito cuando el precio menos la inicial mínima alcanza el saldo
mínimo; si no, la ficha dice «Solo al contado» y por qué.

## Cotización

«Compartir cotización» arma una imagen PNG dibujada en un lienzo (sin
bibliotecas). **Siempre mide 1080 × 1350** (4:5, el formato vertical que
WhatsApp muestra entero en el chat), igual para la lista general que para un
especial, y **lleva lo que se está viendo**: con «Contado», el precio, la
inicial y el saldo; con «Crédito», la inicial y todas las cuotas. En
autocompra suma el descuento (o la cuota del cliente tachada junto a la del
asesor); no lleva puntos ni premios, para que la foto del producto salga
grande. La letra es grande para que se lea en el chat sin abrir la imagen; si
el contenido es mucho, se reduce un poco antes que achicar la foto. A la foto
de un especial se le quitan sus franjas (la de arriba, con el número y el
descuento, y la de abajo, con el regalo): el regalo va escrito aparte
(`productos.regalo`) y el fondo de la foto se extiende de lado a lado, así los
productos se distinguen. La imagen se prepara sola apenas cambia algo,
para que el celular abra sus opciones en el mismo toque; si el celular se
niega, queda «Imagen lista: toca para enviar». Los datos de la imagen quedan en
`window.__cotizacion` (lo usan las pruebas).

## Video

«Enviar video» baja el archivo una vez y lo guarda en el celular (Cache
Storage, hasta 12 videos o 160 MB), con barra de avance. Con wifi o en
computadora se adelanta la bajada al abrir la ficha. Si la bajada demoró tanto
que el celular ya no deja compartir, queda «Video listo: enviar» (nunca manda
solo el texto); si falla o el navegador no adjunta archivos, ofrece el enlace
por WhatsApp.

## Tutorial

Ya no arranca solo (desde el 20/11/2026): se abre con «Ver tutorial» (arriba,
junto a la fecha de la lista, y en el menú de la cuenta). Es un recorrido de 17
pasos: listas, buscador, abrir un producto, video, precio al contado, puntos y
ganancia, cuotas, subir la inicial (la sube de verdad y dice cuánto baja la
cuota), autocompra (para ti o para un afiliado), sus puntos y el Empiece Ya,
compartir la cotización, una promoción vigente, un repuesto (con su precio de
asesor) y los servicios. Lo que abre el recorrido no cuenta como uso. Se puede
saltar en cualquier paso. Usa un producto de la Lista General que tenga video
y crédito, el primer especial de la promoción que dura más y la primera pieza
propia de Repuestos; si una parte no está (un producto sin video), ese paso
se salta.

## Fotos

Las fotos tienen dos caminos y gana el primero que exista:

1. La URL que el panel guardó en `site_config.imagenes[codigo]` — las que se
   suben desde **Admin → Imágenes**, al bucket público `imagenes`.
2. `promociones/<codigo>.webp` de este repo (en servicios, `<foto>.webp`).

## Cambiar precios

- **Lista general, tienda y especiales**: se cargan en la base desde la lista
  oficial (lo hace el chat de precios).
- **Repuestos**: Admin → Imágenes → Repuestos → «Precio cliente»
  (`set_precio_repuesto_tok`). El precio de asesor viene de la lista oficial.
- **Servicios**: Admin → Imágenes → Servicios → «Precio cliente» y «Precio
  asesor» (`cot_servicio_guardar`). Si un servicio no tiene precio de asesor, su
  ficha muestra solo el del cliente.

Este repositorio es público: aquí no se guardan precios de asesor, puntos ni
valores comisionables. Los datos de `pruebas/datos.json` usan cifras inventadas.

## Pruebas

```
node pruebas/prueba.js            # todo (unos 3 minutos)
SOLO=servicios node pruebas/prueba.js
SOLO=inicial,cotizacion,video,permanencia node pruebas/prueba.js
node pruebas/prueba.js capturas/  # además deja capturas
```

Necesita Playwright (`npm i playwright` dentro de `pruebas/`, o el que ya trae
el entorno). No sale a internet: React va en `pruebas/vendor/`, y la base es un
Supabase simulado (`pruebas/simulador.js`) que rechaza cualquier escritura
directa a una tabla; si la página lo intenta, la prueba falla.
