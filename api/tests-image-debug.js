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
      // Obtener credenciales
      const baseId = process.env.AIRTABLE_BASE_ID;
      const apiKey = process.env.AIRTABLE_API_KEY;
      
      // MÉTODO DIRECTO SEGÚN LA DOCUMENTACIÓN
      console.log(`DEBUG - Método directo según documentación exacta...`);
      
      // 1. Convertir base64 a buffer para subirlo
      const buffer = Buffer.from(base64Content, 'base64');
      
      // 2. Preparar FormData con el archivo
      const formData = new FormData();
      formData.append('file', buffer, {
        filename: fileName,
        contentType: mimeType
      });
      
      // 3. Crear URL exacta según la documentación 
      const externalUrl = "https://www.filepicker.io/api/file/example"; // URL temporal que reemplazaremos
      
      // 4. Crear primero el registro con ID y una URL temporal
      console.log(`DEBUG - Creando registro inicial en la tabla ${tableImages}...`);
      
      // URL para crear registros
      const createUrl = `https://api.airtable.com/v0/${baseId}/${tableImages}`;
      
      // Crear el registro con ID y URL temporal (siguiendo exactamente el formato del ejemplo)
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          records: [
            {
              fields: {
                "ID": imageId,
                [imageFieldName]: [
                  {
                    url: externalUrl,
                    filename: fileName
                  }
                ]
              }
            }
          ]
        })
      });
      
      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error(`Error al crear registro: ${createResponse.status} - ${errorText}`);
        throw new Error(`Error al crear registro: ${createResponse.status} - ${errorText}`);
      }
      
      // Obtener resultados
      const createResult = await createResponse.json();
      console.log(`DEBUG - Registro creado correctamente:`, 
        createResult.records && createResult.records.length > 0 ? 
        'ID: ' + createResult.records[0].id : 'No hay registros');
      
      if (!createResult.records || !createResult.records[0] || !createResult.records[0].id) {
        throw new Error('No se pudo crear el registro en Airtable');
      }
      
      const recordId = createResult.records[0].id;
      
      // 5. Ahora que tenemos el ID, subimos realmente la imagen 
      // URL CORRECTA según la documentación para agregar archivos adjuntos a un registro
      const attachmentUrl = `https://api.airtable.com/v0/${baseId}/${tableImages}/${recordId}/fields/${imageFieldName}`;
      
      console.log(`DEBUG - Subiendo archivo a ${attachmentUrl}`);
      
      // Subir directamente la imagen al campo
      const uploadResponse = await fetch(attachmentUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          records: [
            {
              id: recordId,
              fields: {
                [imageFieldName]: [
                  {
                    url: `data:${mimeType};base64,${base64Content}`,
                    filename: fileName
                  }
                ]
              }
            }
          ]
        })
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(`Error al subir imagen: ${uploadResponse.status} - ${errorText}`);
        
        // Intento alternativo: Probar con la URL exacta que vemos en la documentación
        console.log(`DEBUG - Intentando método alternativo para subir el archivo...`);
        
        // URL alternativa según la documentación 
        const altAttachmentUrl = `https://api.airtable.com/v0/${baseId}/${tableImages}`;
        
        const altUploadResponse = await fetch(altAttachmentUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            records: [
              {
                id: recordId,
                fields: {
                  [imageFieldName]: [
                    {
                      url: `data:${mimeType};base64,${base64Content}`,
                      filename: fileName
                    }
                  ]
                }
              }
            ]
          })
        });
        
        if (!altUploadResponse.ok) {
          const altErrorText = await altUploadResponse.text();
          console.error(`Error en método alternativo: ${altUploadResponse.status} - ${altErrorText}`);
          throw new Error(`Error al subir imagen: ${uploadResponse.status} - ${errorText}`);
        }
        
        console.log(`DEBUG - Método alternativo exitoso!`);
      }
      
      // 6. Verificar que el registro ahora tenga la imagen
      console.log(`DEBUG - Verificando registro actualizado...`);
      
      // Esperar un momento para que Airtable procese la imagen
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const verifyUrl = `https://api.airtable.com/v0/${baseId}/${tableImages}/${recordId}`;
      const verifyResponse = await fetch(verifyUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (!verifyResponse.ok) {
        console.warn(`No se pudo verificar el registro: ${verifyResponse.status}`);
        return {
          success: true,
          id: recordId,
          imageId: imageId,
          note: "Registro creado pero no se pudo verificar"
        };
      }
      
      const verifyResult = await verifyResponse.json();
      
      if (verifyResult && 
          verifyResult.fields && 
          verifyResult.fields[imageFieldName] && 
          verifyResult.fields[imageFieldName].length > 0) {
        
        const image = verifyResult.fields[imageFieldName][0];
        
        return {
          success: true,
          id: verifyResult.id,
          imageId: imageId,
          url: image.url,
          thumbnails: image.thumbnails || {},
          size: image.size,
          type: image.type
        };
      }
      
      // Si llegamos aquí el registro existe pero sin imagen
      return {
        success: true,
        id: recordId,
        imageId: imageId,
        note: "El registro se creó pero la imagen no se adjuntó correctamente"
      };
      
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
    
    // Guardar la imagen
    const result = await saveImage(imageData);
    
    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json(result);
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