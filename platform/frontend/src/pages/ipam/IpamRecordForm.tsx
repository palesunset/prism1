import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import type { IpamRecord, IpamRecordType, IpamStatus } from '../../services/ipamApi';
import { useIpamStore } from '../../store/useIpamStore';
import { IPAM_EMPTY_FORM } from './IpamImportReport';
import {
  filterRecordsByFamily,
  sortRecordsByAddress,
  type IpAddressFamily,
} from '../../utils/ipamFamily';

export type IpamFormData = typeof IPAM_EMPTY_FORM;

export function formToPayload(data: IpamFormData): Partial<IpamRecord> {
  return {
    address: data.address,
    record_type: data.record_type,
    status: data.status,
    project: data.project,
    vlan: data.vlan || null,
    location: data.location || null,
    description: data.description || null,
    hostname: data.hostname || null,
    mac_address: data.mac_address || null,
    gateway: data.gateway || null,
    dhcp_scope: data.dhcp_scope || null,
    ptr_record: data.ptr_record || null,
    parent_subnet_id: data.parent_subnet_id || null,
  };
}

function PicklistInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  mono?: boolean;
}) {
  const listId = `ipam-pick-${props.label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label className={props.className ?? 'block'}>
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">{props.label}</span>
      <input
        list={listId}
        className={clsx(
          'w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40',
          props.mono && 'font-mono',
        )}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
      />
      <datalist id={listId}>
        {props.options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
}

export function RecordForm(props: {
  initial?: IpamFormData;
  recordId?: string;
  submitLabel: string;
  addressFamily?: IpAddressFamily;
  onSubmit: (data: IpamFormData) => Promise<void>;
  onCancel?: () => void;
}) {
  const family = props.addressFamily ?? 'ipv4';
  const validateInput = useIpamStore((s) => s.validateInput);
  const picklists = useIpamStore((s) => s.picklists);
  const records = useIpamStore((s) => s.records);
  const subnetOptions = useMemo(
    () =>
      filterRecordsByFamily(
        records.filter((r) => r.record_type === 'subnet' && r.id !== props.recordId),
        family,
      ).sort(sortRecordsByAddress),
    [records, props.recordId, family],
  );

  const [form, setForm] = useState(props.initial ?? IPAM_EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);

  useEffect(() => {
    setForm(props.initial ?? IPAM_EMPTY_FORM);
    setFormError(null);
    setValidation(null);
  }, [props.initial, props.recordId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await props.onSubmit(form);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const runValidate = async () => {
    setValidation(null);
    try {
      const result = await validateInput({
        ...form,
        vlan: form.vlan || null,
        location: form.location || null,
        description: form.description || null,
        exclude_id: props.recordId,
      });
      if (result.allowed) {
        const warn = result.warnings?.length ? ` · ${result.warnings.length} warning(s)` : '';
        setValidation(`Valid — ${result.parsed?.normalized ?? form.address}${warn}`);
      } else {
        const blocking = result.conflicts?.[0]?.message ?? result.error ?? 'Validation failed';
        setValidation(blocking);
      }
    } catch (err) {
      setValidation(err instanceof Error ? err.message : 'Validation failed');
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-white/10 bg-gray-900/60 p-4">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {family === 'ipv6' ? 'IPv6 record' : 'IPv4 record'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {family === 'ipv6' ? 'IPv6 / Subnet (CIDR for subnets)' : 'IPv4 / Subnet (CIDR for subnets)'}
          </span>
          <input
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder={
              family === 'ipv6'
                ? form.record_type === 'subnet'
                  ? '2001:db8:1000::/48'
                  : '2001:db8:1000::1'
                : form.record_type === 'subnet'
                  ? '10.1.1.0/24'
                  : '10.1.1.10'
            }
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Type</span>
          <select
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={form.record_type}
            onChange={(e) => setForm((f) => ({ ...f, record_type: e.target.value as IpamRecordType }))}
          >
            <option value="host">Host</option>
            <option value="subnet">Subnet</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Status</span>
          <select
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as IpamStatus }))}
          >
            <option value="used">Used</option>
            <option value="free">Free</option>
            <option value="reserved">Reserved</option>
          </select>
        </label>
        <PicklistInput
          label="Project / Service"
          value={form.project}
          onChange={(project) => setForm((f) => ({ ...f, project }))}
          options={picklists?.projects ?? []}
        />
        <PicklistInput
          label="VLAN"
          value={form.vlan}
          onChange={(vlan) => setForm((f) => ({ ...f, vlan }))}
          options={picklists?.vlans ?? []}
        />
        <PicklistInput
          label="Location / Site"
          className="block sm:col-span-2"
          value={form.location}
          onChange={(location) => setForm((f) => ({ ...f, location }))}
          options={picklists?.locations ?? []}
        />
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Description</span>
          <textarea
            className="min-h-[60px] w-full resize-y rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>
        {form.record_type === 'host' ? (
          <>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Hostname</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
                value={form.hostname}
                onChange={(e) => setForm((f) => ({ ...f, hostname: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">MAC address</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
                value={form.mac_address}
                onChange={(e) => setForm((f) => ({ ...f, mac_address: e.target.value }))}
                placeholder="AA:BB:CC:DD:EE:FF"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Gateway</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
                value={form.gateway}
                onChange={(e) => setForm((f) => ({ ...f, gateway: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">DHCP scope</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
                value={form.dhcp_scope}
                onChange={(e) => setForm((f) => ({ ...f, dhcp_scope: e.target.value }))}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">PTR record</span>
              <input
                className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
                value={form.ptr_record}
                onChange={(e) => setForm((f) => ({ ...f, ptr_record: e.target.value }))}
              />
            </label>
          </>
        ) : null}
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Parent Subnet</span>
          <select
            className="w-full rounded-lg border border-white/10 bg-gray-950/80 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={form.parent_subnet_id}
            onChange={(e) => setForm((f) => ({ ...f, parent_subnet_id: e.target.value }))}
          >
            <option value="">Auto-detect from IP range</option>
            {subnetOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.address}{s.project ? ` · ${s.project}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {validation ? (
        <div className={clsx('rounded-lg border p-2 text-xs', validation.startsWith('Valid') ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200' : 'border-amber-500/30 bg-amber-950/20 text-amber-200')}>
          {validation}
        </div>
      ) : null}
      {formError ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2 text-xs text-rose-200">{formError}</div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runValidate()}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/15"
        >
          Validate
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : props.submitLabel}
        </button>
        {props.onCancel ? (
          <button type="button" onClick={props.onCancel} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/15">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function recordToForm(r: IpamRecord): IpamFormData {
  return {
    address: r.address,
    record_type: r.record_type,
    status: r.status,
    project: r.project,
    vlan: r.vlan ?? '',
    location: r.location ?? '',
    description: r.description ?? '',
    hostname: r.hostname ?? '',
    mac_address: r.mac_address ?? '',
    gateway: r.gateway ?? '',
    dhcp_scope: r.dhcp_scope ?? '',
    ptr_record: r.ptr_record ?? '',
    parent_subnet_id: r.parent_subnet_id ?? '',
  };
}
