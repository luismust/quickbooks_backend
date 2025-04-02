// api/tests.js
const Airtable = require('airtable');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');
const axios = require('axios');

// Configurar CORS para permitir solicitudes desde tu dominio
const allowCors = cors({
  origin: '*', // Puedes restringir a tus dominios específicos
});

// Campos exactos de la tabla de tests en Airtable
const FIELDS = {
  ID: 'id',
  NAME: 'name',
  DESCRIPTION: 'description',
  QUESTIONS: 'questions',
  MAX_SCORE: 'max_score',
  MIN_SCORE: 'min_score',
  CREATED_AT: 'created_at',
  IMAGES: 'images',
  PASSING_MESSAGE: 'passing_message',
  FAILING_MESSAGE: 'failing_message'
};

// Wrapper para añadir CORS a cada handler
const handleWithCors = (handler) => async (req, res) => {
  return allowCors(req, res, () => handler(req, res));
};

// Configurar Airtable
const getAirtableBase = () => {
  if (!process.env.AIRTABLE_API_KEY) {
    throw new Error('AIRTABLE_API_KEY is not defined');
  }
  
  if (!process.env.AIRTABLE_BASE_ID) {
    throw new Error('AIRTABLE_BASE_ID is not defined');
  }
  
  return new Airtable({ 
    apiKey: process.env.AIRTABLE_API_KEY,
    endpointUrl: 'https://api.airtable.com'
  }).base(process.env.AIRTABLE_BASE_ID);
};

// Manejador de la ruta GET /api/tests
async function handleGet(req, res) {
  try {
    const base = getAirtableBase();
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Tests';
    
    const records = await base(tableName).select().all();
    
    const tests = records.map(record => {
      const fields = record.fields;
      
      // Parsear las preguntas que están almacenadas como JSON
      let questions = [];
      try {
        questions = JSON.parse(fields[FIELDS.QUESTIONS] || '[]');
      } catch (error) {
        console.error('Error parsing questions:', error);
      }
      
      return {
        id: record.id,
        name: fields[FIELDS.NAME],
        description: fields[FIELDS.DESCRIPTION],
        questions: questions,
        maxScore: fields[FIELDS.MAX_SCORE],
        minScore: fields[FIELDS.MIN_SCORE],
        passingMessage: fields[FIELDS.PASSING_MESSAGE],
        failingMessage: fields[FIELDS.FAILING_MESSAGE],
      };
    });
    
    return res.status(200).json({ tests });
  } catch (error) {
    console.error('Error fetching tests:', error);
    return res.status(500).json({ error: 'Failed to fetch tests' });
  }
}

// Función auxiliar para generar un ID único
function generateUniqueId() {
  return 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Manejador de la ruta POST /api/tests
async function handlePost(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const test = req.body;
    const base = getAirtableBase();
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Tests';
    const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
    
    // Validar datos requeridos
    if (!test.name || !Array.isArray(test.questions)) {
      return res.status(400).json({ 
        error: 'Test name and questions are required',
        received: { 
          hasName: Boolean(test.name), 
          hasQuestions: Array.isArray(test.questions) 
        }
      });
    }
    
    // Asegurar que los campos opcionales tengan valores por defecto
    const testToSave = {
      ...test,
      description: test.description || '',
      maxScore: test.maxScore || 100,
      minScore: test.minScore || 60,
      passingMessage: test.passingMessage || "Congratulations!",
      failingMessage: test.failingMessage || "Try again"
    };
    
    // Procesar imágenes y simplificar preguntas
    const imageUploadPromises = [];
    const simplifiedQuestions = testToSave.questions.map(q => {
      const simplifiedQuestion = { ...q };
      
      // Manejar imágenes según su tipo
      if (q.image) {
        if (q.image.startsWith('data:')) {
          // Generar un ID único para la imagen
          const imageId = q.id || generateUniqueId();
          
          // Guardar la referencia en la pregunta
          simplifiedQuestion.image = `image_reference_${imageId}`;
          
          // Agregar a la lista de promesas de subida de imágenes
          imageUploadPromises.push(
            saveImageToAirtable(base, imageId, q.image)
              .then(attachmentUrl => {
                console.log(`Processed image for question ${q.id}, saved with reference: image_reference_${imageId}`);
                // Guardar la URL real de la imagen en la pregunta para acceso directo
                simplifiedQuestion.imageUrl = attachmentUrl;
                return { questionId: q.id, imageId, attachmentUrl };
              })
              .catch(err => {
                console.error(`Error saving image for question ${q.id}:`, err);
                return { questionId: q.id, imageId, error: err.message };
              })
          );
          
          delete simplifiedQuestion._imageData;
        }
        else if (q.image.startsWith('blob:')) {
          if (q._imageData) {
            const imageId = q.id || generateUniqueId();
            simplifiedQuestion.image = `image_reference_${imageId}`;
            
            // Agregar a la lista de promesas
            imageUploadPromises.push(
              saveImageToAirtable(base, imageId, q._imageData)
                .then(attachmentUrl => {
                  console.log(`Processed blob image for question ${q.id}, saved with reference: image_reference_${imageId}`);
                  // Guardar la URL real de la imagen en la pregunta para acceso directo
                  simplifiedQuestion.imageUrl = attachmentUrl;
                  return { questionId: q.id, imageId, attachmentUrl };
                })
                .catch(err => {
                  console.error(`Error saving blob image for question ${q.id}:`, err);
                  return { questionId: q.id, imageId, error: err.message };
                })
            );
            
            delete simplifiedQuestion._imageData;
          } else {
            console.warn(`Question ${q.id} has blob URL but no _imageData, using placeholder reference`);
            simplifiedQuestion.image = `image_reference_${q.id}`;
          }
        }
      }
      
      return simplifiedQuestion;
    });
    
    // Esperar a que todas las imágenes se suban
    await Promise.all(imageUploadPromises);
    
    // Crear registro en Airtable
    const recordData = {
      fields: {
        [FIELDS.NAME]: testToSave.name,
        [FIELDS.DESCRIPTION]: testToSave.description,
        [FIELDS.QUESTIONS]: JSON.stringify(simplifiedQuestions),
        [FIELDS.MAX_SCORE]: testToSave.maxScore,
        [FIELDS.MIN_SCORE]: testToSave.minScore,
        [FIELDS.PASSING_MESSAGE]: testToSave.passingMessage,
        [FIELDS.FAILING_MESSAGE]: testToSave.failingMessage
      }
    };
    
    const records = await base(tableName).create([recordData]);
    const createdRecord = records[0];
    
    // Preparar respuesta
    const responseData = {
      ...testToSave,
      id: createdRecord.id // Reemplazar ID con el de Airtable
    };
    
    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error saving test:', error);
    return res.status(500).json({ 
      error: 'Failed to save test',
      details: error.message
    });
  }
}

// Función para guardar imágenes en Airtable como attachments
async function saveImageToAirtable(base, imageId, imageData) {
  const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  
  try {
    // Extraer información de la imagen base64
    let fileName, mimeType, base64Content;
    
    if (imageData.startsWith('data:')) {
      // Formato: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...
      const matches = imageData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      
      if (!matches || matches.length !== 3) {
        throw new Error('Invalid base64 image format');
      }
      
      mimeType = matches[1];
      base64Content = matches[2];
      
      // Generar un nombre de archivo basado en el tipo MIME
      const extension = mimeType.split('/')[1] || 'jpg';
      fileName = `image_${imageId}.${extension}`;
    } else {
      // Si no es data:, asumimos que es base64 directo
      base64Content = imageData;
      mimeType = 'image/jpeg'; // Asumimos JPEG por defecto
      fileName = `image_${imageId}.jpg`;
    }
    
    // Convertir base64 a Buffer
    const buffer = Buffer.from(base64Content, 'base64');
    
    // Verificar si ya existe esta imagen en la tabla
    const existingRecords = await base(tableImages)
      .select({
        filterByFormula: `{ID}="${imageId}"`,
        maxRecords: 1
      })
      .all();
    
    // URL para subir directamente el archivo a Airtable
    const url = `https://api.airtable.com/v0/${baseId}/${tableImages}`;
    
    // Crear FormData para subir el archivo
    const formData = new FormData();
    formData.append('ID', imageId);
    
    // Agregar el archivo como un attachment
    formData.append('Image', buffer, {
      filename: fileName,
      contentType: mimeType
    });
    
    // Configurar la solicitud para subir el archivo
    const recordId = existingRecords.length > 0 ? existingRecords[0].id : null;
    const method = recordId ? 'PATCH' : 'POST';
    const specificUrl = recordId ? `${url}/${recordId}` : url;
    
    // Realizar la solicitud a la API de Airtable
    const response = await axios({
      method: method,
      url: specificUrl,
      data: {
        fields: {
          ID: imageId,
          Image: [
            {
              filename: fileName,
              type: mimeType,
              content: base64Content
            }
          ]
        }
      },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Obtener la URL de la imagen subida
    let attachmentUrl = '';
    if (response.data && response.data.fields && response.data.fields.Image) {
      attachmentUrl = response.data.fields.Image[0].url;
    }
    
    console.log(`${recordId ? 'Updated' : 'Created'} image with ID: ${imageId}`);
    return attachmentUrl;
    
  } catch (error) {
    console.error(`Error in saveImageToAirtable for ${imageId}:`, error);
    throw error; // Re-lanzar para manejar arriba
  }
}

// Handler principal que dirige a la función correcta según el método HTTP
module.exports = handleWithCors(async (req, res) => {
  // Parse JSON body for POST requests
  if (req.method === 'POST') {
    if (typeof req.body === 'string') {
      try {
        req.body = JSON.parse(req.body);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
    }
  }
  
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
});