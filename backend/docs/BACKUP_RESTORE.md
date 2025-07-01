# Backup and Restore Documentation

## Overview

The DumbAssets Enhanced application provides comprehensive backup and restore functionality to protect your data. This feature is available only to users with the OWNER role to ensure data security.

## Backup Types

### Full Backup
- Includes both database and user-uploaded files
- Recommended for complete system backups
- Creates a single archive containing all data

### Database-Only Backup
- Backs up only the PostgreSQL database
- Smaller backup size
- Useful for frequent database snapshots

### Files-Only Backup
- Backs up only user-uploaded files and attachments
- Useful when database hasn't changed significantly
- For SMB storage, provides instructions instead of actual files

## API Endpoints

### Create Backup
```
POST /api/backup/create
Authorization: Bearer <token>

Body:
{
  "type": "full" | "database" | "files",
  "description": "Optional description"
}
```

### List Backups
```
GET /api/backup/list
Authorization: Bearer <token>
```

### Restore Backup
```
POST /api/backup/restore/:backupId
Authorization: Bearer <token>

Body:
{
  "validateChecksum": true,
  "rollbackOnFailure": true,
  "dryRun": false
}
```

### Delete Backup
```
DELETE /api/backup/:backupId
Authorization: Bearer <token>
```

## Storage Configurations

### Embedded Database (Default)
- Database is backed up using pg_dump
- Compressed with gzip for space efficiency
- Restored using psql

### External Database
- Connection details are parsed from DATABASE_URL
- Uses pg_dump with remote connection
- Ensure network connectivity during backup/restore

### Local File Storage (Docker Volume)
- Files are copied directly into the backup archive
- Preserves directory structure
- Restored by replacing existing files

### SMB File Storage
- Backup includes information file with SMB details
- Actual files must be backed up using your SMB infrastructure
- Manual restore required for SMB-stored files

## Backup Archive Structure

```
backup-{uuid}.zip
├── metadata.json     # Backup metadata and configuration
├── database.sql.gz   # Compressed database dump (if included)
└── files/           # User uploaded files (if included)
    └── {organizationId}/
        └── ... (file structure)
```

## Security Features

- **Checksum Validation**: SHA-256 checksums ensure backup integrity
- **Organization Isolation**: Backups are restricted to their organization
- **Role-Based Access**: Only OWNER role can manage backups
- **Encrypted Storage**: Backup files can be encrypted at rest (filesystem level)

## Best Practices

1. **Regular Backups**: Schedule regular backups based on your data change frequency
2. **Offsite Storage**: Copy backup files to offsite storage for disaster recovery
3. **Test Restores**: Regularly test restore procedures in a non-production environment
4. **Retention Policy**: Implement a backup retention policy to manage storage
5. **Monitor Backup Size**: Track backup sizes to detect unusual growth

## Restore Procedures

### Dry Run Mode
Always test restore with dry run first:
```json
{
  "dryRun": true,
  "validateChecksum": true
}
```

### Full Restore Process
1. Validate backup integrity (checksum)
2. Create restore checkpoint (if rollback enabled)
3. Extract backup archive
4. Restore database (if included)
5. Restore files (if included)
6. Clean up temporary files

### Rollback on Failure
- Enabled by default
- Creates checkpoint before restore
- Automatically rolls back on any error
- Disable only if you have manual rollback procedures

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - Ensure user has OWNER role
   - Check file system permissions on backup directory

2. **Database Connection Failed**
   - Verify DATABASE_URL is correct
   - Check network connectivity for external databases
   - Ensure pg_dump/psql are installed

3. **Insufficient Disk Space**
   - Check available space before backup
   - Consider database-only or files-only backups
   - Clean up old backups regularly

4. **Checksum Validation Failed**
   - Backup file may be corrupted
   - Try downloading backup again
   - Check disk integrity

### Manual Backup Commands

For advanced users who need manual backup:

```bash
# Database backup (embedded)
pg_dump "$DATABASE_URL" | gzip > database_backup.sql.gz

# Database restore (embedded)
gunzip -c database_backup.sql.gz | psql "$DATABASE_URL"

# Files backup (Docker volume)
tar -czf files_backup.tar.gz /app/uploads/{organizationId}
```

## Integration with External Tools

The backup files are standard formats that can be integrated with:
- Automated backup solutions (Velero, Restic)
- Cloud storage services (S3, Azure Blob, Google Cloud Storage)
- Monitoring systems (Prometheus, Grafana)
- Disaster recovery platforms

## Environment Variables

- `UPLOAD_DIR`: Base directory for file uploads and backups
- `DATABASE_URL`: PostgreSQL connection string
- `USE_EMBEDDED_DB`: Whether using embedded PostgreSQL
- `FILE_STORAGE_TYPE`: 'local' or 'smb'
- `SMB_*`: SMB configuration for file storage