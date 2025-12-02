const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // 1. Crear roles si no existen
    const adminRole = await prisma.role.upsert({
        where: { role_name: 'admin' },
        update: {},
        create: {
            id_role: 1,
            role_name: 'admin',
        },
    });

    const userRole = await prisma.role.upsert({
        where: { role_name: 'user' },
        update: {},
        create: {
            id_role: 2,
            role_name: 'user',
        },
    });

    console.log(`✅ Roles creados: ${adminRole.role_name}, ${userRole.role_name}`);

    // 2. Crear usuario admin si no existe
    const adminEmail = 'admin@aura.com';
    const adminUsername = 'admin';
    const adminPassword = 'pezcadofrito.1';

    const existingAdmin = await prisma.user.findUnique({
        where: { email: adminEmail },
    });

    if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        const admin = await prisma.user.create({
            data: {
                username: adminUsername,
                email: adminEmail,
                password_hash: hashedPassword,
                id_role: 1, // Admin role
            },
        });

        console.log(`✅ Usuario admin creado: ${admin.username} (${admin.email})`);
    } else {
        console.log(`ℹ️  Usuario admin ya existe: ${existingAdmin.username}`);
    }

    console.log('🌱 Seed completado');
}

main()
    .catch((e) => {
        console.error('❌ Error en seed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
