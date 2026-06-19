from lib.mongodb import BaseRepository

from app.model.audit import AuditLog


class AuditLogRepository(BaseRepository[AuditLog]):
    collection = "audit_logs"
