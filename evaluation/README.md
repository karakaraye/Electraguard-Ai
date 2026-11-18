# Synthetic triage evaluation

`synthetic_triage.csv` contains 29 fictional reports. The development split has 7 reports from 5 incidents. The held-out split has 22 reports from 16 incidents. All reports from the same incident stay in one split. The development examples can support future work. The Stage 4 method was frozen before scoring and no thresholds or category examples were tuned for Stage 5.

From the repository root, run:

```powershell
.\backend\.venv\Scripts\python.exe backend/manage.py evaluate_triage
```

## Held-out results for local-lexical-v1

Category precision is correct predictions divided by predictions for the category. Recall is correct predictions divided by labeled reports in that category. For ambiguous reports, the synthetic label is **Other or unclear** when the report does not provide enough detail to choose a category.

| Category | Labeled reports | Precision | Recall |
| --- | ---: | ---: | ---: |
| Access or accessibility | 5 | 100.0% (5/5) | 100.0% (5/5) |
| Materials or equipment | 5 | 100.0% (4/4) | 80.0% (4/5) |
| Process or procedure | 5 | 100.0% (4/4) | 80.0% (4/5) |
| Conduct or safety | 4 | 80.0% (4/5) | 100.0% (4/4) |
| Other or unclear | 3 | 50.0% (2/4) | 66.7% (2/3) |

The duplicate evaluation scores all 231 unordered held-out pairs against the production similarity gate. There are 6 true duplicate pairs and 225 unrelated pairs. The gate suggested 6 possible matches, with 4 true positives and 2 false positives. **Precision was 66.7% (4/6) and recall was 66.7% (4/6).** Assignment filtering and the five-result UI cap apply after this gate and were tested separately.

## Representative held-out errors

- **H01–H03 and H02–H03** were false positives. Separate obstructions at the same fictional venue involved a crate and a bench. Their location and wording were similar enough to trigger a match.
- **H05–H06** was a missed duplicate. “Accreditation device stopped working” and “check-in tablet froze” describe the same incident. H06 was also incorrectly categorized as Other.
- **H09–H10** was a missed duplicate. Descriptions of missed counting instructions used different wording, and H10 was incorrectly categorized as Other.
- **H18** was classified as Conduct. The report mentioned harassment without details, so its synthetic label was Other or unclear.

These small, predominantly English fixtures measure behavior on synthetic cases. They do not estimate accuracy on reports from real elections.
