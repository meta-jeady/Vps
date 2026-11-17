# Security Specification & TDD Plan — Orange VPN VPS Panel

## 1. Data Invariants
1. **Admin Authority**: Only verified administrators (`email_verified == true` and either bootstrapped admin email `djiogofoyet@gmail.com` or existing doc in `/admins/{uid}`) can list, create, update, or delete `/vpn_clients`, `/vps_settings`, or `/admins`.
2. **Client App Lookup Isolation**: An Android APK or Web Client knowing an exact `clientId` (e.g. `OR-XXXX-XXXX`) can perform a single-document `get` on `/vpn_clients/{clientId}` without listing or enumerating other clients (`allow list: if isAdmin()`). No PII (`email`, `phone`, `address`) is stored in `/vpn_clients`.
3. **Path Variable & ID Integrity**: Every `clientId`, `adminId`, and `settingId` must satisfy `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, length 1..128) and `data.clientId == clientId`.
4. **Temporal & Ownership Integrity**: `createdAt` must equal `request.time` on create and remain immutable on update. `updatedAt` must equal `request.time` on create and update. `ownerUid` must equal `request.auth.uid` on create and remain immutable on update.
5. **Strict Schema & Action-Based Updates**: Every create validates exact required/allowed keys (`hasAll` & `hasOnly`), string `.size()` bounds, numeric bounds (`quotaGb > 0`, `quotaBytes > 0`, `consumedBytes >= 0`, `configRevision >= 1`), and enum checks (`status in ['active', 'suspended']`). Updates use `affectedKeys().hasOnly(...)`.

## 2. The "Dirty Dozen" Attack Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Create**: Anonymous/unauthenticated user tries `setDoc(doc(db, 'vpn_clients', 'OR-TEST-1234'), validPayload)`.
2. **Non-Admin Signed-In User Create**: Authenticated user (`other@example.com`) tries to create a `vpn_clients` record.
3. **Collection Enumeration (List Scraping)**: Unauthenticated or non-admin user tries `getDocs(collection(db, 'vpn_clients'))`.
4. **Shadow / Ghost Field Injection**: Admin tries to create a `vpn_clients` doc with an extra unknown field `{ ..., isSuperAdmin: true }`.
5. **ID Poisoning**: Attempt to `get` or `create` `/vpn_clients/` with a 500-char or special-character ID (`../../admins/hacker`).
6. **Unverified Email Spoofing**: User with `email: 'djiogofoyet@gmail.com'` and `email_verified: false` tries to list/write `vpn_clients`.
7. **Self-Privilege Escalation**: Non-admin signed-in user tries to write `/admins/{theirUid}`.
8. **Client-Side Timestamp Forgery**: Admin tries to create a `vpn_clients` doc with a backdated `createdAt` (`new Date('2020-01-01')`) instead of `serverTimestamp()`.
9. **Immutable `createdAt` Mutation**: Admin tries to update `createdAt` on an existing `vpn_clients` doc.
10. **Type / Value Poisoning on Update**: Attempt to update `quotaGb` to `-50` or `"unlimited"` or `vlessConfig` > 2500 chars.
11. **Invalid Status Value**: Attempt to set `status: 'deleted'` or `status: 'hacked'` outside `['active', 'suspended']`.
12. **ClientId Mismatch**: Creating `/vpn_clients/OR-AAAA-1111` with `data.clientId: 'OR-BBBB-2222'`.
