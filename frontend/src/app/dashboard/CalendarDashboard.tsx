'use client';

import { Box, Paper, Typography, Button, ButtonGroup, Chip, FormControl, Select, MenuItem } from '@mui/material';
import { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useTasks } from '@/hooks/use-tasks';
import { useSchedules } from '@/hooks/use-schedules';
import { Task, TaskStatus, TaskPriority } from '@/types';
import { parseISO, format } from 'date-fns';
import { useRouter } from 'next/navigation';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps: {
    type: 'task' | 'schedule';
    status?: TaskStatus;
    priority?: TaskPriority;
    assetName?: string;
    assigneeName?: string;
  };
}

export default function CalendarDashboard() {
  const router = useRouter();
  const [view, setView] = useState('dayGridMonth');
  const [filterType, setFilterType] = useState<'all' | 'task' | 'schedule'>('all');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all');

  const { data: tasksData, isLoading: tasksLoading } = useTasks({ limit: 1000 });
  const { data: schedulesData, isLoading: schedulesLoading } = useSchedules({ limit: 1000 });

  // Convert tasks and schedules to calendar events
  const events = useMemo(() => {
    const calendarEvents: CalendarEvent[] = [];

    // Add tasks
    if (tasksData?.data && (filterType === 'all' || filterType === 'task')) {
      tasksData.data.forEach(task => {
        if (task.dueDate) {
          // Apply filters
          if (filterStatus !== 'all' && task.status !== filterStatus) return;
          if (filterPriority !== 'all' && task.priority !== filterPriority) return;

          calendarEvents.push({
            id: `task-${task.id}`,
            title: task.title,
            start: task.dueDate,
            backgroundColor: getTaskColor(task.status, task.priority),
            borderColor: getTaskColor(task.status, task.priority),
            textColor: '#fff',
            extendedProps: {
              type: 'task',
              status: task.status,
              priority: task.priority,
              assetName: task.asset?.name,
              assigneeName: task.assignedUser ? 
                `${task.assignedUser.fullName}` : undefined,
            },
          });
        }
      });
    }

    // Add schedules
    if (schedulesData?.data && (filterType === 'all' || filterType === 'schedule')) {
      schedulesData.data.forEach(schedule => {
        if (schedule.nextOccurrence && schedule.isActive) {
          calendarEvents.push({
            id: `schedule-${schedule.id}`,
            title: `[Schedule] ${schedule.name}`,
            start: schedule.nextOccurrence,
            backgroundColor: '#9c27b0',
            borderColor: '#9c27b0',
            textColor: '#fff',
            extendedProps: {
              type: 'schedule',
              assetName: schedule.asset?.name,
            },
          });
        }
      });
    }

    return calendarEvents;
  }, [tasksData, schedulesData, filterType, filterStatus, filterPriority]);

  // Calculate task density for heatmap
  const taskDensity = useMemo(() => {
    const density: Record<string, number> = {};
    
    if (tasksData?.data) {
      tasksData.data.forEach(task => {
        if (task.dueDate) {
          const dateKey = format(parseISO(task.dueDate), 'yyyy-MM-dd');
          density[dateKey] = (density[dateKey] || 0) + 1;
        }
      });
    }

    return density;
  }, [tasksData]);

  const handleEventClick = (info: any) => {
    const [type, id] = info.event.id.split('-');
    if (type === 'task') {
      router.push(`/tasks/${id}`);
    } else if (type === 'schedule') {
      router.push(`/schedules`);
    }
  };

  const handleDateClick = (info: any) => {
    // Navigate to create new task with pre-filled date
    router.push(`/tasks/new?dueDate=${info.dateStr}`);
  };

  const getTaskColor = (status: TaskStatus, priority: TaskPriority) => {
    if (status === 'DONE') return '#4caf50';
    if (status === 'CANCELLED' || status === 'SKIPPED') return '#9e9e9e';
    
    const priorityColors: Record<TaskPriority, string> = {
      LOW: '#2196f3',
      MEDIUM: '#ff9800',
      HIGH: '#ff5722',
      URGENT: '#f44336',
    };
    
    return priorityColors[priority];
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Calendar Dashboard
      </Typography>

      {/* Controls */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <ButtonGroup variant="outlined">
            <Button 
              onClick={() => setView('dayGridMonth')}
              variant={view === 'dayGridMonth' ? 'contained' : 'outlined'}
            >
              Month
            </Button>
            <Button 
              onClick={() => setView('timeGridWeek')}
              variant={view === 'timeGridWeek' ? 'contained' : 'outlined'}
            >
              Week
            </Button>
            <Button 
              onClick={() => setView('timeGridDay')}
              variant={view === 'timeGridDay' ? 'contained' : 'outlined'}
            >
              Day
            </Button>
          </ButtonGroup>

          <Box display="flex" gap={2}>
            <FormControl size="small">
              <Select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
              >
                <MenuItem value="all">All Events</MenuItem>
                <MenuItem value="task">Tasks Only</MenuItem>
                <MenuItem value="schedule">Schedules Only</MenuItem>
              </Select>
            </FormControl>

            {filterType !== 'schedule' && (
              <>
                <FormControl size="small">
                  <Select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as any)}
                  >
                    <MenuItem value="all">All Status</MenuItem>
                    <MenuItem value="PLANNED">Planned</MenuItem>
                    <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                    <MenuItem value="DONE">Done</MenuItem>
                  </Select>
                </FormControl>

                <FormControl size="small">
                  <Select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value as any)}
                  >
                    <MenuItem value="all">All Priority</MenuItem>
                    <MenuItem value="LOW">Low</MenuItem>
                    <MenuItem value="MEDIUM">Medium</MenuItem>
                    <MenuItem value="HIGH">High</MenuItem>
                    <MenuItem value="URGENT">Urgent</MenuItem>
                  </Select>
                </FormControl>
              </>
            )}
          </Box>
        </Box>

        {/* Legend */}
        <Box display="flex" gap={1} mt={2} flexWrap="wrap">
          <Chip size="small" label="Low Priority" sx={{ backgroundColor: '#2196f3', color: 'white' }} />
          <Chip size="small" label="Medium Priority" sx={{ backgroundColor: '#ff9800', color: 'white' }} />
          <Chip size="small" label="High Priority" sx={{ backgroundColor: '#ff5722', color: 'white' }} />
          <Chip size="small" label="Urgent" sx={{ backgroundColor: '#f44336', color: 'white' }} />
          <Chip size="small" label="Completed" sx={{ backgroundColor: '#4caf50', color: 'white' }} />
          <Chip size="small" label="Schedule" sx={{ backgroundColor: '#9c27b0', color: 'white' }} />
        </Box>
      </Paper>

      {/* Calendar */}
      <Paper sx={{ p: 2 }}>
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={view}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          events={events}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          editable={true}
          droppable={true}
          height="auto"
          dayMaxEvents={true}
          weekends={true}
          eventDisplay="block"
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            meridiem: false,
          }}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          nowIndicator={true}
          dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
          eventContent={(eventInfo) => (
            <Box sx={{ p: 0.5, overflow: 'hidden' }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                {eventInfo.event.title}
              </Typography>
              {eventInfo.event.extendedProps.assetName && (
                <Typography variant="caption" display="block" sx={{ opacity: 0.8 }}>
                  {eventInfo.event.extendedProps.assetName}
                </Typography>
              )}
            </Box>
          )}
          dayCellDidMount={(info) => {
            // Add task density indicator
            const dateKey = format(info.date, 'yyyy-MM-dd');
            const count = taskDensity[dateKey] || 0;
            if (count > 0) {
              const indicator = document.createElement('div');
              indicator.style.position = 'absolute';
              indicator.style.bottom = '2px';
              indicator.style.right = '2px';
              indicator.style.width = '20px';
              indicator.style.height = '20px';
              indicator.style.borderRadius = '50%';
              indicator.style.backgroundColor = count > 5 ? '#f44336' : count > 2 ? '#ff9800' : '#4caf50';
              indicator.style.color = 'white';
              indicator.style.fontSize = '11px';
              indicator.style.display = 'flex';
              indicator.style.alignItems = 'center';
              indicator.style.justifyContent = 'center';
              indicator.style.fontWeight = 'bold';
              indicator.textContent = count.toString();
              info.el.style.position = 'relative';
              info.el.appendChild(indicator);
            }
          }}
        />
      </Paper>
    </Box>
  );
}