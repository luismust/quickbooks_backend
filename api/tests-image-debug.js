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
    
    // Crear registro con la imagen - FORMATO CORREGIDO
    // Airtable espera un objeto sin la propiedad "content_type" y "content"
    // La documentación indica que el objeto de attachment debe tener: url, filename, size, type, etc.
    // Como no tenemos URL, usamos el API de Airtable para crear un archivo vacío primero
    // y luego actualizarlo manualmente
    
    // Paso 1: Crear un registro con solo el ID
    console.log(`Paso 1: Creando registro para imagen ID: ${imageId}`);
    const initialRecord = await base(tableImages).create([
      {
        fields: {
          ID: imageId
        }
      }
    ]);
    
    if (!initialRecord || initialRecord.length === 0) {
      return { success: false, error: 'No se pudo crear el registro inicial' };
    }
    
    const recordId = initialRecord[0].id;
    console.log(`Paso 2: Registro creado con ID: ${recordId}, intentando subir imagen`);
    
    // Paso 2: Usar la API de Airtable directamente para subir el archivo
    // Necesitamos usar fetch o un cliente HTTP directo, no el SDK de Airtable
    const fetch = require('node-fetch');
    const FormData = require('form-data');
    
    // Convertir base64 a buffer
    const buffer = Buffer.from(base64Content, 'base64');
    
    // Crear FormData para la subida
    const formData = new FormData();
    formData.append('file', buffer, {
      filename: fileName,
      contentType: mimeType
    });
    
    // URL del endpoint para subir archivos a Airtable
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const uploadUrl = `https://api.airtable.com/v0/${baseId}/${tableImages}/${recordId}/Image`;
    
    // Realizar la solicitud para subir el archivo
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        // FormData establece su propio Content-Type con el boundary
      },
      body: formData
    });
    
    // Verificar respuesta
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      return { 
        success: false, 
        error: `Error al subir imagen: ${uploadResponse.status}`,
        details: errorText
      };
    }
    
    const uploadResult = await uploadResponse.json();
    console.log(`Paso 3: Imagen subida, obteniendo información del registro actualizado`);
    
    // Paso 3: Obtener el registro actualizado para verificar la URL
    const updatedRecord = await base(tableImages).find(recordId);
    
    // Verificar si se guardó la imagen
    if (!updatedRecord.fields.Image || 
        !updatedRecord.fields.Image[0] || 
        !updatedRecord.fields.Image[0].url) {
      return { 
        success: false, 
        error: 'Imagen subida pero no se encontró URL',
        record: JSON.stringify(updatedRecord)
      };
    }
    
    // Éxito - devolver información
    return {
      success: true,
      imageId: imageId,
      url: updatedRecord.fields.Image[0].url,
      recordId: recordId,
      thumbnails: updatedRecord.fields.Image[0].thumbnails || {},
      size: updatedRecord.fields.Image[0].size,
      type: updatedRecord.fields.Image[0].type
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