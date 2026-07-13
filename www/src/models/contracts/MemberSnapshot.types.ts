export interface MemberSnapshotDTO {
  id: string;

  notes?: string;
  updated?: string;
  updated_by?: string;
  member_id?: string;

  created?: string;

  personal_info: {
    firstName: string;
    lastName: string;
    pronouns?: string;

    address: {
      line1: string;
      city: string;
      zipCode: string;
    };

    emailInfo: {
      primaryEmail: string;
      onMailingList: boolean;
    };

    phoneInfo: {
      primaryPhoneNumber: string;
    };
  };

  member_info: {
    orientationDate: string;

    memberState: string;
    role: string;
    memberType: string;

    dues: {
      amountPaid: number;
      dueState: string;
      paymentType: string;
      duesPaidAt: string;
    };

    requirements: {
      meetingsCompleted: number;
      meetingsRequired: number;

      serviceRequirements: Array<{
        workFormulaId?: string;
        hoursCompleted: number;
      }>;
    };
  };

  box_info?: unknown; // keep flexible unless you fully define it
}
