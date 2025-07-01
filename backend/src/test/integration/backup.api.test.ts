import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import app from '../../app';
import { prisma } from '../../lib/prisma';
import { generateAccessToken } from '../../services/auth.service';
import type { Organization, User } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import { config } from '../../config';

describe('Backup API Integration Tests', () => {
  let organization: Organization;
  let ownerUser: User;
  let managerUser: User;
  let ownerToken: string;
  let managerToken: string;
  const backupDir = path.join(config.uploadDir, '..', 'backups');

  beforeAll(async () => {
    // Clean up database
    await prisma.auditTrail.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.taskComment.deleteMany();
    await prisma.taskStatusHistory.deleteMany();
    await prisma.taskAttachment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.assetAttachment.deleteMany();
    await prisma.component.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.assetTemplate.deleteMany();
    await prisma.location.deleteMany();
    await prisma.apiToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();

    // Create test organization
    organization = await prisma.organization.create({
      data: {
        name: 'Test Backup Org',
        subdomain: 'test-backup',
      },
    });

    // Create owner user
    ownerUser = await prisma.user.create({
      data: {
        email: 'owner@testbackup.com',
        password: 'hashedpassword',
        role: 'OWNER',
        organizationId: organization.id,
        emailVerified: true,
      },
    });

    // Create manager user
    managerUser = await prisma.user.create({
      data: {
        email: 'manager@testbackup.com',
        password: 'hashedpassword',
        role: 'MANAGER',
        organizationId: organization.id,
        emailVerified: true,
      },
    });

    // Generate tokens
    ownerToken = generateAccessToken(ownerUser);
    managerToken = generateAccessToken(managerUser);

    // Ensure backup directory exists
    await fs.mkdir(backupDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up database
    await prisma.auditTrail.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.taskComment.deleteMany();
    await prisma.taskStatusHistory.deleteMany();
    await prisma.taskAttachment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.assetAttachment.deleteMany();
    await prisma.component.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.assetTemplate.deleteMany();
    await prisma.location.deleteMany();
    await prisma.apiToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();

    // Clean up backup files
    try {
      const files = await fs.readdir(backupDir);
      for (const file of files) {
        if (file.startsWith('backup-')) {
          await fs.unlink(path.join(backupDir, file));
        }
      }
    } catch (error) {
      // Directory might not exist
    }

    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up any existing backups
    try {
      const files = await fs.readdir(backupDir);
      for (const file of files) {
        if (file.startsWith('backup-')) {
          await fs.unlink(path.join(backupDir, file));
        }
      }
    } catch (error) {
      // Directory might not exist
    }
  });

  describe('POST /api/backup/create', () => {
    it('should create a full backup as owner', async () => {
      const response = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          type: 'full',
          description: 'Test full backup',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        type: 'full',
        createdBy: ownerUser.email,
        description: 'Test full backup',
        includesDatabase: true,
        includesFiles: true,
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.checksum).toBeDefined();
      expect(response.body.size).toBeGreaterThan(0);
    });

    it('should create a database-only backup', async () => {
      const response = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          type: 'database',
          description: 'Database backup only',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        type: 'database',
        includesDatabase: true,
        includesFiles: false,
      });
    });

    it('should create a files-only backup', async () => {
      const response = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          type: 'files',
          description: 'Files backup only',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        type: 'files',
        includesDatabase: false,
        includesFiles: true,
      });
    });

    it('should reject backup creation for non-owner users', async () => {
      const response = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          type: 'full',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });

    it('should reject backup creation without authentication', async () => {
      const response = await request(app)
        .post('/api/backup/create')
        .send({
          type: 'full',
        });

      expect(response.status).toBe(401);
    });

    it('should validate backup type', async () => {
      const response = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          type: 'invalid',
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('GET /api/backup/list', () => {
    beforeEach(async () => {
      // Create a test backup
      await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          type: 'full',
          description: 'Test backup for listing',
        });
    });

    it('should list backups for owner', async () => {
      const response = await request(app)
        .get('/api/backup/list')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toMatchObject({
        type: 'full',
        createdBy: ownerUser.email,
        description: 'Test backup for listing',
      });
    });

    it('should reject listing for non-owner users', async () => {
      const response = await request(app)
        .get('/api/backup/list')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(403);
    });

    it('should return empty array when no backups exist', async () => {
      // Clean up backups first
      const files = await fs.readdir(backupDir);
      for (const file of files) {
        if (file.startsWith('backup-')) {
          await fs.unlink(path.join(backupDir, file));
        }
      }

      const response = await request(app)
        .get('/api/backup/list')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('POST /api/backup/restore/:backupId', () => {
    let backupId: string;

    beforeEach(async () => {
      // Create a test backup to restore
      const createResponse = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          type: 'database',
          description: 'Test backup for restore',
        });
      
      backupId = createResponse.body.id;
    });

    it('should perform dry run restore', async () => {
      const response = await request(app)
        .post(`/api/backup/restore/${backupId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          dryRun: true,
          validateChecksum: true,
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        message: 'Dry run completed successfully',
        backupId,
      });
    });

    it('should reject restore for non-owner users', async () => {
      const response = await request(app)
        .post(`/api/backup/restore/${backupId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          dryRun: true,
        });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent backup', async () => {
      const response = await request(app)
        .post('/api/backup/restore/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          dryRun: true,
        });

      expect(response.status).toBe(404);
    });

    it('should validate backup ID format', async () => {
      const response = await request(app)
        .post('/api/backup/restore/invalid-id')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          dryRun: true,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/backup/:backupId', () => {
    let backupId: string;

    beforeEach(async () => {
      // Create a test backup to delete
      const createResponse = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          type: 'files',
          description: 'Test backup for deletion',
        });
      
      backupId = createResponse.body.id;
    });

    it('should delete backup as owner', async () => {
      const response = await request(app)
        .delete(`/api/backup/${backupId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        message: 'Backup deleted successfully',
        backupId,
      });

      // Verify backup is deleted
      const listResponse = await request(app)
        .get('/api/backup/list')
        .set('Authorization', `Bearer ${ownerToken}`);
      
      const backupExists = listResponse.body.some((b: any) => b.id === backupId);
      expect(backupExists).toBe(false);
    });

    it('should reject deletion for non-owner users', async () => {
      const response = await request(app)
        .delete(`/api/backup/${backupId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent backup', async () => {
      const response = await request(app)
        .delete('/api/backup/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(404);
    });
  });
});