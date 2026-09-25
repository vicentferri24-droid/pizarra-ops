// Función de Cloudflare Pages: consulta la posición de un barco por su IMO en VesselAPI.
// La clave (VESSELAPI_KEY) se lee de una variable de entorno de Cloudflare —
// nunca se manda al navegador del usuario, así nadie puede verla mirando el
// código fuente de la página.
//
// Se llama desde la web así: /vessel-position?imo=1234567
// (Cloudflare mapea automáticamente functions/vessel-position.js a esa ruta)

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  const url = new URL(request.url);
  const imo = (url.searchParams.get('imo') || '').replace(/[^0-9]/g, '');
  if (!imo) {
    return new Response(JSON.stringify({ error: 'Falta el parámetro imo' }), { status: 400, headers });
  }

  const apiKey = env.VESSELAPI_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Falta configurar VESSELAPI_KEY en Cloudflare Pages (Settings → Environment variables)' }), { status: 500, headers });
  }

  try {
    const posUrl = `https://api.vesselapi.com/v1/vessel/${imo}/position?filter.idType=imo`;
    const resp = await fetch(posUrl, { headers: { Authorization: `Bearer ${apiKey}` } });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return new Response(
        JSON.stringify({ error: `VesselAPI devolvió un error (${resp.status}): ${text.slice(0, 300)}` }),
        { status: resp.status, headers }
      );
    }

    const data = await resp.json();
    // La API real devuelve los datos dentro de "vesselPosition" (no "vessel").
    // Se dejan los otros nombres como red de seguridad por si cambia el formato.
    const v = data.vesselPosition || data.vessel || data;

    if (v.latitude == null || v.longitude == null) {
      return new Response(JSON.stringify({ error: 'No se encontró posición para ese IMO' }), { status: 404, headers });
    }

    // ETA/destino: es otra llamada aparte a VesselAPI (gasta otra consulta de
    // la cuota mensual). Si falla o no hay dato, no se rompe la posición —
    // simplemente se manda sin ETA.
    let eta = null, destination = null, destinationPort = null;
    try {
      const etaUrl = `https://api.vesselapi.com/v1/vessel/${imo}/eta?filter.idType=imo`;
      const etaResp = await fetch(etaUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (etaResp.ok) {
        const etaData = await etaResp.json();
        const ev = etaData.vesselEta || etaData.vessel || etaData;
        eta = ev.eta || null;
        destination = ev.destination || null;
        destinationPort = ev.destination_port || null;
      }
    } catch (e) { /* la ETA es un extra — si falla, se ignora */ }

    return new Response(
      JSON.stringify({
        lat: v.latitude,
        lng: v.longitude,
        speed: v.sog != null ? v.sog : null,
        course: v.cog != null ? v.cog : null,
        vesselName: v.vessel_name || null,
        timestamp: v.timestamp || null,
        eta,
        destination,
        destinationPort,
      }),
      { status: 200, headers }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Error interno al consultar VesselAPI: ' + e.message }), { status: 500, headers });
  }
}
