.PHONY: check
check: vendor/.ok un.go
	go build -v -o /dev/null .

vendor/.ok: Gopkg.lock Gopkg.toml
	dep ensure -v -vendor-only
