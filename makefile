VERSION = $(shell git rev-list --count HEAD)-$(shell git rev-parse --short HEAD)
GO = GO111MODULE=on go
TMP_DIR = $(PWD)/tmp
BIN_DIR = $(TMP_DIR)/bin

$(BIN_DIR)/uuid_ninja: vendor/.ok $(wildcard *.go)
	$(GO) build -o $@ .

vendor/.ok: go.mod
	$(GO) mod vendor
	touch $@

clean:
	rm -rf vendor

.PHONY: version
version:
	@echo $(VERSION)

.SHELL = /bin/sh

.PHONY: image_name
GCP_PROJECT_ID = uuidninja
image_name:
	@printf gcr.io/uuidninja/main:$(VERSION)
