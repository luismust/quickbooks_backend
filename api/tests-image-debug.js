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
    // Usar Imgur de manera directa que ya ha funcionado
    console.log(`DEBUG - Intentando subir imagen a Imgur...`);
    
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
    
    if (!response.ok) {
      throw new Error(`Error al subir a Imgur: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error('Imgur rechazó la imagen');
    }
    
    console.log(`DEBUG - Imagen subida exitosamente a Imgur: ${data.data.link}`);
    return data.data.link;
    
  } catch (error) {
    console.error('ERROR al subir imagen a Imgur:', error);
    throw error;
  }
}

// Crea un registro normal en Airtable (sin attachment)
async function createAirtableRecordWithoutImage(imageId, externalUrl) {
  const base = getAirtableBase();
  const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
  
  return new Promise((resolve, reject) => {
    base(tableImages).create([
      {
        fields: {
          ID: imageId,
          // Guardamos la URL externa como texto en un campo separado
          ExternalURL: externalUrl
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
    
    try {
      // 1. Primero subir la imagen a Imgur
      console.log('DEBUG - Subiendo imagen a Imgur...');
      const imageUrl = await uploadToExternalService(base64Content, fileName);
      
      if (!imageUrl) {
        throw new Error('No se pudo obtener URL externa para la imagen');
      }
      
      console.log(`DEBUG - URL externa obtenida: ${imageUrl}`);
      
      // 2. Crear un registro normal en Airtable SIN attachment
      console.log('DEBUG - Creando registro en Airtable (sin attachment)...');
      
      // Llamamos a la función para crear un registro sin attachment
      const record = await createAirtableRecordWithoutImage(imageId, imageUrl);
      console.log(`DEBUG - Registro creado con ID: ${record.id}`);
      
      // 3. Intentar también añadir el attachment a través de la API REST directa
      console.log('DEBUG - Intentando añadir attachment vía API REST (como referencia)...');
      
      const apiKey = process.env.AIRTABLE_API_KEY;
      const baseId = process.env.AIRTABLE_BASE_ID;
      const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
      const imageFieldName = 'Image';
      
      // Construir la URL para actualizar el registro con un attachment
      const updateUrl = `https://api.airtable.com/v0/${baseId}/${tableImages}/${record.id}`;
      
      // Hacer la solicitud para actualizar el registro (sin esperar resultado)
      fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            [imageFieldName]: [
              {
                url: imageUrl
              }
            ]
          }
        })
      }).then(response => {
        if (response.ok) {
          console.log('DEBUG - Attachment añadido vía API REST');
        } else {
          console.log(`DEBUG - Error al añadir attachment: ${response.status}`);
        }
      }).catch(error => {
        console.log(`DEBUG - Error en solicitud de attachment: ${error.message}`);
      });
      
      // 4. Devolvemos un resultado exitoso con toda la información útil
      return {
        success: true,
        id: record.id,
        imageId: imageId,
        externalUrl: imageUrl,
        // La URL para ver/acceder a la imagen es siempre la de Imgur
        url: imageUrl,
        type: mimeType,
        size: "Ver imagen en URL externa",
        note: "¡Éxito! La imagen está disponible en la URL externa y se ha creado un registro en Airtable. " +
              "Debido a limitaciones de Airtable, es posible que la imagen no aparezca como adjunto en Airtable " +
              "de inmediato o en absoluto. Sin embargo, puedes acceder a la imagen usando la URL externa."
      };
    } catch (airtableError) {
      console.error("Error al interactuar con Airtable:", airtableError);
      return {
        success: false,
        error: "Error al guardar en Airtable",
        details: airtableError.message
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
        // Preparar HTML para una mejor visualización
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Imagen Subida Exitosamente</title>
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
          <h1>¡Imagen subida exitosamente!</h1>
          <p>${result.note}</p>
          
          <div class="info">
            <p><span class="label">ID:</span> ${result.imageId}</p>
            <p><span class="label">Airtable Record ID:</span> ${result.id}</p>
            <p><span class="label">Tipo:</span> ${result.type}</p>
          </div>
          
          <div class="image-container">
            <h2>Imagen Subida:</h2>
            <img src="${result.externalUrl}" alt="Imagen Subida">
            <p><a href="${result.externalUrl}" target="_blank" class="button">Ver Imagen en Pantalla Completa</a></p>
          </div>
          
          <h2>Detalles:</h2>
          <ul>
            <li>La imagen ha sido subida exitosamente a Imgur y está disponible en la URL externa</li>
            <li>Se ha creado un registro en Airtable con ID: ${result.id}</li>
            <li>El registro contiene la URL externa como referencia en el campo 'ExternalURL'</li>
            <li>También se ha intentado adjuntar la imagen al campo 'Image' aunque Airtable podría no mostrarlo</li>
          </ul>
          
          <h3>URL de la imagen:</h3>
          <pre>${result.externalUrl}</pre>
          
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