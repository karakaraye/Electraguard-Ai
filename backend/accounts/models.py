from uuid import UUID, uuid4

from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.db import models


INITIAL_ORGANISATION = UUID("362183b8-99c0-4a26-976a-8d0098db0cd3")


def default_party_labels():
    return ["A", "B", "C", "D", "E"]


class Organisation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=160)
    intake_paused = models.BooleanField(default=False)
    election_day = models.DateField(null=True, blank=True)
    coverage_state_codes = models.JSONField(default=list)
    coverage_lga_codes = models.JSONField(default=list)
    party_labels = models.JSONField(default=default_party_labels)


class OrganisationOwned(models.Model):
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, default=INITIAL_ORGANISATION)

    class Meta:
        abstract = True


class UserManager(BaseUserManager):
    use_in_migrations = True

    @classmethod
    def normalize_email(cls, email):
        return super().normalize_email(email).lower()

    def get_by_natural_key(self, email):
        return super().get_by_natural_key(self.normalize_email(email))

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields["is_staff"] is not True or extra_fields["is_superuser"] is not True:
            raise ValueError("A superuser requires is_staff and is_superuser.")
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser, OrganisationOwned):
    class Role(models.TextChoices):
        OBSERVER = "observer", "Observer"
        REVIEWER = "reviewer", "Reviewer"
        ADMINISTRATOR = "administrator", "Administrator"
        MODERATOR = "moderator", "Moderator"

    public_id = models.UUIDField(default=uuid4, editable=False, unique=True)
    username = None
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=16, choices=Role.choices, blank=True, default="")

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()


class AccountOffboarding(OrganisationOwned):
    class Reason(models.TextChoices):
        ACCESS_ENDED = "access_ended", "Access no longer required"
        ROLE_CHANGED = "role_changed", "Role changed"
        CREDENTIAL_RISK = "credential_risk", "Suspected credential compromise"

    account = models.ForeignKey(User, on_delete=models.PROTECT, related_name="offboarding_events")
    authorized_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    role = models.CharField(max_length=16, choices=User.Role.choices)
    reason = models.CharField(max_length=24, choices=Reason.choices)
    created_at = models.DateTimeField(auto_now_add=True)


class ObserverCode(OrganisationOwned):
    class Status(models.TextChoices):
        UNCLAIMED = "unclaimed", "Unclaimed"
        ACTIVE = "active", "Active"
        LOCKED = "locked", "Locked"
        REVOKED = "revoked", "Revoked"

    user = models.OneToOneField(User, on_delete=models.PROTECT, related_name="observer_credential")
    code = models.CharField(max_length=10, unique=True)
    label = models.CharField(max_length=80)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.UNCLAIMED)
    pin_hash = models.CharField(max_length=128, blank=True)
    setup_hash = models.CharField(max_length=128, blank=True)
    setup_prefix_hash = models.CharField(max_length=128, blank=True)
    setup_expires_at = models.DateTimeField(null=True)
    token_digest = models.CharField(max_length=64, unique=True, null=True)
    token_expires_at = models.DateTimeField(null=True)
    token_attempts = models.PositiveSmallIntegerField(default=0)


class AuthThrottle(models.Model):
    # Pseudonymised keys also let unknown credentials follow the same throttle path.
    key = models.CharField(max_length=64, primary_key=True)
    attempts = models.JSONField(default=list)
    locked_until = models.DateTimeField(null=True)
    permanently_locked = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)


class AccountSession(OrganisationOwned):
    key = models.CharField(max_length=40, primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    absolute_expires_at = models.DateTimeField(null=True)


class ObserverSecurityAlert(OrganisationOwned):
    credential = models.ForeignKey(ObserverCode, on_delete=models.PROTECT)
    permanent = models.BooleanField()
    created_at = models.DateTimeField(auto_now_add=True)
