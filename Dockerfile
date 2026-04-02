FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Build the production Vite bundle
RUN npm run build

# Expose the API and Web port
EXPOSE 3000

# Start the Node.js server
CMD ["npm", "run", "start"]
