FROM 192.168.50.202:5000/base/node-24.16-ap:latest
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
RUN npm install concurrently
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev:all"]