# 🌱 Evolution API

Evolution API es un proveedor de API no oficial para WhatsApp que ofrece **webhooks** en tiempo real para recibir y enviar mensajes desde un número conectado. 

Este proyecto es un **fork** del repositorio original de **Evolution API**, diseñado para ejecutarse sin necesidad de `docker-compose`. Utiliza solo un **Dockerfile**, lo que lo hace ideal para desplegar en plataformas como **Railway, Render u otros servicios serverless**.

---

## 🚀 Características principales

✔️ **Webhooks en tiempo real** para recibir y enviar mensajes.  
✔️ **Configuración sin** `docker-compose`, utilizando solo un `Dockerfile`.  
✔️ **Compatible con Railway, Render y entornos serverless**.  
✔️ **Uso de Redis y PostgreSQL** para una gestión eficiente.  

---

## 🛠 Instalación en Local

### 📌 Requisitos previos

🔹 Tener **Git** instalado 👉 [Descargar aquí](https://git-scm.com/downloads).  
🔹 Tener **Redis** instalado 👉 [Descargar aquí](https://github.com/tporadowski/redis/releases).  
🔹 Tener **PostgreSQL** instalado 👉 [Descargar aquí](https://www.postgresql.org/download/) y crear una base de datos llamada `evolution`.  
🔹 Tener **Node.js** y **npm** instalados 👉 [Descargar aquí](https://nodejs.org/).  

### 📥 Pasos de instalación

#### 1️⃣ **Clonar el repositorio**:

```bash
git clone --branch version_2.2.3 --single-branch https://github.com/erixcel/evolution-api.git
```
```bash
cd evolution-api
```

#### 2️⃣ **Instalar dependencias**:

```bash
npm install
```

#### 3️⃣ **Generar la base de datos**:

```bash
npm run db:generate
```

#### 4️⃣ **Aplicar migraciones**:

```bash
npm run db:migrate:dev
```
> ⚠️ En Windows, ejecuta este comando desde **Git Bash**.

#### 5️⃣ **Construir el proyecto**:

```bash
npm run build
```

#### 6️⃣ **Iniciar el servidor**:

```bash
npm run dev:server
```

---

## 🐳 Instalación en Local con Docker

### 📌 Requisitos previos

🔹 Tener **Git** instalado 👉 [Descargar aquí](https://git-scm.com/downloads).  
🔹 Tener **Redis** instalado 👉 [Descargar aquí](https://github.com/tporadowski/redis/releases).  
🔹 Tener **PostgreSQL** instalado 👉 [Descargar aquí](https://www.postgresql.org/download/) y crear una base de datos llamada `evolution`.  
🔹 Tener **Docker Desktop** instalado y en ejecución 👉 [Descargar aquí](https://www.docker.com/products/docker-desktop).  

### 📥 Pasos de instalación

#### 1️⃣ **Clonar el repositorio**:

```bash
git clone --branch version_2.2.3 --single-branch https://github.com/erixcel/evolution-api.git
```
```bash
cd evolution-api
```

#### 2️⃣ **Construir la imagen Docker**:

```bash
docker build -t evolution-api .
```

#### 3️⃣ **Configurar .env**:

```bash
DATABASE_CONNECTION_URI=postgresql://postgres:YOUR_PASSWORD@host.docker.internal:5432/evolution?schema=public
DATABASE_CONNECTION_URL=postgresql://postgres:YOUR_PASSWORD@host.docker.internal:5432/evolution?schema=public
CACHE_REDIS_URI=redis://host.docker.internal:6379/6
```
> ⚠️ En este caso en particular remplazamos `localhost` por `host.docker.internal`.

#### 4️⃣ **Ejecutar el contenedor Docker**:

```bash
docker run --env-file .env -p 8080:8080 evolution-api
```

---

## 🌐 Instalación en Railway

### 📌 Pasos de Instalación

#### 1️⃣ Preparar el Entorno
Antes de comenzar, crea una copia del archivo `.env.example.railway` que se encuentra en el repositorio.

#### 2️⃣ Crear una Base de Datos PostgreSQL
Railway proporciona una base de datos PostgreSQL que puedes configurar en tus variables de entorno dentro del Docker. Sigue estos pasos:
1. Accede a Railway y crea una nueva base de datos PostgreSQL.
2. Copia la URL de conexión y agrégala en la copia del archivo `.env` que generaste:
```bash
DATABASE_CONNECTION_URI=postgresql://postgres:YOUR_PASSWORD@autorack.proxy.rlwy.net:YOUR_PORT/railway
DATABASE_CONNECTION_URL=postgresql://postgres:YOUR_PASSWORD@autorack.proxy.rlwy.net:YOUR_PORT/railway
```

💡 **Nota:** Únicamente reemplaza estas variables en el archivo `.env`.

#### 3️⃣ Configurar una Base de Datos Redis
Si tu aplicación requiere almacenamiento en caché, puedes configurar Redis en Railway y agregarlo en el `.env` de Docker:
1. Crea una base de datos Redis en Railway.
2. Copia la URL de conexión y agrégala en la copia del archivo `.env` que generaste:
```bash
CACHE_REDIS_URI=redis://default:YOUR_PASSWORD@junction.proxy.rlwy.net:11556
```

💡 **Nota:** Únicamente reemplaza esta variable en el archivo `.env`.

#### 4️⃣ Desplegar Servicio
Railway permite desplegar aplicaciones utilizando repositorios de Github o imágenes de Docker.

#### 📌 Ejemplo de Despliegue con un Repositorio Público
Si deseas desplegar tu aplicación desde un repositorio público en GitHub, sigue estos pasos:
1. Conéctate a Railway y selecciona "Deploy from GitHub".
2. Escoge tu repositorio público.
```bash
https://github.com/erixcel/evolution-api/tree/version_2.2.3
```
3. Railway detectará automáticamente el `Dockerfile` y comenzará el proceso de despliegue.
4. Agrega las variables de entorno en **Settings → Environment Variables**.

#### 📌 Ejemplo de Despliegue con una Imagen Pública
Si en lugar de un repositorio deseas utilizar una imagen pública de Docker Hub, haz lo siguiente:
1. Crea un nuevo servicio en Railway.
2. Selecciona la opción **Deploy from an Image**.
3. Introduce el nombre de la imagen pública de Docker Hub.
```bash
docker.io/erixcel/evolution-api:version_2.2.3
```
4. Agrega las variables de entorno en **Settings → Environment Variables**.

#### 5️⃣ Obtener la URL Pública
- Dirígete a la pestaña **Deployments**.
- Copia la URL asignada por Railway.
- Accede a tu aplicación desde cualquier navegador. ✅

---

✨ Con estos pasos, tu aplicación estará en funcionamiento en Railway de manera rápida y eficiente. 🚀

---

## 🤑 Instalación en Render (100% Gratis)

### 📌 Pasos de instalación

#### 1️⃣ Preparar el Entorno
Antes de comenzar, crea una copia del archivo `.env.example.render` que se encuentra en el repositorio y renómbralo `.env`.

#### 2️⃣ Crear una Base de Datos Redis
Render no ofrece Redis en su plan gratuito, pero puedes usar **[Upstash](https://upstash.com/)** para obtener un servicio de Redis sin costo:

```bash
CACHE_REDIS_URI=rediss://default:YOUR_PASSWORD@just-stallion-44283.upstash.io:6379
```

💡 **Nota:** Únicamente reemplaza esta variable en el archivo `.env`.

#### 3️⃣ Crear una Base de Datos PostgreSQL
Render no ofrece PostgreSQL en su plan gratuito, pero puedes usar **[Supabase](https://supabase.com/)**:
1. Crea un proyecto en Supabase.
2. Copia la URL de conexión y agrégala en la copia del archivo `.env` que generaste:

```bash
DATABASE_CONNECTION_URI=postgresql://postgres.YOUR_USER:YOUR_PASSWORD@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DATABASE_CONNECTION_URL=postgresql://postgres.YOUR_USER:YOUR_PASSWORD@aws-0-us-west-1.pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1
```

💡 **Nota:** Únicamente reemplaza estas variables en el archivo `.env`.
> ⚠️ IMPORTANTE: `DATABASE_CONNECTION_URI` siempre apuntara al puerto **6543** y `DATABASE_CONNECTION_URL` al puerto **5432**.

#### 4️⃣ Desplegar Servicio
Render permite desplegar aplicaciones de forma gratuita utilizando repositorios de Github o imágenes de Docker.

#### 📌 Desplegar desde un Repositorio Público
1. Conéctate a Render y selecciona "New Web Service".
2. Escoge la opción "Deploy from a Git Repository".
3. Selecciona tu repositorio público en GitHub.
```bash
https://github.com/erixcel/evolution-api/tree/version_2.2.3
```
4. Render detectará el `Dockerfile` y comenzará el despliegue.
5. Agrega las variables de entorno en **Settings → Environment Variables**.

#### 📌 Desplegar desde una Imagen Pública
Si prefieres usar una imagen de Docker Hub en lugar de un repositorio:
1. Crea un nuevo servicio en Render.
2. Selecciona "Deploy from Docker Image".
3. Introduce la imagen pública de Docker Hub:
```bash
docker.io/erixcel/evolution-api:version_2.2.3
```
4. Agrega las variables de entorno en **Settings → Environment Variables**.
5. Render iniciará la construcción y despliegue de tu aplicación.

#### 5️⃣ Obtener la URL Pública
- Una vez que el despliegue esté completo, Render generará una URL pública.
- Copia la URL y accede a tu aplicación desde cualquier navegador. ✅

---

✨ Con estos pasos, tu aplicación estará en funcionamiento en Render sin costos adicionales. 🚀


## 🏆 Créditos

© 2025 **Evolution API** - Creado para facilitar la integración de WhatsApp con soluciones en tiempo real 📩    
© 2025 **erixcel** - Desarrollador a cargo de esta solucion 👨‍💻  
