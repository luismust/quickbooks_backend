// api/tests-image-debug.js - Versión simplificada para pruebas de imágenes
const Airtable = require('airtable');
const fetch = require('node-fetch');
const FormData = require('form-data');

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

// Subir imagen a servicio externo para obtener URL
async function uploadToExternalService(base64Content, fileName) {
  try {
    // Probar con varios servicios en caso de que uno falle
    const services = [
      {
        name: 'ImgBB',
        upload: async () => {
          // Prepara los datos para ImgBB
          const params = new URLSearchParams();
          params.append('key', process.env.IMGBB_API_KEY || '54c2e395fb5d48a2074c5d4ae736f374');
          params.append('image', base64Content);
          params.append('name', fileName);
          
          // Enviar a ImgBB
          const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: params
          });
          
          if (!response.ok) throw new Error(`ImgBB respondió con estado: ${response.status}`);
          
          const data = await response.json();
          if (!data.success) throw new Error('ImgBB rechazó la imagen');
          
          return data.data.url;
        }
      },
      {
        name: 'Imgur',
        upload: async () => {
          // Prepara los datos para Imgur
          const formData = new FormData();
          formData.append('image', base64Content);
          
          // Enviar a Imgur
          const response = await fetch('https://api.imgur.com/3/image', {
            method: 'POST',
            headers: {
              'Authorization': 'Client-ID 546c25a59c58ad7'  // ID de cliente público para pruebas
            },
            body: formData
          });
          
          if (!response.ok) throw new Error(`Imgur respondió con estado: ${response.status}`);
          
          const data = await response.json();
          if (!data.success) throw new Error('Imgur rechazó la imagen');
          
          return data.data.link;
        }
      },
      {
        name: 'Cloudinary',
        upload: async () => {
          // URL de subida de Cloudinary para pruebas
          const cloudName = 'demo'; // Cuenta demo pública
          const unsignedUploadPreset = 'doc_upload'; // Preset público
          
          const formData = new FormData();
          formData.append('file', `data:image/png;base64,${base64Content}`);
          formData.append('upload_preset', unsignedUploadPreset);
          
          // Enviar a Cloudinary
          const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: 'POST',
            body: formData
          });
          
          if (!response.ok) throw new Error(`Cloudinary respondió con estado: ${response.status}`);
          
          const data = await response.json();
          return data.secure_url;
        }
      }
    ];
    
    // Intentar cada servicio hasta que uno funcione
    let lastError = null;
    for (const service of services) {
      try {
        console.log(`DEBUG - Intentando subir imagen a ${service.name}...`);
        const url = await service.upload();
        console.log(`DEBUG - Imagen subida exitosamente a ${service.name}: ${url}`);
        return url;
      } catch (error) {
        console.warn(`DEBUG - Error al subir a ${service.name}:`, error.message);
        lastError = error;
        // Continuar con el siguiente servicio
      }
    }
    
    // Si llegamos aquí, todos los servicios fallaron
    throw lastError || new Error('Todos los servicios de alojamiento de imágenes fallaron');
    
  } catch (error) {
    console.error('ERROR al subir imagen a servicio externo:', error);
    throw error;
  }
}

// Función para guardar una imagen en Airtable
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
    
    // Obtener tabla de imágenes
    const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
    const imageFieldName = 'Image';
    
    // Mostrar información de configuración
    console.log('DEBUG - Configuración:');
    console.log(`API Key: ${process.env.AIRTABLE_API_KEY ? 'CONFIGURADA' : 'NO CONFIGURADA'}`);
    console.log(`Base ID: ${process.env.AIRTABLE_BASE_ID}`);
    console.log(`Tabla: ${tableImages}`);
    console.log(`Campo: ${imageFieldName}`);
    
    try {
      // 1. Primero subir la imagen a un servicio externo para obtener una URL pública
      console.log('DEBUG - Subiendo imagen a servicio externo para obtener URL...');
      const imageUrl = await uploadToExternalService(base64Content, fileName);
      
      if (!imageUrl) {
        throw new Error('No se pudo obtener URL externa para la imagen');
      }
      
      console.log(`DEBUG - URL externa obtenida: ${imageUrl}`);
      
      // 2. Crear el registro directamente con el SDK de Airtable para mejor compatibilidad
      console.log('DEBUG - Creando registro en Airtable con SDK...');
      
      const base = getAirtableBase();
      
      // Incluir explícitamente el filename
      return new Promise((resolve, reject) => {
        // Crear el registro con el SDK de Airtable que maneja mejor los attachments
        base(tableImages).create([
          {
            fields: {
              ID: imageId,
              [imageFieldName]: [
                {
                  url: imageUrl,
                  filename: fileName
                }
              ]
            }
          }
        ], function(err, records) {
          if (err) {
            console.error('ERROR al crear registro:', err);
            return reject(err);
          }
          
          if (!records || !records.length) {
            return reject(new Error('No se recibieron registros en la respuesta'));
          }
          
          const record = records[0];
          
          console.log(`DEBUG - Registro creado con ID: ${record.id}`);
          console.log('DEBUG - Campos del registro creado:', JSON.stringify(record.fields, null, 2));
          
          // Verificar el registro inmediatamente para ver si podemos obtener los metadatos
          base(tableImages).find(record.id, function(err, retrievedRecord) {
            if (err) {
              console.error('ERROR al recuperar registro:', err);
              // Si hay error al verificar, al menos devolvemos el ID y la URL de la imagen externa
              return resolve({
                success: true,
                id: record.id,
                imageId: imageId,
                externalUrl: imageUrl,
                // Proporcionar información que se mostrará en la UI
                url: imageUrl,  // Usar la URL externa directamente
                type: mimeType,
                size: "Tamaño desconocido",
                note: 'Registro creado pero no se pudo verificar'
              });
            }
            
            if (retrievedRecord.fields && 
                retrievedRecord.fields[imageFieldName] && 
                retrievedRecord.fields[imageFieldName].length > 0) {
              
              const image = retrievedRecord.fields[imageFieldName][0];
              
              // Incluso si los metadatos no están completos, devolver la información con valores predeterminados
              const result = {
                success: true,
                id: retrievedRecord.id,
                imageId: imageId,
                externalUrl: imageUrl,
                url: image.url || imageUrl,  // Si no hay URL de Airtable, usar la de Imgur
                airtableUrl: image.url || "En procesamiento",
                size: image.size || "En procesamiento",
                type: image.type || mimeType,
                thumbnails: image.thumbnails || {},
                note: 'Imagen cargada correctamente. Procesamiento en Airtable en curso.'
              };
              
              // Si la imagen aún no se ha procesado completamente, esperar y reintentar
              if (!image.url || !image.type || !image.size) {
                console.log('DEBUG - La imagen aún no se ha procesado completamente. Esperando 5 segundos...');
                
                // Devolvemos el resultado actual pero también esperamos para un posible procesamiento adicional
                setTimeout(() => {
                  base(tableImages).find(record.id, function(finalErr, finalRecord) {
                    console.log('DEBUG - Verificación final después de espera adicional');
                    if (!finalErr && 
                        finalRecord && 
                        finalRecord.fields && 
                        finalRecord.fields[imageFieldName] && 
                        finalRecord.fields[imageFieldName].length > 0) {
                      
                      console.log('DEBUG - La imagen ha sido actualizada en Airtable después de esperar');
                    }
                  });
                }, 5000); // Esperar 5 segundos adicionales
              }
              
              return resolve(result);
            } else {
              // No hay datos de la imagen todavía, pero tenemos la URL de Imgur
              resolve({
                success: true,
                id: record.id,
                imageId: imageId,
                externalUrl: imageUrl,
                url: imageUrl,  // Usar la URL externa directamente
                type: mimeType,
                size: "En procesamiento",
                note: 'Registro creado en Airtable. La imagen está disponible en la URL externa.'
              });
            }
          });
        });
      });
    } catch (airtableError) {
      console.error("Error al interactuar con Airtable:", airtableError);
      return {
        success: false,
        error: "Error al guardar en Airtable",
        details: airtableError.message,
        config: {
          baseId: process.env.AIRTABLE_BASE_ID,
          tableName: tableImages,
          hasApiKey: Boolean(process.env.AIRTABLE_API_KEY)
        }
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
      message: 'API de prueba para carga de imágenes a Airtable',
      usage: 'Envía una solicitud POST con un objeto JSON que contenga una propiedad "imageData" con una cadena base64 de la imagen',
      config: {
        airtableBaseId: process.env.AIRTABLE_BASE_ID,
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
        // Si es una solicitud GET o el cliente espera HTML, devolver una página HTML formateada
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
          const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Resultado de carga de imagen</title>
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
            </style>
          </head>
          <body>
            <h1>${result.success ? '¡Imagen subida exitosamente!' : 'Error al subir imagen'}</h1>
            ${result.note ? `<p>${result.note}</p>` : ''}
            
            <div class="info">
              <p><span class="label">ID:</span> ${result.imageId}</p>
              <p><span class="label">URL:</span> <a href="${result.externalUrl}" target="_blank">${result.externalUrl}</a></p>
              <p><span class="label">Tipo:</span> ${result.type || 'En procesamiento'}</p>
              <p><span class="label">Tamaño:</span> ${result.size || 'En procesamiento'}</p>
            </div>
            
            <div class="image-container">
              <h2>Imagen subida</h2>
              <img src="${result.externalUrl}" alt="Imagen subida">
            </div>
            
            <h2>Detalles completos:</h2>
            <pre>${JSON.stringify(result, null, 2)}</pre>
          </body>
          </html>
          `;
          
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