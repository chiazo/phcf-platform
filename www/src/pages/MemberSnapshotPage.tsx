import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useForm, SubmitHandler } from "react-hook-form"

import { getMemberSnapshot, updatePronouns, newFormUpdate, getMemberWorkFormula} from "../lib/pocketbase";

import MemberSnapshot from "../models/MemberSnapshot";

import {MemberType, DueState, MemberState, PaymentType, MemberRole} from "../models/enums";
import { AuthRecord } from "pocketbase";


interface IFormInput {
  //personal_info
  firstName: string
  lastName: string
  pronouns: string
  primaryEmail: string
  primaryPhoneNumber: string
  line1: string
  city: string
  zipCode: string
  //member_info
  memberType: MemberType
  memberState: MemberState
  memberRole: MemberRole
  amountPaid: number
  paymentType: PaymentType
  meetingsCompleted: number,
  //box_info
  dueState: DueState
}

export default function MemberSnapshotPage() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<MemberSnapshot | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [isCurrentUserAdmin, setIsCurrentUserAdmin] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [workFormula, setWorkFormula] = useState<Record<string, any> | null>(null);

  const { register, handleSubmit } = useForm<IFormInput>()

  async function refreshMember() {
    if (!id) return Promise.resolve();

    return getMemberSnapshot(id)
      .then((raw) => {
        if (!raw) {
          console.error("could not find specific")
          setNotFound(true);
          return;
        }

        getMemberWorkFormula(raw)
        .then((result) => {
          setWorkFormula(result)
        })
        .catch((err) => {
          console.error("issues with fetching work formula:", err);
        })

        console.log(workFormula)

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
      document.title = `${member.personalInfo.firstName} ${member.personalInfo.lastName}`;
    }
  }, [member]);

  if (notFound) return <p>Not found</p>;
  if (!member) return <p>Loading…</p>;

  const { notes, updated, updatedBy, memberId, personalInfo, memberInfo } =
    member as any;

  const { orientationDate } = memberInfo;

  const { firstName, lastName, pronouns, address, emailInfo, phoneInfo } =
    personalInfo;

  const { city, line1, zipCode } = address;
  const { onMailingList, primaryEmail } = emailInfo;
  const { primaryPhoneNumber } = phoneInfo;

  const { dues, memberState, memberRole, memberType, requirements } = memberInfo;

  const { amountPaid = 0, dueState = "", paymentType = "", duesPaidAt } = dues;

  const {
    serviceRequirements = [],
    meetingsCompleted = 0,
    meetingsRequired = 0,
  } = requirements;

    const onSubmit: SubmitHandler<IFormInput> = (async (data) => {
     //check all of the inputs
    //if any are incorrect check add it to the patch
    setSubmitMessage(null);
    let hadError = false;

    if (data.pronouns !== pronouns){
      const newPersonalData = 
       {
      "address": {
        "city": city,
        "line1": line1,
        "line2": "",
        "zipCode": zipCode
      },
      "emailInfo": {
        "onMailingList": true,
        "primaryEmail": primaryEmail,
        "secondaryEmail": ""
      },
      "firstName": firstName,
      "lastName": lastName,
      "phoneInfo": {
        "primaryPhoneNumber": primaryPhoneNumber,
        "secondaryPhoneNumber": ""
      },
      "pronouns": `${data.pronouns}`
      }

      const newPersonalInfo = JSON.stringify(newPersonalData)

      await updatePronouns(member, newPersonalInfo)
      .catch((err) => {
        console.error("error in updating pronouns: ", err);
        hadError = true;
      })

    }
    
    const needsApprovalPersonal = 
       {
      "address": {
        "city": `${data.city}`,
        "line1": `${data.line1}`,
        "line2": "",
        "zipCode": `${data.zipCode}`
      },
      "emailInfo": {
        "onMailingList": true,
        "primaryEmail": `${data.primaryEmail}`,
        "secondaryEmail": ""
      },
      "firstName": `${data.firstName}`,
      "lastName": `${data.lastName}`,
      "phoneInfo": {
        "primaryPhoneNumber": `${data.primaryPhoneNumber}`,
        "secondaryPhoneNumber": ""
      },
      "pronouns": `${data.pronouns}`
      }

      const needsApprovalMember = 
      {
        "dues": {
          "amountPaid": `${data.amountPaid}`,
          "dueState":`${dueState}`,
          "duesPaidAt": 0,
          "paymentType": `${data.paymentType}`
        },
        "memberState": `${data.memberState}`,
        "memberType": `${data.memberType}`,
        "orientationDate": orientationDate,
        "requirements": {
          "meetingsCompleted": `${data.meetingsCompleted}`,
          "meetingsRequired": meetingsRequired,
        },
        "role": `${data.memberRole}`
      }

      await newFormUpdate(member, JSON.stringify(needsApprovalPersonal), JSON.stringify(needsApprovalMember))
      .catch((err) => {
        console.error("error in member snapshot updates: ", err);
        hadError = true;
      })

      await refreshMember();

      setSubmitMessage(
        hadError
          ? "Something went wrong submitting the form. Please try again."
          : "Form was successfully completed."
      );
  })

  return (
    <>
      {submitMessage && <p role="status" className="submit-toast">{submitMessage}</p>}
      <Link to="/">← Back to Members</Link>
      <form onSubmit={handleSubmit(onSubmit)}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>
          {firstName} {lastName}
        </h1>
      </div>
      <div className="grid">
        {/* General */}
        <section>
          <h2>General</h2>
           <p><strong>Member ID</strong>{memberId}</p>
       
          <p>
            <strong>First Name</strong>
            <input {...register("firstName")} defaultValue={firstName}/>
          </p>
          <p>
            <strong>Last Name</strong>
            <input {...register("lastName")} defaultValue={lastName}/>
          </p>
          <p>
            <strong>Pronouns</strong>
            <input {...register("pronouns")} defaultValue={pronouns}/>
          </p>
          <p>
            <strong>Role</strong>
              <select {...register("memberRole")} defaultValue={memberRole}>
                <option value="ROLE_INVALID">ROLE INVALID</option>
                <option value="PRESIDENT">PRESIDENT</option>
                <option value="VICE_PRESIDENT">VICE PRESIDENT</option>
                <option value="SECRETARY">SECRETARY</option>
                <option value="TREASURER">TREASURER</option>
              </select>
          </p>
     
          <p>
            <strong>Member Type</strong>
              <select {...register("memberType")} defaultValue={memberType}>
                <option value="GENERAL">GENERAL</option>
                <option value="ASSOCIATE">ASSOCIATE</option>
                <option value="ALUMNI">ALUMNI</option>
              </select>
          </p>
          <p>
            <strong>Status</strong>
              <select {...register("memberState")} defaultValue={memberState}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="PENDING">PENDING</option>
              </select>
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2>Contact</h2>

          <p>
            <strong>Email</strong>
            <input {...register("primaryEmail")} defaultValue={primaryEmail}/>
          </p>
          <p>
            <strong>Phone</strong>
            <input {...register("primaryPhoneNumber")} defaultValue={primaryPhoneNumber}/>
          </p>
          <p>
            <strong>Mailing List</strong>
            {onMailingList ? "Yes" : "No"}
          </p>

          <p>
            <strong>Street</strong>
            <input {...register("line1")} defaultValue={line1}/>
          </p>
          <p>
            <strong>City</strong>
            <input {...register("city")} defaultValue={city}/>
          </p>
          <p>
            <strong>Zip Code</strong>
            <input {...register("zipCode")} defaultValue={zipCode}/>
          </p>
        </section>

        {/* Dues */}
        <section>
          <h2>Dues</h2>

          <p>
            <strong>Due Status</strong>
            <select {...register("dueState")} defaultValue={dueState}>
              <option value="COMPLETE">COMPLETE</option>
              <option value="PENDING">PENDING</option>
              <option value="UNPAID">UNPAID</option>
            </select>
          </p>
          <p>
            <strong>Amount Paid</strong>
            <span className="icon">＄</span> 
            <input {...register("amountPaid")} defaultValue={amountPaid}/>
          </p>
          <p>
            <strong>Payment Type</strong>
            <select {...register("paymentType")} defaultValue={paymentType}>
              <option value="PAYMENT_TYPE_INVALID">PAYMENT_TYPE_INVALID</option>
              <option value="CASH">CASH</option>
              <option value="SQUARE">SQUARE</option>
              <option value="CREDIT">CREDIT</option>
            </select>
          </p>
          <p>
            <strong>Paid At</strong>
            {new Date(duesPaidAt * 1000).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
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
            <input id={"meetingsInput"} {...register("meetingsCompleted")} defaultValue={meetingsCompleted}/> / {meetingsRequired}
          </p>
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

      <input type="submit" value={"Submit Changes"}/>
      </div>
      </form>
    </>
  );
}
