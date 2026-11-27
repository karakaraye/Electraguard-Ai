/** Production settings shown in the observer and citizen app. Change them here only. */

/** Nigeria's emergency number (O-06 "Get safe first"). */
export const EMERGENCY_NUMBER = "112";

/** Version of the "What this app keeps" notice. Raising it shows O-02 once again. */
export const NOTICE_VERSION = "2026-11-22";

/**
 * SMS number for "STATUS <code>" (C-01, P-01). One value, printed plainly everywhere
 * in public and citizen copy. Change it here only when the commercial short code is leased.
 */
export const SMS_SHORT_CODE = "20384";

/**
 * True while the SMS short code and the USSD code (USSD_SERVICE_CODE in app/(public)/_lib/public.ts)
 * are test numbers, not yet leased. Every place that prints them adds "Test number for this
 * prototype". Set it to false once both are live and every label goes away.
 */
export const SMS_SHORT_CODE_IS_TEST = true;

/** Shown on O-20. Raise it with each release. */
export const APP_VERSION = "1.0.0";
