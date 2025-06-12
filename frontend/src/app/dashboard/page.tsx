'use client';

import { useAuth } from '../../hooks/use-auth';
import { ProtectedRoute } from '../../components/protected-route';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
} from '@mui/material';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { user, logout, isLogoutLoading } = useAuth();

  return (
    <Box p={3}>
      <Typography variant="h3" component="h1" gutterBottom>
        Welcome to DumbAssets Enhanced
      </Typography>
      
      <Card sx={{ mb: 3, maxWidth: 600 }}>
        <CardContent>
          <Typography variant="h5" component="h2" gutterBottom>
            User Information
          </Typography>
          
          {user && (
            <Box>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Name:</strong> {user.fullName}
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Email:</strong> {user.email}
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Role:</strong> <Chip label={user.role} color="primary" size="small" />
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Organization ID:</strong> {user.organizationId}
              </Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                <strong>2FA Enabled:</strong> {user.hasEnabledTwoFactor ? '✅ Yes' : '❌ No'}
              </Typography>
              
              <Button
                variant="outlined"
                color="error"
                onClick={logout}
                disabled={isLogoutLoading}
              >
                {isLogoutLoading ? 'Signing out...' : 'Sign Out'}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h5" component="h2" gutterBottom>
            Phase 1 Frontend Complete! 🎉
          </Typography>
          <Typography variant="body1">
            This dashboard demonstrates the successful implementation of:
          </Typography>
          <ul className="mt-2 ml-4 space-y-1">
            <li>✅ Next.js frontend with TypeScript</li>
            <li>✅ Material-UI (MUI) components</li>
            <li>✅ Zustand state management</li>
            <li>✅ React Query for API state</li>
            <li>✅ Authentication flow with JWT</li>
            <li>✅ Protected routes with role-based access</li>
            <li>✅ Login/Register pages</li>
            <li>✅ API proxy to backend</li>
          </ul>
        </CardContent>
      </Card>
    </Box>
  );
}