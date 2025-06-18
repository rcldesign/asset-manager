/**
 * Load test environment variables before running tests
 * This file should be loaded before other setup files
 */
import dotenv from 'dotenv';
import path from 'path';

// Load .env.test file
dotenv.config({
  path: path.resolve(__dirname, '../../.env.test'),
  override: true, // Override any existing env vars
});

export {};
