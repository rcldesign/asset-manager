import { Box, Card, CardContent, Typography, Skeleton } from '@mui/material';
import { ReactNode } from 'react';

interface ChartContainerProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
  height?: number | string;
  actions?: ReactNode;
}

export function ChartContainer({ 
  title, 
  subtitle, 
  children, 
  loading = false,
  height = 300,
  actions
}: ChartContainerProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Box>
            <Typography variant="h6" gutterBottom>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="textSecondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          {actions && <Box>{actions}</Box>}
        </Box>
        <Box sx={{ height, position: 'relative' }}>
          {loading ? (
            <Skeleton variant="rectangular" width="100%" height="100%" />
          ) : (
            children
          )}
        </Box>
      </CardContent>
    </Card>
  );
}