# Lector del portal de Rappi Partners (The Coffee). Construir desde servicios/rappi-portal:
#   docker build -t rappi-thecoffee .
# Imagen oficial de Playwright con Chromium y sus dependencias (misma versión que playwright-core).
FROM mcr.microsoft.com/playwright:v1.55.0-noble
ENV NODE_ENV=production TZ=America/Mexico_City DATOS=/datos PUERTO=3101
WORKDIR /app
RUN npm init -y >/dev/null && npm install --omit=dev playwright-core@1.55.0 && mkdir -p /datos && chown pwuser:pwuser /datos
COPY lote.mjs servidor.mjs ./
USER pwuser
VOLUME /datos
EXPOSE 3101
HEALTHCHECK --interval=5m --timeout=10s CMD node -e "fetch('http://127.0.0.1:3101/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "servidor.mjs"]
