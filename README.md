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
| `promociones/` | Fotos por código: especiales (`382000.webp`), repuestos (`30104.webp`) y servicios (`sv-*.webp`). La web pública también toma de aquí las de repuestos y especiales. |
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
- **Fotos, videos, puntaje extra, premios, mensajes**: fila `rena-ware` de
  `site_config`, que se edita desde el panel de administración.
- **Asesores**: la base del equipo. Se entra con el DNI (desde el 12/11/2026): la persona tiene que estar activa en la base del equipo con su DNI (el celular no hace falta). La pestaña dice a quién le falta el DNI y permite invitar, con DNI, a alguien que no está en el equipo.

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
node pruebas/prueba.js            # todo
SOLO=servicios node pruebas/prueba.js
node pruebas/prueba.js capturas/  # además deja capturas
```

Necesita Playwright (`npm i playwright` dentro de `pruebas/`, o el que ya trae
el entorno). No sale a internet: React va en `pruebas/vendor/`, y la base es un
Supabase simulado (`pruebas/simulador.js`) que rechaza cualquier escritura
directa a una tabla; si la página lo intenta, la prueba falla.
