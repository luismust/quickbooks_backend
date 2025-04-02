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
          // Base64 - guardamos referencia
          const imageId = q.id;
          simplifiedQuestion.image = `image_reference_${imageId}`;
          
          // NUEVO: Guardar la imagen en la tabla Images
          saveImageToAirtable(base, tableImages, imageId, q.image);
          
          // Eliminar _imageData para que no duplique el contenido
          delete simplifiedQuestion._imageData;
        }
        else if (q.image.startsWith('blob:')) {
          if (q._imageData) {
            const imageId = q.id;
            simplifiedQuestion.image = `image_reference_${imageId}`;
            
            // NUEVO: Guardar la imagen en la tabla Images
            saveImageToAirtable(base, tableImages, imageId, q._imageData);
            
            // Eliminar _imageData para que no duplique el contenido
            delete simplifiedQuestion._imageData;
          } else {
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

// NUEVA FUNCIÓN: Guardar imagen en la tabla Images
async function saveImageToAirtable(base, tableImages, imageId, imageData) {
  try {
    // Comprobar si ya existe la imagen con ese ID
    const existingRecords = await base(tableImages)
      .select({
        filterByFormula: `{ID}="${imageId}"`,
        maxRecords: 1
      })
      .all();
    
    if (existingRecords.length > 0) {
      // Actualizar imagen existente
      await base(tableImages).update([{
        id: existingRecords[0].id,
        fields: {
          Image: [{ url: imageData }],
          Updated: new Date().toISOString()
        }
      }]);
      console.log(`Updated existing image with ID: ${imageId}`);
    } else {
      // Crear nueva imagen
      await base(tableImages).create([{
        fields: {
          ID: imageId,
          Image: [{ url: imageData }],
          Created: new Date().toISOString(),
          Description: `Image for question ${imageId}`
        }
      }]);
      console.log(`Created new image with ID: ${imageId}`);
    }
  } catch (error) {
    console.error(`Error saving image ${imageId} to Airtable:`, error);
    // No lanzamos el error para que no interrumpa el guardado del test
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