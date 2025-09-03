FROM node:20-alpine

RUN npm install -g @arsasatria/ccw

EXPOSE 3456

CMD ["ccr",  "start"]
