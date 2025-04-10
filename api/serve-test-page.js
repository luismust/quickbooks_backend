// api/serve-test-page.js - Sirve la página de prueba de carga de imágenes
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Para solicitudes OPTIONS, responder inmediatamente
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Solo permitir GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Elegir qué página servir
    const pageName = req.query.page || 'image-upload';
    let filePath;
    
    switch (pageName) {
      case 'test-upload':
        filePath = path.join(process.cwd(), 'test-upload-example.html');
        break;
      case 'image-upload':
      default:
        filePath = path.join(process.cwd(), 'image-upload-debug.html');
    }
    
    // Verificar si el archivo existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Test page not found' });
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
}; 