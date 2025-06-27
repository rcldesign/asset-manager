'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Container,
  Typography,
  Paper,
  Stack,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useRouter } from 'next/navigation';
import { useTasks, useTaskStats } from '@/hooks/use-tasks';
import { TaskFilters } from '@/types';
import { TaskTable } from '@/components/tasks/TaskTable';
import { TaskFiltersComponent } from '@/components/tasks/TaskFilters';
import { TaskStatsCards } from '@/components/tasks/TaskStatsCards';
import { Pagination } from '@/components/ui/Pagination';

export default function TasksPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<TaskFilters>({
    page: 1,
    limit: 20,
    sortBy: 'dueDate',
    order: 'asc',
  });

  const { data, isLoading, isError, error } = useTasks(filters);
  const { data: stats } = useTaskStats();

  const handleFilterChange = (newFilters: Partial<TaskFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: 1, // Reset to first page when filters change
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handleSort = (field: string) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: field,
      order: prev.sortBy === field && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleCreateTask = () => {
    router.push('/tasks/new');
  };

  const handleViewTask = (taskId: string) => {
    router.push(`/tasks/${taskId}`);
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
            Error loading tasks: {error instanceof Error ? error.message : 'Unknown error'}
          </Alert>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Box py={4}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              Tasks
            </Typography>
            {stats && (
              <Stack direction="row" spacing={1}>
                <Chip label={`${stats.total} Total`} size="small" />
                <Chip label={`${stats.overdue} Overdue`} size="small" color="error" />
                <Chip label={`${stats.dueToday} Due Today`} size="small" color="warning" />
              </Stack>
            )}
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateTask}
          >
            New Task
          </Button>
        </Stack>

        {stats && (
          <Box mb={3}>
            <TaskStatsCards stats={stats} />
          </Box>
        )}

        <Paper sx={{ p: 2, mb: 3 }}>
          <TaskFiltersComponent
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </Paper>

        <Paper>
          <TaskTable
            tasks={data?.data || []}
            sortBy={filters.sortBy}
            sortOrder={filters.order}
            onSort={handleSort}
            onViewTask={handleViewTask}
          />
          
          {data && data.totalPages > 1 && (
            <Box p={2}>
              <Pagination
                page={filters.page || 1}
                totalPages={data.totalPages}
                onPageChange={handlePageChange}
              />
            </Box>
          )}
        </Paper>

        {data && (
          <Box mt={2}>
            <Typography variant="body2" color="text.secondary">
              Showing {data.data.length} of {data.total} tasks
            </Typography>
          </Box>
        )}
      </Box>
    </Container>
  );
}