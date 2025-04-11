# QuickBook Backend API

Backend para la aplicación de tests QuickBook, desarrollado con Vercel Serverless Functions.

## Tecnologías

- **Node.js**: Entorno de ejecución para JavaScript
- **Vercel Serverless Functions**: Para alojar los endpoints de la API
- **Airtable**: Base de datos para almacenar tests y metadatos
- **Vercel Blob Storage**: Almacenamiento de imágenes optimizado

## Estructura del Proyecto

```
/
├── api/                   # Funciones serverless
│   ├── index.js           # Punto de entrada principal
│   ├── tests.js           # Endpoint para tests
│   ├── images.js          # Endpoint unificado para gestión de imágenes
│   ├── save-test.js       # Endpoint para guardar tests
│   ├── load-tests.js      # Endpoint para cargar tests
│   ├── delete-test.js     # Endpoint para eliminar tests
│   └── airtable-check.js  # Endpoint para verificar la configuración de Airtable
├── vercel.json            # Configuración de despliegue de Vercel
└── package.json           # Dependencias y scripts
```

## Endpoints

### `/api/tests`

- **GET**: Obtiene todos los tests o un test específico si se proporciona un ID
- **POST**: Crea un nuevo test

### `/api/load-tests`
- **GET**: Carga todos los tests o un test específico optimizado para uso del frontend

### `/api/save-test`
- **POST**: Guarda un nuevo test o actualiza uno existente

### `/api/delete-test`
- **POST**: Elimina un test por ID

### `/api/images`

Endpoint unificado para gestión de imágenes:

- **GET** `/api/images?id=<imageId>`: Obtiene una imagen por ID desde Vercel Blob Storage
- **GET** `/api/images?action=list`: Lista todas las imágenes almacenadas en Vercel Blob Storage
- **POST** `/api/images?action=upload`: Sube una nueva imagen a Vercel Blob Storage
- **POST** `/api/images?action=delete`: Elimina una imagen de Vercel Blob por ID o pathname
- **DELETE** `/api/images`: Elimina una imagen (alternativa al POST con action=delete)

### `/api/airtable-check`

- **GET**: Verifica la configuración de Airtable y Vercel Blob

## Optimización de Vercel Serverless Functions

Para cumplir con las limitaciones del plan gratuito de Vercel (máximo 12 funciones serverless), se han consolidado los endpoints relacionados con imágenes en un único archivo `api/images.js` que maneja todas las operaciones según el método HTTP y los parámetros recibidos.

## Almacenamiento de Imágenes

El sistema utiliza exclusivamente Vercel Blob Storage para almacenar imágenes de manera eficiente:

1. Las imágenes se suben a Vercel Blob Storage con un ID único
2. Los tests almacenan referencias a estas imágenes mediante sus IDs
3. El endpoint `/api/images` recupera las imágenes directamente de Vercel Blob Storage usando el ID

## Variables de Entorno

Para ejecutar este proyecto, necesitas configurar las siguientes variables de entorno:

```
AIRTABLE_API_KEY=your_airtable_api_key
AIRTABLE_BASE_ID=your_airtable_base_id
AIRTABLE_TABLE_NAME=Tests
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
```

## Despliegue

El proyecto está desplegado en Vercel en: https://quickbooks-backend.vercel.app

## Desarrollo Local

1. Clona este repositorio
2. Instala las dependencias: `npm install`
3. Crea un archivo `.env.local` con las variables de entorno necesarias
4. Ejecuta el servidor de desarrollo: `npx vercel dev` 