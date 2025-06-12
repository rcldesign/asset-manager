'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/use-auth';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Link as MuiLink,
} from '@mui/material';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const router = useRouter();

  const { 
    login, 
    isLoginLoading, 
    loginError, 
    requiresTwoFactor,
    isAuthenticated 
  } = useAuth();

  // Redirect if already authenticated
  if (isAuthenticated) {
    router.push('/dashboard');
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ email, password, totpCode: totpCode || undefined });
  };

  const getErrorMessage = (error: unknown): string => {
    if (error && typeof error === 'object') {
      if ('response' in error) {
        const response = (error as { response?: { data?: { error?: { message?: string } } } }).response;
        if (response?.data?.error?.message) {
          return response.data.error.message;
        }
      }
      if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
        return (error as { message: string }).message;
      }
    }
    return 'An unexpected error occurred';
  };

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      bgcolor="grey.50"
      p={3}
    >
      <Card sx={{ maxWidth: 400, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            Sign In
          </Typography>
          
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
            Sign in to your DumbAssets Enhanced account
          </Typography>

          {loginError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {getErrorMessage(loginError)}
            </Alert>
          )}

          {requiresTwoFactor && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Please enter your 2FA code to complete login
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoginLoading}
            />
            
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoginLoading}
            />

            {requiresTwoFactor && (
              <TextField
                margin="normal"
                required
                fullWidth
                name="totpCode"
                label="2FA Code"
                id="totpCode"
                autoComplete="one-time-code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                disabled={isLoginLoading}
                helperText="Enter the 6-digit code from your authenticator app"
              />
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={isLoginLoading}
              startIcon={isLoginLoading ? <CircularProgress size={20} /> : null}
            >
              {isLoginLoading ? 'Signing in...' : 'Sign In'}
            </Button>

            <Box textAlign="center">
              <Typography variant="body2">
                Don&apos;t have an account?{' '}
                <Link href="/register" passHref>
                  <MuiLink component="span" color="primary">
                    Sign up
                  </MuiLink>
                </Link>
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}