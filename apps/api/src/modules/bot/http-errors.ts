import { FastifyReply } from 'fastify';

interface CodedErrorLike {
  code?: unknown;
  message?: unknown;
}

export function sendCodedError(
  reply: FastifyReply,
  err: unknown,
  codeToStatus: Record<string, number>,
  fallbackStatus = 400,
  fallbackMessage = 'Bad request'
) {
  const candidate = err as CodedErrorLike;
  const code = typeof candidate?.code === 'string' ? candidate.code : null;
  const message = typeof candidate?.message === 'string' && candidate.message.length > 0 ? candidate.message : fallbackMessage;

  if (code && codeToStatus[code]) {
    return reply.status(codeToStatus[code]).send({ success: false, error: message });
  }

  if (err instanceof Error) {
    return reply.status(fallbackStatus).send({ success: false, error: err.message || fallbackMessage });
  }

  return reply.status(fallbackStatus).send({ success: false, error: fallbackMessage });
}
