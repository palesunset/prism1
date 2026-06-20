import { containsRange, ipInRange, rangesOverlap } from './ipMath.js';
import { v6ContainsRange, v6PointInRange, v6RangesOverlap } from './ipMathV6.js';

export function recordFamily(record) {
  return record?.address_family === 'ipv6' ? 'ipv6' : 'ipv4';
}

export function parsedFamily(parsed) {
  return parsed?.family === 'ipv6' ? 'ipv6' : 'ipv4';
}

export function rangesOverlapRecords(a, b) {
  if (recordFamily(a) !== recordFamily(b)) return false;
  if (recordFamily(a) === 'ipv6') {
    return v6RangesOverlap(a.v6_range_start, a.v6_range_end, b.v6_range_start, b.v6_range_end);
  }
  return rangesOverlap(a.range_start, a.range_end, b.range_start, b.range_end);
}

export function pointInRecord(record, parsed) {
  if (recordFamily(record) !== parsedFamily(parsed)) return false;
  if (parsedFamily(parsed) === 'ipv6') {
    return v6PointInRange(parsed.v6RangeStart, record.v6_range_start, record.v6_range_end);
  }
  return ipInRange(parsed.rangeStart, record.range_start, record.range_end);
}

export function containsParsedRange(parent, parsed) {
  if (recordFamily(parent) !== parsedFamily(parsed)) return false;
  if (parsedFamily(parsed) === 'ipv6') {
    return v6ContainsRange(parent.v6_range_start, parent.v6_range_end, parsed.v6RangeStart, parsed.v6RangeEnd);
  }
  return containsRange(parent.range_start, parent.range_end, parsed.rangeStart, parsed.rangeEnd);
}

export function sameHostAddress(existing, parsed) {
  if (parsedFamily(parsed) === 'ipv6') {
    return existing.v6_range_start === parsed.v6RangeStart && existing.v6_range_end === parsed.v6RangeEnd;
  }
  return existing.range_start === parsed.rangeStart;
}

export function sameSubnetBounds(existing, parsed) {
  if (parsedFamily(parsed) === 'ipv6') {
    return existing.v6_range_start === parsed.v6RangeStart && existing.v6_range_end === parsed.v6RangeEnd;
  }
  return existing.range_start === parsed.rangeStart && existing.range_end === parsed.rangeEnd;
}

export function hostInSubnet(subnet, host) {
  if (recordFamily(subnet) !== recordFamily(host)) return false;
  if (recordFamily(subnet) === 'ipv6') {
    return v6PointInRange(host.v6_range_start, subnet.v6_range_start, subnet.v6_range_end);
  }
  return ipInRange(host.range_start, subnet.range_start, subnet.range_end);
}

export function parsedAsRecord(parsed) {
  return {
    address_family: parsedFamily(parsed),
    range_start: parsed.rangeStart,
    range_end: parsed.rangeEnd,
    v6_range_start: parsed.v6RangeStart,
    v6_range_end: parsed.v6RangeEnd,
  };
}
