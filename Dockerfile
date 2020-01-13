FROM golang:1-buster AS build

WORKDIR /go/src/github.com/nkcmr/uuid.ninja
COPY . .

RUN make

FROM debian:buster-slim

COPY --from=build /go/src/github.com/nkcmr/uuid.ninja/tmp/bin/uuid_ninja /uuid_ninja

EXPOSE 8080

ENTRYPOINT ["/uuid_ninja"]