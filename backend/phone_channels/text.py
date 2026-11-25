from unicodedata import normalize

LANGUAGES = ("en", "pcm", "ha", "yo", "ig")
CATEGORIES = (
    "not_sure", "late_materials", "equipment_failure", "queues_crowding", "intimidation_violence",
    "access_barrier", "lack_of_information", "misinformation", "vote_buying", "good_practice",
)

# Short GSM-7 labels keep the category menu within the gateway's limit.
LABELS = {
    "en": ("Not sure", "Materials late", "Equipment failed", "Queues", "Violence/threats",
           "Access barrier", "No information", "False news", "Vote buying", "Good practice"),
    "pcm": ("I no sure", "Materials late", "Machine spoil", "Long line", "Fight/threat",
            "No access", "No information", "Fake news", "Buy vote", "Good work"),
    "ha": ("Ban sani ba", "Kayan sun makara", "Na'ura ta lalace", "Dogon layi", "Barazana",
           "Matsalar shiga", "Babu bayani", "Labaran karya", "Sayan kuri'a", "Kyakkyawan aiki"),
    "yo": ("Ko daju", "Ohun elo pe", "Ero baje", "Ila gigun", "Iwa ipa",
           "Idena wole", "Ko si alaye", "Iroyin eke", "Rira ibo", "Ise rere"),
    "ig": ("Amaghi m", "Ngwa biara mbubreyo", "Igwe mebiri", "Ahiri ogologo", "Egwu/ime ihe ike",
           "Mgbochi nbanye", "Enweghi ozi", "Ozi ugha", "Izu votu", "Ezi omume"),
}
KEYWORDS = {
    "en": ("REPORT", "STATUS", "REPLY", "LANG", "CHECK", "HELP"),
    "pcm": ("TOK", "STATUS", "ANSWER", "LANG", "CHECK", "HELP"),
    "ha": ("RAHOTO", "HALI", "AMSA", "HARSHE", "BINCIKE", "TAIMAKO"),
    "yo": ("IJABO", "IPO", "ESI", "EDE", "SISE", "IRANLOWO"),
    "ig": ("KPUO", "ONODU", "ZAA", "ASUSU", "NCHOPUTA", "ENYEMAKA"),
}
# Index 4 in KEYWORDS is the community rumour-check command per language:
# en=CHECK, pcm=ASK (pcm already uses CHECK for STATUS), ha=BINCIKE, yo=SISE, ig=NCHOPUTA
MENUS = {
    "en": ("What happened?", "Is anyone in danger now?", "Yes", "No", "Choose state", "Choose LGA",
           "Say what happened (max 140 letters)", "Send?", "Send", "Cancel", "Cancelled. Nothing was sent."),
    "pcm": ("Wetin happen?", "Anybody dey danger now?", "Yes", "No", "Choose state", "Choose LGA",
            "Talk wetin happen (max 140 letters)", "Make we send?", "Send", "Cancel", "We no send anything."),
    "ha": ("Me ya faru?", "Akwai wanda ke cikin hadari yanzu?", "Eh", "A'a", "Zabi jiha", "Zabi karamar hukuma",
           "Fadi abin da ya faru (harafi 140)", "A aika?", "Aika", "Soke", "An soke. Ba a aika komai ba."),
    "yo": ("Kini o sele?", "Se ewu wa fun enikan bayi?", "Bee ni", "Rara", "Yan ipinle", "Yan ijoba ibile",
           "So ohun to sele (leta 140)", "Firanse?", "Firanse", "Fagile", "A fagile. A ko fi ohunkohun ranse."),
    "ig": ("Gini mere?", "Onwere onye no na nsogbu ugbu a?", "Ee", "Mba", "Horo steeti", "Horo okpuru ochichi",
           "Kowaa ihe mere (mkpuru edemede 140)", "Zipu?", "Zipu", "Kagbuo", "Akagbuola. E zipughi ihe."),
}
LANGUAGE_REPLY = {
    "en": "Language set to English.", "pcm": "We don set your language to Naija.",
    "ha": "An saita harshen Hausa.", "yo": "A ti yan ede Yoruba.", "ig": "Ahoro asusu Igbo.",
}
# Short rumour-check replies kept under 160 characters.
CHECK_SAFETY_REPLY = {
    "en": "If someone is in immediate danger, call 112 or the nearest police station.",
    "pcm": "If person dey danger now, call 112 or go police station.",
    "ha": "In akwai wanda ke cikin hadari, kira 112 ko je gidan sanda.",
    "yo": "Ti eniyan ba wa ninu ewu, pe 112 tabi ile-ogun ologun.",
    "ig": "Ọ bụrụ na mmadụ nọ n'ihe egwu, kpọọ 112 ma ọ bụ ụlọ ọrụ ndị uwe ojii.",
}
CHECK_MATCHED_REPLY = {
    "en": "Checked: {text}",
    "pcm": "We don check: {text}",
    "ha": "An bincika: {text}",
    "yo": "A ti sise: {text}",
    "ig": "Achoputa: {text}",
}
CHECK_QUEUED_REPLY = {
    "en": "Not checked yet. We have logged your question for review.",
    "pcm": "Nobody don check am yet. We don write am down for review.",
    "ha": "Ba a bincika ba tukuna. An rubuta tambayarka don dubawa.",
    "yo": "A ko ti sise. A ti gba ibeere re sinu atokun fun atunyewo.",
    "ig": "Achọpụtabeghị ya. Anyị ederede ajụjụ gị maka nyocha.",
}


def ascii_text(value):
    return normalize("NFKD", value).encode("ascii", "ignore").decode()


def help_text(language):
    report, status, reply, lang, check, _ = KEYWORDS[language]
    return f"{report} <0-9> [unit/ward] <text>\n{status} <code>\n{reply} <code> <text>\n{check} <text>\n{lang} EN|PCM|HA|YO|IG"
