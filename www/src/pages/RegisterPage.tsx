import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { registerFarmMember } from "../lib/pocketbase";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pronounsSelection, setPronounsSelection] = useState("");

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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
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
        phone: String(form.get("phone") ?? ""),
        addressLine1: String(form.get("addressLine1") ?? ""),
        city: String(form.get("city") ?? ""),
        zipCode: String(form.get("zipCode") ?? ""),
        onMailingList: form.get("onMailingList") === "on",
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
      <Link to="/">← Back to Members</Link>
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
          Phone
          <input autoComplete="tel" name="phone" type="tel" />
        </label>

        <label className="full-width">
          Address
          <input autoComplete="street-address" name="addressLine1" type="text" />
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
          <input name="onMailingList" type="checkbox" />
          Join the mailing list
        </label>

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
