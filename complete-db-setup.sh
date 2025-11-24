#!/bin/bash

# Script para completar la configuración de la base de datos
# El usuario y la base de datos ya fueron creados, solo falta configurar permisos y migraciones

set -e

echo "🔧 Completando configuración de PostgreSQL..."

# 1. Restablecer contraseña del usuario (por si acaso)
echo "🔑 Restableciendo contraseña del usuario..."
sudo -u postgres psql -c "ALTER USER aura_auth_user WITH PASSWORD 'aurapassword';"

# 2. Dar todos los permisos
echo "🔐 Configurando permisos completos..."
sudo -u postgres psql -d aura_auth_db << 'EOF'
GRANT ALL PRIVILEGES ON DATABASE aura_auth_db TO aura_auth_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO aura_auth_user;
ALTER SCHEMA public OWNER TO aura_auth_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO aura_auth_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO aura_auth_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO aura_auth_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO aura_auth_user;
EOF

echo "✅ Permisos configurados"

# 3. Ejecutar migraciones
echo "📦 Ejecutando migraciones de Prisma..."
npx prisma migrate deploy

echo "✅ Migraciones aplicadas"

# 4. Insertar roles
echo "👥 Insertando roles iniciales..."
sudo -u postgres psql -d aura_auth_db << 'EOF'
INSERT INTO roles (role_name) VALUES ('admin') ON CONFLICT (role_name) DO NOTHING;
INSERT INTO roles (role_name) VALUES ('user') ON CONFLICT (role_name) DO NOTHING;
EOF

echo "✅ Roles insertados"

# 5. Verificar
echo ""
echo "🔍 Verificando tablas creadas..."
sudo -u postgres psql -d aura_auth_db -c "\dt"

echo ""
echo "🔍 Verificando roles..."
sudo -u postgres psql -d aura_auth_db -c "SELECT * FROM roles;"

echo ""
echo "✅ ¡Configuración completada!"
echo ""
echo "Ahora puedes probar el registro:"
echo "curl -X POST http://localhost:3001/api/auth/register \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"username\":\"testuser\",\"email\":\"test@example.com\",\"password\":\"Password123!\"}'"
echo ""
