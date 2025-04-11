// /api/images/upload.js
const { put } = require('@vercel/blob');
const crypto = require('crypto');
const cors = require('cors');

// Configurar CORS
const allowCors = cors({
  origin: '*', // Puedes restringir a tus dominios específicos
});

// Wrapper para añadir CORS a cada handler
const handleWithCors = (handler) => async (req, res) => {
  return allowCors(req, res, () => handler(req, res));
};

// Generar ID único para las imágenes
function generateUniqueId() {
  return crypto.randomBytes(8).toString('hex');
}

// Manejador para POST /api/images/upload
async function handlePost(req, res) {
  try {
    // Parse JSON body if it's a string
    if (typeof req.body === 'string') {
      try {
        req.body = JSON.parse(req.body);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
    }
    
    const { imageData, fileName } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ error: 'Image data is required' });
    }
    
    console.log('[IMAGES/UPLOAD] Processing image upload...');
    
    // Generar ID único para la imagen
    const imageId = generateUniqueId();
    
    // Extraer información de la imagen base64
    let mimeType, base64Content, actualFileName;
    
    if (imageData.startsWith('data:')) {
      // Formato: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...
      const matches = imageData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      
      if (!matches || matches.length !== 3) {
        console.warn(`[IMAGES/UPLOAD] Invalid base64 image format`);
        return res.status(400).json({ error: 'Invalid base64 image format' });
      }
      
      mimeType = matches[1];
      base64Content = matches[2];
      
      // Generar un nombre de archivo basado en el tipo MIME
      const extension = mimeType.split('/')[1] || 'jpg';
      actualFileName = fileName || `image_${imageId}.${extension}`;
      
      console.log(`[IMAGES/UPLOAD] Successfully extracted image data, mime: ${mimeType}, filename: ${actualFileName}`);
    } else {
      // Si no es data:, rechazar
      console.warn(`[IMAGES/UPLOAD] Unsupported image format, only base64 is accepted`);
      return res.status(400).json({ error: 'Only base64 data URLs are accepted' });
    }
    
    // Validar que el contenido base64 es válido
    if (!base64Content || base64Content.length < 100) {
      console.warn(`[IMAGES/UPLOAD] Base64 content too short or invalid, length: ${base64Content ? base64Content.length : 0}`);
      return res.status(400).json({ error: 'Invalid or too small base64 content' });
    }
    
    try {
      // Convertir base64 a buffer para upload
      const buffer = Buffer.from(base64Content, 'base64');
      
      if (!buffer || buffer.length === 0) {
        console.error(`[IMAGES/UPLOAD] Failed to create buffer from base64`);
        return res.status(400).json({ error: 'Failed to process image data' });
      }
      
      console.log(`[IMAGES/UPLOAD] Created buffer of size ${buffer.length} bytes`);
      
      // Guardar el nombre de archivo con el prefijo del ID para facilitar la búsqueda después
      const blobFileName = `image_${imageId}.${actualFileName.split('.').pop()}`;
      
      // Subir a Vercel Blob Storage
      const blob = await put(blobFileName, buffer, {
        contentType: mimeType,
        access: 'public', // Hacemos que sea accesible públicamente
      });
      
      if (!blob || !blob.url) {
        console.error('[IMAGES/UPLOAD] Failed to upload to Vercel Blob Storage');
        return res.status(500).json({ error: 'Failed to store image' });
      }
      
      console.log(`[IMAGES/UPLOAD] Successfully uploaded image to Vercel Blob: ${blob.url}`);
      
      return res.status(200).json({
        success: true,
        imageId,
        url: blob.url,
        reference: blobFileName,
        contentType: mimeType,
        size: blob.size,
        message: 'Image uploaded successfully'
      });
    } catch (uploadError) {
      console.error(`[IMAGES/UPLOAD] Failed to upload image:`, uploadError);
      return res.status(500).json({ 
        error: 'Failed to upload image to storage',
        details: uploadError.message
      });
    }
  } catch (error) {
    console.error('[IMAGES/UPLOAD] Error uploading image:', error);
    return res.status(500).json({ 
      error: 'Failed to upload image',
      details: error.message
    });
  }
}

// Handler principal
module.exports = handleWithCors(async (req, res) => {
  if (req.method === 'POST') {
    return handlePost(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
});