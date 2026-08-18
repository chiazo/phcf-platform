import { ChangeEvent, FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { phonePattern } from "../models/enums";
import { registerFarmMember } from "../lib/pocketbase";
import { useVolunteerInterests } from "../lib/form";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pronounsSelection, setPronounsSelection] = useState("");
  const [phone, setPhone] = useState("");

  const { interests: volunteerInterestOptions, loading: interestsLoading } =
    useVolunteerInterests();

  function formatPhoneNumber(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 10);

    if (digits.length <= 3) {
      return digits;
    }

    if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }

    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function handlePhoneChange(event: ChangeEvent<HTMLInputElement>) {
    setPhone(formatPhoneNumber(event.target.value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const pronouns =
      pronounsSelection === "other"
        ? String(form.get("pronounsOther") ?? "").trim()
        : pronounsSelection;
    const orientationDate = String(form.get("orientationDate") ?? "");
    const volunteerInterests = form
      .getAll("volunteerInterests")
      .map((value) => String(value));
    const otherVolunteerInterest = String(
      form.get("volunteerInterestOther") ?? "",
    ).trim();

    if (
      form.get("volunteerInterestOtherSelected") === "on" ||
      otherVolunteerInterest
    ) {
      volunteerInterests.push(
        otherVolunteerInterest ? `Other: ${otherVolunteerInterest}` : "Other",
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }

    if (phone && !phonePattern.test(phone)) {
      setError("Enter a valid phone number.");
      return;
    }

    if (
      !orientationDate ||
      Number.isNaN(new Date(`${orientationDate}T00:00:00`).getTime())
    ) {
      setError("Enter a valid orientation date.");
      return;
    }

    setIsSubmitting(true);

    try {
      await registerFarmMember({
        email,
        password: String(form.get("password") ?? ""),
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        pronouns,
        orientationDate,
        phone: phone,
        addressLine1: String(form.get("addressLine1") ?? ""),
        city: String(form.get("city") ?? ""),
        zipCode: String(form.get("zipCode") ?? ""),
        onMailingList: form.get("onMailingList") === "on",
        volunteerInterests,
        // created_at: new Date(),
        // modified_at: new Date(),
      });

      navigate("/");
    } catch (err) {
      console.error("member registration error:", err);
      setError(
        "We could not create that member account. Check that the email is not already registered.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-panel">
      <Link to="/">← Back to Home</Link>
      <h1>Register</h1>

      <form className="form-grid two-column" onSubmit={handleSubmit}>
        <label>
          First name
          <input name="firstName" required type="text" />
        </label>

        <label>
          Last name
          <input name="lastName" required type="text" />
        </label>

        <label>
          Email
          <input
            autoComplete="email"
            name="email"
            pattern="^[^\s@]+@[^\s@]+\.[^\s@]+$"
            required
            type="email"
          />
        </label>

        <label>
          Password
          <input
            autoComplete="new-password"
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>

        <label>
          Pronouns
          <select
            name="pronouns"
            onChange={(event) => setPronounsSelection(event.target.value)}
            value={pronounsSelection}
          >
            <option value="">Select pronouns</option>
            <option value="he/him">he/him</option>
            <option value="she/her">she/her</option>
            <option value="they/them">they/them</option>
            <option value="other">other</option>
          </select>
        </label>

        {pronounsSelection === "other" && (
          <label>
            Other pronouns
            <input name="pronounsOther" required type="text" />
          </label>
        )}

        <label>
          Orientation date
          <input name="orientationDate" required type="date" />
        </label>

        <label>
          Phone Number
          <input
            autoComplete="tel"
            name="phone"
            onChange={handlePhoneChange}
            type="tel"
            pattern="^\+?[0-9\s\-().]{7,20}$"
            value={phone}
          />
        </label>

        <label className="full-width">
          Address
          <input
            autoComplete="street-address"
            name="addressLine1"
            type="text"
          />
        </label>

        <label>
          City
          <input autoComplete="address-level2" name="city" type="text" />
        </label>

        <label>
          ZIP code
          <input autoComplete="postal-code" name="zipCode" type="text" />
        </label>

        <label className="checkbox-row full-width">
          <input name="onMailingList" required type="checkbox" />
          Join the mailing list
        </label>
        <p className="mailing-list-note full-width">
          Please acknowledge that you will be added to the email listserv, which
          is the primary means of communication for the garden and that you must
          accept the invitation you will receive to complete the process.
          Failure to do so may impact your ability to be "in the know" and
          therefore learn of fun garden events and complete your membership
          requirements.
        </p>

        <fieldset className="checkbox-fieldset full-width">
          <legend>
            All members are asked to volunteer time toward the garden's
            maintenance. How are you most looking forward to helping in the
            garden?
          </legend>
          {interestsLoading ? (
            <p className="muted">Loading volunteer interests…</p>
          ) : (
            volunteerInterestOptions.map((option) => (
              <label className="checkbox-row" key={option.id}>
                <input
                  name="volunteerInterests"
                  type="checkbox"
                  value={option.label}
                />
                {option.emoji} {option.label}
              </label>
            ))
          )}
          <label className="checkbox-row other-checkbox-row">
            <input name="volunteerInterestOtherSelected" type="checkbox" />
            Other:
            <input
              aria-label="Other volunteer interest"
              name="volunteerInterestOther"
              type="text"
            />
          </label>
        </fieldset>

        {error && <p className="error full-width">{error}</p>}

        <button className="full-width" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Creating account..." : "Create member account"}
        </button>
      </form>

      <p className="muted">
        Already registered? <Link to="/login">Log in</Link>.
      </p>
    </section>
  );
}
