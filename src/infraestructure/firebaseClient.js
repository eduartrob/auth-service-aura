const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require('../config/aura-firebase-adminsdk')

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Esta es la función reutilizable que llamarás desde tus controladores
const enviarNotificacion = async (deviceToken, title, body, data = {}) => {
  try {
    const message = {
      token: deviceToken,
      notification: {
        title: title,
        body: body,
      },
      // Datos extra para la lógica de la app
      data: data, 
      android: {
        priority: "high",
        notification: {
          channelId: "high_importance_channel" 
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log("Notificación enviada ID:", response);
    return { success: true, id: response };
    
  } catch (error) {
    console.error("Error en Firebase:", error);
    throw error; // Lanzamos el error para que lo maneje el controller
  }
};

module.exports = { enviarNotificacion };