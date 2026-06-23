import logging

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.repositories import InstanceTenantRepository, TenantRepository

logger = logging.getLogger(__name__)


def bootstrap_default_instance(db: Session) -> None:
    tenant_name = settings.default_tenant_name.strip()
    instance_name = settings.default_instance_name.strip()

    if not tenant_name or not instance_name:
        return

    try:
        tenants = TenantRepository(db)
        links = InstanceTenantRepository(db)

        tenant = tenants.get_by_name(tenant_name)
        if not tenant:
            tenant = tenants.create(tenant_name)
            logger.info('Created default tenant %s', tenant_name)

        link = links.get_by_instance(instance_name)
        if not link:
            links.create(instance_name=instance_name, tenant_id=tenant.id)
            logger.info('Linked default Evolution instance %s to tenant %s', instance_name, tenant_name)
    except SQLAlchemyError:
        db.rollback()
        logger.exception('Failed to bootstrap default tenant/instance link')
        raise
