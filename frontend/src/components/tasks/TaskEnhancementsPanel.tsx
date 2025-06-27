'use client';

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Avatar,
  AvatarGroup,
  Collapse,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Person as PersonIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
} from '@mui/icons-material';
import {
  useAssignUsers,
  useUnassignUser,
  useCreateSubtask,
  useUpdateSubtask,
  useDeleteSubtask,
  useUpdateCompletionRequirements,
  useUpdateChecklistItem,
} from '../../hooks/use-task-enhancements';
import { useUsers } from '../../hooks/use-users';
import type { EnhancedTask, Subtask, CompletionRequirement } from '../../api/task-enhancements-api';

interface TaskEnhancementsPanelProps {
  task: EnhancedTask;
}

export default function TaskEnhancementsPanel({ task }: TaskEnhancementsPanelProps) {
  const [assignDialogOpen, setAssignDialogOpen] = React.useState(false);
  const [subtaskDialogOpen, setSubtaskDialogOpen] = React.useState(false);
  const [editingSubtask, setEditingSubtask] = React.useState<Subtask | null>(null);
  const [requirementsExpanded, setRequirementsExpanded] = React.useState(true);
  const [subtasksExpanded, setSubtasksExpanded] = React.useState(true);

  // Form states
  const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([]);
  const [subtaskTitle, setSubtaskTitle] = React.useState('');
  const [subtaskDescription, setSubtaskDescription] = React.useState('');
  const [newChecklistItem, setNewChecklistItem] = React.useState('');

  // Queries and mutations
  const { data: usersData } = useUsers();
  const assignUsersMutation = useAssignUsers();
  const unassignUserMutation = useUnassignUser();
  const createSubtaskMutation = useCreateSubtask();
  const updateSubtaskMutation = useUpdateSubtask();
  const deleteSubtaskMutation = useDeleteSubtask();
  const updateRequirementsMutation = useUpdateCompletionRequirements();
  const updateChecklistMutation = useUpdateChecklistItem();

  const handleAssignUsers = async () => {
    try {
      await assignUsersMutation.mutateAsync({ taskId: task.id, userIds: selectedUserIds });
      setSelectedUserIds([]);
      setAssignDialogOpen(false);
    } catch (error) {
      console.error('Failed to assign users:', error);
    }
  };

  const handleUnassignUser = async (userId: string) => {
    try {
      await unassignUserMutation.mutateAsync({ taskId: task.id, userId });
    } catch (error) {
      console.error('Failed to unassign user:', error);
    }
  };

  const handleCreateSubtask = async () => {
    try {
      if (editingSubtask) {
        await updateSubtaskMutation.mutateAsync({
          taskId: task.id,
          subtaskId: editingSubtask.id,
          updates: { title: subtaskTitle, description: subtaskDescription },
        });
      } else {
        await createSubtaskMutation.mutateAsync({
          parentTaskId: task.id,
          title: subtaskTitle,
          description: subtaskDescription,
        });
      }
      setSubtaskTitle('');
      setSubtaskDescription('');
      setEditingSubtask(null);
      setSubtaskDialogOpen(false);
    } catch (error) {
      console.error('Failed to save subtask:', error);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    try {
      await deleteSubtaskMutation.mutateAsync({ taskId: task.id, subtaskId });
    } catch (error) {
      console.error('Failed to delete subtask:', error);
    }
  };

  const handleUpdateSubtaskStatus = async (subtask: Subtask, status: Subtask['status']) => {
    try {
      await updateSubtaskMutation.mutateAsync({
        taskId: task.id,
        subtaskId: subtask.id,
        updates: { status },
      });
    } catch (error) {
      console.error('Failed to update subtask status:', error);
    }
  };

  const handleAddChecklistItem = async () => {
    if (!newChecklistItem.trim()) return;

    const currentChecklist = task.completionRequirements?.checklist || [];
    const newItem = {
      id: Date.now().toString(),
      label: newChecklistItem.trim(),
      completed: false,
    };

    try {
      await updateRequirementsMutation.mutateAsync({
        taskId: task.id,
        requirements: {
          ...task.completionRequirements,
          checklist: [...currentChecklist, newItem],
        },
      });
      setNewChecklistItem('');
    } catch (error) {
      console.error('Failed to add checklist item:', error);
    }
  };

  const handleToggleChecklistItem = async (itemId: string, completed: boolean) => {
    try {
      await updateChecklistMutation.mutateAsync({
        taskId: task.id,
        itemId,
        completed,
      });
    } catch (error) {
      console.error('Failed to update checklist item:', error);
    }
  };

  const completedSubtasks = task.subtasks.filter(s => s.status === 'DONE').length;
  const subtaskProgress = task.subtasks.length > 0 
    ? (completedSubtasks / task.subtasks.length) * 100 
    : 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Assignments Section */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Assigned Users</Typography>
          <Button
            startIcon={<AddIcon />}
            onClick={() => setAssignDialogOpen(true)}
            size="small"
          >
            Assign
          </Button>
        </Box>

        {task.assignments.length > 0 ? (
          <AvatarGroup max={5}>
            {task.assignments.map((assignment) => (
              <Avatar
                key={assignment.id}
                sx={{ cursor: 'pointer' }}
                onClick={() => handleUnassignUser(assignment.userId)}
                title={`${assignment.user?.fullName || assignment.user?.email} - Click to remove`}
              >
                {assignment.user?.fullName?.[0] || assignment.user?.email?.[0] || <PersonIcon />}
              </Avatar>
            ))}
          </AvatarGroup>
        ) : (
          <Typography variant="body2" color="textSecondary">
            No users assigned
          </Typography>
        )}
      </Paper>

      {/* Subtasks Section */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6">Subtasks</Typography>
            <IconButton
              size="small"
              onClick={() => setSubtasksExpanded(!subtasksExpanded)}
            >
              {subtasksExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Button
            startIcon={<AddIcon />}
            onClick={() => {
              setEditingSubtask(null);
              setSubtaskTitle('');
              setSubtaskDescription('');
              setSubtaskDialogOpen(true);
            }}
            size="small"
          >
            Add Subtask
          </Button>
        </Box>

        {task.subtasks.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress 
              variant="determinate" 
              value={subtaskProgress}
              sx={{ height: 8, borderRadius: 1 }}
            />
            <Typography variant="caption" color="textSecondary">
              {completedSubtasks} of {task.subtasks.length} completed
            </Typography>
          </Box>
        )}

        <Collapse in={subtasksExpanded}>
          <List>
            {task.subtasks.map((subtask) => (
              <ListItem key={subtask.id} sx={{ pl: 0 }}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography
                        sx={{
                          textDecoration: subtask.status === 'DONE' ? 'line-through' : 'none',
                        }}
                      >
                        {subtask.title}
                      </Typography>
                      <Chip
                        label={subtask.status}
                        size="small"
                        color={
                          subtask.status === 'DONE' ? 'success' :
                          subtask.status === 'IN_PROGRESS' ? 'warning' :
                          'default'
                        }
                      />
                    </Box>
                  }
                  secondary={subtask.description}
                />
                <ListItemSecondaryAction>
                  <FormControl size="small" sx={{ mr: 1, minWidth: 120 }}>
                    <Select
                      value={subtask.status}
                      onChange={(e) => handleUpdateSubtaskStatus(
                        subtask, 
                        e.target.value as Subtask['status']
                      )}
                    >
                      <MenuItem value="PLANNED">Planned</MenuItem>
                      <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                      <MenuItem value="DONE">Done</MenuItem>
                      <MenuItem value="SKIPPED">Skipped</MenuItem>
                    </Select>
                  </FormControl>
                  <IconButton
                    edge="end"
                    onClick={() => {
                      setEditingSubtask(subtask);
                      setSubtaskTitle(subtask.title);
                      setSubtaskDescription(subtask.description || '');
                      setSubtaskDialogOpen(true);
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    edge="end"
                    onClick={() => handleDeleteSubtask(subtask.id)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Collapse>
      </Paper>

      {/* Completion Requirements Section */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6">Completion Requirements</Typography>
            <IconButton
              size="small"
              onClick={() => setRequirementsExpanded(!requirementsExpanded)}
            >
              {requirementsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
        </Box>

        <Collapse in={requirementsExpanded}>
          {/* Checklist */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Checklist
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                placeholder="Add checklist item"
                size="small"
                fullWidth
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddChecklistItem();
                  }
                }}
              />
              <Button
                onClick={handleAddChecklistItem}
                variant="outlined"
                size="small"
              >
                Add
              </Button>
            </Box>
            <List>
              {(task.completionRequirements?.checklist || []).map((item) => (
                <ListItem key={item.id} dense>
                  <IconButton
                    edge="start"
                    onClick={() => handleToggleChecklistItem(item.id, !item.completed)}
                  >
                    {item.completed ? (
                      <CheckCircleIcon color="success" />
                    ) : (
                      <RadioButtonUncheckedIcon />
                    )}
                  </IconButton>
                  <ListItemText
                    primary={item.label}
                    sx={{
                      textDecoration: item.completed ? 'line-through' : 'none',
                    }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>

          {/* Other Requirements */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={task.completionRequirements?.photoRequired || false}
                  onChange={(e) => {
                    updateRequirementsMutation.mutate({
                      taskId: task.id,
                      requirements: {
                        ...task.completionRequirements,
                        photoRequired: e.target.checked,
                      },
                    });
                  }}
                />
              }
              label="Photo Required"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={task.completionRequirements?.signatureRequired || false}
                  onChange={(e) => {
                    updateRequirementsMutation.mutate({
                      taskId: task.id,
                      requirements: {
                        ...task.completionRequirements,
                        signatureRequired: e.target.checked,
                      },
                    });
                  }}
                />
              }
              label="Signature Required"
            />
          </Box>
        </Collapse>
      </Paper>

      {/* Assign Users Dialog */}
      <Dialog open={assignDialogOpen} onClose={() => setAssignDialogOpen(false)}>
        <DialogTitle>Assign Users</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Select Users</InputLabel>
            <Select
              multiple
              value={selectedUserIds}
              onChange={(e) => setSelectedUserIds(e.target.value as string[])}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => {
                    const user = usersData?.users.find(u => u.id === value);
                    return (
                      <Chip key={value} label={user?.fullName || user?.email} />
                    );
                  })}
                </Box>
              )}
            >
              {usersData?.users.map((user) => (
                <MenuItem 
                  key={user.id} 
                  value={user.id}
                  disabled={task.assignments.some(a => a.userId === user.id)}
                >
                  {user.fullName || user.email}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAssignUsers} variant="contained">
            Assign
          </Button>
        </DialogActions>
      </Dialog>

      {/* Subtask Dialog */}
      <Dialog open={subtaskDialogOpen} onClose={() => setSubtaskDialogOpen(false)}>
        <DialogTitle>
          {editingSubtask ? 'Edit Subtask' : 'Create Subtask'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Title"
              value={subtaskTitle}
              onChange={(e) => setSubtaskTitle(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={subtaskDescription}
              onChange={(e) => setSubtaskDescription(e.target.value)}
              fullWidth
              multiline
              rows={3}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubtaskDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleCreateSubtask} 
            variant="contained"
            disabled={!subtaskTitle.trim()}
          >
            {editingSubtask ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}