"""Consistency checks on individual sheets. Flags are leads for review."""


def check_result_sheet(sheet, other_sheets=()):
    flags = []

    def flag(code, explanation, benign_explanation):
        flags.append(dict(code=code, explanation=explanation, benign_explanation=benign_explanation))

    registered, accredited, rejected = (sheet[key] for key in ("registered", "accredited", "rejected"))
    votes = sheet["votes"]
    values = [registered, accredited, rejected, *votes.values()]
    if registered is not None and accredited is not None and accredited > registered:
        flag("accredited_exceeds_registered", "Accredited exceeds registered.", "One of the two numbers may have been entered in the wrong box.")
    counted = [rejected, *votes.values()]
    if accredited is not None and None not in counted:
        total = sum(counted)
        if total != accredited:
            flag("count_mismatch", "Votes plus rejected ballots differ from accreditation.", "Some accredited voters may have left without voting.")
            pairs = [(accredited, total), *((value, value + accredited - total) for value in counted)]
            for before, after in pairs:
                digits = str(before)
                if any(int(digits[:i] + digits[i:i + 2][::-1] + digits[i + 2:]) == after for i in range(len(digits) - 1)):
                    flag("likely_digit_swap", "Swapping two adjacent digits would reconcile the count.", "Adjacent digits can be transposed during entry.")
                    break
    if sum(value is not None and value >= 10 and value % 10 == 0 for value in votes.values()) >= 3:
        flag("round_numbers", "Several vote entries are rounded to tens.", "Exact multiples of ten can occur by chance.")
    if None not in values and any(all(sheet[k] == other.get(k) for k in ("registered", "accredited", "rejected", "votes")) for other in other_sheets):
        flag("identical_sheet", "The numbers match a sheet from another unit.", "Small units can produce identical counts by chance.")
    return flags
