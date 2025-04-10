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
      
      // 2. Ahora crear el registro en Airtable
      console.log('DEBUG - Creando registro en Airtable...');
      
      // Primero, verificar que estamos usando el formato correcto según documentación
      const apiKey = process.env.AIRTABLE_API_KEY;
      const baseId = process.env.AIRTABLE_BASE_ID;
      
      // Usar fetch directamente para mayor control
      const createUrl = `https://api.airtable.com/v0/${baseId}/${tableImages}`;
      
      console.log(`DEBUG - Usando URL de API: ${createUrl}`);
      console.log(`DEBUG - Campo de imagen: ${imageFieldName}`);
      
      // Estructura exacta según documentación
      const recordData = {
        records: [
          {
            fields: {
              ID: imageId,
              [imageFieldName]: [
                {
                  url: imageUrl
                }
              ]
            }
          }
        ]
      };
      
      console.log('DEBUG - Estructura de datos:', JSON.stringify(recordData, null, 2));
      
      const response = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(recordData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`ERROR al crear registro: ${response.status} - ${errorText}`);
        throw new Error(`Error al crear registro en Airtable: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.records || !result.records[0]) {
        throw new Error('Respuesta de Airtable no contiene registros');
      }
      
      const record = result.records[0];
      
      console.log(`DEBUG - Registro creado con ID: ${record.id}`);
      console.log('DEBUG - Datos del registro:', JSON.stringify(record, null, 2));
      
      // 3. Verificar el registro creado después de un tiempo para dejar que Airtable procese
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('DEBUG - Verificando registro...');
      
      const verifyResponse = await fetch(`${createUrl}/${record.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (!verifyResponse.ok) {
        console.warn(`ERROR al verificar: ${verifyResponse.status}`);
        // Al menos devolvemos el ID del registro creado
        return {
          success: true,
          id: record.id,
          imageId: imageId,
          externalUrl: imageUrl,
          note: 'Registro creado pero no se pudo verificar'
        };
      }
      
      const verifyData = await verifyResponse.json();
      
      // Extraer información del attachment si existe
      let attachmentInfo = null;
      
      if (verifyData.fields && 
          verifyData.fields[imageFieldName] && 
          verifyData.fields[imageFieldName].length > 0) {
        
        attachmentInfo = verifyData.fields[imageFieldName][0];
        console.log('DEBUG - Información del attachment:', JSON.stringify(attachmentInfo, null, 2));
        
        // Verificar si Airtable ha procesado completamente el attachment
        if (attachmentInfo.url && 
            attachmentInfo.size !== undefined && 
            attachmentInfo.type !== undefined) {
          
          return {
            success: true,
            id: record.id,
            imageId: imageId,
            externalUrl: imageUrl,
            airtableUrl: attachmentInfo.url,
            thumbnails: attachmentInfo.thumbnails || {},
            size: attachmentInfo.size,
            type: attachmentInfo.type,
            processingComplete: true
          };
        }
      }
      
      // Si llegamos aquí, el attachment no está completamente procesado
      // Intentar actualizar el registro para "forzar" el procesamiento
      console.log('DEBUG - La imagen no se procesó completamente, intentando actualizar...');
      
      const updateResponse = await fetch(`${createUrl}/${record.id}`, {
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
      });
      
      if (!updateResponse.ok) {
        console.warn(`ERROR al actualizar: ${updateResponse.status}`);
      } else {
        console.log('DEBUG - Registro actualizado');
      }
      
      // Devolver lo que tengamos hasta ahora
      return {
        success: true,
        id: record.id,
        imageId: imageId,
        externalUrl: imageUrl,
        note: 'El registro se creó pero es posible que Airtable necesite tiempo para procesar la imagen completamente',
        attachmentInfo: attachmentInfo || {}
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
    
    try {
      // Guardar la imagen
      const result = await saveImage(imageData);
      
      if (result.success) {
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