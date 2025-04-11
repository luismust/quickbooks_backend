// /api/images/[id].js
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

// Manejador para GET /api/images/[id]
async function handleGet(req, res) {
  const { id } = req.query;
  
  console.log('[IMAGES/ID] Received request for image ID:', id);
  
  if (!id) {
    return res.status(400).json({ error: 'Image ID is required' });
  }
  
  try {
    // Buscar la imagen en Vercel Blob Storage usando el patrón de nombre
    console.log(`[IMAGES/ID] Searching for image with ID: ${id}`);
    
    const blobs = await list({
      prefix: `image_${id}`,
      limit: 1
    });
    
    console.log(`[IMAGES/ID] Found ${blobs.blobs.length} blobs for ID: ${id}`);
    
    if (!blobs.blobs || blobs.blobs.length === 0) {
      console.warn(`[IMAGES/ID] No image found with ID: ${id}`);
      return res.status(404).json({ error: 'Image not found', id });
    }
    
    // Obtener el primer blob que coincide (debería ser único por ID)
    const blob = blobs.blobs[0];
    console.log('[IMAGES/ID] Blob properties:', {
      url: blob.url,
      size: blob.size,
      contentType: blob.contentType,
      pathname: blob.pathname
    });
    
    return res.status(200).json({ 
      id, 
      url: blob.url,
      contentType: blob.contentType,
      size: blob.size,
      pathname: blob.pathname,
      message: 'Image found successfully' 
    });
  } catch (error) {
    console.error('[IMAGES/ID] Error fetching image:', error);
    return res.status(500).json({ 
      error: 'Error fetching image',
      details: error.message
    });
  }
}

// Handler principal que dirige según el método HTTP
module.exports = handleWithCors(async (req, res) => {
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
});