/* =====================================================================
   Especiales Navidad Mágica (2026-11-12)
   ---------------------------------------------------------------------
   Lista oficial de Rena Ware del Perú, vigente del 12 de noviembre al 23
   de diciembre de 2026: 40 especiales (códigos 385800 a 389700).
   Fuente: RenaDrive → Listas de Precios → 3 Especiales vigentes →
   Especiales Navidad Mágica → «2026-11-12 Especiales Navidad Magica -
   COMISIONES.pdf» (precio regular, precio especial, puntos y valor
   comisionable de cada código).
   · listas_precios: la lista, con las mismas reglas que los otros
     especiales (contado, crédito, autocompra; se mezcla con otras listas).
   · productos: nombre «Especial #N · A + B + C», categoría «Especial #N»,
     grupo (el producto base, para los filtros), componentes y regalo.
   · piezas / pieza_alias: dos piezas nuevas (Joyita 1 L y Juego de
     Cuchillos Élite 16 piezas) y los nombres con que esta lista escribe
     el juego para servir y los útiles de cocina, para el buscador maestro.
   · piezas_clave se recalcula solo para lo que cambia.
   Este repositorio es público: aquí NO van los puntos ni el valor
   comisionable. Están en la base (productos.puntos y
   productos.valor_comisionable) y salen del cuadro de comisiones de la
   lista oficial; este archivo no toca esas columnas.
   Se puede volver a correr. Solo datos: no cambia tablas ni funciones.
   ===================================================================== */

insert into public.piezas (clave, nombre, codigo_general, regalo) values
  ('joyita', 'Joyita 1 L', null, false),
  ('cuchillos-elite', 'Juego de Cuchillos Élite 16 piezas', '000115', false)
on conflict (clave) do nothing;

insert into public.pieza_alias (alias, clave) values
  ('joyita 1 litro', 'joyita'),
  ('joyita 1 l', 'joyita'),
  ('juego de cuchillos elite 16 piezas', 'cuchillos-elite'),
  ('juego para servir 3 piezas', 'servir-3-piezas'),
  ('juego de utiles de cocina', 'utiles-cocina')
on conflict (alias) do nothing;

insert into public.listas_precios (id, nombre, orden, activa, vigente_desde, vigente_hasta, permite_contado, permite_credito, permite_autocompra,
                                   solo_terceros, se_mezcla, sin_puntos, exenta_minimos)
values ('navidad-magica', 'Especiales Navidad Mágica', 3, true, '2026-11-12', '2026-12-23', true, true, true, false, true, false, false)
on conflict (id) do update set nombre = excluded.nombre, vigente_desde = excluded.vigente_desde, vigente_hasta = excluded.vigente_hasta, activa = excluded.activa;

insert into public.productos (lista_id, codigo, nombre, categoria, orden, precio, grupo, regalo, componentes) values
  ('navidad-magica', '385800', 'Especial #1 · JUEGO GOURMET 17 PIEZAS + NUTREX PRESS ÉLITE + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #1', 1, 8869, 'Juego Gourmet 17 piezas', 'Tetera con infusor de té', array['JUEGO GOURMET 17 PIEZAS', 'NUTREX PRESS ÉLITE', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '385900', 'Especial #2 · JUEGO GOURMET 17 PIEZAS + COCINA DE INDUCCIÓN IC-450 + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #2', 2, 7869, 'Juego Gourmet 17 piezas', 'Tetera con infusor de té', array['JUEGO GOURMET 17 PIEZAS', 'COCINA DE INDUCCIÓN IC-450', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '386000', 'Especial #3 · JUEGO GOURMET 17 PIEZAS + PARRILLA DOBLE + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #3', 3, 7449, 'Juego Gourmet 17 piezas', 'Tetera con infusor de té', array['JUEGO GOURMET 17 PIEZAS', 'PARRILLA DOBLE', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '386100', 'Especial #4 · JUEGO GOURMET 17 PIEZAS + SAUCIER 1.75 L + SAUCEPAN 2.5 L + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #4', 4, 7449, 'Juego Gourmet 17 piezas', 'Tetera con infusor de té', array['JUEGO GOURMET 17 PIEZAS', 'SAUCIER 1.75 L', 'SAUCEPAN 2.5 L', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '386200', 'Especial #5 · JUEGO GOURMET 17 PIEZAS + JOYITA 1 LITRO + JUEGO DE BOWLS 3 PIEZAS + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #5', 5, 7239, 'Juego Gourmet 17 piezas', 'Tetera con infusor de té', array['JUEGO GOURMET 17 PIEZAS', 'JOYITA 1 LITRO', 'JUEGO DE BOWLS 3 PIEZAS', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '386300', 'Especial #6 · JUEGO CHEF I 7 PIEZAS + NUTREX PRESS ÉLITE + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #6', 6, 5599, 'Juego Chef I', 'Tetera con infusor de té', array['JUEGO CHEF I 7 PIEZAS', 'NUTREX PRESS ÉLITE', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '386400', 'Especial #7 · JUEGO CHEF I 7 PIEZAS + COCINA DE INDUCCIÓN IC-450 + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #7', 7, 4599, 'Juego Chef I', 'Tetera con infusor de té', array['JUEGO CHEF I 7 PIEZAS', 'COCINA DE INDUCCIÓN IC-450', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '386500', 'Especial #8 · JUEGO CHEF I 7 PIEZAS + PARRILLA DOBLE + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #8', 8, 4179, 'Juego Chef I', 'Tetera con infusor de té', array['JUEGO CHEF I 7 PIEZAS', 'PARRILLA DOBLE', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '386600', 'Especial #9 · JUEGO CHEF I 7 PIEZAS + SAUCIER 1.75 L + SAUCEPAN 2.5 L + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #9', 9, 4179, 'Juego Chef I', 'Tetera con infusor de té', array['JUEGO CHEF I 7 PIEZAS', 'SAUCIER 1.75 L', 'SAUCEPAN 2.5 L', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '386700', 'Especial #10 · JUEGO CHEF I 7 PIEZAS + JOYITA 1 LITRO + JUEGO DE BOWLS 3 PIEZAS + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #10', 10, 3959, 'Juego Chef I', 'Tetera con infusor de té', array['JUEGO CHEF I 7 PIEZAS', 'JOYITA 1 LITRO', 'JUEGO DE BOWLS 3 PIEZAS', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '386800', 'Especial #11 · JUEGO CHEF II 7 PIEZAS + NUTREX PRESS ÉLITE + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #11', 11, 5599, 'Juego Chef II', 'Tetera con infusor de té', array['JUEGO CHEF II 7 PIEZAS', 'NUTREX PRESS ÉLITE', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '386900', 'Especial #12 · JUEGO CHEF II 7 PIEZAS + COCINA DE INDUCCIÓN IC-450 + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #12', 12, 4599, 'Juego Chef II', 'Tetera con infusor de té', array['JUEGO CHEF II 7 PIEZAS', 'COCINA DE INDUCCIÓN IC-450', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '387000', 'Especial #13 · JUEGO CHEF II 7 PIEZAS + PARRILLA DOBLE + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #13', 13, 4179, 'Juego Chef II', 'Tetera con infusor de té', array['JUEGO CHEF II 7 PIEZAS', 'PARRILLA DOBLE', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '387100', 'Especial #14 · JUEGO CHEF II 7 PIEZAS + SAUCIER 1.75 L + SAUCEPAN 2.5 L + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #14', 14, 4179, 'Juego Chef II', 'Tetera con infusor de té', array['JUEGO CHEF II 7 PIEZAS', 'SAUCIER 1.75 L', 'SAUCEPAN 2.5 L', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '387200', 'Especial #15 · JUEGO CHEF II 7 PIEZAS + JOYITA 1 LITRO + JUEGO DE BOWLS 3 PIEZAS + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #15', 15, 3959, 'Juego Chef II', 'Tetera con infusor de té', array['JUEGO CHEF II 7 PIEZAS', 'JOYITA 1 LITRO', 'JUEGO DE BOWLS 3 PIEZAS', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '387300', 'Especial #16 · AQUA NANO CTU-500 + JUEGO GOURMET 17 PIEZAS + BOTELLA FILTRANTE RENA WARE + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #16', 16, 9799, 'Aqua Nano CTU-500', 'Tetera con infusor de té', array['AQUA NANO CTU-500', 'JUEGO GOURMET 17 PIEZAS', 'BOTELLA FILTRANTE RENA WARE', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '387400', 'Especial #17 · AQUA NANO CTU-500 + JUEGO CHEF I 7 PIEZAS + BOTELLA FILTRANTE RENA WARE + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #17', 17, 6529, 'Aqua Nano CTU-500', 'Tetera con infusor de té', array['AQUA NANO CTU-500', 'JUEGO CHEF I 7 PIEZAS', 'BOTELLA FILTRANTE RENA WARE', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '387500', 'Especial #18 · AQUA NANO CTU-500 + JUEGO CHEF II 7 PIEZAS + BOTELLA FILTRANTE RENA WARE + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #18', 18, 6529, 'Aqua Nano CTU-500', 'Tetera con infusor de té', array['AQUA NANO CTU-500', 'JUEGO CHEF II 7 PIEZAS', 'BOTELLA FILTRANTE RENA WARE', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '387600', 'Especial #19 · AQUA NANO CTU-500 + BOTELLA FILTRANTE RENA WARE + NUTREX PRESS ÉLITE', 'Especial #19', 19, 6449, 'Aqua Nano CTU-500', 'Tetera con infusor de té', array['AQUA NANO CTU-500', 'BOTELLA FILTRANTE RENA WARE', 'NUTREX PRESS ÉLITE']),
  ('navidad-magica', '387700', 'Especial #20 · AQUA NANO CTU-500 + BOTELLA FILTRANTE RENA WARE + RONDEAU 4.5 L + JUEGO DE BOWLS 3 PIEZAS', 'Especial #20', 20, 5459, 'Aqua Nano CTU-500', 'Tetera con infusor de té', array['AQUA NANO CTU-500', 'BOTELLA FILTRANTE RENA WARE', 'RONDEAU 4.5 L', 'JUEGO DE BOWLS 3 PIEZAS']),
  ('navidad-magica', '387800', 'Especial #21 · FILTRO DE AGUA MOD PORTÁTIL RWF-228 + JUEGO GOURMET 17 PIEZAS + BOTELLA DE ACERO + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #21', 21, 7989, 'Filtro RWF-228', 'Tetera con infusor de té', array['FILTRO DE AGUA MOD PORTÁTIL RWF-228', 'JUEGO GOURMET 17 PIEZAS', 'BOTELLA DE ACERO', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '387900', 'Especial #22 · FILTRO DE AGUA MOD PORTÁTIL RWF-228 + JUEGO CHEF I 7 PIEZAS + BOTELLA DE ACERO + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #22', 22, 4719, 'Filtro RWF-228', 'Tetera con infusor de té', array['FILTRO DE AGUA MOD PORTÁTIL RWF-228', 'JUEGO CHEF I 7 PIEZAS', 'BOTELLA DE ACERO', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '388000', 'Especial #23 · FILTRO DE AGUA MOD PORTÁTIL RWF-228 + JUEGO CHEF II 7 PIEZAS + BOTELLA DE ACERO + JUEGO PARA SERVIR 3 PIEZAS', 'Especial #23', 23, 4719, 'Filtro RWF-228', 'Tetera con infusor de té', array['FILTRO DE AGUA MOD PORTÁTIL RWF-228', 'JUEGO CHEF II 7 PIEZAS', 'BOTELLA DE ACERO', 'JUEGO PARA SERVIR 3 PIEZAS']),
  ('navidad-magica', '388100', 'Especial #24 · FILTRO DE AGUA MOD PORTÁTIL RWF-228 + BOTELLA DE ACERO + NUTREX PRESS ÉLITE', 'Especial #24', 24, 4649, 'Filtro RWF-228', 'Tetera con infusor de té', array['FILTRO DE AGUA MOD PORTÁTIL RWF-228', 'BOTELLA DE ACERO', 'NUTREX PRESS ÉLITE']),
  ('navidad-magica', '388200', 'Especial #25 · FILTRO DE AGUA MOD PORTÁTIL RWF-228 + BOTELLA DE ACERO + RONDEAU 4.5 L + JUEGO DE BOWLS 3 PIEZAS', 'Especial #25', 25, 3649, 'Filtro RWF-228', 'Tetera con infusor de té', array['FILTRO DE AGUA MOD PORTÁTIL RWF-228', 'BOTELLA DE ACERO', 'RONDEAU 4.5 L', 'JUEGO DE BOWLS 3 PIEZAS']),
  ('navidad-magica', '388300', 'Especial #26 · NUTREX PRESS ÉLITE + SARTÉN PEQUEÑA CON TAPA 24 CM + SARTÉN GRANDE CON TAPA 30 CM + TABLA DE CORTAR & CUCHILLO SANTOKU', 'Especial #26', 26, 5019, 'Nutrex Press Élite', 'Tetera con infusor de té', array['NUTREX PRESS ÉLITE', 'SARTÉN PEQUEÑA CON TAPA 24 CM', 'SARTÉN GRANDE CON TAPA 30 CM', 'TABLA DE CORTAR & CUCHILLO SANTOKU']),
  ('navidad-magica', '388400', 'Especial #27 · NUTREX PRESS ÉLITE + COCINA DE INDUCCIÓN IC-450 + TABLA DE CORTAR & CUCHILLO SANTOKU', 'Especial #27', 27, 4839, 'Nutrex Press Élite', 'Tetera con infusor de té', array['NUTREX PRESS ÉLITE', 'COCINA DE INDUCCIÓN IC-450', 'TABLA DE CORTAR & CUCHILLO SANTOKU']),
  ('navidad-magica', '388500', 'Especial #28 · NUTREX PRESS ÉLITE + SAUCIER 1.75 L + SAUCEPAN 2.5 L + TABLA DE CORTAR & CUCHILLO SANTOKU', 'Especial #28', 28, 4419, 'Nutrex Press Élite', 'Tetera con infusor de té', array['NUTREX PRESS ÉLITE', 'SAUCIER 1.75 L', 'SAUCEPAN 2.5 L', 'TABLA DE CORTAR & CUCHILLO SANTOKU']),
  ('navidad-magica', '388600', 'Especial #29 · COCINA DE INDUCCIÓN IC-450 + OLLA A PRESIÓN 8 L + JUEGO DE BOWLS 3 PIEZAS', 'Especial #29', 29, 4949, 'Cocina de Inducción', 'Tetera con infusor de té', array['COCINA DE INDUCCIÓN IC-450', 'OLLA A PRESIÓN 8 L', 'JUEGO DE BOWLS 3 PIEZAS']),
  ('navidad-magica', '388700', 'Especial #30 · COCINA DE INDUCCIÓN IC-450 + SARTÉN PEQUEÑA CON TAPA 24 CM + MINI SARTÉN CON TAPA 18 CM + JUEGO DE BOWLS 3 PIEZAS', 'Especial #30', 30, 3529, 'Cocina de Inducción', 'Tetera con infusor de té', array['COCINA DE INDUCCIÓN IC-450', 'SARTÉN PEQUEÑA CON TAPA 24 CM', 'MINI SARTÉN CON TAPA 18 CM', 'JUEGO DE BOWLS 3 PIEZAS']),
  ('navidad-magica', '388800', 'Especial #31 · JUEGO DE CUCHILLOS ÉLITE 16 PIEZAS + PARRILLA DOBLE + JUEGO DE ÚTILES DE COCINA + TABLA DE CORTAR & CUCHILLO SANTOKU', 'Especial #31', 31, 4669, 'Cuchillos Élite', 'Tetera con infusor de té', array['JUEGO DE CUCHILLOS ÉLITE 16 PIEZAS', 'PARRILLA DOBLE', 'JUEGO DE ÚTILES DE COCINA', 'TABLA DE CORTAR & CUCHILLO SANTOKU']),
  ('navidad-magica', '388900', 'Especial #32 · JUEGO DE CUCHILLOS ÉLITE 16 PIEZAS + CUBIERTOS ÉLITE 35 PZS + CUBIERTOS ÉLITE 35 PZS + TABLA DE CORTAR & CUCHILLO SANTOKU', 'Especial #32', 32, 4399, 'Cuchillos Élite', 'Tetera con infusor de té', array['JUEGO DE CUCHILLOS ÉLITE 16 PIEZAS', 'CUBIERTOS ÉLITE 35 PZS', 'CUBIERTOS ÉLITE 35 PZS', 'TABLA DE CORTAR & CUCHILLO SANTOKU']),
  ('navidad-magica', '389000', 'Especial #33 · JUEGO DE CUCHILLOS ÉLITE 16 PIEZAS + SARTÉN GRANDE CON TAPA 30 CM + SARTÉN PEQUEÑA CON TAPA 24 CM + TABLA DE CORTAR & CUCHILLO SANTOKU', 'Especial #33', 33, 4099, 'Cuchillos Élite', 'Tetera con infusor de té', array['JUEGO DE CUCHILLOS ÉLITE 16 PIEZAS', 'SARTÉN GRANDE CON TAPA 30 CM', 'SARTÉN PEQUEÑA CON TAPA 24 CM', 'TABLA DE CORTAR & CUCHILLO SANTOKU']),
  ('navidad-magica', '389100', 'Especial #34 · PURIFICADOR DE AIRE AEROQUATTRO+ UV + SAUCIER 1.75 L + SAUCEPAN 2.5 L + COCINA DE INDUCCIÓN IC-450', 'Especial #34', 34, 5189, 'Purificador de Aire', 'Tetera con infusor de té', array['PURIFICADOR DE AIRE AEROQUATTRO+ UV', 'SAUCIER 1.75 L', 'SAUCEPAN 2.5 L', 'COCINA DE INDUCCIÓN IC-450']),
  ('navidad-magica', '389200', 'Especial #35 · PURIFICADOR DE AIRE AEROQUATTRO+ UV + PRINCESA 34 CM + COCINA DE INDUCCIÓN IC-450', 'Especial #35', 35, 5169, 'Purificador de Aire', 'Tetera con infusor de té', array['PURIFICADOR DE AIRE AEROQUATTRO+ UV', 'PRINCESA 34 CM', 'COCINA DE INDUCCIÓN IC-450']),
  ('navidad-magica', '389300', 'Especial #36 · OLLA A PRESIÓN 8 L + NUTREX PRESS ÉLITE + JUEGO DE BOWLS 3 PIEZAS', 'Especial #36', 36, 5949, 'Olla a Presión 8 L', 'Tetera con infusor de té', array['OLLA A PRESIÓN 8 L', 'NUTREX PRESS ÉLITE', 'JUEGO DE BOWLS 3 PIEZAS']),
  ('navidad-magica', '389400', 'Especial #37 · OLLA A PRESIÓN 8 L + CUBIERTOS ÉLITE 35 PZS + CUBIERTOS ÉLITE 35 PZS + JUEGO DE BOWLS 3 PIEZAS', 'Especial #37', 37, 5439, 'Olla a Presión 8 L', 'Tetera con infusor de té', array['OLLA A PRESIÓN 8 L', 'CUBIERTOS ÉLITE 35 PZS', 'CUBIERTOS ÉLITE 35 PZS', 'JUEGO DE BOWLS 3 PIEZAS']),
  ('navidad-magica', '389500', 'Especial #38 · OLLA A PRESIÓN 8 L + ASADOR DE 6 LITROS + JUEGO DE BOWLS 3 PIEZAS', 'Especial #38', 38, 4529, 'Olla a Presión 8 L', 'Tetera con infusor de té', array['OLLA A PRESIÓN 8 L', 'ASADOR DE 6 LITROS', 'JUEGO DE BOWLS 3 PIEZAS']),
  ('navidad-magica', '389600', 'Especial #39 · ASADOR DE 6 LITROS + COCINA DE INDUCCIÓN IC-450 + SARTÉN GRANDE CON TAPA 30 CM + SARTÉN PEQUEÑA CON TAPA 24 CM', 'Especial #39', 39, 4649, 'Asador de 6 Litros', 'Tetera con infusor de té', array['ASADOR DE 6 LITROS', 'COCINA DE INDUCCIÓN IC-450', 'SARTÉN GRANDE CON TAPA 30 CM', 'SARTÉN PEQUEÑA CON TAPA 24 CM']),
  ('navidad-magica', '389700', 'Especial #40 · ASADOR DE 6 LITROS + COCINA DE INDUCCIÓN IC-450 + SAUCIER 1.75 L + SAUCEPAN 2.5 L', 'Especial #40', 40, 4049, 'Asador de 6 Litros', 'Tetera con infusor de té', array['ASADOR DE 6 LITROS', 'COCINA DE INDUCCIÓN IC-450', 'SAUCIER 1.75 L', 'SAUCEPAN 2.5 L'])
on conflict (lista_id, codigo) do update set nombre = excluded.nombre, categoria = excluded.categoria, orden = excluded.orden, precio = excluded.precio, grupo = excluded.grupo, regalo = excluded.regalo, componentes = excluded.componentes;

update public.productos p
   set piezas_clave = (select array_agg(distinct a.clave) from unnest(p.componentes) c join public.pieza_alias a on a.alias = public.norm_txt(c))
 where p.lista_id = 'navidad-magica'
   and p.piezas_clave is distinct from (select array_agg(distinct a.clave) from unnest(p.componentes) c join public.pieza_alias a on a.alias = public.norm_txt(c));

update public.productos p set piezas_clave = array[pz.clave]
  from public.piezas pz
 where pz.clave = 'cuchillos-elite' and p.componentes is null and p.codigo = pz.codigo_general and p.piezas_clave is distinct from array[pz.clave];
