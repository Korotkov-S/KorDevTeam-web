import assert from "node:assert/strict";
import test from "node:test";

import { Pool } from "pg";

import { createDb } from "./client";

test("createDb registers a sanitized PostgreSQL pool error listener", () => {
  const originalOn = Pool.prototype.on;
  const originalConsoleError = console.error;
  let errorListener: ((error: Error) => void) | undefined;
  const logged: unknown[][] = [];

  Pool.prototype.on = function (event, listener) {
    if (event === "error") {
      errorListener = listener as (error: Error) => void;
    }
    return originalOn.call(this, event, listener);
  };
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };

  try {
    createDb("postgresql://kordev:development-password@localhost:5433/kordev");

    assert.equal(typeof errorListener, "function");
    errorListener?.(new Error("connection string includes development-password"));
    assert.deepEqual(logged, [["PostgreSQL pool connection error"]]);
  } finally {
    Pool.prototype.on = originalOn;
    console.error = originalConsoleError;
  }
});
