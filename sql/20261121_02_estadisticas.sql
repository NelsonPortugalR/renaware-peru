-- 21/11/2026 · Admin → Estadísticas: todo lo que se puede saber del uso del portal, en un solo JSON.
-- Nelson: «un panel con todas las estadísticas posibles» (tendencias por día y horario, sin él, desde dónde entra cada
-- persona y si alguien compartió su cuenta), para proponer después la herramienta a nivel corporativo.
--
-- estadisticas_datos NO es security definer y no la puede llamar nadie de afuera: la llama admin_estadisticas, que
-- valida la clave de admin y corre con permisos de dueño. Así plataforma_salud no la cuenta como lectura de personas.

create or replace function public.estadisticas_datos(p_op jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
-- p_op: {dias: 1 = hoy · 7 · 30 · 90 · 0 = desde el primer registro; internos: true = contar también las cuentas internas}
-- Las fechas son de Lima. Cada período se compara con el anterior del mismo largo, hasta la misma hora (no con días enteros).
-- Un «envío» (video o cotización) es cada vez que se abrió la hoja de compartir: termina «enviado» (el celular dijo que
-- sí), «probable» (se abrió y la página no supo más: el celular la cerró), «enlace» (se mandó el enlace por WhatsApp),
-- cancelado, otro_toque, descarga, cerro_antes o falla. Salieron = enviado + probable + enlace.
declare
  v_dias int := case when coalesce(p_op->>'dias', '') ~ '^\d{1,4}$' then (p_op->>'dias')::int else 7 end;
  v_int boolean := coalesce(p_op->>'internos', '') in ('true', 't', '1');
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_ini date; v_desde timestamptz; v_ant timestamptz; v_ant_fin timestamptz;
  r jsonb;
begin
  if v_dias = 0 then
    select coalesce((min(coalesce(ocurrido, creado)) at time zone 'America/Lima')::date, v_hoy) into v_ini from eventos;
  else
    v_ini := v_hoy - (least(v_dias, 3650) - 1);
  end if;
  v_desde := (v_ini::timestamp) at time zone 'America/Lima';
  if v_dias > 0 then
    v_ant := v_desde - make_interval(days => v_dias);
    v_ant_fin := now() - make_interval(days => v_dias);
  end if;

  with
  fuera as (select a.llave from actividad_internos a where a.interno and not v_int),
  todo as (
    select e.id, e.token, e.celular as llave, e.tipo, coalesce(e.detalle, '{}'::jsonb) as d,
           coalesce(e.ocurrido, e.creado) as t, e.equipo as eq_real
      from eventos e
     where e.creado >= coalesce(v_ant, v_desde) and coalesce(e.ocurrido, e.creado) >= coalesce(v_ant, v_desde)
       and e.celular is not null and e.celular <> ''
       and not exists (select 1 from fuera f where f.llave = e.celular)
  ),
  ev as (select x.*, (x.t at time zone 'America/Lima') as tl from todo x where x.t >= v_desde),
  ant as (select x.* from todo x where x.t < v_desde and x.t <= v_ant_fin),

  -- sesiones de uso: se corta cuando pasan más de 30 minutos sin nada
  seq as (
    select llave, t, tl, tipo,
           case when t - lag(t) over (partition by llave order by t) <= interval '30 minutes' then 0 else 1 end as nueva
      from ev where tipo <> 'error'
  ),
  ses as (select s.*, sum(s.nueva) over (partition by s.llave order by s.t rows unbounded preceding) as sid from seq s),
  sesiones as (
    select llave, sid, min(t) as ini, max(t) as fin, min(tl) as ini_l, count(*) filter (where tipo = 'latido') as minutos
      from ses group by llave, sid
  ),
  ant_ses as (
    select count(*) filter (where nueva = 1) as n from (
      select case when t - lag(t) over (partition by llave order by t) <= interval '30 minutes' then 0 else 1 end as nueva
        from ant where tipo <> 'error') q
  ),

  -- envíos: cada vez que se abrió compartir, con lo que pasó al final
  env_base as (
    select e.tipo, coalesce(nullif(e.d->>'envio', ''), 'x' || e.id::text) as envio, e.llave, e.t, e.tl, e.d, e.token
      from ev e where e.tipo in ('video', 'cotizacion')
    union all
    select e.tipo, coalesce(nullif(e.d->>'envio', ''), 'x' || e.id::text), e.llave, e.t, null, e.d, e.token
      from ant e where e.tipo in ('video', 'cotizacion')
  ),
  env as (
    select b.tipo, b.envio, min(b.llave) as llave, (min(b.token::text))::uuid as token,
           max(b.d->>'codigo') as codigo, max(b.d->>'nombre') as nombre, max(b.d->>'lista') as lista, max(b.d->>'modo') as modo,
           min(b.t) as t, min(b.tl) as tl, bool_or(b.d->>'fase' = 'abre') as abrio,
           (array_agg(b.d->>'resultado' order by b.t desc) filter (where coalesce(b.d->>'fase', '') <> 'abre'))[1] as resultado,
           (array_agg(b.d order by b.t desc) filter (where coalesce(b.d->>'fase', '') <> 'abre'))[1] as det,
           max(case when b.d->>'mb' ~ '^\d+(\.\d+)?$' then (b.d->>'mb')::numeric end) as mb,
           max(case when b.d->>'ms' ~ '^\d+$' then (b.d->>'ms')::numeric end) as ms
      from env_base b group by b.tipo, b.envio
  ),
  envios_todo as (
    select v.*,
           case when v.resultado = 'ok' then 'enviado'
                when v.resultado is null and v.abrio then 'probable'
                when v.resultado like 'enlace%' then 'enlace'
                when v.resultado = 'error' then 'falla'
                when v.resultado is null then 'otro'
                else v.resultado end as estado
      from env v
  ),
  envios as (select x.*, x.estado in ('enviado', 'probable', 'enlace') as salio from envios_todo x where x.t >= v_desde),
  envios_ant as (select x.*, x.estado in ('enviado', 'probable', 'enlace') as salio from envios_todo x where x.t < v_desde),

  -- primera vez que cada persona usó el portal (en toda la historia)
  primeras as (
    select e.celular as llave, min(coalesce(e.ocurrido, e.creado)) as primera, max(coalesce(e.ocurrido, e.creado)) as ultima
      from eventos e where e.celular in (select distinct llave from ev) group by e.celular
  ),

  -- equipos: cada sesión (token) es un ingreso en un equipo; su huella sale de asesor_sesion y del modelo que manda la página
  toks as (
    select e.llave, e.token, min(e.t) as desde, max(e.t) as hasta, count(*) as n, max(e.eq_real) as eq_real,
           (array_agg(e.d->>'modelo' order by e.t desc) filter (where coalesce(e.d->>'modelo', '') <> ''))[1] as modelo
      from ev e group by e.llave, e.token
  ),
  equipos_tok as (   -- el mismo equipo se anota distinto según la puerta («escritorio · Mac OS X · Chrome/155» en el hub): se normaliza
    select t.*, n.so, n.navegador, n.dispositivo, coalesce(s.pantalla, '') as pantalla, s.ip, s.pais, s.creada,
           nullif(concat_ws(' · ', nullif(n.dispositivo, ''), nullif(n.so, ''), nullif(n.navegador, ''), t.modelo, nullif(s.pantalla, '')), '') as huella
      from toks t left join asesor_sesion s on s.token = t.token
      cross join lateral (select
        case when s.so ~* 'iphone|ipad|ios' then 'iPhone' when s.so ~* 'mac' then 'Mac' when s.so ~* 'android' then 'Android'
             when s.so ~* 'windows' then 'Windows' else coalesce(s.so, '') end as so,
        case when s.navegador ~* 'edg' then 'Edge' when s.navegador ~* 'chrome|crios' then 'Chrome' when s.navegador ~* 'firefox|fxios' then 'Firefox'
             when s.navegador ~* 'safari' then 'Safari' else split_part(coalesce(s.navegador, ''), '/', 1) end as navegador,
        case when s.dispositivo ~* 'celular|m[oó]vil|phone|mobile' then 'Celular' when s.dispositivo ~* 'tablet|ipad' then 'Tablet'
             when s.dispositivo ~* 'escritorio|desktop|computadora|pc' then 'Escritorio' else coalesce(s.dispositivo, '') end as dispositivo) n
  ),
  -- ¿la misma cuenta en dos equipos a la vez? En bloques de 10 minutos: actividad desde dos equipos distintos (por su
  -- huella, o por su id de navegador si los dos lo traen), y si venían de la misma conexión a internet o de distintas
  dev as (
    select e.llave, e.t, e.eq_real, et.huella, coalesce(nullif(e.d->>'ip', ''), et.ip) as ip
      from ev e join equipos_tok et on et.token = e.token and et.llave = e.llave
     where e.tipo not in ('error', 'sesion_fin') and et.huella is not null
  ),
  bloques as (
    select llave, date_trunc('hour', t) + floor(extract(minute from t) / 10) * interval '10 minutes' as b,
           count(distinct ip) as ips, string_agg(distinct huella, ' y ') as cuales,
           count(distinct huella) filter (where huella like 'Celular%') as celulares
      from dev group by 1, 2
     having count(distinct huella) >= 2 or count(distinct eq_real) >= 2
  ),
  simult as (
    select llave, count(*) as veces, min(b) as primera, (array_agg(cuales order by b))[1] as ejemplo, bool_or(ips >= 2) as redes,
           bool_or(celulares >= 2) as dos_cel
      from bloques group by llave
  ),

  -- ubicación aproximada (por la conexión a internet) que la página manda en cada visita e ingreso
  lug as (
    select e.llave, e.t, e.tl, e.token, nullif(e.d->'geo'->>'ciudad', '') as ciudad, nullif(e.d->'geo'->>'region', '') as region,
           nullif(e.d->'geo'->>'pais', '') as pais, nullif(e.d->'geo'->>'isp', '') as isp, nullif(e.d->>'ip', '') as ip
      from ev e where e.tipo in ('visita', 'sesion_inicio') and jsonb_typeof(e.d->'geo') = 'object'
  ),
  lug_dia as (   -- el mismo día desde dos ciudades distintas y en equipos distintos
    select l.llave, l.tl::date as dia, string_agg(distinct coalesce(l.ciudad, l.region), ' y ') as cuales,
           count(distinct et.huella) as equipos
      from lug l join equipos_tok et on et.token = l.token
     group by 1, 2 having count(distinct coalesce(l.ciudad, l.region)) >= 2
  ),

  gente as (
    select k.llave,
           coalesce(x.nombre, (select a.nombre from asesores a where a.celular = k.llave or a.dni = k.llave limit 1)) as nombre,
           x.depto
      from (select distinct llave from ev) k
      left join lateral (
        select p.nombre, nullif(trim(p.departamento), '') as depto from eq_personas p
         where p.dni = k.llave or (length(k.llave) = 9 and p.celular is not null and cel_norm(p.celular) = k.llave)
         order by p.activo desc nulls last limit 1) x on true
  ),
  per as (
    select llave, count(distinct tl::date) as dias, count(*) filter (where tipo = 'latido') as minutos,
           count(*) filter (where tipo = 'ver_producto') as fichas, count(*) filter (where tipo = 'buscar') as busquedas,
           count(*) filter (where tipo = 'ver_video') as videos_vistos, count(*) filter (where tipo = 'sesion_inicio') as ingresos,
           max(t) as ultima
      from ev group by llave
  ),
  personas as (
    select g.llave, coalesce(nullif(g.nombre, ''), 'Sin nombre (···' || right(g.llave, 3) || ')') as nombre, g.depto,
           pr.primera, p.ultima, p.dias, p.minutos, p.fichas, p.busquedas, p.videos_vistos, p.ingresos,
           (select count(*) from sesiones s where s.llave = g.llave) as sesiones,
           (select count(*) from envios v where v.llave = g.llave and v.tipo = 'video' and v.salio) as videos,
           (select count(*) from envios v where v.llave = g.llave and v.tipo = 'cotizacion' and v.salio) as cotizaciones,
           (select count(distinct et.huella) from equipos_tok et where et.llave = g.llave) as n_equipos,
           (select count(distinct coalesce(l.region, l.ciudad)) from lug l where l.llave = g.llave) as n_regiones,
           (select string_agg(distinct coalesce(l.region, l.ciudad), ', ') from lug l where l.llave = g.llave) as regiones,
           (select count(distinct ip) from (select et.ip from equipos_tok et where et.llave = g.llave and et.ip is not null
                                            union select l.ip from lug l where l.llave = g.llave and l.ip is not null) q) as n_ips,
           sm.veces as saltos, sm.ejemplo as salto_ejemplo, sm.primera as salto_cuando, coalesce(sm.redes, false) as redes, coalesce(sm.dos_cel, false) as dos_cel,
           (select ld.cuales || ' el ' || to_char(ld.dia, 'DD/MM') from lug_dia ld where ld.llave = g.llave and ld.equipos >= 2 order by ld.dia desc limit 1) as lug_equipos,
           exists (select 1 from actividad_internos i where i.llave = g.llave and i.interno) as interno
      from gente g join per p using (llave) left join primeras pr using (llave) left join simult sm using (llave)
  ),
  personas_j as (
    select x.*,
           array_remove(array[
             case when x.saltos >= 1 then 'Usada en ' || case when x.dos_cel then 'dos celulares' else 'dos equipos' end
                  || ' a la vez (' || x.salto_ejemplo || ') en ' || x.saltos
                  || case when x.saltos = 1 then ' momento' else ' momentos' end
                  || case when x.redes then ', desde conexiones distintas' else ', desde la misma conexión (puede ser la misma persona con dos equipos)' end
                  || '; el primero el ' || to_char(x.salto_cuando at time zone 'America/Lima', 'DD/MM HH24:MI') end,
             case when x.lug_equipos is not null then 'Entró desde ' || x.lug_equipos || ', en equipos distintos' end,
             case when x.n_equipos >= 3 then 'Entró desde ' || x.n_equipos || ' equipos distintos' end,
             case when x.n_regiones >= 2 then 'Se conectó desde ' || x.regiones || ' (aproximado, por internet)' end
           ], null) as motivos,
           case when (x.saltos >= 2 and x.dos_cel) or x.lug_equipos is not null then 'alta'
                when x.saltos >= 1 or x.n_equipos >= 3 or x.n_regiones >= 2 then 'media' end as alerta
      from personas x
  ),

  dias as (select g.x::date as dia from generate_series(v_ini::timestamp, v_hoy::timestamp, interval '1 day') as g(x)),
  agg_dia as (
    select tl::date as dia, count(distinct llave) as personas, count(*) filter (where tipo = 'latido') as minutos,
           count(*) filter (where tipo = 'ver_producto') as fichas, count(*) filter (where tipo = 'buscar') as busquedas
      from ev group by 1
  ),
  ses_dia as (select ini_l::date as dia, count(*) as sesiones from sesiones group by 1),
  env_dia as (
    select tl::date as dia, count(*) filter (where tipo = 'video' and salio) as videos,
           count(*) filter (where tipo = 'cotizacion' and salio) as cotizaciones
      from envios group by 1
  ),
  nuevas_dia as (select (primera at time zone 'America/Lima')::date as dia, count(*) as nuevas from primeras where primera >= v_desde group by 1),
  horas as (
    select extract(isodow from tl)::int as dow, extract(hour from tl)::int as hora,
           count(*) filter (where tipo = 'latido') as minutos,
           count(*) filter (where tipo not in ('latido', 'visita', 'error', 'sesion_fin') and coalesce(d->>'fase', '') <> 'abre') as acciones,
           count(distinct llave) as personas
      from ev group by 1, 2
  ),
  hora_personas as (select extract(hour from tl)::int as hora, count(distinct llave) as personas from ev group by 1),
  semanas as (
    select date_trunc('week', tl)::date as semana, llave, count(*) filter (where tipo = 'latido') as minutos from ev group by 1, 2
  ),
  equipo_total as (
    select (select count(*) from eq_personas p where p.activo and coalesce(trim(p.dni), '') <> '')
         + (select count(*) from asesores a where a.activo and coalesce(trim(a.dni), '') <> ''
              and not exists (select 1 from eq_personas p where p.dni = a.dni)) as n
  ),
  historia as (   -- quien usó el portal alguna vez (para las inactivas y la adopción)
    select e.celular as llave, max(coalesce(e.ocurrido, e.creado)) as ultima
      from eventos e
     where e.celular is not null and e.celular <> '' and not exists (select 1 from fuera f where f.llave = e.celular)
     group by e.celular
  )
  select jsonb_build_object(
    'actualizado', now(),
    'periodo', jsonb_build_object('dias', v_dias, 'desde', v_desde, 'hasta', now(), 'internos', v_int),
    'excluidos', coalesce((select jsonb_agg(coalesce(nullif(a.nombre, ''), 'Cuenta interna') order by a.nombre)
                             from actividad_internos a where a.interno and not v_int), '[]'::jsonb),
    'equipo_total', (select n from equipo_total),
    'usaron_alguna_vez', (select count(*) from historia),
    'totales', jsonb_build_object(
      'personas', (select count(distinct llave) from ev),
      'nuevas', (select count(*) from primeras where primera >= v_desde),
      'sesiones', (select count(*) from sesiones),
      'minutos', (select count(*) from ev where tipo = 'latido'),
      'ingresos', (select count(*) from ev where tipo = 'sesion_inicio'),
      'fichas', (select count(*) from ev where tipo = 'ver_producto'),
      'listas', (select count(*) from ev where tipo = 'ver_lista'),
      'busquedas', (select count(*) from ev where tipo = 'buscar'),
      'sin_resultado', (select count(*) from ev where tipo = 'buscar' and d->>'resultados' = '0'),
      'videos_vistos', (select count(*) from ev where tipo = 'ver_video'),
      'videos', (select count(*) from envios where tipo = 'video' and salio),
      'cotizaciones', (select count(*) from envios where tipo = 'cotizacion' and salio),
      'tutoriales', (select count(*) from ev where tipo = 'tutorial' and d->>'accion' = 'inicio'),
      'simulador', (select count(*) from ev where tipo in ('simulador', 'comparador')),
      'errores', (select count(*) from ev where tipo = 'error')),
    'anterior', case when v_ant is null then null else jsonb_build_object(
      'personas', (select count(distinct llave) from ant),
      'sesiones', (select n from ant_ses),
      'minutos', (select count(*) from ant where tipo = 'latido'),
      'fichas', (select count(*) from ant where tipo = 'ver_producto'),
      'busquedas', (select count(*) from ant where tipo = 'buscar'),
      'videos', (select count(*) from envios_ant where tipo = 'video' and salio),
      'cotizaciones', (select count(*) from envios_ant where tipo = 'cotizacion' and salio)) end,
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'personas', coalesce(a.personas, 0),
                  'sesiones', coalesce(s.sesiones, 0), 'minutos', coalesce(a.minutos, 0), 'fichas', coalesce(a.fichas, 0),
                  'busquedas', coalesce(a.busquedas, 0), 'videos', coalesce(v.videos, 0), 'cotizaciones', coalesce(v.cotizaciones, 0),
                  'nuevas', coalesce(n.nuevas, 0)) order by d.dia), '[]'::jsonb)
                  from dias d left join agg_dia a using (dia) left join ses_dia s using (dia) left join env_dia v using (dia) left join nuevas_dia n using (dia)),
    'por_hora', (select coalesce(jsonb_agg(jsonb_build_object('hora', g.h, 'minutos', coalesce(x.minutos, 0), 'acciones', coalesce(x.acciones, 0),
                  'personas', coalesce(hp.personas, 0)) order by g.h), '[]'::jsonb)
                  from generate_series(0, 23) as g(h)
                  left join (select hora, sum(minutos) as minutos, sum(acciones) as acciones from horas group by hora) x on x.hora = g.h
                  left join hora_personas hp on hp.hora = g.h),
    'dia_hora', (select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hora', hora, 'minutos', minutos, 'acciones', acciones)), '[]'::jsonb) from horas),
    'por_semana', (select coalesce(jsonb_agg(jsonb_build_object('semana', w.semana, 'personas', w.personas, 'nuevas', w.nuevas,
                  'volvieron', w.volvieron, 'minutos', w.minutos) order by w.semana), '[]'::jsonb)
                  from (select s.semana, count(*) as personas,
                               count(*) filter (where (pr.primera at time zone 'America/Lima')::date >= s.semana) as nuevas,
                               count(*) filter (where (pr.primera at time zone 'America/Lima')::date < s.semana) as volvieron,
                               sum(s.minutos) as minutos
                          from semanas s join primeras pr using (llave) group by s.semana) w),
    'personas', (select coalesce(jsonb_agg(jsonb_build_object(
                  'llave', x.llave, 'nombre', x.nombre, 'depto', x.depto, 'primera', x.primera, 'ultima', x.ultima, 'dias', x.dias,
                  'sesiones', x.sesiones, 'minutos', x.minutos, 'fichas', x.fichas, 'busquedas', x.busquedas,
                  'videos_vistos', x.videos_vistos, 'videos', x.videos, 'cotizaciones', x.cotizaciones, 'ingresos', x.ingresos,
                  'n_equipos', x.n_equipos, 'n_ips', x.n_ips, 'interno', x.interno, 'alerta', x.alerta, 'motivos', to_jsonb(x.motivos),
                  'equipos', (select coalesce(jsonb_agg(jsonb_build_object('huella', q.huella, 'so', q.so, 'navegador', q.navegador,
                                'dispositivo', q.dispositivo, 'modelo', q.modelo, 'pantalla', q.pantalla, 'ingresos', q.ingresos,
                                'desde', q.desde, 'hasta', q.hasta) order by q.hasta desc), '[]'::jsonb)
                                from (select et.huella, max(et.so) as so, max(et.navegador) as navegador, max(et.dispositivo) as dispositivo,
                                             max(et.modelo) as modelo, max(et.pantalla) as pantalla, count(*) as ingresos,
                                             min(et.desde) as desde, max(et.hasta) as hasta
                                        from equipos_tok et where et.llave = x.llave group by et.huella) q),
                  'lugares', (select coalesce(jsonb_agg(jsonb_build_object('ciudad', q.ciudad, 'region', q.region, 'pais', q.pais,
                                'isp', q.isp, 'veces', q.n, 'ultima', q.ultima) order by q.ultima desc), '[]'::jsonb)
                                from (select l.ciudad, l.region, l.pais, l.isp, count(*) as n, max(l.t) as ultima
                                        from lug l where l.llave = x.llave group by 1, 2, 3, 4) q)
                ) order by (x.alerta is null), x.minutos desc, x.ultima desc), '[]'::jsonb) from personas_j x),
    'lugares', (select coalesce(jsonb_agg(jsonb_build_object('ciudad', q.ciudad, 'region', q.region, 'pais', q.pais,
                  'personas', q.personas, 'visitas', q.visitas) order by q.personas desc, q.visitas desc), '[]'::jsonb)
                  from (select ciudad, region, pais, count(distinct llave) as personas, count(*) as visitas from lug group by 1, 2, 3) q),
    'operadores', (select coalesce(jsonb_agg(jsonb_build_object('isp', q.isp, 'personas', q.personas, 'visitas', q.visitas)
                  order by q.personas desc, q.visitas desc), '[]'::jsonb)
                  from (select coalesce(isp, 'Sin dato') as isp, count(distinct llave) as personas, count(*) as visitas from lug group by 1) q),
    'equipos', jsonb_build_object(
      'so', (select coalesce(jsonb_agg(jsonb_build_object('v', q.v, 'personas', q.n) order by q.n desc), '[]'::jsonb)
               from (select coalesce(nullif(so, ''), 'Sin dato') as v,
                            count(distinct llave) as n from equipos_tok group by 1) q),
      'navegador', (select coalesce(jsonb_agg(jsonb_build_object('v', q.v, 'personas', q.n) order by q.n desc), '[]'::jsonb)
               from (select coalesce(nullif(navegador, ''), 'Sin dato') as v, count(distinct llave) as n from equipos_tok group by 1) q),
      'tipo', (select coalesce(jsonb_agg(jsonb_build_object('v', q.v, 'personas', q.n) order by q.n desc), '[]'::jsonb)
               from (select coalesce(nullif(dispositivo, ''), 'Sin dato') as v, count(distinct llave) as n from equipos_tok group by 1) q),
      'modelo', (select coalesce(jsonb_agg(jsonb_build_object('v', q.v, 'personas', q.n) order by q.n desc), '[]'::jsonb)
               from (select modelo as v, count(distinct llave) as n from equipos_tok where modelo is not null group by 1 order by 2 desc limit 15) q),
      'pantalla', (select coalesce(jsonb_agg(jsonb_build_object('v', q.v, 'personas', q.n) order by q.n desc), '[]'::jsonb)
               from (select pantalla as v, count(distinct llave) as n from equipos_tok where pantalla <> '' group by 1 order by 2 desc limit 10) q)),
    'contenido', jsonb_build_object(
      'productos', (select coalesce(jsonb_agg(jsonb_build_object('codigo', q.codigo, 'nombre', q.nombre, 'fichas', q.fichas,
                      'personas', q.personas, 'cotizaciones', q.cotizaciones, 'videos', q.videos) order by q.fichas desc, q.cotizaciones desc), '[]'::jsonb)
                      from (select c.codigo, max(c.nombre) as nombre, sum(c.fichas) as fichas, max(c.personas) as personas,
                                   sum(c.cot) as cotizaciones, sum(c.vid) as videos
                              from (select d->>'codigo' as codigo, max(d->>'nombre') as nombre, count(*) as fichas, count(distinct llave) as personas, 0 as cot, 0 as vid
                                      from ev where tipo = 'ver_producto' and coalesce(d->>'codigo', '') <> '' group by 1
                                    union all
                                    select codigo, max(nombre), 0, 0, count(*) filter (where tipo = 'cotizacion' and salio), count(*) filter (where tipo = 'video' and salio)
                                      from envios where coalesce(codigo, '') <> '' group by 1) c
                             group by c.codigo order by 3 desc, 5 desc limit 20) q),
      'listas', (select coalesce(jsonb_agg(jsonb_build_object('lista', q.lista, 'veces', q.n, 'personas', q.p) order by q.n desc), '[]'::jsonb)
                   from (select d->>'lista' as lista, count(*) as n, count(distinct llave) as p from ev
                          where tipo = 'ver_lista' and coalesce(d->>'lista', '') <> '' group by 1) q),
      'busquedas', (select coalesce(jsonb_agg(jsonb_build_object('texto', q.texto, 'veces', q.n, 'sin', q.sin, 'personas', q.p) order by q.n desc), '[]'::jsonb)
                   from (select lower(trim(d->>'texto')) as texto, count(*) as n, count(*) filter (where d->>'resultados' = '0') as sin,
                                count(distinct llave) as p from ev where tipo = 'buscar' and coalesce(trim(d->>'texto'), '') <> ''
                          group by 1 order by 2 desc limit 25) q),
      'videos_vistos', (select coalesce(jsonb_agg(jsonb_build_object('codigo', q.codigo, 'nombre', q.nombre, 'veces', q.n, 'personas', q.p) order by q.n desc), '[]'::jsonb)
                   from (select d->>'codigo' as codigo, max(d->>'nombre') as nombre, count(*) as n, count(distinct llave) as p from ev
                          where tipo = 'ver_video' group by 1 order by 3 desc limit 15) q)),
    'envios', jsonb_build_object(
      'video', (select jsonb_build_object('salieron', count(*) filter (where salio), 'enviados', count(*) filter (where estado = 'enviado'),
                  'probables', count(*) filter (where estado = 'probable'), 'enlace', count(*) filter (where estado = 'enlace'),
                  'cancelados', count(*) filter (where estado = 'cancelado'), 'otro_toque', count(*) filter (where estado = 'otro_toque'),
                  'cerro_antes', count(*) filter (where estado = 'cerro_antes'), 'fallas', count(*) filter (where estado = 'falla'),
                  'mb_prom', round(avg(mb) filter (where salio), 1), 'seg_prom', round(avg(ms) filter (where salio) / 1000.0, 1))
                  from envios where tipo = 'video'),
      'cotizacion', (select jsonb_build_object('salieron', count(*) filter (where salio), 'enviados', count(*) filter (where estado = 'enviado'),
                  'probables', count(*) filter (where estado = 'probable'), 'cancelados', count(*) filter (where estado = 'cancelado'),
                  'otro_toque', count(*) filter (where estado = 'otro_toque'), 'descargas', count(*) filter (where estado = 'descarga'),
                  'fallas', count(*) filter (where estado = 'falla'),
                  'autocompra', count(*) filter (where salio and modo = 'autocompra'))
                  from envios where tipo = 'cotizacion')),
    'embudo', jsonb_build_object(
      'activas', (select count(distinct llave) from ev),
      'abrieron_ficha', (select count(distinct llave) from ev where tipo = 'ver_producto'),
      'intentaron', (select count(distinct llave) from envios),
      'enviaron', (select count(distinct llave) from envios where salio),
      'fichas', (select count(*) from ev where tipo = 'ver_producto'),
      'intentos', (select count(*) from envios),
      'salieron', (select count(*) from envios where salio)),
    'fallas', (select coalesce(jsonb_agg(jsonb_build_object('cuando', q.t, 'nombre', q.nombre, 'tipo', q.tipo, 'estado', q.estado,
                  'detalle', q.det, 'equipo', q.huella) order by q.t desc), '[]'::jsonb)
                  from (select v.t, v.tipo, v.estado, v.det, et.huella, coalesce(pj.nombre, '···' || right(v.llave, 3)) as nombre
                          from envios v left join equipos_tok et on et.token = v.token and et.llave = v.llave
                          left join personas_j pj on pj.llave = v.llave
                         where v.estado in ('falla', 'cerro_antes') order by v.t desc limit 30) q),
    'errores', (select coalesce(jsonb_agg(jsonb_build_object('msg', q.msg, 'veces', q.n, 'personas', q.p, 'ultima', q.u) order by q.n desc), '[]'::jsonb)
                  from (select left(coalesce(d->>'msg', '?'), 160) as msg, count(*) as n, count(distinct llave) as p, max(t) as u
                          from ev where tipo = 'error' group by 1 order by 2 desc limit 20) q),
    'inactivas', (select coalesce(jsonb_agg(jsonb_build_object('nombre', q.nombre, 'ultima', q.ultima) order by q.ultima desc), '[]'::jsonb)
                  from (select h.ultima,
                               coalesce((select p.nombre from eq_personas p where p.dni = h.llave or (length(h.llave) = 9 and p.celular is not null and cel_norm(p.celular) = h.llave) order by p.activo desc nulls last limit 1),
                                        (select a.nombre from asesores a where a.celular = h.llave or a.dni = h.llave limit 1),
                                        'Sin nombre (···' || right(h.llave, 3) || ')') as nombre
                          from historia h where h.ultima < now() - interval '7 days' order by h.ultima desc limit 60) q),
    'ultimos', (select coalesce(jsonb_agg(jsonb_build_object('cuando', q.t, 'nombre', q.nombre, 'tipo', q.tipo, 'detalle', q.d) order by q.t desc), '[]'::jsonb)
                  from (select e.t, e.tipo, e.d, coalesce(pj.nombre, '···' || right(e.llave, 3)) as nombre
                          from ev e left join personas_j pj on pj.llave = e.llave
                         where e.tipo <> 'latido' order by e.t desc limit 60) q)
  ) into r;
  return r;
end $function$;
revoke execute on function public.estadisticas_datos(jsonb) from public, anon, authenticated;

create or replace function public.admin_estadisticas(p_token uuid, p_op jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
-- Admin → Estadísticas. Solo con la sesión de admin.
begin
  if not es_admin(p_token) then raise exception 'Sesion invalida'; end if;
  return estadisticas_datos(coalesce(p_op, '{}'::jsonb));
end $function$;
grant execute on function public.admin_estadisticas(uuid, jsonb) to anon, authenticated;
