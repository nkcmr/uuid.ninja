/// <reference types="@cloudflare/workers-types" />

import * as mime from "mime";
import * as uuid from "uuid";
import { MainProps, render } from "./view";

type SupportedContentTypes = "txt" | "json";

function contentType(ct: string): SupportedContentTypes {
  let ext = mime.getExtension(ct);
  switch (ext) {
    case "txt":
    case "json":
      return ext;
  }
  return "json";
}

function respond(
  request: Request,
  encode: Record<SupportedContentTypes, () => string>,
  status = 200
): Response {
  const { txt, json } = encode;
  switch (contentType(request.headers.get("accept") || "")) {
    case "json":
      return new Response(json(), {
        status,
        headers: { "content-type": "application/json" },
      });
    case "txt":
      return new Response(txt(), {
        status,
        headers: { "content-type": "text/plain" },
      });
  }
  throw new Error("unreachable");
}

function conditionUppercase(uc: boolean, str: string): string {
  if (uc) {
    return str.toUpperCase();
  }
  return str.toLowerCase();
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/v4") {
    const result = uuid.v4();
    return respond(request, {
      json: () => {
        return JSON.stringify({ result });
      },
      txt: () => {
        return result;
      },
    });
  }
  const hashUUIDPattern = /^\/api\/v(?:3|5)\/(?<ns>[^\/]+)\/(?<name>[^\/]+)$/i;
  const hashUUIDMatch = url.pathname.match(hashUUIDPattern);
  if (hashUUIDMatch) {
    const { ns, name } = hashUUIDMatch.groups as any;
    if (!uuid.validate(ns)) {
      const errmsg = `invalid uuid: '${ns}'`;
      return respond(
        request,
        {
          json: () => {
            return JSON.stringify({ error: errmsg });
          },
          txt: () => {
            return `error: ${errmsg}`;
          },
        },
        400
      );
    }
    var result: string;
    if (url.pathname.includes("/v3/")) {
      result = uuid.v3(name, ns);
    } else if (url.pathname.includes("/v5/")) {
      result = uuid.v5(name, ns);
    }
    return respond(request, {
      json: () => {
        return JSON.stringify({ result });
      },
      txt: () => {
        return result;
      },
    });
  }
  if (url.pathname === "/") {
    var mp: MainProps = {
      uppercase: false,
      lavarand: false,
      uuidVersion: "v5",
      uuidHashNS: "",
      uuidHashName: "",
      resultHash: "",
      resultRando: "",
      currentYear: new Date().getFullYear(),
      problems: new Map(),
    };
    if (request.method === "POST") {
      const rawparams = await request.text();
      const params = new URLSearchParams(rawparams);
      mp.uppercase = params.has("uppercase");
      mp.lavarand = params.has("lavarand");
      mp.resultRando = conditionUppercase(mp.uppercase, uuid.v4());
      const name = params.get("uuidname") || "";
      const ns = params.get("uuidns") || "";
      const dohash = (fn: (name: string, ns: string) => string): void => {
        if (!uuid.validate(ns)) {
          mp.problems.set("hash_uuid", [
            ...(mp.problems.get("hash_uuid") || []),
            { kind: "error", message: `invalid uuid: ${ns}` },
          ]);
        } else {
          mp.uuidHashNS = ns;
          mp.uuidHashName = name;
          mp.resultHash = conditionUppercase(mp.uppercase, fn(name, ns));
        }
      };
      switch (params.get("uuidvers")) {
        case "v3":
          mp.uuidVersion = "v3";
          dohash(uuid.v3);
          break;
        case "v5":
          mp.uuidVersion = "v5";
          dohash(uuid.v5);
          break;
      }
    } else {
      mp.resultRando = conditionUppercase(
        url.searchParams.has("uppercase"),
        uuid.v4()
      );
    }
    return new Response(
      `<!DOCTYPE html>
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
<body>${render(mp)}</body>
</html>
`,
      {
        headers: { "content-type": "text/html" },
      }
    );
  }
  return new Response("404 page not found", { status: 404 });
}
// make available to addEventListener
(globalThis as any).handleRequest = async (
  request: Request
): Promise<Response> => {
  try {
    return await handleRequest(request);
  } catch (e) {
    return respond(
      request,
      {
        txt: () => {
          return `error: ${e}`;
        },
        json: () => {
          return JSON.stringify({ error: `${e}` });
        },
      },
      500
    );
  }
};
