// api/test-results.js - Endpoint para guardar resultados de tests
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  
  // Manejar preflight OPTIONS
  if (req.method === 'OPTIONS') {
    console.log('[TEST-RESULTS] Handling OPTIONS request');
    return res.status(200).end();
  }
  
  // Solo permitir método POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed', 
      allowedMethods: ['POST'] 
    });
  }
  
  try {
    // Procesar el cuerpo de la solicitud
    let testResult = req.body;
    if (typeof testResult === 'string') {
      try {
        testResult = JSON.parse(testResult);
      } catch (parseError) {
        console.error('[TEST-RESULTS] Error parsing request body:', parseError);
        return res.status(400).json({ 
          error: 'Invalid JSON in request body',
          details: parseError.message
        });
      }
    }
    
    console.log('[TEST-RESULTS] Received test result data:', testResult);
    
    // Normalizar nombres de campos (aceptar tanto minúsculas como mayúsculas)
    const name = testResult.Name || testResult.name;
    const test = testResult.Test || testResult.test;
    const score = testResult.Score || testResult.score;
    const status = testResult.Status || testResult.status;
    const date = testResult.Date || testResult.date;
    
    // Convertir score a número si es una cadena
    let scoreNumber;
    if (typeof score === 'string') {
      // Si contiene una barra, extraer solo el primer número (ej: "100/100" -> 100)
      if (score.includes('/')) {
        scoreNumber = parseFloat(score.split('/')[0]);
      } else {
        scoreNumber = parseFloat(score);
      }
    } else {
      scoreNumber = score;
    }
    
    // Validar datos requeridos
    if (!name || !test || (typeof scoreNumber !== 'number' || isNaN(scoreNumber))) {
      return res.status(400).json({ 
        error: 'Name, Test and Score are required fields',
        received: { 
          hasName: Boolean(name), 
          hasTest: Boolean(test), 
          scoreIsNumber: typeof scoreNumber === 'number' && !isNaN(scoreNumber)
        }
      });
    }
    
    // Preparar datos para Airtable con formato correcto
    const base = getAirtableBase();
    const tableName = 'TestResults'; // Nombre de la tabla para resultados
    
    // Crear el registro con la fecha actual si no se proporciona
    const recordData = {
      fields: {
        Name: name,
        Test: test,
        Score: scoreNumber,
        Status: status || (scoreNumber >= 60 ? 'Passed' : 'Failed'), // Valor por defecto si no se proporciona
        Date: date || new Date().toISOString() // Enviar como string ISO 8601 para Airtable
      }
    };
    
    // Crear registro en Airtable
    console.log('[TEST-RESULTS] Creating Airtable record in TestResults table...');
    let createdRecord;
    
    try {
      const records = await base(tableName).create([recordData]);
      
      if (!records || records.length === 0) {
        console.error('[TEST-RESULTS] No records returned from Airtable create operation');
        return res.status(500).json({ 
          error: 'Failed to save test result',
          details: 'No records returned from Airtable'
        });
      }
      
      createdRecord = records[0];
    } catch (airtableError) {
      console.error('[TEST-RESULTS] Airtable create error:', airtableError);
      
      // Verificar si es un error de tabla no encontrada
      if (airtableError.message && airtableError.message.includes('Table TestResults not found')) {
        return res.status(500).json({ 
          error: 'Table TestResults not found in Airtable. Please create this table first with fields: Name (text), Test (text), Score (number), Status (text), Date (date ISO 8601)',
          details: airtableError.message
        });
      }
      
      return res.status(500).json({ 
        error: 'Failed to save test result in Airtable',
        details: airtableError.message || 'Unknown Airtable error'
      });
    }
    
    const resultId = createdRecord.id;
    
    if (!resultId) {
      console.error('[TEST-RESULTS] No ID returned for created record:', createdRecord);
      return res.status(500).json({ 
        error: 'Failed to get result ID',
        details: 'Record created but no ID returned'
      });
    }
    
    console.log(`[TEST-RESULTS] Successfully created test result with ID: ${resultId}`);
    
    // Devolver respuesta exitosa con los datos guardados
    return res.status(200).json({
      success: true,
      message: 'Test result saved successfully',
      id: resultId,
      data: {
        Name: recordData.fields.Name,
        Test: recordData.fields.Test,
        Score: recordData.fields.Score,
        Status: recordData.fields.Status,
        Date: recordData.fields.Date
      }
    });
    
  } catch (error) {
    console.error('[TEST-RESULTS] Error saving test result:', error);
    return res.status(500).json({ 
      error: 'Failed to save test result',
      details: error.message,
      stack: error.stack
    });
  }
};
