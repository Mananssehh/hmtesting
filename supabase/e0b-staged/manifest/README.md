# E0b evidence manifests (local, read-only captures)

## Retired fingerprint
The earlier aggregate fingerprint `151e45ed3dda20d5b37b6b1d1449d59d` is **RETIRED as
NOT REPRODUCIBLE**. It was produced by an ad-hoc query whose exact text, search
path, ACL-array ordering and regprocedure rendering were not retained, so a
mismatch could not be attributed to real drift versus formatting. It is not
recreated and must not be used as evidence.

## Deterministic manifest
Definition: `supabase/e0b-staged/04_function_manifest.sql` — fixed query text,
fixed `search_path = pg_catalog`, one row per `public` function, ACLs expanded
and sorted by grantor/grantee/privilege/grantability, `proconfig` sorted,
identity arguments via `pg_get_function_identity_arguments()`, plus hashes of
`prosrc`, `probin` and the RECONSTRUCTED `pg_get_functiondef()` text.

Captured (pre-Gate-2, production read-only):
- rows: `manifest_pre_gate2.csv` — 78 function rows retained
  (the CSV has 79 physical data lines because one definition field contains an
  embedded newline; the authoritative count is the reported `function_rows` 78)
- aggregate manifest hash (md5 over sorted per-row text): `52696023ca621b4a8842f22febd58851`
- file SHA-256: `423e11ea45f84ce96b6fbbd472e99f7b75a58869e935ed0eabd2240847122008`
- `default_acl_pre_gate2.txt` — every `pg_default_acl` row for `postgres` and `supabase_admin`
- `e0_six_functions_pre_gate2.txt` — the six E0 email-queue functions with owner,
  security mode, `proconfig`, ACL and body hash

## Historical-drift limitation (explicit)
No row-level snapshot of these functions exists from any point before this
capture. Therefore **historical drift prior to this manifest cannot be
disproved**. This limitation does not block Gate 2: re-running
`04_function_manifest.sql` verbatim immediately before and immediately after the
Gate 2 apply, and diffing the two row sets, conclusively proves whether the
migration itself changed any existing function.

## Executor identity
Recorded as **UNVERIFIED**. The migration channel does not expose `current_user`
/ `session_user`. `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` can only succeed
if the executor is `postgres` or a member of it, so a successful apply proves
adequate authority but not literal identity. The migration was deliberately not
modified to force this evidence.
