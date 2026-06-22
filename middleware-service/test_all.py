import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import Base, get_db
from app.main import app

TEST_DB_URL = settings.database_url + '_test'

engine = create_engine(TEST_DB_URL)
TestingSessionLocal = None


def _init_test_db():
    global TestingSessionLocal
    from sqlalchemy.orm import sessionmaker

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    _init_test_db()
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()


client = TestClient(app)


def _create_tenant(name: str = 'Acme Corp') -> dict:
    return client.post('/api/v1/tenants', json={'name': name}).json()


def _get_tenant_id(tenant: dict) -> uuid.UUID:
    return uuid.UUID(tenant['id'])


class TestTenants:
    def test_create_tenant(self):
        resp = client.post('/api/v1/tenants', json={'name': 'Acme Corp'})
        assert resp.status_code == 201
        data = resp.json()
        assert data['name'] == 'Acme Corp'
        uuid.UUID(data['id'])

    def test_create_duplicate_tenant(self):
        client.post('/api/v1/tenants', json={'name': 'Acme Corp'})
        resp = client.post('/api/v1/tenants', json={'name': 'Acme Corp'})
        assert resp.status_code == 409

    def test_list_tenants(self):
        client.post('/api/v1/tenants', json={'name': 'Alpha'})
        client.post('/api/v1/tenants', json={'name': 'Beta'})
        resp = client.get('/api/v1/tenants')
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_get_tenant(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        resp = client.get(f'/api/v1/tenants/{tid}')
        assert resp.status_code == 200
        assert resp.json()['name'] == 'Acme Corp'

    def test_get_tenant_not_found(self):
        resp = client.get(f'/api/v1/tenants/{uuid.uuid4()}')
        assert resp.status_code == 404


class TestInstanceLinking:
    def test_link_instance(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        resp = client.post('/api/v1/instances/link', json={'instance_name': 'acme-support', 'tenant_id': str(tid)})
        assert resp.status_code == 201
        assert resp.json()['instance_name'] == 'acme-support'
        assert resp.json()['tenant_id'] == str(tid)

    def test_link_duplicate_instance(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        client.post('/api/v1/instances/link', json={'instance_name': 'acme-support', 'tenant_id': str(tid)})
        resp = client.post('/api/v1/instances/link', json={'instance_name': 'acme-support', 'tenant_id': str(tid)})
        assert resp.status_code == 409

    def test_link_nonexistent_tenant(self):
        resp = client.post('/api/v1/instances/link', json={'instance_name': 'test', 'tenant_id': str(uuid.uuid4())})
        assert resp.status_code == 404

    def test_get_link_by_instance(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        client.post('/api/v1/instances/link', json={'instance_name': 'acme-support', 'tenant_id': str(tid)})
        resp = client.get('/api/v1/instances/acme-support')
        assert resp.status_code == 200
        assert resp.json()['instance_name'] == 'acme-support'

    def test_unlink_instance(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        client.post('/api/v1/instances/link', json={'instance_name': 'acme-support', 'tenant_id': str(tid)})
        resp = client.delete('/api/v1/instances/acme-support')
        assert resp.status_code == 204

    def test_unlink_not_found(self):
        resp = client.delete('/api/v1/instances/unknown')
        assert resp.status_code == 404


class TestCustomers:
    def test_create_customer(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        resp = client.post('/api/v1/customers', json={
            'phone_number': '265991234567', 'tenant_id': str(tid), 'name': 'John',
        })
        assert resp.status_code == 201
        assert resp.json()['phone_number'] == '265991234567'

    def test_create_duplicate_customer(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid)})
        resp = client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid)})
        assert resp.status_code == 409

    def test_same_phone_different_tenant(self):
        tenant1 = _create_tenant('Acme Corp')
        tenant2 = _create_tenant('Beta Inc')
        tid1 = _get_tenant_id(tenant1)
        tid2 = _get_tenant_id(tenant2)
        client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid1)})
        resp = client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid2)})
        assert resp.status_code == 201

    def test_get_customer_by_phone(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid)})
        resp = client.get(f'/api/v1/customers/phone/265991234567?tenant_id={tid}')
        assert resp.status_code == 200

    def test_get_customer_by_phone_wrong_tenant(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid)})
        resp = client.get(f'/api/v1/customers/phone/265991234567?tenant_id={uuid.uuid4()}')
        assert resp.status_code == 404


class TestTickets:
    def test_create_ticket(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        cust = client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid)}).json()
        cid = cust['id']
        resp = client.post('/api/v1/tickets', json={
            'tenant_id': str(tid), 'customer_id': cid, 'subject': 'Internet down',
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data['ticket_number'].startswith('INC-')
        assert data['status'] == 'open'

    def test_create_ticket_mismatched_tenant(self):
        tenant1 = _create_tenant('Acme Corp')
        tenant2 = _create_tenant('Beta Inc')
        tid1 = _get_tenant_id(tenant1)
        tid2 = _get_tenant_id(tenant2)
        customer = client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid1)}).json()
        resp = client.post('/api/v1/tickets', json={
            'tenant_id': str(tid2), 'customer_id': customer['id'], 'subject': 'Hacked',
        })
        assert resp.status_code == 400

    def test_list_tickets_by_tenant(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        cust = client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid)}).json()
        cid = cust['id']
        client.post('/api/v1/tickets', json={'tenant_id': str(tid), 'customer_id': cid, 'subject': 'Issue 1'})
        client.post('/api/v1/tickets', json={'tenant_id': str(tid), 'customer_id': cid, 'subject': 'Issue 2'})
        resp = client.get(f'/api/v1/tickets?tenant_id={tid}')
        assert len(resp.json()) == 2

    def test_update_ticket_status(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        cust = client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid)}).json()
        ticket = client.post('/api/v1/tickets', json={
            'tenant_id': str(tid), 'customer_id': cust['id'], 'subject': 'Test',
        }).json()
        tid_id = ticket['id']
        resp = client.put(f'/api/v1/tickets/{tid_id}', json={'status': 'resolved'})
        assert resp.json()['status'] == 'resolved'

    def test_ticket_ticket_number_increment(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        cust = client.post('/api/v1/customers', json={'phone_number': '1', 'tenant_id': str(tid)}).json()
        cid = cust['id']
        r1 = client.post('/api/v1/tickets', json={'tenant_id': str(tid), 'customer_id': cid, 'subject': 'A'})
        r2 = client.post('/api/v1/tickets', json={'tenant_id': str(tid), 'customer_id': cid, 'subject': 'B'})
        assert r1.json()['ticket_number'] == 'INC-00001'
        assert r2.json()['ticket_number'] == 'INC-00002'


class TestTicketMessages:
    def test_add_message(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        cust = client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid)}).json()
        ticket = client.post('/api/v1/tickets', json={
            'tenant_id': str(tid), 'customer_id': cust['id'], 'subject': 'Test',
        }).json()
        tid_id = ticket['id']
        resp = client.post(f'/api/v1/tickets/{tid_id}/messages', json={'content': 'Still having issues'})
        assert resp.status_code == 201
        assert resp.json()['content'] == 'Still having issues'
        assert resp.json()['from_whatsapp'] is True

    def test_list_messages(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        cust = client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid)}).json()
        ticket = client.post('/api/v1/tickets', json={
            'tenant_id': str(tid), 'customer_id': cust['id'], 'subject': 'Test',
        }).json()
        tid_id = ticket['id']
        client.post(f'/api/v1/tickets/{tid_id}/messages', json={'content': 'Msg 1'})
        client.post(f'/api/v1/tickets/{tid_id}/messages', json={'content': 'Msg 2'})
        resp = client.get(f'/api/v1/tickets/{tid_id}/messages')
        assert len(resp.json()) == 2


class TestConversationWebhook:
    def test_webhook_no_link(self):
        resp = client.post('/api/v1/webhook/evolution', json={
            'instance_name': 'unknown', 'phone_number': '265991234567', 'text': 'Hi',
        })
        assert resp.status_code == 400

    def test_webhook_main_menu(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        client.post('/api/v1/instances/link', json={'instance_name': 'acme-support', 'tenant_id': str(tid)})
        resp = client.post('/api/v1/webhook/evolution', json={
            'instance_name': 'acme-support', 'phone_number': '265991234567', 'text': 'Hi',
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data['state'] == 'MAIN_MENU'
        assert 'Welcome' in data['reply']
        assert uuid.UUID(data['tenant_id'])
        assert data['phone_number'] == '265991234567'

    def test_webhook_create_ticket_flow(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        client.post('/api/v1/instances/link', json={'instance_name': 'acme-support', 'tenant_id': str(tid)})
        c = lambda data: client.post('/api/v1/webhook/evolution', json={  # noqa: E731
            'instance_name': 'acme-support', 'phone_number': '265991234567', **data,
        })

        r1 = c({'text': 'Hi'})
        assert r1.json()['state'] == 'MAIN_MENU'

        r2 = c({'text': '1'})
        assert r2.json()['state'] == 'WAITING_DESCRIPTION'

        r3 = c({'text': 'My internet is not working'})
        assert r3.json()['state'] == 'WAITING_CATEGORY'

        r4 = c({'text': '1'})
        assert r4.json()['state'] == 'CONFIRM_TICKET'
        assert 'Network' in r4.json()['reply']

        r5 = c({'text': '1'})
        assert r5.json()['state'] == 'COMPLETED'
        assert 'INC-' in r5.json()['reply']

    def test_webhook_natural_language_auto_create(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        client.post('/api/v1/instances/link', json={'instance_name': 'acme-support', 'tenant_id': str(tid)})
        c = lambda data: client.post('/api/v1/webhook/evolution', json={  # noqa: E731
            'instance_name': 'acme-support', 'phone_number': '265991234567', **data,
        })

        r1 = c({'text': 'Hi'})
        assert r1.json()['state'] == 'MAIN_MENU'

        r2 = c({'text': 'My internet is down and I cannot work'})
        assert r2.json()['state'] == 'CONFIRM_TICKET'
        assert 'Yes, create ticket' in r2.json()['reply']

    def test_webhook_check_ticket(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        cust = client.post('/api/v1/customers', json={
            'phone_number': '265991234567', 'tenant_id': str(tid), 'name': 'John',
        }).json()
        client.post('/api/v1/tickets', json={
            'tenant_id': str(tid), 'customer_id': cust['id'], 'subject': 'Test',
        })
        client.post('/api/v1/instances/link', json={'instance_name': 'acme-support', 'tenant_id': str(tid)})
        c = lambda data: client.post('/api/v1/webhook/evolution', json={  # noqa: E731
            'instance_name': 'acme-support', 'phone_number': '265991234567', **data,
        })

        r1 = c({'text': 'Hi'})
        assert r1.json()['state'] == 'MAIN_MENU'

        r2 = c({'text': '2'})
        assert r2.json()['state'] == 'CHECKING_TICKET'

        r3 = c({'text': 'INC-00001'})
        assert r3.json()['state'] == 'COMPLETED'
        assert 'INC-00001' in r3.json()['reply']

    def test_webhook_check_ticket_not_found(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        client.post('/api/v1/instances/link', json={'instance_name': 'acme-support', 'tenant_id': str(tid)})
        c = lambda data: client.post('/api/v1/webhook/evolution', json={  # noqa: E731
            'instance_name': 'acme-support', 'phone_number': '265991234567', **data,
        })

        c({'text': 'Hi'})
        c({'text': '2'})
        r3 = c({'text': 'INC-99999'})
        assert 'not found' in r3.json()['reply']


class TestDeleteAndCleanup:
    def test_soft_delete_ticket(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        cust = client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid)}).json()
        ticket = client.post('/api/v1/tickets', json={
            'tenant_id': str(tid), 'customer_id': cust['id'], 'subject': 'To delete',
        }).json()
        tid_id = ticket['id']
        resp = client.delete(f'/api/v1/tickets/{tid_id}')
        assert resp.status_code == 200
        assert resp.json()['id'] == tid_id
        get_resp = client.get(f'/api/v1/tickets/{tid_id}')
        assert get_resp.status_code == 404

    def test_delete_tenant_cascades(self):
        tenant = _create_tenant()
        tid = _get_tenant_id(tenant)
        cust = client.post('/api/v1/customers', json={'phone_number': '265991234567', 'tenant_id': str(tid)}).json()
        client.post('/api/v1/instances/link', json={'instance_name': 'acme-support', 'tenant_id': str(tid)})
        resp = client.delete(f'/api/v1/tenants/{tid}')
        assert resp.status_code == 204
        assert client.get(f'/api/v1/tenants/{tid}').status_code == 404
        assert client.get(f'/api/v1/customers/{cust["id"]}').status_code == 404
        assert client.get('/api/v1/instances/acme-support').status_code == 404
