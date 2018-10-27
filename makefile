.PHONY: check
check: vendor/.ok un.go
	go build -v -o /dev/null .

Gopkg.lock: Gopkg.toml
	dep ensure -v

vendor/.ok: Gopkg.lock
	dep ensure -v -vendor-only
	touch $@

clean:
	rm -rf vendor
