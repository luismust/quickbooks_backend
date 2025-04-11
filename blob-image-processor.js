/**
 * Procesador de imágenes blob para QuickBooks Test App
 * Este archivo contiene funciones para procesar imágenes en formato blob URL
 * y cargarlas a Vercel Blob Storage.
 */

// Función para procesar un blob URL y convertirlo a una URL de Vercel Blob Storage
async function processBlobUrl(blobUrl, imageElement = null) {
  try {
    console.log(`Procesando blob URL: ${blobUrl}`);
    
    // Si no es un blob URL, devolver el mismo URL
    if (!blobUrl || !blobUrl.startsWith('blob:')) {
      console.log('No es un blob URL, devolviendo el mismo URL');
      return blobUrl;
    }
    
    // Obtener los datos de la imagen como base64
    let imageData;
    
    // Si tenemos un elemento de imagen, obtener los datos de allí
    if (imageElement && imageElement instanceof HTMLImageElement) {
      console.log('Obteniendo datos de imagen desde elemento HTML');
      imageData = await getImageDataFromElement(imageElement);
    } else {
      // Si no, intentar obtener los datos del blob URL directamente
      console.log('Obteniendo datos de imagen desde blob URL');
      imageData = await getImageDataFromBlobUrl(blobUrl);
    }
    
    if (!imageData) {
      console.error('No se pudieron obtener datos de imagen del blob URL');
      return blobUrl; // Devolver el mismo URL si no se pueden obtener los datos
    }
    
    // Enviar los datos al servidor para procesamiento
    console.log('Enviando datos de imagen al servidor...');
    const result = await uploadImageData(blobUrl, imageData);
    
    if (result && result.url) {
      console.log(`Imagen procesada exitosamente. Nueva URL: ${result.url}`);
      return result.url;
    } else {
      console.error('Error al procesar la imagen en el servidor');
      return blobUrl;
    }
  } catch (error) {
    console.error('Error al procesar blob URL:', error);
    return blobUrl;
  }
}

// Función para obtener datos de imagen desde un elemento HTML
async function getImageDataFromElement(imageElement) {
  return new Promise((resolve, reject) => {
    try {
      // Crear un canvas del mismo tamaño que la imagen
      const canvas = document.createElement('canvas');
      canvas.width = imageElement.naturalWidth;
      canvas.height = imageElement.naturalHeight;
      
      // Dibujar la imagen en el canvas
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageElement, 0, 0);
      
      // Obtener los datos como base64
      const dataUrl = canvas.toDataURL('image/png');
      resolve(dataUrl);
    } catch (error) {
      console.error('Error al obtener datos de imagen desde elemento:', error);
      reject(error);
    }
  });
}

// Función para obtener datos de imagen desde un blob URL
async function getImageDataFromBlobUrl(blobUrl) {
  return new Promise((resolve, reject) => {
    try {
      // Crear una imagen temporal
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        // Cuando la imagen cargue, crear un canvas
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        // Dibujar la imagen en el canvas
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        // Obtener los datos como base64
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      };
      
      img.onerror = (error) => {
        console.error('Error al cargar imagen desde blob URL:', error);
        reject(error);
      };
      
      // Establecer el src de la imagen al blob URL
      img.src = blobUrl;
    } catch (error) {
      console.error('Error al procesar blob URL:', error);
      reject(error);
    }
  });
}

// Función para enviar los datos de imagen al servidor
async function uploadImageData(blobUrl, imageData) {
  try {
    const requestData = {
      blobUrl,
      imageData
    };
    
    // Obtener la URL base del API
    let apiUrl = window.location.hostname.includes('localhost') 
      ? 'http://localhost:3000'
      : 'https://quickbooks-backend.vercel.app';
    
    // Realizar la petición al endpoint de procesamiento de blob
    const response = await fetch(`${apiUrl}/api/process-blob-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error en la respuesta del servidor:', errorData);
      throw new Error(`Error del servidor: ${errorData.error || response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error al enviar datos de imagen al servidor:', error);
    throw error;
  }
}

// Función para procesar todas las imágenes blob en un test antes de guardarlo
async function processAllBlobImagesInTest(test) {
  if (!test || !test.questions || !Array.isArray(test.questions)) {
    return test;
  }
  
  console.log(`Procesando ${test.questions.length} preguntas para buscar blob URLs...`);
  
  // Crear una copia profunda del test para no modificar el original
  const processedTest = JSON.parse(JSON.stringify(test));
  
  // Contador de imágenes procesadas
  let processedCount = 0;
  
  // Procesar cada pregunta
  for (const question of processedTest.questions) {
    if (question.image && question.image.startsWith('blob:')) {
      console.log(`Pregunta ${question.id}: Encontrado blob URL, procesando...`);
      
      try {
        // Buscar elemento de imagen en el DOM si existe
        const imgElement = document.querySelector(`img[src="${question.image}"]`);
        
        // Si encontramos datos en _localFile o _imageData, usarlos directamente
        if (question._localFile && question._localFile.startsWith('data:')) {
          console.log(`Pregunta ${question.id}: Usando datos de _localFile`);
          const result = await uploadImageData(question.image, question._localFile);
          if (result && result.url) {
            question.image = result.url;
            question.imageId = result.imageId;
            processedCount++;
          }
        } 
        else if (question._imageData && question._imageData.startsWith('data:')) {
          console.log(`Pregunta ${question.id}: Usando datos de _imageData`);
          const result = await uploadImageData(question.image, question._imageData);
          if (result && result.url) {
            question.image = result.url;
            question.imageId = result.imageId;
            processedCount++;
          }
        }
        // Si no hay datos explícitos, intentar procesar desde el elemento o blob URL
        else {
          console.log(`Pregunta ${question.id}: Procesando desde blob URL directamente`);
          question.image = await processBlobUrl(question.image, imgElement);
          processedCount++;
        }
      } catch (error) {
        console.error(`Error al procesar imagen para pregunta ${question.id}:`, error);
      }
    }
  }
  
  console.log(`Procesamiento de imágenes completado. ${processedCount} imágenes procesadas.`);
  return processedTest;
}

// Exportar las funciones
window.BlobImageProcessor = {
  processBlobUrl,
  processAllBlobImagesInTest,
  getImageDataFromElement,
  getImageDataFromBlobUrl,
  uploadImageData
}; 