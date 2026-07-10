package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func main() {
	app := pocketbase.New()

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		const distDir = "dist"

		se.Router.BindFunc(func(e *core.RequestEvent) error {
			p := e.Request.URL.Path

			if strings.HasPrefix(p, "/api/") ||
				strings.HasPrefix(p, "/_/") ||
				strings.HasPrefix(p, "/pb_") {
				return e.Next()
			}

			// Serve the file if it exists on disk (JS/CSS/assets); otherwise
			// fall back to index.html so client-side routes (e.g. /snapshot/:id)
			// resolve correctly on direct load/refresh.
			requested := filepath.Join(distDir, filepath.Clean(p))

			if info, err := os.Stat(requested); err == nil && !info.IsDir() {
				http.ServeFile(e.Response, e.Request, requested)
				return nil
			}

			http.ServeFile(e.Response, e.Request, filepath.Join(distDir, "index.html"))
			return nil
		})

		return se.Next()
	})

	// Only default to "serve" with Cloud Run's PORT when no explicit
	// command was passed (e.g. plain `docker run image` with no args).
	// This lets admin commands like `superuser upsert` pass through untouched.
	if len(os.Args) == 1 {
		port := os.Getenv("PORT")
		if port == "" {
			port = "8080"
		}

		app.RootCmd.SetArgs([]string{
			"serve",
			"--http=0.0.0.0:" + port,
		})
	}

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
