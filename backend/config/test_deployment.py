from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from .deployment import validate_production_settings


class ProductionSettingsTests(SimpleTestCase):
    secret = "test-secret-with-distinct-characters-for-production-validation"
    hosts = ["observe.example"]
    origin = "https://observe.example"

    def test_accepts_concrete_hosts_and_an_https_origin(self):
        validate_production_settings(self.secret, self.hosts, self.origin)
        validate_production_settings(self.secret, ["[::1]"], "https://[::1]:8443")

    def test_rejects_weak_and_insecure_secret_keys(self):
        for secret in ("short", "a" * 50, "django-insecure-" + self.secret, "replace-" + self.secret):
            with self.subTest(secret=secret), self.assertRaises(ImproperlyConfigured):
                validate_production_settings(secret, self.hosts, self.origin)

    def test_rejects_missing_or_non_concrete_hosts(self):
        for hosts in ([], ["*"], [".example"], ["observe.example:443"], ["https://observe.example"]):
            with self.subTest(hosts=hosts), self.assertRaises(ImproperlyConfigured):
                validate_production_settings(self.secret, hosts, self.origin)

    def test_rejects_origins_with_insecure_or_extra_components(self):
        for origin in (
            "", "http://observe.example", "https://observe.example/",
            "https://observe.example/path", "https://observe.example?x=1",
            "https://operator@observe.example", "https://observe.example:",
            "https://observe.example:0", "https://observe.example:65536",
        ):
            with self.subTest(origin=origin), self.assertRaises(ImproperlyConfigured):
                validate_production_settings(self.secret, self.hosts, origin)
