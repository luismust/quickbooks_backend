// /api/images/upload.js
const Airtable = require('airtable');
const crypto = require('crypto');
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

// Generar ID único para las imágenes
function generateUniqueId() {
  return crypto.randomBytes(8).toString('hex');
}

// Manejador para POST /api/images/upload
async function handlePost(req, res) {
  try {
    // Parse JSON body if it's a string
    if (typeof req.body === 'string') {
      try {
        req.body = JSON.parse(req.body);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
    }
    
    const { imageData, fileName } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ error: 'Image data is required' });
    }
    
    // Generar ID único para la imagen
    const imageId = generateUniqueId();
    
    const base = getAirtableBase();
    const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
    
    // Para Airtable, necesitamos convertir la imagen base64 a una URL
    // En este ejemplo, simplemente suponemos que imageData ya es una URL válida
    // Para base64, necesitarías utilizar un servicio de almacenamiento externo
    
    // Crear registro en Airtable
    const createdRecords = await base(tableImages).create([
      {
        fields: {
          ID: imageId,
          Description: fileName || 'Uploaded image',
          Created: new Date().toISOString(),
          // Para una implementación completa, necesitarías almacenar la imagen en un servicio
          // como S3, Cloudinary, etc. y luego guardar la URL aquí
          Image: imageData.startsWith('data:') 
            ? [{ url: imageData }]  // Airtable puede aceptar algunas imágenes base64 directamente
            : [{ url: imageData }]  // Si ya es una URL
        }
      }
    ]);
    
    if (!createdRecords || createdRecords.length === 0) {
      throw new Error('Failed to create image record');
    }
    
    return res.status(200).json({
      success: true,
      imageId,
      reference: `image_reference_${imageId}`,
      message: 'Image uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return res.status(500).json({ 
      error: 'Failed to upload image',
      details: error.message
    });
  }
}

// Handler principal
module.exports = handleWithCors(async (req, res) => {
  if (req.method === 'POST') {
    return handlePost(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
});