import BaseModel from "./BaseModel";
import { BoxState } from "./enums";

export class WaitlistEntry extends BaseModel<any> {
  memberId: string;
  joinDate?: number | string | Date;
  position: number;

  constructor(data: any = {}) {
    super(data);

    this.memberId = data.member_id ?? data.memberId ?? "";
    this.joinDate = data.join_date ?? data.joinDate;
    this.position = data.position ?? 0;
  }

  get joinedDate(): Date | null {
    if (!this.joinDate) return null;

    if (typeof this.joinDate === "number") {
      return new Date(this.joinDate * 1000);
    }

    return new Date(this.joinDate);
  }
}

export class BoxInfo extends BaseModel<any> {
  waitlist: WaitlistEntry[];
  boxState?: BoxState;

  constructor(data: any = {}) {
    super(data);

    this.boxState = data.boxState || BoxState.UNASSIGNED;

    this.waitlist = Array.isArray(data.waitlist)
      ? data.waitlist.map((entry: any) => new WaitlistEntry(entry))
      : [];
  }

  get isAssigned(): boolean {
    return this.boxState === BoxState.ASSIGNED;
  }

  get isWaitlisted(): boolean {
    return this.boxState === BoxState.WAITLIST;
  }

  get waitlistPosition(): number | null {
    if (this.waitlist.length === 0) return null;

    return Math.min(...this.waitlist.map((entry) => entry.position));
  }
}
