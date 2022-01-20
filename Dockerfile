FROM node:lts-slim

#RUN npm install pm2 -g
WORKDIR /cbsignal
#COPY package*.json ./

COPY . /cbsignal/
RUN yarn install

#CMD [ "pm2-docker", "start", "pm2.config.js"]
CMD [ "node", "dist/run-uws-signal.js", "config/config.json"]

