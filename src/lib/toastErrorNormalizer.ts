type NormalizedToastError = {
  title?: string;
  message: string;
  httpStatus?: number;
  code?: string | null;
};

function extractHttpStatusFromText(text: string): number | null {
  const m = text.match(/\bHTTP[_\s-]?(\d{3})\b/i);
  if (m?.[1]) return Number(m[1]);
  const m2 = text.match(/\b(\d{3})\s*\(?(Bad Request|Unauthorized|Forbidden|Not Found|Conflict|Unprocessable|Internal Server Error)\b/i);
  if (m2?.[1]) return Number(m2[1]);
  return null;
}

function stripHttpPrefix(text: string): { httpStatus?: number; rest: string } {
  const httpStatus = extractHttpStatusFromText(text);
  if (!httpStatus) return { rest: text };
  // Remove "HTTP_400:" / "HTTP 400:" / "HTTP-400:" prefix if present.
  const rest = text.replace(/\bHTTP[_\s-]?\d{3}\s*:\s*/i, "").trim();
  return { httpStatus, rest };
}

function isProbablyTechnicalMessage(text: string): boolean {
  const t = text.toLowerCase();
  return [
    "invalid input syntax for type",
    "duplicate key value violates unique constraint",
    "violates foreign key constraint",
    "schema cache",
    "could not find the function",
    "no function matches the given name",
    "does not exist",
    "structure of query does not match function result type",
    "returned type",
    "pg_advisory_xact_lock",
    "link_failed",
    "internal_server_error",
  ].some((needle) => t.includes(needle));
}

function looksLikePortugueseUserMessage(text: string): boolean {
  const t = text.toLowerCase();
  // Heurística: mensagens PT-BR curtas e “de regra” devem ser preservadas.
  return (
    /[áàâãéêíóôõúç]/i.test(text) ||
    /\b(obrigat[óo]ri[oa]|inv[áa]lid[oa]|n[ãa]o|j[áa]|selecione|preencha|permitid[oa])\b/i.test(t)
  );
}

function normalizeByPatterns(text: string): NormalizedToastError | null {
  const t = text.toLowerCase();

  if (t.includes('nenhuma empresa ativa') || t.includes('sessão sem empresa') || t.includes('selecione sua empresa')) {
    return {
      title: "Selecione sua empresa",
      message: "Para continuar, selecione a empresa ativa e tente novamente.",
    };
  }

  if (/\bcompany_not_found\b/i.test(text) || t.includes('empresa não encontrada')) {
    return {
      title: "Empresa não encontrada",
      message: "Não encontramos a empresa informada. Verifique os dados (ex.: CNPJ) e tente novamente.",
    };
  }

  if (/\bplan_not_mapped\b/i.test(text) || t.includes('plano não encontrado/ativo') || t.includes('plano não encontrado')) {
    return {
      title: "Plano indisponível",
      message: "O plano selecionado não está disponível no momento. Atualize a página e tente novamente.",
    };
  }

  if (/\bmissing_customer\b/i.test(text) || t.includes('sem cliente stripe')) {
    return {
      title: "Assinatura não vinculada",
      message: "Não encontramos um cliente Stripe vinculado para esta empresa. Vincule o customer e tente novamente.",
    };
  }

  if (/transi[cç][aã]o inv[áa]lida/i.test(t)) {
    return {
      title: "Ação não permitida",
      message: "Essa ação não é permitida no status atual. Verifique o status e tente novamente.",
    };
  }

  if (/invalid input syntax for type uuid/i.test(t) || /\buuid\b/i.test(t) && /invalid input syntax/i.test(t)) {
    return {
      title: "Dados inválidos",
      message: "Algum identificador está inválido. Atualize a página e tente novamente.",
    };
  }

  if (/duplicate key value violates unique constraint/i.test(t) || /violates unique constraint/i.test(t) || /\b23505\b/.test(t)) {
    return {
      title: "Já existe",
      message: "Já existe um registro com esses dados. Ajuste as informações e tente novamente.",
    };
  }

  if (/violates foreign key constraint/i.test(t)) {
    return {
      title: "Não foi possível excluir",
      message: "Este registro já está sendo usado em outro módulo. Remova o vínculo antes de excluir.",
    };
  }

  if (/pgrst203/i.test(t) || /more than one function/i.test(t) || /could not choose the best candidate function/i.test(t)) {
    return {
      title: "Atualização necessária",
      message: "O sistema está com uma inconsistência de versão no servidor. Tente novamente em instantes.",
    };
  }

  if (/pgrst202/i.test(t) || /could not find the function/i.test(t) || /schema cache/i.test(t)) {
    return {
      title: "Recurso ainda não disponível",
      message: "Esta funcionalidade requer uma atualização do servidor que ainda não foi aplicada. Tente novamente mais tarde ou contate o suporte.",
    };
  }

  if (/no function matches the given name/i.test(t) || /does not exist/i.test(t) || /pg_advisory_xact_lock/i.test(t)) {
    return {
      title: "Serviço indisponível",
      message: "Uma função do servidor não está disponível no momento. Aguarde alguns instantes e tente novamente.",
    };
  }

  if (/failed to fetch|networkerror|load failed|net::err_failed/i.test(t)) {
    return {
      title: "Sem conexão",
      message: "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.",
    };
  }

  if (/link_failed/i.test(t)) {
    return {
      title: "Falha de vínculo",
      message: "Não foi possível concluir a ação por uma falha de vínculo. Tente novamente em instantes.",
    };
  }

  return null;
}

function normalizeByHttpStatus(httpStatus: number, rest: string): NormalizedToastError {
  // Se o backend já devolveu uma mensagem em PT-BR “de regra”, preserve.
  if (rest && looksLikePortugueseUserMessage(rest) && !isProbablyTechnicalMessage(rest)) {
    return { title: "Atenção", message: rest, httpStatus };
  }

  switch (httpStatus) {
    case 400:
      return {
        title: "Não foi possível concluir",
        message: "Verifique os dados informados e tente novamente.",
        httpStatus,
      };
    case 401:
      return {
        title: "Sessão expirada",
        message: "Sua sessão expirou. Entre novamente para continuar.",
        httpStatus,
      };
    case 403:
      return {
        title: "Acesso negado",
        message: "Você não tem permissão para realizar esta ação.",
        httpStatus,
      };
    case 404:
      return {
        title: "Não encontrado",
        message: "O registro não foi encontrado ou não está disponível.",
        httpStatus,
      };
    case 409:
      return {
        title: "Conflito",
        message: "Houve um conflito ao salvar. Atualize a página e tente novamente.",
        httpStatus,
      };
    case 422:
      return {
        title: "Verifique os campos",
        message: "Alguns campos estão inválidos. Revise as informações e tente novamente.",
        httpStatus,
      };
    case 429:
      return {
        title: "Muitas tentativas",
        message: "Aguarde alguns segundos e tente novamente.",
        httpStatus,
      };
    default:
      if (httpStatus >= 500) {
        return {
          title: "Erro no servidor",
          message: "O servidor encontrou um problema. Tente novamente em instantes.",
          httpStatus,
        };
      }
      return {
        title: "Erro",
        message: "Não foi possível concluir esta ação. Tente novamente.",
        httpStatus,
      };
  }
}

export function normalizeToastErrorMessage(input: {
  message: string;
  title?: string;
}): NormalizedToastError {
  const raw = String(input.message || "").trim();
  if (!raw || raw === "[object Object]" || /Object Object/i.test(raw)) {
    return { title: input.title ?? "Erro", message: "Ocorreu um erro ao concluir esta ação. Tente novamente." };
  }

  // 1) Regras por padrões (mais específicas).
  const byPattern = normalizeByPatterns(raw);
  if (byPattern) return { ...byPattern, title: input.title ?? byPattern.title };

  // 2) Regras por status HTTP (quando a mensagem é do tipo HTTP_XXX: ...).
  const { httpStatus, rest } = stripHttpPrefix(raw);
  if (httpStatus) {
    const normalized = normalizeByHttpStatus(httpStatus, rest);
    return { ...normalized, title: input.title ?? normalized.title };
  }

  // 3) Se já está “palatável”, mantém; caso contrário, suaviza.
  if (looksLikePortugueseUserMessage(raw) && !isProbablyTechnicalMessage(raw)) {
    return { title: input.title, message: raw };
  }

  return {
    title: input.title ?? "Não foi possível concluir",
    message: "Ocorreu um erro ao concluir esta ação. Tente novamente.",
  };
}
