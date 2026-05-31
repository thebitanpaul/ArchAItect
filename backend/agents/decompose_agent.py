"""Agent 2 — Decomposition.
Takes the domain model and proposes microservice boundaries using
bounded-context reasoning: high cohesion within a service, low coupling between.
"""
import json
from .llm_client import call_json

SYSTEM = """You are a principal software architect specializing in microservices.
You apply Domain-Driven Design: group capabilities into bounded contexts that
have high internal cohesion and minimal coupling. You justify every boundary.
Avoid both a distributed monolith (too coupled) and nano-services (too granular).

Practice POLYGLOT PERSISTENCE: pick the data store that genuinely fits each
service's access pattern, do NOT default everything to one database. Examples:
- High-write transactional / relational integrity -> PostgreSQL or MySQL
- Session/cart/cache, ephemeral fast access -> Redis
- Product catalog, flexible schema, document data -> MongoDB / DocumentDB
- Full-text search, browsing -> Elasticsearch / OpenSearch
- Analytics / reporting / aggregations -> data warehouse (BigQuery/Redshift)
- Event log / append-only streams -> Kafka / event store
- Graph relationships (social, recommendations) -> Neo4j
- Time-series / metrics -> InfluxDB / TimescaleDB
- Media/blobs -> object storage (S3)
Choose what each service actually needs; a realistic system uses several.

A service is more than its database. Real systems depend on EXTERNAL services and
platform capabilities too — payment gateways (Stripe/PayPal), identity providers
(Auth0/Cognito), notification services (email/SMS/push), media/object storage,
mapping/geolocation, search, message brokers, third-party domain APIs. Populate
each service's "integrations" with the ones its responsibility genuinely implies.
Output ONLY a JSON object, no prose, no markdown fences."""

PROMPT = """Given this domain model, propose a microservice decomposition.

DOMAIN MODEL:
{domain}

Return JSON with EXACTLY this shape:
{{
  "services": [
    {{
      "id": "kebab-case-id",
      "name": "Human Readable Service Name",
      "responsibility": "single clear sentence — its one job",
      "bounded_context": "the DDD bounded context it owns",
      "owns_entities": ["entities this service is the source of truth for"],
      "key_apis": ["POST /things", "GET /things/{{id}}"],
      "data_store": "the store that fits THIS service's needs (vary across services per polyglot persistence; don't default to one)",
      "integrations": ["external services / platform dependencies this service needs, e.g. 'Stripe (payments)', 'Auth0 (identity)', 'SendGrid (email)', 'Twilio (SMS)', 'S3 (media storage)', 'Google Maps (geolocation)', 'Kafka (event bus)' — [] if none"],
      "rationale": "why this is its own service (cohesion/coupling/scaling reason)"
    }}
  ]
}}

Aim for 4-9 services for a typical app. Each entity should be owned by exactly one service."""


def run(domain: dict) -> dict:
    return call_json(SYSTEM, PROMPT.format(domain=json.dumps(domain, separators=(",", ":"))), max_tokens=4000)
