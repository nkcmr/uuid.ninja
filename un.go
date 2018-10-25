package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"

	httptransport "github.com/go-kit/kit/transport/http"
	"github.com/go-zoo/bone"
	"github.com/satori/go.uuid"
)

type ctxKey int

const (
	ctxAcceptHeader ctxKey = iota
)

type config struct {
}

func main() {
	http.ListenAndServe(":8080", provideHandler(provideService()))
}

func provideHandler(svc service) http.Handler {
	r := bone.New()

	globalOptions := []httptransport.ServerOption{
		// TODO: very permissive CORS headers
		httptransport.ServerBefore(func(parent context.Context, r *http.Request) context.Context {
			log.Printf("request: %s %s", r.Method, r.URL.Path)
			return parent
		}),
		httptransport.ServerBefore(func(parent context.Context, r *http.Request) context.Context {
			return context.WithValue(
				parent,
				ctxAcceptHeader,
				r.Header.Get("accept"),
			)
		}),
		httptransport.ServerErrorEncoder(func(_ context.Context, err error, w http.ResponseWriter) {
			// TODO: figure out how to respond with error according to HTTP accept header
			io.WriteString(w, fmt.Sprintf("error: %s", err))
		}),
	}
	// r.Get("/", httptransport.NewServer(
	// 	svc.multiRender,
	// 	func(_ context.Context, r *http.Request) (interface{}, error) {
	// 		return nil, nil
	// 	},
	// 	func(_ context.Context, w http.ResponseWriter, res interface{}) error {
	// 		return nil
	// 	},
	// ))
	r.Get("/api/v3/:ns/:name", httptransport.NewServer(
		svc.computeVersion3,
		func(_ context.Context, r *http.Request) (interface{}, error) {
			nsraw := bone.GetValue(r, "ns")
			ns, err := uuid.FromString(nsraw)
			if err != nil {
				return nil, fmt.Errorf("invalid uuid: '%s'", nsraw)
			}
			return computeV3Request{
				ns:   ns,
				name: bone.GetValue(r, "name"),
			}, nil
		},
		httptransport.EncodeJSONResponse,
		globalOptions...,
	))
	return r
}

func provideService() service {
	return svcImpl{}
}

type service interface {
	// multiRender(context.Context, interface{}) (interface{}, error)
	computeVersion3(context.Context, interface{}) (interface{}, error)
	// computeVersion4(context.Context, interface{}) (interface{}, error)
	// computeVersion5(context.Context, interface{}) (interface{}, error)
}

type multiRenderRequest struct {
}

type multiRenderResponse struct {
}

type resultResponse struct {
	Result uuid.UUID `json:"result"`
}

type computeV3Request struct {
	ns   uuid.UUID
	name string
}

type computeV4Request struct {
}

type svcImpl struct{}

var _ service = svcImpl{}

func (svcImpl) computeVersion3(_ context.Context, r interface{}) (interface{}, error) {
	req := r.(computeV3Request)
	return resultResponse{
		Result: uuid.NewV3(req.ns, req.name),
	}, nil
}
