FROM node:24-alpine AS development-dependencies-env
RUN apk add --no-cache python3 make g++
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:24-alpine AS production-dependencies-env
RUN apk add --no-cache python3 make g++
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:24-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:24-alpine
RUN apk add --no-cache poppler-utils ca-certificates
RUN mkdir -p /app/tessdata && \
    wget -q https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz -O /app/tessdata/eng.traineddata.gz && \
    wget -q https://tessdata.projectnaptha.com/4.0.0/spa.traineddata.gz -O /app/tessdata/spa.traineddata.gz
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
VOLUME ["/data"]
ENV DATABASE_PATH=/data/app.db
ENV DOCUMENTS_DIR=/data/documents
ENV TESSDATA_PATH=/app/tessdata
CMD ["npm", "run", "start"]
