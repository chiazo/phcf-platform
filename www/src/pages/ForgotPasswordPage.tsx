import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { requestPasswordReset } from "../lib/pocketbase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSent(false);
    setIsSubmitting(true);

    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      console.error("password reset request error:", err);
      setError("We could not send a password reset email for that address.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-panel">
      <Link to="/login">← Back to Login</Link>
      <h1>Reset Password</h1>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            autoComplete="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>

        {sent && (
          <p className="success">
            If that email is registered, you will receive an email with a link
            to reset your password.
          </p>
        )}
        {error && <p className="error">{error}</p>}

        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Sending..." : "Send reset link"}
        </button>
      </form>
    </section>
  );
}
