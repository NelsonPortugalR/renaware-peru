-- 20/11/2026 · Repuestos: la foto del equipo en cada sección (lo pidió Nelson: que no diga solo «Nutrex Juicer», que la imagen ayude).
-- Columna nueva en cot_grupos: equipo = [{foto, w, h, nombre}]. Una foto va al costado del título; dos o tres, en fila bajo el título con su nombre.
-- No es lo mismo que fotos (los modelos que atiende un servicio): con equipo, las filas conservan su propia foto.
-- Las fotos son promociones/eq-*.webp de este repo; salen del «Catálogo digital de repuestos y servicios» (PDF del 20/11/2026).
alter table public.cot_grupos add column if not exists equipo jsonb;
comment on column public.cot_grupos.equipo is 'Foto(s) del equipo de la sección: [{foto, w, h, nombre}]. foto = archivo en promociones/ del portal (sin .webp) o una URL. Una foto va al costado del título; varias, en fila con su nombre. Las filas conservan su foto (a diferencia de fotos).';
update public.cot_grupos set equipo = '[{"foto": "eq-asas-perillas", "w": 520, "h": 242}]'::jsonb, updated_at = now() where lista_id = 'repuestos' and grupo = 'Asas y perillas';
update public.cot_grupos set equipo = '[{"foto": "eq-olla-presion-8l", "w": 520, "h": 389}]'::jsonb, updated_at = now() where lista_id = 'repuestos' and grupo = 'Olla a presión 8 L';
update public.cot_grupos set equipo = '[{"foto": "eq-nutrex-cooker-8l", "w": 376, "h": 292}]'::jsonb, updated_at = now() where lista_id = 'repuestos' and grupo = 'Nutrex Cooker 8 L';
update public.cot_grupos set equipo = '[{"foto": "eq-nutrex-cooker-9l", "w": 520, "h": 255}]'::jsonb, updated_at = now() where lista_id = 'repuestos' and grupo = 'Nutrex Cooker 9 L';
update public.cot_grupos set equipo = '[{"foto": "eq-aqua-nano-ctu500", "w": 233, "h": 520}]'::jsonb, updated_at = now() where lista_id = 'repuestos' and grupo = 'Aqua Nano CTU-500';
update public.cot_grupos set equipo = '[{"foto": "eq-aqua-nano-ucu", "w": 361, "h": 520}]'::jsonb, updated_at = now() where lista_id = 'repuestos' and grupo = 'Aqua Nano UCU';
update public.cot_grupos set equipo = '[{"foto": "eq-aqua-ck2-5000", "w": 348, "h": 520, "nombre": "Aqua CK II 5000"}, {"foto": "eq-aqua-ck-3000", "w": 400, "h": 520, "nombre": "Aqua CK 3000"}]'::jsonb, updated_at = now() where lista_id = 'repuestos' and grupo = 'Aqua CK II 5000 y CK 3000';
update public.cot_grupos set equipo = '[{"foto": "eq-rwf-228", "w": 186, "h": 520}]'::jsonb, updated_at = now() where lista_id = 'repuestos' and grupo = 'Filtro portátil RWF-228';
update public.cot_grupos set equipo = '[{"foto": "eq-botella-actual", "w": 191, "h": 520, "nombre": "Actual"}, {"foto": "eq-botella-1ra", "w": 205, "h": 520, "nombre": "1ra generación"}]'::jsonb, updated_at = now() where lista_id = 'repuestos' and grupo = 'Botella filtrante';
update public.cot_grupos set equipo = '[{"foto": "eq-aero-uv", "w": 225, "h": 520, "nombre": "Actual: Aero Quattro+ UV"}, {"foto": "eq-aero-plus", "w": 341, "h": 520, "nombre": "2da generación: Aero Quattro+"}, {"foto": "eq-aero-1ra", "w": 506, "h": 520, "nombre": "1ra generación: Aero Quattro"}]'::jsonb, updated_at = now() where lista_id = 'repuestos' and grupo = 'Purificador de aire';
update public.cot_grupos set equipo = '[{"foto": "eq-nutrex-press-juicer", "w": 235, "h": 520}]'::jsonb, updated_at = now() where lista_id = 'repuestos' and grupo = 'Nutrex Press Juicer';
update public.cot_grupos set equipo = '[{"foto": "eq-nutrex-juicer-nuevo", "w": 499, "h": 520, "nombre": "Modelo nuevo"}, {"foto": "eq-nutrex-juicer-antiguo", "w": 334, "h": 520, "nombre": "Modelo antiguo"}]'::jsonb, updated_at = now() where lista_id = 'repuestos' and grupo = 'Nutrex Juicer';
