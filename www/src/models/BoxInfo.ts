import BaseModel from "./BaseModel";
import { BoxState } from "./enums";

export class WaitlistInfo extends BaseModel<any> {
  joinedWaitlistAt?: number | string | Date;

  constructor(data: any = {}) {
    super(data);
    this.joinedWaitlistAt = data.joinedWaitlistAt;
  }

  get joinedDate(): Date | null {
    if (!this.joinedWaitlistAt) return null;

    // supports unix timestamp OR ISO string
    if (typeof this.joinedWaitlistAt === "number") {
      return new Date(this.joinedWaitlistAt * 1000);
    }

    return new Date(this.joinedWaitlistAt);
  }
}

export class BoxInfo extends BaseModel<any> {
  waitlistInfo: WaitlistInfo;
  boxState?: BoxState;

  constructor(data: any = {}) {
    super(data);

    this.boxState = data.boxState || BoxState.UNASSIGNED;
    this.waitlistInfo = new WaitlistInfo(data.waitlistInfo ?? {});
  }

  get isAssigned(): boolean {
    return this.boxState === BoxState.ASSIGNED;
  }

  get isWaitlisted(): boolean {
    return this.boxState === BoxState.WAITLIST;
  }
}
