// api/_middleware.js
// Este middleware intercepta todas las solicitudes a la API y maneja CORS

module.exports = async (req, res, next) => {
  // Establecer cabeceras CORS para todas las solicitudes
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://quickbooks-test-black.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  res.setHeader('Access-Control-Max-Age', '86400');

  // Siempre responder inmediatamente a las solicitudes OPTIONS con 200 OK
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Para otros métodos, continuar con el flujo normal
  return next();
}; 