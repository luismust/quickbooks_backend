// api/save-test.js - Un endpoint especial para guardar tests
const Airtable = require('airtable');
const { put } = require('@vercel/blob');

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

// Función para generar un ID único
function generateUniqueId() {
  return 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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

// Manejador principal
module.exports = async (req, res) => {
  // Configuración manual de CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'https://quickbooks-test-black.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');
  
  // Manejar preflight OPTIONS
  if (req.method === 'OPTIONS') {
    console.log('[SAVE-TEST] Handling OPTIONS request');
    return res.status(200).end();
  }
  
  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', allowedMethods: ['POST'] });
  }
  
  try {
    // Procesar el cuerpo de la solicitud
    let test = req.body;
    if (typeof test === 'string') {
      try {
        test = JSON.parse(test);
      } catch (parseError) {
        console.error('[SAVE-TEST] Error parsing request body:', parseError);
        return res.status(400).json({ 
          error: 'Invalid JSON in request body',
          details: parseError.message
        });
      }
    }
    
    console.log('[SAVE-TEST] Received test data:', {
      id: test.id,
      name: test.name,
      questionsCount: test.questions ? test.questions.length : 0
    });
    
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
    
    // Preparar datos para Airtable
    const base = getAirtableBase();
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Tests';
    
    const FIELDS = {
      NAME: 'name',
      DESCRIPTION: 'description',
      QUESTIONS: 'questions',
      MAX_SCORE: 'max_score',
      MIN_SCORE: 'min_score',
      PASSING_MESSAGE: 'passing_message',
      FAILING_MESSAGE: 'failing_message'
    };
    
    // Guardar primero el test en Airtable
    console.log('[SAVE-TEST] Saving test data to Airtable');
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
    
    // Crear registro en Airtable
    console.log('[SAVE-TEST] Creating Airtable record...');
    let createdRecord;
    try {
      const records = await base(tableName).create([recordData]);
      
      if (!records || records.length === 0) {
        console.error('[SAVE-TEST] No records returned from Airtable create operation');
        return res.status(500).json({ 
          error: 'Failed to save test',
          details: 'No records returned from Airtable'
        });
      }
      
      createdRecord = records[0];
    } catch (airtableError) {
      console.error('[SAVE-TEST] Airtable create error:', airtableError);
      return res.status(500).json({ 
        error: 'Failed to save test in Airtable',
        details: airtableError.message || 'Unknown Airtable error'
      });
    }
    
    const testId = createdRecord.id;
    
    if (!testId) {
      console.error('[SAVE-TEST] No ID returned for created record:', createdRecord);
      return res.status(500).json({ 
        error: 'Failed to get test ID',
        details: 'Record created but no ID returned'
      });
    }
    
    console.log(`[SAVE-TEST] Successfully created test with ID: ${testId}`);
    
    // Preparar respuesta con el ID generado
    const responseData = {
      ...testToSave,
      id: testId,
      questions: simplifiedQuestions // Usar las preguntas simplificadas en la respuesta
    };
    
    // Intentar procesar imágenes en segundo plano, pero no bloquear la respuesta
    if (imagesToProcess.length > 0) {
      console.log(`[SAVE-TEST] Processing ${imagesToProcess.length} images in background...`);
      
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
              console.error(`[SAVE-TEST] Failed to save image ${img.imageId}:`, imgError);
              // Continuar con la siguiente imagen
            }
          }
          
          // Si tenemos resultados de imágenes, actualizar el test con sus URLs
          if (imageResults.length > 0) {
            console.log(`[SAVE-TEST] Successfully processed ${imageResults.length} images, updating test record...`);
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
              
              console.log('[SAVE-TEST] Test record updated with image URLs');
            } catch (updateError) {
              console.error('[SAVE-TEST] Failed to update test with image URLs:', updateError);
            }
          } else {
            console.warn('[SAVE-TEST] No images were successfully processed');
          }
          
          console.log('[SAVE-TEST] Background image processing completed');
        } catch (bgError) {
          console.error('[SAVE-TEST] Error in background image processing:', bgError);
        }
      })();
    }
    
    // Verificar que el ID está incluido en la respuesta antes de enviarla
    if (!responseData.id) {
      console.error('[SAVE-TEST] ID missing from response data:', responseData);
      responseData.id = testId; // Garantizar que el ID esté presente
    }
    
    // Enviar respuesta inmediatamente, sin esperar el procesamiento de imágenes
    return res.status(200).json(responseData);
  } catch (error) {
    console.error('[SAVE-TEST] Error saving test:', error);
    return res.status(500).json({ 
      error: 'Failed to save test',
      details: error.message
    });
  }
}; 