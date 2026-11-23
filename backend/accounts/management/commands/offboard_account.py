from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from accounts.models import AccountOffboarding, User


class Command(BaseCommand):
    help = "Disable an application account and revoke its sessions while preserving its audit history."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--authorized-by", required=True, help="Approving application administrator's email.")
        parser.add_argument("--reason", required=True, choices=AccountOffboarding.Reason.values)

    @transaction.atomic
    def handle(self, *args, **options):
        email = User.objects.normalize_email(options["email"].strip())
        approver_email = User.objects.normalize_email(options["authorized_by"].strip())
        eligible = Q(is_staff=False, is_superuser=False)
        legacy_admin_roles = (User.Role.ADMINISTRATOR, User.Role.COORDINATOR)
        admin = Q(role__in=legacy_admin_roles, is_active=True)
        targets = Q(email=email)
        # Lock all active administrator rows in a common order before checking the last-admin rule.
        accounts = list(User.objects.select_for_update().filter(eligible & (admin | targets)).order_by("pk"))

        target = next((user for user in accounts if user.email == email and user.role in User.Role.values), None)
        if target is None:
            raise CommandError("No matching application account.")
        administrators = {
            user.email: user for user in accounts
            if user.role in legacy_admin_roles and user.is_active and user.has_usable_password()
        }
        approver = administrators.get(approver_email)
        if approver is None:
            raise CommandError("Name an active application Administrator with a usable password as approver.")
        if target.organisation_id != approver.organisation_id:
            raise CommandError("No matching application account.")
        administrators = {
            email: account for email, account in administrators.items()
            if account.organisation_id == approver.organisation_id
        }
        if not target.is_active:
            self.stdout.write("Application account is already inactive.")
            return
        if target.role in legacy_admin_roles and not administrators.keys() - {email}:
            raise CommandError("Cannot offboard the last active application Administrator.")

        target.is_active = False
        target.set_unusable_password()
        target.save(update_fields=["is_active", "password"])
        AccountOffboarding.objects.create(
            account=target, organisation_id=target.organisation_id, authorized_by=approver, role=target.role, reason=options["reason"],
        )
        self.stdout.write(self.style.SUCCESS("Application account offboarded. Existing sessions have been revoked."))
