import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/services/api';

export function usePortMutations(equipmentId?: string, siteId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      portId,
      body,
    }: {
      portId: string;
      body: { is_utilized?: boolean; description?: string };
    }) => api.updatePort(portId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment', equipmentId] });
      qc.invalidateQueries({ queryKey: ['site', siteId] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
