# Usamos la imagen oficial de Node.js (versión 18 es estable)
FROM node:18-bullseye

# Prevenir preguntas interactivas durante la instalación
ENV DEBIAN_FRONTEND=noninteractive

# Actualizar el sistema e instalar LibreOffice (solo lo necesario para consola sin interfaz gráfica)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libreoffice-core \
    libreoffice-writer \
    default-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Crear y movernos al directorio de la aplicación dentro del contenedor
WORKDIR /usr/src/app

# Copiar los archivos de configuración
COPY package*.json ./

# Instalar las dependencias de tu proyecto
RUN npm install --production

# Copiar todo el resto del código del inventario
COPY . .

# Exponer el puerto que usará Express
EXPOSE 3000

# Comando para iniciar tu servidor
CMD [ "node", "server.js" ]
