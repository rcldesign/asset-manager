# Task Management User Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Understanding Tasks](#understanding-tasks)
4. [Creating Tasks](#creating-tasks)
5. [Task Assignments](#task-assignments)
6. [Task Status Management](#task-status-management)
7. [Task Comments](#task-comments)
8. [Task Scheduling](#task-scheduling)
9. [Task Priorities](#task-priorities)
10. [Cost and Time Tracking](#cost-and-time-tracking)
11. [Task Notifications](#task-notifications)
12. [Bulk Operations](#bulk-operations)
13. [Reports and Analytics](#reports-and-analytics)
14. [Best Practices](#best-practices)

## Introduction

The task management system in DumbAssets Enhanced helps you track maintenance, inspections, and other activities related to your assets. This guide covers creating, managing, and tracking tasks effectively.

## Getting Started

### Prerequisites
- Active user account
- Task permissions (based on role)
- Understanding of asset management

### Key Concepts
- **Task**: A unit of work related to an asset
- **Assignment**: User(s) responsible for a task
- **Schedule**: Automated task generation rules
- **Priority**: Urgency level of tasks
- **Status**: Current state of task completion

## Understanding Tasks

### What is a Task?

A task represents work that needs to be done, such as:
- Preventive maintenance
- Inspections
- Repairs
- Replacements
- Audits
- Cleaning

### Task Components

Every task includes:
- **Title**: Brief description
- **Description**: Detailed information
- **Due Date**: When it should be completed
- **Status**: Current state
- **Priority**: Urgency level
- **Asset**: Related asset (optional)
- **Assignments**: Responsible users

## Creating Tasks

### Manual Task Creation

1. Navigate to Tasks section
2. Click "Create Task"
3. Fill in required information:
   - Title
   - Due date
   - Priority
   - Status (defaults to PLANNED)

### Creating from Asset

1. Go to asset detail page
2. Click "Create Task"
3. Task is automatically linked to asset
4. Complete task details

### Required Fields
- Title
- Due date
- Priority
- Organization (auto-filled)

### Optional Fields
- Description
- Asset assignment
- Cost estimates
- Time estimates
- Schedule link
- User assignments

## Task Assignments

### Assigning Users

Tasks can be assigned to multiple users:

1. **During Creation**:
   - Select users from dropdown
   - Add multiple assignees

2. **After Creation**:
   - Edit task
   - Modify assignments
   - Add/remove users

### Assignment Notifications

Assignees receive notifications:
- When assigned to task
- Due date reminders
- Status changes
- New comments

### Self-Assignment

Users can self-assign if they have:
- Task update permissions
- Access to the task

## Task Status Management

### Task Lifecycle

```
PLANNED → IN_PROGRESS → DONE
    ↓                      ↑
    └──── SKIPPED ────────┘
```

### Status Definitions

**PLANNED**: 
- Task created but not started
- Default status for new tasks
- Can transition to IN_PROGRESS or SKIPPED

**IN_PROGRESS**:
- Work has begun
- Assignees actively working
- Can transition to DONE or back to PLANNED

**DONE**:
- Task completed successfully
- Actual cost/time can be recorded
- Completion timestamp recorded

**SKIPPED**:
- Task not performed
- Must include reason
- Can be reactivated to PLANNED

### Changing Status

1. Navigate to task detail
2. Click status button
3. Select new status
4. Add notes if required
5. Confirm change

## Task Comments

### Adding Comments

Comments support:
- Text updates
- Progress notes
- Questions
- Issue reporting

To add a comment:
1. Open task detail
2. Type in comment box
3. Click "Add Comment"

### Comment Features
- Timestamp automatically added
- User attribution
- Chronological order
- Cannot be deleted (audit trail)

### Best Practices
- Be specific and clear
- Document decisions
- Note any issues
- Update regularly

## Task Scheduling

### Understanding Schedules

Schedules automatically create tasks based on:
- Time intervals
- Calendar rules
- Usage thresholds
- Seasonal patterns

### Schedule Types

**Fixed Interval**:
- Every X days/months
- Example: Oil change every 90 days

**Calendar-Based**:
- Specific dates/patterns
- Example: First Monday of month

**Usage-Based**:
- Triggered by metrics
- Example: After 1000 hours

**Seasonal**:
- Specific months
- Example: HVAC check in Spring/Fall

### Creating Scheduled Tasks

1. Create a schedule first
2. Link to asset
3. Configure parameters:
   - Task template
   - Recurrence rule
   - Advance creation days

### Managing Scheduled Tasks

Scheduled tasks show:
- Schedule source
- Next occurrence
- Recurrence pattern

You can:
- Skip individual occurrences
- Modify future tasks
- Pause/resume schedules

## Task Priorities

### Priority Levels

**HIGH**:
- Urgent/critical tasks
- Safety-related
- Business-critical
- Same-day attention

**MEDIUM**:
- Important but not urgent
- Standard maintenance
- Week-level planning

**LOW**:
- Routine tasks
- Long-term planning
- Non-critical work

### Using Priorities

Priorities help with:
- Work planning
- Resource allocation
- Dashboard filtering
- Notification urgency

### Priority Guidelines
- Set realistically
- Update if urgency changes
- Use HIGH sparingly
- Review regularly

## Cost and Time Tracking

### Estimates vs Actuals

**Estimates** (Planning):
- Estimated cost
- Estimated minutes
- Budget planning
- Resource allocation

**Actuals** (Completion):
- Actual cost incurred
- Actual time spent
- Variance analysis
- Historical data

### Recording Information

When completing tasks:
1. Enter actual cost
2. Enter actual minutes
3. Add any notes
4. Update status to DONE

### Cost Categories
- Labor costs
- Parts/materials
- External services
- Other expenses

### Time Tracking
- Start/stop timer
- Manual entry
- Round to minutes
- Include prep time

## Task Notifications

### Notification Types

**Assignment**: When assigned to task
**Due Soon**: Configurable reminder
**Overdue**: When past due date
**Status Change**: When status updates
**Comment**: New comment added
**Completion**: When task completed

### Notification Channels

**In-App**:
- Bell icon alerts
- Notification center
- Real-time updates

**Email**:
- Daily digests
- Immediate alerts
- Configurable frequency

### Managing Preferences

1. Go to Settings
2. Select Notifications
3. Configure:
   - Channel preferences
   - Timing options
   - Types to receive

## Bulk Operations

### Supported Operations

**Status Update**:
- Change multiple task statuses
- Add bulk notes
- Maintain audit trail

**Priority Change**:
- Update urgency levels
- Reprioritize work

**Assignment**:
- Assign to users
- Remove assignments
- Reassign work

**Rescheduling**:
- Move due dates
- Bulk postpone

### Using Bulk Operations

1. Select tasks (checkboxes)
2. Choose operation
3. Configure parameters
4. Review affected tasks
5. Confirm action

### Limitations
- Permission-based
- Status rules apply
- Maximum selection limits

## Reports and Analytics

### Available Reports

**Task Summary**:
- By status
- By priority
- By assignee
- Completion rates

**Overdue Analysis**:
- Overdue tasks
- Average delay
- By category

**Cost Analysis**:
- Estimated vs actual
- By asset/category
- Trends over time

**Performance Metrics**:
- On-time completion
- User productivity
- Schedule adherence

### Generating Reports

1. Navigate to Reports
2. Select report type
3. Configure parameters:
   - Date range
   - Filters
   - Grouping
4. Generate/export

### Export Options
- PDF reports
- Excel spreadsheets
- CSV data
- API access

## Best Practices

### Task Creation
- Clear, descriptive titles
- Detailed descriptions
- Realistic due dates
- Appropriate priorities

### Task Management
- Update status promptly
- Add progress comments
- Track time accurately
- Close completed tasks

### Assignments
- Assign appropriately
- Avoid overloading
- Consider availability
- Communicate clearly

### Scheduling
- Plan ahead
- Use schedules for recurring work
- Review schedule effectiveness
- Adjust as needed

### Documentation
- Document decisions
- Note any issues
- Track actual costs
- Build knowledge base

### Review Process
- Regular task reviews
- Clear overdue items
- Analyze patterns
- Improve processes

## Troubleshooting

### Common Issues

**Cannot create task**: 
- Check permissions
- Verify required fields
- Check asset access

**Assignment not working**:
- User must be active
- Same organization
- Appropriate permissions

**Schedule not generating**:
- Check schedule status
- Verify asset link
- Review schedule rules

**Notifications not received**:
- Check preferences
- Verify email
- Check spam folder

### Performance Tips

1. Use filters effectively
2. Archive completed tasks
3. Limit open tasks
4. Regular maintenance
5. Clear old data

### Getting Help

1. Check permissions first
2. Review this guide
3. Contact administrator
4. Submit support ticket
5. Check system status

## Advanced Features

### Task Templates
Create templates for common tasks:
- Standardized checklists
- Pre-filled values
- Consistent formatting

### Integration
- Calendar sync
- Mobile access
- API automation
- Third-party tools

### Automation
- Auto-assignment rules
- Escalation policies
- Status workflows
- Notification rules

### Compliance
- Audit trails
- Required fields
- Approval workflows
- Documentation requirements