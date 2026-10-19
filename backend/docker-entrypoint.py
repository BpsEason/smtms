import os
import sys

from sqlalchemy.engine import make_url


def use_host_gateway_for_local_mysql() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return

    try:
        parsed = make_url(database_url)
    except Exception:
        return

    if parsed.get_backend_name() != "mysql" or (parsed.host or "").lower() not in {"localhost", "127.0.0.1"}:
        return

    resolved = parsed.set(host="host.docker.internal")
    os.environ["DATABASE_URL"] = resolved.render_as_string(hide_password=False)
    print(f"Using MySQL host {resolved.host} from the backend container.", flush=True)


if __name__ == "__main__":
    use_host_gateway_for_local_mysql()
    os.execvp(sys.argv[1], sys.argv[1:])
