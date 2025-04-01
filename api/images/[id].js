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
  
  if (!id) {
    return res.status(400).json({ error: 'Image ID is required' });
  }
  
  try {
    const base = getAirtableBase();
    const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
    
    // Buscar por ID en la tabla de imágenes
    const records = await base(tableImages)
      .select({
        filterByFormula: `{ID}="${id}"`,
        maxRecords: 1
      })
      .all();
      
    if (records.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const record = records[0];
    const fields = record.fields;
    
    // Verificar si hay una imagen adjunta
    if (fields.Image && fields.Image.length > 0 && fields.Image[0].url) {
      return res.status(200).json({
        id,
        url: fields.Image[0].url,
        filename: fields.Image[0].filename || 'image.jpg',
        message: 'Image loaded successfully'
      });
    } else {
      return res.status(404).json({ error: 'Image record found but no image data available' });
    }
  } catch (error) {
    console.error('Error loading image:', error);
    return res.status(500).json({ error: 'Failed to load image' });
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