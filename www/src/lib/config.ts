export const config = {
  pbUrl: import.meta.env.DEV
    ? "http://127.0.0.1:8090"
    : import.meta.env.PUBLIC_PB_URL,
} as const;
