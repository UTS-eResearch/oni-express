FROM node:10

# Install the express app first

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080

# Config integration

RUN node /usr/src/app/build_portal_config.js -i ./config/indexer.json -b ./config/portal_base.json -p ./config/portal.json

# Build the frontend

WORKDIR /usr/src/build
RUN git clone -b feature-unified-facet-config https://github.com/UTS-eResearch/oni-portal.git

WORKDIR /usr/src/build/oni-portal
COPY ./config/portal.json ./config.json
RUN npm install
RUN npm run build
RUN mkdir -p /usr/src/app
RUN cp -r /usr/src/build/oni-portal/dist /usr/src/app/portal

# entry point

WORKDIR /usr/src/app

CMD [ "npm", "start" ]
