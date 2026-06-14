import { useEffect, useState } from 'react';
import type { Port } from '@/types';
import { Modal } from '@/components/common/Modal';

export function PortEditModal({
  port,
  open,
  onClose,
  onSave,
}: {
  port: Port | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, body: { is_utilized: boolean; description: string }) => void;
}) {
  const [util, setUtil] = useState(false);
  const [desc, setDesc] = useState('');

  useEffect(() => {
    if (port) {
      setUtil(port.is_utilized);
      setDesc(port.description || '');
    }
  }, [port]);

  if (!port) return null;

  return (
    <Modal
      open={open}
      title={`Port ${port.port_number}`}
      onClose={onClose}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={util}
          onChange={(e) => setUtil(e.target.checked)}
          className="rounded border-slate-400"
        />
        Utilized
      </label>
      <div className="mt-3">
        <label className="text-sm font-medium">Description</label>
        <textarea
          className="mt-1 w-full input-field"
          rows={3}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Uplink, server NIC, etc."
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onSave(port.id, { is_utilized: util, description: desc });
            onClose();
          }}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
