import { AppriseService } from '../../../services/apprise.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock environment variables
const originalEnv = process.env;

beforeAll(() => {
  process.env.APPRISE_API_URL = 'http://localhost:8000';
  process.env.APPRISE_API_KEY = 'test-api-key';
  process.env.APPRISE_URLS = 'discord://webhook_id/webhook_token';
});

afterAll(() => {
  process.env = originalEnv;
});

describe('AppriseService', () => {
  let appriseService: AppriseService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton for each test
    (AppriseService as any).instance = undefined;
  });

  afterEach(() => {
    // Ensure clean state after each test
    (AppriseService as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = AppriseService.getInstance();
      const instance2 = AppriseService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('isConfigured', () => {
    it('should return true when properly configured', () => {
      appriseService = AppriseService.getInstance();
      expect(appriseService.isConfigured()).toBe(true);
    });

    it('should return false when API URL is missing', () => {
      delete process.env.APPRISE_API_URL;
      delete process.env.APPRISE_URLS;
      const service = AppriseService.getInstance();
      expect(service.isConfigured()).toBe(false);
      // Restore for next tests
      process.env.APPRISE_API_URL = 'http://localhost:8000';
      process.env.APPRISE_URLS = 'discord://webhook_id/webhook_token';
    });
  });

  describe('sendNotification', () => {
    const validNotification = {
      title: 'Test Notification',
      body: 'This is a test notification',
      type: 'info' as const,
    };

    it('should send notification successfully', async () => {
      appriseService = AppriseService.getInstance();

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const result = await appriseService.sendNotification(validNotification);

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:8000/notify',
        expect.objectContaining({
          urls: ['discord://webhook_id/webhook_token'],
          title: 'Test Notification',
          body: 'This is a test notification',
          type: 'info',
          format: 'markdown',
        }),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }),
      );
    });

    it('should handle HTTP errors', async () => {
      mockedAxios.post.mockRejectedValue({
        response: {
          status: 400,
          data: { error: 'Bad Request' },
        },
      });

      const result = await appriseService.sendNotification(validNotification);

      expect(result).toBe(false);
    });

    it('should return false when not configured', async () => {
      delete process.env.APPRISE_API_URL;
      const service = AppriseService.getInstance();

      const result = await service.sendNotification(validNotification);

      expect(result).toBe(false);
      expect(mockedAxios.post).not.toHaveBeenCalled();

      process.env.APPRISE_API_URL = 'http://localhost:8000';
      process.env.APPRISE_URLS = 'discord://webhook_id/webhook_token';
    });
  });
});
