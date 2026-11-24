/** Production settings shown in the observer and citizen app. Change them here only. */

/** Nigeria's emergency number (O-06 "Get safe first"). */
export const EMERGENCY_NUMBER = "112";

/** Version of the "What this app keeps" notice. Raising it shows O-02 once again. */
export const NOTICE_VERSION = "2026-11-22";

/**
 * SMS number for "STATUS <code>" (C-01, P-01). Until a commercial short code is
 * leased this is the SMS gateway's sandbox number, shown with a "test number"
 * label (owner decision Q8). Change both values here when the real code exists.
 */
export const SMS_SHORT_CODE = "20384";
export const SMS_SHORT_CODE_IS_TEST = true;

/** Shown on O-20. Raise it with each release. */
export const APP_VERSION = "1.0.0";
