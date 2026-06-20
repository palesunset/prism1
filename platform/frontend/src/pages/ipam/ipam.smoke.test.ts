import { describe, expect, it } from 'vitest';
import { IPAM_EMPTY_FORM } from './IpamImportReport';
import { formToPayload, recordToForm } from './IpamRecordForm';
import type { IpamRecord } from '../../services/ipamApi';

describe('IPAM record form helpers', () => {
  it('maps form fields to API payload', () => {
    const payload = formToPayload({
      ...IPAM_EMPTY_FORM,
      address: '10.0.0.10',
      project: 'Lab',
      parent_subnet_id: 'subnet-1',
    });
    expect(payload.address).toBe('10.0.0.10');
    expect(payload.parent_subnet_id).toBe('subnet-1');
  });

  it('round-trips record into form state', () => {
    const record: IpamRecord = {
      id: 'r1',
      address: '192.168.1.0/24',
      record_type: 'subnet',
      status: 'reserved',
      project: 'HQ',
      vlan: '100',
      location: 'Site A',
      description: 'Core LAN',
      cidr_prefix: 24,
      range_start: 0,
      range_end: 0,
      hostname: null,
      mac_address: null,
      gateway: null,
      dhcp_scope: null,
      ptr_record: null,
      parent_subnet_id: null,
      created_at: null,
      updated_at: null,
    };
    const form = recordToForm(record);
    expect(form.address).toBe('192.168.1.0/24');
    expect(form.vlan).toBe('100');
  });
});
