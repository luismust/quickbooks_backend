// api/index.js - Punto de entrada para Vercel
const testsHandler = require('./tests');
const fs = require('fs');
const path = require('path');

// Endpoint principal
module.exports = async (req, res) => {
  console.log('API Root accessed');
  
  // Configurar CORS
  const origin = req.headers.origin || 'https://tests-system.vercel.app';
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Para solicitudes OPTIONS, responder inmediatamente
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Verificar ruta solicitada
  const { pathname = '/' } = new URL(req.url, `https://${req.headers.host}`);
  
  // Para solicitudes GET a la raíz, responder con información de estado
  if (req.method === 'GET' && pathname === '/') {
    return res.status(200).json({
      status: 'ok',
      message: 'Quickbook Backend API',
      endpoints: [
        '/api/tests - Obtener o crear tests',
        '/api/images - Obtener imágenes',
        '/api/airtable-check - Verificar configuración de Airtable'
      ],
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  }
  
  // Para otros métodos, devolver error
  return res.status(405).json({ error: 'Method not allowed' });
};

// Función para servir las páginas de prueba
async function serveTestPage(req, res, pathname) {
  try {
    // Determinar qué archivo servir basado en la ruta
    let filePath;
    if (pathname === '/image-upload-debug.html') {
      filePath = path.join(process.cwd(), 'image-upload-debug.html');
    } else if (pathname === '/test-upload-example.html') {
      filePath = path.join(process.cwd(), 'test-upload-example.html');
    } else {
      return res.status(404).json({ error: 'Test page not found' });
    }
    
    // Verificar si el archivo existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Test page file not found' });
    }
    
    // Leer el archivo
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Configurar cabecera para HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    
    // Devolver el contenido
    return res.status(200).send(content);
  } catch (error) {
    console.error('Error serving test page:', error);
    return res.status(500).json({
      error: 'Failed to serve test page',
      details: error.message
    });
  }
} 