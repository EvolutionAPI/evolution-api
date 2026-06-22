import uuid

from sqlalchemy.orm import Session, joinedload

from app.models.instance_tenant import InstanceTenant


class InstanceTenantRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, instance_name: str, tenant_id: uuid.UUID) -> InstanceTenant:
        link = InstanceTenant(instance_name=instance_name, tenant_id=tenant_id)
        self.db.add(link)
        self.db.commit()
        self.db.refresh(link)
        return link

    def get(self, link_id: uuid.UUID) -> InstanceTenant | None:
        return (
            self.db.query(InstanceTenant)
            .options(joinedload(InstanceTenant.tenant))
            .filter(InstanceTenant.id == link_id)
            .first()
        )

    def get_by_instance(self, instance_name: str) -> InstanceTenant | None:
        return (
            self.db.query(InstanceTenant)
            .options(joinedload(InstanceTenant.tenant))
            .filter(InstanceTenant.instance_name == instance_name)
            .first()
        )

    def list_all(self, limit: int = 50, offset: int = 0) -> list[InstanceTenant]:
        return (
            self.db.query(InstanceTenant)
            .options(joinedload(InstanceTenant.tenant))
            .order_by(InstanceTenant.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def delete(self, link: InstanceTenant) -> None:
        self.db.delete(link)
        self.db.commit()
