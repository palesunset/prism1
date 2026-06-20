import { useEffect, useState } from 'react';
import type { Equipment } from '@/types';
import { validateIpForForm } from '@/utils/ipAddress';

const STATUSES = ['Active', 'Decommissioned', 'Maintenance', 'Spare'] as const;
const ROUTER_TYPES = ['P', 'DR', 'BR', 'PEe', 'PEc', 'FMAGG', 'AGG', 'AG', 'RR'] as const;

export function EquipmentForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
}: {
  initial?: Equipment | null;
  onSubmit: (values: {
    vendor: string;
    network_element: string;
    model: string;
    serial_number: string;
    router_type: string | null;
    ip_address: string | null;
    software_version: string | null;
    descriptor_version: string | null;
    end_of_life: string | null;
    status: string;
    rack_position: string | null;
    chassis_slot_count: number | null;
  }) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [networkElement, setNetworkElement] = useState('');
  const [ip, setIp] = useState('');
  const [softwareVersion, setSoftwareVersion] = useState('');
  const [descriptorVersion, setDescriptorVersion] = useState('');
  const [routerType, setRouterType] = useState('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [eol, setEol] = useState('');
  const [status, setStatus] = useState('Active');
  const [rack, setRack] = useState('');
  const [chassisSlots, setChassisSlots] = useState('');
  const [vendor, setVendor] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initial) {
      const ne =
        initial.network_element != null && String(initial.network_element).trim() !== ''
          ? String(initial.network_element).trim()
          : String(initial.model || '').trim();
      setNetworkElement(ne);
      setVendor(initial.vendor);
      setModel(initial.model);
      setSerial(initial.serial_number);
      setRouterType(initial.router_type || '');
      setIp(initial.ip_address != null && String(initial.ip_address).trim() !== '' ? String(initial.ip_address) : '');
      setSoftwareVersion(
        initial.software_version != null && String(initial.software_version).trim() !== ''
          ? String(initial.software_version)
          : ''
      );
      setDescriptorVersion(
        initial.descriptor_version != null && String(initial.descriptor_version).trim() !== ''
          ? String(initial.descriptor_version)
          : ''
      );
      setEol(initial.end_of_life || '');
      setStatus(initial.status);
      setRack(initial.rack_position || '');
      setChassisSlots(
        initial.chassis_slot_count == null ? '' : String(initial.chassis_slot_count)
      );
    } else {
      setNetworkElement('');
      setVendor('');
      setModel('');
      setSerial('');
      setRouterType('');
      setIp('');
      setSoftwareVersion('');
      setDescriptorVersion('');
      setEol('');
      setStatus('Active');
      setRack('');
      setChassisSlots('');
    }
  }, [initial]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const e2: Record<string, string> = {};
    if (!networkElement.trim()) e2.networkElement = 'Required';
    if (!model.trim()) e2.model = 'Required';
    if (!serial.trim()) e2.serial = 'Required';
    if (!vendor.trim()) e2.vendor = 'Required';
    if (chassisSlots.trim()) {
      const n = Number(chassisSlots);
      if (!Number.isInteger(n) || n < 0 || n > 10000) e2.chassisSlots = 'Must be an integer 0-10000';
    }
    if (ip.trim()) {
      const ipCheck = validateIpForForm(ip);
      if (!ipCheck.ok) e2.ip = ipCheck.error;
    }
    setErrors(e2);
    if (Object.keys(e2).length) return;
    const chassisN = chassisSlots.trim() ? Number(chassisSlots.trim()) : null;
    const ipCheck = validateIpForForm(ip);
    const ipValue = ipCheck.ok ? ipCheck.value : ip.trim() || null;
    onSubmit({
      vendor: vendor.trim(),
      network_element: networkElement.trim(),
      model: model.trim(),
      serial_number: serial.trim(),
      router_type: routerType.trim() || null,
      ip_address: ipValue,
      software_version: softwareVersion.trim() || null,
      descriptor_version: descriptorVersion.trim() || null,
      end_of_life: eol.trim() || null,
      status,
      rack_position: rack.trim() || null,
      chassis_slot_count: chassisN,
    });
  }

  const input =
    'mt-1 w-full input-field';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-sm font-medium">Network Element</label>
        <input
          className={input}
          value={networkElement}
          onChange={(e) => setNetworkElement(e.target.value)}
          placeholder="e.g. NE identifier or hostname"
        />
        {errors.networkElement && <p className="text-xs text-red-600">{errors.networkElement}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">IP Address</label>
        <input
          className={input}
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="e.g. 10.0.0.50 or 2001:db8::1"
          autoComplete="off"
        />
        {errors.ip && <p className="text-xs text-red-600">{errors.ip}</p>}
        <p className="mt-1 text-xs text-slate-500">Optional. IPv4 or IPv6 host address.</p>
      </div>
      <div>
        <label className="text-sm font-medium">Router Type</label>
        <select className={input} value={routerType} onChange={(e) => setRouterType(e.target.value)}>
          <option value="">Select…</option>
          {ROUTER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm font-medium">Software Version</label>
        <input
          className={input}
          value={softwareVersion}
          onChange={(e) => setSoftwareVersion(e.target.value)}
          placeholder="e.g. V800R021C00"
          autoComplete="off"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Descriptor Version</label>
        <input
          className={input}
          value={descriptorVersion}
          onChange={(e) => setDescriptorVersion(e.target.value)}
          placeholder="e.g. NE5000E-V800R021C00"
          autoComplete="off"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Model</label>
        <input className={input} value={model} onChange={(e) => setModel(e.target.value)} />
        {errors.model && <p className="text-xs text-red-600">{errors.model}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">Serial Number</label>
        <input className={input} value={serial} onChange={(e) => setSerial(e.target.value)} />
        {errors.serial && <p className="text-xs text-red-600">{errors.serial}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">End of Life</label>
        <input className={input} type="date" value={eol} onChange={(e) => setEol(e.target.value)} />
      </div>
      <div>
        <label className="text-sm font-medium">Status</label>
        <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm font-medium">Rack Position</label>
        <input className={input} value={rack} onChange={(e) => setRack(e.target.value)} placeholder="Rack A12, U20-22" />
      </div>
      <div>
        <label className="text-sm font-medium">Chassis Slot</label>
        <input
          className={input}
          inputMode="numeric"
          value={chassisSlots}
          onChange={(e) => setChassisSlots(e.target.value)}
          placeholder="e.g. 8"
        />
        <p className="mt-1 text-xs text-slate-500">
          Number of chassis slots (1..N). Creates bays you can mark used or free. Only applied when adding new
          equipment.
        </p>
        {errors.chassisSlots && <p className="text-xs text-red-600">{errors.chassisSlots}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">Vendor</label>
        <input className={input} value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. HUAWEI" />
        {errors.vendor && <p className="text-xs text-red-600">{errors.vendor}</p>}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
