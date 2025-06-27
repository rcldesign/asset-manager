'use client';

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Tooltip,
  TablePagination,
} from '@mui/material';
import {
  Add as AddIcon,
  Send as SendIcon,
  Cancel as CancelIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import {
  useInvitations,
  useCreateInvitation,
  useResendInvitation,
  useCancelInvitation,
} from '../../hooks/use-invitations';
import type { CreateInvitationDto } from '../../api/invitations-api';

export default function InvitationManager() {
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [inviteDialogOpen, setInviteDialogOpen] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = React.useState<CreateInvitationDto>({
    email: '',
    role: 'MEMBER',
    message: '',
  });

  // Queries and mutations
  const { data, isLoading, refetch } = useInvitations({
    page: page + 1,
    limit: rowsPerPage,
  });
  const createMutation = useCreateInvitation();
  const resendMutation = useResendInvitation();
  const cancelMutation = useCancelInvitation();

  const handleCreateInvitation = async () => {
    try {
      await createMutation.mutateAsync(formData);
      setFormData({ email: '', role: 'MEMBER', message: '' });
      setInviteDialogOpen(false);
    } catch (error) {
      console.error('Failed to create invitation:', error);
    }
  };

  const handleResendInvitation = async (id: string) => {
    try {
      await resendMutation.mutateAsync(id);
    } catch (error) {
      console.error('Failed to resend invitation:', error);
    }
  };

  const handleCancelInvitation = async (id: string) => {
    if (confirm('Are you sure you want to cancel this invitation?')) {
      try {
        await cancelMutation.mutateAsync(id);
      } catch (error) {
        console.error('Failed to cancel invitation:', error);
      }
    }
  };

  const copyInviteLink = (token: string) => {
    const inviteLink = `${window.location.origin}/accept-invitation?token=${token}`;
    navigator.clipboard.writeText(inviteLink);
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusColor = (invitation: any) => {
    if (invitation.acceptedAt) return 'success';
    if (new Date(invitation.expiresAt) < new Date()) return 'error';
    return 'warning';
  };

  const getStatusLabel = (invitation: any) => {
    if (invitation.acceptedAt) return 'Accepted';
    if (new Date(invitation.expiresAt) < new Date()) return 'Expired';
    return 'Pending';
  };

  return (
    <Box>
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5">User Invitations</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              startIcon={<RefreshIcon />}
              onClick={() => refetch()}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setInviteDialogOpen(true)}
            >
              Invite User
            </Button>
          </Box>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Invited By</TableCell>
                <TableCell>Expires</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : data?.invitations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No invitations found
                  </TableCell>
                </TableRow>
              ) : (
                data?.invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>{invitation.email}</TableCell>
                    <TableCell>
                      <Chip label={invitation.role} size="small" />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getStatusLabel(invitation)}
                        color={getStatusColor(invitation)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {invitation.invitedBy?.fullName || invitation.invitedBy?.email}
                    </TableCell>
                    <TableCell>
                      {format(new Date(invitation.expiresAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell align="right">
                      {!invitation.acceptedAt && new Date(invitation.expiresAt) > new Date() && (
                        <>
                          <Tooltip title="Copy invite link">
                            <IconButton
                              onClick={() => copyInviteLink(invitation.token)}
                              color={copiedId === invitation.token ? 'success' : 'default'}
                            >
                              <CopyIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Resend invitation email">
                            <IconButton
                              onClick={() => handleResendInvitation(invitation.id)}
                              disabled={resendMutation.isPending}
                            >
                              <SendIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Cancel invitation">
                            <IconButton
                              onClick={() => handleCancelInvitation(invitation.id)}
                              disabled={cancelMutation.isPending}
                              color="error"
                            >
                              <CancelIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={data?.total || 0}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Create Invitation Dialog */}
      <Dialog 
        open={inviteDialogOpen} 
        onClose={() => setInviteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Invite New User</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Email Address"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              fullWidth
              required
              error={!!createMutation.error}
            />

            <FormControl fullWidth required>
              <InputLabel>Role</InputLabel>
              <Select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                label="Role"
              >
                <MenuItem value="VIEWER">Viewer</MenuItem>
                <MenuItem value="MEMBER">Member</MenuItem>
                <MenuItem value="MANAGER">Manager</MenuItem>
                <MenuItem value="OWNER">Owner</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Personal Message (Optional)"
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              fullWidth
              multiline
              rows={3}
              helperText="This message will be included in the invitation email"
            />

            {createMutation.isError && (
              <Alert severity="error">
                Failed to send invitation. Please check the email address and try again.
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreateInvitation}
            variant="contained"
            disabled={!formData.email || createMutation.isPending}
          >
            Send Invitation
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}