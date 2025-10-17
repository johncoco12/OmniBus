import 'reflect-metadata';
import { container } from 'tsyringe';
import { ServiceBusManager } from './ServiceBusManager';
import { RabbitMQService } from './implementations/RabbitMQService';
import { WebStorageService } from './implementations/WebStorageService';
import { ConnectionRepository } from './ConnectionRepository';

// Initialize the DI container
export { container };

let isInitialized = false;

// This file will be imported at the app entry point
export function initializeContainer() {
  if (isInitialized) {
    console.log('Service container already initialized');
    return;
  }

  // Register storage services
  container.registerSingleton(WebStorageService);

  // Register repositories
  container.registerSingleton(ConnectionRepository);

  // Register message broker services
  container.registerSingleton(ServiceBusManager);
  container.register('RabbitMQService', { useClass: RabbitMQService });

  isInitialized = true;
  console.log('Service container initialized');
}
