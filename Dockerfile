FROM node:22-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production TZ=Asia/Jakarta DATA_DIR=/data
RUN mkdir /data && chown node:node /data
VOLUME /data
EXPOSE 3000
USER node
CMD ["node","server.js"]
