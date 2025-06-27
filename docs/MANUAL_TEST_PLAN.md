# Asset Manager - Manual Test Plan for Phase 2 Features

## Overview

This document provides a comprehensive manual test plan for validating all Phase 2 features of the Asset Manager system. Tests are organized by feature area and include role-based permission testing.

## Test Environment Setup

### Prerequisites
1. Access to test environment
2. Test accounts for each role:
   - Owner: owner@test.com
   - Manager: manager@test.com
   - Member: member@test.com
   - Viewer: viewer@test.com
3. Sample data loaded
4. File storage configured (local or SMB)

### Test Data
- Organization: "Test Company"
- Locations: Building A > Floor 1 > Room 101
- Asset Templates: Laptop, Printer, Vehicle
- Sample assets in various states

## Asset Management Tests

### Test AM-01: Asset Creation
**Objective**: Verify asset creation with all fields

**Steps**:
1. Login as Member
2. Navigate to Assets
3. Click "Create Asset"
4. Fill all fields:
   - Name: "Test Laptop 001"
   - Category: Hardware
   - Description: "Test laptop for QA"
   - Manufacturer: "Dell"
   - Model: "Latitude 5520"
   - Serial: "SN123456"
   - Purchase Date: Today
   - Price: $1,200
   - Location: Room 101
   - Tags: "test", "laptop"
5. Save

**Expected Results**:
- Asset created successfully
- All fields saved correctly
- Asset appears in list
- QR code generated

### Test AM-02: Asset Template Usage
**Objective**: Create asset using template

**Steps**:
1. Click "Create Asset"
2. Select "Use Template"
3. Choose "Laptop" template
4. Verify pre-filled fields
5. Modify as needed
6. Save

**Expected Results**:
- Template fields applied
- Custom fields included
- Asset created with template reference

### Test AM-03: Asset Hierarchy
**Objective**: Test parent-child relationships

**Steps**:
1. Create parent asset "Desktop Computer"
2. Open asset details
3. Click "Add Child Asset"
4. Create "Monitor", "Keyboard", "Mouse"
5. View asset tree

**Expected Results**:
- Children linked to parent
- Tree view shows hierarchy
- Path updated correctly

### Test AM-04: Bulk Operations
**Objective**: Test bulk asset updates

**Steps**:
1. Select 5 assets
2. Choose "Bulk Actions" > "Update Status"
3. Set to "Maintenance"
4. Confirm
5. Verify all updated

**Expected Results**:
- All selected assets updated
- Status changed to Maintenance
- Audit log entries created

### Test AM-05: File Attachments
**Objective**: Test file upload/download

**Steps**:
1. Open asset details
2. Go to Attachments tab
3. Upload:
   - Photo (JPG, < 5MB)
   - Manual (PDF)
   - Receipt (PDF)
4. Set photo as primary
5. Download each file
6. Delete one file

**Expected Results**:
- Files upload successfully
- Primary photo shown
- Downloads work
- Deletion removes file

## Location Management Tests

### Test LM-01: Location Creation
**Objective**: Create hierarchical locations

**Steps**:
1. Navigate to Locations
2. Create "Building B"
3. Add child "Floor 1"
4. Add child "Room 101"
5. View tree

**Expected Results**:
- Locations created
- Hierarchy displayed
- Paths generated correctly

### Test LM-02: Move Assets
**Objective**: Move assets between locations

**Steps**:
1. Select asset
2. Edit location
3. Choose new location
4. Save
5. Verify in new location

**Expected Results**:
- Asset location updated
- Appears in new location list
- History shows move

### Test LM-03: Location Deletion
**Objective**: Test location with assets

**Steps**:
1. Try to delete location with assets
2. See error message
3. Move assets first
4. Delete empty location

**Expected Results**:
- Cannot delete with assets
- Clear error message
- Deletion works when empty

## Schedule Management Tests

### Test SM-01: One-Off Schedule
**Objective**: Create single task schedule

**Steps**:
1. Open asset
2. Go to Schedules tab
3. Create one-off schedule:
   - Name: "Annual Inspection"
   - Date: Next month
   - Task: "Perform inspection"
4. Save

**Expected Results**:
- Schedule created
- Shows in schedule list
- Task generated on date

### Test SM-02: Fixed Interval
**Objective**: Create recurring schedule

**Steps**:
1. Create schedule:
   - Type: Fixed Interval
   - Every: 90 days
   - Task: "Oil Change"
   - Start: Today
2. Save
3. Check next occurrences

**Expected Results**:
- Schedule active
- Next dates calculated
- First task created

### Test SM-03: Custom Schedule (RRULE)
**Objective**: Complex recurring pattern

**Steps**:
1. Create custom schedule
2. Set: "Every first Monday"
3. Preview dates
4. Save

**Expected Results**:
- Pattern recognized
- Correct dates shown
- Tasks follow pattern

## Task Management Tests

### Test TM-01: Manual Task Creation
**Objective**: Create task manually

**Steps**:
1. Navigate to Tasks
2. Create task:
   - Title: "Check printer"
   - Asset: Select printer
   - Priority: Medium
   - Due: Tomorrow
   - Assign: Self
3. Save

**Expected Results**:
- Task created
- Appears in list
- Assignment notification sent

### Test TM-02: Task Lifecycle
**Objective**: Complete task workflow

**Steps**:
1. Open task
2. Change to "In Progress"
3. Add comment "Started work"
4. Upload photo
5. Complete task:
   - Status: Done
   - Actual time: 30 min
   - Notes: "Replaced toner"
6. Save

**Expected Results**:
- Status updates saved
- Comment visible
- Photo attached
- Completion recorded

### Test TM-03: Task Comments
**Objective**: Test collaboration features

**Steps**:
1. As Member: Add comment
2. As Manager: Reply
3. Check notifications
4. View comment thread

**Expected Results**:
- Comments threaded
- Notifications sent
- Timestamps correct
- User attribution

## Notification Tests

### Test NT-01: In-App Notifications
**Objective**: Verify notification system

**Steps**:
1. Trigger notifications:
   - Asset assigned
   - Task due
   - Comment added
2. Check notification bell
3. Click notification
4. Mark as read
5. Clear all

**Expected Results**:
- Bell shows count
- Popover displays
- Links work
- Read status updates

### Test NT-02: Notification Settings
**Objective**: Configure preferences

**Steps**:
1. Go to profile settings
2. Configure notifications:
   - Tasks: Email + In-app
   - Assets: In-app only
   - Comments: Disabled
3. Save
4. Test each type

**Expected Results**:
- Settings saved
- Notifications follow preferences
- Email sent when configured

## Permission Tests

### Test PM-01: Viewer Role
**Objective**: Verify read-only access

**Login as**: viewer@test.com

**Test**:
- ✓ Can view assets
- ✓ Can view tasks
- ✓ Can download files
- ✗ Cannot create assets
- ✗ Cannot edit anything
- ✗ Cannot delete

### Test PM-02: Member Role
**Objective**: Verify member permissions

**Login as**: member@test.com

**Test**:
- ✓ All Viewer permissions
- ✓ Can create assets
- ✓ Can edit own assets
- ✓ Can create tasks
- ✓ Can upload files
- ✗ Cannot delete assets
- ✗ Cannot manage users

### Test PM-03: Manager Role
**Objective**: Verify manager permissions

**Login as**: manager@test.com

**Test**:
- ✓ All Member permissions
- ✓ Can delete assets
- ✓ Can bulk operations
- ✓ Can create schedules
- ✓ Can assign tasks to others
- ✗ Cannot manage organization

### Test PM-04: Owner Role
**Objective**: Verify full access

**Login as**: owner@test.com

**Test**:
- ✓ All Manager permissions
- ✓ Can manage users
- ✓ Can configure organization
- ✓ Full system access

## File Storage Tests

### Test FS-01: Local Storage
**Objective**: Test Docker volume storage

**Configuration**: FILE_STORAGE_PROVIDER=local

**Steps**:
1. Upload large file (40MB)
2. Upload multiple files
3. Check storage location
4. Verify in container

**Expected Results**:
- Files stored in /app/uploads
- Organized by date
- Accessible via API

### Test FS-02: SMB Storage
**Objective**: Test network storage

**Configuration**: FILE_STORAGE_PROVIDER=smb

**Steps**:
1. Configure SMB settings
2. Upload file
3. Check network share
4. Download file

**Expected Results**:
- Files on network share
- Proper permissions
- Performance acceptable

## Performance Tests

### Test PF-01: Asset List Loading
**Objective**: Test with large dataset

**Setup**: 10,000 assets

**Steps**:
1. Load asset list
2. Measure load time
3. Test pagination
4. Test filtering

**Expected Results**:
- Page loads < 2 seconds
- Pagination smooth
- Filters responsive

### Test PF-02: Bulk Import
**Objective**: Import many assets

**Steps**:
1. Prepare CSV with 1,000 assets
2. Import file
3. Monitor progress
4. Check results

**Expected Results**:
- Import completes
- Progress shown
- Errors reported
- < 5 minutes total

## Error Handling Tests

### Test EH-01: Validation Errors
**Objective**: Test form validation

**Steps**:
1. Try to create asset without name
2. Enter invalid email
3. Set negative price
4. Use duplicate serial number

**Expected Results**:
- Clear error messages
- Field highlighting
- Cannot save invalid data

### Test EH-02: File Upload Errors
**Objective**: Test upload restrictions

**Steps**:
1. Try uploading:
   - Oversized file (> 50MB)
   - Executable (.exe)
   - Invalid type
2. Check error messages

**Expected Results**:
- Uploads rejected
- Clear error reasons
- No security issues

## Integration Tests

### Test IN-01: Asset to Task Flow
**Objective**: Full workflow test

**Steps**:
1. Create asset "Test Printer"
2. Add maintenance schedule
3. Wait for task generation
4. Complete generated task
5. Verify history

**Expected Results**:
- Asset created
- Schedule active
- Task auto-generated
- Completion tracked
- History accurate

### Test IN-02: Multi-User Collaboration
**Objective**: Test concurrent usage

**Steps**:
1. User A: Create asset
2. User B: Add comment
3. User A: Upload file
4. User B: Create task
5. Both: View updates

**Expected Results**:
- Real-time updates
- No conflicts
- Proper attribution
- Notifications sent

## Acceptance Criteria

### Critical Features
- [ ] Assets CRUD working
- [ ] File uploads functional
- [ ] Schedules generating tasks
- [ ] Permissions enforced
- [ ] Notifications delivered

### Performance Targets
- [ ] Page loads < 3 seconds
- [ ] Search results < 1 second
- [ ] File uploads < 30 seconds
- [ ] No memory leaks
- [ ] Concurrent user support

### Security Requirements
- [ ] RBAC properly enforced
- [ ] File types validated
- [ ] XSS prevention working
- [ ] SQL injection prevented
- [ ] CSRF tokens valid

## Test Execution Log

| Test ID | Date | Tester | Result | Notes |
|---------|------|--------|--------|-------|
| AM-01 | | | | |
| AM-02 | | | | |
| AM-03 | | | | |
| ... | | | | |

## Known Issues

1. **Issue**: [Description]
   - **Severity**: High/Medium/Low
   - **Workaround**: [If any]
   - **Status**: Open/Fixed

## Sign-Off

- [ ] All critical tests passed
- [ ] Performance acceptable
- [ ] Security validated
- [ ] Documentation complete
- [ ] Ready for production

**QA Lead**: _________________ Date: _______

**Product Owner**: _____________ Date: _______

**Development Lead**: __________ Date: _______