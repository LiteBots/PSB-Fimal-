FROM node:22-alpine
ENV NODE_ENV=production TZ=Europe/Warsaw
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package.json ./
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
