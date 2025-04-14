// api/images.js - Endpoint para gestionar imágenes de Vercel Blob Storage
const { list, get, put, del } = require('@vercel/blob');
const crypto = require('crypto');
const fetch = require('node-fetch'); // Asegúrate de que esté instalado

// Función para obtener y servir imágenes como datos binarios
async function serveImageAsBinary(url, res, req) {
  try {
    console.log(`[IMAGES] Retrieving binary data from: ${url}`);
    console.log(`[IMAGES] Request origin: ${req.headers.origin || 'Unknown'}`);
    
    // Configurar cabeceras CORS desde el principio (incluso antes de obtener la imagen)
    // De esta manera, si hay un error, las cabeceras ya estarán configuradas
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', '*'); // Siempre usar '*' para imágenes
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 horas
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'image/*',
        'User-Agent': 'vercel-serverless-function',
      },
      timeout: 5000 // 5 segundos timeout
    });
    
    if (!response.ok) {
      console.error(`[IMAGES] Failed to fetch image: ${response.status} ${response.statusText}`);
      return false;
    }
    
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.buffer();
    
    console.log(`[IMAGES] Successfully retrieved image: ${contentType}, ${buffer.length} bytes`);
    
    // Configurar cabeceras específicas para la imagen
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
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
  // Configuración CORS con wildcards y headers específicos para todos los orígenes
  // Incluir 'Vary: Origin' para indicar que la respuesta puede variar según el origen
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 horas
  res.setHeader('Vary', 'Origin');
  
  // Responder inmediatamente a las solicitudes OPTIONS
  if (req.method === 'OPTIONS') {
    console.log(`[IMAGES] Handling OPTIONS request from origin: ${origin}`);
    return res.status(200).end();
  }

  try {
    // Determinar la operación a realizar basada en parámetros
    const { id, url, action, redirect, pathname, fallback } = req.query;
    
    // ===== OPERACIÓN: OBTENER UNA IMAGEN =====
    if (req.method === 'GET' && (id || url) && !action) {
      console.log(`[IMAGES] Request params: id=${id}, url=${url}, redirect=${redirect}, fallback=${fallback}`);
      console.log(`[IMAGES] Origin: ${req.headers.origin || 'unknown'}, Referer: ${req.headers.referer || 'unknown'}`);
      
      // Reforzar encabezados CORS para cualquier operación GET
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '86400');
      
      // Si tenemos una URL directa
      if (url) {
        console.log(`[IMAGES] Loading image from direct URL: ${url}`);
        
        // Si es modo fallback, intentar un enfoque diferente
        if (fallback === '1') {
          // Generar una respuesta HTML con la imagen incrustada
          console.log(`[IMAGES] Using fallback HTML approach for URL: ${url}`);
          return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Image</title>
              <meta http-equiv="Access-Control-Allow-Origin" content="*">
              <style>body,html{margin:0;padding:0;height:100%;width:100%;overflow:hidden}img{max-width:100%;max-height:100%;}</style>
            </head>
            <body>
              <img src="${url}" alt="Image" crossorigin="anonymous" style="max-width:100%" />
            </body>
            </html>
          `);
        }
        
        // Intentar cargar la imagen y servirla como binario
        const success = await serveImageAsBinary(url, res, req);
        if (success) {
          return; // La respuesta ya fue enviada
        }
        
        // Si falla, redireccionar
        return res.redirect(url);
      }
      
      // Resto del código para buscar por ID...
      if (id && !action) {
        console.log(`[IMAGES] Looking for image with ID: ${id}, redirect=${redirect}`);
        
        // Limpiar el ID - eliminar cualquier prefijo si existe
        let cleanId = id;
        
        // Si el ID no tiene el prefijo 'image_', añadirlo para buscar en Blob Storage
        let searchPrefix = cleanId.startsWith('image_') ? cleanId : `image_${cleanId}`;
        console.log(`[IMAGES] Search using prefix: ${searchPrefix}`);
        
        try {
          // Búsqueda directa con el ID limpio
          const blobs = await list({
            prefix: searchPrefix,
            limit: 5
          });
          
          if (!blobs.blobs || blobs.blobs.length === 0) {
            console.warn(`[IMAGES] No image found for ID: ${id} with search prefix: ${searchPrefix}`);
            return res.status(404).json({ 
              error: 'Image not found', 
              id: id,
              searchPrefix: searchPrefix
            });
          }
          
          // Obtener el primer blob que coincide
          const blob = blobs.blobs[0];
          const imageUrl = blob.url;
          
          console.log(`[IMAGES] Found image: ${blob.pathname}, URL: ${imageUrl}`);
          
          // Si se solicita redirección, redireccionar directamente
          if (redirect === '1' || redirect === 'true') {
            console.log(`[IMAGES] Redirecting to Blob URL: ${imageUrl}, origin: ${req.headers.origin || 'Unknown'}`);
            
            // Siempre añadir encabezados CORS aquí también para evitar problemas
            // No importa si es redundante, mejor asegurar que los encabezados estén presentes
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
            
            // Intentar servir directamente como binario
            try {
              const success = await serveImageAsBinary(imageUrl, res, req);
              if (success) {
                return; // La respuesta ya fue enviada
              }
            } catch (err) {
              console.error(`[IMAGES] Error serving binary: ${err.message}`);
            }
            
            // Si fallamos en binario, intentar con HTML iframe como respaldo
            if (redirect === 'data' || fallback === '1') {
              console.log(`[IMAGES] Attempting iframe HTML fallback for ${imageUrl}`);
              return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                  <title>Image Proxy</title>
                  <meta http-equiv="Access-Control-Allow-Origin" content="*" />
                  <style>
                    body, html { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
                    img { max-width: 100%; max-height: 100%; display: block; margin: 0 auto; }
                  </style>
                </head>
                <body>
                  <img src="${imageUrl}" crossorigin="anonymous" />
                </body>
                </html>
              `);
            }
            
            // Como último recurso, hacer redirección 302
            console.log(`[IMAGES] Using 302 redirect as last resort`);
            res.setHeader('Location', imageUrl);
            return res.status(302).end();
          }
          
          return res.status(200).json({
            id: cleanId,
            url: imageUrl,
            size: blob.size,
            type: blob.contentType || 'image/jpeg',
            source: 'vercel-blob',
            pathname: blob.pathname,
            uploadedAt: blob.uploadedAt
          });
        } catch (error) {
          console.error(`[IMAGES] Error searching for image: ${error.message}`);
          return res.status(500).json({ error: 'Failed to retrieve image', details: error.message });
        }
      }
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