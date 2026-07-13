import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getMemberSnapshot } from "../lib/pocketbase";
import MemberSnapshot from "../models/MemberSnapshot";

export default function MemberSnapshotPage() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<MemberSnapshot | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;

    getMemberSnapshot(id)
      .then((raw) => {
        if (!raw) {
          console.error("could not find specific")
          setNotFound(true);
          return;
        }

        setMember(new MemberSnapshot(raw as any));
      })
      .catch((err) => {
        console.error("member snapshot fetch error:", err);
        setNotFound(true);
      });
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

  const { dues, memberState, role, memberType, requirements } = memberInfo;

  const { amountPaid = 0, dueState = "", paymentType = "", duesPaidAt } = dues;

  const {
    serviceRequirements = [],
    meetingsCompleted = 0,
    meetingsRequired = 0,
  } = requirements;

  return (
    <>
      <Link to="/">← Back to Members</Link>

      <h1>
        {firstName} {lastName}
      </h1>

      <div className="grid">
        {/* General */}
        <section>
          <h2>General</h2>

          <p>
            <strong>Member ID</strong>
            {memberId}
          </p>
          <p>
            <strong>Pronouns</strong>
            {pronouns}
          </p>
          {role !== "ROLE_INVALID" && (
            <p>
              <strong>Role</strong>
              {role}
            </p>
          )}
          <p>
            <strong>Member Type</strong>
            {memberType}
          </p>
          <p>
            <strong>Status</strong>
            {memberState}
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2>Contact</h2>

          <p>
            <strong>Email</strong>
            {primaryEmail}
          </p>
          <p>
            <strong>Phone</strong>
            {primaryPhoneNumber}
          </p>
          <p>
            <strong>Mailing List</strong>
            {onMailingList ? "Yes" : "No"}
          </p>

          <p>
            <strong>Address</strong>
            {line1}
            <br />
            {city}, {zipCode}
          </p>
        </section>

        {/* Dues */}
        <section>
          <h2>Dues</h2>

          <p>
            <strong>Status</strong>
            {dueState}
          </p>
          <p>
            <strong>Amount Paid</strong>${amountPaid}
          </p>
          <p>
            <strong>Payment Type</strong>
            {paymentType}
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
            <strong>Meetings</strong>
            {meetingsCompleted} / {meetingsRequired}
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
      </div>
    </>
  );
}
