import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/services/api';

export function useSlotMutations(equipmentId: string, siteId: string) {
  const qc = useQueryClient();
  const createSlot = useMutation({
    mutationFn: api.createSlot,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment', equipmentId] });
      qc.invalidateQueries({ queryKey: ['site', siteId] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const deleteSlot = useMutation({
    mutationFn: api.deleteSlot,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment', equipmentId] });
      qc.invalidateQueries({ queryKey: ['site', siteId] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  return { createSlot, deleteSlot };
}
