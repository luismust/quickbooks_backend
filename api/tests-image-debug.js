// api/tests-image-debug.js - Versión para usar Vercel Blob Storage
const Airtable = require('airtable');
const { put } = require('@vercel/blob');

// Configurar Airtable
const getAirtableBase = () => {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  
  if (!apiKey || !baseId) {
    throw new Error(`Credenciales incompletas: API Key: ${Boolean(apiKey)}, Base ID: ${Boolean(baseId)}`);
  }
  
  console.log(`DEBUG - Usando Base ID: ${baseId}`);
  
  return new Airtable({ 
    apiKey: apiKey,
    endpointUrl: 'https://api.airtable.com'
  }).base(baseId);
};

// Subir imagen a Vercel Blob Storage
async function uploadToVercelBlob(buffer, fileName, contentType) {
  try {
    console.log(`DEBUG - Subiendo imagen a Vercel Blob Storage...`);
    
    // Usar la API de Vercel Blob para subir la imagen
    const blob = await put(fileName, buffer, {
      contentType: contentType,
      access: 'public', // Hacemos que sea accesible públicamente
    });
    
    console.log(`DEBUG - Imagen subida a Vercel Blob: ${blob.url}`);
    return blob;
  } catch (error) {
    console.error('ERROR al subir a Vercel Blob:', error);
    throw error;
  }
}

// Crea un registro en Airtable con referencia a la imagen
async function createAirtableRecord(imageId, blobUrl, blobData) {
  const base = getAirtableBase();
  const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
  
  return new Promise((resolve, reject) => {
    base(tableImages).create([
      {
        fields: {
          ID: imageId,
          BlobURL: blobUrl,
          Size: blobData.size,
          ContentType: blobData.contentType,
          Timestamp: new Date().toISOString()
        }
      }
    ], function(err, records) {
      if (err) {
        return reject(err);
      }
      resolve(records[0]);
    });
  });
}

// Función para guardar una imagen usando Vercel Blob
async function saveImage(imageData) {
  try {
    if (!imageData || !imageData.startsWith('data:')) {
      return { success: false, error: 'Datos de imagen inválidos o faltantes' };
    }
    
    // Generar ID único
    const imageId = `img_debug_${Date.now()}`;
    
    // Extraer información de la imagen
    const matches = imageData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return { success: false, error: 'Formato de imagen base64 inválido' };
    }
    
    const mimeType = matches[1];
    const base64Content = matches[2];
    const extension = mimeType.split('/')[1] || 'jpg';
    const fileName = `debug_${imageId}.${extension}`;
    
    console.log(`Información de la imagen: Tipo MIME: ${mimeType}, Extensión: ${extension}`);
    
    try {
      // 1. Convertir base64 a buffer para Vercel Blob
      const buffer = Buffer.from(base64Content, 'base64');
      
      // 2. Subir la imagen a Vercel Blob Storage
      const blobData = await uploadToVercelBlob(buffer, fileName, mimeType);
      
      if (!blobData || !blobData.url) {
        throw new Error('No se pudo obtener URL del blob');
      }
      
      console.log(`DEBUG - URL de Blob obtenida: ${blobData.url}`);
      
      // 3. Crear registro en Airtable con referencia a la imagen
      console.log('DEBUG - Creando registro en Airtable con referencia a Blob...');
      
      const record = await createAirtableRecord(imageId, blobData.url, blobData);
      console.log(`DEBUG - Registro creado con ID: ${record.id}`);
      
      // 4. Devolver un resultado exitoso con toda la información
      return {
        success: true,
        id: record.id,
        imageId: imageId,
        url: blobData.url,
        type: blobData.contentType || mimeType,
        size: blobData.size || 'Desconocido',
        note: "¡Éxito! La imagen se ha guardado en Vercel Blob Storage y se ha creado un registro en Airtable con la referencia."
      };
    } catch (error) {
      console.error("Error al guardar imagen:", error);
      return {
        success: false,
        error: "Error al guardar imagen",
        details: error.message
      };
    }
  } catch (generalError) {
    console.error("Error general:", generalError);
    return {
      success: false,
      error: generalError.message || "Error desconocido",
      stack: generalError.stack
    };
  }
}

// Endpoint principal
module.exports = async (req, res) => {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Permitir cualquier origen para pruebas
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Manejar OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Verificar método
  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'API de prueba para carga de imágenes a Vercel Blob Storage',
      usage: 'Envía una solicitud POST con un objeto JSON que contenga una propiedad "imageData" con una cadena base64 de la imagen',
      config: {
        blobStorage: 'Vercel Blob Storage',
        airtableTable: process.env.AIRTABLE_TABLE_IMAGES || 'Images'
      }
    });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  
  try {
    // Parsear body si es necesario
    let requestData = req.body;
    if (typeof requestData === 'string') {
      try {
        requestData = JSON.parse(requestData);
      } catch (parseError) {
        return res.status(400).json({
          error: 'JSON inválido',
          details: parseError.message
        });
      }
    }
    
    // Verificar datos de imagen
    const { imageData } = requestData;
    
    if (!imageData) {
      return res.status(400).json({
        error: 'Datos faltantes',
        message: 'Se requiere la propiedad "imageData" con una cadena base64'
      });
    }
    
    try {
      // Guardar la imagen
      const result = await saveImage(imageData);
      
      if (result.success) {
        // Preparar HTML para una mejor visualización
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Imagen Subida Exitosamente a Vercel Blob</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #008000; }
            .error { color: #FF0000; }
            .image-container { margin: 20px 0; }
            img { max-width: 100%; border: 1px solid #ddd; }
            .info { margin: 10px 0; }
            .label { font-weight: bold; }
            pre { background: #f4f4f4; padding: 10px; overflow-x: auto; }
            .button {
              display: inline-block;
              background-color: #4CAF50;
              color: white;
              padding: 10px 15px;
              text-align: center;
              text-decoration: none;
              font-size: 16px;
              margin: 4px 2px;
              cursor: pointer;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <h1>¡Imagen subida exitosamente a Vercel Blob!</h1>
          <p>${result.note}</p>
          
          <div class="info">
            <p><span class="label">ID:</span> ${result.imageId}</p>
            <p><span class="label">Airtable Record ID:</span> ${result.id}</p>
            <p><span class="label">Tipo:</span> ${result.type}</p>
            <p><span class="label">Tamaño:</span> ${result.size} bytes</p>
          </div>
          
          <div class="image-container">
            <h2>Imagen Subida:</h2>
            <img src="${result.url}" alt="Imagen Subida">
            <p><a href="${result.url}" target="_blank" class="button">Ver Imagen en Pantalla Completa</a></p>
          </div>
          
          <h2>Detalles:</h2>
          <ul>
            <li>La imagen ha sido subida exitosamente a Vercel Blob Storage</li>
            <li>Se ha creado un registro en Airtable con ID: ${result.id}</li>
            <li>El registro contiene la URL del blob y sus metadatos</li>
            <li>La imagen está disponible públicamente en la URL mostrada</li>
          </ul>
          
          <h3>URL de la imagen:</h3>
          <pre>${result.url}</pre>
          
          <h3>Respuesta completa:</h3>
          <pre>${JSON.stringify(result, null, 2)}</pre>
        </body>
        </html>
        `;
        
        // Determinar si devolvemos HTML o JSON
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
          res.setHeader('Content-Type', 'text/html');
          return res.status(200).send(html);
        }
        
        // Respuesta JSON normal
        return res.status(200).json(result);
      } else {
        return res.status(500).json(result);
      }
    } catch (saveError) {
      console.error('Error al guardar imagen:', saveError);
      return res.status(500).json({
        success: false,
        error: 'Error al guardar imagen',
        details: saveError.message
      });
    }
  } catch (error) {
    console.error('Error no controlado:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message,
      stack: error.stack
    });
  }
}; 