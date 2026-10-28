.PHONY: build up down youtube-cookies restart dev

COOKIES_FILE := cookies/youtube.txt

build:
	docker compose build

up:
	@if [ ! -s "$(COOKIES_FILE)" ]; then \
		echo "Cookies de YouTube no encontradas, sincronizando..."; \
		./scripts/sync-youtube-cookies.sh; \
	fi
	docker compose up -d

# Hot reload: code changes apply without rebuild
dev:
	@if [ ! -s "$(COOKIES_FILE)" ]; then \
		echo "Cookies de YouTube no encontradas, sincronizando..."; \
		./scripts/sync-youtube-cookies.sh; \
	fi
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

down:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down

youtube-cookies:
	@./scripts/sync-youtube-cookies.sh

restart:
	docker compose restart backend

.PHONY: git-local
git-local:
	@./scripts/git-local.sh
