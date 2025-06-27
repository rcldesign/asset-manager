'use client';

import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Box,
  LinearProgress,
  Alert,
  Chip,
} from '@mui/material';
import { Add as AddIcon, TrendingUp as TrendingUpIcon } from '@mui/icons-material';
import { useUpdateUsageCounter } from '../../hooks/use-advanced-schedules';

interface UsageCounterInputProps {
  assetId: string;
  currentValue?: number;
  threshold?: number;
  scheduleNames?: string[];
}

export default function UsageCounterInput({ 
  assetId, 
  currentValue = 0, 
  threshold,
  scheduleNames = []
}: UsageCounterInputProps) {
  const [increment, setIncrement] = React.useState<number>(1);
  const updateMutation = useUpdateUsageCounter();

  const percentage = threshold ? (currentValue / threshold) * 100 : 0;
  const isNearThreshold = threshold && percentage >= 80;

  const handleUpdateCounter = async () => {
    if (increment > 0) {
      try {
        const result = await updateMutation.mutateAsync({ assetId, increment });
        setIncrement(1); // Reset to default
        
        if (result.taskGenerated) {
          // Task was generated, could show a notification
        }
      } catch (error) {
        console.error('Failed to update usage counter:', error);
      }
    }
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <TrendingUpIcon sx={{ mr: 1 }} />
          <Typography variant="h6">Usage Counter</Typography>
        </Box>

        {scheduleNames.length > 0 && (
          <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="textSecondary">
              Tracked by:
            </Typography>
            {scheduleNames.map((name, index) => (
              <Chip key={index} label={name} size="small" />
            ))}
          </Box>
        )}

        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2">
              Current: {currentValue}
            </Typography>
            {threshold && (
              <Typography variant="body2">
                Threshold: {threshold}
              </Typography>
            )}
          </Box>
          
          {threshold && (
            <>
              <LinearProgress 
                variant="determinate" 
                value={Math.min(percentage, 100)}
                color={isNearThreshold ? 'warning' : 'primary'}
                sx={{ height: 8, borderRadius: 1 }}
              />
              <Typography 
                variant="caption" 
                color={isNearThreshold ? 'warning.main' : 'textSecondary'}
                sx={{ mt: 0.5, display: 'block' }}
              >
                {percentage.toFixed(1)}% of threshold
              </Typography>
            </>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
          <TextField
            label="Add Usage"
            type="number"
            value={increment}
            onChange={(e) => setIncrement(Math.max(1, parseInt(e.target.value) || 1))}
            inputProps={{ min: 1 }}
            size="small"
            sx={{ flex: 1 }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleUpdateCounter}
            disabled={updateMutation.isPending || increment <= 0}
          >
            Update
          </Button>
        </Box>

        {isNearThreshold && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Usage is approaching threshold. A maintenance task will be created when the threshold is reached.
          </Alert>
        )}

        {updateMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Failed to update usage counter. Please try again.
          </Alert>
        )}

        {updateMutation.isSuccess && updateMutation.data?.taskGenerated && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Threshold reached! A new maintenance task has been created.
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}