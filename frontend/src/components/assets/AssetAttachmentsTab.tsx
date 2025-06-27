import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionIcon from '@mui/icons-material/Description';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { 
  useAssetAttachments, 
  useUploadAssetAttachment, 
  useDeleteAssetAttachment,
  useSetPrimaryAttachment 
} from '@/hooks/use-assets';
import { format } from 'date-fns';

interface AssetAttachmentsTabProps {
  assetId: string;
}

const attachmentTypes = [
  { value: 'IMAGE', label: 'Image' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'WARRANTY', label: 'Warranty' },
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'OTHER', label: 'Other' },
];

export const AssetAttachmentsTab: React.FC<AssetAttachmentsTabProps> = ({ assetId }) => {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedType, setSelectedType] = useState('IMAGE');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<string | null>(null);

  const { data: attachments, isLoading, error } = useAssetAttachments(assetId);
  const uploadMutation = useUploadAssetAttachment();
  const deleteMutation = useDeleteAssetAttachment();
  const setPrimaryMutation = useSetPrimaryAttachment();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      await uploadMutation.mutateAsync({
        assetId,
        file: selectedFile,
        type: selectedType,
      });
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setSelectedType('IMAGE');
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  const handleDelete = async () => {
    if (!attachmentToDelete) return;

    try {
      await deleteMutation.mutateAsync({
        assetId,
        attachmentId: attachmentToDelete,
      });
      setDeleteConfirmOpen(false);
      setAttachmentToDelete(null);
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleSetPrimary = async (attachmentId: string) => {
    try {
      await setPrimaryMutation.mutateAsync({
        assetId,
        attachmentId,
      });
    } catch (error) {
      console.error('Set primary failed:', error);
    }
  };

  const handleDownload = (attachment: { id: string; originalFilename: string }) => {
    // Create a download link
    const link = document.createElement('a');
    link.href = `/api/assets/${assetId}/attachments/${attachment.id}/download`;
    link.download = attachment.originalFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon />;
    if (mimeType.includes('pdf')) return <DescriptionIcon />;
    return <InsertDriveFileIcon />;
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">
          Error loading attachments: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6">
          Attachments ({attachments?.length || 0})
        </Typography>
        <Button
          variant="contained"
          startIcon={<CloudUploadIcon />}
          onClick={() => setUploadDialogOpen(true)}
        >
          Upload
        </Button>
      </Stack>

      {attachments && attachments.length > 0 ? (
        <List>
          {attachments.map((attachment) => (
            <Paper key={attachment.id} sx={{ mb: 1 }}>
              <ListItem>
                <ListItemIcon>
                  {getFileIcon(attachment.mimeType)}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography>{attachment.originalFilename}</Typography>
                      {attachment.isPrimary && (
                        <Chip label="Primary" size="small" color="primary" />
                      )}
                      <Chip label={attachment.type} size="small" variant="outlined" />
                    </Stack>
                  }
                  secondary={
                    <Stack direction="row" spacing={2}>
                      <Typography variant="caption">
                        {formatFileSize(attachment.fileSize)}
                      </Typography>
                      <Typography variant="caption">
                        Uploaded {format(new Date(attachment.uploadDate), 'MMM dd, yyyy')}
                      </Typography>
                    </Stack>
                  }
                />
                <ListItemSecondaryAction>
                  <Stack direction="row" spacing={0}>
                    <IconButton
                      size="small"
                      onClick={() => handleSetPrimary(attachment.id)}
                      disabled={attachment.isPrimary || setPrimaryMutation.isPending}
                      title={attachment.isPrimary ? 'Already primary' : 'Set as primary'}
                    >
                      {attachment.isPrimary ? <StarIcon color="primary" /> : <StarBorderIcon />}
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDownload(attachment)}
                      title="Download"
                    >
                      <DownloadIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => {
                        setAttachmentToDelete(attachment.id);
                        setDeleteConfirmOpen(true);
                      }}
                      title="Delete"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Stack>
                </ListItemSecondaryAction>
              </ListItem>
            </Paper>
          ))}
        </List>
      ) : (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No attachments yet. Click Upload to add files.
          </Typography>
        </Paper>
      )}

      {/* Upload Dialog */}
      <Dialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Upload Attachment</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Box>
              <input
                accept="*"
                style={{ display: 'none' }}
                id="file-upload"
                type="file"
                onChange={handleFileSelect}
              />
              <label htmlFor="file-upload">
                <Button
                  variant="outlined"
                  component="span"
                  fullWidth
                  startIcon={<CloudUploadIcon />}
                >
                  {selectedFile ? selectedFile.name : 'Choose File'}
                </Button>
              </label>
            </Box>
            <FormControl fullWidth>
              <InputLabel>Attachment Type</InputLabel>
              <Select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                label="Attachment Type"
              >
                {attachmentTypes.map((type) => (
                  <MenuItem key={type.value} value={type.value}>
                    {type.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleUpload}
            variant="contained"
            disabled={!selectedFile || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>Delete Attachment</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this attachment? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};