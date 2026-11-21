-- 20/11/2026 · Panel de actividad del portal de precios (Admin → Actividad): lo que pidió Nelson para ver como admin
-- quién entra, desde qué equipo, cuánto rato y qué hace.
--
-- Antes el resumen recorría solo la tabla «asesores» (los invitados): desde que se entra con el DNI casi todos vienen
-- de eq_personas y no salían. Ahora parte de quien tiene eventos en el período y busca su nombre por la llave de la
-- sesión (celular o DNI). Suma visitas, días, minutos (un «latido» por minuto con la página a la vista), fichas,
-- cotizaciones y videos enviados; agrega totales, el detalle por día, los equipos, las búsquedas y las fallas al
-- compartir. «Hoy» (p_dias = 1) es desde la medianoche de Lima. Misma firma: no hace falta borrar nada.
create or replace function public.admin_actividad(p_token uuid, p_dias integer default 7)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_dias int := greatest(1, coalesce(p_dias, 7));
  v_desde timestamptz := case when v_dias = 1
    then date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima'
    else now() - make_interval(days => v_dias) end;
  r jsonb;
begin
  if not es_admin(p_token) then raise exception 'Sesion invalida'; end if;
  with ev as (
    select e.celular, e.token, e.tipo, e.detalle, e.creado, (e.creado at time zone 'America/Lima')::date as dia
    from eventos e where e.creado >= v_desde
  ), llaves as (select celular from ev group by celular),
  quien as (
    select l.celular,
      coalesce((select nullif(a.nombre, '') from asesores a where a.celular = l.celular limit 1),
               (select p.nombre from eq_personas p
                 where (length(l.celular) = 8 and lpad(regexp_replace(coalesce(p.dni, ''), '\D', '', 'g'), 8, '0') = l.celular)
                    or (length(l.celular) <> 8 and cel_norm(p.celular) = l.celular)
                 order by p.activo desc, p.actualizado_en desc nulls last limit 1), '') as nombre,
      (select jsonb_build_object('dispositivo', s.dispositivo, 'so', s.so, 'navegador', s.navegador, 'pantalla', s.pantalla, 'zona', s.zona, 'pais', s.pais)
         from asesor_sesion s where s.celular = l.celular order by s.ultimo_uso desc nulls last limit 1) as equipo
    from llaves l
  ), por_persona as (
    select ev.celular,
      count(*) filter (where tipo in ('sesion_inicio', 'visita')) as visitas,
      count(distinct dia) as dias,
      count(*) filter (where tipo = 'latido') as minutos,
      count(*) filter (where tipo = 'ver_producto') as fichas,
      count(*) filter (where tipo = 'cotizacion' and detalle->>'resultado' = 'ok') as cotizaciones,
      count(*) filter (where tipo = 'video' and detalle->>'resultado' = 'ok') as videos,
      count(*) filter (where tipo <> 'latido') as acciones,
      count(distinct token) as sesiones,
      max(creado) as ultima
    from ev group by ev.celular
  )
  select jsonb_build_object(
    'desde', v_desde,
    'totales', (select jsonb_build_object('personas', count(*), 'visitas', coalesce(sum(visitas), 0), 'minutos', coalesce(sum(minutos), 0),
        'fichas', coalesce(sum(fichas), 0), 'cotizaciones', coalesce(sum(cotizaciones), 0), 'videos', coalesce(sum(videos), 0)) from por_persona),
    'resumen', coalesce((select jsonb_agg(jsonb_build_object('celular', pp.celular, 'nombre', q.nombre, 'visitas', pp.visitas, 'dias', pp.dias,
        'minutos', pp.minutos, 'fichas', pp.fichas, 'cotizaciones', pp.cotizaciones, 'videos', pp.videos, 'acciones', pp.acciones,
        'sesiones', pp.sesiones, 'ultima', pp.ultima, 'dispositivo', q.equipo->>'dispositivo', 'so', q.equipo->>'so',
        'navegador', q.equipo->>'navegador', 'pantalla', q.equipo->>'pantalla', 'zona', q.equipo->>'zona', 'pais', q.equipo->>'pais')
        order by pp.ultima desc) from por_persona pp join quien q on q.celular = pp.celular), '[]'::jsonb),
    'por_dia', coalesce((select jsonb_agg(x order by x->>'dia' desc) from (
        select jsonb_build_object('dia', dia, 'personas', count(distinct celular), 'minutos', count(*) filter (where tipo = 'latido'),
          'fichas', count(*) filter (where tipo = 'ver_producto'),
          'cotizaciones', count(*) filter (where tipo = 'cotizacion' and detalle->>'resultado' = 'ok'),
          'videos', count(*) filter (where tipo = 'video' and detalle->>'resultado' = 'ok')) as x
        from ev group by dia) d), '[]'::jsonb),
    'equipos', coalesce((select jsonb_agg(jsonb_build_object('so', so, 'n', n) order by n desc) from (
        select coalesce(nullif(q.equipo->>'so', ''), 'Sin dato') as so, count(*) n from quien q group by 1) t), '[]'::jsonb),
    'por_tipo', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'n', n) order by n desc) from (
        select tipo, count(*) n from ev where tipo <> 'latido' group by tipo) t), '[]'::jsonb),
    'top_productos', coalesce((select jsonb_agg(jsonb_build_object('producto', p, 'n', n) order by n desc) from (
        select detalle->>'nombre' p, count(*) n from ev where tipo = 'ver_producto' and detalle->>'nombre' is not null
        group by 1 order by 2 desc limit 12) t), '[]'::jsonb),
    'busquedas', coalesce((select jsonb_agg(jsonb_build_object('texto', texto, 'n', n, 'sin', sin) order by n desc, texto) from (
        select lower(btrim(detalle->>'texto')) as texto, count(*) n, count(*) filter (where (detalle->>'resultados') = '0') as sin
        from ev where tipo = 'buscar' and coalesce(btrim(detalle->>'texto'), '') <> '' group by 1 order by 2 desc limit 15) t), '[]'::jsonb),
    'fallas', coalesce((select jsonb_agg(jsonb_build_object('cuando', f.creado, 'celular', f.celular, 'nombre', q.nombre, 'tipo', f.tipo,
        'detalle', f.detalle, 'so', s.so, 'navegador', s.navegador) order by f.creado desc) from (
        select * from ev where tipo = 'error' or (tipo in ('cotizacion', 'video') and detalle->>'resultado' = 'error')
        order by creado desc limit 25) f
        left join quien q on q.celular = f.celular left join asesor_sesion s on s.token = f.token), '[]'::jsonb),
    'ultimos', coalesce((select jsonb_agg(jsonb_build_object('cuando', u.creado, 'celular', u.celular, 'nombre', q.nombre, 'tipo', u.tipo,
        'detalle', u.detalle - 'ip') order by u.creado desc) from (
        select * from ev where tipo <> 'latido' order by creado desc limit 80) u
        left join quien q on q.celular = u.celular), '[]'::jsonb)
  ) into r;
  return r;
end $function$;
