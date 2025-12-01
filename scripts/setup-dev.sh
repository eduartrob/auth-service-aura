#!/bin/bash

# ============================================================================
# Script de Configuración de Entorno de Desarrollo para Auth Service
# ============================================================================
# Este script automatiza la configuración completa del auth-service para
# desarrollo local. Combina la configuración de entorno, base de datos y
# dependencias en un solo paso.
#
# Tareas:
# 1. Verifica requisitos del sistema (Node.js, PostgreSQL).
# 2. Genera y configura el archivo .env.
# 3. Configura PostgreSQL (usuario, BD, permisos).
# 4. Instala dependencias (npm).
# 5. Ejecuta migraciones y seeds (Prisma).
# ============================================================================

set -e # Salir inmediatamente si un comando falla.

# --- Colores ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Iniciando configuración de desarrollo para Auth Service...${NC}"

# Directorio del script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
# Asumimos que el script está en auth-service/scripts/, así que subimos un nivel
AUTH_SERVICE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$AUTH_SERVICE_DIR"

# --- 1. Verificación de Requisitos ---
echo -e "\n--- 🔎 ${BLUE}Verificando requisitos del sistema...${NC} ---"

command_exists() {
    command -v "$1" &> /dev/null
}

if ! command_exists node; then
    echo -e "${RED}❌ Node.js no encontrado. Por favor instálalo.${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Node.js encontrado: $(node -v)${NC}"
fi

if ! command_exists psql; then
    echo -e "${RED}❌ PostgreSQL no encontrado. Por favor instálalo.${NC}"
    exit 1
else
    echo -e "${GREEN}✅ PostgreSQL encontrado.${NC}"
fi

# --- 2. Configuración de .env ---
echo -e "\n--- 📝 ${BLUE}Configurando variables de entorno (.env)...${NC} ---"

if [ ! -f .env ]; then
    echo "Creando .env desde plantilla..."
    cat > .env << EOF
PORT=3001
# Auth Service Database
AUTH_DB_USER=auth_service_user
AUTH_DB_PASSWORD=aurapassword
AUTH_DB_NAME=aura_auth_db
# JWT Secret
JWT_SECRET=$(openssl rand -base64 32)
# RabbitMQ
RABBITMQ_URL=amqp://admin:admin@localhost:5672
EOF
    echo -e "${GREEN}✅ Archivo .env creado con valores por defecto.${NC}"
else
    echo -e "${GREEN}✅ Archivo .env ya existe.${NC}"
fi

# Leer variables del .env para usarlas en el script
export $(grep -v '^#' .env | xargs)

# Asegurar que tenemos las variables necesarias
if [ -z "$AUTH_DB_USER" ] || [ -z "$AUTH_DB_PASSWORD" ] || [ -z "$AUTH_DB_NAME" ]; then
    echo -e "${RED}❌ Faltan variables de base de datos en .env. Revisa el archivo.${NC}"
    exit 1
fi

# Construir DATABASE_URL si no existe o actualizarla
DATABASE_URL="postgresql://${AUTH_DB_USER}:${AUTH_DB_PASSWORD}@localhost:5432/${AUTH_DB_NAME}?schema=public"

# Actualizar DATABASE_URL en .env
if grep -q "^DATABASE_URL=" .env; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" .env
else
    echo "DATABASE_URL=${DATABASE_URL}" >> .env
fi
echo -e "${GREEN}✅ DATABASE_URL configurada en .env.${NC}"


# --- 3. Configuración de Base de Datos ---
echo -e "\n--- 🐘 ${BLUE}Configurando PostgreSQL...${NC} ---"

# Crear usuario y base de datos si no existen
echo "Configurando usuario '${AUTH_DB_USER}' y base de datos '${AUTH_DB_NAME}'..."

sudo -u postgres psql << EOF
-- Crear usuario si no existe
DO
\$do\$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = '${AUTH_DB_USER}') THEN
      CREATE ROLE ${AUTH_DB_USER} LOGIN PASSWORD '${AUTH_DB_PASSWORD}';
   ELSE
      ALTER ROLE ${AUTH_DB_USER} WITH PASSWORD '${AUTH_DB_PASSWORD}';
   END IF;
END
\$do\$;

-- Crear base de datos si no existe
SELECT 'CREATE DATABASE ${AUTH_DB_NAME}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${AUTH_DB_NAME}')\gexec

-- Dar permisos
GRANT ALL PRIVILEGES ON DATABASE ${AUTH_DB_NAME} TO ${AUTH_DB_USER};
EOF

echo -e "${GREEN}✅ Usuario y Base de Datos configurados.${NC}"

# Configurar permisos específicos en la base de datos
echo "Configurando permisos de esquema..."
sudo -u postgres psql -d "$AUTH_DB_NAME" << EOF
GRANT ALL PRIVILEGES ON SCHEMA public TO ${AUTH_DB_USER};
ALTER SCHEMA public OWNER TO ${AUTH_DB_USER};
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${AUTH_DB_USER};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${AUTH_DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${AUTH_DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${AUTH_DB_USER};
EOF
echo -e "${GREEN}✅ Permisos de esquema aplicados.${NC}"


# --- 4. Instalación de Dependencias ---
echo -e "\n--- 📦 ${BLUE}Instalando dependencias de Node.js...${NC} ---"
npm install
echo -e "${GREEN}✅ Dependencias instaladas.${NC}"


# --- 5. Migraciones y Seeds ---
echo -e "\n--- 🚀 ${BLUE}Ejecutando migraciones y seeds...${NC} ---"
npx prisma migrate deploy
npx prisma generate

echo "Insertando roles iniciales..."
# Usamos psql directamente para asegurar que los roles existan, aunque un seed de prisma sería mejor a largo plazo
sudo -u postgres psql -d "$AUTH_DB_NAME" -c "INSERT INTO roles (role_name) VALUES ('admin'), ('user') ON CONFLICT (role_name) DO NOTHING;"

echo -e "${GREEN}✅ Base de datos lista y poblada.${NC}"

echo -e "\n\n🎉 ${GREEN}¡Configuración completada exitosamente!${NC} 🎉"
echo -e "Puedes iniciar el servicio con: ${YELLOW}npm run dev${NC}"
