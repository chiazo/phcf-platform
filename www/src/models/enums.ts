export const MemberState = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  PENDING: "PENDING",
} as const;

export type MemberState = (typeof MemberState)[keyof typeof MemberState];

export const MemberType = {
  GENERAL: "GENERAL",
  ASSOCIATE: "ASSOCIATE",
  ALUMNI: "ALUMNI",
  PENDING: "PENDING",
} as const;

export type MemberType = (typeof MemberType)[keyof typeof MemberType];

export const MemberRole = {
  INVALID: "ROLE_INVALID",
  PRESIDENT: "PRESIDENT",
  VICE_PRESIDENT: "VICE_PRESIDENT",
  SECRETARY: "SECRETARY",
  TREASURER: "TREASURER",
  PENDING: "PENDING",
} as const;

export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];

export const DueState = {
  COMPLETE: "COMPLETE",
  PENDING: "PENDING",
  UNPAID: "UNPAID",
} as const;

export type DueState = (typeof DueState)[keyof typeof DueState];

export const PaymentType = {
  CASH: "cash",
  CARD: "card",
  CHECK: "check",
  VENMO: "venmo",
  PAYPAL: "paypal",
  OTHER: "other",
} as const;

export type PaymentType = (typeof PaymentType)[keyof typeof PaymentType];

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const phonePattern = /^\+?[\d\s().-]{10,17}$/;

export const VOLUNTEER_INTEREST_OPTIONS = [
  "Arborism and Pruning (under Master Gardener supervision)",
  "Community Garden Governance and Best Practices",
  "Composting",
  "Event Organizing",
  "Garden Work Days",
  "Grant Writing/Advocacy",
  "Greenhouse/Cold Frame Gardening",
  "Keeping Garden Open for Neighbors (this is a requirement for everyone)",
  "Leading Workshops/Education Events",
  "Organizing or Contributing to a Regularly Sent Newsletter",
  "Prepping or working Annual Plant Sales",
  "Rat Abatement",
  "Researching/Archiving/Writing History of the Garden",
  "Stewarding Common Areas (under Master Gardener guidance)",
  "Victory Garden/Community Food Access",
  "Watering and Filling Water Barrels",
  "Winter Maintenance",
] as const;

export const VOLUNTEER_INTEREST_EMOJIS: Record<
  (typeof VOLUNTEER_INTEREST_OPTIONS)[number],
  string
> = {
  "Arborism and Pruning (under Master Gardener supervision)": "🌳",
  "Community Garden Governance and Best Practices": "🤝",
  Composting: "♻️",
  "Event Organizing": "📅",
  "Garden Work Days": "🧤",
  "Grant Writing/Advocacy": "✍️",
  "Greenhouse/Cold Frame Gardening": "🌱",
  "Keeping Garden Open for Neighbors (this is a requirement for everyone)":
    "🚪",
  "Leading Workshops/Education Events": "🎓",
  "Organizing or Contributing to a Regularly Sent Newsletter": "📰",
  "Prepping or working Annual Plant Sales": "🌼",
  "Rat Abatement": "🪤",
  "Researching/Archiving/Writing History of the Garden": "📚",
  "Stewarding Common Areas (under Master Gardener guidance)": "🛠️",
  "Victory Garden/Community Food Access": "🥕",
  "Watering and Filling Water Barrels": "💧",
  "Winter Maintenance": "❄️",
};

export const BoxState = {
  UNASSIGNED: "UNASSIGNED",
  ASSIGNED: "ASSIGNED",
  WAITLIST: "WAITLIST",
} as const;

export type BoxState = (typeof BoxState)[keyof typeof BoxState];
