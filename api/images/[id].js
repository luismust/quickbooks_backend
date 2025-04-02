// /api/images/[id].js
const Airtable = require('airtable');
const cors = require('cors');

// Configurar CORS
const allowCors = cors({
  origin: '*', // Puedes restringir a tus dominios específicos
});

// Wrapper para añadir CORS a cada handler
const handleWithCors = (handler) => async (req, res) => {
  return allowCors(req, res, () => handler(req, res));
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

// Manejador para GET /api/images/[id]
async function handleGet(req, res) {
  const { id } = req.query;
  
  console.log('Received request for image ID:', id);
  
  try {
    const base = getAirtableBase();
    const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
    console.log('Using Airtable table:', tableImages);
    
    // Verificar si tenemos todas las variables de entorno
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      console.warn('Missing Airtable credentials!');
      console.log('AIRTABLE_API_KEY defined:', !!process.env.AIRTABLE_API_KEY);
      console.log('AIRTABLE_BASE_ID defined:', !!process.env.AIRTABLE_BASE_ID);
    }
    
    // Buscar por ID en la tabla
    console.log(`Searching for image with ID: ${id}`);
    const records = await base(tableImages)
      .select({
        filterByFormula: `{ID}="${id}"`,
        maxRecords: 1
      })
      .all();
      
    console.log(`Found ${records.length} records for ID: ${id}`);
    
    if (records.length === 0) {
      return res.status(404).json({ error: 'Image not found', id });
    }
    
    const record = records[0];
    console.log('Record fields:', Object.keys(record.fields));
    console.log('Image field present:', !!record.fields.Image);
    
    if (record.fields.Image && record.fields.Image.length > 0) {
      console.log('Image URL:', record.fields.Image[0].url);
      return res.status(200).json({ 
        id, 
        url: record.fields.Image[0].url,
        message: 'Image found successfully' 
      });
    } else {
      return res.status(404).json({ 
        error: 'Image record found but no image data available',
        recordId: record.id
      });
    }
  } catch (error) {
    console.error('Error fetching image:', error);
    return res.status(500).json({ 
      error: 'Error fetching image',
      details: error.message
    });
  }
}

// Handler principal que dirige según el método HTTP
module.exports = handleWithCors(async (req, res) => {
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
});