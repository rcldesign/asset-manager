'use client';

import { 
  Box, 
  Grid, 
  Paper, 
  Typography, 
  Button, 
  ButtonGroup,
  Chip,
  Avatar,
  IconButton,
  FormControl,
  Select,
  MenuItem,
  Card,
  CardContent,
  CardActions,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  Divider
} from '@mui/material';
import { 
  ViewKanban as KanbanIcon,
  ViewList as ListIcon,
  Person as PersonIcon,
  Group as TeamIcon,
  AccessTime as TimeIcon,
  Flag as FlagIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { useState, useMemo } from 'react';
import { useTasks } from '@/hooks/use-tasks';
import { useDashboardOverview, useDashboardKPIs } from '@/hooks/use-dashboard';
import { Task, TaskStatus, TaskPriority } from '@/types';
import { StatCard } from '@/components/Dashboard/StatCard';
import { ChartContainer } from '@/components/Dashboard/ChartContainer';
import { BarChart } from '@/components/Dashboard/BarChart';
import { PieChart } from '@/components/Dashboard/PieChart';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

type ViewMode = 'kanban' | 'list';
type TaskFilter = 'my' | 'team' | 'all';

const statusColumns: TaskStatus[] = ['PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'SKIPPED'];

export default function TaskDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('my');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');

  const { data: overview, isLoading: overviewLoading } = useDashboardOverview();
  const { data: kpis, isLoading: kpisLoading } = useDashboardKPIs('month', true);
  
  // Build filters based on task filter mode
  const filters = useMemo(() => {
    const baseFilters: any = { limit: 1000 };
    
    if (taskFilter === 'my' && user) {
      baseFilters.assignedUserId = user.id;
    }
    
    if (priorityFilter !== 'all') {
      baseFilters.priority = priorityFilter;
    }
    
    return baseFilters;
  }, [taskFilter, priorityFilter, user]);

  const { data: tasksData, isLoading: tasksLoading } = useTasks(filters);

  // Group tasks by status for kanban view
  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      PLANNED: [],
      IN_PROGRESS: [],
      DONE: [],
      CANCELLED: [],
      SKIPPED: [],
    };

    if (tasksData?.data) {
      tasksData.data.forEach(task => {
        grouped[task.status].push(task);
      });
    }

    return grouped;
  }, [tasksData]);

  // Calculate workload distribution
  const workloadData = useMemo(() => {
    if (!tasksData?.data) return null;

    const workload: Record<string, number> = {};
    
    tasksData.data.forEach(task => {
      if (task.assignedUser) {
        const userName = task.assignedUser.fullName;
        workload[userName] = (workload[userName] || 0) + 1;
      }
    });

    const sorted = Object.entries(workload)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10); // Top 10 users

    return {
      labels: sorted.map(([name]) => name),
      datasets: [{
        label: 'Tasks Assigned',
        data: sorted.map(([, count]) => count),
        backgroundColor: '#1976d2',
      }]
    };
  }, [tasksData]);

  // Calculate priority distribution
  const priorityData = useMemo(() => {
    if (!overview?.tasks.byPriority) return null;

    const priorityColors: Record<string, string> = {
      LOW: '#4caf50',
      MEDIUM: '#ff9800',
      HIGH: '#ff5722',
      URGENT: '#f44336',
    };

    return {
      labels: Object.keys(overview.tasks.byPriority),
      datasets: [{
        label: 'Tasks by Priority',
        data: Object.values(overview.tasks.byPriority),
        backgroundColor: Object.keys(overview.tasks.byPriority).map(p => priorityColors[p]),
      }]
    };
  }, [overview]);

  const getPriorityColor = (priority: TaskPriority) => {
    const colors: Record<TaskPriority, string> = {
      LOW: '#4caf50',
      MEDIUM: '#ff9800',
      HIGH: '#ff5722',
      URGENT: '#f44336',
    };
    return colors[priority];
  };

  const renderKanbanCard = (task: Task) => (
    <Card 
      key={task.id} 
      sx={{ mb: 2, cursor: 'pointer' }}
      onClick={() => router.push(`/tasks/${task.id}`)}
    >
      <CardContent>
        <Typography variant="subtitle2" gutterBottom>
          {task.title}
        </Typography>
        {task.asset && (
          <Typography variant="caption" color="textSecondary" display="block">
            {task.asset.name}
          </Typography>
        )}
        <Box display="flex" gap={1} mt={1} flexWrap="wrap">
          <Chip
            size="small"
            label={task.priority}
            sx={{ 
              backgroundColor: getPriorityColor(task.priority),
              color: 'white',
              fontSize: '0.7rem'
            }}
          />
          {task.dueDate && (
            <Chip
              size="small"
              icon={<TimeIcon sx={{ fontSize: '0.9rem' }} />}
              label={formatDistanceToNow(parseISO(task.dueDate), { addSuffix: true })}
              variant="outlined"
            />
          )}
        </Box>
      </CardContent>
      {task.assignedUser && (
        <CardActions>
          <Box display="flex" alignItems="center" gap={1}>
            <Avatar sx={{ width: 24, height: 24, fontSize: '0.8rem' }}>
              {task.assignedUser.fullName.split(' ').map(n => n[0]).join('')}
            </Avatar>
            <Typography variant="caption">
              {task.assignedUser.fullName}
            </Typography>
          </Box>
        </CardActions>
      )}
    </Card>
  );

  const renderListItem = (task: Task) => (
    <ListItem 
      key={task.id}
      button
      onClick={() => router.push(`/tasks/${task.id}`)}
    >
      <ListItemAvatar>
        <Avatar sx={{ backgroundColor: getPriorityColor(task.priority) }}>
          <FlagIcon />
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={task.title}
        secondary={
          <Box>
            {task.asset && <Typography variant="caption">{task.asset.name}</Typography>}
            {task.dueDate && (
              <Typography variant="caption" sx={{ ml: task.asset ? 1 : 0 }}>
                Due {formatDistanceToNow(parseISO(task.dueDate), { addSuffix: true })}
              </Typography>
            )}
          </Box>
        }
      />
      <ListItemSecondaryAction>
        {task.assignedUser && (
          <Chip
            size="small"
            avatar={<Avatar>{task.assignedUser.fullName[0]}</Avatar>}
            label={task.assignedUser.fullName}
          />
        )}
      </ListItemSecondaryAction>
    </ListItem>
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Task Dashboard
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/tasks/new')}
        >
          New Task
        </Button>
      </Box>

      {/* Summary Stats */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Tasks"
            value={overview?.tasks.total || 0}
            subtitle="Active tasks"
            icon={<FlagIcon fontSize="large" />}
            color="#1976d2"
            loading={overviewLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Overdue"
            value={overview?.tasks.overdue || 0}
            subtitle="Need attention"
            icon={<TimeIcon fontSize="large" />}
            color="#f44336"
            loading={overviewLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Completion Rate"
            value={kpis?.taskCompletionRate.current ? `${Math.round(kpis.taskCompletionRate.current)}%` : '0%'}
            subtitle="This month"
            icon={<FlagIcon fontSize="large" />}
            color="#4caf50"
            loading={kpisLoading}
            trend={kpis?.taskCompletionRate.change ? {
              value: Math.round(kpis.taskCompletionRate.change),
              label: 'vs last month'
            } : undefined}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Avg Duration"
            value={kpis?.averageTaskDuration.current ? `${Math.round(kpis.averageTaskDuration.current)}h` : '0h'}
            subtitle="Task completion time"
            icon={<TimeIcon fontSize="large" />}
            color="#ff9800"
            loading={kpisLoading}
          />
        </Grid>
      </Grid>

      {/* Controls */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <ButtonGroup variant="outlined">
            <Button
              onClick={() => setViewMode('kanban')}
              variant={viewMode === 'kanban' ? 'contained' : 'outlined'}
              startIcon={<KanbanIcon />}
            >
              Kanban
            </Button>
            <Button
              onClick={() => setViewMode('list')}
              variant={viewMode === 'list' ? 'contained' : 'outlined'}
              startIcon={<ListIcon />}
            >
              List
            </Button>
          </ButtonGroup>

          <Box display="flex" gap={2}>
            <ButtonGroup variant="outlined">
              <Button
                onClick={() => setTaskFilter('my')}
                variant={taskFilter === 'my' ? 'contained' : 'outlined'}
                startIcon={<PersonIcon />}
              >
                My Tasks
              </Button>
              <Button
                onClick={() => setTaskFilter('team')}
                variant={taskFilter === 'team' ? 'contained' : 'outlined'}
                startIcon={<TeamIcon />}
              >
                Team Tasks
              </Button>
              <Button
                onClick={() => setTaskFilter('all')}
                variant={taskFilter === 'all' ? 'contained' : 'outlined'}
              >
                All Tasks
              </Button>
            </ButtonGroup>

            <FormControl size="small">
              <Select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as any)}
              >
                <MenuItem value="all">All Priorities</MenuItem>
                <MenuItem value="LOW">Low</MenuItem>
                <MenuItem value="MEDIUM">Medium</MenuItem>
                <MenuItem value="HIGH">High</MenuItem>
                <MenuItem value="URGENT">Urgent</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>
      </Paper>

      {/* Main Content */}
      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          {viewMode === 'kanban' ? (
            <Paper sx={{ p: 2 }}>
              <Grid container spacing={2}>
                {statusColumns.map(status => (
                  <Grid item xs={12} sm={6} md={3} key={status}>
                    <Box
                      sx={{
                        backgroundColor: '#f5f5f5',
                        borderRadius: 1,
                        p: 2,
                        minHeight: 400,
                      }}
                    >
                      <Typography variant="subtitle1" gutterBottom>
                        {status.replace('_', ' ')}
                        <Chip
                          size="small"
                          label={tasksByStatus[status].length}
                          sx={{ ml: 1 }}
                        />
                      </Typography>
                      <Box>
                        {tasksByStatus[status].map(task => renderKanbanCard(task))}
                      </Box>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Paper>
          ) : (
            <Paper>
              <List>
                {tasksData?.data.map((task, index) => (
                  <Box key={task.id}>
                    {renderListItem(task)}
                    {index < tasksData.data.length - 1 && <Divider />}
                  </Box>
                ))}
              </List>
            </Paper>
          )}
        </Grid>

        {/* Side Charts */}
        <Grid item xs={12} lg={4}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <ChartContainer
                title="Workload Distribution"
                subtitle="Tasks per team member"
                loading={tasksLoading}
                height={300}
              >
                {workloadData && <BarChart data={workloadData} horizontal />}
              </ChartContainer>
            </Grid>
            <Grid item xs={12}>
              <ChartContainer
                title="Priority Breakdown"
                loading={overviewLoading}
                height={300}
              >
                {priorityData && <PieChart data={priorityData} type="doughnut" />}
              </ChartContainer>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
}