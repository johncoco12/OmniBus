import { injectable } from 'tsyringe';
import { Client, StompConfig, IMessage as StompMessage } from '@stomp/stompjs';
import {
  IMessageBrokerService,
  IMessage,
  IQueue,
  IConnection,
} from '../interfaces/IMessageBrokerService';

@injectable()
export class RabbitMQService implements IMessageBrokerService {
  private connection: IConnection | null = null;
  private stompClient: Client | null = null;
  private managementApiUrl: string = '';

  async connect(connection: IConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Parse connection string for STOMP WebSocket and Management API
        // Expected format: ws://username:password@hostname:15674/ws;http://username:password@hostname:15672
        const [wsUrl, managementUrl] = connection.connectionString.split(';');

        if (!wsUrl || !managementUrl) {
          throw new Error('Invalid connection string format. Expected: ws://user:pass@host:port/path;http://user:pass@host:port');
        }

        this.managementApiUrl = managementUrl.trim();

        const url = new URL(wsUrl.trim());
        const username = url.username || 'guest';
        const password = url.password || 'guest';

        console.log('Connecting to RabbitMQ WebSocket:', `${url.protocol}//${url.host}${url.pathname}`);
        console.log('Management API:', this.managementApiUrl);

        // Add timeout for connection
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout after 10 seconds'));
        }, 10000);

        const stompConfig: StompConfig = {
          brokerURL: `${url.protocol}//${url.host}${url.pathname}`,
          connectHeaders: {
            login: username,
            passcode: password,
            host: '/',
          },
          reconnectDelay: 0, // Disable auto-reconnect during initial connection
          heartbeatIncoming: 4000,
          heartbeatOutgoing: 4000,
          debug: (str) => {
            console.log('STOMP:', str);
          },
          onConnect: (frame) => {
            console.log('✓ Connected to RabbitMQ via STOMP', frame);
            clearTimeout(timeout);
            this.connection = { ...connection, isConnected: true };
            resolve();
          },
          onStompError: (frame) => {
            console.error('✗ STOMP protocol error:', frame);
            clearTimeout(timeout);
            reject(new Error(`STOMP error: ${frame.headers['message'] || 'Unknown STOMP error'}`));
          },
          onWebSocketError: (event) => {
            console.error('✗ WebSocket error:', event);
            clearTimeout(timeout);
            reject(new Error(`WebSocket connection failed. Make sure RabbitMQ Web-STOMP plugin is enabled and accessible.`));
          },
          onDisconnect: () => {
            console.log('Disconnected from RabbitMQ');
          },
        };

        this.stompClient = new Client(stompConfig);
        this.stompClient.activate();

        console.log('STOMP client activated, waiting for connection...');
      } catch (error: any) {
        console.error('✗ Connection setup error:', error);
        reject(new Error(`Failed to setup connection: ${error.message}`));
      }
    });
  }

  async disconnect(): Promise<void> {
    console.log('Disconnecting from RabbitMQ');
    if (this.stompClient) {
      await this.stompClient.deactivate();
      this.stompClient = null;
    }
    if (this.connection) {
      this.connection.isConnected = false;
    }
    this.connection = null;
  }

  async getQueues(): Promise<IQueue[]> {
    if (!this.connection || !this.managementApiUrl) {
      throw new Error('Not connected to RabbitMQ');
    }

    try {
      // Use RabbitMQ Management API to get queues
      const url = new URL(this.managementApiUrl);
      const username = url.username || 'guest';
      const password = url.password || 'guest';
      const baseUrl = `${url.protocol}//${url.host}`;

      const response = await fetch(`${baseUrl}/api/queues`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${username}:${password}`),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch queues: ${response.statusText}`);
      }

      const queues = await response.json();

      console.log('✓ Fetched queues from RabbitMQ:', queues);

      return queues.map((queue: any) => ({
        id: queue.name,
        name: queue.name,
        messageCount: queue.messages || 0,
      }));
    } catch (error) {
      console.error('✗ Error fetching queues from RabbitMQ:', error);
      console.error('Management API URL:', this.managementApiUrl);
      throw error; // Don't return mock data, throw the error so we know what failed
    }
  }

  // RabbitMQ doesn't support Topics like Azure Service Bus
  // It uses exchanges instead, so we return empty array
  async getTopics(): Promise<any[]> {
    return [];
  }

  async getMessages(queueName: string, limit: number = 100): Promise<IMessage[]> {
    if (!this.connection || !this.managementApiUrl) {
      throw new Error('Not connected to RabbitMQ');
    }

    try {
      // Use RabbitMQ Management API to get messages
      const url = new URL(this.managementApiUrl);
      const username = url.username || 'guest';
      const password = url.password || 'guest';
      const baseUrl = `${url.protocol}//${url.host}`;
      const vhost = url.searchParams.get('vhost') || '/';

      const response = await fetch(
        `${baseUrl}/api/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(queueName)}/get`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${username}:${password}`),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            count: limit,
            ackmode: 'reject_requeue_true', // Browse without consuming - messages are rejected and requeued
            encoding: 'auto',
            truncate: 50000, // Limit payload size
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.statusText}`);
      }

      const messages = await response.json();

      return messages.map((msg: any, index: number) => ({
        id: msg.properties?.message_id || `${index}`,
        sequenceNumber: `${index + 1}`,
        label: msg.properties?.type || msg.properties?.correlation_id || 'No label',
        size: msg.payload_bytes || 0,
        enqueuedTime: msg.properties?.timestamp
          ? new Date(msg.properties.timestamp).toISOString()
          : new Date().toISOString(),
        deliveryCount: msg.redelivered ? 1 : 0,
        customProperties: msg.properties?.headers || {},
        body: JSON.parse(msg.payload || '{}'),
      }));
    } catch (error) {
      console.error('Error fetching messages:', error);
      // Return empty array as fallback
      return [];
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.stompClient?.connected) {
      return; // Already connected
    }

    if (!this.connection) {
      throw new Error('No connection configuration available');
    }

    console.log('STOMP connection lost, reconnecting...');
    console.log('STOMP state:', {
      active: this.stompClient?.active,
      connected: this.stompClient?.connected,
    });

    // Deactivate existing client if active
    if (this.stompClient?.active) {
      console.log('Deactivating existing STOMP client...');
      await this.stompClient.deactivate();
    }

    // Recreate the connection
    try {
      await this.connect(this.connection);
      console.log('✓ STOMP reconnected successfully');
    } catch (error) {
      console.error('Failed to reconnect STOMP:', error);
      throw new Error('Failed to reconnect to RabbitMQ');
    }
  }

  async sendMessage(queueName: string, message: any): Promise<void> {
    console.log(`Attempting to send message to queue: ${queueName}`);
    console.log('STOMP client status:', {
      exists: !!this.stompClient,
      connected: this.stompClient?.connected,
      active: this.stompClient?.active,
    });

    // Ensure we're connected before sending
    await this.ensureConnected();

    try {
      const messageBody = JSON.stringify(message);
      console.log('Message body:', messageBody);

      this.stompClient!.publish({
        destination: `/queue/${queueName}`,
        body: messageBody,
        headers: {
          'content-type': 'application/json',
        },
      });

      console.log(`✓ Message sent to queue: ${queueName}`);
    } catch (error) {
      console.error('✗ Error sending message:', error);
      throw error;
    }
  }

  async deleteMessage(queueName: string, messageId: string): Promise<void> {
    // Workaround: Consume messages from queue until we find the one to delete
    // Then requeue all other messages
    if (!this.connection || !this.managementApiUrl) {
      throw new Error('Not connected to RabbitMQ');
    }

    // Ensure STOMP connection for republishing
    await this.ensureConnected();

    try {
      const url = new URL(this.managementApiUrl);
      const username = url.username || 'guest';
      const password = url.password || 'guest';
      const baseUrl = `${url.protocol}//${url.host}`;
      const vhost = url.searchParams.get('vhost') || '/';

      // Get all messages from the queue
      const response = await fetch(
        `${baseUrl}/api/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(queueName)}/get`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${username}:${password}`),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            count: 1000, // Get all messages (up to 1000)
            ackmode: 'ack_requeue_false', // Acknowledge without requeue
            encoding: 'auto',
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.statusText}`);
      }

      const messages = await response.json();

      console.log(`Deleting message ${messageId} from ${queueName}`);
      console.log(`Found ${messages.length} messages in queue`);

      // Republish all messages except the one to delete
      const publishPromises: Promise<void>[] = [];
      let messageFound = false;

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const msgId = msg.properties?.message_id || `${i}`;

        if (msgId === messageId) {
          console.log(`✗ Deleting message ${msgId}`);
          messageFound = true;
        } else {
          // Republish message back to queue
          if (this.stompClient?.connected) {
            console.log(`↻ Requeuing message ${msgId}`);

            const publishPromise = new Promise<void>((resolve) => {
              // Filter out headers that should not be copied (STOMP will set these)
              const filteredHeaders = msg.properties?.headers ?
                Object.entries(msg.properties.headers).reduce((acc, [key, value]) => {
                  const lowerKey = key.toLowerCase();
                  if (!['content-length', 'content-type', 'message-id'].includes(lowerKey)) {
                    acc[key] = value;
                  }
                  return acc;
                }, {} as Record<string, any>) : {};

              const headers: Record<string, string> = {
                ...filteredHeaders,
                'content-type': msg.properties?.content_type || 'application/json',
              };

              // Only add message-id if it exists
              if (msg.properties?.message_id) {
                headers['message-id'] = msg.properties.message_id;
              }

              this.stompClient!.publish({
                destination: `/queue/${queueName}`,
                body: msg.payload,
                headers: headers,
              });
              // Small delay to ensure message is sent
              setTimeout(() => resolve(), 100);
            });

            publishPromises.push(publishPromise);
          }
        }
      }

      if (!messageFound) {
        throw new Error(`Message ${messageId} not found in queue ${queueName}`);
      }

      // Wait for all publishes to complete
      await Promise.all(publishPromises);
      console.log(`✓ ${publishPromises.length} messages requeued`);
      console.log(`✓ Message ${messageId} deleted from queue ${queueName}`);
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }

  async moveMessage(
    sourceQueue: string,
    targetQueue: string,
    messageId: string
  ): Promise<void> {
    // Workaround: Consume messages from source queue until we find the one to move
    // Then publish it to target queue and requeue all other messages
    if (!this.connection || !this.managementApiUrl) {
      throw new Error('Not connected to RabbitMQ');
    }

    // Ensure STOMP connection for moving
    await this.ensureConnected();

    try {
      const url = new URL(this.managementApiUrl);
      const username = url.username || 'guest';
      const password = url.password || 'guest';
      const baseUrl = `${url.protocol}//${url.host}`;
      const vhost = url.searchParams.get('vhost') || '/';

      // Get all messages from the source queue
      const response = await fetch(
        `${baseUrl}/api/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(sourceQueue)}/get`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${username}:${password}`),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            count: 1000, // Get all messages (up to 1000)
            ackmode: 'ack_requeue_false', // Acknowledge without requeue - consume messages
            encoding: 'auto',
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.statusText}`);
      }

      const messages = await response.json();
      let messageMoved = false;

      console.log(`Moving message ${messageId} from ${sourceQueue} to ${targetQueue}`);
      console.log(`Found ${messages.length} messages in source queue`);

      // Process all messages
      const publishPromises: Promise<void>[] = [];

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const msgId = msg.properties?.message_id || `${i}`;

        console.log(`Processing message ${i}: ID=${msgId}, match=${msgId === messageId}`);

        if (msgId === messageId) {
          // Move this message to target queue
          if (this.stompClient?.connected) {
            console.log(`✓ Moving message to ${targetQueue}`);

            const publishPromise = new Promise<void>((resolve) => {
              // Filter out headers that should not be copied (STOMP will set these)
              const filteredHeaders = msg.properties?.headers ?
                Object.entries(msg.properties.headers).reduce((acc, [key, value]) => {
                  const lowerKey = key.toLowerCase();
                  if (!['content-length', 'content-type', 'message-id', 'receipt'].includes(lowerKey)) {
                    acc[key] = value;
                  }
                  return acc;
                }, {} as Record<string, any>) : {};

              const headers: Record<string, string> = {
                ...filteredHeaders,
                'content-type': msg.properties?.content_type || 'application/json',
              };

              // Only add message-id if it exists
              if (msg.properties?.message_id) {
                headers['message-id'] = msg.properties.message_id;
              }

              this.stompClient!.publish({
                destination: `/queue/${targetQueue}`,
                body: msg.payload,
                headers: headers,
              });

              // Wait to ensure message is sent
              setTimeout(() => resolve(), 200);
            });

            publishPromises.push(publishPromise);
            messageMoved = true;
          } else {
            throw new Error('STOMP client not connected');
          }
        } else {
          // Republish message back to source queue
          if (this.stompClient?.connected) {
            console.log(`↻ Requeuing message ${msgId} to ${sourceQueue}`);

            const publishPromise = new Promise<void>((resolve) => {
              // Filter out headers that should not be copied (STOMP will set these)
              const filteredHeaders = msg.properties?.headers ?
                Object.entries(msg.properties.headers).reduce((acc, [key, value]) => {
                  const lowerKey = key.toLowerCase();
                  if (!['content-length', 'content-type', 'message-id', 'receipt'].includes(lowerKey)) {
                    acc[key] = value;
                  }
                  return acc;
                }, {} as Record<string, any>) : {};

              const headers: Record<string, string> = {
                ...filteredHeaders,
                'content-type': msg.properties?.content_type || 'application/json',
              };

              // Only add message-id if it exists
              if (msg.properties?.message_id) {
                headers['message-id'] = msg.properties.message_id;
              }

              this.stompClient!.publish({
                destination: `/queue/${sourceQueue}`,
                body: msg.payload,
                headers: headers,
              });

              // Wait to ensure message is sent
              setTimeout(() => resolve(), 200);
            });

            publishPromises.push(publishPromise);
          }
        }
      }

      if (!messageMoved) {
        throw new Error(`Message ${messageId} not found in queue ${sourceQueue}`);
      }

      // Wait for all publishes to complete
      await Promise.all(publishPromises);

      // Add extra delay to ensure all messages are fully sent
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log(`✓ All messages processed. ${publishPromises.length} messages republished.`);
      console.log(`✓ Message ${messageId} moved from ${sourceQueue} to ${targetQueue}`);
    } catch (error) {
      console.error('✗ Error moving message:', error);
      throw error;
    }
  }

  getConnection(): IConnection | null {
    return this.connection;
  }
}
