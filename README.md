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
│   ├── images.js          # Endpoint para imágenes
│   └── airtable-check.js  # Endpoint para verificar la configuración de Airtable
├── vercel.json            # Configuración de despliegue de Vercel
└── package.json           # Dependencias y scripts
```

## Endpoints

### `/api/tests`

- **GET**: Obtiene todos los tests o un test específico si se proporciona un ID
- **POST**: Crea un nuevo test

### `/api/images`

- **GET**: Obtiene una imagen por ID

### `/api/airtable-check`

- **GET**: Verifica la configuración de Airtable

## Almacenamiento de Imágenes

El sistema utiliza Vercel Blob Storage para almacenar imágenes de manera eficiente:

1. Las imágenes se suben a Vercel Blob Storage
2. Las referencias (URLs) se guardan en Airtable
3. El endpoint `/api/images` recupera las imágenes a partir de su ID

## Variables de Entorno

Para ejecutar este proyecto, necesitas configurar las siguientes variables de entorno:

```
AIRTABLE_API_KEY=your_airtable_api_key
AIRTABLE_BASE_ID=your_airtable_base_id
AIRTABLE_TABLE_NAME=Tests
AIRTABLE_TABLE_IMAGES=Images
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
```

## Despliegue

El proyecto está desplegado en Vercel en: https://quickbooks-backend.vercel.app

## Desarrollo Local

1. Clona este repositorio
2. Instala las dependencias: `npm install`
3. Crea un archivo `.env.local` con las variables de entorno necesarias
4. Ejecuta el servidor de desarrollo: `npx vercel dev` 