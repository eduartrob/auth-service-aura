const express = require('express');
const { register, login, getProfile, getAllUsers } = require('../controllers/authController');
const { registerValidation, loginValidation, sanitizeInput } = require('../middlewares/validationMiddleware');
const { verifyToken, authorizeRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// Ruta de registro con validación y sanitización
router.post('/register', registerValidation, register);

// Ruta de login con validación y sanitización
router.post('/login', loginValidation, login);

router.post('/recover-password', sanitizeInput, require('../controllers/authController').recoverPassword);

router.post('/reset-password', sanitizeInput, require('../controllers/authController').resetPassword);

// Ruta para obtener el perfil del usuario autenticado (requiere token JWT)
router.get('/profile', verifyToken, getProfile);

// Directorio público de usuarios (requiere autenticación pero no rol específico)
router.get('/users/public', verifyToken, require('../controllers/authController').getAllUsersPublic);

// Ruta para obtener todos los usuarios (requiere token JWT y rol de administrador)
router.get('/users', verifyToken, authorizeRole(['admin']), getAllUsers);

router.post('/logout', verifyToken, require('../controllers/authController').logout);

router.post('/delete-account-by-user', verifyToken, require('../controllers/authController').deleteAccountByUser);

module.exports = router;