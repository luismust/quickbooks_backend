// api/images.js - Endpoint para obtener imágenes de Vercel Blob Storage
const Airtable = require('airtable');
const { list } = require('@vercel/blob');

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
  const origin = req.headers.origin || 'https://quickbooks-test-black.vercel.app';
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin);
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
    const { id, redirect } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Image ID is required' });
    }
    
    // Configurar tabla de imágenes
    const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
    const base = getAirtableBase();
    
    // Buscar la imagen por ID
    console.log(`Looking for image with ID: ${id}, redirect=${redirect}`);
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
    let imageUrl = null;
    
    // Primero verificar si tenemos una URL de Blob Storage
    if (record.fields.BlobURL) {
      imageUrl = record.fields.BlobURL;
      
      // Si se solicita redirección, redireccionar directamente
      if (redirect === '1' || redirect === 'true') {
        console.log(`Redirecting to Blob URL: ${imageUrl}`);
        return res.redirect(imageUrl);
      }
      
      return res.status(200).json({
        id: id,
        url: imageUrl,
        size: record.fields.Size,
        type: record.fields.ContentType,
        source: 'vercel-blob'
      });
    }
    
    // Como respaldo, verificar si hay una imagen en el campo Image de Airtable
    if (record.fields.Image && record.fields.Image[0] && record.fields.Image[0].url) {
      imageUrl = record.fields.Image[0].url;
      
      // Si se solicita redirección, redireccionar directamente
      if (redirect === '1' || redirect === 'true') {
        console.log(`Redirecting to Airtable URL: ${imageUrl}`);
        return res.redirect(imageUrl);
      }
      
      return res.status(200).json({
        id: id,
        url: imageUrl,
        thumbnails: record.fields.Image[0].thumbnails || {},
        filename: record.fields.Image[0].filename || `image_${id}.png`,
        size: record.fields.Image[0].size,
        type: record.fields.Image[0].type,
        source: 'airtable'
      });
    }
    
    // También verificar si hay una URL externa
    if (record.fields.ExternalURL) {
      imageUrl = record.fields.ExternalURL;
      
      // Si se solicita redirección, redireccionar directamente
      if (redirect === '1' || redirect === 'true') {
        console.log(`Redirecting to External URL: ${imageUrl}`);
        return res.redirect(imageUrl);
      }
      
      return res.status(200).json({
        id: id,
        url: imageUrl,
        source: 'external'
      });
    }
    
    // Si no se encontró ninguna imagen, devolver error
    return res.status(404).json({ error: 'No image URL found for this ID' });
    
  } catch (error) {
    console.error('Error getting image:', error);
    return res.status(500).json({ 
      error: 'Failed to get image',
      details: error.message
    });
  }
}; 