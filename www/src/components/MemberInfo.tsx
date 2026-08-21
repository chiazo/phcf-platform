import { updateAcceptRequest, updateDenyRequest } from "../lib/pocketbase";

export default function MemberInfo({
  member,
  onActionComplete,
}: {
  member: Record<string, any>;
  onActionComplete?: () => void;
}) {
  function closeModal() {
    const modal = document.getElementById("myModal");
    if (modal) {
      modal.style.display = "none";
    }
    onActionComplete?.();
  }

  async function handleAccept(singleMember: Record<string, any>) {
    await updateAcceptRequest(singleMember);
    onActionComplete?.();
  }

  async function handleDelete(singleMember: Record<string, any>) {
    await updateDenyRequest(singleMember);
    onActionComplete?.();
  }

  function formatList(values: unknown) {
    return Array.isArray(values) && values.length ? values.join(", ") : "—";
  }

  function toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatDateFromSeconds(value: unknown) {
    const seconds = toNumber(value);
    if (!seconds) return "—";

    return new Date(seconds * 1000).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const personalInfo = member.personal_info ?? {};
  const memberInfo = member.member_info ?? {};
  const requirements = memberInfo.requirements ?? {};
  const address = personalInfo.address ?? {};
  const emailInfo = personalInfo.emailInfo ?? {};
  const phoneInfo = personalInfo.phoneInfo ?? {};
  const fullName =
    `${personalInfo.firstName ?? ""} ${personalInfo.lastName ?? ""}`.trim() ||
    "—";

  return (
    <div id="myModal" className="modal">
      <div className="modal-content">
        <span className="close" onClick={closeModal}>
          &times;
        </span>
        <div className="modal-table-wrapper">
          <section>
            <h2> {fullName} Info</h2>
            <table>
              <tbody>
                <tr>
                  <th>Full Name</th>
                  <td>{fullName}</td>
                </tr>
                <tr>
                  <th>Pronouns</th>
                  <td>{personalInfo.pronouns || "—"}</td>
                </tr>
                <tr>
                  <th>Email</th>
                  <td>{emailInfo.primaryEmail || "—"}</td>
                </tr>
                <tr>
                  <th>Phone</th>
                  <td>{phoneInfo.primaryPhoneNumber || "—"}</td>
                </tr>
                <tr>
                  <th>Address</th>
                  <td>
                    {[address.line1, address.city, address.zipCode]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                </tr>
                <tr>
                  <th>Mailing List</th>
                  <td>{emailInfo.onMailingList ? "Yes" : "No"}</td>
                </tr>
                <tr>
                  <th>Member Type</th>
                  <td>{memberInfo.memberType || "—"}</td>
                </tr>
                <tr>
                  <th>Status</th>
                  <td>{memberInfo.memberState || "—"}</td>
                </tr>
                <tr>
                  <th>Orientation</th>
                  <td>{formatDateFromSeconds(memberInfo.orientationDate)}</td>
                </tr>
                <tr>
                  <th>Volunteer Interests</th>
                  <td>{formatList(requirements.volunteerInterests)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
