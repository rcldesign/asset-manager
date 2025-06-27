# Asset Manager User Guide - Scheduling & Task Management

## Table of Contents
1. [Introduction](#introduction)
2. [Understanding Tasks](#understanding-tasks)
3. [Creating Tasks](#creating-tasks)
4. [Task Management](#task-management)
5. [Maintenance Schedules](#maintenance-schedules)
6. [Schedule Types](#schedule-types)
7. [Task Assignment](#task-assignment)
8. [Task Tracking](#task-tracking)
9. [Notifications](#notifications)
10. [Reports](#reports)
11. [Best Practices](#best-practices)

## Introduction

The Asset Manager's scheduling and task system helps you plan, track, and complete maintenance activities for your assets. This guide covers everything from creating one-time tasks to setting up complex recurring maintenance schedules.

## Understanding Tasks

### What are Tasks?
Tasks represent work that needs to be done on assets:
- Preventive maintenance
- Inspections
- Repairs
- Replacements
- Calibrations
- Cleaning

### Task Properties
Each task includes:
- **Title**: Brief description of the work
- **Description**: Detailed instructions
- **Status**: Current state (Planned, In Progress, Done, Skipped)
- **Priority**: High, Medium, or Low
- **Asset**: The asset requiring work
- **Assignee**: Person responsible
- **Due Date**: When the task should be completed
- **Estimated Time**: Expected duration
- **Estimated Cost**: Projected expense

## Creating Tasks

### Manual Task Creation
1. Navigate to "Tasks" in the main menu
2. Click "Create Task"
3. Fill in the required fields:
   - Title (e.g., "Replace air filter")
   - Select the asset
   - Set due date
   - Choose priority
4. Optional fields:
   - Detailed description
   - Assign to user
   - Estimated time and cost
   - Add notes
5. Click "Save"

### Quick Task Creation from Asset
1. Open any asset detail view
2. Click "Add Task" button
3. Task is automatically linked to that asset
4. Complete the task form
5. Save

### Bulk Task Creation
For multiple similar tasks:
1. Use "Bulk Create" option
2. Select multiple assets
3. Define the task template
4. Tasks are created for each selected asset

## Task Management

### Task List View
The main task view provides:
- **Filters**: Status, priority, assignee, date range
- **Sorting**: Due date, priority, asset name
- **Search**: Find tasks by title or description
- **Calendar View**: Visual timeline of tasks

### Task Statuses
- **Planned**: Task is scheduled but not started
- **In Progress**: Work has begun
- **Done**: Task completed successfully
- **Skipped**: Task was not needed or deferred

### Updating Tasks
1. Click on any task to open details
2. Update status using the dropdown
3. Add completion notes
4. Attach photos or documents
5. Log actual time and cost
6. Save changes

### Task Comments
Track progress and communication:
1. Open task details
2. Go to "Comments" section
3. Add updates, questions, or notes
4. Comments are timestamped and attributed
5. Team members are notified of new comments

## Maintenance Schedules

### What are Schedules?
Schedules automatically generate tasks based on:
- Time intervals (every 30 days)
- Calendar patterns (first Monday of month)
- Usage thresholds (every 1000 hours)
- Seasonal needs (spring/fall)

### Benefits of Scheduling
- Never miss critical maintenance
- Plan resource allocation
- Budget for upcoming work
- Maintain compliance
- Extend asset life

## Schedule Types

### One-Off Schedules
For single, future tasks:
1. Select "One-Off" schedule type
2. Set the date when task should be created
3. Define task details
4. Save schedule

Example: Annual inspection due next January

### Fixed Interval Schedules
For regular recurring maintenance:
1. Select "Fixed Interval"
2. Set interval in days (e.g., 90 days)
3. Choose start date
4. Define task template
5. Save schedule

Examples:
- Oil change every 90 days
- Filter replacement every 30 days
- Calibration every 180 days

### Custom Schedules (RRULE)
For complex patterns:
1. Select "Custom Schedule"
2. Use the schedule builder or enter RRULE
3. Preview generated dates
4. Confirm pattern is correct
5. Save schedule

Examples:
- Every first and third Tuesday
- Last day of each quarter
- Every weekday except holidays

### Seasonal Schedules
For season-specific maintenance:
1. Select months when tasks are needed
2. Set day of month for task generation
3. Define seasonal task details
4. Save schedule

Example: HVAC maintenance in April and October

## Task Assignment

### Assigning to Users
1. When creating/editing a task, use "Assign To" field
2. Select from available team members
3. Multiple users can be assigned
4. Users receive notifications

### Assignment Strategies
- **By Expertise**: Assign based on skills
- **By Location**: Assign to nearest technician
- **By Workload**: Balance across team
- **By Shift**: Match task timing to shifts

### Self-Assignment
Users can claim unassigned tasks:
1. Filter for unassigned tasks
2. Click "Claim Task"
3. Task is assigned to current user

## Task Tracking

### Progress Updates
1. Change status to "In Progress" when starting
2. Add progress comments
3. Upload photos of work
4. Log time spent
5. Note any issues encountered

### Time Tracking
- **Estimated Time**: Set during creation
- **Actual Time**: Log when completing
- Track variance for better estimates
- Use for resource planning

### Cost Tracking
- **Estimated Cost**: Budget for task
- **Actual Cost**: Record expenses
- Attach receipts
- Track parts used
- Monitor maintenance costs

### Completion
When finishing a task:
1. Change status to "Done"
2. Add completion notes
3. Log actual time and cost
4. Attach any documentation
5. Save changes

## Notifications

### Notification Types
- **Task Due**: Reminder before due date
- **Task Assigned**: When assigned a task
- **Task Overdue**: When past due date
- **Comment Added**: New comment on your task
- **Schedule Created**: New recurring tasks added

### Notification Preferences
1. Click on your profile
2. Go to "Notification Settings"
3. Configure for each type:
   - In-app notifications
   - Email notifications
   - SMS (if enabled)
4. Set reminder timing
5. Save preferences

### Managing Notifications
- View all in notification center
- Mark as read/unread
- Click to go directly to task
- Clear old notifications

## Reports

### Task Reports
Available reports include:
- **Upcoming Tasks**: Next 30/60/90 days
- **Overdue Tasks**: Tasks past due date
- **Completed Tasks**: Historical record
- **Task by Assignee**: Workload distribution
- **Task by Asset**: Maintenance per asset

### Schedule Reports
- **Active Schedules**: All recurring maintenance
- **Schedule Compliance**: On-time completion rate
- **Upcoming Generated Tasks**: Future workload
- **Schedule Cost Analysis**: Maintenance spending

### Generating Reports
1. Navigate to "Reports"
2. Select report type
3. Set date range and filters
4. Choose format (PDF, Excel, CSV)
5. Generate and download

### Key Metrics
- **On-Time Completion**: % of tasks done by due date
- **Average Time to Complete**: Task duration trends
- **Cost Variance**: Estimated vs actual costs
- **Tasks per Asset**: Maintenance frequency

## Best Practices

### Effective Scheduling
- **Preventive is Cheaper**: Schedule regular maintenance
- **Group Tasks**: Combine work on same asset
- **Consider Seasonality**: Plan around weather/usage
- **Buffer Time**: Allow margin for unexpected issues
- **Review Regularly**: Adjust schedules based on experience

### Task Management Tips
- **Clear Titles**: Use descriptive, searchable titles
- **Detailed Instructions**: Include all necessary steps
- **Attach References**: Add manuals, diagrams
- **Update Promptly**: Keep status current
- **Document Issues**: Note problems for future reference

### Team Coordination
- **Daily Reviews**: Check upcoming tasks each morning
- **Claim Early**: Take ownership of tasks promptly
- **Communicate**: Use comments for updates
- **Share Knowledge**: Document solutions
- **Plan Ahead**: Review weekly/monthly schedule

### Compliance and Documentation
- **Photo Evidence**: Document before/after
- **Keep Records**: Maintain complete history
- **Follow Procedures**: Use checklists
- **Note Deviations**: Document any changes
- **Retain Documents**: Attach all paperwork

## Advanced Features

### Task Templates
Create templates for common tasks:
1. Go to "Task Templates"
2. Create new template
3. Define standard fields
4. Use when creating tasks
5. Ensures consistency

### Workflow Automation
- Auto-assign based on rules
- Escalate overdue tasks
- Chain dependent tasks
- Trigger follow-up tasks

### Integration Features
- Calendar sync (iCal/Google)
- Mobile app for field work
- Barcode scanning
- GPS check-in/out

## Troubleshooting

### Common Issues

**Can't see scheduled tasks:**
- Check schedule is active
- Verify start date has passed
- Ensure asset has schedules
- Check permissions

**Tasks not generating:**
- Verify schedule configuration
- Check end date hasn't passed
- Ensure system scheduler is running
- Contact administrator

**Can't update task:**
- Verify assignment
- Check task isn't locked
- Ensure proper permissions
- Refresh the page

### Mobile Considerations
- Download mobile app
- Sync before going offline
- Complete tasks in field
- Sync when back online
- Photos auto-upload

## Role Permissions

### Task Permissions by Role

**Viewer**
- View task list
- View task details
- View schedules

**Member**
- Create manual tasks
- Update assigned tasks
- Add comments
- View all tasks

**Manager**
- All Member permissions
- Create schedules
- Assign tasks to others
- Bulk operations
- Delete tasks

**Owner**
- All Manager permissions
- System configuration
- Advanced scheduling
- Full access

## Quick Reference

### Keyboard Shortcuts
- `T`: Create new task
- `S`: Open schedules
- `F`: Focus search
- `Space`: Toggle task selection
- `Enter`: Open task details

### Status Colors
- 🔵 Blue: Planned
- 🟡 Yellow: In Progress
- 🟢 Green: Done
- ⚪ Gray: Skipped
- 🔴 Red: Overdue

### Priority Indicators
- 🔴 High: Critical tasks
- 🟡 Medium: Standard priority
- 🟢 Low: When convenient

### Schedule Icons
- 📅 One-off
- 🔄 Recurring
- 📆 Calendar-based
- 🌡️ Usage-based
- 🍂 Seasonal