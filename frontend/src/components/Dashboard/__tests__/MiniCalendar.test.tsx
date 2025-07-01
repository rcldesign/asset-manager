import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MiniCalendar } from '../MiniCalendar';
import { format, startOfMonth, endOfMonth, isSameDay } from 'date-fns';

// Mock date-fns
jest.mock('date-fns', () => ({
  format: jest.fn(),
  startOfMonth: jest.fn(),
  endOfMonth: jest.fn(),
  isSameDay: jest.fn(),
  addMonths: jest.fn(),
  subMonths: jest.fn(),
  startOfWeek: jest.fn(),
  endOfWeek: jest.fn(),
  eachDayOfInterval: jest.fn(),
  isToday: jest.fn(),
  isSameMonth: jest.fn(),
}));

describe('MiniCalendar', () => {
  const mockEvents = [
    {
      id: '1',
      title: 'Team Meeting',
      date: new Date('2024-01-15T10:00:00Z'),
      type: 'meeting',
      priority: 'medium',
    },
    {
      id: '2',
      title: 'Server Maintenance',
      date: new Date('2024-01-15T14:00:00Z'),
      type: 'maintenance',
      priority: 'high',
    },
    {
      id: '3',
      title: 'Asset Review',
      date: new Date('2024-01-20T09:00:00Z'),
      type: 'review',
      priority: 'low',
    },
  ];

  beforeEach(() => {
    (format as jest.Mock).mockImplementation((date, formatStr) => {
      if (formatStr === 'MMMM yyyy') return 'January 2024';
      if (formatStr === 'd') return date.getDate().toString();
      return date.toISOString();
    });

    (startOfMonth as jest.Mock).mockReturnValue(new Date('2024-01-01'));
    (endOfMonth as jest.Mock).mockReturnValue(new Date('2024-01-31'));
    (isSameDay as jest.Mock).mockImplementation((date1, date2) => 
      date1.getDate() === date2.getDate()
    );
  });

  it('should render calendar with current month', () => {
    render(<MiniCalendar events={mockEvents} />);

    expect(screen.getByText('January 2024')).toBeInTheDocument();
    expect(screen.getByTestId('mini-calendar')).toBeInTheDocument();
  });

  it('should render loading state', () => {
    render(<MiniCalendar events={[]} loading={true} />);

    expect(screen.getByTestId('calendar-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('mini-calendar')).not.toBeInTheDocument();
  });

  it('should render error state', () => {
    const errorMessage = 'Failed to load calendar data';
    render(<MiniCalendar events={[]} error={errorMessage} />);

    expect(screen.getByTestId('calendar-error')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('should navigate to previous month', () => {
    const onMonthChangeMock = jest.fn();
    render(
      <MiniCalendar 
        events={mockEvents} 
        onMonthChange={onMonthChangeMock}
      />
    );

    const prevButton = screen.getByTestId('prev-month-button');
    fireEvent.click(prevButton);

    expect(onMonthChangeMock).toHaveBeenCalled();
  });

  it('should navigate to next month', () => {
    const onMonthChangeMock = jest.fn();
    render(
      <MiniCalendar 
        events={mockEvents} 
        onMonthChange={onMonthChangeMock}
      />
    );

    const nextButton = screen.getByTestId('next-month-button');
    fireEvent.click(nextButton);

    expect(onMonthChangeMock).toHaveBeenCalled();
  });

  it('should handle date selection', () => {
    const onDateSelectMock = jest.fn();
    render(
      <MiniCalendar 
        events={mockEvents} 
        onDateSelect={onDateSelectMock}
      />
    );

    const dateButton = screen.getByTestId('calendar-date-15');
    fireEvent.click(dateButton);

    expect(onDateSelectMock).toHaveBeenCalled();
  });

  it('should highlight dates with events', () => {
    render(<MiniCalendar events={mockEvents} />);

    const dateWithEvents = screen.getByTestId('calendar-date-15');
    expect(dateWithEvents).toHaveClass('has-events');

    const dateWithoutEvents = screen.getByTestId('calendar-date-10');
    expect(dateWithoutEvents).not.toHaveClass('has-events');
  });

  it('should show event count on dates', () => {
    render(<MiniCalendar events={mockEvents} showEventCount={true} />);

    const dateWithEvents = screen.getByTestId('calendar-date-15');
    expect(screen.getByText('2')).toBeInTheDocument(); // 2 events on 15th
  });

  it('should render event tooltips on hover', () => {
    render(<MiniCalendar events={mockEvents} showTooltips={true} />);

    const dateWithEvents = screen.getByTestId('calendar-date-15');
    fireEvent.mouseEnter(dateWithEvents);

    expect(screen.getByTestId('event-tooltip')).toBeInTheDocument();
    expect(screen.getByText('Team Meeting')).toBeInTheDocument();
    expect(screen.getByText('Server Maintenance')).toBeInTheDocument();
  });

  it('should filter events by type', () => {
    render(
      <MiniCalendar 
        events={mockEvents} 
        eventTypeFilter={['maintenance']}
        showEventCount={true}
      />
    );

    const dateWithFilteredEvents = screen.getByTestId('calendar-date-15');
    expect(screen.getByText('1')).toBeInTheDocument(); // Only 1 maintenance event
  });

  it('should highlight today', () => {
    const { isToday } = require('date-fns');
    (isToday as jest.Mock).mockImplementation((date) => date.getDate() === 15);

    render(<MiniCalendar events={mockEvents} />);

    const todayDate = screen.getByTestId('calendar-date-15');
    expect(todayDate).toHaveClass('today');
  });

  it('should highlight selected date', () => {
    const selectedDate = new Date('2024-01-20');
    render(
      <MiniCalendar 
        events={mockEvents} 
        selectedDate={selectedDate}
      />
    );

    const selectedDateElement = screen.getByTestId('calendar-date-20');
    expect(selectedDateElement).toHaveClass('selected');
  });

  it('should render weekday headers', () => {
    render(<MiniCalendar events={mockEvents} />);

    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Thu')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
  });

  it('should handle custom date formatting', () => {
    const customFormatter = (date: Date) => date.getDate().toString().padStart(2, '0');
    
    render(
      <MiniCalendar 
        events={mockEvents} 
        dateFormatter={customFormatter}
      />
    );

    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('should render with compact mode', () => {
    render(<MiniCalendar events={mockEvents} compact={true} />);

    const calendar = screen.getByTestId('mini-calendar');
    expect(calendar).toHaveClass('compact');
  });

  it('should show event priority indicators', () => {
    render(
      <MiniCalendar 
        events={mockEvents} 
        showPriority={true}
      />
    );

    const highPriorityIndicator = screen.getByTestId('priority-high-15');
    expect(highPriorityIndicator).toBeInTheDocument();
    expect(highPriorityIndicator).toHaveClass('priority-high');
  });

  it('should handle keyboard navigation', () => {
    const onDateSelectMock = jest.fn();
    render(
      <MiniCalendar 
        events={mockEvents} 
        onDateSelect={onDateSelectMock}
      />
    );

    const dateButton = screen.getByTestId('calendar-date-15');
    
    // Focus the date
    dateButton.focus();
    expect(dateButton).toHaveFocus();

    // Press Enter key
    fireEvent.keyDown(dateButton, { key: 'Enter', code: 'Enter' });
    expect(onDateSelectMock).toHaveBeenCalled();

    // Test arrow key navigation
    fireEvent.keyDown(dateButton, { key: 'ArrowRight', code: 'ArrowRight' });
    const nextDate = screen.getByTestId('calendar-date-16');
    expect(nextDate).toHaveFocus();
  });

  it('should render with custom event renderer', () => {
    const customEventRenderer = (events: any[]) => (
      <div data-testid="custom-events">
        {events.length} custom events
      </div>
    );

    render(
      <MiniCalendar 
        events={mockEvents} 
        renderEvents={customEventRenderer}
      />
    );

    expect(screen.getByTestId('custom-events')).toBeInTheDocument();
    expect(screen.getByText('2 custom events')).toBeInTheDocument();
  });

  it('should handle disabled dates', () => {
    const disabledDates = [new Date('2024-01-15'), new Date('2024-01-20')];
    
    render(
      <MiniCalendar 
        events={mockEvents} 
        disabledDates={disabledDates}
      />
    );

    const disabledDate = screen.getByTestId('calendar-date-15');
    expect(disabledDate).toHaveAttribute('disabled');
    expect(disabledDate).toHaveClass('disabled');
  });

  it('should show mini agenda for selected date', () => {
    const selectedDate = new Date('2024-01-15');
    
    render(
      <MiniCalendar 
        events={mockEvents} 
        selectedDate={selectedDate}
        showMiniAgenda={true}
      />
    );

    expect(screen.getByTestId('mini-agenda')).toBeInTheDocument();
    expect(screen.getByText('Team Meeting')).toBeInTheDocument();
    expect(screen.getByText('Server Maintenance')).toBeInTheDocument();
  });

  it('should handle custom theme colors', () => {
    const customTheme = {
      primary: '#2196f3',
      secondary: '#4caf50',
      accent: '#ff9800',
    };

    render(
      <MiniCalendar 
        events={mockEvents} 
        theme={customTheme}
      />
    );

    const calendar = screen.getByTestId('mini-calendar');
    expect(calendar).toHaveStyle({ '--primary-color': '#2196f3' });
  });

  it('should render events with different colors by type', () => {
    const eventTypeColors = {
      meeting: '#2196f3',
      maintenance: '#f44336',
      review: '#4caf50',
    };

    render(
      <MiniCalendar 
        events={mockEvents} 
        eventTypeColors={eventTypeColors}
      />
    );

    const meetingEvent = screen.getByTestId('event-indicator-meeting-15');
    expect(meetingEvent).toHaveStyle({ backgroundColor: '#2196f3' });
  });

  it('should handle double-click for quick actions', () => {
    const onDateDoubleClickMock = jest.fn();
    
    render(
      <MiniCalendar 
        events={mockEvents} 
        onDateDoubleClick={onDateDoubleClickMock}
      />
    );

    const dateButton = screen.getByTestId('calendar-date-15');
    fireEvent.doubleClick(dateButton);

    expect(onDateDoubleClickMock).toHaveBeenCalled();
  });
});