// api/load-tests.js - Un endpoint especial para cargar tests
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

// Manejador principal
module.exports = async (req, res) => {
  // Configuración manual de CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'https://quickbooks-test-black.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');
  
  // Manejar preflight OPTIONS
  if (req.method === 'OPTIONS') {
    console.log('[LOAD-TESTS] Handling OPTIONS request');
    return res.status(200).end();
  }
  
  // Solo permitir GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', allowedMethods: ['GET'] });
  }
  
  try {
    console.log('[LOAD-TESTS] Loading tests from Airtable');
    
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
        console.error(`[LOAD-TESTS] Error finding test with ID ${id}:`, findError);
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
          
          // Si hay una imagen o un imageId, convertirla en una URL accesible mediante nuestro endpoint
          if (question.imageId) {
            // Usar una URL completa (incluir https://)
            let apiUrl = process.env.VERCEL_URL || 'quickbooks-backend.vercel.app';
            apiUrl = ensureHttpsProtocol(apiUrl);
            
            // Usar redirección directa para que el frontend reciba la imagen directamente
            const imageUrl = `${apiUrl}/api/images?id=${question.imageId}&redirect=1`;
            processedQuestion.image = imageUrl;
            // Mantener el imageId original para referencia
            processedQuestion.imageId = question.imageId;
            console.log(`[LOAD-TESTS] Generated image URL: ${imageUrl} for imageId: ${question.imageId}`);
          }
          // Si hay una imagen que ya es una URL HTTP, mantenerla
          else if (question.image && question.image.startsWith('http')) {
            processedQuestion.image = question.image;
            console.log(`[LOAD-TESTS] Using existing HTTP image URL: ${question.image}`);
          }
          // Si no hay imagen ni imageId, asegurarse de que image sea null
          else if (!question.image) {
            processedQuestion.image = null;
          }
          
          return processedQuestion;
        });
      } catch (error) {
        console.error('[LOAD-TESTS] Error parsing questions:', error);
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
    
    console.log(`[LOAD-TESTS] Successfully loaded ${tests.length} tests`);
    
    // Si se solicitó un ID específico, devolver solo ese test
    if (id) {
      return res.status(200).json(tests[0] || null);
    }
    
    return res.status(200).json({ tests });
  } catch (error) {
    console.error('[LOAD-TESTS] Error:', error);
    return res.status(500).json({ error: 'Failed to load tests', details: error.message });
  }
}; 