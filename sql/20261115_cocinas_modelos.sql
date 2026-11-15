-- 15/11/2026 · Servicios → Cocina de inducción: las fotos de los cuatro modelos que atiende el taller
-- (lo pidió Nelson). Columna nueva en cot_grupos: fotos que se muestran en rejilla bajo el título de la sección.
-- Las fotos son promociones/sv-coc-*.webp de este repo (salen de modelos/ de renaware-reparaciones).
alter table public.cot_grupos add column if not exists fotos jsonb;
comment on column public.cot_grupos.fotos is 'Fotos que se muestran bajo el título de la sección, en rejilla: [{foto, nombre, nota}]. foto = archivo en promociones/ del portal (sin .webp) o una URL.';
update public.cot_grupos set fotos = '[
  {"foto": "sv-coc-ic-450", "nombre": "IC-450", "nota": "La más reciente"},
  {"foto": "sv-coc-ic-350", "nombre": "IC-350", "nota": "Generación intermedia"},
  {"foto": "sv-coc-ic-400", "nombre": "IC-400", "nota": "Antes de la IC-350"},
  {"foto": "sv-coc-sw-3000", "nombre": "SW-3000", "nota": "Modelo antiguo"}
]'::jsonb, updated_at = now()
where lista_id = 'servicios' and grupo = 'Cocina de inducción';

-- 15/11/2026 (después) · La fila del mantenimiento (S/ 140) ya no muestra la foto de la IC-450: parecía que los
-- otros modelos costaban distinto. En la lista, una sección con rejilla de fotos pone sus filas sin foto (lo hace
-- la página); en la ficha del mantenimiento va la foto de los cuatro modelos juntos (promociones/sv-coc-modelos.webp).
update public.cot_servicios set foto = 'sv-coc-modelos' where codigo = 'sv-coc-mantenimiento';
