# File Backup Strategy for Asset Manager

## Overview

This document outlines the backup strategy for user-uploaded files in the Asset Manager system. The system supports two primary storage configurations: Docker volumes (for containerized deployments) and SMB/network shares (for enterprise environments).

## Storage Architecture

The Asset Manager uses a flexible file storage system that can be configured through environment variables:

- **Local Storage (Docker Volume)**: Files stored in `/app/uploads` within the container
- **SMB/Network Share**: Files stored on enterprise network storage infrastructure

## Backup Strategies by Storage Type

### 1. Docker Volume Backups

For deployments using Docker volumes for file storage, the following backup methods are recommended:

#### A. Volume Snapshot Method
```bash
# Create a backup of the uploads volume
docker run --rm \
  -v asset-manager_uploads:/source:ro \
  -v /backup/location:/backup \
  alpine tar -czf /backup/uploads-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C /source .
```

#### B. Docker Volume Export
```bash
# Stop the application container
docker-compose stop backend

# Create a temporary container and export the volume
docker run --rm \
  -v asset-manager_uploads:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "cd /data && tar -czf /backup/uploads-$(date +%Y%m%d).tar.gz ."

# Restart the application
docker-compose start backend
```

#### C. Automated Backup Script
Create a cron job that runs daily:

```bash
#!/bin/bash
# backup-uploads.sh

BACKUP_DIR="/var/backups/asset-manager"
RETENTION_DAYS=30
VOLUME_NAME="asset-manager_uploads"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create timestamped backup
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/uploads-backup-$TIMESTAMP.tar.gz"

# Perform backup
docker run --rm \
  -v "$VOLUME_NAME":/source:ro \
  -v "$BACKUP_DIR":/backup \
  alpine tar -czf "/backup/uploads-backup-$TIMESTAMP.tar.gz" -C /source .

# Remove old backups
find "$BACKUP_DIR" -name "uploads-backup-*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $BACKUP_FILE"
```

#### D. Using Docker Compose
Add a backup service to your `docker-compose.yml`:

```yaml
services:
  backup:
    image: alpine
    volumes:
      - uploads:/source:ro
      - ./backups:/backup
    command: >
      sh -c "
        while true; do
          tar -czf /backup/uploads-backup-$$(date +%Y%m%d-%H%M%S).tar.gz -C /source .
          find /backup -name 'uploads-backup-*.tar.gz' -mtime +30 -delete
          sleep 86400
        done
      "
    restart: unless-stopped
```

### 2. SMB/Network Share Backups

For deployments using SMB/network shares, backup responsibilities typically fall under existing enterprise backup infrastructure:

#### Enterprise Backup Integration
- **Managed by IT**: SMB shares are typically backed up by enterprise backup solutions (e.g., Veeam, NetBackup, Commvault)
- **Retention Policies**: Follow organizational data retention policies
- **Disaster Recovery**: Included in enterprise DR plans

#### Recommendations for SMB Deployments
1. **Verify Coverage**: Ensure the SMB share path is included in enterprise backup schedules
2. **Document Path**: Clearly document the SMB share path in deployment documentation
3. **Test Restores**: Periodically verify restore procedures with IT team
4. **Access Rights**: Ensure backup service accounts have appropriate read permissions

### 3. Backup Best Practices

#### Scheduling
- **Frequency**: Daily incremental backups, weekly full backups
- **Timing**: Schedule during low-usage periods (e.g., 2-4 AM)
- **Retention**: 
  - Daily backups: 7 days
  - Weekly backups: 4 weeks
  - Monthly backups: 12 months

#### Storage Recommendations
- **3-2-1 Rule**: 3 copies of data, 2 different storage media, 1 offsite location
- **Encryption**: Encrypt backup files at rest and in transit
- **Compression**: Use gzip compression to reduce storage requirements
- **Verification**: Regularly test backup integrity and restoration procedures

#### Monitoring
- Set up alerts for:
  - Backup job failures
  - Low disk space on backup storage
  - Backup file corruption
  - Exceeded retention periods

### 4. Restore Procedures

#### Docker Volume Restore
```bash
# Stop the application
docker-compose stop backend

# Clear existing volume (if needed)
docker volume rm asset-manager_uploads

# Create new volume
docker volume create asset-manager_uploads

# Restore from backup
docker run --rm \
  -v asset-manager_uploads:/target \
  -v /backup/location:/backup:ro \
  alpine tar -xzf /backup/uploads-backup-20240625.tar.gz -C /target

# Restart application
docker-compose start backend
```

#### File-Level Restore
For restoring individual files:

```bash
# Extract specific files from backup
tar -xzf uploads-backup-20240625.tar.gz -C /tmp path/to/specific/file

# Copy to volume
docker cp /tmp/path/to/specific/file container_name:/app/uploads/path/to/specific/file
```

### 5. Disaster Recovery

#### RTO and RPO Targets
- **Recovery Time Objective (RTO)**: 4 hours
- **Recovery Point Objective (RPO)**: 24 hours

#### DR Procedures
1. **Identify Failure**: Detect storage failure or data corruption
2. **Assess Impact**: Determine extent of data loss
3. **Initiate Recovery**: 
   - For Docker: Restore from most recent backup
   - For SMB: Work with IT to restore from enterprise backup
4. **Verify Integrity**: Check restored files for completeness
5. **Resume Operations**: Restart application services
6. **Post-Mortem**: Document incident and improve procedures

### 6. Security Considerations

#### Backup Security
- **Access Control**: Restrict backup storage access to authorized personnel only
- **Encryption**: Use AES-256 encryption for backup files
- **Secure Transfer**: Use SSH/SCP for backup transfers
- **Audit Logging**: Log all backup and restore operations

#### Compliance
- Ensure backup procedures comply with:
  - Data retention regulations
  - Privacy laws (GDPR, CCPA)
  - Industry standards (SOC 2, ISO 27001)

### 7. Implementation Checklist

- [ ] Choose appropriate backup method based on deployment type
- [ ] Set up automated backup scripts/services
- [ ] Configure backup retention policies
- [ ] Test restore procedures
- [ ] Document backup locations and credentials
- [ ] Set up monitoring and alerting
- [ ] Train operations team on procedures
- [ ] Schedule regular backup verification tests
- [ ] Review and update strategy quarterly

### 8. Configuration Reference

#### Environment Variables
```bash
# Storage configuration
FILE_STORAGE_PROVIDER=local|smb
FILE_STORAGE_PATH=/app/uploads

# SMB configuration (if using SMB)
SMB_SHARE=//server/share
SMB_USERNAME=backup_user
SMB_PASSWORD=secure_password
SMB_DOMAIN=COMPANY
```

#### Backup Script Installation
```bash
# Install backup script
sudo cp backup-uploads.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/backup-uploads.sh

# Add to crontab (runs daily at 2 AM)
echo "0 2 * * * /usr/local/bin/backup-uploads.sh >> /var/log/asset-manager-backup.log 2>&1" | sudo crontab -
```

### 9. Monitoring and Alerts

#### Backup Monitoring Script
```bash
#!/bin/bash
# monitor-backups.sh

BACKUP_DIR="/var/backups/asset-manager"
MAX_AGE_HOURS=26  # Alert if no backup in 26 hours
MIN_SIZE_MB=10    # Alert if backup smaller than 10MB

# Find most recent backup
LATEST_BACKUP=$(find "$BACKUP_DIR" -name "uploads-backup-*.tar.gz" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2)

if [ -z "$LATEST_BACKUP" ]; then
    echo "CRITICAL: No backup files found"
    exit 2
fi

# Check age
AGE_SECONDS=$(($(date +%s) - $(stat -c %Y "$LATEST_BACKUP")))
AGE_HOURS=$((AGE_SECONDS / 3600))

if [ $AGE_HOURS -gt $MAX_AGE_HOURS ]; then
    echo "WARNING: Latest backup is $AGE_HOURS hours old"
    exit 1
fi

# Check size
SIZE_MB=$(du -m "$LATEST_BACKUP" | cut -f1)

if [ $SIZE_MB -lt $MIN_SIZE_MB ]; then
    echo "WARNING: Latest backup is only ${SIZE_MB}MB"
    exit 1
fi

echo "OK: Latest backup is $AGE_HOURS hours old and ${SIZE_MB}MB"
exit 0
```

### 10. Support and Maintenance

#### Regular Tasks
- **Weekly**: Verify latest backup completion
- **Monthly**: Test restore procedure with sample file
- **Quarterly**: Review and update backup strategy
- **Annually**: Full disaster recovery drill

#### Contact Information
- **Backup Issues**: infrastructure@company.com
- **SMB/Network Issues**: IT-helpdesk@company.com
- **Application Support**: asset-manager-support@company.com