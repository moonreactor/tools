.PHONY: build up youtube-cookies restart

COOKIES_FILE := cookies/youtube.txt

build:
	docker compose build

up:
	@if [ ! -s "$(COOKIES_FILE)" ]; then \
		echo "Cookies de YouTube no encontradas, sincronizando..."; \
		./scripts/sync-youtube-cookies.sh; \
	fi
	docker compose up -d

youtube-cookies:
	@./scripts/sync-youtube-cookies.sh

restart:
	docker compose restart backend
