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
      // ENFOQUE SIMPLIFICADO: Usar el método directo de creación de archivos en Airtable
      // Convertir base64 a Buffer
      const buffer = Buffer.from(base64Content, 'base64');
      
      // Crear FormData para el archivo
      const formData = new FormData();
      formData.append('file', buffer, {
        filename: fileName,
        contentType: mimeType
      });
      
      // 1. Primero crear la URL para solicitar un enlace de carga de archivo
      // Este es el endpoint correcto para solicitar una URL de carga según la documentación de Airtable
      const baseId = process.env.AIRTABLE_BASE_ID;
      const apiKey = process.env.AIRTABLE_API_KEY;
      
      console.log(`DEBUG - Solicitando URL de carga para Airtable...`);
      
      // Esta es la URL correcta según la documentación de Airtable
      const requestUploadUrl = `https://api.airtable.com/v0/bases/${baseId}/files`;
      
      // Solicitar URL de carga
      const uploadUrlResponse = await fetch(requestUploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filename: fileName,
          contentType: mimeType
        })
      });
      
      // Verificar si la respuesta es correcta
      if (!uploadUrlResponse.ok) {
        const errorText = await uploadUrlResponse.text();
        console.error(`Error al solicitar URL de carga: ${uploadUrlResponse.status} - ${errorText}`);
        throw new Error(`Error al solicitar URL de carga: ${uploadUrlResponse.status} - ${errorText}`);
      }
      
      // Obtener información de la URL de carga
      const uploadUrlData = await uploadUrlResponse.json();
      console.log(`DEBUG - URL de carga obtenida:`, uploadUrlData.url ? 'Sí' : 'No');
      
      if (!uploadUrlData.url) {
        throw new Error('No se recibió URL de carga válida de Airtable');
      }
      
      // 2. Subir el archivo a la URL proporcionada por Airtable
      console.log(`DEBUG - Subiendo archivo a la URL proporcionada...`);
      
      const uploadResponse = await fetch(uploadUrlData.url, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType
        },
        body: buffer
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(`Error al subir archivo: ${uploadResponse.status} - ${errorText}`);
        throw new Error(`Error al subir archivo: ${uploadResponse.status} - ${errorText}`);
      }
      
      console.log(`DEBUG - Archivo subido correctamente`);
      
      // 3. Crear el registro en Airtable con el ID de archivo
      const base = getAirtableBase();
      
      console.log(`DEBUG - Creando registro en Airtable con referencia al archivo...`);
      
      // Crear el registro con el ID y la referencia al archivo
      const record = await base(tableImages).create({
        ID: imageId,
        [imageFieldName]: [
          {
            url: uploadUrlData.url,
            filename: fileName
          }
        ]
      });
      
      if (!record || !record.id) {
        throw new Error('No se pudo crear el registro en Airtable');
      }
      
      console.log(`DEBUG - Registro creado con ID: ${record.id}`);
      
      // Esperar un momento para que Airtable procese el archivo
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 4. Verificar que el registro contiene la imagen
      const checkRecord = await base(tableImages).find(record.id);
      
      if (checkRecord && 
          checkRecord.fields && 
          checkRecord.fields[imageFieldName] && 
          checkRecord.fields[imageFieldName].length > 0) {
        
        const image = checkRecord.fields[imageFieldName][0];
        
        return {
          success: true,
          id: checkRecord.id,
          imageId: imageId,
          url: image.url,
          thumbnails: image.thumbnails || {},
          size: image.size,
          type: image.type
        };
      }
      
      // Si llegamos aquí, la imagen no se adjuntó correctamente
      throw new Error('La imagen se subió pero no se adjuntó correctamente al registro');
      
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