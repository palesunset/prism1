import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/services/api';

export function useEquipmentBayMutations(equipmentId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['equipment-bays', equipmentId] });

  const resize = useMutation({
    mutationFn: (total_slots: number) => api.resizeEquipmentBays(equipmentId, total_slots),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['equipment', equipmentId] });
    },
  });

  const updateBay = useMutation({
    mutationFn: ({ bayId, body }: { bayId: string; body: { is_utilized?: boolean; label?: string } }) =>
      api.updateEquipmentBay(bayId, body),
    onSuccess: invalidate,
  });

  return { resize, updateBay };
}

