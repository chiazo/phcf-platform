import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { registerFarmMember } from "../lib/pocketbase";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);

    try {
      await registerFarmMember({
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        pronouns: String(form.get("pronouns") ?? ""),
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
          <input autoComplete="email" name="email" required type="email" />
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
          <input name="pronouns" type="text" />
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
