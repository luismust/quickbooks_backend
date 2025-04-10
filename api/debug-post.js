// api/debug-post.js - Un endpoint de depuración específico para solicitudes POST
const Airtable = require('airtable');

// Configurar Airtable
const getAirtableBase = () => {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  
  if (!apiKey || !baseId) {
    throw new Error(`Missing Airtable credentials: apiKey=${Boolean(apiKey)}, baseId=${Boolean(baseId)}`);
  }
  
  return new Airtable({ 
    apiKey: apiKey,
    endpointUrl: 'https://api.airtable.com'
  }).base(baseId);
};

// Manejador principal
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
    // Para solicitudes POST, analizar paso a paso
    if (req.method === 'POST') {
      // Paso 1: Verificar si req.body existe y es válido
      const bodyAnalysis = {
        bodyExists: Boolean(req.body),
        bodyType: typeof req.body,
        isString: typeof req.body === 'string',
        bodyPreview: typeof req.body === 'string' ? req.body.substring(0, 100) : null
      };
      
      // Paso 2: Intentar parsear el body si es necesario
      let parsedBody = req.body;
      if (typeof req.body === 'string') {
        try {
          parsedBody = JSON.parse(req.body);
          bodyAnalysis.parseSuccess = true;
        } catch (error) {
          bodyAnalysis.parseSuccess = false;
          bodyAnalysis.parseError = error.message;
          return res.status(400).json({ 
            step: 'Parsing JSON body',
            error: 'Invalid JSON format', 
            details: error.message,
            bodyAnalysis 
          });
        }
      }
      
      // Paso 3: Analizar la estructura del test
      const testStructure = {
        hasId: Boolean(parsedBody.id),
        hasName: Boolean(parsedBody.name),
        hasQuestions: Array.isArray(parsedBody.questions),
        questionsCount: Array.isArray(parsedBody.questions) ? parsedBody.questions.length : 0
      };
      
      // Paso 4: Verificar la estructura de las preguntas
      let questionsAnalysis = [];
      if (Array.isArray(parsedBody.questions)) {
        questionsAnalysis = parsedBody.questions.map((q, index) => {
          const hasImage = Boolean(q.image);
          let imageType = 'none';
          
          if (hasImage) {
            if (typeof q.image === 'string') {
              if (q.image.startsWith('data:')) {
                imageType = 'data_url';
              } else if (q.image.startsWith('blob:')) {
                imageType = 'blob_url';
              } else {
                imageType = 'other_string';
              }
            } else {
              imageType = typeof q.image;
            }
          }
          
          return {
            index,
            id: q.id,
            hasText: Boolean(q.text),
            hasImage,
            imageType,
            hasOptions: Array.isArray(q.options),
            optionsCount: Array.isArray(q.options) ? q.options.length : 0,
            hasLocalFile: Boolean(q._localFile),
            localFileType: q._localFile ? typeof q._localFile : 'none'
          };
        });
      }
      
      // Paso 5: Verificar conexión a Airtable
      let airtableStatus = 'not_tested';
      let airtableError = null;
      
      try {
        // Verificar que podemos conectar con Airtable
        const base = getAirtableBase();
        const tableName = process.env.AIRTABLE_TABLE_NAME || 'Tests';
        
        // Intentar listar un registro para verificar que tenemos acceso
        const records = await base(tableName)
          .select({
            maxRecords: 1
          })
          .all();
        
        airtableStatus = 'connected';
        airtableError = null;
      } catch (error) {
        airtableStatus = 'error';
        airtableError = error.message;
      }
      
      // Enviar respuesta con todos los análisis
      return res.status(200).json({
        message: 'POST request debug analysis',
        timestamp: new Date().toISOString(),
        environment: {
          AIRTABLE_API_KEY: Boolean(process.env.AIRTABLE_API_KEY),
          AIRTABLE_BASE_ID: Boolean(process.env.AIRTABLE_BASE_ID),
          AIRTABLE_TABLE_NAME: process.env.AIRTABLE_TABLE_NAME || 'Tests',
          AIRTABLE_TABLE_IMAGES: process.env.AIRTABLE_TABLE_IMAGES || 'Images'
        },
        bodyAnalysis,
        testStructure,
        questionsAnalysis,
        airtable: {
          status: airtableStatus,
          error: airtableError
        },
        method: req.method,
        headers: req.headers
      });
    } else {
      return res.status(200).json({ 
        message: 'Debug POST endpoint - only supports POST and OPTIONS',
        method: req.method,
        supportedMethods: ['POST', 'OPTIONS']
      });
    }
  } catch (error) {
    console.error('Unhandled error in debug-post:', error);
    return res.status(500).json({ 
      error: 'Internal server error in debug endpoint',
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}; 