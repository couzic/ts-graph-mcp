import type { AuditRepository } from "../repositories/AuditRepository.js";

export class AuditService {
  constructor(private repository: AuditRepository) {}

  log(action: string, details: string): void {
    this.repository.save({
      action,
      timestamp: new Date(),
      details,
    });
  }
}
