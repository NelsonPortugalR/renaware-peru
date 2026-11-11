/* =====================================================================
   Repuestos como el catálogo + pestaña Servicios (2026-11-10)
   ---------------------------------------------------------------------
   · productos.nombre_catalogo: nombre al cliente (el del catálogo PDF de
     repuestos y servicios). Si está, Precios y promociones lo muestra; el
     nombre de la lista oficial sigue en `nombre` y NO se toca, porque
     Reparaciones reparte «Asas y perillas» leyendo ese nombre y la web tiene
     sus propios nombres. Formato «Título · detalle».
   · productos.subgrupo: subtítulo dentro del grupo («Asas · soporte antiguo»).
   · productos.grupo ya existía (lo usan los especiales): en Repuestos es la
     pestaña del catálogo («Asas y perillas», «Nutrex Cooker 9 L»…).
     `categoria` tampoco se toca: la web pública arma sus secciones con ella.
   · cot_grupos: nota de cada grupo, la familia que junta varios grupos en un
     mismo filtro («Filtros de agua») y qué productos de OTRA lista se muestran
     también ahí (los cartuchos de la Lista General dentro de su equipo).
     grupo = '*' es la nota de toda la lista. «Pulido · Tradicional» y
     «Pulido · Zylstra» son variantes de la sección «Pulido»: la página las
     junta en una fila por pieza con un precio por variante.
   · cot_servicios: los servicios (soldadura, limpieza, pulido, cocina) con
     precio al cliente y precio de asesor. No van en listas_precios/productos
     a propósito: la web publica toda lista vigente como «especiales», el
     formulario de registro la ofrecería como lista de venta y el test del
     Nivel 0 la usaría para sus preguntas.
   · cot_servicio_guardar: el admin cambia precio de cliente y de asesor.
   Todo es aditivo. Catálogos de solo lectura para anon (regla 3).
   ===================================================================== */

alter table public.productos add column if not exists nombre_catalogo text;
alter table public.productos add column if not exists subgrupo text;
comment on column public.productos.nombre_catalogo is 'Nombre al cliente, como en el catálogo PDF. Si está, Precios y promociones lo muestra en vez de `nombre` (que conserva el de la lista oficial). Formato «Título · detalle».';
comment on column public.productos.subgrupo is 'Subtítulo dentro del grupo en Precios y promociones (p. ej. «Asas · soporte antiguo»).';

create table if not exists public.cot_grupos (
  lista_id   text not null,
  grupo      text not null,
  orden      smallint not null default 0,
  nota       text,
  tambien    jsonb,
  familia    text,
  updated_at timestamptz not null default now(),
  primary key (lista_id, grupo)
);
alter table public.cot_grupos add column if not exists familia text;
comment on table public.cot_grupos is 'Precios y promociones: nota de cada grupo de Repuestos y Servicios, y productos de otra lista que también se muestran ahí. grupo = ''*'' es la nota de toda la lista.';
comment on column public.cot_grupos.familia is 'Familia que junta varios grupos bajo un mismo filtro de la página (Filtros de agua, Ollas a presión…). Vacío = el grupo va solo.';
comment on column public.cot_grupos.tambien is '[{"lista":"general","codigo":"000096","subgrupo":"Cartuchos de cambio"}]: productos de otra lista que se muestran también en este grupo.';

create table if not exists public.cot_servicios (
  codigo        text primary key,
  categoria     text not null,
  subgrupo      text,
  tipo          text not null default 'servicio',
  nombre        text not null,
  detalle       text,
  unidad        text,
  precio        numeric,
  precio_texto  text,
  precio_asesor numeric,
  foto          text,
  orden         smallint not null default 0,
  activo        boolean not null default true,
  updated_at    timestamptz not null default now(),
  constraint cot_servicios_tipo check (tipo in ('servicio', 'sin_precio')),
  constraint cot_servicios_precio check ((tipo = 'servicio' and precio > 0) or (tipo = 'sin_precio' and precio is null and precio_texto is not null)),
  constraint cot_servicios_asesor check (precio_asesor is null or (precio_asesor > 0 and precio_asesor <= precio))
);
comment on table public.cot_servicios is 'Precios y promociones: servicios (soldadura, limpieza, pulido, cocina) con precio al cliente y precio de asesor. tipo = sin_precio: se muestra con precio_texto («Gratis», «Según diagnóstico»).';
comment on column public.cot_servicios.precio_asesor is 'Lo que paga el asesor. null = todavía sin precio de asesor: la página muestra solo el del cliente.';
comment on column public.cot_servicios.foto is 'Nombre del archivo en renaware-peru/promociones (sin .webp). Varias filas pueden compartir foto.';

alter table public.cot_grupos enable row level security;
alter table public.cot_servicios enable row level security;
revoke all on public.cot_grupos, public.cot_servicios from anon, authenticated;
grant select on public.cot_grupos, public.cot_servicios to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cot_grupos' and policyname = 'todos leen cot_grupos') then
    create policy "todos leen cot_grupos" on public.cot_grupos for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cot_servicios' and policyname = 'todos leen cot_servicios') then
    create policy "todos leen cot_servicios" on public.cot_servicios for select to anon, authenticated using (true);
  end if;
end $$;

create or replace trigger tg_cot_grupos_updated before update on public.cot_grupos for each row execute function public.tocar_updated_at();
create or replace trigger tg_cot_servicios_updated before update on public.cot_servicios for each row execute function public.tocar_updated_at();

create or replace function public.cot_servicio_guardar(p_token uuid, p_codigo text, p_precio numeric, p_precio_asesor numeric default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v public.cot_servicios;
begin
  if not public.es_admin(p_token) then raise exception 'Sesion invalida'; end if;
  if p_precio is null or p_precio <= 0 then raise exception 'Precio invalido'; end if;
  if p_precio_asesor is not null and (p_precio_asesor <= 0 or p_precio_asesor > p_precio) then
    raise exception 'El precio de asesor no puede ser mayor que el del cliente';
  end if;
  update public.cot_servicios set precio = p_precio, precio_asesor = p_precio_asesor
   where codigo = p_codigo and tipo = 'servicio' returning * into v;
  if v.codigo is null then raise exception 'Servicio % no encontrado', p_codigo; end if;
  return jsonb_build_object('codigo', v.codigo, 'precio', v.precio, 'precio_asesor', v.precio_asesor);
end $$;
revoke all on function public.cot_servicio_guardar(uuid, text, numeric, numeric) from public;
grant execute on function public.cot_servicio_guardar(uuid, text, numeric, numeric) to anon, authenticated;

/* plataforma_salud(): los dos catálogos nuevos entran a su lista de catálogos
   (lectura sin sesión permitida), sin reescribir la función a mano. */
do $$
declare d text;
begin
  select pg_get_functiondef('public.plataforma_salud()'::regprocedure) into d;
  if position('cot_servicios' in d) = 0 then
    d := replace(d, '''productos'',''listas_precios''', '''productos'',''cot_servicios'',''cot_grupos'',''listas_precios''');
    if position('cot_servicios' in d) = 0 then raise exception 'No encontré la lista de catálogos en plataforma_salud()'; end if;
    execute d;
  end if;
end $$;
