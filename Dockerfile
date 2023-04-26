FROM node:20-alpine as base
WORKDIR /app

FROM base as dependencies

COPY ["package.json", "package-lock.json*", "./"]

RUN npm install --production

COPY . .

CMD npm run start