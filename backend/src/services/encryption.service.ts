import crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * EncryptionService provides secure encryption/decryption functionality
 * Currently uses Node.js crypto module with AES-256-GCM
 * Can be easily upgraded to use external services like AWS KMS or HashiCorp Vault
 */
export class EncryptionService {
  private static instance: EncryptionService;
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits
  private readonly encryptionKey: Buffer;

  private constructor() {
    const keyString = process.env.ENCRYPTION_KEY;
    if (!keyString) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    if (keyString.length !== this.keyLength) {
      throw new Error(`ENCRYPTION_KEY must be exactly ${this.keyLength} characters long`);
    }

    this.encryptionKey = Buffer.from(keyString, 'utf8');
  }

  /**
   * Get singleton instance of EncryptionService
   */
  public static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService();
    }
    return EncryptionService.instance;
  }

  /**
   * Encrypt plaintext data
   * @param plaintext - The data to encrypt
   * @returns Base64-encoded encrypted data with IV and auth tag
   */
  public encrypt(plaintext: string): string {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      // Combine IV + authTag + encrypted data
      const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);

      return combined.toString('base64');
    } catch (error) {
      logger.error('Encryption failed', error instanceof Error ? error : undefined);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt encrypted data
   * @param encryptedData - Base64-encoded encrypted data with IV and auth tag
   * @returns Decrypted plaintext
   */
  public decrypt(encryptedData: string): string {
    try {
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract components
      const iv = combined.subarray(0, this.ivLength);
      const authTag = combined.subarray(this.ivLength, this.ivLength + this.tagLength);
      const encrypted = combined.subarray(this.ivLength + this.tagLength);

      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Decryption failed', error instanceof Error ? error : undefined);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Validate that a string appears to be encrypted by this service
   * @param data - The data to check
   * @returns True if data appears to be encrypted
   */
  public isEncrypted(data: string): boolean {
    try {
      const combined = Buffer.from(data, 'base64');
      return combined.length >= this.ivLength + this.tagLength + 1;
    } catch {
      return false;
    }
  }

  /**
   * Securely generate a random token for invitations, etc.
   * @param length - Length of the token in bytes (default: 32)
   * @returns Base64-encoded random token
   */
  public generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Hash a password or token for comparison
   * @param value - The value to hash
   * @param salt - Optional salt (will generate if not provided)
   * @returns Object with hash and salt
   */
  public hashValue(value: string, salt?: string): { hash: string; salt: string } {
    const finalSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(value, finalSalt, 100000, 64, 'sha512').toString('hex');
    return { hash, salt: finalSalt };
  }

  /**
   * Verify a value against its hash
   * @param value - The value to verify
   * @param hash - The stored hash
   * @param salt - The stored salt
   * @returns True if value matches the hash
   */
  public verifyHash(value: string, hash: string, salt: string): boolean {
    const { hash: computedHash } = this.hashValue(value, salt);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computedHash, 'hex'));
  }

  /**
   * Generate HMAC signature for webhook payloads
   * @param payload - The payload to sign
   * @param secret - The webhook secret
   * @returns HMAC signature
   */
  public generateWebhookSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verify HMAC signature for webhook payloads
   * @param payload - The payload that was signed
   * @param signature - The received signature
   * @param secret - The webhook secret
   * @returns True if signature is valid
   */
  public verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateWebhookSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex'),
    );
  }
}

// Export a singleton instance for easy use
export const encryptionService = EncryptionService.getInstance();
