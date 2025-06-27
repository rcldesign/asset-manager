import { apiClient } from '../lib/api-client';
import type { UserInvitation } from '../types';

export interface CreateInvitationDto {
  email: string;
  role: 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER';
  message?: string;
}

export interface InvitationListParams {
  status?: 'pending' | 'accepted' | 'expired';
  page?: number;
  limit?: number;
}

export const invitationsApi = {
  /**
   * Get list of invitations
   */
  async getInvitations(params?: InvitationListParams) {
    const { data } = await apiClient.get<{
      invitations: UserInvitation[];
      total: number;
      page: number;
      limit: number;
    }>('/invitations', { params });
    return data;
  },

  /**
   * Get invitation by ID
   */
  async getInvitation(id: string) {
    const { data } = await apiClient.get<UserInvitation>(`/invitations/${id}`);
    return data;
  },

  /**
   * Create a new invitation
   */
  async createInvitation(invitation: CreateInvitationDto) {
    const { data } = await apiClient.post<UserInvitation>('/invitations', invitation);
    return data;
  },

  /**
   * Resend invitation email
   */
  async resendInvitation(id: string) {
    const { data } = await apiClient.post<{ message: string }>(`/invitations/${id}/resend`);
    return data;
  },

  /**
   * Cancel invitation
   */
  async cancelInvitation(id: string) {
    const { data } = await apiClient.delete<{ message: string }>(`/invitations/${id}`);
    return data;
  },

  /**
   * Accept invitation (public endpoint, no auth required)
   */
  async acceptInvitation(token: string, password: string) {
    const { data } = await apiClient.post<{
      message: string;
      user: any;
    }>(`/invitations/accept`, { token, password });
    return data;
  },
};