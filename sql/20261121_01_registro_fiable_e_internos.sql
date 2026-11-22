-- 21/11/2026 · Estadísticas (Admin → Estadísticas). Nelson: «las estadísticas tienen errores, salen 3 videos enviados y
-- estoy seguro que fueron más; quiero que mejores para guardar la actividad real; la opción de mostrar estadísticas sin
-- mí; la ubicación, porque deseo saber si alguien compartió su cuenta». Todo es aditivo.
--
-- Por qué se perdían eventos: la página mandaba cada evento al momento y, si no había señal o el celular cerraba la
-- página mientras se compartía (WhatsApp con un video pesado), ese evento no llegaba nunca. Ahora el equipo los guarda
-- en una cola y los manda en lotes (registrar_eventos); si no salen, salen en la próxima visita. Cada evento lleva un id
-- que pone el equipo: aunque llegue dos veces, se guarda una. Y la hora es la del equipo (ocurrido), no la de llegada.

alter table public.eventos add column if not exists ocurrido timestamptz;
alter table public.eventos add column if not exists id_cliente uuid;
alter table public.eventos add column if not exists equipo text;
comment on column public.eventos.ocurrido is 'Cuándo pasó, según el equipo (llega tarde si no había señal). En los eventos viejos es null: vale creado.';
comment on column public.eventos.id_cliente is 'Id que el equipo le pone a cada evento: si lo manda dos veces, se guarda una.';
comment on column public.eventos.equipo is 'Id del navegador que lo mandó: se crea una vez y queda guardado en el equipo (rw_equipo_v1).';
create unique index if not exists ux_eventos_id_cliente on public.eventos (id_cliente) where id_cliente is not null;
create index if not exists ix_eventos_tipo_fecha on public.eventos (tipo, creado desc);

create or replace function public.registrar_eventos(p_token uuid, p_eventos jsonb, p_equipo text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
-- Recibe de una vez los eventos que el equipo tenía en cola (hasta 100): [{id, tipo, t (ms desde 1970), d (detalle)}].
-- Devuelve cuántos guardó nuevos; -1 si la sesión ya no vale (el equipo descarta esos eventos y no reintenta).
-- A la visita le agrega la IP y el país de la conexión (para ver desde dónde entra cada persona).
declare v_cel text; v_n int := 0; v_e jsonb; v_t timestamptz; v_id uuid; v_d jsonb; v_tipo text; v_ip text; v_pais text;
begin
  select celular into v_cel from asesor_sesion where token = p_token;
  if v_cel is null then return -1; end if;
  if p_eventos is null or jsonb_typeof(p_eventos) <> 'array' then return 0; end if;
  for v_e in select x.value from jsonb_array_elements(p_eventos) with ordinality as x(value, n) where x.n <= 100 loop
    v_tipo := left(coalesce(v_e->>'tipo', ''), 40);
    continue when v_tipo = '';
    v_t := case when coalesce(v_e->>'t', '') ~ '^\d{12,14}(\.\d+)?$' then to_timestamp((v_e->>'t')::double precision / 1000.0) end;
    if v_t is null or v_t > now() then v_t := now(); end if;            -- sin hora, o un reloj adelantado: la de llegada
    continue when v_t < now() - interval '30 days';                      -- algo que quedó en cola demasiado tiempo
    v_id := case when coalesce(v_e->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (v_e->>'id')::uuid end;
    v_d := case when jsonb_typeof(v_e->'d') = 'object' then v_e->'d' else '{}'::jsonb end;
    if length(v_d::text) > 4000 then v_d := jsonb_build_object('recortado', true); end if;
    if v_tipo = 'visita' then
      if v_ip is null then v_ip := ip_cliente(); v_pais := pedir_header('cf-ipcountry'); end if;
      v_d := v_d || jsonb_build_object('ip', v_ip, 'pais_ip', v_pais);
    end if;
    insert into eventos (token, celular, tipo, detalle, ocurrido, id_cliente, equipo)
    values (p_token, v_cel, v_tipo, v_d, v_t, v_id, left(p_equipo, 64))
    on conflict (id_cliente) where id_cliente is not null do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;
  update asesor_sesion set ultimo_uso = now() where token = p_token;
  return v_n;
end $function$;
grant execute on function public.registrar_eventos(uuid, jsonb, text) to anon, authenticated;

-- Cuentas internas: las de quien administra (Nelson) y las de prueba. «Sin mí» en Estadísticas las deja fuera.
-- No se borran filas: se marcan o desmarcan con `interno`.
create table if not exists public.actividad_internos (
  llave text primary key,              -- la llave de la sesión: el celular de la persona o, si no tiene, su DNI
  nombre text,
  interno boolean not null default true,
  creado timestamptz not null default now(),
  cambiado timestamptz not null default now()
);
alter table public.actividad_internos enable row level security;
revoke all on public.actividad_internos from anon, authenticated;
comment on table public.actividad_internos is 'Cuentas que «Sin mí» deja fuera de Admin → Estadísticas (Nelson y las de prueba).';

-- Nelson: la única cuenta con vista completa (sin escribir aquí su número: el repo es público)
insert into public.actividad_internos (llave, nombre)
select a.celular, coalesce(nullif(a.nombre, ''), 'Nelson') from public.asesores a where a.vista_completa and a.activo
on conflict (llave) do nothing;

create or replace function public.admin_interno(p_token uuid, p_llave text, p_interno boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
-- Marca o desmarca una cuenta como interna (no cuenta en Estadísticas con «Sin mí»). Solo el admin.
begin
  if not es_admin(p_token) then raise exception 'Sesion invalida'; end if;
  if coalesce(p_llave, '') !~ '^\d{7,9}$' then raise exception 'Llave invalida'; end if;
  insert into actividad_internos (llave, nombre, interno)
  values (p_llave,
          coalesce((select p.nombre from eq_personas p where p.dni = p_llave or cel_norm(p.celular) = p_llave order by p.activo desc nulls last limit 1),
                   (select a.nombre from asesores a where a.celular = p_llave or a.dni = p_llave limit 1)),
          coalesce(p_interno, true))
  on conflict (llave) do update set interno = excluded.interno, cambiado = now();
  return coalesce(p_interno, true);
end $function$;
grant execute on function public.admin_interno(uuid, text, boolean) to anon, authenticated;
