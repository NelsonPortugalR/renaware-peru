/* Prueba de comportamiento del portal de precios en Chromium real (Playwright),
   sin internet. La base es el Supabase simulado de simulador.js: deja leer los
   catálogos y llamar funciones; cualquier escritura directa a una tabla se
   rechaza y hace fallar la prueba.
   Recorre: ingreso, listas, puntos y ganancia, Repuestos como catálogo,
   Servicios (soldadura, limpieza, pulido en dos variantes, cocina), fichas,
   cotización, buscador, panel de administración, el comportamiento de la
   parte alta (listas, barra pegada, salto al buscar), el tutorial, la inicial
   y el crédito, la cotización (lo que se está viendo, en una imagen grande), el envío
   del video, la sesión que se queda y el registro de uso.
   Solo una parte:  SOLO=inicial,cotizacion node pruebas/prueba.js
   Uso:  node pruebas/prueba.js [carpeta-de-capturas]
   Los datos de datos.json tienen precios de asesor, puntos y valores
   comisionables inventados (el repositorio es público). */
const path = require("path");
const fs = require("fs");
const { abrir, CLAVE_ADMIN } = require("./simulador.js");
const DATOS = require("./datos.json");
const ESTADISTICAS = require("./estadisticas.json");   // lo que arma admin_estadisticas, con personas y cifras inventadas
const RAIZ = path.join(__dirname, "..");
const CAPTURAS = process.argv[2] || "";

let pasan = 0, fallan = 0;
const ok = (c, m) => { if (c) pasan++; else { fallan++; console.log("  ✗ " + m); } };
const igual = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + " → esperado " + JSON.stringify(b) + ", salió " + JSON.stringify(a));
const cerca = (a, b, m, tol) => ok(Math.abs(a - b) <= (tol == null ? 1 : tol), m + " → esperado " + b + ", salió " + a);
const num = (s) => Number(String(s).replace(/[^0-9.]/g, ""));
const clonar = (x) => JSON.parse(JSON.stringify(x));
const titulo = (t) => console.log("\n== " + t + " ==");

/* Sesión de prueba con atajos para leer y tocar la página */
async function sesion(o) {
  const mock = clonar(DATOS);
  if (o && o.cambiar) o.cambiar(mock);
  const s = await abrir(Object.assign({ dir: RAIZ, mock }, o || {}));
  const p = s.pagina;
  s.textos = (sel) => p.evaluate((q) => Array.from(document.querySelectorAll(q)).map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()), sel);
  s.texto = async (sel) => (await s.textos(sel))[0] || "";
  s.cuenta = (sel) => p.evaluate((q) => document.querySelectorAll(q).length, sel);
  s.cajas = (sel) => p.evaluate((q) => Array.from(document.querySelectorAll(q)).map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), der: Math.round(r.right), aba: Math.round(r.bottom) }; }), sel);
  s.scrollY = () => p.evaluate(() => Math.round(window.scrollY));
  s.lista = async (t) => { await p.locator(".lista-btn", { hasText: t }).first().click(); await p.waitForTimeout(300); };
  s.filtro = async (t) => { await p.locator(".nav-tab", { hasText: t }).first().click(); await p.waitForTimeout(200); };
  s.cerrarFicha = async () => { await p.locator(".modal-close").first().click(); await p.waitForTimeout(250); };
  s.pestana = async (t) => { await p.locator(".mode-tab", { hasText: t }).click(); await p.waitForTimeout(200); };
  s.fila = (t) => p.locator(".fila", { hasText: t }).first();
  s.rpc = (n) => p.evaluate((q) => (window.__SIM ? window.__SIM.rpc : []).filter((x) => x[0] === q).map((x) => x[1]), n);
  s.eventos = async (tipo) => {
    for (let k = 0; k < 40; k++) {
      const quedan = await p.evaluate(() => { try { if (window.__rwEnviarEventos) window.__rwEnviarEventos(true); return JSON.parse(localStorage.getItem("rw_eventos_v1") || "[]").length; } catch (e) { return 0; } });
      if (!quedan) break;
      await p.waitForTimeout(100);
    }
    return s.registro.eventos.filter((x) => !tipo || x.tipo === tipo).map((x) => Object.assign({ tipo: x.tipo }, x.d));
  };
  s.cola = () => p.evaluate(() => { try { return JSON.parse(localStorage.getItem("rw_eventos_v1") || "[]"); } catch (e) { return []; } });
  /* Lo que dice la cotización que la página dejó armada: la imagen se dibuja en un lienzo, así que aquí se revisan sus
     datos (window.__cotizacion). Tras cada cambio la página la rearma con unos 400 ms de retraso: se espera a que cumpla `cuando`.
     Los montos traen un espacio duro entre «S/» y el número: aquí se cambia por uno normal. */
  s.cot = async (cuando) => {
    let m = null;
    for (let k = 0; k < 40; k++) {
      m = await p.evaluate(() => window.__cotizacion ? JSON.parse(JSON.stringify(window.__cotizacion).replace(/ /g, " ")) : null);
      if (m && (!cuando || cuando(m))) return m;
      await p.waitForTimeout(150);
    }
    return cuando ? null : m;
  };
  s.foto = async (n, full) => { if (CAPTURAS) { fs.mkdirSync(CAPTURAS, { recursive: true }); await p.screenshot({ path: path.join(CAPTURAS, n + ".png"), fullPage: !!full }); } };
  s.fin = async (n) => {
    igual(s.registro.escrituras, [], n + ": la página no escribe directo a ninguna tabla");
    igual(s.registro.errores, [], n + ": sin errores de JavaScript");
    await s.cerrar();
  };
  return s;
}
const sinBono = (m) => { m.config.bonoSemana.activo = false; m.config.bonosExtra = []; };

/* ------------------------------------------------------------------ 1. ingreso y listas */
async function ingreso() {
  titulo("Ingreso y listas");
  const s = await sesion({ movil: true, sinSesion: true, cambiar: sinBono });
  const p = s.pagina;
  ok(await s.cuenta(".login-box") === 1 && await s.texto(".login-rot") === "Tu DNI", "sin sesión pide el DNI");
  ok(await s.cuenta(".lista-btn") === 0, "y no muestra ninguna lista");
  await p.locator(".login-input").fill("123");
  await p.locator(".login-btn").click(); await p.waitForTimeout(200);
  ok(/8 dígitos/.test(await s.texto(".login-err")) && (await s.rpc("asesor_login")).length === 0, "un DNI incompleto se avisa sin consultar la base");
  await p.locator(".login-input").fill("11111111");
  await p.locator(".login-btn").click(); await p.waitForTimeout(300);
  ok(/no está registrado/.test(await s.texto(".login-err")), "un DNI que no está en el equipo no entra");
  await p.locator(".login-input").fill("40 123 456-x9");
  igual(await p.locator(".login-input").inputValue(), "40123456", "el campo se queda solo con los 8 dígitos");
  await p.locator(".login-btn").click();
  await p.waitForSelector(".lista-btn");
  await p.waitForTimeout(300);
  igual(await s.textos(".lista-btn .lista-nom"), ["Tienda en Línea", "Lista General", "Compartir", "Repuestos", "Servicios"], "con vista completa, las cinco listas, con Servicios al final");
  igual(await s.textos(".lista-btn.esp .lista-nom"), ["Compartir"], "solo el especial va resaltado");
  igual(await s.texto(".lista-btn.esp .lista-esp"), "Especial hasta 11 nov", "y dice que es especial y hasta cuándo");
  const esp = await p.evaluate(() => { const b = document.querySelector(".lista-btn.esp"), e = b.querySelector(".lista-esp b"), f = b.querySelector(".lista-esp i"), cb = getComputedStyle(b), ce = getComputedStyle(e);
    return { fondo: cb.backgroundImage !== "none", borde: cb.borderTopColor, sello: ce.backgroundColor, letra: ce.color, mayus: ce.textTransform, fecha: parseFloat(getComputedStyle(f).fontSize) }; });
  ok(esp.fondo && esp.borde === "rgb(30, 90, 168)" && esp.sello === "rgb(225, 29, 42)" && esp.letra === "rgb(255, 255, 255)" && esp.mayus === "uppercase" && esp.fecha >= 12, "el especial se nota y va con los colores de sus volantes: fondo amarillo, borde azul, sello ESPECIAL rojo y la fecha en letra legible → " + JSON.stringify(esp));
  ok(/\blst-compartir\b/.test(await p.locator(".lista-btn.esp").getAttribute("class")), "cada lista de especiales lleva su clase, para darle sus colores");
  igual(await p.evaluate(() => { try { return JSON.parse(localStorage.getItem("rw_sesion_datos_v1")).nombre; } catch (e) { return ""; } }), "Nelson", "el equipo recuerda quién entró, para no volver a pedir el DNI");
  ok(await s.cuenta(".accion-btn") === 2, "con Simulador de puntos y Buscador maestro");
  const pedidos = Array.from(new Set(s.registro.pedidos)).sort();
  igual(pedidos, ["cot_grupos", "cot_servicios", "factores_credito", "piezas", "productos", "reglas_credito", "v_listas_vigentes"], "lee solo catálogos");
  await s.fin("ingreso");
}

/* ------------------------------------------------------------------ 2. puntos y ganancia (lo de siempre) */
async function ganancia() {
  titulo("Puntos y ganancia en una promoción");
  const s = await sesion({ movil: true, cambiar: sinBono });
  const p = s.pagina;
  await s.lista("Compartir");
  await p.locator(".tile-btn").first().click(); await p.waitForTimeout(350);
  ok(/Esta venta da 1,400 pts/.test(await s.texto(".points-note")), "sin bono muestra el puntaje de la venta → " + await s.texto(".points-note"));
  igual(await s.textos(".mode-tab"), ["Precio Cliente", "Precio Autocompra"], "las pestañas de precio no cambian en las promociones");
  ok(await s.cuenta(".pay-box") === 1, "con su bloque de contado y crédito");
  ok(await s.cuenta(".gan") === 1, "aparece el bloque de ganancia debajo de los puntos");
  ok(/Cuánto gano con esta venta/.test(await s.texto(".gan")), "con su título");
  cerca(num(await s.texto(".gan-total")), 1440, "total cerrado: comisión 900 + nivel 3 540 = 1,440");
  await p.locator(".gan-top").first().click(); await p.waitForTimeout(250);
  ok(await s.cuenta(".gan-cuerpo") === 1, "se despliega al tocarlo");
  const cuerpo = await s.texto(".gan-cuerpo");
  ok(/Comisión 15%S\/ 900\.00/.test(cuerpo), "comisión 15% = 900.00 → " + cuerpo.slice(0, 80));
  ok(/6,000\.00/.test(cuerpo), "muestra el valor comisionable");
  const nivs = await p.evaluate(() => Array.from(document.querySelectorAll(".gan-niv")).map((b) => ({ on: b.className.includes("on"), dis: b.disabled })));
  igual(nivs.length, 4, "hay los cuatro niveles");
  ok(nivs[2] && nivs[2].on, "con 1,400 pts arranca en nivel 3");
  ok(nivs[0].dis && nivs[1].dis, "no deja bajar a nivel 1 ni 2");
  ok(!nivs[3].dis, "sí deja subir a nivel 4");
  ok(await s.cuenta(".gan-aviso") === 0, "sin aviso mientras esté en su nivel real");
  await p.locator(".gan-niv").nth(3).click(); await p.waitForTimeout(200);
  ok(await s.cuenta(".gan-aviso") === 1, "al subir de nivel aparece el aviso");
  ok(/2,000 puntos en el per/.test(await s.texto(".gan-aviso")), "el aviso dice cuánto puntaje hace falta");
  ok(/ventas personales y las de tu equipo/.test(await s.texto(".gan-aviso")), "y de dónde puede salir");
  cerca(num(await s.texto(".gan-total")), 1620, "nivel 4 recalcula: 900 + 720 = 1,620");

  await s.pestana("Autocompra");
  ok(await s.cuenta(".gan.equipo") === 1, "en autocompra aparece el bloque de equipo");
  ok(/Si la hace tu afiliado/.test(await s.texto(".gan.equipo")), "con su título");
  ok(/TU PRECIO \(CONTADO\)S\/ 8,017/.test(await s.texto(".auto-ticket")), "y el precio de autocompra → " + await s.texto(".auto-ticket"));
  await p.locator(".gan.equipo .gan-top").click(); await p.waitForTimeout(250);
  const ce = () => s.texto(".gan.equipo .gan-cuerpo");
  ok(/una venta personal/.test(await ce()), "avisa que hace falta una venta personal propia");
  ok(/180\.00/.test(await ce()), "bono de reclutamiento 3% = 180.00");
  await p.locator(".gan.equipo input[type=number]").fill("2500"); await p.waitForTimeout(250);
  ok(/Nivel 3/.test(await ce()), "con 2,500 pts pero sin ser desarrollador se queda en nivel 3");
  ok(await s.cuenta(".gan.equipo .gan-aviso") >= 1, "y lo advierte");
  await p.locator(".gan.equipo input[type=checkbox]").click(); await p.waitForTimeout(250);
  ok(/Nivel 4/.test(await ce()), "al marcar desarrollador de equipo sube a nivel 4");
  cerca(num(await s.texto(".gan.equipo .gan-total")), 360, "reclutamiento 180 + desarrollo (12−9 = 3%) 180 = 360");
  await p.locator(".gan.equipo input[type=number]").fill("300"); await p.waitForTimeout(250);
  ok(/por encima del de tu afiliado/.test(await ce()), "si tu nivel no supera al del afiliado, lo dice");
  cerca(num(await s.texto(".gan.equipo .gan-total")), 180, "y solo queda el reclutamiento");
  await s.cerrarFicha();

  titulo("Lista General y Tienda en Línea siguen igual");
  await s.lista("Lista General");
  ok(await s.cuenta(".accion-btn") === 2, "Simulador de puntos y Buscador maestro");
  ok(await s.cuenta(".tile") === 46 && await s.cuenta(".fila") === 0, "la lista general sigue en fichas grandes");
  await p.locator(".tile-btn").first().click(); await p.waitForTimeout(350);
  ok(/S\/ 9,629/.test(await s.texto(".price-big")), "precio contado del Juego Gourmet");
  igual(await s.textos(".tab-btn"), ["Contado", "Crédito"], "contado y crédito");
  await p.locator(".tab-btn", { hasText: "Crédito" }).click(); await p.waitForTimeout(200);
  ok(await s.cuenta(".inst-btn") >= 3, "con sus cuotas");
  const cg = await s.cot((m) => /000158/.test(m.codigo));
  igual(cg && cg.codigo, "Cod. 000158 - N° 1", "la cotización conserva código y número");
  await s.cerrarFicha();
  await s.lista("Tienda en Línea");
  await p.locator(".tile-btn").first().click(); await p.waitForTimeout(350);
  ok(await s.cuenta(".mode-tabs") === 0, "Tienda en Línea no tiene autocompra");
  ok(/Inicial \(pago total\)/i.test(await s.texto(".cbox-label")), "y se paga completo");
  await s.cerrarFicha();

  titulo("Buscador maestro y simulador");
  await s.lista("Lista General");
  await p.locator(".accion-btn", { hasText: "Buscador maestro" }).click(); await p.waitForTimeout(250);
  await p.locator(".cmp-input").fill("olla a presi"); await p.waitForTimeout(250);
  await p.locator(".cmp-sug").first().click(); await p.waitForTimeout(250);
  ok(await s.cuenta(".cmp-promo") >= 1, "encuentra promociones que incluyen el producto");
  await p.locator(".cmp-promo-abre").first().click(); await p.waitForTimeout(200);
  await p.locator(".cmp-ir-btn").click(); await p.waitForTimeout(400);
  ok(await s.cuenta(".modal-box") === 1, "«Ver cuotas y detalle» abre la promoción");
  ok(/on/.test(await p.locator(".lista-btn", { hasText: "Compartir" }).getAttribute("class")), "y deja abierta su lista");
  await s.cerrarFicha();
  await s.lista("Lista General");
  await p.locator(".accion-btn", { hasText: "Simulador" }).click(); await p.waitForTimeout(250);
  await p.locator(".sim-input").fill("250"); await p.waitForTimeout(250);
  ok(await s.cuenta(".sim-card.best") === 1, "el simulador propone la opción más barata");
  await p.locator(".sim-close").click(); await p.waitForTimeout(200);
  await s.fin("promociones");
}

/* ------------------------------------------------------------------ 3. repuestos como catálogo */
async function repuestos() {
  titulo("Repuestos como el catálogo");
  const s = await sesion({ movil: true, cambiar: sinBono });
  const p = s.pagina;
  await s.lista("Repuestos");
  igual(await s.textos(".nav-tab"), ["Todas", "Asas y perillas", "Ollas a presión", "Filtros de agua", "Purificador de aire", "Extractores de jugo", "Door openers"], "filtros por familia");
  igual(await s.cuenta(".cat-sec"), 13, "trece grupos, uno por hoja del catálogo");
  igual(await s.cuenta(".fila"), 83, "73 repuestos + 10 cartuchos de la Lista General en su equipo");
  igual(await s.cuenta(".tile"), 0, "ya no hay fichas grandes con «Ver precio»");
  igual((await s.textos(".cat-sec-tit h2")).slice(0, 5), ["Asas y perillas", "Olla a presión 8 L", "Nutrex Cooker 8 L", "Nutrex Cooker 9 L", "Aqua Nano CTU-500"], "en el orden del catálogo");
  igual(await s.cuenta(".cat-blo-head h3"), 15, "con sus subtítulos");
  const f1 = await s.texto(".fila");
  ok(/Asa pequeña con protector de calor/.test(f1) && /Soporte antiguo, ollas de 1 a 6 L/.test(f1) && /Cód\. 30104/.test(f1) && /S\/ 24/.test(f1), "la fila trae nombre de catálogo, detalle, código y precio → " + f1);
  ok(/Solo al contado/.test(await s.texto(".aviso-lista")), "el aviso de la lista va arriba");
  ok(await s.cuenta(".accion-btn") === 1, "sin simulador de puntos (no generan puntos)");
  igual(await p.locator(".search-bar input").getAttribute("placeholder"), "Buscar repuesto: nombre o código…", "el buscador dice qué busca");

  titulo("Repuestos: la foto del equipo en cada sección");
  const secR = (t) => p.locator(".cat-sec", { has: p.locator("h2", { hasText: t }) }).first();
  igual([await s.cuenta(".cat-sec-head.con-equipo .cat-eq-foto"), await s.cuenta(".cat-equipos")], [8, 4], "ocho grupos con la foto de su equipo al costado del título y cuatro con sus modelos en fila");
  const fotosEq = DATOS.grupos.flatMap((g) => g.equipo || []);
  ok(fotosEq.length === 17 && fotosEq.every((m) => fs.existsSync(path.join(RAIZ, "promociones", m.foto + ".webp"))), "las 17 fotos de equipos están en promociones/");
  const asas = await secR(/^Asas y perillas$/).evaluate((sec) => { const f = sec.querySelector(".cat-eq-foto"), t = sec.querySelector(".cat-sec-tit"), a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
    return { carga: f.naturalWidth > 0, clase: f.className.trim(), w: Math.round(a.width), h: Math.round(a.height), alCostado: a.left >= b.left + 100 && a.right <= sec.getBoundingClientRect().right && a.top < b.bottom && a.bottom > b.top, alt: f.alt }; });
  ok(asas.carga && asas.clase === "cat-eq-foto ancha" && asas.w === 150 && asas.h === 92 && asas.alCostado && asas.alt === "Asas y perillas", "Asas y perillas: su foto carga, grande y al costado del título → " + JSON.stringify(asas));
  ok(await secR(/^Asas y perillas$/).locator(".fila .fila-img").count() > 0, "y las piezas conservan su propia foto");
  const pieza = (await s.cajas(".cat-sec .fila .fila-img"))[0];
  igual([pieza.w, pieza.h], [112, 86], "la foto de cada pieza es más grande que antes (era de 96 × 74)");
  igual(await secR(/^Nutrex Juicer$/).locator(".cat-equipos.n2 .cat-equipo figcaption").allInnerTexts(), ["Modelo nuevo", "Modelo antiguo"], "Nutrex Juicer: el modelo nuevo y el antiguo, cada uno con su nombre");
  igual(await secR(/^Purificador de aire$/).locator(".cat-equipos.n3 .cat-equipo figcaption").allInnerTexts(), ["Actual: Aero Quattro+ UV", "2da generación: Aero Quattro+", "1ra generación: Aero Quattro"], "Purificador de aire: sus tres generaciones");
  await secR(/^Nutrex Juicer$/).scrollIntoViewIfNeeded(); await p.waitForTimeout(450);
  const nj = await secR(/^Nutrex Juicer$/).evaluate((sec) => { const g = sec.querySelector(".cat-equipos").getBoundingClientRect(), t = sec.querySelector(".cat-sec-head").getBoundingClientRect(), f = sec.querySelector(".fila").getBoundingClientRect();
    return { cargan: Array.from(sec.querySelectorAll(".cat-equipo img")).map((x) => x.naturalWidth > 0), entre: g.top >= t.bottom - 1 && g.bottom <= f.top + 1, alto: Math.round(sec.querySelector(".cat-equipo img").getBoundingClientRect().height) }; });
  ok(nj.cargan.every(Boolean) && nj.cargan.length === 2 && nj.entre && nj.alto === 128, "sus fotos cargan y van entre el título y las piezas → " + JSON.stringify(nj));
  igual(await secR(/^Door openers$/).locator(".cat-eq-foto, .cat-equipos").count(), 0, "Door openers, que no tiene foto de equipo, queda como antes");
  await s.foto("repuestos-equipo");
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(250);

  const ctu = p.locator(".cat-sec", { has: p.locator("h2", { hasText: "Aqua Nano CTU-500" }) });
  igual(await ctu.locator(".cat-sec-fam").innerText(), "FILTROS DE AGUA", "cada grupo lleva su familia");
  igual(await ctu.locator(".cat-blo-head h3").allInnerTexts(), ["CARTUCHOS DE CAMBIO", "REPUESTOS DEL EQUIPO"], "primero los cartuchos, luego las piezas");
  igual(await ctu.locator(".cat-blo").first().locator(".fila-ext").allInnerTexts(), ["LISTA GENERAL", "LISTA GENERAL", "LISTA GENERAL"], "los cartuchos vienen marcados como Lista General");
  igual(await ctu.locator(".cat-count").innerText(), "11", "3 cartuchos + 8 piezas");

  await s.filtro("Filtros de agua");
  igual(await s.textos(".cat-sec-tit h2"), ["Aqua Nano CTU-500", "Aqua Nano UCU", "Aqua CK II 5000 y CK 3000", "Filtro portátil RWF-228", "Botella filtrante"], "el filtro deja la familia completa");
  igual(await s.cuenta(".fila"), 30, "con sus 30 filas");
  await s.filtro("Todas");

  titulo("Ficha de un repuesto");
  await s.fila("Cód. 30104").click(); await p.waitForTimeout(350);
  igual(await s.texto(".pcard-name"), "Asa pequeña con protector de calor", "título corto");
  igual(await s.texto(".pcard-eti"), "Asas y perillas", "con su grupo");
  igual(await s.texto(".pcard-det"), "Soporte antiguo, ollas de 1 a 6 L", "y el detalle que lo distingue");
  igual(await s.texto(".pcard-code"), "Cód. 30104", "y el código");
  igual(await s.textos(".mode-tab"), ["Precio Cliente", "Precio Asesor"], "pestañas: cliente y asesor");
  igual(await s.texto(".price-big"), "S/ 24", "precio al cliente");
  igual(await s.cuenta(".pay-box") + await s.cuenta(".points-note") + await s.cuenta(".gan") + await s.cuenta(".incentives"), 0, "sin cuotas, sin inicial, sin puntos, sin ganancia de equipo");
  ok(/Originales; llegan en unos 2 días/.test(await s.texto(".modal-info .info-banner")), "con la nota del grupo");
  ok(/El pedido de repuestos lo ingresa la oficina/.test(await s.texto(".cat-pie")), "y la regla de la lista");
  await s.pestana("Asesor");
  igual(await s.textos(".auto-ticket .tk-line, .auto-ticket .tk-total"), ["Precio al clienteS/ 24", "Tu gananciaS/ 6", "PRECIO ASESORS/ 18"], "precio de asesor y ganancia");
  const cr = await s.cot((m) => m.chip === "Precio Asesor" && /30104/.test(m.codigo));
  igual(cr && [cr.codigo, cr.puntos, cr.bloques.length], ["Cod. 30104", null, 1], "la cotización lo dice igual: con su código, sin cuotas y sin puntos");
  igual(cr && cr.bloques[0].filas.map((f) => f.t + " " + f.v).concat(cr.bloques[0].total.t + " " + cr.bloques[0].total.v), ["Precio al cliente S/ 24", "Tu ganancia S/ 6", "Precio asesor S/ 18"], "con el precio al cliente, la ganancia y el precio de asesor");
  await s.cerrarFicha();
  await s.fila("Cód. 30314").click(); await p.waitForTimeout(350);
  await s.pestana("Asesor");
  igual(await s.textos(".auto-ticket .tk-line, .auto-ticket .tk-total"), ["Precio al clienteS/ 221", "Tu gananciaS/ 50.50", "PRECIO ASESORS/ 170.50"], "los céntimos se ven cuando existen");
  await s.cerrarFicha();
  await s.fila("Cód. 000096").click(); await p.waitForTimeout(350);
  igual(await s.textos(".mode-tab"), ["Precio Cliente", "Precio Autocompra"], "el cartucho abre su ficha de la Lista General");
  ok(await s.cuenta(".pay-box") === 1 && await s.cuenta(".points-note") === 1, "con cuotas y puntos");
  await s.cerrarFicha();

  titulo("Buscar en Repuestos");
  const buscar = async (t) => { await p.locator(".search-bar input").fill(t); await p.waitForTimeout(250); };
  await buscar("valvula");
  const n = await s.cuenta(".fila");
  ok(n >= 10 && await s.cuenta(".fila-eti") === n, "«valvula» trae " + n + " filas, cada una con su grupo");
  await buscar("soporte antiguo pequeño");
  ok((await s.textos(".fila-cod")).some((t) => /30104/.test(t)), "también encuentra por el nombre de la lista oficial");
  await buscar("aqua nano ucu");
  ok(await s.cuenta(".fila") >= 5, "y por el nombre del equipo");
  await buscar("000096");
  igual(await s.textos(".fila-ext"), ["Lista General"], "y los cartuchos de la Lista General por código");
  await buscar("zzzz");
  ok(/No se encontró/.test(await s.texto(".empty-state")), "si no hay, lo dice");
  await p.locator(".search-clear").click(); await p.waitForTimeout(200);
  igual(await s.cuenta(".cat-sec"), 13, "al limpiar vuelve el catálogo");
  await s.fin("repuestos");
}

/* ------------------------------------------------------------------ 4. servicios */
async function servicios() {
  titulo("Pestaña Servicios");
  const s = await sesion({ movil: true, cambiar: sinBono });
  const p = s.pagina;
  await s.lista("Servicios");
  igual(await s.textos(".nav-tab"), ["Todas", "Soldadura", "Limpieza", "Pulido", "Cocina de inducción"], "las cuatro categorías del catálogo");
  igual(await s.textos(".cat-sec-tit h2"), ["Soldadura", "Limpieza", "Pulido", "Cocina de inducción"], "en su orden");
  igual(await s.textos(".cat-count"), ["3", "3", "24", "6"], "con lo que trae cada una");
  igual(await s.cuenta(".fila"), 30, "2 de soldadura + 3 de limpieza + 24 piezas de pulido + 1 de cocina");
  ok(/Solo al contado\. No generan puntos/.test(await s.texto(".aviso-lista")), "aviso de la lista");
  igual(await p.locator(".search-bar input").getAttribute("placeholder"), "Buscar servicio…", "buscador de servicios");
  ok(/Actualizada al 10 nov\. 2026/.test(await s.texto(".lista-fecha")), "con su fecha de actualización → " + await s.texto(".lista-fecha"));

  const sec = (t) => p.locator(".cat-sec", { has: p.locator("h2", { hasText: t }) });
  const filas = async (t) => (await sec(t).locator(".fila").allInnerTexts()).map((x) => x.replace(/\s+/g, " ").trim());
  igual(await filas("Soldadura"), ["Soldar el perno de la perilla En la tapa. S/ 90 por pieza", "Soldar el soporte de un asa En la olla. S/ 90 por asa"], "soldadura a S/ 90");
  igual((await sec("Soldadura").locator(".cat-sp-fila").allInnerTexts()).map((x) => x.replace(/\s+/g, " ")), ["Otro trabajo de soldadura Según cotización del taller"], "lo que va por cotización, sin precio");
  ok(/taller de Lima, en unos 30 días/.test(await sec("Soldadura").locator(".cat-sec-nota").innerText()), "con su nota");
  const lim = await filas("Limpieza");
  ok(/^Rena Lite .*S\/ 90 la unidad$/.test(lim[0]) && /S\/ 35 por olla$/.test(lim[1]) && /S\/ 50 por pieza$/.test(lim[2]), "limpieza: Rena Lite 90, olla 35, grande 50 → " + lim.join(" | "));
  igual((await sec("Cocina de inducción").locator(".cat-sp-fila em").allInnerTexts()), ["Gratis", "Según diagnóstico", "Según diagnóstico", "Según diagnóstico", "Según diagnóstico"], "cocina: revisión gratis y cambios según diagnóstico");
  ok(/S\/ 140$/.test((await filas("Cocina de inducción"))[0]), "mantenimiento S/ 140");
  igual((await sec("Cocina de inducción").locator(".cat-modelo figcaption").allInnerTexts()).map((x) => x.replace(/\s+/g, " ").trim()),
    ["IC-450 La más reciente", "IC-350 Generación intermedia", "IC-400 Antes de la IC-350", "SW-3000 Modelo antiguo"], "cocina: las fotos de los cuatro modelos, con su nombre");
  await sec("Cocina de inducción").scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  const mods = await sec("Cocina de inducción").locator(".cat-modelo img").evaluateAll((xs) => xs.map((x) => { const r = x.getBoundingClientRect(); return { w: x.naturalWidth, x: Math.round(r.left), y: Math.round(r.top), a: Math.round(r.width) }; }));
  ok(mods.length === 4 && mods.every((m) => m.w === 400), "las cuatro fotos cargan");
  ok(mods[0].y === mods[1].y && mods[2].y === mods[3].y && mods[2].y > mods[0].y && mods[0].a >= 150, "en el celular van de dos en dos → " + JSON.stringify(mods));
  ok((await sec("Cocina de inducción").locator(".cat-modelos").evaluate((e) => e.getBoundingClientRect().top)) < (await sec("Cocina de inducción").locator(".fila").first().evaluate((e) => e.getBoundingClientRect().top)), "entre el título y el mantenimiento");
  igual(await sec("Cocina de inducción").locator(".fila .fila-img").count(), 0, "la fila de S/ 140 va sin foto: el precio es el mismo para los cuatro modelos");
  await sec("Cocina de inducción").locator(".fila").first().click(); await p.waitForTimeout(400);
  ok(/sv-coc-modelos\.webp$/.test(await p.locator(".modal-box .modal-img img").first().getAttribute("src")), "y su ficha muestra los cuatro modelos juntos");
  await s.cerrarFicha();
  await s.foto("servicios-cocinas");

  titulo("Pulido: una fila por pieza, un precio por serie");
  await s.filtro("Pulido");
  igual(await s.cuenta(".cat-sec"), 1, "el filtro deja solo Pulido");
  igual(await s.textos(".cat-sec-vars span"), ["Tradicional · Ollas con asas negras", "Zylstra · La serie nueva"], "explica las dos series");
  igual(await s.textos(".cat-blo-head h3"), ["Juego Chef I", "Juego Chef II", "Ollas grandes", "Sartenes", "Piezas complementarias"], "agrupado como el catálogo");
  igual(await s.cuenta(".fila.var"), 24, "24 piezas");
  igual(await s.cuenta(".var-btn:not(.no)"), 39, "24 precios en Tradicional y 15 en Zylstra");
  igual(await s.cuenta(".var-btn.no"), 9, "y 9 piezas que no se hacen en Zylstra");
  igual(await s.cuenta(".cat-blo-img"), 2, "los dos juegos llevan su foto una sola vez");
  /* Los dos precios caben en su tarjeta. Las filas sin foto (Juego Chef I y II) van en rejilla de ancho fijo:
     Safari mide un contenedor flex por el contenido de sus hijos y no por su flex-basis, y los recuadros se
     salían de la tarjeta y pisaban la de al lado (12/11/2026). */
  const cajas = await p.evaluate(() => Array.from(document.querySelectorAll(".fila.var")).map((f) => {
    const r = f.getBoundingClientRect(), v = f.querySelector(".fila-vars"), bs = Array.from(f.querySelectorAll(".var-btn")).map((b) => b.getBoundingClientRect());
    return { sinFoto: f.classList.contains("sin-foto"), rejilla: getComputedStyle(v).display === "grid", sale: Math.max(...bs.map((b) => b.right)) - r.right,
      hueco: v.getBoundingClientRect().width - (bs[bs.length - 1].right - bs[0].left) };
  }));
  igual(cajas.filter((c) => c.sinFoto).length, 7, "las 7 piezas de los juegos Chef van sin foto propia");
  ok(cajas.every((c) => c.sale <= 0), "ningún precio se sale de su tarjeta");
  ok(cajas.filter((c) => c.sinFoto).every((c) => c.rejilla && Math.abs(c.hueco) < 1), "sin foto: los dos precios van en rejilla de ancho fijo");
  const olla2 = p.locator(".fila.var", { hasText: "Olla 2 L" }).first();
  igual((await olla2.locator(".var-btn").allInnerTexts()).map((x) => x.replace(/\s+/g, " ")), ["TRADICIONAL S/ 140", "ZYLSTRA S/ 170"], "Olla 2 L: 140 y 170");
  const olla8 = p.locator(".fila.var", { hasText: "Olla 8 L" }).first();
  igual((await olla8.locator(".var-btn").allInnerTexts()).map((x) => x.replace(/\s+/g, " ")), ["TRADICIONAL S/ 200", "ZYLSTRA No se hace"], "Olla 8 L: solo Tradicional");
  ok(/Queen Cooker/.test(await olla8.innerText()), "con el nombre con que se le conoce");
  igual(await s.cuenta(".cat-sp-fila"), 0, "el «no se hace» ya está en cada fila, no se repite abajo");

  await olla2.locator(".var-btn", { hasText: "Zylstra" }).click(); await p.waitForTimeout(350);
  igual(await s.texto(".pcard-name"), "Pulido de olla 2 L", "la ficha dice qué es");
  igual(await s.texto(".pcard-eti"), "Pulido · Zylstra · Juego Chef I", "y de qué serie y juego");
  igual(await s.cuenta(".pcard-code"), 0, "un servicio no tiene código");
  igual(await s.texto(".price-big"), "S/ 170por pieza", "precio por pieza");
  ok(/^La serie nueva\. Precio por pieza, con o sin tapa/.test(await s.texto(".modal-info .info-banner")), "con la nota de la serie y del pulido");
  await s.pestana("Asesor");
  igual(await s.textos(".auto-ticket .tk-line, .auto-ticket .tk-total"), ["Precio al clienteS/ 170", "Tu gananciaS/ 25", "PRECIO ASESORS/ 145"], "precio de asesor del pulido");
  const cs = await s.cot((m) => m.chip === "Precio Asesor" && /Zylstra/.test(m.codigo));
  igual(cs && cs.codigo, "Pulido · Zylstra · por pieza", "la cotización dice serie y unidad");
  igual(cs && cs.bloques[0].filas.map((f) => f.t).concat(cs.bloques[0].total.t), ["Precio al cliente", "Tu ganancia", "Precio asesor"], "y los mismos rótulos");
  igual(cs && [cs.puntos, cs.bloques.length], [null, 1], "sin puntos y sin cuotas");
  await s.pestana("Cliente");
  const cc = await s.cot((m) => m.chip === "Precio Cliente" && /Zylstra/.test(m.codigo));
  igual(cc && cc.bloques[0].total, { t: "Precio al cliente", v: "S/ 170", nota: "por pieza" }, "para el cliente: el precio y su unidad");
  await p.locator(".share-quote-btn").click(); await p.waitForTimeout(700);
  igual(await s.cuenta(".cap-err"), 0, "compartir la cotización no da error");
  ok(/se guardó en tu equipo/.test(await s.texto(".cap-ok")), "y donde el navegador no comparte archivos, la imagen se descarga y lo dice → " + await s.texto(".cap-ok"));
  await s.cerrarFicha();

  titulo("Fichas de servicios");
  await s.filtro("Todas");
  const ficha = async (t) => { await s.fila(t).click(); await p.waitForTimeout(350); };
  await ficha("Soldar el perno");
  igual(await s.texto(".price-big"), "S/ 90por pieza", "soldadura al cliente");
  await s.pestana("Asesor");
  igual(await s.texto(".auto-ticket .tk-total"), "PRECIO ASESORS/ 65", "soldadura al asesor");
  await s.cerrarFicha();
  await ficha("Rena Lite");
  igual(await s.texto(".price-big"), "S/ 90la unidad", "Rena Lite por unidad");
  ok(/Abrillantador de acero inoxidable/.test(await s.texto(".pcard-det")), "con su descripción completa");
  await s.cerrarFicha();
  await ficha("Limpieza de olla");
  igual(await s.cuenta(".mode-tab"), 0, "un servicio sin precio de asesor no muestra la pestaña");
  igual(await s.texto(".price-big"), "S/ 35por olla", "solo el precio al cliente");
  await s.cerrarFicha();
  await ficha("Mantenimiento de cocina");
  await s.pestana("Asesor");
  igual(await s.textos(".auto-ticket .tk-line, .auto-ticket .tk-total"), ["Precio al clienteS/ 140", "Tu gananciaS/ 25", "PRECIO ASESORS/ 115"], "mantenimiento de cocina");
  ok(/La revisión es gratis y sin compromiso/.test(await s.texto(".modal-info .info-banner")), "con la nota del servicio técnico");
  await s.cerrarFicha();

  await p.locator(".search-bar input").fill("olla 4"); await p.waitForTimeout(250);
  igual((await s.textos(".fila")).map((t) => t.replace(/por pieza$/, "").trim()), ["Pulido · Tradicional · Juego Chef IPulido de olla 4 LS/ 150", "Pulido · Zylstra · Juego Chef IPulido de olla 4 LS/ 190"], "al buscar, cada serie sale con su precio");
  await p.locator(".search-clear").click();
  await s.fin("servicios");
}

/* ------------------------------------------------------------------ 5. parte alta: listas, barra pegada, saltos */
async function parteAlta() {
  titulo("Listas, barra pegada y saltos (celular)");
  const s = await sesion({ movil: true, cambiar: sinBono });
  const p = s.pagina;
  const b = await s.cajas(".lista-btn");
  ok(b[0].y === b[1].y && b[1].y === b[2].y && b[3].y === b[4].y && b[3].y > b[0].y, "cinco listas: tres arriba y dos abajo");
  ok(Math.abs(b[0].w - b[1].w) <= 1 && Math.abs(b[1].w - b[2].w) <= 1 && Math.abs(b[3].w - b[4].w) <= 1, "parejas, ninguna estirada sola");
  ok(Math.abs(b[2].der - b[4].der) <= 1 && b[0].x === b[3].x, "y alineadas a los dos bordes");
  await s.lista("Repuestos");
  const cab0 = (await s.cajas(".header"))[0], alta0 = (await s.cajas(".nav-top"))[0], medio0 = (await s.cajas(".nav-medio"))[0];
  const seVa = cab0.h + alta0.h + medio0.h;   // en el celular también se va la franja del título
  ok(medio0.h > 30 && medio0.y > (await s.cajas(".menu-fijo"))[0].y, "arriba, el aviso de la lista va entre el menú y el buscador");
  await p.evaluate(() => window.scrollTo(0, 1500)); await p.waitForTimeout(300);
  const menu = (await s.cajas(".menu-fijo"))[0], barra = (await s.cajas(".sticky-nav"))[0];
  igual(menu.y, 0, "al bajar, el menú de listas queda fijo arriba");
  igual(barra.y, menu.aba, "y pegados debajo, el buscador y los filtros");
  ok((await s.cajas(".lista-btn")).every((x) => x.y >= 0 && x.aba <= menu.aba), "con las cinco listas a la vista");
  ok((await s.cajas(".header"))[0].aba <= 0 && (await s.cajas(".nav-medio"))[0].aba <= menu.aba, "la franja del título y el aviso se van con la página");
  ok(barra.aba <= 206 && barra.h <= 90, "lo fijo ocupa poco, aun con el especial más visible y la letra más grande: " + barra.aba + " px de 844");
  igual(await s.cuenta(".header-lista"), 0, "ya no hace falta el botón de la lista en la cabecera");
  await s.filtro("Ollas a presión");
  igual(await s.scrollY(), seVa, "al cambiar de filtro el contenido arranca justo debajo de lo fijo");
  await p.evaluate(() => window.scrollTo(0, 1500)); await p.waitForTimeout(200);
  await s.lista("Servicios");
  const y2 = await s.scrollY(), barra2 = (await s.cajas(".sticky-nav"))[0], sec2 = (await s.cajas(".cat-sec-head"))[0];
  ok(y2 > 0 && y2 < 400 && sec2.y >= barra2.aba - 2 && sec2.y < barra2.aba + 40, "al cambiar de lista desde el menú fijo, la lista nueva arranca justo debajo → scroll " + y2 + ", título en " + sec2.y);
  await s.lista("Repuestos");
  await p.locator(".header-t").scrollIntoViewIfNeeded().catch(() => {});
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
  await p.locator(".search-bar input").fill("asa"); await p.waitForTimeout(300);
  const m2 = (await s.cajas(".menu-fijo"))[0];
  igual(m2.y, 0, "al escribir en el buscador, el menú sube arriba");
  igual((await s.cajas(".sticky-nav"))[0].y, m2.aba, "el buscador queda debajo y los resultados a la vista");
  ok((await s.cajas(".fila"))[0].y < 230, "con el primer resultado arriba");
  await p.locator(".search-clear").click();
  await s.fin("parte alta");

  titulo("Escritorio y puntaje extra");
  const d = await sesion({ viewport: { width: 1280, height: 860 }, reloj: "2026-11-13T10:00:00-05:00" });
  const q = d.pagina;
  const c = await d.cajas(".lista-btn");
  ok(c.every((x) => x.y === c[0].y) && c.every((x) => Math.abs(x.w - c[0].w) <= 1), "en escritorio las cinco listas van en una fila, iguales");
  ok(/\+15%/.test(await d.texto(".bonus-pill")), "en la primera semana del período se ve el +15%");
  await q.evaluate(() => window.scrollTo(0, 1200)); await q.waitForTimeout(300);
  const cabD = (await d.cajas(".header"))[0], menuD = (await d.cajas(".menu-fijo"))[0], barraD = (await d.cajas(".sticky-nav"))[0];
  ok(cabD.y === 0 && menuD.y === cabD.aba && barraD.y === menuD.aba, "en escritorio quedan fijos la cabecera, el menú y, debajo, el buscador con los filtros → " + [cabD.y, menuD.y, barraD.y].join("/"));
  await d.lista("Servicios");
  igual(await d.cuenta(".bonus-pill"), 0, "pero no en Servicios, que no da puntos");
  const f = await d.cajas(".cat-sec:first-child .filas .fila");
  ok(f.length === 2 && f[0].y === f[1].y, "en escritorio las filas van en columnas");
  await d.lista("Repuestos");
  igual(await d.cuenta(".bonus-pill"), 0, "ni en Repuestos");
  const eqD = (await d.cajas(".cat-sec-head.con-equipo .cat-eq-foto"))[0];
  ok(eqD.w >= 180 && eqD.h >= 110, "en escritorio la foto del equipo es más grande → " + eqD.w + " × " + eqD.h);
  await d.fin("escritorio");

  titulo("Menú con dos especiales en un celular chico (360 × 640)");
  const dos = (m) => { sinBono(m); m.listas.push(Object.assign({}, m.listas.find((l) => l.id === "compartir"), { id: "navidad-magica", nombre: "Especiales Navidad Mágica", vigente_hasta: "2026-12-23" })); };
  for (const completa of [true, false]) {
    const e = await sesion({ movil: true, viewport: { width: 360, height: 640 }, cambiar: (m) => { dos(m); m.completa = completa; } });
    const quien = completa ? "vista completa" : "asesor";
    igual(await e.textos(".lista-btn.esp .lista-esp"), ["Especial hasta 23 dic", "Especial hasta 11 nov"], quien + ": los dos especiales, el que dura más primero");
    const nav = await e.pagina.evaluate(() => { const b = document.querySelector(".lista-btn.lst-navidad-magica"), c = getComputedStyle(b), s = getComputedStyle(b.querySelector(".lista-esp b")), n = getComputedStyle(b, "::before");
      return { fondo: c.backgroundImage, letra: c.color, borde: c.borderTopColor, sello: s.backgroundColor, nieve: n.backgroundImage !== "none" }; });
    ok(/rgb\(27, 107, 69\)/.test(nav.fondo) && nav.letra === "rgb(255, 255, 255)" && nav.borde === "rgb(212, 167, 44)" && nav.sello === "rgb(200, 30, 30)" && nav.nieve, quien + ": Navidad Mágica va de Navidad: verde, borde dorado, sello rojo y copos de nieve → " + JSON.stringify(nav).slice(0, 140));
    const bs = await e.pagina.evaluate(() => Array.from(document.querySelectorAll(".lista-btn")).map((b) => { const n = b.querySelector(".lista-nom"), r = b.getBoundingClientRect(), i = b.querySelector(".lista-esp i");
      return { nombre: n.textContent, renglones: Math.round(n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight)), alto: Math.round(r.height), letra: parseFloat(getComputedStyle(n).fontSize), fecha: i ? parseFloat(getComputedStyle(i).fontSize) : 99, sale: n.scrollWidth > b.clientWidth }; }));
    ok(bs.every((b) => b.renglones === 1 && !b.sale), quien + ": cada nombre entra en un renglón → " + JSON.stringify(bs.filter((b) => b.renglones !== 1 || b.sale)));
    ok(bs.every((b) => b.alto <= 62 && b.letra >= 12.5 && b.fecha >= 12), quien + ": botones bajos y con letra legible → " + JSON.stringify(bs.map((b) => [b.alto, b.letra])));
    await e.lista("Repuestos");
    await e.pagina.evaluate(() => window.scrollTo(0, 1500)); await e.pagina.waitForTimeout(300);
    const fijo = (await e.cajas(".sticky-nav"))[0].aba;
    ok(fijo <= (completa ? 226 : 206), quien + ": lo fijo ocupa " + fijo + " px de 640 (antes, " + (completa ? 230 : 207) + ")");
    await e.foto("menu-dos-especiales-" + (completa ? "completa" : "asesor"));
    await e.fin("menú con dos especiales, " + quien);
  }
}

/* ------------------------------------------------------------------ 6. panel de administración */
async function admin() {
  titulo("Admin: precios de servicios y de repuestos");
  const s = await sesion({ viewport: { width: 900, height: 900 }, ruta: "/admin", sinSesion: true, cambiar: (m) => { sinBono(m); m.estadisticas = clonar(ESTADISTICAS); } });
  const p = s.pagina;
  await p.locator(".admin-login input").fill("mala"); await p.locator(".admin-login .admin-btn-main").click(); await p.waitForTimeout(250);
  ok(/Clave incorrecta/.test(await s.texto(".admin-login-err")), "con clave mala no entra");
  await p.locator(".admin-login input").fill(CLAVE_ADMIN); await p.locator(".admin-login .admin-btn-main").click();
  await p.waitForSelector(".admin-tabs"); await p.waitForTimeout(400);
  ok((await s.textos(".admin-catbtn")).includes("Servicios"), "Servicios aparece entre los filtros del panel");
  await p.locator(".admin-catbtn", { hasText: /^Servicios$/ }).click(); await p.waitForTimeout(250);
  igual(await s.cuenta(".admin-imgrow"), 45, "los 45 servicios con precio");
  ok((await s.textos(".admin-imgname")).some((t) => /Zylstra · Pulido de olla 2 L/.test(t)), "el pulido dice de qué serie es");
  const fila = p.locator(".admin-imgrow", { hasText: "Soldar el perno de la perilla" });
  const campos = fila.locator(".admin-repprecio input");
  igual([await campos.nth(0).inputValue(), await campos.nth(1).inputValue()], ["90", "65"], "trae el precio de cliente y el de asesor");
  await campos.nth(1).fill("99");
  await fila.locator(".admin-okbtn").click(); await p.waitForTimeout(250);
  ok(/no puede ser mayor/.test(await s.texto(".admin-body .info-banner.blue")), "no deja un asesor mayor que el cliente");
  igual((await s.rpc("cot_servicio_guardar")).length, 0, "y no llama a la base");
  await campos.nth(0).fill("95"); await campos.nth(1).fill("72");
  await fila.locator(".admin-okbtn").click(); await p.waitForTimeout(300);
  igual(await s.rpc("cot_servicio_guardar"), [{ p_token: "tok-admin", p_codigo: "sv-sol-perno", p_precio: 95, p_precio_asesor: 72 }], "guarda por la función, con la sesión de admin");
  ok(/Servicio actualizado: cliente S\/ 95, asesor S\/ 72/.test(await s.texto(".admin-body .info-banner.blue")), "y lo confirma");
  const lim = p.locator(".admin-imgrow", { hasText: "Limpieza de olla de 1 a 6 litros" });
  igual(await lim.locator(".admin-repprecio input").nth(1).inputValue(), "", "el que no tiene precio de asesor sale vacío");
  await lim.locator(".admin-repprecio input").nth(1).fill("25");
  await lim.locator(".admin-okbtn").click(); await p.waitForTimeout(300);
  igual((await s.rpc("cot_servicio_guardar"))[1], { p_token: "tok-admin", p_codigo: "sv-lim-olla", p_precio: 35, p_precio_asesor: 25 }, "y se le puede poner");

  await p.locator(".admin-catbtn", { hasText: /^Repuestos$/ }).click(); await p.waitForTimeout(250);
  igual(await s.cuenta(".admin-imgrow"), 73, "los 73 repuestos");
  const rep = p.locator(".admin-imgrow", { hasText: "Asa pequeña con protector de calor · soporte antiguo" }).first();
  ok(/Asesor S\/ 18/.test((await rep.innerText()).replace(/\s+/g, " ")), "el repuesto sigue mostrando su precio de asesor");
  const precio = rep.locator(".admin-repprecio input");
  await precio.fill("26"); await precio.blur(); await p.waitForTimeout(300);
  igual(await s.rpc("set_precio_repuesto_tok"), [{ p_token: "tok-admin", p_codigo: "30104", p_precio: 26 }], "y su precio de cliente se cambia como antes");
  await s.foto("admin-servicios");

  titulo("Admin: Estadísticas (todo lo que se sabe del uso, sin Nelson si se quiere)");
  await p.locator(".admin-tab", { hasText: "Estadísticas" }).click(); await p.waitForTimeout(700);
  igual(await s.rpc("admin_estadisticas"), [{ p_token: "tok-admin", p_op: { dias: 7, internos: false } }], "pide los últimos 7 días, sin las cuentas internas, con la sesión de admin");
  igual(await s.textos(".est-filtros:not(.chico) .sim-chip.on"), ["7 días", "✓ Sin mí"], "arriba, una sola fila de filtros: el período y «Sin mí»");
  ok(/^Sin contar: Nelson\./.test(await s.texto(".admin-body > .est-nota")), "y dice a quién deja fuera");
  igual(await s.texto(".est-resumen p"), "9 personas usaron el portal los últimos 7 días: el 2,1 % del equipo (420 personas con DNI). 5 entraron por primera vez.", "el resumen: cuántas lo usan y qué parte del equipo es");
  igual(await s.textos(".est-cifra strong"), ["9", "14", "263", "88", "10", "4", "7", "5"], "las cifras del período");
  igual(await s.textos(".est-cifra > span:not(.est-delta)"), ["Personas", "Sesiones de uso", "Minutos de uso", "Fichas abiertas", "Cotizaciones enviadas", "Videos enviados", "Búsquedas", "Videos vistos"], "con nombres claros");
  igual((await s.textos(".est-cifra .est-delta")).slice(0, 7), ["▲ 5 más", "▲ 8 más", "▲ 183 más", "▲ 58 más", "▲ 8 más", "igual", "▼ 2 menos"], "y cuánto cambió contra el período anterior");
  const alertas = await s.textos(".est-alerta");
  ok(alertas.length === 2 && /^⚠ Rosa Quispe MamaniAlta/.test(alertas[0]) && /dos celulares a la vez/.test(alertas[0]) && /^⚠ Carmen Huaman de la CruzRevisar/.test(alertas[1]), "las posibles cuentas compartidas, primero la más clara, con sus motivos → " + alertas.map((x) => x.slice(0, 60)).join(" | "));
  igual([await s.cuenta(".est-graf"), await s.cuenta(".est-graf:nth-of-type(1) .est-col, .est-sec .est-graf .est-col") > 0, await s.cuenta(".est-celda")], [3, true, 168], "gráficos: uso por día, por hora, y el mapa de día y hora (7 × 24)");
  const graf = p.locator(".est-graf").first();
  igual(await graf.locator("path.est-col").count(), 7, "una columna por día");
  await graf.locator(".est-lienzo rect").nth(6).hover(); await p.waitForTimeout(150);
  ok(/viernes, 20 de noviembre/.test(await graf.locator(".est-tip").innerText()) && /9 personas \(5 nuevas\)/.test(await graf.locator(".est-tip").innerText()), "al pasar el mouse (o tocar) una columna, su detalle → " + (await graf.locator(".est-tip").innerText()).replace(/\n/g, " | "));
  await graf.locator(".est-ver").click(); await p.waitForTimeout(150);
  igual(await graf.locator(".est-tabla tbody tr").count(), 7, "y cada gráfico tiene sus números en una tabla");
  await p.locator(".est-filtros.chico .sim-chip", { hasText: "Minutos" }).click(); await p.waitForTimeout(150);
  igual(await graf.locator("text.est-val").textContent(), "126", "se puede ver por minutos (y por sesiones, fichas o envíos)");
  const pers = await s.textos(".est-persona .est-p-nom");
  igual(pers, ["Rosa Quispe Mamani⚠ ¿Cuenta compartida?", "Carmen Huaman de la Cruz⚠ Revisar", "Lucia Flores Ccama", "Sin nombre", "NelsonInterna"], "una tarjeta por persona, primero las que hay que revisar; los nombres como se escriben");
  await p.locator(".est-p-cab").first().click(); await p.waitForTimeout(150);
  const det = await s.texto(".est-p-det");
  ok(/Celular · iPhone · Safari · 390×844/.test(det) && /Lima · America Movil Peru/.test(det) && /Registrada en Arequipa/.test(det), "al tocarla: sus equipos, desde dónde entró y dónde está registrada → " + det.slice(0, 160));
  await p.locator(".est-p-det .est-boton").click(); await p.waitForTimeout(400);
  igual(await s.rpc("admin_interno"), [{ p_token: "tok-admin", p_llave: "912345678", p_interno: true }], "una cuenta se puede marcar como interna (la de prueba, la propia) y ya no cuenta con «Sin mí»");
  igual((await s.rpc("admin_estadisticas")).length, 2, "y el panel se vuelve a cargar");
  const csv = await Promise.all([p.waitForEvent("download"), p.locator(".est-boton", { hasText: "Descargar" }).click()]);
  const texto = fs.readFileSync(await csv[0].path(), "utf8");
  ok(csv[0].suggestedFilename() === "estadisticas-portal-7d.csv" && /"Rosa Quispe Mamani";"Arequipa"/.test(texto) && texto.split("\r\n").length === 6, "las personas se descargan para Excel → " + csv[0].suggestedFilename());
  const noSalio = await s.textos(".est-nosalio");
  ok(noSalio.length === 2 && /^Carmen Huaman de la Cruz video de Juego Gourmet serie Zylstra6 intentos: cerró la ficha antes de que esté listo ×2, pidió otro toque, canceló ×3 · 9,3 MB · hasta 59 s esperando · Celular · Android · Chrome · 360×806/.test(noSalio[0]),
    "«Lo que no salió»: quién intentó enviar qué, y qué pasó en cada intento → " + noSalio[0]);
  await s.foto("admin-estadisticas", true);
  await p.locator(".est-sinmi").click(); await p.waitForTimeout(400);
  igual((await s.rpc("admin_estadisticas")).pop(), { p_token: "tok-admin", p_op: { dias: 7, internos: true } }, "«Sin mí» se puede quitar para contar todas las cuentas");
  ok(/^Contando todas las cuentas/.test(await s.texto(".admin-body > .est-nota")), "y lo dice");
  await p.locator(".est-filtros .sim-chip", { hasText: "Hoy" }).click(); await p.waitForTimeout(300);
  await p.locator(".est-filtros .sim-chip", { hasText: "Todo" }).click(); await p.waitForTimeout(300);
  igual((await s.rpc("admin_estadisticas")).slice(-2).map((x) => x.p_op.dias), [1, 0], "«Hoy» pide el día y «Todo», desde el primer registro");
  await s.fin("admin");
}

/* ------------------------------------------------------------------ 1b. lo que ve un asesor */
async function vistaAsesor() {
  titulo("Lo que ve un asesor");
  const s = await sesion({ movil: true, sinSesion: true, cambiar: sinBono });
  const p = s.pagina;
  ok(await s.cuenta(".login-lado h2") === 1 && await s.cuenta(".login-rot") === 1, "la pantalla de ingreso trae su título y el rótulo del campo");
  const caja = (await s.cajas(".login-box"))[0], boton = (await s.cajas(".login-btn"))[0];
  ok(boton.aba <= 844 && caja.x === 0 && caja.der === 390, "en el celular el botón Entrar queda a la vista sin bajar → " + JSON.stringify(boton));
  await p.locator(".login-input").fill("45678912");
  await p.locator(".login-btn").click();
  await p.waitForSelector(".lista-btn");
  await p.waitForTimeout(300);
  igual(await s.textos(".lista-btn .lista-nom"), ["Lista General", "Compartir", "Repuestos", "Servicios"], "Lista General, los especiales, Repuestos y Servicios; sin Tienda en Línea");
  ok(await s.cuenta(".accion-btn") === 0, "sin Simulador de puntos ni Buscador maestro");
  ok(/\bon\b/.test(await p.locator(".lista-btn", { hasText: "Lista General" }).getAttribute("class")), "entra en la Lista General");
  await s.lista("Compartir");
  ok(/\besp\b.*\bon\b/.test(await p.locator(".lista-btn", { hasText: "Compartir" }).getAttribute("class")) && await s.cuenta(".tile") > 0, "abre el especial y muestra sus fichas");
  await s.lista("Repuestos");
  ok(await s.cuenta(".accion-btn") === 0 && await s.cuenta(".fila") > 0, "Repuestos se ve igual, sin los botones de la vista completa");
  await s.fin("asesor que entra con su DNI");
  const b = await sesion({ movil: true, cambiar: (m) => { sinBono(m); m.completa = false; } });
  igual(await b.textos(".lista-btn .lista-nom"), ["Lista General", "Compartir", "Repuestos", "Servicios"], "y ve lo mismo al volver con la sesión guardada");
  ok(await b.cuenta(".accion-btn") === 0, "sin los botones de la vista completa");
  const c4 = await b.cajas(".lista-btn");
  ok(c4[0].y === c4[1].y && c4[2].y === c4[3].y && c4[2].y > c4[0].y && c4[0].h === c4[1].h, "cuatro listas: dos y dos, parejas en cada fila");
  await b.pagina.locator(".header-cuenta").click(); await b.pagina.waitForTimeout(200);
  ok(/Nelson/.test(await b.texto(".cuenta-menu")) && await b.cuenta(".cuenta-salir") === 1, "el botón de la sesión dice quién entró y deja cerrarla");
  const cm = (await b.cajas(".cuenta-menu"))[0];
  ok(cm.x >= 0 && cm.der <= 390, "el menú de la sesión cabe en el celular → " + JSON.stringify(cm));
  await b.pagina.locator(".cuenta-salir").click(); await b.pagina.waitForTimeout(300);
  ok(await b.cuenta(".login-box") === 1 && await b.cuenta(".lista-btn") === 0, "al cerrar sesión vuelve a pedir el DNI");
  ok(!(await b.pagina.evaluate(() => localStorage.getItem("rw_sesion_v1"))), "y este equipo ya no recuerda la sesión");
  await b.pagina.locator(".login-input").fill("45678912"); await b.pagina.locator(".login-btn").click(); await b.pagina.waitForSelector(".lista-btn");
  ok(await b.cuenta(".lista-btn") === 4, "y se puede volver a entrar");
  await b.fin("asesor con sesión guardada");
}

/* ------------------------------------------------------------------ 7. si faltan las tablas nuevas, el portal sigue */
async function respaldo() {
  titulo("Si la base no trae lo nuevo");
  const a = await sesion({ movil: true, cambiar: (m) => { sinBono(m); delete m.servicios; delete m.grupos; } });
  igual(await a.textos(".lista-btn .lista-nom"), ["Tienda en Línea", "Lista General", "Compartir", "Repuestos"], "sin cot_servicios no hay pestaña Servicios");
  await a.lista("Repuestos");
  ok(await a.cuenta(".tile") === 73 && await a.cuenta(".fila") === 0, "y sin cot_grupos Repuestos se ve en fichas, como antes");
  const b4 = await a.cajas(".lista-btn");
  ok(b4[0].y === b4[1].y && b4[2].y === b4[3].y && b4[2].y > b4[0].y && Math.abs(b4[0].w - b4[3].w) <= 1, "cuatro listas: dos y dos");
  await a.fin("sin tablas nuevas");
  const b = await sesion({ movil: true, cambiar: (m) => { sinBono(m); delete m.grupos; } });
  await b.lista("Servicios");
  igual(await b.textos(".cat-sec-tit h2"), ["Soldadura", "Limpieza", "Pulido", "Cocina de inducción"], "Servicios se arma igual solo con sus categorías");
  igual(await b.cuenta(".fila.var"), 24, "con el pulido en sus dos series");
  await b.fin("sin grupos");
}

/* ------------------------------------------------------------------ 9. tutorial (recorrido guiado) */
async function pasoTour(s, antes) {
  const p = s.pagina;
  await p.waitForFunction((n) => { const c = document.querySelector(".tour-card.listo"), a = document.querySelector(".tour-avance span"); return !!(c && a && a.textContent !== n); }, antes || "", { timeout: 9000 });
  await p.waitForTimeout(450);   // que terminen de moverse el foco y la tarjeta
  return p.evaluate(() => {
    const caja = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), der: Math.round(r.right), aba: Math.round(r.bottom) }; };
    const q = (x) => document.querySelector(x);
    return { n: q(".tour-avance span").textContent, titulo: q(".tour-tit").textContent, texto: q(".tour-txt").textContent,
      foco: caja(q(".tour-foco")), carta: caja(q(".tour-card")), botones: Array.from(document.querySelectorAll(".tour-botones button")).map((b) => b.textContent),
      vw: innerWidth, vh: innerHeight };
  });
}
const dentroDe = (a, b, tol) => !!(a && b) && a.x >= b.x - tol && a.y >= b.y - tol && a.der <= b.der + tol && a.aba <= b.aba + tol;
const noSeTapan = (a, b) => a.aba <= b.y + 1 || b.aba <= a.y + 1 || a.der <= b.x + 1 || b.der <= a.x + 1;
const enPantalla = (c, t) => c.x >= 0 && c.y >= 0 && c.der <= t.vw && c.aba <= t.vh;
async function tutorial() {
  titulo("Tutorial: solo con su botón (celular)");
  const s = await sesion({ movil: true, cambiar: sinBono });
  const p = s.pagina;
  await p.waitForTimeout(1400);
  igual(await s.cuenta(".tour"), 0, "ya no arranca solo, ni la primera vez que se entra");
  igual(await s.textos(".nav-top .tour-ver"), ["Ver tutorial"], "queda su botón, a la vista arriba");
  await p.locator(".nav-top .tour-ver").click();
  const sig = async (t) => { await p.locator(".tour-sig").click(); return pasoTour(s, t.n); };
  const revisar = async (t, sel, msg) => {
    const c = (await s.cajas(sel))[0];
    ok(dentroDe(c, t.foco, 3), t.titulo + ": " + msg + " → foco " + JSON.stringify(t.foco) + ", parte " + JSON.stringify(c));
    ok(noSeTapan(t.foco, t.carta), t.titulo + ": la tarjeta no tapa lo que explica");
    ok(enPantalla(t.carta, t), t.titulo + ": la tarjeta entra entera en la pantalla");
  };
  let t = await pasoTour(s, "");
  igual([t.titulo, t.n], ["Elige la lista", "1 de 17"], "al tocarlo empieza por el menú de listas, sin saludo");
  igual(t.botones, ["Saltar tutorial", "Siguiente"], "y se puede saltar desde el inicio");
  await revisar(t, ".lista-switch", "resalta el menú de listas");
  ok(/ESPECIAL/.test(t.texto) && /hasta qué día/.test(t.texto), "explica que las que dicen ESPECIAL son promociones");
  await s.foto("tutorial-1-listas");
  t = await sig(t);
  await revisar(t, ".search-bar", "resalta el buscador");
  igual(t.botones, ["Saltar", "Atrás", "Siguiente"], "con Saltar, Atrás y Siguiente");
  t = await sig(t);
  const nombre = await p.evaluate(() => { const f = document.querySelector(".tour-foco").getBoundingClientRect(); const el = Array.from(document.querySelectorAll(".tile")).find((x) => { const r = x.getBoundingClientRect(); return r.top >= f.top - 3 && r.bottom <= f.bottom + 3 && r.left >= f.left - 3 && r.right <= f.right + 3; }); return el ? el.querySelector(".tile-name").textContent : ""; });
  ok(t.titulo === "Abre un producto" && !!nombre, "resalta un producto de la lista → " + nombre);
  ok(noSeTapan(t.foco, t.carta) && enPantalla(t.carta, t), "Abre un producto: la tarjeta no lo tapa");
  await s.foto("tutorial-3-producto");
  t = await sig(t);
  igual(await s.texto(".modal-box .pcard-name"), nombre, "abre la ficha de ese mismo producto");
  await revisar(t, ".modal-box .play-overlay", "muestra el botón del video");
  ok(dentroDe((await s.cajas(".modal-box .vid-wa"))[0], t.foco, 3), "y el de enviarlo por WhatsApp");
  await s.foto("tutorial-4-video");
  t = await sig(t);
  await revisar(t, ".modal-box .price-block", "resalta el precio al contado");
  igual(await s.texto(".modal-box .mode-tab.on"), "Precio Cliente", "en Precio Cliente");
  t = await sig(t);
  await revisar(t, ".modal-box .points-note", "resalta los puntos");
  ok(dentroDe((await s.cajas(".modal-box .gan"))[0], t.foco, 3), "y cuánto gana");
  ok(/precio de cliente/.test(t.texto) && /puntos/.test(t.texto), "explica los puntos en el precio de cliente → " + t.texto);
  t = await sig(t);
  await revisar(t, ".modal-box .installments-grid", "resalta las cuotas");
  igual(await s.texto(".modal-box .tab-btn.on"), "Crédito", "con Crédito tocado");
  await p.locator(".tour-atras").click(); t = await pasoTour(s, t.n);
  igual(t.titulo, "Los puntos de la venta", "Atrás vuelve al paso anterior");
  t = await sig(t);
  igual(t.titulo, "Mira las cuotas", "y Siguiente vuelve a avanzar");
  t = await sig(t);
  await revisar(t, ".modal-box .cbox.editable", "resalta la inicial");
  const m = /con (S\/\s?[\d,.]+) de inicial, la cuota de (\d+) meses baja de (S\/\s?[\d,.]+) a (S\/\s?[\d,.]+)/.exec(t.texto);
  ok(!!m && num(m[4]) < num(m[3]), "sube la inicial y muestra cuánto baja la cuota → " + t.texto);
  ok(/toca OK/.test(t.texto), "y dice cómo confirmarla: con OK");
  if (m) {
    igual(num(await p.locator(".modal-box .cbox.editable input").inputValue()), num(m[1]), "la inicial de la ficha es la que dice la tarjeta");
    const cuota = await p.evaluate((meses) => { const b = Array.from(document.querySelectorAll(".modal-box .inst-btn")).find((x) => x.querySelector(".inst-m").textContent === meses + " meses"); return b ? b.querySelector(".inst-v").textContent : ""; }, m[2]);
    igual(num(cuota), num(m[4]), "y la cuota nueva es la que se ve en la ficha");
  }
  await s.foto("tutorial-8-inicial");
  t = await sig(t);
  await revisar(t, ".modal-box .auto-ticket", "resalta el precio de autocompra");
  igual(await s.texto(".modal-box .mode-tab.on"), "Precio Autocompra", "con Precio Autocompra tocado");
  ok(/para ti o para uno de tus afiliados/.test(t.texto), "dice que la autocompra es para ti o para un afiliado");
  await s.foto("tutorial-9-autocompra");
  t = await sig(t);
  igual(t.titulo, "Puntos y Empiece Ya", "después, los puntos de la autocompra");
  await revisar(t, ".modal-box .incentives", "resalta los puntos y la meta del Empiece Ya");
  ok(dentroDe((await s.cajas(".modal-box .inc-level"))[0], t.foco, 3) && /Empiece Ya/.test(t.texto) && /afiliados/.test(t.texto), "explica el Empiece Ya: puntos y afiliados que faltan → " + t.texto);
  igual(await s.texto(".modal-box .mode-tab.on"), "Precio Autocompra", "sigue en Precio Autocompra");
  await s.foto("tutorial-10-empiece-ya");
  t = await sig(t);
  await revisar(t, ".modal-box .quote-actions", "resalta Compartir cotización");
  ok(/WhatsApp/.test(t.texto) && /todas las cuotas/.test(t.texto) && !/Copiar/.test(t.texto), "explica que la imagen lleva lo que se está viendo: el contado, o el crédito con todas las cuotas → " + t.texto);
  ok(t.carta.aba <= t.foco.y, "la tarjeta va encima del botón, que está abajo");
  t = await sig(t);
  igual(t.titulo, "Las promociones", "luego pasa por una promoción");
  ok(await s.cuenta(".modal-box") === 0 && /Compartir/.test(await s.texto(".lista-btn.on.esp")), "con la lista especial vigente abierta");
  const promo = await p.evaluate(() => { const f = document.querySelector(".tour-foco").getBoundingClientRect(); const el = Array.from(document.querySelectorAll(".tile")).find((x) => { const r = x.getBoundingClientRect(); return r.top >= f.top - 3 && r.bottom <= f.bottom + 3 && r.left >= f.left - 3 && r.right <= f.right + 3; }); return el ? el.querySelector(".tile-name").textContent : ""; });
  ok(!!promo && /Compartir/.test(t.texto) && noSeTapan(t.foco, t.carta) && enPantalla(t.carta, t), "resalta un especial y nombra la lista → " + promo + " · " + t.texto);
  t = await sig(t);
  igual(await s.texto(".modal-box .pcard-name"), promo, "abre ese especial");
  await revisar(t, ".modal-box .gift-row", "resalta el regalo");
  ok(dentroDe((await s.cajas(".modal-box .price-block"))[0], t.foco, 3) && /regalo/.test(t.texto) && /en cuotas/.test(t.texto), "y el precio, que se cotiza igual → " + t.texto);
  await s.foto("tutorial-13-promocion");
  t = await sig(t);
  igual([t.titulo, await s.texto(".lista-btn.on .lista-nom"), await s.cuenta(".modal-box")], ["Repuestos", "Repuestos", 0], "después explica Repuestos, en su lista");
  await revisar(t, '[data-tour="repuesto"]', "resalta una pieza");
  const pieza = await s.texto('[data-tour="repuesto"] .fila-tit');
  ok(!!pieza && await s.cuenta('[data-tour="repuesto"] .fila-ext') === 0, "una pieza propia de Repuestos → " + pieza);
  t = await sig(t);
  igual([await s.texto(".modal-box .pcard-name"), await s.texto(".modal-box .mode-tab.on")], [pieza, "Precio Asesor"], "abre esa pieza en Precio Asesor");
  await revisar(t, ".modal-box .auto-ticket", "resalta el precio de asesor y la ganancia");
  await s.foto("tutorial-15-repuesto");
  t = await sig(t);
  igual([t.titulo, await s.texto(".lista-btn.on .lista-nom"), await s.cuenta(".modal-box")], ["Servicios", "Servicios", 0], "y al final Servicios");
  await revisar(t, '[data-tour="servicio"]', "resalta un servicio");
  ok(dentroDe((await s.cajas(".cat-sec-head"))[0], t.foco, 3) && /soldadura, limpieza, pulido y cocina de inducción/.test(t.texto), "con su sección, y nombra los servicios → " + t.texto);
  await s.foto("tutorial-16-servicios");
  t = await sig(t);
  igual([await s.cuenta(".modal-box"), await s.texto(".lista-btn.on .lista-nom")], [0, "Lista General"], "al final cierra todo y vuelve a la Lista General");
  await revisar(t, ".tour-ver", "y señala «Ver tutorial»");
  igual([t.n, t.botones], ["17 de 17", ["Atrás", "Terminar"]], "son 17 pasos y el último se cierra con Terminar");
  await s.foto("tutorial-11-listo");
  await p.locator(".tour-sig").click(); await p.waitForTimeout(300);
  igual(await s.cuenta(".tour"), 0, "Terminar cierra el tutorial");
  const evs = await s.eventos();
  igual(evs.filter((x) => x.tipo === "tutorial").map((x) => x.accion), ["inicio", "fin"], "queda registrado que lo vio entero");
  igual([evs.filter((x) => x.tipo === "ver_lista").length, evs.filter((x) => x.tipo === "ver_producto").length], [1, 0], "lo que abre el tutorial no cuenta como uso (solo la lista del inicio)");
  await p.reload(); await p.waitForSelector(".lista-btn"); await p.waitForTimeout(1500);
  igual(await s.cuenta(".tour"), 0, "al volver a entrar tampoco sale solo");
  await p.locator(".nav-top .tour-ver").click();
  t = await pasoTour(s, "");
  igual(t.titulo, "Elige la lista", "y se puede ver otra vez desde el inicio");
  await p.locator(".tour-saltar").click(); await p.waitForTimeout(300);
  igual(await s.cuenta(".tour"), 0, "Saltar lo cierra en cualquier paso");
  await p.locator(".header-cuenta").click(); await p.waitForTimeout(150);
  await p.locator(".cuenta-tour").click();
  t = await pasoTour(s, "");
  ok(t.titulo === "Elige la lista" && await s.cuenta(".cuenta-menu") === 0, "también se abre desde el menú de la cuenta");
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  igual(await s.cuenta(".tour"), 0, "y Esc lo cierra");
  await s.fin("tutorial en el celular");

  titulo("Tutorial en un celular chico (360 × 640)");
  const c = await sesion({ movil: true, viewport: { width: 360, height: 640 }, cambiar: sinBono });
  await c.pagina.locator(".nav-top .tour-ver").click();
  let v = await pasoTour(c, "");
  const malos = [];
  for (let k = 0; k < 20; k++) {
    if (!enPantalla(v.carta, v)) malos.push(v.titulo + " (se sale)");
    if (v.foco && !noSeTapan(v.foco, v.carta)) malos.push(v.titulo + " (tapa)");
    if (v.botones.indexOf("Terminar") >= 0) break;
    await c.pagina.locator(".tour-sig").click(); v = await pasoTour(c, v.n);
  }
  igual(malos, [], "en todos los pasos la tarjeta entra y no tapa lo que explica");
  await c.pagina.locator(".tour-sig").click(); await c.pagina.waitForTimeout(300);
  await c.fin("tutorial en celular chico");

  titulo("Tutorial en escritorio");
  const d = await sesion({ viewport: { width: 1280, height: 860 }, cambiar: sinBono });
  const q = d.pagina;
  await q.waitForTimeout(1200);
  igual(await d.cuenta(".tour"), 0, "tampoco arranca solo");
  await q.locator(".tour-ver").first().click();
  let u = await pasoTour(d, "");
  ok(enPantalla(u.carta, u) && u.titulo === "Elige la lista", "se abre con «Ver tutorial»");
  for (let k = 0; k < 3; k++) { await q.locator(".tour-sig").click(); u = await pasoTour(d, u.n); }
  igual(u.titulo, "Muestra el video", "llega al video");
  const modal = (await d.cajas(".modal-box"))[0];
  ok(u.carta.x >= modal.der || u.carta.der <= modal.x, "en escritorio la tarjeta va al costado de la ficha, sin taparla");
  await d.foto("tutorial-escritorio-video");
  await q.locator(".tour-saltar").click(); await q.waitForTimeout(300);
  igual([await d.cuenta(".tour"), await d.cuenta(".modal-box")], [0, 0], "Saltar cierra el tutorial y la ficha");
  await d.fin("tutorial en escritorio");
}

/* ------------------------------------------------------------------ 10. compartir video y cotización */
async function compartir() {
  const UA = {
    iPhone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    Android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
  };
  for (const [quien, ua] of Object.entries(UA)) {
    titulo("Compartir el video y la cotización (" + quien + ")");
    const s = await sesion({ movil: true, ua, cambiar: sinBono });
    const p = s.pagina;
    // la hoja de compartir del teléfono, de mentira: anota lo que la página le pasa
    await p.evaluate(() => {
      window.__compartido = [];
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => { window.__compartido.push({ archivos: (d.files || []).map((f) => f.name), texto: d.text || null, titulo: d.title || null }); } });
    });
    await p.locator(".tile .tile-btn").first().click(); await p.waitForTimeout(500);
    await p.locator(".modal-box .vid-wa").click(); await p.waitForTimeout(700);
    await p.locator(".modal-box .share-quote-btn").click(); await p.waitForTimeout(900);
    const c = await p.evaluate(() => window.__compartido);
    igual(c.map((x) => x.archivos.length), [1, 1], quien + ": el video y la cotización salen como un archivo cada uno");
    ok(/\.mp4$/.test((c[0] || { archivos: [""] }).archivos[0]) && /^cotizacion-.*\.png$/.test((c[1] || { archivos: [""] }).archivos[0]), quien + ": el video .mp4 y la cotización .png → " + JSON.stringify(c.map((x) => x.archivos)));
    if (quien === "iPhone") igual(c.map((x) => [x.texto, x.titulo]), [[null, null], [null, null]], "iPhone: solo el archivo, sin texto (WhatsApp lo mandaba dos veces)");
    else ok(/^Mira este producto: /.test(c[0] && c[0].texto) && /^Cotizacion - /.test(c[1] && c[1].texto), "Android: el texto va como leyenda → " + JSON.stringify(c.map((x) => x.texto)));
    await s.fin("compartir en " + quien);
  }
}

/* ------------------------------------------------------------------ 11. la inicial: una sola para contado y crédito, y cómo se confirma */
const FACT = Object.fromEntries(DATOS.factores.map((f) => [f.meses, f.factor]));
const cuotaDe = (saldo, meses) => Math.round(saldo * FACT[meses]) + 20;
const soles = (n) => "S/ " + Number(n).toLocaleString("en-US");
async function inicial() {
  titulo("La inicial: se cambia, se confirma con OK y vale para contado y crédito");
  const s = await sesion({ movil: true, cambiar: (m) => {
    sinBono(m);
    const g = m.productos.filter((x) => x.lista_id === "general" && x.activo).sort((a, b) => a.orden - b.orden);
    g[1].precio = 1167; g[2].precio = 1166;   // justo en el límite: con 10 % de inicial, el saldo a financiar queda en 1,050 y en 1,049
    g[1].precio_asesor = 1043.3; g[2].precio_asesor = 1042.4;
    m.__lim = [g[1].codigo, g[2].codigo];
  } });
  const p = s.pagina;
  const campo = () => p.locator(".modal-box .cbox.editable input");
  const valor = async () => num(await campo().inputValue());
  const abrir = async (i) => { await p.locator(".tile .tile-btn").nth(i).click(); await p.waitForTimeout(450); };
  const credito = async () => { await p.locator(".modal-box .tab-btn", { hasText: "Crédito" }).click(); await p.waitForTimeout(250); };
  const contado = async () => { await p.locator(".modal-box .tab-btn", { hasText: "Contado" }).click(); await p.waitForTimeout(250); };
  const escribir = async (n) => { await campo().click(); await p.waitForTimeout(260); await p.keyboard.type(String(n)); await p.waitForTimeout(150); };
  const cuotas = () => p.evaluate(() => Array.from(document.querySelectorAll(".modal-box .inst-btn")).map((b) => [parseInt(b.querySelector(".inst-m").textContent, 10), Number(b.querySelector(".inst-v").textContent.replace(/[^0-9.]/g, ""))]));

  await abrir(0);
  igual(await valor(), 963, "la ficha abre con la inicial mínima: 10 % de S/ 9,629");
  await s.pestana("Autocompra");
  igual(await valor(), 963, "en autocompra la inicial es la misma: el 10 % del precio de cliente (no se recalcula con el precio de autocompra)");
  await credito();
  ok(/^Inicial mínima: S\/ 963 /.test(await s.texto(".modal-box .mini-hint")), "y ese es también el mínimo que anuncia la ficha → " + await s.texto(".modal-box .mini-hint"));
  await escribir(900); await p.keyboard.press("Enter"); await p.waitForTimeout(250);
  igual(await valor(), 963, "no deja bajarla de ahí (S/ 900 sería más del 10 % del precio de autocompra, pero no del de cliente)");
  ok(/menor al 10% del precio de cliente/.test(await s.texto(".modal-box .alert-toast")), "y dice por qué → " + await s.texto(".modal-box .alert-toast"));
  await contado();
  await s.pestana("Cliente");
  igual([await valor(), await s.cuenta(".modal-box .alert-toast")], [963, 0], "y al volver a Precio Cliente sigue igual, sin avisos");
  igual(await s.texto(".modal-box .cbox-ayuda"), "Toca el monto para cambiarlo", "debajo dice que la inicial se puede cambiar");
  igual(await s.cuenta(".modal-box .cbox-ok"), 0, "sin botón OK mientras no se toca");
  await campo().click(); await p.waitForTimeout(260);
  igual([await s.cuenta(".modal-box .cbox-ayuda"), await s.textos(".modal-box .cbox-ok")], [0, ["OK"]], "al tocar el monto, en ese lugar aparece el botón OK");
  ok(/editando/.test(await p.locator(".modal-box .cbox.editable").getAttribute("class")), "y el recuadro se resalta");
  await p.keyboard.type("2000"); await p.waitForTimeout(200);
  igual(await valor(), 2000, "lo que se escribe reemplaza al monto anterior (queda elegido al tocarlo): 2000, no 9632000");
  igual(await s.texto(".modal-box .tab-content .cbox:not(.editable) .cbox-value"), "S/ 7,629", "el saldo cambia mientras se escribe, sin esperar al OK");
  const medirOk = (pg) => pg.evaluate(() => { const i = document.querySelector(".modal-box .cbox.editable input"), b = document.querySelector(".modal-box .cbox-ok").getBoundingClientRect(), r = i.getBoundingClientRect(), k = document.querySelector(".modal-box .cbox.editable").getBoundingClientRect();
    return { entero: i.scrollWidth <= i.clientWidth + 1, debajo: b.top >= r.bottom - 1, alLado: b.left >= r.right - 1 && b.top < r.bottom, ancho: Math.round(b.width), alto: Math.round(b.height), caja: Math.round(k.width) }; });
  const okC = await medirOk(p);
  ok(okC.debajo && okC.ancho >= okC.caja - 30 && okC.alto >= 36 && okC.entero, "en Contado el OK va debajo del monto, a todo el ancho del recuadro, y el número se ve entero → " + JSON.stringify(okC));
  await p.locator(".modal-box .cbox-ok").click(); await p.waitForTimeout(250);
  igual([await s.cuenta(".modal-box .cbox-ok"), await valor(), await s.cuenta(".modal-box .alert-toast")], [0, 2000, 0], "OK confirma: queda S/ 2,000, sin avisos");
  await credito();
  igual(await valor(), 2000, "al pasar a Crédito se mantiene la inicial que se puso en Contado");
  igual(await cuotas(), [3, 6, 9, 12, 15, 18].map((m) => [m, cuotaDe(7629, m)]), "y las cuotas salen con esa inicial");
  await escribir(3000);
  const okK = await medirOk(p);
  igual(await s.texto(".modal-box .cbox-ayuda"), "Escribe el monto y toca OK", "en Crédito, mientras se escribe, dice cómo confirmar");
  ok(okK.alLado && okK.ancho >= 44 && okK.alto >= 34 && okK.entero, "con el OK al costado del monto, grande para el dedo → " + JSON.stringify(okK));
  await p.keyboard.press("Enter"); await p.waitForTimeout(250);
  igual([await valor(), await s.cuenta(".modal-box .cbox-ok")], [3000, 0], "en Crédito también se cambia, y Intro (o «Listo» en el teclado) confirma igual que OK");
  await contado();
  igual([await valor(), await s.texto(".modal-box .tab-content .cbox:not(.editable) .cbox-value")], [3000, "S/ 6,629"], "y al volver a Contado sigue la misma inicial");
  await escribir(9000); await p.locator(".modal-box .cbox-ok").click(); await p.waitForTimeout(250);
  await credito();
  igual(await valor(), 8579, "si la inicial de contado deja menos de S/ 1,050 por financiar, en Crédito baja al tope: 9,629 − 1,050");
  ok(/hasta S\/ 8,579/.test(await s.texto(".modal-box .alert-toast")) && /saldo mínimo a financiar es S\/ 1,050/.test(await s.texto(".modal-box .alert-toast")), "y explica por qué → " + await s.texto(".modal-box .alert-toast"));
  igual((await cuotas()).map((c) => c[0]), [3, 6, 9], "con S/ 1,050 por financiar quedan las cuotas de S/ 150 o más");
  await s.pestana("Autocompra");
  igual(await s.cuenta(".modal-box .alert-toast"), 0, "al cambiar a autocompra el aviso anterior se va");
  igual(await valor(), 7556, "y la inicial que ya se cambió se respeta también ahí, hasta su tope (8,606 − 1,050)");
  await s.cerrarFicha();
  await abrir(0);
  igual(await valor(), 963, "al cerrar la ficha y volver a abrirla, la inicial regresa al 10 %");
  await credito();
  igual(await valor(), 963, "también en Crédito");
  await escribir(""); await p.keyboard.press("Backspace"); await p.locator(".modal-box .cbox-ok").click(); await p.waitForTimeout(250);
  igual(await valor(), 963, "si se borra el monto, vuelve al mínimo");
  ok(/mínimo del 10%/.test(await s.texto(".modal-box .alert-toast")), "y lo avisa → " + await s.texto(".modal-box .alert-toast"));
  await s.foto("inicial-credito");
  await s.cerrarFicha();

  titulo("Crédito: el saldo mínimo a financiar es S/ 1,050");
  await abrir(1);
  igual(await s.texto(".modal-box .price-big"), "S/ 1,167", "un producto de S/ 1,167");
  ok(!(await p.locator(".modal-box .tab-btn", { hasText: "Crédito" }).isDisabled()), "con 10 % de inicial quedan S/ 1,050 por financiar: sí tiene crédito");
  await credito();
  igual([await valor(), await cuotas()], [117, [3, 6, 9].map((m) => [m, cuotaDe(1050, m)])], "con sus cuotas sobre S/ 1,050");
  await contado();
  igual(await s.cuenta(".modal-box .sin-credito"), 0, "sin el aviso de solo contado");
  await s.pestana("Autocompra");
  const auto = num(await s.texto(".modal-box .auto-ticket .tk-total"));
  ok(auto < 1167 && await p.locator(".modal-box .tab-btn", { hasText: "Crédito" }).isDisabled(), "en autocompra el precio baja a " + soles(auto) + " y el saldo ya no llega: sin crédito");
  ok(/Solo al contado: para dar crédito, el saldo a financiar debe ser de S\/ 1,050 o más/.test(await s.texto(".modal-box .sin-credito")), "y la ficha dice por qué → " + await s.texto(".modal-box .sin-credito"));
  await s.cerrarFicha();
  await abrir(2);
  igual(await s.texto(".modal-box .price-big"), "S/ 1,166", "uno de S/ 1,166");
  ok(await p.locator(".modal-box .tab-btn", { hasText: "Crédito" }).isDisabled() && await s.cuenta(".modal-box .sin-credito") === 1, "quedan S/ 1,049 por financiar: solo al contado, y lo dice");
  const cq = await s.cot((m) => /1,166/.test(JSON.stringify(m)));
  igual(cq && cq.bloques.map((b) => b.tipo), ["contado"], "y su cotización sale solo con el contado");
  await s.cerrarFicha();
  await s.fin("inicial y crédito");

  titulo("La inicial en un celular chico (360 px)");
  const c = await sesion({ movil: true, viewport: { width: 360, height: 640 }, cambiar: sinBono });
  await c.pagina.locator(".tile .tile-btn").first().click(); await c.pagina.waitForTimeout(450);
  await c.pagina.locator(".modal-box .cbox.editable input").click(); await c.pagina.waitForTimeout(260);
  await c.pagina.keyboard.type("9500"); await c.pagina.waitForTimeout(200);
  const ch = await medirOk(c.pagina);
  ok(ch.entero && ch.debajo && ch.ancho >= ch.caja - 30, "al escribir, el monto se ve entero y el OK queda debajo → " + JSON.stringify(ch));
  await c.pagina.evaluate(() => { document.querySelector(".modal-box .cbox.editable input").style.width = "24px"; });
  ok(!(await medirOk(c.pagina)).entero, "(la prueba sí nota cuando el número no cabe)");
  await c.pagina.evaluate(() => { document.querySelector(".modal-box .cbox.editable input").style.width = ""; });
  await c.foto("inicial-360-editando");
  await c.pagina.locator(".modal-box .cbox-ok").click(); await c.pagina.waitForTimeout(250);
  await c.pagina.locator(".modal-box .mode-tab", { hasText: "Autocompra" }).click(); await c.pagina.waitForTimeout(250);
  await c.pagina.locator(".modal-box .tab-btn", { hasText: "Crédito" }).click(); await c.pagina.waitForTimeout(300);
  const ah = await c.pagina.evaluate(() => { const f = document.querySelector(".modal-box .cm-row.ahorro"), v = f.querySelector(".cm-save"), o = document.querySelector(".modal-box .inst-orig"), n = document.querySelector(".modal-box .inst-v"), t = document.querySelector(".modal-box .cm-row.hl");
    const px = (e) => parseFloat(getComputedStyle(e).fontSize);
    return { texto: f.textContent.replace(/\s+/g, " "), fondo: getComputedStyle(f).backgroundColor, ahorro: px(v), total: px(t), antes: px(o), tachada: getComputedStyle(o).textDecorationLine, cuota: px(n), orden: o.getBoundingClientRect().top < n.getBoundingClientRect().top }; });
  ok(/^Total ahorro- S\/ [\d,]+$/.test(ah.texto) && ah.fondo === "rgb(236, 253, 245)" && ah.ahorro >= 15.4 && ah.total >= 15.4, "en autocompra el ahorro va resaltado en verde y, como el total, con la letra 10 % más grande → " + JSON.stringify(ah));
  ok(ah.tachada === "line-through" && ah.orden && ah.antes >= 13.5 && ah.cuota >= 17, "y en cada plazo, la cuota del cliente tachada encima de la tuya, más grande");
  await c.foto("autocompra-360-ahorro");
  await c.fin("inicial en celular chico");
}

/* ------------------------------------------------------------------ 12. la cotización: lo que se está viendo, en una imagen grande y siempre del mismo tamaño */
/* La hoja de compartir del teléfono, de mentira: anota el archivo que recibe, su tamaño y cuánta «tinta» hay en la zona de la foto */
const hojaDeCompartir = (pagina) => pagina.evaluate(() => {
  window.__compartido = []; window.__falla = [];
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => {
    const f = window.__falla.shift();
    if (f) { const e = new Error(f); e.name = f; throw e; }
    const a = (d.files || [])[0], b = a ? await createImageBitmap(a) : null;
    let tinta = 0, verde = 0, rojo = 0, borde = [], rojoBorde = 0;
    if (b) {
      const c = document.createElement("canvas"); c.width = b.width; c.height = b.height;
      const g = c.getContext("2d"); g.drawImage(b, 0, 0);
      const px = g.getImageData(0, 150, c.width, 250).data;
      let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] < 235 || px[i + 1] < 235 || px[i + 2] < 235) n++;
      tinta = Math.round(n / (px.length / 4) * 1000) / 1000;
      // cuánto verde oscuro y cuánto rojo hay en la imagen (las franjas de la foto de un especial de Navidad) y el color del borde izquierdo de la zona de la foto
      const t = g.getImageData(0, 0, c.width, c.height).data;
      let v = 0, r = 0;
      for (let i = 0; i < t.length; i += 4) { if (t[i + 1] > t[i] + 15 && t[i + 1] > t[i + 2] && t[i] < 90 && t[i + 1] < 130) v++; else if (t[i] > 130 && t[i + 1] < 80 && t[i + 2] < 90) r++; }
      verde = Math.round(v / (t.length / 4) * 1000) / 1000; rojo = Math.round(r / (t.length / 4) * 1000) / 1000;
      borde = Array.from(g.getImageData(6, 300, 1, 1).data).slice(0, 3);
      const col = g.getImageData(4, 0, 1, c.height).data;   // el borde izquierdo de la imagen, de arriba abajo: ¿llega ahí la franja roja del regalo?
      let rb = 0; for (let i = 0; i < col.length; i += 4) if (col[i] > 130 && col[i + 1] < 80 && col[i + 2] < 90) rb++;
      rojoBorde = Math.round(rb / c.height * 1000) / 1000;
    }
    window.__compartido.push({ nombre: a ? a.name : "", tipo: a ? a.type : "", bytes: a ? a.size : 0, ancho: b ? b.width : 0, alto: b ? b.height : 0, cuantos: (d.files || []).length, tinta, verde, rojo, borde, rojoBorde });
  } });
});
async function cotizacion() {
  titulo("Cotización: lleva lo que se está viendo (contado o crédito)");
  const s = await sesion({ movil: true, cambiar: sinBono });
  const p = s.pagina;
  await hojaDeCompartir(p);
  const pestana = async (t) => { await p.locator(".modal-box .tab-btn", { hasText: t }).click(); await p.waitForTimeout(250); };
  const compartir = async () => { await p.locator(".modal-box .share-quote-btn").click(); await p.waitForTimeout(700); return p.evaluate(() => window.__compartido); };
  const esContado = (x) => x.bloques.length === 1 && x.bloques[0].tipo === "contado";
  const esCredito = (x) => x.bloques.length === 1 && x.bloques[0].tipo === "credito";
  await p.locator(".tile .tile-btn").first().click(); await p.waitForTimeout(450);
  const todas = [3, 6, 9, 12, 15, 18];
  let m = await s.cot((x) => x.chip === "Precio Cliente" && esContado(x));
  igual(m && [m.nombre, m.codigo, m.auto, m.promo], ["Juego Gourmet serie Zylstra", "Cod. 000158 - N° 1", false, false], "dice el producto y su código");
  igual(m && m.asesor, { nombre: "Nelson", celular: "987 654 321" }, "y quién atiende: su nombre y su celular, como están en la base");
  ok(m && !("ahorro" in m), "sin ahorro, que es de la autocompra");
  igual(m && m.bloques.map((b) => b.titulo), ["Al contado"], "con Contado tocado lleva solo el contado");
  igual(m && [m.bloques[0].total, m.bloques[0].pie], [{ t: "Precio contado", v: "S/ 9,629" }, [{ t: "Inicial", v: "S/ 963" }, { t: "Saldo contra entrega", v: "S/ 8,666" }]], "con el precio, la inicial y el saldo contra entrega");
  await pestana("Crédito");
  m = await s.cot(esCredito);
  igual(m && m.bloques.map((b) => b.titulo), ["Al crédito"], "con Crédito tocado lleva solo el crédito");
  igual(m && [m.bloques[0].nota, m.bloques[0].filas, m.bloques[0].cuotas], ["De 3 a 18 meses", [{ t: "Inicial", v: "S/ 963" }], todas.map((n) => ({ t: n + " cuotas de", v: soles(cuotaDe(8666, n)), antes: "" }))], "con la inicial y todos los plazos disponibles, de 3 a 18 meses");
  igual(await s.cuenta(".modal-box .qc-card") + await s.cuenta(".qc-holder"), 0, "la imagen se dibuja al momento: ya no hay una tarjeta escondida en la página");
  await p.locator(".modal-box .cbox.editable input").click(); await p.waitForTimeout(260);
  await p.keyboard.type("2000"); await p.locator(".modal-box .cbox-ok").click();
  m = await s.cot((x) => esCredito(x) && x.bloques[0].filas[0].v === "S/ 2,000");
  igual(m && m.bloques[0].cuotas.map((c) => c.v), todas.map((n) => soles(cuotaDe(7629, n))), "si cambia la inicial, cambian las cuotas de la cotización");
  await pestana("Contado");
  m = await s.cot((x) => esContado(x) && x.bloques[0].pie.length === 2 && x.bloques[0].pie[0].v === "S/ 2,000");
  igual(m && m.bloques[0].pie.map((f) => f.v), ["S/ 2,000", "S/ 7,629"], "y el contado sale con esa misma inicial y su saldo");

  titulo("Compartir la cotización");
  igual(await s.textos(".modal-box .quote-actions button"), ["Compartir cotización"], "abajo de la ficha, un solo botón: Compartir cotización");
  let c = await compartir();
  igual(c.map((x) => [x.cuantos, x.nombre, x.tipo, x.ancho, x.alto]), [[1, "cotizacion-000158-cliente-contado-ini2000.png", "image/png", 1080, 1350]], "manda una sola imagen PNG de 1080 × 1350: el formato vertical que WhatsApp muestra entero");
  igual(await s.cuenta(".modal-box .cap-err") + await s.cuenta(".modal-box .cap-ok"), 0, "sin avisos cuando sale bien");
  await pestana("Crédito"); await s.cot(esCredito);
  c = await compartir();
  igual(c.slice(1).map((x) => [x.nombre, x.ancho, x.alto]), [["cotizacion-000158-cliente-credito-ini2000.png", 1080, 1350]], "la de crédito sale aparte, con su nombre y del mismo tamaño");
  // el celular a veces se niega a compartir si pasó mucho rato desde el toque: la imagen queda lista y se envía con otro toque
  await p.evaluate(() => { window.__falla = ["NotAllowedError"]; });
  await p.locator(".modal-box .share-quote-btn").click(); await p.waitForTimeout(600);
  igual([await s.texto(".modal-box .share-quote-btn"), await s.texto(".modal-box .cap-ok"), await s.cuenta(".modal-box .cap-err")], ["Imagen lista: toca para enviar", "La imagen ya está lista. Toca otra vez para enviarla.", 0], "si el celular no deja compartir en ese toque, no da error: pide otro toque");
  ok(/lista/.test(await p.locator(".modal-box .share-quote-btn").getAttribute("class")), "con el botón en verde");
  c = await compartir();
  igual([c.length, c[2] && c[2].nombre, await s.texto(".modal-box .share-quote-btn"), await s.cuenta(".modal-box .cap-ok")], [3, "cotizacion-000158-cliente-credito-ini2000.png", "Compartir cotización", 0], "y con el segundo toque sale");
  await p.evaluate(() => { window.__falla = ["DataError"]; });
  await p.locator(".modal-box .share-quote-btn").click(); await p.waitForTimeout(600);
  igual(await s.texto(".modal-box .cap-err"), "Tu celular no dejó compartir la imagen. Inténtalo de nuevo.", "si de verdad falla, lo dice claro");
  await p.evaluate(() => { window.__falla = ["AbortError"]; });
  await p.locator(".modal-box .share-quote-btn").click(); await p.waitForTimeout(600);
  igual(await s.cuenta(".modal-box .cap-err") + await s.cuenta(".modal-box .cap-ok"), 0, "si la asesora cierra las opciones de compartir, no es un error");
  const evCot = await s.eventos("cotizacion");
  ok(evCot.filter((e) => e.fase === "abre").every((e) => e.envio && evCot.some((f) => f.fase !== "abre" && f.envio === e.envio)), "cada vez que se abre compartir queda anotado, y su resultado lleva el mismo número de envío");
  igual(evCot.filter((e) => e.fase !== "abre").map((e) => [e.via, e.resultado, e.codigo, e.modo]), [["compartir", "ok", "000158", "cliente"], ["compartir", "ok", "000158", "cliente"], ["compartir", "otro_toque", "000158", "cliente"], ["compartir", "ok", "000158", "cliente"], ["compartir", "error", "000158", "cliente"], ["compartir", "cancelado", "000158", "cliente"]], "cada intento queda en el registro de uso, con su resultado");
  await s.foto("cotizacion-pie");

  titulo("Cotización de autocompra");
  await s.pestana("Autocompra");
  await pestana("Contado");
  const tuPrecio = num(await s.texto(".modal-box .auto-ticket .tk-total"));
  ok(tuPrecio > 5000 && tuPrecio < 9629, "en la ficha, tu precio de autocompra → " + tuPrecio);
  m = await s.cot((x) => x.auto && esContado(x));
  igual(m && [m.chip, m.bloques.map((b) => b.titulo)], ["Precio Autocompra", ["Al contado"]], "al contado, sola");
  igual(m && [m.bloques[0].filas.map((f) => f.t), m.bloques[0].filas[0].v, m.bloques[0].filas[1].v, m.bloques[0].total], [["Precio contado", "Menos tu descuento"], "S/ 9,629", "- " + soles(9629 - tuPrecio), { t: "Tu precio (contado)", v: soles(tuPrecio) }], "con el precio, tu descuento y tu precio");
  igual(m && m.bloques[0].pie, [{ t: "Tu inicial", v: "S/ 2,000" }, { t: "Tu saldo contra entrega", v: soles(tuPrecio - 2000) }], "tu inicial y tu saldo");
  ok(m && !("puntos" in m), "sin los puntos ni el premio del Empiece Ya: ese sitio es para la foto del producto");
  await pestana("Crédito");
  m = await s.cot((x) => x.auto && esCredito(x));
  igual(m && [m.bloques[0].filas, m.bloques[0].cuotas], [[{ t: "Tu inicial", v: "S/ 2,000" }], todas.map((n) => ({ t: n + " cuotas de", v: soles(cuotaDe(tuPrecio - 2000, n)), antes: soles(cuotaDe(7629, n)) }))], "al crédito: tu inicial y, en cada plazo, la cuota del cliente (tachada) y la tuya");
  igual(m && m.ahorro, { t: "Ahorro en 18 cuotas", v: soles((cuotaDe(7629, 18) - cuotaDe(tuPrecio - 2000, 18)) * 18) }, "y abajo, el ahorro por ser autocompra en el plazo elegido (el mismo «Total ahorro» de la ficha)");
  igual(num(await s.texto(".modal-box .cm-row.ahorro .cm-save")), m ? num(m.ahorro.v) : -1, "que es el que muestra la ficha");
  await p.locator(".modal-box .inst-btn", { hasText: "12 meses" }).click();
  m = await s.cot((x) => x.auto && esCredito(x) && x.ahorro && /12 cuotas/.test(x.ahorro.t));
  igual(m && m.ahorro, { t: "Ahorro en 12 cuotas", v: soles((cuotaDe(7629, 12) - cuotaDe(tuPrecio - 2000, 12)) * 12) }, "si se toca otro plazo, el ahorro es el de ese plazo");
  c = await compartir();
  igual([c[c.length - 1].nombre, c[c.length - 1].ancho, c[c.length - 1].alto], ["cotizacion-000158-autocompra-credito-ini2000.png", 1080, 1350], "sale con su nombre y del mismo tamaño");
  await s.cerrarFicha();

  titulo("Un especial, un producto sin crédito y un repuesto: todas del mismo tamaño");
  await s.lista("Compartir");
  await p.locator(".tile .tile-btn").first().click(); await p.waitForTimeout(450);
  const conPromo = await s.cuenta(".modal-box .price-reg") > 0;
  m = await s.cot((x) => x.chip === "Precio Cliente" && !/000158/.test(x.codigo) && esContado(x));
  igual(m && m.bloques[0].filas.map((f) => f.t), conPromo ? ["Precio regular", "Descuento"] : [], conPromo ? "el especial al contado, con su precio regular tachado y el descuento" : "el especial al contado, sin precio regular porque no lo tiene");
  ok(m && m.promo === true && !("regalo" in m), "marcado como especial (va más apretado, para darle sitio a la foto); el regalo no va escrito: va la franja de su foto");
  await pestana("Crédito");
  m = await s.cot((x) => !/000158/.test(x.codigo) && esCredito(x));
  ok(m && m.bloques[0].cuotas.length >= 3 && m.bloques[0].cuotas.every((q) => /^S\/ [\d,]+$/.test(q.v)), "y al crédito, con sus cuotas → " + JSON.stringify(m && m.bloques[0].cuotas.map((q) => q.t + " " + q.v)));
  c = await compartir();
  await s.cerrarFicha();
  await s.lista("Lista General");
  await p.locator(".search-bar input").fill("000096"); await p.waitForTimeout(300);
  await p.locator(".tile .tile-btn").first().click(); await p.waitForTimeout(450);
  const precio = num(await s.texto(".modal-box .price-big"));
  m = await s.cot((x) => /000096/.test(x.codigo));
  ok(precio < 500 && m && esContado(m) && m.bloques[0].pie.length === 0 && m.bloques[0].total.v === soles(precio), "un producto de menos de S/ 500 se paga completo: solo el precio al contado → " + JSON.stringify(m && m.bloques[0].total));
  c = await compartir();
  await s.cerrarFicha();
  await p.locator(".search-clear").click(); await p.waitForTimeout(200);
  await s.lista("Repuestos");
  await s.fila("Cód. 30104").click(); await p.waitForTimeout(450);
  await s.cot((x) => /30104/.test(x.codigo));
  c = await compartir();
  await s.pestana("Asesor"); await s.cot((x) => /30104/.test(x.codigo) && x.chip === "Precio Asesor");
  c = await compartir();
  igual(c.slice(-4).map((x) => x.nombre.replace(/-ini\d+/, "")), [c[c.length - 4].nombre.replace(/-ini\d+/, ""), "cotizacion-000096-cliente-contado.png", "cotizacion-30104-cliente.png", "cotizacion-30104-asesor.png"], "cada una con su nombre");
  ok(/^cotizacion-\d+-cliente-credito\.png$/.test(c[c.length - 4].nombre.replace(/-ini\d+/, "")), "la del especial dice que es de crédito → " + c[c.length - 4].nombre);
  igual(Array.from(new Set(c.map((x) => x.ancho + " × " + x.alto))), ["1080 × 1350"], "todas las cotizaciones miden lo mismo: lista general, especial, sin crédito, repuesto, cliente o autocompra");
  igual(c[0].tinta, 0, "(en esta prueba los productos no tienen foto: la zona de la foto queda en blanco)");
  await s.cerrarFicha();
  await s.fin("cotización");

  titulo("La cotización lleva la foto del producto");
  const dirFotos = fs.mkdtempSync(path.join(require("os").tmpdir(), "rw-fotos-"));
  fs.copyFileSync(path.join(RAIZ, "promociones", "eq-olla-presion-8l.webp"), path.join(dirFotos, "000158.webp"));
  const f = await sesion({ movil: true, fotos: [dirFotos], cambiar: sinBono });
  await hojaDeCompartir(f.pagina);
  await f.pagina.locator(".tile .tile-btn").first().click(); await f.pagina.waitForTimeout(1300);
  await f.pagina.locator(".modal-box .share-quote-btn").click(); await f.pagina.waitForTimeout(700);
  const cf = await f.pagina.evaluate(() => window.__compartido);
  ok(cf.length === 1 && cf[0].ancho === 1080 && cf[0].alto === 1350 && cf[0].tinta > 0.05, "con la foto arriba, grande, y del mismo tamaño → " + JSON.stringify(cf[0]));
  await f.fin("cotización con foto");

  titulo("Quién atiende, en la cotización");
  const qa = await sesion({ movil: true, quien: { nombre: "MARIA JESUS FERNANDEZ-DAVILA SAN ROMAN DE LLERENA", celular: "45678912" }, cambiar: sinBono });
  await qa.pagina.locator(".tile .tile-btn").first().click(); await qa.pagina.waitForTimeout(450);
  igual((await qa.cot((x) => /000158/.test(x.codigo)) || {}).asesor, { nombre: "Maria Jesus Fernandez-Davila San Roman de Llerena", celular: "" }, "el nombre va como se escribe, no en mayúsculas; y si la persona no tiene celular en la base (su llave es el DNI), no sale ningún número");
  ok(JSON.stringify(await qa.pagina.evaluate(() => window.__cotizacion)).indexOf("45678912") < 0, "el DNI no aparece en ninguna parte de la cotización");
  await qa.fin("quién atiende, sin celular");
  const qb = await sesion({ movil: true, quien: { nombre: "", celular: "912345678" }, cambiar: sinBono });
  await qb.pagina.locator(".tile .tile-btn").first().click(); await qb.pagina.waitForTimeout(450);
  igual((await qb.cot((x) => /000158/.test(x.codigo)) || {}).asesor, { nombre: "", celular: "912 345 678" }, "si no se sabe el nombre, va solo el celular");
  await qb.fin("quién atiende, sin nombre");

  titulo("La foto de un especial: los productos grandes y la franja del regalo de lado a lado");
  /* La foto de un especial de Navidad trae arriba una franja verde (su número y el descuento) y abajo una roja (el regalo).
     En la cotización la de arriba se quita (el número va en el nombre), los productos se recortan al ras y van lo más
     grandes posible sobre su mismo fondo, y la franja del regalo va debajo a todo el ancho. Sin la franja verde queda el
     verde oscuro de los rótulos y las verduras (menos del 1 % de la imagen); con ella, aun con la foto chica, era el 2.6 %. */
  fs.copyFileSync(path.join(RAIZ, "promociones", "385800.webp"), path.join(dirFotos, "382000.webp"));
  const e = await sesion({ movil: true, fotos: [dirFotos], cambiar: (m) => { sinBono(m); m.config.imagenes["382000"] = "https://kiexpdaaoegbtesqmaff.supabase.co/storage/v1/object/public/imagenes/382000-1.webp"; } });
  await hojaDeCompartir(e.pagina);
  await e.lista("Compartir");
  await e.pagina.locator(".tile .tile-btn").first().click(); await e.pagina.waitForTimeout(1300);
  await e.cot((x) => /382000/.test(x.codigo));
  await e.pagina.locator(".modal-box .share-quote-btn").click(); await e.pagina.waitForTimeout(700);
  const ce = await e.pagina.evaluate(() => window.__compartido);
  ok(ce.length === 1 && ce[0].verde < 0.012, "se va la franja verde de arriba → " + JSON.stringify(ce[0]));
  ok(ce[0] && ce[0].rojo > 0.05 && ce[0].rojoBorde > 0.08, "la franja roja del regalo se queda, como imagen y de borde a borde");
  ok(ce[0] && ce[0].borde.every((v) => v > 215) && ce[0].borde.some((v) => v < 250) && ce[0].tinta > 0.08, "y el fondo de la foto llega de lado a lado, con los productos grandes → borde " + JSON.stringify(ce[0] && ce[0].borde) + ", tinta " + (ce[0] && ce[0].tinta));
  await e.fin("foto de un especial");
  fs.rmSync(dirFotos, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ 13. el video: preparación, envío, segundo toque y respaldo por enlace */
async function video() {
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
  const preparar = async (o, adjunta) => {
    const s = await sesion(Object.assign({ movil: true, ua: ANDROID, cambiar: sinBono }, o || {}));
    await s.pagina.evaluate((adj) => {
      window.__compartido = []; window.__abiertos = []; window.__falla = [];
      window.open = (u) => { window.__abiertos.push(String(u)); return null; };
      if (!adj) return;
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => {
        const f = window.__falla.shift();
        if (f) { const e = new Error(f); e.name = f; throw e; }
        window.__compartido.push({ archivos: (d.files || []).map((x) => x.name), bytes: (d.files || []).reduce((t, x) => t + x.size, 0) });
      } });
    }, adjunta !== false);
    await s.pagina.locator(".tile .tile-btn").first().click(); await s.pagina.waitForTimeout(500);
    return s;
  };
  const boton = ".modal-box .vid-wa";

  titulo("Enviar el video: se prepara una vez y queda guardado");
  let s = await preparar({ video: { bytes: 300000 } });
  let p = s.pagina;
  igual(await s.texto(boton), "Enviar video", "el botón dice Enviar video");
  await p.waitForTimeout(1900);
  igual(s.registro.videos.length, 0, "con datos del celular no baja nada hasta que la asesora lo pide");
  await p.locator(boton).click(); await p.waitForTimeout(700);
  igual([await p.evaluate(() => window.__compartido.map((x) => [x.archivos.length, x.bytes])), s.registro.videos.length], [[[1, 300000]], 1], "al tocar, baja el video y abre las opciones de compartir con el archivo");
  await p.locator(boton).click(); await p.waitForTimeout(500);
  igual([await p.evaluate(() => window.__compartido.length), s.registro.videos.length], [2, 1], "al enviarlo otra vez ya no lo vuelve a bajar");
  await s.cerrarFicha();
  await p.reload(); await p.waitForSelector(".lista-btn"); await p.waitForTimeout(400);
  await p.evaluate(() => { window.__compartido = []; Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true }); Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => { window.__compartido.push((d.files || []).map((x) => x.size)); } }); });
  await p.locator(".tile .tile-btn").first().click(); await p.waitForTimeout(500);
  await p.locator(boton).click(); await p.waitForTimeout(600);
  igual([await p.evaluate(() => window.__compartido), s.registro.videos.length], [[[300000]], 1], "ni siquiera al volver a entrar al portal: queda guardado en el celular");
  const ev = (await s.eventos("video")).slice(-2);   // los de esta visita (antes de volver a entrar ya se mandó dos veces)
  igual(ev.map((e) => [e.accion, e.fase || e.resultado, e.origen, e.mb]), [["enviar", "abre", undefined, undefined], ["enviar", "ok", "guardado", 0.3]].map((x) => JSON.parse(JSON.stringify(x))), "y queda anotado en el registro de uso: que se abrió WhatsApp y lo que pasó, con de dónde salió y cuánto pesa");
  ok(ev.length === 2 && ev[0].envio && ev[0].envio === ev[1].envio, "los dos con el mismo número de envío");
  await s.fin("video guardado");

  titulo("Video que demora: avance, enlace de respaldo y segundo toque");
  s = await preparar({ video: { bytes: 500000, demora: 1200 } });
  p = s.pagina;
  await p.evaluate(() => { window.__falla = ["NotAllowedError"]; });
  await p.locator(boton).click(); await p.waitForTimeout(350);
  ok(/^Preparando/.test(await s.texto(boton)) && await p.locator(boton).isDisabled(), "mientras baja, el botón dice Preparando → " + await s.texto(boton));
  ok(/^Preparando el video/.test(await s.texto(".modal-box .vid-estado")) && await s.cuenta(".modal-box .vid-barra") === 1, "con un aviso y su barra de avance");
  igual(await s.texto(".modal-box .vid-enlace"), "¿Demora? Enviar solo el enlace", "y la salida rápida: mandar el enlace");
  await s.foto("video-preparando");
  await p.waitForTimeout(1600);
  igual([await s.texto(boton), await s.texto(".modal-box .vid-estado"), await p.evaluate(() => window.__compartido.length)], ["Video listo: enviar", "El video ya está listo. Toca «Enviar» otra vez.", 0], "si demoró tanto que el celular ya no deja compartir, no manda solo el texto: avisa que está listo");
  ok(/listo/.test(await p.locator(boton).getAttribute("class")) && !(await p.locator(boton).isDisabled()), "con el botón resaltado");
  await s.foto("video-listo");
  await p.locator(boton).click(); await p.waitForTimeout(500);
  igual([await p.evaluate(() => window.__compartido.map((x) => x.bytes)), await s.texto(boton), await s.cuenta(".modal-box .vid-estado"), s.registro.videos.length], [[500000], "Enviar video", 0, 1], "y con el segundo toque sale el video, sin volver a bajarlo");
  const vv = await s.eventos("video");
  igual(vv.map((e) => e.fase || e.resultado), ["abre", "otro_toque", "abre", "ok"], "los dos toques quedan registrados, cada uno con su intento");
  ok(vv.length === 4 && vv[0].envio === vv[1].envio && vv[2].envio === vv[3].envio && vv[0].envio !== vv[2].envio, "y cada toque es un envío distinto");
  igual(await p.evaluate(() => window.__abiertos), [], "nunca se abrió WhatsApp con solo el texto");
  await s.fin("video lento");

  titulo("Video que no se puede bajar o celular que no adjunta");
  s = await preparar({ video: { falla: true } });
  p = s.pagina;
  await p.locator(boton).click(); await p.waitForTimeout(600);
  igual([await s.texto(".modal-box .vid-estado span"), await s.texto(".modal-box .vid-enlace")], ["No se pudo preparar el video. Revisa tu conexión.", "Enviar el enlace por WhatsApp"], "si la bajada falla, lo dice y ofrece mandar el enlace");
  await p.locator(".modal-box .vid-enlace").click(); await p.waitForTimeout(200);
  const ab = await p.evaluate(() => window.__abiertos);
  ok(ab.length === 1 && /^https:\/\/wa\.me\/\?text=Mira%20este%20producto/.test(ab[0]) && /videos%2F/.test(ab[0]), "el enlace abre WhatsApp con el texto y la dirección del video → " + (ab[0] || "").slice(0, 90));
  igual((await s.eventos("video")).map((e) => [e.resultado, e.paso || ""]), [["error", "bajar"], ["enlace_fallo", ""]], "la falla queda registrada para verla en Estadísticas, y también el enlace que se mandó en su lugar");
  await s.fin("video que falla");
  s = await preparar({}, false);
  p = s.pagina;
  await p.locator(boton).click(); await p.waitForTimeout(400);
  const ab2 = await p.evaluate(() => window.__abiertos);
  ok(ab2.length === 1 && /^https:\/\/wa\.me\/\?text=/.test(ab2[0]) && s.registro.videos.length === 0, "en un navegador que no adjunta archivos, va directo el enlace por WhatsApp, sin bajar nada");
  igual((await s.eventos("video")).map((e) => e.resultado), ["enlace_sin_adjuntar"], "y queda anotado que salió el enlace");
  ok(/se envía el enlace/.test(await s.texto(".modal-box .vid-estado")), "y lo explica → " + await s.texto(".modal-box .vid-estado"));
  await s.fin("celular que no adjunta");

  titulo("Si cierra las opciones de compartir, se le ayuda");
  s = await preparar({ video: { bytes: 300000 } });
  p = s.pagina;
  await p.evaluate(() => { window.__falla = ["AbortError"]; });
  await p.locator(boton).click(); await p.waitForTimeout(700);
  igual([await s.texto(".modal-box .vid-estado span"), await s.texto(".modal-box .vid-estado .vid-enlace")], ["¿No viste WhatsApp en la lista? Desliza para buscarlo, o envía el enlace.", "Enviar el enlace por WhatsApp"], "le dice dónde buscar WhatsApp y le ofrece el enlace");
  await p.locator(".modal-box .vid-enlace").click(); await p.waitForTimeout(200);
  igual([(await p.evaluate(() => window.__abiertos)).length, (await s.eventos("video")).map((e) => e.fase || e.resultado)], [1, ["abre", "cancelado", "enlace_cancelado"]], "y si manda el enlace, queda anotado");
  await s.fin("cancelado");

  titulo("Si cierra la ficha mientras el video se prepara, queda un aviso para enviarlo");
  s = await preparar({ video: { bytes: 400000, demora: 1500 } });
  p = s.pagina;
  await p.locator(boton).click(); await p.waitForTimeout(300);
  igual(await s.cuenta(".aviso-video"), 0, "mientras la ficha está abierta, el avance va en la ficha");
  await s.cerrarFicha(); await p.waitForTimeout(200);
  ok(/^Preparando tu video…/.test(await s.texto(".aviso-video")) && await s.cuenta(".aviso-video .vid-barra") === 1, "al cerrarla, el avance sigue abajo → " + await s.texto(".aviso-video"));
  await p.waitForTimeout(1600);
  igual([await s.texto(".aviso-video .av-cab span"), await s.texto(".aviso-video .av-enviar")], ["Tu video está listoJuego Gourmet serie Zylstra", "Enviar por WhatsApp"], "cuando está listo, el aviso lo dice con su botón");
  await s.foto("aviso-video-listo");
  await p.locator(".aviso-video .av-enviar").click(); await p.waitForTimeout(500);
  const ev2 = await s.eventos("video");
  igual([await p.evaluate(() => window.__compartido.map((x) => x.bytes)), await s.cuenta(".aviso-video"), ev2.map((e) => e.fase || e.resultado), ev2[ev2.length - 1].origen],
    [[400000], 0, ["cerro_antes", "abre", "ok"], "aviso"], "con un toque sale el video, el aviso se va y queda anotado");
  await s.fin("aviso del video");

  titulo("Video que demora: la asesora manda solo el enlace");
  s = await preparar({ video: { bytes: 500000, demora: 1500 } });
  p = s.pagina;
  await p.locator(boton).click(); await p.waitForTimeout(350);
  await p.locator(".modal-box .vid-enlace").click(); await p.waitForTimeout(200);
  igual([(await p.evaluate(() => window.__abiertos)).length, (await s.eventos("video")).map((e) => e.resultado)], [1, ["enlace_demora"]], "el enlace que manda mientras el video se prepara también cuenta como enviado");
  await s.fin("enlace mientras se prepara");

  titulo("Con wifi o en computadora, el video se adelanta");
  s = await preparar({ ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", movil: false, viewport: { width: 1280, height: 860 }, video: { bytes: 400000 } });
  p = s.pagina;
  await p.waitForTimeout(2300);
  igual(s.registro.videos.length, 1, "al abrir la ficha ya lo va bajando");
  await p.locator(boton).click(); await p.waitForTimeout(400);
  igual([await p.evaluate(() => window.__compartido.map((x) => x.bytes)), s.registro.videos.length], [[400000], 1], "y al tocar Enviar sale al instante");
  await s.fin("video adelantado");
}

/* ------------------------------------------------------------------ 14. la sesión se queda y el uso queda registrado */
async function permanencia() {
  titulo("La sesión se queda aunque falle la red");
  const NELSON = { token: "tok-asesor", nombre: "Nelson", celular: "987654321", completa: true };
  const a = await sesion({ movil: true, recordada: NELSON, fallaValida: -1, cambiar: sinBono });
  igual([await a.cuenta(".login-box"), (await a.textos(".lista-btn .lista-nom")).length], [0, 5], "sin red, quien ya entró en este equipo pasa directo, con su vista completa");
  await a.pagina.locator(".header-cuenta").click(); await a.pagina.waitForTimeout(200);
  ok(/Nelson/.test(await a.texto(".cuenta-menu")), "y el portal recuerda quién es");
  igual(await a.pagina.evaluate(() => localStorage.getItem("rw_sesion_v1")), "tok-asesor", "la sesión sigue guardada");
  igual((await a.eventos("visita")).length, 0, "la visita no se anota hasta que la base confirma");
  await a.fin("sin red, con datos recordados");

  const b = await sesion({ movil: true, fallaValida: 1, cambiar: sinBono });
  igual([await b.cuenta(".login-box"), await b.textos(".lista-btn .lista-nom")], [0, ["Lista General", "Compartir", "Repuestos", "Servicios"]], "si la base no responde y el equipo no recuerda más datos, igual entra (con la vista básica) en vez de pedir el DNI");
  await b.pagina.waitForTimeout(3400);
  igual((await b.textos(".lista-btn .lista-nom")).length, 5, "a los pocos segundos reintenta sola y, cuando la base responde, completa la vista");
  igual((await b.rpc("asesor_sesion_valida")).length, 2, "con un solo reintento");
  const v = await b.eventos("visita");
  ok(v.length === 1 && v[0].dispositivo === "Escritorio" && !!v[0].navegador && /x/.test(v[0].pantalla) && v[0].zona === "America/Lima", "la visita queda registrada una vez, con el equipo, el navegador, la pantalla y la zona → " + JSON.stringify(v[0]));
  const eqId = await b.pagina.evaluate(() => localStorage.getItem("rw_equipo_v1"));
  ok(/^[0-9a-f-]{36}$/.test(eqId || "") && v[0] && v[0].eq === eqId && b.registro.eventos.every((e) => e.equipo === eqId), "con el id de este equipo (se crea una vez y queda guardado)");
  igual(v[0] && v[0].geo && [v[0].geo.ciudad, v[0].geo.region, v[0].geo.isp], ["Arequipa", "Arequipa", "Telefonica del Peru"], "y la ubicación aproximada de la conexión (la da /geo, sin pedir permiso)");
  igual(await b.pagina.evaluate(() => JSON.parse(localStorage.getItem("rw_sesion_datos_v1") || "{}").nombre), "Nelson", "y el equipo ya recuerda a la persona para la próxima");
  await b.fin("la base tarda en responder");

  const c = await sesion({ movil: true, token: "tok-viejo", recordada: { token: "tok-viejo", nombre: "Rosa", celular: "912345678", completa: false }, cambiar: sinBono });
  await c.pagina.waitForTimeout(300);
  igual([await c.cuenta(".login-box"), await c.cuenta(".lista-btn")], [1, 0], "solo cuando la base dice que la sesión ya no vale se vuelve a pedir el DNI");
  igual(await c.pagina.evaluate(() => [localStorage.getItem("rw_sesion_v1"), localStorage.getItem("rw_sesion_datos_v1")]), [null, null], "y el equipo olvida esa sesión");
  await c.pagina.locator(".login-input").fill("40123456"); await c.pagina.locator(".login-btn").click(); await c.pagina.waitForSelector(".lista-btn");
  igual(await c.pagina.evaluate(() => { const d = JSON.parse(localStorage.getItem("rw_sesion_datos_v1") || "{}"); return [localStorage.getItem("rw_sesion_v1"), d.token, d.nombre, d.completa]; }), ["tok-asesor", "tok-asesor", "Nelson", true], "al entrar con el DNI queda guardada la sesión y lo que se recuerda de ella");
  await c.pagina.reload(); await c.pagina.waitForSelector(".lista-btn, .login-box"); await c.pagina.waitForTimeout(400);
  igual([await c.cuenta(".login-box"), await c.cuenta(".lista-btn")], [0, 5], "y al volver a abrir el portal ya no pide el DNI");
  await c.fin("sesión que ya no vale");

  titulo("Registro de uso: si no hay señal, no se pierde");
  const g = await sesion({ movil: true, eventosFallan: -1, cambiar: sinBono });
  await g.pagina.locator(".tile .tile-btn").first().click(); await g.pagina.waitForTimeout(500);
  await g.pagina.evaluate(() => window.__rwEnviarEventos(true)); await g.pagina.waitForTimeout(400);
  const enCola = await g.cola();
  ok(g.registro.eventos.length === 0 && enCola.some((e) => e.tipo === "visita") && enCola.some((e) => e.tipo === "ver_producto" && e.d.codigo === "000158"), "sin señal, los eventos quedan guardados en el equipo → " + enCola.map((e) => e.tipo).join(", "));
  ok(enCola.every((e) => /^[0-9a-f-]{36}$/.test(e.id) && e.tok === "tok-asesor" && e.t > 0) && new Set(enCola.map((e) => e.id)).size === enCola.length, "cada uno con su id, su sesión y la hora en que pasó");
  g.registro.opciones.eventosFallan = 0;   // vuelve la señal
  await g.pagina.reload(); await g.pagina.waitForSelector(".lista-btn"); await g.pagina.waitForTimeout(3200);
  const llegaron = g.registro.eventos;
  ok(enCola.every((e) => llegaron.some((x) => x.id === e.id && x.t === e.t)), "al volver a abrir el portal salen solos, con su hora de entonces");
  igual([(await g.cola()).length, llegaron.length, new Set(llegaron.map((e) => e.id)).size], [0, llegaron.length, llegaron.length], "y la cola queda vacía, sin repetidos");
  await g.fin("registro sin señal");

  titulo("Registro de uso: lo que hace la asesora");
  const d = await sesion({ movil: true, cambiar: sinBono });
  const q = d.pagina;
  await q.locator(".search-bar input").fill("olla"); await q.waitForTimeout(500);
  await q.locator(".search-bar input").fill("olla a pres"); await q.waitForTimeout(2900);
  const bus = await d.eventos("buscar");
  ok(bus.length === 1 && bus[0].texto === "olla a pres" && bus[0].lista === "general" && bus[0].resultados > 0, "una búsqueda se anota una vez, cuando la asesora deja de escribir → " + JSON.stringify(bus));
  await q.locator(".search-bar input").fill("zzzzqq"); await q.waitForTimeout(2900);
  igual((await d.eventos("buscar")).map((e) => [e.texto, e.resultados]), [["olla a pres", bus[0] ? bus[0].resultados : -1], ["zzzzqq", 0]], "y también lo que busca y no encuentra");
  await q.locator(".search-clear").click(); await q.waitForTimeout(200);
  await q.locator(".tile .tile-btn").first().click(); await q.waitForTimeout(400);
  igual((await d.eventos("ver_producto")).map((e) => [e.codigo, e.lista]), [["000158", "general"]], "cada ficha abierta queda anotada");
  await q.evaluate(() => { setTimeout(() => { throw new Error("falla de prueba"); }, 0); }); await q.waitForTimeout(250);
  igual((await d.eventos("error")).map((e) => e.msg), ["Uncaught Error: falla de prueba"], "y los errores de la página en el equipo de la asesora también");
  d.registro.errores.length = 0;   // ese error lo provocó la prueba
  await d.fin("registro de uso");
}

(async () => {
  const solo = process.env.SOLO || "";
  const todas = { ingreso, vistaAsesor, permanencia, ganancia, inicial, cotizacion, repuestos, servicios, parteAlta, admin, respaldo, tutorial, compartir, video };
  for (const [n, fn] of Object.entries(todas)) {
    if (solo && solo.split(",").indexOf(n) < 0) continue;
    try { await fn(); } catch (e) { fallan++; console.log("  ✗ " + n + " se cayó: " + String(e.message || e).split("\n")[0]); }
  }
  console.log("\n---------------------------------------------");
  console.log(fallan === 0 ? "TODO OK: " + pasan + " verificaciones" : fallan + " FALLAS de " + (pasan + fallan));
  process.exit(fallan ? 1 : 0);
})();
