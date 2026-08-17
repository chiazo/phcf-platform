import { useEffect, useState } from "react";
import { listVolunteerInterests, VolunteerInterest } from "../lib/pocketbase";

export function useVolunteerInterests() {
  const [interests, setInterests] = useState<VolunteerInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listVolunteerInterests()
      .then((items) => {
        setInterests(items);
        setError(null);
      })
      .catch((err) => {
        console.error("Volunteer interests fetch error:", err);
        setError("Could not load volunteer interests.");
      })
      .finally(() => setLoading(false));
  }, []);

  return { interests, loading, error };
}
