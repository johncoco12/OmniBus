import { injectable } from 'tsyringe';
import { WebStorageService } from './implementations/WebStorageService';
import { IConnection } from './interfaces/IMessageBrokerService';

const CONNECTIONS_KEY = 'saved_connections';

@injectable()
export class ConnectionRepository {
  constructor(
    private storageService: WebStorageService
  ) {}

  /**
   * Get all saved connections
   */
  async getAllConnections(): Promise<IConnection[]> {
    const connections = await this.storageService.getItem<IConnection[]>(CONNECTIONS_KEY);
    return connections || [];
  }

  /**
   * Get a connection by ID
   */
  async getConnectionById(id: string): Promise<IConnection | null> {
    const connections = await this.getAllConnections();
    return connections.find((conn) => conn.id === id) || null;
  }

  /**
   * Save a new connection
   */
  async saveConnection(connection: IConnection): Promise<void> {
    const connections = await this.getAllConnections();

    // Check if connection already exists
    const existingIndex = connections.findIndex((conn) => conn.id === connection.id);

    if (existingIndex >= 0) {
      // Update existing connection
      connections[existingIndex] = connection;
    } else {
      // Add new connection
      connections.push(connection);
    }

    await this.storageService.setItem(CONNECTIONS_KEY, connections);
  }

  /**
   * Delete a connection by ID
   */
  async deleteConnection(id: string): Promise<void> {
    const connections = await this.getAllConnections();
    const filtered = connections.filter((conn) => conn.id !== id);
    await this.storageService.setItem(CONNECTIONS_KEY, filtered);
  }

  /**
   * Update a connection
   */
  async updateConnection(id: string, updates: Partial<IConnection>): Promise<void> {
    const connections = await this.getAllConnections();
    const index = connections.findIndex((conn) => conn.id === id);

    if (index === -1) {
      throw new Error(`Connection with id ${id} not found`);
    }

    connections[index] = { ...connections[index], ...updates };
    await this.storageService.setItem(CONNECTIONS_KEY, connections);
  }

  /**
   * Clear all connections
   */
  async clearAllConnections(): Promise<void> {
    await this.storageService.removeItem(CONNECTIONS_KEY);
  }

  /**
   * Check if a connection exists
   */
  async hasConnection(id: string): Promise<boolean> {
    const connection = await this.getConnectionById(id);
    return connection !== null;
  }

  /**
   * Get connections by type
   */
  async getConnectionsByType(
    type: 'rabbitmq' | 'azure-service-bus' | 'msmq' | 'activemq'
  ): Promise<IConnection[]> {
    const connections = await this.getAllConnections();
    return connections.filter((conn) => conn.type === type);
  }
}
