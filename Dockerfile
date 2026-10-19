FROM node:18-slim

# Install ffmpeg & python/make untuk dependensi audio discord
RUN apt-get update && apt-get install -y ffmpeg python3 build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

CMD [ "node", "index.js" ]