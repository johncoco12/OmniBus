import { ServiceBusClient, ServiceBusReceiver, ServiceBusMessage, ServiceBusReceivedMessage } from '@azure/service-bus';
import { IMessageBrokerService, IConnection, IQueue, IMessage, ITopic, ISubscription } from '../interfaces/IMessageBrokerService';

export class AzureServiceBusService implements IMessageBrokerService {
  private client: ServiceBusClient | null = null;
  private connection: IConnection | null = null;
  private receivers: Map<string, ServiceBusReceiver> = new Map();
  private managementEndpoint: string | null = null;

  async connect(connection: IConnection): Promise<void> {
    try {
      console.log('Connecting to Azure Service Bus:', connection.name);

      // Azure Service Bus connection string format:
      // Endpoint=sb://<namespace>.servicebus.windows.net/;SharedAccessKeyName=<keyname>;SharedAccessKey=<key>
      this.client = new ServiceBusClient(connection.connectionString);
      this.connection = connection;

      // Parse connection string to get management endpoint
      const endpointMatch = connection.connectionString.match(/Endpoint=sb:\/\/([^;]+)/);
      if (endpointMatch) {
        this.managementEndpoint = `http://${endpointMatch[1]}:10749`;
      }

      console.log('Connected to Azure Service Bus');
    } catch (error: any) {
      console.error('Failed to connect to Azure Service Bus:', error);
      throw new Error(`Azure Service Bus connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      // Close all receivers
      for (const [queueName, receiver] of this.receivers.entries()) {
        await receiver.close();
        console.log(`Closed receiver for queue: ${queueName}`);
      }
      this.receivers.clear();

      // Close client
      if (this.client) {
        await this.client.close();
        console.log('Disconnected from Azure Service Bus');
      }

      this.client = null;
      this.connection = null;
    } catch (error) {
      console.error('Error disconnecting from Azure Service Bus:', error);
    }
  }

  async getQueues(): Promise<IQueue[]> {
    if (!this.client) {
      throw new Error('Not connected to Azure Service Bus');
    }

    try {
      // For the emulator, try the management endpoint
      if (this.managementEndpoint) {
        try {
          const response = await fetch(`${this.managementEndpoint}/$Resources/queues`, {
            headers: {
              'Accept': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json();

            // The emulator returns queue list in a specific format
            const queues: IQueue[] = [];
            if (Array.isArray(data)) {
              for (const queueName of data) {
                // Try to get message count
                let messageCount = 0;
                try {
                  const receiver = this.client!.createReceiver(queueName, { receiveMode: 'peekLock' });
                  const peeked = await receiver.peekMessages(1);
                  await receiver.close();

                  // We can't get exact count easily, so we peek to check if there are messages
                  messageCount = peeked.length > 0 ? 1 : 0; // Simplified - shows if queue has messages
                } catch (err) {
                  // Ignore errors getting count
                }

                queues.push({
                  id: queueName,
                  name: queueName,
                  messageCount: messageCount,
                });
              }
            }

            console.log(`Found ${queues.length} queues in Azure Service Bus`);
            return queues;
          }
        } catch (fetchError) {
          console.warn('Management API not available, will try to discover queues');
        }
      }

      // Fallback: Try known queue names from config
      // This is a workaround since Azure doesn't support listing queues with just connection string
      const knownQueues = ['test-queue', 'orders', 'billing', 'invoices'];
      const queues: IQueue[] = [];

      for (const queueName of knownQueues) {
        try {
          const receiver = this.client.createReceiver(queueName, { receiveMode: 'peekLock' });
          const peeked = await receiver.peekMessages(1);
          await receiver.close();

          queues.push({
            id: queueName,
            name: queueName,
            messageCount: peeked.length > 0 ? 1 : 0,
          });
        } catch (error) {
          // Queue doesn't exist or can't access it, skip
          console.log(`Queue ${queueName} not accessible`);
        }
      }

      console.log(`Found ${queues.length} accessible queues`);
      return queues;
    } catch (error: any) {
      console.error('Failed to get queues from Azure Service Bus:', error);
      throw new Error(`Failed to get queues: ${error.message}`);
    }
  }

  async getMessages(queueName: string, limit: number = 100): Promise<IMessage[]> {
    if (!this.client) {
      throw new Error('Not connected to Azure Service Bus');
    }

    try {
      // Get or create receiver in peek mode
      let receiver = this.receivers.get(queueName);
      if (!receiver) {
        receiver = this.client.createReceiver(queueName, {
          receiveMode: 'peekLock', // Use peekLock to view without removing
        });
        this.receivers.set(queueName, receiver);
      }

      // Peek messages without removing them
      const messages = await receiver.peekMessages(limit);

      return messages.map((msg) => ({
        id: msg.messageId?.toString() || msg.sequenceNumber?.toString() || '',
        sequenceNumber: msg.sequenceNumber?.toString() || '',
        label: msg.subject || msg.messageId?.toString() || '',
        size: msg.body ? JSON.stringify(msg.body).length : 0,
        enqueuedTime: msg.enqueuedTimeUtc?.toISOString() || new Date().toISOString(),
        deliveryCount: msg.deliveryCount || 0,
        customProperties: msg.applicationProperties,
        body: msg.body,
      }));
    } catch (error: any) {
      console.error(`Failed to get messages from queue ${queueName}:`, error);
      throw new Error(`Failed to get messages: ${error.message}`);
    }
  }

  async sendMessage(queueName: string, message: any): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to Azure Service Bus');
    }

    try {
      const sender = this.client.createSender(queueName);

      await sender.sendMessages({
        body: message,
        contentType: 'application/json',
      });

      await sender.close();
      console.log(`Message sent to queue: ${queueName}`);
    } catch (error: any) {
      console.error(`Failed to send message to queue ${queueName}:`, error);
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  async deleteMessage(queueName: string, messageId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to Azure Service Bus');
    }

    try {
      // Create receiver to get and delete the message
      const receiver = this.client.createReceiver(queueName, {
        receiveMode: 'peekLock',
      });

      // Receive messages to find the one with matching ID
      const messages = await receiver.receiveMessages(100, { maxWaitTimeInMs: 5000 });

      for (const msg of messages) {
        if (msg.messageId?.toString() === messageId || msg.sequenceNumber?.toString() === messageId) {
          await receiver.completeMessage(msg);
          console.log(`Deleted message ${messageId} from queue ${queueName}`);
          await receiver.close();
          return;
        } else {
          // Abandon messages we don't want to delete
          await receiver.abandonMessage(msg);
        }
      }

      await receiver.close();
      throw new Error(`Message ${messageId} not found in queue ${queueName}`);
    } catch (error: any) {
      console.error(`Failed to delete message ${messageId}:`, error);
      throw new Error(`Failed to delete message: ${error.message}`);
    }
  }

  async moveMessage(sourceQueue: string, targetQueue: string, messageId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to Azure Service Bus');
    }

    try {
      // Create receiver for source queue
      const receiver = this.client.createReceiver(sourceQueue, {
        receiveMode: 'peekLock',
      });

      // Receive messages to find the one to move
      const messages = await receiver.receiveMessages(100, { maxWaitTimeInMs: 5000 });

      for (const msg of messages) {
        if (msg.messageId?.toString() === messageId || msg.sequenceNumber?.toString() === messageId) {
          // Send to target queue
          const sender = this.client.createSender(targetQueue);
          await sender.sendMessages({
            body: msg.body,
            contentType: msg.contentType,
            subject: msg.subject,
            applicationProperties: msg.applicationProperties,
          });
          await sender.close();

          // Complete (delete) from source queue
          await receiver.completeMessage(msg);
          console.log(`Moved message ${messageId} from ${sourceQueue} to ${targetQueue}`);
          await receiver.close();
          return;
        } else {
          // Abandon messages we don't want to move
          await receiver.abandonMessage(msg);
        }
      }

      await receiver.close();
      throw new Error(`Message ${messageId} not found in queue ${sourceQueue}`);
    } catch (error: any) {
      console.error(`Failed to move message ${messageId}:`, error);
      throw new Error(`Failed to move message: ${error.message}`);
    }
  }

  async getTopics(): Promise<ITopic[]> {
    if (!this.client) {
      throw new Error('Not connected to Azure Service Bus');
    }

    try {
      // Try management API for emulator
      if (this.managementEndpoint) {
        try {
          const response = await fetch(`${this.managementEndpoint}/$Resources/topics`, {
            headers: {
              'Accept': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json();

            const topics: ITopic[] = [];
            if (Array.isArray(data)) {
              for (const topicName of data) {
                // Get subscription count
                let subscriptionCount = 0;
                try {
                  const subsResponse = await fetch(`${this.managementEndpoint}/$Resources/topics/${topicName}/subscriptions`, {
                    headers: { 'Accept': 'application/json' },
                  });
                  if (subsResponse.ok) {
                    const subs = await subsResponse.json();
                    subscriptionCount = Array.isArray(subs) ? subs.length : 0;
                  }
                } catch (err) {
                  // Ignore
                }

                topics.push({
                  id: topicName,
                  name: topicName,
                  subscriptionCount: subscriptionCount,
                });
              }
            }

            console.log(`Found ${topics.length} topics in Azure Service Bus`);
            return topics;
          }
        } catch (fetchError) {
          console.warn('Management API not available for topics');
        }
      }

      // Fallback: empty array
      return [];
    } catch (error: any) {
      console.error('Failed to get topics from Azure Service Bus:', error);
      throw new Error(`Failed to get topics: ${error.message}`);
    }
  }

  async getSubscriptions(topicName: string): Promise<ISubscription[]> {
    if (!this.client) {
      throw new Error('Not connected to Azure Service Bus');
    }

    try {
      if (this.managementEndpoint) {
        const response = await fetch(`${this.managementEndpoint}/$Resources/topics/${topicName}/subscriptions`, {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();

          const subscriptions: ISubscription[] = [];
          if (Array.isArray(data)) {
            for (const subName of data) {
              subscriptions.push({
                id: subName,
                name: subName,
                topicName: topicName,
                messageCount: 0, // Would need additional API call to get count
              });
            }
          }

          return subscriptions;
        }
      }

      return [];
    } catch (error: any) {
      console.error(`Failed to get subscriptions for topic ${topicName}:`, error);
      throw new Error(`Failed to get subscriptions: ${error.message}`);
    }
  }

  async getTopicMessages(topicName: string, subscriptionName: string, limit: number = 100): Promise<IMessage[]> {
    if (!this.client) {
      throw new Error('Not connected to Azure Service Bus');
    }

    try {
      const receiver = this.client.createReceiver(topicName, subscriptionName, {
        receiveMode: 'peekLock',
      });

      const messages = await receiver.peekMessages(limit);
      await receiver.close();

      return messages.map((msg) => ({
        id: msg.messageId?.toString() || msg.sequenceNumber?.toString() || '',
        sequenceNumber: msg.sequenceNumber?.toString() || '',
        label: msg.subject || msg.messageId?.toString() || '',
        size: msg.body ? JSON.stringify(msg.body).length : 0,
        enqueuedTime: msg.enqueuedTimeUtc?.toISOString() || new Date().toISOString(),
        deliveryCount: msg.deliveryCount || 0,
        customProperties: msg.applicationProperties,
        body: msg.body,
      }));
    } catch (error: any) {
      console.error(`Failed to get messages from topic ${topicName}/${subscriptionName}:`, error);
      throw new Error(`Failed to get messages: ${error.message}`);
    }
  }

  async sendTopicMessage(topicName: string, message: any): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to Azure Service Bus');
    }

    try {
      const sender = this.client.createSender(topicName);

      await sender.sendMessages({
        body: message,
        contentType: 'application/json',
      });

      await sender.close();
      console.log(`Message sent to topic: ${topicName}`);
    } catch (error: any) {
      console.error(`Failed to send message to topic ${topicName}:`, error);
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  async deleteTopicMessage(topicName: string, subscriptionName: string, messageId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to Azure Service Bus');
    }

    try {
      const receiver = this.client.createReceiver(topicName, subscriptionName, {
        receiveMode: 'peekLock',
      });

      const messages = await receiver.receiveMessages(100, { maxWaitTimeInMs: 5000 });

      for (const msg of messages) {
        if (msg.messageId?.toString() === messageId || msg.sequenceNumber?.toString() === messageId) {
          await receiver.completeMessage(msg);
          console.log(`Deleted message ${messageId} from topic ${topicName}/${subscriptionName}`);
          await receiver.close();
          return;
        } else {
          await receiver.abandonMessage(msg);
        }
      }

      await receiver.close();
      throw new Error(`Message ${messageId} not found in topic ${topicName}/${subscriptionName}`);
    } catch (error: any) {
      console.error(`Failed to delete message ${messageId}:`, error);
      throw new Error(`Failed to delete message: ${error.message}`);
    }
  }

  async purgeQueue(queueName: string): Promise<{ successCount: number }> {
    if (!this.client) {
      throw new Error('Not connected to Azure Service Bus');
    }

    try {
      console.log(`Purging all messages from queue: ${queueName}`);

      // Create a receiver to get all messages and delete them
      const receiver = this.client.createReceiver(queueName, {
        receiveMode: 'receiveAndDelete' // This automatically deletes messages when received
      });

      let totalPurged = 0;
      const batchSize = 100; // Process messages in batches

      try {
        while (true) {
          // Receive messages in batches
          const messages = await receiver.receiveMessages(batchSize, { maxWaitTimeInMs: 1000 });
          
          if (messages.length === 0) {
            break; // No more messages
          }

          totalPurged += messages.length;
          console.log(`Purged ${messages.length} messages (total: ${totalPurged})`);
        }
      } finally {
        await receiver.close();
      }

      console.log(`Queue ${queueName} purged successfully - removed ${totalPurged} messages`);
      return { successCount: totalPurged };
    } catch (error: any) {
      console.error(`Failed to purge queue ${queueName}:`, error);
      throw new Error(`Failed to purge queue: ${error.message}`);
    }
  }

  getConnection(): IConnection | null {
    return this.connection;
  }
}
