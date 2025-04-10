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
    
    try {
      // Inicializar el cliente de Airtable
      const base = getAirtableBase();
      
      console.log(`Intentando almacenar en Airtable - Base: ${process.env.AIRTABLE_BASE_ID}, Tabla: ${tableImages}`);
      
      // Método 1: Crear registro con attachment directamente en un solo paso
      try {
        console.log("Método 1: Creando registro con imagen directamente");
        
        const attachment = {
          url: imageData
        };
        
        console.log(`Creando registro con ID: ${imageId} y campo Image con URL`);
        console.log(`Nombre de la tabla: ${tableImages}, Nombre del campo de imagen: ${imageFieldName}`);
        
        const record = await base(tableImages).create({
          ID: imageId,
          [imageFieldName]: [attachment]
        });
        
        console.log(`Registro creado con éxito, ID: ${record.id}`);
        console.log(`Campos disponibles: ${Object.keys(record.fields).join(', ')}`);
        
        if (record.fields[imageFieldName] && 
            record.fields[imageFieldName][0] && 
            record.fields[imageFieldName][0].url) {
          
          const imageObj = record.fields[imageFieldName][0];
          
          return {
            success: true,
            method: "airtable-direct-attachment",
            imageId: imageId,
            recordId: record.id,
            url: imageObj.url,
            thumbnails: imageObj.thumbnails || {},
            filename: imageObj.filename,
            type: imageObj.type,
            size: imageObj.size
          };
        } else {
          throw new Error("La imagen se creó pero no se pudo acceder a su URL");
        }
      } catch (error) {
        console.error("Error en Método 1:", error.message);
        
        // Si falla, intentar el Método 2
        console.log("Método 2: Creando registro primero, luego actualizando con imagen");
        
        // Paso 1: Crear registro básico
        const newRecord = await base(tableImages).create({
          ID: imageId
        });
        
        const recordId = newRecord.id;
        console.log(`Registro básico creado, ID: ${recordId}`);
        
        // Paso 2: Actualizar con la imagen
        await base(tableImages).update(recordId, {
          [imageFieldName]: [{ url: imageData }]
        });
        
        console.log("Registro actualizado con URL de imagen");
        
        // Paso 3: Obtener registro actualizado
        const updatedRecord = await base(tableImages).find(recordId);
        
        if (updatedRecord.fields[imageFieldName] && 
            updatedRecord.fields[imageFieldName][0] && 
            updatedRecord.fields[imageFieldName][0].url) {
          
          const imageObj = updatedRecord.fields[imageFieldName][0];
          
          return {
            success: true,
            method: "airtable-two-step",
            imageId: imageId,
            recordId: recordId,
            url: imageObj.url,
            thumbnails: imageObj.thumbnails || {},
            filename: imageObj.filename || fileName,
            type: imageObj.type || mimeType,
            size: imageObj.size
          };
        } else {
          throw new Error("Imagen actualizada pero no se pudo obtener la URL");
        }
      }
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