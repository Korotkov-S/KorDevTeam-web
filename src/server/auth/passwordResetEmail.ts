import nodemailer, { type SendMailOptions } from "nodemailer";

export type PasswordResetMessage = { resetUrl: URL; expiresAt: Date };
export type PasswordResetSender = (message: PasswordResetMessage) => Promise<void>;
export type PasswordResetTransport = {
  sendMail(mail: SendMailOptions): Promise<{ messageId: string; rejected?: unknown[] }>;
};

type Environment = Readonly<Record<string, string | undefined>>;

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error("admin_password_reset_email_config_invalid");
  return value;
}

function readEmailConfig(environment: Environment) {
  const port = Number(required(environment, "SMTP_PORT"));
  const secure = required(environment, "SMTP_SECURE");
  if (!Number.isInteger(port) || port < 1 || port > 65_535 || (secure !== "true" && secure !== "false")) {
    throw new Error("admin_password_reset_email_config_invalid");
  }
  return {
    host: required(environment, "SMTP_HOST"),
    port,
    secure: secure === "true",
    user: required(environment, "SMTP_USER"),
    password: required(environment, "SMTP_PASSWORD"),
    from: required(environment, "SMTP_FROM"),
  };
}

export function createPasswordResetSender(
  environment: Environment = process.env,
  injectedTransport?: PasswordResetTransport,
): PasswordResetSender {
  const config = readEmailConfig(environment);
  const transport: PasswordResetTransport = injectedTransport ?? nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    requireTLS: true,
    logger: false,
    debug: false,
    connectionTimeout: 5_000,
    greetingTimeout: 10_000,
    socketTimeout: 45_000,
    dnsTimeout: 5_000,
  });
  return async ({ resetUrl, expiresAt }) => {
    const result = await transport.sendMail({
      from: config.from,
      to: "team@korotkov.dev",
      subject: "Восстановление доступа к админке KorDevTeam",
      text: [
        "Запрошено восстановление пароля администратора KorDevTeam.",
        "",
        `Установить новый пароль: ${resetUrl.href}`,
        `Ссылка действует до ${expiresAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} (Москва).`,
        "",
        "Если вы не запрашивали восстановление, ничего делать не нужно.",
      ].join("\n"),
    });
    if (!result?.messageId || result.rejected?.length) throw new Error("admin_password_reset_email_failed");
  };
}

let sender: PasswordResetSender | undefined;

export function getPasswordResetSender(): PasswordResetSender {
  return sender ??= createPasswordResetSender();
}
