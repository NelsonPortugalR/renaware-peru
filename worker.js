// El portal es estático: los archivos los sirve Cloudflare directo, sin pasar por aquí. Este Worker responde solo lo
// que no es un archivo y no es una página: /geo, la ubicación aproximada de quien abre el portal según su conexión a
// internet (Cloudflare la conoce por la IP; no usa el GPS ni pide permiso). La página la manda con cada visita e
// ingreso para Admin → Estadísticas: desde dónde entra cada persona, para notar si alguien prestó su cuenta.
// Todo lo demás sigue igual: se le pasa a los archivos (y una ruta que no existe abre el portal).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/geo") {
      const cf = request.cf || {};
      const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
      const datos = {
        ciudad: cf.city || "",
        region: cf.region || "",
        pais: cf.country || "",
        lat: num(cf.latitude),
        lon: num(cf.longitude),
        isp: cf.asOrganization || "",
        asn: cf.asn || null,
        zona: cf.timezone || ""
      };
      return new Response(JSON.stringify(datos), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
