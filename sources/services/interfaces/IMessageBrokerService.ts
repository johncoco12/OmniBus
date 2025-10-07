export interface IMessage {
  id: string;
  sequenceNumber: string;
  label: string;
  size: number;
  enqueuedTime: string;
  deliveryCount: number;
  /**
   * Optional raw broker properties (e.g. RabbitMQ) that may include messageId
   */
  properties?: { messageId?: string; [key: string]: any };
  /**
   * Optional broker-provided timestamp (epoch millis or ISO string)
   */
  timestamp?: number | string;
  /**
   * Whether the message has been redelivered (RabbitMQ)
   */
  redelivered?: boolean;
  customProperties?: Record<string, any>;
  body: any;
}

export interface IQueue {
  id: string;
  name: string;
  messageCount: number;
}

export interface ITopic {
  id: string;
  name: string;
  subscriptionCount: number;
}

export interface ISubscription {
  id: string;
  name: string;
  topicName: string;
  messageCount: number;
}

export interface IConnection {
  id: string;
  name: string;
  type: 'rabbitmq' | 'azure-service-bus' | 'msmq' | 'activemq';
  connectionString: string;
  isConnected: boolean;
}

export interface IMessageBrokerService {
  /**
   * Connect to the message broker
   */
  connect(connection: IConnection): Promise<void>;

  /**
   * Disconnect from the message broker
   */
  disconnect(): Promise<void>;

  /**
   * Get all queues from the broker
   */
  getQueues(): Promise<IQueue[]>;

  /**
   * Get all topics from the broker (optional - Azure Service Bus)
   */
  getTopics?(): Promise<ITopic[]>;

  /**
   * Get subscriptions for a topic (optional - Azure Service Bus)
   */
  getSubscriptions?(topicName: string): Promise<ISubscription[]>;

  /**
   * Get messages from a specific queue
   */
  getMessages(queueName: string, limit?: number): Promise<IMessage[]>;

  /**
   * Get messages from a topic subscription (optional - Azure Service Bus)
   */
  getTopicMessages?(topicName: string, subscriptionName: string, limit?: number): Promise<IMessage[]>;

  /**
   * Send a message to a queue
   */
  sendMessage(queueName: string, message: any): Promise<void>;

  /**
   * Send a message to a topic (optional - Azure Service Bus)
   */
  sendTopicMessage?(topicName: string, message: any): Promise<void>;

  /**
   * Delete a message from a queue
   */
  deleteMessage(queueName: string, messageId: string): Promise<void>;

  /**
   * Delete a message from a topic subscription (optional - Azure Service Bus)
   */
  deleteTopicMessage?(topicName: string, subscriptionName: string, messageId: string): Promise<void>;

  /**
   * Move a message to another queue
   */
  moveMessage(sourceQueue: string, targetQueue: string, messageId: string): Promise<void>;

  /**
   * Get the connection info
   */
  getConnection(): IConnection | null;
}
