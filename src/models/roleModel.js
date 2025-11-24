const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Busca un rol por su nombre.
 * @param {string} roleName - El nombre del rol a buscar (ej. 'user', 'admin').
 * @returns {Promise<Object|null>} El objeto del rol si se encuentra, de lo contrario null.
 */
const findRoleByName = async (roleName) => {
    try {
        const role = await prisma.role.findUnique({
            where: {
                role_name: roleName,
            },
        });
        return role;
    } catch (error) {
        console.error(`Error finding role by name: ${roleName}`, error);
        throw new Error('Could not retrieve role from database.');
    }
};

module.exports = {
    findRoleByName,
};