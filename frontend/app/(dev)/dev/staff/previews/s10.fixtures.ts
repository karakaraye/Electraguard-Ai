import type { StaffAccount } from "../../../../../lib/api/types";

/** The admin looking at the screen. Their own row cannot be offboarded. */
export const S10_ME = "st-adaeze";

/** Synthetic staff of the synthetic institution; emails are on the preview-only domain. */
export const S10_STAFF: StaffAccount[] = [
  {
    id: "st-adaeze",
    email: "adaeze.nwosu@electraguard.ng",
    display_name: "Adaeze Nwosu",
    roles: ["org_admin"],
    status: "active",
    totp_enrolled: true,
    last_sign_in_on: "2026-11-24",
    version: 6,
  },
  {
    id: "st-ibrahim",
    email: "ibrahim.sule@electraguard.ng",
    display_name: "Ibrahim Sule",
    roles: ["coordinator", "reviewer"],
    status: "active",
    totp_enrolled: true,
    last_sign_in_on: "2026-11-24",
    version: 4,
  },
  {
    id: "st-funmi",
    email: "funmilayo.bakare@electraguard.ng",
    display_name: "Funmilayo Bakare",
    roles: ["reviewer"],
    status: "active",
    totp_enrolled: true,
    last_sign_in_on: "2026-11-23",
    version: 3,
  },
  {
    id: "st-chinedu",
    email: "chinedu.okafor@electraguard.ng",
    display_name: "Chinedu Okafor",
    roles: ["moderator"],
    status: "active",
    totp_enrolled: false,
    last_sign_in_on: "2026-11-20",
    version: 2,
  },
  {
    id: "st-hauwa",
    email: "hauwa.garba@electraguard.ng",
    display_name: "Hauwa Garba",
    roles: ["reviewer"],
    status: "invited",
    totp_enrolled: false,
    last_sign_in_on: null,
    version: 1,
  },
  {
    id: "st-tunde",
    email: "tunde.adebayo@electraguard.ng",
    display_name: "Tunde Adebayo",
    roles: ["reviewer", "moderator"],
    status: "offboarded",
    totp_enrolled: true,
    last_sign_in_on: "2026-10-30",
    version: 5,
  },
];

/** What the create call returns. The link is a placeholder token, never a working one. */
export const S10_INVITE = {
  url: "/s/sign-in?invite=inv_Zk3w9QmT1xV7pLr2NhB6yUa0cDs8EfGj4oKiWnXqMtA",
  expires_at: "2026-11-28T10:15:00+01:00",
  name: "Hauwa Garba",
};
