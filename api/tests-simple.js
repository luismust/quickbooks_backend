// api/tests-simple.js - Versión simplificada del endpoint de tests
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

// Manejador de solicitudes POST simplificado
async function handleSimplePost(req, res) {
  try {
    const test = req.body;
    console.log('Received test data:', {
      id: test.id,
      name: test.name,
      questionsCount: test.questions ? test.questions.length : 0
    });
    
    // Intentar conectar con Airtable
    const base = getAirtableBase();
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Tests';
    
    // Guardar una versión simplificada sin procesar imágenes
    const recordData = {
      fields: {
        name: test.name || 'Sin nombre',
        description: test.description || '',
        questions: JSON.stringify(test.questions.map(q => ({
          id: q.id,
          text: q.text,
          // No procesar imágenes, solo guardar referencia si existe
          image: q.image && typeof q.image === 'string' ? 'image_reference' : null,
          options: q.options
        }))),
        max_score: test.maxScore || 100,
        min_score: test.minScore || 60,
        passing_message: test.passingMessage || 'Congratulations!',
        failing_message: test.failingMessage || 'Try again'
      }
    };
    
    console.log('Saving simplified data to Airtable');
    const records = await base(tableName).create([recordData]);
    
    if (!records || records.length === 0) {
      console.error('No records returned from Airtable create operation');
      return res.status(500).json({ 
        error: 'Failed to save test',
        details: 'No records returned from Airtable'
      });
    }
    
    const createdRecord = records[0];
    
    if (!createdRecord || !createdRecord.id) {
      console.error('No ID returned for created record:', createdRecord);
      return res.status(500).json({ 
        error: 'Failed to get test ID',
        details: 'Record created but no ID returned'
      });
    }
    
    const testId = createdRecord.id;
    
    console.log('Successfully saved test with ID:', testId);
    
    // Asegurar que el ID está presente en la respuesta
    const responseData = {
      ...test,
      id: testId,
      _simplified: true
    };
    
    return res.status(200).json(responseData);
    
  } catch (error) {
    console.error('Error in simplified test endpoint:', error);
    return res.status(500).json({
      error: 'Failed to save test (simplified endpoint)',
      details: error.message,
      stack: error.stack
    });
  }
}

// Handler principal
module.exports = async (req, res) => {
  // Configurar cabeceras CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://quickbooks-test-black.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version');
  
  // Responder inmediatamente a OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Solo manejar POST en este endpoint simplificado
    if (req.method === 'POST') {
      // Parsear body si es necesario
      if (typeof req.body === 'string') {
        try {
          req.body = JSON.parse(req.body);
        } catch (error) {
          return res.status(400).json({ error: 'Invalid JSON' });
        }
      }
      
      // Llamar al manejador simplificado
      return await handleSimplePost(req, res);
    } else {
      return res.status(200).json({ 
        message: 'Simplified tests endpoint - only supports POST',
        method: req.method
      });
    }
  } catch (error) {
    console.error('Unhandled error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      stack: error.stack
    });
  }
}; 