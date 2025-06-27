# Asset Manager User Guide - Asset Management

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Asset Categories](#asset-categories)
4. [Creating Assets](#creating-assets)
5. [Managing Assets](#managing-assets)
6. [Asset Hierarchy](#asset-hierarchy)
7. [Locations](#locations)
8. [Asset Templates](#asset-templates)
9. [File Attachments](#file-attachments)
10. [Tags and Search](#tags-and-search)
11. [Bulk Operations](#bulk-operations)
12. [Maintenance Schedules](#maintenance-schedules)
13. [Reports and Statistics](#reports-and-statistics)

## Introduction

The Asset Manager system provides comprehensive tools for tracking and managing your organization's assets. Whether you're managing IT equipment, vehicles, furniture, or any other type of asset, this guide will help you effectively use all the features available.

## Getting Started

### Accessing Asset Management
1. Log in to the Asset Manager system
2. Click on "Assets" in the main navigation menu
3. You'll see the main asset list view with filtering and search options

### Understanding the Interface
- **Asset List**: Main view showing all assets you have access to
- **Filters Panel**: Left sidebar with category, status, and location filters
- **Action Buttons**: Create new assets, import/export, and bulk operations
- **Search Bar**: Quick search by name, serial number, or description

## Asset Categories

Assets are organized into the following categories:

- **Hardware**: Computers, servers, networking equipment
- **Software**: Licenses, subscriptions, digital assets
- **Furniture**: Desks, chairs, office furniture
- **Vehicle**: Cars, trucks, company vehicles
- **Equipment**: Tools, machinery, specialized equipment
- **Property**: Buildings, land, real estate
- **Other**: Miscellaneous assets

## Creating Assets

### Manual Creation
1. Click the "Create Asset" button
2. Fill in the required fields:
   - **Name**: Descriptive name for the asset
   - **Category**: Select from the dropdown
   - **Location**: Choose where the asset is located
3. Optional fields:
   - **Description**: Detailed information about the asset
   - **Manufacturer**: Company that made the asset
   - **Model Number**: Specific model identifier
   - **Serial Number**: Unique serial number
   - **Purchase Date**: When the asset was acquired
   - **Purchase Price**: Cost of the asset
   - **Warranty Expiry**: When warranty ends
   - **Tags**: Keywords for easy searching
4. Click "Save" to create the asset

### Using Asset Templates
1. When creating an asset, select "Use Template"
2. Choose from available templates for common asset types
3. The form will be pre-filled with template defaults
4. Modify any fields as needed
5. Save to create the asset

### Bulk Import
1. Click "Import Assets" button
2. Download the CSV template
3. Fill in your asset data following the template format
4. Upload the completed CSV file
5. Review the import preview
6. Confirm to import all assets

## Managing Assets

### Viewing Asset Details
1. Click on any asset in the list to view details
2. The detail view shows:
   - All asset information
   - Attached files and documents
   - Maintenance history
   - Related tasks
   - Child assets (if any)

### Editing Assets
1. Open the asset detail view
2. Click "Edit" button
3. Update any fields as needed
4. Save your changes

### Asset Status
Track the operational status of each asset:
- **Operational**: Asset is working normally
- **Maintenance**: Currently being serviced
- **Repair**: Being repaired
- **Retired**: No longer in active use
- **Disposed**: Asset has been disposed of
- **Lost**: Asset cannot be located

## Asset Hierarchy

### Parent-Child Relationships
Assets can be organized hierarchically:
- A computer can have components (RAM, hard drives) as child assets
- A building can have rooms as child assets
- Vehicles can have parts tracked as separate assets

### Creating Child Assets
1. Open the parent asset detail view
2. Click "Add Child Asset"
3. Fill in the asset information
4. The parent relationship is automatically set

### Viewing Asset Tree
1. Use the "Tree View" option in the asset list
2. Expand/collapse parent assets to see children
3. Navigate the hierarchy visually

## Locations

### Location Hierarchy
Locations are organized hierarchically:
- Company → Building → Floor → Room
- Warehouse → Zone → Shelf
- Custom hierarchies based on your needs

### Managing Locations
1. Click "Locations" in the navigation
2. View the location tree
3. Add new locations at any level
4. Move assets between locations via drag-and-drop

### Assigning Assets to Locations
1. When creating/editing an asset, select its location
2. Use bulk operations to move multiple assets
3. View all assets at a location from the location detail page

## Asset Templates

### Creating Templates
1. Navigate to "Asset Templates"
2. Click "Create Template"
3. Define:
   - Template name
   - Default category
   - Pre-filled fields
   - Custom field definitions
4. Save the template

### Custom Fields
Templates can include custom fields for specific asset types:
- Text fields (e.g., IP address for network equipment)
- Number fields (e.g., capacity for storage devices)
- Date fields (e.g., certification expiry)
- Dropdown selections (e.g., operating system)

### Using Templates
1. Templates appear when creating new assets
2. Select a template to pre-fill the form
3. All custom fields will be included
4. Modify as needed before saving

## File Attachments

### Supported File Types
- Images: Photos of assets (JPG, PNG, GIF, WebP)
- Documents: Manuals, warranties, receipts (PDF, DOC, DOCX)
- Spreadsheets: Asset data, reports (XLS, XLSX, CSV)
- Archives: Multiple files (ZIP, RAR, 7Z)

### Uploading Files
1. Open the asset detail view
2. Go to the "Attachments" tab
3. Click "Upload File"
4. Select file type:
   - Photo: Visual reference of the asset
   - Receipt: Purchase documentation
   - Manual: User or service manual
   - Warranty: Warranty documentation
   - Other: Any other relevant file
5. Choose file(s) to upload
6. Add description if needed

### File Storage Options
Your administrator can configure file storage:
- **Local Storage**: Files stored on the application server
- **Network Storage (SMB)**: Files stored on enterprise file shares

### Managing Attachments
- Set one image as the primary photo
- Download files individually or in bulk
- Delete outdated attachments
- Preview images directly in the browser

## Tags and Search

### Using Tags
Tags help categorize and find assets quickly:
- Add multiple tags to each asset
- Use consistent naming conventions
- Common tags: "critical", "leased", "under-warranty"

### Search Features
1. **Quick Search**: Search by name, serial number, description
2. **Advanced Search**: 
   - Filter by category, status, location
   - Date range filters (purchase date, warranty expiry)
   - Price range filters
   - Tag filters
3. **Saved Searches**: Save frequently used search criteria

## Bulk Operations

### Available Bulk Actions
1. Select multiple assets using checkboxes
2. Choose from bulk actions:
   - **Update Status**: Change status for all selected
   - **Move Location**: Assign new location
   - **Update Category**: Change category
   - **Add Tags**: Apply tags to multiple assets
   - **Delete**: Remove multiple assets

### Export Operations
1. Filter assets as needed
2. Click "Export"
3. Choose format:
   - CSV: For spreadsheet applications
   - PDF: For reports and documentation
   - Excel: For advanced analysis

## Maintenance Schedules

### Creating Schedules
1. Open an asset detail view
2. Go to "Schedules" tab
3. Click "Add Schedule"
4. Choose schedule type:
   - **One-off**: Single maintenance task
   - **Fixed Interval**: Regular recurring maintenance
   - **Custom**: Complex scheduling patterns

### Schedule Configuration
- Set task details (title, description, estimated time)
- Assign to specific users or teams
- Configure notifications
- Set start and end dates

### Managing Tasks
- View upcoming maintenance tasks
- Mark tasks as complete
- Add comments and attachments to tasks
- Track maintenance history

## Reports and Statistics

### Dashboard Overview
The asset dashboard provides:
- Total asset count and value
- Assets by category breakdown
- Assets by status
- Warranty expiration alerts
- Recent activity

### Custom Reports
1. Navigate to "Reports"
2. Choose report type:
   - Asset inventory
   - Depreciation report
   - Maintenance history
   - Location summary
3. Configure parameters
4. Generate and export

### Key Metrics
- **Total Asset Value**: Sum of all asset purchase prices
- **Assets Under Warranty**: Count of assets with active warranties
- **Maintenance Due**: Assets requiring service
- **Asset Utilization**: Usage statistics

## Best Practices

### Asset Naming
- Use consistent naming conventions
- Include key identifiers in the name
- Examples:
  - "LAPTOP-DELL-001"
  - "VEHICLE-FORD-TRANSIT-2023"
  - "PRINTER-HP-FLOOR3-ROOM301"

### Regular Updates
- Update asset status when changes occur
- Keep location information current
- Review and update warranty dates
- Attach new documentation as received

### Organization Tips
- Use the hierarchy for complex assets
- Create templates for frequently added assets
- Establish tag conventions across your team
- Schedule regular audits

## Troubleshooting

### Common Issues

**Can't find an asset:**
- Check filters aren't hiding it
- Try searching by serial number
- Verify you have permission to view it

**Upload fails:**
- Check file size (max 50MB for assets)
- Verify file type is supported
- Ensure you have update permissions

**Can't edit an asset:**
- Verify you have appropriate role (Manager or Owner)
- Check if asset is locked by another user
- Ensure you're in the correct organization

### Getting Help
- Contact your system administrator
- Check the knowledge base
- Submit a support ticket with asset ID

## Role-Based Permissions

### Viewer Role
- View asset list and details
- Download attachments
- View reports

### Member Role
- All Viewer permissions
- Create new assets
- Edit assets
- Upload attachments

### Manager Role
- All Member permissions
- Delete assets
- Bulk operations
- Create templates
- Manage schedules

### Owner Role
- All Manager permissions
- Full system configuration
- User management
- Organization settings