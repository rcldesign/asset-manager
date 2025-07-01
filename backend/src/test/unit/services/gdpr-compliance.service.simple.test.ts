import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GDPRComplianceService } from '../../../services/gdpr-compliance.service';

// Mock all external dependencies
jest.mock('../../../lib/prisma');
jest.mock('../../../services/data-export.service');
jest.mock('../../../services/audit.service');

describe('GDPRComplianceService', () => {
  let service: GDPRComplianceService;

  beforeEach(() => {
    service = new GDPRComplianceService();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance of GDPRComplianceService', () => {
      expect(service).toBeInstanceOf(GDPRComplianceService);
    });
  });

  describe('generateVerificationToken', () => {
    it('should generate a valid verification token', () => {
      const token = service.generateVerificationToken();
      
      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(token).toHaveLength(64);
    });

    it('should generate unique tokens', () => {
      const token1 = service.generateVerificationToken();
      const token2 = service.generateVerificationToken();
      
      expect(token1).not.toBe(token2);
    });
  });

  describe('getDataRetentionPolicy', () => {
    it('should return data retention policy', () => {
      const policy = service.getDataRetentionPolicy();

      expect(policy).toMatchObject({
        userData: {
          retentionPeriod: expect.any(String),
          deletionMethod: expect.any(String),
          exceptions: expect.any(Array),
        },
        activityLogs: {
          retentionPeriod: expect.any(String),
          deletionMethod: expect.any(String),
          anonymization: expect.any(String),
        },
        backups: {
          retentionPeriod: expect.any(String),
          deletionMethod: expect.any(String),
          note: expect.any(String),
        },
        exports: {
          retentionPeriod: expect.any(String),
          deletionMethod: expect.any(String),
          note: expect.any(String),
        },
      });
    });

    it('should return consistent policy structure', () => {
      const policy1 = service.getDataRetentionPolicy();
      const policy2 = service.getDataRetentionPolicy();

      expect(policy1).toEqual(policy2);
    });
  });

  describe('getRequestStatus', () => {
    it('should return null for non-existent request', async () => {
      const status = await service.getRequestStatus('invalid-request-id');
      expect(status).toBeNull();
    });
  });
});