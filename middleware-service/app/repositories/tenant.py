import uuid

from sqlalchemy.orm import Session

from app.models.tenant import Tenant


class TenantRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, name: str) -> Tenant:
        tenant = Tenant(name=name)
        self.db.add(tenant)
        self.db.commit()
        self.db.refresh(tenant)
        return tenant

    def get(self, tenant_id: uuid.UUID) -> Tenant | None:
        return self.db.query(Tenant).filter(Tenant.id == tenant_id).first()

    def get_by_name(self, name: str) -> Tenant | None:
        return self.db.query(Tenant).filter(Tenant.name == name).first()

    def list_all(self, limit: int = 50, offset: int = 0) -> list[Tenant]:
        return self.db.query(Tenant).order_by(Tenant.created_at.desc()).offset(offset).limit(limit).all()

    def update(self, tenant: Tenant, **values) -> Tenant:
        for key, value in values.items():
            if value is not None:
                setattr(tenant, key, value)
        self.db.commit()
        self.db.refresh(tenant)
        return tenant

    def delete(self, tenant: Tenant) -> None:
        self.db.delete(tenant)
        self.db.commit()
