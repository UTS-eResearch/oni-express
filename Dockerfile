FROM node:10

# Build the frontend

WORKDIR /usr/src/build
RUN git clone --branch release-1.0.1 https://github.com/UTS-eResearch/oni-portal.git
WORKDIR /usr/src/build/oni-portal
COPY ./config/portal.config.json ./config.json
RUN npm install
RUN npm run build
RUN mkdir -p /usr/src/app
RUN cp -r /usr/src/build/oni-portal/dist /usr/src/app/portal

# Install the express app

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080
CMD [ "npm", "start" ]