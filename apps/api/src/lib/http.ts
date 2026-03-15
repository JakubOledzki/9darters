import { ZodError } from "zod";
import type { FastifyReply } from "fastify";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export function sendZodError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: "VALIDATION_ERROR",
      details: error.flatten()
    });
  }

  return null;
}
