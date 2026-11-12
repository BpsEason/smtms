import os

os.environ["APP_ENV"] = "development"

from app.core import redis_client as redis_module
from app.main import app
from fastapi.testclient import TestClient


class FakeRedis:
    async def exists(self, key): return 0
    async def set(self, key, value, ex): return True
    async def close(self): return None
    async def aclose(self): return None

redis_module.get_redis_client = lambda: FakeRedis()

with TestClient(app) as client:
    # login as admin (from seeder)
    r = client.post('/api/v1/auth/login', json={'username': 'admin', 'password': 'SmtmsLocal2026!'})
    print('login status:', r.status_code)
    if r.status_code != 200:
        print('login body:', r.text[:500])
    else:
        token = r.json()['access_token']
        headers = {'Authorization': f'Bearer {token}'}
        resp = client.get('/api/v1/dashboard/todos', headers=headers)
        print('todos status:', resp.status_code)
        print('todos body:', resp.text[:2000])
