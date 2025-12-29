import os
from urllib.parse import quote, unquote, urlsplit, urlunsplit


def encode_db_url(url: str) -> str:
    parsed = urlsplit(url)
    if "@" not in parsed.netloc:
        return url

    userinfo, hostport = parsed.netloc.rsplit("@", 1)
    if ":" in userinfo:
        user, password = userinfo.split(":", 1)
    else:
        user, password = userinfo, ""

    user_q = quote(unquote(user), safe="")
    password_q = quote(unquote(password), safe="")
    netloc = f"{user_q}:{password_q}@{hostport}"
    return urlunsplit((parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment))


if __name__ == "__main__":
    env_var = os.environ.get("SUPABASE_DB_URL_DEV") or os.environ.get("SUPABASE_DB_URL")
    if not env_var:
        raise SystemExit("Missing env SUPABASE_DB_URL_DEV (or SUPABASE_DB_URL)")
    print(encode_db_url(env_var))

