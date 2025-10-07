import { injectable, inject } from 'tsyringe';
import { IMessageBrokerService, IConnection } from './interfaces/IMessageBrokerService';
import { RabbitMQService } from './implementations/RabbitMQService';
import { AzureServiceBusService } from './implementations/AzureServiceBusService';

@injectable()
export class ServiceBusManager {
  private services: Map<string, IMessageBrokerService> = new Map();

  constructor() {}

  /**
   * Create and register a new broker service
   */
  async addConnection(connection: IConnection): Promise<void> {
    let service: IMessageBrokerService;

    switch (connection.type) {
      case 'rabbitmq':
        service = new RabbitMQService();
        break;
      case 'azure-service-bus':
        service = new AzureServiceBusService();
        break;
      case 'msmq':
        // TODO: Implement MSMQ service
        throw new Error('MSMQ not yet implemented');
      case 'activemq':
        // TODO: Implement ActiveMQ service
        throw new Error('ActiveMQ not yet implemented');
      default:
        throw new Error(`Unsupported broker type: ${connection.type}`);
    }

    await service.connect(connection);
    this.services.set(connection.id, service);
  }

  /**
   * Remove a connection
   */
  async removeConnection(connectionId: string): Promise<void> {
    const service = this.services.get(connectionId);
    if (service) {
      await service.disconnect();
      this.services.delete(connectionId);
    }
  }

  /**
   * Get a specific broker service
   */
  getService(connectionId: string): IMessageBrokerService | undefined {
    return this.services.get(connectionId);
  }

  /**
   * Get all active connections
   */
  getAllConnections(): IConnection[] {
    return Array.from(this.services.values())
      .map((service) => service.getConnection())
      .filter((conn): conn is IConnection => conn !== null);
  }

  /**
   * Check if a connection exists
   */
  hasConnection(connectionId: string): boolean {
    return this.services.has(connectionId);
  }
}
