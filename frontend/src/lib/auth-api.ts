import axios from 'axios';
import { User } from './auth-store';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // Important for httpOnly cookies
});

export interface LoginRequest {
  email: string;
  password: string;
  totpCode?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
}

export interface LoginResponse {
  user: User;
  requiresTwoFactor?: boolean;
}

export const authApi = {
  // Check current authentication status
  me: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    return response.data.user;
  },

  // Login with email/password
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post('/auth/login', data);
    return response.data;
  },

  // Register new user
  register: async (data: RegisterRequest): Promise<LoginResponse> => {
    const response = await api.post('/auth/register', data);
    return response.data;
  },

  // Logout
  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  // Setup 2FA
  setupTwoFactor: async (): Promise<{ qrCode: string; secret: string }> => {
    const response = await api.post('/auth/2fa/setup');
    return response.data;
  },

  // Verify 2FA setup
  verifyTwoFactor: async (code: string): Promise<void> => {
    await api.post('/auth/2fa/verify', { code });
  },

  // Disable 2FA
  disableTwoFactor: async (code: string): Promise<void> => {
    await api.post('/auth/2fa/disable', { code });
  },
};