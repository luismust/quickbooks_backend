// api/tests.js
const Airtable = require('airtable');
const cors = require('cors');

// Configurar CORS para permitir solicitudes desde tu dominio
const allowCors = cors({
  origin: '*', // Puedes restringir a tus dominios específicos
});

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

// Manejador de la ruta GET /api/tests
async function handleGet(req, res) {
  try {
    const base = getAirtableBase();
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Tests';
    
    const records = await base(tableName).select().all();
    
    const tests = records.map(record => {
      const fields = record.fields;
      
      // Parsear las preguntas que están almacenadas como JSON
      let questions = [];
      try {
        questions = JSON.parse(fields[FIELDS.QUESTIONS] || '[]');
      } catch (error) {
        console.error('Error parsing questions:', error);
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
      };
    });
    
    return res.status(200).json({ tests });
  } catch (error) {
    console.error('Error fetching tests:', error);
    return res.status(500).json({ error: 'Failed to fetch tests' });
  }
}

// Manejador de la ruta POST /api/tests
async function handlePost(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const test = req.body;
    const base = getAirtableBase();
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Tests';
    const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
    
    // Validar datos requeridos
    if (!test.name || !Array.isArray(test.questions)) {
      return res.status(400).json({ 
        error: 'Test name and questions are required',
        received: { 
          hasName: Boolean(test.name), 
          hasQuestions: Array.isArray(test.questions) 
        }
      });
    }
    
    // Asegurar que los campos opcionales tengan valores por defecto
    const testToSave = {
      ...test,
      description: test.description || '',
      maxScore: test.maxScore || 100,
      minScore: test.minScore || 60,
      passingMessage: test.passingMessage || "Congratulations!",
      failingMessage: test.failingMessage || "Try again"
    };
    
    // Simplificar preguntas y manejar imágenes
const simplifiedQuestions = testToSave.questions.map(q => {
  const simplifiedQuestion = { ...q };
  
  // Manejar imágenes según su tipo
  if (q.image) {
    if (q.image.startsWith('data:')) {
      // Generar un ID único para la imagen (puede usar el ID de la pregunta o un ID único)
      const imageId = q.id || generateUniqueId();
      
      // Guardar la referencia en la pregunta
      simplifiedQuestion.image = `image_reference_${imageId}`;
      
      // IMPORTANTE: Guardar la imagen en la tabla Images
      try {
        // Extraer el contenido base64 real (sin el prefijo data:image/xxx;base64,)
        const base64Content = q.image.split(',')[1];
        
        // Crear o actualizar el registro en la tabla Images
        saveImageToAirtable(base, imageId, q.image);
        
        console.log(`Processed image for question ${q.id}, saved with reference: image_reference_${imageId}`);
      } catch (imgError) {
        console.error(`Error saving image for question ${q.id}:`, imgError);
      }
      
      // No necesitamos duplicar la imagen en _imageData si ya la guardamos en Images
      delete simplifiedQuestion._imageData;
    }
    else if (q.image.startsWith('blob:')) {
      if (q._imageData) {
        const imageId = q.id || generateUniqueId();
        simplifiedQuestion.image = `image_reference_${imageId}`;
        
        // Guardar _imageData en la tabla Images
        try {
          saveImageToAirtable(base, imageId, q._imageData);
          console.log(`Processed blob image for question ${q.id}, saved with reference: image_reference_${imageId}`);
        } catch (imgError) {
          console.error(`Error saving blob image for question ${q.id}:`, imgError);
        }
        
        delete simplifiedQuestion._imageData;
      } else {
        console.warn(`Question ${q.id} has blob URL but no _imageData, using placeholder reference`);
        simplifiedQuestion.image = `image_reference_${q.id}`;
      }
    }
  }
  
  return simplifiedQuestion;
});
    
    // Crear registro en Airtable
    const recordData = {
      fields: {
        [FIELDS.NAME]: testToSave.name,
        [FIELDS.DESCRIPTION]: testToSave.description,
        [FIELDS.QUESTIONS]: JSON.stringify(simplifiedQuestions),
        [FIELDS.MAX_SCORE]: testToSave.maxScore,
        [FIELDS.MIN_SCORE]: testToSave.minScore,
        [FIELDS.PASSING_MESSAGE]: testToSave.passingMessage,
        [FIELDS.FAILING_MESSAGE]: testToSave.failingMessage
      }
    };
    
    const records = await base(tableName).create([recordData]);
    const createdRecord = records[0];
    
    // Preparar respuesta
    const responseData = {
      ...testToSave,
      id: createdRecord.id // Reemplazar ID con el de Airtable
    };
    
    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error saving test:', error);
    return res.status(500).json({ 
      error: 'Failed to save test',
      details: error.message
    });
  }
}

// Función para guardar imágenes en Airtable
async function saveImageToAirtable(base, imageId, imageData) {
  const tableImages = process.env.AIRTABLE_TABLE_IMAGES || 'Images';
  
  try {
    // Verificar si ya existe esta imagen en la tabla
    const existingRecords = await base(tableImages)
      .select({
        filterByFormula: `{ID}="${imageId}"`,
        maxRecords: 1
      })
      .all();
      
    if (existingRecords.length > 0) {
      // La imagen ya existe, actualizarla
      await base(tableImages).update([{
        id: existingRecords[0].id,
        fields: {
          ID: imageId,
          // Para Airtable, las imágenes se guardan como array de objetos con URL
          Image: [{ 
            url: imageData 
          }],
          Updated: new Date().toISOString()
        }
      }]);
      console.log(`Updated existing image with ID: ${imageId}`);
    } else {
      // Crear nueva imagen
      await base(tableImages).create([{
        fields: {
          ID: imageId,
          Image: [{ 
            url: imageData 
          }],
          Description: `Image for question ${imageId}`,
          Created: new Date().toISOString()
        }
      }]);
      console.log(`Created new image with ID: ${imageId}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error in saveImageToAirtable for ${imageId}:`, error);
    throw error; // Re-lanzar para manejar arriba
  }
}

// Handler principal que dirige a la función correcta según el método HTTP
module.exports = handleWithCors(async (req, res) => {
  // Parse JSON body for POST requests
  if (req.method === 'POST') {
    if (typeof req.body === 'string') {
      try {
        req.body = JSON.parse(req.body);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
    }
  }
  
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
});