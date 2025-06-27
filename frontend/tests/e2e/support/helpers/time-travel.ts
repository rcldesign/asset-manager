import { APIRequestContext } from '@playwright/test';

/**
 * Time travel helper for controlling backend time in E2E tests
 * Works in conjunction with Playwright's native page.clock API
 */
export class TimeTravel {
  private request: APIRequestContext;
  private baseUrl: string;

  constructor(request: APIRequestContext, baseUrl = 'http://localhost:3001') {
    this.request = request;
    this.baseUrl = baseUrl;
  }

  /**
   * Set backend server time to a specific date/time
   */
  async setTo(dateTime: string | Date) {
    const timestamp = typeof dateTime === 'string' ? dateTime : dateTime.toISOString();
    const response = await this.request.post(`${this.baseUrl}/api/test-support/time-travel`, {
      data: { set: timestamp }
    });
    
    if (!response.ok()) {
      throw new Error(`Failed to set backend time: ${response.status()} ${await response.text()}`);
    }
    
    return await response.json();
  }

  /**
   * Advance backend server time by a duration
   * @param duration - Duration in milliseconds or human-readable format
   */
  async advance(duration: number | string) {
    let milliseconds: number;
    
    if (typeof duration === 'string') {
      milliseconds = this.parseDuration(duration);
    } else {
      milliseconds = duration;
    }

    const response = await this.request.post(`${this.baseUrl}/api/test-support/time-travel`, {
      data: { advance: milliseconds }
    });
    
    if (!response.ok()) {
      throw new Error(`Failed to advance backend time: ${response.status()} ${await response.text()}`);
    }
    
    return await response.json();
  }

  /**
   * Reset backend server time to normal system time
   */
  async reset() {
    const response = await this.request.post(`${this.baseUrl}/api/test-support/time-reset`);
    
    if (!response.ok()) {
      throw new Error(`Failed to reset backend time: ${response.status()} ${await response.text()}`);
    }
    
    return await response.json();
  }

  /**
   * Get current backend server time (useful for debugging)
   */
  async getCurrentTime() {
    const response = await this.request.get(`${this.baseUrl}/api/test-support/current-time`);
    
    if (!response.ok()) {
      throw new Error(`Failed to get backend time: ${response.status()} ${await response.text()}`);
    }
    
    return await response.json();
  }

  /**
   * Parse human-readable duration strings into milliseconds
   * Supports: "1 minute", "30 seconds", "2 hours", "1 day", "1 week", "1 month", "1 year"
   */
  private parseDuration(duration: string): number {
    const patterns = [
      { regex: /(\d+)\s*(?:ms|milliseconds?)/i, multiplier: 1 },
      { regex: /(\d+)\s*(?:s|seconds?)/i, multiplier: 1000 },
      { regex: /(\d+)\s*(?:m|minutes?)/i, multiplier: 60 * 1000 },
      { regex: /(\d+)\s*(?:h|hours?)/i, multiplier: 60 * 60 * 1000 },
      { regex: /(\d+)\s*(?:d|days?)/i, multiplier: 24 * 60 * 60 * 1000 },
      { regex: /(\d+)\s*(?:w|weeks?)/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
      { regex: /(\d+)\s*(?:months?)/i, multiplier: 30 * 24 * 60 * 60 * 1000 },
      { regex: /(\d+)\s*(?:y|years?)/i, multiplier: 365 * 24 * 60 * 60 * 1000 }
    ];

    for (const pattern of patterns) {
      const match = duration.match(pattern.regex);
      if (match) {
        return parseInt(match[1]) * pattern.multiplier;
      }
    }

    // Try parsing as a simple number (assume milliseconds)
    const num = parseInt(duration);
    if (!isNaN(num)) {
      return num;
    }

    throw new Error(`Invalid duration format: ${duration}`);
  }
}

/**
 * Convenience function to create a TimeTravel instance
 */
export function createTimeTravel(request: APIRequestContext, baseUrl?: string) {
  return new TimeTravel(request, baseUrl);
}

/**
 * Common date constants for testing
 */
export const TestDates = {
  // Seasonal dates
  SPRING_START: '2024-03-20T10:00:00Z',
  SUMMER_START: '2024-06-21T10:00:00Z',
  FALL_START: '2024-09-22T10:00:00Z',
  WINTER_START: '2024-12-21T10:00:00Z',
  
  // Monthly dates
  MONTH_START: '2024-06-01T10:00:00Z',
  MONTH_MIDDLE: '2024-06-15T10:00:00Z',
  MONTH_END: '2024-06-30T10:00:00Z',
  
  // Business days
  MONDAY: '2024-06-03T10:00:00Z',
  FRIDAY: '2024-06-07T17:00:00Z',
  SATURDAY: '2024-06-08T10:00:00Z',
  SUNDAY: '2024-06-09T10:00:00Z',
  
  // Year boundaries
  YEAR_END: '2024-12-31T23:59:59Z',
  NEW_YEAR: '2025-01-01T00:00:01Z'
};