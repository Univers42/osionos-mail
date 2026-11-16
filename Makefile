SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

.DEFAULT_GOAL := help

help:
	@printf 'osionos Mail targets\n\n'
	@printf '  install      Install local npm dependencies\n'
	@printf '  dev          Start the Vite dev server on port 3002\n'
	@printf '  bridge       Start the localhost Gmail bridge on port 4100\n'
	@printf '  dev-all      Start the bridge and Vite dev server together\n'
	@printf '  build        Typecheck and build the app\n'
	@printf '  docker-dev   Start the app in Docker on port 3002\n'
	@printf '  docker-down  Stop the Docker dev stack\n'

install:
	npm install

dev:
	npm run dev

bridge:
	npm run bridge

dev-all:
	npm run dev:all

build:
	npm run build

docker-dev:
	docker compose up --build

docker-down:
	docker compose down

.PHONY: help install dev bridge dev-all build docker-dev docker-down