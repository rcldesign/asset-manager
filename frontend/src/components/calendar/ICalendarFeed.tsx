'use client';

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
  TextField,
  InputAdornment,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  RssFeed as FeedIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  CalendarMonth as CalendarIcon,
  Info as InfoIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import {
  useICalendarStatus,
  useGenerateICalendarToken,
  useRevokeICalendarToken,
} from '../../hooks/use-calendar-integration';

export default function ICalendarFeed() {
  const [showDialog, setShowDialog] = React.useState(false);
  const [tokenName, setTokenName] = React.useState('');
  const [copiedUrl, setCopiedUrl] = React.useState<string | null>(null);

  const { data: status, isLoading, refetch } = useICalendarStatus();
  const generateMutation = useGenerateICalendarToken();
  const revokeMutation = useRevokeICalendarToken();

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const hasToken = !!status?.token;
  const feedUrl = hasToken ? `${baseUrl}/api/calendar/ical/${status.token}` : '';

  const handleGenerateToken = async () => {
    try {
      await generateMutation.mutateAsync({ name: tokenName });
      setTokenName('');
      setShowDialog(false);
      await refetch();
    } catch (error) {
      console.error('Failed to generate token:', error);
    }
  };

  const handleRevokeToken = async () => {
    if (confirm('Are you sure you want to revoke this calendar feed? Any applications using this URL will stop receiving updates.')) {
      try {
        await revokeMutation.mutateAsync();
        await refetch();
      } catch (error) {
        console.error('Failed to revoke token:', error);
      }
    }
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const compatibleApps = [
    { name: 'Apple Calendar', icon: '🍎' },
    { name: 'Google Calendar', icon: '📅' },
    { name: 'Outlook', icon: '📧' },
    { name: 'Thunderbird', icon: '🦅' },
    { name: 'Any iCalendar app', icon: '📱' },
  ];

  const feedContents = [
    'All your assigned tasks with due dates',
    'Scheduled maintenance tasks',
    'Task completion status',
    'Real-time updates when tasks change',
  ];

  return (
    <Paper sx={{ p: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <FeedIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h5">
            iCalendar Feed
          </Typography>
        </Box>
        <Typography variant="body2" color="textSecondary">
          Subscribe to your tasks and schedules in any calendar application that supports iCalendar feeds.
        </Typography>
      </Box>

      {!hasToken ? (
        <>
          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle2" gutterBottom>
              What's included in the feed:
            </Typography>
            <List dense>
              {feedContents.map((content, index) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    <CheckIcon color="success" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={content} />
                </ListItem>
              ))}
            </List>
          </Box>

          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Compatible with:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
              {compatibleApps.map((app) => (
                <Chip
                  key={app.name}
                  label={`${app.icon} ${app.name}`}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Box>
          </Alert>

          <Button
            variant="contained"
            size="large"
            startIcon={<AddIcon />}
            onClick={() => setShowDialog(true)}
          >
            Generate Calendar Feed
          </Button>
        </>
      ) : (
        <>
          {/* Feed Status */}
          <Alert 
            severity="success" 
            sx={{ mb: 3 }}
            icon={<FeedIcon />}
          >
            <Typography variant="subtitle2">
              Your calendar feed is active
            </Typography>
            {status.createdAt && (
              <Typography variant="caption">
                Created: {format(new Date(status.createdAt), 'MMM d, yyyy')}
              </Typography>
            )}
          </Alert>

          {/* Feed URL */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle2" gutterBottom>
              Calendar Feed URL
            </Typography>
            <TextField
              fullWidth
              value={feedUrl}
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title={copiedUrl === feedUrl ? 'Copied!' : 'Copy URL'}>
                      <IconButton
                        onClick={() => copyToClipboard(feedUrl)}
                        edge="end"
                        color={copiedUrl === feedUrl ? 'success' : 'default'}
                      >
                        {copiedUrl === feedUrl ? <CheckIcon /> : <CopyIcon />}
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 2 }}
            />
            <Typography variant="caption" color="textSecondary">
              Copy this URL and add it to your calendar application as a subscription.
            </Typography>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Instructions */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom>
              How to Subscribe
            </Typography>
            
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                <strong>Apple Calendar (Mac):</strong>
              </Typography>
              <Typography variant="body2" color="textSecondary">
                1. Open Calendar app → File → New Calendar Subscription<br />
                2. Paste the URL above and click Subscribe<br />
                3. Choose update frequency (recommended: every hour)
              </Typography>
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                <strong>Google Calendar:</strong>
              </Typography>
              <Typography variant="body2" color="textSecondary">
                1. Open Google Calendar → Click + next to &quot;Other calendars&quot;<br />
                2. Select &quot;From URL&quot; → Paste the URL above<br />
                3. Click &quot;Add calendar&quot;
              </Typography>
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                <strong>Outlook:</strong>
              </Typography>
              <Typography variant="body2" color="textSecondary">
                1. Go to Outlook.com → Add calendar → Subscribe from web<br />
                2. Paste the URL above → Enter a calendar name<br />
                3. Click &quot;Import&quot;
              </Typography>
            </Box>
          </Box>

          {/* Actions */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleRevokeToken}
              disabled={revokeMutation.isPending}
            >
              Revoke Feed
            </Button>
          </Box>

          <Alert severity="warning" sx={{ mt: 3 }}>
            <Typography variant="caption">
              <strong>Security Note:</strong> Keep this URL private. Anyone with this URL can view your tasks and schedules.
            </Typography>
          </Alert>
        </>
      )}

      {/* Generate Token Dialog */}
      <Dialog 
        open={showDialog} 
        onClose={() => setShowDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Generate Calendar Feed</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <TextField
              label="Feed Name (Optional)"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              fullWidth
              placeholder="e.g., My Work Calendar"
              helperText="Give your feed a name to help you remember where it's used"
              sx={{ mb: 3 }}
            />
            
            <Alert severity="info">
              <Typography variant="body2">
                This will create a unique URL that you can add to any calendar application. 
                The feed will automatically update when your tasks change.
              </Typography>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDialog(false)}>Cancel</Button>
          <Button
            onClick={handleGenerateToken}
            variant="contained"
            disabled={generateMutation.isPending}
          >
            Generate Feed
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}