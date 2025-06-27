import React from 'react';
import {
  Box,
  Typography,
  Paper,
} from '@mui/material';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent,
} from '@mui/lab';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import EditIcon from '@mui/icons-material/Edit';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import BuildIcon from '@mui/icons-material/Build';
import AttachmentIcon from '@mui/icons-material/Attachment';
import { format } from 'date-fns';

interface AssetHistoryTabProps {
  assetId: string;
}

// Mock history data - in a real app, this would come from an API
const mockHistory = [
  {
    id: '1',
    type: 'created',
    description: 'Asset created',
    user: 'John Doe',
    timestamp: new Date('2024-01-15T10:00:00'),
    icon: <AddCircleIcon />,
    color: 'primary' as const,
  },
  {
    id: '2',
    type: 'edit',
    description: 'Updated purchase price from $1,200 to $1,150',
    user: 'Jane Smith',
    timestamp: new Date('2024-01-20T14:30:00'),
    icon: <EditIcon />,
    color: 'info' as const,
  },
  {
    id: '3',
    type: 'location',
    description: 'Moved from Warehouse to Office Building 2',
    user: 'Bob Johnson',
    timestamp: new Date('2024-02-01T09:15:00'),
    icon: <LocationOnIcon />,
    color: 'warning' as const,
  },
  {
    id: '4',
    type: 'status',
    description: 'Status changed from OPERATIONAL to MAINTENANCE',
    user: 'Alice Brown',
    timestamp: new Date('2024-02-10T16:45:00'),
    icon: <BuildIcon />,
    color: 'error' as const,
  },
  {
    id: '5',
    type: 'attachment',
    description: 'Added attachment: warranty.pdf',
    user: 'John Doe',
    timestamp: new Date('2024-02-15T11:20:00'),
    icon: <AttachmentIcon />,
    color: 'success' as const,
  },
];

export const AssetHistoryTab: React.FC<AssetHistoryTabProps> = () => {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Activity History
      </Typography>
      
      <Timeline position="alternate">
        {mockHistory.map((event) => (
          <TimelineItem key={event.id}>
            <TimelineOppositeContent color="text.secondary">
              <Typography variant="caption">
                {format(event.timestamp, 'MMM dd, yyyy')}
              </Typography>
              <br />
              <Typography variant="caption">
                {format(event.timestamp, 'HH:mm')}
              </Typography>
            </TimelineOppositeContent>
            <TimelineSeparator>
              <TimelineDot color={event.color} variant="outlined">
                {event.icon}
              </TimelineDot>
              <TimelineConnector />
            </TimelineSeparator>
            <TimelineContent>
              <Paper elevation={1} sx={{ p: 2 }}>
                <Typography variant="subtitle2" component="h3">
                  {event.description}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  by {event.user}
                </Typography>
              </Paper>
            </TimelineContent>
          </TimelineItem>
        ))}
      </Timeline>

      {mockHistory.length === 0 && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No history available for this asset.
          </Typography>
        </Paper>
      )}
    </Box>
  );
};