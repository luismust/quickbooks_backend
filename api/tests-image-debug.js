// api/tests-image-debug.js - Versión simplificada para pruebas de imágenes
const Airtable = require('airtable');
const fetch = require('node-fetch');

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
      console.log('DEBUG - Implementando un nuevo enfoque basado en servicio de almacenamiento externo...');
      
      // 1. Para esta prueba, vamos a usar ImgBB como servicio externo para alojar la imagen
      // ImgBB permite cargar imágenes directamente vía API
      const imgbbKey = process.env.IMGBB_API_KEY || '54c2e395fb5d48a2074c5d4ae736f374'; // API key pública de prueba
      
      console.log('DEBUG - Subiendo imagen a servicio externo...');
      
      // Preparar la carga a ImgBB
      const formData = new URLSearchParams();
      formData.append('image', base64Content);
      formData.append('name', fileName);
      
      // Enviar imagen a ImgBB
      const imgbbResponse = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
        method: 'POST',
        body: formData
      });
      
      if (!imgbbResponse.ok) {
        const errorText = await imgbbResponse.text();
        console.error(`Error al subir a servicio externo: ${imgbbResponse.status} - ${errorText}`);
        throw new Error(`Error al subir a servicio externo: ${imgbbResponse.status}`);
      }
      
      const imgbbData = await imgbbResponse.json();
      
      if (!imgbbData.success || !imgbbData.data || !imgbbData.data.url) {
        console.error('Respuesta inesperada del servicio de alojamiento de imágenes:', imgbbData);
        throw new Error('No se pudo obtener la URL de la imagen alojada');
      }
      
      // Obtener la URL de la imagen alojada
      const imageUrl = imgbbData.data.url;
      console.log(`DEBUG - Imagen subida correctamente a servicio externo: ${imageUrl}`);
      
      // 2. Ahora crear el registro en Airtable usando la URL externa, exactamente como en la documentación
      const baseId = process.env.AIRTABLE_BASE_ID;
      const apiKey = process.env.AIRTABLE_API_KEY;
      
      console.log(`DEBUG - Creando registro en Airtable con imagen externa...`);
      
      // URL para la API de Airtable
      const airtableUrl = `https://api.airtable.com/v0/${baseId}/${tableImages}`;
      
      // Crear la solicitud según la documentación
      const airtableResponse = await fetch(airtableUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          records: [
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
          ]
        })
      });
      
      // Verificar respuesta
      if (!airtableResponse.ok) {
        const errorText = await airtableResponse.text();
        console.error(`Error al crear registro en Airtable: ${airtableResponse.status} - ${errorText}`);
        throw new Error(`Error al crear registro en Airtable: ${airtableResponse.status} - ${errorText}`);
      }
      
      const airtableData = await airtableResponse.json();
      
      if (!airtableData.records || !airtableData.records[0] || !airtableData.records[0].id) {
        console.error('Respuesta inesperada de Airtable:', airtableData);
        throw new Error('No se pudo crear el registro en Airtable');
      }
      
      const recordId = airtableData.records[0].id;
      console.log(`DEBUG - Registro creado correctamente con ID: ${recordId}`);
      
      // 3. Verificar el registro para confirmar que tiene la imagen
      console.log(`DEBUG - Verificando registro...`);
      
      // Esperar un momento para que Airtable procese todo
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Solicitar el registro
      const verifyResponse = await fetch(`${airtableUrl}/${recordId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (!verifyResponse.ok) {
        console.warn(`No se pudo verificar el registro: ${verifyResponse.status}`);
        // Devolver información parcial
        return {
          success: true,
          id: recordId,
          imageId: imageId,
          externalUrl: imageUrl,
          note: "Registro creado pero no se pudo verificar"
        };
      }
      
      const verifyData = await verifyResponse.json();
      
      if (verifyData && 
          verifyData.fields && 
          verifyData.fields[imageFieldName] && 
          verifyData.fields[imageFieldName].length > 0) {
        
        const image = verifyData.fields[imageFieldName][0];
        
        // Éxito completo
        return {
          success: true,
          id: verifyData.id,
          imageId: imageId,
          externalUrl: imageUrl,
          airtableUrl: image.url,
          thumbnails: image.thumbnails || {},
          size: image.size,
          type: image.type
        };
      }
      
      // Si llegamos aquí, el registro está pero no tiene la imagen
      return {
        success: true,
        id: recordId,
        imageId: imageId,
        externalUrl: imageUrl,
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