import { Box, Typography, Paper, Chip } from '@mui/material';
import { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, getDay, addMonths, subMonths } from 'date-fns';
import { IconButton } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';

interface MiniCalendarProps {
  tasks?: Array<{
    dueDate: string;
    status: string;
  }>;
  onDateClick?: (date: Date) => void;
}

export function MiniCalendar({ tasks = [], onDateClick }: MiniCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Add padding days from previous month
  const startDay = getDay(monthStart);
  const paddingDays = Array(startDay).fill(null);

  // Count tasks per day
  const taskCountByDate: Record<string, number> = {};
  tasks.forEach(task => {
    if (task.dueDate && task.status !== 'DONE') {
      const dateKey = format(new Date(task.dueDate), 'yyyy-MM-dd');
      taskCountByDate[dateKey] = (taskCountByDate[dateKey] || 0) + 1;
    }
  });

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Paper sx={{ p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">
          {format(currentMonth, 'MMMM yyyy')}
        </Typography>
        <Box>
          <IconButton size="small" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft />
          </IconButton>
          <IconButton size="small" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight />
          </IconButton>
        </Box>
      </Box>

      <Box display="grid" gridTemplateColumns="repeat(7, 1fr)" gap={0.5}>
        {weekDays.map(day => (
          <Box key={day} textAlign="center" py={0.5}>
            <Typography variant="caption" color="textSecondary">
              {day}
            </Typography>
          </Box>
        ))}

        {paddingDays.map((_, index) => (
          <Box key={`padding-${index}`} />
        ))}

        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const taskCount = taskCountByDate[dateKey] || 0;
          const isToday = isSameDay(day, new Date());

          return (
            <Box
              key={day.toISOString()}
              sx={{
                aspectRatio: '1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: onDateClick ? 'pointer' : 'default',
                borderRadius: 1,
                position: 'relative',
                backgroundColor: isToday ? 'primary.light' : 'transparent',
                '&:hover': onDateClick ? {
                  backgroundColor: 'action.hover',
                } : {},
              }}
              onClick={() => onDateClick?.(day)}
            >
              <Typography
                variant="body2"
                color={isToday ? 'primary.contrastText' : 'textPrimary'}
              >
                {format(day, 'd')}
              </Typography>
              {taskCount > 0 && (
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 2,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: taskCount > 2 ? 'error.main' : 'warning.main',
                  }}
                />
              )}
            </Box>
          );
        })}
      </Box>

      <Box mt={2}>
        <Typography variant="caption" color="textSecondary">
          Click on a date to view tasks
        </Typography>
      </Box>
    </Paper>
  );
}