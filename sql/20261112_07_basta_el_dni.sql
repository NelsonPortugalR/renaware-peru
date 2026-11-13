/* =====================================================================
   Para entrar basta el DNI (2026-11-12, más tarde)
   ---------------------------------------------------------------------
   Nelson probó con el DNI de una persona activa del equipo que no tiene
   celular en la base y no pudo entrar. Pidió que no se exija el celular:
   con el DNI debe bastar. (No tenía celular porque su ficha vino de la
   carga del sistema de Rena Ware, que no los trae: 29 personas activas
   con DNI estaban así.)

   · La sesión guarda en asesor_sesion.celular la LLAVE de la persona: su
     celular o, si no tiene uno en la base, su DNI (8 dígitos; un celular
     tiene 9, no se confunden). Nunca va vacía: una llave vacía calzaría
     con cualquier persona sin celular.
   · asesor_sesion_valida valida por DNI cuando la llave tiene 8 dígitos.
   · asesor_panel_de (panel de la plataforma de asesores) reconoce a la
     persona también por esa llave, y su Nivel Cero por DNI.
   · Panel de precios → Asesores: lista también a quien no tiene celular
     (sin_celular) y se le puede bloquear igual.
   Reemplaza las versiones de acceso_dni, asesor_login y admin_asesores de
   20261112_06. Se puede volver a correr (el bloque de asesor_panel_de se
   detiene solo si la función ya está cambiada o cambió por otro lado).
   ===================================================================== */

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
  -- personas activas del equipo: basta el DNI
  select q.nombre, cel_norm(q.celular) into v_nom, v_cel from eq_personas q
   where q.activo and regexp_replace(coalesce(q.dni, ''), '\D', '', 'g') ~ '^[0-9]{7,8}$'
     and lpad(regexp_replace(q.dni, '\D', '', 'g'), 8, '0') = v_dni
   order by (length(cel_norm(q.celular)) = 9) desc, q.actualizado_en desc nulls last limit 1;
  if not found then return jsonb_build_object('ok', false); end if;
  -- «celular» es la llave con la que la plataforma reconoce a la persona en su sesión: su celular o,
  -- si no tiene uno en la base, su DNI (8 dígitos; un celular tiene 9, no se confunden). Nunca va vacía.
  if length(coalesce(v_cel, '')) <> 9 then v_cel := v_dni; end if;
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
-- viene de una pantalla de ingreso (Precios y promociones, plataforma de asesores, hub). El parámetro
-- conserva su nombre porque cambiarlo obliga a borrar la función. Con 9 dígitos sigue siendo un
-- celular: así la llaman ts_login y traspaso_canjear, que ya saben quién es la persona.
-- La sesión guarda en «celular» la llave de la persona: su celular o, si no tiene, su DNI.
declare v_dig text := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
        v_es_dni boolean; v_cel text; v_ip text := ip_cliente(); v_fallos int; v_acc jsonb; v_tok uuid;
begin
  select count(*) into v_fallos from login_intentos
   where ip = v_ip and not ok and creado > now() - interval '15 minutes';
  if v_fallos >= 10 then raise exception 'Demasiados intentos. Espera 15 minutos.'; end if;

  v_es_dni := length(v_dig) in (7, 8);
  if v_es_dni then
    v_acc := acceso_dni(v_dig);
    insert into login_intentos (ip, dato, ok) values (v_ip, 'dni ***' || right(v_dig, 3), (v_acc->>'ok')::boolean);
    if not (v_acc->>'ok')::boolean then raise exception 'Ese DNI no esta habilitado'; end if;
    v_cel := v_acc->>'celular';
  else
    v_cel := cel_norm(p_celular);
    v_acc := acceso_de(v_cel);
    insert into login_intentos (ip, dato, ok) values (v_ip, v_cel, (v_acc->>'ok')::boolean);
    if not (v_acc->>'ok')::boolean then raise exception 'Ese numero no esta habilitado'; end if;
  end if;
  if coalesce(v_cel, '') = '' then raise exception 'Ese DNI no esta habilitado'; end if;

  insert into asesor_sesion (celular, dispositivo, navegador, so, pantalla, zona, idioma, ip, pais)
  values (v_cel, p_ctx->>'dispositivo', p_ctx->>'navegador', p_ctx->>'so', p_ctx->>'pantalla',
          p_ctx->>'zona', p_ctx->>'idioma', v_ip, pedir_header('cf-ipcountry'))
  returning token into v_tok;
  insert into eventos (token, celular, tipo, detalle)
  values (v_tok, v_cel, 'sesion_inicio', coalesce(p_ctx, '{}'::jsonb) || jsonb_build_object('ingreso', case when v_es_dni then 'dni' else 'celular' end));
  return jsonb_build_object('token', v_tok, 'nombre', v_acc->>'nombre', 'celular', v_cel,
    'completa', coalesce((select a.vista_completa from asesores a where a.celular = v_cel and a.activo), false));
end $function$;

create or replace function public.asesor_sesion_valida(p_token uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_cel text; v_acc jsonb;
begin
  select celular into v_cel from asesor_sesion where token = p_token;
  if v_cel is null then return jsonb_build_object('ok', false); end if;
  -- la llave de la sesión es el celular de la persona o, si no tiene uno en la base, su DNI (8 dígitos)
  if length(v_cel) = 8 then v_acc := acceso_dni(v_cel); else v_acc := acceso_de(v_cel); end if;
  if not (v_acc->>'ok')::boolean then return jsonb_build_object('ok', false); end if;
  update asesor_sesion set ultimo_uso = now() where token = p_token;
  return jsonb_build_object('ok', true, 'nombre', v_acc->>'nombre', 'celular', v_cel,
    'completa', coalesce((select a.vista_completa from asesores a where a.celular = v_cel and a.activo), false));
end $function$;

-- El panel del asesor reconoce también a quien entra con su DNI como llave (sin celular en la base)
do $$
declare d text; n1 int; n2 int;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname = 'asesor_panel_de';
  if position('llave de 8 dígitos' in d) > 0 then return; end if;   -- ya está cambiada
  n1 := (length(d) - length(replace(d, 'where cel_norm(p.celular) = v_cel', ''))) / length('where cel_norm(p.celular) = v_cel');
  n2 := (length(d) - length(replace(d, 'v_n0 := ts_persona_cel(v_cel);', ''))) / length('v_n0 := ts_persona_cel(v_cel);');
  if n1 <> 1 or n2 <> 1 then raise exception 'asesor_panel_de cambió: % y % coincidencias', n1, n2; end if;
  d := replace(d, 'where cel_norm(p.celular) = v_cel',
    'where cel_norm(p.celular) = v_cel' || E'\n      or (length(v_cel) = 8 and regexp_replace(coalesce(p.dni, ''''), ''\D'', '''', ''g'') ~ ''^[0-9]{7,8}$''' || E'\n          and lpad(regexp_replace(p.dni, ''\D'', '''', ''g''), 8, ''0'') = v_cel)   -- llave de 8 dígitos: es su DNI (no tiene celular en la base)');
  d := replace(d, 'v_n0 := ts_persona_cel(v_cel);', 'v_n0 := case when length(v_cel) = 8 then ts_persona_dni(v_cel) else ts_persona_cel(v_cel) end;');
  execute d;
end $$;

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
  return (
    with equipo as (
      -- una fila por persona activa del equipo que puede identificarse: por su celular o, si no tiene, por su DNI
      select case when length(cel_norm(p.celular)) = 9 then cel_norm(p.celular)
                  when regexp_replace(coalesce(p.dni,''), '\D', '', 'g') ~ '^[0-9]{7,8}$' then lpad(regexp_replace(p.dni, '\D', '', 'g'), 8, '0')
                  else cel_norm(p.celular) end as cel,
             max(p.nombre) as nombre, 'equipo'::text as origen,
             bool_or(regexp_replace(coalesce(p.dni,''), '\D', '', 'g') ~ '^[0-9]{7,8}$') as con_dni,
             bool_and(length(cel_norm(p.celular)) <> 9) as sin_celular
        from eq_personas p
       where p.activo and (coalesce(p.celular,'') <> '' or regexp_replace(coalesce(p.dni,''), '\D', '', 'g') ~ '^[0-9]{7,8}$')
       group by 1
    ), u as (
      select * from equipo
      union
      select a.celular, coalesce(a.nombre,''), 'invitado', a.dni is not null, false from asesores a where a.activo
    )
    select jsonb_build_object(
     'total_equipo', (select count(*) from equipo),
     'bloqueados',   (select count(*) from asesores where not activo),
     'invitados',    (select count(*) from asesores where activo),
     'sin_dni',      (select count(*) from equipo where not con_dni)
                     + (select count(*) from asesores a where a.activo and a.dni is null and not exists (select 1 from equipo e where e.cel = a.celular)),
     'filas', coalesce((select jsonb_agg(f order by (f->>'ultima_vez') desc nulls last, f->>'nombre') from (
        select jsonb_build_object(
          'celular', u.cel, 'nombre', u.nombre, 'origen', u.origen, 'con_dni', u.con_dni, 'sin_celular', u.sin_celular,
          'bloqueado', exists(select 1 from asesores a where a.celular = u.cel and not a.activo),
          'ultima_vez', (select max(s.ultimo_uso) from asesor_sesion s where s.celular = u.cel),
          'sesiones', (select count(*) from asesor_sesion s where s.celular = u.cel)
        ) as f
        from u
        where (
               v_b = ''
            or norm_txt(u.nombre) like '%'||v_b||'%'
            or (v_d <> '' and u.cel like '%'||v_d||'%')
          )
          and (p_solo <> 'usaron' or exists(select 1 from asesor_sesion s where s.celular = u.cel))
          and (p_solo <> 'sin_dni' or not u.con_dni)
        limit 120) q), '[]'::jsonb)));
end $function$;
