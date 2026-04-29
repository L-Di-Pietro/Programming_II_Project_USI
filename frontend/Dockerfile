# Frontend Docker image — Node 20, Vite dev server.
# In production you would do `npm run build` and serve the static dist/ via nginx;
# this Dockerfile is tuned for the docker-compose dev workflow.

FROM node:20-alpine

WORKDIR /app

# Install deps first so the layer is cached.
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
