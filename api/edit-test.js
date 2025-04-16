// api/edit-test.js - Endpoint para editar tests existentes
const Airtable = require('airtable');

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

// Manejador principal
module.exports = async (req, res) => {
  // Configurar CORS para permitir solicitudes desde el frontend
  const origin = req.headers.origin || 'https://tests-system.vercel.app';
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  
  // Manejar preflight OPTIONS
  if (req.method === 'OPTIONS') {
    console.log('[EDIT-TEST] Handling OPTIONS request');
    return res.status(200).end();
  }
  
  // Solo permitir métodos PUT o POST
  if (req.method !== 'PUT' && req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed', 
      allowedMethods: ['PUT', 'POST', 'OPTIONS'] 
    });
  }
  
  try {
    // Obtener datos de la solicitud
    let requestData = req.body;
    if (typeof requestData === 'string') {
      try {
        requestData = JSON.parse(requestData);
      } catch (parseError) {
        console.error('[EDIT-TEST] Error parsing request body:', parseError);
        return res.status(400).json({ 
          error: 'Invalid JSON in request body',
          details: parseError.message
        });
      }
    }
    
    // Extraer el ID del test (puede venir en el cuerpo o en la URL)
    const testId = req.query.id || requestData.id;
    
    if (!testId) {
      return res.status(400).json({ 
        error: 'Test ID is required',
        message: 'Please provide a test ID either in the request body or as a query parameter'
      });
    }
    
    // Validar que haya datos para actualizar
    if (!requestData || Object.keys(requestData).length === 0) {
      return res.status(400).json({ 
        error: 'No data provided for update',
        message: 'Please provide data to update the test'
      });
    }
    
    console.log(`[EDIT-TEST] Editing test with ID: ${testId}`);
    console.log('[EDIT-TEST] Update data:', requestData);
    
    // Configurar Airtable
    const base = getAirtableBase();
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Tests';
    
    // Verificar primero si el test existe
    let existingRecord;
    try {
      existingRecord = await base(tableName).find(testId);
    } catch (findError) {
      console.error(`[EDIT-TEST] Error finding test with ID ${testId}:`, findError);
      
      if (findError.message && findError.message.includes('Record not found')) {
        return res.status(404).json({ 
          error: 'Test not found',
          message: `No test found with ID: ${testId}`,
          details: findError.message
        });
      }
      
      return res.status(500).json({ 
        error: 'Failed to retrieve test for editing',
        details: findError.message || 'Unknown Airtable error'
      });
    }
    
    // Preparar los datos para la actualización
    // Para pruebas, a menudo necesitamos manejar la estructura anidada
    const FIELDS = {
      NAME: 'name',
      DESCRIPTION: 'description',
      QUESTIONS: 'questions',
      MAX_SCORE: 'max_score',
      MIN_SCORE: 'min_score',
      PASSING_MESSAGE: 'passing_message',
      FAILING_MESSAGE: 'failing_message'
    };
    
    // Construir el objeto de actualización basado en los campos existentes
    const updateData = {};
    
    // Actualizar campos simples si se proporcionan en la solicitud
    if (requestData.name !== undefined) {
      updateData[FIELDS.NAME] = requestData.name;
    }
    
    if (requestData.description !== undefined) {
      updateData[FIELDS.DESCRIPTION] = requestData.description;
    }
    
    if (requestData.maxScore !== undefined) {
      updateData[FIELDS.MAX_SCORE] = requestData.maxScore;
    }
    
    if (requestData.minScore !== undefined) {
      updateData[FIELDS.MIN_SCORE] = requestData.minScore;
    }
    
    if (requestData.passingMessage !== undefined) {
      updateData[FIELDS.PASSING_MESSAGE] = requestData.passingMessage;
    }
    
    if (requestData.failingMessage !== undefined) {
      updateData[FIELDS.FAILING_MESSAGE] = requestData.failingMessage;
    }
    
    // Manejar preguntas (estructura más compleja)
    if (requestData.questions) {
      // Obtener las preguntas actuales para posible fusión
      let currentQuestions = [];
      try {
        currentQuestions = JSON.parse(existingRecord.fields[FIELDS.QUESTIONS] || '[]');
      } catch (parseError) {
        console.warn('[EDIT-TEST] Error parsing existing questions:', parseError);
        currentQuestions = [];
      }
      
      // Si estamos reemplazando todas las preguntas
      if (Array.isArray(requestData.questions)) {
        console.log('[EDIT-TEST] Replacing all questions');
        updateData[FIELDS.QUESTIONS] = JSON.stringify(requestData.questions);
      } 
      // Si estamos modificando preguntas individuales
      else if (typeof requestData.questions === 'object') {
        console.log('[EDIT-TEST] Updating specific questions');
        
        // Si hay una operación para añadir pregunta
        if (requestData.questions.add && Array.isArray(requestData.questions.add)) {
          currentQuestions = [...currentQuestions, ...requestData.questions.add];
        }
        
        // Si hay una operación para actualizar preguntas existentes
        if (requestData.questions.update && Array.isArray(requestData.questions.update)) {
          requestData.questions.update.forEach(updateQuestion => {
            if (updateQuestion.id) {
              const index = currentQuestions.findIndex(q => q.id === updateQuestion.id);
              if (index !== -1) {
                currentQuestions[index] = { ...currentQuestions[index], ...updateQuestion };
              }
            }
          });
        }
        
        // Si hay una operación para eliminar preguntas
        if (requestData.questions.remove && Array.isArray(requestData.questions.remove)) {
          const idsToRemove = requestData.questions.remove.map(q => typeof q === 'object' ? q.id : q);
          currentQuestions = currentQuestions.filter(q => !idsToRemove.includes(q.id));
        }
        
        // Guardar las preguntas actualizadas
        updateData[FIELDS.QUESTIONS] = JSON.stringify(currentQuestions);
      }
    }
    
    // Verificar si hay campos para actualizar
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        error: 'No valid fields to update',
        message: 'Please provide at least one valid field to update'
      });
    }
    
    // Realizar la actualización en Airtable
    console.log('[EDIT-TEST] Updating record in Airtable with data:', updateData);
    let updatedRecord;
    
    try {
      updatedRecord = await base(tableName).update(testId, { fields: updateData });
    } catch (updateError) {
      console.error('[EDIT-TEST] Error updating test:', updateError);
      return res.status(500).json({ 
        error: 'Failed to update test',
        details: updateError.message || 'Unknown error during update operation'
      });
    }
    
    // Preparar la respuesta
    const responseData = {
      id: updatedRecord.id,
      name: updatedRecord.fields[FIELDS.NAME],
      description: updatedRecord.fields[FIELDS.DESCRIPTION],
      maxScore: updatedRecord.fields[FIELDS.MAX_SCORE],
      minScore: updatedRecord.fields[FIELDS.MIN_SCORE],
      passingMessage: updatedRecord.fields[FIELDS.PASSING_MESSAGE],
      failingMessage: updatedRecord.fields[FIELDS.FAILING_MESSAGE]
    };
    
    // Si hay preguntas, intentar parsearlas para incluirlas en la respuesta
    try {
      responseData.questions = JSON.parse(updatedRecord.fields[FIELDS.QUESTIONS] || '[]');
    } catch (error) {
      console.warn('[EDIT-TEST] Error parsing questions for response:', error);
      responseData.questions = [];
    }
    
    // Enviar respuesta exitosa
    console.log(`[EDIT-TEST] Test with ID ${testId} successfully updated`);
    return res.status(200).json({
      success: true,
      message: 'Test updated successfully',
      data: responseData
    });
    
  } catch (error) {
    console.error('[EDIT-TEST] Unexpected error:', error);
    return res.status(500).json({ 
      error: 'Failed to update test',
      details: error.message,
      stack: error.stack
    });
  }
};
