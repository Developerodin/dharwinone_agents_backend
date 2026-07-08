"""Dev server entrypoint — reads backend/.env automatically."""


def main() -> None:
    from studio.env_loader import load_backend_env

    load_backend_env()
    import uvicorn

    from studio import config

    uvicorn.run(
        "studio.app:create_app",
        factory=True,
        host="127.0.0.1",
        port=config.port(),
    )
