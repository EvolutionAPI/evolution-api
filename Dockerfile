# Usa una imagen oficial de Node.js como base
FROM node:20 AS build

# Define el directorio de trabajo en el contenedor
WORKDIR /usr/src/app

# Copia package.json y package-lock.json
COPY package*.json ./

# Instala las dependencias
RUN npm install

# Copia el resto de tu código, incluyendo la carpeta prisma y scripts
COPY . .

# Genera el cliente de Prisma usando tu script personalizado
RUN npm run db:generate

# Compila el proyecto TypeScript
RUN npm run build

# Usa una imagen base más ligera para la etapa de producción
FROM node:20-slim

# Instala OpenSSL en la imagen de producción
RUN apt-get update && apt-get install -y openssl

# Define el directorio de trabajo
WORKDIR /usr/src/app

# Copia los artefactos compilados y dependencias desde la etapa de construcción
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/manager ./manager
COPY --from=build /usr/src/app/prisma ./prisma
COPY --from=build /usr/src/app/package.json ./
COPY --from=build /usr/src/app/runWithProvider.js ./

# Expone el puerto de la aplicación
EXPOSE 8080

# Comando para iniciar la aplicación
CMD ["sh", "-c", "npm run db:generate && npm run db:migrate:dev && node dist/main"]
