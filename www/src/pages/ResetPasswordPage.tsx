import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { confirmPasswordReset } from "../lib/pocketbase";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const passwordConfirm = String(form.get("passwordConfirm") ?? "");

    if (password !== passwordConfirm) {
      setError("The passwords do not match.");
      setIsSubmitting(false);
      return;
    }

    try {
      await confirmPasswordReset(token, password, passwordConfirm);
      navigate("/login");
    } catch (err) {
      console.error("password reset confirmation error:", err);
      setError("We could not reset your password. The link may be expired.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-panel">
      <Link to="/login">← Back to Login</Link>
      <h1>Choose New Password</h1>

      {!token ? (
        <p className="error">This reset link is missing its token.</p>
      ) : (
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            New password
            <input
              autoComplete="new-password"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>

          <label>
            Confirm password
            <input
              autoComplete="new-password"
              minLength={8}
              name="passwordConfirm"
              required
              type="password"
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Saving..." : "Reset password"}
          </button>
        </form>
      )}
    </section>
  );
}
