// /api/images/list.js
const { list } = require('@vercel/blob');
const cors = require('cors');

// Configurar CORS
const allowCors = cors({
  origin: '*', // Puedes restringir a tus dominios específicos
});

// Wrapper para añadir CORS a cada handler
const handleWithCors = (handler) => async (req, res) => {
  return allowCors(req, res, () => handler(req, res));
};

// Manejador para GET /api/images/list
async function handleGet(req, res) {
  try {
    console.log('[IMAGES/LIST] Listing all images from Vercel Blob Storage');
    
    // Parámetros de paginación opcionales
    const { limit = 100, prefix = '', cursor } = req.query;
    
    // Listar blobs con paginación
    const blobs = await list({
      limit: parseInt(limit),
      prefix,
      cursor
    });
    
    console.log(`[IMAGES/LIST] Found ${blobs.blobs.length} images`);
    
    // Transformar a un formato más amigable
    const images = blobs.blobs.map(blob => ({
      url: blob.url,
      pathname: blob.pathname,
      size: blob.size,
      contentType: blob.contentType,
      uploadedAt: blob.uploadedAt,
      // Extraer el ID de la imagen del nombre del archivo (image_ID.ext)
      id: blob.pathname.startsWith('image_') 
        ? blob.pathname.substring(6, blob.pathname.lastIndexOf('.')) 
        : blob.pathname
    }));
    
    return res.status(200).json({
      images,
      count: images.length,
      cursor: blobs.cursor,
      hasMore: blobs.hasMore
    });
  } catch (error) {
    console.error('[IMAGES/LIST] Error listing images:', error);
    return res.status(500).json({
      error: 'Failed to list images',
      details: error.message
    });
  }
}

// Handler principal
module.exports = handleWithCors(async (req, res) => {
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}); 