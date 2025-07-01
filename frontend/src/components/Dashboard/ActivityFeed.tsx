import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  List, 
  ListItem, 
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  Skeleton
} from '@mui/material';
import { formatDistanceToNow } from 'date-fns';
import { 
  Assignment as TaskIcon,
  Build as AssetIcon,
  Schedule as ScheduleIcon,
  Person as UserIcon
} from '@mui/icons-material';

interface Activity {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  metadata: any;
  createdAt: string;
  actor: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
  };
}

interface ActivityFeedProps {
  activities: Activity[];
  loading?: boolean;
}

const getEntityIcon = (entityType: string) => {
  switch (entityType.toLowerCase()) {
    case 'asset':
      return <AssetIcon />;
    case 'task':
      return <TaskIcon />;
    case 'schedule':
      return <ScheduleIcon />;
    default:
      return <UserIcon />;
  }
};

const getActionColor = (action: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
  switch (action.toLowerCase()) {
    case 'created':
      return 'success';
    case 'updated':
      return 'info';
    case 'deleted':
      return 'error';
    case 'completed':
      return 'success';
    default:
      return 'default';
  }
};

export function ActivityFeed({ activities, loading = false }: ActivityFeedProps) {
  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Recent Activity
          </Typography>
          <List>
            {[1, 2, 3].map((i) => (
              <ListItem key={i}>
                <ListItemAvatar>
                  <Skeleton variant="circular" width={40} height={40} />
                </ListItemAvatar>
                <ListItemText
                  primary={<Skeleton variant="text" width="80%" />}
                  secondary={<Skeleton variant="text" width="60%" />}
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Recent Activity
        </Typography>
        {activities.length === 0 ? (
          <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 4 }}>
            No recent activity
          </Typography>
        ) : (
          <List dense>
            {activities.map((activity) => (
              <ListItem key={activity.id} alignItems="flex-start">
                <ListItemAvatar>
                  <Avatar 
                    src={activity.actor.avatarUrl} 
                    alt={`${activity.actor.firstName} ${activity.actor.lastName}`}
                  >
                    {activity.actor.firstName[0]}{activity.actor.lastName[0]}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="body2">
                        <strong>{activity.actor.firstName} {activity.actor.lastName}</strong>
                      </Typography>
                      <Chip
                        label={activity.action}
                        size="small"
                        color={getActionColor(activity.action)}
                        variant="outlined"
                      />
                      <Typography variant="body2">
                        {activity.entityType}
                      </Typography>
                      {getEntityIcon(activity.entityType)}
                    </Box>
                  }
                  secondary={
                    <>
                      <Typography variant="body2" component="span">
                        {activity.entityName}
                      </Typography>
                      <Typography variant="caption" component="span" color="textSecondary" sx={{ ml: 1 }}>
                        {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                      </Typography>
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
}