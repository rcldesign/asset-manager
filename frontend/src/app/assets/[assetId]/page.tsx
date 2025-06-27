'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Stack,
  CircularProgress,
  Alert,
  Tab,
  Tabs,
  Chip,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import HistoryIcon from '@mui/icons-material/History';
import { useAsset, useDeleteAsset } from '@/hooks/use-assets';
import { AssetDetailsTab } from '@/components/assets/AssetDetailsTab';
import { AssetAttachmentsTab } from '@/components/assets/AssetAttachmentsTab';
import { AssetHistoryTab } from '@/components/assets/AssetHistoryTab';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`asset-tabpanel-${index}`}
      aria-labelledby={`asset-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params.assetId as string;
  const [tabValue, setTabValue] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: asset, isLoading, isError, error } = useAsset(assetId);
  const deleteAssetMutation = useDeleteAsset();

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleEdit = () => {
    router.push(`/assets/${assetId}/edit`);
  };

  const handleDelete = async () => {
    try {
      await deleteAssetMutation.mutateAsync(assetId);
      router.push('/assets');
    } catch (error) {
      console.error('Failed to delete asset:', error);
    }
  };

  if (isLoading) {
    return (
      <Container>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (isError) {
    return (
      <Container>
        <Box mt={4}>
          <Alert severity="error">
            Error loading asset: {error instanceof Error ? error.message : 'Unknown error'}
          </Alert>
        </Box>
      </Container>
    );
  }

  if (!asset) {
    return (
      <Container>
        <Box mt={4}>
          <Alert severity="warning">Asset not found</Alert>
        </Box>
      </Container>
    );
  }

  const statusColors = {
    OPERATIONAL: 'success',
    MAINTENANCE: 'warning',
    REPAIR: 'info',
    RETIRED: 'error',
    DISPOSED: 'default',
    LOST: 'error',
  } as const;

  return (
    <Container maxWidth="lg">
      <Box py={4}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
          <Box>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => router.push('/assets')}
              sx={{ mb: 2 }}
            >
              Back to Assets
            </Button>
            <Typography variant="h4" component="h1" gutterBottom>
              {asset.name}
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Barcode: {asset.barcode}
              </Typography>
              {asset.qrCode && (
                <Chip
                  icon={<QrCode2Icon />}
                  label="QR Code"
                  size="small"
                  variant="outlined"
                />
              )}
              <Chip
                label={asset.status}
                size="small"
                color={statusColors[asset.status]}
              />
            </Stack>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              startIcon={<EditIcon />}
              onClick={handleEdit}
            >
              Edit
            </Button>
            <IconButton
              color="error"
              onClick={() => setDeleteDialogOpen(true)}
              aria-label="Delete asset"
            >
              <DeleteIcon />
            </IconButton>
          </Stack>
        </Stack>

        {/* Tabs */}
        <Paper>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="asset details tabs">
            <Tab label="Details" />
            <Tab 
              label="Attachments" 
              icon={asset.attachments?.length ? <Chip label={asset.attachments.length} size="small" /> : undefined}
              iconPosition="end"
            />
            <Tab label="History" icon={<HistoryIcon />} iconPosition="end" />
          </Tabs>
          <Divider />

          <TabPanel value={tabValue} index={0}>
            <AssetDetailsTab asset={asset} />
          </TabPanel>
          <TabPanel value={tabValue} index={1}>
            <AssetAttachmentsTab assetId={assetId} />
          </TabPanel>
          <TabPanel value={tabValue} index={2}>
            <AssetHistoryTab assetId={assetId} />
          </TabPanel>
        </Paper>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          aria-labelledby="delete-dialog-title"
          aria-describedby="delete-dialog-description"
        >
          <DialogTitle id="delete-dialog-title">
            Delete Asset
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="delete-dialog-description">
              Are you sure you want to delete &quot;{asset.name}&quot;? This action cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleDelete} 
              color="error" 
              variant="contained"
              disabled={deleteAssetMutation.isPending}
            >
              {deleteAssetMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
}