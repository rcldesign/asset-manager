import { Box, Card, CardContent, Typography, Skeleton } from '@mui/material';
import { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: ReactNode;
  color?: string;
  loading?: boolean;
  trend?: {
    value: number;
    label: string;
  };
}

export function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon, 
  color = '#1976d2',
  loading = false,
  trend
}: StatCardProps) {
  if (loading) {
    return (
      <Card>
        <CardContent>
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" height={40} />
          <Skeleton variant="text" width="80%" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box flex={1}>
            <Typography color="textSecondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4" component="div" sx={{ color }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                {subtitle}
              </Typography>
            )}
            {trend && (
              <Typography 
                variant="body2" 
                sx={{ 
                  mt: 1,
                  color: trend.value > 0 ? 'success.main' : trend.value < 0 ? 'error.main' : 'text.secondary'
                }}
              >
                {trend.value > 0 ? '+' : ''}{trend.value}% {trend.label}
              </Typography>
            )}
          </Box>
          {icon && (
            <Box sx={{ color, opacity: 0.7 }}>
              {icon}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}