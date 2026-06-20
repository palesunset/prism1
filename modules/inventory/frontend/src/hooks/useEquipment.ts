import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/services/api';

export function useEquipmentDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['equipment', id],
    queryFn: () => api.fetchEquipment(id!),
    enabled: Boolean(id),
  });
}

export function useEquipmentBays(equipmentId: string | undefined) {
  return useQuery({
    queryKey: ['equipment-bays', equipmentId],
    queryFn: () => api.fetchEquipmentBays(equipmentId!),
    enabled: Boolean(equipmentId),
  });
}

export function useEquipmentMutations(_siteId?: string) {
  const qc = useQueryClient();
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['sites'] });
    qc.invalidateQueries({ queryKey: ['site'] });
    qc.invalidateQueries({ queryKey: ['equipment'] });
    qc.invalidateQueries({ queryKey: ['equipment-bays'] });
    qc.invalidateQueries({ queryKey: ['summary'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['equipment-vendors'] });
  };

  const create = useMutation({
    mutationFn: api.createEquipment,
    onSuccess: invalidateAll,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateEquipment>[1] }) =>
      api.updateEquipment(id, body),
    onSuccess: (_, v) => {
      invalidateAll();
      qc.invalidateQueries({ queryKey: ['equipment', v.id] });
    },
  });
  const remove = useMutation({
    mutationFn: api.deleteEquipment,
    onSuccess: invalidateAll,
  });

  return { create, update, remove };
}
