import os

from pydantic import field_validator
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
    YamlConfigSettingsSource,
)


class BaseServiceSettings(BaseSettings):
    """Common settings for every service. Subclass per service to add specifics.

    Resolution order (first wins): constructor args > env vars > `.env` > a single
    `config.yaml` > field defaults. The YAML file is the one-file convenience for
    credentials/URLs (gitignored; keys are the lowercase field names, e.g. `mongo_uri`);
    env vars override it so managed deploys (Render/Vercel) win without editing it.
    Path via `CONFIG_FILE` (default `config.yaml`); a missing file is simply skipped.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        yaml_source = YamlConfigSettingsSource(
            settings_cls, yaml_file=os.getenv("CONFIG_FILE", "config.yaml")
        )
        return (
            init_settings,
            env_settings,
            dotenv_settings,
            yaml_source,
            file_secret_settings,
        )

    service_name: str = "service"
    environment: str = "dev"
    log_level: str = "INFO"

    # MongoDB — connection-pool sizing is the primary per-replica scale lever.
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db_name: str = "interview_platform"
    mongo_max_pool_size: int = 100
    mongo_min_pool_size: int = 0

    # Redis (cache + live state).
    redis_url: str = "redis://localhost:6379/0"

    # RabbitMQ (events: routing keys are "{domain}.{action}").
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/"
    rabbitmq_exchange: str = "interview"

    # JWT (used where tokens are issued/verified; required there).
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_minutes: int = 10080  # 7 days (shorter token-theft blast radius)
    email_verification_minutes: int = 1440

    # Object storage (S3-compatible: Cloudflare R2 / MinIO). Secrets via env only.
    s3_endpoint_url: str | None = None
    s3_region: str = "auto"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_bucket: str = "interview-platform"
    storage_presign_ttl_seconds: int = 900

    # Resilience knobs — see docs/superpowers/specs/2026-06-21-...-design.md §2.3.
    # Every external-call site reads via lib.timeouts.<accessor>(); no magic numbers in
    # call sites means per-environment tuning happens via env, not code.
    mongo_op_timeout_seconds: float = 10.0
    redis_op_timeout_seconds: float = 5.0
    rabbitmq_publish_timeout_seconds: float = 5.0
    llm_call_timeout_seconds: float = 30.0
    llm_call_retry_attempts: int = 3
    mcp_call_timeout_seconds: float = 20.0
    storage_op_timeout_seconds: float = 35.0
    http_client_timeout_seconds: float = 15.0

    # Observability collector wiring — both default to disabled so unit tests don't try
    # to bind ports or hit a missing OTLP endpoint.
    metrics_port: int = 0  # 0 disables the /metrics HTTP server
    otlp_endpoint: str | None = None  # None disables OTLP exporter

    @field_validator("jwt_secret")
    @classmethod
    def _jwt_secret_strength(cls, v: str) -> str:
        # Empty is allowed (TokenService fails closed at construction); a non-empty but
        # weak secret is rejected so a committed dev value can't ship to production.
        if v and len(v) < 32:
            raise ValueError("jwt_secret must be at least 32 characters")
        return v
