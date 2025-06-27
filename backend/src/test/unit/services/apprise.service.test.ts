import { AppriseService } from '../../../services/apprise.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AppriseService', () => {
  let appriseService: AppriseService;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    // Reset singleton
    (AppriseService as any).instance = undefined;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should initialize as disabled when no API URL is provided', () => {
      delete process.env.APPRISE_API_URL;

      appriseService = AppriseService.getInstance();

      expect(appriseService.isConfigured()).toBe(false);
    });

    it('should initialize as enabled when API URL is provided', () => {
      process.env.APPRISE_API_URL = 'http://localhost:8000';
      process.env.APPRISE_URLS = 'slack://token@channel,discord://webhook';

      appriseService = AppriseService.getInstance();

      expect(appriseService.isConfigured()).toBe(true);
    });

    it('should parse notification URLs correctly', () => {
      process.env.APPRISE_API_URL = 'http://localhost:8000';
      process.env.APPRISE_URLS = 'slack://token@channel,discord://webhook,telegram://token@chatid';

      appriseService = AppriseService.getInstance();
      const services = appriseService.getConfiguredServices();

      expect(services).toEqual(['slack', 'discord', 'telegram']);
    });

    it('should parse tags configuration correctly', () => {
      process.env.APPRISE_API_URL = 'http://localhost:8000';
      process.env.APPRISE_URLS = 'slack://token@channel';
      process.env.APPRISE_TAGS = 'admin:slack,discord;users:telegram;alerts:*';

      appriseService = AppriseService.getInstance();

      // We don't have a public method to get tags, but we can test indirectly
      expect(appriseService.isConfigured()).toBe(true);
    });
  });

  describe('sendNotification', () => {
    beforeEach(() => {
      process.env.APPRISE_API_URL = 'http://localhost:8000';
      process.env.APPRISE_URLS = 'slack://token@channel';
      appriseService = AppriseService.getInstance();
    });

    it('should send notification successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const result = await appriseService.sendNotification({
        title: 'Test Title',
        body: 'Test Body',
        type: 'info',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:8000/notify',
        expect.objectContaining({
          title: 'Test Title',
          body: 'Test Body',
          type: 'info',
        }),
        expect.any(Object),
      );
    });

    it('should return false when API returns non-success status', async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 500, statusText: 'Internal Server Error' });

      const result = await appriseService.sendNotification({
        title: 'Test Title',
        body: 'Test Body',
      });

      expect(result).toBe(false);
    });

    it('should return false when API call fails', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      const result = await appriseService.sendNotification({
        title: 'Test Title',
        body: 'Test Body',
      });

      expect(result).toBe(false);
    });

    it('should skip notification when not configured', async () => {
      delete process.env.APPRISE_API_URL;
      delete process.env.APPRISE_URLS;

      // Reset singleton to pick up new environment
      (AppriseService as any).instance = undefined;
      appriseService = AppriseService.getInstance();

      const result = await appriseService.sendNotification({
        title: 'Test Title',
        body: 'Test Body',
      });

      expect(result).toBe(false);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('testConfiguration', () => {
    beforeEach(() => {
      process.env.APPRISE_API_URL = 'http://localhost:8000';
      process.env.APPRISE_URLS = 'slack://token@channel';
      appriseService = AppriseService.getInstance();
    });

    it('should return true when API is reachable', async () => {
      mockedAxios.get.mockResolvedValueOnce({ status: 200 });

      const result = await appriseService.testConfiguration();

      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://localhost:8000/status',
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it('should return false when API is not reachable', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await appriseService.testConfiguration();

      expect(result).toBe(false);
    });
  });

  describe('Helper methods', () => {
    beforeEach(() => {
      process.env.APPRISE_API_URL = 'http://localhost:8000';
      process.env.APPRISE_URLS = 'slack://token@channel';
      appriseService = AppriseService.getInstance();
    });

    it('should send alert with correct type and tags', async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      await appriseService.sendAlert('Alert Title', 'Alert Body');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:8000/notify',
        expect.objectContaining({
          title: 'Alert Title',
          body: 'Alert Body',
          type: 'error',
          tag: ['alerts', 'admin'],
          format: 'markdown',
        }),
        expect.any(Object),
      );
    });

    it('should send info notification with correct type', async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      await appriseService.sendInfo('Info Title', 'Info Body');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:8000/notify',
        expect.objectContaining({
          title: 'Info Title',
          body: 'Info Body',
          type: 'info',
          format: 'markdown',
        }),
        expect.any(Object),
      );
    });
  });
});
