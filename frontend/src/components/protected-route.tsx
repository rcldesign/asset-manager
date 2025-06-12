'use client';

import { useAuth } from '../hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CircularProgress, Box } from '@mui/material';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER';
}

const roleHierarchy = {
  OWNER: 4,
  MANAGER: 3,
  MEMBER: 2,
  VIEWER: 1,
};

export function ProtectedRoute({ children, requiredRole = 'VIEWER' }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  // Not authenticated - will redirect via useEffect
  if (!isAuthenticated) {
    return null;
  }

  // Check role permission
  if (user && requiredRole) {
    const userRoleLevel = roleHierarchy[user.role];
    const requiredRoleLevel = roleHierarchy[requiredRole];
    
    if (userRoleLevel < requiredRoleLevel) {
      return (
        <Box 
          display="flex" 
          justifyContent="center" 
          alignItems="center" 
          minHeight="100vh"
          p={3}
        >
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
            <p className="text-gray-600">
              You don&apos;t have permission to access this page. Required role: {requiredRole}
            </p>
          </div>
        </Box>
      );
    }
  }

  return <>{children}</>;
}