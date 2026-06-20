import { useParams } from 'react-router-dom';
import { EquipmentDetail } from '@/components/Equipment/EquipmentDetail';
import { ScrollRegion } from '@/components/common/ScrollRegion';

export function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <p>Missing equipment id</p>;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollRegion className="pb-2">
        <EquipmentDetail equipmentId={id} />
      </ScrollRegion>
    </div>
  );
}
