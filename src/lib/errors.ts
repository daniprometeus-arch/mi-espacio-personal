import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  const headers = { "Cache-Control": "private, no-store" };
  if (error instanceof AppError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers },
    );
  if (error instanceof ZodError || error instanceof SyntaxError)
    return Response.json(
      { error: "Los datos enviados no son válidos." },
      { status: 400, headers },
    );
  // Nunca registrar cuerpos de Google, tokens, códigos OAuth o datos personales.
  console.error("Error interno no controlado.");
  return Response.json(
    { error: "No se pudo completar la operación. Inténtalo de nuevo." },
    { status: 500, headers },
  );
}
