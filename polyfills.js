// Polyfills for Node.js modules in browser environment
import { Buffer } from 'buffer';
import process from 'process';

// Make Buffer and process available globally
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.process = process;
  window.global = window;
}

if (typeof global !== 'undefined') {
  global.Buffer = Buffer;
  global.process = process;
}
