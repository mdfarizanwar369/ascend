# Backup And Restore Runbook

## Evidence status

The repository shows Railway PostgreSQL, Firebase Authentication, and an S3-compatible private object store. It does not contain verifiable evidence of enabled backups, retention, encryption policy, point-in-time recovery, or tested restores. Treat every item below as a production prerequisite, not a claim that it is active.

## Required policy

| System | Required protection | Target retention | Target RPO | Target RTO |
| --- | --- | --- | --- | --- |
| PostgreSQL | Provider encrypted daily backup plus PITR/WAL where plan supports it | 30 daily, 12 monthly | 15 minutes with PITR; otherwise 24 hours | 4 hours |
| Object storage | Encryption, private bucket, versioning, lifecycle-protected replicas/backups | 30 days for deleted/current versions | 24 hours | 8 hours |
| Firebase Auth | Configuration export documentation and identity recovery procedure | Current configuration plus controlled periodic user export where legally permitted | 24 hours | 8 hours |
| Secrets/config | Encrypted provider configuration backup with least-privilege access | Current plus previous rotation | On change | 2 hours |

Firebase Auth is not a transactional backup of PostgreSQL. Deleted Firebase users may not be recoverable with the same identity, and restoration must not silently reactivate deletion requests.

## Access controls

Limit backup management and restore rights to two named platform operators using MFA. Separate read, backup, and destructive restore permissions. Log exports/restores. Never place backup credentials or dumps in Git, local Downloads, support tickets, or application logs.

## Isolated restoration rehearsal

1. Create a non-production Railway project and isolated S3/R2 bucket with no production application credentials.
2. Restore the latest PostgreSQL backup to a new database.
3. Restore a representative, non-sensitive or access-controlled object subset to the isolated bucket.
4. point a temporary backend at the restored services with outbound email/push/payment/AI disabled.
5. Run migrations, readiness, referential-integrity checks, and sampled media ownership/read checks.
6. Verify deletion requests in `requested`, `retry_required`, or `completed` state remain inactive and are not resurrected.
7. Record actual recovery point, elapsed recovery time, missing objects, and operator names.
8. Destroy the rehearsal environment and confirm destruction.

Run quarterly and after backup-provider or schema changes. Public release remains conditional until the first rehearsal succeeds and provider retention/PITR settings are captured as evidence.
