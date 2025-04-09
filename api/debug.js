// api/debug.js - Un endpoint simple para verificar credenciales y configuración

module.exports = async (req, res) => {
  // Configurar cabeceras CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://quickbooks-test-black.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Responder inmediatamente a OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Verificar variables de entorno
    const envVars = {
      AIRTABLE_API_KEY: Boolean(process.env.AIRTABLE_API_KEY),
      AIRTABLE_BASE_ID: Boolean(process.env.AIRTABLE_BASE_ID),
      AIRTABLE_TABLE_NAME: process.env.AIRTABLE_TABLE_NAME || 'Tests',
      AIRTABLE_TABLE_IMAGES: process.env.AIRTABLE_TABLE_IMAGES || 'Images',
      NODE_ENV: process.env.NODE_ENV || 'development'
    };
    
    // Verificar si hay un body en la solicitud
    let bodyInfo = null;
    if (req.method === 'POST') {
      try {
        if (typeof req.body === 'string') {
          bodyInfo = {
            isString: true,
            length: req.body.length,
            preview: req.body.substring(0, 100) + '...',
            parsed: JSON.parse(req.body)
          };
        } else if (req.body) {
          bodyInfo = {
            isObject: true,
            keys: Object.keys(req.body),
            preview: req.body
          };
        } else {
          bodyInfo = { isEmpty: true };
        }
      } catch (error) {
        bodyInfo = { error: error.message };
      }
    }
    
    // Información sobre headers y método
    const requestInfo = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      bodyInfo
    };
    
    // Responder con toda la información recopilada
    return res.status(200).json({
      message: 'Debug endpoint working correctly',
      timestamp: new Date().toISOString(),
      environment: envVars,
      request: requestInfo
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    return res.status(500).json({
      error: 'Debug endpoint error',
      message: error.message,
      stack: error.stack
    });
  }
}; 