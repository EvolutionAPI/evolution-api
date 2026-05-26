from typing import Any

import httpx

from app.core.config import settings


class EvolutionAPIService:
    def __init__(self):
        self.base_url = settings.evolution_api_base_url.rstrip('/')

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {'Content-Type': 'application/json'}
        if settings.evolution_api_key:
            headers['apikey'] = settings.evolution_api_key
        return headers

    async def get_information(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=settings.evolution_api_timeout) as client:
            response = await client.get(f'{self.base_url}/', headers=self._headers())
            response.raise_for_status()
            return response.json()

    async def set_instance_rabbitmq(self, instance_name: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        async with httpx.AsyncClient(timeout=settings.evolution_api_timeout) as client:
            response = await client.post(
                f'{self.base_url}/rabbitmq/set/{instance_name}',
                json=payload,
                headers=self._headers(),
            )
            response.raise_for_status()
            if response.content:
                return response.json()
            return None
