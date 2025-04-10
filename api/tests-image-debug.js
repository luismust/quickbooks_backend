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
    
    // Obtener tabla de imágenes
    const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
    const base = getAirtableBase();
    
    console.log(`Usando tabla de imágenes: ${tableImages}`);
    
    // Verificar si la tabla existe intentando obtener un registro
    console.log(`Verificando si la tabla ${tableImages} existe...`);
    try {
      await base(tableImages).select({ maxRecords: 1 }).firstPage();
      console.log(`Tabla ${tableImages} encontrada correctamente`);
    } catch (tableError) {
      console.error(`Error al acceder a la tabla ${tableImages}:`, tableError.message);
      return { 
        success: false, 
        error: `No se pudo acceder a la tabla ${tableImages}`, 
        details: tableError.message,
        airtableConfig: {
          hasApiKey: Boolean(process.env.AIRTABLE_API_KEY),
          hasBaseId: Boolean(process.env.AIRTABLE_BASE_ID),
          tableImages: tableImages
        }
      };
    }
    
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
    
    // Campo para la imagen en Airtable, debe coincidir exactamente con el nombre en la interfaz
    const imageFieldName = 'Image'; // Asegúrate de que coincida exactamente con el nombre en Airtable, respetando mayúsculas/minúsculas
    
    const uploadUrl = `https://api.airtable.com/v0/${baseId}/${tableImages}/${recordId}/${imageFieldName}`;
    
    console.log(`Intentando subir imagen a URL: ${uploadUrl}`);
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
      console.error(`Error al subir imagen: ${uploadResponse.status}`, errorText);
      return { 
        success: false, 
        error: `Error al subir imagen: ${uploadResponse.status}`,
        details: errorText,
        uploadUrl: uploadUrl,
        fieldName: imageFieldName
      };
    }
    
    const uploadResult = await uploadResponse.json();
    console.log(`Paso 3: Imagen subida, obteniendo información del registro actualizado`);
    
    // Paso 3: Obtener el registro actualizado para verificar la URL
    console.log(`Paso 3: Obteniendo registro actualizado con ID: ${recordId}`);
    const updatedRecord = await base(tableImages).find(recordId);
    
    console.log(`Campos disponibles en el registro: ${Object.keys(updatedRecord.fields).join(', ')}`);
    
    // Verificar si se guardó la imagen
    if (!updatedRecord.fields[imageFieldName]) {
      console.error(`Campo '${imageFieldName}' no encontrado en el registro. Campos disponibles:`, Object.keys(updatedRecord.fields));
      return { 
        success: false, 
        error: `Campo '${imageFieldName}' no encontrado en el registro`,
        record: JSON.stringify(updatedRecord.fields),
        availableFields: Object.keys(updatedRecord.fields)
      };
    }
    
    if (!updatedRecord.fields[imageFieldName] || 
        !updatedRecord.fields[imageFieldName][0] || 
        !updatedRecord.fields[imageFieldName][0].url) {
      console.error(`Imagen subida pero no se encontró URL en el campo ${imageFieldName}`, updatedRecord.fields);
      return { 
        success: false, 
        error: `Imagen subida pero no se encontró URL en el campo ${imageFieldName}`,
        record: JSON.stringify(updatedRecord.fields)
      };
    }
    
    const imageAttachment = updatedRecord.fields[imageFieldName][0];
    console.log(`Imagen subida exitosamente. URL: ${imageAttachment.url.substring(0, 50)}...`);
    
    // Éxito - devolver información
    return {
      success: true,
      imageId: imageId,
      url: imageAttachment.url,
      recordId: recordId,
      thumbnails: imageAttachment.thumbnails || {},
      size: imageAttachment.size,
      type: imageAttachment.type,
      allFields: Object.keys(updatedRecord.fields)
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