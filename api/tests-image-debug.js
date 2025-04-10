// api/tests-image-debug.js - Versión simplificada para pruebas de imágenes
const Airtable = require('airtable');

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
    
    // Obtener tabla de imágenes
    const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
    const base = getAirtableBase();
    
    // Crear registro con la imagen
    const recordData = {
      fields: {
        ID: imageId,
        Image: [
          {
            filename: fileName,
            content_type: mimeType,
            content: base64Content
          }
        ]
      }
    };
    
    console.log(`Intentando guardar imagen con ID: ${imageId}, tipo: ${mimeType}, tamaño base64: ${base64Content.length}`);
    
    // Crear el registro
    const records = await base(tableImages).create([recordData]);
    
    if (!records || records.length === 0) {
      return { success: false, error: 'No se recibió respuesta al crear el registro' };
    }
    
    const record = records[0];
    
    // Verificar si se guardó la imagen
    if (!record.fields.Image || !record.fields.Image[0] || !record.fields.Image[0].url) {
      return { 
        success: false, 
        error: 'Imagen guardada sin URL',
        record: JSON.stringify(record)
      };
    }
    
    // Éxito - devolver información
    return {
      success: true,
      imageId: imageId,
      url: record.fields.Image[0].url,
      recordId: record.id,
      thumbnails: record.fields.Image[0].thumbnails || {},
      size: record.fields.Image[0].size,
      type: record.fields.Image[0].type
    };
  } catch (error) {
    console.error('Error al guardar imagen:', error);
    return {
      success: false,
      error: error.message || 'Error desconocido',
      stack: error.stack,
      response: error.response ? JSON.stringify(error.response.data || {}).substring(0, 200) : null
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
      message: 'API de prueba para carga de imágenes',
      usage: 'Envía una solicitud POST con un objeto JSON que contenga una propiedad "imageData" con una cadena base64 de la imagen'
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