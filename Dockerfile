FROM node:10

VOLUME [ "/etc/share" ]

WORKDIR /usr/src/app
COPY . .
# Install the express app first
RUN npm run build
EXPOSE 8080

CMD [ "npm", "start" ]
