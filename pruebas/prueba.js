/* Prueba de comportamiento del portal de precios en Chromium real (Playwright),
   sin internet. La base es el Supabase simulado de simulador.js: deja leer los
   catálogos y llamar funciones; cualquier escritura directa a una tabla se
   rechaza y hace fallar la prueba.
   Recorre: ingreso, listas, puntos y ganancia, Repuestos como catálogo,
   Servicios (soldadura, limpieza, pulido en dos variantes, cocina), fichas,
   cotización, buscador, panel de administración, el comportamiento de la
   parte alta (listas, barra pegada, salto al buscar) y el tutorial.
   Uso:  node pruebas/prueba.js [carpeta-de-capturas]
   Los datos de datos.json tienen precios de asesor, puntos y valores
   comisionables inventados (el repositorio es público). */
const path = require("path");
const fs = require("fs");
const { abrir, CLAVE_ADMIN } = require("./simulador.js");
const DATOS = require("./datos.json");
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
  ok(/N° 1/.test(await s.texto(".qc-code")), "la cotización conserva código y número");
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
  ok(/Precio Asesor/.test(await s.texto(".qc-mode")) && /Cod\. 30104$/.test(await s.texto(".qc-code")) && await s.cuenta(".qc-pts") === 0, "la cotización lo dice igual y sin puntos");
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
  igual(await s.texto(".qc-code"), "Pulido · Zylstra · por pieza", "la cotización dice serie y unidad");
  igual(await s.textos(".qc-small .qc-srow span:first-child, .qc-bigtotal span"), ["Precio al cliente", "Tu ganancia", "Precio asesor"], "y los mismos rótulos");
  igual(await s.cuenta(".qc-pts"), 0, "sin puntos");
  await p.locator(".share-quote-btn").click(); await p.waitForTimeout(600);
  igual(await s.cuenta(".cap-err"), 0, "compartir la cotización no da error");
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
  ok(barra.aba <= 200 && barra.h <= 110, "lo fijo ocupa poco: " + barra.aba + " px de 844");
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
  await d.fin("escritorio");
}

/* ------------------------------------------------------------------ 6. panel de administración */
async function admin() {
  titulo("Admin: precios de servicios y de repuestos");
  const s = await sesion({ viewport: { width: 900, height: 900 }, ruta: "/admin", sinSesion: true, cambiar: sinBono });
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
  ok(/esp on/.test(await p.locator(".lista-btn", { hasText: "Compartir" }).getAttribute("class")) && await s.cuenta(".tile") > 0, "abre el especial y muestra sus fichas");
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
  titulo("Tutorial: la primera vez (celular)");
  const s = await sesion({ movil: true, tour: true, cambiar: sinBono });
  const p = s.pagina;
  const sig = async (t) => { await p.locator(".tour-sig").click(); return pasoTour(s, t.n); };
  const revisar = async (t, sel, msg) => {
    const c = (await s.cajas(sel))[0];
    ok(dentroDe(c, t.foco, 3), t.titulo + ": " + msg + " → foco " + JSON.stringify(t.foco) + ", parte " + JSON.stringify(c));
    ok(noSeTapan(t.foco, t.carta), t.titulo + ": la tarjeta no tapa lo que explica");
    ok(enPantalla(t.carta, t), t.titulo + ": la tarjeta entra entera en la pantalla");
  };
  let t = await pasoTour(s, "");
  ok(/Hola/.test(t.titulo) && t.n === "1 de 18", "la primera vez arranca solo, con un saludo → " + t.titulo + " · " + t.n);
  igual(t.botones, ["Saltar tutorial", "Empezar"], "y se puede saltar desde el inicio");
  igual(await p.evaluate(() => localStorage.getItem("rw_tour_v1")), "1", "queda anotado en este equipo que ya salió");
  await s.foto("tutorial-0-saludo");
  t = await sig(t);
  await revisar(t, ".lista-switch", "resalta el menú de listas");
  ok(/naranja/.test(t.texto), "explica que las naranjas son especiales");
  igual(t.botones, ["Saltar", "Atrás", "Siguiente"], "con Saltar, Atrás y Siguiente");
  await s.foto("tutorial-1-listas");
  t = await sig(t);
  await revisar(t, ".search-bar", "resalta el buscador");
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
  if (m) {
    igual(num(await p.locator(".modal-box .cbox.editable input").inputValue()), num(m[1]), "la inicial de la ficha es la que dice la tarjeta");
    const cuota = await p.evaluate((meses) => { const b = Array.from(document.querySelectorAll(".modal-box .inst-btn")).find((x) => x.querySelector(".inst-m").textContent === meses + "m"); return b ? b.querySelector(".inst-v").textContent : ""; }, m[2]);
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
  await revisar(t, ".modal-box .share-quote-btn", "resalta Compartir cotización");
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
  igual([t.n, t.botones], ["18 de 18", ["Atrás", "Terminar"]], "son 18 pasos y el último se cierra con Terminar");
  await s.foto("tutorial-11-listo");
  await p.locator(".tour-sig").click(); await p.waitForTimeout(300);
  igual(await s.cuenta(".tour"), 0, "Terminar cierra el tutorial");
  const evs = await s.rpc("registrar_evento");
  igual(evs.filter((x) => x.p_tipo === "tutorial").map((x) => x.p_detalle.accion), ["inicio", "fin"], "queda registrado que lo vio entero");
  igual([evs.filter((x) => x.p_tipo === "ver_lista").length, evs.filter((x) => x.p_tipo === "ver_producto").length], [1, 0], "lo que abre el tutorial no cuenta como uso (solo la lista del inicio)");
  await p.reload(); await p.waitForSelector(".lista-btn"); await p.waitForTimeout(1500);
  igual(await s.cuenta(".tour"), 0, "la segunda vez ya no sale solo");
  igual(await s.textos(".nav-top .tour-ver"), ["Ver tutorial"], "pero «Ver tutorial» está a la vista arriba");
  await p.locator(".nav-top .tour-ver").click();
  t = await pasoTour(s, "");
  igual(t.titulo, "Elige la lista", "y vuelve a empezar, sin el saludo");
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
  const c = await sesion({ movil: true, viewport: { width: 360, height: 640 }, tour: true, cambiar: sinBono });
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
  const d = await sesion({ viewport: { width: 1280, height: 860 }, tour: true, cambiar: sinBono });
  const q = d.pagina;
  let u = await pasoTour(d, "");
  ok(enPantalla(u.carta, u) && Math.abs(u.carta.x + u.carta.w / 2 - 640) <= 2, "el saludo va al centro");
  for (let k = 0; k < 4; k++) { await q.locator(".tour-sig").click(); u = await pasoTour(d, u.n); }
  igual(u.titulo, "Muestra el video", "llega al video");
  const modal = (await d.cajas(".modal-box"))[0];
  ok(u.carta.x >= modal.der || u.carta.der <= modal.x, "en escritorio la tarjeta va al costado de la ficha, sin taparla");
  await d.foto("tutorial-escritorio-video");
  await q.locator(".tour-saltar").click(); await q.waitForTimeout(300);
  igual([await d.cuenta(".tour"), await d.cuenta(".modal-box")], [0, 0], "Saltar cierra el tutorial y la ficha");
  await d.fin("tutorial en escritorio");
}

(async () => {
  const solo = process.env.SOLO || "";
  const todas = { ingreso, vistaAsesor, ganancia, repuestos, servicios, parteAlta, admin, respaldo, tutorial };
  for (const [n, fn] of Object.entries(todas)) {
    if (solo && solo.split(",").indexOf(n) < 0) continue;
    try { await fn(); } catch (e) { fallan++; console.log("  ✗ " + n + " se cayó: " + String(e.message || e).split("\n")[0]); }
  }
  console.log("\n---------------------------------------------");
  console.log(fallan === 0 ? "TODO OK: " + pasan + " verificaciones" : fallan + " FALLAS de " + (pasan + fallan));
  process.exit(fallan ? 1 : 0);
})();
