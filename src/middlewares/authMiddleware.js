const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).json({ message: 'No token provided.' });
    }

    const token = authHeader.split(' ')[1]; // Expected format: Bearer <token>
    if (!token) {
        return res.status(403).json({ message: 'Token format is incorrect (e.g., missing Bearer).' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            // Manejo de errores de JWT más específico
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ message: 'Unauthorized: Token expired.' });
            }
            if (err.name === 'JsonWebTokenError') {
                return res.status(401).json({ message: 'Unauthorized: Invalid token.' });
            }
            return res.status(500).json({ message: 'Failed to authenticate token.' });
        }
        req.userId = decoded.id; // Asume que el payload incluye 'id'
        req.userRole = decoded.role; // Asume que el payload incluye 'role'
        next();
    });
};

const authorizeRole = (requiredRoles) => {
    return (req, res, next) => {
        if (!req.userRole || !requiredRoles.includes(req.userRole)) {
            return res.status(403).json({ message: 'Forbidden: You do not have the necessary permissions.' });
        }
        next();
    };
};

module.exports = {
    verifyToken,
    authorizeRole,
};