import BaseModel from "./BaseModel";

export class Address extends BaseModel<any> {
  line1?: string;
  city?: string;
  zipCode?: string;

  constructor(data: any = {}) {
    super(data);

    this.line1 = data.line1;
    this.city = data.city;
    this.zipCode = data.zipCode;
  }
}

export class EmailInfo extends BaseModel<any> {
  primaryEmail?: string;
  onMailingList?: boolean;

  constructor(data: any = {}) {
    super(data);

    this.primaryEmail = data.primaryEmail;
    this.onMailingList = data.onMailingList;
  }
}

export class PhoneInfo extends BaseModel<any> {
  primaryPhoneNumber?: string;

  constructor(data: any = {}) {
    super(data);

    this.primaryPhoneNumber = data.primaryPhoneNumber;
  }
}

export class PersonalInfo extends BaseModel<any> {
  firstName?: string;
  lastName?: string;

  address: Address;
  emailInfo: EmailInfo;
  phoneInfo: PhoneInfo;

  constructor(data: any = {}) {
    super(data);

    this.firstName = data.firstName;
    this.lastName = data.lastName;

    this.address = new Address(data.address ?? {});
    this.emailInfo = new EmailInfo(data.emailInfo ?? {});
    this.phoneInfo = new PhoneInfo(data.phoneInfo ?? {});
  }

  get fullName(): string {
    return `${this.firstName ?? ""} ${this.lastName ?? ""}`.trim();
  }
}
