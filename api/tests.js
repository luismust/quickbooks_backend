// api/tests.js
const Airtable = require('airtable');
const fetch = require('node-fetch');
const FormData = require('form-data');
const axios = require('axios');

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
    console.log('Received test data:', {
      id: test.id,
      name: test.name,
      questionsCount: test.questions ? test.questions.length : 0
    });
    
    const base = getAirtableBase();
    const tableName = process.env.AIRTABLE_TABLE_NAME;
    
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
    let imagesToProcess = [];
    const simplifiedQuestions = testToSave.questions.map(q => {
      const simplifiedQuestion = { ...q };
      
      // Manejar imágenes según su tipo
      if (q.image) {
        try {
          if (q.image.startsWith('data:')) {
            // Generar un ID único para la imagen
            const imageId = q.id || generateUniqueId();
            
            // Guardar la referencia en la pregunta
            simplifiedQuestion.image = `image_reference_${imageId}`;
            
            // Añadir a la lista para procesar después (no usar promesas directamente)
            imagesToProcess.push({
              questionId: q.id,
              imageId: imageId,
              imageData: q.image
            });
            
            delete simplifiedQuestion._imageData;
          }
          else if (q.image.startsWith('blob:')) {
            if (q._imageData) {
              const imageId = q.id || generateUniqueId();
              simplifiedQuestion.image = `image_reference_${imageId}`;
              
              // Añadir a la lista para procesar después
              imagesToProcess.push({
                questionId: q.id,
                imageId: imageId,
                imageData: q._imageData
              });
              
              delete simplifiedQuestion._imageData;
            } else {
              console.warn(`Question ${q.id} has blob URL but no _imageData, using placeholder reference`);
              simplifiedQuestion.image = `image_reference_${q.id}`;
            }
          }
        } catch (imgError) {
          console.error(`Error processing image for question ${q.id}:`, imgError);
          // Si hay error, simplemente guardar una referencia
          simplifiedQuestion.image = `image_reference_error`;
        }
      }
      
      return simplifiedQuestion;
    });
    
    // Guardar primero el test en Airtable para no bloquearnos con imágenes
    console.log('Saving test data to Airtable');
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
    
    // Crear registro en Airtable - esta es la operación crítica
    console.log('Creating Airtable record...');
    const records = await base(tableName).create([recordData]);
    
    if (!records || records.length === 0) {
      console.error('No records returned from Airtable create operation');
      return res.status(500).json({ 
        error: 'Failed to save test',
        details: 'No records returned from Airtable'
      });
    }
    
    const createdRecord = records[0];
    const testId = createdRecord.id;
    
    if (!testId) {
      console.error('No ID returned for created record:', createdRecord);
      return res.status(500).json({ 
        error: 'Failed to get test ID',
        details: 'Record created but no ID returned'
      });
    }
    
    console.log('Successfully created test with ID:', testId);
    
    // Preparar respuesta con el ID generado
    const responseData = {
      ...testToSave,
      id: testId
    };
    
    // Intentar procesar imágenes en segundo plano, pero no bloquear la respuesta
    if (imagesToProcess.length > 0) {
      console.log(`Processing ${imagesToProcess.length} images in background...`);
      
      // Esto se ejecutará en segundo plano y no bloqueará la respuesta
      (async () => {
        try {
          for (const img of imagesToProcess) {
            try {
              await saveImageToAirtable(base, img.imageId, img.imageData);
            } catch (imgError) {
              console.error(`Failed to save image ${img.imageId}:`, imgError);
              // Continuar con la siguiente imagen
            }
          }
          console.log('Background image processing completed');
        } catch (bgError) {
          console.error('Error in background image processing:', bgError);
        }
      })();
    }
    
    // Verificar que el ID está incluido en la respuesta antes de enviarla
    if (!responseData.id) {
      console.error('ID missing from response data:', responseData);
      responseData.id = testId; // Garantizar que el ID esté presente
    }
    
    // Enviar respuesta inmediatamente, sin esperar el procesamiento de imágenes
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
  try {
    // Si falta algún dato necesario, simplemente devolver una URL vacía
    if (!imageId || !imageData) {
      console.log('Skipping image upload due to missing data');
      return '';
    }

    const tableImages = process.env.AIRTABLE_TABLE_IMAGES;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const apiKey = process.env.AIRTABLE_API_KEY;
    
    
    // Extraer información de la imagen base64
    let fileName, mimeType, base64Content;
    
    if (imageData.startsWith('data:')) {
      // Formato: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...
      const matches = imageData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      
      if (!matches || matches.length !== 3) {
        console.warn('Invalid base64 image format, skipping upload');
        return '';
      }
      
      mimeType = matches[1];
      base64Content = matches[2];
      
      // Generar un nombre de archivo basado en el tipo MIME
      const extension = mimeType.split('/')[1] || 'jpg';
      fileName = `image_${imageId}.${extension}`;
    } else {
      // Si no es data:, simplemente saltarlo
      console.warn('Unsupported image format, skipping upload');
      return '';
    }
    
    // Validar que el contenido base64 es válido
    if (!base64Content || base64Content.length < 100) {
      console.warn('Base64 content too short or invalid');
      return '';
    }
    
    // Convertir base64 a Buffer
    const buffer = Buffer.from(base64Content, 'base64');
    
    try {
      // Verificar si ya existe esta imagen en la tabla
      const existingRecords = await base(tableImages)
        .select({
          filterByFormula: `{ID}="${imageId}"`,
          maxRecords: 1
        })
        .all();
      
      // URL para subir directamente el archivo a Airtable
      const url = `https://api.airtable.com/v0/${baseId}/${tableImages}`;
      
      // Configurar la solicitud para subir el archivo
      const recordId = existingRecords.length > 0 ? existingRecords[0].id : null;
      const method = recordId ? 'PATCH' : 'POST';
      const specificUrl = recordId ? `${url}/${recordId}` : url;
      
      // Realizar la solicitud a la API de Airtable con un timeout
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
        },
        timeout: 5000 // 5 segundos máximo
      });
      
      // Obtener la URL de la imagen subida
      let attachmentUrl = '';
      if (response.data && response.data.fields && response.data.fields.Image) {
        attachmentUrl = response.data.fields.Image[0].url;
      }
      
      console.log(`${recordId ? 'Updated' : 'Created'} image with ID: ${imageId}`);
      return attachmentUrl;
    } catch (uploadError) {
      console.error(`Failed to upload image ${imageId}:`, uploadError.message);
      // No propagar el error, simplemente devolver URL vacía
      return '';
    }
  } catch (error) {
    console.error(`Error in saveImageToAirtable for ${imageId}:`, error);
    // No propagar el error, simplemente devolver URL vacía
    return '';
  }
}

// Handler principal que dirige a la función correcta según el método HTTP
module.exports = async (req, res) => {
  // Para todas las solicitudes, establecer cabeceras CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://quickbooks-test-black.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version'
  );
  
  try {
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
      return await handleGet(req, res);
    } else if (req.method === 'POST') {
      return await handlePost(req, res);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Unhandled error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};