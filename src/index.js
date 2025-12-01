require("dotenv").config();

console.log("RABBITMQ_URL =", process.env.RABBITMQ_URL);


const express = require('express');
const helmet = require('helmet'); // Para seguridad básica
const cors = require('cors'); // Para permitir peticiones de otros orígenes
const morgan = require('morgan'); // Para logging de peticiones
const authRoutes = require('./src/routes/authRoutes');
const { RabbitMQPublisher } = require('./src/infraestructure/providers/rabbit_publisher');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares de seguridad y logging
app.use(helmet());
app.use(cors());
app.use(morgan('dev')); // 'dev' para logs concisos en desarrollo

// Middleware para parsear JSON en el body de las peticiones
app.use(express.json());

// --- Inicialización de RabbitMQ Publisher ---
// Creamos una instancia única que puede ser usada en toda la aplicación.
const rabbitPublisher = new RabbitMQPublisher();
// Inyectamos la instancia en el objeto `app` para que esté disponible en las rutas.
app.set('rabbitPublisher', rabbitPublisher);

// Rutas del servicio de autenticación
app.use('/api/auth', authRoutes);

// Manejador de errores global para cualquier error no capturado
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something broke!', error: err.message });
});

const startServer = async () => {
    try {
        await rabbitPublisher.connect();
        app.listen(PORT, () => {
            console.log(`✅ Auth Service running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
