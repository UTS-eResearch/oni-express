FROM node:10

VOLUME [ "/etc/share/ocfl","/etc/share/logs","/etc/share/config" ]

# Install the express app first

WORKDIR /usr/src/app
COPY . .
RUN npm run build
EXPOSE 8080

CMD [ "npm", "start", "/etc/share/config/express.json" ]
