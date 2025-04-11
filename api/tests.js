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

// Función para guardar una imagen usando Vercel Blob Storage
async function saveImageToBlob(imageId, imageData) {
  try {
    // Si falta algún dato necesario, simplemente devolver una URL vacía
    if (!imageId || !imageData) {
      console.log('[SAVE-IMAGE] Skipping image upload due to missing data');
      return '';
    }
    
    console.log(`[SAVE-IMAGE] Processing image ${imageId}, data length: ${imageData ? imageData.length : 0}`);
    
    // Extraer información de la imagen base64
    let fileName, mimeType, base64Content;
    
    if (typeof imageData !== 'string') {
      console.warn(`[SAVE-IMAGE] Image data for ${imageId} is not a string, type: ${typeof imageData}`);
      return '';
    }
    
    // Manejar diferentes formatos de datos de imagen
    if (imageData.startsWith('data:')) {
      // Formato: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...
      const matches = imageData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      
      if (!matches || matches.length !== 3) {
        console.warn(`[SAVE-IMAGE] Invalid base64 image format for ${imageId}, matches: ${matches ? matches.length : 0}`);
        return '';
      }
      
      mimeType = matches[1];
      base64Content = matches[2];
      
      // Generar un nombre de archivo basado en el tipo MIME
      const extension = mimeType.split('/')[1] || 'jpg';
      fileName = `image_${imageId}.${extension}`;
      
      console.log(`[SAVE-IMAGE] Successfully extracted image data for ${imageId}, mime: ${mimeType}, filename: ${fileName}`);
    } else {
      // Si no es data:, simplemente saltarlo
      console.warn(`[SAVE-IMAGE] Unsupported image format for ${imageId}, starts with: ${imageData.substring(0, 10)}...`);
      return '';
    }
    
    // Validar que el contenido base64 es válido
    if (!base64Content || base64Content.length < 100) {
      console.warn(`[SAVE-IMAGE] Base64 content too short or invalid for ${imageId}, length: ${base64Content ? base64Content.length : 0}`);
      return '';
    }
    
    try {
      // Usar Vercel Blob Storage
      const { put } = require('@vercel/blob');
      
      console.log(`[SAVE-IMAGE] Uploading image ${imageId} to Vercel Blob Storage`);
      
      // Convertir base64 a buffer para upload
      const buffer = Buffer.from(base64Content, 'base64');
      
      if (!buffer || buffer.length === 0) {
        console.error(`[SAVE-IMAGE] Failed to create buffer from base64 for ${imageId}`);
        return '';
      }
      
      console.log(`[SAVE-IMAGE] Created buffer of size ${buffer.length} bytes for ${imageId}`);
      
      // Crear un stream a partir del buffer
      const { Readable } = require('stream');
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null); // Indica fin del stream
      
      // Subir a Vercel Blob Storage - usando el enfoque recomendado para streams
      const blob = await put(fileName, stream, {
        contentType: mimeType,
        access: 'public', // Hacemos que sea accesible públicamente
      });
      
      if (!blob || !blob.url) {
        console.error(`[SAVE-IMAGE] Failed to upload to Vercel Blob Storage for ${imageId}, no blob URL returned`);
        return '';
      }
      
      console.log(`[SAVE-IMAGE] Successfully uploaded image to Vercel Blob: ${blob.url}`);
      return blob.url;
      
    } catch (uploadError) {
      console.error(`[SAVE-IMAGE] Failed to upload image ${imageId}:`, uploadError);
      console.error(`[SAVE-IMAGE] Stack trace:`, uploadError.stack);
      // No propagar el error, simplemente devolver URL vacía
      return '';
    }
  } catch (error) {
    console.error('[SAVE-IMAGE] Error in saveImageToBlob:', error);
    console.error('[SAVE-IMAGE] Stack trace:', error.stack);
    return '';
  }
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
        console.error('[POST] Error parsing request body:', parseError);
        return res.status(400).json({ 
          error: 'Invalid JSON in request body',
          details: parseError.message
        });
      }
    }
    
    console.log('[POST] Received test data:', {
      id: test.id,
      name: test.name,
      questionsCount: test.questions ? test.questions.length : 0
    });
    
    // Verificar que tenemos las variables de entorno necesarias
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID || !process.env.AIRTABLE_TABLE_NAME) {
      console.error('[POST] Missing environment variables:', {
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
      // Crear una copia limpia sin propiedades grandes
      const simplifiedQuestion = { ...q };
      
      // Eliminar propiedades que puedan contener datos grandes
      delete simplifiedQuestion._localFile;
      delete simplifiedQuestion._imageData;
      delete simplifiedQuestion._rawData;
      
      console.log(`[POST] Processing question ID: ${q.id}, type: ${q.type}`);
      
      // Detectar si es una pregunta tipo "clickArea"
      const isClickArea = q.type === 'clickArea';
      if (isClickArea) {
        console.log(`[POST] Question ${q.id} is a clickArea type, requires special image handling`);
        
        // Para preguntas tipo clickArea, debemos asegurarnos de procesar la imagen
        // Ya que estas preguntas dependen fundamentalmente de la imagen
        if (q._imageData && typeof q._imageData === 'string' && q._imageData.startsWith('data:')) {
          console.log(`[POST] Found explicit _imageData for clickArea question ${q.id}`);
          const imageId = q.id || generateUniqueId();
          simplifiedQuestion.imageId = imageId;
          simplifiedQuestion.image = null;
          
          imagesToProcess.push({
            questionId: q.id,
            imageId: imageId,
            imageData: q._imageData,
            priority: 'high' // Prioridad alta para asegurar que se procese
          });
        } else if (q._localFile && typeof q._localFile === 'string' && q._localFile.startsWith('data:')) {
          console.log(`[POST] Found _localFile for clickArea question ${q.id}`);
          const imageId = q.id || generateUniqueId();
          simplifiedQuestion.imageId = imageId;
          simplifiedQuestion.image = null;
          
          imagesToProcess.push({
            questionId: q.id,
            imageId: imageId,
            imageData: q._localFile,
            priority: 'high'
          });
        }
        // En caso de que la imagen esté en formato base64 directamente en el campo image
        else if (q.image && typeof q.image === 'string' && q.image.startsWith('data:')) {
          console.log(`[POST] Using direct image base64 data for clickArea question ${q.id}`);
          const imageId = q.id || generateUniqueId();
          simplifiedQuestion.imageId = imageId;
          simplifiedQuestion.image = null;
          
          imagesToProcess.push({
            questionId: q.id,
            imageId: imageId,
            imageData: q.image,
            priority: 'high'
          });
        }
      }
      
      // Manejar imágenes según su tipo
      if (q.image) {
        try {
          console.log(`[POST] Processing image for question ${q.id}, type: ${typeof q.image}`);
          
          // Imprimir datos relevantes para diagnóstico
          if (q._imageData) console.log(`[POST] _imageData present: ${typeof q._imageData}, length: ${typeof q._imageData === 'string' ? q._imageData.length : 'N/A'}`);
          if (q._localFile) console.log(`[POST] _localFile present: ${typeof q._localFile}, length: ${typeof q._localFile === 'string' ? q._localFile.length : 'N/A'}`);
          console.log(`[POST] image: ${typeof q.image}, ${typeof q.image === 'string' ? `length: ${q.image.length}` : 'not a string'}`);
          
          // Si es un dato base64 directo
          if (q.image.startsWith('data:')) {
            console.log(`[POST] Image is data URL for question ${q.id}`);
            // Generar un ID único para la imagen
            const imageId = q.id || generateUniqueId();
            
            // Guardar la referencia en la pregunta
            simplifiedQuestion.imageId = imageId;
            simplifiedQuestion.image = null; // Vaciar el campo de imagen para no almacenar datos grandes
            
            // Añadir a la lista para procesar después
            imagesToProcess.push({
              questionId: q.id,
              imageId: imageId,
              imageData: q.image
            });
          }
          // Si es blob URL pero tenemos base64 en _localFile o _imageData
          else if (q.image.startsWith('blob:')) {
            console.log(`[POST] Image is blob URL: ${q.image.substring(0, 30)}... for question ${q.id}`);
            
            let imageData = null;
            if (q._localFile && typeof q._localFile === 'string' && q._localFile.startsWith('data:')) {
              imageData = q._localFile;
              console.log(`[POST] Using _localFile for blob URL in question ${q.id}`);
            } else if (q._imageData && typeof q._imageData === 'string' && q._imageData.startsWith('data:')) {
              imageData = q._imageData;
              console.log(`[POST] Using _imageData for blob URL in question ${q.id}`);
            }
            
            if (imageData) {
              const imageId = q.id || generateUniqueId();
              simplifiedQuestion.imageId = imageId;
              simplifiedQuestion.image = null;
              
              imagesToProcess.push({
                questionId: q.id,
                imageId: imageId,
                imageData: imageData
              });
            } else {
              console.warn(`[POST] Blob URL detected, but no valid base64 data available for question ${q.id}`);
              simplifiedQuestion.image = null;
            }
          } 
          // Si es HTTP URL, mantenerla como está
          else if (q.image.startsWith('http')) {
            console.log(`[POST] Image is HTTP URL for question ${q.id}, keeping as is`);
            simplifiedQuestion.image = q.image;
          } 
          // Otros formatos no reconocidos
          else {
            console.warn(`[POST] Question ${q.id} has unrecognized image format: ${q.image.substring(0, 20)}...`);
            simplifiedQuestion.image = null;
          }
        } catch (imgError) {
          console.error(`[POST] Error processing image for question ${q.id}:`, imgError);
          simplifiedQuestion.image = null;
        }
      }
      
      return simplifiedQuestion;
    });
    
    // Eliminar datos grandes de las preguntas antes de guardar en Airtable
    const cleanedQuestions = simplifiedQuestions.map(q => {
      // Crear una copia limpia
      const cleaned = { ...q };
      
      // Eliminar propiedades que puedan contener datos grandes
      Object.keys(cleaned).forEach(key => {
        // Si el valor es null o undefined, mantenerlo
        if (cleaned[key] == null) {
          return;
        }
        
        // Si es un string muy largo y no es una URL, eliminarlo
        if (typeof cleaned[key] === 'string' && cleaned[key].length > 1000 && !cleaned[key].startsWith('http')) {
          console.log(`[POST] Removing large string property ${key} from question ${q.id || 'unknown'}`);
          cleaned[key] = null;
        }
      });
      
      return cleaned;
    });
    
    // Guardar primero el test en Airtable
    console.log('[POST] Saving test data to Airtable');
    const questionsJson = JSON.stringify(cleanedQuestions);
    console.log(`[POST] Size of questions JSON: ${questionsJson.length} characters`);
    
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
    
    // Crear registro en Airtable - esta es la operación crítica
    console.log('[POST] Creating Airtable record...');
    let createdRecord;
    try {
      const records = await base(tableName).create([recordData]);
      
      if (!records || records.length === 0) {
        console.error('[POST] No records returned from Airtable create operation');
        return res.status(500).json({ 
          error: 'Failed to save test',
          details: 'No records returned from Airtable'
        });
      }
      
      createdRecord = records[0];
    } catch (airtableError) {
      console.error('[POST] Airtable create error:', airtableError);
      return res.status(500).json({ 
        error: 'Failed to save test in Airtable',
        details: airtableError.message || 'Unknown Airtable error'
      });
    }
    
    const testId = createdRecord.id;
    
    if (!testId) {
      console.error('[POST] No ID returned for created record:', createdRecord);
      return res.status(500).json({ 
        error: 'Failed to get test ID',
        details: 'Record created but no ID returned'
      });
    }
    
    console.log('[POST] Successfully created test with ID:', testId);
    
    // Preparar respuesta con el ID generado
    const responseData = {
      ...testToSave,
      id: testId,
      questions: simplifiedQuestions // Usar las preguntas simplificadas en la respuesta
    };
    
    // Intentar procesar imágenes en segundo plano, pero no bloquear la respuesta
    if (imagesToProcess.length > 0) {
      console.log(`[POST] Processing ${imagesToProcess.length} images in background...`);
      
      // Esto se ejecutará en segundo plano y no bloqueará la respuesta
      (async () => {
        try {
          // Ordenar imágenes para priorizar las que tienen prioridad alta (como las de clickArea)
          imagesToProcess.sort((a, b) => {
            if (a.priority === 'high' && b.priority !== 'high') return -1;
            if (a.priority !== 'high' && b.priority === 'high') return 1;
            return 0;
          });
          
          console.log(`[POST:BACKGROUND] Sorted ${imagesToProcess.length} images by priority. Processing order:`);
          imagesToProcess.forEach((img, index) => {
            console.log(`[POST:BACKGROUND] ${index+1}. Image ${img.imageId} for question ${img.questionId}, priority: ${img.priority || 'normal'}`);
          });
          
          const imageResults = [];
          let successCount = 0;
          let failureCount = 0;
          
          for (const img of imagesToProcess) {
            try {
              console.log(`[POST:BACKGROUND] Processing image for questionId=${img.questionId}, imageId=${img.imageId}, dataLength=${img.imageData ? img.imageData.length : 0}, priority=${img.priority || 'normal'}`);
              
              // Método 1: Usar directamente el endpoint de imágenes
              try {
                // Preparar los datos para el endpoint de imágenes
                const imageRequestData = {
                  imageData: img.imageData,
                  fileName: `image_${img.imageId}.jpg` // Nombre de archivo incluyendo el ID
                };
                
                // Construir la URL del endpoint de imágenes
                let apiUrl = process.env.VERCEL_URL || 'quickbooks-backend.vercel.app';
                apiUrl = ensureHttpsProtocol(apiUrl);
                const imageApiUrl = `${apiUrl}/api/images?action=upload`;
                
                console.log(`[POST:BACKGROUND] Uploading image to images API: ${imageApiUrl}`);
                
                // Realizar la petición al endpoint de imágenes
                const response = await axios.post(imageApiUrl, imageRequestData, {
                  headers: { 'Content-Type': 'application/json' }
                });
                
                if (response.data && response.data.url) {
                  const imageUrl = response.data.url;
                  console.log(`[POST:BACKGROUND] Image uploaded successfully via images API: ${imageUrl}`);
                  
                  imageResults.push({
                    questionId: img.questionId,
                    imageId: img.imageId,
                    url: imageUrl,
                    method: 'images-api'
                  });
                  successCount++;
                  continue; // Continuar con la siguiente imagen
                } else {
                  console.warn(`[POST:BACKGROUND] Images API did not return a valid URL, falling back to direct method`);
                }
              } catch (apiError) {
                console.error(`[POST:BACKGROUND] Error using images API, falling back to direct method:`, apiError.message);
              }
              
              // Método 2: Fallback al método directo usando saveImageToBlob
              const imageUrl = await saveImageToBlob(img.imageId, img.imageData);
              if (imageUrl) {
                console.log(`[POST:BACKGROUND] Successfully uploaded image to ${imageUrl}`);
                imageResults.push({
                  questionId: img.questionId,
                  imageId: img.imageId,
                  url: imageUrl,
                  method: 'direct-blob'
                });
                successCount++;
              } else {
                console.error(`[POST:BACKGROUND] Failed to upload image for imageId=${img.imageId}`);
                failureCount++;
              }
            } catch (imgError) {
              console.error(`[POST:BACKGROUND] Failed to save image ${img.imageId}:`, imgError);
              console.error(`[POST:BACKGROUND] Stack trace:`, imgError.stack);
              failureCount++;
              // Continuar con la siguiente imagen
            }
          }
          
          // Resumen final del proceso de imágenes
          console.log(`[POST:BACKGROUND] Image processing summary: ${successCount} successful, ${failureCount} failed, total: ${imagesToProcess.length}`);
          
          // Si tenemos resultados de imágenes, actualizar el test con sus URLs
          if (imageResults.length > 0) {
            console.log(`[POST:BACKGROUND] Successfully processed ${imageResults.length}/${imagesToProcess.length} images, updating test record...`);
            try {
              // Obtener el test recién creado
              const testRecord = await base(tableName).find(testId);
              const updatedQuestions = JSON.parse(testRecord.fields[FIELDS.QUESTIONS] || '[]');
              
              // Actualizar las URLs de las imágenes
              let updatedCount = 0;
              let clickAreaUpdatedCount = 0;
              
              updatedQuestions.forEach(q => {
                const imageResult = imageResults.find(img => 
                  (img.questionId && img.questionId === q.id) || 
                  (img.imageId && img.imageId === q.imageId)
                );
                
                if (imageResult) {
                  updatedCount++;
                  const isClickArea = q.type === 'clickArea';
                  if (isClickArea) {
                    clickAreaUpdatedCount++;
                    console.log(`[POST:BACKGROUND] Updating clickArea question ${q.id} with image URL: ${imageResult.url}`);
                  } else {
                    console.log(`[POST:BACKGROUND] Updating question ${q.id} with image URL: ${imageResult.url}`);
                  }
                  
                  q.image = imageResult.url;
                  q.imageId = imageResult.imageId || q.imageId;
                }
              });
              
              console.log(`[POST:BACKGROUND] Updated ${updatedCount} questions with image URLs (${clickAreaUpdatedCount} clickArea questions)`);
              
              if (updatedCount > 0) {
                // Guardar las preguntas actualizadas
                try {
                  await base(tableName).update(testId, {
                    fields: {
                      [FIELDS.QUESTIONS]: JSON.stringify(updatedQuestions)
                    }
                  });
                  
                  console.log('[POST:BACKGROUND] Test record successfully updated with image URLs');
                } catch (airtableError) {
                  console.error('[POST:BACKGROUND] Airtable update error:', airtableError);
                  console.error('[POST:BACKGROUND] Stack trace:', airtableError.stack);
                  
                  // Intento de recuperación si el error es por tamaño
                  if (airtableError.message && airtableError.message.includes('request entity too large')) {
                    console.log('[POST:BACKGROUND] Attempting recovery from "request entity too large" error');
                    
                    // Limpiar aún más el objeto de preguntas, eliminando datos no esenciales
                    const essentialQuestions = updatedQuestions.map(q => ({
                      id: q.id,
                      type: q.type,
                      text: q.text,
                      image: q.image,
                      imageId: q.imageId,
                      correctAnswer: q.correctAnswer,
                      options: q.options
                    }));
                    
                    try {
                      await base(tableName).update(testId, {
                        fields: {
                          [FIELDS.QUESTIONS]: JSON.stringify(essentialQuestions)
                        }
                      });
                      console.log('[POST:BACKGROUND] Recovery successful, test updated with essential question data');
                    } catch (recoveryError) {
                      console.error('[POST:BACKGROUND] Recovery attempt failed:', recoveryError);
                    }
                  }
                }
              } else {
                console.log('[POST:BACKGROUND] No questions were updated, skipping Airtable update');
              }
            } catch (updateError) {
              console.error('[POST:BACKGROUND] Failed to update test with image URLs:', updateError);
              console.error('[POST:BACKGROUND] Stack trace:', updateError.stack);
            }
          } else {
            console.warn('[POST:BACKGROUND] No images were successfully processed');
          }
          
          console.log('[POST:BACKGROUND] Background image processing completed');
        } catch (bgError) {
          console.error('[POST:BACKGROUND] Error in background image processing:', bgError);
          console.error('[POST:BACKGROUND] Stack trace:', bgError.stack);
        }
      })();
    }
    
    // Verificar que el ID está incluido en la respuesta antes de enviarla
    if (!responseData.id) {
      console.error('[POST] ID missing from response data:', responseData);
      responseData.id = testId; // Garantizar que el ID esté presente
    }
    
    // Enviar respuesta inmediatamente, sin esperar el procesamiento de imágenes
    return res.status(200).json(responseData);
  } catch (error) {
    console.error('[POST] Error saving test:', error);
    return res.status(500).json({ 
      error: 'Failed to save test',
      details: error.message
    });
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