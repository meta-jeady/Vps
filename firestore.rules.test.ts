/**
 * Phase 0: Security Rules Adversarial Test Specification ("Dirty Dozen")
 * Verifies that all unauthorized, malformed, or privilege-escalating payloads
 * are rejected by Firestore Security Rules with PERMISSION_DENIED.
 */

export interface SecurityTestCase {
  id: string;
  description: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid?: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED' | 'ALLOW';
}

export const dirtyDozenTests: SecurityTestCase[] = [
  {
    id: 'DD-01',
    description: 'Unauthenticated user attempts to create a VPN client',
    operation: 'create',
    path: 'vpn_clients/OR-TEST-1234',
    auth: null,
    payload: { clientId: 'OR-TEST-1234', clientName: 'Hacker', quotaGb: 100 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    description: 'Non-admin authenticated user attempts to create a VPN client',
    operation: 'create',
    path: 'vpn_clients/OR-TEST-1234',
    auth: { uid: 'user-1', email: 'other@example.com', email_verified: true },
    payload: { clientId: 'OR-TEST-1234', clientName: 'Intruder', quotaGb: 50 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    description: 'Unauthenticated or non-admin user attempts to list all VPN clients',
    operation: 'list',
    path: 'vpn_clients',
    auth: { uid: 'user-1', email: 'other@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    description: 'Shadow field injection (extra unknown field) during create',
    operation: 'create',
    path: 'vpn_clients/OR-TEST-1234',
    auth: { uid: 'admin-1', email: 'djiogofoyet@gmail.com', email_verified: true },
    payload: {
      clientId: 'OR-TEST-1234',
      clientName: 'Valid User',
      host: 'm.orange.cm',
      vlessConfig: 'vless://uuid@google.am:443?host=m.orange.cm',
      quotaGb: 5,
      quotaBytes: 5368709120,
      consumedBytes: 0,
      expireDate: '2026-12-31',
      status: 'active',
      locked: true,
      usageKey: 'uk_123456',
      configRevision: 1,
      ownerUid: 'admin-1',
      isSuperAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    description: 'ID poisoning with invalid characters or excessive length',
    operation: 'get',
    path: `vpn_clients/${'A'.repeat(200)}`,
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    description: 'Unverified email spoofing admin address',
    operation: 'list',
    path: 'vpn_clients',
    auth: { uid: 'spoof-1', email: 'djiogofoyet@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    description: 'Non-admin user attempts self-privilege escalation in /admins',
    operation: 'create',
    path: 'admins/user-1',
    auth: { uid: 'user-1', email: 'other@example.com', email_verified: true },
    payload: { uid: 'user-1', label: 'Fake Admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    description: 'Client-side timestamp forgery on create (not server request.time)',
    operation: 'create',
    path: 'vpn_clients/OR-TEST-1234',
    auth: { uid: 'admin-1', email: 'djiogofoyet@gmail.com', email_verified: true },
    payload: {
      clientId: 'OR-TEST-1234',
      clientName: 'Client',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    description: 'Mutating immutable createdAt field on update',
    operation: 'update',
    path: 'vpn_clients/OR-TEST-1234',
    auth: { uid: 'admin-1', email: 'djiogofoyet@gmail.com', email_verified: true },
    payload: { createdAt: '2026-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    description: 'Negative quota value poisoning on update',
    operation: 'update',
    path: 'vpn_clients/OR-TEST-1234',
    auth: { uid: 'admin-1', email: 'djiogofoyet@gmail.com', email_verified: true },
    payload: { quotaGb: -10, quotaBytes: -1000 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    description: 'Invalid status enum outside active/suspended',
    operation: 'update',
    path: 'vpn_clients/OR-TEST-1234',
    auth: { uid: 'admin-1', email: 'djiogofoyet@gmail.com', email_verified: true },
    payload: { status: 'root_bypass' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    description: 'clientId mismatch between path variable and payload',
    operation: 'create',
    path: 'vpn_clients/OR-AAAA-1111',
    auth: { uid: 'admin-1', email: 'djiogofoyet@gmail.com', email_verified: true },
    payload: { clientId: 'OR-BBBB-2222', clientName: 'Mismatch' },
    expected: 'PERMISSION_DENIED',
  },
];
