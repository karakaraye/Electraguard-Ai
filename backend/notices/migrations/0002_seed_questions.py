from django.db import migrations

QUESTIONS = [
    {
        "id": "materials_arrived",
        "category": "late_materials",
        "text_by_lang": {
            "en": "Have materials arrived at your unit?",
            "pcm": "Materials don reach your unit?",
            "ha": "Kayan zabe sun iso rumfarka?",
            "yo": "Se awon ohun elo ibo ti de ibudo re?",
            "ig": "Ngwa ntuli aka eruola n'ebe ntuli aka gi?",
        },
        "answers": ["yes", "no", "not_seen"],
    },
    {
        "id": "voting_started",
        "category": "lack_of_information",
        "text_by_lang": {
            "en": "Has voting started at your unit?",
            "pcm": "Voting don start for your unit?",
            "ha": "An fara kada kuri'a a rumfarka?",
            "yo": "Se idibo ti bere ni ibudo re?",
            "ig": "Ntuli aka amalitela n'ebe ntuli aka gi?",
        },
        "answers": ["yes", "no", "not_seen"],
    },
    {
        "id": "unit_calm",
        "category": "intimidation_violence",
        "text_by_lang": {
            "en": "Is your polling unit calm?",
            "pcm": "Your polling unit dey calm?",
            "ha": "Rumfarka ta zabe tana cikin kwanciyar hankali?",
            "yo": "Nje ibudo ibo re wa ni idakero?",
            "ig": "Ebe ntuli aka gi o dika udo?",
        },
        "answers": ["yes", "no", "not_seen"],
    },
    {
        "id": "officials_present",
        "category": "late_materials",
        "text_by_lang": {
            "en": "Are election officials present at your unit?",
            "pcm": "INEC officials dey your unit?",
            "ha": "Jami'an zabe suna nan a rumfarka?",
            "yo": "Se awon osise eto idibo wa ni ibudo re?",
            "ig": "Ndị ọrụ ntuli aka hà nọ n'ebe ntuli aka gi?",
        },
        "answers": ["yes", "no", "not_seen"],
    },
    {
        "id": "accreditation_working",
        "category": "equipment_failure",
        "text_by_lang": {
            "en": "Is accreditation working smoothly?",
            "pcm": "Accreditation machine dey work well?",
            "ha": "Tantance masu zabe na aiki da kyau?",
            "yo": "Se iforukosile n lo dede lai si wahala?",
            "ig": "Nkwenye ndị na-eme ntuli aka ọ na-aga nke ọma?",
        },
        "answers": ["yes", "no", "not_seen"],
    },
    {
        "id": "results_posted",
        "category": "good_practice",
        "text_by_lang": {
            "en": "Have results been posted publicly at your unit?",
            "pcm": "Dem don paste results for public for your unit?",
            "ha": "An manna sakamakon zabe a fili a rumfarka?",
            "yo": "Se a ti lẹ esi ibo si gbangba ni ibudo re?",
            "ig": "E mepere nsonaazụ ahụ n'ihu ọha n'ebe ntuli aka gi?",
        },
        "answers": ["yes", "no", "not_seen"],
    },
]


def seed_questions(apps, schema_editor):
    Question = apps.get_model("notices", "Question")
    for q in QUESTIONS:
        Question.objects.update_or_create(
            id=q["id"],
            defaults={
                "category": q["category"],
                "text_by_lang": q["text_by_lang"],
                "answers": q["answers"],
            },
        )


def remove_questions(apps, schema_editor):
    Question = apps.get_model("notices", "Question")
    Question.objects.filter(id__in=[q["id"] for q in QUESTIONS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("notices", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_questions, remove_questions),
    ]
