// Un endpoint extremadamente simple dedicado solo a responder solicitudes OPTIONS
module.exports = (req, res) => {
  // Verificar qué cabeceras está solicitando el cliente
  const requestedHeaders = req.headers['access-control-request-headers'] || '';
  
  // Registrar información sobre la solicitud para depuración
  console.log('OPTIONS request headers:', req.headers);
  console.log('Requested headers:', requestedHeaders);
  
  // Convertir a minúsculas para comparación
  const requestedHeadersLower = requestedHeaders.toLowerCase();
  
  // Establecer una lista amplia de cabeceras permitidas
  let allowedHeaders = 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version';
  
  // Si se solicita content-type específicamente, asegurarnos de incluirla
  if (requestedHeadersLower.includes('content-type')) {
    // Ya está incluida en nuestra lista, pero nos aseguramos
    if (!allowedHeaders.toLowerCase().includes('content-type')) {
      allowedHeaders = `${allowedHeaders}, content-type`;
    }
  }
  
  // Establecer encabezados CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://tests-system.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', allowedHeaders);
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Responder siempre con 200 OK y terminar la solicitud
  res.status(200).end();
}; 