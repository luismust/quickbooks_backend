// api/images.js - Endpoint para obtener imágenes de Airtable
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

// Manejador para el endpoint de imágenes
module.exports = async (req, res) => {
  // Establecer cabeceras CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://quickbooks-test-black.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Responder inmediatamente a las solicitudes OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Solo permitir solicitudes GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Obtener el ID de la imagen de la consulta
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Image ID is required' });
    }
    
    // Configurar tabla de imágenes
    const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
    const base = getAirtableBase();
    
    // Buscar la imagen por ID
    console.log(`Looking for image with ID: ${id}`);
    const records = await base(tableImages).select({
      filterByFormula: `{ID}="${id}"`,
      maxRecords: 1
    }).all();
    
    if (!records || records.length === 0) {
      console.warn(`No image found with ID: ${id}`);
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Obtener el registro y la URL de la imagen
    const record = records[0];
    
    if (!record.fields.Image || !record.fields.Image[0] || !record.fields.Image[0].url) {
      console.warn(`Record found for ID ${id} but no image URL available`);
      return res.status(404).json({ error: 'Image URL not found' });
    }
    
    const imageUrl = record.fields.Image[0].url;
    
    // Tenemos dos opciones:
    // 1. Redirigir a la URL de la imagen (más simple, pero podría haber problemas de CORS)
    // return res.redirect(imageUrl);
    
    // 2. Obtener la imagen y devolverla (más control pero más overhead)
    // Para evitar problemas de CORS, vamos a devolver la URL para que el cliente la use directamente
    return res.status(200).json({
      id: id,
      url: imageUrl,
      thumbnails: record.fields.Image[0].thumbnails || {},
      filename: record.fields.Image[0].filename || `image_${id}.png`,
      size: record.fields.Image[0].size,
      type: record.fields.Image[0].type
    });
    
  } catch (error) {
    console.error('Error getting image:', error);
    return res.status(500).json({ 
      error: 'Failed to get image',
      details: error.message
    });
  }
}; 