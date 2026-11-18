from rest_framework import serializers

from .models import Evidence, Report, ReviewEvent

# Audit entries that name another report. They are shown only while that report
# is assigned to the Reviewer reading the history.
MATCH_ACTIONS = {ReviewEvent.Action.DECIDE_MATCH, ReviewEvent.Action.REVERSE_MATCH}


class EvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Evidence
        fields = ["id", "name"]


class ReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = ["reference", "occurred_at", "location", "description", "status", "created_at"]
        read_only_fields = ["reference", "status", "created_at"]


class ReportDetailSerializer(ReportSerializer):
    attachments = EvidenceSerializer(many=True, read_only=True)

    class Meta(ReportSerializer.Meta):
        fields = [*ReportSerializer.Meta.fields, "attachments"]


class ObserverReportDetailSerializer(ReportDetailSerializer):
    clarification = serializers.SerializerMethodField()

    def get_clarification(self, report):
        if report.status == Report.Status.NEEDS_CLARIFICATION:
            event = report.review_events.filter(
                action=ReviewEvent.Action.REQUEST_CLARIFICATION,
                version__lte=report.version,
            ).last()
            return event.change["note"] if event else None
        return None

    class Meta(ReportDetailSerializer.Meta):
        fields = [*ReportDetailSerializer.Meta.fields, "version", "clarification"]


class ReviewEventSerializer(serializers.ModelSerializer):
    actor = serializers.EmailField(source="actor.email")
    action_label = serializers.CharField(source="get_action_display")

    class Meta:
        model = ReviewEvent
        fields = ["version", "actor", "created_at", "action", "action_label", "change"]


class ReviewCaseSerializer(ReportDetailSerializer):
    history = serializers.SerializerMethodField()

    def get_history(self, report):
        events = report.review_events.all()
        references = [event.change["candidate"] for event in events if event.action in MATCH_ACTIONS]
        visible = {
            str(reference) for reference in Report.objects.filter(
                reference__in=references, assigned_reviewer=self.context["reviewer"]
            ).values_list("pk", flat=True)
        }
        events = [
            event for event in events
            if event.action not in MATCH_ACTIONS or event.change["candidate"] in visible
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
