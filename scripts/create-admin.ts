import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";

import { createAdminUser } from "../src/server/auth/bootstrap";
import { getDb } from "../src/server/db/client";

export function assertSafeArguments(args: string[]): void {
  if (args.length !== 0) throw new Error("admin_bootstrap_arguments_invalid");
}

export function parsePipedAdminInput(value: string): { login: string; password: string } {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length !== 2 || !lines[0] || !lines[1]) throw new Error("admin_bootstrap_input_invalid");
  return { login: lines[0], password: lines[1] };
}

async function readHiddenPassword(): Promise<string> {
  const input = process.stdin;
  const output = process.stderr;
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("admin_bootstrap_input_invalid");
  }
  output.write("Пароль: ");
  input.setEncoding("utf8");
  input.setRawMode(true);
  input.resume();
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string | Buffer) => {
      for (const character of Array.from(String(chunk))) {
        if (character === "\u0003") return finish(new Error("admin_bootstrap_cancelled"));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") value = Array.from(value).slice(0, -1).join("");
        else if (character >= " ") value += character;
      }
    };
    input.on("data", onData);
  });
}

async function readInteractiveAdminInput(): Promise<{ login: string; password: string }> {
  const terminal = createInterface({ input: process.stdin, output: process.stderr });
  const login = await terminal.question("Логин: ");
  terminal.close();
  return { login, password: await readHiddenPassword() };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  assertSafeArguments(args);
  const input = process.stdin.isTTY
    ? await readInteractiveAdminInput()
    : parsePipedAdminInput(await readFile(0, "utf8"));
  const created = await createAdminUser(getDb(), input);
  process.stdout.write(`Администратор создан: ${created.login}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    const code = error instanceof Error && /^admin_[a-z_]+$/.test(error.message)
      ? error.message
      : "admin_bootstrap_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
