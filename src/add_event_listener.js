/// <reference types="@cloudflare/workers-types" />

addEventListener(
  "fetch",
  /**
   * @param {FetchEvent} event
   */
  (event) => {
    event.respondWith(handleRequest(event.request));
  }
);
