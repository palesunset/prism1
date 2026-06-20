import { useEffect, useState } from 'react';
import type { Site } from '@/types';

const empty: Partial<Site> = {
  name: '',
  plaid: '',
  area: '',
  region: '',
  address: '',
  lat: undefined as unknown as number | null,
  lng: undefined as unknown as number | null,
};

export function SiteForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  syncToken = 0,
}: {
  initial?: Site | null;
  /** When this changes, the form reloads from `initial` (e.g. modal open). Map lat/lng updates should not change this. */
  syncToken?: string | number;
  onSubmit: (values: Partial<Site>) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  type FormValues = Omit<Partial<Site>, 'lat' | 'lng'> & {
    lat?: number | string | null;
    lng?: number | string | null;
  };
  const [values, setValues] = useState<FormValues>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initial) {
      setValues({
        name: initial.name ?? '',
        plaid: initial.plaid ?? '',
        area: initial.area ?? '',
        region: initial.region ?? '',
        address: initial.address || '',
        lat: initial.lat ?? null,
        lng: initial.lng ?? null,
      });
    } else {
      setValues({ ...empty, name: '', plaid: '', area: '', region: '', address: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when syncToken (modal open), not when map draft lat/lng updates
  }, [syncToken]);

  useEffect(() => {
    if (!initial) return;
    if (initial.lat != null || initial.lng != null) {
      setValues((v) => ({
        ...v,
        lat: initial.lat ?? v.lat,
        lng: initial.lng ?? v.lng,
      }));
    }
  }, [initial?.lat, initial?.lng]);

  function validate() {
    const e: Record<string, string> = {};
    if (!values.name?.trim()) e.name = 'Required';
    if (!values.plaid?.trim()) e.plaid = 'Required';
    if (!values.area?.trim()) e.area = 'Required';
    if (!values.region?.trim()) e.region = 'Required';
    if (values.lat != null && values.lat !== '') {
      const la = Number(values.lat);
      if (Number.isNaN(la) || la < -90 || la > 90) e.lat = 'Invalid latitude';
    }
    if (values.lng != null && values.lng !== '') {
      const ln = Number(values.lng);
      if (Number.isNaN(ln) || ln < -180 || ln > 180) e.lng = 'Invalid longitude';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    const lat = values.lat === '' || values.lat == null ? null : Number(values.lat);
    const lng = values.lng === '' || values.lng == null ? null : Number(values.lng);
    onSubmit({
      ...values,
      lat,
      lng,
      address: values.address || null,
    });
  }

  const input =
    'mt-1 w-full input-field';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-sm font-medium">Site Name</label>
        <input
          className={input}
          value={values.name || ''}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        />
        {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">PLAID</label>
        <input
          className={input}
          value={values.plaid || ''}
          onChange={(e) => setValues((v) => ({ ...v, plaid: e.target.value }))}
        />
        {errors.plaid && <p className="text-xs text-red-600">{errors.plaid}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Territory</label>
          <input
            className={input}
            value={values.area || ''}
            onChange={(e) => setValues((v) => ({ ...v, area: e.target.value }))}
          />
          {errors.area && <p className="text-xs text-red-600">{errors.area}</p>}
        </div>
        <div>
          <label className="text-sm font-medium">Region</label>
          <select
            className={input}
            value={values.region || ''}
            onChange={(e) => setValues((v) => ({ ...v, region: e.target.value }))}
          >
            <option value="">Select…</option>
            {['NCR', 'NLZ', 'SLZ', 'VIS', 'MIN', 'INTERNATIONAL'].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {errors.region && <p className="text-xs text-red-600">{errors.region}</p>}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Address</label>
        <textarea
          className={input}
          rows={2}
          value={(values.address as string) || ''}
          onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Latitude</label>
          <input
            className={input}
            type="text"
            inputMode="decimal"
            value={values.lat ?? ''}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                lat: e.target.value === '' ? null : (e.target.value as unknown as number),
              }))
            }
          />
          {errors.lat && <p className="text-xs text-red-600">{errors.lat}</p>}
        </div>
        <div>
          <label className="text-sm font-medium">Longitude</label>
          <input
            className={input}
            type="text"
            inputMode="decimal"
            value={values.lng ?? ''}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                lng: e.target.value === '' ? null : (e.target.value as unknown as number),
              }))
            }
          />
          {errors.lng && <p className="text-xs text-red-600">{errors.lng}</p>}
        </div>
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
