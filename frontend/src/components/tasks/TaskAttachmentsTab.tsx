import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  CircularProgress,
  Alert,
  Stack,
  Paper,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTaskAttachments, useUploadTaskAttachment, useDeleteTaskAttachment } from '@/hooks/use-tasks';
import { format } from 'date-fns';

interface TaskAttachmentsTabProps {
  taskId: string;
}

export const TaskAttachmentsTab: React.FC<TaskAttachmentsTabProps> = ({ taskId }) => {
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  const { data: attachments, isLoading, isError, error } = useTaskAttachments(taskId);
  const uploadMutation = useUploadTaskAttachment();
  const deleteMutation = useDeleteTaskAttachment();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset error state
    setUploadError(null);

    // Check file size (20MB limit)
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('File size must be less than 20MB');
      return;
    }

    try {
      await uploadMutation.mutateAsync({ taskId, file });
      // Reset the input
      event.target.value = '';
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    }
  };

  const handleDownload = (attachmentId: string, filename: string) => {
    // Create a temporary link element and trigger download
    const link = document.createElement('a');
    link.href = `/api/tasks/${taskId}/attachments/${attachmentId}/download`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (attachmentId: string) => {
    if (!window.confirm('Are you sure you want to delete this attachment?')) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ taskId, attachmentId });
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return (
      <Alert severity="error">
        Error loading attachments: {error instanceof Error ? error.message : 'Unknown error'}
      </Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <input
          accept="*/*"
          style={{ display: 'none' }}
          id="upload-file"
          type="file"
          onChange={handleFileUpload}
          disabled={uploadMutation.isPending}
        />
        <label htmlFor="upload-file">
          <Button
            variant="contained"
            component="span"
            startIcon={<CloudUploadIcon />}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? 'Uploading...' : 'Upload File'}
          </Button>
        </label>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
          Maximum file size: 20MB
        </Typography>
      </Box>

      {uploadError && (
        <Alert severity="error" onClose={() => setUploadError(null)}>
          {uploadError}
        </Alert>
      )}

      {attachments && attachments.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <AttachFileIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="body1" color="text.secondary">
            No attachments yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Upload files to attach them to this task
          </Typography>
        </Paper>
      ) : (
        <List>
          {attachments?.map((attachment: { id: string; filename: string; size: number; uploadedAt: string; uploadedBy?: { fullName?: string; email: string } }) => (
            <ListItem
              key={attachment.id}
              divider
              secondaryAction={
                <Stack direction="row" spacing={1}>
                  <IconButton
                    edge="end"
                    aria-label="download"
                    onClick={() => handleDownload(attachment.id, attachment.filename)}
                  >
                    <DownloadIcon />
                  </IconButton>
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => handleDelete(attachment.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Stack>
              }
            >
              <ListItemIcon>
                <AttachFileIcon />
              </ListItemIcon>
              <ListItemText
                primary={attachment.filename}
                secondary={
                  <Stack direction="row" spacing={2} component="span">
                    <span>{formatFileSize(attachment.size)}</span>
                    <span>•</span>
                    <span>{format(new Date(attachment.uploadedAt), 'PPP')}</span>
                    <span>•</span>
                    <span>by {attachment.uploadedBy?.fullName || attachment.uploadedBy?.email}</span>
                  </Stack>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Stack>
  );
};