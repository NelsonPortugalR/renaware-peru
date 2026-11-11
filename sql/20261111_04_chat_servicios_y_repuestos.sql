/* Pregúntale (chat de la plataforma) · 11/11/2026
   Cada módulo mantiene sus herramientas y fichas del chat.
   · servicios_buscar (nueva): lee cot_servicios con la nota de su grupo.
   · repuestos_buscar: además busca y devuelve el nombre de catálogo, el grupo
     y el subgrupo (productos.nombre_catalogo / grupo / subgrupo).
   · ficha «servicios»: al día con el catálogo de octubre de 2026. Los precios
     ya no se copian en la ficha: salen de las herramientas, que leen la base. */

insert into public.chat_herramientas (proyecto, nombre, descripcion, parametros, tipo, sql, roles, orden) values
('renaware', 'servicios_buscar',
 'Servicios de posventa del catálogo: soldadura (perno de la perilla, soporte del asa), limpieza y Rena Lite por unidad, pulido profesional por pieza en serie Tradicional (asas negras) o Zylstra, y servicio técnico de cocina de inducción. Devuelve precio al cliente, precio de asesor (vacío si aún no tiene), unidad, lo que va sin precio fijo («Gratis», «Según diagnóstico», «No se hace») y la nota del servicio (plazos, taller, garantía). Úsala para «cuánto cuesta pulir una olla de 4 litros», «soldar una perilla», «mantenimiento de cocina», «Rena Lite suelto». Sin q devuelve todos; con q, primero los que más coinciden.',
 '{"type":"object","properties":{"q":{"type":"string","description":"Qué servicio o pieza, p. ej. \"pulido olla 4 litros\", \"soldadura\", \"rena lite\", \"cocina\"."}}}',
 'sql',
 $sql$
with s as (select unaccent_safe(trim(coalesce($1->>'q',''))) as q),
     w as (select distinct x as palabra from s, regexp_split_to_table(s.q, '\s+') x where length(x) > 2 or x ~ '^[0-9]+$'),
     f as (select v.*, unaccent_safe(v.categoria || ' ' || coalesce(v.subgrupo,'') || ' ' || v.nombre || ' ' || coalesce(v.detalle,'')) as texto
             from cot_servicios v where v.activo)
select f.categoria, f.subgrupo, f.nombre, f.detalle, f.unidad, f.precio as precio_cliente, f.precio_asesor, f.precio_texto as sin_precio_fijo,
       nullif(concat_ws('. ', g.nota, gb.nota), '') as nota
from f
left join cot_grupos g on g.lista_id = 'servicios' and g.grupo = f.categoria
left join cot_grupos gb on gb.lista_id = 'servicios' and gb.grupo = split_part(f.categoria, ' · ', 1) and gb.grupo <> f.categoria
cross join s
where s.q = '' or not exists (select 1 from w) or exists (select 1 from w where f.texto like '%' || w.palabra || '%')
order by (select count(*) from w where f.texto like '%' || w.palabra || '%') desc, f.orden
limit 60
$sql$,
 array['admin','asistente','gestor','asesor'], 15)
on conflict (proyecto, nombre) do update set descripcion = excluded.descripcion, parametros = excluded.parametros, tipo = excluded.tipo,
  sql = excluded.sql, roles = excluded.roles, orden = excluded.orden, activo = true, actualizado_en = now();

update public.chat_herramientas set
  descripcion = 'Busca repuestos (asas, perillas, piezas de ollas a presión, de filtros de agua, del purificador de aire y de los extractores, cartuchos y elementos de cambio) en la lista de repuestos y en la lista general: código, grupo (el equipo al que pertenece), subgrupo, nombre de catálogo, precio de cliente, precio de asesor y puntos. Acepta nombres coloquiales (alias), el nombre del equipo («nutrex cooker 9», «aqua nano ucu») y el código.',
  sql = $sql$
with s as (select unaccent_safe(trim(coalesce($1->>'q',''))) as q),
     ali as (select distinct z.nombre as pieza, z.codigo_general from pieza_alias a join piezas z on z.clave = a.clave, s
             where s.q <> '' and (unaccent_safe(a.alias) like '%' || s.q || '%' or unaccent_safe(z.nombre) like '%' || s.q || '%'))
select p.lista_id as lista, p.codigo, coalesce(p.grupo, p.categoria) as grupo, p.subgrupo, coalesce(p.nombre_catalogo, p.nombre) as nombre,
       p.nombre as nombre_lista_oficial, p.precio as precio_cliente, p.precio_asesor, p.puntos, p.regalo
from productos p, s
where p.activo and (p.lista_id = 'repuestos' or unaccent_safe(coalesce(p.categoria,'')) like 'repuestos%')
  and (s.q = ''
       or unaccent_safe(p.nombre) like '%' || s.q || '%'
       or unaccent_safe(coalesce(p.nombre_catalogo,'')) like '%' || s.q || '%'
       or unaccent_safe(coalesce(p.grupo,'') || ' ' || coalesce(p.subgrupo,'')) like '%' || s.q || '%'
       or unaccent_safe(coalesce(p.categoria,'')) like '%' || s.q || '%'
       or p.codigo = s.q
       or exists (select 1 from ali where unaccent_safe(p.nombre) like '%' || unaccent_safe(ali.pieza) || '%' or p.codigo = ali.codigo_general))
order by (p.lista_id = 'repuestos') desc, p.orden
limit 60
$sql$,
  actualizado_en = now()
where proyecto = 'renaware' and nombre = 'repuestos_buscar';

update public.chat_fichas set
  titulo = 'Servicios y repuestos: qué son, plazos y de dónde sale el precio',
  fuente = 'catálogo de repuestos y servicios (octubre 2026) y guía de visitas del equipo',
  actualizado_en = now(),
  contenido = $txt$
- Jerarquía: vender productos + formar equipo = el negocio. Servicios y repuestos son ingreso extra que cubre los gastos del día y permite seguir visitando.
- Precios: siempre de las herramientas, nunca de memoria. servicios_buscar trae soldadura, limpieza, Rena Lite por unidad, pulido y cocina de inducción; repuestos_buscar trae asas, perillas, ollas a presión, filtros, purificador y extractores. Cada fila da el precio al cliente y el precio de asesor; la diferencia es lo que gana el asesor. Si un servicio no tiene precio de asesor cargado, se informa solo el del cliente. Todo es al contado y no da puntos ni valor comisionable; el pedido de repuestos lo ingresa la oficina.
- Rena Lite: abrillantador de acero inoxidable; en seco mantiene el brillo y con un poco de agua hace una pasta que retira manchas arcoíris, doradas, blancas y puntos anaranjados. Por unidad está en servicios_buscar; los packs de 4 y de 12 son productos de la Lista General (precios_buscar). Botella de acero: cuesta S/ 60, se vende a S/ 90 (gana S/ 30).
- Repuestos originales: llegan en unos 2 días. Asas: se elige mirando el soporte soldado en la olla (antiguo, antes del 2000 aprox., en diagonal; moderno, del 2000 en adelante) y el tamaño (1 a 6 litros u 8 litros a más). Perillas: se elige mirando la tapa sin la perilla (tapas de 1954 a 1997 o desde 1998). Los cartuchos de los filtros de agua, de la botella filtrante y del purificador de aire actual son productos de la Lista General: esos sí dan puntos y comisión.
- Soldadura: del perno de la perilla (en la tapa) o del soporte de un asa (en la olla); se hace en el taller de Lima, en unos 30 días. Otro trabajo de soldadura va según cotización del taller.
- Limpieza (la hacemos nosotros): un precio por olla de 1 a 6 litros y otro para tetera y utensilios de 8 litros a más; unos 3 días útiles (hasta 1 semana); pago al final por Yape o efectivo. Quita manchas de calor, reduce quemado y mejora el brillo.
- Pulido profesional: precio por pieza, con o sin tapa (la tapa sola no se pule), distinto según la serie: Tradicional (ollas con asas negras) o Zylstra (la serie nueva); algunas piezas no se pulen en Zylstra. Taller de Lima, unos 30 días. No incluye cambio de asas ni perillas; no se promociona, se explica si lo piden.
- Cocina de inducción (IC-450, IC-350, IC-400 y SW-3000): revisión y diagnóstico gratis y sin compromiso; se recoge la cocina y se lleva al técnico; el diagnóstico sale en unos 7 días y, si el cliente aprueba el precio, queda lista en unos 3 días más. El mantenimiento tiene precio fijo; el cambio de ventilador, tarjeta, sensor o vidrio va según diagnóstico.
- Garantía (se evalúa antes de cobrar): si es algo del acero (base, perno que se salió, agujeros) y no hay golpes visibles, se lleva para evaluación; si pasa la garantía Rena Ware lo cambia gratis.
- El margen de cada reparación es para el asesor que trajo al cliente (reparaciones muestra margen_asesor).
$txt$
where id = '7baf8951-31cb-43cb-b698-60aea948508b';
