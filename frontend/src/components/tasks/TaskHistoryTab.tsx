import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
} from '@mui/material';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineDot,
  TimelineConnector,
  TimelineContent,
} from '@mui/lab';
import { format } from 'date-fns';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import EditIcon from '@mui/icons-material/Edit';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import PersonIcon from '@mui/icons-material/Person';

interface TaskHistoryTabProps {
  taskId: string;
}

interface HistoryEvent {
  id: string;
  type: 'created' | 'status_changed' | 'assigned' | 'edited' | 'attachment_added' | 'attachment_removed';
  timestamp: string;
  user: string;
  details?: Record<string, unknown>;
}

// Mock data - in a real app, this would come from an API
const mockHistory: HistoryEvent[] = [
  {
    id: '1',
    type: 'created',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    user: 'John Doe',
  },
  {
    id: '2',
    type: 'assigned',
    timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    user: 'Jane Smith',
    details: { assignedTo: 'Mike Johnson' },
  },
  {
    id: '3',
    type: 'status_changed',
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    user: 'Mike Johnson',
    details: { from: 'PLANNED', to: 'IN_PROGRESS' },
  },
  {
    id: '4',
    type: 'attachment_added',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    user: 'Mike Johnson',
    details: { filename: 'maintenance-report.pdf' },
  },
  {
    id: '5',
    type: 'edited',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    user: 'Jane Smith',
    details: { fields: ['description', 'dueDate'] },
  },
  {
    id: '6',
    type: 'status_changed',
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    user: 'Mike Johnson',
    details: { from: 'IN_PROGRESS', to: 'DONE' },
  },
];

export const TaskHistoryTab: React.FC<TaskHistoryTabProps> = () => {
  const getEventIcon = (type: HistoryEvent['type']) => {
    switch (type) {
      case 'created':
        return <AddCircleIcon />;
      case 'status_changed':
        return <PlayCircleIcon />;
      case 'assigned':
        return <PersonIcon />;
      case 'edited':
        return <EditIcon />;
      case 'attachment_added':
      case 'attachment_removed':
        return <AttachFileIcon />;
      default:
        return <AddCircleIcon />;
    }
  };

  const getEventColor = (type: HistoryEvent['type']): 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info' => {
    switch (type) {
      case 'created':
        return 'primary';
      case 'status_changed':
        return 'success';
      case 'assigned':
        return 'info';
      case 'edited':
        return 'warning';
      case 'attachment_added':
        return 'secondary';
      case 'attachment_removed':
        return 'error';
      default:
        return 'primary';
    }
  };

  const getEventDescription = (event: HistoryEvent) => {
    switch (event.type) {
      case 'created':
        return 'created this task';
      case 'status_changed':
        return (
          <span>
            changed status from{' '}
            <Chip label={event.details?.from as string} size="small" sx={{ mx: 0.5 }} /> to{' '}
            <Chip label={event.details?.to as string} size="small" sx={{ mx: 0.5 }} />
          </span>
        );
      case 'assigned':
        return `assigned this task to ${event.details?.assignedTo}`;
      case 'edited':
        return `edited ${(event.details?.fields as string[])?.join(', ')}`;
      case 'attachment_added':
        return `added attachment "${event.details?.filename}"`;
      case 'attachment_removed':
        return `removed attachment "${event.details?.filename}"`;
      default:
        return 'performed an action';
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Showing task history for the last 30 days
      </Typography>
      
      <Timeline position="alternate">
        {mockHistory.map((event, index) => (
          <TimelineItem key={event.id}>
            <TimelineSeparator>
              <TimelineDot color={getEventColor(event.type)}>
                {getEventIcon(event.type)}
              </TimelineDot>
              {index < mockHistory.length - 1 && <TimelineConnector />}
            </TimelineSeparator>
            <TimelineContent>
              <Paper elevation={3} sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Typography variant="body2" component="div">
                    <strong>{event.user}</strong> {getEventDescription(event)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {format(new Date(event.timestamp), 'PPP p')}
                  </Typography>
                </Stack>
              </Paper>
            </TimelineContent>
          </TimelineItem>
        ))}
      </Timeline>
    </Box>
  );
};