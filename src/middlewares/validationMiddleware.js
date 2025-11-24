const { body, validationResult } = require('express-validator');
const validator = require('validator'); // Para validaciones y sanitización adicionales

// Función genérica para manejar los errores de validación
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // No revelar información sensible en los errores
        const extractedErrors = errors.array().map(err => ({ [err.param]: err.msg }));
        return res.status(400).json({ errors: extractedErrors, message: "Validation failed." });
    }
    next();
};

const registerValidation = [
    // Validación de tipo, patrones y reglas específicas para email
    body('username')
        .trim() // Sanitización: Eliminar espacios en blanco al inicio/final
        .isLength({ min: 3 }).withMessage('Username must be at least 3 characters long.')
        .escape() // Sanitización: HTML Escaping
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores.'), // Validación de patrón
    
    body('email')
        .isEmail().withMessage('Please enter a valid email address.') // Validación de tipo y patrón
        .normalizeEmail() // Sanitización: Canonicalización (convertir a formato estándar)
        .escape(), // Sanitización: HTML Escaping

    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
        .matches(/[0-9]/).withMessage('Password must contain at least one number.')
        .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character.')
        .custom((value, { req }) => {
            // Puedes añadir aquí una validación contra contraseñas comunes si tuvieras un diccionario
            // o usar un servicio externo como haveibeenpwned.com
            // Ejemplo de validación de consistencia (aunque es más para la lógica de negocio)
            if (value.includes(req.body.username)) {
                throw new Error('Password cannot contain your username.');
            }
            return true;
        }),
    handleValidationErrors
];

const loginValidation = [
    body('email')
        .isEmail().withMessage('Please enter a valid email address.')
        .normalizeEmail()
        .escape(),
    body('password')
        .notEmpty().withMessage('Password is required.'),
    handleValidationErrors
];

// Middleware para sanitización general (ejemplo, se puede aplicar a inputs de búsqueda, etc.)
const sanitizeInput = (req, res, next) => {
    for (const key in req.body) {
        if (typeof req.body[key] === 'string') {
            // Ejemplo de sanitización de inyección SQL (aunque los ORMs ya lo manejan)
            // Esto es más para inputs directos a queries raw si no se usa un ORM
            req.body[key] = validator.blacklist(req.body[key], '\'\"\\;');
            // JavaScript Escaping (para prevenir XSS en caso de que la salida no sea escapada)
            req.body[key] = validator.escape(req.body[key]);
        }
    }
    next();
};

module.exports = {
    registerValidation,
    loginValidation,
    sanitizeInput,
    handleValidationErrors
};