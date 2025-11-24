# 📨 Guía de Integración RabbitMQ - Auth Service

## Configuración Actual del Auth Service

### Exchange y Routing Keys

El **auth-service** publica eventos al exchange `domain_events` con tipo **topic**:

| Evento | Routing Key | Event Type |
|--------|-------------|------------|
| Registro de usuario | `auth.user.registered` | `USER_REGISTERED` |
| Login de usuario | `auth.user.logged_in` | `USER_LOGGED_IN` |

### Estructura de Eventos

#### USER_REGISTERED
```json
{
  "eventType": "USER_REGISTERED",
  "occurredOn": "2024-11-24T03:45:00.000Z",
  "payload": {
    "userId": "uuid-del-usuario",
    "username": "nombreusuario",
    "email": "email@example.com",
    "role": "user"
  }
}
```

#### USER_LOGGED_IN
```json
{
  "eventType": "USER_LOGGED_IN",
  "occurredOn": "2024-11-24T03:45:00.000Z",
  "payload": {
    "userId": "uuid-del-usuario",
    "username": "nombreusuario",
    "email": "email@example.com",
    "role": "user",
    "loginAt": "2024-11-24T03:45:00.000Z"
  }
}
```

---

## 🎯 Prompt para el Microservicio de Notificaciones

Copia y pega este prompt en la conversación con el microservicio de notificaciones:

---

**PROMPT PARA MICROSERVICIO DE NOTIFICACIONES:**

```
Necesito configurar el consumidor de RabbitMQ en el microservicio de notificaciones para escuchar eventos del auth-service.

CONFIGURACIÓN REQUERIDA:

1. **Conexión RabbitMQ:**
   - URL: amqp://admin:admin@localhost:5672
   - Exchange: "domain_events" (tipo: topic, durable: true)

2. **Colas a crear:**
   - Cola: "notifications.user_events"
   - Durable: true
   - Binding patterns: ["auth.user.*"]

3. **Eventos a procesar:**

   a) USER_REGISTERED (routing key: auth.user.registered)
   Estructura:
   {
     "eventType": "USER_REGISTERED",
     "occurredOn": "timestamp",
     "payload": {
       "userId": "string",
       "username": "string",
       "email": "string",
       "role": "string"
     }
   }
   Acción: Enviar email de bienvenida al usuario

   b) USER_LOGGED_IN (routing key: auth.user.logged_in)
   Estructura:
   {
     "eventType": "USER_LOGGED_IN",
     "occurredOn": "timestamp",
     "payload": {
       "userId": "string",
       "username": "string",
       "email": "string",
       "role": "string",
       "loginAt": "timestamp"
     }
   }
   Acción: Registrar el login (opcional: enviar notificación de seguridad)

   c) PASSWORD_RESET_REQUESTED (routing key: auth.password.reset_requested)
   Estructura:
   {
     "eventType": "PASSWORD_RESET_REQUESTED",
     "occurredOn": "timestamp",
     "payload": {
       "userId": "string",
       "email": "string",
       "resetUrl": "string",
       "expiresAt": "timestamp"
     }
   }
   Acción: Enviar email con el link de recuperación de contraseña

4. **Implementación necesaria:**
   - Crear un consumidor de RabbitMQ con reconexión automática
   - Usar confirmación manual de mensajes (ack)
   - Implementar manejo de errores con dead letter queue
   - Crear handlers para cada tipo de evento
   - Logging de eventos recibidos y procesados

5. **Estructura recomendada:**
   - infrastructure/providers/rabbit_consumer.js → Consumidor base
   - handlers/userEventsHandler.js → Lógica de procesamiento
   - services/emailService.js → Servicio de envío de emails

Por favor, crea el código necesario para:
1. Conectarse al exchange "domain_events"
2. Crear y bindear la cola "notifications.user_events" con pattern "auth.user.*"
3. Consumir mensajes y procesarlos según el eventType
4. Implementar manejo robusto de errores
5. Agregar logging apropiado

El consumidor debe iniciarse cuando arranque el servicio de notificaciones.
```

---

## 📝 Detalles Técnicos Adicionales

### Patrón de Routing Keys

El auth-service usa el patrón `auth.<entidad>.<acción>`:
- `auth.user.registered` - Cuando un usuario se registra
- `auth.user.logged_in` - Cuando un usuario inicia sesión

### Binding Pattern Recomendado

Para el microservicio de notificaciones, usa:
- `auth.user.*` - Captura todos los eventos de usuario
- `auth.*` - Si quieres capturar TODOS los eventos de auth (futuro)

### Ejemplo de Binding en Código

```javascript
// En el consumer de notificaciones
await channel.assertQueue('notifications.user_events', { durable: true });
await channel.bindQueue('notifications.user_events', 'domain_events', 'auth.user.*');
```

---

## 🔍 Verificación

Para verificar que los eventos están llegando a RabbitMQ:

```bash
# Ver exchanges
sudo rabbitmqadmin list exchanges

# Ver bindings del exchange domain_events
sudo rabbitmqadmin list bindings

# Ver mensajes en cola (sin consumir)
sudo rabbitmqadmin get queue=notifications.user_events count=10
```

---

## 🚀 Testing

Prueba el flujo completo:

1. **Registrar un usuario:**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"testuser","email":"test@example.com","password":"Password123!"}'
```

2. **Verificar logs del auth-service:**
Deberías ver: `📤 Evento enviado: [auth.user.registered]`

3. **Verificar logs del notifications-service:**
Debería recibir y procesar el evento

