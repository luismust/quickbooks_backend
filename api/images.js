// api/images.js - Endpoint para obtener imágenes de Vercel Blob Storage
const { list, get } = require('@vercel/blob');

// Manejador para el endpoint de imágenes
module.exports = async (req, res) => {
  // Establecer cabeceras CORS
  const origin = req.headers.origin || 'https://quickbooks-test-black.vercel.app';
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Responder inmediatamente a las solicitudes OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Solo permitir solicitudes GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Obtener el ID de la imagen de la consulta
    const { id, redirect } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Image ID is required' });
    }
    
    console.log(`[IMAGES] Looking for image with ID: ${id}, redirect=${redirect}`);
    
    // Formato esperado del nombre de archivo
    const imagePattern = `image_${id}.*`;
    
    // Listar archivos en Vercel Blob que coincidan con el patrón
    const blobs = await list({
      prefix: `image_${id}`,
      limit: 1
    });
    
    console.log(`[IMAGES] Found ${blobs.blobs.length} matching blobs for ID: ${id}`);
    
    if (!blobs.blobs || blobs.blobs.length === 0) {
      console.warn(`[IMAGES] No image found with ID: ${id}`);
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Obtener el primer blob que coincide (debería ser único por ID)
    const blob = blobs.blobs[0];
    const imageUrl = blob.url;
    
    // Si se solicita redirección, redireccionar directamente
    if (redirect === '1' || redirect === 'true') {
      console.log(`[IMAGES] Redirecting to Blob URL: ${imageUrl}`);
      return res.redirect(imageUrl);
    }
    
    return res.status(200).json({
      id: id,
      url: imageUrl,
      size: blob.size,
      type: blob.contentType || 'image/jpeg',
      source: 'vercel-blob',
      uploadedAt: blob.uploadedAt
    });
    
  } catch (error) {
    console.error('[IMAGES] Error getting image:', error);
    return res.status(500).json({ 
      error: 'Failed to get image',
      details: error.message
    });
  }
}; 