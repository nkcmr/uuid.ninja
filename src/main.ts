/// <reference types="@cloudflare/workers-types" />

import * as mime from "mime";
import * as uuid from "uuid";
import { MainProps, render } from "./view";

type SupportedContentTypes = "txt" | "json";

function contentType(
  ct: string,
  defaultct: SupportedContentTypes = "json"
): SupportedContentTypes {
  let ext = mime.getExtension(ct);
  switch (ext) {
    case "txt":
    case "json":
      return ext;
  }
  return defaultct;
}

type RespondOptions = {
  status?: number;
  defaultct?: SupportedContentTypes;
};

function respond(
  request: Request,
  encode: Record<SupportedContentTypes, () => string>,
  opts: RespondOptions = {}
): Response {
  const { txt, json } = encode;
  const status = opts.status || 200;
  switch (
    contentType(request.headers.get("accept") || "", opts.defaultct || "json")
  ) {
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

type Options = {
  uppercase: boolean;
  uuidVersion: "v3" | "v5";
  uuidHashNS: string;
  uuidHashName: string;
};

const PARAM_UPPERCASE = "uppercase";
const PARAM_UUID_VERSION = "uuidvers";
const PARAM_UUID_HASH_NS = "uuidns";
const PARAM_UUID_HASH_NAME = "uuidname";

const parseUUIDVersion = (params: URLSearchParams): "v3" | "v5" => {
  let v = params.get(PARAM_UUID_VERSION) || "";
  switch (v) {
    case "v3":
    case "v5":
      return v;
  }
  return "v5";
};

async function parseOptions(
  request: Request
): Promise<[Options, URL, URLSearchParams]> {
  const url = new URL(request.url);
  var params =
    request.method === "POST"
      ? new URLSearchParams(await request.text())
      : url.searchParams;

  return [
    {
      uppercase: (params.get(PARAM_UPPERCASE) || "") !== "",
      uuidVersion: parseUUIDVersion(params),
      uuidHashNS: params.get(PARAM_UUID_HASH_NS) || "",
      uuidHashName: params.get(PARAM_UUID_HASH_NAME) || "",
    },
    url,
    params,
  ];
}

async function handleRequest(request: Request): Promise<Response> {
  const [opts, url] = await parseOptions(request);
  if (url.pathname === "/api/v4") {
    const result = conditionUppercase(opts.uppercase, uuid.v4());
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
        { status: 400 }
      );
    }
    var result: string;
    if (url.pathname.includes("/v3/")) {
      result = conditionUppercase(opts.uppercase, uuid.v3(name, ns));
    } else if (url.pathname.includes("/v5/")) {
      result = conditionUppercase(opts.uppercase, uuid.v5(name, ns));
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
      uppercase: opts.uppercase,
      uuidVersion: opts.uuidVersion,
      uuidHashNS: opts.uuidHashNS,
      uuidHashName: opts.uuidHashName,
      resultHash: "",
      resultRando: "",
      currentYear: new Date().getFullYear(),
      problems: new Map(),
    };
    const dohash = (fn: (name: string, ns: string) => string): void => {
      if (mp.uuidHashNS === "" || mp.uuidHashName === "") {
        return;
      }
      const { uuidHashNS: ns, uuidHashName: name } = mp;
      if (!uuid.validate(ns)) {
        mp.problems.set("hash_uuid", [
          ...(mp.problems.get("hash_uuid") || []),
          { kind: "error", message: `invalid uuid: ${ns}` },
        ]);
      } else {
        mp.resultHash = conditionUppercase(mp.uppercase, fn(name, ns));
      }
    };
    mp.resultRando = conditionUppercase(mp.uppercase, uuid.v4());
    switch (mp.uuidVersion) {
      case "v3":
        dohash(uuid.v3);
        break;
      case "v5":
        dohash(uuid.v5);
        break;
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
  return respond(
    request,
    {
      json: () => JSON.stringify({ error: "404 page not found" }),
      txt: () => "404 page not found",
    },
    { status: 404 }
  );
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
      { status: 500, defaultct: "txt" }
    );
  }
};
