const amqp = require('amqplib');

const RABBIT_URL = process.env.RABBITMQ_URL;
const EXCHANGE_NAME = 'domain_events';

class RabbitMQPublisher {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.isConnecting = false;
  }


  async connect() {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.connection = await amqp.connect(RABBIT_URL);

      this.connection.on('close', (err) => {
        console.error('❌ RabbitMQ conexión cerrada. Reintentando...');
        if (!err || err.code !== 320) { // No reconectar si es un cierre intencional
          this.reconnect();
        }
      });

      this.connection.on('error', (err) => {
        console.error('⚠️ Error en conexión RabbitMQ:', err);
      });

      this.channel = await this.connection.createConfirmChannel();

      await this.channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

      console.log('✅ Publisher conectado a RabbitMQ con ConfirmChannel');
      this.isConnecting = false;
    } catch (error) {
      console.error('❌ Error conectando a RabbitMQ Publisher:', error);
      this.isConnecting = false;
      setTimeout(() => this.reconnect(), 3000);
    }
  }

  reconnect() {
    this.connection = null;
    this.channel = null;
    setTimeout(() => this.connect(), 3000);
  }

  /**
   * Publica un evento garantizando que RabbitMQ lo recibió.
   * @param {string} routingKey La clave de enrutamiento para el evento.
   * @param {Record<string, any>} event El objeto del evento a publicar.
   * @returns {Promise<boolean>} `true` si el evento fue publicado y confirmado, `false` en caso contrario.
   */
  async publish(routingKey, event) {
    if (!this.channel) {
      console.error('❌ Canal no inicializado, llamando automáticamente a connect()');
      await this.connect();
      if (!this.channel) {
        console.error('❌ No se pudo establecer el canal de RabbitMQ después de reintentar.');
        return false;
      }
    }

    return new Promise((resolve) => {
      const messageBuffer = Buffer.from(JSON.stringify(event));

      this.channel.publish(
        EXCHANGE_NAME,
        routingKey,
        messageBuffer,
        { persistent: true },
        (err) => {
          if (err) {
            console.error(`❌ Error publicando evento [${routingKey}]:`, err);
            resolve(false);
          } else {
            // La confirmación no significa que se haya enrutado, solo que el broker lo recibió.
            resolve(true);
          }
        }
      );
      console.log(`📤 Evento enviado: [${routingKey}]`);
    });
  }

  async close() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
      console.log('🔌 Publisher RabbitMQ cerrado limpiamente');
    } catch (error) {
      console.error('⚠️ Error cerrando publisher RabbitMQ:', error);
    }
  }
}

module.exports = { RabbitMQPublisher };
