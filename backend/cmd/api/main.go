package main

import (
	"log"

	"aisumly/backend/internal/app"
	"aisumly/backend/internal/config"
)

func main() {
	cfg := config.Load()
	server, err := app.NewServer(cfg)
	if err != nil {
		log.Fatalf("new server failed: %v", err)
	}
	if err := server.Run(); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}
