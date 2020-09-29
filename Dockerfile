FROM node:10

VOLUME ["/etc/share/ocfl","/etc/share/logs","/etc/share/config"]

# Install the express app first

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080

# Fetch the frontend repo, oni-portal

WORKDIR /usr/src/build
RUN git clone -b feature-expert-nation https://github.com/UTS-eResearch/oni-portal.git

# Go back to oni-portal and build it 

WORKDIR /usr/src/build/oni-portal
RUN npm install
RUN npm run build
RUN mkdir -p /usr/src/app
RUN cp -r /usr/src/build/oni-portal/dist /usr/src/app/portal

# entry point

WORKDIR /usr/src/app

CMD [ "npm", "start" ]
