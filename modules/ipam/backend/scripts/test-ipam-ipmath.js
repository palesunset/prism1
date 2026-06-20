import assert from 'node:assert/strict';
import {
  containsRange,
  ipInRange,
  ipToUint32,
  octetsToString,
  parseAddressInput,
  parseIpPart,
  prefixToMask,
  rangesOverlap,
  uint32ToIp,
} from '../src/lib/ipMath.js';
import { parseV6AddressInput, v6RangesOverlap } from '../src/lib/ipMathV6.js';
import { computeAllocationEfficiency, v6UsableHostCount } from '../src/lib/allocationEfficiency.js';

function testParseIpPart() {
  assert.deepEqual(parseIpPart('10.0.0.1'), [10, 0, 0, 1]);
  assert.equal(parseIpPart('999.0.0.1'), null);
  assert.equal(parseIpPart('10.0.0'), null);
}

function testCidrNormalization() {
  const parsed = parseAddressInput('10.1.1.5/24', 'subnet');
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.normalized, '10.1.1.0/24');
  assert.equal(parsed.rangeStart, ipToUint32([10, 1, 1, 0]));
  assert.equal(parsed.rangeEnd, ipToUint32([10, 1, 1, 255]));
}

function testHostParse() {
  const parsed = parseAddressInput('192.168.1.10', 'host');
  assert.equal(parsed.normalized, '192.168.1.10');
  assert.equal(parsed.rangeStart, parsed.rangeEnd);
}

function testRangeHelpers() {
  assert.equal(rangesOverlap(0, 10, 5, 15), true);
  assert.equal(rangesOverlap(0, 4, 5, 15), false);
  assert.equal(containsRange(0, 100, 10, 20), true);
  assert.equal(ipInRange(15, 10, 20), true);
}

function testRoundTrip() {
  const n = ipToUint32([172, 16, 0, 1]);
  assert.equal(octetsToString(uint32ToIp(n)), '172.16.0.1');
  assert.equal(prefixToMask(24), 0xffffff00 >>> 0);
}

function testIpv6Parse() {
  const subnet = parseV6AddressInput('2001:db8::/32');
  assert.equal(subnet.error, undefined);
  assert.equal(subnet.family, 'ipv6');
  assert.equal(subnet.normalized, '2001:db8::/32');
  assert.ok(subnet.v6RangeStart.length === 32);

  const host = parseV6AddressInput('2001:db8::1');
  assert.equal(host.recordType, 'host');
  assert.equal(host.v6RangeStart, host.v6RangeEnd);

  const viaMain = parseAddressInput('2001:db8:1::/64', 'subnet');
  assert.equal(viaMain.family, 'ipv6');
  assert.equal(v6RangesOverlap(subnet.v6RangeStart, subnet.v6RangeEnd, host.v6RangeStart, host.v6RangeEnd), true);
}

function testAllocationEfficiency() {
  const ipv4Only = computeAllocationEfficiency([
    { address: '10.0.0.0/24', address_family: 'ipv4', usableHosts: 254, usedHosts: 2 },
    { address: '10.0.1.0/24', address_family: 'ipv4', usableHosts: 254, usedHosts: 0 },
  ]);
  assert.equal(ipv4Only.efficiencyIpv4.percent, 0.4);
  assert.equal(ipv4Only.efficiencyIpv4.usedHosts, 2);
  assert.equal(ipv4Only.efficiencyIpv4.usableHosts, 508);

  const mixed = computeAllocationEfficiency([
    { address: '10.0.0.0/24', address_family: 'ipv4', usableHosts: 254, usedHosts: 2 },
    { address: '2001:db8::/48', address_family: 'ipv6', usableHosts: null, usedHosts: 2 },
  ]);
  assert.equal(mixed.efficiencyIpv4.percent, 0.8);
  assert.equal(mixed.efficiencyIpv6.percent, 0);
  assert.equal(mixed.efficiencyIpv6.applicableSubnets, 0);
  assert.equal(mixed.efficiencyIpv6.registeredHosts, 2);
  assert.equal(mixed.efficiencyIpv6.subnetsWithHosts, 1);

  const v6Small = computeAllocationEfficiency([
    { address: '2001:db8::/127', address_family: 'ipv6', usableHosts: 2, usedHosts: 1 },
  ]);
  assert.equal(v6Small.efficiencyIpv6.percent, 50);

  assert.equal(v6UsableHostCount({ cidr_prefix: 127, v6_range_start: '0'.repeat(32), v6_range_end: '0'.repeat(31) + '1' }), 2);
  assert.equal(v6UsableHostCount({ cidr_prefix: 48, v6_range_start: '0'.repeat(32), v6_range_end: 'f'.repeat(32) }), null);
}

function run() {
  testParseIpPart();
  testCidrNormalization();
  testHostParse();
  testRangeHelpers();
  testRoundTrip();
  testIpv6Parse();
  testAllocationEfficiency();
  console.log('ipMath unit tests passed');
}

run();
