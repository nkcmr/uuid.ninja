package main

import (
	"context"
	"fmt"
	"html/template"
	"io"
	"io/ioutil"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strings"
	"time"

	httptransport "github.com/go-kit/kit/transport/http"
	"github.com/go-zoo/bone"
	uuid "github.com/satori/go.uuid"
)

type ctxKey int

const (
	ctxAcceptHeader ctxKey = iota
)

var index *template.Template

const indexTemplate = `<!DOCTYPE html>
<html lang="en-US">
<head>
    <meta charset="utf-8">
	<meta name="viewport" content="width=device-width">
	<meta name="description" content="a simple and fast toolbelt for dealing with rfc4122 uuid tokens">
    <title>uuid ninja</title>
	<style>
		.problem {
			margin-bottom: 0.8em;
			padding: 0.25em 0.5em;
		}
		.problem.error {
			background-color: #da304c;
			color: white;
		}
	</style>
</head>
<body>
    <div id="main">
		<h2>uuid ninja</h2>
		<p>this is a <a href="https://tools.ietf.org/html/rfc4122" target="_blank" rel="noopener noreferrer">rfc4122</a> uuid utility. use it to generate uuids (v3-5).</p>
		<form action="/" method="POST">
			<fieldset name="global_opts">
				<legend>global options</legend>
				<label for="uppercase">
					<input type="checkbox" id="uppercase" name="uppercase" {{ if .Uppercase }}checked{{ end }} /> uppercase
				</label>
				<label for="lavarand">
					<input type="checkbox" id="lavarand" name="lavarand" {{ if .Lavarand }}checked{{ end }} /> lavarand
				</label>
			</fieldset>

			<fieldset name="hash_based_uuid">
				<legend>uuid v3 / v5</legend>
				{{- range $index, $element := .RangeProblems "hash_uuid" }}
				<div class="problem {{$element.Kind}}">error: {{$element.Message}}</div>
				{{- end }}
				<table>
					<tr>
						<td style="display:block;margin:0.5em;"><label for="version">uuid version</label></td>
						<td>
							<select name="uuidvers" id="version">
								<option value="v3"{{if eq .Req.UUIDHashVersion "v3"}} selected{{end}}>version 3</option>
								<option value="v5"{{if eq .Req.UUIDHashVersion "v5"}} selected{{end}}>version 5</option>
							</select>
						</td>
					</tr>
					<tr>
						<td style="display:block;margin:0.5em;"><label for="uuidns">namespace uuid</label></td>
						<td>
							<input
								id="uuidns"
								type="text"
								name="uuidns"
								style="min-width:25em;"
								{{- if ne .Req.UUIDHashNS "" }}value="{{.Req.UUIDHashNS}}"{{end}}
								/>
						</td>
					</tr>
					<tr>
						<td style="display:block;margin:0.5em;"><label for="uuidname">name</label></td>
						<td>
							<input
								id="uuidname"
								type="text"
								name="uuidname"
								placeholder="ex. 'www.google.com'"
								style="min-width:25em;"
								{{- if ne .Req.UUIDHashName "" }}value="{{.Req.UUIDHashName}}"{{end}}
								/>
						</td>
					</tr>
				</table>
				{{- if .HasHashResult }}<pre>{{ .ResultHashCase }}</pre>{{ end }}
			</fieldset>
			<fieldset name="version_four">
				<legend>uuid v4</legend>
				{{- range $index, $element := .RangeProblems "uuidv4" }}
				<div class="problem {{$element.Kind}}">error: {{$element.Message}}</div>
				{{- end }}
				<pre>{{ .ResultRandoCase }}</pre>
			</fieldset><br />
			<button type="submit">Submit</button>
			<h3 id="#api">api</h3>
			<div style="max-width:30em;">
				<p>
					uuid ninja has a simple API that can be used to easily generate
					a uuid from anywhere that is capable of issuing an http request.
				</p>
				<p>
					the API looks for an <code>Accept</code> header. the supported
					response types are <code>application/json</code> and <code>text/plain</code>.
					the API defaults to JSON responses.
				</p>
				<p>the available endpoints are as follows:</p>
				<h4>v3 / v5</h4>
				<p>the v3 endpoint allows you to generate a v3 uuid:</p>
				<pre>
> curl \
      -H "Accept: text/plain" \
      https://uuid.ninja/api/v3/67819eb0-8e4e-4b16-ac0c-963a1f8ecbd9/foo
  50da134d-b08f-3157-8315-f2ce12544465</pre>
				<p>the expected URL is: <code>/api/v3/&lt;namespace uuid&gt;/&lt;name&gt;</code></p>
				<p>to generate a v5 uuid, the URL is almost the exact same, except that <code>v3</code> should be replaced with <code>v5</code>.</p>
				<pre>
> curl \
      -H "Accept: text/plain" \
      https://uuid.ninja/api/v5/67819eb0-8e4e-4b16-ac0c-963a1f8ecbd9/foo
  3f56b884-e5d1-5540-b182-aeb6440f09bb</pre>
				<h4>v4</h4>
				<p>to generate a v4 uuid, is simpler, since no input is required. simply send a request to the v4 endpoint:</p>
				<pre>
> curl https://uuid.ninja/api/v4
  {"result":"5b30ca46-9b8b-48e0-b53a-1ccd4b3adc8f"}</pre>
				<p>then voilà, a v4 uuid.</p>
			</div>
		</form>
		<hr />
		<small>made out of boredom by <a target="_blank" rel="noopener noreferrer" href="https://nick.comer.io/">nick comer</a></small><br />
		<small>source: <a target="_blank" rel="noopener noreferrer" href="https://github.com/nkcmr/uuid.ninja">github</a></small><br />
		<small>copyright &copy; mit licensed {{ .CurrYear }}</small>
	</div>
</body>
</html>
`

func init() {
	index = template.Must(template.New("index").Parse(indexTemplate))
}

func main() {
	port := "8080"
	if envPort := os.Getenv("PORT"); envPort != "" {
		port = envPort
	}
	_ = http.ListenAndServe(fmt.Sprintf(":%s", port), provideHandler(provideService()))
}

func resultResponseEncode(ctx context.Context, w http.ResponseWriter, r interface{}) error {
	res := r.(resultResponse)
	switch ctx.Value(ctxAcceptHeader) {
	case nil, "application/json":
		return httptransport.EncodeJSONResponse(ctx, w, r)
	case "text/plain":
		_, err := io.WriteString(w, res.Result.String())
		return err
	}
	return nil
}

func computeRequestDecode(_ context.Context, r *http.Request) (interface{}, error) {
	nsraw := bone.GetValue(r, "ns")
	ns, err := uuid.FromString(nsraw)
	if err != nil {
		return nil, statusErr{
			code:    http.StatusBadRequest,
			message: fmt.Sprintf("invalid uuid: '%s'", nsraw),
		}
	}
	return computeRequest{
		ns:   ns,
		name: bone.GetValue(r, "name"),
	}, nil
}

func provideHandler(svc service) http.Handler {
	r := bone.New()

	globalOptions := []httptransport.ServerOption{
		httptransport.ServerFinalizer(func(_ context.Context, code int, r *http.Request) {
			log.Printf("%d %s %s", code, r.Method, r.URL.Path)
		}),
	}
	encodeMultiRender := func(ctx context.Context, w http.ResponseWriter, r interface{}) error {
		w.Header().Set("Content-Type", "text/html")
		w.Header().Set("Content-Security-Policy", "require-sri-for style")
		return index.Execute(w, r)
	}

	urlValues2multiRenderReq := func(v url.Values) multiRenderRequest {
		req := multiRenderRequest{
			uppercase: v.Get("uppercase") != "",
			lavarand:  v.Get("lavarand") != "",
		}
		uuidv := v.Get("uuidvers")
		switch uuidv {
		case "v3", "v5":
			req.UUIDHashVersion = uuidv
		}
		if uuidns := v.Get("uuidns"); uuidns != "" {
			req.UUIDHashNS = uuidns
			req.UUIDHashName = v.Get("uuidname")
		}
		return req
	}

	r.Get("/_health", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprintf(w, "ok (%s)\n", runtime.Version())
	}))
	r.Get("/", httptransport.NewServer(
		svc.multiRender,
		func(_ context.Context, r *http.Request) (interface{}, error) {
			return urlValues2multiRenderReq(r.URL.Query()), nil
		},
		encodeMultiRender,
		globalOptions...,
	))
	r.Post("/", httptransport.NewServer(
		svc.multiRender,
		func(_ context.Context, r *http.Request) (interface{}, error) {
			defer r.Body.Close()
			rawb, err := ioutil.ReadAll(r.Body)
			if err != nil {
				return nil, err
			}
			qp, err := url.ParseQuery(string(rawb))
			if err != nil {
				return nil, err
			}
			return urlValues2multiRenderReq(qp), nil
		},
		encodeMultiRender,
		globalOptions...,
	))

	apiOptions := append(globalOptions,
		httptransport.ServerAfter(func(ctx context.Context, w http.ResponseWriter) context.Context {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET")
			w.Header().Set("Access-Control-Allow-Headers", "Accept")
			return ctx
		}),
		httptransport.ServerBefore(func(parent context.Context, r *http.Request) context.Context {
			mediatype, _, err := mime.ParseMediaType(r.Header.Get("accept"))
			if err == nil {
				switch mediatype {
				case "application/json", "text/plain":
					return context.WithValue(
						parent,
						ctxAcceptHeader,
						mediatype,
					)
				}
			}
			return context.WithValue(parent, ctxAcceptHeader, "application/json")
		}),
		httptransport.ServerErrorEncoder(func(ctx context.Context, err error, w http.ResponseWriter) {
			code := http.StatusInternalServerError
			if sc, ok := err.(httptransport.StatusCoder); ok {
				code = sc.StatusCode()
			}
			w.WriteHeader(code)
			switch ctx.Value(ctxAcceptHeader) {
			case nil, "application/json":
				res := struct {
					Error string `json:"error"`
				}{Error: err.Error()}
				_ = httptransport.EncodeJSONResponse(ctx, w, res)
			case "text/plain":
				fmt.Fprintf(w, "error: %s\n", err)
			default:
			}
		}),
	)

	r.Get("/api/v3/:ns/:name", httptransport.NewServer(
		svc.computeVersion3,
		computeRequestDecode,
		resultResponseEncode,
		apiOptions...,
	))
	r.Get("/api/v4", httptransport.NewServer(
		svc.computeVersion4,
		httptransport.NopRequestDecoder,
		resultResponseEncode,
		apiOptions...,
	))
	r.Get("/api/v5/:ns/:name", httptransport.NewServer(
		svc.computeVersion5,
		computeRequestDecode,
		resultResponseEncode,
		apiOptions...,
	))
	return r
}

func provideService() service {
	return svcImpl{}
}

type service interface {
	multiRender(context.Context, interface{}) (interface{}, error)
	computeVersion3(context.Context, interface{}) (interface{}, error)
	computeVersion4(context.Context, interface{}) (interface{}, error)
	computeVersion5(context.Context, interface{}) (interface{}, error)
}

type multiRenderRequest struct {
	uppercase, lavarand bool

	UUIDHashVersion string
	UUIDHashNS      string
	UUIDHashName    string
}

type problemMap map[string][]problemMessage

func (p problemMap) add(category, kind, message string) {
	s, ok := p[category]
	if !ok {
		s = []problemMessage{}
		p[category] = s
	}
	s = append(s, problemMessage{Kind: kind, Message: message})
	p[category] = s
}

type problemMessage struct {
	Kind, Message string
}

type multiRenderResponse struct {
	Req multiRenderRequest

	ResultHash  uuid.UUID
	ResultRando uuid.UUID

	Problems problemMap
}

func (m multiRenderResponse) Uppercase() bool {
	return m.Req.uppercase
}

func (m multiRenderResponse) Lavarand() bool {
	return m.Req.lavarand
}

func (multiRenderResponse) CurrYear() string {
	return fmt.Sprintf("%d", time.Now().UTC().Year())
}

func (m multiRenderResponse) HasHashResult() bool {
	return !uuid.Equal(m.ResultHash, uuid.Nil)
}

func (m multiRenderResponse) ResultHashCase() string {
	if m.Req.uppercase {
		return strings.ToUpper(m.ResultHash.String())
	}
	return m.ResultHash.String()
}

func (m multiRenderResponse) ResultRandoCase() string {
	if m.Req.uppercase {
		return strings.ToUpper(m.ResultRando.String())
	}
	return m.ResultRando.String()
}

func (m multiRenderResponse) RangeProblems(category string) []problemMessage {
	s, ok := m.Problems[category]
	if !ok {
		return []problemMessage{}
	}
	return s
}

type resultResponse struct {
	Result uuid.UUID `json:"result"`
}

type computeRequest struct {
	ns   uuid.UUID
	name string
}

type svcImpl struct{}

var _ service = svcImpl{}

func (svcImpl) multiRender(_ context.Context, r interface{}) (interface{}, error) {
	req := r.(multiRenderRequest)
	res := multiRenderResponse{
		Req:      req,
		Problems: problemMap{},
	}
	if req.UUIDHashNS != "" {
		switch req.UUIDHashVersion {
		case "v3":
			ns, err := uuid.FromString(req.UUIDHashNS)
			if err != nil {
				res.Problems.add("hash_uuid", "error", fmt.Sprintf("invalid uuid '%s'", req.UUIDHashNS))
			} else {
				res.ResultHash = uuid.NewV3(ns, req.UUIDHashName)
			}
		case "v5":
			ns, err := uuid.FromString(req.UUIDHashNS)
			if err != nil {
				res.Problems.add("hash_uuid", "error", fmt.Sprintf("invalid uuid '%s'", req.UUIDHashNS))
			} else {
				res.ResultHash = uuid.NewV5(ns, req.UUIDHashName)
			}
		}
	}
	randoHash, err := uuid.NewV4()
	if err != nil {
		res.Problems.add("uuidv4", "error", fmt.Sprintf("error generating v4 uuid: %s", err.Error()))
	} else {
		res.ResultRando = randoHash
	}
	return res, nil
}

func (svcImpl) computeVersion3(_ context.Context, r interface{}) (interface{}, error) {
	req := r.(computeRequest)
	return resultResponse{
		Result: uuid.NewV3(req.ns, req.name),
	}, nil
}

func (svcImpl) computeVersion4(_ context.Context, _ interface{}) (interface{}, error) {
	res, err := uuid.NewV4()
	if err != nil {
		return nil, fmt.Errorf("error generating v4 uuid: %s", err.Error())
	}
	return resultResponse{
		Result: res,
	}, nil
}

func (svcImpl) computeVersion5(_ context.Context, r interface{}) (interface{}, error) {
	req := r.(computeRequest)
	return resultResponse{
		Result: uuid.NewV5(req.ns, req.name),
	}, nil
}

type statusErr struct {
	code    int
	message string
}

func (s statusErr) Error() string {
	return s.message
}

func (s statusErr) StatusCode() int {
	return s.code
}
