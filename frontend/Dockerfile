# ═══════════════════════════════════════════════════════════════
# Mary Poppins — Frontend Dockerfile
# React 18 + TypeScript + Vite dev server
# ═══════════════════════════════════════════════════════════════
FROM node:20-alpine

WORKDIR /app

# Dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Application code (src/ is volume-mounted in dev for hot reload)
COPY . .

EXPOSE 3000

# Vite dev server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
