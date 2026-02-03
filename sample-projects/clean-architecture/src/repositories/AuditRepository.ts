export type AuditEntry = {
  action: string;
  timestamp: Date;
  details: string;
};

/**
 * Database repository for persisting audit log entries.
 */
export class AuditRepository {
  private entries: AuditEntry[] = [];

  save(entry: AuditEntry): void {
    this.entries.push(entry);
  }
}
