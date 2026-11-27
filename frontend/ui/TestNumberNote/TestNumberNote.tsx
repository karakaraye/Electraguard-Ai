import { SMS_SHORT_CODE_IS_TEST } from "../../lib/config";
import styles from "./TestNumberNote.module.css";

/**
 * A plain line that says the SMS short code and the USSD code shown nearby are test numbers
 * for this prototype. It renders nothing once SMS_SHORT_CODE_IS_TEST is false (lib/config.ts),
 * so one flag removes every label.
 */
export function TestNumberNote({ label, className }: { label: string; className?: string }) {
  if (!SMS_SHORT_CODE_IS_TEST) return null;
  return (
    <span className={className ? `${styles.note} ${className}` : styles.note} data-testid="test-number-note">
      {label}
    </span>
  );
}
