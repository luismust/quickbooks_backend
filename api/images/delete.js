// /api/images/delete.js
const { del, list } = require('@vercel/blob');
const cors = require('cors');

// Configurar CORS
const allowCors = cors({
  origin: '*', // Puedes restringir a tus dominios específicos
});

// Wrapper para añadir CORS a cada handler
const handleWithCors = (handler) => async (req, res) => {
  return allowCors(req, res, () => handler(req, res));
};

// Manejador para DELETE /api/images/delete
async function handleDelete(req, res) {
  try {
    // Verificar si es una solicitud DELETE o POST (para mayor compatibilidad)
    if (req.method !== 'DELETE' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    let { id, pathname } = req.method === 'DELETE' ? req.query : req.body;
    
    // Validar datos de entrada
    if (!id && !pathname) {
      return res.status(400).json({ error: 'Either image ID or pathname is required' });
    }

    console.log(`[IMAGES/DELETE] Deleting image: id=${id}, pathname=${pathname}`);
    
    // Si tenemos ID pero no pathname, buscar el pathname
    if (id && !pathname) {
      // Pattern para buscar el archivo correspondiente al ID
      const pattern = `image_${id}`;
      
      console.log(`[IMAGES/DELETE] Looking for image with pattern: ${pattern}`);
      
      // Listar blobs para encontrar el que coincide con el ID
      const blobs = await list({
        prefix: pattern,
        limit: 1
      });
      
      if (!blobs.blobs || blobs.blobs.length === 0) {
        return res.status(404).json({ error: `No image found with ID: ${id}` });
      }
      
      // Obtener el pathname del primer blob que coincide
      pathname = blobs.blobs[0].pathname;
      console.log(`[IMAGES/DELETE] Found image pathname: ${pathname}`);
    }
    
    // Eliminar el blob usando su pathname
    console.log(`[IMAGES/DELETE] Deleting blob with pathname: ${pathname}`);
    await del(pathname);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Image deleted successfully',
      deleted: { id, pathname }
    });
  } catch (error) {
    console.error('[IMAGES/DELETE] Error deleting image:', error);
    return res.status(500).json({ 
      error: 'Failed to delete image',
      details: error.message
    });
  }
}

// Handler principal
module.exports = handleWithCors(async (req, res) => {
  // DELETE: Eliminar imagen
  if (req.method === 'DELETE' || req.method === 'POST') {
    return handleDelete(req, res);
  } 
  // OPTIONS: Para preflight CORS
  else if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  // Otros métodos no permitidos
  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}); 