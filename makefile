un.wasm: vendor/.ok un.go
	GOOS=js GOARCH=wasm go build -v -o $@ .

vendor/.ok: Gopkg.lock Gopkg.toml
	dep ensure -v -vendor-only
