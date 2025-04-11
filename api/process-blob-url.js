// api/process-blob-url.js
// Endpoint específico para procesar URLs de tipo blob:// y convertirlos a URLs de Vercel Blob Storage

const { put } = require('@vercel/blob');
const { Readable } = require('stream');
const axios = require('axios');
const crypto = require('crypto');

// Función para generar ID único
function generateUniqueId() {
  return crypto.randomBytes(8).toString('hex');
}

// Función para extraer ID de blob URL
function extractIdFromBlobUrl(blobUrl) {
  try {
    const matches = blobUrl.match(/blob:https?:\/\/[^/]+\/([a-f0-9-]+)/i);
    if (matches && matches[1]) {
      return matches[1].substring(0, 8);
    }
    return null;
  } catch (error) {
    console.error('[PROCESS-BLOB] Error extracting ID from blob URL:', error);
    return null;
  }
}

// Función para asegurar que una URL tenga el protocolo https://
function ensureHttpsProtocol(url) {
  if (!url) return '';
  if (url.startsWith('https://')) return url;
  if (url.startsWith('http://')) return url.replace('http://', 'https://');
  return `https://${url}`;
}

module.exports = async (req, res) => {
  // Configurar CORS
  const origin = req.headers.origin || 'https://quickbooks-test-black.vercel.app';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    console.log('[PROCESS-BLOB] Recibida solicitud para procesar blob URL');
    
    // Obtener datos del cuerpo
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }
    
    const { blobUrl, imageData, questionId } = body;
    
    // Verificar datos obligatorios
    if (!blobUrl) {
      return res.status(400).json({ error: 'blobUrl is required' });
    }
    
    console.log(`[PROCESS-BLOB] Procesando blob URL: ${blobUrl}`);
    
    // Si no tenemos datos de imagen pero tenemos blob URL, intentar capturar los datos
    if (!imageData && blobUrl.startsWith('blob:')) {
      return res.status(400).json({ 
        error: 'imageData is required',
        message: 'No se puede procesar un blob URL sin datos de imagen directamente desde el servidor. Asegúrate de incluir los datos base64 de la imagen.'
      });
    }
    
    // Verificar formato de imageData
    if (!imageData || !imageData.startsWith('data:')) {
      return res.status(400).json({ 
        error: 'Invalid imageData format',
        message: 'Los datos de imagen deben estar en formato data:image/XXX;base64,...'
      });
    }
    
    // Extraer información de la imagen
    const matches = imageData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid base64 image format' });
    }
    
    const mimeType = matches[1];
    const base64Content = matches[2];
    
    // Generar ID para la imagen
    const blobId = extractIdFromBlobUrl(blobUrl);
    const imageId = questionId || blobId || generateUniqueId();
    const extension = mimeType.split('/')[1] || 'jpg';
    const fileName = `image_${imageId}.${extension}`;
    
    console.log(`[PROCESS-BLOB] Preparando subida: ID=${imageId}, fileName=${fileName}`);
    
    try {
      // Convertir base64 a buffer
      const buffer = Buffer.from(base64Content, 'base64');
      
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: 'Invalid base64 content' });
      }
      
      console.log(`[PROCESS-BLOB] Creado buffer de tamaño: ${buffer.length} bytes`);
      
      // Crear stream para subida
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null); // Finalizar stream
      
      console.log(`[PROCESS-BLOB] Subiendo a Vercel Blob Storage...`);
      
      // Subir a Vercel Blob Storage
      const blob = await put(fileName, stream, {
        contentType: mimeType,
        access: 'public',
      });
      
      if (!blob || !blob.url) {
        return res.status(500).json({ error: 'Failed to upload to Vercel Blob Storage' });
      }
      
      console.log(`[PROCESS-BLOB] Imagen subida exitosamente: ${blob.url}`);
      
      // También actualizar la información en el endpoint de imágenes
      try {
        let apiUrl = process.env.VERCEL_URL || 'quickbooks-backend.vercel.app';
        apiUrl = ensureHttpsProtocol(apiUrl);
        
        await axios.post(`${apiUrl}/api/tests?id=${imageId}`, {
          imageId: imageId,
          imageUrl: blob.url
        });
        
        console.log(`[PROCESS-BLOB] Actualizada referencia en API de tests`);
      } catch (apiError) {
        console.error(`[PROCESS-BLOB] Error al actualizar API:`, apiError.message);
        // No fallar por este error
      }
      
      return res.status(200).json({
        success: true,
        message: 'Blob URL procesada exitosamente',
        blobUrl: blobUrl,
        imageId: imageId,
        url: blob.url,
        originalType: mimeType,
        size: blob.size
      });
      
    } catch (uploadError) {
      console.error(`[PROCESS-BLOB] Error en subida:`, uploadError);
      return res.status(500).json({
        error: 'Error uploading image',
        details: uploadError.message,
        stack: uploadError.stack
      });
    }
    
  } catch (error) {
    console.error(`[PROCESS-BLOB] Error general:`, error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      stack: error.stack
    });
  }
}; 