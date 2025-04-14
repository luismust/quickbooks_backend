// api/airtable-check.js - Un endpoint para verificar la configuración de Airtable
const Airtable = require('airtable');

module.exports = async (req, res) => {
  // Configurar CORS
  const origin = req.headers.origin || 'https://tests-system.vercel.app';
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Responder inmediatamente a OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Recopilar información de la configuración de Airtable
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Tests';
    
    // Verificar si las credenciales básicas están disponibles
    const hasCredentials = Boolean(apiKey && baseId);
    
    // Información de alto nivel para evitar exponer credenciales completas
    const configInfo = {
      hasApiKey: Boolean(apiKey),
      apiKeyLength: apiKey ? apiKey.length : 0,
      apiKeyPreview: apiKey ? `${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}` : null,
      hasBaseId: Boolean(baseId),
      baseIdLength: baseId ? baseId.length : 0,
      baseIdPreview: baseId ? `${baseId.substring(0, 3)}...${baseId.substring(baseId.length - 3)}` : null,
      tableName
    };
    
    // Verificar la configuración de Vercel Blob
    const hasBlobSecret = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    configInfo.hasBlobStorage = hasBlobSecret;
    
    // Intentar conectar a Airtable si tenemos credenciales
    let connectionTest = { success: false, error: null, records: null };
    
    if (hasCredentials) {
      try {
        const base = new Airtable({ 
          apiKey: apiKey,
          endpointUrl: 'https://api.airtable.com'
        }).base(baseId);
        
        // Intentar listar registros
        const records = await base(tableName)
          .select({
            maxRecords: 5,
            view: 'Grid view'
          })
          .all();
        
        connectionTest.success = true;
        connectionTest.recordCount = records.length;
        connectionTest.recordIds = records.map(r => r.id);
        
        // Intentar crear un registro de prueba
        const testRecord = {
          fields: {
            name: 'Prueba de API ' + new Date().toISOString(),
            description: 'Registro creado para prueba de conexión',
            questions: JSON.stringify([{ id: 'test', text: 'Pregunta de prueba', options: [] }])
          }
        };
        
        const creationResult = await base(tableName).create([testRecord]);
        
        connectionTest.creationSuccess = true;
        connectionTest.createdRecordId = creationResult[0].id;
      } catch (error) {
        connectionTest.success = false;
        connectionTest.error = error.message;
        connectionTest.stack = error.stack;
      }
    }
    
    // Devolver información de la configuración
    return res.status(200).json({
      message: 'Airtable configuration check',
      timestamp: new Date().toISOString(),
      config: configInfo,
      connectionTest,
      env: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Error checking Airtable configuration:', error);
    return res.status(500).json({ 
      error: 'Error checking Airtable configuration',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}; 