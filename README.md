# Precios y Promociones · Rena Ware Perú

El portal de precios del equipo: listas general y tienda en línea, promociones
del período, especiales, repuestos y el buscador maestro. Cada producto muestra
el precio al cliente y el de autocompra, las cuotas, el puntaje, la ganancia de
la venta y la del equipo, y se comparte como cotización o como video por
WhatsApp.

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| `index.html` | Todo el portal: una sola página, React desde CDN, sin compilar. |
| `_redirects` | Manda `/admin` al mismo `index.html` para que abra el panel. |
| `promociones/` | Las fotos de los especiales, una por código (`382000.webp`). |

## De dónde salen los datos

Todo lo que cambia seguido vive en Supabase (`kiexpdaaoegbtesqmaff`), no en este
repo:

- **Productos, listas y precios**: tablas `productos` y `listas`.
- **Fotos, videos, puntaje extra, premios, mensajes**: fila `rena-ware` de
  `site_config`, que se edita desde el panel de administración.
- **Asesores**: la base del equipo; sin celular registrado no se entra.

Las fotos tienen dos caminos y gana el primero que exista:

1. La URL que el panel guardó en `site_config.imagenes[codigo]` — ahí van las
   que se suben desde **Admin → Imágenes**, al bucket público `imagenes`.
2. `promociones/<codigo>.webp` de este repo, que es el respaldo.

Por eso una lista nueva puede llegar por cualquiera de los dos lados: subiendo
las fotos en el panel (incluso varias de una vez) o dejándolas en esta carpeta.

## Despliegue

Cloudflare Pages conectado a este repo: directorio raíz, sin comando de build;
cada push a `main` publica en **https://renaware-peru.pages.dev**.
