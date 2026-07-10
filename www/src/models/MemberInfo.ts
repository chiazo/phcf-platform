import BaseModel from "./BaseModel";
import { MemberState, DueState } from "./enums";

/* -------------------------
   DUES
--------------------------*/
export class Dues extends BaseModel<any> {
  dueState?: DueState;
  duesPaidAt?: number | string;

  constructor(data: any = {}) {
    super(data);

    this.dueState = data.dueState;
    this.duesPaidAt = data.duesPaidAt;
  }

  get isPaid(): boolean {
    return this.dueState === DueState.COMPLETE;
  }

  get paidDate(): Date | null {
    if (!this.duesPaidAt) return null;

    if (typeof this.duesPaidAt === "number") {
      return new Date(this.duesPaidAt * 1000);
    }

    return new Date(this.duesPaidAt);
  }
}

/* -------------------------
   REQUIREMENTS
--------------------------*/
export class Requirements extends BaseModel<any> {
  meetingsRequired: number;
  meetingsCompleted: number;
  serviceRequirements: any[];

  constructor(data: any = {}) {
    super(data);

    this.meetingsRequired = data.meetingsRequired ?? 0;
    this.meetingsCompleted = data.meetingsCompleted ?? 0;
    this.serviceRequirements = data.serviceRequirements ?? [];
  }

  get meetingsRemaining(): number {
    return Math.max(0, this.meetingsRequired - this.meetingsCompleted);
  }

  get meetingsComplete(): boolean {
    return this.meetingsRemaining === 0;
  }
}

/* -------------------------
   MEMBER INFO (ROOT)
--------------------------*/
export default class MemberInfo extends BaseModel<any> {
  memberState?: MemberState;

  dues: Dues;
  requirements: Requirements;

  constructor(data: any = {}) {
    super(data);

    this.memberState = data.memberState;

    this.dues = new Dues(data.dues ?? {});
    this.requirements = new Requirements(data.requirements ?? {});
  }

  get isActive(): boolean {
    return this.memberState === MemberState.ACTIVE;
  }
}
