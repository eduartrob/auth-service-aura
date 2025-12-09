const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const roleModel = require('../models/roleModel');
const userModel = require('../models/userModel');
const crypto = require('crypto');

const register = async (req, res) => {
    const { username, email, password, fcmToken } = req.body;

    try {
        // Validación de Consistencia: Verificar si el usuario o email ya existen
        const existingUser = await userModel.findUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }

        const existingUsername = await userModel.findUserByUsername(username);
        if (existingUsername) {
            return res.status(409).json({ message: 'Username is already taken.' });
        }

        // Hash de la contraseña
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // Obtener el rol 'user' usando el modelo de rol
        const userRole = await roleModel.findRoleByName('user');
        if (!userRole) {
            // Este es un error crítico del sistema, el rol 'user' debe existir
            console.error("Default 'user' role not found in database.");
            return res.status(500).json({ message: 'System configuration error.' });
        }

        // Crear el usuario y asignarle el id_role obtenido
        const newUser = await userModel.createUser({
            username,
            email,
            password_hash,
            id_role: userRole.id_role,
        });

        // --- Publicación del Evento de Dominio ---
        try {
            // Obtener la instancia del publisher inyectada en la app
            const rabbitPublisher = req.app.get('rabbitPublisher');

            const event = {
                eventType: 'USER_REGISTERED',
                occurredOn: new Date(),
                payload: {
                    userId: newUser.user_id,
                    username: newUser.username,
                    email: newUser.email,
                    role: userRole.role_name,
                }
            };
            await rabbitPublisher.publish('auth.user.registered', event);
        } catch (eventError) {
            console.error('❌ Error publicando el evento USER_REGISTERED:', eventError);
        }

        // Guardar FCM Token si existe
        if (fcmToken) {
            try {
                await userModel.addDeviceToken(newUser.user_id, fcmToken);
            } catch (tokenError) {
                console.error('Error saving FCM token:', tokenError);
                // No fallamos el registro si falla el guardado del token
            }
        }

        // Include username in JWT for notifications
        const token = jwt.sign(
            {
                id: newUser.user_id,
                email: newUser.email,
                username: newUser.username,
                role: userRole.role_name
            },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({ message: 'User registered successfully.', user: newUser, token });

    } catch (error) {
        console.error('Registration error:', error);
        // Gestión de Errores Adecuada: No revelar detalles internos del error
        res.status(500).json({ message: 'Internal server error during registration.' });
    }
};

const login = async (req, res) => {
    const { email, password, fcmToken } = req.body;

    try {
        const user = await userModel.findUserByEmail(email, true); // Incluir el rol

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // Include username in JWT for notifications
        const token = jwt.sign(
            {
                id: user.user_id,
                email: user.email,
                username: user.username,
                role: user.role.role_name
            },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        // --- Publicación del Evento de Dominio ---
        try {
            // Obtener la instancia del publisher inyectada en la app
            const rabbitPublisher = req.app.get('rabbitPublisher');

            const event = {
                eventType: 'USER_LOGGED_IN',
                occurredOn: new Date(),
                payload: {
                    userId: user.user_id,
                    username: user.username,
                    email: user.email,
                    role: user.role.role_name,
                    fcmToken: fcmToken, // Incluir token para notificaciones
                    loginAt: new Date()
                }
            };
            await rabbitPublisher.publish('auth.user.logged_in', event);
        } catch (eventError) {
            console.error('❌ Error publicando el evento USER_LOGGED_IN:', eventError);
            // Decide if you want to proceed despite the event error. For a login, it's usually okay.
        }

        // Guardar FCM Token si existe
        if (fcmToken) {
            try {
                await userModel.addDeviceToken(user.user_id, fcmToken);
            } catch (tokenError) {
                console.error('Error saving FCM token:', tokenError);
            }
        }
        res.status(200).json({ message: 'Logged in successfully.', token });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error during login.' });
    }
};


const recoverPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const user = await userModel.findUserByEmail(email);
        if (!user) {
            // Siempre responder igual para no revelar si el email existe
            return res.status(200).json({
                message: 'If the email exists, recovery instructions were sent.',
                success: true  // Frontend needs this to show success dialog
            });
        }

        // Invalidar tokens anteriores del mismo usuario
        await userModel.invalidatePreviousResetTokens(user.user_id);

        // Generar token único y seguro (64 caracteres hex)
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

        // Guardar en BD
        await userModel.createPasswordReset({
            user_id: user.user_id,
            token: resetToken,
            expiresAt
        });

        // URL para el frontend/app móvil (deeplink)
        // En producción usar PASSWORD_RESET_BASE_URL desde docker-compose.yml
        const baseUrl = process.env.PASSWORD_RESET_BASE_URL || 'http://localhost:3001';
        const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

        // --- Publicación del Evento de Dominio ---
        try {
            const rabbitPublisher = req.app.get('rabbitPublisher');
            const event = {
                eventType: 'PASSWORD_RECOVERY_REQUESTED',
                occurredOn: new Date(),
                payload: {
                    userId: user.user_id,
                    username: user.username,  // ✅ Added for email personalization
                    email: user.email,
                    resetUrl,
                    expiresAt
                }
            };
            await rabbitPublisher.publish('auth.password.reset_requested', event);

            // ✅ Include username in response for app to display
            res.status(200).json({
                message: 'Password recovery instructions sent to email.',
                success: true,
                username: user.username  // ✅ Added for success dialog
            });
        } catch (eventError) {
            console.error('❌ Error publicando evento PASSWORD_RESET_REQUESTED:', eventError);
            // Still respond success even if RabbitMQ fails
            res.status(200).json({
                message: 'Password recovery instructions sent to email.',
                success: true,
                username: user.username
            });
        }
    } catch (error) {
        console.error('Recover password error:', error);
        res.status(500).json({ message: 'Internal server error during password recovery.' });
    }
};

const resetPassword = async (req, res) => {
    const { token, password } = req.body;

    try {
        // Buscar el token en BD
        const resetRequest = await userModel.findPasswordResetToken(token);

        if (!resetRequest) {
            return res.status(400).json({ message: 'Invalid or expired reset token.' });
        }

        // Verificar si ya fue usado
        if (resetRequest.used) {
            return res.status(400).json({ message: 'This reset link has already been used.' });
        }

        // Verificar si expiró
        if (new Date() > new Date(resetRequest.expiresAt)) {
            return res.status(400).json({ message: 'Reset token has expired.' });
        }

        // Hashear nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // Actualizar contraseña
        await userModel.updateUserPassword(resetRequest.user_id, password_hash);

        // Marcar token como usado
        await userModel.markResetTokenAsUsed(token);

        res.status(200).json({ message: 'Password reset successfully.' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Internal server error during password reset.' });
    }
};

const getProfile = async (req, res) => {
    try {
        // req.userId y req.userRole vienen del middleware verifyToken
        const user = await userModel.findUserById(req.userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.status(200).json({ user });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ message: 'Internal server error retrieving profile.' });
    }
};

const getAllUsers = async (req, res) => {
    try {
        const users = await userModel.findAllUsers();
        res.status(200).json({ users });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ message: 'Internal server error retrieving users.' });
    }
};

const getAllUsersPublic = async (req, res) => {
    try {
        console.log('📋 Obteniendo usuarios públicos...');

        const currentUserId = req.userId; // Usuario actual del token
        console.log('👤 Usuario solicitante:', currentUserId);

        // Consultar todos los usuarios con información básica usando Prisma
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        const users = await prisma.user.findMany({
            select: {
                user_id: true,
                username: true,
                email: true,
                createdAt: true,
                role: {
                    select: {
                        role_name: true
                    }
                }
                // NO incluimos password_hash por seguridad
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        console.log(`✅ Encontrados ${users.length} usuarios`);

        // Opcional: Excluir al usuario actual de la lista
        const filteredUsers = users.filter(user => user.user_id !== currentUserId);

        res.status(200).json({
            message: 'Users retrieved successfully',
            count: filteredUsers.length,
            users: filteredUsers
        });
    } catch (error) {
        console.error('❌ Error obteniendo usuarios públicos:', error);
        res.status(500).json({
            message: 'Error retrieving users',
            error: error.message
        });
    }
};

const logout = async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const { fcmToken } = req.body;

        if (fcmToken) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            await userModel.removeDeviceToken(decoded.id, fcmToken);
        }
        res.status(200).json({ message: 'Logged out successfully.' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ message: 'Internal server error during logout.' });
    }
};

const deleteAccountByUser = async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;

        // 1. Obtener datos del usuario ANTES de borrarlo (para el email)
        const user = await userModel.findUserById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // 2. Borrar usuario
        await userModel.deleteUser(userId);

        // 3. Publicar evento USER_DELETED
        try {
            const rabbitPublisher = req.app.get('rabbitPublisher');
            const event = {
                eventType: 'USER_DELETED',
                occurredOn: new Date(),
                payload: {
                    userId: user.user_id,
                    username: user.username,
                    email: user.email,
                    role: user.role ? user.role.role_name : 'user'
                }
            };
            await rabbitPublisher.publish('auth.user.deleted', event);
            console.log(`✅ Evento USER_DELETED publicado para ${user.email}`);
        } catch (eventError) {
            console.error('❌ Error publicando el evento USER_DELETED:', eventError);
        }

        res.status(200).json({ message: 'Account deleted successfully.' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ message: 'Internal server error during delete account.' });
    }
};

module.exports = {
    register,
    login,
    recoverPassword,
    resetPassword,
    getProfile,
    getAllUsers,
    getAllUsersPublic,
    logout,
    deleteAccountByUser
};