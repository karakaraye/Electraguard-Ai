from django.conf import settings

from .models import INITIAL_ORGANISATION, ObserverCode, Organisation


def org_scope(request, model=Organisation, *, credential=None):
    """Scope actor data. Anonymous credential lookup is restricted to a code or token."""
    queryset = model.objects.all()
    actor = request.user
    if credential is not None:
        if model is not ObserverCode or set(credential) not in ({"code"}, {"token_digest"}):
            raise ValueError("Credential lookup is restricted to observer credentials.")
        queryset = queryset.filter(**credential)
        return queryset.filter(organisation_id=actor.organisation_id) if actor.is_authenticated else queryset
    organisation_id = (
        actor.organisation_id if actor.is_authenticated
        else getattr(settings, "PUBLIC_INTAKE_ORGANISATION_ID", INITIAL_ORGANISATION)
    )
    field = "pk" if model is Organisation else "organisation_id"
    return queryset.filter(**{field: organisation_id})
