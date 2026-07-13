import BaseModel from "./BaseModel";
import MemberInfo from "./MemberInfo";
import { PersonalInfo } from "./PersonalInfo";
import { BoxInfo } from "./BoxInfo";

import type { MemberSnapshotDTO } from "./contracts/MemberSnapshot.types";

export default class MemberSnapshot extends BaseModel<MemberSnapshotDTO> {
  // Explicit fields (fixes TS "property does not exist" errors)
  notes?: string;
  updated?: string | Date;
  updatedBy?: string;
  memberId?: string;

  personalInfo: PersonalInfo;
  memberInfo: MemberInfo;
  boxInfo: BoxInfo;

  constructor(data: MemberSnapshotDTO) {
    super(data);

    // snake_case → camelCase mapping
    this.memberId = data.member_id;
    this.updatedBy = data.updated_by;

    this.personalInfo = new PersonalInfo(data.personal_info);
    this.memberInfo = new MemberInfo(data.member_info);
    this.boxInfo = new BoxInfo(data.box_info);
  }

  // -----------------------------
  // Derived getters (safe access)
  // -----------------------------

  get fullName(): string {
    return this.personalInfo.fullName;
  }

  get isActive(): boolean {
    return this.memberInfo.isActive;
  }

  get createdDate(): Date | null {
    const value = this.data.created;

    if (!value) return null;

    return new Date(value);
  }

  get updatedDate(): Date | null {
    const value = this.data.updated;

    if (!value) return null;

    return new Date(value);
  }

  // Optional safe passthroughs
  get notesValue(): string | undefined {
    return this.data.notes;
  }
}
