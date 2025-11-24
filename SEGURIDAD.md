# 🛡️ Seguridad del Microservicio de Autenticación (Auth Service)

Este documento detalla los principios y controles de seguridad implementados en el microservicio de autenticación de Aura, siguiendo las directrices de la Mobile Security Testing Guide (MSTG) en los apartados relevantes.

## MSTG-ARCH-1: Identificación de Componentes

El **Auth Service** es un componente **crítico** dentro de la plataforma Aura, ya que es el pilar de la seguridad y la gestión de usuarios.

**Descripción del Componente:**

-   **Nombre**: Auth Service
-   **Función Principal**: Proporcionar un sistema robusto, seguro y escalable para el registro, inicio de sesión y gestión de usuarios, basado en JSON Web Tokens (JWT). Es responsable de la autenticación y autorización de todos los usuarios de la plataforma.
-   **Tecnologías Clave**:
    -   **Backend**: Node.js, Express.js
    -   **Base de Datos**: PostgreSQL (gestionada por Prisma)
    -   **ORM**: Prisma
    -   **Autenticación**: JSON Web Tokens (JWT)
    -   **Seguridad**: Bcrypt.js (hashing de contraseñas), Helmet (cabeceras de seguridad), CORS (control de acceso de origen cruzado).
    -   **Validación**: `express-validator`, `validator.js` (para validación y sanitización de entradas).
    -   **Logging**: Morgan (para registro de peticiones HTTP).
-   **Contexto de Infraestructura**: Opera dentro de un entorno Dockerizado, detrás de un Nginx (como parte del proyecto `aura_server`) y se comunica con una base de datos PostgreSQL aislada.

**Justificación de Criticidad**:
La criticidad del Auth Service es máxima debido a que maneja la identidad de los usuarios. Cualquier vulnerabilidad en este servicio podría comprometer la seguridad de toda la plataforma, permitiendo accesos no autorizados, suplantación de identidad o manipulación de datos sensibles. Es el primer punto de control de acceso para todos los demás microservicios.

## MSTG-ARCH-3: Arquitectura de Alto Nivel y Controles

### Arquitectura del Auth Service en el Ecosistema Aura

El Auth Service se integra en la arquitectura de microservicios de Aura de la siguiente manera:

1.  **Cliente (App Flutter)**: La aplicación móvil interactúa con el sistema.
2.  **Amazon API Gateway**: Todas las peticiones del cliente pasan por un API Gateway, que actúa como punto de entrada unificado y puede aplicar controles de seguridad a nivel de red y API.
3.  **Auth Service (AWS EC2)**: El API Gateway enruta las peticiones relacionadas con la autenticación y autorización al microservicio de autenticación, desplegado en una instancia EC2.
4.  **Base de Datos (PostgreSQL con RDS)**: El Auth Service tiene su propia base de datos PostgreSQL aislada para almacenar información de usuarios y roles.

### Controles de Seguridad por Capa (dentro del Auth Service)

El Auth Service implementa controles de seguridad específicos en sus diferentes capas:

1.  **Capa de Red (Interna al Servicio)**:
    -   **TLS/SSL**: Se espera que la comunicación entre el API Gateway y el Auth Service, así como con la base de datos, utilice TLS para asegurar la encriptación en tránsito.
    -   **CORS**: El middleware `cors` (`app.use(cors())` en `index.js`) está configurado para controlar qué orígenes pueden realizar peticiones al servicio, previniendo ataques CSRF básicos y accesos no autorizados desde dominios no permitidos.
    -   **Security Headers**: El middleware `helmet` (`app.use(helmet())` en `index.js`) añade cabeceras HTTP de seguridad para proteger contra vulnerabilidades comunes como XSS, clickjacking, etc.

2.  **Capa de Aplicación (API y Lógica de Negocio)**:
    -   **Autenticación (JWT)**:
        -   Generación de JWTs seguros tras un login exitoso, con una clave secreta (`JWT_SECRET`) almacenada en variables de entorno y una expiración definida (`1h`). [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/controllers/authController.js]
        -   Verificación de JWTs mediante el middleware `verifyToken` (`src/middlewares/authMiddleware.js`), que valida la firma, la expiración y extrae el `userId` y `userRole` del token. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/middlewares/authMiddleware.js]
        -   Manejo específico de errores de JWT (`TokenExpiredError`, `JsonWebTokenError`) para proporcionar mensajes claros sin revelar información sensible. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/middlewares/authMiddleware.js]
    -   **Autorización (RBAC)**:
        -   El middleware `authorizeRole` (`src/middlewares/authMiddleware.js`) restringe el acceso a rutas específicas basándose en los roles del usuario extraídos del JWT (ej. `/users` solo para `admin`). [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/routes/authRoutes.js, /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/middlewares/authMiddleware.js]
    -   **Validación de Entradas**:
        -   Uso de `express-validator` en `src/middlewares/validationMiddleware.js` para validar el formato, longitud y complejidad de `username`, `email` y `password` en las rutas de registro y login. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/middlewares/validationMiddleware.js]
        -   Validación de unicidad de `username` y `email` antes de crear un nuevo usuario para evitar duplicados y posibles ataques de enumeración. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/controllers/authController.js]
    -   **Sanitización de Entradas**:
        -   El middleware `sanitizeInput` (`src/middlewares/validationMiddleware.js`) utiliza `trim()`, `escape()` y `normalizeEmail()` para limpiar los datos de entrada, previniendo ataques XSS y estandarizando formatos. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/middlewares/validationMiddleware.js]
    -   **Hashing de Contraseñas**:
        -   Las contraseñas se hashean utilizando `bcrypt.js` con un factor de salting de 10, lo que las hace resistentes a ataques de fuerza bruta y tablas rainbow. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/controllers/authController.js]
    -   **Gestión de Errores**:
        -   Mensajes de error genéricos (ej. "Invalid credentials") para no revelar información sobre la existencia de usuarios o la causa exacta del fallo. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/controllers/authController.js]
        -   Un manejador de errores global (`app.use((err, req, res, next) => { ... })` en `index.js`) captura errores no controlados, los registra en el servidor y envía una respuesta genérica al cliente, evitando la exposición de stack traces. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/index.js]

3.  **Capa de Datos (Interacción con PostgreSQL)**:
    -   **ORM (Prisma)**: Prisma previene automáticamente ataques de inyección SQL al parametrizar todas las consultas a la base de datos. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/controllers/authController.js]
    -   **Transacciones Atómicas**: La creación de usuarios y la conexión con su rol se realizan dentro de una única transacción de Prisma, asegurando la integridad de los datos. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/controllers/authController.js]
    -   **Upsert Robusto**: La operación `upsert` para `userProfile` garantiza que la creación o actualización de intereses sea atómica e idempotente, simplificando la lógica y previniendo condiciones de carrera. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/controllers/authController.js]

## MSTG-ARCH-4: Identificación de Información Sensible

El Auth Service maneja la siguiente información sensible:

**Clasificación:**

-   **Datos Críticos**:
    -   **Contraseñas**: Almacenadas como hashes irreversibles (`password_hash`).
    -   **JWT Secret**: La clave secreta utilizada para firmar y verificar los JWTs.
-   **Datos Sensibles**:
    -   **Email del Usuario**: Identificador único y personal.
    -   **Nombre de Usuario (Username)**: Identificador único.
    -   **Tokens JWT**: Contienen `user_id` y `role`, y son la credencial de sesión.
-   **Datos Internos**:
    -   **User ID (UUID)**: Identificador único universal del usuario.
    -   **Role ID/Name**: Identificador del rol asignado al usuario.

**Controles por Tipo de Dato:**

-   **Contraseñas**:
    -   **Hashing Irreversible**: Utilización de `bcrypt.js` para almacenar solo hashes de contraseñas, nunca las contraseñas en texto plano.
-   **JWT Secret**:
    -   **Almacenamiento Seguro**: La clave `JWT_SECRET` se almacena como una variable de entorno (`.env`), no versionada en el repositorio, y accesible solo por el servicio.
-   **Email, Username, User ID, Role**:
    -   **Encriptación en Tránsito**: Protegidos mediante TLS/SSL en todas las comunicaciones de red.
    -   **Control de Acceso**: Acceso restringido a través de autenticación JWT y autorización RBAC.
    -   **Validación y Sanitización**: Las entradas de email y username son validadas y sanitizadas para prevenir ataques.
-   **Tokens JWT**:
    -   **Expiración**: Tienen un tiempo de vida limitado (`1h`) para reducir la ventana de oportunidad en caso de compromiso.
    -   **Firma Criptográfica**: Firmados con `JWT_SECRET` para asegurar su integridad y autenticidad.
    -   **Contenido Mínimo**: Solo contienen la información esencial (`id`, `role`) para la autenticación y autorización.

## MSTG-ARCH-5: Definición de Componentes por Lógica de Negocio

El Auth Service encapsula las siguientes funciones de negocio y de seguridad:

**Funciones de Negocio:**

-   **Registro de Usuarios**: Permite a nuevos usuarios crear una cuenta en la plataforma.
-   **Inicio de Sesión**: Autentica a los usuarios existentes y les proporciona un token de sesión.
-   **Gestión de Perfiles Básica**: Permite a los usuarios autenticados ver su información de perfil.
-   **Listado de Usuarios (Admin)**: Proporciona una funcionalidad para que los administradores puedan ver una lista de todos los usuarios registrados.

**Funciones de Seguridad:**

-   **Autenticación**: Verifica la identidad de los usuarios mediante credenciales (email/contraseña) y emite JWTs.
-   **Autorización**: Controla el acceso a recursos y funcionalidades basándose en los roles de los usuarios (RBAC).
-   **Protección de Contraseñas**: Hashing seguro de contraseñas.
-   **Validación de Datos**: Asegura que los datos de entrada cumplan con las políticas de seguridad y negocio.
-   **Sanitización de Datos**: Limpia las entradas para prevenir ataques de inyección.
-   **Gestión de Sesiones**: A través de la emisión y verificación de JWTs.

## MSTG-ARCH-6: Modelado de Amenazas (STRIDE) para Auth Service

Se aplica el framework STRIDE para identificar amenazas y sus contramedidas específicas para el Auth Service.

### Spoofing (Suplantación de Identidad)

-   **Amenaza**: Un atacante se hace pasar por un usuario legítimo o por el propio Auth Service.
-   **Contramedidas**:
    -   **Hashing de Contraseñas**: Impide que un atacante que obtenga la base de datos pueda suplantar usuarios sin conocer la contraseña original.
    -   **Verificación de JWT**: El middleware `verifyToken` valida la firma del JWT, asegurando que el token no ha sido falsificado y fue emitido por el Auth Service. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/middlewares/authMiddleware.js]
    -   **Unicidad de Credenciales**: Se valida que el email y el username sean únicos durante el registro, evitando la creación de cuentas duplicadas que podrían usarse para suplantación. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/controllers/authController.js]

### Tampering (Alteración de Datos)

-   **Amenaza**: Un atacante modifica datos de usuario (ej. email, username) o el contenido de un JWT.
-   **Contramedidas**:
    -   **Validación de Entradas**: `express-validator` asegura que los datos enviados para registro o actualización de perfil cumplen con los formatos y restricciones esperados. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/middlewares/validationMiddleware.js]
    -   **Sanitización de Entradas**: `escape()` y `normalizeEmail()` eliminan caracteres maliciosos o estandarizan datos, previniendo la manipulación a través de inyección. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/middlewares/validationMiddleware.js]
    -   **Firma de JWT**: La firma criptográfica del JWT garantiza que cualquier alteración en el payload del token será detectada durante la verificación. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/middlewares/authMiddleware.js]
    -   **Transacciones de Base de Datos**: Prisma asegura la atomicidad de las operaciones, manteniendo la integridad de los datos en la base de datos. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/controllers/authController.js]

### Repudiation (Repudio)

-   **Amenaza**: Un usuario o atacante niega haber realizado una acción (ej. registro, login).
-   **Contramedidas**:
    -   **Logging Exhaustivo**: El middleware `morgan` registra todas las peticiones HTTP al servicio, incluyendo detalles como IP, método, URL y estado, proporcionando un rastro de auditoría. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/index.js]
    -   **Timestamps Inmutables**: Los campos `createdAt` en los modelos de usuario y rol registran la fecha y hora de creación, que no pueden ser alterados. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/prisma/schema.prisma]

### Information Disclosure (Divulgación de Información)

-   **Amenaza**: Exposición no autorizada de información sensible (ej. contraseñas, emails, detalles de errores).
-   **Contramedidas**:
    -   **Hashing de Contraseñas**: Las contraseñas nunca se almacenan en texto plano.
    -   **Mensajes de Error Genéricos**: Las respuestas de error al cliente son intencionadamente vagas (ej. "Invalid credentials", "Something broke!") para no revelar detalles internos del sistema o la existencia de usuarios. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/controllers/authController.js, /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/index.js]
    -   **No Exposición de Stack Traces**: Los errores internos se registran en el servidor (`console.error(err.stack)`) pero no se envían al cliente. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/index.js]
    -   **Variables de Entorno Seguras**: `JWT_SECRET` y `DATABASE_URL` se gestionan mediante `.env` y no se exponen en el código fuente ni en logs públicos.
    -   **Contenido Mínimo en JWT**: Los tokens solo incluyen `user_id` y `role`, evitando la exposición de otros datos de perfil.

### Denial of Service (Denegación de Servicio)

-   **Amenaza**: Un atacante sobrecarga el Auth Service, impidiendo que usuarios legítimos accedan.
-   **Contramedidas**:
    -   **Validación Temprana**: La validación de entradas (`express-validator`) y la verificación de unicidad de email/username se realizan al inicio del flujo de registro, minimizando el procesamiento de peticiones maliciosas. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/middlewares/validationMiddleware.js, /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/controllers/authController.js]
    -   **Eficiencia de Operaciones**: El uso de Prisma para interacciones con la base de datos y operaciones como `upsert` garantiza consultas optimizadas y reduce la carga del servidor.
    -   **Rate Limiting (Infraestructura)**: Aunque no implementado directamente en el código del Auth Service, se espera que el API Gateway o Nginx a nivel de infraestructura apliquen políticas de *rate limiting* para proteger contra ataques de fuerza bruta y DDoS.

### Elevation of Privilege (Elevación de Privilegios)

-   **Amenaza**: Un usuario con privilegios bajos obtiene acceso a funcionalidades o datos restringidos a roles superiores (ej. un `user` accede a rutas de `admin`).
-   **Contramedidas**:
    -   **Control de Acceso Basado en Roles (RBAC)**: El middleware `authorizeRole` verifica el rol del usuario (`req.userRole`) contra una lista de roles permitidos para cada ruta protegida. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/middlewares/authMiddleware.js]
    -   **Roles en JWT**: El rol del usuario se incluye en el JWT, asegurando que la información de autorización es inmutable y verificada en cada petición. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/controllers/authController.js]
    -   **Asignación de Roles Segura**: Durante el registro, los usuarios se asignan por defecto al rol 'user' mediante una conexión explícita en Prisma, evitando asignaciones de roles no intencionadas. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/controllers/authController.js]

## MSTG-ARCH-10: Seguridad en el Ciclo de Vida del Desarrollo (SDLC)

La seguridad del Auth Service se integra en el SDLC de la siguiente manera:

-   **Fase de Diseño y Desarrollo**:
    -   **Validación Estricta**: Uso de `express-validator` para definir esquemas de validación robustos para todas las entradas de la API. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/src/middlewares/validationMiddleware.js]
    -   **Principios de Mínimo Privilegio**: El diseño de roles y permisos (RBAC) asegura que los usuarios solo tengan acceso a las funcionalidades necesarias.
    -   **Uso de Librerías Seguras**: Dependencia de librerías auditadas y mantenidas por la comunidad (`bcrypt.js`, `jsonwebtoken`, `helmet`, `cors`, `prisma`).
    -   **Manejo Seguro de Secretos**: `JWT_SECRET` y credenciales de base de datos se gestionan a través de variables de entorno (`.env`).
-   **Fase de Integración Continua/Despliegue Continuo (CI/CD)**:
    -   **Análisis de Vulnerabilidades de Dependencias**: Se recomienda integrar `npm audit` o herramientas similares en el pipeline de CI/CD para escanear automáticamente las dependencias en busca de vulnerabilidades conocidas antes del despliegue.
    -   **Pruebas Automatizadas**: Inclusión de pruebas unitarias y de integración que cubran escenarios de seguridad (ej. intentos de acceso no autorizado, validación de entradas maliciosas).
-   **Fase de Despliegue y Operación**:
    -   **Infraestructura Segura**: El servicio se despliega en AWS EC2, utilizando Security Groups para controlar el tráfico de red y VPCs privadas para aislamiento.
    -   **Nginx como Proxy Inverso**: Nginx (parte de la infraestructura `aura_server`) puede configurarse para añadir una capa adicional de seguridad, incluyendo la gestión de TLS, rate limiting y la adición de cabeceras de seguridad.
    -   **Monitoreo y Logging**: `morgan` se utiliza para el logging de peticiones, lo que permite monitorear actividades sospechosas y auditar eventos. [cite: /home/luis/Documents/00INTEGRADOR/aura_server/auth-service/index.js]
    -   **Actualizaciones Regulares**: Mantener las dependencias y el entorno de ejecución (Node.js) actualizados para mitigar vulnerabilidades descubiertas.


```