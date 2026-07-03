import type { FastifyReply, FastifyRequest } from 'fastify';

// docs/POS_SYNC_API.md §6 — every response, success or failure, is wrapped
// in the same envelope and always carries requestId (Fastify's own
// request.id, see app.ts genReqId).

export function sendSuccess(
  reply: FastifyReply,
  status: number,
  data: Record<string, unknown>,
  request: FastifyRequest
) {
  return reply.status(status).send({ success: true, data, requestId: request.id });
}

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  request: FastifyRequest,
  details?: Record<string, unknown>
) {
  return reply
    .status(status)
    .send({ success: false, error: { code, message, details }, requestId: request.id });
}
