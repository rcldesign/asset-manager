import { Box, Button, Paper, Typography } from '@mui/material';
import { 
  Add as AddIcon,
  Build as AssetIcon,
  Assignment as TaskIcon,
  Schedule as ScheduleIcon,
  PersonAdd as InviteIcon
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';

export function QuickActions() {
  const router = useRouter();

  const actions = [
    {
      label: 'New Asset',
      icon: <AssetIcon />,
      color: 'primary',
      onClick: () => router.push('/assets/new'),
    },
    {
      label: 'New Task',
      icon: <TaskIcon />,
      color: 'success',
      onClick: () => router.push('/tasks/new'),
    },
    {
      label: 'New Schedule',
      icon: <ScheduleIcon />,
      color: 'warning',
      onClick: () => router.push('/schedules'),
    },
    {
      label: 'Invite User',
      icon: <InviteIcon />,
      color: 'info',
      onClick: () => router.push('/users'),
    },
  ];

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Quick Actions
      </Typography>
      <Box display="flex" flexDirection="column" gap={1}>
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="outlined"
            color={action.color as any}
            startIcon={action.icon}
            onClick={action.onClick}
            fullWidth
            sx={{ justifyContent: 'flex-start' }}
          >
            {action.label}
          </Button>
        ))}
      </Box>
    </Paper>
  );
}