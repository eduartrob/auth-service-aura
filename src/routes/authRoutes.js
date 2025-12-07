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

// GET /reset-password - Web page that redirects to mobile app deeplink
// Email clients block aura:// links, so we serve an HTML page that opens the app
router.get('/reset-password', (req, res) => {
    const token = req.query.token || '';
    const deeplinkUrl = `aura://reset-password?token=${token}`;

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Restablecer Contraseña - Aura</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .logo { font-size: 48px; margin-bottom: 20px; }
        h1 { color: #2D3748; margin-bottom: 15px; font-size: 24px; }
        p { color: #718096; margin-bottom: 25px; line-height: 1.6; }
        .btn {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 40px;
            border-radius: 12px;
            text-decoration: none;
            font-weight: bold;
            font-size: 16px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(102,126,234,0.4); }
        .info { margin-top: 25px; padding: 15px; background: #EBF8FF; border-radius: 10px; }
        .info p { margin: 0; font-size: 14px; color: #2C5282; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🔐</div>
        <h1>Restablecer Contraseña</h1>
        <p>Haz clic en el botón para abrir la aplicación Aura y crear tu nueva contraseña.</p>
        <a href="${deeplinkUrl}" class="btn" id="openApp">Abrir Aura</a>
        <div class="info">
            <p>Si la app no se abre automáticamente, asegúrate de tener Aura instalada en tu dispositivo.</p>
        </div>
    </div>
    <script>
        // Intenta abrir la app automáticamente después de 500ms
        setTimeout(function() {
            window.location.href = "${deeplinkUrl}";
        }, 500);
    </script>
</body>
</html>
    `);
});

// Ruta para obtener el perfil del usuario autenticado (requiere token JWT)
router.get('/profile', verifyToken, getProfile);

// Directorio público de usuarios (requiere autenticación pero no rol específico)
router.get('/users/public', verifyToken, require('../controllers/authController').getAllUsersPublic);

// Ruta para obtener todos los usuarios (requiere token JWT y rol de administrador)
router.get('/users', verifyToken, authorizeRole(['admin']), getAllUsers);

router.post('/logout', verifyToken, require('../controllers/authController').logout);

router.post('/delete-account-by-user', verifyToken, require('../controllers/authController').deleteAccountByUser);

module.exports = router;