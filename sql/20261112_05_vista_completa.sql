/* =====================================================================
   Vista completa del portal (2026-11-12)
   ---------------------------------------------------------------------
   Lo pidió Nelson: Tienda en Línea, el simulador de puntos y el buscador
   maestro solo los ve él. Los demás asesores ven Lista General, los
   especiales, Repuestos y Servicios.

   · asesores.vista_completa: quién ve todo. Se marca a mano, con el
     celular de esa persona (no va en este archivo: el repositorio es
     público):
       update public.asesores set vista_completa = true where celular = '…';
     Si la persona entra por estar en el equipo (eq_personas) y no está en
     «asesores», primero se la agrega ahí como invitada.
   · asesor_login y asesor_sesion_valida devuelven además «completa».
     La página esconde lo demás cuando no viene en true.

   Es un filtro de la pantalla, no un candado: las listas se siguen
   leyendo de la base igual que antes.
   Solo agrega (una columna y una clave más en la respuesta). Se puede
   volver a correr.
   ===================================================================== */

alter table public.asesores add column if not exists vista_completa boolean not null default false;
comment on column public.asesores.vista_completa is 'Precios y promociones: quien la tiene ve también Tienda en Línea, el simulador de puntos y el buscador maestro. Los demás ven Lista General, los especiales, Repuestos y Servicios.';

create or replace function public.asesor_login(p_celular text, p_ctx jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_cel text := cel_norm(p_celular); v_ip text := ip_cliente(); v_fallos int; v_acc jsonb; v_tok uuid;
begin
  select count(*) into v_fallos from login_intentos
   where ip = v_ip and not ok and creado > now() - interval '15 minutes';
  if v_fallos >= 10 then raise exception 'Demasiados intentos. Espera 15 minutos.'; end if;

  v_acc := acceso_de(v_cel);
  insert into login_intentos (ip, dato, ok) values (v_ip, v_cel, (v_acc->>'ok')::boolean);
  if not (v_acc->>'ok')::boolean then raise exception 'Ese numero no esta habilitado'; end if;

  insert into asesor_sesion (celular, dispositivo, navegador, so, pantalla, zona, idioma, ip, pais)
  values (v_cel, p_ctx->>'dispositivo', p_ctx->>'navegador', p_ctx->>'so', p_ctx->>'pantalla',
          p_ctx->>'zona', p_ctx->>'idioma', v_ip, pedir_header('cf-ipcountry'))
  returning token into v_tok;
  insert into eventos (token, celular, tipo, detalle) values (v_tok, v_cel, 'sesion_inicio', p_ctx);
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
  v_acc := acceso_de(v_cel);
  if not (v_acc->>'ok')::boolean then return jsonb_build_object('ok', false); end if;
  update asesor_sesion set ultimo_uso = now() where token = p_token;
  return jsonb_build_object('ok', true, 'nombre', v_acc->>'nombre', 'celular', v_cel,
    'completa', coalesce((select a.vista_completa from asesores a where a.celular = v_cel and a.activo), false));
end $function$;
