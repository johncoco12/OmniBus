import { WebStorageService } from './implementations/WebStorageService';
import { ConnectionRepository } from './ConnectionRepository';
import { ServiceBusManager } from './ServiceBusManager';

// Create singleton instances to be shared across the application
export const storageService = new WebStorageService();
export const connectionRepo = new ConnectionRepository(storageService);
export const serviceBusManager = new ServiceBusManager();
