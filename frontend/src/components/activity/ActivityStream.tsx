'use client';

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  Person as PersonIcon,
  Hardware as AssetIcon,
  Task as TaskIcon,
  Schedule as ScheduleIcon,
  Business as OrgIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { 
  useActivityStream, 
  useAssetActivityStream, 
  useOrganizationActivityStream 
} from '../../hooks/use-activity-streams';
import type { ActivityStreamEvent } from '../../api/activity-streams-api';

interface ActivityStreamProps {
  mode?: 'all' | 'asset' | 'organization';
  assetId?: string;
  limit?: number;
}

export default function ActivityStream({ 
  mode = 'all', 
  assetId,
  limit = 20 
}: ActivityStreamProps) {
  const [filterAnchor, setFilterAnchor] = React.useState<null | HTMLElement>(null);
  const [selectedFilters, setSelectedFilters] = React.useState({
    entityType: '',
    action: '',
  });

  // Use appropriate hook based on mode
  const assetQuery = useAssetActivityStream(assetId || '', { limit });
  const orgQuery = useOrganizationActivityStream({ limit });
  const allQuery = useActivityStream({ limit, ...selectedFilters });
  
  const query = mode === 'asset' && assetId
    ? assetQuery
    : mode === 'organization'
    ? orgQuery
    : allQuery;

  const { data, isLoading, isError } = query;

  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'ASSET':
        return <AssetIcon />;
      case 'TASK':
        return <TaskIcon />;
      case 'SCHEDULE':
        return <ScheduleIcon />;
      case 'ORGANIZATION':
        return <OrgIcon />;
      default:
        return <PersonIcon />;
    }
  };

  const getActionColor = (action: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
    if (action.includes('create')) return 'success';
    if (action.includes('update')) return 'info';
    if (action.includes('delete')) return 'error';
    if (action.includes('complete')) return 'success';
    if (action.includes('assign')) return 'primary';
    return 'default';
  };

  const formatEventMessage = (event: ActivityStreamEvent) => {
    const actor = event.actor?.fullName || event.actor?.email || 'Unknown user';
    const action = event.action.replace(/_/g, ' ').toLowerCase();
    const entity = event.entityName || event.entityType.toLowerCase();

    // Build a human-readable message
    switch (event.action) {
      case 'asset.created':
        return `${actor} created asset "${entity}"`;
      case 'asset.updated':
        return `${actor} updated asset "${entity}"`;
      case 'asset.deleted':
        return `${actor} deleted asset "${entity}"`;
      case 'task.created':
        return `${actor} created task "${entity}"`;
      case 'task.assigned':
        return `${actor} assigned task "${entity}" to ${event.metadata?.assignedTo || 'someone'}`;
      case 'task.completed':
        return `${actor} completed task "${entity}"`;
      case 'schedule.created':
        return `${actor} created schedule "${entity}"`;
      case 'schedule.updated':
        return `${actor} updated schedule "${entity}"`;
      case 'user.invited':
        return `${actor} invited ${event.metadata?.email || 'a new user'}`;
      case 'user.joined':
        return `${actor} joined the organization`;
      case 'comment.mentioned':
        return `${actor} mentioned ${event.metadata?.mentionedUsers?.join(', ') || 'you'} in a comment`;
      default:
        return `${actor} ${action} ${entity}`;
    }
  };

  const handleFilterChange = (filterType: string, value: string) => {
    setSelectedFilters(prev => ({
      ...prev,
      [filterType]: value === prev[filterType] ? '' : value,
    }));
    setFilterAnchor(null);
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return (
      <Alert severity="error">
        Failed to load activity stream. Please try again.
      </Alert>
    );
  }

  const events = data?.events || [];

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          {mode === 'asset' ? 'Asset Activity' : 
           mode === 'organization' ? 'Organization Activity' : 
           'Recent Activity'}
        </Typography>
        
        {mode === 'all' && (
          <IconButton onClick={(e) => setFilterAnchor(e.currentTarget)}>
            <FilterIcon />
          </IconButton>
        )}
      </Box>

      {events.length === 0 ? (
        <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 4 }}>
          No activity to show
        </Typography>
      ) : (
        <List>
          {events.map((event, index) => (
            <React.Fragment key={event.id}>
              <ListItem alignItems="flex-start">
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: 'primary.main' }}>
                    {getEntityIcon(event.entityType)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1">
                        {formatEventMessage(event)}
                      </Typography>
                      <Chip
                        label={event.action.split('.')[0]}
                        size="small"
                        color={getActionColor(event.action)}
                      />
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="textSecondary">
                      {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                    </Typography>
                  }
                />
              </ListItem>
              {index < events.length - 1 && <Divider variant="inset" component="li" />}
            </React.Fragment>
          ))}
        </List>
      )}

      {/* Filter Menu */}
      <Menu
        anchorEl={filterAnchor}
        open={Boolean(filterAnchor)}
        onClose={() => setFilterAnchor(null)}
      >
        <MenuItem disabled>
          <Typography variant="subtitle2">Filter by Type</Typography>
        </MenuItem>
        <MenuItem 
          onClick={() => handleFilterChange('entityType', 'ASSET')}
          selected={selectedFilters.entityType === 'ASSET'}
        >
          Assets
        </MenuItem>
        <MenuItem 
          onClick={() => handleFilterChange('entityType', 'TASK')}
          selected={selectedFilters.entityType === 'TASK'}
        >
          Tasks
        </MenuItem>
        <MenuItem 
          onClick={() => handleFilterChange('entityType', 'SCHEDULE')}
          selected={selectedFilters.entityType === 'SCHEDULE'}
        >
          Schedules
        </MenuItem>
        <MenuItem 
          onClick={() => handleFilterChange('entityType', 'USER')}
          selected={selectedFilters.entityType === 'USER'}
        >
          Users
        </MenuItem>
        <Divider />
        <MenuItem disabled>
          <Typography variant="subtitle2">Filter by Action</Typography>
        </MenuItem>
        <MenuItem 
          onClick={() => handleFilterChange('action', 'created')}
          selected={selectedFilters.action === 'created'}
        >
          Created
        </MenuItem>
        <MenuItem 
          onClick={() => handleFilterChange('action', 'updated')}
          selected={selectedFilters.action === 'updated'}
        >
          Updated
        </MenuItem>
        <MenuItem 
          onClick={() => handleFilterChange('action', 'deleted')}
          selected={selectedFilters.action === 'deleted'}
        >
          Deleted
        </MenuItem>
      </Menu>
    </Paper>
  );
}