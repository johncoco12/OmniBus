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
  private username : string = '';
  private password : string = '';

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
        this.username = url.username || 'guest';
        this.password = url.password || 'guest';

        console.log('Connecting to RabbitMQ WebSocket:', `${url.protocol}//${url.host}${url.pathname}`);
        console.log('Management API:', this.managementApiUrl);

        // Add timeout for connection
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout after 10 seconds'));
        }, 10000);

        const stompConfig: StompConfig = {
          brokerURL: `${url.protocol}//${url.host}${url.pathname}`,
          connectHeaders: {
            login: this.username,
            passcode: this.password,
            host: '/',
          },
          reconnectDelay: 0, // Disable auto-reconnect during initial connection
          heartbeatIncoming: 4000,
          heartbeatOutgoing: 4000,
          debug: (str) => {
            console.log('STOMP:', str);
          },
          onConnect: (frame) => {
            console.log('Connected to RabbitMQ via STOMP', frame);
            clearTimeout(timeout);
            this.connection = { ...connection, isConnected: true };
            resolve();
          },
          onStompError: (frame) => {
            console.error('STOMP protocol error:', frame);
            clearTimeout(timeout);
            reject(new Error(`STOMP error: ${frame.headers['message'] || 'Unknown STOMP error'}`));
          },
          onWebSocketError: (event) => {
            console.error('WebSocket error:', event);
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
        console.error('Connection setup error:', error);
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
      const baseUrl = `${url.protocol}//${url.host}`;

      const response = await fetch(`${baseUrl}/api/queues`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${this.username}:${this.password}`),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch queues: ${response.statusText}`);
      }

      const queues = await response.json();

      console.log('Fetched queues from RabbitMQ:', queues);

      return queues.map((queue: any) => ({
        id: queue.name,
        name: queue.name,
        messageCount: queue.messages || 0,
      }));
    } catch (error) {
      console.error('Error fetching queues from RabbitMQ:', error);
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
      const baseUrl = `${url.protocol}//${url.host}`;
      const vhost = url.searchParams.get('vhost') || '/';

      const response = await fetch(
        `${baseUrl}/api/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(queueName)}/get`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${this.username}:${this.password}`),
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
      console.log('STOMP reconnected successfully');
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

      console.log(`Message sent to queue: ${queueName}`);
    } catch (error) {
      console.error('Error sending message:', error);
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
      const baseUrl = `${url.protocol}//${url.host}`;
      const vhost = url.searchParams.get('vhost') || '/';

      // Get all messages from the queue
      const response = await fetch(
        `${baseUrl}/api/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(queueName)}/get`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${this.username}:${this.password}`),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            count: 1000,
            ackmode: 'ack_requeue_false', // Ac0
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
          console.log(`Deleting message ${msgId}`);
          messageFound = true;
        } else {
          // Republish message back to queue
          if (this.stompClient?.connected) {
            console.log(`Requeuing message ${msgId}`);

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
      console.log(`${publishPromises.length} messages requeued`);
      console.log(`Message ${messageId} deleted from queue ${queueName}`);
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }

  async bulkDeleteMessages(queueName: string, messageIds: string[]): Promise<{ successCount: number; failCount: number }> {
    if (!this.connection || !this.managementApiUrl) {
      throw new Error('Not connected to RabbitMQ');
    }

    if (messageIds.length === 0) {
      return { successCount: 0, failCount: 0 };
    }

    // If messageIds > 1000, chunk them and process in batches
    if (messageIds.length > 1000) {
      const chunks = this.chunkArray(messageIds, 1000);
      console.log(`Bulk delete: Processing ${messageIds.length} messages in ${chunks.length} chunks of max 1000`);
      
      let totalSuccessCount = 0;
      let totalFailCount = 0;
      const failedChunks: { chunkIndex: number; messageIds: string[]; error: any }[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`Processing chunk ${i + 1}/${chunks.length} with ${chunk.length} messages`);
        
        try {
          const result = await this.retryChunkOperation(
            () => this.bulkDeleteMessages(queueName, chunk),
            i + 1
          );
          totalSuccessCount += result.successCount;
          totalFailCount += result.failCount;
          
          // Small delay between chunks to avoid overwhelming the broker
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.error(`Chunk ${i + 1} failed after all retries:`, error);
          failedChunks.push({ chunkIndex: i + 1, messageIds: chunk, error });
          totalFailCount += chunk.length; // These messages remain in queue (not lost)
        }
      }

      // Report failed chunks for potential retry
      if (failedChunks.length > 0) {
        console.warn(`${failedChunks.length} chunks failed completely. Messages remain in queue:`);
        failedChunks.forEach(fc => {
          console.warn(`  - Chunk ${fc.chunkIndex}: ${fc.messageIds.length} messages (${fc.messageIds.slice(0, 3).join(', ')}${fc.messageIds.length > 3 ? '...' : ''})`);
        });
        console.warn(`   Failed message IDs are not lost - they remain in the source queue.`);
      }

      console.log(`Chunked bulk delete complete: ${totalSuccessCount} deleted, ${totalFailCount} failed/remaining`);
      return { successCount: totalSuccessCount, failCount: totalFailCount };
    }

    // Ensure STOMP connection for republishing
    await this.ensureConnected();

    try {
      const url = new URL(this.managementApiUrl);
      const baseUrl = `${url.protocol}//${url.host}`;
      const vhost = url.searchParams.get('vhost') || '/';

      // Get all messages from the queue in one go
      const response = await fetch(
        `${baseUrl}/api/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(queueName)}/get`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${this.username}:${this.password}`),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            count: 1000,
            ackmode: 'ack_requeue_false',
            encoding: 'auto',
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.statusText}`);
      }

      const messages = await response.json();
      const messageIdSet = new Set(messageIds);

      console.log(`Bulk deleting ${messageIds.length} messages from ${queueName}`);
      console.log(`Found ${messages.length} messages in queue`);

      // Republish all messages except the ones to delete
      const publishPromises: Promise<void>[] = [];
      let successCount = 0;

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const msgId = msg.properties?.message_id || `${i}`;

        if (messageIdSet.has(msgId)) {
          console.log(`Deleting message ${msgId}`);
          successCount++;
        } else {
          // Republish message back to queue
          if (this.stompClient?.connected) {
            const publishPromise = new Promise<void>((resolve) => {
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

              if (msg.properties?.message_id) {
                headers['message-id'] = msg.properties.message_id;
              }

              this.stompClient!.publish({
                destination: `/queue/${queueName}`,
                body: msg.payload,
                headers: headers,
              });
              setTimeout(() => resolve(), 100);
            });

            publishPromises.push(publishPromise);
          }
        }
      }

      // Wait for all publishes to complete
      await Promise.all(publishPromises);

      const failCount = messageIds.length - successCount;
      console.log(`${publishPromises.length} messages requeued`);
      console.log(`Deleted ${successCount} messages, ${failCount} not found`);

      return { successCount, failCount };
    } catch (error) {
      console.error('Error bulk deleting messages:', error);
      throw error;
    }
  }

  async purgeQueue(queueName: string): Promise<{ successCount: number }> {
    if (!this.connection || !this.managementApiUrl) {
      throw new Error('Not connected to RabbitMQ');
    }

    try {
      console.log(`Purging all messages from queue: ${queueName}`);
      
      // Extract credentials from management API URL
      const url = new URL(this.managementApiUrl);
      const username = url.username || 'guest';
      const password = url.password || 'guest';
      const baseUrl = `${url.protocol}//${url.host}`;

      // First get the current message count
      const queueInfoResponse = await fetch(`${baseUrl}/api/queues/%2F/${encodeURIComponent(queueName)}`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${username}:${password}`),
        },
      });

      let messageCount = 0;
      if (queueInfoResponse.ok) {
        const queueInfo = await queueInfoResponse.json();
        messageCount = queueInfo.messages || 0;
      }

      // Purge the queue
      const response = await fetch(`${baseUrl}/api/queues/%2F/${encodeURIComponent(queueName)}/contents`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`${username}:${password}`),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to purge queue: ${response.status} ${response.statusText}`);
      }

      console.log(`Queue ${queueName} purged successfully - removed ${messageCount} messages`);
      return { successCount: messageCount };
    } catch (error) {
      console.error('Error purging queue:', error);
      throw error;
    }
  }

  async bulkMoveMessages(sourceQueue: string, targetQueue: string, messageIds: string[]): Promise<{ successCount: number; failCount: number }> {
    if (!this.connection || !this.managementApiUrl) {
      throw new Error('Not connected to RabbitMQ');
    }

    if (messageIds.length === 0) {
      return { successCount: 0, failCount: 0 };
    }

    // If messageIds > 1000, chunk them and process in batches
    if (messageIds.length > 1000) {
      const chunks = this.chunkArray(messageIds, 1000);
      console.log(`Bulk move: Processing ${messageIds.length} messages in ${chunks.length} chunks of max 1000`);
      
      let totalSuccessCount = 0;
      let totalFailCount = 0;
      const failedChunks: { chunkIndex: number; messageIds: string[]; error: any }[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`Processing chunk ${i + 1}/${chunks.length} with ${chunk.length} messages`);
        
        try {
          const result = await this.retryChunkOperation(
            () => this.bulkMoveMessages(sourceQueue, targetQueue, chunk),
            i + 1
          );
          totalSuccessCount += result.successCount;
          totalFailCount += result.failCount;
          
          // Small delay between chunks to avoid overwhelming the broker
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.error(`Chunk ${i + 1} failed after all retries:`, error);
          failedChunks.push({ chunkIndex: i + 1, messageIds: chunk, error });
          totalFailCount += chunk.length; // These messages remain in source queue (not lost)
        }
      }

      // Report failed chunks for potential retry
      if (failedChunks.length > 0) {
        console.warn(`${failedChunks.length} chunks failed completely. Messages remain in source queue:`);
        failedChunks.forEach(fc => {
          console.warn(`  - Chunk ${fc.chunkIndex}: ${fc.messageIds.length} messages (${fc.messageIds.slice(0, 3).join(', ')}${fc.messageIds.length > 3 ? '...' : ''})`);
        });
        console.warn(`   Failed message IDs are not lost - they remain in ${sourceQueue}.`);
      }

      console.log(`Chunked bulk move complete: ${totalSuccessCount} moved from ${sourceQueue} to ${targetQueue}, ${totalFailCount} failed/remaining`);
      return { successCount: totalSuccessCount, failCount: totalFailCount };
    }

    // Ensure STOMP connection
    await this.ensureConnected();

    try {
      const url = new URL(this.managementApiUrl);
      const baseUrl = `${url.protocol}//${url.host}`;
      const vhost = url.searchParams.get('vhost') || '/';

      // Get all messages from source queue
      const response = await fetch(
        `${baseUrl}/api/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(sourceQueue)}/get`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${this.username}:${this.password}`),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            count: 1000,
            ackmode: 'ack_requeue_false',
            encoding: 'auto',
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.statusText}`);
      }

      const messages = await response.json();
      const messageIdSet = new Set(messageIds);

      console.log(`Bulk moving ${messageIds.length} messages from ${sourceQueue} to ${targetQueue}`);
      console.log(`Found ${messages.length} messages in source queue`);

      const requeuePromises: Promise<void>[] = [];
      const movePromises: Promise<void>[] = [];
      let successCount = 0;

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const msgId = msg.properties?.message_id || `${i}`;

        if (messageIdSet.has(msgId)) {
          // Move this message to target queue
          console.log(`Moving message ${msgId} to ${targetQueue}`);
          successCount++;

          if (this.stompClient?.connected) {
            const movePromise = new Promise<void>((resolve) => {
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

              if (msg.properties?.message_id) {
                headers['message-id'] = msg.properties.message_id;
              }

              this.stompClient!.publish({
                destination: `/queue/${targetQueue}`,
                body: msg.payload,
                headers: headers,
              });
              setTimeout(() => resolve(), 100);
            });

            movePromises.push(movePromise);
          }
        } else {
          // Requeue this message back to source queue
          if (this.stompClient?.connected) {
            const requeuePromise = new Promise<void>((resolve) => {
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

              if (msg.properties?.message_id) {
                headers['message-id'] = msg.properties.message_id;
              }

              this.stompClient!.publish({
                destination: `/queue/${sourceQueue}`,
                body: msg.payload,
                headers: headers,
              });
              setTimeout(() => resolve(), 100);
            });

            requeuePromises.push(requeuePromise);
          }
        }
      }

      // Wait for all operations to complete
      await Promise.all([...requeuePromises, ...movePromises]);

      const failCount = messageIds.length - successCount;
      console.log(`${requeuePromises.length} messages requeued to ${sourceQueue}`);
      console.log(`${movePromises.length} messages moved to ${targetQueue}`);
      console.log(`Moved ${successCount} messages, ${failCount} not found`);

      return { successCount, failCount };
    } catch (error) {
      console.error('Error bulk moving messages:', error);
      throw error;
    }
  }

  async importMessages(queueName: string, messages: any[]): Promise<{ successCount: number; failCount: number }> {
    if (!this.connection) {
      throw new Error('Not connected to RabbitMQ');
    }

    if (messages.length === 0) {
      return { successCount: 0, failCount: 0 };
    }

    // Ensure STOMP connection
    await this.ensureConnected();

    try {
      console.log(`Importing ${messages.length} messages to ${queueName}`);

      const sendPromises: Promise<void>[] = [];
      let successCount = 0;

      for (const message of messages) {
        try {
          const promise = new Promise<void>((resolve, reject) => {
            if (!this.stompClient?.connected) {
              reject(new Error('STOMP client not connected'));
              return;
            }

            this.stompClient.publish({
              destination: `/queue/${queueName}`,
              body: JSON.stringify(message),
              headers: {
                'content-type': 'application/json',
              },
            });

            successCount++;
            setTimeout(() => resolve(), 50);
          });

          sendPromises.push(promise);
        } catch (error) {
          console.error('Failed to import message:', error);
        }
      }

      await Promise.all(sendPromises);

      const failCount = messages.length - successCount;
      console.log(`Imported ${successCount} messages, ${failCount} failed`);

      return { successCount, failCount };
    } catch (error) {
      console.error('Error importing messages:', error);
      throw error;
    }
  }

  async exportMessages(queueName: string, messageIds: string[]): Promise<any[]> {
    if (!this.connection || !this.managementApiUrl) {
      throw new Error('Not connected to RabbitMQ');
    }

    if (messageIds.length === 0) {
      return [];
    }

    try {
      // Fetch current messages from queue
      const allMessages = await this.getMessages(queueName);

      // Filter by message IDs
      const messageIdSet = new Set(messageIds);
      const exportedMessages = allMessages
        .filter(msg => messageIdSet.has(msg.id))
        .map(msg => msg.body);

      console.log(`Exported ${exportedMessages.length} messages from ${queueName}`);

      return exportedMessages;
    } catch (error) {
      console.error('Error exporting messages:', error);
      throw error;
    }
  }

  private generateInternalId(msg: any, index: number): string {
    // Prefer RabbitMQ message_id, fallback to hash of payload and index
    const base = msg.properties?.message_id || '';
    const payload = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload);
    let hash = 0;
    for (let i = 0; i < payload.length; i++) {
      hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
    }
    return `${base}#${hash.toString(16)}:${index}`;
  }

  private chunkArray<T>(array: T[], chunkSize: number = 1000): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async retryChunkOperation<T>(
    operation: () => Promise<T>,
    chunkIndex: number,
    maxRetries: number = 2,
    baseDelayMs: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          console.log(`Retrying chunk ${chunkIndex}, attempt ${attempt + 1}/${maxRetries + 1} after ${delay}ms delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(`Chunk ${chunkIndex} attempt ${attempt + 1} failed:`, error);
        
        if (attempt === maxRetries) {
          throw lastError;
        }
      }
    }
    
    throw lastError;
  }

  private filterRepublishHeaders(headers?: Record<string, any>): Record<string, string> {
    if (!headers) return {};
    const disallowed = new Set(['content-length','content-type','message-id','receipt','subscription','destination']);
    const result: Record<string,string> = {};
    Object.entries(headers).forEach(([k,v]) => {
      const lk = k.toLowerCase();
      if (!disallowed.has(lk) && v != null) {
        result[k] = String(v);
      }
    });
    return result;
  }

  private async publishWithReceipt(destination: string, body: string, headers: Record<string,string>, timeoutMs = 5000, retries = 2): Promise<void> {
    if (!this.stompClient?.connected) throw new Error('STOMP client not connected');

    for (let attempt = 0; attempt <= retries; attempt++) {
      const receiptId = `rcpt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const publishHeaders = { ...headers, receipt: receiptId };

      const result = await new Promise<{ ok: boolean; error?: any }>((resolve) => {
        const timer = setTimeout(() => resolve({ ok: false, error: new Error('Receipt timeout') }), timeoutMs);
        try {
          this.stompClient!.watchForReceipt(receiptId, () => {
            clearTimeout(timer);
            resolve({ ok: true });
          });
          this.stompClient!.publish({ destination, body, headers: publishHeaders });
        } catch (err) {
          clearTimeout(timer);
          resolve({ ok: false, error: err });
        }
      });

      if (result.ok) return; // success
      console.warn(`Publish attempt ${attempt + 1} failed for ${destination}:`, result.error);
      if (attempt === retries) throw result.error || new Error('Failed to publish');
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }


  async moveMessage(
    sourceQueue: string,
    targetQueue: string,
    messageId: string
  ): Promise<void> {
    if (!this.connection || !this.managementApiUrl) {
      throw new Error('Not connected to RabbitMQ');
    }
    await this.ensureConnected();

    const url = new URL(this.managementApiUrl);
    const baseUrl = `${url.protocol}//${url.host}`;
    const vhost = url.searchParams.get('vhost') || '/';

    // Fetch messages (consume) from source queue
    const response = await fetch(
      `${baseUrl}/api/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(sourceQueue)}/get`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${this.username}:${this.password}`),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          count: 1000,
          ackmode: 'ack_requeue_false', // consume
          encoding: 'auto',
        }),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch messages: ${response.statusText}`);
    }
    const rawMessages = await response.json();

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      throw new Error('No messages available in source queue');
    }

    // Build internal records with safe IDs
    interface TempMsg { raw: any; internalId: string; originalId: string; isTarget: boolean; }
    const tempMessages: TempMsg[] = rawMessages.map((m: any, idx: number) => {
      const originalId = m.properties?.message_id || `${idx}`;
      return {
        raw: m,
        originalId,
        internalId: this.generateInternalId(m, idx),
        isTarget: originalId === messageId,
      };
    });

    const targets = tempMessages.filter(m => m.isTarget);
    if (targets.length === 0) {
      throw new Error(`Message ${messageId} not found in queue ${sourceQueue}`);
    }
    if (targets.length > 1) {
      console.warn(`Multiple messages (${targets.length}) share message_id='${messageId}'. Moving the first occurrence only.`);
    }
    const target = targets[0];

    // Republish non-target messages back to source with confirmation
    const nonTargets = tempMessages.filter(m => !m.isTarget);
    console.log(`Requeueing ${nonTargets.length} messages back to ${sourceQueue}`);

    for (const m of nonTargets) {
      const filtered = this.filterRepublishHeaders(m.raw.properties?.headers);
      const headers: Record<string,string> = {
        ...filtered,
        'content-type': m.raw.properties?.content_type || 'application/json',
      };
      if (m.raw.properties?.message_id) {
        headers['message-id'] = m.raw.properties.message_id;
      }
      try {
        await this.publishWithReceipt(`/queue/${sourceQueue}`, m.raw.payload, headers);
      } catch (err) {
        console.error('Failed to requeue message, aborting to prevent loss. Partial state may exist.', err);
        throw err;
      }
    }

    // Publish target message to destination with confirmation
    console.log(`Publishing target message ${target.originalId} to ${targetQueue}`);
    const tFiltered = this.filterRepublishHeaders(target.raw.properties?.headers);
    const tHeaders: Record<string,string> = {
      ...tFiltered,
      'content-type': target.raw.properties?.content_type || 'application/json',
    };
    if (target.raw.properties?.message_id) {
      tHeaders['message-id'] = target.raw.properties.message_id;
    }

    await this.publishWithReceipt(`/queue/${targetQueue}`, target.raw.payload, tHeaders);

    console.log(`Move complete: ${target.originalId} from ${sourceQueue} to ${targetQueue}`);
  }

  getConnection(): IConnection | null {
    return this.connection;
  }
}
