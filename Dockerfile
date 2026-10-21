FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build
COPY server ./server
COPY dist ./dist
RUN mkdir -p data
ENV NODE_ENV=production
ENV ASSIST_PORT=8787
EXPOSE 8787
CMD ["node", "server/assist.mjs"]
