from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.db import models


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


class User(AbstractUser):
    class Role(models.TextChoices):
        OBSERVER = "observer", "Observer"
        REVIEWER = "reviewer", "Reviewer"
        ADMINISTRATOR = "administrator", "Administrator"

    username = None
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=16, choices=Role.choices, blank=True, default="")

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()


class AccountOffboarding(models.Model):
    class Reason(models.TextChoices):
        ACCESS_ENDED = "access_ended", "Access no longer required"
        ROLE_CHANGED = "role_changed", "Role changed"
        CREDENTIAL_RISK = "credential_risk", "Suspected credential compromise"

    account = models.ForeignKey(User, on_delete=models.PROTECT, related_name="offboarding_events")
    authorized_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    role = models.CharField(max_length=16, choices=User.Role.choices)
    reason = models.CharField(max_length=24, choices=Reason.choices)
    created_at = models.DateTimeField(auto_now_add=True)
