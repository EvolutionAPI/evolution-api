import uuid

from sqlalchemy.orm import Session

from app.models.customer import Customer


class CustomerRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_phone_and_tenant(self, phone_number: str, tenant_id: uuid.UUID) -> Customer | None:
        return (
            self.db.query(Customer)
            .filter(Customer.phone_number == phone_number, Customer.tenant_id == tenant_id)
            .first()
        )

    def get_or_create(self, phone_number: str, tenant_id: uuid.UUID, name: str | None = None, email: str | None = None) -> Customer:
        customer = self.get_by_phone_and_tenant(phone_number, tenant_id)
        if customer:
            if name and not customer.name:
                customer.name = name
                self.db.commit()
                self.db.refresh(customer)
            return customer
        customer = Customer(
            phone_number=phone_number,
            tenant_id=tenant_id,
            name=name,
            email=email,
        )
        self.db.add(customer)
        self.db.commit()
        self.db.refresh(customer)
        return customer

    def get(self, customer_id: uuid.UUID) -> Customer | None:
        return self.db.query(Customer).filter(Customer.id == customer_id).first()

    def list_all(self, tenant_id: uuid.UUID | None = None, limit: int = 50, offset: int = 0) -> list[Customer]:
        query = self.db.query(Customer)
        if tenant_id is not None:
            query = query.filter(Customer.tenant_id == tenant_id)
        return query.order_by(Customer.created_at.desc()).offset(offset).limit(limit).all()

    def list_by_tenant(self, tenant_id: uuid.UUID, limit: int = 50, offset: int = 0) -> list[Customer]:
        return (
            self.db.query(Customer)
            .filter(Customer.tenant_id == tenant_id)
            .order_by(Customer.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def update(self, customer: Customer, **values) -> Customer:
        for key, value in values.items():
            if value is not None:
                setattr(customer, key, value)
        self.db.commit()
        self.db.refresh(customer)
        return customer
