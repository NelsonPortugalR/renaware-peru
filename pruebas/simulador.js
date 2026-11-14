/* Abre el portal en Chromium real, sin internet: todo lo que la página pide
   afuera (React, supabase-js, fuentes, la base, las fotos) se responde desde
   aquí. La base es un Supabase simulado que solo deja leer los catálogos y
   llamar a las funciones con sesión; cualquier escritura directa a una tabla
   se rechaza y queda anotada, igual que con las políticas reales. */
const fs = require("fs");
const path = require("path");

function buscarModulo(nombre) {
  const dirs = [path.join(__dirname, "node_modules"), path.join(__dirname, "..", "node_modules"), "/opt/npm-tools/node_modules"];
  for (const d of dirs) { const p = path.join(d, nombre); if (fs.existsSync(p)) return p; }
  return null;
}
const rutaPw = buscarModulo("playwright");
if (!rutaPw) { console.error("Falta Playwright: npm i playwright (en pruebas/)"); process.exit(2); }
const pw = require(rutaPw);

const SB = "https://kiexpdaaoegbtesqmaff.supabase.co";
const ORIGEN = "https://portal.prueba";
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
const CLAVE_ADMIN = "clave-de-prueba";

/* supabase-js de mentira: lo justo que usa la página. Las funciones que cambian algo exigen sesión de admin. */
const SB_FALSO = `
window.supabase = { createClient: function () {
  var M = window.__MOCK, S = window.__SIM = window.__SIM || { rpc: [], subidas: [], config: null, sesiones: { "tok-asesor": { nombre: "Nelson", celular: "987654321", completa: M.completa !== false } }, admin: {} };
  function R(d) { return Promise.resolve({ data: d, error: null }); }
  function E(m) { return Promise.resolve({ data: null, error: { message: m } }); }
  function esAdmin(t) { return !!(t && S.admin[t]); }
  return {
    from: function (t) { return { select: function () { return { eq: function () { return { maybeSingle: function () {
      return R(t === "site_config" ? { data: S.config || M.config } : null); } }; } }; } }; },
    rpc: function (n, a) {
      a = a || {}; S.rpc.push([n, a]);
      if (n === "asesor_sesion_valida") return R(S.sesiones[a.p_token] ? Object.assign({ ok: true }, S.sesiones[a.p_token]) : { ok: false });
      if (n === "asesor_login") { var quien = { "40123456": { nombre: "Nelson", celular: "987654321", completa: true }, "45678912": { nombre: "Rosa", celular: "912345678", completa: false } }[String(a.p_celular)]; if (!quien) return E("Ese DNI no esta habilitado"); S.sesiones["tok-asesor"] = quien; return R(Object.assign({ token: "tok-asesor" }, quien)); }
      if (n === "registrar_evento") return R(true);
      if (n === "admin_login") { if (a.p_clave !== "${CLAVE_ADMIN}") return E("Clave incorrecta"); S.admin["tok-admin"] = 1; return R("tok-admin"); }
      if (n === "guardar_config_tok") { if (!esAdmin(a.p_token)) return E("Sesion invalida"); S.config = a.p_data || S.config; return R(true); }
      if (n === "set_precio_repuesto_tok") { if (!esAdmin(a.p_token)) return E("Sesion invalida");
        var p = M.productos.filter(function (x) { return x.lista_id === "repuestos" && x.codigo === a.p_codigo; })[0];
        if (!p) return E("No existe");
        p.precio_cliente_manual = a.p_precio; p.precio = a.p_precio != null ? a.p_precio : Math.ceil(p.precio_asesor_fijo * 1.3);
        return R({ codigo: p.codigo, precio: p.precio }); }
      if (n === "cot_servicio_guardar") { if (!esAdmin(a.p_token)) return E("Sesion invalida");
        var s = (M.servicios || []).filter(function (x) { return x.codigo === a.p_codigo; })[0];
        if (!s || s.tipo !== "servicio") return E("Servicio " + a.p_codigo + " no encontrado");
        if (!(a.p_precio > 0)) return E("Precio invalido");
        if (a.p_precio_asesor != null && !(a.p_precio_asesor > 0 && a.p_precio_asesor <= a.p_precio)) return E("El precio de asesor no puede ser mayor que el del cliente");
        s.precio = a.p_precio; s.precio_asesor = a.p_precio_asesor == null ? null : a.p_precio_asesor;
        return R({ codigo: s.codigo, precio: s.precio, precio_asesor: s.precio_asesor }); }
      if (n === "admin_asesores" || n === "admin_actividad") return esAdmin(a.p_token) ? R([]) : E("Sesion invalida");
      return R(null);
    },
    storage: { from: function (b) { return {
      upload: function (ruta) { S.subidas.push([b, ruta]); return Promise.resolve({ error: null }); },
      getPublicUrl: function (ruta) { return { data: { publicUrl: "${SB}/storage/v1/object/public/" + b + "/" + ruta } }; } }; } }
  };
} };`;

/* o.dir: carpeta del portal · o.mock: datos (los de datos.json) · o.movil: celular de 390 px ·
   o.ruta: "/admin" · o.sinSesion: arranca sin sesión de asesor · o.reloj: fecha que ve la página ·
   o.fotos: carpetas donde buscar las fotos que la página pide al Storage ·
   o.tour: deja que arranque solo el tutorial de la primera vez (si no, se da por visto) */
async function abrir(o) {
  o = o || {};
  const dir = o.dir || path.join(__dirname, "..");
  const mock = o.mock;
  const react = path.join(__dirname, "vendor", "react.production.min.js");
  const reactDom = path.join(__dirname, "vendor", "react-dom.production.min.js");
  const fuente = buscarModulo("@fontsource/dm-sans/files");
  const navegador = await pw.chromium.launch();
  const ctx = await navegador.newContext({
    viewport: o.viewport || { width: 390, height: 844 }, deviceScaleFactor: o.dpr || (o.movil ? 2 : 1),
    isMobile: !!o.movil, hasTouch: !!o.movil, locale: "es-PE", timezoneId: "America/Lima"
  });
  const registro = { escrituras: [], pedidos: [], errores: [] };
  await ctx.addInitScript((m) => { window.__MOCK = m; try { if (m.__sesion !== false) localStorage.setItem("rw_sesion_v1", "tok-asesor"); if (!m.__tour) localStorage.setItem("rw_tour_v1", "1"); } catch (e) {} },
    Object.assign({}, mock, { __sesion: o.sinSesion ? false : true, __tour: !!o.tour }));
  if (o.reloj) await ctx.addInitScript((t) => { const D = Date, d0 = D.now(); const corr = t - d0;
    window.Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + corr); } static now() { return D.now() + corr; } }; }, Date.parse(o.reloj));
  await ctx.route("**/*", async (ruta) => {
    const req = ruta.request(), u = new URL(req.url());
    const json = (d, st) => ruta.fulfill({ status: st || 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(d) });
    const archivo = (f) => fs.existsSync(f) && fs.statSync(f).isFile()
      ? ruta.fulfill({ status: 200, contentType: TIPOS[path.extname(f)] || "application/octet-stream", headers: { "access-control-allow-origin": "*" }, body: fs.readFileSync(f) })
      : ruta.fulfill({ status: 404, body: "no existe" });
    if (u.origin === ORIGEN) {
      const p = decodeURIComponent(u.pathname);
      const f = path.join(dir, p);
      if (p !== "/" && fs.existsSync(f) && fs.statSync(f).isFile()) return archivo(f);
      if (/\.[a-z0-9]{2,5}$/i.test(p)) return ruta.fulfill({ status: 404, body: "no existe" });
      return archivo(path.join(dir, "index.html"));          // como el Worker: lo que no es archivo abre el portal
    }
    if (u.hostname === "unpkg.com") return archivo(/react-dom/.test(u.pathname) ? reactDom : react);
    if (u.hostname === "cdn.jsdelivr.net" && /supabase/.test(u.pathname)) return ruta.fulfill({ status: 200, contentType: "text/javascript", body: SB_FALSO });
    if (u.hostname === "cdn.jsdelivr.net") return ruta.fulfill({ status: 200, contentType: "text/javascript",
      body: "window.htmlToImage={toPng:async()=>'data:image/png;base64,iVBORw0KGgo=',toCanvas:async()=>{const c=document.createElement('canvas');c.width=600;c.height=800;return c}};" });
    if (u.hostname === "fonts.googleapis.com") {
      const css = fuente ? [300, 500, 600, 700, 800].map((w) => `@font-face{font-family:'DM Sans';font-weight:${w};font-style:normal;src:url(https://fonts.gstatic.com/dm-sans-latin-${w}-normal.woff2) format('woff2')}`).join("") : "";
      return ruta.fulfill({ status: 200, contentType: "text/css", headers: { "access-control-allow-origin": "*" }, body: css });
    }
    if (u.hostname === "fonts.gstatic.com" && fuente) return archivo(path.join(fuente, path.basename(u.pathname)));
    if (u.origin === SB && u.pathname.startsWith("/rest/v1/")) {
      const tabla = u.pathname.slice(9);
      if (req.method() !== "GET") { registro.escrituras.push(req.method() + " " + tabla); return json({ code: "42501", message: "new row violates row-level security policy" }, 401); }
      registro.pedidos.push(tabla);
      const falta = () => json({ code: "PGRST205", message: "Could not find the table" }, 404);
      if (tabla === "v_listas_vigentes") return json(mock.listas);
      if (tabla === "productos") return json(mock.productos.filter((p) => p.activo));
      if (tabla === "factores_credito") return json(mock.factores);
      if (tabla === "reglas_credito") return json(mock.reglas);
      if (tabla === "piezas") return json(mock.piezas);
      if (tabla === "cot_servicios") return mock.servicios ? json(mock.servicios.filter((s) => s.activo !== false)) : falta();
      if (tabla === "cot_grupos") return mock.grupos ? json(mock.grupos) : falta();
      return json([]);
    }
    if (u.origin === SB && u.pathname.startsWith("/storage/")) {
      const cod = path.basename(u.pathname).split("-")[0];
      for (const c of (o.fotos || [])) { const f = path.join(c, cod + ".webp"); if (fs.existsSync(f)) return archivo(f); }
      return ruta.fulfill({ status: 404, body: "" });
    }
    if (u.origin === SB) return json({ ok: false }, 404);
    return ruta.abort();
  });
  const pagina = await ctx.newPage();
  pagina.on("pageerror", (e) => registro.errores.push(String(e.message || e)));
  pagina.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) registro.errores.push(m.text()); });
  await pagina.goto(ORIGEN + (o.ruta || "/"));
  await pagina.waitForSelector(o.espera || ".lista-btn, .login-box, .admin-login", { timeout: 15000 });
  await pagina.waitForTimeout(o.pausa == null ? 400 : o.pausa);
  return { navegador, ctx, pagina, registro, cerrar: () => navegador.close() };
}

module.exports = { abrir, ORIGEN, SB, CLAVE_ADMIN };
