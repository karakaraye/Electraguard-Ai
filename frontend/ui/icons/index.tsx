/*
 * ElectraGuard line icons. 24 px grid, 1.75 px stroke, square caps, drawn by hand.
 * Every icon is decorative unless given a `title`.
 */
import { icon } from "./Icon";

export type { IconProps } from "./Icon";
export * from "./pictograms";

export const ArrowLeftIcon = icon("ArrowLeftIcon", <path d="M20 12H5.5M11 6.5 5.5 12l5.5 5.5" />);
export const ArrowRightIcon = icon("ArrowRightIcon", <path d="M4 12h14.5M13 6.5l5.5 5.5-5.5 5.5" />);
export const CloseIcon = icon("CloseIcon", <path d="m6.5 6.5 11 11m0-11-11 11" />);
export const MenuIcon = icon("MenuIcon", <path d="M4 7h16M4 12h16M4 17h16" />);
export const CheckIcon = icon("CheckIcon", <path d="m5 12.5 4.5 4.5L19 7.5" />);
export const ChevronDownIcon = icon("ChevronDownIcon", <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />);
export const ChevronUpIcon = icon("ChevronUpIcon", <path d="m6.5 14.5 5.5-5.5 5.5 5.5" />);
export const ChevronRightIcon = icon("ChevronRightIcon", <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />);
export const PlusIcon = icon("PlusIcon", <path d="M12 5v14M5 12h14" />);
export const SearchIcon = icon(
  "SearchIcon",
  <>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 4.5 4.5" />
  </>,
);
export const CopyIcon = icon(
  "CopyIcon",
  <>
    <path d="M8.5 8.5h11v11h-11z" />
    <path d="M15.5 8.5v-4h-11v11h4" />
  </>,
);
export const DownloadIcon = icon("DownloadIcon", <path d="M12 4v10.5M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14" />);
export const UploadIcon = icon("UploadIcon", <path d="M12 19.5V9M7.5 13.5 12 9l4.5 4.5M5 4.5h14" />);
export const CameraIcon = icon(
  "CameraIcon",
  <>
    <path d="M3.5 8h3.8l1.9-2.8h5.6L16.7 8h3.8v11h-17z" />
    <circle cx="12" cy="13.2" r="3.4" />
  </>,
);
export const VideoIcon = icon(
  "VideoIcon",
  <>
    <path d="M3.5 6.5h11.5v11H3.5z" />
    <path d="m15 10.5 5.5-3v9l-5.5-3" />
  </>,
);
export const MicIcon = icon(
  "MicIcon",
  <>
    <rect x="9" y="3.5" width="6" height="10.5" rx="3" />
    <path d="M5.75 11a6.25 6.25 0 0 0 12.5 0M12 17.5v3M9 20.5h6" />
  </>,
);
export const FileIcon = icon("FileIcon", <path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4" />);
export const ImageIcon = icon(
  "ImageIcon",
  <>
    <path d="M3.5 4.5h17v15h-17z" />
    <circle cx="9" cy="9.75" r="1.75" />
    <path d="m3.5 17 5-4.5 4 3.5 2.5-2.25L20.5 18" />
  </>,
);
export const RetryIcon = icon("RetryIcon", <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4h-4" />);
export const TrashIcon = icon("TrashIcon", <path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />);
export const InfoIcon = icon(
  "InfoIcon",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.75v.25" />
  </>,
);
export const AlertIcon = icon("AlertIcon", <path d="M12 4 20.5 19h-17zM12 10v4M12 16.5v.25" />);
export const SignalIcon = icon("SignalIcon", <path d="M4.5 19.5v-2M9 19.5v-5M13.5 19.5v-8M18 19.5V6" />);
export const OfflineIcon = icon("OfflineIcon", <path d="M4.5 19.5v-2M9 19.5v-5M13.5 19.5v-3M18 19.5v-1M4 4.5l16 15" />);
export const ClockIcon = icon(
  "ClockIcon",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3.25 2" />
  </>,
);
export const CalendarIcon = icon("CalendarIcon", <path d="M3.5 5.5h17v15h-17zM3.5 10h17M8 3v4M16 3v4" />);
export const PlaceIcon = icon(
  "PlaceIcon",
  <>
    <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.25" />
  </>,
);
export const LockIcon = icon("LockIcon", <path d="M5 10.5h14v10H5zM8 10.5v-3a4 4 0 0 1 8 0v3" />);
export const EyeIcon = icon(
  "EyeIcon",
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const BlurIcon = icon(
  "BlurIcon",
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <path d="m4 4 16 16" />
  </>,
);
export const MessageIcon = icon("MessageIcon", <path d="M4 5h16v11h-9.5l-5 4v-4H4z" />);
export const DiscussionIcon = icon(
  "DiscussionIcon",
  <path d="M3 4h12v8.5H8L4.5 15v-2.5H3zM18 8.5h3V17h-1.5v2.5L16.5 17H10v-2" />,
);
export const HomeIcon = icon("HomeIcon", <path d="m3.5 11 8.5-7.5 8.5 7.5M6 9v11h12V9M10 20v-5.5h4V20" />);
export const ListIcon = icon("ListIcon", <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.5M4.5 12h.5M4.5 17.5h.5" />);
export const InboxIcon = icon("InboxIcon", <path d="M3.5 13 6.5 5h11l3 8v6.5h-17zM3.5 13H8l1.5 2.5h5L16 13h4.5" />);
export const SlidersIcon = icon(
  "SlidersIcon",
  <>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </>,
);
export const HelpIcon = icon(
  "HelpIcon",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.5 9.75a2.5 2.5 0 1 1 3.6 2.25c-.65.3-1.1.95-1.1 1.7v.3M12 16.75V17" />
  </>,
);
export const SignOutIcon = icon("SignOutIcon", <path d="M10 4H4.5v16H10M15 8l4 4-4 4M19 12H9" />);
export const SortIcon = icon("SortIcon", <path d="m8 9.5 4-4 4 4M8 14.5l4 4 4-4" />);
export const SortUpIcon = icon("SortUpIcon", <path d="M12 19V5.5M7.5 10 12 5.5l4.5 4.5" />);
export const SortDownIcon = icon("SortDownIcon", <path d="M12 5v13.5M7.5 14l4.5 4.5 4.5-4.5" />);
export const ExternalIcon = icon("ExternalIcon", <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v6H4V6h6" />);
export const PhoneIcon = icon(
  "PhoneIcon",
  <>
    <rect x="7" y="2.5" width="10" height="19" rx="1.5" />
    <path d="M11 18.5h2" />
  </>,
);
export const PlayIcon = icon("PlayIcon", <path d="M8 5.5 18.5 12 8 18.5z" />);
export const StopIcon = icon("StopIcon", <path d="M6.5 6.5h11v11h-11z" />);
export const LanguageIcon = icon(
  "LanguageIcon",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c-2.4 2.3-3.5 5.1-3.5 8.5s1.1 6.2 3.5 8.5c2.4-2.3 3.5-5.1 3.5-8.5S14.4 5.8 12 3.5z" />
  </>,
);
export const ShieldCheckIcon = icon(
  "ShieldCheckIcon",
  <path d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6zM8.75 12l2.25 2.25 4.25-4.5" />,
);
export const LinkBrokenIcon = icon(
  "LinkBrokenIcon",
  <path d="M10 6.5 11.5 5a3.9 3.9 0 0 1 5.5 5.5L15.5 12M8.5 12 7 13.5A3.9 3.9 0 0 0 12.5 19l1.5-1.5M4 4l3 3M20 20l-3-3" />,
);
