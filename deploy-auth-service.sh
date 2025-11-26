#!/bin/bash

# ============================================================================
# Script de Configuración de Entorno para Auth Service (Desarrollo Local)
# ============================================================================
# Este script automatiza la configuración completa del auth-service para
# correr localmente en una máquina Ubuntu, asegurando que las credenciales
# de la base de datos coincidan con las usadas en el entorno de Docker.
#
# Tareas:
# 1. Verifica e instala dependencias del sistema (Node.js, PostgreSQL).
# 2. Crea un archivo .env con la configuración correcta para la BD local.
# 3. Limpia y recrea el usuario y la base de datos en PostgreSQL.
# 4. Instala dependencias del proyecto (npm).
# 5. Ejecuta las migraciones de la base de datos (Prisma).
# 6. Inserta datos iniciales (roles).
# ============================================================================

set -e # Salir inmediatamente si un comando falla.

# --- 1. Definición de Variables y Colores ---

# Colores para una salida más clara
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "🚀 Iniciando la configuración del entorno para Auth Service..."

# Determina el directorio donde se encuentra este script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
AUTH_SERVICE_DIR="$SCRIPT_DIR"

# Variables para los nombres de las credenciales en el .env
AUTH_DB_USER_VAR="AUTH_DB_USER"
AUTH_DB_PASS_VAR="AUTH_DB_PASSWORD"
AUTH_DB_NAME_VAR="AUTH_DB_NAME"
AUTH_DB_HOST="localhost"
AUTH_DB_PORT="5432"

# --- 2. Creación y Configuración del Archivo .env ---

echo -e "\n--- 📝 ${YELLOW}Asegurando archivo de configuración .env...${NC} ---"
cd "$AUTH_SERVICE_DIR"

# Función para actualizar o agregar una variable en el .env
update_env() {
    local key=$1
    local val=$2
    local file=".env"
    if grep -q "^${key}=" "$file"; then
        # Usa un delimitador diferente (|) para evitar conflictos con valores que contengan /
        sed -i "s|^${key}=.*|${key}=${val}|" "$file"
    else
        echo "${key}=${val}" >> "$file"
    fi
}

# Función para leer una variable del .env
read_env() {
    local key=$1
    local file=".env"
    # Obtiene el valor después del primer '='
    grep "^${key}=" "$file" | cut -d '=' -f2-
}

if [ ! -f .env ]; then
    echo "Archivo .env no encontrado. Creando desde .env.example..."
    if [ ! -f .env.example ]; then
        cat > .env.example << EOF
# Service Port
PORT=3001
# Auth Service Database
AUTH_DB_USER=
AUTH_DB_PASSWORD=
AUTH_DB_NAME=
# JWT Secret
JWT_SECRET=
# RabbitMQ
RABBITMQ_URL=amqp://admin:admin@localhost:5672
EOF
    fi
    cp .env.example .env
    echo -e "${GREEN}✅ Archivo .env creado.${NC}"
else
    echo -e "${GREEN}✅ Archivo .env ya existe.${NC}"
fi

# Verificar y generar credenciales si faltan
echo "Verificando credenciales en .env..."

# Leer valores actuales
AUTH_DB_USER=$(read_env "$AUTH_DB_USER_VAR")
AUTH_DB_PASSWORD=$(read_env "$AUTH_DB_PASS_VAR")
AUTH_DB_NAME=$(read_env "$AUTH_DB_NAME_VAR")
JWT_SECRET=$(read_env "JWT_SECRET")

CHANGES_MADE=false

if [ -z "$AUTH_DB_USER" ]; then
    echo "Generando AUTH_DB_USER..."
    update_env "$AUTH_DB_USER_VAR" "auth_service_user"
    CHANGES_MADE=true
fi

if [ -z "$AUTH_DB_PASSWORD" ]; then
    echo "Generando AUTH_DB_PASSWORD..."
    PASS=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9')
    update_env "$AUTH_DB_PASS_VAR" "$PASS"
    CHANGES_MADE=true
fi

if [ -z "$AUTH_DB_NAME" ]; then
    echo "Generando AUTH_DB_NAME..."
    update_env "$AUTH_DB_NAME_VAR" "auth_service_db"
    CHANGES_MADE=true
fi

if [ -z "$JWT_SECRET" ]; then
    echo "Generando JWT_SECRET..."
    SECRET=$(openssl rand -base64 32)
    update_env "JWT_SECRET" "$SECRET"
    CHANGES_MADE=true
fi

if [ "$CHANGES_MADE" = true ]; then
    echo -e "${GREEN}✅ Credenciales faltantes generadas y actualizadas en .env.${NC}"
else
    echo -e "${GREEN}✅ Todas las credenciales ya estaban configuradas.${NC}"
fi

# Recargar variables para asegurar que tenemos los valores finales
AUTH_DB_USER=$(read_env "$AUTH_DB_USER_VAR")
AUTH_DB_PASSWORD=$(read_env "$AUTH_DB_PASS_VAR")
AUTH_DB_NAME=$(read_env "$AUTH_DB_NAME_VAR")
AUTH_DB_HOST="localhost"
AUTH_DB_PORT="5432"

# Validar que no estén vacías antes de continuar
if [ -z "$AUTH_DB_USER" ] || [ -z "$AUTH_DB_NAME" ]; then
    echo -e "${RED}❌ Error: No se pudieron establecer las credenciales de base de datos.${NC}"
    echo "Por favor, revisa tu archivo .env manualmente o elimínalo para regenerarlo."
    exit 1
fi

# Reconstruir DATABASE_URL y actualizar
DATABASE_URL="postgresql://${AUTH_DB_USER}:${AUTH_DB_PASSWORD}@${AUTH_DB_HOST}:${AUTH_DB_PORT}/${AUTH_DB_NAME}?schema=public"
update_env "DATABASE_URL" "$DATABASE_URL"
echo "URL de la base de datos actualizada en .env"

# --- 3. Verificación e Instalación de Dependencias del Sistema ---

echo -e "\n--- 🔎 ${BLUE}Verificando requisitos del sistema...${NC} ---"

# Función para verificar si un comando (como 'node' o 'psql') existe.
command_exists() {
    command -v "$1" &> /dev/null
}

if ! command_exists node || ! node -v | grep -q "v20"; then
    echo "Node.js v20 no encontrado. Instalando..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo -e "${GREEN}✅ Node.js ya está instalado.${NC}"
fi

if ! command_exists psql; then
    echo "PostgreSQL no encontrado. Instalando..."
    sudo apt-get update
    sudo apt-get install -y postgresql postgresql-contrib
else
    echo -e "${GREEN}✅ PostgreSQL ya está instalado.${NC}"
fi

# --- 4. Configuración de Autenticación de PostgreSQL ---

echo -e "\n--- 🔑 ${BLUE}Asegurando método de autenticación de PostgreSQL...${NC} ---"

# Encontrar el archivo pg_hba.conf
PG_HBA_CONF=$(sudo -u postgres psql -t -P format=unaligned -c 'show hba_file;')

if [ -f "$PG_HBA_CONF" ]; then
    # Cambiar el método de autenticación para conexiones locales de 'peer' a 'md5'
    # Esto es crucial para que las aplicaciones puedan conectarse con usuario/contraseña
    if sudo grep -q "local   all             all                                     peer" "$PG_HBA_CONF"; then
        echo "Cambiando método de autenticación local a 'md5' en $PG_HBA_CONF..."
        sudo sed -i.bak 's/local\s\+all\s\+all\s\+peer/local   all             all                                     md5/g' "$PG_HBA_CONF"
        echo "Recargando configuración de PostgreSQL para aplicar cambios..."
        if ! sudo systemctl reload postgresql; then
            echo -e "${YELLOW}⚠️ El comando 'reload' falló, intentando con 'restart'...${NC}"
            sudo systemctl restart postgresql
        fi
        echo -e "${GREEN}✅ Configuración de PostgreSQL recargada para aplicar cambios de autenticación.${NC}"
    else
        echo -e "${GREEN}✅ El método de autenticación ya está configurado correctamente.${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ No se pudo encontrar el archivo pg_hba.conf. Saltando la configuración de autenticación.${NC}"
fi

# --- 4. Configuración de la Base de Datos ---

echo -e "\n--- 🐘 ${BLUE}Configurando la base de datos PostgreSQL...${NC} ---"

echo "Asegurando credenciales: Usuario='${AUTH_DB_USER}', Base de Datos='${AUTH_DB_NAME}'"

echo "Limpiando configuración anterior (si existe)..."
sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${AUTH_DB_NAME};"
sudo -u postgres psql -c "DROP USER IF EXISTS ${AUTH_DB_USER};"

echo "Creando usuario y base de datos..."
sudo -u postgres psql -c "CREATE USER ${AUTH_DB_USER} WITH PASSWORD '${AUTH_DB_PASSWORD}';"
sudo -u postgres psql -c "CREATE DATABASE ${AUTH_DB_NAME} OWNER ${AUTH_DB_USER};"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${AUTH_DB_NAME} TO ${AUTH_DB_USER};"
echo -e "${GREEN}✅ Base de datos y usuario creados.${NC}"

# --- 5. Preparación de la Aplicación ---
echo -e "\n--- ⚙️  ${BLUE}Instalando dependencias y preparando la aplicación...${NC} ---"
echo "Instalando dependencias de npm..."
npm install

echo "Ejecutando migraciones de Prisma..."
npx prisma migrate deploy
echo -e "${GREEN}✅ Migración de la base de datos completada.${NC}"

echo "Insertando roles por defecto ('admin', 'user')..."
sudo -u postgres psql -d "$AUTH_DB_NAME" -c "INSERT INTO roles (role_name) VALUES ('admin'), ('user') ON CONFLICT (role_name) DO NOTHING;"
echo -e "${GREEN}✅ Roles por defecto insertados.${NC}"

echo -e "\n\n🎉 ${GREEN}¡Todo listo!${NC} 🎉"
echo -e "El entorno para ${YELLOW}auth-service${NC} ha sido configurado exitosamente."
echo -e "Para iniciar el servidor, ejecuta: ${GREEN}npm run dev${NC}"