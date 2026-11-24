# Local model evaluation

Seed 42 for every split, model and bootstrap. Splits group by incident ID: 20% held out, then 25% of the rest as validation. Regenerate with `python backend/manage.py evaluate_models`; the output is deterministic.

## A1 · Category triage

**Leakage audit.** The pack has 400 incidents but only 342 distinct descriptions, and only **7 distinct descriptions once place names are removed** (one per category). 7 of the 7 templates in the held-out incident split also appear in training, so a row-level split measures memorisation of a template, not generalisation. Splitting by description is impossible with one template per category, so the pack-only score is reported as a memorisation check and the **robustness set is the headline number**.

Templates after removing place names: "materials arrived late at <place>." x69; "officials at <place> assisted elderly voters promptly." x60; "voters report being intimidated near <place>." x56; "polling unit in <place> has steps and no ramp for wheelchair users." x56; "voters at <place> did not know which unit to go to." x56; "card reader not working at <place>." x54; "very long queue and no shade at <place>." x49

**Memorisation check (leaky by construction).** 80 held-out pack incidents, category macro-F1 1.000. Do not read this as accuracy on real reports.

**Robustness set (headline).** 56 hand-written synthetic examples (typos, paraphrase, Pidgin, code-switched Pidgin/Hausa), in `data/synthetic/incident_paraphrases_authored.csv`, never used for training or tuning. Category macro-F1 0.824 (95% bootstrap interval 0.700-0.912); accuracy 0.821. Training data: 7 de-duplicated pack templates plus 56 hand-written paraphrases. Hand-written authors share the pack's vocabulary, so real citizen text will score lower still.

Per category on the robustness set:

| category | F1 | precision | recall |
|---|---|---|---|
| access_barrier | 0.750 | 0.750 | 0.750 |
| equipment_failure | 0.875 | 0.875 | 0.875 |
| good_practice | 0.800 | 0.857 | 0.750 |
| intimidation_violence | 0.889 | 0.800 | 1.000 |
| lack_of_information | 0.667 | 0.600 | 0.750 |
| late_materials | 0.857 | 1.000 | 0.750 |
| queues_crowding | 0.933 | 1.000 | 0.875 |

Per slice (kind of text):

| kind | n | accuracy | macro-F1 |
|---|---|---|---|
| code_switched | 7 | 1.000 | 1.000 |
| paraphrase | 21 | 0.714 | 0.701 |
| pidgin | 14 | 0.857 | 0.848 |
| typo | 14 | 0.857 | 0.848 |

Confusion matrix in the category order access_barrier, equipment_failure, good_practice, intimidation_violence, lack_of_information, late_materials, queues_crowding: [[6, 0, 0, 1, 1, 0, 0], [0, 7, 0, 0, 1, 0, 0], [0, 1, 6, 0, 1, 0, 0], [0, 0, 0, 8, 0, 0, 0], [1, 0, 0, 1, 6, 0, 0], [1, 0, 0, 0, 1, 6, 0], [0, 0, 1, 0, 0, 0, 7]]

**A3 abstention.** Threshold 0.40 chosen on 28 hand-written calibration examples. On the robustness set the rate is 0.446; retained accuracy 1.000.

Failure or abstention examples (robustness set):

- "People living with disability face difficulty reaching the ballot box at this venue." (paraphrase): gold access_barrier, predicted access_barrier, confidence 0.25
- "Elderly voters could not manage the stairs and left without voting." (paraphrase): gold access_barrier, predicted access_barrier, confidence 0.20
- "Blind voter had no asistance and could not mark the balot." (typo): gold access_barrier, predicted lack_of_information, confidence 0.36
- "Old mama no fit climb the staircase to vote, dem send her go house." (pidgin): gold access_barrier, predicted intimidation_violence, confidence 0.22
- "The voter register tablet crashes whenever an official scans a thumbprint." (paraphrase): gold equipment_failure, predicted equipment_failure, confidence 0.24
- "Faulty equipment at this station is holding up the voting process." (paraphrase): gold equipment_failure, predicted lack_of_information, confidence 0.19
- "The machin has gone off and nobody can be acredited." (typo): gold equipment_failure, predicted equipment_failure, confidence 0.32
- "Election staff started right on schedule and treated every voter well." (paraphrase): gold good_practice, predicted equipment_failure, confidence 0.28
- "Peaceful voting with transparent counting at our unit." (paraphrase): gold good_practice, predicted good_practice, confidence 0.24
- "Everything dey go well, officials dey treat people nicely." (pidgin): gold good_practice, predicted good_practice, confidence 0.36
- "Dem start for correct time and the people dey happy." (pidgin): gold good_practice, predicted lack_of_information, confidence 0.26
- "Officials were threatened at gunpoint and told to hand over the materials." (paraphrase): gold intimidation_violence, predicted intimidation_violence, confidence 0.35

Robustness set descriptions and predictions:

- [paraphrase] Wheelchair users are unable to enter because the building has only steps. -> access_barrier
- [paraphrase] People living with disability face difficulty reaching the ballot box at this venue. -> access_barrier
- [paraphrase] Elderly voters could not manage the stairs and left without voting. -> access_barrier
- [typo] Ther is no ramp, wheelchar voters cant get in to the polling unt. -> access_barrier
- [typo] Blind voter had no asistance and could not mark the balot. -> lack_of_information
- [pidgin] Dem no put ramp, person wey dey use wheelchair no fit enter vote. -> access_barrier
- [pidgin] Old mama no fit climb the staircase to vote, dem send her go house. -> intimidation_violence
- [code_switched] Wheelchair user no fit enter, kofar ta yi matsi, no ramp at all. -> access_barrier
- [paraphrase] Accreditation has halted because the biometric device will not switch on. -> equipment_failure
- [paraphrase] The voter register tablet crashes whenever an official scans a thumbprint. -> equipment_failure
- [paraphrase] Faulty equipment at this station is holding up the voting process. -> lack_of_information
- [typo] Card reeder not workng, officals dont know what to do. -> equipment_failure
- [typo] The machin has gone off and nobody can be acredited. -> equipment_failure
- [pidgin] The machine don spoil, dem no fit accredit person. -> equipment_failure
- [pidgin] Dem card reader no dey work, light don go for here. -> equipment_failure
- [code_switched] Machine din ya lalace, we no fit vote, na'ura ba ta aiki. -> equipment_failure
- [paraphrase] The exercise here is running smoothly and officers are courteous. -> good_practice
- [paraphrase] Election staff started right on schedule and treated every voter well. -> equipment_failure
- [paraphrase] Peaceful voting with transparent counting at our unit. -> good_practice
- [typo] Officals were very helpfull and voting is orderly. -> good_practice
- [typo] Votng started on tyme and everybody is calm. -> good_practice
- [pidgin] Everything dey go well, officials dey treat people nicely. -> good_practice
- [pidgin] Dem start for correct time and the people dey happy. -> lack_of_information
- [code_switched] Everything dey okay, an yi kyau sosai, officials dey help us. -> good_practice
- [paraphrase] Gangs with weapons are scaring people away from casting their ballots. -> intimidation_violence
- [paraphrase] Officials were threatened at gunpoint and told to hand over the materials. -> intimidation_violence
- [paraphrase] Men are menacing voters and attacking those who resist. -> intimidation_violence
- [typo] Thugs wit guns are threatning voters, pleese help. -> intimidation_violence
- [typo] A voter was beatn up and the attackrs ran away with the box. -> intimidation_violence
- [pidgin] Thugs dey beat people for here, dem carry gun, people don run. -> intimidation_violence
- [pidgin] Area boys dey threaten us make we no vote. -> intimidation_violence
- [code_switched] Thugs dey here, suna dukan mutane, dem don show cutlass. -> intimidation_violence
- [paraphrase] Residents cannot tell where to cast their votes because there is no notice. -> access_barrier
- [paraphrase] The voters register was not displayed so nobody could confirm their names. -> lack_of_information
- [paraphrase] People are misinformed about the opening time of the polling unit. -> intimidation_violence
- [typo] Voters dont no where to go, no inforamtion was given. -> lack_of_information
- [typo] Nobody anounced the new polling locashun. -> lack_of_information
- [pidgin] Nobody tell us where we go vote, people dey waka up and down. -> lack_of_information
- [pidgin] Dem no paste name for wall, we no sabi our unit. -> lack_of_information
- [code_switched] We no sabi where to vote, babu bayani at all, abeg tell us. -> lack_of_information
- [paraphrase] The polling kit showed up well past opening time and voting was delayed. -> lack_of_information
- [paraphrase] We have been waiting all morning for ballots and result forms to be delivered. -> late_materials
- [paraphrase] Supplies for this polling unit are behind schedule and nothing has started. -> access_barrier
- [typo] Materals have not arived and people are waitin. -> late_materials
- [typo] The balot papers came very latte, voting dont start. -> late_materials
- [pidgin] Dem never bring the materials, we don wait since morning. -> late_materials
- [pidgin] Ballot paper no reach, officials dey wait for truck. -> late_materials
- [code_switched] Materials never reach, kayan zabe ba su zo ba, we dey wait. -> late_materials
- [paraphrase] A very lengthy line of voters is crawling forward and some are giving up. -> queues_crowding
- [paraphrase] Overcrowding at this venue is making the wait unbearable. -> queues_crowding
- [paraphrase] Too many people for too few officials, so waiting times are huge. -> queues_crowding
- [typo] The qeue is too long, peple are wating in the hot sun. -> queues_crowding
- [typo] Crwod everywhere and the linne dont move. -> good_practice
- [pidgin] The line long well well, people dey stand for sun. -> queues_crowding
- [pidgin] Plenty people dey here, dem no dey organise the line. -> queues_crowding
- [code_switched] Line don long, mutane suna jira, we don stand since morning. -> queues_crowding

## A2 · Urgency

Urgent means severity 3 or 4 in the pack. Missing an urgent case is the costly error, so the cut-off is the highest severity probability whose recall on the validation split (80 incidents) reaches 90%; it is 0.439 and was never tuned on the held-out incidents. Rules lift urgency regardless of the model: danger now (+5), threats or violence (+3), a high severity score (+3), firsthand, evidence attached and a local spike (+1 each); score 3 or more is urgent, 2 is high.

**Validation split** (80 incidents, 40 urgent): precision/recall/F1 0.947 / 0.900 / 0.923; false-urgent rate 0.050; flagged 38 of 80.

**Held-out incidents** (80 incidents, 31 urgent): precision/recall/F1 0.818 / 0.871 / 0.844; false-urgent rate 0.122; flagged 33 of 80.

High or urgent on held-out incidents: precision/recall/F1 0.818 / 0.871 / 0.844.

Per slice (pack category) on held-out incidents:

| category | n | urgent in pack | flagged | recall |
|---|---|---|---|---|
| access_barrier | 11 | 10 | 11 | 1.000 |
| equipment_failure | 9 | 5 | 9 | 1.000 |
| good_practice | 14 | 0 | 0 | n/a |
| intimidation_violence | 12 | 12 | 12 | 1.000 |
| lack_of_information | 10 | 3 | 1 | 0.000 |
| late_materials | 9 | 1 | 0 | 0.000 |
| queues_crowding | 15 | 0 | 0 | n/a |

Remaining misses are incidents whose text is identical to non-urgent ones (the pack gives the same text different severities, for example information gaps run from 1 to 3), so no text model can separate them; the false-urgent rate above is the price paid for recall. Danger, firsthand and cluster labels are absent from the pack, so those rules are covered by unit tests, not by metrics.

Missed urgent incidents: INC-0031 (severity 3, information_gap), INC-0043 (severity 3, logistics_delay), INC-0115 (severity 3, information_gap), INC-0182 (severity 3, information_gap)

False-urgent examples: INC-0023 (severity 2, information_gap), INC-0232 (severity 2, accessibility_barrier), INC-0281 (severity 2, equipment_failure), INC-0322 (severity 2, equipment_failure), INC-0377 (severity 2, equipment_failure), INC-0389 (severity 2, equipment_failure) (held-out descriptions: 80 incidents, 7 templates).

Held-out test-set descriptions (one per template): card reader not working at <place>.; materials arrived late at <place>.; officials at <place> assisted elderly voters promptly.; polling unit in <place> has steps and no ramp for wheelchair users.; very long queue and no shade at <place>.; voters at <place> did not know which unit to go to.; voters report being intimidated near <place>.

## A4 · Duplicate similarity

Held-out text perturbations and 1 same-unit distractors: precision 1.000, recall 1.000, support 80. These are proxy cases, without independently labeled paraphrases.

## A5 · Cluster detector

Seeded stream of 1,000 windows with 100 injected spikes: 98/100 detected, 18.54 false alarms per 1,000 background reports.

## A6 · Result-sheet anomalies

Evaluation-only label set: 900 sheets.

- accredited_exceeds_registered: precision 1.000, recall 1.000, support 16

- sum_mismatch: precision 0.190, recall 1.000, support 8

- suspicious_round_numbers: precision 1.000, recall 1.000, support 12

- duplicated_from_previous_unit: precision 1.000, recall 1.000, support 5

- digit_transposition: precision 1.000, recall 1.000, support 1

Alerts per 1,000 sheets: 84.44.

Disagreements: SIM-00004 (label accredited_exceeds_registered, flags accredited_exceeds_registered, sum_mismatch), SIM-00068 (label accredited_exceeds_registered, flags accredited_exceeds_registered, sum_mismatch), SIM-00078 (label duplicated_from_previous_unit, flags sum_mismatch, duplicated_from_previous_unit), SIM-00087 (label digit_transposition, flags sum_mismatch, digit_transposition), SIM-00103 (label accredited_exceeds_registered, flags accredited_exceeds_registered, sum_mismatch)

## A8 · Claim ranking

Held-out claim IDs: 60. Targets proxy harm and check-worthiness from veracity and reach.

- en harm: precision 0.667, recall 0.400, support 10; Brier score 0.120.

- en check_worthiness: precision 1.000, recall 1.000, support 29; Brier score 0.000.

- pcm harm: precision 0.571, recall 0.667, support 6; Brier score 0.162.

- pcm check_worthiness: precision 1.000, recall 1.000, support 11; Brier score 0.001.

Missed harm example IDs: CLM-0006, CLM-0047, CLM-0064, CLM-0093, CLM-0098

## A13 · Transit risk

Held-out deliveries grouped by unit: 60. MAE 0.817 hours. Top-quintile precision 0.667.

Largest transit errors: SIM-00248 (6.61h actual, 2.34h predicted), SIM-00448 (3.31h actual, 6.09h predicted), SIM-00854 (5.61h actual, 3.04h predicted)
