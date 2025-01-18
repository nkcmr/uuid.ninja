import { WorkerVersionMetadata } from "@cloudflare/workers-types";
import { DurableObject } from "cloudflare:workers";
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
  uuidV7Seq?: number;
};

const PARAM_UPPERCASE = "uppercase";
const PARAM_UUID_VERSION = "uuidvers";
const PARAM_UUID_HASH_NS = "uuidns";
const PARAM_UUID_HASH_NAME = "uuidname";
const PARAM_UUID_MONO_SEQ = "seq";

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

  let uuidV7Seq: number | undefined;
  if (params.has(PARAM_UUID_MONO_SEQ)) {
    uuidV7Seq = parseInt(params.get(PARAM_UUID_MONO_SEQ)!);
  }

  return [
    {
      uppercase: (params.get(PARAM_UPPERCASE) || "") !== "",
      uuidVersion: parseUUIDVersion(params),
      uuidHashNS: params.get(PARAM_UUID_HASH_NS) || "",
      uuidHashName: params.get(PARAM_UUID_HASH_NAME) || "",
      uuidV7Seq,
    },
    url,
    params,
  ];
}

async function newV7(env: Env, opts: Options): Promise<string> {
  const seq = await getV7Seq(env, opts);
  const rand = new Uint8Array(16);
  crypto.getRandomValues(rand);
  return uuid.v7({
    seq: seq,
    random: rand,
  });
}

function getSeq(env: Env): DurableObjectStub<Sequence> {
  return env.SEQ.get(env.SEQ.idFromName("MAIN"));
}

async function getV7Seq(env: Env, opts: Options): Promise<number> {
  if (typeof opts.uuidV7Seq !== "undefined" && !isNaN(opts.uuidV7Seq)) {
    return opts.uuidV7Seq;
  }
  return await getSeq(env).inc();
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const [opts, url] = await parseOptions(request);
  if (url.pathname === "/api/v7/seq-current") {
    const seq = await getSeq(env).load();
    return respond(request, {
      json: () => {
        return JSON.stringify({ seq });
      },
      txt: () => {
        return `${seq}`;
      },
    });
  }
  if (url.pathname === "/api/v7") {
    const value = await newV7(env, opts);
    const result = conditionUppercase(opts.uppercase, value);
    return respond(request, {
      json: () => {
        return JSON.stringify({ result });
      },
      txt: () => {
        return result;
      },
    });
  }
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
      resultMonotonic: "",
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

    const v7value = await newV7(env, opts);
    mp.resultMonotonic = conditionUppercase(mp.uppercase, v7value);
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
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <meta name="description" content="a simple and fast toolbelt for dealing with rfc4122 uuid tokens" />
  <title>uuid ninja</title>
  <meta name="deploy-version" content="${env.VERSION.id}" />
  <meta name="deploy-tag" content="${env.VERSION.tag}" />
  <meta name="deploy-timestamp" content="${env.VERSION.timestamp ?? ""}" />
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

type Env = {
  SEQ: DurableObjectNamespace<Sequence>;
  VERSION: WorkerVersionMetadata;
};

const SEQUENCE_START = 5000;

export class Sequence extends DurableObject<Env> {
  private readonly state: DurableObjectState;
  private seq: number;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.state = ctx;
    this.seq = NaN;
    this.state.blockConcurrencyWhile(async () => {
      this.seq = (await ctx.storage.get<number>("seq")) ?? SEQUENCE_START;
    });
  }

  async load(): Promise<number> {
    return Promise.resolve(this.seq);
  }

  async inc(): Promise<number> {
    if (isNaN(this.seq)) {
      throw new Error(`Sequence init fault`);
    }
    const current = Math.max(this.seq, SEQUENCE_START);
    const next = current + 1;
    await this.ctx.storage.put<number>("seq", next);
    console.log("Sequence.inc", { current, next });
    this.seq = next;
    return next;
  }
}

export default {
  async fetch(request: Request, env: Env) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      console.error("server_error", e);
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
  },
};
