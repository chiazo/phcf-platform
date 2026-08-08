import { useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";

import Button from "@mui/material/Button";

import {
  currentUser,
  getMemberSnapshot,
  getMemberWorkFormula,
  isAdmin,
  newFormUpdate,
  updateMemberSnapshotDirect,
  updatePronouns,
} from "../lib/pocketbase";

import MemberSnapshot from "../models/MemberSnapshot";

import {
  DueState,
  MemberRole,
  MemberState,
  MemberType,
  PaymentType,
  VOLUNTEER_INTEREST_EMOJIS,
  VOLUNTEER_INTEREST_OPTIONS,
  emailPattern,
  phonePattern,
} from "../models/enums";

interface IFormInput {
  //personal_info
  firstName: string;
  lastName: string;
  pronouns: string;
  primaryEmail: string;
  primaryPhoneNumber: string;
  line1: string;
  city: string;
  zipCode: string;
  //member_info
  memberType: MemberType;
  memberState: MemberState;
  memberRole: MemberRole;
  amountPaid: number;
  paymentType: PaymentType;
  duesPaidAt: string;
  meetingsCompleted: number;
  //box_info
  dueState: DueState;
  volunteerInterests?: string[];
  volunteerInterestOther?: string;
  volunteerInterestOtherSelected?: boolean;
}

function toDateInputValue(unixSeconds: number | undefined): string {
  const date = unixSeconds ? new Date(unixSeconds * 1000) : new Date();
  return date.toISOString().split("T")[0]; // "YYYY-MM-DD"
}

function normalizeCheckboxValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value === "string") {
    return [value];
  }

  return [];
}

export default function MemberSnapshotPage() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<MemberSnapshot | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [workFormula, setWorkFormula] = useState<Record<string, any> | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<IFormInput>();

  async function refreshMember() {
    if (!id) return Promise.resolve();

    return getMemberSnapshot(id)
      .then((raw) => {
        if (!raw) {
          console.error("could not find specific");
          setNotFound(true);
          return;
        }

        getMemberWorkFormula(raw)
          .then((result) => {
            setWorkFormula(result);
          })
          .catch((err) => {
            console.error("issues with fetching work formula:", err);
          });

        setMember(new MemberSnapshot(raw as any));
      })
      .catch((err) => {
        console.error("member snapshot fetch error:", err);
        setNotFound(true);
      });
  }

  useEffect(() => {
    refreshMember();
  }, [id]);

  useEffect(() => {
    if (member) {
      document.title = "PHCF Platform";
    }
  }, [member]);

  if (notFound) return <p>Not found</p>;
  if (!member) return <p>Loading…</p>;

  const { notes, updated, updatedBy, memberId, personalInfo, memberInfo } =
    member as any;

  const isOwnPendingSubmission =
    updatedBy === currentUser()?.name && !isAdmin();

  const { orientationDate } = memberInfo;

  const { firstName, lastName, pronouns, address, emailInfo, phoneInfo } =
    personalInfo;

  const { city, line1, zipCode } = address;
  const { onMailingList, primaryEmail } = emailInfo;
  const { primaryPhoneNumber } = phoneInfo;

  const { dues, memberState, memberRole, memberType, requirements } =
    memberInfo;

  const { amountPaid = 0, dueState = "", paymentType = "", duesPaidAt } = dues;

  const {
    serviceRequirements = [],
    volunteerInterests = [],
    meetingsCompleted = 0,
    meetingsRequired = 0,
    serviceHoursRequired = 0,
  } = requirements;
  const customVolunteerInterest =
    volunteerInterests.find(
      (interest: string) =>
        interest.startsWith("Other:") ||
        !VOLUNTEER_INTEREST_OPTIONS.includes(interest as any),
    ) ?? "";
  const customVolunteerInterestText =
    customVolunteerInterest === "Other"
      ? ""
      : customVolunteerInterest.replace(/^Other:\s*/, "").trim();

  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    //check all of the inputs
    //if any are incorrect check add it to the patch
    if (!editMode) {
      setEditMode(true);
      return; // first click just enters edit mode, don't process the form yet
    }

    setSubmitMessage(null);
    let hadError = false;

    if (!isAdmin() && data.pronouns !== pronouns) {
      const newPersonalData = {
        address: {
          city: city,
          line1: line1,
          line2: "",
          zipCode: zipCode,
        },
        emailInfo: {
          onMailingList: true,
          primaryEmail: primaryEmail,
          secondaryEmail: "",
        },
        firstName: firstName,
        lastName: lastName,
        phoneInfo: {
          primaryPhoneNumber: primaryPhoneNumber,
          secondaryPhoneNumber: "",
        },
        pronouns: `${data.pronouns}`,
      };

      const newPersonalInfo = JSON.stringify(newPersonalData);

      await updatePronouns(member, newPersonalInfo).catch((err) => {
        console.error("error in updating pronouns: ", err);
        hadError = true;
      });
    }

    const needsApprovalPersonal = {
      address: {
        city: `${data.city}`,
        line1: `${data.line1}`,
        line2: "",
        zipCode: `${data.zipCode}`,
      },
      emailInfo: {
        onMailingList: true,
        primaryEmail: `${data.primaryEmail}`,
        secondaryEmail: "",
      },
      firstName: `${data.firstName}`,
      lastName: `${data.lastName}`,
      phoneInfo: {
        primaryPhoneNumber: `${data.primaryPhoneNumber}`,
        secondaryPhoneNumber: "",
      },
      pronouns: `${data.pronouns}`,
    };

    const needsApprovalMember = {
      dues: {
        amountPaid: `${data.amountPaid}`,
        dueState: data.dueState,
        duesPaidAt: Math.floor(new Date(data.duesPaidAt).getTime() / 1000),
        paymentType: `${data.paymentType}`,
      },
      memberState: data.memberState,
      memberType: `${data.memberType}`,
      orientationDate: orientationDate,
      requirements: {
        meetingsCompleted: `${data.meetingsCompleted}`,
        meetingsRequired: meetingsRequired,
        serviceHoursRequired: serviceHoursRequired,
        serviceRequirements: serviceRequirements,
        volunteerInterests: [
          ...normalizeCheckboxValues(data.volunteerInterests),
          ...(data.volunteerInterestOtherSelected ||
          data.volunteerInterestOther?.trim()
            ? [
                data.volunteerInterestOther?.trim()
                  ? `Other: ${data.volunteerInterestOther.trim()}`
                  : "Other",
              ]
            : []),
        ],
      },
      role: `${data.memberRole}`,
    };

    if (isAdmin()) {
      await updateMemberSnapshotDirect(
        member,
        needsApprovalPersonal,
        needsApprovalMember,
      ).catch((err) => {
        console.error("error in direct member snapshot update: ", err);
        hadError = true;
      });
    } else {
      await newFormUpdate(
        member,
        JSON.stringify(needsApprovalPersonal),
        JSON.stringify(needsApprovalMember),
      ).catch((err) => {
        console.error("error in member snapshot updates: ", err);
        hadError = true;
      });
    }

    await refreshMember();

    if (!hadError) {
      setEditMode(false);
    }

    setSubmitMessage(
      hadError
        ? "Something went wrong submitting the form. Please try again."
        : isAdmin()
          ? "Snapshot was successfully updated."
          : "Form was successfully completed.",
    );
  };

  return (
    <>
      {submitMessage && (
        <p role="status" className="submit-toast">
          {submitMessage}
        </p>
      )}
      <Link to="/">← Back to Home</Link>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h1>
            {firstName} {lastName}
          </h1>

          <Button
            type="submit"
            variant="contained"
            color={editMode ? "secondary" : "primary"}
          >
            {editMode ? (isAdmin() ? "Save Changes" : "Submit Changes") : "Edit Status"}
          </Button>
        </div>
        <div className="grid">
          {/* General */}
          <section>
            <h2>General</h2>
            {isAdmin() ? (
              <p>
                <strong>Member ID</strong>
                {memberId}
              </p>
            ) : (
              <p></p>
            )}
            <p>
              <strong>First Name</strong>
              <input
                {...register("firstName")}
                defaultValue={firstName}
                disabled={!editMode}
              />
            </p>
            <p>
              <strong>Last Name</strong>
              <input
                {...register("lastName")}
                defaultValue={lastName}
                disabled={!editMode}
              />
            </p>
            <p>
              <strong>Pronouns</strong>
              <input
                {...register("pronouns")}
                defaultValue={pronouns}
                disabled={!editMode}
              />
            </p>
            <p>
              <strong>Member Role</strong>
              <select
                {...register("memberRole")}
                defaultValue={memberRole}
                disabled={!editMode}
              >
                {Object.values(MemberRole)
                  .filter(
                    (role) =>
                      role !== MemberRole.PENDING &&
                      role !== MemberRole.INVALID,
                  )
                  .map((role) => (
                    <option
                      key={role}
                      value={role}
                      disabled={isOwnPendingSubmission && role === memberRole}
                    >
                      {isOwnPendingSubmission && role === memberRole
                        ? `PENDING (${role.replace(/_/g, " ")})`
                        : role.replace(/_/g, " ")}
                    </option>
                  ))}
              </select>
            </p>

            <p>
              <strong>Member Type</strong>
              <select
                {...register("memberType")}
                defaultValue={memberType}
                disabled={!editMode}
              >
                {Object.values(MemberType)
                  .filter((type) => type !== MemberType.PENDING)
                  .map((type) => (
                    <option
                      key={type}
                      value={type}
                      disabled={isOwnPendingSubmission && type === memberType}
                    >
                      {isOwnPendingSubmission && type === memberType
                        ? `PENDING (${type})`
                        : type}
                    </option>
                  ))}
              </select>
            </p>
            <p>
              <strong>Status</strong>
              <select
                {...register("memberState")}
                defaultValue={memberState}
                disabled={!editMode}
              >
                {Object.values(MemberState)
                  .filter((state) => state !== MemberState.PENDING)
                  .map((state) => (
                    <option
                      key={state}
                      value={state}
                      disabled={isOwnPendingSubmission && state === memberState}
                    >
                      {isOwnPendingSubmission && state === memberState
                        ? `PENDING (${state})`
                        : state}
                    </option>
                  ))}
              </select>
            </p>
          </section>
          {/* Contact */}
          <section>
            <h2>Contact</h2>

            <p>
              <strong>Email</strong>
              <input
                {...register("primaryEmail", {
                  pattern: {
                    value: emailPattern,
                    message: "Invalid email address",
                  },
                })}
                defaultValue={primaryEmail}
                disabled={!editMode}
              />
              {errors.primaryEmail && (
                <span style={{ color: "red" }}>
                  {errors.primaryEmail.message}
                </span>
              )}
            </p>
            <p>
              <strong>Phone</strong>
              <input
                {...register("primaryPhoneNumber", {
                  pattern: {
                    value: phonePattern,
                    message: "Invalid phone number",
                  },
                })}
                defaultValue={primaryPhoneNumber}
                disabled={!editMode}
              />
              {errors.primaryPhoneNumber && (
                <span style={{ color: "red" }}>
                  {errors.primaryPhoneNumber.message}
                </span>
              )}
            </p>
            <p>
              <strong>Mailing List</strong>
              {onMailingList ? "Yes" : "No"}
            </p>

            <p>
              <strong>Street</strong>
              <input
                {...register("line1")}
                defaultValue={line1}
                disabled={!editMode}
              />
            </p>
            <p>
              <strong>City</strong>
              <input
                {...register("city")}
                defaultValue={city}
                disabled={!editMode}
              />
            </p>
            <p>
              <strong>Zip Code</strong>
              <input
                {...register("zipCode")}
                defaultValue={zipCode}
                disabled={!editMode}
              />
            </p>
          </section>

          {/* Dues */}
          <section>
            <h2>Dues</h2>

            <p>
              <strong>Status</strong>
              <select
                {...register("dueState")}
                defaultValue={dueState}
                disabled={!editMode}
              >
                {Object.values(DueState)
                  .filter((state) => state !== DueState.PENDING)
                  .map((state) => (
                    <option
                      key={state}
                      value={state}
                      disabled={isOwnPendingSubmission && state === dueState}
                    >
                      {isOwnPendingSubmission && state === dueState
                        ? `PENDING (${state})`
                        : state}
                    </option>
                  ))}
              </select>
            </p>
            <p>
              <strong>Amount Paid</strong>
              <input
                {...register("amountPaid")}
                defaultValue={amountPaid}
                disabled={!editMode}
              />
            </p>
            <p>
              <strong>Payment Type</strong>
              <select
                {...register("paymentType")}
                defaultValue={paymentType}
                disabled={!editMode}
              >
                {Object.values(PaymentType).map((type) => (
                  <option key={type} value={type}>
                    {type.toUpperCase()}
                  </option>
                ))}
              </select>
            </p>
            <p>
              <strong>Paid At</strong>
              <input
                type="date"
                {...register("duesPaidAt")}
                defaultValue={toDateInputValue(duesPaidAt)}
                disabled={!editMode}
              />
            </p>
          </section>

          {/* Membership */}
          <section>
            <h2>Membership</h2>

            <p>
              <strong>Orientation</strong>
              {new Date(orientationDate * 1000).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <p>
              <strong>Meetings Completed</strong>
              <input
                id="meetingsInput"
                {...register("meetingsCompleted")}
                defaultValue={meetingsCompleted}
                disabled={!editMode}
              />{" "}
              / {meetingsRequired}
            </p>
          </section>

          {/* Volunteer Interests */}
          <section className="full">
            <fieldset className="checkbox-fieldset">
              <legend>
                All members are asked to volunteer time toward the garden's
                maintenance. How are you most looking forward to helping in the
                garden?
              </legend>
              {VOLUNTEER_INTEREST_OPTIONS.map((option) => (
                <label className="checkbox-row" key={option}>
                  <input
                    {...register("volunteerInterests")}
                    defaultChecked={volunteerInterests.includes(option)}
                    disabled={!editMode}
                    type="checkbox"
                    value={option}
                  />
                  {VOLUNTEER_INTEREST_EMOJIS[option]} {option}
                </label>
              ))}
              <label className="checkbox-row other-checkbox-row">
                <input
                  {...register("volunteerInterestOtherSelected")}
                  defaultChecked={Boolean(customVolunteerInterest)}
                  disabled={!editMode}
                  type="checkbox"
                />
                Other:
                <input
                  {...register("volunteerInterestOther")}
                  aria-label="Other volunteer interest"
                  defaultValue={customVolunteerInterestText}
                  disabled={!editMode}
                  type="text"
                />
              </label>
            </fieldset>
          </section>

          {/* Service Requirements */}
          <section className="full">
            <h2>Service Requirements</h2>

            {serviceRequirements.length ? (
              <ul>
                {serviceRequirements.map((service: any, i: number) => (
                  <li key={i}>
                    {service.workFormulaId && (
                      <>
                        <strong>{service.workFormulaId}</strong> —{" "}
                      </>
                    )}
                    {service.hoursCompleted} hours
                  </li>
                ))}
              </ul>
            ) : (
              <p>No service requirements recorded.</p>
            )}
          </section>

          {/* Notes */}
          <section className="full">
            <h2>Notes</h2>

            <p>{notes || "No notes."}</p>

            <hr />

            <p>
              <strong>Last Updated</strong>
              {updated}
            </p>

            <p>
              <strong>Updated By</strong>
              {updatedBy}
            </p>
          </section>
        </div>
      </form>
    </>
  );
}
