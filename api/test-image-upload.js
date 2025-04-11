// api/test-image-upload.js
// Endpoint para probar y depurar la carga de imágenes a Vercel Blob Storage

const { put } = require('@vercel/blob');
const { Readable } = require('stream');

// Función para generar un ID único
function generateUniqueId() {
  return 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

module.exports = async (req, res) => {
  // Establecer cabeceras CORS para permitir solicitudes desde el frontend
  const origin = req.headers.origin || 'https://quickbooks-test-black.vercel.app';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Responder a las solicitudes OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[TEST-UPLOAD] Recibida solicitud de prueba para subir imagen');
    
    // Parsear el cuerpo de la solicitud
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (error) {
        return res.status(400).json({ 
          error: 'Invalid JSON body',
          details: error.message
        });
      }
    }
    
    const { imageData } = body;
    
    if (!imageData) {
      return res.status(400).json({ 
        error: 'Image data is required',
        received: body
      });
    }
    
    console.log(`[TEST-UPLOAD] Recibidos datos de imagen: ${typeof imageData}, longitud: ${imageData.length}`);
    
    // Analizar datos de la imagen
    if (!imageData.startsWith('data:')) {
      return res.status(400).json({ 
        error: 'Invalid image format, must be a data URL',
        sample: imageData.substring(0, 50)
      });
    }
    
    // Extraer información de la imagen
    const matches = imageData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ 
        error: 'Invalid base64 image format',
        matches: matches ? matches.length : 0
      });
    }
    
    const mimeType = matches[1];
    const base64Content = matches[2];
    
    // Validar el contenido base64
    if (!base64Content || base64Content.length < 100) {
      return res.status(400).json({ 
        error: 'Base64 content too short or invalid',
        length: base64Content ? base64Content.length : 0
      });
    }
    
    console.log(`[TEST-UPLOAD] Imagen válida, tipo: ${mimeType}, tamaño base64: ${base64Content.length}`);
    
    // Generar un ID y nombre de archivo
    const imageId = generateUniqueId();
    const extension = mimeType.split('/')[1] || 'jpg';
    const fileName = `test_${imageId}.${extension}`;
    
    try {
      console.log(`[TEST-UPLOAD] Preparando para subir imagen a Vercel Blob Storage...`);
      
      // Convertir base64 a buffer
      const buffer = Buffer.from(base64Content, 'base64');
      console.log(`[TEST-UPLOAD] Buffer creado con tamaño: ${buffer.length} bytes`);
      
      // Método 1: Usar stream (enfoque recomendado)
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null); // Indica fin del stream
      
      console.log(`[TEST-UPLOAD] Subiendo imagen via stream...`);
      const blob = await put(fileName, stream, {
        contentType: mimeType,
        access: 'public',
      });
      
      if (!blob || !blob.url) {
        console.error('[TEST-UPLOAD] Error: No se recibió URL del blob');
        return res.status(500).json({ 
          error: 'Failed to upload image, no URL returned',
          blob
        });
      }
      
      console.log(`[TEST-UPLOAD] ¡Imagen subida exitosamente! URL: ${blob.url}`);
      
      return res.status(200).json({
        success: true,
        message: 'Image uploaded successfully',
        imageId,
        fileName,
        url: blob.url,
        mimeType,
        size: blob.size,
        uploadTime: new Date().toISOString()
      });
      
    } catch (uploadError) {
      console.error('[TEST-UPLOAD] Error al subir a Vercel Blob:', uploadError);
      return res.status(500).json({ 
        error: 'Failed to upload to Vercel Blob Storage',
        details: uploadError.message,
        stack: uploadError.stack
      });
    }
    
  } catch (error) {
    console.error('[TEST-UPLOAD] Error general:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      stack: error.stack
    });
  }
}; 