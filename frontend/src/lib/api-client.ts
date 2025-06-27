import axios from 'axios';
import { useAuthStore } from './auth-store';

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true, // Important for httpOnly cookies
});

// Handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Session expired or invalid
      useAuthStore.getState().logout();
      // Optionally redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;