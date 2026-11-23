from rest_framework import serializers

from accounts.organisations import org_scope

from . import capabilities
from .models import Evidence, Report, ReviewEvent


class EvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Evidence
        fields = ["id", "name"]


class ReportSerializer(serializers.ModelSerializer):
    description = serializers.CharField(max_length=1000)
    polling_unit_code = serializers.CharField(max_length=32, allow_blank=True, default="")

    class Meta:
        model = Report
        fields = [
            "reference", "occurred_at", "location", "polling_unit_code", "description",
            "status", "created_at",
        ]
        read_only_fields = ["reference", "status", "created_at"]


class ReportDetailSerializer(ReportSerializer):
    attachments = EvidenceSerializer(many=True, read_only=True)

    class Meta(ReportSerializer.Meta):
        fields = [*ReportSerializer.Meta.fields, "attachments"]


class ObserverReportDetailSerializer(ReportDetailSerializer):
    clarification = serializers.SerializerMethodField()
    clarification_history = serializers.SerializerMethodField()
    outcome = serializers.SerializerMethodField()

    def get_clarification(self, report):
        if report.status != Report.Status.NEEDS_CLARIFICATION:
            return None
        for event in reversed(report.observer_events):
            if event.action == ReviewEvent.Action.REQUEST_CLARIFICATION:
                return event.change["note"]
        return None

    def get_clarification_history(self, report):
        return ObserverClarificationSerializer(
            (event for event in report.observer_events if event.action != ReviewEvent.Action.CLOSE),
            many=True,
        ).data

    def get_outcome(self, report):
        if report.status != Report.Status.CLOSED:
            return None
        for event in reversed(report.observer_events):
            if event.action == ReviewEvent.Action.CLOSE:
                return dict(Report.Outcome.choices).get(event.change.get("outcome"))
        return None

    class Meta(ReportDetailSerializer.Meta):
        fields = [
            *ReportDetailSerializer.Meta.fields, "version", "clarification", "clarification_history", "outcome",
        ]


class ObserverClarificationSerializer(serializers.ModelSerializer):
    note = serializers.CharField(source="change.note")

    class Meta:
        model = ReviewEvent
        fields = ["action", "created_at", "note"]


class ReviewEventSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()
    action_label = serializers.CharField(source="get_action_display")

    def get_actor(self, event):
        if event.action == ReviewEvent.Action.RESPOND:
            return "Observer"
        return event.actor.email

    class Meta:
        model = ReviewEvent
        fields = ["version", "actor", "created_at", "action", "action_label", "change"]


class ReviewCaseSerializer(ReportDetailSerializer):
    history = serializers.SerializerMethodField()

    def get_history(self, report):
        events = report.review_events.all()
        if not capabilities.GROUPING_ENABLED:
            visible_events = [event for event in events if event.action != ReviewEvent.Action.DECIDE_MATCH]
            return ReviewEventSerializer(visible_events, many=True).data
        references = [
            event.change["candidate"] for event in events
            if event.action == ReviewEvent.Action.DECIDE_MATCH
        ]
        visible = {
            str(reference) for reference in org_scope(self.context["request"], Report).filter(
                reference__in=references, assigned_reviewer=self.context["reviewer"]
            ).values_list("pk", flat=True)
        }
        events = [
            event for event in events
            if event.action != ReviewEvent.Action.DECIDE_MATCH or event.change["candidate"] in visible
        ]
        return ReviewEventSerializer(events, many=True).data

    class Meta(ReportDetailSerializer.Meta):
        fields = [*ReportDetailSerializer.Meta.fields, "version", "history"]


class AssignmentSummarySerializer(serializers.ModelSerializer):
    reviewer = serializers.EmailField(source="assigned_reviewer.email", allow_null=True)

    class Meta:
        model = Report
        fields = ["reference", "status", "reviewer", "version"]


class AssignmentSerializer(serializers.Serializer):
    reviewer = serializers.IntegerField(min_value=1)
    version = serializers.IntegerField(min_value=0)


class ReviewActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=[
        ReviewEvent.Action.START, ReviewEvent.Action.REQUEST_CLARIFICATION, ReviewEvent.Action.CLOSE,
    ])
    version = serializers.IntegerField(min_value=0)
    note = serializers.CharField(max_length=2000, required=False)
    outcome = serializers.ChoiceField(choices=Report.Outcome.choices, required=False)

    def validate(self, data):
        action = data["action"]
        if action == ReviewEvent.Action.CLOSE:
            if "note" not in data or "outcome" not in data:
                raise serializers.ValidationError("Closing requires a rationale and an outcome.")
        elif "outcome" in data:
            raise serializers.ValidationError("An outcome is only allowed when closing a review.")
        if action == ReviewEvent.Action.REQUEST_CLARIFICATION and "note" not in data:
            raise serializers.ValidationError("Enter a clarification request.")
        if action == ReviewEvent.Action.START and "note" in data:
            raise serializers.ValidationError("Starting a review does not accept a note.")
        return data


class ClarificationSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=0)
    note = serializers.CharField(max_length=2000)
