FROM node:10

VOLUME [ "/etc/share/ocfl","/etc/share/logs","/etc/share/config", "/usr/src/app" ]

# Install the express app first

WORKDIR /usr/src/app
EXPOSE 8080

CMD [ "npm", "run", "buildAndStart" ]
