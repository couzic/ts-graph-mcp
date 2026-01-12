export type AuditEntry = {
  action: string;
  timestamp: Date;
  details: string;
};

export class AuditRepository {
  private entries: AuditEntry[] = [];

  save(entry: AuditEntry): void {
    this.entries.push(entry);
  }
}
