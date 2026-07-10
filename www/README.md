# www

React + Vite frontend for the member portal. Talks directly to PocketBase from the browser via the `pocketbase` SDK (see `src/lib/pocketbase.ts`); routing is client-side via `react-router-dom`.

## Project Structure

```text
/
├── public/
│   └── favicon.svg
├── src
│   ├── lib
│   │   ├── config.ts        # env-driven PocketBase URL
│   │   └── pocketbase.ts    # PocketBase client + queries
│   ├── models              # DTO -> view-model classes
│   ├── pages
│   │   ├── MembersPage.tsx
│   │   └── MemberSnapshotPage.tsx
│   ├── styles/global.css
│   ├── App.tsx              # routes
│   └── main.tsx             # entry point
└── package.json
```

## Commands

| Command             | Action                                    |
| :------------------- | :----------------------------------------- |
| `npm install`        | Installs dependencies                      |
| `npm run dev`        | Starts local dev server at `localhost:4321`|
| `npm run build`      | Build production assets to `./dist/`       |
| `npm run preview`    | Preview the build locally                  |
| `npm run typecheck`  | Run `tsc --noEmit`                         |

In production, `server/main.go` serves `dist/` as static files and falls back to `dist/index.html` for unknown paths so client-side routes resolve on direct load/refresh.
