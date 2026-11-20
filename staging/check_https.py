"""Verify the public HTTP contract through an HTTPS endpoint without logging credentials."""

import argparse
from http.client import HTTPSConnection, HTTPException
from http.cookies import SimpleCookie
import ssl
from urllib.parse import urljoin, urlsplit


def verify(origin, ca_file):
    endpoint = urlsplit(origin)
    if (
        endpoint.scheme != "https"
        or not endpoint.hostname
        or endpoint.username is not None
        or endpoint.password is not None
        or endpoint.path not in ("", "/")
        or endpoint.query
        or endpoint.fragment
    ):
        raise ValueError("Use a bare HTTPS origin such as https://localhost:8443.")

    context = ssl.create_default_context(cafile=ca_file)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    with_https = HTTPSConnection(endpoint.hostname, endpoint.port, context=context, timeout=10)
    try:
        with_https.connect()
        print(f"Verified certificate and hostname using {with_https.sock.version()}.")
        check_response(with_https, "/", 200, "text/html", ["Content-Security-Policy"])
        check_response(with_https, "/static/reports/style.css", 200, "text/css")
        worker = check_response(with_https, "/service-worker.js", 200, "application/javascript")
        if "no-cache" not in worker.getheader("Cache-Control", ""):
            raise ValueError("The service worker document must be revalidated.")
        csrf = check_response(with_https, "/api/csrf/", 200, "application/json")
        cookies = SimpleCookie(csrf.getheader("Set-Cookie", ""))
        if "csrftoken" not in cookies or not cookies["csrftoken"]["secure"]:
            raise ValueError("The CSRF cookie is missing or lacks the Secure attribute.")
        if "no-store" not in csrf.getheader("Cache-Control", ""):
            raise ValueError("The CSRF response is missing Cache-Control: no-store.")
        protected = check_response(with_https, "/review/", 302)
        target = urlsplit(urljoin(origin, protected.getheader("Location", "")))
        if (target.scheme, target.netloc, target.path) != (
            endpoint.scheme, endpoint.netloc, "/review/sign-in/",
        ):
            raise ValueError("The reviewer page must redirect to same-origin sign-in.")
        review_api = check_response(with_https, "/api/review/", 403, "application/json")
        if "no-store" not in review_api.getheader("Cache-Control", ""):
            raise ValueError("The review API response is missing Cache-Control: no-store.")
    finally:
        with_https.close()


def check_response(connection, path, status, content_type=None, required_headers=()):
    connection.request("GET", path)
    response = connection.getresponse()
    response.read()
    if response.status != status:
        raise ValueError(f"{path} returned {response.status}; expected {status}.")
    if content_type and not response.getheader("Content-Type", "").startswith(content_type):
        raise ValueError(f"{path} returned an unexpected content type.")
    if not response.getheader("Strict-Transport-Security"):
        raise ValueError(f"{path} is missing Strict-Transport-Security.")
    for name in required_headers:
        if not response.getheader(name):
            raise ValueError(f"{path} is missing {name}.")
    print(f"{status} {path}")
    return response


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("origin", help="HTTPS origin to verify")
    parser.add_argument("--ca-file", help="approved CA PEM when the platform trust store is insufficient")
    args = parser.parse_args()
    try:
        verify(args.origin, args.ca_file)
    except (ValueError, OSError, HTTPException) as failure:
        parser.exit(1, f"Staging HTTPS verification failed: {failure}\n")


if __name__ == "__main__":
    main()
