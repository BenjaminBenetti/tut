FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node relay/server.mjs relay/main.mjs relay/game-request.mjs ./relay/
COPY --chown=node:node src/tactical/data/jev-protocol.json ./src/tactical/data/
USER node
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "relay/main.mjs"]
