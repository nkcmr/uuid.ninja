import React from "react";
import { renderToString } from "react-dom/server";

export type MainProps = {
  uppercase: boolean;
  uuidVersion: "v3" | "v5";
  uuidHashNS: string;
  uuidHashName: string;
  resultHash: string;
  resultRando: string;
  currentYear: number;
  problems: Map<
    "hash_uuid" | "uuidv4",
    Array<{ kind: "error"; message: string }>
  >;
};

const Main: React.FC<MainProps> = (props) => {
  return (
    <div id="main">
      <h2>uuid ninja</h2>
      <p>
        this is a{" "}
        <a
          href="https://tools.ietf.org/html/rfc4122"
          target="_blank"
          rel="noopener noreferrer"
        >
          rfc4122
        </a>{" "}
        uuid utility. use it to generate uuids (v3-5).
      </p>
      <form action="/" method="POST">
        <fieldset name="global_opts">
          <legend>global options</legend>
          <label htmlFor="uppercase">
            <input
              type="checkbox"
              id="uppercase"
              name="uppercase"
              checked={props.uppercase}
            />{" "}
            uppercase
          </label>
        </fieldset>

        <fieldset name="hash_based_uuid">
          <legend>uuid v3 / v5</legend>
          {(props.problems.get("hash_uuid") || []).map((p, i) => {
            return (
              <div key={`hashproblem${i}`} className={`problem ${p.kind}`}>
                error: {p.message}
              </div>
            );
          })}
          <table>
            <tr>
              <td style={{ display: "block", margin: "0.5em" }}>
                <label htmlFor="version">uuid version</label>
              </td>
              <td>
                <select name="uuidvers" id="version">
                  <option value="v3" selected={props.uuidVersion === "v3"}>
                    version 3
                  </option>
                  <option value="v5" selected={props.uuidVersion === "v5"}>
                    version 5
                  </option>
                </select>
              </td>
            </tr>
            <tr>
              <td style={{ display: "block", margin: "0.5em" }}>
                <label htmlFor="uuidns">namespace uuid</label>
              </td>
              <td>
                <input
                  id="uuidns"
                  type="text"
                  name="uuidns"
                  style={{ minWidth: "25em" }}
                  value={props.uuidHashNS}
                />
              </td>
            </tr>
            <tr>
              <td style={{ display: "block", margin: "0.5em" }}>
                <label htmlFor="uuidname">name</label>
              </td>
              <td>
                <input
                  id="uuidname"
                  type="text"
                  name="uuidname"
                  placeholder="ex. 'www.google.com'"
                  style={{ minWidth: "25em" }}
                  value={props.uuidHashName}
                />
              </td>
            </tr>
          </table>
          {props.resultHash && <pre>{props.resultHash}</pre>}
        </fieldset>
        <fieldset name="version_four">
          <legend>uuid v4</legend>
          <pre>{props.resultRando}</pre>
        </fieldset>
        <br />
        <button type="submit">Submit</button>
        <h3 id="#api">api</h3>
        <div style={{ maxWidth: "30em" }}>
          <p>
            uuid ninja has a simple API that can be used to easily generate a
            uuid from anywhere that is capable of issuing an http request.
          </p>
          <p>
            the API looks for an <code>Accept</code> header. the supported
            response types are <code>application/json</code> and{" "}
            <code>text/plain</code>. the API defaults to JSON responses.
          </p>
          <p>the available endpoints are as follows:</p>
          <h4>v3 / v5</h4>
          <p>the v3 endpoint allows you to generate a v3 uuid:</p>
          <pre>
            {`curl \\
    -H "Accept: text/plain" \\
    https://uuid.ninja/api/v3/67819eb0-8e4e-4b16-ac0c-963a1f8ecbd9/foo`}
            <br />
            50da134d-b08f-3157-8315-f2ce12544465
          </pre>
          <p>
            the expected URL is:{" "}
            <code>/api/v3/&lt;namespace uuid&gt;/&lt;name&gt;</code>
          </p>
          <p>
            to generate a v5 uuid, the URL is almost the exact same, except that{" "}
            <code>v3</code> should be replaced with <code>v5</code>.
          </p>
          <pre>
            {`> curl \\ 
    -H "Accept: text/plain" \\
    https://uuid.ninja/api/v5/67819eb0-8e4e-4b16-ac0c-963a1f8ecbd9/foo`}
            <br />
            3f56b884-e5d1-5540-b182-aeb6440f09bb
          </pre>
          <h4>v4</h4>
          <p>
            to generate a v4 uuid, is simpler, since no input is required.
            simply send a request to the v4 endpoint:
          </p>
          <pre>
            &gt; curl https://uuid.ninja/api/v4
            <br />
            {`{"result":"5b30ca46-9b8b-48e0-b53a-1ccd4b3adc8f"}`}
          </pre>
          <p>then voilà, a v4 uuid.</p>
        </div>
      </form>
      <hr />
      <small>
        made out of boredom by{" "}
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://nick.comer.io/"
        >
          nick comer
        </a>
      </small>
      <br />
      <small>
        source:{" "}
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://github.com/nkcmr/uuid.ninja"
        >
          github
        </a>
      </small>
      <br />
      <small>copyright &copy; mit licensed {props.currentYear}</small>
    </div>
  );
};

export function render(p: MainProps): string {
  return renderToString(<Main {...p} />);
}
