# Asset Management User Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Asset Categories](#asset-categories)
4. [Creating Assets](#creating-assets)
5. [Asset Templates](#asset-templates)
6. [Managing Asset Information](#managing-asset-information)
7. [Asset Hierarchy](#asset-hierarchy)
8. [File Attachments](#file-attachments)
9. [Asset Status Tracking](#asset-status-tracking)
10. [Warranty Management](#warranty-management)
11. [Custom Fields](#custom-fields)
12. [Asset Search and Filtering](#asset-search-and-filtering)
13. [Bulk Operations](#bulk-operations)
14. [Best Practices](#best-practices)

## Introduction

DumbAssets Enhanced provides comprehensive asset management capabilities for tracking physical and digital assets throughout their lifecycle. This guide covers all aspects of managing assets effectively.

## Getting Started

### Prerequisites
- Active user account with appropriate permissions
- Organization membership
- Asset permissions (read/create/update/delete based on role)

### Key Concepts
- **Asset**: Any item of value tracked by your organization
- **Asset Template**: Predefined configuration for creating similar assets
- **Location**: Physical or logical location where assets are stored
- **Category**: Classification of assets (Hardware, Software, etc.)
- **Status**: Current state of the asset (Operational, Maintenance, etc.)

## Asset Categories

Assets can be categorized into the following types:

### Hardware
Physical computing equipment:
- Computers, laptops, servers
- Monitors, keyboards, mice
- Printers, scanners
- Network equipment

### Software
Digital assets and licenses:
- Software licenses
- Subscriptions
- Digital tools
- Cloud services

### Furniture
Office furniture and fixtures:
- Desks, chairs
- Storage units
- Conference room equipment

### Vehicle
Company vehicles:
- Cars, trucks
- Maintenance equipment
- Fleet vehicles

### Equipment
General equipment:
- Tools
- Manufacturing equipment
- Safety equipment

### Property
Real estate and facilities:
- Buildings
- Land
- Leased spaces

### Other
Any assets not fitting above categories

## Creating Assets

### Basic Asset Creation

1. Navigate to Assets section
2. Click "Create Asset"
3. Fill in required fields:
   - **Name**: Descriptive name
   - **Category**: Select appropriate category
   - **Location**: Assign to location (optional)

### Using Asset Templates

1. Select "Create from Template"
2. Choose appropriate template
3. Override any template defaults as needed
4. Save the asset

### Required Information
- Asset name
- Category
- Organization (auto-filled)

### Optional Information
- Description
- Manufacturer
- Model number
- Serial number
- Purchase date and price
- Warranty information
- Location assignment
- Parent asset (for hierarchical relationships)
- Tags for categorization
- Custom fields

## Asset Templates

### What are Asset Templates?

Templates allow you to:
- Standardize asset creation
- Pre-fill common values
- Define custom field schemas
- Ensure consistency

### Creating Templates

1. Navigate to Asset Templates
2. Click "Create Template"
3. Define template properties:
   ```json
   {
     "name": "Standard Laptop",
     "category": "HARDWARE",
     "defaultValues": {
       "manufacturer": "Dell",
       "warrantyScope": "3 years on-site",
       "tags": ["laptop", "employee-equipment"]
     },
     "customFieldsSchema": {
       "type": "object",
       "properties": {
         "assignedTo": {"type": "string"},
         "department": {"type": "string"},
         "osVersion": {"type": "string"}
       }
     }
   }
   ```

### Using Templates

Templates can be used when:
- Creating new assets
- Bulk importing assets
- Standardizing existing assets

## Managing Asset Information

### Updating Asset Details

1. Navigate to asset detail page
2. Click "Edit"
3. Update desired fields
4. Save changes

### Field-Level Permissions

Based on your role:
- **Viewers**: Read-only access (no pricing info)
- **Members**: Can update own assets
- **Managers**: Full update access
- **Owners**: All permissions

### Tracking Changes

All changes are logged with:
- User who made the change
- Timestamp
- Previous and new values

## Asset Hierarchy

### Parent-Child Relationships

Assets can be organized hierarchically:
- Computer → Components (RAM, HDD, etc.)
- Building → Rooms → Equipment
- Vehicle → Parts

### Creating Hierarchies

1. Create parent asset first
2. When creating child asset, select parent
3. System maintains path automatically

### Benefits
- Organized structure
- Inherited properties
- Bulk operations on asset trees
- Clear ownership chains

## File Attachments

### Supported File Types

**Photos**:
- JPEG, PNG, WebP
- Primary photo for visual identification

**Documents**:
- PDF receipts
- Word/Excel documents
- Text files

**Archives**:
- ZIP files
- Compressed manuals

### Uploading Files

1. Navigate to asset detail
2. Click "Attachments" tab
3. Upload files:
   - Drag and drop
   - Click to browse
4. Set attachment type:
   - Photo
   - Receipt
   - Manual
   - Other

### Security Features
- File type validation
- Size limits (50MB for assets)
- Malware scanning (if enabled)
- Secure storage

## Asset Status Tracking

### Available Statuses

**Operational**: Asset is working normally
**Maintenance**: Undergoing scheduled maintenance
**Repair**: Being repaired
**Retired**: No longer in active use
**Disposed**: Permanently removed
**Lost**: Cannot be located

### Status Transitions

```
Operational → Maintenance → Operational
     ↓              ↓
   Repair  →   Operational
     ↓
  Retired → Disposed
     ↓
   Lost
```

### Best Practices
- Update status promptly
- Add notes when changing status
- Use bulk operations for multiple assets
- Set up notifications for status changes

## Warranty Management

### Primary Warranty
- Warranty scope/description
- Expiry date or lifetime warranty
- Warranty provider contact

### Secondary Warranty
- Extended warranty information
- Additional coverage details
- Service contract information

### Warranty Alerts
- Automatic notifications before expiry
- Dashboard widgets for expiring warranties
- Reports for warranty planning

## Custom Fields

### Purpose
Store organization-specific data:
- Employee assignments
- Department codes
- Compliance information
- Technical specifications

### Configuration
Custom fields are JSON objects:
```json
{
  "assignedEmployee": "John Doe",
  "department": "IT",
  "complianceChecked": true,
  "lastAuditDate": "2024-01-15"
}
```

### Using Templates
Define schemas in templates:
- Required fields
- Field types
- Validation rules
- Default values

## Asset Search and Filtering

### Quick Search
Search across:
- Name
- Description
- Serial number
- Tags

### Advanced Filters
- Category
- Status
- Location
- Date ranges
- Custom field values
- Parent/child relationships

### Saved Searches
1. Configure filters
2. Save search with name
3. Access from quick menu

## Bulk Operations

### Supported Operations

**Update Status**: Change multiple asset statuses
**Update Category**: Recategorize assets
**Move Location**: Relocate multiple assets
**Delete**: Remove multiple assets

### How to Use
1. Select assets (checkbox)
2. Choose bulk action
3. Confirm operation
4. Review results

### Safety Features
- Confirmation required
- Rollback capability
- Audit trail
- Permission checks

## Best Practices

### Asset Naming
- Use consistent naming conventions
- Include key identifiers
- Avoid special characters
- Make it searchable

### Organization
- Use locations effectively
- Apply appropriate tags
- Maintain hierarchy
- Regular audits

### Documentation
- Upload receipts promptly
- Keep warranty info updated
- Document maintenance
- Add photos for identification

### Security
- Limit access appropriately
- Regular permission reviews
- Secure sensitive documents
- Monitor asset changes

### Maintenance
- Schedule regular reviews
- Update status timely
- Archive retired assets
- Clean up disposed items

## Troubleshooting

### Common Issues

**Cannot create asset**: Check permissions
**File upload fails**: Verify file type/size
**Search not working**: Check filter syntax
**Bulk operation blocked**: Insufficient permissions

### Getting Help
1. Check permission requirements
2. Verify data formats
3. Contact administrator
4. Review audit logs