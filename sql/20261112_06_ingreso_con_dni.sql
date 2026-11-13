/* =====================================================================
   Los asesores entran con su DNI (2026-11-12)
   ---------------------------------------------------------------------
   Lo decidió Nelson: el celular de un asesor lo tiene cualquier cliente;
   el DNI no. Vale para las tres pantallas que llaman a asesor_login:
   Precios y promociones, la plataforma de asesores (/asesores/) y el
   acceso del hub (renaware-plataforma).

   · Quién entra: la persona ACTIVA de eq_personas que tiene ahí su DNI y
     su celular, o el invitado de «asesores» con DNI. El celular sigue
     siendo con el que la plataforma reconoce a la persona (sesiones,
     panel, premios, bloqueos): por eso hace falta que lo tenga.
   · asesor_login conserva el nombre de su parámetro (cambiarlo obliga a
     borrar la función): con 7 u 8 dígitos lo que llega es un DNI; con 9
     sigue siendo un celular, que es como la llaman ts_login y
     traspaso_canjear (la oficina que abre el cotizador), que ya saben
     quién es la persona. Las pantallas solo aceptan DNI.
   · acceso_dni es interna: no se puede llamar desde fuera.
   · Panel de precios → Asesores: dice a quién le falta el DNI
     (admin_asesores devuelve con_dni y el total sin_dni; filtro
     p_solo = 'sin_dni') e invita con DNI (admin_invitar).
   · El DNI de un invitado se pone desde el panel; el del invitado con
     vista completa se copió de eq_personas (no va aquí: el repositorio
     es público).

   Solo agrega. Se puede volver a correr.
   ===================================================================== */

alter table public.asesores add column if not exists dni text;
create unique index if not exists asesores_dni_uq on public.asesores (dni) where dni is not null;
comment on column public.asesores.dni is 'DNI del invitado (8 dígitos). Desde el 12/11/2026 las personas entran con su DNI; el celular sigue siendo la llave de la fila y con el que la plataforma reconoce a la persona.';

create or replace function public.acceso_dni(p_dni text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_dni text := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'); a record; v_nom text; v_cel text;
begin
  if length(v_dni) = 7 then v_dni := lpad(v_dni, 8, '0'); end if;   -- DNI escrito sin el 0 de adelante
  if length(v_dni) <> 8 then return jsonb_build_object('ok', false); end if;
  -- invitados: su DNI está en «asesores»
  select * into a from asesores where dni = v_dni;
  if found then
    if not a.activo then return jsonb_build_object('ok', false, 'motivo', 'bloqueado'); end if;
    return jsonb_build_object('ok', true, 'nombre', coalesce(a.nombre, ''), 'celular', a.celular, 'origen', 'invitado');
  end if;
  -- personas activas del equipo: el DNI es la llave; el celular sigue siendo con el que la plataforma las reconoce
  select q.nombre, cel_norm(q.celular) into v_nom, v_cel from eq_personas q
   where q.activo and regexp_replace(coalesce(q.dni, ''), '\D', '', 'g') ~ '^[0-9]{7,8}$'
     and lpad(regexp_replace(q.dni, '\D', '', 'g'), 8, '0') = v_dni
   order by (length(cel_norm(q.celular)) = 9) desc, q.actualizado_en desc nulls last limit 1;
  if not found then return jsonb_build_object('ok', false); end if;
  if length(coalesce(v_cel, '')) <> 9 then return jsonb_build_object('ok', false, 'motivo', 'sin_celular'); end if;
  if exists (select 1 from asesores x where x.celular = v_cel and not x.activo) then return jsonb_build_object('ok', false, 'motivo', 'bloqueado'); end if;
  return jsonb_build_object('ok', true, 'nombre', coalesce(v_nom, ''), 'celular', v_cel, 'origen', 'equipo');
end $function$;
revoke all on function public.acceso_dni(text) from public, anon, authenticated;

create or replace function public.asesor_login(p_celular text, p_ctx jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
-- Desde el 12/11/2026 las personas entran con su DNI: p_celular trae el DNI (7 u 8 dígitos) cuando
-- viene de una pantalla de ingreso (Precios y promociones, plataforma de asesores). El parámetro
-- conserva su nombre porque cambiarlo obliga a borrar la función. Con 9 dígitos sigue siendo un
-- celular: así la llaman ts_login y traspaso_canjear, que ya saben quién es la persona.
declare v_dig text := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
        v_es_dni boolean; v_cel text; v_ip text := ip_cliente(); v_fallos int; v_acc jsonb; v_tok uuid;
begin
  select count(*) into v_fallos from login_intentos
   where ip = v_ip and not ok and creado > now() - interval '15 minutes';
  if v_fallos >= 10 then raise exception 'Demasiados intentos. Espera 15 minutos.'; end if;

  v_es_dni := length(v_dig) in (7, 8);
  if v_es_dni then
    v_acc := acceso_dni(v_dig);
    v_cel := coalesce(v_acc->>'celular', '');
    insert into login_intentos (ip, dato, ok) values (v_ip, 'dni ***' || right(v_dig, 3), (v_acc->>'ok')::boolean);
    if not (v_acc->>'ok')::boolean then
      if v_acc->>'motivo' = 'sin_celular' then
        raise exception 'Tu DNI está registrado, pero falta tu celular en la base del equipo. Avísale a tu líder.';
      end if;
      raise exception 'Ese DNI no esta habilitado';
    end if;
  else
    v_cel := cel_norm(p_celular);
    v_acc := acceso_de(v_cel);
    insert into login_intentos (ip, dato, ok) values (v_ip, v_cel, (v_acc->>'ok')::boolean);
    if not (v_acc->>'ok')::boolean then raise exception 'Ese numero no esta habilitado'; end if;
  end if;

  insert into asesor_sesion (celular, dispositivo, navegador, so, pantalla, zona, idioma, ip, pais)
  values (v_cel, p_ctx->>'dispositivo', p_ctx->>'navegador', p_ctx->>'so', p_ctx->>'pantalla',
          p_ctx->>'zona', p_ctx->>'idioma', v_ip, pedir_header('cf-ipcountry'))
  returning token into v_tok;
  insert into eventos (token, celular, tipo, detalle)
  values (v_tok, v_cel, 'sesion_inicio', coalesce(p_ctx, '{}'::jsonb) || jsonb_build_object('ingreso', case when v_es_dni then 'dni' else 'celular' end));
  return jsonb_build_object('token', v_tok, 'nombre', v_acc->>'nombre', 'celular', v_cel,
    'completa', coalesce((select a.vista_completa from asesores a where a.celular = v_cel and a.activo), false));
end $function$;

create or replace function public.admin_asesores(p_token uuid, p_busca text default ''::text, p_solo text default 'activos'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_b text := norm_txt(coalesce(p_busca,''));
        v_d text := regexp_replace(coalesce(p_busca,''), '\D', '', 'g');
begin
  if not es_admin(p_token) then raise exception 'Sesion invalida'; end if;
  return jsonb_build_object(
   'total_equipo', (select count(distinct cel_norm(celular)) from eq_personas where activo and coalesce(celular,'') <> ''),
   'bloqueados',   (select count(*) from asesores where not activo),
   'invitados',    (select count(*) from asesores where activo),
   'sin_dni',      (select count(*) from (
                      select cel_norm(p.celular) from eq_personas p where p.activo and coalesce(p.celular,'') <> ''
                       group by 1 having not bool_or(regexp_replace(coalesce(p.dni,''), '\D', '', 'g') ~ '^[0-9]{7,8}$')
                      union all
                      select a.celular from asesores a where a.activo and a.dni is null
                        and not exists (select 1 from eq_personas p where p.activo and cel_norm(p.celular) = a.celular)
                    ) s),
   'filas', coalesce((select jsonb_agg(f order by (f->>'ultima_vez') desc nulls last, f->>'nombre') from (
      select jsonb_build_object(
        'celular', u.cel, 'nombre', u.nombre, 'origen', u.origen, 'con_dni', u.con_dni,
        'bloqueado', exists(select 1 from asesores a where a.celular = u.cel and not a.activo),
        'ultima_vez', (select max(s.ultimo_uso) from asesor_sesion s where s.celular = u.cel),
        'sesiones', (select count(*) from asesor_sesion s where s.celular = u.cel)
      ) as f
      from (
        select cel_norm(p.celular) as cel, max(p.nombre) as nombre, 'equipo' as origen,
               bool_or(regexp_replace(coalesce(p.dni,''), '\D', '', 'g') ~ '^[0-9]{7,8}$') as con_dni
          from eq_personas p where p.activo and coalesce(p.celular,'') <> '' group by 1
        union
        select a.celular, coalesce(a.nombre,''), 'invitado', a.dni is not null from asesores a where a.activo
      ) u
      where (
             v_b = ''
          or norm_txt(u.nombre) like '%'||v_b||'%'
          or (v_d <> '' and u.cel like '%'||v_d||'%')
        )
        and (p_solo <> 'usaron' or exists(select 1 from asesor_sesion s where s.celular = u.cel))
        and (p_solo <> 'sin_dni' or not u.con_dni)
      limit 120) q), '[]'::jsonb));
end $function$;

create or replace function public.admin_invitar(p_token uuid, p_celular text, p_nombre text, p_dni text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_cel text := cel_norm(p_celular); v_dni text := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
begin
  if not es_admin(p_token) then raise exception 'Sesion invalida'; end if;
  if length(v_cel) < 9 then raise exception 'Celular invalido: %', p_celular; end if;
  if length(v_dni) = 7 then v_dni := lpad(v_dni, 8, '0'); end if;
  if length(v_dni) <> 8 then raise exception 'El DNI necesita 8 dígitos'; end if;
  if exists (select 1 from asesores where dni = v_dni and celular <> v_cel) then raise exception 'Ese DNI ya está en otro invitado'; end if;
  insert into asesores (celular, nombre, activo, dni) values (v_cel, nullif(trim(coalesce(p_nombre, '')), ''), true, v_dni)
  on conflict (celular) do update set nombre = coalesce(excluded.nombre, asesores.nombre), activo = true, dni = excluded.dni;
  return jsonb_build_object('celular', v_cel);
end $function$;

/* Los avisos de sesión vencida decían «Vuelve a entrar con tu celular.» (asesor_inicio,
   plataforma_menu, traspaso_canjear, traspaso_crear_asesor): solo cambia ese texto. */
do $$
declare r record;
begin
  for r in select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
            where ns.nspname = 'public' and p.prosrc like '%Vuelve a entrar con tu celular.%' loop
    execute replace(pg_get_functiondef(r.oid), 'Vuelve a entrar con tu celular.', 'Vuelve a entrar con tu DNI.');
  end loop;
end $$;
