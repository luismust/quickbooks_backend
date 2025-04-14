// api/images.js - Endpoint para gestionar imágenes de Vercel Blob Storage
const { list, get, put, del } = require('@vercel/blob');
const crypto = require('crypto');
const fetch = require('node-fetch'); // Asegúrate de que esté instalado

// Función para obtener y servir imágenes como datos binarios
async function serveImageAsBinary(url, res) {
  try {
    console.log(`[IMAGES] Retrieving binary data from: ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[IMAGES] Failed to fetch image: ${response.status} ${response.statusText}`);
      return false;
    }
    
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.buffer();
    
    console.log(`[IMAGES] Successfully retrieved image: ${contentType}, ${buffer.length} bytes`);
    
    // Configurar cabeceras para la imagen
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Enviar la imagen
    res.status(200).send(buffer);
    return true;
  } catch (error) {
    console.error(`[IMAGES] Error serving binary image: ${error.message}`);
    return false;
  }
}

// Generar ID único para las imágenes
function generateUniqueId() {
  return crypto.randomBytes(8).toString('hex');
}

// Manejador para el endpoint de imágenes
module.exports = async (req, res) => {
  // Establecer cabeceras CORS - aceptar cualquier origen para las imágenes
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Length');
  
  // Responder inmediatamente a las solicitudes OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Determinar la operación a realizar basada en parámetros
    const { id, action, redirect, pathname } = req.query;
    
    // ===== OPERACIÓN: OBTENER UNA IMAGEN =====
    if (req.method === 'GET' && id && !action) {
      console.log(`[IMAGES] Looking for image with ID: ${id}, redirect=${redirect}`);
      
      // Limpiar el ID - si viene con formato q_123456 necesitamos quitarle el prefijo q_
      let cleanId = id;
      if (id.startsWith('q_')) {
        cleanId = id;
      }
      
      // Si el ID no tiene el prefijo 'image_', hacer búsquedas con y sin él
      let searchResults = [];
      
      // Búsqueda 1: Buscar con prefijo image_ + ID
      let searchPrefix1 = cleanId.startsWith('image_') ? cleanId : `image_${cleanId}`;
      console.log(`[IMAGES] Search attempt 1: ${searchPrefix1}`);
      
      try {
        const blobs1 = await list({
          prefix: searchPrefix1,
          limit: 5
        });
        
        if (blobs1.blobs && blobs1.blobs.length > 0) {
          searchResults = searchResults.concat(blobs1.blobs);
          console.log(`[IMAGES] Found ${blobs1.blobs.length} blobs with prefix ${searchPrefix1}`);
        }
      } catch (err) {
        console.error(`[IMAGES] Error in search 1:`, err);
      }
      
      // Búsqueda 2: Buscar sin ningún prefijo (patrones adicionales)
      if (searchResults.length === 0) {
        try {
          // Buscar patrones que puedan contener el ID en cualquier parte del nombre
          const blobs2 = await list({
            limit: 100
          });
          
          if (blobs2.blobs && blobs2.blobs.length > 0) {
            // Filtrar los resultados que contengan el ID en alguna parte
            const filteredBlobs = blobs2.blobs.filter(blob => 
              blob.pathname.includes(cleanId) || 
              (cleanId.length > 8 && blob.pathname.includes(cleanId.substring(0, 8)))
            );
            
            if (filteredBlobs.length > 0) {
              searchResults = searchResults.concat(filteredBlobs);
              console.log(`[IMAGES] Found ${filteredBlobs.length} blobs through pattern matching for ${cleanId}`);
            }
          }
        } catch (err) {
          console.error(`[IMAGES] Error in search 2:`, err);
        }
      }
      
      console.log(`[IMAGES] Total search results: ${searchResults.length}`);
      
      if (searchResults.length === 0) {
        console.warn(`[IMAGES] No image found for ID: ${id} after multiple search attempts`);
        return res.status(404).json({ 
          error: 'Image not found', 
          id: id,
          cleanId: cleanId,
          searchPatterns: [searchPrefix1]
        });
      }
      
      // Obtener el primer blob que coincide
      const blob = searchResults[0];
      const imageUrl = blob.url;
      
      console.log(`[IMAGES] Found image: ${blob.pathname}, URL: ${imageUrl}`);
      
      // Si se solicita redirección, redireccionar directamente
      if (redirect === '1' || redirect === 'true') {
        console.log(`[IMAGES] Redirecting to Blob URL: ${imageUrl}`);
        
        // Agregar encabezados para caché y CORS antes de redireccionar
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache por 24 horas
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        // Intentar servir la imagen directamente en lugar de redirigir
        if (redirect === 'data') {
          console.log(`[IMAGES] Attempting to serve image as binary data`);
          const success = await serveImageAsBinary(imageUrl, res);
          if (success) {
            return; // La respuesta ya fue enviada por serveImageAsBinary
          }
          console.log(`[IMAGES] Binary data serving failed, falling back to redirect`);
          // Si falla, continuamos con la redirección normal
        }
        
        // Usar un iframe o una etiqueta img directa podría funcionar mejor que una redirección
        if (redirect === 'iframe') {
          return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Image ${id}</title>
              <style>body,html{margin:0;padding:0;height:100%;width:100%;overflow:hidden}img{max-width:100%;max-height:100%;}</style>
              <meta http-equiv="Access-Control-Allow-Origin" content="*">
            </head>
            <body>
              <img src="${imageUrl}" alt="Image ${id}" crossorigin="anonymous" />
            </body>
            </html>
          `);
        } else if (redirect === 'html') {
          return res.send(`<img src="${imageUrl}" alt="Image ${id}" style="max-width:100%" crossorigin="anonymous" />`);
        } else {
          // Intentar servir como binario primero antes de redirigir
          console.log(`[IMAGES] Attempting to serve image as binary data before standard redirect`);
          const success = await serveImageAsBinary(imageUrl, res);
          if (success) {
            return; // La respuesta ya fue enviada por serveImageAsBinary
          }
          
          // Si falla el servicio binario, hacer redirección estándar
          console.log(`[IMAGES] Falling back to standard redirect`);
          return res.redirect(imageUrl);
        }
      }
      
      return res.status(200).json({
        id: id,
        url: imageUrl,
        size: blob.size,
        type: blob.contentType || 'image/jpeg',
        source: 'vercel-blob',
        pathname: blob.pathname,
        uploadedAt: blob.uploadedAt
      });
    }

    // ===== OPERACIÓN: LISTAR IMÁGENES =====
    else if (req.method === 'GET' && action === 'list') {
      console.log('[IMAGES] Listing all images from Vercel Blob Storage');
      
      // Parámetros de paginación opcionales
      const { limit = 100, prefix = '', cursor } = req.query;
      
      // Listar blobs con paginación
      const blobs = await list({
        limit: parseInt(limit),
        prefix,
        cursor
      });
      
      console.log(`[IMAGES] Found ${blobs.blobs.length} images`);
      
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
    }

    // ===== OPERACIÓN: SUBIR IMAGEN =====
    else if (req.method === 'POST' && action === 'upload') {
      console.log('[IMAGES] Processing image upload...');
      
      // Parse JSON body if it's a string
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (error) {
          return res.status(400).json({ error: 'Invalid JSON body' });
        }
      }
      
      const { imageData, fileName } = body;
      
      if (!imageData) {
        return res.status(400).json({ error: 'Image data is required' });
      }
      
      // Generar ID único para la imagen
      const imageId = generateUniqueId();
      
      // Extraer información de la imagen base64
      let mimeType, base64Content, actualFileName;
      
      if (imageData.startsWith('data:')) {
        // Formato: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...
        const matches = imageData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        
        if (!matches || matches.length !== 3) {
          console.warn(`[IMAGES] Invalid base64 image format`);
          return res.status(400).json({ error: 'Invalid base64 image format' });
        }
        
        mimeType = matches[1];
        base64Content = matches[2];
        
        // Generar un nombre de archivo basado en el tipo MIME
        const extension = mimeType.split('/')[1] || 'jpg';
        actualFileName = fileName || `image_${imageId}.${extension}`;
        
        console.log(`[IMAGES] Successfully extracted image data, mime: ${mimeType}, filename: ${actualFileName}`);
      } else {
        // Si no es data:, rechazar
        console.warn(`[IMAGES] Unsupported image format, only base64 is accepted`);
        return res.status(400).json({ error: 'Only base64 data URLs are accepted' });
      }
      
      // Validar que el contenido base64 es válido
      if (!base64Content || base64Content.length < 100) {
        console.warn(`[IMAGES] Base64 content too short or invalid, length: ${base64Content ? base64Content.length : 0}`);
        return res.status(400).json({ error: 'Invalid or too small base64 content' });
      }
      
      try {
        // Convertir base64 a buffer para upload
        const buffer = Buffer.from(base64Content, 'base64');
        
        if (!buffer || buffer.length === 0) {
          console.error(`[IMAGES] Failed to create buffer from base64`);
          return res.status(400).json({ error: 'Failed to process image data' });
        }
        
        console.log(`[IMAGES] Created buffer of size ${buffer.length} bytes`);
        
        // Guardar el nombre de archivo con el prefijo del ID para facilitar la búsqueda después
        const blobFileName = `image_${imageId}.${actualFileName.split('.').pop()}`;
        
        // Crear un stream a partir del buffer
        const { Readable } = require('stream');
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null); // Indica fin del stream
        
        // Subir a Vercel Blob Storage usando el enfoque recomendado
        const blob = await put(blobFileName, stream, {
          contentType: mimeType,
          access: 'public', // Hacemos que sea accesible públicamente
        });
        
        if (!blob || !blob.url) {
          console.error('[IMAGES] Failed to upload to Vercel Blob Storage');
          return res.status(500).json({ error: 'Failed to store image' });
        }
        
        console.log(`[IMAGES] Successfully uploaded image to Vercel Blob: ${blob.url}`);
        
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
        console.error(`[IMAGES] Failed to upload image:`, uploadError);
        return res.status(500).json({ 
          error: 'Failed to upload image to storage',
          details: uploadError.message
        });
      }
    }

    // ===== OPERACIÓN: ELIMINAR IMAGEN =====
    else if ((req.method === 'DELETE' || (req.method === 'POST' && action === 'delete'))) {
      let deleteId = id;
      let deletePathname = pathname;
      
      // Para solicitudes POST, también revisar el cuerpo para los parámetros
      if (req.method === 'POST') {
        // Parse JSON body if it's a string
        let body = req.body;
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch (error) {
            // Si falla, continuamos con los parámetros de la consulta
          }
        }
        
        // Si body es un objeto, extraer id y pathname
        if (body && typeof body === 'object') {
          deleteId = deleteId || body.id;
          deletePathname = deletePathname || body.pathname;
        }
      }
      
      // Validar datos de entrada
      if (!deleteId && !deletePathname) {
        return res.status(400).json({ error: 'Either image ID or pathname is required' });
      }

      console.log(`[IMAGES] Deleting image: id=${deleteId}, pathname=${deletePathname}`);
      
      // Si tenemos ID pero no pathname, buscar el pathname
      if (deleteId && !deletePathname) {
        // Pattern para buscar el archivo correspondiente al ID
        const pattern = `image_${deleteId}`;
        
        console.log(`[IMAGES] Looking for image with pattern: ${pattern}`);
        
        // Listar blobs para encontrar el que coincide con el ID
        const blobs = await list({
          prefix: pattern,
          limit: 1
        });
        
        if (!blobs.blobs || blobs.blobs.length === 0) {
          return res.status(404).json({ error: `No image found with ID: ${deleteId}` });
        }
        
        // Obtener el pathname del primer blob que coincide
        deletePathname = blobs.blobs[0].pathname;
        console.log(`[IMAGES] Found image pathname: ${deletePathname}`);
      }
      
      // Eliminar el blob usando su pathname
      console.log(`[IMAGES] Deleting blob with pathname: ${deletePathname}`);
      await del(deletePathname);
      
      return res.status(200).json({ 
        success: true, 
        message: 'Image deleted successfully',
        deleted: { id: deleteId, pathname: deletePathname }
      });
    }
    
    // ===== OPERACIÓN: NO RECONOCIDA =====
    else {
      return res.status(400).json({ 
        error: 'Invalid operation', 
        method: req.method,
        params: { id, action, redirect, pathname }
      });
    }
  } catch (error) {
    console.error('[IMAGES] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to process image operation',
      details: error.message
    });
  }
}; 