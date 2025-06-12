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

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const router = useRouter();

  const { 
    register, 
    isRegisterLoading, 
    registerError,
    isAuthenticated 
  } = useAuth();

  // Redirect if already authenticated
  if (isAuthenticated) {
    router.push('/dashboard');
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      return; // Handle password mismatch
    }
    
    register({ email, password, fullName });
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
            Sign Up
          </Typography>
          
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
            Create your DumbAssets Enhanced account
          </Typography>

          {registerError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {getErrorMessage(registerError)}
            </Alert>
          )}

          {password && confirmPassword && password !== confirmPassword && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Passwords do not match
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="fullName"
              label="Full Name"
              name="fullName"
              autoComplete="name"
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isRegisterLoading}
            />

            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isRegisterLoading}
            />
            
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isRegisterLoading}
            />

            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassword"
              label="Confirm Password"
              type="password"
              id="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isRegisterLoading}
              error={password !== confirmPassword && confirmPassword.length > 0}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={isRegisterLoading || (password !== confirmPassword && confirmPassword.length > 0)}
              startIcon={isRegisterLoading ? <CircularProgress size={20} /> : null}
            >
              {isRegisterLoading ? 'Creating account...' : 'Sign Up'}
            </Button>

            <Box textAlign="center">
              <Typography variant="body2">
                Already have an account?{' '}
                <Link href="/login" passHref>
                  <MuiLink component="span" color="primary">
                    Sign in
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