// api/index.js - Punto de entrada para Vercel
const testsHandler = require('./tests');

// Endpoint principal que redirige a /api/tests
module.exports = async (req, res) => {
  console.log('API Root accessed, redirecting to /api/tests');
  
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://quickbooks-test-black.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Para solicitudes OPTIONS, responder inmediatamente
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Para solicitudes GET, responder con información de estado
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      message: 'Quickbook Backend API',
      endpoints: [
        '/api/tests - Obtener o crear tests',
        '/api/images - Obtener imágenes',
        '/api/airtable-check - Verificar configuración de Airtable',
        '/api/tests-image-debug - Diagnosticar problemas de carga de imágenes'
      ],
      test_pages: [
        '/image-upload-debug.html - Prueba de carga de imágenes',
        '/test-upload-example.html - Prueba de creación de tests completos'
      ],
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  }
  
  // Para otros métodos, devolver error
  return res.status(405).json({ error: 'Method not allowed' });
}; 