import { UserRole } from '../lib/permissions';

/**
 * Request context interface for service-level operations.
 * This contains user and request information needed for audit logging
 * and authorization in service methods.
 */
export interface IRequestContext {
  /** ID of the user performing the action */
  userId: string;
  
  /** Optional request ID for tracing and logging correlation */
  requestId?: string;
  
  /** User's primary role for authorization */
  userRole: UserRole;
  
  /** User's organization ID for multi-tenant operations */
  organizationId: string;
}