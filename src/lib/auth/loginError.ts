type LoginErrorLike = {
  message?: string | null;
  code?: string | null;
  status?: number | null;
};

const EXPECTED_MESSAGES = [
  "invalid login credentials",
  "email not confirmed",
  "invalid credentials",
];

const EXPECTED_CODES = new Set(["invalid_credentials", "email_not_confirmed"]);

function normalizeText(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function isExpectedLoginFailure(error: LoginErrorLike | null | undefined) {
  if (!error) return false;
  const message = normalizeText(error.message);
  const code = normalizeText(error.code);
  const status = typeof error.status === "number" ? error.status : null;

  if (code && EXPECTED_CODES.has(code)) return true;
  if (status === 400 && EXPECTED_MESSAGES.some((token) => message.includes(token))) return true;
  return EXPECTED_MESSAGES.some((token) => message.includes(token));
}

export function getLoginFailureMessage(error: LoginErrorLike | null | undefined) {
  const message = normalizeText(error?.message);

  if (message.includes("invalid login credentials") || message.includes("invalid credentials")) {
    return "Credenciais inválidas. Verifique seu e-mail e senha.";
  }
  if (message.includes("email not confirmed")) {
    return "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.";
  }

  return (error?.message || "Falha no login.").trim();
}
