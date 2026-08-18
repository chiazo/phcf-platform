import { useEffect, useState } from "react";

import {
  listServiceHourRates,
  updateServiceHourRate,
  ServiceHourRate,
} from "../lib/pocketbase";

const categoryLabels: Record<string, string> = {
  GOOD_STANDING: "Good Standing",
  BOARD: "Board",
  EMERITUS: "Emeritus",
  SENIOR: "Senior",
  NEW: "New",
};

export default function AdminServiceHourRates() {
  const [rates, setRates] = useState<ServiceHourRate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    listServiceHourRates()
      .then((items) => {
        setRates(items);
        setDrafts(
          Object.fromEntries(items.map((r) => [r.id, String(r.percentage)])),
        );
        setLoadError(null);
      })
      .catch((err) => {
        console.error("Rate fetch error:", err);
        setLoadError("Could not load service hour rates.");
      });
  }, []);

  async function handleSave(rate: ServiceHourRate) {
    const value = Number(drafts[rate.id]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setLoadError("Percentage must be a number between 0 and 100.");
      return;
    }

    setSavingId(rate.id);
    setLoadError(null);
    setSuccessMsg(null);
    try {
      await updateServiceHourRate(rate.id, value);
      setRates((prev) =>
        prev.map((r) => (r.id === rate.id ? { ...r, percentage: value } : r)),
      );
      setSuccessMsg(
        `${categoryLabels[rate.category] ?? rate.category} updated.`,
      );
    } catch (err) {
      console.error("Rate save error:", err);
      setLoadError("Could not save that rate.");
    } finally {
      setSavingId(null);
    }
  }

  if (loadError && rates.length === 0) {
    return <p className="error">{loadError}</p>;
  }

  return (
    <section className="admin-service-hour-rates">
      <h2>Service Hour Requirements by Category</h2>
      <p className="muted">
        Board status is based on each member's role and doesn't need to be set
        here.
      </p>

      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Percentage Required</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rates.map((rate) => (
            <tr key={rate.id}>
              <td>{categoryLabels[rate.category] ?? rate.category}</td>
              <td>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={drafts[rate.id] ?? ""}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [rate.id]: e.target.value,
                    }))
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => handleSave(rate)}
                  disabled={savingId === rate.id}
                >
                  Save
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {loadError && rates.length > 0 && <p className="error">{loadError}</p>}
      {successMsg && <p className="muted">{successMsg}</p>}
    </section>
  );
}
