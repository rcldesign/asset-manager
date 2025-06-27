import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invitationsApi, type CreateInvitationDto, type InvitationListParams } from '../api/invitations-api';
import { queryKeys } from '../lib/queryKeys';

export function useInvitations(params?: InvitationListParams) {
  return useQuery({
    queryKey: queryKeys.invitations.list(params),
    queryFn: () => invitationsApi.getInvitations(params),
  });
}

export function useInvitation(id: string) {
  return useQuery({
    queryKey: queryKeys.invitations.detail(id),
    queryFn: () => invitationsApi.getInvitation(id),
    enabled: !!id,
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invitation: CreateInvitationDto) => invitationsApi.createInvitation(invitation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all() });
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invitationsApi.resendInvitation(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.detail(id) });
    },
  });
}

export function useCancelInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invitationsApi.cancelInvitation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all() });
    },
  });
}

export function useAcceptInvitation() {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      invitationsApi.acceptInvitation(token, password),
  });
}