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

// Función para asegurar que una URL tenga el protocolo https://
function ensureHttpsProtocol(url) {
  if (!url) return url;
  
  // Si ya tiene protocolo, devolverlo tal cual
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // Añadir https:// al inicio
  return `https://${url}`;
}

// Manejador de la ruta GET /api/tests
async function handleGet(req, res) {
  try {
    const base = getAirtableBase();
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Tests';
    
    // Opcionalmente, obtener un test específico por ID
    const { id } = req.query;
    let records;
    
    if (id) {
      // Buscar un test específico por ID
      try {
        const record = await base(tableName).find(id);
        records = [record];
      } catch (findError) {
        console.error(`Error finding test with ID ${id}:`, findError);
        return res.status(404).json({ error: `Test with ID ${id} not found` });
      }
    } else {
      // Obtener todos los tests
      records = await base(tableName).select().all();
    }
    
    // Transformar registros a formato amigable para el frontend
    const tests = records.map(record => {
      const fields = record.fields;
      
      // Parsear las preguntas que están almacenadas como JSON
      let questions = [];
      try {
        questions = JSON.parse(fields[FIELDS.QUESTIONS] || '[]');
        
        // Transformar referencias de imágenes a URLs accesibles
        questions = questions.map(question => {
          const processedQuestion = { ...question };
          
          // Si hay una imagen, convertirla en una URL accesible mediante nuestro endpoint
          if (question.image) {
            // Si ya es una URL completa de http, dejarla como está
            if (question.image.startsWith('http')) {
              console.log(`Question ${question.id}: Using direct image URL: ${question.image.substring(0, 70)}...`);
              processedQuestion.image = question.image;
            } 
            // Si tenemos un ID de imagen, crear una URL a nuestro endpoint
            else if (question.imageId) {
              let apiUrl = process.env.VERCEL_URL || 'quickbooks-backend.vercel.app';
              apiUrl = ensureHttpsProtocol(apiUrl);
              
              // Usar redirección directa para que el frontend reciba la imagen directamente
              const imageUrl = `${apiUrl}/api/images?id=${question.imageId}&redirect=1`;
              console.log(`Question ${question.id}: Created image URL from ID ${question.imageId}: ${imageUrl}`);
              processedQuestion.image = imageUrl;
            }
            // Si es null u otro valor, mantenerlo pero loggear
            else {
              console.log(`Question ${question.id}: No valid image reference found, value: ${question.image}`);
            }
          } else if (question.imageId) {
            // Si no hay imagen pero sí hay imageId, también crear la URL
            let apiUrl = process.env.VERCEL_URL || 'quickbooks-backend.vercel.app';
            apiUrl = ensureHttpsProtocol(apiUrl);
            
            // Usar redirección directa para que el frontend reciba la imagen directamente
            const imageUrl = `${apiUrl}/api/images?id=${question.imageId}&redirect=1`;
            console.log(`Question ${question.id}: Created image URL from ID ${question.imageId} (no direct image): ${imageUrl}`);
            processedQuestion.image = imageUrl;
          } else {
            console.log(`Question ${question.id}: No image data available`);
          }
          
          return processedQuestion;
        });
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
        createdAt: fields[FIELDS.CREATED_AT],
      };
    });
    
    // Si se solicitó un ID específico, devolver solo ese test
    if (id) {
      return res.status(200).json(tests[0] || null);
    }
    
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
    
    let test = req.body;
    
    // Si el body es string, intentar parsearlo como JSON
    if (typeof test === 'string') {
      try {
        test = JSON.parse(test);
      } catch (parseError) {
        console.error('Error parsing request body:', parseError);
        return res.status(400).json({ 
          error: 'Invalid JSON in request body',
          details: parseError.message
        });
      }
    }
    
    console.log('Received test data:', {
      id: test.id,
      name: test.name,
      questionsCount: test.questions ? test.questions.length : 0
    });
    
    // Verificar que tenemos las variables de entorno necesarias
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID || !process.env.AIRTABLE_TABLE_NAME) {
      console.error('Missing environment variables:', {
        hasApiKey: Boolean(process.env.AIRTABLE_API_KEY),
        hasBaseId: Boolean(process.env.AIRTABLE_BASE_ID),
        hasTableName: Boolean(process.env.AIRTABLE_TABLE_NAME)
      });
      return res.status(500).json({ error: 'Server configuration error - missing Airtable credentials' });
    }
    
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
            simplifiedQuestion.imageId = imageId; // Guardar el ID para referencias futuras
            simplifiedQuestion.image = null; // Vaciar el campo de imagen para no almacenar datos grandes
            
            // Añadir a la lista para procesar después
            imagesToProcess.push({
              questionId: q.id,
              imageId: imageId,
              imageData: q.image
            });
          }
          else if (q.image.startsWith('blob:')) {
            if (q._imageData) {
              const imageId = q.id || generateUniqueId();
              simplifiedQuestion.imageId = imageId;
              simplifiedQuestion.image = null;
              
              // Añadir a la lista para procesar después
              imagesToProcess.push({
                questionId: q.id,
                imageId: imageId,
                imageData: q._imageData
              });
            } else {
              console.warn(`Question ${q.id} has blob URL but no _imageData, skipping image`);
              simplifiedQuestion.image = null;
            }
          } else if (q.image.startsWith('http')) {
            // Ya es una URL, mantenerla como está
            simplifiedQuestion.image = q.image;
          } else {
            // No es un formato reconocido
            console.warn(`Question ${q.id} has unrecognized image format: ${q.image.substring(0, 20)}...`);
            simplifiedQuestion.image = null;
          }
        } catch (imgError) {
          console.error(`Error processing image for question ${q.id}:`, imgError);
          simplifiedQuestion.image = null;
        }
      }
      
      return simplifiedQuestion;
    });
    
    // Guardar primero el test en Airtable
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
    let createdRecord;
    try {
      const records = await base(tableName).create([recordData]);
      
      if (!records || records.length === 0) {
        console.error('No records returned from Airtable create operation');
        return res.status(500).json({ 
          error: 'Failed to save test',
          details: 'No records returned from Airtable'
        });
      }
      
      createdRecord = records[0];
    } catch (airtableError) {
      console.error('Airtable create error:', airtableError);
      return res.status(500).json({ 
        error: 'Failed to save test in Airtable',
        details: airtableError.message || 'Unknown Airtable error'
      });
    }
    
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
      id: testId,
      questions: simplifiedQuestions // Usar las preguntas simplificadas en la respuesta
    };
    
    // Intentar procesar imágenes en segundo plano, pero no bloquear la respuesta
    if (imagesToProcess.length > 0) {
      console.log(`Processing ${imagesToProcess.length} images in background...`);
      
      // Esto se ejecutará en segundo plano y no bloqueará la respuesta
      (async () => {
        try {
          const imageResults = [];
          for (const img of imagesToProcess) {
            try {
              const imageUrl = await saveImageToBlob(img.imageId, img.imageData);
              if (imageUrl) {
                imageResults.push({
                  questionId: img.questionId,
                  imageId: img.imageId,
                  url: imageUrl
                });
              }
            } catch (imgError) {
              console.error(`Failed to save image ${img.imageId}:`, imgError);
              // Continuar con la siguiente imagen
            }
          }
          
          // Si tenemos resultados de imágenes, actualizar el test con sus URLs
          if (imageResults.length > 0) {
            console.log(`Successfully processed ${imageResults.length} images, updating test record...`);
            try {
              // Obtener el test recién creado
              const testRecord = await base(tableName).find(testId);
              const updatedQuestions = JSON.parse(testRecord.fields[FIELDS.QUESTIONS] || '[]');
              
              // Actualizar las URLs de las imágenes
              updatedQuestions.forEach(q => {
                const imageResult = imageResults.find(img => img.questionId === q.id || img.imageId === q.imageId);
                if (imageResult) {
                  q.image = imageResult.url;
                }
              });
              
              // Guardar las preguntas actualizadas
              await base(tableName).update(testId, {
                fields: {
                  [FIELDS.QUESTIONS]: JSON.stringify(updatedQuestions)
                }
              });
              
              console.log('Test record updated with image URLs');
            } catch (updateError) {
              console.error('Failed to update test with image URLs:', updateError);
            }
          } else {
            console.warn('No images were successfully processed');
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

// Función para guardar una imagen usando Vercel Blob Storage
async function saveImageToBlob(imageId, imageData) {
  try {
    // Si falta algún dato necesario, simplemente devolver una URL vacía
    if (!imageId || !imageData) {
      console.log('Skipping image upload due to missing data');
      return '';
    }
    
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
    
    try {
      // Usar Vercel Blob Storage
      const { put } = require('@vercel/blob');
      
      console.log(`Uploading image ${imageId} to Vercel Blob Storage`);
      
      // Convertir base64 a buffer para upload
      const buffer = Buffer.from(base64Content, 'base64');
      
      // Subir a Vercel Blob Storage
      const blob = await put(fileName, buffer, {
        contentType: mimeType,
        access: 'public', // Hacemos que sea accesible públicamente
      });
      
      if (!blob || !blob.url) {
        console.error('Failed to upload to Vercel Blob Storage');
        return '';
      }
      
      console.log(`Successfully uploaded image to Vercel Blob: ${blob.url}`);
      return blob.url;
      
    } catch (uploadError) {
      console.error(`Failed to upload image ${imageId}:`, uploadError.message);
      // No propagar el error, simplemente devolver URL vacía
      return '';
    }
  } catch (error) {
    console.error('Error in saveImageToBlob:', error);
    return '';
  }
}

// Manejador para la ruta DELETE /api/tests/:id
async function handleDelete(req, res) {
  try {
    console.log(`[DELETE] Processing request with URL: ${req.url}`);
    
    // Extraer el ID del test de la URL
    let testId;
    
    // Diferentes patrones de URL para extraer el ID
    if (req.url.includes('/api/tests/')) {
      // Formato: /api/tests/ID
      testId = req.url.split('/api/tests/')[1].split('?')[0];
    } else if (req.url.includes('/tests/')) {
      // Formato: /tests/ID
      testId = req.url.split('/tests/')[1].split('?')[0];
    } else {
      // Último recurso: tomar la última parte de la URL
      const urlParts = req.url.split('/');
      testId = urlParts[urlParts.length - 1].split('?')[0];
    }
    
    console.log(`[DELETE] Extracted test ID: ${testId}`);
    
    if (!testId) {
      return res.status(400).json({ error: 'Test ID is required' });
    }
    
    const base = getAirtableBase();
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Tests';
    
    // Verificar que el test existe
    try {
      await base(tableName).find(testId);
    } catch (findError) {
      console.error(`[DELETE] Error finding test with ID ${testId}:`, findError);
      return res.status(404).json({ error: `Test with ID ${testId} not found` });
    }
    
    // Eliminar el test
    try {
      await base(tableName).destroy(testId);
      console.log(`[DELETE] Successfully deleted test with ID: ${testId}`);
    } catch (deleteError) {
      console.error(`[DELETE] Error deleting test with ID ${testId}:`, deleteError);
      return res.status(500).json({ 
        error: 'Failed to delete test',
        details: deleteError.message 
      });
    }
    
    return res.status(200).json({ 
      success: true,
      message: `Test with ID ${testId} successfully deleted`
    });
  } catch (error) {
    console.error('[DELETE] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to delete test',
      details: error.message 
    });
  }
}

// Handler principal que dirige a la función correcta según el método HTTP
module.exports = async (req, res) => {
  // Para solicitudes OPTIONS, responder inmediatamente
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
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
    
    // Log de la solicitud para depuración
    console.log(`[ROUTER] Processing ${req.method} request with URL: ${req.url}`);
    
    if (req.method === 'GET') {
      return await handleGet(req, res);
    } else if (req.method === 'POST') {
      return await handlePost(req, res);
    } else if (req.method === 'DELETE') {
      return await handleDelete(req, res);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Unhandled error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};