// api/save-test.js - Un endpoint especial para guardar tests
const Airtable = require('airtable');
let blobModule;

try {
  // Intentar importar @vercel/blob y registrar cualquier error
  blobModule = require('@vercel/blob');
  console.log('[SAVE-TEST] Successfully imported @vercel/blob module');
} catch (importError) {
  console.error('[SAVE-TEST] Error importing @vercel/blob:', importError);
  console.error('[SAVE-TEST] Stack trace:', importError.stack);
}

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

// Función para limpiar objetos de pregunta antes de guardar en Airtable
function cleanQuestionForAirtable(question) {
  // Crear una copia para no modificar el original
  const cleanedQuestion = { ...question };
  
  // Eliminar campos que contienen datos grandes y no son necesarios para Airtable
  delete cleanedQuestion._localFile;
  delete cleanedQuestion._imageData;
  delete cleanedQuestion._rawData;
  
  // Para cada propiedad del objeto, verificar si hay datos anidados
  Object.keys(cleanedQuestion).forEach(key => {
    // Si el valor es null o undefined, mantenerlo
    if (cleanedQuestion[key] == null) {
      return;
    }
    
    // Si es un objeto grande (como un blob o string muy largo), transformarlo
    if (typeof cleanedQuestion[key] === 'string' && cleanedQuestion[key].length > 1000) {
      // Si es una cadena muy larga que no es una URL, reemplazar por NULL
      if (!cleanedQuestion[key].startsWith('http')) {
        console.log(`[SAVE-TEST] Replacing long string in question.${key} with null`);
        cleanedQuestion[key] = null;
      }
    }
    
    // Si es un objeto o array, limpiarlo recursivamente
    if (typeof cleanedQuestion[key] === 'object') {
      if (Array.isArray(cleanedQuestion[key])) {
        cleanedQuestion[key] = cleanedQuestion[key].map(item => {
          if (typeof item === 'object' && item !== null) {
            // Limpiar objetos dentro de arrays
            return cleanQuestionForAirtable(item);
          }
          return item;
        });
      } else if (cleanedQuestion[key] !== null) {
        // Limpiar objetos anidados
        cleanedQuestion[key] = cleanQuestionForAirtable(cleanedQuestion[key]);
      }
    }
  });
  
  return cleanedQuestion;
}

// Función para guardar una imagen usando Vercel Blob Storage
async function saveImageToBlob(imageId, imageData) {
  try {
    // Si falta algún dato necesario, simplemente devolver una URL vacía
    if (!imageId || !imageData) {
      console.log('[SAVE-TEST] Skipping image upload due to missing data');
      return '';
    }
    
    console.log(`[SAVE-TEST] Processing image ${imageId}, data length: ${imageData ? imageData.length : 0}`);
    
    // Extraer información de la imagen base64
    let fileName, mimeType, base64Content;
    
    if (typeof imageData !== 'string') {
      console.warn(`[SAVE-TEST] Image data for ${imageId} is not a string, type: ${typeof imageData}`);
      return '';
    }
    
    if (imageData.startsWith('data:')) {
      // Formato: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...
      const matches = imageData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      
      if (!matches || matches.length !== 3) {
        console.warn(`[SAVE-TEST] Invalid base64 image format for ${imageId}, matches: ${matches ? matches.length : 0}`);
        return '';
      }
      
      mimeType = matches[1];
      base64Content = matches[2];
      
      // Generar un nombre de archivo basado en el tipo MIME
      const extension = mimeType.split('/')[1] || 'jpg';
      fileName = `image_${imageId}.${extension}`;
      
      console.log(`[SAVE-TEST] Successfully extracted image data for ${imageId}, mime: ${mimeType}, filename: ${fileName}`);
    } else {
      // Si no es data:, simplemente saltarlo
      console.warn(`[SAVE-TEST] Unsupported image format for ${imageId}, starts with: ${imageData.substring(0, 10)}...`);
      return '';
    }
    
    // Validar que el contenido base64 es válido
    if (!base64Content || base64Content.length < 100) {
      console.warn(`[SAVE-TEST] Base64 content too short or invalid for ${imageId}, length: ${base64Content ? base64Content.length : 0}`);
      return '';
    }
    
    try {
      // Verificar si el módulo de blob está disponible
      if (!blobModule || !blobModule.put) {
        console.error('[SAVE-TEST] @vercel/blob module or put function not available');
        return '';
      }
      
      // Usar Vercel Blob Storage
      console.log(`[SAVE-TEST] Uploading image ${imageId} to Vercel Blob Storage`);
      
      // Convertir base64 a buffer para upload
      const buffer = Buffer.from(base64Content, 'base64');
      
      if (!buffer || buffer.length === 0) {
        console.error(`[SAVE-TEST] Failed to create buffer from base64 for ${imageId}`);
        return '';
      }
      
      console.log(`[SAVE-TEST] Created buffer of size ${buffer.length} bytes for ${imageId}`);
      
      // Subir a Vercel Blob Storage usando el módulo importado
      const blob = await blobModule.put(fileName, buffer, {
        contentType: mimeType,
        access: 'public', // Hacemos que sea accesible públicamente
      });
      
      if (!blob || !blob.url) {
        console.error(`[SAVE-TEST] Failed to upload to Vercel Blob Storage for ${imageId}, no blob URL returned`);
        return '';
      }
      
      console.log(`[SAVE-TEST] Successfully uploaded image to Vercel Blob: ${blob.url}`);
      
      return blob.url;
    } catch (uploadError) {
      console.error(`[SAVE-TEST] Failed to upload image ${imageId}:`, uploadError);
      console.error(`[SAVE-TEST] Stack trace:`, uploadError.stack);
      // No propagar el error, simplemente devolver URL vacía
      return '';
    }
  } catch (error) {
    console.error('[SAVE-TEST] Error in saveImageToBlob:', error);
    console.error('[SAVE-TEST] Stack trace:', error.stack);
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
          console.log(`[SAVE-TEST] Processing image for question ${q.id || 'unknown'}, type: ${typeof q.image}`);
          
          // Imprimir todas las propiedades de la pregunta relacionadas con imágenes
          if (q._imageData) console.log(`[SAVE-TEST] _imageData present: ${typeof q._imageData}, length: ${typeof q._imageData === 'string' ? q._imageData.length : 'N/A'}, starts with: ${typeof q._imageData === 'string' ? q._imageData.substring(0, 20) + '...' : 'N/A'}`);
          if (q._localFile) console.log(`[SAVE-TEST] _localFile present: ${typeof q._localFile}, length: ${typeof q._localFile === 'string' ? q._localFile.length : 'N/A'}, starts with: ${typeof q._localFile === 'string' ? q._localFile.substring(0, 20) + '...' : 'N/A'}`);
          console.log(`[SAVE-TEST] image: ${typeof q.image}, ${typeof q.image === 'string' ? `length: ${q.image.length}, starts with: ${q.image.substring(0, 20)}...` : 'not a string'}`);
          
          // Si tenemos _imageData explícito, usarlo con prioridad
          if (q._imageData && typeof q._imageData === 'string' && q._imageData.startsWith('data:')) {
            console.log(`[SAVE-TEST] Using explicit _imageData field for question ${q.id || 'unknown'}`);
            const imageId = q.id || generateUniqueId();
            simplifiedQuestion.imageId = imageId;
            simplifiedQuestion.image = null;
            
            imagesToProcess.push({
              questionId: q.id,
              imageId: imageId,
              imageData: q._imageData
            });
          }
          // Si es base64 directo en image
          else if (q.image.startsWith('data:')) {
            console.log(`[SAVE-TEST] Image is data URL, processing for question ${q.id || 'unknown'}`);
            const imageId = q.id || generateUniqueId();
            
            simplifiedQuestion.imageId = imageId;
            simplifiedQuestion.image = null;
            
            imagesToProcess.push({
              questionId: q.id,
              imageId: imageId,
              imageData: q.image
            });
          }
          // Si es blob URL pero tenemos base64 en _localFile
          else if (q.image.startsWith('blob:')) {
            console.log(`[SAVE-TEST] Image is blob URL: ${q.image} for question ${q.id || 'unknown'}`);
            
            if (q._localFile && typeof q._localFile === 'string' && q._localFile.startsWith('data:')) {
              console.log(`[SAVE-TEST] Found _localFile for blob URL, using it for question ${q.id || 'unknown'}`);
              const imageId = q.id || generateUniqueId();
              
              simplifiedQuestion.imageId = imageId;
              simplifiedQuestion.image = null;
              
              imagesToProcess.push({
                questionId: q.id,
                imageId: imageId,
                imageData: q._localFile
              });
            } 
            else {
              console.warn(`[SAVE-TEST] Blob URL detected, but no _localFile available for question ${q.id || 'unknown'}`);
              // No podemos procesar un blob URL directamente sin _localFile
              simplifiedQuestion.image = null;
              
              // Si tenemos una URL anterior guardada, intentar mantenerla
              if (q.imageId) {
                console.log(`[SAVE-TEST] Keeping existing imageId ${q.imageId} for blob URL without _localFile`);
                simplifiedQuestion.imageId = q.imageId;
              }
            }
          }
          // Si es HTTP URL, mantenerla
          else if (q.image.startsWith('http')) {
            console.log(`[SAVE-TEST] Image is HTTP URL, keeping as is for question ${q.id || 'unknown'}`);
            simplifiedQuestion.image = q.image;
          }
          // Otros casos no manejados
          else {
            console.warn(`[SAVE-TEST] Question ${q.id || 'unknown'} has unrecognized image format: ${typeof q.image === 'string' ? q.image.substring(0, 20) + '...' : typeof q.image}`);
            simplifiedQuestion.image = null;
          }
        } catch (imgError) {
          console.error(`[SAVE-TEST] Error processing image for question ${q.id || 'unknown'}:`, imgError);
          simplifiedQuestion.image = null;
        }
      }
      
      // Limpiar la pregunta antes de guardarla en Airtable
      return cleanQuestionForAirtable(simplifiedQuestion);
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
    
    // Registrar el tamaño del JSON para diagnóstico
    const questionsJson = JSON.stringify(simplifiedQuestions);
    console.log(`[SAVE-TEST] Size of questions JSON: ${questionsJson.length} characters`);
    
    if (questionsJson.length > 100000) {
      console.error(`[SAVE-TEST] Questions JSON is too large (${questionsJson.length} chars), Airtable might reject it`);
    }
    
    const recordData = {
      fields: {
        [FIELDS.NAME]: testToSave.name,
        [FIELDS.DESCRIPTION]: testToSave.description,
        [FIELDS.QUESTIONS]: questionsJson,
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
      console.log(`[SAVE-TEST] Starting background processing of ${imagesToProcess.length} images...`);
      
      // Detallar las imágenes que se van a procesar
      imagesToProcess.forEach((img, index) => {
        console.log(`[SAVE-TEST] Image ${index + 1}/${imagesToProcess.length}: questionId=${img.questionId}, imageId=${img.imageId}, dataType=${typeof img.imageData}, dataLength=${img.imageData ? img.imageData.length : 0}`);
      });
      
      // Esto se ejecutará en segundo plano y no bloqueará la respuesta
      (async () => {
        try {
          const imageResults = [];
          for (const img of imagesToProcess) {
            try {
              console.log(`[SAVE-TEST:BACKGROUND] Processing image for questionId=${img.questionId}, imageId=${img.imageId}`);
              
              if (!img.imageData || typeof img.imageData !== 'string') {
                console.error(`[SAVE-TEST:BACKGROUND] Invalid image data for imageId=${img.imageId}, type=${typeof img.imageData}`);
                continue;
              }
              
              const imageUrl = await saveImageToBlob(img.imageId, img.imageData);
              if (imageUrl) {
                console.log(`[SAVE-TEST:BACKGROUND] Successfully uploaded image to ${imageUrl}`);
                imageResults.push({
                  questionId: img.questionId,
                  imageId: img.imageId,
                  url: imageUrl
                });
              } else {
                console.error(`[SAVE-TEST:BACKGROUND] Failed to upload image for imageId=${img.imageId}`);
              }
            } catch (imgError) {
              console.error(`[SAVE-TEST:BACKGROUND] Failed to save image ${img.imageId}:`, imgError);
              console.error(`[SAVE-TEST:BACKGROUND] Stack trace:`, imgError.stack);
              // Continuar con la siguiente imagen
            }
          }
          
          // Si tenemos resultados de imágenes, actualizar el test con sus URLs
          if (imageResults.length > 0) {
            console.log(`[SAVE-TEST:BACKGROUND] Successfully processed ${imageResults.length}/${imagesToProcess.length} images, updating test record...`);
            
            try {
              // Obtener el test recién creado
              const testRecord = await base(tableName).find(testId);
              const updatedQuestions = JSON.parse(testRecord.fields[FIELDS.QUESTIONS] || '[]');
              
              // Actualizar las URLs de las imágenes
              let updatedCount = 0;
              updatedQuestions.forEach(q => {
                const imageResult = imageResults.find(img => 
                  (img.questionId && img.questionId === q.id) || 
                  (img.imageId && img.imageId === q.imageId)
                );
                
                if (imageResult) {
                  updatedCount++;
                  console.log(`[SAVE-TEST:BACKGROUND] Updating question ${q.id} with image URL: ${imageResult.url}`);
                  q.image = imageResult.url;
                }
              });
              
              console.log(`[SAVE-TEST:BACKGROUND] Updated ${updatedCount} questions with image URLs`);
              
              // Guardar las preguntas actualizadas
              await base(tableName).update(testId, {
                fields: {
                  [FIELDS.QUESTIONS]: JSON.stringify(updatedQuestions)
                }
              });
              
              console.log(`[SAVE-TEST:BACKGROUND] Test record ${testId} updated with image URLs`);
            } catch (updateError) {
              console.error('[SAVE-TEST:BACKGROUND] Failed to update test with image URLs:', updateError);
              console.error('[SAVE-TEST:BACKGROUND] Stack trace:', updateError.stack);
            }
          } else {
            console.warn(`[SAVE-TEST:BACKGROUND] No images were successfully processed out of ${imagesToProcess.length} attempts`);
          }
          
          console.log('[SAVE-TEST:BACKGROUND] Background image processing completed');
        } catch (bgError) {
          console.error('[SAVE-TEST:BACKGROUND] Error in background image processing:', bgError);
          console.error('[SAVE-TEST:BACKGROUND] Stack trace:', bgError.stack);
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