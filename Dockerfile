FROM node:10

VOLUME [ "/etc/share/ocfl","/etc/share/logs","/etc/share/config" ]

WORKDIR /usr/src/app
COPY . .
# Install the express app first
RUN npm run build
EXPOSE 8080

CMD [ "npm", "start", "/etc/share/config/express.json" ]
