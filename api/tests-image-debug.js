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
      
      // Asegurarnos de que estamos usando el ID de base correcto
      const baseId = process.env.AIRTABLE_BASE_ID;
      console.log(`Usando Base ID: ${baseId}`);
      console.log(`Intentando almacenar en Airtable - Tabla: ${tableImages}, Campo: ${imageFieldName}`);
      
      // ENFOQUE SIMPLE: Usar la API de Airtable SDK directamente con data URL
      try {
        console.log(`MÉTODO SIMPLE: Usar SDK de Airtable directamente`);
        
        // Crear registro con todos los datos de una vez
        const createResult = await base(tableImages).create({
          "ID": imageId,
          [imageFieldName]: [
            {
              url: imageData
            }
          ]
        });
        
        console.log(`Respuesta de creación:`, createResult.id ? 'ID: ' + createResult.id : 'Error: No ID');
        
        if (createResult && createResult.id) {
          // Obtener registro para verificar
          const checkRecord = await base(tableImages).find(createResult.id);
          console.log(`Verificando registro: `, 
            checkRecord.fields.ID, 
            checkRecord.fields[imageFieldName] ? 'Imagen encontrada' : 'Imagen no encontrada'
          );
          
          // Ver si tenemos la imagen
          if (checkRecord && 
              checkRecord.fields && 
              checkRecord.fields[imageFieldName] && 
              checkRecord.fields[imageFieldName].length > 0) {
            
            const image = checkRecord.fields[imageFieldName][0];
            
            return {
              success: true,
              method: "airtable-sdk-direct",
              id: checkRecord.id,
              imageId: imageId,
              url: image.url,
              thumbnails: image.thumbnails || {},
              size: image.size,
              type: image.type
            };
          }
        }
        
        // Si llegamos aquí, no tuvimos éxito con el método simple
        throw new Error("No se pudo crear el registro con imagen adjunta");
      } catch (sdkError) {
        console.error("Error en método simple:", sdkError.message);
        console.log("Intentando método alternativo...");
        
        // MÉTODO ALTERNATIVO: Primero crear registro y luego usar API HTTP directa
        // Primero crear un registro normal sin imagen
        const record = await base(tableImages).create({
          ID: imageId
        });
        
        if (!record.id) {
          throw new Error("No se pudo crear el registro base");
        }
        
        const recordId = record.id;
        console.log(`Registro base creado con ID: ${recordId}`);
        
        // Ahora vamos a utilizar el API HTTP directo de Airtable
        const apiKey = process.env.AIRTABLE_API_KEY;
        
        // Convertir la imagen base64 a un archivo binario
        const buffer = Buffer.from(base64Content, 'base64');
        
        // Crear un FormData para subir el archivo
        const formData = new FormData();
        formData.append('file', buffer, {
          filename: fileName,
          contentType: mimeType
        });
        
        // Construir URL específica para el campo de imagen (attachment)
        // Formato: https://api.airtable.com/v0/{baseId}/{tableId}/{recordId}/attachments/{fieldName}
        const uploadUrl = `https://api.airtable.com/v0/${baseId}/${tableImages}/${recordId}/attachments/${imageFieldName}`;
        
        console.log(`Intentando subir imagen a: ${uploadUrl}`);
        
        // Hacer la petición HTTP
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          body: formData
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Error HTTP: ${response.status} - ${errorText}`);
          throw new Error(`Error al subir imagen HTTP: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        console.log(`Respuesta de subida:`, result.id ? 'Éxito' : 'Fallo');
        
        // Verificar el registro actualizado
        const updatedRecord = await base(tableImages).find(recordId);
        
        if (updatedRecord && 
            updatedRecord.fields && 
            updatedRecord.fields[imageFieldName] && 
            updatedRecord.fields[imageFieldName].length > 0) {
          
          const image = updatedRecord.fields[imageFieldName][0];
          
          return {
            success: true,
            method: "http-attach-api",
            id: updatedRecord.id,
            imageId: imageId,
            url: image.url,
            thumbnails: image.thumbnails || {},
            size: image.size,
            type: image.type
          };
        }
        
        throw new Error("No se encontró la imagen en el registro actualizado");
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