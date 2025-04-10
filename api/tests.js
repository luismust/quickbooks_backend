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
              const apiUrl = process.env.VERCEL_URL || 'https://quickbooks-backend.vercel.app';
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
            const apiUrl = process.env.VERCEL_URL || 'https://quickbooks-backend.vercel.app';
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
              const imageUrl = await saveImageToAirtable(base, img.imageId, img.imageData);
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
                  [FIELDS.QUESTIONS]: JSON.stringify(updatedQuestions),
                  [FIELDS.IMAGES]: 'processed'
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
async function saveImageToAirtable(base, imageId, imageData) {
  try {
    // Si falta algún dato necesario, simplemente devolver una URL vacía
    if (!imageId || !imageData) {
      console.log('Skipping image upload due to missing data');
      return '';
    }

    const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
    
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
      // NUEVO ENFOQUE: Usar Vercel Blob Storage
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
      
      // Paso 2: Crear o actualizar el registro en Airtable con la URL del blob
      // Primero verificar si ya existe este registro
      const existingRecords = await base(tableImages)
        .select({
          filterByFormula: `{ID}="${imageId}"`,
          maxRecords: 1
        })
        .all();
      
      let record;
      
      if (existingRecords.length > 0) {
        // Actualizar registro existente con la URL del blob
        const recordId = existingRecords[0].id;
        console.log(`Updating existing record for image ${imageId} with Blob URL`);
        
        record = await base(tableImages).update(recordId, {
          BlobURL: blob.url,
          Size: blob.size,
          ContentType: blob.contentType,
          Timestamp: new Date().toISOString()
        });
      } else {
        // Crear nuevo registro con la URL del blob
        console.log(`Creating new record for image ${imageId} with Blob URL`);
        
        const records = await base(tableImages).create([
          {
            fields: {
              ID: imageId,
              BlobURL: blob.url,
              Size: blob.size,
              ContentType: blob.contentType,
              Timestamp: new Date().toISOString()
            }
          }
        ]);
        
        if (!records || records.length === 0) {
          console.error('Failed to create record in Airtable');
          return blob.url; // Devolvemos la URL del blob aunque falle el registro en Airtable
        }
        
        record = records[0];
      }
      
      console.log(`Successfully recorded image ${imageId} in Airtable with Blob URL`);
      return blob.url;
      
    } catch (uploadError) {
      console.error(`Failed to upload image ${imageId}:`, uploadError.message);
      // No propagar el error, simplemente devolver URL vacía
      return '';
    }
  } catch (error) {
    console.error('Error in saveImageToAirtable:', error);
    return '';
  }
}

// Handler principal que dirige a la función correcta según el método HTTP
module.exports = async (req, res) => {
  // Para todas las solicitudes, establecer cabeceras CORS
  const origin = req.headers.origin || 'https://quickbooks-test-black.vercel.app';
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version'
  );
  
  // Responder inmediatamente a las solicitudes OPTIONS
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