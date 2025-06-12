import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../lib/auth-store';
import { authApi, LoginRequest, RegisterRequest } from '../lib/auth-api';
import { useEffect } from 'react';

export const useAuth = () => {
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout } = useAuthStore();
  const queryClient = useQueryClient();

  // Query to check current auth status
  const authQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Update Zustand store when query data changes
  useEffect(() => {
    if (authQuery.isSuccess && authQuery.data) {
      setUser(authQuery.data);
      setLoading(false);
    } else if (authQuery.isError) {
      setUser(null);
      setLoading(false);
    } else if (authQuery.isLoading) {
      setLoading(true);
    }
  }, [authQuery.isSuccess, authQuery.isError, authQuery.isLoading, authQuery.data, setUser, setLoading]);

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      if (data.user && !data.requiresTwoFactor) {
        setUser(data.user);
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      }
    },
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      if (data.user) {
        setUser(data.user);
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      }
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      logout();
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      queryClient.clear(); // Clear all cached data on logout
    },
  });

  // Setup 2FA mutation
  const setupTwoFactorMutation = useMutation({
    mutationFn: authApi.setupTwoFactor,
  });

  // Verify 2FA mutation
  const verifyTwoFactorMutation = useMutation({
    mutationFn: authApi.verifyTwoFactor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  // Disable 2FA mutation
  const disableTwoFactorMutation = useMutation({
    mutationFn: authApi.disableTwoFactor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  const login = (data: LoginRequest) => loginMutation.mutate(data);
  const register = (data: RegisterRequest) => registerMutation.mutate(data);
  const logoutUser = () => logoutMutation.mutate();
  const setupTwoFactor = () => setupTwoFactorMutation.mutate();
  const verifyTwoFactor = (code: string) => verifyTwoFactorMutation.mutate(code);
  const disableTwoFactor = (code: string) => disableTwoFactorMutation.mutate(code);

  return {
    // State
    user,
    isAuthenticated,
    isLoading: isLoading || authQuery.isLoading,
    
    // Actions
    login,
    register,
    logout: logoutUser,
    setupTwoFactor,
    verifyTwoFactor,
    disableTwoFactor,
    
    // Mutation states
    isLoginLoading: loginMutation.isPending,
    isRegisterLoading: registerMutation.isPending,
    isLogoutLoading: logoutMutation.isPending,
    isSetupTwoFactorLoading: setupTwoFactorMutation.isPending,
    isVerifyTwoFactorLoading: verifyTwoFactorMutation.isPending,
    isDisableTwoFactorLoading: disableTwoFactorMutation.isPending,
    
    // Mutation data
    loginError: loginMutation.error,
    registerError: registerMutation.error,
    logoutError: logoutMutation.error,
    setupTwoFactorData: setupTwoFactorMutation.data,
    setupTwoFactorError: setupTwoFactorMutation.error,
    verifyTwoFactorError: verifyTwoFactorMutation.error,
    disableTwoFactorError: disableTwoFactorMutation.error,
    
    // Login flow data
    requiresTwoFactor: loginMutation.data?.requiresTwoFactor,
  };
};