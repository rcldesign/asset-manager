/**
 * Jest setup file specifically for integration tests
 * This file runs before any test files and before app.setup.ts
 */

// Import env setup first to load environment variables
import '../env-setup';

// Unmock libraries for integration tests - we want real behavior
jest.unmock('jsonwebtoken');
jest.unmock('bcrypt');
jest.unmock('qrcode');

// We need to reset modules to ensure the unmock takes effect
jest.resetModules();

export {};
