// api/tests-image-debug.js - Versión simplificada para pruebas de imágenes
const Airtable = require('airtable');

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
      console.log('DEBUG - Iniciando enfoque directo con SDK de Airtable...');
      
      // Obtener la base de Airtable
      const base = getAirtableBase();
      
      // Convertir a URL fácilmente procesable
      const urlData = imageData;
      
      // Crear el registro usando directamente el SDK de Airtable
      console.log(`DEBUG - Creando registro con imageFieldName: ${imageFieldName}`);
      
      // Datos del registro a crear
      const recordData = {
        fields: {
          ID: imageId,
          [imageFieldName]: [{ 
            url: urlData
          }]
        }
      };
      
      console.log(`DEBUG - Estructura del registro:`, JSON.stringify(recordData, null, 2));
      
      // Crear el registro usando el enfoque más simple posible
      return new Promise((resolve, reject) => {
        base(tableImages).create([recordData], { typecast: true }, function(err, records) {
          if (err) {
            console.error('ERROR al crear registro en Airtable:', err);
            return reject(err);
          }
          
          if (!records || records.length === 0) {
            return reject(new Error('No se recibieron registros en la respuesta'));
          }
          
          const record = records[0];
          console.log(`DEBUG - Registro creado con ID:`, record.id);
          
          // Verificar que el registro se creó correctamente
          base(tableImages).find(record.id, function(err, retrievedRecord) {
            if (err) {
              console.warn('ERROR al verificar el registro:', err);
              // Si hay error al verificar, al menos devolvemos el ID
              return resolve({
                success: true,
                id: record.id,
                imageId: imageId,
                note: 'Registro creado pero no se pudo verificar'
              });
            }
            
            // Verificar si tiene el campo de imagen
            if (retrievedRecord.fields && 
                retrievedRecord.fields[imageFieldName] && 
                retrievedRecord.fields[imageFieldName].length > 0) {
              
              const image = retrievedRecord.fields[imageFieldName][0];
              return resolve({
                success: true,
                id: retrievedRecord.id,
                imageId: imageId,
                url: image.url,
                thumbnails: image.thumbnails || {},
                size: image.size,
                type: image.type
              });
            }
            
            // No se encontró la imagen en el registro
            return resolve({
              success: true,
              id: record.id,
              imageId: imageId,
              note: 'El registro se creó pero la imagen no se procesó correctamente'
            });
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