import { BrandMark } from "../../../../ui/BrandMark/BrandMark";
import styles from "./observer.module.css";

/** The app bar title on observer screens: the monogram and the product name. */
export function AppBarTitle() {
  return (
    <span className={styles.appBar}>
      <span aria-hidden="true" className={styles.appBarMark}>
        <BrandMark variant="symbol" size="bar" />
      </span>
      <span>ElectraGuard AI</span>
    </span>
  );
}
