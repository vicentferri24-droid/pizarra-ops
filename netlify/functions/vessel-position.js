// Función de Netlify: consulta la posición de un barco por su IMO en VesselAPI.
// La clave (VESSELAPI_KEY) se lee de una variable de entorno de Netlify —
// nunca se manda al navegador del usuario, así nadie puede verla mirando el
// código fuente de la página.
//
// Se llama desde la web así: /.netlify/functions/vessel-position?imo=1234567

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  const imo = ((event.queryStringParameters && event.queryStringParameters.imo) || '').replace(/[^0-9]/g, '');
  if (!imo) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta el parámetro imo' }) };
  }

  const apiKey = process.env.VESSELAPI_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falta configurar VESSELAPI_KEY en Netlify (Project configuration → Environment variables)' }) };
  }

  try {
    const url = `https://api.vesselapi.com/v1/vessel/${imo}/position?filter.idType=imo`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return {
        statusCode: resp.status,
        headers,
        body: JSON.stringify({ error: `VesselAPI devolvió un error (${resp.status}): ${text.slice(0, 300)}` }),
      };
    }

    const data = await resp.json();
    // La API real devuelve los datos dentro de "vesselPosition" (no "vessel").
    // Se dejan los otros nombres como red de seguridad por si cambia el formato.
    const v = data.vesselPosition || data.vessel || data;

    if (v.latitude == null || v.longitude == null) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No se encontró posición para ese IMO' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        lat: v.latitude,
        lng: v.longitude,
        speed: v.sog != null ? v.sog : null,
        course: v.cog != null ? v.cog : null,
        vesselName: v.vessel_name || null,
        timestamp: v.timestamp || null,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error interno al consultar VesselAPI: ' + e.message }) };
  }
};
