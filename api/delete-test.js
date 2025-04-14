// api/delete-test.js - Un endpoint especial para eliminar tests
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
  // Configuración manual de CORS - Igual que en load-tests.js
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'https://tests-system.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');
  
  // Manejar preflight OPTIONS
  if (req.method === 'OPTIONS') {
    console.log('[DELETE-TEST] Handling OPTIONS request');
    return res.status(200).end();
  }
  
  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', allowedMethods: ['POST'] });
  }
  
  try {
    // Procesar el cuerpo de la solicitud
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }
    
    // Verificar que se proporcionó un ID
    const testId = body.id;
    if (!testId) {
      return res.status(400).json({ error: 'Test ID is required' });
    }
    
    console.log(`[DELETE-TEST] Attempting to delete test with ID: ${testId}`);
    
    const base = getAirtableBase();
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Tests';
    
    // Verificar que el test existe
    try {
      await base(tableName).find(testId);
    } catch (findError) {
      console.error(`[DELETE-TEST] Test with ID ${testId} not found:`, findError);
      return res.status(404).json({ error: `Test with ID ${testId} not found` });
    }
    
    // Eliminar el test
    try {
      await base(tableName).destroy(testId);
      console.log(`[DELETE-TEST] Successfully deleted test with ID: ${testId}`);
    } catch (deleteError) {
      console.error(`[DELETE-TEST] Error deleting test:`, deleteError);
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
    console.error('[DELETE-TEST] Unhandled error:', error);
    return res.status(500).json({ 
      error: 'Failed to delete test',
      details: error.message 
    });
  }
}; 